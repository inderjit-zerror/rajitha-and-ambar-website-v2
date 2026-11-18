import * as THREE from "three";
import { COLORS } from "@/config/book";

/* ═══════════════════════════════════════════════════════════════════════════
 * Every animation effect is a small GLSL patch injected into three's
 * physically-based material (and, where the shape changes, into its depth
 * material) — so reveals, bends and liquid transitions are lit, reflected and
 * shadowed exactly like the rest of the book.
 *
 *   bend     the front cover flexes while it swings           (vertex)
 *   paint    cards appear like watercolour soaking into paper (fragment)
 *   liquid   the left card's print flows into the next one    (vertex + fragment)
 *   veil     the loading screen drains away like liquid       (full-screen quad)
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Uniforms shared by reference: one write per frame updates every material. */
export const FX = {
  uCoverBend: { value: 0 }, // curvature of the front board (1 / radius)
  uTime: { value: 0 },
};

const after = (src, anchor, code) => src.replace(anchor, `${anchor}\n${code}`);

const NOISE = /* glsl */ `
  #ifndef FX_NOISE
  #define FX_NOISE
  float fxHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float fxNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(fxHash(i), fxHash(i + vec2(1.0, 0.0)), u.x),
               mix(fxHash(i + vec2(0.0, 1.0)), fxHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fxFbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) { v += a * fxNoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
    return v / 0.875;
  }
  #endif
`;

/* ───────────────────────── bend: flexing cover ───────────────────────── */

/**
 * Bends geometry around the hinge it hangs from (an axis parallel to y).
 *   hinge  x of the hinge in the mesh's own space
 *   lift   how far the mesh origin sits above the hinge plane
 * The centre line follows a circular arc of curvature uCoverBend, so the
 * length of the board is preserved — it flexes, it doesn't stretch.
 */
const bend = (hinge, lift = 0) => (shader) => {
  shader.uniforms.uCoverBend = FX.uCoverBend;
  shader.vertexShader = after(
    shader.vertexShader,
    "#include <common>",
    /* glsl */ `
      uniform float uCoverBend;
      const float BEND_HINGE = ${hinge.toFixed(5)};
      const float BEND_LIFT = ${lift.toFixed(5)};
    `,
  );
  shader.vertexShader = after(
    shader.vertexShader,
    "#include <beginnormal_vertex>",
    /* glsl */ `
      if (uCoverBend != 0.0 && position.x < BEND_HINGE) {
        float bendAngle = uCoverBend * (BEND_HINGE - position.x);
        float bs = sin(bendAngle);
        float bc = cos(bendAngle);
        objectNormal = vec3(objectNormal.x * bc + objectNormal.z * bs, objectNormal.y, objectNormal.z * bc - objectNormal.x * bs);
      }
    `,
  );
  shader.vertexShader = after(
    shader.vertexShader,
    "#include <begin_vertex>",
    /* glsl */ `
      if (uCoverBend != 0.0 && transformed.x < BEND_HINGE) {
        float bendAngle = uCoverBend * (BEND_HINGE - transformed.x);
        float bs = sin(bendAngle);
        float bc = cos(bendAngle);
        float height = transformed.z + BEND_LIFT;
        transformed.x = BEND_HINGE - bs / uCoverBend + height * bs;
        transformed.z = (1.0 - bc) / uCoverBend + height * bc - BEND_LIFT;
      }
    `,
  );
};

/* ───────────────────────── paint: watercolour reveal ───────────────────────── */

const paint = (uniforms, { color = true } = {}) => (shader) => {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = after(shader.vertexShader, "#include <common>", "varying vec2 vFxUv;");
  shader.vertexShader = after(shader.vertexShader, "#include <project_vertex>", "vFxUv = uv;");
  shader.fragmentShader = after(
    shader.fragmentShader,
    "#include <common>",
    /* glsl */ `
      ${NOISE}
      uniform float uPaint;
      uniform vec4 uPaintSeeds;   // two brush touches (x, y, x, y) in aspect-corrected uv
      uniform float uPaintAspect;
      varying vec2 vFxUv;
      float fxWetEdge = 0.0;
    `,
  );
  shader.fragmentShader = after(
    shader.fragmentShader,
    "#include <clipping_planes_fragment>",
    /* glsl */ `
      if (uPaint < 1.0) {
        // Colour spreads out from two brush touches; its edge is broken up the
        // way pigment creeps through wet paper.
        vec2 q = vFxUv * vec2(uPaintAspect, 1.0);
        float reach = min(length(q - uPaintSeeds.xy), length(q - uPaintSeeds.zw) * 1.15);
        float field = reach * 0.9 + (fxFbm(q * 3.4 + uPaintSeeds.xy * 9.0) - 0.5) * 0.55;
        float d = uPaint * 1.75 - 0.3 - field;
        if (d + (fxHash(gl_FragCoord.xy) - 0.5) * 0.02 < 0.0) discard;
        fxWetEdge = 1.0 - smoothstep(0.0, 0.13, d);
      }
    `,
  );
  if (color) {
    // pigment gathers at the wet edge: darker, bluer rim
    shader.fragmentShader = after(
      shader.fragmentShader,
      "#include <map_fragment>",
      "diffuseColor.rgb *= mix(vec3(1.0), vec3(0.58, 0.7, 0.92), fxWetEdge * 0.9);",
    );
  }
};

/* ───────────────────────── liquid: print flows into the next ───────────────────────── */

const LIQUID_MAP = /* glsl */ `
  #ifdef USE_MAP
    vec4 sampledDiffuseColor;
    if (uMix > 0.0) {
      fxWet = sin(uMix * PI);
      vec2 q = vMapUv * vec2(uPaintAspect, 1.0);
      vec2 flow = vec2(fxFbm(q * 2.4 + vec2(0.0, uTime * 0.32)), fxFbm(q * 2.4 + vec2(5.2, -uTime * 0.27))) - 0.5;
      vec2 hold = smoothstep(0.0, 0.12, vMapUv) * smoothstep(0.0, 0.12, 1.0 - vMapUv);
      flow *= hold.x * hold.y; // the print stays pinned at the card's edges
      fxFlow = flow * fxWet;

      // The old print is carried away by the current, the new one settles out of it.
      vec2 uvA = vMapUv + flow * (0.34 * uMix + 0.06 * fxWet);
      vec2 uvB = vMapUv - flow * (0.34 * (1.0 - uMix));
      vec2 split = flow * 0.02 * fxWet; // slight colour separation, like light through water
      vec3 a = vec3(texture2D(map, uvA + split).r, texture2D(map, uvA).g, texture2D(map, uvA - split).b);
      vec3 b = vec3(texture2D(uMapB, uvB + split).r, texture2D(uMapB, uvB).g, texture2D(uMapB, uvB - split).b);

      // A wavering front runs down the card and decides where the new print shows.
      float field = (1.0 - vMapUv.y) * 0.7 + vMapUv.x * 0.3 + flow.x * 0.55;
      float m = smoothstep(-0.2, 0.2, uMix * 1.6 - 0.3 - field);
      sampledDiffuseColor = vec4(mix(a, b, m), 1.0);
    } else {
      sampledDiffuseColor = texture2D(map, vMapUv);
    }
    diffuseColor *= sampledDiffuseColor;
  #endif
`;

const liquid = (uniforms) => (shader) => {
  Object.assign(shader.uniforms, uniforms);
  shader.uniforms.uTime = FX.uTime;
  shader.vertexShader = after(
    shader.vertexShader,
    "#include <common>",
    "uniform float uMix;\nuniform float uTime;",
  );
  // the sheet itself ripples while its print is liquid
  shader.vertexShader = after(
    shader.vertexShader,
    "#include <begin_vertex>",
    /* glsl */ `
      if (uMix > 0.0) {
        // rings travel outwards; they only ever rise, so the sheet never dips
        // into the board it is lying on
        float swell = sin(uMix * PI);
        float ring = 0.5 + 0.5 * sin(length(position.xy * vec2(1.0, 0.8)) * 11.0 - uTime * 5.0);
        transformed.z += swell * (0.004 + 0.012 * ring);
      }
    `,
  );
  shader.fragmentShader = after(
    shader.fragmentShader,
    "#include <common>",
    /* glsl */ `
      ${NOISE}
      uniform sampler2D uMapB;
      uniform float uMix;
      uniform float uTime;
      float fxWet = 0.0;
      vec2 fxFlow = vec2(0.0);
    `,
  );
  shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", LIQUID_MAP);
  // wet paper is glossy and its surface wobbles
  shader.fragmentShader = after(
    shader.fragmentShader,
    "#include <roughnessmap_fragment>",
    "roughnessFactor = mix(roughnessFactor, 0.22, fxWet * 0.9);",
  );
  shader.fragmentShader = after(
    shader.fragmentShader,
    "#include <normal_fragment_maps>",
    "normal = normalize(normal + vec3(fxFlow * 1.6, 0.0));",
  );
};

/** Applies patches and gives the program a unique cache key (three would
 *  otherwise reuse one compiled shader for differently-patched materials). */
function patched(material, key, patches) {
  material.onBeforeCompile = (shader) => patches.forEach((apply) => apply(shader));
  material.customProgramCacheKey = () => key;
  return material;
}

/* ═════════════════════════════ Material factories ═════════════════════════════ */

const tiled = (texture, x, y) => {
  const t = texture.clone(); // shares the GPU upload, only the UV transform differs
  t.repeat.set(x, y);
  t.needsUpdate = true;
  return t;
};

/**
 * Book cloth: matte linen whose weave catches the light (tiled normal map).
 * `hinge` (optional) makes it flex with the front cover.
 */
export function createClothMaterial(linen, repeatX, repeatY, { map = null, hinge = null } = {}) {
  const material = new THREE.MeshStandardMaterial({
    color: map ? "#ffffff" : COLORS.linen,
    map,
    roughness: 0.9,
    metalness: 0,
    normalMap: tiled(linen, repeatX, repeatY),
    normalScale: new THREE.Vector2(0.55, 0.55),
    envMapIntensity: 0.7,
  });
  return hinge === null ? material : patched(material, "cloth-bend", [bend(hinge)]);
}

/** Front cover: artwork + embossed foil lettering derived from it (see createCoverMaps). */
export function createCoverMaterial({ map, normalMap, ormMap }, hinge) {
  const material = new THREE.MeshStandardMaterial({
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughnessMap: ormMap,
    metalnessMap: ormMap,
    roughness: 1,
    metalness: 1,
    envMapIntensity: 1.2,
  });
  return patched(material, "cover-bend", [bend(hinge)]);
}

/** Shadow-pass material for anything that flexes with the front cover. */
export function createBendDepthMaterial(hinge, lift = 0) {
  return patched(new THREE.MeshDepthMaterial(), `depth-bend-${lift}`, [bend(hinge, lift)]);
}

export function createPocketMaterial(map) {
  return new THREE.MeshStandardMaterial({ map, roughness: 0.82, metalness: 0, envMapIntensity: 0.55 });
}

const paintUniforms = (aspect, seeds) => ({
  uPaint: { value: 0 },
  uPaintSeeds: { value: new THREE.Vector4(...seeds) },
  uPaintAspect: { value: aspect },
});

const paperMaterial = (map) =>
  new THREE.MeshStandardMaterial({ map, roughness: 0.84, metalness: 0, envMapIntensity: 0.55 });

/** Event card in the pocket: appears by being "painted in". */
export function createTabCardMaterial(map, aspect, seeds) {
  const uniforms = paintUniforms(aspect, seeds);
  return {
    uniforms,
    material: patched(paperMaterial(map), "tab", [paint(uniforms)]),
    depthMaterial: patched(new THREE.MeshDepthMaterial(), "depth-tab", [paint(uniforms, { color: false })]),
  };
}

/**
 * The card on the left panel: painted in on first opening, flexes with the
 * cover, and its print turns liquid to become another card
 * (material.map → uniforms.uMapB as uniforms.uMix goes 0 → 1).
 */
export function createLeftCardMaterial(map, aspect, seeds, hinge, lift) {
  const uniforms = { ...paintUniforms(aspect, seeds), uMapB: { value: map }, uMix: { value: 0 } };
  return {
    uniforms,
    // order matters: `liquid` replaces the map lookup that `paint` hooks onto,
    // and its ripple must run before `bend`
    material: patched(paperMaterial(map), "left-card", [paint(uniforms), bend(hinge, lift), liquid(uniforms)]),
    depthMaterial: patched(new THREE.MeshDepthMaterial(), "depth-left-card", [
      bend(hinge, lift),
      paint(uniforms, { color: false }),
    ]),
  };
}

/* ═════════════════════════════ Full-screen / backdrop ═════════════════════════════ */

/**
 * The book's shadow on the backdrop: a blurred rounded rectangle from a
 * signed-distance function. One quad, a handful of ALU ops per pixel — far
 * softer (and far cheaper) than blurring a shadow map, and it works on
 * devices that get no shadow map at all.
 */
export function createBackdropShadowMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: new THREE.Color(COLORS.shadow) },
      uSize: { value: new THREE.Vector2(1, 1) },
      uBlur: { value: 0.25 },
      uOpacity: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform vec2 uSize;
      uniform float uBlur;
      varying vec2 vPos;
      void main() {
        vPos = position.xy * (uSize + uBlur * 3.0); // unit quad, grown to fit the blur
        gl_Position = projectionMatrix * modelViewMatrix * vec4(vPos, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec2 uSize;
      uniform float uBlur;
      uniform float uOpacity;
      varying vec2 vPos;
      void main() {
        vec2 q = abs(vPos) - (uSize * 0.5 - uBlur * 0.3);
        float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
        float a = 1.0 - smoothstep(-uBlur, uBlur * 1.5, d);
        gl_FragColor = vec4(uColor, a * a * uOpacity);
        #include <colorspace_fragment>
      }
    `,
  });
}

/**
 * Loading veil: a full-screen quad in the loader's colour. As uProgress goes
 * 0 → 1 two sheets of liquid drain upwards (the lighter one a beat behind)
 * and uncover the scene. Hidden — zero cost — once it has gone.
 */
export function createVeilMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uProgress: { value: 0 },
      uTime: FX.uTime,
      uAspect: { value: 1 },
      uDark: { value: new THREE.Color(COLORS.veil) },
      uLight: { value: new THREE.Color(COLORS.veilLight) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0); // clip space: always fills the screen
      }
    `,
    fragmentShader: /* glsl */ `
      ${NOISE}
      uniform float uProgress;
      uniform float uTime;
      uniform float uAspect;
      uniform vec3 uDark;
      uniform vec3 uLight;
      varying vec2 vUv;
      void main() {
        float calm = sin(uProgress * 3.14159265); // flat at the start and the end
        vec2 p = vec2(vUv.x * uAspect, vUv.y);
        float swell = sin(p.x * 2.6 + uTime * 1.3) * 0.035 + sin(p.x * 6.3 - uTime * 2.1) * 0.012;
        float n1 = fxFbm(p * 1.5 + vec2(0.0, -uTime * 0.22)) - 0.5;
        float n2 = fxFbm(p * 2.2 + vec2(3.7, -uTime * 0.34)) - 0.5;
        float edgeDark = uProgress * 1.8 - 0.4 + (n1 * 0.62 + swell) * calm;
        float edgeLight = uProgress * 1.8 - 0.68 + (n2 * 0.5 + swell * 0.7) * calm;
        float aa = fwidth(vUv.y) * 1.5;
        float dark = smoothstep(edgeDark - aa, edgeDark + aa, vUv.y);
        float light = smoothstep(edgeLight - aa, edgeLight + aa, vUv.y);
        // a thin bright meniscus along the draining edge
        float lip = exp(-pow((vUv.y - edgeDark) * 110.0, 2.0)) * dark * calm;
        vec3 color = mix(uLight, uDark, dark) + lip * 0.1;
        gl_FragColor = vec4(color, max(dark, light));
        #include <colorspace_fragment>
      }
    `,
  });
}
