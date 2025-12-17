import {
  Goal,
  Solver,
  setIKFromUrdf,
  setUrdfFromIK,
  urdfRobotToIKRoot,
} from "closed-chain-ik";
import type { URDFRobot } from "urdf-loader/src/URDFClasses";

export interface SolveIKParams {
  robot: URDFRobot;
  ikRoot: any; // Pre-initialized IK root
  currentAngles?: number[];
  goalPosition: [number, number, number];
  goalQuaternion: [number, number, number, number];
  endEffectorName?: string;
}

const SOLVE_STATUS = {
  CONVERGED: 0,
  STALLED: 1,
  DIVERGED: 2,
  TIMEOUT: 3,
} as const;

type SolveStatus = (typeof SOLVE_STATUS)[keyof typeof SOLVE_STATUS];

export interface SolveIKResult {
  nextAngles: number[];
  statuses: SolveStatus[];
  converged: boolean;
}

const END_EFFECTOR_FALLBACKS = [
  "tool_point",
  "tool0",
  "tool",
  "ee_link",
  "tcp",
  "flange",
];

export function solveIK({
  robot,
  ikRoot,
  currentAngles,
  goalPosition,
  goalQuaternion,
  endEffectorName,
}: SolveIKParams): SolveIKResult {
  if (!robot) {
    throw new Error("solveIK requires a loaded URDF robot instance");
  }
  
  if (!ikRoot) {
    throw new Error("solveIK requires a pre-initialized IK root");
  }

  const jointNames = Object.keys(robot.joints ?? {});
  
  // Set current angles on the robot
  if (currentAngles && currentAngles.length) {
    jointNames.forEach((name, index) => {
      const angle = currentAngles[index];
      if (typeof angle === "number" && robot.setJointValue) {
        robot.setJointValue(name, angle);
      }
    });
    robot.updateMatrixWorld(true);
  }

  // Sync IK chain with current robot pose
  setIKFromUrdf(ikRoot, robot);

  // Find end effector using the find method on ikRoot
  const candidateNames = [endEffectorName, ...END_EFFECTOR_FALLBACKS].filter(
    (name): name is string => typeof name === "string" && name.length > 0
  );

  let endLink: any = null;
  for (const name of candidateNames) {
    endLink = ikRoot.find((node: any) => node.name === name);
    if (endLink) {
      break;
    }
  }

  if (!endLink) {
    // Try to find any link by traversing the tree
    const allNodes: any[] = [];
    const traverse = (node: any) => {
      if (node) {
        allNodes.push(node);
        if (node.child) traverse(node.child);
        if (node.children) {
          node.children.forEach((child: any) => traverse(child));
        }
      }
    };
    traverse(ikRoot);
    
    endLink = allNodes[allNodes.length - 1];
    
    if (!endLink) {
      console.warn('solveIK: Could not find any end effector link in IK chain');
      return {
        nextAngles: jointNames.map((name) => robot.joints[name]?.angle ?? 0),
        statuses: [],
        converged: false,
      };
    }
  }

  const solver = new Solver(ikRoot);

  const goal = new Goal();
  goal.makeClosure(endLink);
  goal.setPosition(...goalPosition);
  goal.setQuaternion(...goalQuaternion);
  goal.setMatrixNeedsUpdate();

  // Run solver with multiple iterations for better convergence
  const statuses = solver.solve() as SolveStatus[];
  
  // Converged only if all chains report success
  const converged = statuses.every((status) => status === SOLVE_STATUS.CONVERGED);
  let nextAngles = currentAngles ?? [];

  if (converged) {
    setUrdfFromIK(robot, ikRoot);
    robot.updateMatrixWorld(true);
    nextAngles = jointNames.map((name) => robot.joints[name]?.angle ?? 0);
  } else {
    // If failed, try position-only constraint (ignore orientation)
    goal.setPosition(...goalPosition);
    // Don't set quaternion, making it position-only
    const goal2 = new Goal();
    goal2.makeClosure(endLink);
    goal2.setPosition(...goalPosition);
    goal2.setMatrixNeedsUpdate();
    
    const statuses2 = solver.solve() as SolveStatus[];
    const converged2 = statuses2.every((status) => status === SOLVE_STATUS.CONVERGED);
    
    if (converged2) {
      setUrdfFromIK(robot, ikRoot);
      robot.updateMatrixWorld(true);
      nextAngles = jointNames.map((name) => robot.joints[name]?.angle ?? 0);
      return {
        nextAngles,
        statuses: statuses2,
        converged: true,
      };
    }
  }

  return {
    nextAngles,
    statuses,
    converged,
  };
}
