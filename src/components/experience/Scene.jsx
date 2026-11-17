"use client";

import { Component, Suspense, useCallback, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import * as THREE from "three";
import { useExperience } from "@/store/useExperience";
import { FOV } from "./three/CameraRig";
import World from "./three/World";

// Feed real texture-download progress to the loading screen.
THREE.DefaultLoadingManager.onProgress = (_url, loaded, total) => {
  useExperience.getState().setProgress(total ? loaded / total : 0);
};

class SceneErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.error("3D scene failed, showing the static invitation instead.", error);
    useExperience.getState().setFailed();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function Scene() {
  const device = useExperience((s) => s.device);
  const settled = useExperience((s) => s.phase !== "loading" && s.phase !== "intro");
  const [dpr, setDpr] = useState(device.dprMax);

  // PerformanceMonitor lowers `factor` when frames drop and raises it when
  // there is headroom; we map it onto the canvas pixel ratio.
  const onPerformanceChange = useCallback(
    ({ factor }) => {
      const next = device.dprMin + (device.dprMax - device.dprMin) * factor;
      setDpr(Math.round(next * 20) / 20);
    },
    [device.dprMin, device.dprMax],
  );

  return (
    <SceneErrorBoundary>
      <Canvas
        dpr={dpr}
        // transparent canvas: the page background and the big title show through
        gl={{
          alpha: true,
          antialias: device.antialias,
          stencil: false,
          powerPreference: "high-performance",
          toneMapping: THREE.NeutralToneMapping,
        }}
        shadows={device.shadowMap > 0 ? "percentage" : false}
        camera={{ fov: FOV, near: 0.1, far: 60, position: [0, 0, 8] }}
      >
        {settled && <PerformanceMonitor factor={1} step={0.2} flipflops={4} onChange={onPerformanceChange} />}
        <Suspense fallback={null}>
          <World />
        </Suspense>
      </Canvas>
    </SceneErrorBoundary>
  );
}
