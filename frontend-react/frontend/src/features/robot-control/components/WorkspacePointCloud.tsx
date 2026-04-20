import { useMemo } from 'react';
import * as THREE from 'three';

interface WorkspacePointCloudProps {
  points: THREE.Vector3[];
  visible: boolean;
}

function makeCircleSpriteTexture(size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const radius = size / 2;
  const gradient = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.6, 'rgba(255,255,255,0.8)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(radius, radius, radius, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export function WorkspacePointCloud({ points, visible }: WorkspacePointCloudProps) {
  const positions = useMemo(() => {
    const data = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i]!;
      data[i * 3] = point.x;
      data[i * 3 + 1] = point.y;
      data[i * 3 + 2] = point.z;
    }
    return data;
  }, [points]);

  const sprite = useMemo(() => makeCircleSpriteTexture(), []);

  if (!visible || !points.length) return null;

  return (
    <points renderOrder={1}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={0x33ff66}
        size={0.01}
        sizeAttenuation
        map={sprite}
        alphaMap={sprite}
        transparent
        opacity={0.9}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
