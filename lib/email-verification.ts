import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getBaseUrl } from "@/lib/email/base-url";
import { notify } from "@/lib/notify";

const VERIFICATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verificationLink(token: string): string {
  return `${getBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
}

export async function createEmailVerificationToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);
  await prisma.emailVerificationToken.upsert({
    where: { userId },
    create: { userId, tokenHash: hashToken(token), expiresAt },
    update: { tokenHash: hashToken(token), expiresAt, usedAt: null },
  });
  return token;
}

export async function consumeEmailVerificationToken(
  token: string,
): Promise<{ ok: true; userId: string; email: string } | { ok: false; error: string }> {
  const record = await prisma.emailVerificationToken.findFirst({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });
  if (!record || record.usedAt || record.expiresAt <= new Date()) {
    return { ok: false, error: "This verification link is invalid or has expired." };
  }

  const claimed = await prisma.emailVerificationToken.updateMany({
    where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1) {
    return { ok: false, error: "This verification link was already used." };
  }

  const user = await prisma.user.update({
    where: { id: record.userId },
    data: { emailVerifiedAt: new Date() },
    select: { email: true },
  });
  return { ok: true, userId: record.userId, email: user.email };
}

export type EmailVerificationResult =
  | { ok: true; email: string; dashboard: string }
  | { ok: false; error: string };

export async function verifyEmailToken(token: string): Promise<EmailVerificationResult> {
  const result = await consumeEmailVerificationToken(token);
  if (!result.ok) return result;

  const user = await prisma.user.findUnique({
    where: { id: result.userId },
    select: { role: true },
  });
  const audience = user?.role === UserRole.VENDOR ? "VENDOR" : "CUSTOMER";
  const dashboard = audience === "VENDOR" ? "/vendor-dashboard" : "/customer-dashboard";

  try {
    await notify({
      audience,
      userId: result.userId,
      category: "ACCOUNT",
      event: "customer.email_verified",
      title: "Email confirmed",
      body: "Your email address is confirmed.",
      href: dashboard,
      email: {
        event: "customer.email_verified",
        to: result.email,
        toUserId: result.userId,
        context: {},
        idempotencyParts: [result.userId],
      },
    });
  } catch (error) {
    console.error("Email confirmation notification could not be queued.", error instanceof Error ? error.name : "Unknown error");
  }

  return { ok: true, email: result.email, dashboard };
}