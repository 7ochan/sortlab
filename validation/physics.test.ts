import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/engineering/config';
import { PackagePhysicsSimulation, type PackageSnapshot } from '../src/engineering/packagePhysics';
import { classifyPlacement } from '../src/engineering/sortingController';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESULTS = path.join(ROOT, 'validation', 'results');
const DT = CONFIG.performance.fixedStepSeconds;

function snapshotAt(
  packageId: PackageSnapshot['id'],
  x: number,
  y: number,
  z: number,
  linearSpeed = 0,
): PackageSnapshot {
  const base = {
    id: packageId,
    position: { x, y, z, yaw: 0 },
    linearVelocity: { x: linearSpeed, y: 0, z: 0 },
    angularVelocity: 0,
    attached: false,
  } satisfies PackageSnapshot;
  return base;
}

describe('fixed-step Rapier, gripper, reset, and placement robustness', () => {
  it('compares repeated physics traces, attachment tracking, placement boundaries, and reset body counts', async () => {
    const first = await PackagePhysicsSimulation.create(CONFIG, 'M');
    const second = await PackagePhysicsSimulation.create(CONFIG, 'M');
    const bodyCount = first.bodyCount;
    const colliderCount = first.colliderCount;
    const traceA = [];
    const traceB = [];
    for (let i = 0; i < 120; i += 1) {
      traceA.push(first.stepFixed(1));
      traceB.push(second.stepFixed(1));
    }
    const deterministic = JSON.stringify(traceA) === JSON.stringify(traceB);
    expect(deterministic).toBe(true);

    const graspBounds = CONFIG.physics.grasp;
    const preGrasp = first.stepFixed(0)!;
    first.setTcp({ ...preGrasp.position });
    first.close();
    const grasp = first.attemptGrasp();
    expect(grasp.success).toBe(true);
    first.setTcp({
      x: preGrasp.position.x + 0.12,
      y: preGrasp.position.y - 0.04,
      z: preGrasp.position.z + 0.08,
      yaw: 0.2,
    });
    const carried = first.stepFixed(1)!;
    const carryPositionErrorM = Math.hypot(
      carried.position.x - (preGrasp.position.x + 0.12),
      carried.position.y - (preGrasp.position.y - 0.04),
      carried.position.z - (preGrasp.position.z + 0.08),
    );
    expect(carryPositionErrorM).toBeLessThan(0.002);
    const released = first.release();
    expect(released.success).toBe(true);
    expect(first.isAttached).toBe(false);

    const misaligned = await PackagePhysicsSimulation.create(CONFIG, 'S');
    const misalignedStart = misaligned.stepFixed(0)!;
    misaligned.setTcp({
      x: misalignedStart.position.x + graspBounds.positionToleranceM + 0.01,
      y: misalignedStart.position.y,
      z: misalignedStart.position.z,
      yaw: 0,
    });
    misaligned.close();
    const misalignedGrasp = misaligned.attemptGrasp();
    expect(misalignedGrasp.success).toBe(false);
    expect(misaligned.isAttached).toBe(false);

    const destination = CONFIG.cell.destinations.find(({ id }) => id === 'B2')!;
    const item = CONFIG.packages.find(({ id }) => id === 'M')!;
    const projectedHalfX =
      item.shape === 'cylinder'
        ? Math.min(item.dimensions.length, item.dimensions.width) / 2
        : item.dimensions.length / 2;
    const projectedHalfY =
      item.shape === 'cylinder'
        ? Math.min(item.dimensions.length, item.dimensions.width) / 2
        : item.dimensions.width / 2;
    const xRoom = destination.inside.x / 2 - projectedHalfX - 0.005;
    const yRoom = destination.inside.y / 2 - projectedHalfY - 0.005;
    const centerZMin = destination.floorZ + item.dimensions.height / 2 - 0.012;
    const centerZMax = destination.lipZ - item.dimensions.height / 2 - 0.01;
    const boundaryCases = {
      center: classifyPlacement(
        snapshotAt('M', destination.center.x, destination.center.y, (centerZMin + centerZMax) / 2),
      ),
      acceptedEdgeX: classifyPlacement(
        snapshotAt(
          'M',
          destination.center.x + xRoom - 1e-6,
          destination.center.y,
          (centerZMin + centerZMax) / 2,
        ),
      ),
      rejectedPastEdgeX: classifyPlacement(
        snapshotAt(
          'M',
          destination.center.x + xRoom + 1e-5,
          destination.center.y,
          (centerZMin + centerZMax) / 2,
        ),
      ),
      acceptedEdgeY: classifyPlacement(
        snapshotAt(
          'M',
          destination.center.x,
          destination.center.y + yRoom - 1e-6,
          (centerZMin + centerZMax) / 2,
        ),
      ),
      rejectedPastEdgeY: classifyPlacement(
        snapshotAt(
          'M',
          destination.center.x,
          destination.center.y + yRoom + 1e-5,
          (centerZMin + centerZMax) / 2,
        ),
      ),
      acceptedFloorTolerance: classifyPlacement(
        snapshotAt('M', destination.center.x, destination.center.y, centerZMin),
      ),
      rejectedBelowFloorTolerance: classifyPlacement(
        snapshotAt('M', destination.center.x, destination.center.y, centerZMin - 1e-7),
      ),
      acceptedLipTolerance: classifyPlacement(
        snapshotAt('M', destination.center.x, destination.center.y, centerZMax),
      ),
      rejectedAboveLipTolerance: classifyPlacement(
        snapshotAt('M', destination.center.x, destination.center.y, centerZMax + 1e-7),
      ),
      belowLinearSettlingLimit: classifyPlacement(
        snapshotAt(
          'M',
          destination.center.x,
          destination.center.y,
          (centerZMin + centerZMax) / 2,
          0.039999,
        ),
      ),
      atLinearSettlingLimit: classifyPlacement(
        snapshotAt(
          'M',
          destination.center.x,
          destination.center.y,
          (centerZMin + centerZMax) / 2,
          0.04,
        ),
      ),
      wrongBin: classifyPlacement(
        snapshotAt(
          'M',
          CONFIG.cell.destinations.find(({ id }) => id === 'B1')!.center.x,
          CONFIG.cell.destinations.find(({ id }) => id === 'B1')!.center.y,
          (centerZMin + centerZMax) / 2,
        ),
      ),
    };
    expect(boundaryCases.center.status).toBe('accepted');
    expect(boundaryCases.acceptedEdgeX.status).toBe('accepted');
    expect(boundaryCases.rejectedPastEdgeX.status).toBe('outside-bin');
    expect(boundaryCases.acceptedEdgeY.status).toBe('accepted');
    expect(boundaryCases.rejectedPastEdgeY.status).toBe('outside-bin');
    expect(boundaryCases.acceptedFloorTolerance.status).toBe('accepted');
    expect(boundaryCases.rejectedBelowFloorTolerance.status).toBe('outside-bin');
    expect(boundaryCases.acceptedLipTolerance.status).toBe('accepted');
    expect(boundaryCases.rejectedAboveLipTolerance.status).toBe('outside-bin');
    expect(boundaryCases.belowLinearSettlingLimit.status).toBe('accepted');
    expect(boundaryCases.atLinearSettlingLimit.status).toBe('settling');
    expect(boundaryCases.wrongBin.status).toBe('incorrect-bin');

    first.reset();
    const resetClean =
      !first.isAttached && first.bodyCount === bodyCount && first.colliderCount === colliderCount;
    expect(resetClean).toBe(true);
    const resetSnapshot = first.stepFixed(0)!;
    const repeated = await PackagePhysicsSimulation.create(CONFIG, 'M');
    const initialSnapshot = repeated.stepFixed(0)!;
    expect(JSON.stringify(resetSnapshot)).toBe(JSON.stringify(initialSnapshot));
    expect(repeated.bodyCount).toBe(bodyCount);
    expect(repeated.colliderCount).toBe(colliderCount);
    const measurements = {
      fixedStepSeconds: DT,
      repeatedTraceSteps: traceA.length,
      repeatedTraceEqual: deterministic,
      bodyCount,
      colliderCount,
      graspAlignment: {
        success: grasp.success,
        configuredPositionToleranceM: graspBounds.positionToleranceM,
        configuredYawToleranceRad: graspBounds.yawToleranceRad,
      },
      misalignedGraspRejected: !misalignedGrasp.success && !misaligned.isAttached,
      misalignmentDistanceM: graspBounds.positionToleranceM + 0.01,
      carryTrackingPositionErrorM: carryPositionErrorM,
      releaseDetached: released.success && !first.isAttached,
      placementBoundaryCases: boundaryCases,
      resetReinitializationEqual: JSON.stringify(resetSnapshot) === JSON.stringify(initialSnapshot),
      resetHasNoDuplicateBodiesOrColliders:
        resetClean && repeated.bodyCount === bodyCount && repeated.colliderCount === colliderCount,
      placementTimeoutSeconds: 8,
      placementSettleLinearMps: 0.04,
      placementSettleAngularRadps: 0.12,
    };
    await mkdir(RESULTS, { recursive: true });
    await writeFile(
      path.join(RESULTS, 'physics.json'),
      `${JSON.stringify(measurements, null, 2)}\n`,
    );
    first.dispose();
    second.dispose();
    repeated.dispose();
    misaligned.dispose();
    console.info(
      `Physics robustness: ${JSON.stringify({ deterministic, bodyCount, colliderCount, carryPositionErrorM, resetClean })}`,
    );
  });
});
