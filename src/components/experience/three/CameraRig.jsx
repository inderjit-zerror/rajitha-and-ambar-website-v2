"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import gsap from "gsap";
import { BOOK } from "@/config/book";
import { useExperience } from "@/store/useExperience";

export const FOV = 28;
const TAN = Math.tan((FOV * Math.PI) / 360);
const { board, pageX, spreadW } = BOOK;

/**
 * What each view frames (a box on the book's plane) and how many pixels the
 * HTML around it needs. The camera always looks straight at the backdrop.
 */
const VIEWS = {
  hero: (vw, vh, narrow) => ({
    box: { x: 0, y: 0, w: 1.62, h: 2.0 },
    top: narrow ? vh * 0.26 : Math.max(120, vh * 0.17),
    bottom: narrow ? Math.max(170, vh * 0.22) : Math.max(160, vh * 0.22),
    // wide screens: the book sits right of centre, the big title to its left
    left: narrow ? 30 : vw * 0.47,
    right: narrow ? 30 : vw * 0.07,
  }),
  spread: (vw, vh, narrow) => ({
    box: { x: 0, y: 0, w: spreadW + 0.08, h: board.h + 0.08 },
    top: Math.max(96, vh * 0.12),
    bottom: narrow ? 190 : Math.max(150, vh * 0.19),
    side: narrow ? 10 : Math.max(40, vw * 0.05),
  }),
  left: (vw, vh) => ({
    box: { x: -pageX, y: 0, w: board.w, h: board.h + 0.04 },
    top: Math.max(84, vh * 0.11),
    bottom: Math.max(170, vh * 0.2),
    side: 12,
  }),
  right: (vw, vh) => ({
    box: { x: pageX, y: 0, w: board.w, h: board.h + 0.04 },
    top: Math.max(84, vh * 0.11),
    bottom: Math.max(170, vh * 0.2),
    side: 12,
  }),
};

/** Camera distance + offset that fit the box inside the UI-safe area. */
function frame(key, vw, vh, narrow) {
  const { box, top, bottom, side = 0, left = side, right = side } = VIEWS[key](vw, vh, narrow);
  const availW = Math.max(120, vw - left - right);
  const availH = Math.max(120, vh - top - bottom);
  const d = Math.max((box.h * vh) / (2 * TAN * availH), (box.w * vh) / (2 * TAN * availW));
  const unitsPerPx = (2 * d * TAN) / vh;
  return {
    x: box.x - ((left - right) / 2) * unitsPerPx,
    y: box.y + ((top - bottom) / 2) * unitsPerPx,
    d,
  };
}

function viewFor(phase, narrow, view) {
  if (phase === "opening") return "spread";
  if (phase !== "open") return "hero";
  if (!narrow || view === "spread") return "spread";
  return view === "right" ? "right" : "left";
}

export default function CameraRig() {
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const phase = useExperience((s) => s.phase);
  const narrow = useExperience((s) => s.narrow);
  const view = useExperience((s) => s.view);
  const coarse = useExperience((s) => s.device.coarse);
  const reducedMotion = useExperience((s) => s.device.reducedMotion);

  const base = useRef(null);
  const lastKey = useRef(null);
  const drift = useRef({ x: 0, y: 0 });
  const key = viewFor(phase, narrow, view);

  useEffect(() => {
    const next = frame(key, width, height, narrow);
    const from = lastKey.current;
    lastKey.current = key;
    if (!base.current) {
      base.current = { ...next, d: next.d * 1.12 }; // starts a little further back; eases in with the intro
      return;
    }
    let duration = 0.5; // resize
    let ease = "power2.out";
    if (from === "hero" && key !== "hero") [duration, ease] = [2.0, "power3.inOut"];
    else if (key === "hero" && from !== "hero") [duration, ease] = [1.9, "power3.inOut"];
    else if (from !== key) [duration, ease] = [1.2, "power3.inOut"];
    gsap.to(base.current, { ...next, duration: reducedMotion ? Math.min(duration, 0.6) : duration, ease, overwrite: true });
  }, [key, width, height, narrow, reducedMotion]);

  // Dolly in as the book arrives.
  useEffect(() => {
    if (phase !== "intro" || !base.current) return;
    const { d } = frame("hero", width, height, narrow);
    gsap.to(base.current, { d, duration: reducedMotion ? 0.6 : 2.8, ease: "power3.out", overwrite: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useFrame((state, delta) => {
    const b = base.current;
    if (!b) return;
    // A whisper of parallax + a slow float. Moving the camera instead of the
    // book keeps the shadow map valid, so idle frames cost a single pass.
    const f = drift.current;
    const still = reducedMotion ? 0 : 1;
    f.x = THREE.MathUtils.damp(f.x, coarse ? 0 : state.pointer.x * 0.09 * still, 3, delta);
    f.y = THREE.MathUtils.damp(f.y, coarse ? 0 : state.pointer.y * 0.06 * still, 3, delta);
    const t = state.clock.elapsedTime;
    const x = b.x + f.x + Math.cos(t * 0.6) * 0.008 * still;
    const y = b.y + f.y + Math.sin(t * 0.85) * 0.014 * still;
    camera.position.set(x, y, b.d);
    camera.lookAt(b.x + f.x * 0.35, b.y + f.y * 0.35, 0);
  });

  return null;
}
