import "server-only";

import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { UserRole, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const scrypt = promisify(scryptCallback);
export const ACCOUNT_SESSION_COOKIE = "eatry_account_session";
export const ACCOUNT_SESSION_TTL_SECONDS = 60 * 60 * 8;
const REMEMBERED_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

type AccountSession = {
  userId: string;
  role: UserRole;
  sessionVersion: number;
  expiresAt: number;
};

function getSessionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

function safeEqual(left: Buffer, right: Buffer) {
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const digest = (await scrypt(password, salt, 64)) as Buffer;
  return `$scrypt$${salt.toString("base64url")}$${digest.toString("base64url")}`;
}

export async function verifyPassword(password: string, encodedHash: string) {
  const match = /^\$scrypt\$([\w-]+)\$([\w-]+)$/.exec(encodedHash);
  if (!match) return false;

  const salt = Buffer.from(match[1], "base64url");
  const expected = Buffer.from(match[2], "base64url");
  if (salt.length !== 16 || expected.length !== 64) return false;
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return safeEqual(actual, expected);
}

export function createAccountSessionToken(userId: string, role: UserRole, rememberMe: boolean, sessionVersion = 0) {
  const secret = getSessionSecret();
  if (!secret) throw new Error("AUTH_SESSION_SECRET is missing or too short.");

  const expiresAt = Math.floor(Date.now() / 1000) +
    (rememberMe ? REMEMBERED_SESSION_TTL_SECONDS : ACCOUNT_SESSION_TTL_SECONDS);
  const payload = Buffer.from(JSON.stringify({ userId, role, sessionVersion, expiresAt })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return { token: `${payload}.${signature}`, maxAge: expiresAt - Math.floor(Date.now() / 1000) };
}

export function verifyAccountSessionToken(token: string | undefined): AccountSession | null {
  const secret = getSessionSecret();
  if (!secret || !token) return null;

  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;

  const actualSignature = Buffer.from(signature, "base64url");
  if (actualSignature.toString("base64url") !== signature) return null;
  const expectedSignature = createHmac("sha256", secret).update(payload).digest();
  if (!safeEqual(actualSignature, expectedSignature)) return null;

  const decodedPayload = Buffer.from(payload, "base64url");
  if (decodedPayload.toString("base64url") !== payload) return null;

  try {
    const value: unknown = JSON.parse(decodedPayload.toString("utf8"));
    if (typeof value !== "object" || value === null) return null;
    const claims = value as Record<string, unknown>;
    if (
      typeof claims.userId !== "string" ||
      !Object.values(UserRole).includes(claims.role as UserRole) ||
      (claims.sessionVersion !== undefined && (typeof claims.sessionVersion !== "number" || !Number.isInteger(claims.sessionVersion) || claims.sessionVersion < 0)) ||
      typeof claims.expiresAt !== "number" ||
      claims.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return {
      userId: claims.userId,
      role: claims.role as UserRole,
      sessionVersion: typeof claims.sessionVersion === "number" ? claims.sessionVersion : 0,
      expiresAt: claims.expiresAt,
    };
  } catch {
    return null;
  }
}

export async function setAccountSessionCookie(
  userId: string,
  role: UserRole,
  rememberMe = false,
  sessionVersion = 0,
) {
  const { token, maxAge } = createAccountSessionToken(userId, role, rememberMe, sessionVersion);
  const cookieStore = await cookies();
  cookieStore.set(ACCOUNT_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge,
  });
}

export async function getCurrentAccount() {
  const cookieStore = await cookies();
  const session = verifyAccountSessionToken(
    cookieStore.get(ACCOUNT_SESSION_COOKIE)?.value,
  );
  if (!session) return null;

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
      vendorProfile: {
        select: {
          id: true,
          status: true,
          businessName: true,
          businessPhone: true,
          payoutPhone: true,
          payoutNetwork: true,
          payoutPhoneVerifiedAt: true,
          location: true,
          description: true,
          openingTime: true,
          closingTime: true,
          rejectionReason: true,
          category: { select: { name: true } },
          subscriptions: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              status: true,
              plan: { select: { name: true, monthlyPrice: true } },
            },
          },
          applications: {
            orderBy: { submittedAt: "desc" },
            take: 1,
            select: {
              id: true,
              status: true,
              payments: {
                where: { purpose: "VENDOR_SUBSCRIPTION" },
                orderBy: { createdAt: "desc" },
                take: 1,
                select: {
                  status: true,
                  providerReference: true,
                  senderMobileNumber: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (
    !user ||
    user.role !== session.role ||
    user.sessionVersion !== session.sessionVersion ||
    user.status !== UserStatus.ACTIVE
  ) {
    return null;
  }
  return user;
}
