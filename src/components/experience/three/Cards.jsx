"use client";
/* eslint-disable react-hooks/immutability -- three.js objects are mutable by design; they are only changed inside frame callbacks / effects, never during render. */

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import gsap from "gsap";
import { BOOK, EVENTS } from "@/config/book";
import { useExperience } from "@/store/useExperience";
import { createLeftCardMaterial, createPocketMaterial, createTabCardMaterial } from "./materials";
import { anim, touchShadows } from "./state";

const { board, innerZ, pageX, invitation, pocket } = BOOK;
const card = BOOK.eventCard;
/** the part of an event card that stands in the pocket (its top half) */
const TAB_H = card.h / 2;
const EVENT_ASPECT = card.w / card.h;

const pocketH = pocket.w / pocket.aspect;
const POCKET_Z = innerZ + 0.022;
const slotY = (i) => card.firstTop - i * card.step - TAB_H / 2;
const slotZ = (i) => innerZ + 0.004 + i * 0.004;

const stop = (e) => e.stopPropagation();
const paperProps = { castShadow: true, receiveShadow: true, frustumCulled: false };
const store = () => useExperience.getState();

/* ═════════════════════════════ Left card ═════════════════════════════
 * One card on the left panel (mounted on the front board by <Book>, so it
 * folds shut and flexes with the cover). It shows the invitation; when an
 * event is chosen its print turns liquid and flows into that event's card.
 * Shaders: `paint` (first appearance), `liquid` (content change), `bend`.   */

const LEFT_X = board.t / 2 - board.w / 2; // centre of the left panel, from the cover's hinge
const LEFT_Z = innerZ + 0.003;
const LEFT_ASPECT = invitation.w / invitation.h;

export function LeftCard({ maps, hinge }) {
  const activeEvent = useExperience((s) => s.activeEvent);
  const reducedMotion = useExperience((s) => s.device.reducedMotion);
  const flow = useRef(null);
  const lastSignature = useRef(-1);

  const part = useMemo(
    () => ({
      // enough vertices for the ripple and the cover's flex to stay smooth
      geometry: new THREE.PlaneGeometry(invitation.w, invitation.h, 28, 36),
      ...createLeftCardMaterial(maps.invitation, LEFT_ASPECT, [LEFT_ASPECT * 0.3, 0.72, LEFT_ASPECT * 0.7, 0.3], hinge, LEFT_Z),
    }),
    [maps, hinge],
  );
  useEffect(
    () => () => {
      part.geometry.dispose();
      part.material.dispose();
      part.depthMaterial.dispose();
    },
    [part],
  );

  // Content change: material.map (current print) flows into uMapB (next print).
  useEffect(() => {
    const { material, uniforms } = part;
    const event = EVENTS.find((e) => e.id === activeEvent);
    const next = event ? maps[event.id] : maps.invitation;

    if (flow.current) {
      // interrupted mid-flow: keep whichever print is mostly showing
      flow.current.kill();
      flow.current = null;
      if (anim.left.mix > 0.5) material.map = uniforms.uMapB.value;
      anim.left.mix = 0;
    }
    if (material.map === next) return;

    uniforms.uMapB.value = next;
    flow.current = gsap.to(anim.left, {
      mix: 1,
      duration: reducedMotion ? 0.5 : 1.8,
      ease: "power2.inOut",
      onComplete: () => {
        material.map = next;
        anim.left.mix = 0;
        flow.current = null;
      },
    });
  }, [activeEvent, maps, part, reducedMotion]);

  useFrame(() => {
    const { paint, mix } = anim.left;
    const signature = paint + mix * 3;
    if (signature === lastSignature.current && mix === 0) return; // at rest
    lastSignature.current = signature;
    part.uniforms.uPaint.value = paint;
    part.uniforms.uMix.value = mix;
    touchShadows();
  });

  return (
    <mesh
      geometry={part.geometry}
      material={part.material}
      customDepthMaterial={part.depthMaterial}
      position={[LEFT_X, 0, LEFT_Z]}
      onPointerOver={(e) => {
        e.stopPropagation();
        const s = store();
        if (s.phase === "open" && s.activeEvent) s.setCursor("back");
      }}
      onPointerOut={() => store().setCursor(null)}
      onClick={(e) => {
        e.stopPropagation();
        const s = store();
        if (e.delta < 6 && s.activeEvent) {
          s.setCursor(null);
          s.showInvitation();
        }
      }}
      {...paperProps}
    />
  );
}

/* ═══════════════════════ Pocket + event cards (right panel) ═══════════════════════ */

/** The top half of an event card: the part that shows above the pocket. */
function tabGeometry() {
  const g = new THREE.PlaneGeometry(card.w, TAB_H);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 0.5 + uv.getY(i) * 0.5); // upper half of the artwork
  return g;
}

/** Pocket with its angled top edge as real geometry, 3 mm thick. */
function pocketGeometry() {
  const [, notch, right] = pocket.edge;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(1, 0);
  shape.lineTo(1, right[1]);
  shape.lineTo(notch[0], notch[1]);
  shape.lineTo(0, 1);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.003, bevelEnabled: false });
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), p.getY(i)); // artwork spans the 0–1 shape
  g.translate(-0.5, -0.5, 0);
  return g;
}

/**
 * The pocket and the four event cards standing in it. Cards are "painted in"
 * after the first opening; hovering lifts one, the chosen one stays lifted.
 */
export default function Cards({ maps }) {
  const phase = useExperience((s) => s.phase);
  const activeEvent = useExperience((s) => s.activeEvent);
  const events = useThree((s) => s.events);

  const meshes = useRef([]);
  const local = useRef(EVENTS.map(() => ({ hover: 0, hoverTarget: 0, active: 0 })));
  const lastSignature = useRef(-1);
  const moving = useRef(false);

  const parts = useMemo(
    () => ({
      tabGeo: tabGeometry(),
      pocketGeo: pocketGeometry(),
      // each card gets its own pair of "brush touches" so no two paint in alike
      cards: EVENTS.map((e, i) =>
        createTabCardMaterial(maps[e.id], EVENT_ASPECT, [
          EVENT_ASPECT * (0.18 + i * 0.17),
          0.94,
          EVENT_ASPECT * (0.82 - i * 0.15),
          0.86,
        ]),
      ),
      pocket: createPocketMaterial(maps.pocket),
    }),
    [maps],
  );

  useEffect(
    () => () => {
      [parts.tabGeo, parts.pocketGeo, parts.pocket].forEach((x) => x.dispose());
      parts.cards.forEach((c) => {
        c.material.dispose();
        c.depthMaterial.dispose();
      });
    },
    [parts],
  );

  // First opening: once the cover has landed, the left card and then the four
  // event cards are painted in, one after another.
  useEffect(() => {
    if (phase !== "opening" || anim.left.paint > 0) return;
    const quick = store().device.reducedMotion;
    gsap
      .timeline({ delay: quick ? 0.6 : 1.65 })
      .to(anim.left, { paint: 1, duration: quick ? 0.6 : 1.8, ease: "power1.inOut" }, 0)
      .to(anim.cards, { paint: 1, duration: quick ? 0.6 : 1.3, ease: "power1.inOut", stagger: quick ? 0.05 : 0.17 }, 0.3);
  }, [phase]);

  useFrame((_, delta) => {
    const interactive = phase === "open";
    let signature = 0;

    for (let i = 0; i < EVENTS.length; i++) {
      const l = local.current[i];
      const paint = anim.cards[i].paint;
      l.hover = THREE.MathUtils.damp(l.hover, interactive ? l.hoverTarget : 0, 10, delta);
      l.active = THREE.MathUtils.damp(l.active, activeEvent === EVENTS[i].id ? 1 : 0, 7, delta);

      // a hovered card peeks out of the stack, the chosen one stays pulled up
      meshes.current[i].position.y = slotY(i) + l.hover * 0.03 + l.active * 0.07;
      parts.cards[i].uniforms.uPaint.value = paint;
      signature += paint * (i + 2) + l.hover * 0.37 + l.active * 0.71;
    }

    if (Math.abs(signature - lastSignature.current) > 1e-5) {
      lastSignature.current = signature;
      moving.current = true;
      touchShadows();
    } else if (moving.current) {
      // Cards have come to rest under a (possibly still) pointer: re-run the
      // hover test so cursor + hover state match what is there now.
      moving.current = false;
      events.update?.();
    }
  });

  return (
    <group>
      {EVENTS.map((event, i) => (
        <mesh
          key={event.id}
          ref={(el) => (meshes.current[i] = el)}
          geometry={parts.tabGeo}
          material={parts.cards[i].material}
          customDepthMaterial={parts.cards[i].depthMaterial}
          position={[pageX, slotY(i), slotZ(i)]}
          onPointerOver={(e) => {
            e.stopPropagation();
            if (store().phase !== "open" || anim.cards[i].paint < 1) return;
            local.current[i].hoverTarget = 1;
            store().setCursor("view");
          }}
          onPointerOut={() => {
            local.current[i].hoverTarget = 0;
            store().setCursor(null);
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (e.delta > 6 || anim.cards[i].paint < 1) return;
            store().selectEvent(event.id);
          }}
          {...paperProps}
        />
      ))}

      {/* The pocket swallows hover / clicks on the hidden parts of the cards. */}
      <mesh
        geometry={parts.pocketGeo}
        material={parts.pocket}
        position={[pageX, pocket.bottom + pocketH / 2, POCKET_Z]}
        scale={[pocket.w, pocketH, 1]}
        onPointerOver={stop}
        onPointerMove={stop}
        onClick={stop}
        {...paperProps}
      />
    </group>
  );
}
