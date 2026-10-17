import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { CONFIG } from '../engineering/config';
import { forwardKinematics } from '../engineering/kinematics';
import type { JointState, SortDestination } from '../engineering/types';

const linkWidth = 0.055; // Rendering aid only; not an engineering collision envelope.
const jointRadius = 0.043; // Rendering aid only; the baseline's base footprint remains 0.08 m.
const armPlaneOffset = 0.21; // Rendering datum only; the approved baseline has no structural Z offset.
const gripperPadWidth = 0.008;
const gripperDisplayOpening = CONFIG.robot.gripper.opening.max;

function Link({ length, color }: { length: number; color: string }) {
  return (
    <mesh position={[length / 2, 0, 0]} castShadow>
      <boxGeometry args={[length, linkWidth, 0.035]} />
      <meshStandardMaterial color={color} roughness={0.34} metalness={0.45} />
    </mesh>
  );
}

function Joint({ color = '#d3a05f' }: { color?: string }) {
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
      <cylinderGeometry args={[jointRadius, jointRadius, 0.045, 32]} />
      <meshStandardMaterial color={color} roughness={0.3} metalness={0.62} />
    </mesh>
  );
}

function DestinationBin({ destination }: { destination: SortDestination }) {
  const wall = 0.012;
  const height = destination.lipZ - destination.floorZ;
  const { x, y } = destination.outside;
  const z = destination.floorZ + height / 2;
  return (
    <group position={[destination.center.x, destination.center.y, 0]}>
      <mesh position={[0, 0, destination.floorZ]} receiveShadow>
        <boxGeometry args={[x, y, wall]} />
        <meshStandardMaterial color="#536b6c" metalness={0.16} roughness={0.66} />
      </mesh>
      <mesh position={[0, y / 2 - wall / 2, z]}>
        <boxGeometry args={[x, wall, height]} />
        <meshStandardMaterial color="#30434a" metalness={0.25} roughness={0.54} />
      </mesh>
      <mesh position={[0, -y / 2 + wall / 2, z]}>
        <boxGeometry args={[x, wall, height]} />
        <meshStandardMaterial color="#30434a" metalness={0.25} roughness={0.54} />
      </mesh>
      <mesh position={[x / 2 - wall / 2, 0, z]}>
        <boxGeometry args={[wall, y, height]} />
        <meshStandardMaterial color="#30434a" metalness={0.25} roughness={0.54} />
      </mesh>
      <mesh position={[-x / 2 + wall / 2, 0, z]}>
        <boxGeometry args={[wall, y, height]} />
        <meshStandardMaterial color="#30434a" metalness={0.25} roughness={0.54} />
      </mesh>
      <mesh position={[0, 0, destination.lipZ + 0.003]}>
        <boxGeometry args={[x + 0.012, 0.012, 0.006]} />
        <meshStandardMaterial color="#e4a963" metalness={0.4} roughness={0.34} />
      </mesh>
    </group>
  );
}

function Robot({ joints }: { joints: JointState }) {
  const { l1, l2 } = CONFIG.robot.links;
  const tcp = useMemo(() => forwardKinematics(joints, CONFIG), [joints]);
  const sliderTravel = joints.j3 - (CONFIG.cell.tableZ + armPlaneOffset);
  const verticalLength = Math.max(0.015, Math.abs(sliderTravel));
  return (
    <group position={[0, 0, CONFIG.cell.tableZ]}>
      <mesh position={[0, 0, 0.105]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[CONFIG.cell.baseRadius, CONFIG.cell.baseRadius, 0.21, 40]} />
        <meshStandardMaterial color="#26383e" metalness={0.52} roughness={0.35} />
      </mesh>
      <group position={[0, 0, armPlaneOffset]}>
        <group rotation={[0, 0, joints.j1]}>
          <Joint />
          <Link length={l1} color="#d7e0dc" />
          <group position={[l1, 0, 0]} rotation={[0, 0, joints.j2]}>
            <Joint color="#60a99d" />
            <Link length={l2} color="#a9c5bb" />
            <group position={[l2, 0, 0]}>
              <mesh position={[0, 0, sliderTravel / 2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                <cylinderGeometry args={[0.014, 0.018, verticalLength, 20]} />
                <meshStandardMaterial color="#d5a75f" metalness={0.46} roughness={0.3} />
              </mesh>
              <group position={[0, 0, sliderTravel]} rotation={[0, 0, joints.j4]}>
                <mesh castShadow>
                  <boxGeometry args={[0.075, 0.04, 0.018]} />
                  <meshStandardMaterial color="#ecb768" metalness={0.38} roughness={0.38} />
                </mesh>
                <mesh position={[0, gripperDisplayOpening / 2 + gripperPadWidth / 2, -0.014]}>
                  <boxGeometry args={[0.035, gripperPadWidth, 0.045]} />
                  <meshStandardMaterial color="#eff0dc" metalness={0.1} roughness={0.7} />
                </mesh>
                <mesh position={[0, -gripperDisplayOpening / 2 - gripperPadWidth / 2, -0.014]}>
                  <boxGeometry args={[0.035, gripperPadWidth, 0.045]} />
                  <meshStandardMaterial color="#eff0dc" metalness={0.1} roughness={0.7} />
                </mesh>
              </group>
            </group>
          </group>
        </group>
      </group>
      <mesh position={[tcp.x, tcp.y, joints.j3 - CONFIG.cell.tableZ]}>
        <sphereGeometry args={[0.014, 16, 12]} />
        <meshBasicMaterial color="#f3c47b" />
      </mesh>
    </group>
  );
}

function Cell({ joints }: { joints: JointState }) {
  return (
    <>
      <color attach="background" args={['#151f24']} />
      <ambientLight intensity={1.15} />
      <directionalLight position={[1.5, -1.5, 2.4]} intensity={3.0} castShadow />
      <pointLight position={[-0.8, 0.6, 1.5]} intensity={15} color="#62b4a4" />
      <mesh position={[0, 0, CONFIG.cell.tableZ - 0.025]} receiveShadow>
        <boxGeometry args={[1.25, 0.78, 0.05]} />
        <meshStandardMaterial color="#34464b" roughness={0.76} metalness={0.12} />
      </mesh>
      <mesh
        position={[
          CONFIG.cell.conveyor.center.x,
          CONFIG.cell.conveyor.center.y,
          CONFIG.cell.conveyor.supportZ - 0.025,
        ]}
        receiveShadow
      >
        <boxGeometry args={[CONFIG.cell.conveyor.size.x, CONFIG.cell.conveyor.size.y, 0.05]} />
        <meshStandardMaterial color="#1d3035" roughness={0.68} metalness={0.22} />
      </mesh>
      <mesh
        position={[
          CONFIG.cell.pickup.center.x,
          CONFIG.cell.pickup.center.y,
          CONFIG.cell.pickup.packageSupportZ + 0.003,
        ]}
      >
        <boxGeometry args={[0.11, 0.11, 0.006]} />
        <meshStandardMaterial color="#e4a963" emissive="#684620" emissiveIntensity={0.25} />
      </mesh>
      <gridHelper
        args={[1.2, 24, '#60777a', '#43575a']}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0, CONFIG.cell.tableZ + 0.001]}
      />
      {CONFIG.cell.destinations.map((destination) => (
        <DestinationBin key={destination.id} destination={destination} />
      ))}
      <Robot joints={joints} />
      <mesh position={[0.3, 0, 0.61]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.055, 0.0025, 8, 48]} />
        <meshBasicMaterial color="#d6a563" />
      </mesh>
    </>
  );
}

export function Workcell({ joints }: { joints: JointState }) {
  return (
    <Canvas
      shadows
      camera={{ position: [1.18, -1.32, 1.25], fov: 37, near: 0.01, far: 20, up: [0, 0, 1] }}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl }) => {
        gl.setClearColor(new THREE.Color('#151f24'));
        gl.shadowMap.enabled = true;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
      }}
      fallback={
        <div className="scene-error">
          WebGL 2 could not initialize. Check browser graphics support or hardware acceleration.
        </div>
      }
    >
      <Cell joints={joints} />
    </Canvas>
  );
}
