import { cookies } from "next/headers";
import { after } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  createAdminSessionToken,
  getAdminAuthConfig,
  verifyAdminCredentials,
} from "@/lib/admin-auth";
import { isSameOrigin } from "@/lib/api-security";
import { ensureCsrfToken } from "@/lib/csrf";
import { notifyAdmins } from "@/lib/notify";
import {
  checkRateLimit,
  clearRateLimit,
  getClientKeyFromHeaders,
  hitRateLimit,
  rateLimitKey,
  rateLimitResponse,
} from "@/lib/rate-limit";

type LoginBody = {
  email: string;
  password: string;
};

function isLoginBody(value: unknown): value is LoginBody {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  return (
    typeof body.email === "string" &&
    body.email.length <= 254 &&
    typeof body.password === "string" &&
    body.password.length > 0 &&
    body.password.length <= 1024
  );
}

export async function GET() {
  try {
    await ensureCsrfToken();
    return Response.json(
      { configured: await getAdminAuthConfig() !== null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Admin sign-in configuration could not be loaded.", error instanceof Error ? error.name : "Unknown error");
    return Response.json({ error: "Could not check admin sign-in configuration." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  let config: Awaited<ReturnType<typeof getAdminAuthConfig>>;
  try {
    config = await getAdminAuthConfig();
  } catch (error) {
    console.error("Admin sign-in configuration could not be loaded.", error instanceof Error ? error.name : "Unknown error");
    return Response.json({ error: "Could not check admin sign-in configuration." }, { status: 503 });
  }
  if (!config) {
    return Response.json(
      { error: "Admin access is not configured on this server." },
      { status: 503 },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 4096) {
    return Response.json({ error: "Request is too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > 4096) {
      return Response.json({ error: "Request is too large." }, { status: 413 });
    }
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!isLoginBody(body)) {
    return Response.json({ error: "Enter a valid email and password." }, { status: 400 });
  }

  const clientKey = getClientKeyFromHeaders(request.headers);
  const accountLimitKey = rateLimitKey("login", body.email, clientKey);
  const [ipLimit, accountLimit] = await Promise.all([
    checkRateLimit("login", rateLimitKey("login", clientKey)),
    checkRateLimit("login", accountLimitKey),
  ]);
  if (!ipLimit.ok || !accountLimit.ok) {
    return rateLimitResponse(
      Math.max(ipLimit.retryAfterSeconds, accountLimit.retryAfterSeconds),
      "Too many admin sign-in attempts. Please wait a few minutes and try again.",
    );
  }

  let result: Awaited<ReturnType<typeof verifyAdminCredentials>>;
  try {
    result = await verifyAdminCredentials(body.email, body.password);
  } catch (error) {
    console.error("Admin credentials could not be verified.", error instanceof Error ? error.name : "Unknown error");
    return Response.json({ error: "Could not verify admin credentials." }, { status: 503 });
  }
  if (!result.configured) {
    return Response.json(
      { error: "Admin access is not configured on this server." },
      { status: 503 },
    );
  }
  if (!result.valid) {
    await Promise.all([
      hitRateLimit("login", rateLimitKey("login", clientKey)),
      hitRateLimit("login", accountLimitKey),
    ]);
    return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
  }

  await Promise.all([
    clearRateLimit("login", rateLimitKey("login", clientKey)),
    clearRateLimit("login", accountLimitKey),
  ]);

  const token = createAdminSessionToken(config.email, config.sessionSecret, result.sessionVersion);
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    maxAge: 0,
  });
  cookieStore.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  });

  after(async () => {
    await notifyAdmins({
      event: "admin.signed_in",
      emailEvent: "admin.signed_in",
      category: "SECURITY",
      title: "Administrator signed in",
      body: `${config.email} created an administrator session.`,
      href: "/admin",
      context: { recipientName: config.email },
      idempotencyParts: [config.email, Date.now()],
      toggle: "adminSystemAlerts",
    });
  });

  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  cookieStore.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    maxAge: 0,
  });
  return Response.json({ ok: true });
}
