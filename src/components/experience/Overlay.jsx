"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { EVENTS } from "@/config/book";
import { useExperience } from "@/store/useExperience";
import styles from "./experience.module.css";

const cx = (...c) => c.filter(Boolean).join(" ");

/** The button drifts towards the cursor while it is near (mouse only). */
function useMagnet(enabled) {
  const zone = useRef(null);
  const target = useRef(null);
  useEffect(() => {
    const area = zone.current;
    const el = target.current;
    if (!enabled || !area || !el) return;
    const x = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3.out" });
    const y = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3.out" });
    const move = (e) => {
      const r = area.getBoundingClientRect();
      x((e.clientX - (r.left + r.width / 2)) * 0.28);
      y((e.clientY - (r.top + r.height / 2)) * 0.38);
    };
    const leave = () => {
      x(0);
      y(0);
    };
    area.addEventListener("pointermove", move);
    area.addEventListener("pointerleave", leave);
    return () => {
      area.removeEventListener("pointermove", move);
      area.removeEventListener("pointerleave", leave);
    };
  }, [enabled]);
  return [zone, target];
}

/** All HTML on top of the canvas. Shown / hidden with CSS transitions only. */
export default function Overlay() {
  const phase = useExperience((s) => s.phase);
  const activeEvent = useExperience((s) => s.activeEvent);
  const narrow = useExperience((s) => s.narrow);
  const view = useExperience((s) => s.view);
  const coarse = useExperience((s) => s.device?.coarse);
  const open = useExperience((s) => s.open);
  const close = useExperience((s) => s.close);
  const selectEvent = useExperience((s) => s.selectEvent);
  const showInvitation = useExperience((s) => s.showInvitation);
  const setView = useExperience((s) => s.setView);

  const closed = phase === "closed";
  const isOpen = phase === "open";
  const active = EVENTS.findIndex((e) => e.id === activeEvent); // -1 = invitation
  const [magnetZone, magnetTarget] = useMagnet(coarse === false);

  return (
    <div className={styles.ui}>
      <header className={styles.nav}>
        <div className={styles.navEnd}>
          <span className={cx(styles.navMeta, isOpen && styles.gone)}>Wedding Invitation</span>
          <button type="button" className={cx(styles.close, isOpen && styles.on)} onClick={close} tabIndex={isOpen ? 0 : -1} aria-hidden={!isOpen}>
            Close
            <span aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* ── Closed: hero bar ─────────────────────────────────────────── */}
      <div className={cx(styles.bar, closed && styles.on)} aria-hidden={!closed}>
        <p className={styles.barStart}>
          <strong>Cannes, France</strong>
          <span>The wedding celebrations</span>
        </p>

        <div ref={magnetZone} className={styles.magnetZone}>
          <button ref={magnetTarget} type="button" className={styles.cta} onClick={open} tabIndex={closed ? 0 : -1}>
            <span className={styles.ctaLabel}>Click To Open</span>
            <span className={styles.ctaIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 17 17 7M9 7h8v8" />
              </svg>
            </span>
          </button>
        </div>

        <p className={styles.barEnd}>
          <span className={styles.dragIcon} aria-hidden="true" />
          {coarse ? "Drag to rotate" : "Drag to rotate · move to tilt"}
        </p>
      </div>

      {/* ── Open: event tabs ─────────────────────────────────────────── */}
      <div className={cx(styles.bar, styles.openBar, isOpen && styles.on)} aria-hidden={!isOpen}>
        <div className={styles.tabs} role="tablist" aria-label="Cards" style={{ "--index": active + 1, "--count": EVENTS.length + 1 }}>
          <span className={styles.glider} aria-hidden="true" />
          <button type="button" role="tab" aria-selected={active < 0} className={cx(styles.tab, active < 0 && styles.tabOn)} onClick={showInvitation} tabIndex={isOpen ? 0 : -1}>
            Invitation
          </button>
          {EVENTS.map((event, i) => (
            <button
              key={event.id}
              type="button"
              role="tab"
              aria-selected={active === i}
              className={cx(styles.tab, active === i && styles.tabOn)}
              onClick={() => active !== i && selectEvent(event.id)}
              tabIndex={isOpen ? 0 : -1}
            >
              {event.label}
            </button>
          ))}
        </div>
      </div>

      {/* Phones: which panel is in view */}
      {narrow && (
        <div className={cx(styles.dots, isOpen && styles.on)}>
          <button type="button" aria-label="Left panel" className={cx(view !== "right" && styles.dotOn)} onClick={() => setView("left")} tabIndex={isOpen ? 0 : -1} />
          <button type="button" aria-label="Right panel" className={cx(view === "right" && styles.dotOn)} onClick={() => setView("right")} tabIndex={isOpen ? 0 : -1} />
        </div>
      )}
    </div>
  );
}
