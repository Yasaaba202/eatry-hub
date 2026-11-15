import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const root = process.cwd();
const markSvg = readFileSync(resolve(root, "app/icon.svg"));

mkdirSync(resolve(root, "public/brand"), { recursive: true });
writeFileSync(resolve(root, "public/brand/logo-mark.svg"), markSvg);

async function png(size) {
  return sharp(markSvg, { density: 384 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

const icoSizes = [16, 32, 48, 64];
const images = await Promise.all(icoSizes.map((size) => png(size)));

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);

const entries = [];
let offset = header.length + 16 * images.length;
images.forEach((data, index) => {
  const size = icoSizes[index];
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0);
  entry.writeUInt8(size >= 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(data.length, 8);
  entry.writeUInt32LE(offset, 12);
  entries.push(entry);
  offset += data.length;
});

const ico = Buffer.concat([header, ...entries, ...images]);
writeFileSync(resolve(root, "app/favicon.ico"), ico);
writeFileSync(resolve(root, "public/brand/favicon.ico"), ico);

const apple = await png(180);
writeFileSync(resolve(root, "app/apple-icon.png"), apple);

console.log(`favicon.ico written (${icoSizes.join(", ")} px), apple-icon.png written (180 px).`);