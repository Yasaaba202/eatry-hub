"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

export default function RegisterPage() {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setPending(true);
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    if (password !== formData.get("confirmPassword")) {
      setMessage("Passwords do not match.");
      setPending(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: formData.get("fullName"),
          email: formData.get("email"),
          password,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Could not create your account.");
        return;
      }
      router.replace("/customer-dashboard");
      router.refresh();
    } catch (error) {
      console.error("Customer registration request failed.", error);
      setMessage("Could not reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fffaf4] px-4 py-12 text-slate-900">
      <section className="w-full max-w-lg rounded-[32px] border border-slate-200 bg-white p-7 shadow-[0_25px_80px_rgba(15,23,42,0.10)] sm:p-9">
        <Link href="/" className="text-sm font-black tracking-[0.18em] text-orange-600">
          EATRY HUB
        </Link>
        <p className="mt-8 text-sm font-semibold uppercase tracking-[0.2em] text-orange-500">
          Customer account
        </p>
        <h1 className="mt-2 text-3xl font-black">Create your account</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Save your details and get ready to order from local restaurants.
        </p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-4">
          <label className="block space-y-2 text-sm font-medium text-slate-700">
            Full name
            <input
              name="fullName"
              type="text"
              required
              minLength={2}
              maxLength={120}
              autoComplete="name"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-orange-300"
            />
          </label>
          <label className="block space-y-2 text-sm font-medium text-slate-700">
            Email address
            <input
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-orange-300"
            />
          </label>
          <label className="block space-y-2 text-sm font-medium text-slate-700">
            Password
            <input
              name="password"
              type="password"
              required
              minLength={8}
              maxLength={1024}
              autoComplete="new-password"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-orange-300"
            />
            <span className="block text-xs font-normal text-slate-500">Use at least 8 characters.</span>
          </label>
          <label className="block space-y-2 text-sm font-medium text-slate-700">
            Confirm password
            <input
              name="confirmPassword"
              type="password"
              required
              minLength={8}
              maxLength={1024}
              autoComplete="new-password"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-orange-300"
            />
          </label>
          {message && <p role="alert" className="text-sm text-red-700">{message}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-full bg-orange-500 px-5 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-600">
          Already registered?{" "}
          <Link href="/login" className="font-semibold text-orange-600">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
