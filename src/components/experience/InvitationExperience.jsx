"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { EVENTS } from "@/config/book";
import { detectDevice } from "@/lib/device";
import { useExperience } from "@/store/useExperience";
import Cursor from "./Cursor";
import Loader from "./Loader";
import Overlay from "./Overlay";
import StaticInvitation from "./StaticInvitation";
import styles from "./experience.module.css";

const loadScene = () => import("./Scene");
// Three.js is only needed in the browser: keep it out of the HTML/SSR bundle
// and start downloading it while React hydrates the loader.
const Scene = dynamic(loadScene, { ssr: false });
if (typeof window !== "undefined") loadScene();

/** Below this width / height ratio the camera frames one panel at a time. */
const NARROW_RATIO = 1.1;

/** The big title behind the book, split into letters for the masked reveal. */
const TITLE = ["Rajitha", "& Ambar"];

export default function InvitationExperience() {
  const device = useExperience((s) => s.device);
  const failed = useExperience((s) => s.failed);
  const phase = useExperience((s) => s.phase);
  const narrow = useExperience((s) => s.narrow);

  useEffect(() => {
    const { setDevice, setNarrow, setFailed } = useExperience.getState();
    const profile = detectDevice();
    setDevice(profile);
    if (!profile.webgl) setFailed();

    const onResize = () => setNarrow(window.innerWidth / window.innerHeight < NARROW_RATIO);
    onResize();
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Wide screens: the title is centred as a group, so the gap between the two
  // words is off-centre by half their difference in width. Measure it and let
  // CameraRig place the hero book there.
  const title = useRef(null);
  useEffect(() => {
    const el = title.current;
    if (!el) return;
    const { setTitleGapX } = useExperience.getState();
    const measure = () => {
      if (useExperience.getState().narrow) return setTitleGapX(0);
      const [a, b] = el.children;
      const gap = (a.getBoundingClientRect().right + b.getBoundingClientRect().left) / 2;
      setTitleGapX(gap - window.innerWidth / 2);
    };
    measure();
    document.fonts?.ready.then(measure);
    const ro = new ResizeObserver(measure);
    [el, ...el.children].forEach((node) => ro.observe(node));
    return () => ro.disconnect();
  }, [narrow]);

  return (
    <main className={styles.root} data-phase={phase} data-narrow={narrow ? "" : undefined}>
      {/* The canvas is invisible to crawlers and screen readers — this isn't. */}
      <section className="sr-only">
        <h1>Rajitha &amp; Ambar — Cannes, France</h1>
        <p>Om Ganeshaya Namaha</p>
        <p>
          Sri Penaka Venkata Ramprasad &amp; Smt. Subha Sri request the pleasure of your company at the wedding
          celebrations of Rajitha Penaka with Ambar Kumar, son of Sri Sharvan Kumar &amp; Smt. Seema Kumar. Cannes,
          France.
        </p>
        <h2>Events</h2>
        <ul>
          {EVENTS.map((e) => (
            <li key={e.id}>{e.label}</li>
          ))}
        </ul>
      </section>

      {/* Sits BEHIND the transparent WebGL canvas, so the book floats over it. */}
      <p ref={title} className={styles.title} aria-hidden="true">
        {TITLE.map((line, l) => (
          <span key={line} className={styles.titleLine}>
            {[...line].map((char, i) => (
              <span key={i} className={styles.letter} style={{ "--i": i + l * 3 }}>
                {char === " " ? " " : char}
              </span>
            ))}
          </span>
        ))}
      </p>

      <div className={`${styles.stage} ${device && !device.coarse ? styles.noCursor : ""}`} data-stage="" aria-hidden="true">
        {device && !failed && <Scene />}
      </div>

      {failed ? <StaticInvitation /> : <Overlay />}
      {!failed && <Cursor />}
      <Loader />
    </main>
  );
}
