import assert from "node:assert/strict";
import test from "node:test";
import {
  IDEMPOTENCY_HEADER,
  getIdempotencyExpiry,
  hashIdempotencyPayload,
  isIdempotencyKeyValid,
  normalizeIdempotencyKey,
} from "../idempotency-core.ts";

test("idempotency keys are validated and normalized", () => {
  assert.equal(normalizeIdempotencyKey("  abc-def_123:456 "), "abc-def_123:456");
  assert.equal(isIdempotencyKeyValid("abc-def_123:456"), true);
  assert.equal(normalizeIdempotencyKey("short"), null);
  assert.equal(normalizeIdempotencyKey("has spaces"), null);
  assert.equal(normalizeIdempotencyKey("bad/key"), null);
  assert.equal(normalizeIdempotencyKey(null), null);
  assert.equal(IDEMPOTENCY_HEADER, "idempotency-key");
});

test("payload hashes are stable and content sensitive", () => {
  const payload = { items: [{ mealId: "m1", quantity: 2 }], phone: "0244000000" };
  assert.equal(hashIdempotencyPayload(payload), hashIdempotencyPayload(payload));
  assert.notEqual(
    hashIdempotencyPayload(payload),
    hashIdempotencyPayload({ ...payload, phone: "0244000001" }),
  );
});

test("idempotency records expire after the retention window", () => {
  const now = Date.UTC(2026, 10, 15, 12, 0, 0);
  const expiresAt = getIdempotencyExpiry(now);
  assert.equal(expiresAt.getTime() - now, 24 * 60 * 60 * 1000);
});