import { cookies } from "next/headers";
import { getCurrentAccount } from "@/lib/account-auth";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-auth";
import { isSameOrigin } from "@/lib/api-security";
import { prisma } from "@/lib/prisma";

type Scope =
  | { kind: "account"; id: string; role: "CUSTOMER" | "VENDOR" }
  | { kind: "admin" };

async function resolveScope(): Promise<Scope | null> {
  const account = await getCurrentAccount();
  if (account && account.role !== "ADMIN") {
    return { kind: "account", id: account.id, role: account.role };
  }
  const cookieStore = await cookies();
  if (await verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)) {
    return { kind: "admin" };
  }
  return null;
}

function scopeWhere(scope: Scope, id?: string | null) {
  if (scope.kind === "admin") return { audience: "ADMIN" as const, ...(id ? { id } : {}) };
  return { userId: scope.id, audience: scope.role, ...(id ? { id } : {}) };
}

export async function GET() {
  const scope = await resolveScope();
  if (!scope) {
    return Response.json({ error: "Sign in to view notifications." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const where = scopeWhere(scope);
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, category: true, event: true, title: true, body: true, href: true, readAt: true, createdAt: true },
      }),
      prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);
    return Response.json({ notifications, unreadCount }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Notifications could not be loaded.", error instanceof Error ? error.name : "Unknown error");
    return Response.json({ error: "Notifications could not be loaded." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const scope = await resolveScope();
  if (!scope) {
    return Response.json({ error: "Sign in to update notifications." }, { status: 401 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const body = (input ?? {}) as { id?: unknown; all?: unknown };
  const markAll = body.all === true;
  const id = typeof body.id === "string" ? body.id : null;
  if (!markAll && !id) {
    return Response.json({ error: "Provide a notification id or mark all as read." }, { status: 400 });
  }

  try {
    const result = await prisma.notification.updateMany({
      where: { ...scopeWhere(scope, id), readAt: null },
      data: { readAt: new Date() },
    });
    return Response.json({ ok: true, updated: result.count });
  } catch (error) {
    console.error("Notifications could not be updated.", error instanceof Error ? error.name : "Unknown error");
    return Response.json({ error: "Notifications could not be updated." }, { status: 503 });
  }
}