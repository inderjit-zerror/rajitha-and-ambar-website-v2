import { create } from "zustand";

/**
 * UI-level state only. Per-frame animation values live in three/state.js so
 * that animating never re-renders React.
 *
 * phase:  loading → intro (book flies in) → closed (hero)
 *         → opening → open ⇄ closing → closed
 * view:   which panel the camera frames on narrow / portrait screens
 * cursor: label for the custom cursor ("open" | "view" | "back" | "drag" | null)
 */
export const useExperience = create((set, get) => ({
  device: null,
  narrow: false,
  progress: 0,
  sceneReady: false,
  /** WebGL missing or the scene crashed → static HTML invitation */
  failed: false,
  phase: "loading",
  activeEvent: null,
  view: "spread",
  cursor: null,
  /** px from the screen centre to the gap in the big title (wide screens) — the hero book sits there */
  titleGapX: 0,

  setDevice: (device) => set({ device }),
  setTitleGapX: (titleGapX) => {
    if (Math.abs(get().titleGapX - titleGapX) > 0.5) set({ titleGapX });
  },
  setNarrow: (narrow) => set({ narrow }),
  setProgress: (progress) => set({ progress }),
  setSceneReady: () => set({ sceneReady: true }),
  setFailed: () => set({ failed: true, sceneReady: true }),
  setPhase: (phase) => set({ phase }),
  setView: (view) => set({ view }),
  setCursor: (cursor) => {
    if (get().cursor !== cursor) set({ cursor });
  },

  open: () => {
    if (get().phase === "closed") set({ phase: "opening", cursor: null });
  },

  close: () => {
    const { phase, activeEvent } = get();
    if (phase !== "open") return;
    set({ activeEvent: null, view: "spread", cursor: null });
    // give a placed card time to fold up and slip back into the pocket
    setTimeout(
      () => {
        if (get().phase === "open") set({ phase: "closing" });
      },
      activeEvent ? 1500 : 0,
    );
  },

  /** Picks an event card; picking the active one again puts it back. */
  selectEvent: (id) => {
    const { phase, activeEvent, narrow } = get();
    if (phase !== "open") return;
    set({ activeEvent: activeEvent === id ? null : id, ...(narrow ? { view: "left" } : {}) });
  },

  showInvitation: () => {
    if (get().phase !== "open") return;
    set({ activeEvent: null, ...(get().narrow ? { view: "left" } : {}) });
  },
}));
