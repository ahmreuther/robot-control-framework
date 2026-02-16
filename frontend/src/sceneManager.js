import URDFLoader from 'urdf-loader/src/URDFLoader.js';
import {Group} from 'three';

//needed to render the robot correctly when adding it
const renderForAFewFrames = (viewer, frames = 6) => new Promise(resolve => {
  let count = 0;
  const tick = () => {
    if (viewer.controls && typeof viewer.controls.update === 'function') viewer.controls.update();
    if (viewer.redraw) {
      viewer.redraw();
    } else if (viewer.renderer && viewer.scene && viewer.camera) {
      viewer.renderer.render(viewer.scene, viewer.camera);
    }
    if (++count >= frames) return resolve();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

export async function spawnRobot(viewer, { urdfPath, offsetX = 1.5, slotIndex = null, getNextSlotIndex = null } = {}) {
  if (!urdfPath || !viewer) return null;

  const loader = new URDFLoader();
  if (viewer.loadMeshFunc) loader.loadMeshCb = viewer.loadMeshFunc;
  if (viewer.fetchOptions) loader.fetchOptions = viewer.fetchOptions;
  
  const robot = await new Promise((resolve, reject) => {
    loader.load(urdfPath, r => resolve(r), undefined, err => reject(err));
  });

  const slot = Number.isFinite(slotIndex) ? slotIndex : (typeof getNextSlotIndex === 'function' ? getNextSlotIndex() : 0);

  // create a *rig* (the robot's local coordinate system)
  const rig = new Group();
  rig.name = `rig_${robot.name || 'robot'}_${slot}`;    // TODO wth are these ` <---
  rig.position.x = offsetX * slot;

  // robot stays at local origin inside the rig
  robot.position.set(0, 0, 0);                          // This might not work
  robot.quaternion.identity();
  
  // Needed to render robot correctly
  robot.traverse(node => {
    if (node && node.isObject3D) node.frustumCulled = false;
  });

  rig.add(robot);
  rig.updateMatrixWorld(true);

  // Add rig to scene (NOT robot)
  viewer.world.add(rig);
  viewer.world.updateMatrixWorld(true);

  await renderForAFewFrames(viewer);
  if (typeof viewer.redraw === 'function') viewer.redraw();

  // Return both so callers can store rig, but still access robot for IK
  return {rig, robot};
}

export function disposeRobotNode(node) {
  if (!node) return;
  node.traverse(child => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach(m => m && m.dispose && m.dispose());
      else if (child.material.dispose) child.material.dispose();
    }
  });
}
