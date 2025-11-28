import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import RobotLoader from '../utlis/RobotLoader.tsx';
import { Suspense } from "react";
import { Html, useProgress } from "@react-three/drei";

export interface ViewportProps {
  urdfPath: string;
}

function Loader() {
    const { active, progress, errors, item, loaded, total } = useProgress()
    return <Html center className="text-4xl text-white">{progress} % loaded</Html>
}

export function Viewport(props: ViewportProps) {

  return (
    <div className="Viewport">
      <Canvas
        camera={{ position: [3, 3, 3], fov: 50 }}
      >
        <gridHelper args={[10, 10]} />
        <axesHelper />
        {/* Background color */}
        <color attach="background" args={["#202025"]} />

        {/* Lights */}
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={1.2} />

        {/* Mouse controls */}
        <OrbitControls />
        <Suspense fallback={<Loader />}>
                <RobotLoader urdfPath={props.urdfPath} />
        </Suspense>
      </Canvas>
    </div>
  );
};
  {/*

  useEffect(() => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(500, 500);
    renderer.setClearColor(0x222233);
    mountRef.current?.appendChild(renderer.domElement);

    const light = new THREE.AmbientLight(0xffffff, 1);
    scene.add(light);


    // Example: Load URDF robot here
    const manager = new THREE.LoadingManager();
    loadMeshFunc('/urdf/eva_description/meshes/part.stl', manager, (mesh, error) => {
      if (mesh) {
        scene.add(mesh);
      } else {
        console.error(error);
      }
    });

    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      mountRef.current?.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [urdfPath]);

  return <div ref={mountRef} style={{ width: 500, height: 500 }} />;
}; */}