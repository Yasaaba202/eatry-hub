import assert from "node:assert/strict";
import test from "node:test";
import {
  RATE_LIMIT_POLICIES,
  evaluateRateLimit,
  getWindowEnd,
  getWindowStart,
  hashRateLimitKey,
  normalizeRateLimitKey,
  parseClientAddress,
} from "../rate-limit-core.ts";

test("rate limit policies match the approved thresholds", () => {
  assert.deepEqual(RATE_LIMIT_POLICIES.login, { limit: 5, windowSeconds: 900 });
  assert.deepEqual(RATE_LIMIT_POLICIES.checkout, { limit: 10, windowSeconds: 600 });
  assert.deepEqual(RATE_LIMIT_POLICIES.wallet, { limit: 5, windowSeconds: 600 });
  assert.deepEqual(RATE_LIMIT_POLICIES.vendorPayment, { limit: 5, windowSeconds: 600 });
  assert.deepEqual(RATE_LIMIT_POLICIES.tracking, { limit: 30, windowSeconds: 60 });
  assert.deepEqual(RATE_LIMIT_POLICIES.adminReset, { limit: 3, windowSeconds: 3600 });
});

test("normalizeRateLimitKey trims and lowercases identifiers", () => {
  assert.equal(normalizeRateLimitKey("  Customer@Example.COM "), "customer@example.com");
  assert.equal(normalizeRateLimitKey("EH-1234"), "eh-1234");
});

test("hashRateLimitKey is stable and avoids storing raw identifiers", () => {
  const first = hashRateLimitKey("192.168.1.10");
  const second = hashRateLimitKey("192.168.1.10");
  const other = hashRateLimitKey("192.168.1.11");
  assert.equal(first, second);
  assert.notEqual(first, other);
  assert.equal(first.includes("192.168.1.10"), false);
});

test("fixed windows align to the window boundary", () => {
  const now = Date.UTC(2026, 10, 15, 10, 34, 12);
  const start = getWindowStart(now, 600);
  const end = getWindowEnd(now, 600);
  assert.equal(start.getTime(), Date.UTC(2026, 10, 15, 10, 30, 0));
  assert.equal(end.getTime(), Date.UTC(2026, 10, 15, 10, 40, 0));
  assert.equal(end.getTime() - start.getTime(), 600_000);
});

test("evaluateRateLimit allows requests up to the limit and blocks beyond it", () => {
  const now = Date.UTC(2026, 10, 15, 10, 34, 0);
  assert.deepEqual(evaluateRateLimit(5, 5, now, 600), { ok: true, retryAfterSeconds: 0 });
  const blocked = evaluateRateLimit(6, 5, now, 600);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.retryAfterSeconds, 360);
});

test("retry-after never drops below one second", () => {
  const almostOver = Date.UTC(2026, 10, 15, 10, 39, 59) + 999;
  assert.equal(evaluateRateLimit(6, 5, almostOver, 600).retryAfterSeconds, 1);
});

test("client address parsing keeps the first forwarded hop without a port", () => {
  assert.equal(parseClientAddress("203.0.113.9, 10.0.0.1", null), "203.0.113.9");
  assert.equal(parseClientAddress(null, "198.51.100.7"), "198.51.100.7");
  assert.equal(parseClientAddress("198.51.100.7:44321", null), "198.51.100.7");
  assert.equal(parseClientAddress(null, null), "unknown");
});