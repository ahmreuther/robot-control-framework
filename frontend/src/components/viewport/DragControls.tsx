import { useEffect, useRef } from "react";
import * as THREE from "three";

interface DragControlsProps {
  robot: THREE.Object3D;
  camera: THREE.Camera;
  domElement: HTMLElement;
  enabled?: boolean;
  onDragStart?: (joint: any) => void;
  onDragEnd?: (joint: any) => void;
  onHover?: (joint: any) => void;
  onUnhover?: (joint: any) => void;
  onUpdateJoint?: (joint: any, angle: number) => void;
}

// Helper: find nearest parent joint
function isJoint(obj: any) {
  return obj && obj.isURDFJoint && obj.jointType !== "fixed";
}
function findNearestJoint(child: any): any {
  let curr = child;
  while (curr) {
    if (isJoint(curr)) return curr;
    curr = curr.parent;
  }
  return null;
}

export function DragControls({
  robot,
  camera,
  domElement,
  onDragStart,
  onDragEnd,
  onHover,
  onUnhover,
  onUpdateJoint,
}: DragControlsProps) {
  const draggingRef = useRef<any>(null);
  const hoveredRef = useRef<any>(null);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const raycaster = useRef(new THREE.Raycaster());
  const dragStartAngle = useRef<number>(0);

  useEffect(() => {
    if (!robot || !camera || !domElement) return;

    function getPointer(event: PointerEvent | MouseEvent) {
      const rect = domElement.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
      };
    }

    function pointerMove(event: PointerEvent) {
      const pointer = getPointer(event);
      lastPointer.current = pointer;
      raycaster.current.setFromCamera(new THREE.Vector2(pointer.x, pointer.y), camera);
      if (draggingRef.current) {
        // Dragging: compute delta and emit update
        // For simplicity, just emit the pointer position as a delta (user must implement logic)
        if (onUpdateJoint) {
          // Example: use pointer.x as a fake angle delta
          const joint = draggingRef.current;
          // You should implement a real delta computation for revolute/prismatic
          const angle = dragStartAngle.current + (pointer.x * Math.PI); // fake
          onUpdateJoint(joint, angle);
        }
        return;
      }
      // Not dragging: hover detection
      const intersects = raycaster.current.intersectObject(robot, true);
      let hoveredJoint = null;
      if (intersects.length > 0) {
        hoveredJoint = findNearestJoint(intersects[0].object);
      }
      if (hoveredJoint !== hoveredRef.current) {
        if (hoveredRef.current && onUnhover) onUnhover(hoveredRef.current);
        hoveredRef.current = hoveredJoint;
        if (hoveredJoint && onHover) onHover(hoveredJoint);
      }
    }

    function pointerDown(event: PointerEvent) {
      const pointer = getPointer(event);
      raycaster.current.setFromCamera(new THREE.Vector2(pointer.x, pointer.y), camera);
      const intersects = raycaster.current.intersectObject(robot, true);
      let joint = null;
      if (intersects.length > 0) {
        joint = findNearestJoint(intersects[0].object);
      }
      if (joint) {
        draggingRef.current = joint;
        dragStartAngle.current = joint.angle ?? 0;
        if (onDragStart) onDragStart(joint);
        domElement.setPointerCapture(event.pointerId);
      }
    }

    function pointerUp(event: PointerEvent) {
      if (draggingRef.current) {
        if (onDragEnd) onDragEnd(draggingRef.current);
        draggingRef.current = null;
      }
      domElement.releasePointerCapture(event.pointerId);
    }

    domElement.addEventListener("pointermove", pointerMove);
    domElement.addEventListener("pointerdown", pointerDown);
    domElement.addEventListener("pointerup", pointerUp);

    return () => {
      domElement.removeEventListener("pointermove", pointerMove);
      domElement.removeEventListener("pointerdown", pointerDown);
      domElement.removeEventListener("pointerup", pointerUp);
    };
  }, [robot, camera, domElement, onDragStart, onDragEnd, onHover, onUnhover, onUpdateJoint]);

  return null;
}