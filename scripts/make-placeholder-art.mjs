/**
 * Builds the PLACEHOLDER artwork in /art from the two mockups in /art/mockups.
 *
 * You only need this until the final designs arrive. When they do, drop the
 * real files into /art with the same names and run `npm run textures`.
 *
 *   node scripts/make-placeholder-art.mjs
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const ART = path.join(ROOT, "art");
const MOCK_COVER = path.join(ART, "mockups", "cover-mockup.webp");
const MOCK_OPEN = path.join(ART, "mockups", "open-mockup.webp");
// EB Garamond: the book Garamond of the client's mockups (cover title, tabs, card).
const FONT = (v) => path.join(ART, "fonts", `EBGaramond-${v}.ttf`);

const INK = "#2b4c8c";
const GOLD = "#a8844f";
const PAPER = [238, 231, 220];

/* ----------------------------- helpers ----------------------------- */

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const STYLES = {
  regular: { file: FONT("400-normal"), face: "EB Garamond" },
  bold: { file: FONT("500-normal"), face: "EB Garamond Medium" },
  italic: { file: FONT("400-italic"), face: "EB Garamond Italic" },
};

async function text(str, { size, style = "regular", color = INK, tracking = 0 }) {
  const { file, face } = STYLES[style];
  const spacing = Math.round(tracking * size * 1024);
  const markup = `<span foreground="${color}" letter_spacing="${spacing}">${esc(str)}</span>`;
  const { data, info } = await sharp({
    text: { text: markup, font: `${face} ${size}`, fontfile: file, rgba: true, dpi: 72 },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { input: data, width: info.width, height: info.height };
}

/** Places an image centred horizontally with its vertical centre at `cy` (px). */
function centered(img, W, cy) {
  return {
    input: img.input,
    ...(img.blend ? { blend: img.blend } : {}),
    left: Math.round((W - img.width) / 2),
    top: Math.round(cy - img.height / 2),
  };
}

/** Cream paper with fine grain and a very soft edge falloff. */
function paper(W, H, seed = 1) {
  const buf = Buffer.alloc(W * H * 3);
  let s = seed * 9301 + 49297;
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x / W - 0.5;
      const dy = y / H - 0.5;
      const vignette = 1 - (dx * dx + dy * dy) * 0.08;
      const grain = (rand() - 0.5) * 7;
      const i = (y * W + x) * 3;
      buf[i] = Math.max(0, Math.min(255, PAPER[0] * vignette + grain));
      buf[i + 1] = Math.max(0, Math.min(255, PAPER[1] * vignette + grain));
      buf[i + 2] = Math.max(0, Math.min(255, PAPER[2] * vignette + grain));
    }
  }
  return sharp(buf, { raw: { width: W, height: H, channels: 3 } });
}

function divider(width, color = GOLD) {
  const h = 24;
  const mid = width / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}">
    <line x1="0" y1="${h / 2}" x2="${mid - 18}" y2="${h / 2}" stroke="${color}" stroke-width="2"/>
    <line x1="${mid + 18}" y1="${h / 2}" x2="${width}" y2="${h / 2}" stroke="${color}" stroke-width="2"/>
    <rect x="${mid - 7}" y="${h / 2 - 7}" width="14" height="14" fill="${color}" transform="rotate(45 ${mid} ${h / 2})"/>
  </svg>`;
  return { input: Buffer.from(svg), width, height: h };
}

/** Feathered alpha mask so a cropped illustration melts into the paper. */
async function feather(buffer, w, h, edge) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><filter id="b"><feGaussianBlur stdDeviation="${edge / 2.5}"/></filter></defs>
    <rect x="${edge}" y="${edge}" width="${w - edge * 2}" height="${h - edge * 2}" fill="#fff" filter="url(#b)"/>
  </svg>`;
  const mask = await sharp(Buffer.from(svg)).extractChannel(0).toBuffer();
  return sharp(buffer).removeAlpha().joinChannel(mask).png().toBuffer();
}

/* --------------------------- crop sources --------------------------- */

// Pixel rectangles measured on the open mockup (1111 x 736).
const STRIPS = {
  sangeet: { left: 608, top: 59, width: 448, height: 92 },
  varmala: { left: 607, top: 160, width: 448, height: 86 },
  wedding: { left: 606, top: 253, width: 450, height: 85 },
  reception: { left: 604, top: 344, width: 452, height: 92 },
};
// The reception strip is cut lower in the tab card (the 3D pocket hides it), but
// the details header must stop above the pocket's edge.
const DETAIL_STRIPS = { ...STRIPS, reception: { left: 604, top: 344, width: 452, height: 74 } };
const POCKET = { left: 570, top: 420, width: 518, height: 276 };
const EMBLEM = { left: 196, top: 128, width: 144, height: 146 };
const COVER = { left: 8, top: 8, width: 542, height: 700 };

/* ------------------------------ builders ---------------------------- */

async function buildCover() {
  await sharp(MOCK_COVER)
    .extract(COVER)
    .resize({ width: 1084, kernel: "lanczos3" })
    .sharpen({ sigma: 0.7 })
    .png()
    .toFile(path.join(ART, "cover.png"));
}

async function buildPocket() {
  await sharp(MOCK_OPEN)
    .extract(POCKET)
    .resize({ width: 1036, kernel: "lanczos3" })
    .sharpen({ sigma: 0.6 })
    .png()
    .toFile(path.join(ART, "pocket.png"));
}

const CARD_W = 1200;
const CARD_H = 1616;

async function buildInvitation() {
  const W = CARD_W;
  const H = CARD_H;
  const emblemW = 350;
  const emblemH = Math.round((emblemW * EMBLEM.height) / EMBLEM.width);
  // Divide out the mockup's paper colour so the background turns white, then
  // multiply it onto our paper: the emblem keeps its tone, the patch disappears.
  const bg = [240, 233, 222];
  const emblemRaw = await sharp(MOCK_OPEN)
    .extract(EMBLEM)
    .resize({ width: emblemW, kernel: "lanczos3" })
    .sharpen({ sigma: 0.8 })
    .removeAlpha()
    .linear(bg.map((c) => 255 / c), [0, 0, 0])
    .ensureAlpha()
    .png()
    .toBuffer();
  const emblem = {
    input: await feather(emblemRaw, emblemW, emblemH, 14),
    width: emblemW,
    height: emblemH,
    blend: "multiply",
  };

  const layers = [
    centered(await text("Om Ganeshaya Namaha", { size: 40 }), W, H * 0.072),
    centered(emblem, W, H * 0.25),
    centered(await text("Sri Penaka Venkata Ramprasad & Smt. Subha Sri", { size: 49 }), W, H * 0.437),
    centered(await text("request the pleasure of your company", { size: 49 }), W, H * 0.481),
    centered(await text("at the wedding celebrations of", { size: 49 }), W, H * 0.525),
    centered(await text("Rajitha Penaka", { size: 104, style: "bold" }), W, H * 0.612),
    centered(await text("with", { size: 46 }), W, H * 0.682),
    centered(await text("Ambar Kumar", { size: 104, style: "bold" }), W, H * 0.748),
    centered(await text("Son of Sri Sharvan Kumar & Smt. Seema Kumar", { size: 46 }), W, H * 0.818),
    centered(await text("Cannes, France", { size: 58 }), W, H * 0.906),
  ];

  await paper(W, H, 3).composite(layers).png().toFile(path.join(ART, "invitation.png"));
}

const EVENTS = {
  sangeet: {
    eyebrow: "DAY ONE  ·  EVENING",
    title: "Sangeet",
    tagline: "An evening of music, dance & celebration",
    when: "Day One  ·  Evening",
    dress: "Indo-western glamour",
  },
  varmala: {
    eyebrow: "DAY TWO  ·  MORNING",
    title: "Varmala",
    tagline: "The exchange of garlands",
    when: "Day Two  ·  Morning",
    dress: "Pastel traditional",
  },
  wedding: {
    eyebrow: "DAY TWO  ·  MIDDAY",
    title: "Wedding",
    tagline: "The sacred vows, by the sea",
    when: "Day Two  ·  Midday",
    dress: "Traditional Indian",
  },
  reception: {
    eyebrow: "DAY TWO  ·  EVENING",
    title: "Reception",
    tagline: "Dinner, toasts & dancing under the stars",
    when: "Day Two  ·  Evening",
    dress: "Black tie",
  },
};

/**
 * One card per event (1130 x 1500). In the book it is FOLDED IN HALF along
 * the horizontal centre line and tucked into the pocket, where only the top
 * band (240 px) shows. Chosen, it unfolds into this full card on the left page.
 * Keep the 60 px around the centre line (y = 750) free of text.
 */
async function buildEventCard(id) {
  const W = 1130;
  const H = 1500;
  const band = 240;
  const e = EVENTS[id];
  const art = await sharp(MOCK_OPEN)
    .extract(DETAIL_STRIPS[id])
    .resize({ width: W, height: band, fit: "cover", kernel: "lanczos3" })
    .sharpen({ sigma: 0.7 })
    .png()
    .toBuffer();
  const lines = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect x="0" y="${band}" width="${W}" height="3" fill="${GOLD}"/>
      <rect x="34" y="${band + 34}" width="${W - 68}" height="${H - band - 68}" fill="none" stroke="${GOLD}" stroke-opacity="0.5" stroke-width="2"/>
    </svg>`,
  );
  const label = (s) => text(s, { size: 28, color: GOLD, tracking: 0.28, style: "bold" });
  const layers = [
    { input: art, left: 0, top: 0 },
    { input: lines, left: 0, top: 0 },
    // upper panel (the "cover" of the folded card)
    centered(await text(e.eyebrow, { size: 30, color: GOLD, tracking: 0.3, style: "bold" }), W, 372),
    centered(await text(e.title, { size: 142, style: "bold" }), W, 492),
    centered(await text(e.tagline, { size: 52, style: "italic" }), W, 612),
    centered(divider(380), W, 690),
    // lower panel (folded behind until the card is opened)
    centered(await label("WHEN"), W, 852),
    centered(await text(e.when, { size: 56 }), W, 912),
    centered(await label("WHERE"), W, 1022),
    centered(await text("Cannes, France", { size: 56 }), W, 1082),
    centered(await text("Venue details to follow", { size: 40, style: "italic" }), W, 1138),
    centered(await label("DRESS CODE"), W, 1248),
    centered(await text(e.dress, { size: 56 }), W, 1308),
    centered(await text("Rajitha & Ambar", { size: 44, style: "italic", color: GOLD }), W, 1404),
  ];
  await paper(W, H, 7).composite(layers).png().toFile(path.join(ART, "events", `${id}.png`));
}

/** Spine cloth with a silver-foil title. u = around the spine, v = along it. */
async function buildSpine() {
  const W = 240;
  const H = 1424;
  const base = [134, 160, 186];
  const buf = Buffer.alloc(W * H * 3);
  let seed = 3;
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const rows = Array.from({ length: H }, () => (rand() - 0.5) * 10);
  const cols = Array.from({ length: W }, () => (rand() - 0.5) * 8);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = rows[y] + cols[x] + (rand() - 0.5) * 10;
      for (let c = 0; c < 3; c++) buf[(y * W + x) * 3 + c] = Math.max(0, Math.min(255, base[c] + v));
    }
  }
  const title = await sharp((await text("RAJITHA  &  AMBAR", { size: 58, color: "#eef2f6", tracking: 0.22 })).input)
    .rotate(90, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer({ resolveWithObject: true });
  const rule = (h) =>
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}"><rect x="${W / 2 - 1}" y="0" width="2" height="${h}" fill="#e6ecf2"/><circle cx="${W / 2}" cy="${h / 2}" r="5" fill="#e6ecf2"/></svg>`,
    );
  await sharp(buf, { raw: { width: W, height: H, channels: 3 } })
    .composite([
      { input: title.data, left: Math.round((W - title.info.width) / 2), top: Math.round((H - title.info.height) / 2) },
      { input: rule(90), left: 0, top: 110 },
      { input: rule(90), left: 0, top: H - 200 },
    ])
    .png()
    .toFile(path.join(ART, "spine.png"));
}

/* -------------------------------- run ------------------------------- */

await mkdir(path.join(ART, "events"), { recursive: true });
await Promise.all([buildCover(), buildPocket(), buildInvitation(), buildSpine()]);
for (const id of Object.keys(STRIPS)) await buildEventCard(id);
console.log("Placeholder art written to /art");
