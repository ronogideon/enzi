"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount, isValidPhone, normalizePhone } from "@/lib/account";
import { api, ApiError } from "@/lib/api";

type Check = "idle" | "checking" | "ok" | "taken";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Catches the typos people actually make, without blocking real addresses. */
function emailProblem(raw: string): string | null {
  const email = raw.trim();
  if (!email) return null;
  if (/\s/.test(email)) return "Email addresses can't contain spaces.";
  if (!email.includes("@")) return "Missing the @ — for example name@gmail.com";
  if ((email.match(/@/g) ?? []).length > 1) return "That has more than one @.";

  const [local, domain] = email.split("@");
  if (!local) return "Add the part before the @.";
  if (!domain) return "Add the part after the @, like gmail.com";
  if (!domain.includes(".")) return "The part after @ needs a dot, like gmail.com";
  if (domain.startsWith(".") || domain.endsWith("."))
    return "That domain doesn't look right.";
  if (/\.\./.test(domain)) return "That domain has two dots in a row.";
  if (!EMAIL_RE.test(email)) return "That doesn't look like a valid email address.";

  // Very common typos, offered as a suggestion rather than an error.
  const typos: Record<string, string> = {
    "gmail.co": "gmail.com", "gmail.cm": "gmail.com", "gmial.com": "gmail.com",
    "gmai.com": "gmail.com", "gmail.con": "gmail.com", "yahoo.co": "yahoo.com",
    "yaho.com": "yahoo.com", "hotmail.co": "hotmail.com", "outlok.com": "outlook.com",
  };
  const suggestion = typos[domain.toLowerCase()];
  if (suggestion) return `Did you mean ${local}@${suggestion}?`;

  return null;
}

export default function RegisterPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/account";
  const { register } = useAccount();

  const [form, setForm] = useState({
    name: "", email: "", phone: "", password: "", confirm: "", marketingConsent: true,
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [emailCheck, setEmailCheck] = useState<Check>("idle");
  const [phoneCheck, setPhoneCheck] = useState<Check>("idle");
  const [error, setError] = useState<string | null>(null);
  const [configProblem, setConfigProblem] = useState<string | null>(null);
  const [selfPointing, setSelfPointing] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const blur = (k: string) => setTouched((t) => ({ ...t, [k]: true }));

  // --- field-level validation ------------------------------------------------
  const nameError =
    touched.name && form.name.trim().length < 2 ? "Please enter your full name." : null;

  const emailFormatError = emailProblem(form.email);
  const emailError =
    touched.email && !form.email.trim()
      ? "We need an email for your receipt."
      : emailFormatError ??
        (emailCheck === "taken" ? "That email already has an account." : null);

  const phoneError =
    touched.phone && !form.phone.trim()
      ? "We need your phone number."
      : form.phone.trim() && !isValidPhone(form.phone)
      ? "Enter a Kenyan number, like 0712 345 678."
      : phoneCheck === "taken"
      ? "That number already has an account."
      : null;

  const passwordError =
    touched.password && form.password.length > 0 && form.password.length < 8
      ? "Use at least 8 characters."
      : null;

  const confirmError =
    form.confirm.length > 0 && form.password !== form.confirm
      ? "These two don't match."
      : null;

  /**
   * Availability is checked as they type, debounced, so a clash surfaces while
   * the field is still in front of them rather than after they submit. A failed
   * check never blocks the form — the server is still the final authority.
   */
  useEffect(() => {
    const email = form.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { setEmailCheck("idle"); return; }
    setEmailCheck("checking");
    let cancelled = false;
    const t = setTimeout(() => {
      api
        .checkEmail(email)
        .then((r) => { if (!cancelled) setEmailCheck(r.taken ? "taken" : "ok"); })
        .catch(() => { if (!cancelled) setEmailCheck("idle"); });
    }, 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [form.email]);

  useEffect(() => {
    if (!isValidPhone(form.phone)) { setPhoneCheck("idle"); return; }
    setPhoneCheck("checking");
    let cancelled = false;
    const t = setTimeout(() => {
      api
        .checkPhone(form.phone)
        .then((r) => { if (!cancelled) setPhoneCheck(r.hasLogin ? "taken" : "ok"); })
        .catch(() => { if (!cancelled) setPhoneCheck("idle"); });
    }, 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [form.phone]);

  // Verify the shop can actually reach its API, so a misconfiguration shows up
  // as an explanation rather than as a mystery error on submit.
  useEffect(() => {
    api.health().then((h) => {
      if (h.ok) return;
      setSelfPointing(!!h.selfPointing);
      setConfigProblem(
        h.selfPointing
          ? h.error!
          : `${h.error} The shop is trying to reach ${h.url}.`
      );
    });
  }, []);

  const valid =
    form.name.trim().length > 1 &&
    EMAIL_RE.test(form.email.trim()) &&
    !emailFormatError &&
    emailCheck !== "taken" &&
    isValidPhone(form.phone) &&
    phoneCheck !== "taken" &&
    form.password.length >= 8 &&
    form.password === form.confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ name: true, email: true, phone: true, password: true, confirm: true });
    if (!valid) return;

    setError(null);
    setBusy(true);
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: normalizePhone(form.phone),
        password: form.password,
        marketingConsent: form.marketingConsent,
      });
      router.push(next);
    } catch (err) {
      if (err instanceof ApiError && err.kind !== "api") {
        setConfigProblem(err.message);
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : "Couldn't create your account");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell py-12">
      <div className="mx-auto max-w-md">
        <h1 className="display text-3xl">Create an account</h1>
        <p className="mt-2 text-sm text-muted">
          Faster checkout, and your order history in one place.
        </p>

        {configProblem && (
          <div className="mt-6 rounded-xl border border-gold/30 bg-gold/10 p-4 text-sm">
            <p className="font-medium text-gold">Sign-up isn't available right now</p>
            <p className="mt-1 text-muted">{configProblem}</p>
            {selfPointing ? (
              <p className="mt-2 text-xs text-faint">
                For whoever runs this site: set{" "}
                <code className="text-cloud">API_URL</code> to the backend service's
                public address — not this one — and restart the storefront.
              </p>
            ) : (
              <p className="mt-2 text-xs text-faint">
                You can still order as a guest at checkout, or reach us on WhatsApp.
              </p>
            )}
          </div>
        )}

        <form onSubmit={submit} noValidate className="card mt-8 space-y-4 p-6">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <Field label="Full name" error={nameError}>
            <input
              className={inputClass(nameError)}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              onBlur={() => blur("name")}
              autoComplete="name"
              placeholder="Jane Wanjiru"
            />
          </Field>

          <Field
            label="Email"
            error={emailError}
            hint={
              emailCheck === "checking"
                ? "Checking…"
                : emailCheck === "ok" && !emailError
                ? "Looks good."
                : "We'll send your receipt here."
            }
            good={emailCheck === "ok" && !emailError}
          >
            <input
              className={inputClass(emailError, emailCheck === "ok" && !emailError)}
              type="email"
              inputMode="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              onBlur={() => blur("email")}
              autoComplete="email"
              placeholder="you@example.com"
              spellCheck={false}
            />
          </Field>

          <Field
            label="Phone number"
            error={phoneError}
            hint="We use this for M-Pesa and delivery."
            good={phoneCheck === "ok" && !phoneError}
          >
            <input
              className={inputClass(phoneError, phoneCheck === "ok" && !phoneError)}
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              onBlur={() => blur("phone")}
              autoComplete="tel"
              inputMode="tel"
              placeholder="0712 345 678"
            />
          </Field>

          {phoneCheck === "taken" && (
            <p className="text-xs text-muted">
              <Link href={`/account/login?next=${encodeURIComponent(next)}`} className="text-white underline">
                Sign in instead
              </Link>{" "}
              with that number.
            </p>
          )}

          <Field label="Password" error={passwordError} hint="At least 8 characters.">
            <input
              className={inputClass(passwordError)}
              type="password"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              onBlur={() => blur("password")}
              autoComplete="new-password"
            />
          </Field>

          <Field label="Confirm password" error={confirmError}>
            <input
              className={inputClass(confirmError)}
              type="password"
              value={form.confirm}
              onChange={(e) => set("confirm", e.target.value)}
              onBlur={() => blur("confirm")}
              autoComplete="new-password"
            />
          </Field>

          <label className="flex items-start gap-3 text-sm text-muted">
            <input
              type="checkbox"
              checked={form.marketingConsent}
              onChange={(e) => set("marketingConsent", e.target.checked)}
              className="mt-1 accent-white"
            />
            <span>Send me occasional offers and restock alerts by SMS.</span>
          </label>

          <button className="btn-primary w-full" disabled={busy || !valid}>
            {busy ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href={`/account/login?next=${encodeURIComponent(next)}`} className="text-white underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

function inputClass(error: string | null, good = false) {
  if (error) return "field border-red-500/60 focus:border-red-500";
  if (good) return "field border-whatsapp/50";
  return "field";
}

function Field({
  label, error, hint, good, children,
}: {
  label: string;
  error?: string | null;
  hint?: string;
  good?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-300">{error}</p>
      ) : hint ? (
        <p className={`mt-1 text-xs ${good ? "text-whatsapp" : "text-faint"}`}>{hint}</p>
      ) : null}
    </div>
  );
}
