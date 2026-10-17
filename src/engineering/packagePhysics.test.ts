import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { planDestinationRoute } from './routes';
import { PackagePhysicsSimulation } from './packagePhysics';

const worlds: PackagePhysicsSimulation[] = [];
async function create(id: 'S' | 'M' | 'L' = 'S') {
  const simulation = await PackagePhysicsSimulation.create(CONFIG, id);
  worlds.push(simulation);
  return simulation;
}

afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

describe('Rapier package dynamics and gripper state', () => {
  it('initializes one fixed-step world, advances deterministically, and reset does not duplicate bodies', async () => {
    const sim = await create();
    const counts = [sim.bodyCount, sim.colliderCount];
    expect(sim.fixedSteps).toBe(0);
    const a = sim.stepFixed(4);
    expect(sim.fixedSteps).toBe(4);
    sim.reset();
    const b = sim.stepFixed(4);
    expect(b.position).toEqual(a.position);
    expect([sim.bodyCount, sim.colliderCount]).toEqual(counts);
    expect(sim.isAttached).toBe(false);
    expect(sim.isOpen).toBe(true);
  });

  it.each(['S', 'M', 'L'] as const)(
    'creates a finite-mass %s package with its configured proxy',
    async (id) => {
      const sim = await create(id);
      expect(sim.packageClass.id).toBe(id);
      expect(sim.packageClass.shape).toBe(
        ({ S: 'carton', M: 'cylinder', L: 'pouch' } as const)[id],
      );
      expect(sim.stepFixed(1).position.z).toBeGreaterThan(0);
      expect(sim.colliderCount).toBeGreaterThan(0);
    },
  );

  it('grasps only when closed, aligned, in contact, and within the virtual capacity', async () => {
    const sim = await create();
    sim.stepFixed(2);
    expect(sim.attemptGrasp()).toEqual({
      success: false,
      reason: 'Close the gripper before attempting a grasp.',
    });
    sim.close();
    expect(sim.attemptGrasp().success).toBe(true);
    expect(sim.isAttached).toBe(true);
  });

  it.each(['S', 'M', 'L'] as const)('accepts a correctly aligned %s package', async (id) => {
    const sim = await create(id);
    sim.stepFixed(2);
    sim.close();
    expect(sim.attemptGrasp().success).toBe(true);
  });

  it('rejects distant and yaw-misaligned packages without attaching them', async () => {
    const sim = await create();
    sim.close();
    sim.setTcp({ x: 0, y: 0, z: 0.37, yaw: 0 });
    expect(sim.attemptGrasp().reason).toMatch(/from the TCP/);
    sim.setTcp({ x: 0.3, y: 0, z: 0.37, yaw: Math.PI / 2 });
    expect(sim.attemptGrasp().reason).toMatch(/yaw error/);
    expect(sim.isAttached).toBe(false);
  });

  it('carries the captured offset with TCP motion, then releases dynamically', async () => {
    const sim = await create();
    sim.stepFixed(2);
    sim.close();
    expect(sim.attemptGrasp().success).toBe(true);
    sim.setTcp({ x: 0.3, y: 0, z: 0.48, yaw: 0 });
    const carried = sim.stepFixed(4);
    expect(carried.attached).toBe(true);
    expect(carried.position.x).toBeCloseTo(0.3, 4);
    expect(Math.abs(carried.position.z - 0.48)).toBeLessThan(1e-4);
    expect(sim.release().success).toBe(true);
    expect(sim.stepFixed(1).attached).toBe(false);
    expect(sim.stepFixed(12).position.z).toBeLessThan(0.48);
  });

  it('keeps repeated select, reset, open and close cycles at a stable body/collider count', async () => {
    const sim = await create('S');
    const counts = [sim.bodyCount, sim.colliderCount];
    for (let i = 0; i < 3; i += 1) {
      sim.selectPackage('M');
      sim.close();
      sim.open();
      sim.reset();
      sim.selectPackage('L');
      sim.reset();
    }
    expect([sim.bodyCount, sim.colliderCount]).toEqual(counts);
  });

  it('completes repeated grasp/release/reset cycles without stale joints', async () => {
    const sim = await create();
    const counts = [sim.bodyCount, sim.colliderCount];
    for (let i = 0; i < 4; i += 1) {
      sim.stepFixed(2);
      sim.close();
      expect(sim.attemptGrasp().success).toBe(true);
      expect(sim.release().success).toBe(true);
      sim.reset();
    }
    expect(sim.isAttached).toBe(false);
    expect([sim.bodyCount, sim.colliderCount]).toEqual(counts);
  });

  it('retains route preview definitions and rejects manual TCP values that are non-finite', async () => {
    const sim = await create();
    expect(
      ['B1', 'B2', 'B3'].map(
        (id) => planDestinationRoute(id as 'B1' | 'B2' | 'B3', CONFIG).destinationId,
      ),
    ).toEqual(['B1', 'B2', 'B3']);
    expect(() => sim.setTcp({ x: Number.NaN, y: 0, z: 0.37, yaw: 0 })).toThrow(/finite/);
  });
});
