"use client";

import { useCallback, useEffect, useState } from "react";

type Payout = { id: string; reference: string; amount: number; fee: number; netAmount: number; status: string; destinationNumber: string | null; destinationNetwork: string | null; createdAt: string };
type FinanceData = { earned: number; withdrawnAndReserved: number; available: number; registeredPhone: string | null; alternatePhone: { phone: string | null; network: string | null } | null; payouts: Payout[]; error?: string };

export function VendorPayoutsPanel() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [phone, setPhone] = useState("");
  const [network, setNetwork] = useState<"MTN" | "TELECEL">("MTN");
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState<"REGISTERED" | "ALTERNATE">("REGISTERED");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/vendor/payouts", { cache: "no-store" });
      const result = await response.json() as FinanceData;
      if (!response.ok) throw new Error(result.error ?? "Could not load your vendor balance.");
      setData(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load your vendor balance.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const submit = async (body: Record<string, unknown>) => {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/vendor/payouts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not complete that request.");
      setMessage(result.message ?? "Saved.");
      await load();
      return true;
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not complete that request.");
      return false;
    } finally { setBusy(false); }
  };

  if (loading) return <section className="mb-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">Loading balance and withdrawals…</section>;

  return (
    <section className="mb-6 space-y-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-500">Vendor earnings</p>
        <h2 className="mt-1 text-2xl font-black">Balance and withdrawals</h2>
        <p className="mt-1 text-sm text-slate-600">Only successful customer account-balance payments are included. Withdrawal requests are processed daily from 6:00 AM to 12:00 PM Ghana time.</p>
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Balance label="Earned from paid orders" value={data?.earned ?? 0} />
        <Balance label="Withdrawn or reserved" value={data?.withdrawnAndReserved ?? 0} />
        <Balance label="Available" value={data?.available ?? 0} strong />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
          <h3 className="font-bold">Withdrawal number</h3>
          {data?.registeredPhone ? <p className="text-sm text-slate-600">Account number: <strong>{data.registeredPhone}</strong></p> : <p className="text-sm text-amber-800">Add a phone number to your vendor account before withdrawing to your registered number.</p>}
          <label className="block text-sm font-medium">Network for registered number
            <select value={network} onChange={(event) => setNetwork(event.target.value as "MTN" | "TELECEL")} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"><option value="MTN">MTN Mobile Money</option><option value="TELECEL">Telecel Cash</option></select>
          </label>
          {data?.alternatePhone ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Verified alternate: {data.alternatePhone.phone} · {data.alternatePhone.network}</p> : <p className="text-sm text-slate-600">To use a different number, enter it below and confirm the code sent to your account email.</p>}
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <input aria-label="Alternate mobile money number" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Alternate MoMo number" minLength={7} maxLength={32} className="rounded-xl border border-slate-200 px-3 py-2.5" />
            <select aria-label="Alternate number network" value={network} onChange={(event) => setNetwork(event.target.value as "MTN" | "TELECEL")} className="rounded-xl border border-slate-200 px-3 py-2.5"><option value="MTN">MTN</option><option value="TELECEL">Telecel</option></select>
          </div>
          <button type="button" disabled={busy || phone.trim().length < 7} onClick={() => void submit({ action: "send_phone_code", phone, network })} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Email me a confirmation code</button>
          <div className="flex gap-2">
            <input aria-label="Email confirmation code" inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="6-digit code" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5" />
            <button type="button" disabled={busy || code.length !== 6} onClick={() => void submit({ action: "verify_phone", code })} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Verify</button>
          </div>
        </div>

        <form className="space-y-3 rounded-2xl border border-slate-200 p-4" onSubmit={(event) => { event.preventDefault(); void submit({ action: "request", amount: Number(amount), destination, network }); }}>
          <h3 className="font-bold">Request a withdrawal</h3>
          <label className="block text-sm font-medium">Amount before 1% fee (GHS)
            <input required type="number" min="0.01" step="0.01" max={data?.available ?? 0} value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" />
          </label>
          <label className="block text-sm font-medium">Send to
            <select value={destination} onChange={(event) => setDestination(event.target.value as "REGISTERED" | "ALTERNATE")} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5">
              <option value="REGISTERED" disabled={!data?.registeredPhone}>Registered number {data?.registeredPhone ?? "(not set)"}</option>
              <option value="ALTERNATE" disabled={!data?.alternatePhone}>Verified alternate number {data?.alternatePhone?.phone ?? "(not set)"}</option>
            </select>
          </label>
          <p className="text-sm text-slate-600">Fee: GHS {((Number(amount) || 0) * 0.01).toFixed(2)} · You receive: GHS {((Number(amount) || 0) * 0.99).toFixed(2)}</p>
          <button type="submit" disabled={busy || !amount || Number(amount) > (data?.available ?? 0)} className="rounded-full bg-orange-500 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? "Submitting…" : "Request withdrawal"}</button>
        </form>
      </div>

      <div>
        <h3 className="mb-2 font-bold">Recent withdrawals</h3>
        {data?.payouts.length ? <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="text-slate-500"><tr><th className="p-2">Reference</th><th className="p-2">Amount</th><th className="p-2">Fee</th><th className="p-2">You receive</th><th className="p-2">Number</th><th className="p-2">Status</th></tr></thead><tbody>{data.payouts.map((payout) => <tr key={payout.id} className="border-t border-slate-100"><td className="p-2">{payout.reference}</td><td className="p-2">GHS {payout.amount.toFixed(2)}</td><td className="p-2">GHS {payout.fee.toFixed(2)}</td><td className="p-2">GHS {payout.netAmount.toFixed(2)}</td><td className="p-2">{payout.destinationNumber} · {payout.destinationNetwork}</td><td className="p-2">{payout.status.replaceAll("_", " ")}</td></tr>)}</tbody></table></div> : <p className="text-sm text-slate-500">No withdrawal requests yet.</p>}
      </div>
    </section>
  );
}

function Balance({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return <div className={`rounded-2xl p-4 ${strong ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-900"}`}><p className={`text-sm ${strong ? "text-slate-300" : "text-slate-500"}`}>{label}</p><p className="mt-1 text-2xl font-black">GHS {value.toFixed(2)}</p></div>;
}
