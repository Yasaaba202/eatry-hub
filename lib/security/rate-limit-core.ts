import { createHash } from "node:crypto";

export type RateLimitPolicy = {
  limit: number;
  windowSeconds: number;
};

export const RATE_LIMIT_POLICIES = {
  login: { limit: 5, windowSeconds: 15 * 60 },
  checkout: { limit: 10, windowSeconds: 10 * 60 },
  wallet: { limit: 5, windowSeconds: 10 * 60 },
  vendorPayment: { limit: 5, windowSeconds: 10 * 60 },
  tracking: { limit: 30, windowSeconds: 60 },
  adminReset: { limit: 3, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitScope = keyof typeof RATE_LIMIT_POLICIES;

export type RateLimitDecision = {
  ok: boolean;
  retryAfterSeconds: number;
};

const MIN_KEY_LENGTH = 1;
const MAX_KEY_LENGTH = 256;

export function normalizeRateLimitKey(value: string): string {
  return value.trim().toLowerCase().slice(0, MAX_KEY_LENGTH);
}

export function hashRateLimitKey(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

export function isValidRateLimitKey(value: string): boolean {
  return value.length >= MIN_KEY_LENGTH && value.length <= MAX_KEY_LENGTH;
}

export function getWindowStart(now: number, windowSeconds: number): Date {
  const windowMs = windowSeconds * 1000;
  return new Date(Math.floor(now / windowMs) * windowMs);
}

export function getWindowEnd(now: number, windowSeconds: number): Date {
  const windowMs = windowSeconds * 1000;
  return new Date((Math.floor(now / windowMs) + 1) * windowMs);
}

export function evaluateRateLimit(
  count: number,
  limit: number,
  now: number,
  windowSeconds: number,
): RateLimitDecision {
  if (count <= limit) {
    return { ok: true, retryAfterSeconds: 0 };
  }
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((getWindowEnd(now, windowSeconds).getTime() - now) / 1000),
  );
  return { ok: false, retryAfterSeconds };
}

export function parseClientAddress(forwardedFor: string | null, realIp: string | null): string {
  const candidate = forwardedFor?.split(",")[0]?.trim() || realIp?.trim() || "";
  if (!candidate) return "unknown";
  const withoutPort = candidate.startsWith("[")
    ? candidate.slice(1, candidate.indexOf("]") === -1 ? undefined : candidate.indexOf("]"))
    : candidate.replace(/:\d+$/, "");
  return withoutPort || candidate;
}

export function getClientKeyFromHeaders(headers: Headers): string {
  const address = parseClientAddress(
    headers.get("x-forwarded-for"),
    headers.get("x-real-ip"),
  );
  return hashRateLimitKey(`ip:${address}`);
}

export function getRateLimitRetryAfterHeader(retryAfterSeconds: number): string {
  return String(Math.max(1, Math.ceil(retryAfterSeconds)));
}