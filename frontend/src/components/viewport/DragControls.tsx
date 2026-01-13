import { useEffect, useRef } from "react";
import * as THREE from "three";

interface DragControlsProps {
  robot: THREE.Object3D;
  camera: THREE.Camera;
  domElement: HTMLElement;
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
  // FIX: Move dragStartPoint useRef to top level
  // Store drag start/end points and drag plane in world
  const dragStartPoint = useRef<THREE.Vector3 | null>(null);
  const dragPlane = useRef<THREE.Plane | null>(null);

  useEffect(() => {
    if (!robot || !camera || !domElement) return;

    function getPointer(event: PointerEvent | MouseEvent) {
      const rect = domElement.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
      };
    }

    // Helper for revolute joint dragging
    const tempVector = new THREE.Vector3();
    const pivotPoint = new THREE.Vector3();
    const projectedStartPoint = new THREE.Vector3();
    const projectedEndPoint = new THREE.Vector3();

    function getRevoluteDelta(joint, startPoint, endPoint) {
      // Use the drag plane normal and pivot
      tempVector.copy(joint.axis).transformDirection(joint.matrixWorld).normalize();
      pivotPoint.set(0, 0, 0).applyMatrix4(joint.matrixWorld);
      // Project the drag points onto the plane
      dragPlane.current && dragPlane.current.projectPoint(startPoint, projectedStartPoint);
      dragPlane.current && dragPlane.current.projectPoint(endPoint, projectedEndPoint);
      projectedStartPoint.sub(pivotPoint);
      projectedEndPoint.sub(pivotPoint);
      tempVector.crossVectors(projectedStartPoint, projectedEndPoint);
      const direction = Math.sign(tempVector.dot(dragPlane.current ? dragPlane.current.normal : tempVector));
      return direction * projectedEndPoint.angleTo(projectedStartPoint);
    }

    // Helper for prismatic joint dragging
    function getPrismaticDelta(joint, startPoint, endPoint) {
      // Get joint axis in world coordinates
      const axisWorld = new THREE.Vector3().copy(joint.axis).transformDirection(joint.matrixWorld).normalize();
      // Project start and end points onto axis
      const startProj = new THREE.Vector3().copy(startPoint).sub(joint.position).dot(axisWorld);
      const endProj = new THREE.Vector3().copy(endPoint).sub(joint.position).dot(axisWorld);
      return endProj - startProj;
    }

    function pointerMove(event: PointerEvent) {
      const pointer = getPointer(event);
      lastPointer.current = pointer;
      raycaster.current.setFromCamera(new THREE.Vector2(pointer.x, pointer.y), camera);
      if (draggingRef.current) {
        // Dragging: compute delta and emit update
        if (onUpdateJoint) {
          const joint = draggingRef.current;
          // Project pointer ray onto drag plane
          if (dragPlane.current && dragStartPoint.current) {
            // Get intersection of pointer ray and drag plane
            const ray = raycaster.current.ray;
            const endPoint = new THREE.Vector3();
            if (dragPlane.current.intersectLine(new THREE.Line3(ray.origin, ray.origin.clone().add(ray.direction.clone().multiplyScalar(1000))), endPoint)) {
              if (joint.jointType === "revolute" || joint.jointType === "continuous") {
                const delta = getRevoluteDelta(joint, dragStartPoint.current, endPoint);
                const angle = dragStartAngle.current + delta;
                onUpdateJoint(joint, angle);
              } else if (joint.jointType === "prismatic") {
                // Realistic prismatic drag: project movement onto axis
                // joint.position is local, get world position
                const jointWorldPos = new THREE.Vector3().set(0, 0, 0).applyMatrix4(joint.matrixWorld);
                const delta = (() => {
                  const axisWorld = new THREE.Vector3().copy(joint.axis).transformDirection(joint.matrixWorld).normalize();
                  const startProj = new THREE.Vector3().copy(dragStartPoint.current).sub(jointWorldPos).dot(axisWorld);
                  const endProj = new THREE.Vector3().copy(endPoint).sub(jointWorldPos).dot(axisWorld);
                  return endProj - startProj;
                })();
                const position = dragStartAngle.current + delta;
                onUpdateJoint(joint, position);
              } else {
                // Fallback for other joint types
                const angle = dragStartAngle.current + (pointer.x * Math.PI);
                onUpdateJoint(joint, angle);
              }
            }
          }
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
        dragStartPoint.current = intersects[0].point.clone();
        // Define drag plane for this joint
        const axis = new THREE.Vector3().copy(joint.axis).transformDirection(joint.matrixWorld).normalize();
        const pivot = new THREE.Vector3().set(0, 0, 0).applyMatrix4(joint.matrixWorld);
        if (joint.jointType === "prismatic") {
          // For prismatic, drag plane is perpendicular to axis
          let perp = new THREE.Vector3(1, 0, 0);
          if (Math.abs(axis.dot(perp)) > 0.99) perp.set(0, 1, 0);
          const normal = new THREE.Vector3().crossVectors(axis, perp).normalize();
          dragPlane.current = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, pivot);
        } else {
          // For revolute, drag plane is parallel to axis
          dragPlane.current = new THREE.Plane().setFromNormalAndCoplanarPoint(axis, pivot);
        }
        if (onDragStart) onDragStart(joint);
        domElement.setPointerCapture(event.pointerId);
      }
    }

    function pointerUp(event: PointerEvent) {
      if (draggingRef.current) {
        if (onDragEnd) onDragEnd(draggingRef.current);
        draggingRef.current = null;
        dragStartPoint.current = null;
        dragPlane.current = null;
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