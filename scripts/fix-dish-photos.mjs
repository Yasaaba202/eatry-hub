import { mkdirSync, readFileSync, unlinkSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const UA = "EatryHub/1.0 (food catalogue import; contact: admin@eatryhub.example)";
const dir = resolve(process.cwd(), "public/images/dishes");
mkdirSync(dir, { recursive: true });

const REMOVE = [
  "kelewele.webp",
  "kontomire-stew.webp",
  "garden-egg-stew.webp",
  "shito-sardine.webp",
  "asaana-drink.webp",
];

const REPLACEMENTS = [
  { slug: "kelewele", title: "File:Kelewele, a Ghanaian snack.jpg" },
  { slug: "kelewele-groundnut", title: "File:Kelewele with roasted Groundnuts A Ghanaian Delicacy.jpg" },
  { slug: "fried-yam-shito", title: "File:Fried yam with Black pepper sauce (Shito).jpg" },
  { slug: "sobolo-drink", title: "File:Sobolo drink.jpg" },
  { slug: "iced-kenkey", title: "File:Iced Kenkey.jpg" },
];

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

for (const file of REMOVE) {
  if (existsSync(resolve(dir, file))) unlinkSync(resolve(dir, file));
}

const manifestPath = resolve(dir, "attribution.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")).filter(
  (entry) => !REMOVE.includes(entry.file.split("/").pop()),
);

for (const item of REPLACEMENTS) {
  const params = new URLSearchParams({
    action: "query",
    titles: item.title,
    prop: "imageinfo",
    iiprop: "url|size|extmetadata",
    iiurlwidth: "1000",
    format: "json",
  });
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
    headers: { "User-Agent": UA },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  const page = Object.values(data.query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];

  if (!info) {
    console.error(`skip ${item.slug}: title not found (${item.title})`);
    continue;
  }

  try {
    const image = await fetch(info.thumburl ?? info.url, { headers: { "User-Agent": UA } });
    if (!image.ok) throw new Error(`HTTP ${image.status}`);
    const input = Buffer.from(await image.arrayBuffer());
    const output = await sharp(input)
      .rotate()
      .resize(1000, 1250, { fit: "cover", position: "attention" })
      .webp({ quality: 80 })
      .toBuffer();
    writeFileSync(resolve(dir, `${item.slug}.webp`), output);

    const meta = info.extmetadata ?? {};
    manifest.push({
      slug: item.slug,
      file: `/images/dishes/${item.slug}.webp`,
      title: stripHtml(String(page.title).replace(/^File:/, "")),
      source: info.descriptionurl,
      author: stripHtml(meta.Artist?.value ?? "Unknown"),
      license: stripHtml(meta.LicenseShortName?.value ?? "See source"),
      licenseUrl: meta.LicenseUrl?.value ?? "",
    });
    console.log(`ok ${item.slug}.webp <- ${page.title}`);
  } catch (error) {
    console.error(`skip ${item.slug}: ${error.message}`);
  }

  await new Promise((done) => setTimeout(done, 250));
}

manifest.sort((a, b) => a.slug.localeCompare(b.slug));
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\n${manifest.length} dish photos with attribution.`);