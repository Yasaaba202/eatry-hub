import { verifyEmailToken } from "@/lib/email-verification";

function page(title: string, message: string, ok: boolean) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Eatry Hub</title></head>
<body style="margin:0;background:#fff7ed;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <main style="max-width:520px;margin:48px auto;background:#fff;border:1px solid #fed7aa;border-radius:20px;padding:32px;text-align:center;">
    <span style="display:inline-block;background:${ok ? "#16a34a" : "#dc2626"};color:#fff;font-weight:800;font-size:12px;letter-spacing:1px;padding:6px 12px;border-radius:999px;">EATRY HUB</span>
    <h1 style="margin:18px 0 8px;font-size:22px;color:#0f172a;">${title}</h1>
    <p style="margin:0;color:#475569;font-size:14px;line-height:22px;">${message}</p>
  </main>
</body></html>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  if (!token) return page("Verification failed", "This verification link is missing its token.", false);

  try {
    const result = await verifyEmailToken(token);
    if (!result.ok) return page("Verification failed", result.error, false);
    return page(
      "Email confirmed",
      "Your email address is confirmed. You can close this page and keep ordering.",
      true,
    );
  } catch (error) {
    console.error("Email verification failed.", error instanceof Error ? error.name : "Unknown error");
    return page("Verification failed", "We could not verify this link right now. Please try again later.", false);
  }
}