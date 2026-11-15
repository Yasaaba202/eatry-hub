import { Suspense } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { AdminDashboard } from "./admin-dashboard";
import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
} from "@/lib/admin-auth";

export default function AdminPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <AdminAccess />
    </Suspense>
  );
}

async function AdminAccess() {
  await connection();
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!(await verifyAdminSessionToken(sessionToken))) {
    redirect("/admin/login");
  }

  return <AdminDashboard />;
}

function AdminLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fffaf4] px-4 text-slate-700">
      Checking administrator access...
    </main>
  );
}
