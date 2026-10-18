import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/engineering/config';
import { forwardKinematics } from '../src/engineering/kinematics';
import { PackagePhysicsSimulation } from '../src/engineering/packagePhysics';
import { planDestinationRoute } from '../src/engineering/routes';
import {
  SortingController,
  classifyPlacement,
  type ControllerScenarioHooks,
  type FaultType,
  type SortingPort,
} from '../src/engineering/sortingController';
import { scenarioById } from '../src/engineering/scenarios';
import type { PackageClass, ToolPose } from '../src/engineering/types';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESULTS = path.join(ROOT, 'validation', 'results');
const DT = CONFIG.performance.fixedStepSeconds;
const REPLICATES = 3;

type FaultCase = Readonly<{
  id: string;
  packageId: PackageClass['id'];
  expectedFault: FaultType | 'aborted';
  injection:
    | 'route'
    | 'grasp'
    | 'lost-attachment'
    | 'release'
    | 'wrong-bin'
    | 'outside'
    | 'timeout'
    | 'abort-pickup'
    | 'abort-transport'
    | 'abort-release'
    | 'abort-verification'
    | 'invalid-transition';
  hooks?: ControllerScenarioHooks;
}>;

const FAULTS: readonly FaultCase[] = [
  {
    id: 'unreachable-route',
    packageId: 'S',
    expectedFault: 'unreachable-route',
    injection: 'route',
    hooks: scenarioById('unreachable-route').hooks,
  },
  {
    id: 'grasp-misalignment',
    packageId: 'M',
    expectedFault: 'failed-grasp',
    injection: 'grasp',
    hooks: scenarioById('grasp-failure').hooks,
  },
  {
    id: 'lost-attachment-transport',
    packageId: 'L',
    expectedFault: 'lost-attachment',
    injection: 'lost-attachment',
  },
  { id: 'release-failure', packageId: 'S', expectedFault: 'lost-attachment', injection: 'release' },
  { id: 'incorrect-bin', packageId: 'M', expectedFault: 'incorrect-bin', injection: 'wrong-bin' },
  { id: 'outside-bin', packageId: 'L', expectedFault: 'outside-bin', injection: 'outside' },
  {
    id: 'placement-timeout',
    packageId: 'S',
    expectedFault: 'placement-timeout',
    injection: 'timeout',
    hooks: scenarioById('placement-timeout').hooks,
  },
  { id: 'abort-pickup', packageId: 'S', expectedFault: 'aborted', injection: 'abort-pickup' },
  { id: 'abort-transport', packageId: 'M', expectedFault: 'aborted', injection: 'abort-transport' },
  { id: 'abort-release', packageId: 'L', expectedFault: 'aborted', injection: 'abort-release' },
  {
    id: 'abort-verification',
    packageId: 'S',
    expectedFault: 'aborted',
    injection: 'abort-verification',
  },
  {
    id: 'invalid-transition',
    packageId: 'M',
    expectedFault: 'invalid-transition',
    injection: 'invalid-transition',
  },
];

function binCenterPose(packageId: PackageClass['id'], binId: 'B1' | 'B2' | 'B3'): ToolPose {
  const bin = CONFIG.cell.destinations.find(({ id }) => id === binId)!;
  const item = CONFIG.packages.find(({ id }) => id === packageId)!;
  return {
    x: bin.center.x,
    y: bin.center.y,
    z: bin.floorZ + item.dimensions.height / 2 + 0.002,
    yaw: 0,
  };
}

async function createHarness(fault: FaultCase) {
  const simulation = await PackagePhysicsSimulation.create(CONFIG, fault.packageId);
  let releaseFailureInjected = false;
  const bodyCount = simulation.bodyCount;
  const colliderCount = simulation.colliderCount;
  let joints = planDestinationRoute(
    CONFIG.packages.find(({ id }) => id === fault.packageId)!.destination,
    CONFIG,
  ).trajectory.samples[0]!.position;
  const port: SortingPort = {
    setJoints: (next) => {
      joints = next;
      simulation.setTcp(forwardKinematics(next, CONFIG));
    },
    getJoints: () => joints,
    getSnapshot: () => simulation.stepFixed(0),
    open: () => simulation.open(),
    close: () => simulation.close(),
    attemptGrasp: () => simulation.attemptGrasp(),
    release: () =>
      fault.injection === 'release' && !releaseFailureInjected
        ? ((releaseFailureInjected = true),
          { success: false, reason: 'Validation injection: release adapter returned failure.' })
        : simulation.release(),
    resetPackage: () => simulation.reset(),
    stepPhysics: () => simulation.stepFixed(1),
    getPhysicsStepCount: () => simulation.fixedSteps,
  };
  const controller = new SortingController(port);
  if (!controller.configureScenario(fault.hooks))
    throw new Error('Could not configure fault injection before start.');
  return {
    simulation,
    controller,
    getJoints: () => joints,
    setJoints: (next: typeof joints) => {
      joints = next;
      simulation.setTcp(forwardKinematics(next, CONFIG));
    },
    bodyCount,
    colliderCount,
  };
}

function runToTerminal(
  fault: FaultCase,
  harness: Awaited<ReturnType<typeof createHarness>>,
  attemptId: string,
) {
  const { simulation, controller } = harness;
  if (!controller.start(fault.packageId))
    throw new Error(`${attemptId}: start rejected unexpectedly.`);
  let injected = false;
  if (fault.injection === 'invalid-transition') {
    controller.start(fault.packageId);
    injected = true;
  }
  let ticks = 0;
  while (controller.snapshot.active && ticks < 12_000) {
    controller.tick(DT);
    ticks += 1;
    if (fault.injection === 'route' && controller.snapshot.state === 'planning') injected = true;
    if (fault.injection === 'grasp' && controller.snapshot.state === 'aligning-and-grasping')
      injected = true;
    if (fault.injection === 'release' && controller.snapshot.state === 'releasing') injected = true;
    if (fault.injection === 'timeout' && controller.snapshot.state === 'verifying-placement')
      injected = true;
    if (
      fault.injection === 'invalid-transition' &&
      !injected &&
      controller.snapshot.state === 'selecting'
    ) {
      controller.start(fault.packageId);
      injected = true;
    }
    if (
      fault.injection === 'lost-attachment' &&
      !injected &&
      controller.snapshot.state === 'transporting'
    ) {
      const detached = simulation.release();
      if (!detached.success)
        throw new Error(`${attemptId}: lost-attachment injection failed to release.`);
      injected = true;
    }
    if (
      (fault.injection === 'wrong-bin' || fault.injection === 'outside') &&
      !injected &&
      controller.snapshot.state === 'verifying-placement'
    ) {
      if (fault.injection === 'wrong-bin') {
        const target = CONFIG.packages.find(({ id }) => id === fault.packageId)!.destination;
        const wrong = CONFIG.cell.destinations.find(({ id }) => id !== target)!.id;
        simulation.setPackagePoseForValidation(binCenterPose(fault.packageId, wrong));
      } else {
        const item = CONFIG.packages.find(({ id }) => id === fault.packageId)!;
        simulation.setPackagePoseForValidation({
          x: 0,
          y: 0.25,
          z: CONFIG.cell.tableZ + item.dimensions.height / 2 + 0.002,
          yaw: 0,
        });
      }
      injected = true;
    }
    const abortState: Readonly<Record<string, string>> = {
      'abort-pickup': 'moving-to-pickup',
      'abort-transport': 'transporting',
      'abort-release': 'releasing',
      'abort-verification': 'verifying-placement',
    };
    if (!injected && abortState[fault.injection] === controller.snapshot.state) {
      controller.abort();
      injected = true;
    }
  }
  if (!injected) throw new Error(`${attemptId}: required fault injection point was not reached.`);
  if (controller.snapshot.active)
    throw new Error(`${attemptId}: no terminal state after ${ticks} ticks.`);
  return { ticks, snapshot: controller.snapshot, packageSnapshot: simulation.stepFixed(0) };
}

describe('deterministic fault-injection campaigns through production controller and Rapier', () => {
  it('runs three trials per fault class, verifies reset integrity, and reruns nominal sorting', async () => {
    const records = [] as Record<string, unknown>[];
    let sequence = 0;
    for (const fault of FAULTS) {
      for (let replicate = 1; replicate <= REPLICATES; replicate += 1) {
        sequence += 1;
        const attemptId = `fault-${String(sequence).padStart(3, '0')}-${fault.id}-r${replicate}`;
        const harness = await createHarness(fault);
        const terminal = runToTerminal(fault, harness, attemptId);
        const terminalState = terminal.snapshot.state;
        const observed =
          terminalState === 'aborted' ? 'aborted' : (terminal.snapshot.fault?.type ?? null);
        const expectedMatch = observed === fault.expectedFault;
        const falsePositivePlacement =
          terminalState === 'completed' || terminal.snapshot.placementResult?.status === 'accepted';
        const attachedAtTerminal = harness.simulation.isAttached;
        const bodyCountBeforeReset = harness.simulation.bodyCount;
        const colliderCountBeforeReset = harness.simulation.colliderCount;
        const resetResult = harness.controller.reset();
        const attachedAfterReset = harness.simulation.isAttached;
        const bodyCountAfterReset = harness.simulation.bodyCount;
        const colliderCountAfterReset = harness.simulation.colliderCount;
        harness.setJoints(
          planDestinationRoute(
            CONFIG.packages.find(({ id }) => id === fault.packageId)!.destination,
            CONFIG,
          ).trajectory.samples[0]!.position,
        );
        const rerunStarted = harness.controller.start(fault.packageId);
        let rerunTicks = 0;
        while (harness.controller.snapshot.active && rerunTicks < 12_000) {
          harness.controller.tick(DT);
          rerunTicks += 1;
        }
        const rerunState = harness.controller.snapshot.state;
        const rerunPlacement = harness.controller.snapshot.placementResult?.status ?? null;
        const rerunBodyCount = harness.simulation.bodyCount;
        const rerunAttached = harness.simulation.isAttached;
        const rerunPass =
          rerunStarted &&
          rerunState === 'completed' &&
          rerunPlacement === 'accepted' &&
          !rerunAttached &&
          rerunBodyCount === harness.bodyCount;
        const record = {
          attemptId,
          faultClass: fault.id,
          injectionType: fault.injection,
          injectionNature: ['route', 'grasp', 'release', 'timeout', 'invalid-transition'].includes(
            fault.injection,
          )
            ? 'controller/adapter fault injection; does not modify Rapier physical state'
            : ['wrong-bin', 'outside'].includes(fault.injection)
              ? 'validation pose teleport on the real detached Rapier body; production placement classifier unchanged'
              : fault.injection.startsWith('abort')
                ? 'user abort command at a deterministic controller state'
                : 'actual Rapier release used to remove the fixed-joint attachment during transport',
          expectedOutcome: fault.expectedFault,
          observedTerminalState: terminalState,
          observedFaultType: terminal.snapshot.fault?.type ?? null,
          observedFaultReason: terminal.snapshot.fault?.message ?? null,
          actualPlacementClassificationAtFault: classifyPlacement(terminal.packageSnapshot, CONFIG),
          falsePositivePlacement: Boolean(falsePositivePlacement),
          expectedOutcomeMatched: expectedMatch,
          injectedAtState: fault.injection.startsWith('abort')
            ? fault.injection.slice('abort-'.length)
            : fault.injection,
          ticksToTerminal: terminal.ticks,
          attachmentAtTerminal: attachedAtTerminal,
          bodyCountBeforeReset,
          bodyCountAfterReset,
          colliderCountBeforeReset,
          colliderCountAfterReset,
          resetBodyAndColliderCountsMatch:
            bodyCountAfterReset === harness.bodyCount &&
            colliderCountAfterReset === harness.colliderCount,
          resetAccepted: resetResult,
          attachmentAfterReset: attachedAfterReset,
          rerunStarted,
          rerunTerminalState: rerunState,
          rerunPlacement,
          rerunPass,
          rerunAttachment: rerunAttached,
          rerunBodyCount,
          baselineBodyCount: harness.bodyCount,
        };
        records.push(record);
        harness.simulation.dispose();
        expect(expectedMatch, `${attemptId}: unexpected terminal outcome ${observed}`).toBe(true);
        expect(
          falsePositivePlacement,
          `${attemptId}: faulted/aborted trial has successful placement credit`,
        ).toBe(false);
        expect(resetResult).toBe(true);
        expect(attachedAfterReset).toBe(false);
        expect(bodyCountAfterReset).toBe(harness.bodyCount);
        expect(colliderCountAfterReset).toBe(harness.colliderCount);
        expect(rerunPass, `${attemptId}: nominal rerun failed after reset`).toBe(true);
      }
    }
    expect(records).toHaveLength(FAULTS.length * REPLICATES);
    const label = process.env.SORTLAB_CAMPAIGN_LABEL ?? 'latest';
    await mkdir(RESULTS, { recursive: true });
    await writeFile(
      path.join(RESULTS, `faults-${label}.json`),
      `${JSON.stringify({ replicateCount: REPLICATES, faultClasses: FAULTS.map(({ id, expectedFault, injection }) => ({ id, expectedFault, injection })), records }, null, 2)}\n`,
    );
    const summary = Object.fromEntries(
      FAULTS.map((fault) => {
        const subset = records.filter(({ faultClass }) => faultClass === fault.id);
        return [
          fault.id,
          {
            trials: subset.length,
            expectedOutcome: fault.expectedFault,
            matched: subset.filter(({ expectedOutcomeMatched }) => expectedOutcomeMatched).length,
            falsePositivePlacements: subset.filter(
              ({ falsePositivePlacement }) => falsePositivePlacement,
            ).length,
            resetsClean: subset.filter(
              ({ attachmentAfterReset, resetBodyAndColliderCountsMatch }) =>
                !attachmentAfterReset && resetBodyAndColliderCountsMatch,
            ).length,
            nominalRerunsCompleted: subset.filter(({ rerunPass }) => rerunPass).length,
          },
        ];
      }),
    );
    await writeFile(
      path.join(RESULTS, `faults-${label}-summary.json`),
      `${JSON.stringify(summary, null, 2)}\n`,
    );
    console.info(`Fault campaign ${label}: ${JSON.stringify(summary)}`);
  }, 120_000);
});
