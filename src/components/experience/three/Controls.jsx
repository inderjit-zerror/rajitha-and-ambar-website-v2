"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { EVENTS } from "@/config/book";
import { useExperience } from "@/store/useExperience";
import { input } from "./state";

const TAU = Math.PI * 2;
const { damp, clamp } = THREE.MathUtils;

/**
 * Direct manipulation of the book:
 *  · it leans towards the cursor
 *  · drag to rotate it (full turns while closed, a gentle swing while open),
 *    with inertia; it eases back to its pose when left alone
 *  · on phones, swipe left / right to switch between the two panels
 *  · keyboard: Enter opens · ← → / 1–4 pick an event · Esc goes back / closes
 */
export default function Controls() {
  const element = useThree((s) => s.events.connected);
  const touching = useRef(false);

  useEffect(() => {
    if (!element) return;
    let drag = null;

    const down = (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
      touching.current = true;
    };

    const move = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const now = performance.now();
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      const dt = Math.max(8, now - drag.t) / 1000;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.t = now;
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
      drag.moved = true;

      const store = useExperience.getState();
      const closed = store.phase === "closed";
      if (!closed && !(store.phase === "open" && !store.narrow)) return;

      const s = input.spin;
      const k = 5 / Math.max(640, element.clientWidth); // one screen-width ≈ 290°
      s.held = true;
      s.y += dx * k;
      s.x += dy * k * 0.7;
      s.vy = (dx * k) / dt;
      s.vx = (dy * k * 0.7) / dt;
      store.setCursor("drag");
    };

    const up = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const store = useExperience.getState();
      const dx = e.clientX - drag.x0;
      const dy = e.clientY - drag.y0;
      // phones: a sideways swipe turns to the other panel
      if (drag.moved && store.narrow && store.phase === "open" && Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) {
        store.setView(dx < 0 ? "right" : "left");
      }
      if (store.cursor === "drag") store.setCursor(null);
      input.spin.held = false;
      input.spin.releasedAt = performance.now();
      touching.current = e.pointerType === "mouse";
      drag = null;
    };

    element.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      element.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [element]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const store = useExperience.getState();
      const onControl = e.target instanceof HTMLElement && e.target.closest("button, a, input, textarea");
      if ((e.key === "Enter" || e.key === " ") && store.phase === "closed" && !onControl) {
        e.preventDefault();
        store.open();
      } else if (e.key === "Escape") {
        if (store.activeEvent) store.showInvitation();
        else store.close();
      } else if (store.phase === "open" && /^[1-4]$/.test(e.key)) {
        store.selectEvent(EVENTS[Number(e.key) - 1].id);
      } else if (store.phase === "open" && (e.key === "ArrowRight" || e.key === "ArrowLeft") && !onControl) {
        const step = e.key === "ArrowRight" ? 1 : -1;
        const index = EVENTS.findIndex((ev) => ev.id === store.activeEvent); // -1 = invitation
        const next = ((index + 1 + step + EVENTS.length + 1) % (EVENTS.length + 1)) - 1;
        if (next < 0) store.showInvitation();
        else if (EVENTS[next].id !== store.activeEvent) store.selectEvent(EVENTS[next].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useFrame((state, delta) => {
    const { phase, narrow, device } = useExperience.getState();
    const s = input.spin;
    const t = input.tilt;
    const closed = phase === "closed";
    const open = phase === "open" && !narrow;

    // Drag rotation: inertia after release, then ease back home.
    // (During the open / close animations the timelines own these values.)
    if (closed || open) {
      if (!s.held) {
        s.y += s.vy * delta;
        s.x += s.vx * delta;
        const friction = Math.exp(-4 * delta);
        s.vy *= friction;
        s.vx *= friction;
        if (performance.now() - s.releasedAt > 1400) {
          const home = closed ? Math.round(s.y / TAU) * TAU : 0; // nearest front-facing turn
          s.y = damp(s.y, home, 2.4, delta);
          s.x = damp(s.x, 0, 2.4, delta);
        }
      }
      s.x = clamp(s.x, closed ? -0.55 : -0.3, closed ? 0.55 : 0.3);
      if (open) s.y = clamp(s.y, -0.45, 0.45);
    }

    // The book leans towards the cursor (mouse: always; touch: while touching).
    const lean = (closed || phase === "open") && !s.held && !device.reducedMotion && (!device.coarse || touching.current);
    const amount = closed ? 1 : 0.4;
    t.x = damp(t.x, lean ? -state.pointer.y * 0.13 * amount : 0, 4, delta);
    t.y = damp(t.y, lean ? state.pointer.x * 0.24 * amount : 0, 4, delta);
  });

  return null;
}
