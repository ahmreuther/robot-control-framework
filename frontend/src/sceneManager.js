import URDFLoader from 'urdf-loader/src/URDFLoader.js';

export const renderForAFewFrames = (viewer, frames = 6) => new Promise(resolve => {
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
  //fills next slot if empty. e.g. robot 2 was deleted and a new robot is added: ( 1, x , 3 -> 1, 4, 3)
  const slot = Number.isFinite(slotIndex) ? slotIndex : (typeof getNextSlotIndex === 'function' ? getNextSlotIndex() : 0);
  robot.position.x = offsetX * slot;
  
  robot.name = robot.name || `robot_${Date.now()}`;

  // Needed to render robot
  robot.traverse(node => {
    if (node && node.isObject3D) node.frustumCulled = false;
  });
  robot.updateMatrixWorld(true);

  // Add to scene
  viewer.world.add(robot);
  viewer.world.updateMatrixWorld(true);
  
  // Render a few frames to ensure the robot appears correctly
  await renderForAFewFrames(viewer);
  if (typeof viewer.redraw === 'function') viewer.redraw();

  return robot;
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
