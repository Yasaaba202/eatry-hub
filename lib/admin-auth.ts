import "server-only";

import {
  createHmac,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { prisma } from "@/lib/prisma";

const scrypt = promisify(scryptCallback);
const SESSION_TTL_SECONDS = 60 * 60 * 8;
export const ADMIN_SESSION_COOKIE = "eatry_admin_session";

type AdminSession = {
  email: string;
  role: "admin";
  sessionVersion: number;
  expiresAt: number;
};

type AdminAuthConfig = {
  email: string;
  sessionSecret: string;
  passwordSalt: Buffer;
  passwordHash: Buffer;
  sessionVersion: number;
};

type AdminSessionConfig = {
  email: string;
  sessionSecret: string;
};

function decodeBase64Url(value: string): Buffer | null {
  if (!/^[\w-]+$/.test(value)) return null;
  const buffer = Buffer.from(value, "base64url");
  return buffer.toString("base64url") === value ? buffer : null;
}

function safeEqual(left: Buffer, right: Buffer) {
  return left.length === right.length && timingSafeEqual(left, right);
}

export function getAdminSessionConfig(): AdminSessionConfig | null {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const sessionSecret = process.env.ADMIN_SESSION_SECRET;

  if (!email || !sessionSecret || sessionSecret.length < 32) {
    return null;
  }

  return { email, sessionSecret };
}

export async function getAdminAuthConfig(): Promise<AdminAuthConfig | null> {
  const sessionConfig = getAdminSessionConfig();
  if (!sessionConfig) return null;

  const credential = await prisma.adminCredential.findUnique({ where: { id: "primary" }, select: { passwordHash: true, sessionVersion: true } });
  const passwordHash = credential?.passwordHash ?? process.env.ADMIN_PASSWORD_HASH;
  if (!passwordHash) return null;

  const parsedHash = /^\$scrypt\$([\w-]+)\$([\w-]+)$/.exec(passwordHash);
  if (!parsedHash) return null;
  const passwordSalt = decodeBase64Url(parsedHash[1]);
  const passwordDigest = decodeBase64Url(parsedHash[2]);
  if (!passwordSalt || passwordSalt.length < 16 || !passwordDigest || passwordDigest.length !== 64) {
    return null;
  }

  return {
    ...sessionConfig,
    passwordSalt,
    passwordHash: passwordDigest,
    sessionVersion: credential?.sessionVersion ?? 0,
  };
}

export async function verifyAdminCredentials(email: string, password: string) {
  const config = await getAdminAuthConfig();
  if (!config) return { configured: false as const, valid: false as const };

  const suppliedEmail = Buffer.from(email.trim().toLowerCase());
  const expectedEmail = Buffer.from(config.email);
  const emailMatches = safeEqual(suppliedEmail, expectedEmail);

  const suppliedHash = (await scrypt(password, config.passwordSalt, 64)) as Buffer;
  const passwordMatches = safeEqual(suppliedHash, config.passwordHash);

  return {
    configured: true as const,
    valid: emailMatches && passwordMatches,
    sessionVersion: config.sessionVersion,
  };
}

export function createAdminSessionToken(email: string, sessionSecret: string, sessionVersion = 0) {
  const session: AdminSession = {
    email,
    role: "admin",
    sessionVersion,
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export async function verifyAdminSessionToken(token: string | undefined) {
  const config = getAdminSessionConfig();
  if (!config || !token) return false;

  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return false;

  const actualSignature = decodeBase64Url(signature);
  if (!actualSignature) return false;
  const expectedSignature = createHmac("sha256", config.sessionSecret).update(payload).digest();
  if (!safeEqual(actualSignature, expectedSignature)) return false;

  const decodedPayload = decodeBase64Url(payload);
  if (!decodedPayload) return false;

  try {
    const session: unknown = JSON.parse(decodedPayload.toString("utf8"));
    if (typeof session !== "object" || session === null) return false;
    const claims = session as Record<string, unknown>;
    const valid = (
      claims.email === config.email &&
      claims.role === "admin" &&
      (claims.sessionVersion === undefined || (typeof claims.sessionVersion === "number" && Number.isInteger(claims.sessionVersion) && claims.sessionVersion >= 0)) &&
      typeof claims.expiresAt === "number" &&
      claims.expiresAt > Math.floor(Date.now() / 1000)
    );
    if (!valid) return false;
    const credential = await prisma.adminCredential.findUnique({ where: { id: "primary" }, select: { sessionVersion: true } });
    return (credential?.sessionVersion ?? 0) === (typeof claims.sessionVersion === "number" ? claims.sessionVersion : 0);
  } catch {
    return false;
  }
}

export const ADMIN_SESSION_TTL_SECONDS = SESSION_TTL_SECONDS;
