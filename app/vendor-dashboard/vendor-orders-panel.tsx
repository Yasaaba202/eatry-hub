"use client";

import { useCallback, useEffect, useState } from "react";

type VendorOrderStatus =
  | "ORDER_PLACED"
  | "ORDER_ACCEPTED"
  | "PREPARING"
  | "READY_FOR_PICKUP"
  | "PICKED_UP"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED"
  | "REJECTED"
  | "PAYMENT_CONFIRMED";

type VendorOrder = {
  id: string;
  status: VendorOrderStatus;
  subtotal: number;
  createdAt: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string | null;
  fulfillmentType: string;
  paymentMethod: string;
  paymentStatus: string;
  orderTotal: number;
  deliveryFee: number;
  deliveryFeePayment: string;
  currency: string;
  items: { name: string; quantity: number; price: number; total: number }[];
};

type OrdersResponse = { orders?: VendorOrder[]; error?: string; message?: string };

function nextStatus(order: VendorOrder): { status: VendorOrderStatus; label: string } | null {
  if (order.status === "ORDER_PLACED") return { status: "ORDER_ACCEPTED", label: "Approve order" };
  if (order.status === "ORDER_ACCEPTED") return { status: "PREPARING", label: "Start preparing" };
  if (order.status === "PREPARING") {
    return order.fulfillmentType === "PICKUP"
      ? { status: "READY_FOR_PICKUP", label: "Ready for pickup" }
      : { status: "OUT_FOR_DELIVERY", label: "Out for delivery" };
  }
  if (order.status === "READY_FOR_PICKUP") return { status: "PICKED_UP", label: "Mark picked up" };
  if (order.status === "PICKED_UP" || order.status === "DELIVERED") {
    return { status: "COMPLETED", label: "Complete order" };
  }
  if (order.status === "OUT_FOR_DELIVERY") return { status: "DELIVERED", label: "Mark delivered" };
  return null;
}

export function VendorOrdersPanel() {
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadOrders = useCallback(async () => {
    try {
      const response = await fetch("/api/vendor/orders", { cache: "no-store" });
      const result = await response.json() as OrdersResponse;
      if (!response.ok) {
        setError(result.error ?? "Could not load customer orders.");
        return;
      }
      setOrders(result.orders ?? []);
      setError("");
    } catch (loadError) {
      console.error("Vendor orders request failed.", loadError);
      setError("Could not reach the server to load customer orders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadOrders(), 0);
    return () => window.clearTimeout(timer);
  }, [loadOrders]);

  const updateStatus = async (order: VendorOrder, status: VendorOrderStatus) => {
    setUpdatingId(order.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/vendor/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorOrderId: order.id, status }),
      });
      const result = await response.json() as OrdersResponse;
      if (!response.ok) {
        setError(result.error ?? "Could not update the order.");
        return;
      }
      setMessage(result.message ?? "Order updated.");
      await loadOrders();
    } catch (updateError) {
      console.error("Vendor order status update failed.", updateError);
      setError("Could not reach the server to update the order.");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <section className="mb-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">Customer orders</h2>
          <p className="mt-1 text-sm text-slate-600">Approve new orders and keep customers updated as you prepare them.</p>
        </div>
        <button type="button" onClick={() => void loadOrders()} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium">Refresh orders</button>
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {loading ? <p className="mt-5 text-sm text-slate-500">Loading customer orders…</p> : orders.length === 0 ? (
        <p className="mt-5 rounded-2xl bg-slate-50 p-5 text-sm text-slate-600">No customer orders yet.</p>
      ) : (
        <div className="mt-5 space-y-4">
          {orders.map((order) => {
            const action = nextStatus(order);
            const paymentPending = order.paymentMethod !== "CASH_ON_DELIVERY" && order.paymentStatus !== "SUCCEEDED";
            return (
              <article key={order.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold">Order {order.orderNumber}</h3>
                    <p className="mt-1 text-sm text-slate-600">{order.customerName} · {order.customerPhone}</p>
                    <p className="text-xs text-slate-500">{new Date(order.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-semibold">{order.status.replaceAll("_", " ")}</p>
                    <p className={paymentPending ? "text-amber-700" : "text-emerald-700"}>
                      {paymentPending ? "Payment awaiting verification" : order.paymentMethod === "CASH_ON_DELIVERY" ? "Cash due on delivery" : "Payment confirmed"}
                    </p>
                  </div>
                </div>
                <ul className="mt-4 space-y-1 text-sm text-slate-700">
                  {order.items.map((item, index) => (
                    <li key={`${item.name}-${index}`} className="flex justify-between gap-3">
                      <span>{item.quantity} × {item.name}</span>
                      <span>GHS {item.total.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 grid gap-2 border-t border-slate-100 pt-3 text-sm sm:grid-cols-2">
                  <p><span className="text-slate-500">Vendor subtotal: </span><strong>GHS {order.subtotal.toFixed(2)}</strong></p>
                  {order.fulfillmentType === "DELIVERY" && <p><span className="text-slate-500">Delivery fee: </span><strong>GHS {order.deliveryFee.toFixed(2)} · {order.deliveryFeePayment === "UPFRONT" ? "paid upfront" : "due on delivery"}</strong></p>}
                  <p><span className="text-slate-500">Fulfillment: </span><strong>{order.fulfillmentType.toLowerCase()}</strong></p>
                  {order.deliveryAddress && <p className="sm:col-span-2"><span className="text-slate-500">Delivery address: </span><strong>{order.deliveryAddress}</strong></p>}
                </div>
                {action && (
                  <button
                    type="button"
                    disabled={updatingId !== null || paymentPending}
                    onClick={() => void updateStatus(order, action.status)}
                    className="mt-4 rounded-full bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {updatingId === order.id ? "Updating…" : paymentPending ? "Waiting for payment verification" : action.label}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
