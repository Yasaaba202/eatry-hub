import { randomBytes, timingSafeEqual } from "node:crypto";
import { CSRF_TOKEN_MIN_LENGTH } from "./csrf-shared.ts";

export function createCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export function areCsrfTokensEqual(left: string, right: string): boolean {
  if (left.length < CSRF_TOKEN_MIN_LENGTH || right.length < CSRF_TOKEN_MIN_LENGTH) return false;
  if (left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

export function isCsrfTokenUsable(value: string | undefined | null): value is string {
  return typeof value === "string" && value.length >= CSRF_TOKEN_MIN_LENGTH;
}