import Image from "next/image";
import Link from "next/link";
import { AccountSignOut } from "@/app/account-sign-out";
import { NotificationBell } from "@/app/notification-bell";
import type { getCurrentAccount } from "@/lib/account-auth";
import { VendorPaymentSubmission } from "./vendor-payment-submission";

type Account = NonNullable<Awaited<ReturnType<typeof getCurrentAccount>>>;
type AccountVendor = NonNullable<Account["vendorProfile"]>;
type Vendor = Omit<AccountVendor, "subscriptions"> & {
  subscriptions: Array<
    Omit<AccountVendor["subscriptions"][number], "plan"> & {
      plan: Omit<AccountVendor["subscriptions"][number]["plan"], "monthlyPrice"> & {
        monthlyPrice: string;
      };
    }
  >;
};

const statusDetails: Record<Vendor["status"], { title: string; description: string }> = {
  INCOMPLETE: {
    title: "Complete your application",
    description: "Some application details still need to be completed before review.",
  },
  AWAITING_PAYMENT: {
    title: "Payment verification is required",
    description: "Submit the transaction ID and mobile-money number used to send your subscription payment. An administrator will verify it manually before reviewing your application.",
  },
  PAYMENT_VERIFIED: {
    title: "Payment verified",
    description: "Your payment is confirmed. Your application is ready for administrator review.",
  },
  PENDING_APPROVAL: {
    title: "Application under review",
    description: "Your application is with the EATRY HUB team. Your store will remain hidden until it is approved.",
  },
  APPROVED: {
    title: "Your store is approved",
    description: "Your store is ready for vendor tools.",
  },
  REJECTED: {
    title: "Application needs an update",
    description: "Your application was not approved. Review the note below and contact support for next steps.",
  },
  SUSPENDED: {
    title: "Vendor access is paused",
    description: "Your vendor access is temporarily paused. Contact support for assistance.",
  },
};

export function VendorOnboardingDashboard({
  vendor,
  email,
  fullName,
}: {
  vendor: Vendor;
  email: string;
  fullName: string;
}) {
  const status = statusDetails[vendor.status];
  const subscription = vendor.subscriptions[0];
  const application = vendor.applications[0];
  const paymentSubmission = application?.payments[0];

  return (
    <main className="min-h-screen bg-[#fffaf4] px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <Image src="/brand/logo-mark.svg" alt="" width={30} height={30} className="h-[30px] w-[30px]" />
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-500">Vendor dashboard</p>
            </div>
            <h1 className="mt-1 text-2xl font-black">{vendor.businessName}</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
              Marketplace
            </Link>
            <NotificationBell />
            <AccountSignOut />
          </div>
        </header>

        <section className="rounded-[30px] border border-orange-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-500">Application status</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-2xl font-black">{status.title}</h2>
            <span className="rounded-full bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-800">
              {vendor.status.replaceAll("_", " ")}
            </span>
          </div>
          <p className="mt-4 max-w-3xl leading-7 text-slate-600">{status.description}</p>
          {vendor.status === "REJECTED" && vendor.rejectionReason && (
            <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-800">
              Review note: {vendor.rejectionReason}
            </p>
          )}
        </section>

        {vendor.status === "AWAITING_PAYMENT" && (
          <section className="mt-6 rounded-[30px] border border-amber-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-black">Submit mobile-money payment</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              After sending your subscription payment using the payment instructions provided by EATRY HUB, enter the transaction ID from your receipt and the number the money was sent from. Submission is not automatic verification; the admin will check the transaction before approval.
            </p>
            {paymentSubmission?.status === "PENDING" && (
              <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                Your latest transaction details are awaiting manual verification. You may resubmit corrected details below if needed.
              </p>
            )}
            <VendorPaymentSubmission
              transactionId={paymentSubmission?.providerReference ?? ""}
              senderMobileNumber={paymentSubmission?.senderMobileNumber ?? ""}
            />
          </section>
        )}

        {vendor.status === "PAYMENT_VERIFIED" && (
          <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            Your payment has been verified. Your application is waiting for the administrator’s approval before the store becomes visible.
          </section>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black">Registration progress</h2>
            <ol className="mt-5 space-y-4">
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">1</span>
                <div>
                  <p className="font-semibold">Account and business profile created</p>
                  <p className="mt-1 text-sm text-slate-500">Your registration details have been saved.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${subscription ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>2</span>
                <div>
                  <p className="font-semibold">Subscription plan selected</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {subscription
                      ? `${subscription.plan.name} — GHS ${Number(subscription.plan.monthlyPrice).toFixed(2)}/month. Payment status: ${subscription.status.replaceAll("_", " ").toLowerCase()}.`
                      : "No subscription plan is recorded yet."}
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${vendor.status === "PAYMENT_VERIFIED" || vendor.status === "PENDING_APPROVAL" || vendor.status === "APPROVED" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>3</span>
                <div>
                  <p className="font-semibold">Payment verification and review</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {paymentSubmission?.status === "PENDING"
                      ? "Your submitted payment details are being checked by an administrator."
                      : vendor.status === "PAYMENT_VERIFIED" || vendor.status === "APPROVED"
                        ? "Payment has been manually verified."
                        : "Submit your transaction ID and sender number so an administrator can verify payment."}
                  </p>
                </div>
              </li>
            </ol>
          </section>

          <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black">Business profile</h2>
            <dl className="mt-5 space-y-4 text-sm">
              <div><dt className="text-slate-500">Owner</dt><dd className="mt-1 font-semibold">{fullName}</dd></div>
              <div><dt className="text-slate-500">Email</dt><dd className="mt-1 font-semibold">{email}</dd></div>
              <div><dt className="text-slate-500">Phone</dt><dd className="mt-1 font-semibold">{vendor.businessPhone}</dd></div>
              <div><dt className="text-slate-500">Location</dt><dd className="mt-1 font-semibold">{vendor.location}</dd></div>
              <div><dt className="text-slate-500">Category</dt><dd className="mt-1 font-semibold">{vendor.category?.name ?? "Not selected"}</dd></div>
              <div><dt className="text-slate-500">Opening hours</dt><dd className="mt-1 font-semibold">{vendor.openingTime ?? "--:--"} - {vendor.closingTime ?? "--:--"}</dd></div>
              <div><dt className="text-slate-500">About</dt><dd className="mt-1 leading-6 text-slate-700">{vendor.description}</dd></div>
            </dl>
          </section>
        </div>

        <p className="mt-6 rounded-2xl border border-slate-200 bg-slate-100 p-4 text-sm leading-6 text-slate-600">
          Menu publishing, image uploads, and live order management will become available when your store is approved. Payment verification is manual; never submit payment details for a payment you have not sent.
        </p>
      </div>
    </main>
  );
}
