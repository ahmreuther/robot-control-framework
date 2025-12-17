import type { URDFRobot } from "urdf-loader/src/URDFClasses";
import * as THREE from "three";

export class RobotAdapter {
  constructor(private robot: URDFRobot) {}

  get jointNames(): string[] {
    return Object.keys(this.robot.joints ?? {});
  }

  setJointAngles(angles: number[]) {
    this.jointNames.forEach((name, idx) => {
      const angle = angles[idx];
      if (angle !== undefined) {
        this.robot.setJointValue(name, angle);
      }
    });
    this.robot.updateMatrixWorld(true);
  }

  getEndEffector(fallbacks = ["tool_point", "tool0", "ee_link", "tcp", "flange"]) {
    for (const name of fallbacks) {
      const link = this.robot.getObjectByName(name);
      if (link) return link;
    }
    let last: any = null;
    this.robot.traverse((obj: any) => { if (obj.isURDFLink) last = obj; });
    return last;
  }

  getPoseOf(object: THREE.Object3D) {
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    object.updateMatrixWorld(true);
    object.getWorldPosition(pos);
    object.getWorldQuaternion(quat);
    return { position: pos, quaternion: quat };
  }
}