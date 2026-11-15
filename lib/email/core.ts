export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  const email = normalizeEmail(value);
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export function maskEmail(value: string): string {
  const [local, domain] = normalizeEmail(value).split("@");
  if (!local || !domain) return "invalid-email";
  const visible = local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(2, local.length - 2))}@${domain}`;
}

export function buildIdempotencyKey(event: string, ...parts: Array<string | number>): string {
  return [event, ...parts.map((part) => String(part))].join(":");
}

export function computeRetryDelaySeconds(attempts: number): number {
  const delays = [60, 300, 900];
  const index = Math.min(Math.max(attempts - 1, 0), delays.length - 1);
  return delays[index];
}

export function formatMoney(amount: number, currency = "GHS"): string {
  return `${currency} ${amount.toFixed(2)}`;
}