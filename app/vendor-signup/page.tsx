"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

export default function VendorSignupPage() {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (formData.get("password") !== formData.get("confirmPassword")) {
      setMessage("Passwords do not match.");
      return;
    }

    setMessage("");
    setPending(true);
    try {
      const response = await fetch("/api/auth/vendor/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: formData.get("fullName"),
          businessName: formData.get("businessName"),
          email: formData.get("email"),
          phone: formData.get("phone"),
          location: formData.get("location"),
          description: formData.get("description"),
          category: formData.get("category"),
          hours: formData.get("hours"),
          subscriptionPlan: formData.get("subscriptionPlan"),
          password: formData.get("password"),
          confirmPassword: formData.get("confirmPassword"),
        }),
      });
      const result = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Could not create your vendor account.");
        return;
      }
      setMessage(result.message ?? "Account created. Your application is awaiting payment verification.");
      router.replace("/vendor-dashboard");
      router.refresh();
    } catch (error) {
      console.error("Vendor registration request failed.", error);
      setMessage("Could not reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#fffaf4] px-4 py-12 text-slate-900">
      <div className="mx-auto max-w-5xl rounded-[32px] bg-white p-6 shadow-[0_25px_80px_rgba(15,23,42,0.08)] ring-1 ring-slate-200 lg:p-10">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/" className="text-lg font-black tracking-[0.12em] text-slate-900">
            EATRY HUB
          </Link>
          <Link href="/login" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
            Back to login
          </Link>
        </div>

        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[28px] bg-slate-900 p-7 text-white">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-300">Vendor registration</p>
            <h1 className="mt-3 text-4xl font-black">Launch your store on EATRY HUB.</h1>
            <p className="mt-4 text-slate-300">
              Create your vendor account, submit your business application, and choose a subscription plan. Your dashboard is available as soon as registration is complete.
            </p>

            <div className="mt-8 space-y-4 text-sm text-slate-200">
              {[
                "Full vendor profile with contact details and operating hours",
                "Application review and payment verification status",
                "Dashboard access while your store is under review",
              ].map((item, index) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl bg-white/5 p-3">
                  <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold">
                    {index + 1}
                  </span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 rounded-[28px] border border-slate-200 bg-slate-50 p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Full name
                <input name="fullName" required autoComplete="name" className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-orange-300" placeholder="Your full name" />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Business name
                <input name="businessName" required className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-orange-300" placeholder="Business name" />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Email
                <input name="email" type="email" required autoComplete="email" className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-orange-300" placeholder="Email address" />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Phone
                <input name="phone" type="tel" required autoComplete="tel" className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-orange-300" placeholder="+233 ..." />
              </label>
            </div>

            <label className="block space-y-2 text-sm font-medium text-slate-700">
              Business location
              <input name="location" required className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-orange-300" placeholder="City, neighborhood" />
            </label>

            <label className="block space-y-2 text-sm font-medium text-slate-700">
              Business description
              <textarea name="description" required className="h-28 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-orange-300" placeholder="Tell customers about your business" />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Food category
                <select name="category" required defaultValue="" className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-orange-300">
                  <option value="" disabled>Select a category</option>
                  <option value="Ghanaian & Grill">Ghanaian & Grill</option>
                  <option value="Healthy Bowls">Healthy Bowls</option>
                  <option value="Asian Fusion">Asian Fusion</option>
                  <option value="Bakery">Bakery</option>
                </select>
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Business hours
                <input name="hours" required type="text" className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-orange-300" placeholder="e.g. 08:00 - 22:00" />
              </label>
            </div>

            <label className="block space-y-2 text-sm font-medium text-slate-700">
              Preferred subscription plan
              <select name="subscriptionPlan" required defaultValue="Growth" className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-orange-300">
                <option value="Starter">Starter — GHS 90/month</option>
                <option value="Growth">Growth — GHS 180/month</option>
                <option value="Enterprise">Enterprise — GHS 320/month</option>
              </select>
              <span className="block text-xs font-normal text-slate-500">
                Your choice is saved as pending. No payment is taken until online subscription payments are available.
              </span>
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Password
                <input name="password" type="password" required minLength={8} maxLength={1024} autoComplete="new-password" className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-orange-300" placeholder="At least 8 characters" />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Confirm password
                <input name="confirmPassword" type="password" required minLength={8} maxLength={1024} autoComplete="new-password" className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-orange-300" placeholder="Confirm password" />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Store logo
                <input name="logo" type="file" accept="image/*" disabled className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-3 py-3 text-xs" />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Cover image
                <input name="cover" type="file" accept="image/*" disabled className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-3 py-3 text-xs" />
              </label>
            </div>
            <p className="text-xs leading-5 text-slate-500">
              Image uploads and online payments are not connected yet. You can access your dashboard while your application waits for payment setup and review.
            </p>

            <button disabled={pending} className="w-full rounded-full bg-orange-500 px-5 py-3 text-base font-semibold text-white shadow-lg shadow-orange-200 disabled:cursor-not-allowed disabled:opacity-60">
              {pending ? "Creating account..." : "Create vendor account"}
            </button>
            <p className="text-sm text-slate-600" role="status" aria-live="polite">{message}</p>
          </form>
        </div>
      </div>
    </main>
  );
}
