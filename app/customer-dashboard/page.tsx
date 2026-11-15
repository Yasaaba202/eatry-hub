import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { UserRole } from "@prisma/client";
import { AccountSignOut } from "@/app/account-sign-out";
import { NotificationBell } from "@/app/notification-bell";
import { WalletPanel } from "./wallet-panel";
import { getCurrentAccount } from "@/lib/account-auth";
import { prisma } from "@/lib/prisma";

export default function CustomerDashboardPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <CustomerAccess />
    </Suspense>
  );
}

async function CustomerAccess() {
  await connection();
  const account = await getCurrentAccount();
  if (!account || account.role !== UserRole.CUSTOMER) {
    redirect("/login");
  }

  const orders = await prisma.order.findMany({
    where: { customerId: account.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      total: true,
      currency: true,
      createdAt: true,
      vendorOrders: {
        select: { restaurant: { select: { name: true } } },
      },
    },
  });

  return (
    <main className="min-h-screen bg-[#fffaf4] px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <Image src="/brand/logo-mark.svg" alt="" width={30} height={30} className="h-[30px] w-[30px]" />
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-500">Customer dashboard</p>
            </div>
            <h1 className="mt-1 text-2xl font-black">Welcome, {account.fullName}</h1>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <Link href="/" className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white">
              Browse food
            </Link>
            <AccountSignOut />
          </div>
        </header>

        <WalletPanel />

        <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <article className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black">Your account</h2>
            <dl className="mt-5 space-y-4 text-sm">
              <div>
                <dt className="text-slate-500">Name</dt>
                <dd className="mt-1 font-semibold">{account.fullName}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Email</dt>
                <dd className="mt-1 font-semibold">{account.email}</dd>
              </div>
            </dl>
            <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              You can use this account to browse the marketplace and view orders placed while signed in.
            </p>
          </article>

          <article className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">Your recent orders</h2>
                <p className="mt-1 text-sm text-slate-500">Showing your latest {orders.length} orders.</p>
              </div>
              <span className="rounded-full bg-orange-50 px-3 py-1 text-sm font-semibold text-orange-800">
                {orders.length} {orders.length === 1 ? "order" : "orders"}
              </span>
            </div>

            {orders.length === 0 ? (
              <div className="mt-5 rounded-2xl bg-slate-50 p-5">
                <p className="font-semibold">No account orders yet</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Place an order from the marketplace while signed in and it will appear here.
                </p>
                <Link href="/" className="mt-4 inline-flex rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                  Explore the marketplace
                </Link>
              </div>
            ) : (
              <ul className="mt-5 space-y-3">
                {orders.map((order) => (
                  <li key={order.id} className="rounded-2xl bg-slate-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">Order {order.orderNumber}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {order.vendorOrders.map((vendorOrder) => vendorOrder.restaurant.name).join(", ") || "Marketplace order"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short" }).format(order.createdAt)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{order.currency} {Number(order.total).toFixed(2)}</p>
                        <p className="mt-1 text-xs font-medium text-slate-600">
                          {order.status.replaceAll("_", " ")} · payment {order.paymentStatus.toLowerCase()}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </section>
      </div>
    </main>
  );
}

function DashboardLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fffaf4] px-4 text-slate-700">
      Loading your customer dashboard...
    </main>
  );
}
