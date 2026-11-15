import "server-only";

import { cookies } from "next/headers";
import {
  areCsrfTokensEqual,
  createCsrfToken,
  isCsrfTokenUsable,
} from "@/lib/security/csrf-core";
import {
  CSRF_COOKIE,
  CSRF_COOKIE_MAX_AGE_SECONDS,
  CSRF_HEADER,
} from "@/lib/security/csrf-shared";

export async function ensureCsrfToken(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(CSRF_COOKIE)?.value;
  if (isCsrfTokenUsable(existing)) return existing;

  const token = createCsrfToken();
  cookieStore.set(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: CSRF_COOKIE_MAX_AGE_SECONDS,
  });
  return token;
}

export async function assertCsrfToken(request: Request): Promise<Response | null> {
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(CSRF_COOKIE)?.value;
  const headerToken = request.headers.get(CSRF_HEADER);

  if (!isCsrfTokenUsable(cookieToken) || !isCsrfTokenUsable(headerToken)) {
    return Response.json(
      { error: "Your security token is missing. Refresh the page and try again." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!areCsrfTokensEqual(cookieToken, headerToken)) {
    return Response.json(
      { error: "Your security token is invalid. Refresh the page and try again." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  return null;
}

export { CSRF_COOKIE, CSRF_HEADER };