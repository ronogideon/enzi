"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount } from "@/lib/account";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/account";
  const { login } = useAccount();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(identifier.trim(), password);
      router.push(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign you in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell py-12">
      <div className="mx-auto max-w-md">
        <h1 className="display text-3xl">Sign in</h1>
        <p className="mt-2 text-sm text-muted">
          Use the phone number or email on your account.
        </p>

        <form onSubmit={submit} className="card mt-8 space-y-4 p-6">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <div>
            <label className="label">Phone or email</label>
            <input
              className="field"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              placeholder="0712 345 678"
            />
          </div>

          <div>
            <label className="label">Password</label>
            <input
              className="field"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <button className="btn-primary w-full" disabled={busy || !identifier || !password}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          New here?{" "}
          <Link href={`/account/register?next=${encodeURIComponent(next)}`} className="text-white underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
