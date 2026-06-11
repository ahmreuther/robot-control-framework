import { TransformControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { TransformControls as TransformControlsImpl } from "three-stdlib";
import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";

interface GoalMarkerProps {
  enabled: boolean;
  mode: "translate" | "rotate";
  space: "local" | "world";
  position: THREE.Vector3 | null;
  quaternion: THREE.Quaternion | null;
  converged: boolean;
  cancelSequence?: number;
  onPositionChange: (position: THREE.Vector3) => void;
  onQuaternionChange: (quaternion: THREE.Quaternion) => void;
  onMovedDistanceChange?: (distance: number) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onCanceledPointerRelease?: () => void;
}

export default function GoalMarker({
  enabled,
  mode,
  space,
  position,
  quaternion,
  converged,
  cancelSequence = 0,
  onPositionChange,
  onQuaternionChange,
  onMovedDistanceChange,
  onDragStart,
  onDragEnd,
  onCanceledPointerRelease,
}: GoalMarkerProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const controlsRef = useRef<TransformControlsImpl | null>(null);
  const draggingRef = useRef(false);
  const cancelReleasePendingRef = useRef(false);
  const dragStartPositionRef = useRef<THREE.Vector3 | null>(null);

  function startDragging() {
    if (draggingRef.current || !enabled) {
      return;
    }

    draggingRef.current = true;
    if (meshRef.current) {
      dragStartPositionRef.current = meshRef.current.position.clone();
    }
    onMovedDistanceChange?.(0);
    onDragStart();
  }

  function forceStopDragging() {
    if (!draggingRef.current) {
      return;
    }

    draggingRef.current = false;
    dragStartPositionRef.current = null;
    onMovedDistanceChange?.(0);
    const controls = controlsRef.current as any;
    if (controls) {
      controls.dragging = false;
      controls.axis = null;
    }
    onDragEnd();
  }

  function forceCancelDragging() {
    if (!draggingRef.current) {
      return;
    }

    draggingRef.current = false;
    cancelReleasePendingRef.current = true;
    dragStartPositionRef.current = null;
    onMovedDistanceChange?.(0);
    const controls = controlsRef.current as any;
    if (controls) {
      controls.dragging = false;
      controls.axis = null;
    }
  }

  useEffect(() => {
    if (!meshRef.current || !position || draggingRef.current) {
      return;
    }
    meshRef.current.position.copy(position);
  }, [position]);

  useEffect(() => {
    if (!meshRef.current || !quaternion || draggingRef.current) {
      return;
    }
    meshRef.current.quaternion.copy(quaternion);
  }, [quaternion]);

  useFrame(() => {
    if (
      !draggingRef.current ||
      !meshRef.current ||
      !dragStartPositionRef.current
    ) {
      return;
    }

    onMovedDistanceChange?.(
      meshRef.current.position.distanceTo(dragStartPositionRef.current),
    );
  });

  useEffect(() => {
    forceCancelDragging();
  }, [cancelSequence]);

  useEffect(() => {
    const handleWindowPointerUp = () => {
      if (cancelReleasePendingRef.current) {
        cancelReleasePendingRef.current = false;
        onCanceledPointerRelease?.();
        return;
      }
      forceStopDragging();
    };

    const handleWindowPointerMove = (event: PointerEvent) => {
      if (!draggingRef.current) {
        if (cancelReleasePendingRef.current && event.buttons === 0) {
          cancelReleasePendingRef.current = false;
          onCanceledPointerRelease?.();
        }
        return;
      }
      if (event.buttons === 0) {
        forceStopDragging();
      }
    };

    const handleWindowBlur = () => {
      if (cancelReleasePendingRef.current) {
        cancelReleasePendingRef.current = false;
        onCanceledPointerRelease?.();
      }
      forceStopDragging();
    };

    window.addEventListener("pointerup", handleWindowPointerUp, true);
    window.addEventListener("pointercancel", handleWindowPointerUp, true);
    window.addEventListener("pointermove", handleWindowPointerMove, true);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("pointerup", handleWindowPointerUp, true);
      window.removeEventListener("pointercancel", handleWindowPointerUp, true);
      window.removeEventListener("pointermove", handleWindowPointerMove, true);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [onCanceledPointerRelease, onDragEnd]);

  if (!position) {
    return null;
  }

  return (
    <group>
      <mesh ref={meshRef} position={[position.x, position.y, position.z]}>
        <sphereGeometry args={[0.015, 20, 20]} />
        <meshBasicMaterial
          color={converged ? "#22c55e" : "#ef4444"}
          transparent
          opacity={0.35}
        />
      </mesh>
      <TransformControls
        ref={controlsRef}
        object={meshRef as unknown as RefObject<THREE.Object3D>}
        enabled={enabled}
        mode={mode}
        space={space}
        size={0.75}
        onMouseDown={() => {
          startDragging();
        }}
        onMouseUp={() => {
          forceStopDragging();
        }}
        onObjectChange={() => {
          if (!meshRef.current) return;
          startDragging();
          onPositionChange(meshRef.current.position.clone());
          onQuaternionChange(meshRef.current.quaternion.clone());
        }}
      />
    </group>
  );
}
