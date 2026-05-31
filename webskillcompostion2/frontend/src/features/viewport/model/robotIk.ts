import * as THREE from "three";
import type { URDFRobot } from "urdf-loader/src/URDFClasses.js";

export interface IkSolveResult {
  angles: number[];
  converged: boolean;
  distance: number;
}

type IkJoint = THREE.Object3D & {
  isURDFJoint?: boolean;
  name: string;
  jointType?: string;
  axis?: THREE.Vector3;
  angle?: number;
  limit?: { lower?: number; upper?: number };
  setJointValue(value: number): void;
};

const END_EFFECTOR_NAMES = ["tool_point", "tool0", "tool", "ee_link", "tcp", "flange"];

function isMovableJoint(joint: IkJoint) {
  return (
    joint.isURDFJoint &&
    joint.jointType !== "fixed" &&
    joint.jointType !== "floating" &&
    joint.jointType !== "planar"
  );
}

function clampJointValue(joint: IkJoint, value: number) {
  if (joint.jointType === "continuous") {
    return value;
  }

  const lower = joint.limit?.lower;
  const upper = joint.limit?.upper;
  const nextValue =
    Number.isFinite(lower) && Number.isFinite(upper)
      ? Math.min(upper as number, Math.max(lower as number, value))
      : value;
  return nextValue;
}

function signedAngleAroundAxis(
  from: THREE.Vector3,
  to: THREE.Vector3,
  axis: THREE.Vector3,
) {
  const cross = new THREE.Vector3().crossVectors(from, to);
  const dot = THREE.MathUtils.clamp(from.dot(to), -1, 1);
  return Math.atan2(axis.dot(cross), dot);
}

export function findToolPoint(robot: URDFRobot): THREE.Object3D | null {
  let toolPoint: THREE.Object3D | null = null;

  robot.traverse((child) => {
    if (END_EFFECTOR_NAMES.includes(child.name)) {
      toolPoint = child;
    }
  });

  if (toolPoint) {
    return toolPoint;
  }

  robot.traverse((child) => {
    if (toolPoint) return;
    if (child.type === "URDFLink" && child.children.length === 0) {
      toolPoint = child;
    }
  });

  return toolPoint;
}

function collectIkChain(toolPoint: THREE.Object3D): IkJoint[] {
  const chain: IkJoint[] = [];
  let current: THREE.Object3D | null = toolPoint.parent;

  while (current) {
    const joint = current as IkJoint;
    if (isMovableJoint(joint)) {
      chain.push(joint);
    }
    current = current.parent;
  }

  return chain;
}

function snapshotJointAngles(chain: IkJoint[]): number[] {
  return chain.map((joint) => joint.angle ?? 0);
}

function restoreJointAngles(chain: IkJoint[], angles: number[]) {
  chain.forEach((joint, index) => {
    joint.setJointValue(angles[index] ?? 0);
  });
}

export function getToolPointWorldPosition(robot: URDFRobot): THREE.Vector3 | null {
  const toolPoint = findToolPoint(robot);
  if (!toolPoint) {
    return null;
  }

  robot.updateMatrixWorld(true);
  return toolPoint.getWorldPosition(new THREE.Vector3());
}

export function getToolPointWorldQuaternion(robot: URDFRobot): THREE.Quaternion | null {
  const toolPoint = findToolPoint(robot);
  if (!toolPoint) {
    return null;
  }

  robot.updateMatrixWorld(true);
  return toolPoint.getWorldQuaternion(new THREE.Quaternion());
}

export function solvePositionIk(
  robot: URDFRobot,
  targetWorld: THREE.Vector3,
  orderedJointNames: string[],
  maxIterations = 18,
  threshold = 0.01,
): IkSolveResult | null {
  const toolPoint = findToolPoint(robot);
  if (!toolPoint) {
    return null;
  }

  const chain = collectIkChain(toolPoint);
  if (!chain.length) {
    return null;
  }
  const initialAngles = snapshotJointAngles(chain);

  const pivot = new THREE.Vector3();
  const endPos = new THREE.Vector3();
  const axisWorld = new THREE.Vector3();
  const toEnd = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const projectedEnd = new THREE.Vector3();
  const projectedTarget = new THREE.Vector3();

  let converged = false;
  let distance = Infinity;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    robot.updateMatrixWorld(true);
    toolPoint.getWorldPosition(endPos);
    distance = endPos.distanceTo(targetWorld);
    if (distance <= threshold) {
      converged = true;
      break;
    }

    for (const joint of chain) {
      joint.updateMatrixWorld(true);
      pivot.set(0, 0, 0).applyMatrix4(joint.matrixWorld);
      axisWorld
        .copy(joint.axis ?? new THREE.Vector3(0, 0, 1))
        .transformDirection(joint.matrixWorld)
        .normalize();

      toolPoint.getWorldPosition(endPos);

      if (joint.jointType === "prismatic") {
        const delta = targetWorld.clone().sub(endPos).dot(axisWorld) * 0.5;
        const nextValue = clampJointValue(joint, (joint.angle ?? 0) + delta);
        joint.setJointValue(nextValue);
        continue;
      }

      toEnd.copy(endPos).sub(pivot);
      toTarget.copy(targetWorld).sub(pivot);

      projectedEnd.copy(toEnd).addScaledVector(axisWorld, -toEnd.dot(axisWorld));
      projectedTarget
        .copy(toTarget)
        .addScaledVector(axisWorld, -toTarget.dot(axisWorld));

      const endLength = projectedEnd.lengthSq();
      const targetLength = projectedTarget.lengthSq();
      if (endLength < 1e-10 || targetLength < 1e-10) {
        continue;
      }

      projectedEnd.normalize();
      projectedTarget.normalize();

      const deltaAngle =
        signedAngleAroundAxis(projectedEnd, projectedTarget, axisWorld) * 0.7;
      const nextValue = clampJointValue(joint, (joint.angle ?? 0) + deltaAngle);
      joint.setJointValue(nextValue);
    }
  }

  robot.updateMatrixWorld(true);
  toolPoint.getWorldPosition(endPos);
  distance = endPos.distanceTo(targetWorld);
  converged = distance <= threshold;

  const solvedAngles = orderedJointNames.map(
    (jointName) => robot.joints[jointName]?.angle ?? 0,
  );
  restoreJointAngles(chain, initialAngles);
  robot.updateMatrixWorld(true);

  return {
    angles: solvedAngles,
    converged,
    distance,
  };
}
