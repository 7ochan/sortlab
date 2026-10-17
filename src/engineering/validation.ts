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

export function validateConfig(input: SortLabConfig): SortLabConfig {
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
  if (input.packages.length !== 3 || new Set(input.packages.map(({ id }) => id)).size !== 3)
    throw new Error('Exactly three uniquely identified package classes are required.');
  for (const item of input.packages) {
    finitePositive(item.dimensions.length, `${item.id}.dimensions.length`);
    finitePositive(item.dimensions.width, `${item.id}.dimensions.width`);
    finitePositive(item.dimensions.height, `${item.id}.dimensions.height`);
    finitePositive(item.massKg, `${item.id}.massKg`);
    if (!/^#[0-9a-f]{6}$/i.test(item.displayColor))
      throw new Error(`${item.id}.displayColor must be a six-digit hex color.`);
    if (!input.cell.destinations.some(({ id }) => id === item.destination))
      throw new Error(`${item.id} references unknown destination ${item.destination}.`);
  }
  finitePositive(
    input.performance.targetMedianCycleSeconds,
    'performance.targetMedianCycleSeconds',
  );
  finitePositive(input.performance.fixedStepSeconds, 'performance.fixedStepSeconds');
  return input;
}

export function validateJointState(state: JointState, config: SortLabConfig): void {
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
