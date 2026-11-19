"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { TEXTURE_VERSION } from "@/config/textures.version";
import { useExperience } from "@/store/useExperience";
import { anim } from "./three/state";
import styles from "./experience.module.css";

/** Minimum time on screen, so the blessing is seen even on a warm cache. */
const MIN_VISIBLE_MS = 2200;

/** Source: /art/loader/blessing.png → `npm run textures` (see scripts/optimize-textures.mjs). */
const BLESSING_SRC = `/images/blessing.webp?v=${TEXTURE_VERSION}`;

/**
 * Loading screen: the blessing image in an arch, the couple's names and a
 * fine gold line that fills with the real asset progress.
 *
 * The HTML is server-rendered, so it paints before any JavaScript arrives.
 * Behind it, once the 3D scene is up, WebGL draws the very same colour as a
 * full-screen "veil". When everything is compiled and uploaded the content
 * leaves, the HTML background is dropped, and the veil drains away like
 * liquid (shader: createVeilMaterial) to uncover the site.
 */
export default function Loader() {
  const progress = useExperience((s) => s.progress);
  const sceneReady = useExperience((s) => s.sceneReady);
  const [done, setDone] = useState(false);

  const root = useRef(null);
  const sheet = useRef(null);
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
      const el = root.current;
      const tl = gsap
        .timeline({ delay: wait, onComplete: () => setDone(true) })
        // the image dims and eases back, the lines of text slide out through their masks
        .to(el.querySelectorAll("[data-fade]"), { autoAlpha: 0, scale: 0.96, duration: 0.7, ease: "power2.in" }, 0)
        .to(el.querySelectorAll("[data-out]"), { yPercent: -115, duration: 0.7, ease: "power3.in", stagger: 0.06 }, 0)
        .call(() => setPhase("intro"), null, "-=0.1");

      if (failed) {
        tl.to(el, { autoAlpha: 0, duration: 0.6, ease: "power2.out" }); // no WebGL: plain fade
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
        if (bar.current) bar.current.style.transform = `scaleX(${shown.current.value / 100})`;
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
        <div className={styles.loaderContent} aria-hidden="true">
          <div className={styles.arch} data-fade="">
            <span className={styles.archGlow} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={BLESSING_SRC} alt="" width="736" height="920" fetchPriority="high" decoding="async" />
          </div>

          <span className={styles.mask}>
            <span data-out="" className={styles.loaderNames}>
              Rajitha &amp; Ambar
            </span>
          </span>
          <span className={styles.mask}>
            <span data-out="" className={styles.loaderSub}>
              Cannes, France
            </span>
          </span>

          <span className={styles.loaderBar} data-fade="">
            <span ref={bar} />
          </span>
        </div>
      </div>
    </div>
  );
}
