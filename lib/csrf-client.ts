import { CSRF_COOKIE, CSRF_HEADER } from "@/lib/security/csrf-shared";

export function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${CSRF_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(CSRF_COOKIE.length + 1)) : "";
}

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = readCsrfToken();
  if (token) headers.set(CSRF_HEADER, token);
  return fetch(input, { ...init, headers });
}

export { CSRF_HEADER };