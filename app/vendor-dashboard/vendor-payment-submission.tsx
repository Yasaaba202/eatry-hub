"use client";

import { type FormEvent, useState } from "react";

export function VendorPaymentSubmission({
  transactionId,
  senderMobileNumber,
}: {
  transactionId: string;
  senderMobileNumber: string;
}) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  const submitPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/vendor/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: formData.get("transactionId"),
          senderMobileNumber: formData.get("senderMobileNumber"),
        }),
      });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Could not submit payment details.");
        return;
      }
      setMessage(result.message ?? "Payment details submitted for review.");
      window.location.reload();
    } catch (error) {
      console.error("Vendor payment details request failed.", error);
      setMessage("Could not reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submitPayment} className="mt-4 grid gap-4 sm:grid-cols-2">
      <label className="space-y-2 text-sm font-medium text-slate-700">
        Transaction ID
        <input name="transactionId" required minLength={3} maxLength={100} defaultValue={transactionId} className="w-full rounded-xl border border-slate-200 px-3 py-3" autoComplete="off" />
      </label>
      <label className="space-y-2 text-sm font-medium text-slate-700">
        Mobile-money number sent from
        <input name="senderMobileNumber" required minLength={7} maxLength={32} type="tel" defaultValue={senderMobileNumber} className="w-full rounded-xl border border-slate-200 px-3 py-3" autoComplete="tel" />
      </label>
      <div className="sm:col-span-2">
        <button disabled={pending} className="rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? "Submitting..." : "Submit payment details"}
        </button>
        {message && <p role="status" className="mt-3 text-sm text-slate-700">{message}</p>}
      </div>
    </form>
  );
}
