import assert from "node:assert/strict";
import test from "node:test";
import { areCsrfTokensEqual, createCsrfToken, isCsrfTokenUsable } from "../csrf-core.ts";

test("generated CSRF tokens are long and url-safe", () => {
  const token = createCsrfToken();
  assert.ok(token.length >= 32);
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.notEqual(token, createCsrfToken());
});

test("only matching tokens are accepted", () => {
  const token = createCsrfToken();
  assert.equal(areCsrfTokensEqual(token, token), true);
  assert.equal(areCsrfTokensEqual(token, createCsrfToken()), false);
  assert.equal(areCsrfTokensEqual(token, token.slice(0, -1)), false);
  assert.equal(areCsrfTokensEqual("", ""), false);
});

test("missing or short tokens are unusable", () => {
  assert.equal(isCsrfTokenUsable(undefined), false);
  assert.equal(isCsrfTokenUsable(null), false);
  assert.equal(isCsrfTokenUsable("too-short"), false);
  assert.equal(isCsrfTokenUsable(createCsrfToken()), true);
});