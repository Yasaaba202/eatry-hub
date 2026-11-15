import "server-only";

import {
  createTrackingToken,
  verifyTrackingToken,
  type TrackingTokenClaims,
} from "@/lib/security/tracking-token-core";

const DEFAULT_LEGACY_CUTOFF_DAYS = 90;

function getTrackingSecret() {
  const secret = process.env.AUTH_SESSION_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

export function issueOrderTrackingToken(orderId: string): string | null {
  const secret = getTrackingSecret();
  if (!secret) return null;
  return createTrackingToken(orderId, secret);
}

export function readOrderTrackingToken(token: string | null | undefined): TrackingTokenClaims | null {
  const secret = getTrackingSecret();
  if (!secret) return null;
  return verifyTrackingToken(token, secret);
}

/**
 * Legacy order-number + phone lookups stay available only for orders placed
 * before the configured cut-off. Set ORDER_TRACKING_LEGACY_UNTIL to an ISO date
 * (for example 2026-11-14T00:00:00.000Z) to lock older orders to token access.
 * When unset, orders placed within the last 90 days may still use legacy lookup
 * so existing customers are not locked out during the transition.
 */
export function getLegacyTrackingCutoff(now = Date.now()): Date | null {
  const configured = process.env.ORDER_TRACKING_LEGACY_UNTIL?.trim();
  if (configured) {
    const parsed = new Date(configured);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(now - DEFAULT_LEGACY_CUTOFF_DAYS * 24 * 60 * 60 * 1000);
}