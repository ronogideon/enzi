"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { post } from "@/lib/api";

type Step = "request" | "code" | "token" | "done";

const LABEL = "mb-1.5 block text-sm text-muted";

/**
 * Forgotten password. One request sends a link by email and a 6-digit code by
 * SMS — whichever the account has. The code is entered here; the emailed link
 * lands back on this page with ?token=, which skips straight to a new password.
 */
export default function ResetPasswordPage() {
  const [step, setStep] = useState<Step>("request");
  const [token, setToken] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    if (t) {
      setToken(t);
      setStep("token");
      // Keep the token out of browser history and Referer headers.
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  async function run(fn: () => Promise<void>) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const requestReset = (e?: React.FormEvent) => {
    e?.preventDefault();
    return run(async () => {
      await post("/auth/customer/password/forgot", { identifier: identifier.trim() });
      setStep("code");
    });
  };

  const resend = () =>
    run(async () => {
      await post("/auth/customer/password/forgot", { identifier: identifier.trim() });
      setCode("");
      setNotice("Sent again — use the newest code.");
    });

  const submitReset = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      if (password !== confirm) throw new Error("Passwords don't match.");
      await post(
        "/auth/customer/password/reset",
        step === "token" ? { token, password } : { identifier: identifier.trim(), code, password }
      );
      setStep("done");
    });
  };

  const errorBox = error && (
    <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
      {error}
    </div>
  );

  const passwordFields = (
    <>
      <div>
        <label className={LABEL} htmlFor="pw">New password</label>
        <input id="pw" className="field" type="password" autoComplete="new-password" minLength={8} required
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <p className="mt-1.5 text-xs text-faint">At least 8 characters.</p>
      </div>
      <div>
        <label className={LABEL} htmlFor="pw2">Confirm new password</label>
        <input id="pw2" className="field" type="password" autoComplete="new-password" minLength={8} required
          value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
    </>
  );

  return (
    <div className="shell py-12">
      <div className="mx-auto max-w-md">
        {step === "request" && (
          <>
            <h1 className="display text-3xl">Forgot your password?</h1>
            <p className="mt-2 text-sm text-muted">
              Enter the phone number or email on your account. We&apos;ll send a code by SMS and a
              link by email.
            </p>
            <form onSubmit={requestReset} className="card mt-8 space-y-4 p-6">
              {errorBox}
              <div>
                <label className={LABEL} htmlFor="id">Phone or email</label>
                <input id="id" className="field" autoComplete="username" autoFocus required
                  placeholder="0712 345 678" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
              </div>
              <button className="btn-primary w-full" disabled={busy || !identifier.trim()}>
                {busy ? "Sending…" : "Send reset code"}
              </button>
            </form>
            <p className="mt-6 text-center text-sm text-muted">
              Remembered it?{" "}
              <Link href="/account/login" className="text-white underline">Sign in</Link>
            </p>
          </>
        )}

        {step === "code" && (
          <>
            <h1 className="display text-3xl">Check your phone</h1>
            <p className="mt-2 text-sm text-muted">
              If an account matches <span className="text-cloud">{identifier.trim()}</span>, we&apos;ve
              sent a 6-digit code by SMS and a reset link by email. It can take a minute to arrive.
            </p>
            <form onSubmit={submitReset} className="card mt-8 space-y-4 p-6">
              {errorBox}
              {notice && <p className="text-sm text-whatsapp">{notice}</p>}
              <div>
                <label className={LABEL} htmlFor="code">6-digit code</label>
                <input id="code" className="field text-center text-lg tracking-[0.5em]" inputMode="numeric"
                  autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus
                  value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
              </div>
              {passwordFields}
              <button className="btn-primary w-full" disabled={busy || code.length !== 6 || !password}>
                {busy ? "Saving…" : "Reset password"}
              </button>
            </form>
            <div className="mt-6 flex justify-center gap-6 text-sm text-muted">
              <button type="button" onClick={() => void resend()} disabled={busy} className="underline hover:text-cloud">
                Send again
              </button>
              <button type="button" onClick={() => { setStep("request"); setError(null); }} className="underline hover:text-cloud">
                Use a different number
              </button>
            </div>
          </>
        )}

        {step === "token" && (
          <>
            <h1 className="display text-3xl">Choose a new password</h1>
            <form onSubmit={submitReset} className="card mt-8 space-y-4 p-6">
              {errorBox}
              {passwordFields}
              <button className="btn-primary w-full" disabled={busy || !password}>
                {busy ? "Saving…" : "Reset password"}
              </button>
            </form>
            {error && (
              <p className="mt-6 text-center text-sm text-muted">
                <button type="button" onClick={() => { setStep("request"); setError(null); }} className="text-white underline">
                  Request a new link
                </button>
              </p>
            )}
          </>
        )}

        {step === "done" && (
          <>
            <h1 className="display text-3xl">Password updated</h1>
            <p className="mt-2 text-sm text-muted">
              You&apos;ve been signed out on other devices. Sign in with your new password.
            </p>
            <Link href="/account/login" className="btn-primary mt-8 w-full">Sign in</Link>
          </>
        )}
      </div>
    </div>
  );
}
