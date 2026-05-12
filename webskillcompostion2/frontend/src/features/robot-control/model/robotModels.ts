export interface RobotModelConfig {
  id: string;
  label: string;
  url: string;
  orderedUrdfJointNames: string[];
}

export interface RobotOrigin {
  x: number;
  y: number;
  z: number;
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
  },
  {
    id: "fr3",
    label: "FR3",
    url: "/urdf/fr3_description/urdf/fr3.urdf",
    orderedUrdfJointNames: [
      "fr3_joint1",
      "fr3_joint2",
      "fr3_joint3",
      "fr3_joint4",
      "fr3_joint5",
      "fr3_joint6",
      "fr3_joint7",
    ],
  },
  {
    id: "fr3_wagon",
    label: "FR3 with Wagon",
    url: "/urdf/fr3_description_with_wagon/urdf/fr3.urdf",
    orderedUrdfJointNames: [
      "fr3_joint1",
      "fr3_joint2",
      "fr3_joint3",
      "fr3_joint4",
      "fr3_joint5",
      "fr3_joint6",
      "fr3_joint7",
    ],
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
  },
];
