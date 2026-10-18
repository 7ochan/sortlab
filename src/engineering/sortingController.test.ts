import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { SortingController, classifyPlacement, type SortingPort } from './sortingController';
import type { PackageSnapshot } from './packagePhysics';
import { PackagePhysicsSimulation } from './packagePhysics';
import { forwardKinematics } from './kinematics';
import type { PackageClass } from './types';
import {
  SCENARIOS,
  compareScenarioOutcome,
  nominalRouteIsFeasible,
  scenarioById,
} from './scenarios';

const worlds: { dispose?: () => void }[] = [];

function centerInBin(
  id: PackageClass['id'],
  binId: 'B1' | 'B2' | 'B3' = CONFIG.packages.find((p) => p.id === id)!.destination,
): PackageSnapshot {
  const bin = CONFIG.cell.destinations.find((item) => item.id === binId)!;
  const item = CONFIG.packages.find((p) => p.id === id)!;
  return {
    id,
    position: {
      x: bin.center.x,
      y: bin.center.y,
      z: bin.floorZ + item.dimensions.height / 2,
      yaw: 0,
    },
    attached: false,
    linearVelocity: { x: 0, y: 0, z: 0 },
    angularVelocity: 0,
  };
}

class FakePort implements SortingPort {
  snapshot: PackageSnapshot = {
    id: 'S',
    position: { x: 0.3, y: 0, z: 0.37, yaw: 0 },
    attached: false,
    linearVelocity: { x: 0, y: 0, z: 0 },
    angularVelocity: 0,
  };
  joints = 0;
  currentJoints = CONFIG.robot.home;
  attached = false;
  failGrasps = 0;
  reportGraspWithoutAttachment = false;
  lostOnTransport = false;
  badPlacement: 'wrong' | 'outside' | 'timeout' | null = null;
  failRelease = false;
  resetCount = 0;
  setJoints(joints: Parameters<SortingPort['setJoints']>[0]) {
    this.joints += 1;
    this.currentJoints = joints;
  }
  getJoints() {
    return this.currentJoints;
  }
  getSnapshot() {
    return { ...this.snapshot, attached: this.attached };
  }
  open() {}
  close() {}
  attemptGrasp() {
    if (this.failGrasps > 0) {
      this.failGrasps -= 1;
      return { success: false, reason: 'injected alignment miss' };
    }
    if (this.reportGraspWithoutAttachment)
      return { success: true, reason: 'injected unattached success response' };
    this.attached = true;
    return { success: true, reason: 'fake fixed-joint attachment' };
  }
  release() {
    if (this.failRelease) return { success: false, reason: 'injected release failure' };
    this.attached = false;
    if (this.badPlacement === 'wrong') this.snapshot = centerInBin(this.snapshot.id, 'B2');
    else if (this.badPlacement === 'outside')
      this.snapshot = {
        ...centerInBin(this.snapshot.id),
        position: { x: 0.5, y: 0.5, z: 0.2, yaw: 0 },
      };
    else if (this.badPlacement === 'timeout')
      this.snapshot = { ...centerInBin(this.snapshot.id), linearVelocity: { x: 0, y: 0, z: 0.5 } };
    else this.snapshot = centerInBin(this.snapshot.id);
    return { success: true, reason: 'fake release' };
  }
  resetPackage() {
    this.resetCount += 1;
    this.attached = false;
    const item = CONFIG.packages.find((p) => p.id === this.snapshot.id)!;
    this.snapshot = {
      ...this.snapshot,
      attached: false,
      position: {
        x: CONFIG.cell.pickup.center.x,
        y: CONFIG.cell.pickup.center.y,
        z: CONFIG.cell.pickup.packageSupportZ + item.dimensions.height / 2,
        yaw: 0,
      },
      linearVelocity: { x: 0, y: 0, z: 0 },
    };
  }
  stepPhysics() {
    if (this.lostOnTransport && this.attached && this.joints > 30) this.attached = false;
    return this.getSnapshot();
  }
}

function cycleTo(controller: SortingController, target: string, limit = 10000) {
  for (
    let tick = 0;
    tick < limit && controller.snapshot.state !== target && !controller.snapshot.fault;
    tick += 1
  )
    controller.tick(CONFIG.performance.fixedStepSeconds);
  expect(controller.snapshot.state).toBe(target);
}

function cycleToTerminal(controller: SortingController, limit = 12000) {
  for (let tick = 0; tick < limit && controller.snapshot.active; tick += 1)
    controller.tick(CONFIG.performance.fixedStepSeconds);
}

afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose?.();
});

describe('autonomous sorting controller', () => {
  it.each(['S', 'M', 'L'] as const)(
    'runs a real Rapier cycle for package %s',
    async (id) => {
      const physics = await PackagePhysicsSimulation.create(CONFIG, id);
      worlds.push(physics);
      const bodyCount = physics.bodyCount;
      physics.stepFixed(1);
      let controllerJoints = CONFIG.robot.home;
      const controller = new SortingController({
        setJoints: (joints) => {
          controllerJoints = joints;
          physics.setTcp(forwardKinematics(joints, CONFIG));
        },
        getJoints: () => controllerJoints,
        getSnapshot: () => physics.stepFixed(0),
        open: () => physics.open(),
        close: () => physics.close(),
        attemptGrasp: () => physics.attemptGrasp(),
        release: () => physics.release(),
        resetPackage: () => physics.reset(),
        stepPhysics: () => physics.stepFixed(1),
      });
      expect(controller.start(id)).toBe(true);
      cycleToTerminal(controller, 2400);
      expect(controller.snapshot.state, JSON.stringify(controller.snapshot.fault)).toBe(
        'completed',
      );
      expect(controller.snapshot.placementResult?.status).toBe('accepted');
      expect(physics.isAttached).toBe(false);
      expect(physics.bodyCount).toBe(bodyCount);
    },
    15000,
  );

  it.each([
    ['S', 'B1'],
    ['M', 'B2'],
    ['L', 'B3'],
  ] as const)(
    'validates and completes %s → %s with explicit states and confirmed grasp/placement',
    (id, destination) => {
      const port = new FakePort();
      port.snapshot = { ...port.snapshot, id };
      const controller = new SortingController(port);
      expect(controller.start(id)).toBe(true);
      expect(controller.start(id)).toBe(false);
      expect(controller.snapshot.fault?.type).toBe('invalid-transition');
      expect(controller.reset()).toBe(true);
      expect(controller.start(id)).toBe(true);
      controller.tick(); // select and validate configured mapping
      expect(controller.snapshot.destinationId).toBe(destination);
      expect(port.joints).toBe(0);
      controller.tick(); // plan before any motion
      expect(port.joints).toBe(0);
      cycleToTerminal(controller);
      expect(controller.snapshot.state).toBe('completed');
      expect(controller.snapshot.placementResult?.status).toBe('accepted');
      expect(controller.snapshot.graspResult).toMatch(/^Successful/);
      expect(controller.snapshot.destinationId).toBe(destination);
      for (const state of [
        'selecting',
        'planning',
        'moving-to-pickup',
        'aligning-and-grasping',
        'lifting',
        'transporting',
        'releasing',
        'verifying-placement',
        'returning-home',
        'completed',
      ])
        expect(controller.snapshot.events.some((event) => event.state === state)).toBe(true);
    },
  );

  it('allows one bounded grasp retry and faults after the second failed grasp', () => {
    const port = new FakePort();
    port.failGrasps = 2;
    const controller = new SortingController(port);
    controller.start('S');
    cycleTo(controller, 'recoverable-fault');
    expect(controller.snapshot.fault?.type).toBe('failed-grasp');
    expect(controller.snapshot.graspResult).toContain('attempt 2/2');
  });

  it('does not report grasp success from a positive command result without attachment state', () => {
    const port = new FakePort();
    port.reportGraspWithoutAttachment = true;
    const controller = new SortingController(port);
    controller.start('S');
    cycleTo(controller, 'recoverable-fault');
    expect(controller.snapshot.graspResult).toContain('Attachment state was not confirmed');
    expect(controller.snapshot.fault?.type).toBe('failed-grasp');
  });

  it('rejects an infeasible route before commanding motion', () => {
    const port = new FakePort();
    const brokenConfig = {
      ...CONFIG,
      cell: {
        ...CONFIG.cell,
        destinations: CONFIG.cell.destinations.map((bin) =>
          bin.id === 'B1' ? { ...bin, center: { x: 2, y: 2 } } : bin,
        ),
      },
    };
    const controller = new SortingController(port, brokenConfig);
    controller.start('S');
    controller.tick();
    controller.tick();
    expect(controller.snapshot.fault?.type).toBe('unreachable-route');
    expect(port.joints).toBe(0);
  });

  it('resets after a successful sort without leaving a stale attachment or body', () => {
    const port = new FakePort();
    port.snapshot = { ...port.snapshot, id: 'M' };
    const controller = new SortingController(port);
    controller.start('M');
    cycleToTerminal(controller);
    expect(controller.snapshot.state).toBe('completed');
    expect(controller.reset()).toBe(true);
    expect(controller.snapshot.state).toBe('idle');
    expect(port.attached).toBe(false);
    expect(port.snapshot.id).toBe('M');
  });

  it('catches attachment loss during transport and never completes', () => {
    const port = new FakePort();
    port.lostOnTransport = true;
    const controller = new SortingController(port);
    controller.start('S');
    cycleTo(controller, 'recoverable-fault');
    expect(controller.snapshot.fault?.type).toBe('lost-attachment');
    expect(controller.snapshot.state).not.toBe('completed');
  });

  it.each([
    ['wrong', 'incorrect-bin'],
    ['outside', 'outside-bin'],
    ['timeout', 'placement-timeout'],
  ] as const)('rejects %s release without false success', (placement, fault) => {
    const port = new FakePort();
    port.badPlacement = placement;
    const controller = new SortingController(port);
    controller.start('S');
    cycleTo(controller, 'recoverable-fault');
    expect(controller.snapshot.fault?.type).toBe(fault);
    expect(controller.snapshot.state).not.toBe('completed');
  });

  it('rejects a failed release and can reset a fault without retaining attachment', () => {
    const port = new FakePort();
    port.failRelease = true;
    const controller = new SortingController(port);
    controller.start('S');
    cycleTo(controller, 'recoverable-fault');
    expect(controller.snapshot.fault?.type).toBe('lost-attachment');
    expect(controller.reset()).toBe(true);
    expect(controller.snapshot.state).toBe('idle');
    expect(port.attached).toBe(false);
  });

  it('clears an attachment safely if abort-time release itself fails', () => {
    const port = new FakePort();
    const controller = new SortingController(port);
    controller.start('S');
    cycleTo(controller, 'transporting');
    port.failRelease = true;
    controller.abort();
    expect(controller.snapshot.state).toBe('aborted');
    expect(port.attached).toBe(false);
    expect(port.resetCount).toBe(1);
  });

  it.each([
    'moving-to-pickup',
    'aligning-and-grasping',
    'lifting',
    'transporting',
    'releasing',
    'verifying-placement',
  ] as const)('aborts safely during %s and resets', (state) => {
    const port = new FakePort();
    const controller = new SortingController(port);
    controller.start('S');
    cycleTo(controller, state);
    controller.abort();
    expect(controller.snapshot.state).toBe('aborted');
    expect(port.attached).toBe(false);
    expect(controller.reset()).toBe(true);
    expect(controller.snapshot.state).toBe('idle');
  });

  it('pauses on fixed ticks and rejects reset during active motion', () => {
    const port = new FakePort();
    const controller = new SortingController(port);
    controller.start('S');
    controller.tick();
    controller.tick();
    controller.setPaused(true);
    const time = controller.snapshot.elapsedSeconds;
    controller.tick();
    expect(controller.snapshot.elapsedSeconds).toBe(time);
    expect(controller.reset()).toBe(false);
    expect(controller.snapshot.fault?.type).toBe('invalid-transition');
  });
});

describe('placement acceptance region', () => {
  it.each(['S', 'M', 'L'] as const)('accepts %s only when settled in its configured bin', (id) => {
    expect(classifyPlacement(centerInBin(id)).status).toBe('accepted');
    expect(classifyPlacement(centerInBin(id, id === 'S' ? 'B2' : 'B1')).status).toBe(
      'incorrect-bin',
    );
    const outside = { ...centerInBin(id), position: { x: 0.3, y: 0, z: 0.4, yaw: 0 } };
    expect(classifyPlacement(outside).status).toBe('outside-bin');
  });

  it('requires low linear and angular velocity before accepting a package', () => {
    const moving = { ...centerInBin('M'), linearVelocity: { x: 0, y: 0, z: 0.5 } };
    expect(classifyPlacement(moving).status).toBe('settling');
  });
});

describe('repeatable sorting scenarios', () => {
  it('registers all nominal package mappings and controlled fault outcomes', () => {
    expect(SCENARIOS.map(({ id }) => id)).toEqual([
      'nominal-s',
      'nominal-m',
      'nominal-l',
      'unreachable-route',
      'grasp-failure',
      'placement-timeout',
    ]);
    expect(
      SCENARIOS.slice(0, 3).map(({ packageId, expected }) => [packageId, expected.state]),
    ).toEqual([
      ['S', 'completed'],
      ['M', 'completed'],
      ['L', 'completed'],
    ]);
    expect(nominalRouteIsFeasible('S')).toBe(true);
    expect(nominalRouteIsFeasible('M')).toBe(true);
    expect(nominalRouteIsFeasible('L')).toBe(true);
  });

  it('compares actual terminal state and fault against the declared expectation', () => {
    expect(
      compareScenarioOutcome(scenarioById('grasp-failure').expected, {
        state: 'recoverable-fault',
        fault: {
          type: 'failed-grasp',
          packageId: 'M',
          destinationId: 'B2',
          simulationTimeSeconds: 1,
          state: 'aligning-and-grasping',
          message: 'miss',
        },
      }).passed,
    ).toBe(true);
    expect(
      compareScenarioOutcome(scenarioById('grasp-failure').expected, {
        state: 'completed',
        fault: null,
      }).passed,
    ).toBe(false);
  });

  it('injects route rejection before any joint motion', () => {
    const port = new FakePort();
    const controller = new SortingController(port);
    expect(controller.configureScenario(scenarioById('unreachable-route').hooks)).toBe(true);
    controller.start('S');
    cycleTo(controller, 'recoverable-fault');
    expect(port.joints).toBe(0);
    expect(
      compareScenarioOutcome(scenarioById('unreachable-route').expected, controller.snapshot)
        .passed,
    ).toBe(true);
  });

  it('injects bounded grasp misses and placement timeout through the same controller lifecycle', () => {
    const graspPort = new FakePort();
    graspPort.snapshot = { ...graspPort.snapshot, id: 'M' };
    const grasp = new SortingController(graspPort);
    grasp.configureScenario(scenarioById('grasp-failure').hooks);
    grasp.start('M');
    cycleTo(grasp, 'recoverable-fault');
    expect(grasp.snapshot.fault?.type).toBe('failed-grasp');
    expect(grasp.snapshot.events.filter(({ kind }) => kind === 'grasp')).toHaveLength(2);

    const placementPort = new FakePort();
    placementPort.snapshot = { ...placementPort.snapshot, id: 'L' };
    const placement = new SortingController(placementPort);
    placement.configureScenario(scenarioById('placement-timeout').hooks);
    placement.start('L');
    cycleTo(placement, 'recoverable-fault');
    expect(placement.snapshot.fault?.type).toBe('placement-timeout');
    expect(
      compareScenarioOutcome(scenarioById('placement-timeout').expected, placement.snapshot).passed,
    ).toBe(true);
  });
});
