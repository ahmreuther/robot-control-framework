import { Environment, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { message, notification } from 'antd';
import { Component, type ReactNode, Suspense, useEffect, useState } from 'react';

import type { JointStateManager } from '../hooks/useJointState';
import type { JointProperty } from '../hooks/useSceneState';
import { Robot } from './Robot';
import { SolverStatus } from './SolverStatus';
import { Stats } from './Stats';
import { MethodCallStatusPanel } from './MethodCallStatus';

function EnvironmentLoader() {
  useEffect(() => {
    const hide = message.loading('Loading environment (HDR)', 0);
    return () => hide();
  }, []);

  return null;
}

function RobotLoader() {
  useEffect(() => {
    const hide = message.loading('Loading robot model', 0);
    return () => hide();
  }, []);

  return null;
}

class EnvironmentErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean; hideLoading?: () => void }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    if (this.state.hideLoading) {
      this.state.hideLoading();
    }

    notification.error({
      message: 'Failed to load environment',
      description: `Could not load HDR environment: ${error.message}. Falling back to simple lighting.`,
      duration: 5,
      placement: 'topRight',
    });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export interface ViewportProps {
  urdfPath?: string | null;
  jointManager: JointStateManager;
  onJointLimitsLoaded: (limits: (JointProperty | null)[]) => void;
  showCollisionMesh: boolean;
  setHoveredJointMesh?: (index: number | null) => void;
  effectComposer?: boolean;
  environment?: boolean;
  pendingJoints: number[];
  setPendingJoints: (joints: number[]) => void;
}

export function Viewport(props: ViewportProps) {
  const [drag, setDrag] = useState<boolean>(false);
  const [solveStatuses, setSolveStatusesState] = useState<number[]>([]);
  const [movedDistance, setMovedDistance] = useState<number>(0);

  return (
    <div className="p-2 h-full">
      <div className="relative h-full w-full z-0 ">
        {/* Viewport Stats (overlay) */}
        <div className="absolute top-0 left-0 z-50 flex gap-20">
          <Stats />
          <SolverStatus solveStatuses={solveStatuses} movedDistance={movedDistance} />
        </div>

        <Canvas camera={{ position: [1.5, 1.0, -2.0], up: [0, 1, 0], fov: 50 }}>
          {/* Environment */}
          {props.environment ? (
            <EnvironmentErrorBoundary
              fallback={
                <>
                  <ambientLight intensity={2} />
                  <directionalLight position={[5, 10, 7.5]} intensity={1} />
                </>
              }
            >
              <Suspense fallback={<EnvironmentLoader />}>
                <Environment
                  files={
                    'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/quarry_04_puresky_2k.hdr'
                  }
                  environmentIntensity={0.6}
                  backgroundIntensity={0.5}
                  //ground={{ height: 5, radius: 40, scale: 20 }}
                  background={true}
                />
              </Suspense>
            </EnvironmentErrorBoundary>
          ) : (
            <>
              <ambientLight intensity={2} />
              <directionalLight position={[5, 10, 7.5]} intensity={1} />
            </>
          )}

          {/* Postprocessing Effects */}
          {props.effectComposer && (
            <EffectComposer>
              <Bloom />
              <Vignette eskil={false} offset={0.1} darkness={0.3} />
            </EffectComposer>
          )}

          {/* Grid Helper */}
          <gridHelper args={[10, 10]} rotation={[0, Math.PI / 2, 0]} />

          {/* Background color */}
          <color attach="background" args={['#202025']} />

          {/* Mouse controls */}
          <OrbitControls enabled={!drag} />

          {/* Robot with IK */}
          <Suspense fallback={<RobotLoader />}>
            <Robot
              urdfPath={props.urdfPath}
              drag={drag}
              onSolveStatusesChange={setSolveStatusesState}
              onDrag={setDrag}
              jointManager={props.jointManager}
              onJointLimitsLoaded={props.onJointLimitsLoaded}
              showCollisionMesh={props.showCollisionMesh}
              setHoveredJointMesh={props.setHoveredJointMesh}
              setMovedDistance={setMovedDistance}
              pendingJoints={props.pendingJoints}
              setPendingJoints={props.setPendingJoints}
            />
          </Suspense>
        </Canvas>
      </div>
    </div>
  );
}
