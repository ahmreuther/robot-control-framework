export interface RobotModelConfig {
  id: string;
  label: string;
  url: string;
  orderedUrdfJointNames: string[];
  homeAngles: number[] | null;
}

export interface RobotOrigin {
  x: number;
  y: number;
  z: number;
  roll: number;
  pitch: number;
  yaw: number;
}

const DEGREE_TO_RADIAN = Math.PI / 180;

type HomePoseDefinition = {
  homePosition: number[];
  homePositionDegrees: boolean;
};

// Mirrors the authored values in public/urdf/home_poses.json.
const HOME_POSE_BY_MODEL_ID: Record<string, HomePoseDefinition> = {
  eva: {
    homePosition: [0, 0, -90, 0, -90, 0],
    homePositionDegrees: true,
  },
  ur5e: {
    homePosition: [0, -90, -90, 0, 0, 0],
    homePositionDegrees: true,
  },
  fr3: {
    homePosition: [0, 0, 0, 0, -90, 0, 90, 0, 0],
    homePositionDegrees: true,
  },
  fr3_wagon: {
    homePosition: [0, 0, 0, 0, -90, 0, 90, 0, 0],
    homePositionDegrees: true,
  },
};

export function resolveHomeAnglesForModel(
  modelId: string,
  jointNames: string[],
): number[] | null {
  const definition = HOME_POSE_BY_MODEL_ID[modelId];
  if (!definition) {
    return null;
  }

  return jointNames.map((_, index) => {
    const value = definition.homePosition[index] ?? 0;
    return definition.homePositionDegrees ? value * DEGREE_TO_RADIAN : value;
  });
}

export const ROBOT_MODEL_OPTIONS: RobotModelConfig[] = [
  {
    id: "eva",
    label: "EVA",
    url: "/urdf/eva_description/urdf/eva_description.urdf",
    orderedUrdfJointNames: [
      "joint_1",
      "joint_2",
      "joint_3",
      "joint_4",
      "joint_5",
      "joint_6",
    ],
    homeAngles: resolveHomeAnglesForModel("eva", [
      "joint_1",
      "joint_2",
      "joint_3",
      "joint_4",
      "joint_5",
      "joint_6",
    ]),
  },
  {
    id: "fr3",
    label: "FR3",
    url: "/urdf/fr3_description/urdf/fr3.urdf",
    orderedUrdfJointNames: [
      "arm_joint1",
      "arm_joint2",
      "arm_joint3",
      "arm_joint4",
      "arm_joint5",
      "arm_joint6",
      "arm_joint7",
    ],
    homeAngles: resolveHomeAnglesForModel("fr3", [
      "arm_joint1",
      "arm_joint2",
      "arm_joint3",
      "arm_joint4",
      "arm_joint5",
      "arm_joint6",
      "arm_joint7",
    ]),
  },
  {
    id: "fr3_wagon",
    label: "FR3 with Wagon",
    url: "/urdf/fr3_description_with_wagon/urdf/fr3.urdf",
    orderedUrdfJointNames: [
      "arm_joint1",
      "arm_joint2",
      "arm_joint3",
      "arm_joint4",
      "arm_joint5",
      "arm_joint6",
      "arm_joint7",
    ],
    homeAngles: resolveHomeAnglesForModel("fr3_wagon", [
      "arm_joint1",
      "arm_joint2",
      "arm_joint3",
      "arm_joint4",
      "arm_joint5",
      "arm_joint6",
      "arm_joint7",
    ]),
  },
  {
    id: "ur5e",
    label: "UR5e",
    url: "/urdf/ur5_description/urdf/ur5_robot.urdf",
    orderedUrdfJointNames: [
      "shoulder_pan_joint",
      "shoulder_lift_joint",
      "elbow_joint",
      "wrist_1_joint",
      "wrist_2_joint",
      "wrist_3_joint",
    ],
    homeAngles: resolveHomeAnglesForModel("ur5e", [
      "shoulder_pan_joint",
      "shoulder_lift_joint",
      "elbow_joint",
      "wrist_1_joint",
      "wrist_2_joint",
      "wrist_3_joint",
    ]),
  },
];
