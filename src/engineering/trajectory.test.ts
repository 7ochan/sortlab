import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { forwardKinematics, inverseKinematics } from './kinematics';
import { planDestinationRoute } from './routes';
import {
  generateCartesianWaypointTrajectory,
  generateJointCubic,
  sampleTrajectoryAtTime,
  type CubicBoundary,
} from './trajectory';
import type { JointState, ToolPose } from './types';

const zeroVelocity: JointState = { j1: 0, j2: 0, j3: 0, j4: 0 };

function boundary(position: JointState, velocity: JointState = zeroVelocity): CubicBoundary {
  return { position, velocity };
}

describe('cubic joint trajectory', () => {
  it('meets rest-to-rest boundary conditions and samples deterministically', () => {
    const start = boundary(CONFIG.robot.home);
    const end = boundary({ j1: 0.2, j2: 0.4, j3: 0.54, j4: -0.1 });
    const options = { durationSeconds: 2, samplePeriodSeconds: 0.05 };
    const first = generateJointCubic(start, end, options, CONFIG);
    const second = generateJointCubic(start, end, options, CONFIG);
    expect(first.samples).toEqual(second.samples);
    expect(first.samples[0]?.position).toEqual(start.position);
    expect(first.samples[0]?.velocity).toEqual(zeroVelocity);
    expect(first.samples.at(-1)?.position).toEqual(end.position);
    expect(first.samples.at(-1)?.velocity).toEqual(zeroVelocity);
    expect(first.samples).toHaveLength(41);
    expect(first.samples[20]?.position.j1).toBeCloseTo(0.1, 12);
  });

  it('supports explicit non-zero endpoint velocities and rejects infeasible duration', () => {
    const start = boundary(CONFIG.robot.home, { j1: 0.1, j2: 0, j3: 0, j4: 0 });
    const end = boundary({ j1: 0.2, j2: 0.3, j3: 0.54, j4: 0 }, { j1: 0.1, j2: 0, j3: 0, j4: 0 });
    const trajectory = generateJointCubic(
      start,
      end,
      { durationSeconds: 2, samplePeriodSeconds: 0.1 },
      CONFIG,
    );
    expect(trajectory.samples[0]?.velocity.j1).toBeCloseTo(0.1, 12);
    expect(trajectory.samples.at(-1)?.velocity.j1).toBeCloseTo(0.1, 12);
    expect(() =>
      generateJointCubic(
        boundary(CONFIG.robot.home),
        boundary({ j1: 0.5, j2: 0.5, j3: 0.54, j4: 0.5 }),
        { durationSeconds: 0.05, samplePeriodSeconds: 0.01 },
        CONFIG,
      ),
    ).toThrow(/violates .* (speed|acceleration) limit/i);
  });

  it('rejects a cubic whose interior extremum crosses a joint limit', () => {
    const start = boundary({ j1: 2.5, j2: 0, j3: 0.5, j4: 0 });
    const end = boundary({ j1: 2.5, j2: 0, j3: 0.5, j4: 0 }, { j1: -5, j2: 0, j3: 0, j4: 0 });
    expect(() =>
      generateJointCubic(start, end, { durationSeconds: 1, samplePeriodSeconds: 0.02 }, CONFIG),
    ).toThrow(/joint limits/);
  });
});

describe('Cartesian waypoint trajectory', () => {
  it('interpolates Cartesian waypoints through IK and obeys configured sampled limits', () => {
    const start: ToolPose = { x: 0.3, y: 0, z: 0.54, yaw: 0 };
    const end: ToolPose = { x: 0.3, y: 0.08, z: 0.54, yaw: 0.1 };
    const trajectory = generateCartesianWaypointTrajectory(
      [start, end],
      { samplePeriodSeconds: CONFIG.performance.fixedStepSeconds },
      CONFIG,
    );
    expect(trajectory.durationSeconds).toBeGreaterThan(0);
    expect(trajectory.samples[0]?.pose).toEqual(start);
    expect(trajectory.samples.at(-1)?.pose).toEqual(end);
    for (const [index, sample] of trajectory.samples.entries()) {
      const u = index / (trajectory.samples.length - 1);
      const progress = 3 * u ** 2 - 2 * u ** 3;
      expect(sample.pose.x).toBeCloseTo(start.x + (end.x - start.x) * progress, 12);
      expect(sample.pose.y).toBeCloseTo(start.y + (end.y - start.y) * progress, 12);
      expect(sample.pose.yaw).toBeCloseTo(start.yaw + (end.yaw - start.yaw) * progress, 12);
      const recomputed = forwardKinematics(sample.position, CONFIG);
      expect(
        Math.hypot(
          recomputed.x - sample.pose.x,
          recomputed.y - sample.pose.y,
          recomputed.z - sample.pose.z,
        ),
      ).toBeLessThan(1e-5);
      for (const key of ['j1', 'j2', 'j3', 'j4'] as const) {
        expect(Math.abs(sample.velocity[key])).toBeLessThanOrEqual(
          CONFIG.robot.speedLimits[key] + 1e-8,
        );
        expect(Math.abs(sample.acceleration[key])).toBeLessThanOrEqual(
          CONFIG.robot.accelerationLimits[key] + 1e-8,
        );
      }
    }
  });

  it('rejects unreachable, invalid, duplicate, and discontinuous Cartesian inputs', () => {
    expect(() =>
      generateCartesianWaypointTrajectory(
        [
          { x: 0.3, y: 0, z: 0.54, yaw: 0 },
          { x: 1, y: 0, z: 0.54, yaw: 0 },
        ],
        { samplePeriodSeconds: 0.02 },
        CONFIG,
      ),
    ).toThrow(/unreachable/i);
    expect(() =>
      generateCartesianWaypointTrajectory(
        [
          { x: 0.3, y: 0, z: 0.54, yaw: 0 },
          { x: -0.54, y: 0, z: 0.54, yaw: 0 },
        ],
        { samplePeriodSeconds: 0.02 },
        CONFIG,
      ),
    ).toThrow(/joint limits/i);
    expect(() =>
      generateCartesianWaypointTrajectory(
        [
          { x: 0.3, y: 0, z: 0.54, yaw: 0 },
          { x: 0.3, y: 0, z: 0.54, yaw: 0 },
        ],
        { samplePeriodSeconds: 0.02 },
        CONFIG,
      ),
    ).toThrow(/duplicate/);
    expect(() =>
      generateCartesianWaypointTrajectory(
        [
          { x: 0.3, y: 0, z: 0.54, yaw: 0 },
          { x: 0.3, y: 0.08, z: 0.54, yaw: Number.NaN },
        ],
        { samplePeriodSeconds: 0.02 },
        CONFIG,
      ),
    ).toThrow(/finite/i);
    expect(() =>
      generateCartesianWaypointTrajectory(
        [{ x: 0.3, y: 0, z: 0.54, yaw: 0 }],
        { samplePeriodSeconds: 0.02 },
        CONFIG,
      ),
    ).toThrow(/at least two/);

    const positive = inverseKinematics({ x: 0.3, y: 0, z: 0.54, yaw: 0 }, CONFIG, 'elbow-positive');
    const negative = inverseKinematics({ x: 0.3, y: 0, z: 0.54, yaw: 0 }, CONFIG, 'elbow-negative');
    expect(positive.reachable && negative.reachable).toBe(true);
    if (!positive.reachable || !negative.reachable) return;
    const a = positive.solutions[0]!.joints;
    const b = negative.solutions[0]!.joints;
    const from = forwardKinematics(a, CONFIG);
    const to = forwardKinematics(b, CONFIG);
    expect(() =>
      generateCartesianWaypointTrajectory([from, to], { samplePeriodSeconds: 0.02 }, CONFIG),
    ).toThrow(/duplicate|discontinuity|unreachable/i);
  });

  it('plans repeatable routes to all three configured bins', () => {
    const routes = (['B1', 'B2', 'B3'] as const).map((id) => {
      try {
        return planDestinationRoute(id, CONFIG);
      } catch (error) {
        throw new Error(`${id} route failed: ${String(error)}`);
      }
    });
    expect(routes.map(({ destinationId }) => destinationId)).toEqual(['B1', 'B2', 'B3']);
    for (const [routeIndex, route] of routes.entries()) {
      expect(route.waypoints[0]?.pose.z).toBeCloseTo(0.37 + routeIndex * 0.01, 12);
      expect(route.waypoints.map(({ kind }) => kind)).toEqual([
        'pickup',
        'clearance',
        'transit',
        'approach',
        'destination',
      ]);
      for (const waypoint of route.waypoints) {
        expect(waypoint.frame).toBe('W');
        expect(waypoint.units).toEqual({ position: 'm', angle: 'rad' });
      }
      expect(route.trajectory.samples[0]?.pose).toEqual(route.waypoints[0]?.pose);
      expect(route.trajectory.samples.at(-1)?.pose).toEqual(route.waypoints.at(-1)?.pose);
      expect(
        route.trajectory.samples.every(
          ({ timeSeconds }, index, samples) =>
            index === 0 || timeSeconds > (samples[index - 1]?.timeSeconds ?? -1),
        ),
      ).toBe(true);
      for (const sample of route.trajectory.samples) {
        for (const key of ['j1', 'j2', 'j3', 'j4'] as const) {
          expect(Math.abs(sample.velocity[key])).toBeLessThanOrEqual(
            CONFIG.robot.speedLimits[key] + 1e-8,
          );
          expect(Math.abs(sample.acceleration[key])).toBeLessThanOrEqual(
            CONFIG.robot.accelerationLimits[key] + 1e-8,
          );
        }
      }
    }
    expect(planDestinationRoute('B2', CONFIG).trajectory.samples).toEqual(
      planDestinationRoute('B2', CONFIG).trajectory.samples,
    );
  });

  it('rejects a route whose bin target would not clear the configured lip', () => {
    const invalid = structuredClone(CONFIG) as typeof CONFIG;
    (invalid.cell.destinations[0] as { lipZ: number }).lipZ = CONFIG.cell.transferTcpZ;
    expect(() => planDestinationRoute('B1', invalid)).toThrow(/above the configured bin lip/i);
    expect(() => planDestinationRoute('UNKNOWN' as 'B1', CONFIG)).toThrow(/unknown destination/i);
  });

  it('selects and interpolates clamped playback samples deterministically', () => {
    const route = planDestinationRoute('B1', CONFIG).trajectory;
    expect(sampleTrajectoryAtTime(route, -1)).toEqual(route.samples[0]);
    expect(sampleTrajectoryAtTime(route, route.durationSeconds + 1)).toEqual(route.samples.at(-1));
    const midpoint = sampleTrajectoryAtTime(route, route.durationSeconds / 2);
    expect(midpoint.timeSeconds).toBeCloseTo(route.durationSeconds / 2, 10);
    expect(midpoint.position).toBeDefined();
    expect(midpoint.pose).toBeDefined();
  });
});
