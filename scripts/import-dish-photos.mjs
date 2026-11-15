import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const UA = "EatryHub/1.0 (food catalogue import; contact: admin@eatryhub.example)";

const DISHES = [
  { slug: "jollof-fish-plantain", query: "Jollof rice with fried fish and plantain", require: ["jollof"] },
  { slug: "fried-rice-fish", query: "Fried rice and fish cuts", require: ["fried rice"] },
  { slug: "jollof-grilled-tilapia", query: "Jollof and grilled tilapia", require: ["jollof"] },
  { slug: "waakye-leaf", query: "Waakye in a leaf", require: ["waakye"] },
  { slug: "wakye-leaves", query: "Wakye in Leaves", require: ["wakye"] },
  { slug: "waakye-accra", query: "bowl of Wakye spaghetti fish plantain egg Accra", require: ["wakye"] },
  { slug: "banku-asanka", query: "Banku with pepper in Asanka", require: ["banku"] },
  { slug: "banku-chicken-tilapia", query: "Banku with chicken and tilapia", require: ["banku"] },
  { slug: "banku-ne-mako", query: "Banku ne mako", require: ["banku"] },
  { slug: "fufu-light-soup", query: "Fufu with light soup", require: ["fufu"] },
  { slug: "palm-nut-soup", query: "Akan Ghanaian Palm Nut Soup", require: ["palm nut"] },
  { slug: "groundnut-soup", query: "Groundnut Stew Abom Ghana", require: ["groundnut"] },
  { slug: "palava-sauce", query: "Palava Sauce", require: ["palava"] },
  { slug: "ga-kenkey", query: "Ga Kenkey with Fish canned beef pepper", require: ["kenkey"] },
  { slug: "fante-kenkey", query: "Fante Kenkey with Sardine and Shito", require: ["kenkey"] },
  { slug: "kenkey-fish", query: "Kenkey with fish Ghana", require: ["kenkey"] },
  { slug: "ampesi-kontomire", query: "Ampesi and kontomire stew", require: ["ampesi"] },
  { slug: "roasted-plantain-groundnut", query: "Roasted plantain with groundnut", require: ["plantain"] },
  { slug: "yam-garden-egg", query: "Yam and garden egg stew", require: ["yam"] },
  { slug: "kelewele", query: "Kelewele", require: ["kelewele"] },
  { slug: "plantain-chips", query: "Plantain Chips Ghana", require: ["plantain chips"] },
  { slug: "koose", query: "Koose bean cake Ghana", require: ["koose"] },
  { slug: "kontomire-stew", query: "Kontomire stew Ghana", require: ["kontomire"] },
  { slug: "garden-egg-stew", query: "Garden egg stew Ghana", require: ["garden egg"] },
  { slug: "shito-sardine", query: "Shito and Sardine", require: ["shito"] },
  { slug: "grilled-tilapia", query: "Garnished Grilled Tilapia", require: ["tilapia"] },
  { slug: "ghanaian-fried-fish", query: "Ghanaian fried fish", require: ["fried fish"] },
  { slug: "chichinga-kebab", query: "Ghanaian Chicken Kebab", require: ["kebab"] },
  { slug: "tuo-zaafi", query: "Tuo Zaafi", require: ["tuo zaafi"] },
  { slug: "wasawasa", query: "Wasawasa", require: ["wasawasa"] },
  { slug: "akple", query: "Akple Ghana", require: ["akple"] },
  { slug: "etor", query: "Ghanaian Delicacy Etor", require: ["etor"] },
  { slug: "asaana-drink", query: "Asaana Ghanaian drink", require: ["asaana"] },
  { slug: " nkate-cake", query: "Nkate cake Ghana", require: ["nkate"] },
];

const EXCLUDE = [
  "seller", "woman", "women", "man", "men", "people", "person", "girl", "boy",
  "child", "chef", "vendor", "market", "portrait", "couple", "friends", "family",
  "restaurant", "interior", "kitchen", "building", "street scene", "crowd",
];

const dir = resolve(process.cwd(), "public/images/dishes");
mkdirSync(dir, { recursive: true });

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function search(query) {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `filetype:bitmap ${query}`,
    gsrnamespace: "6",
    gsrlimit: "12",
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
  return data.query?.pages ?? {};
}

const manifest = [];

for (const dish of DISHES) {
  const slug = dish.slug.trim();
  let pages;
  try {
    pages = await search(dish.query);
  } catch (error) {
    console.error(`skip ${slug}: search failed (${error.message})`);
    continue;
  }

  const candidates = Object.values(pages)
    .map((page) => {
      const info = page.imageinfo?.[0];
      if (!info) return null;
      const title = String(page.title ?? "");
      const lower = title.toLowerCase();
      return { title, lower, info };
    })
    .filter(Boolean)
    .filter((entry) => dish.require.every((token) => entry.lower.includes(token)))
    .filter((entry) => !EXCLUDE.some((word) => entry.lower.includes(word)))
    .filter((entry) => (entry.info.width ?? 0) >= 600)
    .sort((a, b) => (b.info.width ?? 0) - (a.info.width ?? 0));

  const pick = candidates[0];
  if (!pick) {
    console.error(`skip ${slug}: no clean match for "${dish.query}"`);
    continue;
  }

  const thumb = pick.info.thumburl ?? pick.info.url;
  try {
    const response = await fetch(thumb, { headers: { "User-Agent": UA } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const input = Buffer.from(await response.arrayBuffer());
    const output = await sharp(input)
      .rotate()
      .resize(1000, 1250, { fit: "cover", position: "attention" })
      .webp({ quality: 80 })
      .toBuffer();
    writeFileSync(resolve(dir, `${slug}.webp`), output);

    const meta = pick.info.extmetadata ?? {};
    manifest.push({
      slug,
      file: `/images/dishes/${slug}.webp`,
      title: stripHtml(pick.title.replace(/^File:/, "")),
      source: pick.info.descriptionurl,
      author: stripHtml(meta.Artist?.value ?? "Unknown"),
      license: stripHtml(meta.LicenseShortName?.value ?? "See source"),
      licenseUrl: meta.LicenseUrl?.value ?? "",
    });
    console.log(`ok ${slug}.webp <- ${pick.title}`);
  } catch (error) {
    console.error(`skip ${slug}: download failed (${error.message})`);
  }

  await new Promise((done) => setTimeout(done, 250));
}

manifest.sort((a, b) => a.slug.localeCompare(b.slug));
writeFileSync(resolve(dir, "attribution.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\n${manifest.length} dish photos written with attribution.`);