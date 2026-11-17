/**
 * Cheap, synchronous device profiling so the 3D scene can pick its quality
 * *before* the WebGL context is created (antialiasing and shadow support
 * can't be changed afterwards). PerformanceMonitor then fine-tunes the pixel
 * ratio while the page runs.
 */

const SOFTWARE_GPU = /swiftshader|llvmpipe|software|basic render|softpipe/i;
const WEAK_GPU =
  /mali-[24t]|mali-g(31|51|52|57|68)|adreno \(tm\) [1-5]\d\d|adreno [1-5]\d\d|powervr|sgx|videocore|intel\(r\) (hd|uhd) graphics( \d{3})?\b|intel hd graphics|gma \d|radeon r[2-5]/i;

/**
 * low   no shadow map, no reflections, SD textures   (old phones, software GL)
 * mid   1024 shadow map, small environment, SD on phones
 * high  2048 shadow map, sharper environment, HD textures
 */
const PRESETS = {
  low: { dpr: [1, 1.25], antialias: false, shadowMap: 0, envMap: 0, anisotropy: 1 },
  mid: { dpr: [1.5, 1.6], antialias: true, shadowMap: 1024, envMap: 64, anisotropy: 2 },
  high: { dpr: [2, 2], antialias: true, shadowMap: 2048, envMap: 128, anisotropy: 4 },
};

function readGpu() {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return { gpu: "", webgl: false };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return { gpu: String(gpu || ""), webgl: true };
  } catch {
    return { gpu: "", webgl: false };
  }
}

export function detectDevice() {
  const nav = navigator;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const mobile =
    /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(nav.userAgent || "") ||
    (coarse && Math.min(window.screen.width, window.screen.height) < 900);
  const cores = nav.hardwareConcurrency || 4;
  const memory = nav.deviceMemory || 4;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const nativeDpr = window.devicePixelRatio || 1;
  const { gpu, webgl } = readGpu();

  let tier = "low";
  if (webgl && !SOFTWARE_GPU.test(gpu)) {
    const weak = WEAK_GPU.test(gpu);
    let score = 0;
    if (weak) score -= 2;
    if (cores <= 4) score -= 1;
    if (memory <= 3) score -= 1;
    if (mobile) score -= 1;
    if (nav.connection?.saveData) score -= 1;
    if (!mobile && cores >= 8 && !weak) score += 1;
    tier = score <= -3 ? "low" : score >= 1 ? "high" : "mid";
  }

  const preset = PRESETS[tier];
  return {
    tier,
    mobile,
    coarse,
    reducedMotion,
    webgl,
    quality: tier === "high" || (tier === "mid" && !mobile) ? "hd" : "sd",
    antialias: preset.antialias || !mobile,
    shadowMap: preset.shadowMap,
    envMap: preset.envMap,
    anisotropy: preset.anisotropy,
    dprMax: Math.min(nativeDpr, preset.dpr[mobile ? 1 : 0]),
    dprMin: Math.min(nativeDpr, mobile ? 0.9 : 1),
  };
}
