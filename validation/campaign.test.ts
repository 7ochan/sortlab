import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/engineering/config';
import { PackagePhysicsSimulation, type PackageSnapshot } from '../src/engineering/packagePhysics';
import {
  SortingController,
  classifyPlacement,
  type ControllerEvent,
} from '../src/engineering/sortingController';
import { planDestinationRoute } from '../src/engineering/routes';
import { forwardKinematics } from '../src/engineering/kinematics';
import type { JointState, PackageClass } from '../src/engineering/types';

type AttemptRecord = Readonly<{
  attemptId: string;
  packageId: PackageClass['id'];
  targetBin: PackageClass['destination'];
  startSimulationTimeSeconds: number;
  endSimulationTimeSeconds: number;
  physicsElapsedSeconds: number;
  controllerElapsedSeconds: number;
  physicsStepCount: number;
  terminalState: string;
  faultType: string | null;
  faultReason: string | null;
  placementResult: ReturnType<typeof classifyPlacement> | null;
  controllerPlacementResult: SortingController['snapshot']['placementResult'];
  finalPackageSnapshot: PackageSnapshot;
  graspAttempts: number;
  firstGraspSuccessful: boolean;
  finalGraspFailures: number;
  route: Readonly<{
    durationSeconds: number;
    sampleCount: number;
    waypointIds: readonly string[];
    endpoint: Readonly<{ x: number; y: number; z: number; yaw: number }>;
  }>;
  controllerEvents: readonly ControllerEvent[];
  bodyCount: number;
  colliderCount: number;
}>;

type AttemptAccumulator = { cumulativeSeconds: number; records: AttemptRecord[] };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESULTS = path.join(ROOT, 'validation', 'results');
const DT = CONFIG.performance.fixedStepSeconds;
const PACKAGE_ORDER = Array.from({ length: 33 }, () => ['S', 'M', 'L'] as const)
  .flat()
  .concat('S');
const assertUnique = (ids: readonly string[]) => {
  if (new Set(ids).size !== ids.length) throw new Error('Attempt IDs are duplicated.');
};

async function runNominalAttempt(
  attemptNumber: number,
  packageId: PackageClass['id'],
  acc: AttemptAccumulator,
): Promise<AttemptRecord> {
  const simulation = await PackagePhysicsSimulation.create(CONFIG, packageId);
  const bodyCount = simulation.bodyCount;
  const colliderCount = simulation.colliderCount;
  let joints: JointState = planDestinationRoute(
    CONFIG.packages.find(({ id }) => id === packageId)!.destination,
    CONFIG,
  ).trajectory.samples[0]!.position;
  const controller = new SortingController({
    setJoints: (next) => {
      joints = next;
      simulation.setTcp(forwardKinematics(next, CONFIG));
    },
    getJoints: () => joints,
    getSnapshot: () => simulation.stepFixed(0),
    open: () => simulation.open(),
    close: () => simulation.close(),
    attemptGrasp: () => simulation.attemptGrasp(),
    release: () => simulation.release(),
    resetPackage: () => simulation.reset(),
    stepPhysics: () => simulation.stepFixed(1),
    getPhysicsStepCount: () => simulation.fixedSteps,
  });
  const item = CONFIG.packages.find(({ id }) => id === packageId)!;
  const route = planDestinationRoute(item.destination, CONFIG);
  const startSimulationTimeSeconds = acc.cumulativeSeconds;
  if (!controller.start(packageId)) throw new Error(`Attempt ${attemptNumber} did not start.`);
  let ticks = 0;
  while (controller.snapshot.active && ticks < 10_000) {
    controller.tick(DT);
    ticks += 1;
  }
  if (controller.snapshot.active)
    throw new Error(
      `Attempt ${attemptNumber} did not reach a terminal state after ${ticks} ticks.`,
    );
  if (!['completed', 'recoverable-fault', 'aborted'].includes(controller.snapshot.state))
    throw new Error(
      `Attempt ${attemptNumber} has invalid terminal state ${controller.snapshot.state}.`,
    );
  const finalPackageSnapshot = simulation.stepFixed(0);
  const actualPlacement = classifyPlacement(finalPackageSnapshot, CONFIG);
  const events = controller.snapshot.events;
  const graspEvents = events.filter(({ kind }) => kind === 'grasp');
  const successful = graspEvents.filter(({ message }) => message.includes('Successful'));
  const endSimulationTimeSeconds = startSimulationTimeSeconds + simulation.fixedSteps * DT;
  const record: AttemptRecord = {
    attemptId: `nominal-${String(attemptNumber).padStart(4, '0')}`,
    packageId,
    targetBin: item.destination,
    startSimulationTimeSeconds,
    endSimulationTimeSeconds,
    physicsElapsedSeconds: simulation.fixedSteps * DT,
    controllerElapsedSeconds: controller.snapshot.elapsedSeconds,
    physicsStepCount: simulation.fixedSteps,
    terminalState: controller.snapshot.state,
    faultType: controller.snapshot.fault?.type ?? null,
    faultReason: controller.snapshot.fault?.message ?? null,
    placementResult: actualPlacement,
    controllerPlacementResult: controller.snapshot.placementResult,
    finalPackageSnapshot,
    graspAttempts: graspEvents.length,
    firstGraspSuccessful: successful.some(({ message }) => message.includes('attempt 1/2')),
    finalGraspFailures: controller.snapshot.fault?.type === 'failed-grasp' ? 1 : 0,
    route: {
      durationSeconds: route.trajectory.durationSeconds,
      sampleCount: route.trajectory.samples.length,
      waypointIds: route.waypoints.map(({ id }) => id),
      endpoint: route.trajectory.samples.at(-1)!.pose,
    },
    controllerEvents: events,
    bodyCount: simulation.bodyCount,
    colliderCount: simulation.colliderCount,
    initialBodyCount: bodyCount,
    initialColliderCount: colliderCount,
    physicsBodyCountsStable:
      simulation.bodyCount === bodyCount && simulation.colliderCount === colliderCount,
  };
  acc.cumulativeSeconds = endSimulationTimeSeconds;
  simulation.dispose();
  return record;
}

function summarize(records: readonly AttemptRecord[]) {
  const terminal = records.filter(({ terminalState }) =>
    ['completed', 'recoverable-fault', 'aborted'].includes(terminalState),
  );
  const completed = records.filter(
    ({ terminalState, controllerPlacementResult, placementResult }) =>
      terminalState === 'completed' &&
      controllerPlacementResult?.status === 'accepted' &&
      placementResult?.status === 'accepted',
  );
  const durations = completed
    .map(({ controllerElapsedSeconds }) => controllerElapsedSeconds)
    .sort((a, b) => a - b);
  const mean = durations.length
    ? durations.reduce((sum, value) => sum + value, 0) / durations.length
    : null;
  const median = durations.length
    ? durations.length % 2
      ? durations[(durations.length - 1) / 2]!
      : (durations[durations.length / 2 - 1]! + durations[durations.length / 2]!) / 2
    : null;
  const grouped = (key: 'packageId' | 'targetBin') =>
    Object.fromEntries(
      (key === 'packageId' ? ['S', 'M', 'L'] : ['B1', 'B2', 'B3']).map((value) => {
        const subset = records.filter((record) => record[key] === value);
        return [
          value,
          {
            attempts: subset.length,
            completed: subset.filter((record) => completed.includes(record)).length,
            failures: subset.filter((record) => record.terminalState === 'recoverable-fault')
              .length,
            aborted: subset.filter((record) => record.terminalState === 'aborted').length,
          },
        ];
      }),
    );
  const graspEvents = records
    .flatMap(({ controllerEvents }) => controllerEvents)
    .filter(({ kind }) => kind === 'grasp');
  return {
    attemptCount: records.length,
    terminalOutcomes: terminal.length,
    completedCycles: completed.length,
    successfulPlacements: completed.length,
    failedCycles: records.filter(({ terminalState }) => terminalState === 'recoverable-fault')
      .length,
    abortedCycles: records.filter(({ terminalState }) => terminalState === 'aborted').length,
    successRate: terminal.length ? completed.length / terminal.length : null,
    target: 0.95,
    targetMet: terminal.length === records.length && completed.length / records.length >= 0.95,
    cycleDurationSeconds: {
      mean,
      median,
      min: durations.length ? durations[0] : null,
      max: durations.length ? durations.at(-1)! : null,
      completedAttemptCount: durations.length,
    },
    grasp: {
      attempts: graspEvents.length,
      firstAttemptSuccesses: graspEvents.filter(
        ({ message }) => message.includes('attempt 1/2') && message.includes('Successful'),
      ).length,
      retries: graspEvents.filter(({ message }) => message.includes('attempt 2/2')).length,
      finalFailures: records.reduce((sum, record) => sum + record.finalGraspFailures, 0),
    },
    placementFailuresByReason: Object.fromEntries(
      ['incorrect-bin', 'outside-bin', 'placement-timeout'].map((reason) => [
        reason,
        records.filter(({ faultType }) => faultType === reason).length,
      ]),
    ),
    routePlanningRejections: records.filter(({ faultType }) => faultType === 'unreachable-route')
      .length,
    byCategory: grouped('packageId'),
    byDestination: grouped('targetBin'),
    maxPhysicsControllerTimeDifferenceSeconds: Math.max(
      ...records.map(({ physicsElapsedSeconds, controllerElapsedSeconds }) =>
        Math.abs(physicsElapsedSeconds - controllerElapsedSeconds),
      ),
    ),
    placementVelocityBounds: {
      maxLinearVelocityMps: Math.max(
        ...records.map(({ finalPackageSnapshot: { linearVelocity } }) =>
          Math.hypot(linearVelocity.x, linearVelocity.y, linearVelocity.z),
        ),
      ),
      maxAngularVelocityRadps: Math.max(
        ...records.map(({ finalPackageSnapshot }) => finalPackageSnapshot.angularVelocity),
      ),
    },
  };
}

describe('production Rapier autonomous validation campaign', () => {
  it('runs a balanced 100-attempt nominal campaign and saves raw results plus summary', async () => {
    expect(PACKAGE_ORDER).toHaveLength(100);
    expect(PACKAGE_ORDER.filter((id) => id === 'S')).toHaveLength(34);
    expect(PACKAGE_ORDER.filter((id) => id === 'M')).toHaveLength(33);
    expect(PACKAGE_ORDER.filter((id) => id === 'L')).toHaveLength(33);
    const acc: AttemptAccumulator = { cumulativeSeconds: 0, records: [] };
    for (const [index, packageId] of PACKAGE_ORDER.entries()) {
      acc.records.push(await runNominalAttempt(index + 1, packageId, acc));
    }
    assertUnique(acc.records.map(({ attemptId }) => attemptId));
    if (acc.records.length !== 100)
      throw new Error(`Skipped or duplicated attempts: ${acc.records.length}.`);
    if (
      acc.records.some(
        ({ terminalState }) =>
          !['completed', 'recoverable-fault', 'aborted'].includes(terminalState),
      )
    )
      throw new Error('A campaign attempt has no terminal outcome.');
    if (acc.records.some(({ physicsBodyCountsStable }) => !physicsBodyCountsStable))
      throw new Error('A campaign attempt leaked or duplicated a physics body/collider.');
    const summary = summarize(acc.records);
    const label = process.env.SORTLAB_CAMPAIGN_LABEL ?? 'latest';
    await mkdir(RESULTS, { recursive: true });
    await writeFile(
      path.join(RESULTS, `nominal-${label}.json`),
      `${JSON.stringify({ campaignId: 'nominal-100-v1', label, fixedStepSeconds: DT, distribution: { S: 34, M: 33, L: 33 }, records: acc.records }, null, 2)}\n`,
    );
    await writeFile(
      path.join(RESULTS, `nominal-${label}-summary.json`),
      `${JSON.stringify(summary, null, 2)}\n`,
    );
    console.info(`Nominal campaign ${label}: ${JSON.stringify(summary)}`);
    expect(acc.records).toHaveLength(100);
    expect(summary.terminalOutcomes).toBe(100);
    expect(
      acc.records.every(({ bodyCount, colliderCount }) => bodyCount > 0 && colliderCount > 0),
    ).toBe(true);
  }, 120_000);
});
