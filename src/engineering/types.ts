export type Vec2 = Readonly<{ x: number; y: number }>;

/** Joint coordinates: revolute axes in radians; J3 is TCP world-Z in metres. */
export type JointState = Readonly<{
  j1: number;
  j2: number;
  j3: number;
  j4: number;
}>;

/** Pose is expressed in world frame W: X forward, Y lateral, Z up; yaw about +Z. */
export type ToolPose = Readonly<{
  x: number;
  y: number;
  z: number;
  yaw: number;
}>;

export type IKBranch = 'elbow-positive' | 'elbow-negative';

export type IKResult = Readonly<{
  reachable: boolean;
  solutions: readonly Readonly<{ branch: IKBranch; joints: JointState; singular: boolean }>[];
  reason: string | null;
}>;

export type JointLimit = Readonly<{ min: number; max: number; unit: 'rad' | 'm' }>;

export type SortDestination = Readonly<{
  id: 'B1' | 'B2' | 'B3';
  center: Vec2;
  outside: Readonly<{ x: number; y: number }>;
  inside: Readonly<{ x: number; y: number }>;
  floorZ: number;
  lipZ: number;
}>;

export type PackageClass = Readonly<{
  id: 'S' | 'M' | 'L';
  name: string;
  dimensions: Readonly<{ length: number; width: number; height: number }>;
  massKg: number;
  destination: SortDestination['id'];
  displayColor: string;
}>;

export type SortLabConfig = Readonly<{
  schemaVersion: 1;
  units: Readonly<{ length: 'm'; mass: 'kg'; angle: 'rad'; force: 'N' }>;
  robot: Readonly<{
    mechanism: 'SCARA';
    links: Readonly<{ l1: number; l2: number }>;
    limits: Readonly<Record<keyof JointState, JointLimit>>;
    home: JointState;
    speedLimits: Readonly<{ j1: number; j2: number; j3: number; j4: number }>;
    accelerationLimits: Readonly<{ j1: number; j2: number; j3: number; j4: number }>;
    gripper: Readonly<{
      opening: Readonly<{ min: number; max: number }>;
      virtualJawCapacityN: number;
      assumedFrictionCoefficient: number;
      safetyFactor: number;
      gravityMps2: number;
      verticalAccelerationMps2: number;
    }>;
  }>;
  cell: Readonly<{
    tableZ: number;
    baseRadius: number;
    conveyor: Readonly<{
      center: Vec2;
      size: Readonly<{ x: number; y: number }>;
      supportZ: number;
    }>;
    pickup: Readonly<{ center: Vec2; packageSupportZ: number }>;
    transferTcpZ: number;
    destinations: readonly SortDestination[];
  }>;
  packages: readonly PackageClass[];
  performance: Readonly<{ targetMedianCycleSeconds: number; fixedStepSeconds: number }>;
}>;
