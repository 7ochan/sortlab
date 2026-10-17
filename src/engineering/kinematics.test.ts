import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import {
  analyticRadialEnvelope,
  angularDifference,
  forwardKinematics,
  inverseKinematics,
  isPoseReachable,
  jointLimitedRadialEnvelope,
  sampleReachableWorkspace,
} from './kinematics';
import { validateConfig, validateJointState } from './validation';
import type { JointState, ToolPose } from './types';

const positionError = (a: ToolPose, b: ToolPose) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const angleError = (a: ToolPose, b: ToolPose) => angularDifference(a.yaw, b.yaw);

describe('SCARA forward and inverse kinematics', () => {
  it('matches the home reference pose and the baseline reach envelope', () => {
    const result = forwardKinematics(CONFIG.robot.home, CONFIG);
    expect(result.x).toBeCloseTo(0.55, 12);
    expect(result.y).toBeCloseTo(0, 12);
    expect(result.z).toBe(0.56);
    expect(result.yaw).toBe(0);
    expect(analyticRadialEnvelope(CONFIG).innerRadius).toBeCloseTo(0.05, 12);
    expect(analyticRadialEnvelope(CONFIG).outerRadius).toBeCloseTo(0.55, 12);
    expect(jointLimitedRadialEnvelope(CONFIG).innerRadius).toBeCloseTo(0.10747, 4);
    expect(jointLimitedRadialEnvelope(CONFIG).outerRadius).toBeCloseTo(0.55, 12);
  });

  it('round-trips valid states through the requested analytic branch', () => {
    const states: readonly JointState[] = [
      { j1: 0.3, j2: 0.8, j3: 0.42, j4: -0.2 },
      { j1: -0.7, j2: -1.1, j3: 0.31, j4: 0.55 },
      { j1: 1.4, j2: 2.2, j3: 0.58, j4: -1.6 },
      { j1: -2.2, j2: 2.4, j3: 0.5, j4: Math.PI },
    ];
    let maxPositionError = 0;
    let maxYawError = 0;
    let maxJointError = 0;
    for (const original of states) {
      const target = forwardKinematics(original, CONFIG);
      const branch = original.j2 >= 0 ? 'elbow-positive' : 'elbow-negative';
      const result = inverseKinematics(target, CONFIG, branch);
      expect(result.reachable, result.reason ?? '').toBe(true);
      const solution = result.solutions[0];
      expect(solution).toBeDefined();
      const roundTrip = forwardKinematics(solution!.joints, CONFIG);
      maxPositionError = Math.max(maxPositionError, positionError(target, roundTrip));
      maxYawError = Math.max(maxYawError, angleError(target, roundTrip));
      maxJointError = Math.max(
        maxJointError,
        Math.abs(original.j1 - solution!.joints.j1),
        Math.abs(original.j2 - solution!.joints.j2),
        Math.abs(original.j3 - solution!.joints.j3),
        angularDifference(original.j4, solution!.joints.j4),
      );
      expect(positionError(target, roundTrip)).toBeLessThanOrEqual(1e-6);
      expect(angleError(target, roundTrip)).toBeLessThanOrEqual(1e-6);
      expect(Math.abs(original.j1 - solution!.joints.j1)).toBeLessThanOrEqual(1e-6);
      expect(Math.abs(original.j2 - solution!.joints.j2)).toBeLessThanOrEqual(1e-6);
      expect(Math.abs(original.j3 - solution!.joints.j3)).toBeLessThanOrEqual(1e-6);
      expect(angularDifference(original.j4, solution!.joints.j4)).toBeLessThanOrEqual(1e-6);
    }
    expect(maxPositionError).toBeLessThanOrEqual(1e-6);
    expect(maxYawError).toBeLessThanOrEqual(1e-6);
    console.info(
      `Observed maximum FK/IK errors: position=${maxPositionError} m, yaw=${maxYawError} rad, joint=${maxJointError} rad.`,
    );
    expect(maxJointError).toBeLessThanOrEqual(1e-6);
  });

  it('returns both valid elbow branches for a nonsingular pose', () => {
    const pose = forwardKinematics({ j1: 0.25, j2: 0.9, j3: 0.54, j4: 0.3 }, CONFIG);
    const result = inverseKinematics(pose, CONFIG);
    expect(result.reachable).toBe(true);
    expect(result.solutions.map(({ branch }) => branch)).toEqual([
      'elbow-positive',
      'elbow-negative',
    ]);
    for (const { joints } of result.solutions) {
      expect(positionError(forwardKinematics(joints, CONFIG), pose)).toBeLessThanOrEqual(1e-6);
      expect(angleError(forwardKinematics(joints, CONFIG), pose)).toBeLessThanOrEqual(1e-6);
    }
  });

  it('filters shoulder, elbow, wrist, and vertical limits', () => {
    expect(() =>
      validateJointState({ j1: (151 * Math.PI) / 180, j2: 0, j3: 0.4, j4: 0 }, CONFIG),
    ).toThrow(/joint j1/i);
    expect(() =>
      validateJointState({ j1: 0, j2: (-161 * Math.PI) / 180, j3: 0.4, j4: 0 }, CONFIG),
    ).toThrow(/joint j2/i);
    expect(() => validateJointState({ j1: 0, j2: 0, j3: 0.59, j4: 0 }, CONFIG)).toThrow(
      /joint j3/i,
    );
    expect(() =>
      validateJointState({ j1: 0, j2: 0, j3: 0.4, j4: (181 * Math.PI) / 180 }, CONFIG),
    ).toThrow(/joint j4/i);
    const outOfZ = inverseKinematics({ x: 0.3, y: 0, z: 0.6, yaw: 0 }, CONFIG);
    expect(outOfZ.reachable).toBe(false);
    expect(outOfZ.reason).toMatch(/j3 world-z/i);
  });

  it('rejects unreachable and joint-limit-infeasible targets', () => {
    expect(isPoseReachable({ x: 0.55001, y: 0, z: 0.4, yaw: 0 }, CONFIG)).toBe(false);
    expect(isPoseReachable({ x: -0.54, y: 0, z: 0.4, yaw: 0 }, CONFIG)).toBe(false);
    expect(
      inverseKinematics({ x: 0.3, y: 0, z: 0.4, yaw: 0 }, CONFIG, 'elbow-positive').reachable,
    ).toBe(true);
  });

  it('handles the outer singularity and near-boundary floating point values', () => {
    const outer = inverseKinematics({ x: 0.55, y: 0, z: 0.4, yaw: 0.25 }, CONFIG);
    expect(outer.reachable).toBe(true);
    expect(outer.solutions).toHaveLength(1);
    expect(outer.solutions[0]?.singular).toBe(true);
    expect(inverseKinematics({ x: 0.55 + 1e-13, y: 0, z: 0.4, yaw: 0 }, CONFIG).reachable).toBe(
      true,
    );
    expect(inverseKinematics({ x: 0.55 + 1e-8, y: 0, z: 0.4, yaw: 0 }, CONFIG).reachable).toBe(
      false,
    );
  });

  it('uses angular wraparound for wrist/yaw comparisons', () => {
    expect(angularDifference(Math.PI - 1e-10, -Math.PI + 1e-10)).toBeLessThan(1e-8);
  });

  it('rejects non-finite poses and joint states', () => {
    expect(() => forwardKinematics({ j1: Number.NaN, j2: 0, j3: 0.4, j4: 0 }, CONFIG)).toThrow(
      /finite/i,
    );
    expect(() =>
      inverseKinematics({ x: Number.POSITIVE_INFINITY, y: 0, z: 0.4, yaw: 0 }, CONFIG),
    ).toThrow(/finite/i);
    expect(() => inverseKinematics({ x: 0.3, y: 0, z: 0.4, yaw: Number.NaN }, CONFIG)).toThrow(
      /finite/i,
    );
  });
});

describe('workspace and validated configuration', () => {
  it('checks every approved pickup and bin center using the actual joint limits', () => {
    const points = [
      CONFIG.cell.pickup.center,
      ...CONFIG.cell.destinations.map(({ center }) => center),
    ];
    for (const point of points) {
      expect(isPoseReachable({ ...point, z: CONFIG.cell.transferTcpZ, yaw: 0 }, CONFIG)).toBe(true);
    }
  });

  it('distinguishes the analytic radial envelope from joint-limited sampled workspace', () => {
    const sample = sampleReachableWorkspace(CONFIG, {
      samplesPerAxis: 11,
      z: 0.4,
      yaw: 0,
      minX: -0.66,
      maxX: 0.66,
      minY: -0.66,
      maxY: 0.66,
    });
    expect(sample).toHaveLength(121);
    expect(sample.find(({ x, y }) => x === 0.66 && y === 0)?.reachable).toBe(false);
    expect(sample.find(({ x, y }) => x === 0 && y === 0.66)?.reachable).toBe(false);
    expect(sample.some(({ reachable }) => reachable)).toBe(true);
    expect(() =>
      sampleReachableWorkspace(CONFIG, {
        samplesPerAxis: 1,
        z: 0.4,
        yaw: 0,
        minX: -1,
        maxX: 1,
        minY: -1,
        maxY: 1,
      }),
    ).toThrow(/samplesPerAxis/i);
  });

  it('rejects malformed engineering values instead of substituting defaults', () => {
    const invalid = structuredClone(CONFIG) as typeof CONFIG;
    (invalid.robot.links as { l1: number; l2: number }).l1 = Number.NaN;
    expect(() => validateConfig(invalid)).toThrow(/robot.links.l1/i);
  });
});
