import { createHash } from "node:crypto";

export const IDEMPOTENCY_HEADER = "idempotency-key";
export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const MIN_KEY_LENGTH = 8;
const MAX_KEY_LENGTH = 200;
const KEY_PATTERN = /^[A-Za-z0-9._:-]+$/;

export function normalizeIdempotencyKey(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !KEY_PATTERN.test(trimmed)) return null;
  if (trimmed.length < MIN_KEY_LENGTH || trimmed.length > MAX_KEY_LENGTH) return null;
  return trimmed;
}

export function isIdempotencyKeyValid(value: string): boolean {
  return normalizeIdempotencyKey(value) !== null;
}

export function hashIdempotencyPayload(payload: unknown): string {
  const serialized = JSON.stringify(payload ?? null);
  return createHash("sha256").update(serialized).digest("base64url");
}

export function getIdempotencyExpiry(now = Date.now()): Date {
  return new Date(now + IDEMPOTENCY_TTL_SECONDS * 1000);
}