"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [mode, setMode] = useState<"customer" | "vendor">("customer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setPending(true);
    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          role: mode.toUpperCase(),
          rememberMe: new FormData(event.currentTarget).has("rememberMe"),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Could not sign in. Check your credentials and try again.");
        return;
      }

      router.replace(mode === "vendor" ? "/vendor-dashboard" : "/customer-dashboard");
      router.refresh();
    } catch (error) {
      console.error("Account sign-in request failed.", error);
      setMessage("Could not reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#fffaf4] px-4 py-12 text-slate-900">
      <div className="mx-auto max-w-6xl rounded-[32px] bg-white p-6 shadow-[0_25px_80px_rgba(15,23,42,0.08)] ring-1 ring-slate-200 lg:p-10">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/" className="text-lg font-black tracking-[0.12em] text-slate-900">
            EATRY HUB
          </Link>
          <Link href="/vendor-signup" className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            Join as vendor
          </Link>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[28px] bg-slate-900 p-8 text-white">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-300">Welcome back</p>
            <h1 className="mt-3 text-4xl font-black">Sign in to continue your order.</h1>
            <p className="mt-4 max-w-lg text-slate-300">
              Manage delivery addresses, track orders, review vendor ratings, and access business tools from one secure account.
            </p>

            <div className="mt-8 space-y-4 text-sm text-slate-200">
              <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-xs font-bold">01</span>
                Secure role-based access for customers and vendors
              </div>
              <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-xs font-bold">02</span>
                Payment verification and subscription status visibility
              </div>
              <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-xs font-bold">03</span>
                Real-time order tracking across multiple vendors
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-6">
            <div className="mb-5 flex gap-2 rounded-full bg-white p-1 shadow-sm">
              {(["customer", "vendor"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMode(option)}
                  className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
                    mode === option ? "bg-slate-900 text-white" : "text-slate-600"
                  }`}
                >
                  {option === "customer" ? "Customer" : "Vendor"}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block space-y-2 text-sm font-medium text-slate-700">
                Email address
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-orange-300"
                />
              </label>

              <label className="block space-y-2 text-sm font-medium text-slate-700">
                Password
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-orange-300"
                />
              </label>

              <div className="flex items-center justify-between text-sm text-slate-500">
                <label className="flex items-center gap-2">
                  <input name="rememberMe" type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300" />
                  Keep me signed in
                </label>
                <Link href={mode === "vendor" ? "/forgot-password/vendor" : "/forgot-password/customer"} className="font-medium text-orange-500">Forgot your {mode} password?</Link>
              </div>

              <button type="submit" disabled={pending} className="flex w-full items-center justify-center rounded-full bg-orange-500 px-5 py-3 text-base font-semibold text-white shadow-lg shadow-orange-200 disabled:cursor-not-allowed disabled:opacity-60">
                {pending ? "Signing in..." : "Sign in"}
              </button>
              <p className="text-center text-sm text-slate-500" role="status" aria-live="polite">{message}</p>

              <p className="text-center text-sm text-slate-500">
                Don&apos;t have an account? {" "}
                <Link href="/register" className="font-semibold text-orange-500">
                  Create one today
                </Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
