import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";

type Step = "request" | "code" | "token" | "done";

/**
 * Staff forgotten password. Public route — sits outside ProtectedRoute.
 * One request sends a link to the staff email and, if a phone is on the staff
 * record, a 6-digit code by SMS. Either one completes the reset, and every
 * other session on the account is signed out.
 */
export default function ResetPassword() {
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
      await api.forgotPassword(identifier.trim());
      setStep("code");
    });
  };

  const resend = () =>
    run(async () => {
      await api.forgotPassword(identifier.trim());
      setCode("");
      setNotice("Sent again — use the newest code.");
    });

  const submitReset = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      if (password !== confirm) throw new Error("Passwords don't match.");
      await api.resetPassword(
        step === "token" ? { token, password } : { identifier: identifier.trim(), code, password }
      );
      setStep("done");
    });
  };

  const errorBox = error && (
    <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
      {error}
    </div>
  );

  const passwordFields = (
    <>
      <div>
        <label className="label" htmlFor="pw">New password</label>
        <input id="pw" className="field" type="password" autoComplete="new-password" minLength={8} required
          value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
      </div>
      <div>
        <label className="label" htmlFor="pw2">Confirm new password</label>
        <input id="pw2" className="field" type="password" autoComplete="new-password" minLength={8} required
          value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
    </>
  );

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-3xl font-extrabold tracking-tight text-white">ENZI</p>
          <p className="text-xs tracking-[0.4em] text-muted">ADMIN PORTAL</p>
        </div>

        {step === "request" && (
          <form onSubmit={requestReset} className="card space-y-4 p-6">
            <div>
              <p className="font-semibold text-white">Reset your password</p>
              <p className="mt-1 text-sm text-muted">
                Enter your staff email or phone. We'll email a link and text a code if your phone is on file.
              </p>
            </div>
            {errorBox}
            <div>
              <label className="label" htmlFor="id">Email or phone</label>
              <input id="id" className="field" autoComplete="username" autoFocus required
                value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="you@enzipackaging.com" />
            </div>
            <button className="btn-primary w-full" disabled={busy || !identifier.trim()}>
              {busy ? "Sending…" : "Send reset"}
            </button>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={submitReset} className="card space-y-4 p-6">
            <div>
              <p className="font-semibold text-white">Check your email or phone</p>
              <p className="mt-1 text-sm text-muted">
                If an account matches, a reset link is on its way by email. If your phone is on your staff
                record, enter the 6-digit SMS code here — or just tap the link in the email.
              </p>
            </div>
            {errorBox}
            {notice && <p className="text-sm text-muted">{notice}</p>}
            <div>
              <label className="label" htmlFor="code">6-digit code</label>
              <input id="code" className="field text-center text-lg tracking-[0.5em]" inputMode="numeric"
                autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            </div>
            {passwordFields}
            <button className="btn-primary w-full" disabled={busy || code.length !== 6 || !password}>
              {busy ? "Saving…" : "Reset password"}
            </button>
            <div className="flex justify-between text-xs text-faint">
              <button type="button" onClick={() => void resend()} disabled={busy} className="hover:text-muted">
                Send again
              </button>
              <button type="button" onClick={() => { setStep("request"); setError(null); }} className="hover:text-muted">
                Start over
              </button>
            </div>
          </form>
        )}

        {step === "token" && (
          <form onSubmit={submitReset} className="card space-y-4 p-6">
            <p className="font-semibold text-white">Choose a new password</p>
            {errorBox}
            {passwordFields}
            <button className="btn-primary w-full" disabled={busy || !password}>
              {busy ? "Saving…" : "Reset password"}
            </button>
            {error && (
              <button type="button" onClick={() => { setStep("request"); setError(null); }}
                className="w-full text-xs text-faint hover:text-muted">
                Request a new link
              </button>
            )}
          </form>
        )}

        {step === "done" && (
          <div className="card space-y-4 p-6">
            <p className="font-semibold text-white">Password updated</p>
            <p className="text-sm text-muted">
              You've been signed out on every other device. Sign in with your new password.
            </p>
            <Link to="/login" className="btn-primary w-full">Sign in</Link>
          </div>
        )}

        {step !== "done" && (
          <p className="mt-4 text-center text-xs text-faint">
            <Link to="/login" className="hover:text-muted">Back to sign in</Link>
          </p>
        )}
      </div>
    </div>
  );
}
