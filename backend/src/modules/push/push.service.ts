import webpush from "web-push";
import type { Role } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { getSetting, setSetting } from "../settings/settings.service";

/**
 * Web push for the installed admin app.
 *
 * VAPID keys identify this server to the browser push services. They're
 * created on first use and kept in Settings (the private half encrypted, like
 * the M-Pesa keys), so there is nothing to configure. They must never change:
 * new keys silently invalidate every device that already turned alerts on.
 * VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY override them if you ever need to.
 */

let keys: { publicKey: string; privateKey: string } | null = null;
let loading: Promise<{ publicKey: string; privateKey: string }> | null = null;

async function vapid() {
  if (keys) return keys;
  loading ??= (async () => {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    }
    let publicKey = await getSetting("push.vapidPublicKey");
    let privateKey = await getSetting("push.vapidPrivateKey");
    if (!publicKey || !privateKey) {
      const k = webpush.generateVAPIDKeys();
      await setSetting("push.vapidPrivateKey", k.privateKey);
      await setSetting("push.vapidPublicKey", k.publicKey);
      publicKey = k.publicKey;
      privateKey = k.privateKey;
      console.log("[push] generated VAPID keys");
    }
    return { publicKey, privateKey };
  })();
  try {
    keys = await loading;
    return keys;
  } finally {
    loading = null;
  }
}

async function contact(): Promise<string> {
  const email = process.env.VAPID_SUBJECT || (await getSetting("store.email").catch(() => "")) || "";
  if (email.startsWith("mailto:") || email.startsWith("https://")) return email;
  return email ? `mailto:${email}` : env.urls.admin.startsWith("https://") ? env.urls.admin : "mailto:admin@enzipackaging.com";
}

export async function publicKey(): Promise<string> {
  return (await vapid()).publicKey;
}

export interface BrowserSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function saveSubscription(staffId: string, sub: BrowserSubscription, userAgent?: string) {
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { staffId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent },
    update: { staffId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent },
  });
}

export async function removeSubscription(staffId: string, endpoint: string) {
  await prisma.pushSubscription.deleteMany({ where: { staffId, endpoint } });
}

export interface PushPayload {
  title: string;
  body: string;
  /** Opened when the notification is tapped. Path within the admin, e.g. /orders?order=… */
  url: string;
  /** Same tag replaces an older notification instead of stacking. */
  tag?: string;
}

/**
 * Sends to every device of every matching active staff member. Dead
 * subscriptions (app uninstalled, permission revoked) are deleted as the push
 * service reports them, so the list cleans itself.
 */
export async function pushToStaff(
  where: { roles?: Role[]; staffId?: string },
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  const subs = await prisma.pushSubscription.findMany({
    where: {
      ...(where.staffId ? { staffId: where.staffId } : {}),
      staff: { active: true, ...(where.roles ? { role: { in: where.roles } } : {}) },
    },
  });
  if (subs.length === 0) return { sent: 0, failed: 0 };

  const { publicKey: pub, privateKey } = await vapid();
  const subject = await contact();
  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          {
            vapidDetails: { subject, publicKey: pub, privateKey },
            TTL: 60 * 60, // an order alert older than an hour isn't worth waking a phone for
            urgency: "high",
            topic: payload.tag?.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined,
          }
        );
        sent++;
        await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastSuccessAt: new Date() } });
      } catch (err: any) {
        failed++;
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        } else {
          console.error(`[push] send failed (${err?.statusCode ?? "?"}):`, err?.body ?? err?.message ?? err);
        }
      }
    })
  );
  return { sent, failed };
}
