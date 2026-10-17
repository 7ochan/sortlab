import { angularDifference, forwardKinematics, inverseKinematics, wrapAngle } from './kinematics';
import { validateJointState } from './validation';
import type { IKBranch, JointState, SortLabConfig, ToolPose } from './types';

/** Angular rates are rad/s; J3 TCP world-Z rate is m/s. */
export type JointVelocity = Readonly<{ j1: number; j2: number; j3: number; j4: number }>;

/** Angular accelerations are rad/s²; J3 TCP world-Z acceleration is m/s². */
export type JointAcceleration = Readonly<{ j1: number; j2: number; j3: number; j4: number }>;

export type CubicBoundary = Readonly<{
  position: JointState;
  velocity: JointVelocity;
}>;

export type TrajectorySample = Readonly<{
  timeSeconds: number;
  position: JointState;
  velocity: JointVelocity;
  acceleration: JointAcceleration;
  pose: ToolPose;
}>;

export type JointTrajectory = Readonly<{
  kind: 'joint-cubic';
  durationSeconds: number;
  samples: readonly TrajectorySample[];
}>;

export type CartesianTrajectory = Readonly<{
  kind: 'cartesian-waypoints';
  durationSeconds: number;
  samples: readonly TrajectorySample[];
  segmentDurationsSeconds: readonly number[];
}>;

const JOINTS = ['j1', 'j2', 'j3', 'j4'] as const;

type CubicCoefficients = Readonly<{ a: number; b: number; c: number; d: number }>;

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be finite and > 0.`);
}

function assertDerivative(value: JointVelocity | JointAcceleration, label: string): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must contain finite j1, j2, j3, and j4 values.`);
  for (const key of JOINTS) {
    if (!Number.isFinite(value[key])) throw new Error(`${label}.${key} must be finite.`);
  }
}

function coefficients(
  start: CubicBoundary,
  end: CubicBoundary,
  duration: number,
): Record<keyof JointState, CubicCoefficients> {
  return Object.fromEntries(
    JOINTS.map((key) => {
      const p0 = start.position[key];
      const p1 = end.position[key];
      const v0 = start.velocity[key];
      const v1 = end.velocity[key];
      const a = (2 * (p0 - p1) + (v0 + v1) * duration) / duration ** 3;
      const b = (3 * (p1 - p0) - (2 * v0 + v1) * duration) / duration ** 2;
      return [key, { a, b, c: v0, d: p0 }];
    }),
  ) as Record<keyof JointState, CubicCoefficients>;
}

function rootsOfQuadratic(a: number, b: number, c: number): number[] {
  if (Math.abs(a) < 1e-15) return Math.abs(b) < 1e-15 ? [] : [-c / b];
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  const root = Math.sqrt(discriminant);
  return [(-b - root) / (2 * a), (-b + root) / (2 * a)];
}

function evaluate(c: CubicCoefficients, t: number): number {
  return ((c.a * t + c.b) * t + c.c) * t + c.d;
}

function evaluateVelocity(c: CubicCoefficients, t: number): number {
  return (3 * c.a * t + 2 * c.b) * t + c.c;
}

function evaluateAcceleration(c: CubicCoefficients, t: number): number {
  return 6 * c.a * t + 2 * c.b;
}

function verifyCubicConstraints(
  curves: Record<keyof JointState, CubicCoefficients>,
  duration: number,
  config: SortLabConfig,
): void {
  const epsilon = 1e-10;
  for (const key of JOINTS) {
    const curve = curves[key];
    const limit = config.robot.limits[key];
    const speedLimit = config.robot.speedLimits[key];
    const accelerationLimit = config.robot.accelerationLimits[key];
    const positionExtrema = [0, duration, ...rootsOfQuadratic(3 * curve.a, 2 * curve.b, curve.c)];
    for (const t of positionExtrema) {
      if (t < 0 || t > duration) continue;
      const position = evaluate(curve, t);
      if (position < limit.min - epsilon || position > limit.max + epsilon)
        throw new Error(`Cubic trajectory violates ${key} joint limits at t=${t.toFixed(6)} s.`);
    }
    const velocityExtrema = [0, duration];
    if (Math.abs(curve.a) > 1e-15) velocityExtrema.push(-curve.b / (3 * curve.a));
    const peakSpeed = Math.max(
      ...velocityExtrema
        .filter((t) => t >= 0 && t <= duration)
        .map((t) => Math.abs(evaluateVelocity(curve, t))),
    );
    if (peakSpeed > speedLimit + epsilon)
      throw new Error(
        `Cubic trajectory violates ${key} speed limit (${peakSpeed.toFixed(6)} > ${speedLimit.toFixed(6)} ${key === 'j3' ? 'm/s' : 'rad/s'}).`,
      );
    const peakAcceleration = Math.max(
      Math.abs(evaluateAcceleration(curve, 0)),
      Math.abs(evaluateAcceleration(curve, duration)),
    );
    if (peakAcceleration > accelerationLimit + epsilon)
      throw new Error(
        `Cubic trajectory violates ${key} acceleration limit (${peakAcceleration.toFixed(6)} > ${accelerationLimit.toFixed(6)} ${key === 'j3' ? 'm/s²' : 'rad/s²'}).`,
      );
  }
}

function sampleCount(duration: number, samplePeriod: number): number {
  return Math.max(1, Math.ceil(duration / samplePeriod));
}

/**
 * Creates a single analytic cubic in joint space. Boundary velocities are
 * explicit; duration is never silently stretched. Position, speed and
 * acceleration extrema are checked analytically against the configured limits.
 */
export function generateJointCubic(
  start: CubicBoundary,
  end: CubicBoundary,
  options: Readonly<{ durationSeconds: number; samplePeriodSeconds: number }>,
  config: SortLabConfig,
): JointTrajectory {
  assertPositiveFinite(options.durationSeconds, 'durationSeconds');
  assertPositiveFinite(options.samplePeriodSeconds, 'samplePeriodSeconds');
  validateJointState(start.position, config);
  validateJointState(end.position, config);
  assertDerivative(start.velocity, 'start.velocity');
  assertDerivative(end.velocity, 'end.velocity');
  const curves = coefficients(start, end, options.durationSeconds);
  verifyCubicConstraints(curves, options.durationSeconds, config);
  const count = sampleCount(options.durationSeconds, options.samplePeriodSeconds);
  const samples = Array.from({ length: count + 1 }, (_, index) => {
    const timeSeconds = (options.durationSeconds * index) / count;
    const sampledPosition = Object.fromEntries(
      JOINTS.map((key) => [key, evaluate(curves[key], timeSeconds)]),
    ) as JointState;
    const position =
      index === 0 ? start.position : index === count ? end.position : sampledPosition;
    const sampledVelocity = Object.fromEntries(
      JOINTS.map((key) => [key, evaluateVelocity(curves[key], timeSeconds)]),
    ) as JointVelocity;
    const velocity =
      index === 0 ? start.velocity : index === count ? end.velocity : sampledVelocity;
    const acceleration = Object.fromEntries(
      JOINTS.map((key) => [key, evaluateAcceleration(curves[key], timeSeconds)]),
    ) as JointAcceleration;
    return {
      timeSeconds,
      position,
      velocity,
      acceleration,
      pose: forwardKinematics(position, config),
    };
  });
  return { kind: 'joint-cubic', durationSeconds: options.durationSeconds, samples };
}

function interpolatePose(start: ToolPose, end: ToolPose, s: number): ToolPose {
  const yawDelta = wrapAngle(end.yaw - start.yaw);
  return {
    x: start.x + (end.x - start.x) * s,
    y: start.y + (end.y - start.y) * s,
    z: start.z + (end.z - start.z) * s,
    yaw: wrapAngle(start.yaw + yawDelta * s),
  };
}

function cubicProgress(u: number): number {
  return 3 * u * u - 2 * u * u * u;
}

function chooseContinuousSolution(
  pose: ToolPose,
  previous: JointState,
  previousBranch: IKBranch,
  config: SortLabConfig,
): Readonly<{ joints: JointState; branch: IKBranch }> {
  const result = inverseKinematics(pose, config, 'both');
  if (!result.reachable) throw new Error(`Cartesian waypoint is unreachable: ${result.reason}`);
  const branchPreferred = result.solutions.filter(({ branch }) => branch === previousBranch);
  const candidates = branchPreferred.length ? branchPreferred : result.solutions;
  const scored = candidates.map(({ branch, joints }) => {
    const score = JOINTS.reduce((sum, key) => {
      const range = config.robot.limits[key].max - config.robot.limits[key].min;
      const delta = joints[key] - previous[key];
      return sum + (delta / range) ** 2;
    }, 0);
    return { branch, joints, score };
  });
  scored.sort((a, b) => a.score - b.score);
  const chosen = scored[0];
  if (!chosen) throw new Error('Cartesian waypoint has no valid inverse-kinematic solution.');
  for (const key of JOINTS) {
    const range = config.robot.limits[key].max - config.robot.limits[key].min;
    const delta = Math.abs(chosen.joints[key] - previous[key]);
    if (delta > Math.min(Math.PI, range) + 1e-9)
      throw new Error(
        `Cartesian waypoint path has a discontinuity at joint ${key} (${delta.toFixed(6)} rad).`,
      );
  }
  return { joints: chosen.joints, branch: chosen.branch };
}

type PathKnot = Readonly<{ u: number; joints: JointState; pose: ToolPose; branch: IKBranch }>;

function buildPathKnots(
  start: ToolPose,
  end: ToolPose,
  config: SortLabConfig,
  initialJoints?: JointState,
  initialBranch?: IKBranch,
): readonly PathKnot[] {
  const count = 240;
  const firstResult = inverseKinematics(start, config, 'both');
  if (!firstResult.reachable)
    throw new Error(`Cartesian waypoint is unreachable: ${firstResult.reason}`);
  const selectedStart =
    firstResult.solutions.find(({ branch: candidate }) => candidate === initialBranch) ??
    firstResult.solutions[0];
  let previous = initialJoints ?? selectedStart?.joints;
  let branch = initialBranch ?? selectedStart?.branch;
  if (!previous || !branch) throw new Error('Cartesian start waypoint has no IK solution.');
  if (initialJoints) {
    const first = chooseContinuousSolution(start, initialJoints, branch, config);
    previous = first.joints;
    branch = first.branch;
  }
  const knots: PathKnot[] = [{ u: 0, joints: previous, pose: start, branch }];
  for (let index = 1; index <= count; index += 1) {
    const u = index / count;
    const pose = interpolatePose(start, end, u);
    const next = chooseContinuousSolution(pose, previous, branch, config);
    knots.push({ u, joints: next.joints, pose, branch: next.branch });
    previous = next.joints;
    branch = next.branch;
  }
  return knots;
}

function estimateSegmentDuration(knots: readonly PathKnot[], config: SortLabConfig): number {
  const firstDerivative: Record<keyof JointState, number> = { j1: 0, j2: 0, j3: 0, j4: 0 };
  const secondDerivative: Record<keyof JointState, number> = { j1: 0, j2: 0, j3: 0, j4: 0 };
  const width = 1 / (knots.length - 1);
  for (let i = 0; i < knots.length; i += 1) {
    const current = knots[i];
    const before = knots[Math.max(0, i - 1)];
    const after = knots[Math.min(knots.length - 1, i + 1)];
    if (!current || !before || !after) continue;
    for (const key of JOINTS) {
      const first =
        (after.joints[key] - before.joints[key]) /
        ((i === 0 || i === knots.length - 1 ? 1 : 2) * width);
      firstDerivative[key] = Math.max(firstDerivative[key], Math.abs(first));
      if (i > 0 && i < knots.length - 1) {
        const second =
          (after.joints[key] - 2 * current.joints[key] + before.joints[key]) / (width * width);
        secondDerivative[key] = Math.max(secondDerivative[key], Math.abs(second));
      }
    }
  }
  let duration = 0.25;
  for (const key of JOINTS) {
    const velocityBound = (1.5 * firstDerivative[key]) / config.robot.speedLimits[key];
    const accelerationBound = Math.sqrt(
      (2.25 * secondDerivative[key] + 6 * firstDerivative[key]) /
        config.robot.accelerationLimits[key],
    );
    duration = Math.max(duration, velocityBound, accelerationBound);
  }
  return duration * 1.08;
}

function samplesForSegment(
  knots: readonly PathKnot[],
  start: ToolPose,
  end: ToolPose,
  config: SortLabConfig,
  samplePeriod: number,
  timeOffset: number,
): Readonly<{ duration: number; samples: readonly TrajectorySample[] }> {
  let duration = estimateSegmentDuration(knots, config);
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const count = Math.max(2, Math.ceil(duration / samplePeriod));
    duration = count * samplePeriod;
    const firstKnot = knots[0];
    if (!firstKnot) throw new Error('Cartesian segment has no start knot.');
    let previousJoints = firstKnot.joints;
    let previousBranch = firstKnot.branch;
    const positions = Array.from({ length: count + 1 }, (_, index) => {
      if (index === 0) return { joints: firstKnot.joints, pose: start };
      const u = index / count;
      const pose = index === count ? end : interpolatePose(start, end, cubicProgress(u));
      const solution = chooseContinuousSolution(pose, previousJoints, previousBranch, config);
      previousJoints = solution.joints;
      previousBranch = solution.branch;
      return { joints: solution.joints, pose };
    });
    const velocityRatios: number[] = [];
    const accelerationRatios: number[] = [];
    const dt = duration / count;
    const velocities = positions.slice(1).map((current, index) => {
      const previous = positions[index];
      if (!previous) throw new Error('Trajectory finite difference failed.');
      return Object.fromEntries(
        JOINTS.map((key) => [key, (current.joints[key] - previous.joints[key]) / dt]),
      ) as JointVelocity;
    });
    for (const key of JOINTS) {
      const limit = config.robot.speedLimits[key];
      const peak = velocities.reduce((max, velocity) => Math.max(max, Math.abs(velocity[key])), 0);
      velocityRatios.push(peak / limit);
      let peakAcceleration = 0;
      let previousVelocity = 0;
      for (const velocity of velocities) {
        peakAcceleration = Math.max(
          peakAcceleration,
          Math.abs((velocity[key] - previousVelocity) / dt),
        );
        previousVelocity = velocity[key];
      }
      peakAcceleration = Math.max(peakAcceleration, Math.abs(previousVelocity / dt));
      accelerationRatios.push(peakAcceleration / config.robot.accelerationLimits[key]);
    }
    const maxRatio = Math.max(...velocityRatios, ...accelerationRatios);
    if (maxRatio <= 1 + 1e-8) {
      const samples = positions.map((point, index) => {
        const zero = { j1: 0, j2: 0, j3: 0, j4: 0 };
        const velocity =
          index === 0 || index === positions.length - 1 ? zero : (velocities[index - 1] ?? zero);
        const currentIntervalVelocity = velocities[Math.max(0, index - 1)] ?? zero;
        const previousIntervalVelocity = velocities[index - 2] ?? zero;
        const acceleration = Object.fromEntries(
          JOINTS.map((key) => {
            if (index === positions.length - 1)
              return [key, -((velocities.at(-1)?.[key] ?? 0) / dt)];
            if (index === 0 || index === 1) return [key, currentIntervalVelocity[key] / dt];
            return [key, (currentIntervalVelocity[key] - previousIntervalVelocity[key]) / dt];
          }),
        ) as JointAcceleration;
        const position = point.joints;
        validateJointState(position, config);
        return {
          timeSeconds: timeOffset + index * dt,
          position,
          velocity,
          acceleration,
          pose: point.pose,
        };
      });
      return { duration, samples };
    }
    duration *= Math.max(1.04, maxRatio * 1.06, Math.sqrt(maxRatio) * 1.06);
  }
  throw new Error('Cartesian segment could not satisfy configured speed/acceleration limits.');
}

/**
 * Interpolates Cartesian waypoints linearly in XYZ and by shortest yaw, with a
 * cubic rest-to-rest time law per segment. IK is sampled at 240 path intervals;
 * the resulting joint samples are checked against baseline speed/acceleration
 * limits. This is a deterministic kinematic path, not a collision planner.
 */
export function generateCartesianWaypointTrajectory(
  waypoints: readonly ToolPose[],
  options: Readonly<{ samplePeriodSeconds: number; initialBranch?: IKBranch }>,
  config: SortLabConfig,
): CartesianTrajectory {
  assertPositiveFinite(options.samplePeriodSeconds, 'samplePeriodSeconds');
  if (!Array.isArray(waypoints) || waypoints.length < 2)
    throw new Error('A Cartesian route requires at least two waypoints.');
  for (const [index, pose] of waypoints.entries()) {
    const result = inverseKinematics(pose, config, 'both');
    if (!result.reachable)
      throw new Error(`Waypoint ${index + 1} is unreachable: ${result.reason}`);
  }
  for (let index = 1; index < waypoints.length; index += 1) {
    const previous = waypoints[index - 1];
    const current = waypoints[index];
    if (!previous || !current) throw new Error('Cartesian route is malformed.');
    const distance = Math.hypot(
      current.x - previous.x,
      current.y - previous.y,
      current.z - previous.z,
    );
    if (distance < 1e-9 && angularDifference(current.yaw, previous.yaw) < 1e-9)
      throw new Error(
        `Cartesian route has duplicate consecutive waypoints ${index} and ${index + 1}.`,
      );
  }

  let timeOffset = 0;
  let initialJoints: JointState | undefined;
  let initialBranch: IKBranch | undefined;
  const samples: TrajectorySample[] = [];
  const segmentDurationsSeconds: number[] = [];
  for (let index = 0; index < waypoints.length - 1; index += 1) {
    const start = waypoints[index];
    const end = waypoints[index + 1];
    if (!start || !end) throw new Error('Cartesian route is malformed.');
    const knots = buildPathKnots(
      start,
      end,
      config,
      initialJoints,
      initialBranch ?? options.initialBranch,
    );
    const segment = samplesForSegment(
      knots,
      start,
      end,
      config,
      options.samplePeriodSeconds,
      timeOffset,
    );
    if (samples.length) samples.push(...segment.samples.slice(1));
    else samples.push(...segment.samples);
    segmentDurationsSeconds.push(segment.duration);
    const endIk = inverseKinematics(end, config, 'both');
    const lastSample = segment.samples.at(-1);
    if (!endIk.reachable || !lastSample) throw new Error(`Waypoint ${index + 2} is unreachable.`);
    initialJoints = lastSample.position;
    const nearestBranch = endIk.solutions.reduce((best, candidate) => {
      const candidateCost =
        Math.abs(candidate.joints.j1 - initialJoints!.j1) +
        Math.abs(candidate.joints.j2 - initialJoints!.j2) +
        Math.abs(candidate.joints.j4 - initialJoints!.j4);
      const bestCost =
        Math.abs(best.joints.j1 - initialJoints!.j1) +
        Math.abs(best.joints.j2 - initialJoints!.j2) +
        Math.abs(best.joints.j4 - initialJoints!.j4);
      return candidateCost < bestCost ? candidate : best;
    }, endIk.solutions[0]!);
    initialBranch = nearestBranch.branch;
    timeOffset += segment.duration;
  }
  return {
    kind: 'cartesian-waypoints',
    durationSeconds: timeOffset,
    samples,
    segmentDurationsSeconds,
  };
}

/** Select/interpolate a deterministic kinematic sample at playback time. */
export function sampleTrajectoryAtTime(
  trajectory: Pick<CartesianTrajectory | JointTrajectory, 'samples' | 'durationSeconds'>,
  requestedTimeSeconds: number,
): TrajectorySample {
  if (!Number.isFinite(requestedTimeSeconds))
    throw new Error('Playback time must be finite seconds.');
  const first = trajectory.samples[0];
  const last = trajectory.samples.at(-1);
  if (!first || !last) throw new Error('Cannot sample an empty trajectory.');
  const time = Math.max(0, Math.min(trajectory.durationSeconds, requestedTimeSeconds));
  let low = 0;
  let high = trajectory.samples.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((trajectory.samples[middle]?.timeSeconds ?? Infinity) < time) low = middle + 1;
    else high = middle;
  }
  const next = trajectory.samples[low];
  const previous = trajectory.samples[Math.max(0, low - 1)];
  if (!next || !previous) return first;
  if (next.timeSeconds === previous.timeSeconds || next.timeSeconds === time) return next;
  const fraction = (time - previous.timeSeconds) / (next.timeSeconds - previous.timeSeconds);
  const position = Object.fromEntries(
    JOINTS.map((key) => [
      key,
      previous.position[key] + (next.position[key] - previous.position[key]) * fraction,
    ]),
  ) as JointState;
  const pose = {
    x: previous.pose.x + (next.pose.x - previous.pose.x) * fraction,
    y: previous.pose.y + (next.pose.y - previous.pose.y) * fraction,
    z: previous.pose.z + (next.pose.z - previous.pose.z) * fraction,
    yaw: wrapAngle(previous.pose.yaw + wrapAngle(next.pose.yaw - previous.pose.yaw) * fraction),
  };
  return { ...next, timeSeconds: time, position, pose };
}
