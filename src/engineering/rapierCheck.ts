/** Bounded Phase 1 package import/WASM initialization smoke check only. */
export async function checkRapierInitialization(): Promise<string> {
  const { default: RAPIER } = await import('@dimforge/rapier3d-deterministic-compat');
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  world.timestep = 1 / 60;
  world.step();
  world.free();
  return `Rapier ${RAPIER.version()} initialized and stepped one empty 1/60 s world tick.`;
}
