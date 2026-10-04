import crypto from "crypto";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { hashPassword } from "../../lib/password";
import { normalizePhone, isValidKePhone } from "../../lib/phone";
import { invalidateSession } from "../../middleware/auth";
import { sendSms } from "../sms/sms.service";
import { background, sendEmail } from "../notifications/email.service";
import { passwordChangedEmail, passwordResetEmail } from "../notifications/templates/account";

/**
 * Forgotten-password flow for staff and customers.
 *
 * One request sends both channels the account has: a link by email (30 min)
 * and a 6-digit code by SMS (10 min). Either completes the reset. Only hashes
 * are stored, a link or code works once, a code locks after five wrong tries,
 * and completing a reset signs the account out of every other session.
 */

export type Subject = "CUSTOMER" | "STAFF";

const EMAIL_TTL_MIN = 30;
const SMS_TTL_MIN = 10;
const WINDOW_MS = 15 * 60_000;
const MAX_ROWS_PER_WINDOW = 6; // one request writes up to 2 rows → 3 requests per 15 min
const MAX_CODE_ATTEMPTS = 5;

export class ResetError extends Error {}

interface Account {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}
type Lookup = { email: string } | { phone: string };

const select = { id: true, name: true, email: true, phone: true } as const;

const ADAPTERS: Record<
  Subject,
  {
    find(by: Lookup): Promise<Account | null>;
    byId(id: string): Promise<Account | null>;
    setPassword(id: string, hash: string): Promise<void>;
    resetPageUrl: () => string;
  }
> = {
  CUSTOMER: {
    // Only accounts with a login — a guest checkout has nothing to reset.
    find: (by) =>
      prisma.customer.findFirst({
        where: { ...("email" in by ? { email: by.email } : { phone: by.phone }), passwordHash: { not: null } },
        select,
      }),
    byId: (id) => prisma.customer.findUnique({ where: { id }, select }),
    setPassword: async (id, passwordHash) => {
      await prisma.customer.update({
        where: { id },
        data: { passwordHash, passwordChangedAt: new Date() },
      });
    },
    resetPageUrl: () => `${env.urls.storefront}/account/reset-password`,
  },
  STAFF: {
    find: (by) =>
      prisma.staffUser.findFirst({
        where: { ...("email" in by ? { email: by.email } : { phone: { in: phoneForms(by.phone) } }), active: true },
        select,
      }),
    byId: (id) => prisma.staffUser.findUnique({ where: { id }, select }),
    setPassword: async (id, passwordHash) => {
      await prisma.staffUser.update({
        where: { id },
        data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false },
      });
    },
    resetPageUrl: () => `${env.urls.admin}/reset-password`,
  },
};

// Customer phones are always stored normalised; staff phones are free text
// typed into the Staff page, so match the common ways they get written.
function phoneForms(p: string): string[] {
  const local = p.slice(3); // 7XXXXXXXX
  return [p, `+${p}`, `0${local}`, local, `+254 ${local}`, `0${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`];
}

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const codeHash = (subject: Subject, id: string, code: string) => sha(`${subject}:${id}:${code}`);

function parseIdentifier(raw: string): Lookup | null {
  const v = raw.trim();
  if (v.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? { email: v.toLowerCase() } : null;
  return isValidKePhone(v) ? { phone: normalizePhone(v) } : null;
}

function checkPassword(pw: string) {
  if (pw.length < 8) throw new ResetError("Password must be at least 8 characters.");
  if (pw.length > 128) throw new ResetError("Password is too long.");
}

/**
 * Always resolves quietly. The route answers before this runs, so the
 * response can't reveal whether an account exists — by content or by timing.
 */
export async function requestPasswordReset(subject: Subject, identifier: string, ip?: string): Promise<void> {
  const by = parseIdentifier(identifier);
  if (!by) return;
  const a = ADAPTERS[subject];
  const acct = await a.find(by);
  if (!acct || (!acct.email && !acct.phone)) return;

  const recent = await prisma.passwordReset.count({
    where: { subjectType: subject, subjectId: acct.id, createdAt: { gte: new Date(Date.now() - WINDOW_MS) } },
  });
  if (recent >= MAX_ROWS_PER_WINDOW) {
    console.warn(`[reset] ${subject} ${acct.id} hit the request limit`);
    return;
  }

  // One live reset at a time — a new request retires the previous link/code.
  await prisma.passwordReset.updateMany({
    where: { subjectType: subject, subjectId: acct.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const jobs: Promise<unknown>[] = [];
  const smsTo = acct.phone && isValidKePhone(acct.phone) ? normalizePhone(acct.phone) : null;

  if (smsTo) {
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
    await prisma.passwordReset.create({
      data: {
        subjectType: subject,
        subjectId: acct.id,
        channel: "SMS",
        tokenHash: codeHash(subject, acct.id, code),
        expiresAt: new Date(Date.now() + SMS_TTL_MIN * 60_000),
        ip,
      },
    });
    jobs.push(
      sendSms(
        smsTo,
        `Enzi Packaging: your password reset code is ${code}. It expires in ${SMS_TTL_MIN} min. Didn't request this? Ignore this message.`
      )
    );
  }

  if (acct.email) {
    const token = crypto.randomBytes(32).toString("base64url");
    await prisma.passwordReset.create({
      data: {
        subjectType: subject,
        subjectId: acct.id,
        channel: "EMAIL",
        tokenHash: sha(token),
        expiresAt: new Date(Date.now() + EMAIL_TTL_MIN * 60_000),
        ip,
      },
    });
    const mail = passwordResetEmail({
      name: acct.name,
      url: `${a.resetPageUrl()}?token=${token}`,
      minutes: EMAIL_TTL_MIN,
      staff: subject === "STAFF",
      smsSent: Boolean(smsTo),
    });
    jobs.push(sendEmail({ to: acct.email, from: env.email.fromAccount, ...mail, tag: "password_reset" }));
  }

  for (const r of await Promise.allSettled(jobs)) {
    if (r.status === "rejected") console.error(`[reset] ${subject} ${acct.id} send failed:`, r.reason);
  }
}

export async function resetWithToken(subject: Subject, token: string, password: string): Promise<void> {
  checkPassword(password);
  const row = await prisma.passwordReset.findFirst({
    where: { tokenHash: sha(token), subjectType: subject, channel: "EMAIL", usedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!row) throw new ResetError("This reset link is invalid or has expired. Request a new one.");
  await complete(subject, row.id, row.subjectId, password);
}

export async function resetWithCode(
  subject: Subject,
  identifier: string,
  code: string,
  password: string
): Promise<void> {
  checkPassword(password);
  const invalid = new ResetError("That code is invalid or has expired.");
  const by = parseIdentifier(identifier);
  if (!by || !/^\d{6}$/.test(code)) throw invalid;

  const acct = await ADAPTERS[subject].find(by);
  if (!acct) throw invalid;

  const row = await prisma.passwordReset.findFirst({
    where: { subjectType: subject, subjectId: acct.id, channel: "SMS", usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!row) throw invalid;

  // Atomic, so parallel guesses can't slip past the cap.
  const bump = await prisma.passwordReset.updateMany({
    where: { id: row.id, attempts: { lt: MAX_CODE_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (bump.count === 0) throw new ResetError("Too many attempts. Request a new code.");

  const a = Buffer.from(row.tokenHash, "hex");
  const b = Buffer.from(codeHash(subject, acct.id, code), "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw invalid;

  await complete(subject, row.id, acct.id, password);
}

async function complete(subject: Subject, rowId: string, subjectId: string, password: string): Promise<void> {
  // Claim first, so a link or code can only ever be spent once.
  const claimed = await prisma.passwordReset.updateMany({
    where: { id: rowId, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0) throw new ResetError("This reset has already been used. Request a new one.");

  const a = ADAPTERS[subject];
  await a.setPassword(subjectId, await hashPassword(password));
  await prisma.passwordReset.updateMany({
    where: { subjectType: subject, subjectId, usedAt: null },
    data: { usedAt: new Date() },
  });
  invalidateSession(subject === "STAFF" ? "staff" : "customer", subjectId);

  background(`password-changed ${subject} ${subjectId}`, async () => {
    const acct = await a.byId(subjectId);
    if (!acct) return;
    const when = new Intl.DateTimeFormat("en-KE", {
      timeZone: "Africa/Nairobi",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());

    const jobs: Promise<unknown>[] = [];
    if (acct.email) {
      const mail = passwordChangedEmail({ name: acct.name, staff: subject === "STAFF", when });
      jobs.push(sendEmail({ to: acct.email, from: env.email.fromAccount, ...mail, tag: "password_changed" }));
    }
    if (acct.phone && isValidKePhone(acct.phone)) {
      jobs.push(
        sendSms(
          normalizePhone(acct.phone),
          `Enzi Packaging: your password was changed on ${when}. If this wasn't you, contact us immediately.`
        )
      );
    }
    await Promise.all(jobs);
  });
}
