import URDFLoader from 'urdf-loader/src/URDFLoader.js';
import {Group} from 'three';

/*
Loads each URDF into its own rig so multiple robots fit in one scene.
The rig holds the slot offset; the robot stays at origin so IK/FK math stays stable and manipulators can park gizmos on the rig (their baseGroup) without double-transforming.
We render a few frames after adding a rig so controls and materials settle before use.
*/

// Render a few frames so new rigs settle before interaction.
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

// Load a URDF, put it in a slot rig, and add it to the scene for multi-robot layouts.
export async function spawnRobot(viewer, { urdfPath, offsetX = 1.5, slotIndex = null, getNextSlotIndex = null } = {}) {
  if (!urdfPath || !viewer) return null;

  const loader = new URDFLoader();
  if (viewer.loadMeshFunc) loader.loadMeshCb = viewer.loadMeshFunc;
  if (viewer.fetchOptions) loader.fetchOptions = viewer.fetchOptions;
  
  const robot = await new Promise((resolve, reject) => {
    loader.load(urdfPath, r => resolve(r), undefined, err => reject(err));
  });

  const slot = Number.isFinite(slotIndex) ? slotIndex : (typeof getNextSlotIndex === 'function' ? getNextSlotIndex() : 0);

  // Create a rig that carries the offset for this robot.
  const rig = new Group();
  rig.name = `rig_${robot.name || 'robot'}_${slot}`;    // Name carries slot info to debug multi-robot layouts.
  rig.position.x = offsetX * slot;                      // Offset per slot keeps robots from overlapping.

  // Keep robot at local origin; rig owns the world offset.
  robot.position.set(0, 0, 0);
  robot.quaternion.identity();
  
  // Disable culling so no links disappear when off-screen.
  robot.traverse(node => {
    if (node && node.isObject3D) node.frustumCulled = false;
  });

  rig.add(robot);
  rig.updateMatrixWorld(true);

  // Add the rig (not the raw robot) to the scene.
  viewer.world.add(rig);
  viewer.world.updateMatrixWorld(true);

  await renderForAFewFrames(viewer);
  if (typeof viewer.redraw === 'function') viewer.redraw();

  // Return rig and robot so callers can keep both references.
  return {rig, robot};
}

// Dispose geometries/materials for a removed rig to avoid GPU leaks.
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
