import { Goal, Solver } from "closed-chain-ik/src/core";
import {
  setIKFromUrdf,
  setUrdfFromIK,
  urdfRobotToIKRoot,
} from "closed-chain-ik/src/three/urdfHelpers";
import * as THREE from "three";
import type { URDFRobot } from "urdf-loader/src/URDFClasses";

import { findToolPoint } from "./robotIk";
import { DEFAULT_SOLVER_CONFIG, type SolverConfig } from "./solverConfig";
import {
  evaluateIkConvergence,
  prepareIkTarget,
  type IkConstraintMode,
} from "./robotIkConstraints";

export interface IkTargetPose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  constraintMode: IkConstraintMode;
}

export interface IkSolveResult {
  angles: number[];
  converged: boolean;
  translationError: number;
  rotationError: number;
  statuses: number[];
  toolPosition: THREE.Vector3;
}

export interface RobotIkModel {
  setConfig(config: SolverConfig): void;
  syncFromAngles(angles: number[]): void;
  solve(target: IkTargetPose, robotGroup: THREE.Group): IkSolveResult | null;
}

const IK_SOLVE_STATUS_CONVERGED = 0;
const IK_DOF_X = 0;
const IK_DOF_Y = 1;
const IK_DOF_Z = 2;
const IK_DOF_EX = 3;
const IK_DOF_EY = 4;
const IK_DOF_EZ = 5;

function findNodeInIKByName(ikRoot: any, name: string | null | undefined) {
  if (!ikRoot || !name) return null;
  return ikRoot.find?.((node: { name?: string }) => node.name === name) ?? null;
}

function findEndEffectorInIK(ikRoot: any, preferredName?: string | null) {
  if (!ikRoot) return null;

  const preferred = findNodeInIKByName(ikRoot, preferredName);
  if (preferred) {
    return preferred;
  }

  for (const name of [
    "tool_point",
    "tool0",
    "tool",
    "ee_link",
    "tcp",
    "flange",
  ]) {
    const candidate = findNodeInIKByName(ikRoot, name);
    if (candidate) {
      return candidate;
    }
  }

  const allNodes: any[] = [];
  const traverse = (node: any) => {
    if (!node) return;
    allNodes.push(node);
    if (node.child) traverse(node.child);
    if (node.children) node.children.forEach((child: any) => traverse(child));
  };
  traverse(ikRoot);
  return allNodes[allNodes.length - 1] ?? null;
}

function applyJointAngles(
  robot: URDFRobot,
  jointNames: string[],
  angles: number[],
) {
  jointNames.forEach((jointName, index) => {
    robot.setJointValue(jointName, angles[index] ?? 0);
  });
  robot.updateMatrixWorld(true);
}

function quaternionAngularError(
  target: THREE.Quaternion,
  actual: THREE.Quaternion,
) {
  const dot = THREE.MathUtils.clamp(Math.abs(target.dot(actual)), -1, 1);
  return 2 * Math.acos(dot);
}

export function createRobotIkModel(
  sourceRobot: URDFRobot,
  orderedJointNames: string[],
): RobotIkModel | null {
  const solverRobot = sourceRobot.clone(true) as URDFRobot;
  const toolPoint = findToolPoint(solverRobot);
  if (!toolPoint) {
    return null;
  }

  const ikRoot = urdfRobotToIKRoot(solverRobot, false) as any;
  if (!ikRoot) {
    return null;
  }

  ikRoot.clearDoF();
  setIKFromUrdf(ikRoot, solverRobot);

  const ikEndEffector = findEndEffectorInIK(ikRoot, toolPoint.name);
  if (!ikEndEffector) {
    return null;
  }

  const goal = new Goal();
  goal.makeClosure(ikEndEffector);

  const solver = new Solver(ikRoot) as Solver & SolverConfig;
  Object.assign(solver, DEFAULT_SOLVER_CONFIG);

  const toolLocalPosition = new THREE.Vector3();
  const toolLocalQuaternion = new THREE.Quaternion();
  const toolWorldPosition = new THREE.Vector3();
  const toolWorldQuaternion = new THREE.Quaternion();

  return {
    setConfig(config: SolverConfig) {
      Object.assign(solver, config);
    },

    syncFromAngles(angles: number[]) {
      applyJointAngles(solverRobot, orderedJointNames, angles);
      setIKFromUrdf(ikRoot, solverRobot);
    },

    solve(target: IkTargetPose, robotGroup: THREE.Group) {
      solverRobot.updateMatrixWorld(true);
      toolPoint.getWorldQuaternion(toolLocalQuaternion);
      const preparedTarget = prepareIkTarget({
        target,
        robotGroup,
        currentToolLocalQuaternion: toolLocalQuaternion,
        dofX: IK_DOF_X,
        dofY: IK_DOF_Y,
        dofZ: IK_DOF_Z,
        dofEX: IK_DOF_EX,
        dofEY: IK_DOF_EY,
        dofEZ: IK_DOF_EZ,
      });

      goal.setGoalDoF(...preparedTarget.goalDofs);
      goal.setPosition(
        preparedTarget.localPosition.x,
        preparedTarget.localPosition.y,
        preparedTarget.localPosition.z,
      );
      goal.setQuaternion(
        preparedTarget.localQuaternion.x,
        preparedTarget.localQuaternion.y,
        preparedTarget.localQuaternion.z,
        preparedTarget.localQuaternion.w,
      );
      goal.setMatrixNeedsUpdate();

      const statuses = [...solver.solve()];
      setUrdfFromIK(solverRobot, ikRoot);
      solverRobot.updateMatrixWorld(true);

      toolPoint.getWorldPosition(toolLocalPosition);
      toolPoint.getWorldQuaternion(toolLocalQuaternion);
      toolWorldPosition.copy(toolLocalPosition);
      robotGroup.localToWorld(toolWorldPosition);
      toolWorldQuaternion.copy(
        robotGroup.getWorldQuaternion(new THREE.Quaternion()),
      );
      toolWorldQuaternion.multiply(toolLocalQuaternion);

      const translationError = toolLocalPosition.distanceTo(
        preparedTarget.localPosition,
      );
      const rotationError =
        target.constraintMode === "pose"
          ? quaternionAngularError(target.quaternion, toolWorldQuaternion)
          : 0;
      const converged = evaluateIkConvergence({
        constraintMode: target.constraintMode,
        statuses,
        convergedStatus: IK_SOLVE_STATUS_CONVERGED,
        translationError,
        translationConvergeThreshold: solver.translationConvergeThreshold,
      });

      return {
        angles: orderedJointNames.map(
          (jointName) => solverRobot.joints[jointName]?.angle ?? 0,
        ),
        converged,
        translationError,
        rotationError,
        statuses,
        toolPosition: toolWorldPosition.clone(),
      };
    },
  };
}
