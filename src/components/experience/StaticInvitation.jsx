"use client";

import { useState } from "react";
import { EVENTS, TEXTURES, texturePath } from "@/config/book";
import styles from "./experience.module.css";

/**
 * Plain-HTML version for browsers without WebGL (or if the 3D scene fails).
 * Uses the same artwork, so it stays in sync with the book.
 */
export default function StaticInvitation() {
  const [opened, setOpened] = useState(false);
  const [active, setActive] = useState(null);
  const event = EVENTS.find((e) => e.id === active);
  const file = !opened ? TEXTURES.cover : event ? event.card : TEXTURES.invitation;

  return (
    <div className={styles.static}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={styles.staticImage}
        src={texturePath("sd", file)}
        alt={event ? `${event.label} details` : "Rajitha & Ambar invitation"}
      />
      <div className={styles.staticEvents}>
        {!opened ? (
          <button type="button" aria-pressed="true" onClick={() => setOpened(true)}>
            Click To Open
          </button>
        ) : (
          EVENTS.map((e) => (
            <button key={e.id} type="button" aria-pressed={active === e.id} onClick={() => setActive(active === e.id ? null : e.id)}>
              {e.label}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
