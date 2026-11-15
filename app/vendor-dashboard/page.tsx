import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentAccount } from "@/lib/account-auth";
import { VendorOnboardingDashboard } from "./vendor-onboarding-dashboard";
import { VendorDashboardPreview } from "./vendor-dashboard-preview";

export default function VendorDashboardPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <VendorAccess />
    </Suspense>
  );
}

async function VendorAccess() {
  await connection();
  const account = await getCurrentAccount();
  if (!account || account.role !== "VENDOR" || !account.vendorProfile) {
    redirect("/login");
  }

  if (account.vendorProfile.status === "APPROVED") {
    return <VendorDashboardPreview storeName={account.vendorProfile.businessName} />;
  }

  const vendor = {
    ...account.vendorProfile,
    subscriptions: account.vendorProfile.subscriptions.map((subscription) => ({
      ...subscription,
      plan: { ...subscription.plan, monthlyPrice: subscription.plan.monthlyPrice.toString() },
    })),
  };

  return (
    <VendorOnboardingDashboard
      vendor={vendor}
      email={account.email}
      fullName={account.fullName}
    />
  );
}

function DashboardLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fffaf4] px-4 text-slate-700">
      Checking vendor access...
    </main>
  );
}
