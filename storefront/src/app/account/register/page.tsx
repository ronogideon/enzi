"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount, isValidPhone, normalizePhone } from "@/lib/account";

export default function RegisterPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/account";
  const { register } = useAccount();

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirm: "",
    marketingConsent: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const phoneOk = form.phone === "" || isValidPhone(form.phone);
  const mismatch = form.confirm.length > 0 && form.password !== form.confirm;
  const valid =
    form.name.trim().length > 1 &&
    /\S+@\S+\.\S+/.test(form.email) &&
    isValidPhone(form.phone) &&
    form.password.length >= 8 &&
    !mismatch;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: normalizePhone(form.phone),
        password: form.password,
        marketingConsent: form.marketingConsent,
      });
      router.push(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create your account");
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

        <form onSubmit={submit} className="card mt-8 space-y-4 p-6">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <div>
            <label className="label">Full name</label>
            <input
              className="field"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              autoComplete="name"
            />
          </div>

          <div>
            <label className="label">Email</label>
            <input
              className="field"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="label">Phone number</label>
            <input
              className="field"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              autoComplete="tel"
              placeholder="0712 345 678"
            />
            {!phoneOk && (
              <p className="mt-1 text-xs text-red-300">
                Enter a Kenyan number, e.g. 0712 345 678.
              </p>
            )}
            <p className="mt-1 text-xs text-faint">
              This is the number we'll use for M-Pesa and delivery.
            </p>
          </div>

          <div>
            <label className="label">Password</label>
            <input
              className="field"
              type="password"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              autoComplete="new-password"
            />
            <p className="mt-1 text-xs text-faint">At least 8 characters.</p>
          </div>

          <div>
            <label className="label">Confirm password</label>
            <input
              className="field"
              type="password"
              value={form.confirm}
              onChange={(e) => set("confirm", e.target.value)}
              autoComplete="new-password"
            />
            {mismatch && <p className="mt-1 text-xs text-red-300">These don't match.</p>}
          </div>

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
