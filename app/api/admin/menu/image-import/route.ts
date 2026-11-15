import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { authorizeAdminRequest } from "@/lib/admin-api";
import { isSameOrigin } from "@/lib/api-security";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const denied = await authorizeAdminRequest(request);
  if (denied) return denied;

  try {
    const [counts, recent] = await Promise.all([
      prisma.menuTemplate.groupBy({ by: ["imageStatus"], _count: { _all: true } }),
      prisma.menuTemplate.findMany({
        where: { imageStatus: { in: ["FAILED", "AWAITING_IMAGE", "NEEDS_REVIEW"] } },
        orderBy: { imageLastTriedAt: "desc" },
        take: 40,
        select: { id: true, name: true, imageUrl: true, imageStatus: true, imageImportError: true, imageLastTriedAt: true, imageSourceUrl: true, imageAuthor: true, imageLicense: true, imageLicenseUrl: true, imageSha256: true },
      }),
    ]);
    let log: Array<Record<string, unknown>> = [];
    let running = false;
    try {
      await stat(path.join(process.cwd(), "var", "food-image-import.lock"));
      running = true;
    } catch { /* No import process is holding the lock. */ }
    try {
      const text = await readFile(path.join(process.cwd(), "var", "food-image-import.jsonl"), "utf8");
      log = text.trim().split("\n").slice(-40).reverse().flatMap((line) => {
        try { return [JSON.parse(line) as Record<string, unknown>]; } catch { return []; }
      });
    } catch { /* The importer has not written a local log yet. */ }
    return Response.json({ counts: Object.fromEntries(counts.map((item) => [item.imageStatus, item._count._all])), recent, log, running }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Food image import status could not be loaded.", error);
    return Response.json({ error: "Image import status is temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const denied = await authorizeAdminRequest(request, true);
  if (denied) return denied;
  if (!isSameOrigin(request)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the server environment before importing photos." }, { status: 503 });
  }
  if (!/[<(][^)]*(?:https?:\/\/|mailto:|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})[^)]*\)/.test(process.env.IMAGE_IMPORT_USER_AGENT || "")) {
    return Response.json({ error: "Add a public project URL or contact address to IMAGE_IMPORT_USER_AGENT before searching Wikimedia." }, { status: 503 });
  }

  try {
    const script = path.join(process.cwd(), "scripts", "import-food-images.mjs");
    const child = spawn(process.execPath, [script], { cwd: process.cwd(), env: process.env, detached: true, stdio: "ignore", windowsHide: true });
    child.unref();
    return Response.json({ ok: true, message: "The resumable food photo import has started." }, { status: 202 });
  } catch (error) {
    console.error("Food image import could not start.", error);
    return Response.json({ error: "The photo import could not start." }, { status: 503 });
  }
}
