/**
 * Everything you are likely to change lives here.
 *
 * ─ Artwork ────────────────────────────────────────────────────────────────
 * Every printed surface of the folio is a mesh textured with one image.
 *   1. put your artwork in /art with the same file name (png / jpg / webp)
 *   2. run `npm run textures`  → /public/textures/hd + /sd (WebP, GPU-sized)
 *
 *   cover.png          1100 x 1420   front cover. Light lettering is turned
 *                                    into embossed foil automatically.
 *   spine.png           240 x 1424   spine cloth + title (reads top → bottom)
 *   invitation.png     1200 x 1616   invitation card (left panel)
 *   pocket.png         1036 x 552    pocket (right panel)
 *   events/<id>.png    1130 x 1500   event card. It sits FOLDED IN HALF in the
 *                                    pocket (only the top 240 px band shows)
 *                                    and unfolds on the left panel when chosen.
 *                                    Keep text away from the centre fold line.
 */

import { TEXTURE_VERSION } from "./textures.version";

export const TEXTURES = {
  cover: "cover.webp",
  spine: "spine.webp",
  invitation: "invitation.webp",
  pocket: "pocket.webp",
};

/** The four event cards, back → front in the pocket (top → bottom on screen). */
export const EVENTS = [
  { id: "sangeet", label: "Sangeet", card: "events/sangeet.webp" },
  { id: "varmala", label: "Varmala", card: "events/varmala.webp" },
  { id: "wedding", label: "Wedding", card: "events/wedding.webp" },
  { id: "reception", label: "Reception", card: "events/reception.webp" },
];

/** Versioned URL — changes whenever `npm run textures` produces different files. */
export const texturePath = (quality, file) => `/textures/${quality}/${file}?v=${TEXTURE_VERSION}`;

/* ─ Folio geometry (world units). Lying open, the folio is in the XY plane,
 *   inner faces towards +z, spine centred on x = 0. ─────────────────────── */
const board = { w: 1.36, h: 1.78, t: 0.044 }; // padded boards, fully rounded edges
const spine = { span: 0.09, t: 0.03 }; // span = distance between the two hinge axes
const r = board.t / 2;

export const BOOK = {
  board,
  spine,
  /** x of a panel's centre when open (mirror for the left panel) */
  pageX: spine.span / 2 + board.w / 2 - r,
  /** height of the inner faces above the hinge plane */
  innerZ: r,
  spreadW: spine.span + 2 * (board.w - r),
  /** linear-luminance range of the cover artwork that becomes foil */
  foil: [0.42, 0.62],

  invitation: { w: 1.15, h: 1.55 },
  /** event card: full size, and how the folded cards are staggered in the pocket */
  eventCard: { w: 1.13, h: 1.5, firstTop: 0.8, step: 0.24 },
  pocket: {
    w: 1.27,
    bottom: -0.83,
    /** artwork aspect (w / h) */
    aspect: 518 / 276,
    /** top edge in 0–1 pocket space: left corner, notch, right corner */
    edge: [
      [0, 1],
      [0.7625, 0.837],
      [1, 0.975],
    ],
  },
};

/** How the closed folio is presented in the hero (radians, order YXZ). */
export const HERO_POSE = { rx: 0.2, ry: 0.52, rz: -0.05 };

export const COLORS = {
  linen: "#7f99b0",
  paper: "#f1eadf",
  /** tint of the soft shadows on the backdrop */
  shadow: "#1d3470",
  /** loading screen (must match the loader's CSS) and the lighter liquid behind it */
  veil: "#14265c",
  veilLight: "#8fa9c6",
};
