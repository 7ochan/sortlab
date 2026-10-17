import type { JointState, SortLabConfig } from './types';

function finitePositive(value: unknown, label: string, allowZero = false): asserts value is number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    (allowZero ? value < 0 : value <= 0)
  ) {
    throw new Error(
      `${label} must be a finite ${allowZero ? 'non-negative' : 'positive'} number in SI units.`,
    );
  }
}

function finite(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`${label} must be a finite number in SI units.`);
}

function finiteVector2(value: Readonly<{ x: number; y: number }>, label: string): void {
  finite(value.x, `${label}.x`);
  finite(value.y, `${label}.y`);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function requireObjectArray(value: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value.map((entry, index) => requireRecord(entry, `${label}[${index}]`));
}

function assertConfigStructure(value: unknown): asserts value is SortLabConfig {
  const root = requireRecord(value, 'configuration');
  requireRecord(root.units, 'units');
  const robot = requireRecord(root.robot, 'robot');
  if (robot.mechanism !== 'SCARA') throw new Error('robot.mechanism must be SCARA.');
  requireRecord(robot.links, 'robot.links');
  const limits = requireRecord(robot.limits, 'robot.limits');
  for (const key of ['j1', 'j2', 'j3', 'j4']) requireRecord(limits[key], `robot.limits.${key}`);
  requireRecord(robot.home, 'robot.home');
  requireRecord(robot.speedLimits, 'robot.speedLimits');
  requireRecord(robot.accelerationLimits, 'robot.accelerationLimits');
  const gripper = requireRecord(robot.gripper, 'robot.gripper');
  requireRecord(gripper.opening, 'robot.gripper.opening');
  requireRecord(gripper.pad, 'robot.gripper.pad');
  requireRecord(gripper.palm, 'robot.gripper.palm');
  const cell = requireRecord(root.cell, 'cell');
  const conveyor = requireRecord(cell.conveyor, 'cell.conveyor');
  requireRecord(conveyor.center, 'cell.conveyor.center');
  requireRecord(conveyor.size, 'cell.conveyor.size');
  const pickup = requireRecord(cell.pickup, 'cell.pickup');
  requireRecord(pickup.center, 'cell.pickup.center');
  const destinations = requireObjectArray(cell.destinations, 'cell.destinations');
  for (const [index, dest] of destinations.entries()) {
    const label = `cell.destinations[${index}]`;
    requireRecord(dest.center, `${label}.center`);
    requireRecord(dest.outside, `${label}.outside`);
    requireRecord(dest.inside, `${label}.inside`);
  }
  const packages = requireObjectArray(root.packages, 'packages');
  for (const [index, item] of packages.entries())
    requireRecord(item.dimensions, `packages[${index}].dimensions`);
  requireRecord(root.performance, 'performance');
  const physics = requireRecord(root.physics, 'physics');
  requireRecord(physics.collisionGroups, 'physics.collisionGroups');
  requireRecord(physics.grasp, 'physics.grasp');
}

export function validateConfig(rawInput: unknown): SortLabConfig {
  assertConfigStructure(rawInput);
  const input = rawInput;
  if (input.schemaVersion !== 1)
    throw new Error('Unsupported configuration schemaVersion; expected 1.');
  if (
    input.units.length !== 'm' ||
    input.units.mass !== 'kg' ||
    input.units.angle !== 'rad' ||
    input.units.force !== 'N'
  ) {
    throw new Error('Configuration units must be m, kg, rad, and N.');
  }
  finitePositive(input.robot.links.l1, 'robot.links.l1');
  finitePositive(input.robot.links.l2, 'robot.links.l2');
  for (const key of ['j1', 'j2', 'j3', 'j4'] as const) {
    const limit = input.robot.limits[key];
    if (!Number.isFinite(limit.min) || !Number.isFinite(limit.max) || limit.min >= limit.max) {
      throw new Error(`robot.limits.${key} must have finite min < max.`);
    }
    const expectedUnit = key === 'j3' ? 'm' : 'rad';
    if (limit.unit !== expectedUnit)
      throw new Error(`robot.limits.${key}.unit must be ${expectedUnit}.`);
    finite(input.robot.home[key], `robot.home.${key}`);
    if (input.robot.home[key] < limit.min || input.robot.home[key] > limit.max) {
      throw new Error(`robot.home.${key} is outside its configured joint limits.`);
    }
  }
  finitePositive(input.robot.gripper.opening.min, 'robot.gripper.opening.min');
  finitePositive(input.robot.gripper.opening.max, 'robot.gripper.opening.max');
  if (input.robot.gripper.opening.min >= input.robot.gripper.opening.max)
    throw new Error('Gripper opening min must be below max.');
  finitePositive(input.robot.gripper.virtualJawCapacityN, 'robot.gripper.virtualJawCapacityN');
  for (const key of ['width', 'length', 'contactHeight'] as const)
    finitePositive(input.robot.gripper.pad[key], `robot.gripper.pad.${key}`);
  for (const key of ['x', 'y', 'z', 'offsetAboveTcp'] as const)
    finitePositive(input.robot.gripper.palm[key], `robot.gripper.palm.${key}`);
  finitePositive(
    input.robot.gripper.assumedFrictionCoefficient,
    'robot.gripper.assumedFrictionCoefficient',
  );
  if (input.robot.gripper.assumedFrictionCoefficient > 1)
    throw new Error('robot.gripper.assumedFrictionCoefficient must be at most 1.');
  finitePositive(input.robot.gripper.safetyFactor, 'robot.gripper.safetyFactor');
  finitePositive(input.robot.gripper.gravityMps2, 'robot.gripper.gravityMps2');
  finitePositive(
    input.robot.gripper.verticalAccelerationMps2,
    'robot.gripper.verticalAccelerationMps2',
    true,
  );
  for (const key of ['j1', 'j2', 'j3', 'j4'] as const) {
    finitePositive(input.robot.speedLimits[key], `robot.speedLimits.${key}`);
    finitePositive(input.robot.accelerationLimits[key], `robot.accelerationLimits.${key}`);
  }
  finitePositive(input.cell.tableZ, 'cell.tableZ', true);
  finitePositive(input.cell.baseRadius, 'cell.baseRadius');
  finitePositive(input.cell.transferTcpZ, 'cell.transferTcpZ');
  if (
    input.cell.transferTcpZ < input.robot.limits.j3.min ||
    input.cell.transferTcpZ > input.robot.limits.j3.max
  )
    throw new Error('cell.transferTcpZ must lie within the J3 world-Z limits.');
  finitePositive(input.cell.conveyor.size.x, 'cell.conveyor.size.x');
  finitePositive(input.cell.conveyor.size.y, 'cell.conveyor.size.y');
  finiteVector2(input.cell.conveyor.center, 'cell.conveyor.center');
  finitePositive(input.cell.conveyor.supportZ, 'cell.conveyor.supportZ');
  finiteVector2(input.cell.pickup.center, 'cell.pickup.center');
  finitePositive(input.cell.pickup.packageSupportZ, 'cell.pickup.packageSupportZ');
  const destinationIds = input.cell.destinations.map(({ id }) => id);
  if (
    destinationIds.length !== 3 ||
    new Set(destinationIds).size !== 3 ||
    !['B1', 'B2', 'B3'].every((id) => destinationIds.includes(id as 'B1' | 'B2' | 'B3'))
  ) {
    throw new Error('cell.destinations must define each of B1, B2, and B3 exactly once.');
  }
  for (const dest of input.cell.destinations) {
    finiteVector2(dest.center, `${dest.id}.center`);
    finitePositive(dest.outside.x, `${dest.id}.outside.x`);
    finitePositive(dest.outside.y, `${dest.id}.outside.y`);
    finitePositive(dest.inside.x, `${dest.id}.inside.x`);
    finitePositive(dest.inside.y, `${dest.id}.inside.y`);
    if (dest.inside.x > dest.outside.x || dest.inside.y > dest.outside.y)
      throw new Error(`${dest.id} inside dimensions must fit within outside dimensions.`);
    finitePositive(dest.floorZ, `${dest.id}.floorZ`, true);
    finitePositive(dest.lipZ, `${dest.id}.lipZ`);
    if (dest.floorZ >= dest.lipZ) throw new Error(`${dest.id} floorZ must be below lipZ.`);
  }
  const expectedRoutes = { S: 'B1', M: 'B2', L: 'B3' } as const;
  if (
    input.packages.length !== 3 ||
    new Set(input.packages.map(({ id }) => id)).size !== 3 ||
    !(['S', 'M', 'L'] as const).every((id) => input.packages.some((item) => item.id === id))
  )
    throw new Error('Exactly package classes S, M, and L are required.');
  for (const item of input.packages) {
    if (typeof item.name !== 'string' || item.name.length === 0)
      throw new Error(`${item.id}.name must be a non-empty string.`);
    finitePositive(item.dimensions.length, `${item.id}.dimensions.length`);
    finitePositive(item.dimensions.width, `${item.id}.dimensions.width`);
    finitePositive(item.dimensions.height, `${item.id}.dimensions.height`);
    finitePositive(item.massKg, `${item.id}.massKg`);
    if (!['carton', 'cylinder', 'pouch'].includes(item.shape))
      throw new Error(`${item.id}.shape must be carton, cylinder, or pouch.`);
    if (typeof item.displayColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(item.displayColor))
      throw new Error(`${item.id}.displayColor must be a six-digit hex color.`);
    if (item.destination !== expectedRoutes[item.id])
      throw new Error(
        `${item.id} must route to ${expectedRoutes[item.id]} under the approved baseline.`,
      );
    if (!input.cell.destinations.some(({ id }) => id === item.destination))
      throw new Error(`${item.id} references unknown destination ${item.destination}.`);
  }
  finitePositive(
    input.performance.targetMedianCycleSeconds,
    'performance.targetMedianCycleSeconds',
  );
  finitePositive(input.performance.fixedStepSeconds, 'performance.fixedStepSeconds');
  finitePositive(input.physics.gravityMps2, 'physics.gravityMps2');
  finitePositive(input.physics.packageFriction, 'physics.packageFriction', true);
  finitePositive(input.physics.staticFriction, 'physics.staticFriction', true);
  finitePositive(input.physics.packageRestitution, 'physics.packageRestitution', true);
  if (input.physics.packageRestitution > 1)
    throw new Error('physics.packageRestitution must be at most 1.');
  for (const [name, mask] of Object.entries(input.physics.collisionGroups)) {
    if (!Number.isInteger(mask) || mask < 1 || mask > 0xffff)
      throw new Error(`physics.collisionGroups.${name} must be an integer 16-bit group mask.`);
  }
  finitePositive(input.physics.grasp.positionToleranceM, 'physics.grasp.positionToleranceM');
  finitePositive(input.physics.grasp.yawToleranceRad, 'physics.grasp.yawToleranceRad');
  finitePositive(input.physics.grasp.padContactEpsilonM, 'physics.grasp.padContactEpsilonM');
  return input;
}

export function validateJointState(state: JointState, config: SortLabConfig): void {
  if (state === null || typeof state !== 'object' || Array.isArray(state))
    throw new Error('Joint state must be an object containing finite j1, j2, j3, and j4 values.');
  for (const key of ['j1', 'j2', 'j3', 'j4'] as const) {
    const value: unknown = state[key];
    if (typeof value !== 'number' || !Number.isFinite(value))
      throw new Error(`Joint ${key} must be a finite number.`);
    const { min, max } = config.robot.limits[key];
    if (value < min || value > max)
      throw new Error(
        `Joint ${key}=${value} is outside [${min}, ${max}] ${key === 'j3' ? 'm' : 'rad'}.`,
      );
  }
}
