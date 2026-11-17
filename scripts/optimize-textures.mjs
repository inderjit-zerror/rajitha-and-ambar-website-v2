/**
 * Turns the master artwork in /art into GPU-friendly WebP textures.
 *
 *   /art/cover.png            -> /public/textures/hd/cover.webp + /sd/cover.webp
 *   /art/events/sangeet.png   -> /public/textures/hd/events/sangeet.webp + sd/...
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
const SKIP_DIRS = new Set(["mockups", "fonts"]);
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

const version = hash.digest("hex").slice(0, 10);
await writeFile(
  VERSION_FILE,
  `// Written by \`npm run textures\` — do not edit.\nexport const TEXTURE_VERSION = "${version}";\n`,
);

console.log(`\nTotal  hd: ${(total.hd / 1024).toFixed(0)} KB   sd: ${(total.sd / 1024).toFixed(0)} KB`);
console.log(`Texture version: ${version}`);
