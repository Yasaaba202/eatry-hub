import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, appendFile, open, unlink, readFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());

const { PrismaClient, FoodImageStatus } = require("@prisma/client");
const prisma = new PrismaClient();
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "food-catalog";
const logFile = path.join(process.cwd(), "var", "food-image-import.jsonl");
const lockFile = path.join(process.cwd(), "var", "food-image-import.lock");
const retryUnmatched = process.argv.includes("--retry-unmatched");
const localOnly = process.argv.includes("--local-only");
const dryRunCommons = process.argv.includes("--dry-run-commons");
const dryRun = process.argv.includes("--dry-run") || dryRunCommons;
const dryDishIndex = process.argv.indexOf("--dish");
const dryDish = dryDishIndex >= 0 ? process.argv[dryDishIndex + 1] : "Ghanaian Jollof Rice";
let lockHandle;
const limitIndex = process.argv.indexOf("--limit");
const limit = limitIndex >= 0 ? Number(process.argv[limitIndex + 1]) : Number.POSITIVE_INFINITY;
const acceptedLicense = /^(CC0|CC BY(?:-SA)?(?:\s|$)|Public domain|PD(?:\s|$))/i;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cleanHtml(value = "") {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function canonicalDishName(value) {
  return normalize(value).replace(/^(ghanaian|ghana)\s+/, "");
}

function imageExtension(contentType) {
  if (contentType.includes("image/webp")) return "webp";
  if (contentType.includes("image/png")) return "png";
  if (contentType.includes("image/avif")) return "avif";
  return "jpg";
}

async function fetchWithRetry(url, options = {}) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
      if (response.ok) return response;
      if (response.status < 500 && response.status !== 429) throw new Error(`HTTP ${response.status}`);
      lastError = new Error(`HTTP ${response.status}`);
      const retryAfter = response.headers.get("retry-after");
      const retryAfterMs = retryAfter
        ? Number.isFinite(Number(retryAfter))
          ? Number(retryAfter) * 1000
          : Math.max(0, Date.parse(retryAfter) - Date.now())
        : 0;
      if (response.status === 429 && attempt === 2) break;
      await sleep(Math.max(retryAfterMs, response.status === 429 ? 60_000 * (2 ** attempt) : 800 * (attempt + 1)));
      continue;
    } catch (error) {
      lastError = error;
    }
    await sleep(800 * (attempt + 1));
  }
  throw lastError ?? new Error("Request failed");
}

async function ensureBucket() {
  const bucketUrl = `${supabaseUrl}/storage/v1/bucket/${encodeURIComponent(bucket)}`;
  const existing = await fetchWithRetry(bucketUrl, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  }).catch((error) => {
    if (String(error.message).includes("HTTP 404")) return null;
    throw error;
  });
  if (existing) {
    const details = await existing.json();
    if (details.public !== true) throw new Error(`The existing Storage bucket "${bucket}" is private. Choose a dedicated public bucket or make the intended food-photo bucket public in Supabase.`);
    return;
  }

  const response = await fetchWithRetry(`${supabaseUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id: bucket, name: bucket, public: true, file_size_limit: 8388608, allowed_mime_types: ["image/jpeg", "image/png", "image/webp", "image/avif"] }),
  }).catch(async (error) => {
    if (!String(error.message).includes("HTTP 400") && !String(error.message).includes("HTTP 409")) throw error;
    return fetchWithRetry(bucketUrl, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    });
  });
  if (!response.ok) throw new Error(`Storage bucket setup failed (${response.status})`);
  if (response.headers.get("content-type")?.includes("application/json")) {
    const details = await response.json().catch(() => null);
    if (details && details.public !== true) throw new Error(`The existing Storage bucket "${bucket}" is private. Choose a dedicated public bucket or make the intended food-photo bucket public in Supabase.`);
  }
}

async function logEvent(event) {
  await mkdir(path.dirname(logFile), { recursive: true });
  await appendFile(logFile, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, "utf8");
}

function candidateScore(name, title) {
  const ignored = new Set(["ghanaian", "ghana", "with", "and", "the", "from", "style", "food", "dish", "cuisine", "recipe", "image", "photo", "traditional", "local", "wache", "bottle"]);
  const tokens = (value) => normalize(value).split(" ").filter((token) => token.length > 2 && !ignored.has(token));
  const dishTokens = [...new Set(tokens(name))];
  const titleTokens = [...new Set(tokens(title))];
  const matched = dishTokens.filter((token) => titleTokens.includes(token)).length;
  if (!dishTokens.length || !titleTokens.length) return 0;
  const recall = matched / dishTokens.length;
  const precision = matched / titleTokens.length;
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

async function findLocalCandidate(name, usedHashes) {
  const attributionPath = path.join(process.cwd(), "public", "images", "food-catalog", "attribution.json");
  const attributions = JSON.parse(await readFile(attributionPath, "utf8"));
  for (const item of attributions) {
    if (!acceptedLicense.test(item.license) || !item.licenseUrl || !item.author) continue;
    const matchScore = candidateScore(name, item.title);
    if (matchScore < 0.8) continue;
    const bytes = await readFile(path.join(path.dirname(attributionPath), item.file));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (usedHashes.has(sha256) && canonicalDishName(usedHashes.get(sha256)) !== canonicalDishName(name)) continue;
    const extension = path.extname(item.file).toLowerCase();
    const contentType = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
    return { bytes, contentType, sha256, title: item.title, sourceUrl: item.source, author: item.author, license: item.license, licenseUrl: item.licenseUrl, matchScore };
  }
  return null;
}

let commonsFilesPromise;
async function getCommonsFiles() {
  if (!commonsFilesPromise) {
    commonsFilesPromise = (async () => {
      const files = new Map();
      for (const category of ["Food_of_Ghana", "Cuisine_of_Ghana", "Food_from_Ghana"]) {
        const params = new URLSearchParams({
          action: "query",
          generator: "categorymembers",
          gcmtitle: `Category:${category}`,
          gcmtype: "file",
          gcmlimit: "200",
          prop: "imageinfo",
          iiprop: "url|extmetadata",
          iiurlwidth: "1280",
          format: "json",
          maxlag: "5",
        });
        const response = await fetchWithRetry(`https://commons.wikimedia.org/w/api.php?${params}`, {
          headers: { "User-Agent": process.env.IMAGE_IMPORT_USER_AGENT },
        });
        const result = await response.json();
        for (const [id, page] of Object.entries(result.query?.pages ?? {})) files.set(id, page);
        await sleep(1200);
      }
      return [...files.values()];
    })();
  }
  return commonsFilesPromise;
}

async function findCandidate(name, usedHashes) {
  const pages = await getCommonsFiles();
  const candidates = pages.flatMap((page) => {
    const info = page.imageinfo?.[0];
    if (!info?.thumburl || !info.extmetadata) return [];
    const meta = info.extmetadata;
    const license = cleanHtml(meta.LicenseShortName?.value);
    const licenseUrl = cleanHtml(meta.LicenseUrl?.value);
    const author = cleanHtml(meta.Artist?.value || meta.Credit?.value);
    const title = String(page.title ?? "").replace(/^File:/, "");
    if (!acceptedLicense.test(license) || !licenseUrl || !author) return [];
    const matchScore = candidateScore(name, title);
    return matchScore >= 0.8 ? [{ info, title, author, license, licenseUrl, matchScore }] : [];
  }).sort((a, b) => b.matchScore - a.matchScore);

  for (const candidate of candidates) {
    const imageResponse = await fetchWithRetry(candidate.info.thumburl, {
      headers: { "User-Agent": process.env.IMAGE_IMPORT_USER_AGENT },
    });
    const bytes = Buffer.from(await imageResponse.arrayBuffer());
    if (bytes.length < 1024 || bytes.length > 8 * 1024 * 1024) continue;
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (usedHashes.has(sha256) && canonicalDishName(usedHashes.get(sha256)) !== canonicalDishName(name)) continue;
    return {
      bytes,
      contentType: imageResponse.headers.get("content-type")?.split(";")[0] || "image/jpeg",
      sha256,
      title: candidate.title,
      sourceUrl: candidate.info.descriptionurl,
      author: candidate.author,
      license: candidate.license,
      licenseUrl: candidate.licenseUrl,
      matchScore: candidate.matchScore,
    };
  }
  return null;
}

async function uploadImage(name, image) {
  const fileName = `${canonicalDishName(name).replace(/ /g, "-")}-${image.sha256.slice(0, 12)}.${imageExtension(image.contentType)}`;
  const objectPath = `ghanaian-dishes/${fileName}`;
  const response = await fetchWithRetry(`${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath.split("/").map(encodeURIComponent).join("/")}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": image.contentType,
      "Cache-Control": "31536000",
      "x-upsert": "true",
    },
    body: image.bytes,
  });
  if (!response.ok) throw new Error(`Storage upload failed (${response.status})`);
  return `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${objectPath.split("/").map(encodeURIComponent).join("/")}`;
}

async function main() {
  if (!dryRun && (!supabaseUrl || !serviceRoleKey)) {
    console.error("Image import requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local. No image or database records were changed.");
    process.exitCode = 2;
    return;
  }
  if (!dryRun && !localOnly && !/[<(][^)]*(?:https?:\/\/|mailto:|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})[^)]*\)/.test(process.env.IMAGE_IMPORT_USER_AGENT || "")) {
    console.error("Online image search requires IMAGE_IMPORT_USER_AGENT to include a public project URL or contact address. Wikimedia's current API policy requires an identifiable contact. Local-only image imports are still available.");
    process.exitCode = 2;
    return;
  }
  if (dryRun) {
    const candidate = dryRunCommons ? await findCandidate(dryDish, new Map()) : await findLocalCandidate(dryDish, new Map()) ?? (localOnly ? null : await findCandidate(dryDish, new Map()));
    console.log(JSON.stringify(candidate
      ? { dryRun: true, dish: dryDish, found: true, bytesDownloaded: candidate.bytes.length, license: candidate.license, source: candidate.sourceUrl, matchScore: candidate.matchScore }
      : { dryRun: true, dish: dryDish, found: false }));
    return;
  }
  await mkdir(path.dirname(lockFile), { recursive: true });
  try {
    lockHandle = await open(lockFile, "wx");
  } catch {
    console.error("An image import is already running.");
    process.exitCode = 3;
    return;
  }
  const existing = await prisma.menuTemplate.findMany({
    where: { imageSha256: { not: null } },
    select: { name: true, imageSha256: true },
  });
  const usedHashes = new Map(existing.map((item) => [item.imageSha256, item.name]));
  await ensureBucket();

  const templates = await prisma.menuTemplate.findMany({
    where: retryUnmatched
      ? { imageStatus: { in: [FoodImageStatus.PENDING, FoodImageStatus.FAILED, FoodImageStatus.AWAITING_IMAGE] } }
      : { imageStatus: { in: [FoodImageStatus.PENDING, FoodImageStatus.FAILED] } },
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
    select: { id: true, name: true, imageStatus: true },
    take: Number.isFinite(limit) && limit > 0 ? limit : undefined,
  });
  const processed = new Set();
  let uploaded = 0;
  let awaiting = 0;
  let failed = 0;

  for (const template of templates) {
    const key = normalize(template.name);
    if (processed.has(key)) continue;
    processed.add(key);
    const siblings = await prisma.menuTemplate.findMany({ where: { name: { equals: template.name, mode: "insensitive" } }, select: { id: true } });
    const ids = siblings.map((item) => item.id);
    const triedAt = new Date();
    try {
      await prisma.menuTemplate.updateMany({ where: { id: { in: ids } }, data: { imageLastTriedAt: triedAt, imageImportTries: { increment: 1 }, imageImportError: null } });
      const candidate = await findLocalCandidate(template.name, usedHashes) ?? (localOnly ? null : await findCandidate(template.name, usedHashes));
      if (!candidate) {
        if (localOnly) continue;
        awaiting += 1;
        await prisma.menuTemplate.updateMany({ where: { id: { in: ids } }, data: { imageStatus: FoodImageStatus.AWAITING_IMAGE, imageImportError: "No suitably licensed, dish-specific Wikimedia Commons match was found." } });
        await logEvent({ dish: template.name, result: "awaiting-image" });
        continue;
      }
      const url = await uploadImage(template.name, candidate);
      await prisma.menuTemplate.updateMany({
        where: { id: { in: ids } },
        data: {
          imageUrl: url,
          imageSourceUrl: candidate.sourceUrl,
          imageAuthor: candidate.author,
          imageLicense: candidate.license,
          imageLicenseUrl: candidate.licenseUrl,
          imageSha256: candidate.sha256,
          imageStatus: FoodImageStatus.NEEDS_REVIEW,
          imageImportError: null,
        },
      });
      usedHashes.set(candidate.sha256, template.name);
      uploaded += 1;
      await logEvent({ dish: template.name, result: "uploaded-needs-review", license: candidate.license, source: candidate.sourceUrl, matchScore: candidate.matchScore });
    } catch (error) {
      failed += 1;
      const message = String(error?.message || "Image import failed").slice(0, 300);
      await prisma.menuTemplate.updateMany({ where: { id: { in: ids } }, data: { imageStatus: FoodImageStatus.FAILED, imageImportError: message } });
      await logEvent({ dish: template.name, result: "failed", error: message });
      console.error(`${template.name}: ${message}`);
    }
    if (!localOnly) await sleep(1100);
  }

  console.log(JSON.stringify({ considered: processed.size, uploadedForReview: uploaded, awaitingImage: awaiting, failed, logFile: path.relative(process.cwd(), logFile) }));
}

main().catch((error) => {
  console.error(`Image import stopped: ${String(error?.message || "unknown error").slice(0, 300)}`);
  process.exitCode = 1;
}).finally(async () => {
  if (lockHandle) {
    await lockHandle.close().catch(() => {});
    await unlink(lockFile).catch(() => {});
  }
  await prisma.$disconnect();
});
