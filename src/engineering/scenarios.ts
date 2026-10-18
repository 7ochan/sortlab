import { CONFIG } from './config';
import { planDestinationRoute } from './routes';
import type { ControllerScenarioHooks, ControllerSnapshot, FaultType } from './sortingController';
import type { PackageClass, SortLabConfig } from './types';

export type ScenarioId =
  | 'nominal-s'
  | 'nominal-m'
  | 'nominal-l'
  | 'unreachable-route'
  | 'grasp-failure'
  | 'placement-timeout';
export type ScenarioExpectedOutcome = Readonly<{
  state: 'completed' | 'recoverable-fault';
  fault?: FaultType;
}>;
export type SortingScenario = Readonly<{
  id: ScenarioId;
  name: string;
  description: string;
  packageId: PackageClass['id'];
  expected: ScenarioExpectedOutcome;
  hooks?: ControllerScenarioHooks;
}>;

const rejectRoute = (): never => {
  throw new Error('Scenario injection: target route rejected as unreachable.');
};

export const SCENARIOS: readonly SortingScenario[] = [
  {
    id: 'nominal-s',
    name: 'Nominal S → B1',
    description: 'Sort the small package to its configured bin.',
    packageId: 'S',
    expected: { state: 'completed' },
  },
  {
    id: 'nominal-m',
    name: 'Nominal M → B2',
    description: 'Sort the medium package to its configured bin.',
    packageId: 'M',
    expected: { state: 'completed' },
  },
  {
    id: 'nominal-l',
    name: 'Nominal L → B3',
    description: 'Sort the large package to its configured bin.',
    packageId: 'L',
    expected: { state: 'completed' },
  },
  {
    id: 'unreachable-route',
    name: 'Unreachable route rejection',
    description: 'Inject a deterministic route-planning rejection and confirm motion never starts.',
    packageId: 'S',
    expected: { state: 'recoverable-fault', fault: 'unreachable-route' },
    hooks: { planRoute: rejectRoute },
  },
  {
    id: 'grasp-failure',
    name: 'Bounded grasp failure',
    description: 'Inject two failed grasp responses to exercise the controller retry limit.',
    packageId: 'M',
    expected: { state: 'recoverable-fault', fault: 'failed-grasp' },
    hooks: {
      attemptGrasp: () => ({
        success: false,
        reason: 'Scenario injection: deterministic grasp miss.',
      }),
    },
  },
  {
    id: 'placement-timeout',
    name: 'Placement verification timeout',
    description: 'Keep placement verification unsettled until its bounded timeout is reached.',
    packageId: 'L',
    expected: { state: 'recoverable-fault', fault: 'placement-timeout' },
    hooks: {
      classifyPlacement: () => ({
        status: 'settling',
        binId: null,
        message: 'Scenario injection: placement remains unsettled.',
      }),
    },
  },
];

export function scenarioById(id: ScenarioId): SortingScenario {
  const scenario = SCENARIOS.find((item) => item.id === id);
  if (!scenario) throw new Error(`Unknown scenario: ${id}`);
  return scenario;
}

export function compareScenarioOutcome(
  expected: ScenarioExpectedOutcome,
  observed: Pick<ControllerSnapshot, 'state' | 'fault'>,
): Readonly<{ passed: boolean; summary: string }> {
  if (observed.state !== expected.state)
    return { passed: false, summary: `Expected ${expected.state}; observed ${observed.state}.` };
  if (expected.fault && observed.fault?.type !== expected.fault)
    return {
      passed: false,
      summary: `Expected fault ${expected.fault}; observed ${observed.fault?.type ?? 'none'}.`,
    };
  if (!expected.fault && observed.fault)
    return {
      passed: false,
      summary: `Expected ${expected.state} without a fault; observed ${observed.fault.type}.`,
    };
  return {
    passed: true,
    summary: `Observed expected outcome: ${expected.state}${expected.fault ? ` (${expected.fault})` : ''}.`,
  };
}

export function nominalRouteIsFeasible(
  packageId: PackageClass['id'],
  config: SortLabConfig = CONFIG,
): boolean {
  const item = config.packages.find(({ id }) => id === packageId);
  if (!item) return false;
  try {
    const route = planDestinationRoute(item.destination, config);
    return route.trajectory.samples.length >= 2;
  } catch {
    return false;
  }
}
