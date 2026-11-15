import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-auth";
import { isSameOrigin } from "@/lib/api-security";
import { assertCsrfToken, ensureCsrfToken } from "@/lib/csrf";

export async function authorizeAdminRequest(request: Request, mutating = false) {
  if (mutating) {
    if (!isSameOrigin(request)) {
      return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
    }
    const csrfError = await assertCsrfToken(request);
    if (csrfError) return csrfError;
  }

  const cookieStore = await cookies();
  if (!(await verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value))) {
    return Response.json({ error: "Administrator sign-in is required." }, { status: 401 });
  }
  return null;
}

export async function authorizeAdminRead(request: Request) {
  const denied = await authorizeAdminRequest(request);
  if (denied) return denied;
  await ensureCsrfToken();
  return null;
}