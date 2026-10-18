import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/engineering/config';
import {
  angularDifference,
  forwardKinematics,
  inverseKinematics,
  sampleReachableWorkspace,
} from '../src/engineering/kinematics';
import { planDestinationRoute } from '../src/engineering/routes';
import { generateJointCubic } from '../src/engineering/trajectory';
import type { JointState } from '../src/engineering/types';
import { validateJointState } from '../src/engineering/validation';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESULTS = path.join(ROOT, 'validation', 'results');
const JOINT_KEYS = ['j1', 'j2', 'j3', 'j4'] as const;
const ZERO = { j1: 0, j2: 0, j3: 0, j4: 0 } as const;

describe('broad deterministic kinematics and trajectory validation', () => {
  it('measures FK-IK-FK, limits, boundaries, routes, and sampled trajectory constraints', async () => {
    let maxPositionErrorM = 0;
    let maxAngularErrorRad = 0;
    let reachableRoundTrips = 0;
    let inverseRejected = 0;
    for (let index = 0; index < 5000; index += 1) {
      const fraction = (index + 0.5) / 5000;
      const joints: JointState = {
        j1:
          CONFIG.robot.limits.j1.min +
          fraction * (CONFIG.robot.limits.j1.max - CONFIG.robot.limits.j1.min),
        j2:
          CONFIG.robot.limits.j2.min +
          ((((index * 7919) % 5000) + 0.5) / 5000) *
            (CONFIG.robot.limits.j2.max - CONFIG.robot.limits.j2.min),
        j3:
          CONFIG.robot.limits.j3.min +
          ((((index * 3571) % 5000) + 0.5) / 5000) *
            (CONFIG.robot.limits.j3.max - CONFIG.robot.limits.j3.min),
        j4:
          CONFIG.robot.limits.j4.min +
          ((((index * 2377) % 5000) + 0.5) / 5000) *
            (CONFIG.robot.limits.j4.max - CONFIG.robot.limits.j4.min),
      };
      const pose = forwardKinematics(joints, CONFIG);
      const ik = inverseKinematics(pose, CONFIG);
      const solution = ik.solutions[0];
      if (!solution) {
        inverseRejected += 1;
        continue;
      }
      const roundTrip = forwardKinematics(solution.joints, CONFIG);
      maxPositionErrorM = Math.max(
        maxPositionErrorM,
        Math.hypot(roundTrip.x - pose.x, roundTrip.y - pose.y, roundTrip.z - pose.z),
      );
      maxAngularErrorRad = Math.max(maxAngularErrorRad, angularDifference(roundTrip.yaw, pose.yaw));
      reachableRoundTrips += 1;
    }

    const workspace = sampleReachableWorkspace(CONFIG, {
      samplesPerAxis: 81,
      z: CONFIG.robot.home.j3,
      yaw: 0,
      minX: -0.6,
      maxX: 0.6,
      minY: -0.6,
      maxY: 0.6,
    });
    const envelope = {
      justInsideOuter: inverseKinematics(
        {
          x: CONFIG.robot.links.l1 + CONFIG.robot.links.l2 - 1e-9,
          y: 0,
          z: CONFIG.robot.home.j3,
          yaw: 0,
        },
        CONFIG,
      ).reachable,
      justOutsideOuter: inverseKinematics(
        {
          x: CONFIG.robot.links.l1 + CONFIG.robot.links.l2 + 1e-8,
          y: 0,
          z: CONFIG.robot.home.j3,
          yaw: 0,
        },
        CONFIG,
      ).reachable,
      atJ3Minimum: inverseKinematics(
        { x: 0.3, y: 0, z: CONFIG.robot.limits.j3.min, yaw: 0 },
        CONFIG,
      ).reachable,
      belowJ3Minimum: inverseKinematics(
        { x: 0.3, y: 0, z: CONFIG.robot.limits.j3.min - 1e-6, yaw: 0 },
        CONFIG,
      ).reachable,
      atJ3Maximum: inverseKinematics(
        { x: 0.3, y: 0, z: CONFIG.robot.limits.j3.max, yaw: 0 },
        CONFIG,
      ).reachable,
      aboveJ3Maximum: inverseKinematics(
        { x: 0.3, y: 0, z: CONFIG.robot.limits.j3.max + 1e-6, yaw: 0 },
        CONFIG,
      ).reachable,
      fullyExtendedSingularity: inverseKinematics(
        { x: CONFIG.robot.links.l1 + CONFIG.robot.links.l2, y: 0, z: CONFIG.robot.home.j3, yaw: 0 },
        CONFIG,
      ),
      fullyFoldedSingularity: inverseKinematics(
        {
          x: Math.abs(CONFIG.robot.links.l1 - CONFIG.robot.links.l2),
          y: 0,
          z: CONFIG.robot.home.j3,
          yaw: 0,
        },
        CONFIG,
      ),
      individualJointLimits: Object.fromEntries(
        JOINT_KEYS.map((key) => {
          const limit = CONFIG.robot.limits[key];
          const rejects = (value: number) => {
            try {
              validateJointState({ ...CONFIG.robot.home, [key]: value }, CONFIG);
              return false;
            } catch {
              return true;
            }
          };
          return [
            key,
            {
              min: limit.min,
              max: limit.max,
              rejectsBelow: rejects(limit.min - 1e-9),
              rejectsAbove: rejects(limit.max + 1e-9),
            },
          ];
        }),
      ),
    };

    const routes = CONFIG.cell.destinations.map(({ id }) => {
      const planned = planDestinationRoute(id, CONFIG);
      const repeated = planDestinationRoute(id, CONFIG);
      const first = planned.trajectory.samples[0]!;
      const last = planned.trajectory.samples.at(-1)!;
      const configuredDestination = CONFIG.cell.destinations.find((bin) => bin.id === id)!;
      const maxSpeedRatio: Record<string, number> = {};
      const maxAccelerationRatio: Record<string, number> = {};
      for (const key of JOINT_KEYS) {
        maxSpeedRatio[key] = Math.max(
          ...planned.trajectory.samples.map(
            ({ velocity }) => Math.abs(velocity[key]) / CONFIG.robot.speedLimits[key],
          ),
        );
        maxAccelerationRatio[key] = Math.max(
          ...planned.trajectory.samples.map(
            ({ acceleration }) =>
              Math.abs(acceleration[key]) / CONFIG.robot.accelerationLimits[key],
          ),
        );
      }
      return {
        destinationId: id,
        mappedPackage: CONFIG.packages.find(({ destination }) => destination === id)?.id ?? null,
        endpointPositionErrorM: Math.hypot(
          last.pose.x - configuredDestination.center.x,
          last.pose.y - configuredDestination.center.y,
          last.pose.z - CONFIG.cell.transferTcpZ,
        ),
        startMatchesPickup: planned.waypoints[0]?.kind === 'pickup',
        endpointMatchesDestination: planned.waypoints.at(-1)?.kind === 'destination',
        deterministic: JSON.stringify(planned.trajectory) === JSON.stringify(repeated.trajectory),
        sampleCount: planned.trajectory.samples.length,
        durationSeconds: planned.trajectory.durationSeconds,
        endpointVelocityNorm: Math.hypot(
          last.velocity.j1,
          last.velocity.j2,
          last.velocity.j3,
          last.velocity.j4,
        ),
        startVelocityNorm: Math.hypot(
          first.velocity.j1,
          first.velocity.j2,
          first.velocity.j3,
          first.velocity.j4,
        ),
        maxSampledSpeedRatio: Math.max(...Object.values(maxSpeedRatio)),
        maxSampledAccelerationRatio: Math.max(...Object.values(maxAccelerationRatio)),
        speedRatiosByJoint: maxSpeedRatio,
        accelerationRatiosByJoint: maxAccelerationRatio,
      };
    });

    const cubic = generateJointCubic(
      { position: CONFIG.robot.home, velocity: ZERO },
      { position: { ...CONFIG.robot.home, j1: 0.1, j2: -0.1, j3: 0.52, j4: 0.15 }, velocity: ZERO },
      { durationSeconds: 2, samplePeriodSeconds: CONFIG.performance.fixedStepSeconds },
      CONFIG,
    );
    const cubicDeterministic =
      JSON.stringify(cubic) ===
      JSON.stringify(
        generateJointCubic(
          { position: CONFIG.robot.home, velocity: ZERO },
          {
            position: { ...CONFIG.robot.home, j1: 0.1, j2: -0.1, j3: 0.52, j4: 0.15 },
            velocity: ZERO,
          },
          { durationSeconds: 2, samplePeriodSeconds: CONFIG.performance.fixedStepSeconds },
          CONFIG,
        ),
      );
    const cubicSampledConstraints = Object.fromEntries(
      JOINT_KEYS.map((key) => [
        key,
        {
          maxSpeedRatio: Math.max(
            ...cubic.samples.map(
              ({ velocity }) => Math.abs(velocity[key]) / CONFIG.robot.speedLimits[key],
            ),
          ),
          maxAccelerationRatio: Math.max(
            ...cubic.samples.map(
              ({ acceleration }) =>
                Math.abs(acceleration[key]) / CONFIG.robot.accelerationLimits[key],
            ),
          ),
        },
      ]),
    );
    const result = {
      fkIkRoundTrips: {
        requested: 5000,
        successful: reachableRoundTrips,
        inverseRejected,
        maxPositionErrorM,
        maxAngularErrorRad,
        tolerancePositionM: 1e-10,
        toleranceAngularRad: 1e-10,
      },
      workspaceGrid: {
        points: workspace.length,
        reachablePoints: workspace.filter(({ reachable }) => reachable).length,
        minX: -0.6,
        maxX: 0.6,
        minY: -0.6,
        maxY: 0.6,
        samplesPerAxis: 81,
      },
      boundaryAndSingularCases: envelope,
      routes,
      jointCubic: {
        sampleCount: cubic.samples.length,
        durationSeconds: cubic.durationSeconds,
        startPositionExact:
          JSON.stringify(cubic.samples[0]?.position) === JSON.stringify(CONFIG.robot.home),
        endPositionExact:
          cubic.samples.at(-1)?.position.j1 === 0.1 && cubic.samples.at(-1)?.position.j3 === 0.52,
        deterministic: cubicDeterministic,
        sampledConstraints: cubicSampledConstraints,
      },
      collisionValidation:
        'TCP path sampled and kinematic constraints checked; no swept-link or package collision safety claim.',
    };
    expect(reachableRoundTrips).toBe(5000);
    expect(maxPositionErrorM).toBeLessThan(1e-10);
    expect(maxAngularErrorRad).toBeLessThan(1e-10);
    expect(envelope.justOutsideOuter).toBe(false);
    expect(envelope.belowJ3Minimum).toBe(false);
    expect(envelope.aboveJ3Maximum).toBe(false);
    expect(
      Object.values(envelope.individualJointLimits).every(
        (limit) => limit.rejectsBelow && limit.rejectsAbove,
      ),
    ).toBe(true);
    expect(
      routes.every(
        ({
          deterministic,
          endpointMatchesDestination,
          maxSampledSpeedRatio,
          maxSampledAccelerationRatio,
        }) =>
          deterministic &&
          endpointMatchesDestination &&
          maxSampledSpeedRatio <= 1 + 1e-8 &&
          maxSampledAccelerationRatio <= 1 + 1e-8,
      ),
    ).toBe(true);
    expect(cubicDeterministic).toBe(true);
    await mkdir(RESULTS, { recursive: true });
    await writeFile(path.join(RESULTS, 'numerics.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.info(
      `Numerical validation: ${JSON.stringify(result.fkIkRoundTrips)}; routes=${routes.length}; workspace points=${workspace.length}`,
    );
  });
});
