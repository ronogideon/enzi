import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { hashPassword, verifyPassword } from "../../lib/password";
import { signToken, secondsUntilExpiry } from "../../lib/jwt";
import { HttpError } from "../../middleware/error";
import { requireCustomer } from "../../middleware/auth";
import { normalizePhone, isValidKePhone } from "../../lib/phone";

export const authRouter = Router();

const wrap =
  (fn: (req: any, res: any) => Promise<any>) =>
  (req: any, res: any, next: any) =>
    fn(req, res).catch(next);

// ----------------------------------------------------------------- staff

authRouter.post(
  "/staff/login",
  wrap(async (req, res) => {
    const { email, password } = z
      .object({ email: z.string().email(), password: z.string().min(1) })
      .parse(req.body);

    const staff = await prisma.staffUser.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    // Same message for "no such user" and "wrong password" so the login form
    // can't be used to enumerate which staff emails exist.
    if (!staff) throw new HttpError(401, "Invalid email or password");
    if (!staff.active)
      throw new HttpError(403, "This account has been deactivated. Ask an admin to re-enable it.");
    if (!(await verifyPassword(password, staff.passwordHash)))
      throw new HttpError(401, "Invalid email or password");

    await prisma.staffUser.update({
      where: { id: staff.id },
      data: { lastLoginAt: new Date() },
    });

    const token = signToken({ sub: staff.id, role: staff.role, kind: "staff" });
    res.json({
      token,
      // The client uses this to warn before it expires rather than dropping
      // someone mid-task with a silent 401.
      expiresIn: secondsUntilExpiry(token),
      staff: {
        id: staff.id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
        mustChangePassword: staff.mustChangePassword,
      },
    });
  })
);

// -------------------------------------------------------------- customer

const customerSelect = {
  id: true,
  phone: true,
  name: true,
  email: true,
  marketingConsent: true,
  orderCount: true,
  totalSpent: true,
  createdAt: true,
} as const;

/**
 * Register. Phone is the identity (it's what M-Pesa and delivery both key on),
 * but email and name are captured too so the shop has a real contact record —
 * that's what feeds the Customers page in the admin dashboard.
 *
 * A guest who checked out before already has a Customer row keyed by phone.
 * Registering with that number claims the existing record and keeps their
 * order history, rather than creating a duplicate.
 */
authRouter.post(
  "/customer/register",
  wrap(async (req, res) => {
    const body = z
      .object({
        phone: z.string(),
        name: z.string().min(2, "Please enter your name"),
        email: z.string().email("Please enter a valid email address"),
        password: z.string().min(8, "Password must be at least 8 characters"),
        marketingConsent: z.boolean().default(true),
      })
      .parse(req.body);

    const phone = normalizePhone(body.phone);
    if (!isValidKePhone(phone))
      throw new HttpError(400, "Enter a valid Kenyan phone number, e.g. 0712 345 678");

    const email = body.email.toLowerCase().trim();

    const existing = await prisma.customer.findUnique({ where: { phone } });
    if (existing?.passwordHash)
      throw new HttpError(409, "An account already exists for this number. Try signing in.");

    const clashingEmail = await prisma.customer.findFirst({
      where: { email, phone: { not: phone } },
    });
    if (clashingEmail)
      throw new HttpError(409, "That email is already used by another account.");

    const customer = await prisma.customer.upsert({
      where: { phone },
      create: {
        phone,
        name: body.name.trim(),
        email,
        passwordHash: await hashPassword(body.password),
        marketingConsent: body.marketingConsent,
        lastLoginAt: new Date(),
      },
      update: {
        name: body.name.trim(),
        email,
        passwordHash: await hashPassword(body.password),
        marketingConsent: body.marketingConsent,
        lastLoginAt: new Date(),
      },
      select: customerSelect,
    });

    const token = signToken({ sub: customer.id, phone: customer.phone, kind: "customer" });
    res.status(201).json({ token, customer });
  })
);

/** Sign in with phone or email — people remember one or the other. */
authRouter.post(
  "/customer/login",
  wrap(async (req, res) => {
    const body = z
      .object({ identifier: z.string().min(3), password: z.string().min(1) })
      .parse(req.body);

    const raw = body.identifier.trim();
    const looksLikeEmail = raw.includes("@");

    const customer = looksLikeEmail
      ? await prisma.customer.findFirst({ where: { email: raw.toLowerCase() } })
      : await prisma.customer.findUnique({ where: { phone: normalizePhone(raw) } });

    if (!customer?.passwordHash)
      throw new HttpError(401, "No account found with those details");
    if (!(await verifyPassword(body.password, customer.passwordHash)))
      throw new HttpError(401, "Incorrect password");

    await prisma.customer.update({
      where: { id: customer.id },
      data: { lastLoginAt: new Date() },
    });

    const token = signToken({ sub: customer.id, phone: customer.phone, kind: "customer" });
    res.json({
      token,
      customer: {
        id: customer.id,
        phone: customer.phone,
        name: customer.name,
        email: customer.email,
        marketingConsent: customer.marketingConsent,
        orderCount: customer.orderCount,
        totalSpent: customer.totalSpent,
        createdAt: customer.createdAt,
      },
    });
  })
);

/** The signed-in customer's own profile. */
authRouter.get(
  "/customer/me",
  requireCustomer,
  wrap(async (req, res) => {
    const customer = await prisma.customer.findUnique({
      where: { id: req.auth!.sub },
      select: customerSelect,
    });
    if (!customer) throw new HttpError(404, "Account not found");
    res.json(customer);
  })
);

authRouter.patch(
  "/customer/me",
  requireCustomer,
  wrap(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(2).optional(),
        email: z.string().email().optional(),
        marketingConsent: z.boolean().optional(),
      })
      .parse(req.body);

    if (body.email) {
      const clash = await prisma.customer.findFirst({
        where: { email: body.email.toLowerCase(), id: { not: req.auth!.sub } },
      });
      if (clash) throw new HttpError(409, "That email is already used by another account.");
    }

    res.json(
      await prisma.customer.update({
        where: { id: req.auth!.sub },
        data: {
          name: body.name?.trim(),
          email: body.email?.toLowerCase().trim(),
          marketingConsent: body.marketingConsent,
        },
        select: customerSelect,
      })
    );
  })
);

authRouter.post(
  "/customer/me/password",
  requireCustomer,
  wrap(async (req, res) => {
    const { currentPassword, newPassword } = z
      .object({ currentPassword: z.string(), newPassword: z.string().min(8) })
      .parse(req.body);

    const customer = await prisma.customer.findUnique({ where: { id: req.auth!.sub } });
    if (!customer?.passwordHash) throw new HttpError(404, "Account not found");
    if (!(await verifyPassword(currentPassword, customer.passwordHash)))
      throw new HttpError(400, "Current password is incorrect");

    await prisma.customer.update({
      where: { id: customer.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    res.json({ ok: true });
  })
);

/** A customer's own order history. */
authRouter.get(
  "/customer/me/orders",
  requireCustomer,
  wrap(async (req, res) => {
    res.json(
      await prisma.order.findMany({
        where: { customerId: req.auth!.sub },
        include: { items: true, deliveryMethod: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      })
    );
  })
);

/**
 * Is this email already taken? Lets the sign-up form flag a clash inline,
 * rather than letting someone fill the whole form and fail on submit.
 * Returns only a boolean — it never confirms whose account it is.
 */
authRouter.post(
  "/customer/check-email",
  wrap(async (req, res) => {
    const { email } = z.object({ email: z.string() }).parse(req.body);
    const trimmed = email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) return res.json({ taken: false });

    const existing = await prisma.customer.findFirst({
      where: { email: trimmed, passwordHash: { not: null } },
      select: { id: true },
    });
    res.json({ taken: !!existing });
  })
);

/**
 * Does an account already exist for this number? The checkout uses it to tell
 * a returning guest "you have an account — sign in to autofill" instead of
 * silently failing at registration time.
 */
authRouter.post(
  "/customer/check",
  wrap(async (req, res) => {
    const { phone } = z.object({ phone: z.string() }).parse(req.body);
    const normalized = normalizePhone(phone);
    if (!isValidKePhone(normalized)) return res.json({ exists: false, hasLogin: false });

    const customer = await prisma.customer.findUnique({
      where: { phone: normalized },
      select: { id: true, name: true, passwordHash: true },
    });
    res.json({
      exists: !!customer,
      hasLogin: !!customer?.passwordHash,
      name: customer?.name ?? null,
    });
  })
);
