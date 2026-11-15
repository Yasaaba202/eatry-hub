"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    fetch("/api/admin/session")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not check admin configuration.");
        return (await response.json()) as { configured: boolean };
      })
      .then((result) => {
        if (active) setConfigured(result.configured);
      })
      .catch((error: unknown) => {
        console.error("Could not check admin configuration.", error);
        if (active) setMessage("Could not reach the server. Refresh this page and try again.");
      });

    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setPending(true);
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Sign-in failed. Check your credentials and try again.");
        return;
      }

      router.replace("/admin");
      router.refresh();
    } catch (error) {
      console.error("Admin sign-in request failed.", error);
      setMessage("Could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fffaf4] px-4 py-12 text-slate-900">
      <section className="w-full max-w-md rounded-[32px] border border-slate-200 bg-white p-7 shadow-[0_25px_80px_rgba(15,23,42,0.10)] sm:p-9">
        <Link href="/" className="text-sm font-black tracking-[0.18em] text-orange-600">
          EATRY HUB
        </Link>
        <p className="mt-8 text-sm font-semibold uppercase tracking-[0.2em] text-orange-500">Administrator access</p>
        <h1 className="mt-2 text-3xl font-black">Sign in to admin</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          This area is restricted to the authorized administrator account.
        </p>

        {configured === false && (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900" role="status">
            Admin sign-in is not configured yet. Set the admin email, password hash, and session secret in `.env.local`, then restart the server.
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block space-y-2 text-sm font-medium text-slate-700">
            Admin email
            <input
              type="email"
              name="email"
              autoComplete="username"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-orange-300"
            />
          </label>

          <label className="block space-y-2 text-sm font-medium text-slate-700">
            Password
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              maxLength={1024}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-orange-300"
            />
          </label>

          <button
            type="submit"
            disabled={pending || configured !== true}
            className="w-full rounded-full bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Signing in..." : "Sign in securely"}
          </button>
          <p role="alert" aria-live="polite" className="min-h-5 text-sm text-red-700">{message}</p>
        </form>

        <Link href="/admin/forgot-password" className="mt-2 inline-block text-sm font-medium text-orange-600 hover:text-orange-700">Forgot admin password?</Link>

        <Link href="/" className="mt-3 inline-block text-sm font-medium text-slate-500 hover:text-orange-600">
          Return to marketplace
        </Link>
      </section>
    </main>
  );
}
