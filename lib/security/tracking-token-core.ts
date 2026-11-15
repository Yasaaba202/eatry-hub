import { createHmac, timingSafeEqual } from "node:crypto";

export const ORDER_TRACKING_TOKEN_VERSION = "v1";
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 180;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export type TrackingTokenClaims = {
  orderId: string;
  expiresAt: number;
};

function base64UrlDecode(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const buffer = Buffer.from(value, "base64url");
  return buffer.toString("base64url") === value ? buffer : null;
}

function safeEqual(left: Buffer, right: Buffer) {
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createTrackingToken(
  orderId: string,
  secret: string,
  ttlSeconds = DEFAULT_TTL_SECONDS,
  now = Date.now(),
): string | null {
  if (!secret || secret.length < 32) return null;
  const expiresAt = Math.floor(now / 1000) + ttlSeconds;
  const payload = Buffer.from(
    JSON.stringify({ v: ORDER_TRACKING_TOKEN_VERSION, orderId, expiresAt }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyTrackingToken(
  token: string | null | undefined,
  secret: string,
  now = Date.now(),
): TrackingTokenClaims | null {
  if (!token || !secret || secret.length < 32 || !TOKEN_PATTERN.test(token)) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const providedSignature = base64UrlDecode(signature);
  if (!providedSignature) return null;
  const expectedSignature = createHmac("sha256", secret).update(payload).digest();
  if (!safeEqual(providedSignature, expectedSignature)) return null;

  const decodedPayload = base64UrlDecode(payload);
  if (!decodedPayload) return null;

  try {
    const claims: unknown = JSON.parse(decodedPayload.toString("utf8"));
    if (typeof claims !== "object" || claims === null) return null;
    const value = claims as Record<string, unknown>;
    if (
      value.v !== ORDER_TRACKING_TOKEN_VERSION ||
      typeof value.orderId !== "string" ||
      value.orderId.length < 1 ||
      typeof value.expiresAt !== "number" ||
      !Number.isInteger(value.expiresAt) ||
      value.expiresAt <= Math.floor(now / 1000)
    ) {
      return null;
    }
    return { orderId: value.orderId, expiresAt: value.expiresAt };
  } catch {
    return null;
  }
}

export function isLegacyTrackingAllowed(
  orderCreatedAt: Date,
  cutoff: Date | null,
  now = Date.now(),
): boolean {
  if (orderCreatedAt.getTime() > now) return false;
  if (!cutoff) return true;
  return orderCreatedAt.getTime() < cutoff.getTime();
}