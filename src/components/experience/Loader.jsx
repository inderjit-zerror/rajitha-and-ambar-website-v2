"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useExperience } from "@/store/useExperience";
import { anim } from "./three/state";
import styles from "./experience.module.css";

/** Minimum time on screen, so a warm cache doesn't make it flash by. */
const MIN_VISIBLE_MS = 1400;

/**
 * Loading screen. The HTML part (server-rendered, so it paints before any
 * JavaScript arrives) shows the names and the real asset progress. Behind it,
 * once the 3D scene is up, WebGL draws the very same colour as a full-screen
 * "veil". When everything is compiled and uploaded the text slides out, the
 * HTML background is dropped, and the veil drains away like liquid
 * (shader: createVeilMaterial) to uncover the site.
 */
export default function Loader() {
  const progress = useExperience((s) => s.progress);
  const sceneReady = useExperience((s) => s.sceneReady);
  const [done, setDone] = useState(false);

  const root = useRef(null);
  const sheet = useRef(null);
  const count = useRef(null);
  const bar = useRef(null);
  const shown = useRef({ value: 0 });
  const startedAt = useRef(0);
  const leaving = useRef(false);

  useEffect(() => {
    startedAt.current = performance.now();
  }, []);

  useEffect(() => {
    const leave = () => {
      if (leaving.current) return;
      leaving.current = true;
      const { device, failed, setPhase } = useExperience.getState();
      const quick = Boolean(device?.reducedMotion);
      const wait = Math.max(0, MIN_VISIBLE_MS - (performance.now() - startedAt.current)) / 1000;
      const tl = gsap
        .timeline({ delay: wait, onComplete: () => setDone(true) })
        // contents slide out through their masks
        .to(root.current.querySelectorAll("[data-out]"), { yPercent: -115, duration: 0.7, ease: "power3.in", stagger: 0.05 })
        .to(root.current.querySelector("[data-fade]"), { autoAlpha: 0, duration: 0.4 }, 0)
        .call(() => setPhase("intro"), null, "-=0.1");

      if (failed) {
        tl.to(root.current, { autoAlpha: 0, duration: 0.6, ease: "power2.out" }); // no WebGL: plain fade
      } else {
        tl.set(sheet.current, { backgroundColor: "transparent" }) // hand over to the WebGL veil behind
          .to(anim, { veil: 1, duration: quick ? 0.7 : 2.0, ease: "power2.inOut" });
      }
    };

    gsap.to(shown.current, {
      value: sceneReady ? 100 : 2 + progress * 90,
      duration: sceneReady ? 0.6 : 1.1,
      ease: "power2.out",
      overwrite: true,
      onUpdate: () => {
        const v = shown.current.value;
        if (count.current) count.current.textContent = String(Math.round(v)).padStart(2, "0");
        if (bar.current) bar.current.style.transform = `scaleX(${v / 100})`;
      },
      onComplete: () => {
        if (sceneReady) leave();
      },
    });
  }, [progress, sceneReady]);

  if (done) return null;

  return (
    <div ref={root} className={styles.loader} role="status" aria-live="polite">
      <span className="sr-only">Loading the invitation</span>
      <div ref={sheet} className={styles.sheet}>
        <div className={styles.loaderTop} aria-hidden="true">
          <span className={styles.mask}>
            <span data-out="">R&amp;A</span>
          </span>
          <span className={styles.mask}>
            <span data-out="">Wedding Invitation</span>
          </span>
        </div>

        <div className={styles.loaderBottom} aria-hidden="true">
          <div className={styles.loaderNames}>
            <span className={styles.mask}>
              <span data-out="">Rajitha &amp; Ambar</span>
            </span>
            <span className={styles.mask}>
              <span data-out="" className={styles.loaderSub}>
                Cannes, France
              </span>
            </span>
          </div>
          <span className={`${styles.mask} ${styles.loaderCount}`}>
            <span data-out="">
              <span ref={count}>00</span>
              <i>%</i>
            </span>
          </span>
        </div>

        <span className={styles.loaderBar} data-fade="">
          <span ref={bar} />
        </span>
      </div>
    </div>
  );
}
