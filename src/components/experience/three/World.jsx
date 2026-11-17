"use client";
/* eslint-disable react-hooks/immutability -- three.js objects are mutable by design; they are only changed inside frame callbacks / effects, never during render. */

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, useTexture } from "@react-three/drei";
import { BOOK, EVENTS, TEXTURES, texturePath } from "@/config/book";
import { useExperience } from "@/store/useExperience";
import { configureTexture, createCoverMaps, createLinenNormalMap } from "@/lib/textures";
import CameraRig from "./CameraRig";
import Controls from "./Controls";
import Book from "./Book";
import { FX, createVeilMaterial } from "./materials";
import { anim, scene as flags, touchShadows } from "./state";

function textureUrls(quality) {
  const urls = {};
  for (const [key, file] of Object.entries(TEXTURES)) urls[key] = texturePath(quality, file);
  for (const event of EVENTS) urls[event.id] = texturePath(quality, event.card);
  return urls;
}

/**
 * Studio lighting. Reflections come from a tiny environment that is rendered
 * once from a few light panels (no HDR download). One directional light casts
 * the real shadows inside the book (cover on panels, cards on cards); its
 * shadow camera hugs the book, so every texel counts. Low-end devices get a
 * plain hemisphere light and no shadow map.
 */
function Lighting({ envMap, shadowMap }) {
  return (
    <>
      {envMap > 0 ? (
        <Environment resolution={envMap} frames={1} environmentIntensity={0.95}>
          <color attach="background" args={["#a9bbd1"]} />
          <Lightformer form="rect" intensity={2.4} color="#fff3e0" position={[-5, 5, 6]} scale={[9, 7, 1]} target={[0, 0, 0]} />
          <Lightformer form="rect" intensity={0.9} color="#dce8ff" position={[7, 1, 4]} scale={[5, 9, 1]} target={[0, 0, 0]} />
          <Lightformer form="rect" intensity={1.3} color="#ffffff" position={[0, -6, 3]} scale={[12, 3, 1]} target={[0, 0, 0]} />
          <Lightformer form="ring" intensity={2} color="#ffffff" position={[2.5, 4, 8]} scale={3} target={[0, 0, 0]} />
        </Environment>
      ) : (
        <hemisphereLight args={["#f6f9ff", "#93a7c2", 2.1]} />
      )}
      <directionalLight
        position={[-2.6, 3.4, 5.6]}
        intensity={2.6}
        color="#fff6ea"
        castShadow={shadowMap > 0}
        shadow-mapSize-width={shadowMap || 512}
        shadow-mapSize-height={shadowMap || 512}
        shadow-radius={shadowMap >= 2048 ? 6 : 3.5}
        shadow-bias={-0.00012}
        shadow-normalBias={0.012}
      >
        <orthographicCamera attach="shadow-camera" args={[-1.9, 1.9, 1.9, -1.9, 3.5, 9.5]} />
      </directionalLight>
    </>
  );
}

/**
 * Loading veil: a full-screen quad drawn over everything in the loader's
 * colour. When loading is done it drains away like liquid (anim.veil 0 → 1,
 * see createVeilMaterial) and is then switched off. Also advances the clock
 * shared by all shader effects.
 */
function Veil() {
  const mesh = useRef();
  const material = useMemo(() => createVeilMaterial(), []);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ size }, delta) => {
    FX.uTime.value += Math.min(delta, 0.1);
    const gone = anim.veil >= 1;
    mesh.current.visible = !gone;
    if (gone) return;
    material.uniforms.uProgress.value = anim.veil;
    material.uniforms.uAspect.value = size.width / size.height;
  });

  return (
    <mesh ref={mesh} material={material} frustumCulled={false} renderOrder={1000}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

/** Re-renders the shadow map only on frames where something actually moved. */
function ShadowDriver() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
  }, [gl]);
  useFrame(() => {
    if (flags.shadowsDirty || flags.warming) {
      gl.shadowMap.needsUpdate = true;
      flags.shadowsDirty = false;
    }
  });
  return null;
}

export default function World() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const device = useExperience((s) => s.device);
  const setSceneReady = useExperience((s) => s.setSceneReady);

  const urls = useMemo(() => textureUrls(device.quality), [device.quality]);
  const textures = useTexture(urls);

  // Colour space / filtering before drei uploads the textures to the GPU.
  useLayoutEffect(() => {
    Object.values(textures).forEach((t) => configureTexture(t, device.anisotropy));
  }, [textures, device.anisotropy]);

  // Procedural maps: linen weave, and the cover's foil / emboss derived from its artwork.
  const maps = useMemo(() => {
    const cover = createCoverMaps(textures.cover.image, {
      size: device.quality === "hd" ? 512 : 256,
      foil: BOOK.foil,
    });
    return { ...textures, linen: createLinenNormalMap(256), coverNormal: cover.normalMap, coverOrm: cover.ormMap };
  }, [textures, device.quality]);

  useEffect(
    () => () => {
      maps.linen.dispose();
      maps.coverNormal.dispose();
      maps.coverOrm.dispose();
    },
    [maps],
  );

  // Warm-up behind the loading screen: compile every shader (including the
  // shadow pass) and upload every texture, so the first animated frame is free.
  useEffect(() => {
    let cancelled = false;
    flags.warming = true;
    const compiled = gl.compileAsync ? gl.compileAsync(scene, camera) : Promise.resolve(gl.compile(scene, camera));
    const afterFrames = (n, fn) => requestAnimationFrame(() => (n > 1 ? afterFrames(n - 1, fn) : fn()));
    compiled.then(() => {
      afterFrames(4, () => {
        if (cancelled) return;
        flags.warming = false;
        touchShadows();
        setSceneReady();
      });
    });
    return () => {
      cancelled = true;
    };
  }, [gl, scene, camera, setSceneReady]);

  return (
    <>
      <CameraRig />
      <Controls />
      <Lighting envMap={device.envMap} shadowMap={device.shadowMap} />

      <Book maps={maps} />
      <Veil />
      <ShadowDriver />
    </>
  );
}
