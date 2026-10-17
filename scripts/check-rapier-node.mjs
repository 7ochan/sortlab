import RAPIER from '@dimforge/rapier3d-deterministic-compat';

await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
world.timestep = 1 / 60;
world.step();
world.free();
console.log(`Rapier ${RAPIER.version()} initialized; one empty world step completed at 1/60 s.`);
