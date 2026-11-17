"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useExperience } from "@/store/useExperience";
import styles from "./experience.module.css";

const LABELS = { open: "Open", view: "View", back: "Back" };

/**
 * A small follower that says what a click will do while the pointer is over
 * the 3D stage. Mouse / trackpad only. Position is written straight to the
 * DOM with gsap.quickTo — no React render per mouse move.
 */
export default function Cursor() {
  const fine = useExperience((s) => s.device && !s.device.coarse);
  const state = useExperience((s) => s.cursor);
  const ring = useRef(null);
  const [onStage, setOnStage] = useState(false);

  useEffect(() => {
    if (!fine) return;
    const x = gsap.quickTo(ring.current, "x", { duration: 0.35, ease: "power3.out" });
    const y = gsap.quickTo(ring.current, "y", { duration: 0.35, ease: "power3.out" });
    const move = (e) => {
      x(e.clientX);
      y(e.clientY);
    };
    const over = (e) => setOnStage(Boolean(e.target.closest?.("[data-stage]")));
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerover", over, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerover", over);
    };
  }, [fine]);

  if (!fine) return null;
  return (
    <div className={styles.cursor} data-visible={onStage} data-state={state ?? "idle"} aria-hidden="true">
      <div ref={ring} className={styles.cursorRing}>
        <span>{LABELS[state] ?? ""}</span>
      </div>
    </div>
  );
}
