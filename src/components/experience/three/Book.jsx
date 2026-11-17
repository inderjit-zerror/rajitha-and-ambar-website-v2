"use client";
/* eslint-disable react-hooks/immutability -- three.js objects are mutable by design; they are only changed inside frame callbacks / effects, never during render. */

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferGeometry, Float32BufferAttribute, PlaneGeometry } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { TessellateModifier } from "three/examples/jsm/modifiers/TessellateModifier.js";
import gsap from "gsap";
import { BOOK, HERO_POSE } from "@/config/book";
import { useExperience } from "@/store/useExperience";
import {
  FX,
  createBackdropShadowMaterial,
  createBendDepthMaterial,
  createClothMaterial,
  createCoverMaterial,
} from "./materials";
import { anim, input, touchShadows } from "./state";
import Cards, { LeftCard } from "./Cards";

const { board, spine, pageX, spreadW } = BOOK;
const HALF_PI = Math.PI / 2;
const TAU = Math.PI * 2;
const EDGE = board.t / 2; // boards have fully rounded edges of this radius
const THICKNESS = spine.span + board.t;
/** distance of the (invisible) backdrop behind the book */
const BACKDROP_Z = -0.8;
/** x of the cover's hinge, measured in the front board's own geometry */
const FRONT_HINGE = board.w / 2 - EDGE;

/**
 * Cloth-covered slab with fully rounded edges. UVs are a flat projection, so
 * artwork wraps over the rounded edge like real book cloth. Material slot 0 =
 * edges + inner face, slot 1 = outer face (cover / spine artwork).
 */
function slabGeometry(w, h, t, segments) {
  const g = new RoundedBoxGeometry(w, h, t, segments, t / 2);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 - p.getX(i) / w, p.getY(i) / h + 0.5);
  const face = p.count / 6; // BoxGeometry order: +x, -x, +y, -y, +z, -z
  g.clearGroups();
  g.addGroup(0, face * 5, 0);
  g.addGroup(face * 5, face, 1);
  return g;
}

/**
 * The same slab split into [shell, outer face] and finely tessellated, so the
 * front cover can flex smoothly in the vertex shader (see `bend`).
 */
function flexSlabGeometries(w, h, t) {
  const slab = slabGeometry(w, h, t, 3);
  const tessellate = new TessellateModifier(0.1, 12);
  const parts = slab.groups.map(({ start, count }) => {
    const part = new BufferGeometry();
    for (const name of ["position", "normal", "uv"]) {
      const a = slab.attributes[name];
      part.setAttribute(
        name,
        new Float32BufferAttribute(a.array.slice(start * a.itemSize, (start + count) * a.itemSize), a.itemSize),
      );
    }
    const fine = tessellate.modify(part);
    part.dispose();
    return fine;
  });
  slab.dispose();
  return parts;
}

/**
 * The folio: two padded boards and a spine joined by two real hinges.
 *
 *   rig            pose in the hero, leans towards the cursor, spins when dragged
 *   └─ stage       slides so the closed book / the open spread is centred
 *      ├─ back board (right panel)  + pocket + event cards
 *      └─ spinePivot   hinge A  (HALF_PI shut → 0 open)
 *         ├─ spine
 *         └─ frontPivot hinge B (HALF_PI shut → 0 open)
 *            └─ front board (cover artwork outside, left panel inside) + left card
 *
 * Both hinge axes run through the centre of the boards' rounded edges, so the
 * joints stay closed at every angle. The front board also flexes while it
 * swings (vertex shader), and the whole book first appears behind a glowing
 * wave (fragment shader).
 */
export default function Book({ maps }) {
  const phase = useExperience((s) => s.phase);
  const setPhase = useExperience((s) => s.setPhase);
  const reducedMotion = useExperience((s) => s.device.reducedMotion);

  const rig = useRef();
  const stage = useRef();
  const spinePivot = useRef();
  const frontPivot = useRef();
  const shadow = useRef();
  const timelines = useRef([]);
  const lastSignature = useRef(0);

  const parts = useMemo(() => {
    const repeat = [board.w * 3.2, board.h * 3.2];
    const cloth = createClothMaterial(maps.linen, ...repeat);
    const [frontShellGeo, frontFaceGeo] = flexSlabGeometries(board.w, board.h, board.t);
    return {
      boardGeo: slabGeometry(board.w, board.h, board.t, 3),
      spineGeo: slabGeometry(spine.span + spine.t, board.h, spine.t, 2),
      frontShellGeo,
      frontFaceGeo,
      shadowGeo: new PlaneGeometry(1, 1),
      back: [cloth, cloth],
      spine: [
        createClothMaterial(maps.linen, spine.span * 3.2, repeat[1]),
        createClothMaterial(maps.linen, spine.span * 3.2, repeat[1], { map: maps.spine }),
      ],
      frontShell: createClothMaterial(maps.linen, ...repeat, { hinge: FRONT_HINGE }),
      frontFace: createCoverMaterial(
        { map: maps.cover, normalMap: maps.coverNormal, ormMap: maps.coverOrm },
        FRONT_HINGE,
      ),
      frontDepth: createBendDepthMaterial(FRONT_HINGE),
      shadow: createBackdropShadowMaterial(),
    };
  }, [maps]);

  useEffect(
    () => () => {
      [parts.boardGeo, parts.spineGeo, parts.frontShellGeo, parts.frontFaceGeo, parts.shadowGeo].forEach((g) =>
        g.dispose(),
      );
      [...parts.back, ...parts.spine, parts.frontShell, parts.frontFace, parts.frontDepth, parts.shadow].forEach(
        (m) => m.dispose(),
      );
    },
    [parts],
  );

  // Yaw around the vertical axis first, like a turntable.
  useLayoutEffect(() => {
    rig.current.rotation.order = "YXZ";
  }, []);

  /* ───────────────────────────── timelines ───────────────────────────── */

  useEffect(() => {
    const list = timelines.current;
    const pose = anim.pose;
    const spin = input.spin;
    const d = reducedMotion ? 0.4 : 1;

    if (phase === "intro") {
      // The loading veil is draining upwards; the book appears in its wake,
      // behind a glowing wave, while it turns the last few degrees into place.
      list.push(
        gsap
          .timeline()
          .to(anim, { reveal: 1, duration: 2.4 * d, ease: "power1.inOut" }, 0.7 * d)
          .to(pose, { ...HERO_POSE, x: 0, y: 0, s: 1, duration: 3.2 * d, ease: "power3.out" }, 0.5 * d)
          .call(() => setPhase("closed"), null, 2.6 * d),
      );
    }

    if (phase === "opening") {
      spin.y -= Math.round(spin.y / TAU) * TAU; // drop whole turns from dragging
      spin.vx = spin.vy = 0;
      const firstTime = anim.left.paint < 1; // the cards are still to be painted in
      list.push(
        gsap
          .timeline()
          // make sure the book is fully there, and turn it to face the viewer…
          .to(anim, { reveal: 1, duration: 0.4 * d, overwrite: "auto" }, 0)
          .to(spin, { x: 0, y: 0, duration: 0.9 * d, ease: "power3.out", overwrite: true }, 0)
          .to(pose, { x: 0, y: 0, z: 0, rx: 0.05, ry: 0, rz: 0, s: 1, duration: 1.5 * d, ease: "power3.inOut", overwrite: true }, 0)
          // …the cover lifts on its own hinge first, then the spine lets it fall open
          .to(anim, { front: 0, duration: 1.3 * d, ease: "power3.inOut" }, 0.3 * d)
          .to(anim, { spine: 0, duration: 1.25 * d, ease: "power3.inOut" }, 0.62 * d)
          .to(anim, { open: 1, duration: 1.6 * d, ease: "power2.inOut" }, 0.3 * d)
          // the cover flexes as it is pulled open: its free edge trails behind,
          // swings a touch past flat as it lands, then settles
          .to(anim, { bend: 0.26, duration: 0.8 * d, ease: "sine.out" }, 0.3 * d)
          .to(anim, { bend: -0.06, duration: 0.75 * d, ease: "sine.inOut" }, 1.1 * d)
          .to(anim, { bend: 0, duration: 0.7 * d, ease: "sine.out" }, 1.85 * d)
          .call(() => setPhase("open"), null, 1.9 * d)
          // phones show one panel at a time: settle on the left card
          .call(
            () => {
              const store = useExperience.getState();
              if (store.narrow && store.phase === "open" && store.view === "spread") store.setView("left");
            },
            null,
            (firstTime ? 3.6 : 2.3) * d,
          ),
      );
    }

    if (phase === "closing") {
      spin.vx = spin.vy = 0;
      list.push(
        gsap
          .timeline({ onComplete: () => setPhase("closed") })
          .to(spin, { x: 0, y: 0, duration: 0.6 * d, ease: "power3.out", overwrite: true }, 0)
          .to(anim, { spine: HALF_PI, duration: 1.2 * d, ease: "power3.inOut" }, 0)
          .to(anim, { front: HALF_PI, duration: 1.25 * d, ease: "power3.inOut" }, 0.32 * d)
          .to(anim, { open: 0, duration: 1.5 * d, ease: "power2.inOut" }, 0.1 * d)
          .to(anim, { bend: -0.2, duration: 0.7 * d, ease: "sine.out" }, 0.05 * d)
          .to(anim, { bend: 0.04, duration: 0.7 * d, ease: "sine.inOut" }, 0.8 * d)
          .to(anim, { bend: 0, duration: 0.5 * d, ease: "sine.out" }, 1.5 * d)
          .to(pose, { ...HERO_POSE, duration: 1.7 * d, ease: "power3.inOut", overwrite: true }, 0.25 * d),
      );
    }
  }, [phase, reducedMotion, setPhase]);

  useEffect(() => {
    const list = timelines.current;
    return () => list.forEach((t) => t.kill());
  }, []);

  /* ──────────────────────────── per-frame drive ──────────────────────────── */

  useFrame(() => {
    const g = rig.current;
    const p = anim.pose;
    const { spin, tilt } = input;

    g.position.set(p.x, p.y, p.z);
    g.rotation.set(p.rx + tilt.x + spin.x, p.ry + tilt.y + spin.y, p.rz);
    g.scale.setScalar(p.s);

    spinePivot.current.rotation.y = anim.spine;
    frontPivot.current.rotation.y = anim.front;
    FX.uReveal.value = anim.reveal;
    FX.uCoverBend.value = anim.bend;

    // closed: the book's own centre sits on the rig origin; open: its spine does
    const shut = 1 - anim.open;
    stage.current.position.set(-pageX * shut, 0, (-spine.span / 2) * shut);

    // Soft shadow on the backdrop: the book's footprint as the light sees it,
    // so it narrows as the book turns edge-on and widens as it opens.
    const yaw = Math.abs(Math.cos(g.rotation.y));
    const pitch = Math.abs(Math.cos(g.rotation.x));
    const width = board.w + (spreadW - board.w) * anim.open;
    const su = parts.shadow.uniforms;
    su.uSize.value.set(
      (width * yaw + THICKNESS * (1 - yaw)) * p.s,
      (board.h * pitch + THICKNESS * (1 - pitch)) * p.s,
    );
    su.uOpacity.value = anim.reveal * 0.34;
    shadow.current.position.set(p.x + 0.17, p.y - 0.24, BACKDROP_Z);
    shadow.current.rotation.z = g.rotation.z;

    // Re-render the shadow map only on frames where the book actually moved.
    const signature =
      g.rotation.x * 3.1 + g.rotation.y * 5.3 + g.rotation.z * 7.7 + p.x + p.y * 1.7 + p.z * 2.9 + p.s * 4.3 +
      anim.front * 11 + anim.spine * 13 + anim.open * 17 + anim.bend * 19; // prettier-ignore
    if (Math.abs(signature - lastSignature.current) > 1e-5) {
      lastSignature.current = signature;
      touchShadows();
    }
  });

  /* Hover / click on the closed book opens it (a drag is not a click). */
  const handlers = {
    onPointerOver: (e) => {
      e.stopPropagation();
      if (useExperience.getState().phase === "closed") useExperience.getState().setCursor("open");
    },
    onPointerOut: () => useExperience.getState().setCursor(null),
    onClick: (e) => {
      e.stopPropagation();
      if (e.delta < 6) useExperience.getState().open();
    },
  };

  const solid = { castShadow: true, receiveShadow: true, frustumCulled: false };
  const frontAt = [-FRONT_HINGE, 0, 0];

  return (
    <>
      <mesh ref={shadow} geometry={parts.shadowGeo} material={parts.shadow} frustumCulled={false} />

      <group ref={rig} {...handlers}>
        <group ref={stage}>
          <mesh geometry={parts.boardGeo} material={parts.back} position={[pageX, 0, 0]} {...solid} />

          <group ref={spinePivot} position={[spine.span / 2, 0, 0]}>
            <mesh geometry={parts.spineGeo} material={parts.spine} position={[-spine.span / 2, 0, 0]} {...solid} />
            <group ref={frontPivot} position={[-spine.span, 0, 0]}>
              <mesh
                geometry={parts.frontShellGeo}
                material={parts.frontShell}
                customDepthMaterial={parts.frontDepth}
                position={frontAt}
                {...solid}
              />
              <mesh
                geometry={parts.frontFaceGeo}
                material={parts.frontFace}
                customDepthMaterial={parts.frontDepth}
                position={frontAt}
                {...solid}
              />
              {/* mounted on the front board, so it folds shut (and flexes) with the cover */}
              <LeftCard maps={maps} hinge={FRONT_HINGE} />
            </group>
          </group>

          <Cards maps={maps} />
        </group>
      </group>
    </>
  );
}
