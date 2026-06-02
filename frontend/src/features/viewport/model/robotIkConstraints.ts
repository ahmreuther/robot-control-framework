import * as THREE from "three";

export type IkConstraintMode = "pose" | "position";

export interface IkTargetPoseLike {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  constraintMode: IkConstraintMode;
}

export interface PreparedIkTarget {
  localPosition: THREE.Vector3;
  localQuaternion: THREE.Quaternion;
  goalDofs: number[];
}

export function prepareIkTarget(params: {
  target: IkTargetPoseLike;
  robotGroup: THREE.Group;
  currentToolLocalQuaternion: THREE.Quaternion;
  dofX: number;
  dofY: number;
  dofZ: number;
  dofEX: number;
  dofEY: number;
  dofEZ: number;
}): PreparedIkTarget {
  const {
    target,
    robotGroup,
    currentToolLocalQuaternion,
    dofX,
    dofY,
    dofZ,
    dofEX,
    dofEY,
    dofEZ,
  } = params;

  const localPosition = target.position.clone();
  robotGroup.worldToLocal(localPosition);

  const localQuaternion = new THREE.Quaternion();
  if (target.constraintMode === "pose") {
    const robotGroupWorldQuaternion = robotGroup.getWorldQuaternion(
      new THREE.Quaternion(),
    );
    localQuaternion
      .copy(target.quaternion)
      .premultiply(robotGroupWorldQuaternion.invert());
  } else {
    localQuaternion.copy(currentToolLocalQuaternion);
  }

  return {
    localPosition,
    localQuaternion,
    goalDofs:
      target.constraintMode === "pose"
        ? [dofX, dofY, dofZ, dofEX, dofEY, dofEZ]
        : [dofX, dofY, dofZ],
  };
}

export function evaluateIkConvergence(params: {
  constraintMode: IkConstraintMode;
  statuses: number[];
  convergedStatus: number;
  translationError: number;
  translationConvergeThreshold: number;
  rotationError: number;
  rotationConvergeThreshold: number;
}): boolean {
  const {
    constraintMode,
    statuses,
    convergedStatus,
    translationError,
    translationConvergeThreshold,
    rotationError,
    rotationConvergeThreshold,
  } = params;

  if (constraintMode === "pose") {
    return (
      translationError <= translationConvergeThreshold &&
      rotationError <= rotationConvergeThreshold
    );
  }

  return translationError <= translationConvergeThreshold;
}
