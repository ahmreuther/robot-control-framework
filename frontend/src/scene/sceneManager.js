import URDFLoader from 'urdf-loader/src/URDFLoader.js';
import {Group} from 'three';

/*
Loads a URDF into a rig and adds it to the scene. Each robot gets its own rig (`THREE.Group`) which handles the world position (slot offset). 
The robot itself stays at `(0,0,0)` locally. This keeps IK/FK calculations easy and avoids problems with the offset.  
We render a few frames after adding a rig so it renders (mostly correct).
*/

/**
 * Render a few frames so a newly added robot rig stabilizes.
 * @param {Object} viewer - Viewer with renderer/controls.
 * @param {number} frames - Number of frames to render.
 * @returns {Promise<void>}
 */
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

/**
 * Load a URDF robot, wrap it in a rig group with a slot offset, and add to scene.
 * @param {Object} viewer - Viewer with world, renderer, controls.
 * @param {Object} options - Robot options.
 * @param {string} options.urdfPath - Path to URDF file.
 * @param {number} [options.offsetX=1.5] - Horizontal offset per slot.
 * @param {number} [options.slotIndex] - Slot index for this robot.
 * @param {Function} [options.getNextSlotIndex] - Function to get next available slot.
 * @returns {Promise<{rig: Group, robot: Object}>} - Added rig and robot.
 */
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

/**
 * Dispose geometries and materials of a robot rig to free GPU memory.
 * @param {Object} node - Rig or robot root node.
 */
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
