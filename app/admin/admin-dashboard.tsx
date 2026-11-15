"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/csrf-client";
import { NotificationBell } from "@/app/notification-bell";
import { AdminMenuCatalogManager } from "./menu-catalog-manager";

type AdminAccount = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: "VENDOR" | "CUSTOMER" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED" | "DISABLED";
  createdAt: string;
  vendorProfile: null | {
    id: string;
    businessName: string;
    businessPhone: string;
    location: string;
    description: string;
    status: string;
    approvedAt: string | null;
    category: { name: string } | null;
    restaurant: { isVisible: boolean } | null;
    subscriptions: { status: string; plan: { name: string; monthlyPrice: string } }[];
  };
};

type PaymentSubmission = {
  id: string;
  purpose: "VENDOR_SUBSCRIPTION" | "WALLET_TOP_UP" | "FOOD_ORDER";
  providerReference: string | null;
  senderName: string | null;
  senderMobileNumber: string | null;
  senderNetwork: string | null;
  amount: string;
  currency: string;
  createdAt: string;
  user: { fullName: string; email: string } | null;
  application: {
    id: string;
    status: string;
    businessName: string;
    vendor: { userId: string; status: string };
  } | null;
  order: { orderNumber: string; guestName: string | null; guestPhone: string } | null;
};

type AdminOrder = {
  id: string;
  orderNumber: string;
  guestName: string | null;
  guestPhone: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  total: number;
  deliveryFee: number;
  deliveryFeePayment: string;
  currency: string;
  createdAt: string;
  vendorOrders: {
    status: string;
    restaurant: { name: string };
    items: { nameSnapshot: string; quantity: number }[];
  }[];
};

type PendingPayout = {
  id: string;
  reference: string;
  amount: number;
  feeAmount: number;
  netAmount: number;
  destinationNumber: string | null;
  destinationNetwork: string | null;
  createdAt: string;
  vendor: { businessName: string; user: { email: string } };
};

type DashboardData = {
  accounts: AdminAccount[];
  payments: PaymentSubmission[];
  payouts: PendingPayout[];
  orders: AdminOrder[];
  mobileMoneyDestinations: {
    MTN: { accountName: string; accountNumber: string };
    TELECEL: { accountName: string; accountNumber: string };
  };
  stats: {
    activeVendors: number;
    pendingApprovals: number;
    pendingPayments: number;
    customers: number;
    monthlyRevenue: number;
    monthlyPaymentCount: number;
    monthlyOrderCount: number;
    month: string;
  };
};

type AccountDraft = {
  fullName: string;
  email: string;
  phone: string;
  businessName: string;
  businessPhone: string;
  location: string;
  description: string;
};

type MutationResult = { error?: string; message?: string };

const emptyDraft: AccountDraft = {
  fullName: "",
  email: "",
  phone: "",
  businessName: "",
  businessPhone: "",
  location: "",
  description: "",
};

async function readResult(response: Response): Promise<MutationResult> {
  return (await response.json()) as MutationResult;
}

export function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AccountDraft>(emptyDraft);
  const [paymentDestinations, setPaymentDestinations] = useState<DashboardData["mobileMoneyDestinations"]>({
    MTN: { accountName: "", accountNumber: "" },
    TELECEL: { accountName: "", accountNumber: "" },
  });
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [logoutError, setLogoutError] = useState("");
  const router = useRouter();

  const loadData = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/admin/management", { cache: "no-store" });
      const result = await response.json() as DashboardData & { error?: string };
      if (!response.ok) {
        setError(result.error ?? "Could not load admin data.");
        return;
      }
      setData(result);
      setPaymentDestinations(result.mobileMoneyDestinations);
    } catch (loadError) {
      console.error("Admin dashboard data request failed.", loadError);
      setError("Could not reach the server to load admin data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const runAction = async (payload: Record<string, unknown>) => {
    if (pendingAction) return;
    setPendingAction(true);
    setMessage("");
    setError("");
    try {
      const response = await apiFetch("/api/admin/management", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      const result = await readResult(response);
      if (!response.ok) {
        setError(result.error ?? "The admin action could not be completed.");
        return;
      }
      setMessage(result.message ?? "Changes saved.");
      setEditingId(null);
      await loadData();
    } catch (actionError) {
      console.error("Admin management request failed.", actionError);
      setError("Could not reach the server to save changes.");
    } finally {
      setPendingAction(false);
    }
  };

  const signOut = async () => {
    setLogoutError("");
    try {
      const response = await fetch("/api/admin/session", { method: "DELETE" });
      if (!response.ok) {
        setLogoutError("Could not sign out. Please try again.");
        return;
      }
      router.replace("/admin/login");
      router.refresh();
    } catch (signOutError) {
      console.error("Admin sign-out request failed.", signOutError);
      setLogoutError("Could not reach the server to sign out.");
    }
  };

  const startEditing = (account: AdminAccount) => {
    setEditingId(account.id);
    setDraft({
      fullName: account.fullName,
      email: account.email,
      phone: account.phone ?? "",
      businessName: account.vendorProfile?.businessName ?? "",
      businessPhone: account.vendorProfile?.businessPhone ?? "",
      location: account.vendorProfile?.location ?? "",
      description: account.vendorProfile?.description ?? "",
    });
  };

  const saveAccount = (event: FormEvent<HTMLFormElement>, account: AdminAccount) => {
    event.preventDefault();
    const payload: Record<string, unknown> = {
      action: "edit-account",
      userId: account.id,
      ...draft,
      phone: draft.phone || null,
    };
    void runAction(payload);
  };

  const deleteAccount = (account: AdminAccount) => {
    if (!window.confirm(`Permanently delete ${account.fullName}'s ${account.role.toLowerCase()} account?`)) return;
    void runAction({ action: "delete-account", userId: account.id });
  };

  const exportReport = () => {
    if (!data) return;
    const csvRows = [
      ["Name", "Email", "Phone", "Role", "Account status", "Business", "Vendor status", "Plan"],
      ...data.accounts.map((account) => [
        account.fullName,
        account.email,
        account.phone ?? "",
        account.role,
        account.status,
        account.vendorProfile?.businessName ?? "",
        account.vendorProfile?.status ?? "",
        account.vendorProfile?.subscriptions[0]?.plan.name ?? "",
      ]),
    ];
    const csv = csvRows.map((row) =>
      row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","),
    ).join("\n");
    const link = document.createElement("a");
    const objectUrl = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.href = objectUrl;
    link.download = "eatry-hub-accounts.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };

  const resetDatabase = async () => {
    if (resetConfirmation !== "CLEAR ALL DATA") {
      setError('Type "CLEAR ALL DATA" exactly to enable the reset.');
      return;
    }
    if (!resetPassword) {
      setError("Re-enter your admin password to confirm the reset.");
      return;
    }
    if (!window.confirm("This permanently deletes all customers, vendors, orders, payments, and revenue records. Continue?")) return;
    setPendingAction(true);
    setMessage("");
    setError("");
    try {
      const response = await apiFetch("/api/admin/management", {
        method: "DELETE",
        body: JSON.stringify({ confirmation: resetConfirmation, password: resetPassword }),
      });
      const result = await readResult(response);
      if (!response.ok) {
        setError(result.error ?? "The data reset could not be completed.");
        return;
      }
      setMessage(result.message ?? "Application data cleared.");
      setResetConfirmation("");
      setResetPassword("");
      await loadData();
    } catch (resetError) {
      console.error("Admin database reset request failed.", resetError);
      setError("Could not reach the server to clear application data.");
    } finally {
      setPendingAction(false);
    }
  };

  const vendors = data?.accounts.filter((account) => account.role === "VENDOR") ?? [];
  const customers = data?.accounts.filter((account) => account.role === "CUSTOMER") ?? [];
  const formatMoney = (amount: number) => `GHS ${amount.toFixed(2)}`;

  return (
    <main className="min-h-screen bg-[#fffaf4] px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/" className="flex items-center gap-2 text-lg font-black tracking-[0.12em] text-slate-900">
              <Image src="/brand/logo-mark.svg" alt="" width={32} height={32} className="h-8 w-8" />
              EATRY HUB ADMIN
            </Link>
            <p className="mt-1 text-sm text-slate-500">Vendor approvals, accounts, and payment review</p>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <button type="button" onClick={exportReport} disabled={!data} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">Export accounts</button>
            <button type="button" onClick={signOut} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Sign out</button>
          </div>
        </header>

        {logoutError && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{logoutError}</p>}
        {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
        {loading && <p className="mb-4 rounded-xl bg-white p-4 text-sm text-slate-600">Loading live admin data...</p>}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Approved vendors", value: data?.stats.activeVendors ?? "—" },
            { label: "Payments awaiting verification", value: data?.stats.pendingPayments ?? "—" },
            { label: "Vendors ready for approval", value: data?.stats.pendingApprovals ?? "—" },
            { label: "Orders this month", value: data?.stats.monthlyOrderCount ?? "—" },
            { label: "This month's verified revenue", value: data ? formatMoney(data.stats.monthlyRevenue) : "—" },
          ].map((stat) => (
            <article key={stat.label} className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">{stat.label}</p>
              <p className="mt-2 text-2xl font-black">{stat.value}</p>
              {stat.label.includes("revenue") && data && <p className="mt-1 text-xs text-slate-500">{data.stats.monthlyPaymentCount} successful payments this month</p>}
            </article>
          ))}
        </section>

        <section className="mt-8 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-2xl font-black">Vendor withdrawal requests</h2>
          <p className="mt-1 text-sm text-slate-600">Process these requests between 6:00 AM and 12:00 PM Ghana time. Send the net amount by MoMo first, then mark the request paid.</p>
          <div className="mt-5 space-y-3">
            {data?.payouts.map((payout) => (
              <article key={payout.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4">
                <div>
                  <p className="font-bold">{payout.vendor.businessName} · {payout.reference}</p>
                  <p className="text-sm text-slate-600">{payout.vendor.user.email} · {payout.destinationNumber} · {payout.destinationNetwork}</p>
                  <p className="text-sm">Requested GHS {payout.amount.toFixed(2)} · Fee GHS {payout.feeAmount.toFixed(2)} · Send GHS {payout.netAmount.toFixed(2)}</p>
                </div>
                <button disabled={pendingAction} onClick={() => { if (window.confirm(`Confirm you sent GHS ${payout.netAmount.toFixed(2)} to ${payout.destinationNumber}?`)) void runAction({ action: "complete-payout", payoutId: payout.id }); }} className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Mark paid</button>
              </article>
            ))}
            {!loading && data?.payouts.length === 0 && <p className="text-sm text-slate-500">No vendor withdrawals are waiting for processing.</p>}
          </div>
        </section>

        <section className="mt-8 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-2xl font-black">Customer deposit numbers</h2>
          <p className="mt-1 text-sm text-slate-600">Customers see the matching account details after selecting MTN or Telecel when they deposit into their wallet.</p>
          <form
            className="mt-5 grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              void runAction({ action: "save-payment-destinations", destinations: paymentDestinations });
            }}
          >
            {(["MTN", "TELECEL"] as const).map((network) => (
              <fieldset key={network} className="space-y-3 rounded-2xl border border-slate-200 p-4">
                <legend className="px-2 font-bold">{network === "MTN" ? "MTN Mobile Money" : "Telecel Cash"}</legend>
                <label className="block space-y-1 text-sm font-medium">
                  Account name
                  <input required minLength={2} maxLength={120} value={paymentDestinations[network].accountName} onChange={(event) => setPaymentDestinations({ ...paymentDestinations, [network]: { ...paymentDestinations[network], accountName: event.target.value } })} className="w-full rounded-xl border px-3 py-2.5" />
                </label>
                <label className="block space-y-1 text-sm font-medium">
                  Mobile Money number
                  <input required minLength={7} maxLength={32} value={paymentDestinations[network].accountNumber} onChange={(event) => setPaymentDestinations({ ...paymentDestinations, [network]: { ...paymentDestinations[network], accountNumber: event.target.value } })} className="w-full rounded-xl border px-3 py-2.5" />
                </label>
              </fieldset>
            ))}
            <button disabled={pendingAction} className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50 md:col-span-2">Save deposit details</button>
          </form>
        </section>

        <AdminMenuCatalogManager />

        <section className="mt-8 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-2xl font-black">Payment verification</h2>
          <p className="mt-1 text-sm text-slate-600">Check each transaction in your payment channel before marking it verified. Submitted details alone do not prove payment. Verified wallet top-ups credit the customer wallet; rejected food-order payments cancel the order.</p>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {data?.payments.map((payment) => (
              <article key={payment.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold">
                      {payment.purpose === "VENDOR_SUBSCRIPTION"
                        ? payment.application?.businessName ?? "Vendor application unavailable"
                        : payment.purpose === "WALLET_TOP_UP"
                          ? "Customer wallet top-up"
                          : `Food order ${payment.order?.orderNumber ?? "(order unavailable)"}`}
                    </h3>
                    <p className="text-sm text-slate-600">
                      {payment.user?.fullName ?? payment.order?.guestName ?? "Unknown customer"} · {payment.user?.email ?? payment.order?.guestPhone ?? "—"}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold">{payment.currency} {Number(payment.amount).toFixed(2)}</span>
                </div>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div><dt className="text-slate-500">Transaction ID</dt><dd className="break-all font-semibold">{payment.providerReference ?? "Not supplied"}</dd></div>
                  <div><dt className="text-slate-500">Sender name</dt><dd className="font-semibold">{payment.senderName ?? "Not supplied"}</dd></div>
                  {payment.senderNetwork && <div><dt className="text-slate-500">Sending network</dt><dd className="font-semibold">{payment.senderNetwork}</dd></div>}
                  <div><dt className="text-slate-500">Sender mobile-money number</dt><dd className="font-semibold">{payment.senderMobileNumber ?? "Not supplied"}</dd></div>
                  <div><dt className="text-slate-500">Submitted</dt><dd>{new Date(payment.createdAt).toLocaleString()}</dd></div>
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    disabled={pendingAction || !payment.providerReference || (payment.purpose === "WALLET_TOP_UP" ? !payment.senderName || !payment.senderMobileNumber || !payment.senderNetwork : !payment.senderMobileNumber) || (payment.purpose === "VENDOR_SUBSCRIPTION" && !payment.application) || (payment.purpose === "FOOD_ORDER" && !payment.order)}
                    onClick={() => void runAction({ action: "verify-payment", paymentId: payment.id })}
                    className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >Verify payment</button>
                  <button disabled={pendingAction} onClick={() => void runAction({ action: "reject-payment", paymentId: payment.id })} className="rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">Reject payment details</button>
                </div>
              </article>
            ))}
            {!loading && data?.payments.length === 0 && <p className="text-sm text-slate-500">No payments are waiting for verification.</p>}
          </div>
        </section>

        <section className="mt-8 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black">Recent customer orders</h2>
              <p className="mt-1 text-sm text-slate-600">Review order totals, payment status, customer contact, items, and vendor fulfillment progress.</p>
            </div>
            <span className="text-sm text-slate-500">Latest {data?.orders.length ?? 0}</span>
          </div>
          <div className="mt-5 space-y-3">
            {data?.orders.map((order) => (
              <details key={order.id} className="rounded-2xl border border-slate-200 p-4">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3">
                  <span>
                    <span className="block font-bold">{order.orderNumber}</span>
                    <span className="text-sm text-slate-600">{order.guestName ?? "Customer"} · {order.guestPhone}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="rounded-full bg-slate-100 px-3 py-1">{order.status.replaceAll("_", " ")}</span>
                    <span className="font-bold">{order.currency} {order.total.toFixed(2)}</span>
                  </span>
                </summary>
                <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 text-sm md:grid-cols-2">
                  <div>
                    <p><span className="text-slate-500">Payment:</span> {order.paymentMethod.replaceAll("_", " ")} · {order.paymentStatus.replaceAll("_", " ")}</p>
                    {order.deliveryFee > 0 && <p className="mt-1"><span className="text-slate-500">Delivery fee:</span> GHS {Number(order.deliveryFee).toFixed(2)} · {order.deliveryFeePayment === "UPFRONT" ? "upfront" : "due on delivery"}</p>}
                    <p className="mt-1 text-slate-500">Placed {new Date(order.createdAt).toLocaleString()}</p>
                    {order.vendorOrders.map((vendorOrder) => (
                      <div key={`${order.id}-${vendorOrder.restaurant.name}`} className="mt-3 rounded-xl bg-slate-50 p-3">
                        <p className="font-semibold">{vendorOrder.restaurant.name} · {vendorOrder.status.replaceAll("_", " ")}</p>
                        <ul className="mt-1 text-slate-600">
                          {vendorOrder.items.map((item, index) => <li key={`${item.nameSnapshot}-${index}`}>{item.quantity} × {item.nameSnapshot}</li>)}
                        </ul>
                      </div>
                    ))}
                  </div>
                  <p className="text-slate-500">Payment reviews are handled in the payment verification section above. Vendors manage fulfillment status from their dashboard.</p>
                </div>
              </details>
            ))}
            {!loading && data?.orders.length === 0 && <p className="text-sm text-slate-500">No customer orders have been placed yet.</p>}
          </div>
        </section>

        <section className="mt-8 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black">Vendor registrations</h2>
              <p className="mt-1 text-sm text-slate-600">Verify payment first, then approve the application to make the store visible.</p>
            </div>
            <span className="text-sm text-slate-500">{vendors.length} vendor accounts</span>
          </div>
          <div className="mt-5 space-y-4">
            {vendors.map((account) => (
              <article key={account.id} className="rounded-2xl border border-slate-200 p-4">
                {editingId === account.id ? (
                  <form onSubmit={(event) => saveAccount(event, account)} className="grid gap-3 sm:grid-cols-2">
                    <input required value={draft.fullName} onChange={(event) => setDraft({ ...draft, fullName: event.target.value })} placeholder="Owner name" className="rounded-xl border px-3 py-2" />
                    <input required type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="Email" className="rounded-xl border px-3 py-2" />
                    <input value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} placeholder="Account phone" className="rounded-xl border px-3 py-2" />
                    <input required value={draft.businessName} onChange={(event) => setDraft({ ...draft, businessName: event.target.value })} placeholder="Business name" className="rounded-xl border px-3 py-2" />
                    <input required value={draft.businessPhone} onChange={(event) => setDraft({ ...draft, businessPhone: event.target.value })} placeholder="Business phone" className="rounded-xl border px-3 py-2" />
                    <input required value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder="Location" className="rounded-xl border px-3 py-2" />
                    <textarea required value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Business description" className="min-h-20 rounded-xl border px-3 py-2 sm:col-span-2" />
                    <div className="flex gap-2 sm:col-span-2">
                      <button disabled={pendingAction} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save changes</button>
                      <button type="button" onClick={() => setEditingId(null)} className="rounded-full border px-4 py-2 text-sm">Cancel</button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-bold">{account.vendorProfile?.businessName ?? "Vendor profile missing"}</h3>
                        <p className="text-sm text-slate-600">{account.fullName} · {account.email} · {account.phone ?? account.vendorProfile?.businessPhone ?? "No phone"}</p>
                        <p className="mt-1 text-sm text-slate-600">{account.vendorProfile?.location} · {account.vendorProfile?.category?.name ?? "No category"}</p>
                        <p className="mt-2 text-xs text-slate-500">Joined {new Date(account.createdAt).toLocaleDateString()} · Store {account.vendorProfile?.restaurant?.isVisible ? "visible" : "hidden"} · Plan {account.vendorProfile?.subscriptions[0]?.plan.name ?? "none"}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{account.vendorProfile?.status?.replaceAll("_", " ") ?? "NO PROFILE"}</span>
                        <select aria-label={`Account status for ${account.fullName}`} value={account.status} disabled={pendingAction} onChange={(event) => void runAction({ action: "set-account-status", userId: account.id, status: event.target.value })} className="rounded-full border px-3 py-1.5 text-xs">
                          <option value="ACTIVE">Account active</option><option value="SUSPENDED">Suspend account</option><option value="DISABLED">Disable account</option>
                        </select>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button onClick={() => startEditing(account)} className="rounded-full border px-4 py-2 text-sm font-semibold">Edit vendor</button>
                      {account.vendorProfile?.status === "PAYMENT_VERIFIED" && <button disabled={pendingAction} onClick={() => void runAction({ action: "approve-vendor", userId: account.id })} className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Approve vendor</button>}
                      {account.vendorProfile && !["APPROVED", "REJECTED"].includes(account.vendorProfile.status) && <button disabled={pendingAction} onClick={() => { const reason = window.prompt("Optional reason for rejecting this application:"); if (reason !== null) void runAction({ action: "reject-vendor", userId: account.id, reason }); }} className="rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">Reject application</button>}
                      <button onClick={() => deleteAccount(account)} className="rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700">Delete account</button>
                    </div>
                  </>
                )}
              </article>
            ))}
            {!loading && vendors.length === 0 && <p className="text-sm text-slate-500">No vendor accounts have registered yet.</p>}
          </div>
        </section>

        <section className="mt-8 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black">Customer accounts</h2>
              <p className="mt-1 text-sm text-slate-600">Edit, suspend, disable, or delete regular customer accounts.</p>
            </div>
            <span className="text-sm text-slate-500">{customers.length} of {data?.stats.customers ?? 0} most recent customer accounts</span>
          </div>
          <div className="mt-5 space-y-3">
            {customers.map((account) => (
              <article key={account.id} className="rounded-2xl border border-slate-200 p-4">
                {editingId === account.id ? (
                  <form onSubmit={(event) => saveAccount(event, account)} className="grid gap-3 sm:grid-cols-3">
                    <input required value={draft.fullName} onChange={(event) => setDraft({ ...draft, fullName: event.target.value })} placeholder="Name" className="rounded-xl border px-3 py-2" />
                    <input required type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="Email" className="rounded-xl border px-3 py-2" />
                    <input value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} placeholder="Phone" className="rounded-xl border px-3 py-2" />
                    <div className="flex gap-2 sm:col-span-3">
                      <button disabled={pendingAction} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save changes</button>
                      <button type="button" onClick={() => setEditingId(null)} className="rounded-full border px-4 py-2 text-sm">Cancel</button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold">{account.fullName}</p>
                      <p className="text-sm text-slate-600">{account.email} · {account.phone ?? "No phone"} · Joined {new Date(account.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select aria-label={`Account status for ${account.fullName}`} value={account.status} disabled={pendingAction} onChange={(event) => void runAction({ action: "set-account-status", userId: account.id, status: event.target.value })} className="rounded-full border px-3 py-1.5 text-xs">
                        <option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="DISABLED">Disabled</option>
                      </select>
                      <button onClick={() => startEditing(account)} className="rounded-full border px-4 py-2 text-sm font-semibold">Edit</button>
                      <button onClick={() => deleteAccount(account)} className="rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700">Delete</button>
                    </div>
                  </div>
                )}
              </article>
            ))}
            {!loading && customers.length === 0 && <p className="text-sm text-slate-500">No customer accounts have registered yet.</p>}
          </div>
        </section>

        <section className="mt-8 rounded-[28px] border border-red-200 bg-red-50 p-5 shadow-sm">
          <h2 className="text-xl font-black text-red-900">Clear all application data</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-red-800">
            Permanently deletes all customer and vendor accounts, orders, payment records, revenue history, and related application data. This does not delete the database schema or your environment-configured admin sign-in. This cannot be undone.
          </p>
          <label className="mt-4 block max-w-sm text-sm font-semibold text-red-900">
            Type CLEAR ALL DATA to confirm
            <input value={resetConfirmation} onChange={(event) => setResetConfirmation(event.target.value)} className="mt-2 block w-full rounded-xl border border-red-300 bg-white px-3 py-2 font-normal text-slate-900" />
          </label>
          <label className="mt-4 block max-w-sm text-sm font-semibold text-red-900">
            Re-enter your admin password
            <input
              type="password"
              autoComplete="current-password"
              value={resetPassword}
              onChange={(event) => setResetPassword(event.target.value)}
              className="mt-2 block w-full rounded-xl border border-red-300 bg-white px-3 py-2 font-normal text-slate-900"
            />
          </label>
          <button
            type="button"
            disabled={pendingAction || resetConfirmation !== "CLEAR ALL DATA" || resetPassword.length === 0}
            onClick={() => void resetDatabase()}
            className="mt-3 rounded-full bg-red-700 px-5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Permanently clear all data
          </button>
          <p className="mt-2 text-xs text-red-800">This also resets monthly revenue to zero by removing all payment history.</p>
        </section>
      </div>
    </main>
  );
}
