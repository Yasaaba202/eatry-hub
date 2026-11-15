import assert from "node:assert/strict";
import test from "node:test";
import {
  createTrackingToken,
  isLegacyTrackingAllowed,
  verifyTrackingToken,
} from "../tracking-token-core.ts";

const secret = "a".repeat(48);

test("tracking tokens round-trip the order id", () => {
  const token = createTrackingToken("order-123", secret);
  assert.ok(token);
  const claims = verifyTrackingToken(token, secret);
  assert.equal(claims?.orderId, "order-123");
  assert.ok((claims?.expiresAt ?? 0) * 1000 > Date.now());
});

test("tampered tokens are rejected", () => {
  const token = createTrackingToken("order-123", secret);
  assert.ok(token);
  const [payload, signature] = token.split(".");
  const forged = `${payload}.${signature.slice(0, -2)}AA`;
  assert.equal(verifyTrackingToken(forged, secret), null);
  assert.equal(verifyTrackingToken(`${payload}x.${signature}`, secret), null);
  assert.equal(verifyTrackingToken(token, "b".repeat(48)), null);
});

test("expired tokens are rejected", () => {
  const now = Date.UTC(2026, 10, 15, 12, 0, 0);
  const token = createTrackingToken("order-123", secret, 60, now);
  assert.ok(token);
  assert.ok(verifyTrackingToken(token, secret, now + 30_000));
  assert.equal(verifyTrackingToken(token, secret, now + 61_000), null);
});

test("tokens require a strong secret", () => {
  assert.equal(createTrackingToken("order-123", "short"), null);
  const token = createTrackingToken("order-123", secret);
  assert.ok(token);
  assert.equal(verifyTrackingToken(token, "short"), null);
  assert.equal(verifyTrackingToken(undefined, secret), null);
  assert.equal(verifyTrackingToken("not-a-token", secret), null);
});

test("legacy tracking is only allowed for orders placed before the cut-off", () => {
  const now = Date.UTC(2026, 10, 15, 12, 0, 0);
  const older = new Date(now - 10 * 24 * 60 * 60 * 1000);
  const newer = new Date(now - 60 * 1000);
  const cutoff = new Date(now - 24 * 60 * 60 * 1000);

  assert.equal(isLegacyTrackingAllowed(older, cutoff, now), true);
  assert.equal(isLegacyTrackingAllowed(newer, cutoff, now), false);
  assert.equal(isLegacyTrackingAllowed(older, null, now), true);
  assert.equal(isLegacyTrackingAllowed(new Date(now + 60_000), cutoff, now), false);
});