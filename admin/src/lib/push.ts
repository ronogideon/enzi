import { api } from "@/lib/api";

/**
 * Order alerts for the installed admin app (Web Push).
 *
 * Android Chrome: works in the browser or installed, even with the app closed.
 * iPhone: only once the admin is added to the Home Screen (iOS 16.4+), and the
 * permission prompt has to come from a tap — which is why enabling is always a
 * button, never automatic.
 */

export type PushStatus =
  | "unsupported" // no service worker / push in this browser
  | "needs-install" // iPhone in Safari: add to Home Screen first
  | "blocked" // permission denied in browser settings
  | "off"
  | "on";

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) => {
      console.warn("[push] service worker registration failed", e);
    });
  });
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration("/")) ?? navigator.serviceWorker.ready;
}

export async function getPushStatus(): Promise<PushStatus> {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) return isIos() && !isStandalone() ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Must be called from a click handler. */
export async function enablePush(): Promise<PushStatus> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "blocked" : "off";

  const reg = await registration();
  if (!reg) throw new Error("This browser can't receive notifications.");

  const { publicKey } = await api.pushPublicKey();
  let sub = await reg.pushManager.getSubscription();

  // A subscription made with different server keys can't receive our pushes.
  const current = sub?.options.applicationServerKey;
  if (sub && current) {
    const want = urlBase64ToUint8Array(publicKey);
    const have = new Uint8Array(current);
    if (have.length !== want.length || have.some((b, i) => b !== want[i])) {
      await sub.unsubscribe();
      sub = null;
    }
  }

  sub ??= await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  });
  await api.pushSubscribe(sub.toJSON());
  return "on";
}

/** Turn alerts off on this device (also used on manual sign-out). */
export async function disablePush(): Promise<void> {
  const reg = await registration().catch(() => null);
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api.pushUnsubscribe(sub.endpoint).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

// ---- "Install app" -------------------------------------------------------

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();

/** Chrome fires this once, early — capture it at startup so a button can use it later. */
export function captureInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

export const canInstall = () => !!deferred && !isStandalone();
export function onInstallChange(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  listeners.forEach((l) => l());
  return outcome === "accepted";
}
export const iosNeedsInstall = () => isIos() && !isStandalone();
