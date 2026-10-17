import type { PackageClass, SortLabConfig, ToolPose } from './types';
import { angularDifference, wrapAngle } from './kinematics';

type Rapier = typeof import('@dimforge/rapier3d-deterministic-compat').default;
type Body = import('@dimforge/rapier3d-deterministic-compat').RigidBody;
type Collider = import('@dimforge/rapier3d-deterministic-compat').Collider;
type Joint = import('@dimforge/rapier3d-deterministic-compat').ImpulseJoint;
export type PackageSnapshot = Readonly<{
  id: PackageClass['id'];
  position: ToolPose;
  attached: boolean;
}>;
export type GraspResult = Readonly<{ success: boolean; reason: string }>;

const rotation = (yaw: number) => ({ x: 0, y: 0, z: Math.sin(yaw / 2), w: Math.cos(yaw / 2) });
const identity = { x: 0, y: 0, z: 0, w: 1 };

/** Rapier fixed-step adapter and package lifecycle. Robot links remain kinematic visuals. */
export class PackagePhysicsSimulation {
  private constructor(
    private readonly rapier: Rapier,
    private readonly config: SortLabConfig,
    private readonly world: InstanceType<Rapier['World']>,
    private readonly anchor: Body,
    private readonly padColliders: readonly [Collider, Collider],
    private packageBody: Body,
    private packageCollider: Collider,
    private selected: PackageClass,
    private tcp: ToolPose,
    private attachedJoint: Joint | null = null,
    private attached = false,
    private attachmentOffset: Readonly<{ x: number; y: number; z: number; yaw: number }> = {
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
    },
    private carryVelocity = { x: 0, y: 0, z: 0 },
    private graspOpen = true,
    private steps = 0,
  ) {}

  static async create(
    config: SortLabConfig,
    packageId: PackageClass['id'] = 'S',
  ): Promise<PackagePhysicsSimulation> {
    const { default: RAPIER } = await import('@dimforge/rapier3d-deterministic-compat');
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: 0, z: -config.physics.gravityMps2 });
    world.timestep = config.performance.fixedStepSeconds;
    world.integrationParameters.numSolverIterations = 8;
    const fixedBody = (x: number, y: number, z: number, hx: number, hy: number, hz: number) => {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(config.physics.staticFriction),
        body,
      );
    };
    fixedBody(0, 0, config.cell.tableZ - 0.025, 0.625, 0.39, 0.025);
    fixedBody(
      config.cell.conveyor.center.x,
      config.cell.conveyor.center.y,
      config.cell.conveyor.supportZ - 0.025,
      config.cell.conveyor.size.x / 2,
      config.cell.conveyor.size.y / 2,
      0.025,
    );
    for (const bin of config.cell.destinations) {
      const wall = 0.012;
      const height = bin.lipZ - bin.floorZ;
      fixedBody(
        bin.center.x,
        bin.center.y,
        bin.floorZ - wall / 2,
        bin.inside.x / 2,
        bin.inside.y / 2,
        wall / 2,
      );
      fixedBody(
        bin.center.x,
        bin.center.y + bin.outside.y / 2 - wall / 2,
        bin.floorZ + height / 2,
        bin.outside.x / 2,
        wall / 2,
        height / 2,
      );
      fixedBody(
        bin.center.x,
        bin.center.y - bin.outside.y / 2 + wall / 2,
        bin.floorZ + height / 2,
        bin.outside.x / 2,
        wall / 2,
        height / 2,
      );
      fixedBody(
        bin.center.x + bin.outside.x / 2 - wall / 2,
        bin.center.y,
        bin.floorZ + height / 2,
        wall / 2,
        bin.outside.y / 2,
        height / 2,
      );
      fixedBody(
        bin.center.x - bin.outside.x / 2 + wall / 2,
        bin.center.y,
        bin.floorZ + height / 2,
        wall / 2,
        bin.outside.y / 2,
        height / 2,
      );
    }
    const selected = config.packages.find((item) => item.id === packageId);
    if (!selected) throw new Error(`Unknown package class ${packageId}.`);
    const support = config.cell.pickup.packageSupportZ + selected.dimensions.height / 2;
    const anchor = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        config.cell.pickup.center.x,
        config.cell.pickup.center.y,
        support,
      ),
    );
    const jaw = config.robot.gripper.pad;
    const padDescriptors = [-1, 1].map((side) =>
      RAPIER.ColliderDesc.cuboid(jaw.length / 2, jaw.width / 2, 0.0225)
        .setTranslation(
          0,
          side *
            (selected.dimensions.width / 2 +
              jaw.width / 2 -
              config.physics.grasp.padContactEpsilonM),
          jaw.contactHeight,
        )
        .setSensor(true),
    );
    const pads = padDescriptors.map((desc) => world.createCollider(desc, anchor)) as [
      Collider,
      Collider,
    ];
    const position = {
      x: config.cell.pickup.center.x,
      y: config.cell.pickup.center.y,
      z: support,
      yaw: 0,
    };
    const simulation = new PackagePhysicsSimulation(
      RAPIER,
      config,
      world,
      anchor,
      pads,
      null!,
      null!,
      selected,
      position,
    );
    simulation.createPackage(selected, position);
    simulation.setPadOpening(config.robot.gripper.opening.max);
    return simulation;
  }

  private createPackage(item: PackageClass, pose: ToolPose): void {
    this.selected = item;
    const { length, width, height } = item.dimensions;
    const desc =
      item.shape === 'cylinder'
        ? this.rapier.ColliderDesc.cylinder(height / 2, Math.min(length, width) / 2)
        : item.shape === 'pouch'
          ? this.rapier.ColliderDesc.roundCuboid(
              length / 2,
              width / 2,
              height / 2,
              Math.min(0.01, height / 4),
            )
          : this.rapier.ColliderDesc.cuboid(length / 2, width / 2, height / 2);
    const rb = this.world.createRigidBody(
      this.rapier.RigidBodyDesc.dynamic()
        .setTranslation(pose.x, pose.y, pose.z)
        .setRotation(rotation(pose.yaw))
        .setCanSleep(false),
    );
    if (item.shape === 'cylinder')
      desc.setRotation({ x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 });
    const collider = this.world.createCollider(
      desc
        .setMass(item.massKg)
        .setFriction(this.config.physics.packageFriction)
        .setRestitution(this.config.physics.packageRestitution)
        .setCollisionGroups(
          (this.config.physics.collisionGroups.packages << 16) |
            (this.config.physics.collisionGroups.environment |
              this.config.physics.collisionGroups.packages),
        ),
      rb,
    );
    this.packageBody = rb;
    this.packageCollider = collider;
  }

  get packageClass(): PackageClass {
    return this.selected;
  }
  get isAttached(): boolean {
    return this.attached;
  }
  get isOpen(): boolean {
    return this.graspOpen;
  }
  get fixedSteps(): number {
    return this.steps;
  }
  get bodyCount(): number {
    return this.world.bodies.len();
  }
  get colliderCount(): number {
    return this.world.colliders.len();
  }

  selectPackage(packageId: PackageClass['id']): void {
    if (this.attached)
      throw new Error('Release the grasped package before selecting another package.');
    const item = this.config.packages.find(({ id }) => id === packageId);
    if (!item) throw new Error(`Unknown package class ${packageId}.`);
    this.world.removeRigidBody(this.packageBody);
    this.graspOpen = true;
    const pose = {
      x: this.config.cell.pickup.center.x,
      y: this.config.cell.pickup.center.y,
      z: this.config.cell.pickup.packageSupportZ + item.dimensions.height / 2,
      yaw: 0,
    };
    this.createPackage(item, pose);
    this.setPadOpening(this.config.robot.gripper.opening.max);
    this.tcp = pose;
    this.anchor.setTranslation({ x: pose.x, y: pose.y, z: pose.z }, true);
    this.anchor.setRotation(rotation(pose.yaw), true);
  }

  reset(): void {
    if (this.attachedJoint) this.world.removeImpulseJoint(this.attachedJoint, true);
    this.attachedJoint = null;
    this.attached = false;
    this.world.removeRigidBody(this.packageBody);
    const pose = {
      x: this.config.cell.pickup.center.x,
      y: this.config.cell.pickup.center.y,
      z: this.config.cell.pickup.packageSupportZ + this.selected.dimensions.height / 2,
      yaw: 0,
    };
    this.createPackage(this.selected, pose);
    this.tcp = pose;
    this.graspOpen = true;
    this.setPadOpening(this.config.robot.gripper.opening.max);
    this.carryVelocity = { x: 0, y: 0, z: 0 };
    this.anchor.setTranslation({ x: pose.x, y: pose.y, z: pose.z }, true);
    this.anchor.setRotation(rotation(0), true);
  }

  open(): void {
    this.graspOpen = true;
    this.setPadOpening(this.config.robot.gripper.opening.max);
  }

  close(): void {
    this.graspOpen = false;
    this.setPadOpening(
      this.selected.dimensions.width - 2 * this.config.physics.grasp.padContactEpsilonM,
    );
  }

  private setPadOpening(opening: number): void {
    const pad = this.config.robot.gripper.pad;
    for (const [index, side] of [-1, 1].entries()) {
      this.padColliders[index]!.setTranslationWrtParent({
        x: 0,
        y: side * (opening / 2 + pad.width / 2),
        z: pad.contactHeight,
      });
    }
  }

  setTcp(pose: ToolPose): void {
    if (![pose.x, pose.y, pose.z, pose.yaw].every(Number.isFinite))
      throw new Error('TCP pose must contain finite world-frame values.');
    this.tcp = pose;
  }

  attemptGrasp(): GraspResult {
    if (this.attached) return { success: false, reason: 'Package is already attached.' };
    if (this.graspOpen)
      return { success: false, reason: 'Close the gripper before attempting a grasp.' };
    // Refresh Rapier's broad/narrow phase after the pad geometry closes around the package.
    this.stepFixed(1);
    const p = this.packageBody.translation();
    const r = this.packageBody.rotation();
    const xy = Math.hypot(p.x - this.tcp.x, p.y - this.tcp.y);
    const z = Math.abs(p.z - this.tcp.z);
    const yaw = angularDifference(2 * Math.atan2(r.z, r.w), this.tcp.yaw);
    if (Math.hypot(xy, z) > this.config.physics.grasp.positionToleranceM)
      return {
        success: false,
        reason: `Package center is ${Math.hypot(xy, z).toFixed(3)} m from the TCP; tolerance is ${this.config.physics.grasp.positionToleranceM.toFixed(3)} m.`,
      };
    if (yaw > this.config.physics.grasp.yawToleranceRad)
      return {
        success: false,
        reason: `Package yaw error ${((yaw * 180) / Math.PI).toFixed(1)}° exceeds the configured alignment tolerance.`,
      };
    const bothPadsContact =
      this.world.intersectionPair(this.packageCollider, this.padColliders[0]) &&
      this.world.intersectionPair(this.packageCollider, this.padColliders[1]);
    if (!bothPadsContact)
      return {
        success: false,
        reason: 'Both simulated gripper pads must overlap the package contact envelope.',
      };
    const { width } = this.selected.dimensions;
    const opening = width - 2 * this.config.physics.grasp.padContactEpsilonM;
    if (
      opening < this.config.robot.gripper.opening.min ||
      opening > this.config.robot.gripper.opening.max
    )
      return {
        success: false,
        reason: `Package width ${width.toFixed(3)} m does not fit the configured jaw opening.`,
      };
    const force =
      (this.selected.massKg *
        this.config.robot.gripper.gravityMps2 *
        this.config.robot.gripper.safetyFactor) /
      (2 * this.config.robot.gripper.assumedFrictionCoefficient);
    if (force > this.config.robot.gripper.virtualJawCapacityN)
      return {
        success: false,
        reason: `Estimated jaw force ${force.toFixed(2)} N exceeds the ${this.config.robot.gripper.virtualJawCapacityN} N virtual capacity.`,
      };
    // Capture the current relative transform; the joint does not teleport or recenter the body.
    this.attachmentOffset = {
      x: p.x - this.tcp.x,
      y: p.y - this.tcp.y,
      z: p.z - this.tcp.z,
      yaw: wrapAngle(2 * Math.atan2(r.z, r.w) - this.tcp.yaw),
    };
    this.anchor.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
    this.anchor.setRotation({ x: r.x, y: r.y, z: r.z, w: r.w }, true);
    this.attachedJoint = this.world.createImpulseJoint(
      this.rapier.JointData.fixed({ x: 0, y: 0, z: 0 }, identity, { x: 0, y: 0, z: 0 }, identity),
      this.anchor,
      this.packageBody,
      true,
    );
    this.attached = true;
    return {
      success: true,
      reason:
        'Grasp accepted: package is aligned, within the jaw envelope, and within the virtual force limit.',
    };
  }

  release(): GraspResult {
    if (!this.attached || !this.attachedJoint)
      return { success: false, reason: 'No package is attached.' };
    this.world.removeImpulseJoint(this.attachedJoint, true);
    this.attachedJoint = null;
    this.attached = false;
    this.packageBody.setLinvel(this.carryVelocity, true);
    this.packageBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    return { success: true, reason: 'Package released to dynamic physics.' };
  }

  stepFixed(count = 1): PackageSnapshot {
    if (!Number.isInteger(count) || count < 0)
      throw new Error('Fixed-step count must be a non-negative integer.');
    const dt = this.config.performance.fixedStepSeconds;
    for (let i = 0; i < count; i += 1) {
      if (this.attached) {
        const yaw = this.tcp.yaw + this.attachmentOffset.yaw;
        const next = {
          x: this.tcp.x + this.attachmentOffset.x,
          y: this.tcp.y + this.attachmentOffset.y,
          z: this.tcp.z + this.attachmentOffset.z,
        };
        const current = this.anchor.translation();
        this.carryVelocity = {
          x: (next.x - current.x) / dt,
          y: (next.y - current.y) / dt,
          z: (next.z - current.z) / dt,
        };
        this.anchor.setNextKinematicTranslation(next);
        this.anchor.setNextKinematicRotation(rotation(yaw));
      } else {
        this.anchor.setNextKinematicTranslation({ x: this.tcp.x, y: this.tcp.y, z: this.tcp.z });
        this.anchor.setNextKinematicRotation(rotation(this.tcp.yaw));
      }
      this.world.timestep = dt;
      this.world.step();
      this.steps += 1;
    }
    const p = this.packageBody.translation();
    const r = this.packageBody.rotation();
    return {
      id: this.selected.id,
      position: { x: p.x, y: p.y, z: p.z, yaw: wrapAngle(2 * Math.atan2(r.z, r.w)) },
      attached: this.attached,
    };
  }

  dispose(): void {
    this.world.free();
  }
}
