import type { SortLabConfig } from './types';
import { validateConfig } from './validation';

/** Values below are the approved provisional engineering baseline, in SI units. */
const sourceConfig = {
  schemaVersion: 1,
  units: { length: 'm', mass: 'kg', angle: 'rad', force: 'N' },
  robot: {
    mechanism: 'SCARA',
    links: { l1: 0.3, l2: 0.25 },
    limits: {
      j1: { min: (-150 * Math.PI) / 180, max: (150 * Math.PI) / 180, unit: 'rad' },
      j2: { min: (-160 * Math.PI) / 180, max: (160 * Math.PI) / 180, unit: 'rad' },
      j3: { min: 0.3, max: 0.58, unit: 'm' },
      j4: { min: -Math.PI, max: Math.PI, unit: 'rad' },
    },
    home: { j1: 0, j2: 0, j3: 0.56, j4: 0 },
    speedLimits: {
      j1: (90 * Math.PI) / 180,
      j2: (90 * Math.PI) / 180,
      j3: 0.25,
      j4: (120 * Math.PI) / 180,
    },
    accelerationLimits: {
      j1: (180 * Math.PI) / 180,
      j2: (180 * Math.PI) / 180,
      j3: 0.5,
      j4: (240 * Math.PI) / 180,
    },
    gripper: {
      opening: { min: 0.03, max: 0.16 },
      virtualJawCapacityN: 25,
      assumedFrictionCoefficient: 0.5,
      safetyFactor: 2,
      gravityMps2: 9.81,
      verticalAccelerationMps2: 0.3,
    },
  },
  cell: {
    tableZ: 0.25,
    baseRadius: 0.08,
    conveyor: { center: { x: 0.34, y: 0 }, size: { x: 0.45, y: 0.2 }, supportZ: 0.35 },
    pickup: { center: { x: 0.3, y: 0 }, packageSupportZ: 0.35 },
    transferTcpZ: 0.54,
    destinations: [
      {
        id: 'B1',
        center: { x: -0.24, y: 0.25 },
        outside: { x: 0.24, y: 0.22 },
        inside: { x: 0.2, y: 0.18 },
        floorZ: 0.3,
        lipZ: 0.46,
      },
      {
        id: 'B2',
        center: { x: -0.24, y: 0 },
        outside: { x: 0.24, y: 0.22 },
        inside: { x: 0.2, y: 0.18 },
        floorZ: 0.3,
        lipZ: 0.46,
      },
      {
        id: 'B3',
        center: { x: -0.24, y: -0.25 },
        outside: { x: 0.24, y: 0.22 },
        inside: { x: 0.2, y: 0.18 },
        floorZ: 0.3,
        lipZ: 0.46,
      },
    ],
  },
  packages: [
    {
      id: 'S',
      name: 'Small',
      dimensions: { length: 0.08, width: 0.06, height: 0.04 },
      massKg: 0.1,
      destination: 'B1',
      displayColor: '#e9a34c',
    },
    {
      id: 'M',
      name: 'Medium',
      dimensions: { length: 0.12, width: 0.09, height: 0.06 },
      massKg: 0.3,
      destination: 'B2',
      displayColor: '#59ad9a',
    },
    {
      id: 'L',
      name: 'Large',
      dimensions: { length: 0.16, width: 0.12, height: 0.08 },
      massKg: 0.6,
      destination: 'B3',
      displayColor: '#738fd2',
    },
  ],
  performance: { targetMedianCycleSeconds: 12, fixedStepSeconds: 1 / 60 },
} satisfies SortLabConfig;

/** Validation runs once at the application boundary; invalid inputs throw actionable errors. */
export const CONFIG: SortLabConfig = validateConfig(sourceConfig);
