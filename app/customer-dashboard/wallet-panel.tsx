"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

type WalletTransaction = {
  id: string;
  type: "CREDIT" | "DEBIT";
  amount: number;
  description: string;
  createdAt: string;
};

type PendingTopUp = {
  amount: number;
  transactionId: string | null;
  createdAt: string;
};

type WalletData = {
  balance: number;
  paymentInstructions: {
    destinations: {
      MTN: { accountName: string; accountNumber: string };
      TELECEL: { accountName: string; accountNumber: string };
    } | null;
    configured: boolean;
  };
  transactions: WalletTransaction[];
  pendingTopUps: PendingTopUp[];
};

export function WalletPanel() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [amount, setAmount] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [senderName, setSenderName] = useState("");
  const [senderMobileNumber, setSenderMobileNumber] = useState("");
  const [senderNetwork, setSenderNetwork] = useState<"MTN" | "TELECEL">("MTN");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadWallet = useCallback(async () => {
    try {
      const response = await fetch("/api/customer/wallet", { cache: "no-store" });
      const result = await response.json() as WalletData & { error?: string };
      if (!response.ok) {
        setError(result.error ?? "Could not load your wallet.");
        return;
      }
      setWallet(result);
    } catch (loadError) {
      console.error("Customer wallet request failed.", loadError);
      setError("Could not reach the server to load your wallet.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadWallet(), 0);
    return () => window.clearTimeout(timer);
  }, [loadWallet]);

  const submitTopUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/customer/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, transactionId, senderName, senderMobileNumber, senderNetwork }),
      });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) {
        setError(result.error ?? "Your top-up could not be submitted.");
        return;
      }
      setMessage(result.message ?? "Top-up submitted for verification.");
      setAmount("");
      setTransactionId("");
      setSenderName("");
      setSenderMobileNumber("");
      await loadWallet();
    } catch (submitError) {
      console.error("Customer wallet top-up request failed.", submitError);
      setError("Could not reach the server to submit your top-up.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mt-6 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <article className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black">Account balance</h2>
        <p className="mt-3 text-3xl font-black text-orange-600">
          {wallet ? `GHS ${wallet.balance.toFixed(2)}` : "Loading…"}
        </p>
        {wallet?.paymentInstructions.configured && wallet.paymentInstructions.destinations ? (
          <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm">
            <h3 className="font-bold">Choose your sending network</h3>
            <div className="mt-3 flex gap-2">
              {(["MTN", "TELECEL"] as const).map((network) => (
                <button key={network} type="button" aria-pressed={senderNetwork === network} onClick={() => setSenderNetwork(network)} className={`rounded-full border px-4 py-2 font-semibold ${senderNetwork === network ? "border-orange-500 bg-orange-500 text-white" : "border-slate-300 bg-white"}`}>
                  {network === "MTN" ? "MTN Mobile Money" : "Telecel Cash"}
                </button>
              ))}
            </div>
            <dl className="mt-2 space-y-1">
              <div className="flex justify-between gap-3"><dt>Account name</dt><dd className="font-semibold">{wallet.paymentInstructions.destinations[senderNetwork].accountName}</dd></div>
              <div className="flex justify-between gap-3"><dt>Number</dt><dd className="font-semibold">{wallet.paymentInstructions.destinations[senderNetwork].accountNumber}</dd></div>
            </dl>
            <p className="mt-3 text-slate-600">After transferring, submit the receipt details below. Your balance updates after admin verification.</p>
          </div>
        ) : (
          <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            Mobile Money deposit details are not configured yet. Contact support for payment instructions; do not send money to an unverified number.
          </p>
        )}
        <form onSubmit={submitTopUp} className="mt-5 space-y-3">
          <label className="block space-y-1 text-sm font-medium">
            Top-up amount (GHS)
            <input required type="number" min="1" max="10000" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            Transaction ID
            <input required minLength={3} maxLength={100} value={transactionId} onChange={(event) => setTransactionId(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            Sender name
            <input required minLength={2} maxLength={120} value={senderName} onChange={(event) => setSenderName(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            Your sending mobile-money number
            <input required minLength={7} maxLength={32} value={senderMobileNumber} onChange={(event) => setSenderMobileNumber(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" />
          </label>
          <button disabled={submitting || !wallet?.paymentInstructions.configured} className="w-full rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
            {submitting ? "Submitting…" : "Submit top-up for verification"}
          </button>
        </form>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="mt-3 text-sm text-emerald-700">{message}</p>}
      </article>

      <article className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black">Wallet activity</h2>
        {wallet?.pendingTopUps.length ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <h3 className="font-semibold">Pending top-ups</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {wallet.pendingTopUps.map((topUp) => (
                <li key={`${topUp.transactionId}-${topUp.createdAt}`} className="flex justify-between gap-3">
                  <span className="break-all">{topUp.transactionId ?? "Transfer"} · awaiting review</span>
                  <span className="shrink-0 font-semibold">GHS {topUp.amount.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {!wallet?.transactions.length ? (
          <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">No verified wallet transactions yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {wallet.transactions.map((transaction) => (
              <li key={transaction.id} className="flex flex-wrap justify-between gap-3 rounded-2xl bg-slate-50 p-4">
                <div>
                  <p className="font-semibold">{transaction.description}</p>
                  <p className="mt-1 text-xs text-slate-500">{new Date(transaction.createdAt).toLocaleString()}</p>
                </div>
                <p className={`font-bold ${transaction.type === "CREDIT" ? "text-emerald-700" : "text-slate-800"}`}>
                  {transaction.type === "CREDIT" ? "+" : "−"} GHS {transaction.amount.toFixed(2)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}
