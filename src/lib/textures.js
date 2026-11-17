import * as THREE from "three";

/** Colour-managed, mipmapped, anisotropic — set once per image texture. */
export function configureTexture(texture, anisotropy = 1) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Tileable linen weave as a height field (0–1), generated on the client. */
function linenHeight(size) {
  let seed = 1234567;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rows = new Float32Array(size);
  const cols = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    rows[i] = rand() - 0.5;
    cols[i] = rand() - 0.5;
  }
  const height = new Float32Array(size * size);
  // slubs: short thicker threads that give real linen its irregular look
  for (let n = 0; n < 140; n++) {
    const horizontal = rand() > 0.5;
    const a = Math.floor(rand() * size);
    const b = Math.floor(rand() * size);
    const len = 6 + Math.floor(rand() * 28);
    const strength = (rand() - 0.5) * 0.4;
    for (let k = 0; k < len; k++) {
      const x = horizontal ? (b + k) % size : a;
      const y = horizontal ? a : (b + k) % size;
      height[y * size + x] += strength * Math.sin((k / len) * Math.PI);
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const weave = (x + y) & 1 ? 0.06 : -0.06;
      height[y * size + x] += 0.5 + rows[y] * 0.22 + cols[x] * 0.18 + weave + (rand() - 0.5) * 0.14;
    }
  }
  return height;
}

/** Central-difference normal map (RGBA8) from a height field. */
function normalsFromHeight(height, w, h, strength, wrap) {
  const data = new Uint8Array(w * h * 4);
  const at = (x, y) => {
    if (wrap) return height[((y + h) % h) * w + ((x + w) % w)];
    return height[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      data[i] = (-dx * inv * 0.5 + 0.5) * 255;
      data[i + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      data[i + 2] = (inv * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  return data;
}

function dataTexture(data, w, h, repeat) {
  const texture = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Tileable linen normal map (≈350 KB of GPU memory, zero network). */
export function createLinenNormalMap(size = 256) {
  return dataTexture(normalsFromHeight(linenHeight(size), size, size, 2.4, true), size, size, true);
}

/**
 * Derives the cover's physical maps from its artwork, so swapping the image
 * is all it takes: light lettering becomes raised, reflective foil.
 *   ormMap     G = roughness, B = metalness
 *   normalMap  embossed lettering + linen weave
 */
export function createCoverMaps(image, { size = 512, foil = [0.42, 0.62] } = {}) {
  const w = size;
  const h = Math.round((size * image.height) / image.width);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;

  const linear = new Float32Array(256);
  for (let i = 0; i < 256; i++) linear[i] = Math.pow(i / 255, 2.2);

  const linenSize = 256;
  const linen = linenHeight(linenSize);
  const height = new Float32Array(w * h);
  const orm = new Uint8Array(w * h * 4);

  for (let y = 0; y < h; y++) {
    const row = h - 1 - y; // canvas rows run top → bottom, textures bottom → top
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const lum = 0.2126 * linear[px[i]] + 0.7152 * linear[px[i + 1]] + 0.0722 * linear[px[i + 2]];
      const mask = smoothstep(foil[0], foil[1], lum);
      const j = row * w + x;
      const weave = linen[((row * 2) % linenSize) * linenSize + ((x * 2) % linenSize)];
      height[j] = mask * 1.0 + weave * 0.2 * (1 - mask);
      orm[j * 4] = 255;
      orm[j * 4 + 1] = (0.92 - 0.62 * mask) * 255;
      orm[j * 4 + 2] = mask * 0.9 * 255;
      orm[j * 4 + 3] = 255;
    }
  }

  return {
    ormMap: dataTexture(orm, w, h, false),
    normalMap: dataTexture(normalsFromHeight(height, w, h, 2.6, false), w, h, false),
  };
}
