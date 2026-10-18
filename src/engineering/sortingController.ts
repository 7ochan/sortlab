import { CONFIG } from './config';
import { forwardKinematics } from './kinematics';
import { planDestinationRoute, type PlannedRoute } from './routes';
import type { PackageSnapshot } from './packagePhysics';
import { generateJointCubic, sampleTrajectoryAtTime, type JointTrajectory } from './trajectory';
import type { JointState, PackageClass, SortDestination, SortLabConfig } from './types';

export type ControllerState =
  | 'idle'
  | 'selecting'
  | 'planning'
  | 'moving-to-pickup'
  | 'aligning-and-grasping'
  | 'lifting'
  | 'transporting'
  | 'releasing'
  | 'verifying-placement'
  | 'returning-home'
  | 'completed'
  | 'recoverable-fault'
  | 'aborted';

export type FaultType =
  | 'unreachable-route'
  | 'failed-grasp'
  | 'lost-attachment'
  | 'incorrect-bin'
  | 'outside-bin'
  | 'placement-timeout'
  | 'invalid-transition'
  | 'controller-exception';

export type ControllerFault = Readonly<{
  type: FaultType;
  packageId: PackageClass['id'] | null;
  destinationId: SortDestination['id'] | null;
  simulationTimeSeconds: number;
  state: ControllerState;
  message: string;
}>;

export type ControllerEvent = Readonly<{
  tick: number;
  simulationTimeSeconds: number;
  state: ControllerState;
  message: string;
  fault?: FaultType;
}>;

export type PlacementResult = Readonly<{
  status: 'settling' | 'accepted' | 'incorrect-bin' | 'outside-bin';
  binId: SortDestination['id'] | null;
  message: string;
}>;

export type SortingPort = Readonly<{
  setJoints: (joints: JointState) => void;
  getJoints: () => JointState;
  getSnapshot: () => PackageSnapshot | null;
  open: () => void;
  close: () => void;
  attemptGrasp: () => Readonly<{ success: boolean; reason: string }>;
  release: () => Readonly<{ success: boolean; reason: string }>;
  resetPackage: () => void;
  stepPhysics: () => PackageSnapshot | null;
}>;

export type ControllerSnapshot = Readonly<{
  state: ControllerState;
  action: string;
  packageId: PackageClass['id'] | null;
  destinationId: SortDestination['id'] | null;
  elapsedSeconds: number;
  progress: number;
  graspResult: string;
  placementResult: PlacementResult | null;
  fault: ControllerFault | null;
  events: readonly ControllerEvent[];
  active: boolean;
}>;

const ZERO_VELOCITY = { j1: 0, j2: 0, j3: 0, j4: 0 } as const;
const PLACEMENT_TIMEOUT_SECONDS = 8;
const SETTLING_SECONDS = 0.25;
const LINEAR_SETTLED_MPS = 0.04;
const ANGULAR_SETTLED_RADPS = 0.12;

/**
 * A package-center acceptance region shrunk by package half dimensions and a 5 mm
 * margin. The vertical interval spans the bin floor through 10 mm below the lip.
 * Settlement requires <0.04 m/s linear and <0.12 rad/s angular speed for 0.25 s.
 */
export function classifyPlacement(
  snapshot: PackageSnapshot,
  config: SortLabConfig = CONFIG,
): PlacementResult {
  const item = config.packages.find(({ id }) => id === snapshot.id);
  if (!item) return { status: 'outside-bin', binId: null, message: 'Unknown package class.' };
  const margin = 0.005;
  const matches = config.cell.destinations.filter((bin) => {
    const halfX = item.dimensions.length / 2;
    const halfY = item.dimensions.width / 2;
    const projectedX =
      item.shape === 'cylinder'
        ? Math.min(item.dimensions.length, item.dimensions.width) / 2
        : Math.abs(Math.cos(snapshot.position.yaw)) * halfX +
          Math.abs(Math.sin(snapshot.position.yaw)) * halfY;
    const projectedY =
      item.shape === 'cylinder'
        ? Math.min(item.dimensions.length, item.dimensions.width) / 2
        : Math.abs(Math.sin(snapshot.position.yaw)) * halfX +
          Math.abs(Math.cos(snapshot.position.yaw)) * halfY;
    const xRoom = bin.inside.x / 2 - projectedX - margin;
    const yRoom = bin.inside.y / 2 - projectedY - margin;
    const minCenterZ = bin.floorZ + item.dimensions.height / 2 - 0.012;
    const maxCenterZ = bin.lipZ - item.dimensions.height / 2 - 0.01;
    return (
      xRoom >= 0 &&
      yRoom >= 0 &&
      Math.abs(snapshot.position.x - bin.center.x) <= xRoom &&
      Math.abs(snapshot.position.y - bin.center.y) <= yRoom &&
      snapshot.position.z >= minCenterZ &&
      snapshot.position.z <= maxCenterZ
    );
  });
  const bin = matches[0];
  if (!bin)
    return {
      status: 'outside-bin',
      binId: null,
      message: 'Package center is outside all package-size-adjusted bin acceptance regions.',
    };
  const speed = Math.hypot(
    snapshot.linearVelocity.x,
    snapshot.linearVelocity.y,
    snapshot.linearVelocity.z,
  );
  if (speed >= LINEAR_SETTLED_MPS || snapshot.angularVelocity >= ANGULAR_SETTLED_RADPS)
    return {
      status: 'settling',
      binId: bin.id,
      message: `Package is still moving (${speed.toFixed(3)} m/s).`,
    };
  if (bin.id !== item.destination)
    return {
      status: 'incorrect-bin',
      binId: bin.id,
      message: `Package ${item.id} settled in ${bin.id}; configured destination is ${item.destination}.`,
    };
  return {
    status: 'accepted',
    binId: bin.id,
    message: `${item.id} settled inside its configured ${bin.id} acceptance region.`,
  };
}

/** Fixed-tick controller; no timers, promises, React state, or wall-clock reads. */
export class SortingController {
  private state: ControllerState = 'idle';
  private action = 'Ready';
  private packageId: PackageClass['id'] | null = null;
  private destinationId: SortDestination['id'] | null = null;
  private route: PlannedRoute | null = null;
  private returnTrajectory: JointTrajectory | null = null;
  private pickupTrajectory: JointTrajectory | null = null;
  private elapsed = 0;
  private tickCount = 0;
  private motionTime = 0;
  private placementTime = 0;
  private settledTime = 0;
  private graspAttempts = 0;
  private graspResult = 'Not attempted';
  private placementResult: PlacementResult | null = null;
  private fault: ControllerFault | null = null;
  private events: ControllerEvent[] = [];
  private config: SortLabConfig;
  private paused = false;

  constructor(
    private readonly port: SortingPort,
    config: SortLabConfig = CONFIG,
  ) {
    this.config = config;
  }

  get snapshot(): ControllerSnapshot {
    const routeDuration = this.route?.trajectory.durationSeconds ?? 1;
    const homeDuration = this.returnTrajectory?.durationSeconds ?? 4;
    const progress =
      this.state === 'completed'
        ? 1
        : this.state === 'moving-to-pickup'
          ? 0.05 * (this.motionTime / (this.pickupTrajectory?.durationSeconds ?? 8))
          : ['aligning-and-grasping', 'lifting', 'transporting', 'releasing'].includes(this.state)
            ? 0.1 + 0.55 * (this.motionTime / routeDuration)
            : this.state === 'verifying-placement'
              ? 0.65 + 0.05 * (this.settledTime / SETTLING_SECONDS)
              : this.state === 'returning-home'
                ? 0.7 + 0.3 * (this.motionTime / (routeDuration + homeDuration))
                : 0;
    return {
      state: this.state,
      action: this.action,
      packageId: this.packageId,
      destinationId: this.destinationId,
      elapsedSeconds: this.elapsed,
      progress: Math.max(0, Math.min(1, progress)),
      graspResult: this.graspResult,
      placementResult: this.placementResult,
      fault: this.fault,
      events: [...this.events],
      active: !['idle', 'completed', 'recoverable-fault', 'aborted'].includes(this.state),
    };
  }

  get isPaused(): boolean {
    return this.paused;
  }
  setPaused(paused: boolean): void {
    if (!this.snapshot.active) return;
    this.paused = paused;
    this.action = paused ? 'Paused at fixed simulation tick' : `Resumed: ${this.state}`;
    this.record(this.action);
  }

  start(packageId: PackageClass['id']): boolean {
    if (this.state !== 'idle') {
      this.raiseFault('invalid-transition', `Cannot start while controller is ${this.state}.`);
      return false;
    }
    this.packageId = packageId;
    this.state = 'selecting';
    this.action = `Validating package ${packageId} and configured destination`;
    this.record(this.action);
    return true;
  }

  abort(): void {
    if (!this.snapshot.active) {
      this.raiseFault('invalid-transition', `Cannot abort while controller is ${this.state}.`);
      return;
    }
    try {
      if (this.port.getSnapshot()?.attached) {
        const result = this.port.release();
        if (!result.success || this.port.getSnapshot()?.attached) {
          this.port.resetPackage();
          this.record(
            `Abort cleanup reset the package because release did not detach it: ${result.reason}`,
          );
        } else {
          this.port.open();
        }
      }
      this.state = 'aborted';
      this.action = 'Cycle aborted; motion stopped and any attachment released';
      this.record(this.action);
    } catch (error) {
      this.raiseFault('controller-exception', `Abort cleanup failed: ${messageOf(error)}`);
    }
  }

  reset(): boolean {
    if (!['completed', 'aborted', 'recoverable-fault', 'idle'].includes(this.state)) {
      this.raiseFault('invalid-transition', `Cannot reset while controller is ${this.state}.`);
      return false;
    }
    try {
      this.port.resetPackage();
      this.state = 'idle';
      this.action = 'Ready';
      this.packageId = null;
      this.destinationId = null;
      this.route = null;
      this.returnTrajectory = null;
      this.pickupTrajectory = null;
      this.elapsed = 0;
      this.tickCount = 0;
      this.motionTime = 0;
      this.placementTime = 0;
      this.settledTime = 0;
      this.graspAttempts = 0;
      this.graspResult = 'Not attempted';
      this.placementResult = null;
      this.fault = null;
      this.paused = false;
      this.events = [];
      this.record('Controller reset; package returned to pickup and physics attachment cleared');
      return true;
    } catch (error) {
      this.raiseFault('controller-exception', `Reset failed: ${messageOf(error)}`);
      return false;
    }
  }

  tick(dt = this.config.performance.fixedStepSeconds): void {
    if (!Number.isFinite(dt) || dt <= 0) {
      this.raiseFault(
        'invalid-transition',
        `Controller tick must be finite and positive (got ${dt}).`,
      );
      return;
    }
    if (!this.snapshot.active) return;
    if (this.paused) return;
    this.elapsed += dt;
    this.tickCount += 1;
    try {
      switch (this.state) {
        case 'selecting':
          this.select();
          break;
        case 'planning':
          this.plan();
          break;
        case 'moving-to-pickup':
          this.moveToPickup(dt);
          break;
        case 'aligning-and-grasping':
          this.grasp();
          break;
        case 'lifting':
          this.moveSegment(dt, 0);
          break;
        case 'transporting':
          this.transport(dt);
          break;
        case 'releasing':
          this.release();
          break;
        case 'verifying-placement':
          this.verifyPlacement(dt);
          break;
        case 'returning-home':
          this.returnHome(dt);
          break;
        case 'idle':
        case 'completed':
        case 'recoverable-fault':
        case 'aborted':
          this.raiseFault(
            'invalid-transition',
            `Active controller reached terminal state ${this.state}.`,
          );
          return;
      }
      this.port.stepPhysics();
    } catch (error) {
      this.raiseFault('controller-exception', `${this.state} failed: ${messageOf(error)}`);
    }
  }

  private select(): void {
    const item = this.config.packages.find(({ id }) => id === this.packageId);
    if (!item)
      return this.raiseFault('unreachable-route', `Unknown package ${String(this.packageId)}.`);
    this.destinationId = item.destination;
    const simPackage = this.port.getSnapshot();
    if (!simPackage || simPackage.id !== item.id)
      return this.raiseFault(
        'controller-exception',
        'Selected package does not match the active Rapier body.',
      );
    this.state = 'planning';
    this.action = `Plan and validate route to ${item.destination}`;
    this.record(this.action);
  }

  private plan(): void {
    try {
      if (!this.destinationId) throw new Error('Destination is missing.');
      this.route = planDestinationRoute(this.destinationId, this.config);
      const samples = this.route.trajectory.samples;
      if (
        samples.length < 2 ||
        samples.some(
          ({ position, pose }) =>
            ![
              position.j1,
              position.j2,
              position.j3,
              position.j4,
              pose.x,
              pose.y,
              pose.z,
              pose.yaw,
            ].every(Number.isFinite),
        )
      )
        throw new Error('Route has missing or non-finite motion samples.');
      const start = samples[0]!.position;
      const pickupClearance = samples.find(
        (sample) => sample.pose.z > samples[0]!.pose.z + 0.01,
      )?.position;
      if (!pickupClearance) throw new Error('Route has no validated pickup lift segment.');
      this.pickupTrajectory = generateJointCubic(
        { position: this.port.getJoints(), velocity: ZERO_VELOCITY },
        { position: start, velocity: ZERO_VELOCITY },
        { durationSeconds: 8, samplePeriodSeconds: this.config.performance.fixedStepSeconds },
        this.config,
      );
      this.returnTrajectory = generateJointCubic(
        { position: start, velocity: ZERO_VELOCITY },
        { position: this.config.robot.home, velocity: ZERO_VELOCITY },
        { durationSeconds: 4, samplePeriodSeconds: this.config.performance.fixedStepSeconds },
        this.config,
      );
      this.motionTime = 0;
      this.state = 'moving-to-pickup';
      this.action = `Route to ${this.destinationId} validated; moving to pickup pose`;
      this.record(this.action);
    } catch (error) {
      this.raiseFault(
        'unreachable-route',
        `Route validation failed before motion: ${messageOf(error)}`,
      );
    }
  }

  private moveToPickup(dt: number): void {
    if (!this.pickupTrajectory)
      return this.raiseFault('unreachable-route', 'Pickup trajectory is missing.');
    this.motionTime += dt;
    this.port.setJoints(sampleTrajectoryAtTime(this.pickupTrajectory, this.motionTime).position);
    if (this.motionTime < this.pickupTrajectory.durationSeconds) return;
    this.motionTime = 0;
    this.state = 'aligning-and-grasping';
    this.action = 'Align TCP and close gripper at package-center pickup pose';
    this.record(this.action);
  }

  private grasp(): void {
    if (!this.packageId)
      return this.raiseFault('controller-exception', 'No package selected for grasp.');
    if (this.graspAttempts === 0) {
      this.port.close();
      this.graspAttempts += 1;
      const result = this.port.attemptGrasp();
      const attached = result.success && this.port.getSnapshot()?.attached === true;
      this.graspResult = attached
        ? 'Successful: Rapier fixed-joint attachment confirmed'
        : `Failed attempt 1/2: ${result.reason}${result.success ? ' Attachment state was not confirmed.' : ''}`;
      if (attached) {
        this.motionTime = 0;
        this.state = 'lifting';
        this.action = 'Lift package; attachment confirmed';
        this.record(this.action);
      } else {
        this.action = 'Grasp attempt failed; one bounded retry at pickup';
        this.record(this.action);
      }
      return;
    }
    if (this.graspAttempts < 2) {
      this.graspAttempts += 1;
      const result = this.port.attemptGrasp();
      const attached = result.success && this.port.getSnapshot()?.attached === true;
      this.graspResult = attached
        ? 'Successful on retry: Rapier fixed-joint attachment confirmed'
        : `Failed attempt 2/2: ${result.reason}${result.success ? ' Attachment state was not confirmed.' : ''}`;
      if (attached) {
        this.motionTime = 0;
        this.state = 'lifting';
        this.action = 'Lift package; attachment confirmed on retry';
        this.record(this.action);
      } else {
        this.port.open();
        this.raiseFault('failed-grasp', `Grasp failed after 2 attempts: ${result.reason}`);
      }
      return;
    }
    this.raiseFault('failed-grasp', 'Grasp retry limit reached.');
  }

  private moveSegment(dt: number, segment: number): void {
    const route = this.route;
    if (!route) return this.raiseFault('controller-exception', 'Route disappeared during motion.');
    if (!this.port.getSnapshot()?.attached)
      return this.raiseFault(
        'lost-attachment',
        `Package attachment was lost during ${this.state}.`,
      );
    this.motionTime += dt;
    this.port.setJoints(sampleTrajectoryAtTime(route.trajectory, this.motionTime).position);
    const segmentEnd = route.trajectory.segmentDurationsSeconds
      .slice(0, segment + 1)
      .reduce((a, b) => a + b, 0);
    if (this.motionTime + 1e-9 >= segmentEnd) {
      if (segment === 0) {
        this.state = 'transporting';
        this.action = `Lift complete; transport attached package to ${this.destinationId}`;
        this.record(this.action);
      } else {
        this.state = 'releasing';
        this.action = `At ${this.destinationId}; release package to Rapier dynamics`;
        this.record(this.action);
      }
    }
  }

  private transport(dt: number): void {
    const route = this.route;
    if (!route)
      return this.raiseFault('controller-exception', 'Route disappeared during transport.');
    if (!this.port.getSnapshot()?.attached)
      return this.raiseFault('lost-attachment', 'Package attachment was lost during transport.');
    this.motionTime += dt;
    this.port.setJoints(sampleTrajectoryAtTime(route.trajectory, this.motionTime).position);
    const liftEnd = route.trajectory.segmentDurationsSeconds[0]!;
    const total = route.trajectory.segmentDurationsSeconds.reduce((a, b) => a + b, 0);
    if (this.motionTime + 1e-9 >= total) {
      this.state = 'releasing';
      this.action = `At ${this.destinationId}; release package to Rapier dynamics`;
      this.record(this.action);
    } else if (this.motionTime < liftEnd) {
      this.state = 'lifting';
    }
  }

  private release(): void {
    const result = this.port.release();
    if (!result.success || this.port.getSnapshot()?.attached)
      return this.raiseFault('lost-attachment', `Release did not detach package: ${result.reason}`);
    this.port.open();
    this.placementResult = {
      status: 'settling',
      binId: null,
      message: 'Waiting for package to settle.',
    };
    this.placementTime = 0;
    this.settledTime = 0;
    this.state = 'verifying-placement';
    this.action = `Verify released package inside ${this.destinationId}`;
    this.record(`Release confirmed by Rapier: ${result.reason}`);
    this.record(this.action);
  }

  private verifyPlacement(dt: number): void {
    const snapshot = this.port.getSnapshot();
    if (!snapshot || snapshot.id !== this.packageId || snapshot.attached)
      return this.raiseFault(
        'lost-attachment',
        'Released package is missing, mismatched, or still attached.',
      );
    this.placementTime += dt;
    const placement = classifyPlacement(snapshot, this.config);
    this.placementResult = placement;
    if (placement.status === 'accepted') this.settledTime += dt;
    else this.settledTime = 0;
    if (this.settledTime >= SETTLING_SECONDS) {
      this.state = 'returning-home';
      this.motionTime = 0;
      this.action = `Placement verified: ${placement.message}; return to safe/home pose`;
      this.record(this.action);
      return;
    }
    if (this.placementTime >= PLACEMENT_TIMEOUT_SECONDS) {
      const latest = classifyPlacement(snapshot, this.config);
      const type =
        latest.status === 'incorrect-bin'
          ? 'incorrect-bin'
          : latest.status === 'outside-bin'
            ? 'outside-bin'
            : 'placement-timeout';
      this.raiseFault(
        type,
        latest.status === 'settling'
          ? 'Placement timeout: package did not settle inside a bin acceptance region.'
          : latest.message,
      );
    }
  }

  private returnHome(dt: number): void {
    if (!this.route || !this.returnTrajectory)
      return this.raiseFault('controller-exception', 'Return trajectory is missing.');
    const reverseTime = Math.max(0, this.route.trajectory.durationSeconds - this.motionTime);
    this.port.setJoints(sampleTrajectoryAtTime(this.route.trajectory, reverseTime).position);
    this.motionTime += dt;
    if (this.motionTime >= this.route.trajectory.durationSeconds) {
      const homeTime = this.motionTime - this.route.trajectory.durationSeconds;
      this.port.setJoints(sampleTrajectoryAtTime(this.returnTrajectory, homeTime).position);
      if (homeTime >= this.returnTrajectory.durationSeconds) {
        this.port.setJoints(this.config.robot.home);
        this.state = 'completed';
        this.action = `Cycle complete: ${this.packageId} verified in ${this.destinationId}`;
        this.record(this.action);
      }
    }
  }

  private raiseFault(type: FaultType, message: string): void {
    this.fault = {
      type,
      packageId: this.packageId,
      destinationId: this.destinationId,
      simulationTimeSeconds: this.elapsed,
      state: this.state,
      message,
    };
    this.state = 'recoverable-fault';
    this.action = `Fault: ${message}`;
    this.record(message, type);
  }

  private record(message: string, fault?: FaultType): void {
    this.events = [
      ...this.events,
      {
        tick: this.tickCount,
        simulationTimeSeconds: this.elapsed,
        state: this.state,
        message,
        ...(fault ? { fault } : {}),
      },
    ].slice(-80);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Updates the physics adapter's TCP from the commanded robot joint pose. */
export function tcpForJoints(joints: JointState, config: SortLabConfig = CONFIG) {
  return forwardKinematics(joints, config);
}
