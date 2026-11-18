/**
 * Turns the master artwork in /art into GPU-friendly WebP textures.
 *
 *   /art/cover.png            -> /public/textures/hd/cover.webp + /sd/cover.webp
 *   /art/events/sangeet.png   -> /public/textures/hd/events/sangeet.webp + sd/...
 *
 *   /art/loader/blessing.png  -> /public/images/blessing.webp   (loading screen)
 *
 * "hd" is used on desktops / strong phones, "sd" on weaker devices (see
 * src/lib/device.js). Run after replacing any artwork:   npm run textures
 *
 * It also writes src/config/textures.version.js: texture URLs carry that stamp
 * (?v=…), so browsers can cache them for a year and still pick up new artwork
 * the moment it changes.
 */
import sharp from "sharp";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const ART = path.join(ROOT, "art");
const OUT = path.join(ROOT, "public", "textures");
const VERSION_FILE = path.join(ROOT, "src", "config", "textures.version.js");
const SKIP_DIRS = new Set(["mockups", "fonts", "loader"]);
const EXT = /\.(png|jpe?g|webp|avif|tiff?)$/i;

// Longest edge in pixels. Textures never get upscaled.
const PRESETS = {
  hd: { maxEdge: 1600, quality: 84 },
  sd: { maxEdge: 880, quality: 80 },
};

async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const full = path.join(dir, name);
    if ((await stat(full)).isDirectory()) {
      if (!SKIP_DIRS.has(name)) out.push(...(await walk(full)));
    } else if (EXT.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const files = (await walk(ART)).sort();
const total = { hd: 0, sd: 0 };
const hash = createHash("sha1");

for (const file of files) {
  const rel = path.relative(ART, file).replace(EXT, ".webp").replaceAll("\\", "/");
  for (const [name, { maxEdge, quality }] of Object.entries(PRESETS)) {
    const dest = path.join(OUT, name, rel);
    await mkdir(path.dirname(dest), { recursive: true });
    const info = await sharp(file)
      .rotate()
      .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true, kernel: "lanczos3" })
      .webp({ quality, effort: 6, smartSubsample: true })
      .toFile(dest);
    total[name] += info.size;
    hash.update(`${name}/${rel}`).update(await readFile(dest));
    console.log(`${name}  ${rel.padEnd(24)} ${info.width}x${info.height}  ${(info.size / 1024).toFixed(0)} KB`);
  }
}

/* ── Loading-screen image ────────────────────────────────────────────────
 * Shown inside an arch on the loader. A small source is upscaled (Lanczos)
 * and sharpened; replace /art/loader/blessing.png with the original
 * high-resolution file whenever you get it and run this script again.
 * BLESSING_CROP trims the source (fractions of its width / height). */
const BLESSING = path.join(ART, "loader", "blessing.png");
const BLESSING_CROP = { left: 0, top: 0.03, width: 0.92, height: 0.95 };
const BLESSING_HEIGHT = 920; // px: twice its largest size on screen

try {
  const meta = await sharp(BLESSING).metadata();
  const crop = {
    left: Math.round(meta.width * BLESSING_CROP.left),
    top: Math.round(meta.height * BLESSING_CROP.top),
    width: Math.round(meta.width * BLESSING_CROP.width),
    height: Math.round(meta.height * BLESSING_CROP.height),
  };
  const upscaled = crop.height < BLESSING_HEIGHT;
  const dest = path.join(ROOT, "public", "images", "blessing.webp");
  await mkdir(path.dirname(dest), { recursive: true });
  let image = sharp(BLESSING).extract(crop).flatten({ background: "#d9cdbd" }).resize({ height: BLESSING_HEIGHT, kernel: "lanczos3" });
  if (upscaled) image = image.sharpen({ sigma: 1.1, m1: 0.6, m2: 2.2 }).modulate({ saturation: 1.06 });
  const info = await image.webp({ quality: 88, effort: 6, smartSubsample: true }).toFile(dest);
  hash.update("blessing").update(await readFile(dest));
  const note = upscaled ? `  (upscaled from ${crop.width}x${crop.height})` : "";
  console.log(`loader  blessing.webp  ${info.width}x${info.height}  ${(info.size / 1024).toFixed(0)} KB${note}`);
} catch (error) {
  if (error.code !== "ENOENT" && !/missing/i.test(error.message)) throw error;
  console.log("loader  no /art/loader/blessing.png — skipped");
}

const version = hash.digest("hex").slice(0, 10);
await writeFile(
  VERSION_FILE,
  `// Written by \`npm run textures\` — do not edit.\nexport const TEXTURE_VERSION = "${version}";\n`,
);

console.log(`\nTotal  hd: ${(total.hd / 1024).toFixed(0)} KB   sd: ${(total.sd / 1024).toFixed(0)} KB`);
console.log(`Texture version: ${version}`);
