import type { LoadingManager } from "three";
import type { URDFRobot } from "urdf-loader/src/URDFClasses.js";

export default class URDFLoader {
  constructor(manager?: LoadingManager);
  parseCollision: boolean;
  parseVisual: boolean;
  load(
    urdf: string,
    onComplete: (robot: URDFRobot) => void,
    onProgress?: ((progress: unknown) => void) | undefined,
    onError?: ((error: unknown) => void) | undefined,
  ): void;
}
