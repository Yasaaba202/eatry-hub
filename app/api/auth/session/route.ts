import { cookies } from "next/headers";
import { after } from "next/server";
import { Prisma, UserRole, UserStatus } from "@prisma/client";
import { z } from "zod";
import {
  ACCOUNT_SESSION_COOKIE,
  setAccountSessionCookie,
  verifyAccountSessionToken,
  verifyPassword,
} from "@/lib/account-auth";
import { isSameOrigin, readJsonBody } from "@/lib/api-security";
import { notify } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import {
  checkRateLimit,
  clearRateLimit,
  getClientKeyFromHeaders,
  hitRateLimit,
  rateLimitKey,
  rateLimitResponse,
} from "@/lib/rate-limit";

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(1024),
  role: z.enum(["CUSTOMER", "VENDOR"]),
  rememberMe: z.boolean().optional().default(false),
});
const DUMMY_PASSWORD_HASH =
  `$scrypt$${Buffer.alloc(16).toString("base64url")}$${Buffer.alloc(64).toString("base64url")}`;

function databaseUnavailable(error: unknown) {
  console.error("Account sign-in database request failed.", error);
  return Response.json(
    { error: "Account services are temporarily unavailable. Please try again later." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  let input: unknown;
  try {
    input = await readJsonBody(request);
  } catch (error) {
    return Response.json(
      { error: error instanceof RangeError ? error.message : "Invalid request." },
      { status: error instanceof RangeError ? 413 : 400 },
    );
  }

  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: "Enter a valid email and password." }, { status: 400 });
  }

  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    return Response.json(
      {
        error: "Account sign-in is not configured on this server.",
        code: secret ? "AUTH_SESSION_SECRET_TOO_SHORT" : "MISSING_ENV:AUTH_SESSION_SECRET",
      },
      { status: 503 },
    );
  }

  const clientKey = getClientKeyFromHeaders(request.headers);
  const accountLimitKey = rateLimitKey("login", parsed.data.email, clientKey);
  const [ipLimit, accountLimit] = await Promise.all([
    checkRateLimit("login", rateLimitKey("login", clientKey)),
    checkRateLimit("login", accountLimitKey),
  ]);
  if (!ipLimit.ok || !accountLimit.ok) {
    return rateLimitResponse(
      Math.max(ipLimit.retryAfterSeconds, accountLimit.retryAfterSeconds),
      "Too many sign-in attempts. Please wait a few minutes and try again.",
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email.toLowerCase() },
      select: { id: true, email: true, fullName: true, role: true, status: true, passwordHash: true, sessionVersion: true },
    });

    const passwordMatches = await verifyPassword(
      parsed.data.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    const permittedRole =
      user?.role === UserRole.CUSTOMER || user?.role === UserRole.VENDOR;
    const valid = Boolean(
      user &&
      permittedRole &&
      user.role === parsed.data.role &&
      user.status === UserStatus.ACTIVE &&
      passwordMatches,
    );

    if (!user || !permittedRole || !valid) {
      await Promise.all([
        hitRateLimit("login", rateLimitKey("login", clientKey)),
        hitRateLimit("login", accountLimitKey),
      ]);
      return Response.json(
        { error: "Email or password is incorrect." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    await Promise.all([
      clearRateLimit("login", rateLimitKey("login", clientKey)),
      clearRateLimit("login", accountLimitKey),
    ]);
    await setAccountSessionCookie(user.id, user.role, parsed.data.rememberMe, user.sessionVersion);
    after(async () => {
      try {
        const audience = user.role === UserRole.VENDOR ? "VENDOR" : "CUSTOMER";
        const event = audience === "VENDOR" ? "vendor.signed_in" : "customer.signed_in";
        await notify({
          audience,
          userId: user.id,
          category: "SECURITY",
          event,
          title: "New sign-in to your account",
          body: "Your account was just used to sign in.",
          href: audience === "VENDOR" ? "/vendor-dashboard" : "/customer-dashboard",
          email: {
            event,
            to: user.email,
            toUserId: user.id,
            context: { recipientName: user.fullName },
            idempotencyParts: [user.id, Date.now()],
          },
        });
      } catch (error) {
        console.error("Sign-in notification could not be queued.", error instanceof Error ? error.name : "Unknown error");
      }
    });
    return Response.json({ ok: true, role: user.role });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError ||
        error instanceof Prisma.PrismaClientInitializationError) {
      return databaseUnavailable(error);
    }
    console.error("Account sign-in failed unexpectedly.", error);
    return Response.json({ error: "Could not sign in. Please try again later." }, { status: 500 });
  }
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const session = verifyAccountSessionToken(
      cookieStore.get(ACCOUNT_SESSION_COOKIE)?.value,
    );
    if (!session) {
      return Response.json({ user: null }, { headers: { "Cache-Control": "no-store" } });
    }
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        status: true,
        sessionVersion: true,
        vendorProfile: { select: { status: true, businessName: true } },
      },
    });
    if (
      !user ||
      user.role !== session.role ||
      user.sessionVersion !== session.sessionVersion ||
      user.status !== UserStatus.ACTIVE
    ) {
      return Response.json({ user: null }, { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json(
      {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          phone: user.phone,
          role: user.role,
          vendorProfile: user.vendorProfile,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError ||
        error instanceof Prisma.PrismaClientInitializationError) {
      return databaseUnavailable(error);
    }
    console.error("Could not read the current account.", error);
    return Response.json({ error: "Could not verify the current account." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const cookieStore = await cookies();
  cookieStore.set(ACCOUNT_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return Response.json({ ok: true });
}
