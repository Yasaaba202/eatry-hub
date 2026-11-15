import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { after } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { ACCOUNT_SESSION_COOKIE, hashPassword } from "@/lib/account-auth";
import { ADMIN_SESSION_COOKIE, getAdminSessionConfig } from "@/lib/admin-auth";
import { isSameOrigin, readJsonBody } from "@/lib/api-security";
import { isGmailConfigured, sendPasswordResetCode } from "@/lib/gmail";
import { notify } from "@/lib/notify";
import { prisma } from "@/lib/prisma";

const roles = ["CUSTOMER", "VENDOR", "ADMIN"] as const;
const requestSchema = z.object({
  action: z.literal("request"),
  role: z.enum(roles),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
});

const resetSchema = z.object({
  action: z.literal("reset"),
  role: z.enum(roles),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  code: z.string().regex(/^\d{6}$/),
  password: z.string().min(8).max(1024),
});

const genericMessage = "If that email belongs to an account of the selected type, a reset code will be sent shortly.";
const resetLifetimeMs = 10 * 60 * 1000;
const resendCooldownMs = 60 * 1000;
const maxAttempts = 5;

function resetCodeHash(subject: string, code: string) {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("Password recovery signing secret is missing.");
  return createHmac("sha256", secret).update(`${subject}:${code}`).digest();
}

function matchesCode(subject: string, code: string, savedHash: string) {
  try {
    const expected = Buffer.from(savedHash, "hex");
    const actual = resetCodeHash(subject, code);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function isCoolingDown(record: { createdAt: Date; usedAt: Date | null } | null, now: Date) {
  return Boolean(record && !record.usedAt && now.getTime() - record.createdAt.getTime() < resendCooldownMs);
}

async function requestCode(role: typeof roles[number], email: string) {
  if (!isGmailConfigured()) return Response.json({ error: "Password recovery email is not configured on this server." }, { status: 503 });
  if (!process.env.AUTH_SESSION_SECRET || process.env.AUTH_SESSION_SECRET.length < 32) {
    return Response.json({ error: "Password recovery is not configured on this server." }, { status: 503 });
  }

  const now = new Date();
  let subject: string;
  if (role === "ADMIN") {
    const admin = getAdminSessionConfig();
    if (!admin || admin.email !== email) return Response.json({ message: genericMessage }, { status: 202 });
    subject = `admin:${email}`;
    const previous = await prisma.adminPasswordResetCode.findUnique({ where: { email }, select: { createdAt: true, usedAt: true } });
    if (isCoolingDown(previous, now)) return Response.json({ message: genericMessage }, { status: 202 });
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const codeHash = resetCodeHash(subject, code).toString("hex");
    await prisma.adminPasswordResetCode.upsert({
      where: { email },
      create: { email, codeHash, expiresAt: new Date(now.getTime() + resetLifetimeMs) },
      update: { codeHash, expiresAt: new Date(now.getTime() + resetLifetimeMs), attempts: 0, usedAt: null, createdAt: now },
    });
    try {
      await sendPasswordResetCode(email, code, "admin");
    } catch (error) {
      await prisma.adminPasswordResetCode.updateMany({ where: { email, codeHash, usedAt: null }, data: { usedAt: new Date() } });
      console.error("Admin password reset email could not be sent.", error instanceof Error ? error.name : "Unknown error");
      return Response.json({ error: "The reset email could not be sent. Check the Gmail settings and try again." }, { status: 503 });
    }
    return Response.json({ message: genericMessage }, { status: 202 });
  }

  const userRole = role as Extract<UserRole, "CUSTOMER" | "VENDOR">;
  const user = await prisma.user.findFirst({
    where: { email, role: userRole },
    select: { id: true, email: true, passwordResetCode: { select: { createdAt: true, usedAt: true } } },
  });
  if (!user) return Response.json({ message: genericMessage }, { status: 202 });
  if (isCoolingDown(user.passwordResetCode, now)) return Response.json({ message: genericMessage }, { status: 202 });

  subject = user.id;
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const codeHash = resetCodeHash(subject, code).toString("hex");
  await prisma.accountPasswordResetCode.upsert({
    where: { userId: user.id },
    create: { userId: user.id, codeHash, expiresAt: new Date(now.getTime() + resetLifetimeMs) },
    update: { codeHash, expiresAt: new Date(now.getTime() + resetLifetimeMs), attempts: 0, usedAt: null, createdAt: now },
  });
  try {
    await sendPasswordResetCode(user.email, code, role.toLowerCase() as "customer" | "vendor");
  } catch (error) {
    await prisma.accountPasswordResetCode.updateMany({ where: { userId: user.id, codeHash, usedAt: null }, data: { usedAt: new Date() } });
    console.error("Account password reset email could not be sent.", error instanceof Error ? error.name : "Unknown error");
    return Response.json({ error: "The reset email could not be sent. Check the Gmail settings and try again." }, { status: 503 });
  }
  return Response.json({ message: genericMessage }, { status: 202 });
}

async function resetAdminPassword(email: string, code: string, password: string) {
  const admin = getAdminSessionConfig();
  if (!admin || admin.email !== email) return false;
  const reset = await prisma.adminPasswordResetCode.findUnique({ where: { email } });
  const now = new Date();
  const subject = `admin:${email}`;
  if (!reset || reset.usedAt || reset.expiresAt <= now || reset.attempts >= maxAttempts) return false;
  if (!matchesCode(subject, code, reset.codeHash)) {
    await prisma.adminPasswordResetCode.updateMany({ where: { email, usedAt: null, expiresAt: { gt: now }, attempts: { lt: maxAttempts } }, data: { attempts: { increment: 1 } } });
    return false;
  }

  const passwordHash = await hashPassword(password);
  return prisma.$transaction(async (transaction) => {
    const claimed = await transaction.adminPasswordResetCode.updateMany({
      where: { email, usedAt: null, expiresAt: { gt: now }, attempts: { lt: maxAttempts } },
      data: { usedAt: now },
    });
    if (!claimed.count) return false;
    await transaction.adminCredential.upsert({
      where: { id: "primary" },
      create: { id: "primary", passwordHash, sessionVersion: 1, updatedAt: now },
      update: { passwordHash, sessionVersion: { increment: 1 } },
    });
    return true;
  });
}

async function resetAccountPassword(role: typeof roles[number], email: string, code: string, password: string) {
  const userRole = role as Extract<UserRole, "CUSTOMER" | "VENDOR">;
  const user = await prisma.user.findFirst({
    where: { email, role: userRole },
    select: { id: true, passwordResetCode: true },
  });
  const reset = user?.passwordResetCode;
  const now = new Date();
  if (!user || !reset || reset.usedAt || reset.expiresAt <= now || reset.attempts >= maxAttempts) return false;
  if (!matchesCode(user.id, code, reset.codeHash)) {
    await prisma.accountPasswordResetCode.updateMany({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: now }, attempts: { lt: maxAttempts } },
      data: { attempts: { increment: 1 } },
    });
    return false;
  }

  const passwordHash = await hashPassword(password);
  return prisma.$transaction(async (transaction) => {
    const claimed = await transaction.accountPasswordResetCode.updateMany({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: now }, attempts: { lt: maxAttempts } },
      data: { usedAt: now },
    });
    if (!claimed.count) return false;
    await transaction.user.update({ where: { id: user.id }, data: { passwordHash, sessionVersion: { increment: 1 } } });
    return true;
  });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });

  let input: unknown;
  try {
    input = await readJsonBody(request, 4096);
  } catch (error) {
    return Response.json({ error: error instanceof RangeError ? error.message : "Invalid request." }, { status: error instanceof RangeError ? 413 : 400 });
  }

  const requestData = requestSchema.safeParse(input);
  const resetData = resetSchema.safeParse(input);
  if (!requestData.success && !resetData.success) {
    return Response.json({ error: "Enter a valid account type, email, six-digit code, and password of at least 8 characters." }, { status: 400 });
  }

  try {
    if (requestData.success) return await requestCode(requestData.data.role, requestData.data.email);

    if (!resetData.success) return Response.json({ error: "Enter a valid reset request." }, { status: 400 });
    const { role, email, code, password } = resetData.data;
    const changed = role === "ADMIN"
      ? await resetAdminPassword(email, code, password)
      : await resetAccountPassword(role, email, code, password);
    if (!changed) return Response.json({ error: "That code is invalid or expired. Request a new code and try again." }, { status: 400 });

    const account = role === "ADMIN" ? null : await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
    if (account) {
      after(async () => {
        try {
          await notify({
            audience: role === "VENDOR" ? "VENDOR" : "CUSTOMER",
            userId: account.id,
            category: "ACCOUNT",
            event: `${role.toLowerCase()}.password_changed`,
            title: "Your password was changed",
            body: "Your password was changed using a recovery code. If this was not you, change it again and contact support.",
            href: role === "VENDOR" ? "/vendor-dashboard" : "/customer-dashboard",
            email: {
              event: role === "VENDOR" ? "vendor.password_changed" : "customer.password_changed",
              to: account.email,
              toUserId: account.id,
              context: { recipientName: role.toLowerCase() === "vendor" ? "Vendor" : "Customer" },
              idempotencyParts: [account.id],
            },
          });
        } catch (error) {
          console.error("Password change notification could not be queued.", error instanceof Error ? error.name : "Unknown error");
        }
      });
    }

    const cookieStore = await cookies();
    cookieStore.delete(role === "ADMIN" ? ADMIN_SESSION_COOKIE : ACCOUNT_SESSION_COOKIE);
    return Response.json({ message: "Your password has been changed. You can now sign in." });
  } catch (error) {
    console.error("Password reset request failed.", error instanceof Error ? error.name : "Unknown error");
    return Response.json({ error: "Could not process the password reset right now." }, { status: 503 });
  }
}
