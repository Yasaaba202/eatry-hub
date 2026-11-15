import "server-only";

import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  RATE_LIMIT_POLICIES,
  evaluateRateLimit,
  getClientKeyFromHeaders,
  getRateLimitRetryAfterHeader,
  getWindowStart,
  hashRateLimitKey,
  normalizeRateLimitKey,
  type RateLimitDecision,
  type RateLimitScope,
} from "@/lib/security/rate-limit-core";

export { RATE_LIMIT_POLICIES, getClientKeyFromHeaders, getRateLimitRetryAfterHeader };
export type { RateLimitScope };

type BucketRow = { count: number };

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
let lastCleanupAt = 0;
let missingTableWarningShown = false;

function isMissingSecurityTable(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021";
}

function rateLimitUnavailable(scope: RateLimitScope, error: unknown) {
  if (isMissingSecurityTable(error)) {
    if (!missingTableWarningShown) {
      missingTableWarningShown = true;
      console.warn(
        "Rate limiting is running in fail-open mode because the security tables are missing. Apply the P0 security migration to enable enforcement.",
      );
    }
    return;
  }
  console.error(`Rate limit check failed for scope "${scope}".`, error);
}

function failOpenDecision(): RateLimitDecision {
  if (process.env.RATE_LIMIT_STRICT === "1") {
    return { ok: false, retryAfterSeconds: 60 };
  }
  return { ok: true, retryAfterSeconds: 0 };
}

export function rateLimitKey(...parts: string[]): string {
  const normalized = parts.map(normalizeRateLimitKey).filter(Boolean);
  return hashRateLimitKey(normalized.join("|"));
}

export function getRequestClientKey(request: Request): string {
  return getClientKeyFromHeaders(request.headers);
}

async function readBucket(
  scope: RateLimitScope,
  keyHash: string,
  windowStart: Date,
): Promise<BucketRow | null> {
  const rows = await prisma.$queryRaw<BucketRow[]>`
    SELECT "count" FROM "SecurityRateLimit"
    WHERE "scope" = ${scope} AND "keyHash" = ${keyHash} AND "windowStart" = ${windowStart}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function cleanupExpiredBuckets(now: number) {
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;
  if (Math.random() > 0.1) return;
  try {
    const cutoff = new Date(now - 24 * 60 * 60 * 1000);
    await prisma.securityRateLimit.deleteMany({ where: { windowStart: { lt: cutoff } } });
  } catch (error) {
    console.error("Rate limit cleanup failed.", error);
  }
}

export async function checkRateLimit(
  scope: RateLimitScope,
  keyHash: string,
  now = Date.now(),
): Promise<RateLimitDecision> {
  const policy = RATE_LIMIT_POLICIES[scope];
  const windowStart = getWindowStart(now, policy.windowSeconds);
  try {
    await cleanupExpiredBuckets(now);
    const bucket = await readBucket(scope, keyHash, windowStart);
    return evaluateRateLimit(
      (bucket?.count ?? 0) + 1,
      policy.limit,
      now,
      policy.windowSeconds,
    );
  } catch (error) {
    rateLimitUnavailable(scope, error);
    return failOpenDecision();
  }
}

export async function hitRateLimit(
  scope: RateLimitScope,
  keyHash: string,
  now = Date.now(),
): Promise<RateLimitDecision> {
  const policy = RATE_LIMIT_POLICIES[scope];
  const windowStart = getWindowStart(now, policy.windowSeconds);
  const id = randomUUID();
  try {
    await cleanupExpiredBuckets(now);
    const rows = await prisma.$queryRaw<BucketRow[]>`
      INSERT INTO "SecurityRateLimit" ("id", "scope", "keyHash", "windowStart", "count", "createdAt", "updatedAt")
      VALUES (${id}, ${scope}, ${keyHash}, ${windowStart}, 1, NOW(), NOW())
      ON CONFLICT ("scope", "keyHash", "windowStart")
      DO UPDATE SET "count" = "SecurityRateLimit"."count" + 1, "updatedAt" = NOW()
      RETURNING "count"
    `;
    return evaluateRateLimit(rows[0]?.count ?? 1, policy.limit, now, policy.windowSeconds);
  } catch (error) {
    rateLimitUnavailable(scope, error);
    return failOpenDecision();
  }
}

export async function clearRateLimit(scope: RateLimitScope, keyHash: string) {
  try {
    await prisma.securityRateLimit.deleteMany({ where: { scope, keyHash } });
  } catch (error) {
    rateLimitUnavailable(scope, error);
  }
}

export function rateLimitResponse(retryAfterSeconds: number, message = "Too many requests. Please wait and try again.") {
  return Response.json(
    { error: message, retryAfterSeconds },
    {
      status: 429,
      headers: {
        "Retry-After": getRateLimitRetryAfterHeader(retryAfterSeconds),
        "Cache-Control": "no-store",
      },
    },
  );
}