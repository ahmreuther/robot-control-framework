import { TransformControls } from "@react-three/drei";
import type { TransformControls as TransformControlsImpl } from "three-stdlib";
import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";

interface OriginGizmoProps {
  objectRef: RefObject<THREE.Object3D | null>;
  enabled: boolean;
  mode: "translate" | "rotate";
  space: "local" | "world";
  onTransformChange: (
    position: THREE.Vector3,
    quaternion: THREE.Quaternion,
  ) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export default function OriginGizmo({
  objectRef,
  enabled,
  mode,
  space,
  onTransformChange,
  onDragStart,
  onDragEnd,
}: OriginGizmoProps) {
  const controlsRef = useRef<TransformControlsImpl | null>(null);
  const draggingRef = useRef(false);

  function stopDragging() {
    if (!draggingRef.current) {
      return;
    }
    draggingRef.current = false;
    const controls = controlsRef.current as any;
    if (controls) {
      controls.dragging = false;
      controls.axis = null;
    }
    onDragEnd?.();
  }

  useEffect(() => {
    if (enabled) {
      return;
    }
    stopDragging();
  }, [enabled]);

  useEffect(() => {
    return () => {
      stopDragging();
    };
  }, []);

  return (
    <TransformControls
      ref={controlsRef}
      object={objectRef as unknown as RefObject<THREE.Object3D>}
      enabled={enabled}
      mode={mode}
      space={space}
      size={0.8}
      onMouseDown={() => {
        if (!enabled || draggingRef.current) {
          return;
        }
        draggingRef.current = true;
        onDragStart?.();
      }}
      onMouseUp={() => {
        stopDragging();
      }}
      onObjectChange={() => {
        if (!objectRef.current) {
          return;
        }
        if (!draggingRef.current) {
          draggingRef.current = true;
          onDragStart?.();
        }
        onTransformChange(
          objectRef.current.position.clone(),
          objectRef.current.quaternion.clone(),
        );
      }}
    />
  );
}
