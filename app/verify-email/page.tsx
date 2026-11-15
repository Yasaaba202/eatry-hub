import Image from "next/image";
import Link from "next/link";
import { verifyEmailToken } from "@/lib/email-verification";

export const instant = false;

type PageProps = {
  searchParams: Promise<{ token?: string | string[] }>;
};

export default async function VerifyEmailPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token.trim() : "";

  let content: React.ReactNode;

  if (!token) {
    content = (
      <StatusCard
        ok={false}
        title="This link is incomplete"
        message="The verification link is missing its token. Open the newest email we sent you and click the confirmation button."
      />
    );
  } else {
    let result: Awaited<ReturnType<typeof verifyEmailToken>> | null = null;
    try {
      result = await verifyEmailToken(token);
    } catch (error) {
      console.error("Email verification page failed.", error instanceof Error ? error.name : "Unknown error");
    }

    if (!result) {
      content = (
        <StatusCard
          ok={false}
          title="Verification is unavailable"
          message="We could not verify this link right now. Please try again in a few minutes."
        />
      );
    } else if (!result.ok) {
      content = (
        <StatusCard
          ok={false}
          title="We could not confirm this email"
          message={result.error}
        />
      );
    } else {
      content = (
        <StatusCard
          ok
          title="Your email is confirmed"
          message={`We sent a confirmation notice to ${result.email}. You can sign in and keep ordering.`}
          action={{ href: result.dashboard, label: "Continue" }}
        />
      );
    }
  }

  return content;
}

function StatusCard({
  ok,
  title,
  message,
  action,
}: {
  ok: boolean;
  title: string;
  message: string;
  action?: { href: string; label: string };
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fffaf4] px-4 py-12">
      <div className="w-full max-w-md rounded-[28px] border border-orange-100 bg-white p-8 text-center shadow-[0_24px_60px_rgba(124,45,18,0.10)]">
        <div className="flex justify-center">
          <Image src="/brand/logo-mark.svg" alt="Eatry Hub" width={52} height={52} priority />
        </div>
        <span
          className={`mt-5 inline-block rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-white ${
            ok ? "bg-emerald-600" : "bg-red-600"
          }`}
        >
          Eatry Hub
        </span>
        <h1 className="mt-4 text-2xl font-black tracking-tight text-slate-950">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
        {action ? (
          <Link
            href={action.href}
            className="mt-6 inline-flex items-center justify-center rounded-full bg-orange-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-orange-200 transition hover:bg-orange-600"
          >
            {action.label}
          </Link>
        ) : (
          <Link
            href="/login"
            className="mt-6 inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Go to sign in
          </Link>
        )}
      </div>
    </main>
  );
}