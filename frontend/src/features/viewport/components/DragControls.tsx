import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { URDFRobot } from "urdf-loader/src/URDFClasses";

interface DragControlsProps {
  robot: URDFRobot;
  enabled: boolean;
  cancelSequence?: number;
  onDragStart?: (joint: unknown) => void;
  onDragEnd?: (joint: unknown) => void;
  onHover?: (joint: unknown) => void;
  onUnhover?: (joint: unknown) => void;
  onUpdateJoint?: (joint: unknown, value: number) => void;
}

function isJoint(object: unknown): boolean {
  const candidate = object as {
    isURDFJoint?: boolean;
    jointType?: string;
  } | null;
  return Boolean(
    candidate?.isURDFJoint &&
    candidate.jointType &&
    candidate.jointType !== "fixed",
  );
}

function findNearestJoint(child: THREE.Object3D | null): unknown {
  let current: THREE.Object3D | null = child;
  while (current) {
    if (isJoint(current)) return current;
    current = current.parent;
  }
  return null;
}

function clampJointValue(joint: unknown, value: number): number {
  const candidate = joint as {
    jointType?: string;
    limit?: { lower?: number; upper?: number };
  };
  if (candidate.jointType === "continuous") {
    return value;
  }

  const lower = candidate.limit?.lower;
  const upper = candidate.limit?.upper;

  if (typeof lower === "number" && value < lower) {
    return lower;
  }
  if (typeof upper === "number" && value > upper) {
    return upper;
  }
  return value;
}

export default function DragControls({
  robot,
  enabled,
  cancelSequence = 0,
  onDragStart,
  onDragEnd,
  onHover,
  onUnhover,
  onUpdateJoint,
}: DragControlsProps) {
  const { camera, gl } = useThree();
  const draggingRef = useRef<unknown>(null);
  const hoveredRef = useRef<unknown>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const dragStartValueRef = useRef<number>(0);
  const dragStartPointRef = useRef<THREE.Vector3 | null>(null);
  const dragPlaneRef = useRef<THREE.Plane | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    const domElement = gl.domElement;
    if (!robot || !camera || !domElement || !enabled) {
      domElement.style.cursor = "";
      return;
    }

    function getPointer(event: PointerEvent | MouseEvent) {
      const rect = domElement.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
      };
    }

    const axisWorld = new THREE.Vector3();
    const pivotPoint = new THREE.Vector3();
    const projectedStartPoint = new THREE.Vector3();
    const projectedEndPoint = new THREE.Vector3();
    const crossVector = new THREE.Vector3();

    function setCursor(mode: string) {
      domElement.style.cursor = mode;
    }

    function getRevoluteDelta(
      joint: unknown,
      startPoint: THREE.Vector3,
      endPoint: THREE.Vector3,
    ) {
      const candidate = joint as {
        axis: THREE.Vector3;
        matrixWorld: THREE.Matrix4;
      };
      axisWorld
        .copy(candidate.axis)
        .transformDirection(candidate.matrixWorld)
        .normalize();
      pivotPoint.set(0, 0, 0).applyMatrix4(candidate.matrixWorld);

      dragPlaneRef.current?.projectPoint(startPoint, projectedStartPoint);
      dragPlaneRef.current?.projectPoint(endPoint, projectedEndPoint);

      projectedStartPoint.sub(pivotPoint);
      projectedEndPoint.sub(pivotPoint);

      crossVector.crossVectors(projectedStartPoint, projectedEndPoint);
      const direction = Math.sign(
        crossVector.dot(dragPlaneRef.current?.normal ?? crossVector),
      );
      const angleDelta =
        direction * projectedEndPoint.angleTo(projectedStartPoint);

      const minDistance = 0.15;
      const distance = Math.max(
        projectedStartPoint.length(),
        projectedEndPoint.length(),
        minDistance,
      );
      const scale = Math.min(0.5, distance / 0.5);
      return angleDelta * scale;
    }

    function pointerMove(event: PointerEvent) {
      const pointer = getPointer(event);
      raycasterRef.current.setFromCamera(
        new THREE.Vector2(pointer.x, pointer.y),
        camera,
      );

      if (draggingRef.current) {
        const joint = draggingRef.current as {
          jointType?: string;
          axis: THREE.Vector3;
          matrixWorld: THREE.Matrix4;
        };

        if (
          onUpdateJoint &&
          dragPlaneRef.current &&
          dragStartPointRef.current
        ) {
          const ray = raycasterRef.current.ray;
          const endPoint = new THREE.Vector3();
          const farPoint = ray.origin
            .clone()
            .add(ray.direction.clone().multiplyScalar(1000));

          if (
            dragPlaneRef.current.intersectLine(
              new THREE.Line3(ray.origin, farPoint),
              endPoint,
            )
          ) {
            let nextValue = dragStartValueRef.current;

            if (
              joint.jointType === "revolute" ||
              joint.jointType === "continuous"
            ) {
              nextValue += getRevoluteDelta(
                joint,
                dragStartPointRef.current,
                endPoint,
              );
            } else if (joint.jointType === "prismatic") {
              const jointWorldPos = new THREE.Vector3()
                .set(0, 0, 0)
                .applyMatrix4(joint.matrixWorld);
              const projectedAxis = new THREE.Vector3()
                .copy(joint.axis)
                .transformDirection(joint.matrixWorld)
                .normalize();
              const startProjection = dragStartPointRef.current
                .clone()
                .sub(jointWorldPos)
                .dot(projectedAxis);
              const endProjection = endPoint
                .clone()
                .sub(jointWorldPos)
                .dot(projectedAxis);
              nextValue += endProjection - startProjection;
            }

            onUpdateJoint(joint, clampJointValue(joint, nextValue));
          }
        }

        setCursor("grabbing");
        return;
      }

      const intersections = raycasterRef.current.intersectObject(robot, true);
      const hoveredJoint =
        intersections.length > 0
          ? findNearestJoint(intersections[0]?.object ?? null)
          : null;

      if (hoveredJoint !== hoveredRef.current) {
        if (hoveredRef.current && onUnhover) {
          onUnhover(hoveredRef.current);
        }
        hoveredRef.current = hoveredJoint;
        if (hoveredJoint && onHover) {
          onHover(hoveredJoint);
        }
      }

      setCursor(hoveredJoint ? "grab" : "");
    }

    function pointerDown(event: PointerEvent) {
      const pointer = getPointer(event);
      raycasterRef.current.setFromCamera(
        new THREE.Vector2(pointer.x, pointer.y),
        camera,
      );
      const intersections = raycasterRef.current.intersectObject(robot, true);
      let joint =
        intersections.length > 0
          ? findNearestJoint(intersections[0]?.object ?? null)
          : null;

      if (!joint && hoveredRef.current) {
        joint = hoveredRef.current;
      }

      if (!joint) {
        return;
      }

      const candidate = joint as {
        angle?: number;
        jointValue?: number[];
        jointType?: string;
        axis: THREE.Vector3;
        matrixWorld: THREE.Matrix4;
      };

      draggingRef.current = joint;
      dragStartValueRef.current =
        typeof candidate.angle === "number"
          ? candidate.angle
          : (candidate.jointValue?.[0] ?? 0);
      dragStartPointRef.current =
        intersections[0]?.point.clone() ??
        new THREE.Vector3().set(0, 0, 0).applyMatrix4(candidate.matrixWorld);

      const axis = new THREE.Vector3()
        .copy(candidate.axis)
        .transformDirection(candidate.matrixWorld)
        .normalize();
      const pivot = new THREE.Vector3()
        .set(0, 0, 0)
        .applyMatrix4(candidate.matrixWorld);

      if (candidate.jointType === "prismatic") {
        const perpendicular = new THREE.Vector3(1, 0, 0);
        if (Math.abs(axis.dot(perpendicular)) > 0.99) {
          perpendicular.set(0, 1, 0);
        }
        const normal = new THREE.Vector3()
          .crossVectors(axis, perpendicular)
          .normalize();
        dragPlaneRef.current = new THREE.Plane().setFromNormalAndCoplanarPoint(
          normal,
          pivot,
        );
      } else {
        dragPlaneRef.current = new THREE.Plane().setFromNormalAndCoplanarPoint(
          axis,
          pivot,
        );
      }

      setCursor("grabbing");
      onDragStart?.(joint);
      activePointerIdRef.current = event.pointerId;
      domElement.setPointerCapture(event.pointerId);
    }

    function pointerUp(event: PointerEvent) {
      if (draggingRef.current) {
        onDragEnd?.(draggingRef.current);
        draggingRef.current = null;
        dragStartPointRef.current = null;
        dragPlaneRef.current = null;
      }
      activePointerIdRef.current = null;
      setCursor(hoveredRef.current ? "grab" : "");
      domElement.releasePointerCapture(event.pointerId);
    }

    domElement.addEventListener("pointermove", pointerMove);
    domElement.addEventListener("pointerdown", pointerDown, true);
    domElement.addEventListener("pointerup", pointerUp, true);

    return () => {
      if (draggingRef.current) {
        onDragEnd?.(draggingRef.current);
        draggingRef.current = null;
      }
      domElement.removeEventListener("pointermove", pointerMove);
      domElement.removeEventListener("pointerdown", pointerDown, true);
      domElement.removeEventListener("pointerup", pointerUp, true);
      domElement.style.cursor = "";
    };
  }, [
    camera,
    enabled,
    gl.domElement,
    onDragEnd,
    onDragStart,
    onHover,
    onUnhover,
    onUpdateJoint,
    robot,
  ]);

  useEffect(() => {
    const domElement = gl.domElement;
    if (!draggingRef.current) {
      return;
    }

    draggingRef.current = null;
    dragStartPointRef.current = null;
    dragPlaneRef.current = null;

    const pointerId = activePointerIdRef.current;
    activePointerIdRef.current = null;
    if (pointerId !== null) {
      try {
        domElement.releasePointerCapture(pointerId);
      } catch {
        // ignore - capture may already be gone
      }
    }

    domElement.style.cursor = hoveredRef.current ? "grab" : "";
  }, [cancelSequence, gl.domElement]);

  return null;
}
