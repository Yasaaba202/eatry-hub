"use client";

import Link from "next/link";
import { useState } from "react";

export type ResetRole = "CUSTOMER" | "VENDOR" | "ADMIN";
type ApiResult = { message?: string; error?: string };

export function PasswordResetForm({ role }: { role: ResetRole }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const accountLabel = role === "ADMIN" ? "administrator" : role.toLowerCase();
  const returnHref = role === "ADMIN" ? "/admin/login" : "/login";

  const sendCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", role, email }),
      });
      const result = await response.json() as ApiResult;
      if (!response.ok) {
        setError(result.error ?? "Could not send a reset code.");
        return;
      }
      setCodeSent(true);
      setMessage(result.message ?? "If the account exists, a reset code will be sent shortly.");
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setPending(false);
    }
  };

  const resetPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", role, email, code, password }),
      });
      const result = await response.json() as ApiResult;
      if (!response.ok) {
        setError(result.error ?? "Could not reset the password.");
        return;
      }
      setCompleted(true);
      setMessage(result.message ?? "Your password has been changed.");
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-orange-50 px-4 py-12">
      <section className="w-full max-w-lg rounded-[28px] bg-white p-7 shadow-xl shadow-orange-100 sm:p-10">
        <Link href={returnHref} className="text-sm font-semibold text-orange-600">← Back to sign in</Link>
        <p className="mt-8 text-xs font-bold uppercase tracking-[0.22em] text-orange-600">Eatry Hub {accountLabel}</p>
        <h1 className="mt-2 text-3xl font-black text-slate-900">Reset your password</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">We’ll email a six-digit code to the address on your {accountLabel} account. The code expires after 10 minutes.</p>

        {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}

        {completed ? <Link href={returnHref} className="mt-6 block rounded-full bg-orange-500 px-5 py-3 text-center font-semibold text-white">Return to sign in</Link> : !codeSent ? (
          <form onSubmit={sendCode} className="mt-6 space-y-4">
            <label className="block space-y-2 text-sm font-medium text-slate-700">{accountLabel} email
              <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-2xl border border-slate-200 px-3 py-3 outline-none focus:border-orange-300" />
            </label>
            <button type="submit" disabled={pending} className="w-full rounded-full bg-orange-500 px-5 py-3 font-semibold text-white disabled:opacity-60">{pending ? "Sending code…" : "Email me a reset code"}</button>
          </form>
        ) : (
          <form onSubmit={resetPassword} className="mt-6 space-y-4">
            <label className="block space-y-2 text-sm font-medium text-slate-700">Six-digit email code
              <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-lg tracking-[0.35em] outline-none focus:border-orange-300" />
            </label>
            <label className="block space-y-2 text-sm font-medium text-slate-700">New password
              <input type="password" required minLength={8} maxLength={1024} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-2xl border border-slate-200 px-3 py-3 outline-none focus:border-orange-300" />
            </label>
            <label className="block space-y-2 text-sm font-medium text-slate-700">Confirm new password
              <input type="password" required minLength={8} maxLength={1024} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="w-full rounded-2xl border border-slate-200 px-3 py-3 outline-none focus:border-orange-300" />
            </label>
            <button type="submit" disabled={pending} className="w-full rounded-full bg-orange-500 px-5 py-3 font-semibold text-white disabled:opacity-60">{pending ? "Updating password…" : "Reset password"}</button>
            <button type="button" disabled={pending} onClick={() => { setCodeSent(false); setCode(""); setMessage(""); setError(""); }} className="w-full py-2 text-sm font-medium text-orange-700">Send a new code</button>
          </form>
        )}
      </section>
    </main>
  );
}
