import { EVENTS, HERO_POSE } from "@/config/book";

const HALF_PI = Math.PI / 2;

/**
 * Live animation values: written by GSAP timelines and pointer input, read
 * once per frame by the meshes / shader uniforms. Plain objects, so nothing
 * here re-renders React.
 */
export const anim = {
  /** loading veil: 0 = covers the screen, 1 = drained away */
  veil: 0,
  /** book reveal wave: 0 = hidden, 1 = fully there (also fades the backdrop shadow in) */
  reveal: 0,
  /** the book's pose; starts slightly turned away and eases into the hero pose */
  pose: { x: 0, y: -0.06, z: 0, rx: HERO_POSE.rx + 0.16, ry: HERO_POSE.ry - 0.7, rz: HERO_POSE.rz + 0.08, s: 0.9 },
  /** hinge angles: HALF_PI = folded shut, 0 = lying open */
  front: HALF_PI,
  spine: HALF_PI,
  /** 0 closed → 1 open: recentres the book on its spine */
  open: 0,
  /** curvature of the front cover while it swings (0 = flat) */
  bend: 0,
  /** left card: paint 0 → 1 = painted in; mix 0 → 1 = print flowing into the next card */
  left: { paint: 0, mix: 0 },
  /** event cards in the pocket: paint 0 → 1 = painted in */
  cards: EVENTS.map(() => ({ paint: 0 })),
};

/** Pointer-driven values (see Controls). */
export const input = {
  /** drag-to-rotate offsets, with inertia */
  spin: { x: 0, y: 0, vx: 0, vy: 0, held: false, releasedAt: 0 },
  /** the book leans towards the cursor */
  tilt: { x: 0, y: 0 },
};

/** Shared flags between scene components. */
export const scene = {
  /** true while shaders compile behind the loader */
  warming: true,
  /** set when anything that casts a shadow moved this frame */
  shadowsDirty: true,
};

/** Call when something that casts a shadow has moved. */
export const touchShadows = () => {
  scene.shadowsDirty = true;
};
