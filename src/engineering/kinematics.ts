import type { IKBranch, IKResult, JointState, SortLabConfig, ToolPose } from './types';
import { validateJointState } from './validation';

const IK_EPSILON = 1e-12;
const SINGULARITY_EPSILON = 1e-10;

export function wrapAngle(angle: number): number {
  if (!Number.isFinite(angle)) throw new Error('Angle must be finite.');
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function angularDifference(a: number, b: number): number {
  return Math.abs(wrapAngle(a - b));
}

function assertPose(pose: ToolPose): void {
  if (pose === null || typeof pose !== 'object' || Array.isArray(pose))
    throw new Error('Pose must be an object containing finite x, y, z, and yaw values.');
  for (const key of ['x', 'y', 'z', 'yaw'] as const) {
    const value: unknown = pose[key];
    if (typeof value !== 'number' || !Number.isFinite(value))
      throw new Error(`Pose.${key} must be a finite number.`);
  }
}

export function forwardKinematics(joints: JointState, config: SortLabConfig): ToolPose {
  validateJointState(joints, config);
  const { l1, l2 } = config.robot.links;
  const elbow = joints.j1 + joints.j2;
  return {
    x: l1 * Math.cos(joints.j1) + l2 * Math.cos(elbow),
    y: l1 * Math.sin(joints.j1) + l2 * Math.sin(elbow),
    z: joints.j3,
    yaw: wrapAngle(elbow + joints.j4),
  };
}

/**
 * Analytic position/yaw IK. Enumerates signed elbow branches, then filters each
 * candidate against all four configured joint limits. q3 is TCP world-Z in m.
 */
export function inverseKinematics(
  pose: ToolPose,
  config: SortLabConfig,
  requestedBranch: IKBranch | 'both' = 'both',
): IKResult {
  assertPose(pose);
  const radialSquared = pose.x * pose.x + pose.y * pose.y;
  const { l1, l2 } = config.robot.links;
  const cosine = (radialSquared - l1 * l1 - l2 * l2) / (2 * l1 * l2);
  if (cosine < -1 - IK_EPSILON || cosine > 1 + IK_EPSILON) {
    return {
      reachable: false,
      solutions: [],
      reason: 'Target radius lies outside the two-link reach envelope.',
    };
  }
  const elbowMagnitude = Math.acos(Math.max(-1, Math.min(1, cosine)));
  const singular = Math.abs(Math.sin(elbowMagnitude)) <= SINGULARITY_EPSILON;
  const branches: readonly IKBranch[] =
    requestedBranch === 'both' ? ['elbow-positive', 'elbow-negative'] : [requestedBranch];
  const solutions: { branch: IKBranch; joints: JointState; singular: boolean }[] = [];
  let sawZLimitFailure = false;
  let sawJointLimitFailure = false;
  for (const branch of branches) {
    const j2 = branch === 'elbow-positive' ? elbowMagnitude : -elbowMagnitude;
    const j1 = Math.atan2(pose.y, pose.x) - Math.atan2(l2 * Math.sin(j2), l1 + l2 * Math.cos(j2));
    const j4 = wrapAngle(pose.yaw - j1 - j2);
    const candidate: JointState = { j1: wrapAngle(j1), j2, j3: pose.z, j4 };
    const z = config.robot.limits.j3;
    if (pose.z < z.min || pose.z > z.max) {
      sawZLimitFailure = true;
      continue;
    }
    try {
      validateJointState(candidate, config);
      solutions.push({ branch, joints: candidate, singular });
    } catch {
      sawJointLimitFailure = true;
    }
  }
  // At q2 = 0 or ±π the signed branches describe the same physical pose.
  if (singular && solutions.length === 2) solutions.splice(1, 1);
  if (solutions.length) return { reachable: true, solutions, reason: null };
  const reason = sawZLimitFailure
    ? 'Target TCP Z is outside the configured J3 world-Z limits.'
    : sawJointLimitFailure
      ? 'Target has no inverse-kinematic branch inside all configured joint limits.'
      : 'Target is unreachable.';
  return { reachable: false, solutions: [], reason };
}

export function isPoseReachable(pose: ToolPose, config: SortLabConfig): boolean {
  return inverseKinematics(pose, config).reachable;
}

export function analyticRadialEnvelope(
  config: SortLabConfig,
): Readonly<{ innerRadius: number; outerRadius: number }> {
  const { l1, l2 } = config.robot.links;
  return { innerRadius: Math.abs(l1 - l2), outerRadius: l1 + l2 };
}

/** Radial extrema after applying the configured elbow range; J1 and yaw are not included. */
export function jointLimitedRadialEnvelope(
  config: SortLabConfig,
): Readonly<{ innerRadius: number; outerRadius: number }> {
  const { l1, l2 } = config.robot.links;
  const { min, max } = config.robot.limits.j2;
  const candidates = [min, max];
  for (const extremum of [0, -Math.PI, Math.PI]) {
    if (extremum >= min && extremum <= max) candidates.push(extremum);
  }
  const radii = candidates.map((q2) => Math.sqrt(l1 * l1 + l2 * l2 + 2 * l1 * l2 * Math.cos(q2)));
  return { innerRadius: Math.min(...radii), outerRadius: Math.max(...radii) };
}

/** A deterministic XY grid sample of the joint-limited workspace at fixed Z/yaw. */
export function sampleReachableWorkspace(
  config: SortLabConfig,
  options: Readonly<{
    samplesPerAxis: number;
    z: number;
    yaw: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  }>,
): readonly Readonly<{ x: number; y: number; reachable: boolean }>[] {
  const { samplesPerAxis, z, yaw, minX, maxX, minY, maxY } = options;
  if (!Number.isInteger(samplesPerAxis) || samplesPerAxis < 2)
    throw new Error('samplesPerAxis must be an integer of at least 2.');
  for (const [name, value] of Object.entries({ z, yaw, minX, maxX, minY, maxY })) {
    if (!Number.isFinite(value)) throw new Error(`Workspace ${name} must be finite.`);
  }
  if (minX >= maxX || minY >= maxY) throw new Error('Workspace ranges must have min < max.');
  const points = [];
  for (let row = 0; row < samplesPerAxis; row += 1) {
    const y = minY + ((maxY - minY) * row) / (samplesPerAxis - 1);
    for (let column = 0; column < samplesPerAxis; column += 1) {
      const x = minX + ((maxX - minX) * column) / (samplesPerAxis - 1);
      points.push({ x, y, reachable: isPoseReachable({ x, y, z, yaw }, config) });
    }
  }
  return points;
}
