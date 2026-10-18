import type { ControllerEvent } from './sortingController';
import type { PackageClass, SortDestination } from './types';

export type CycleOutcome = 'completed' | 'faulted' | 'aborted' | 'in-progress';
export type CycleRecord = Readonly<{
  cycleId: number;
  packageId: PackageClass['id'] | null;
  destinationId: SortDestination['id'] | null;
  startedAtSeconds: number;
  endedAtSeconds: number | null;
  outcome: CycleOutcome;
  fault: string | null;
}>;
export type OutcomeBreakdown = Readonly<{
  attempts: number;
  completed: number;
  failed: number;
  aborted: number;
}>;
export type SessionMetrics = Readonly<{
  completedCycles: number;
  successfulPlacements: number;
  failedCycles: number;
  abortedCycles: number;
  terminalAttempts: number;
  successRate: number | null;
  averageCompletedCycleSeconds: number | null;
  graspSuccesses: number;
  graspRetries: number;
  routePlanningRejections: number;
  placementFailuresByReason: Readonly<Record<string, number>>;
  byCategory: Readonly<Record<PackageClass['id'], OutcomeBreakdown>>;
  byBin: Readonly<Record<SortDestination['id'], OutcomeBreakdown>>;
}>;

const emptyBreakdown = (): OutcomeBreakdown => ({
  attempts: 0,
  completed: 0,
  failed: 0,
  aborted: 0,
});

/** Session recorder deduplicates monotonically assigned controller event IDs. */
export class MetricsRecorder {
  private seen = new Set<number>();
  private history: ControllerEvent[] = [];

  ingest(events: readonly ControllerEvent[]): void {
    for (const event of events) {
      if (this.seen.has(event.id)) continue;
      this.seen.add(event.id);
      this.history.push(event);
    }
  }

  get events(): readonly ControllerEvent[] {
    return [...this.history];
  }

  get cycles(): readonly CycleRecord[] {
    const byCycle = new Map<number, ControllerEvent[]>();
    for (const event of this.history) {
      if (!event.cycleId) continue;
      const list = byCycle.get(event.cycleId) ?? [];
      list.push(event);
      byCycle.set(event.cycleId, list);
    }
    return [...byCycle.entries()]
      .sort(([a], [b]) => a - b)
      .map(([cycleId, events]) => {
        const start = events.find(({ kind }) => kind === 'start');
        const terminal = [...events]
          .reverse()
          .find(({ state }) => ['completed', 'recoverable-fault', 'aborted'].includes(state));
        const outcome: CycleOutcome =
          terminal?.state === 'completed'
            ? 'completed'
            : terminal?.state === 'aborted'
              ? 'aborted'
              : terminal
                ? 'faulted'
                : 'in-progress';
        return {
          cycleId,
          packageId: start?.packageId ?? terminal?.packageId ?? null,
          destinationId:
            terminal?.destinationId ??
            events.find(({ destinationId }) => destinationId)?.destinationId ??
            null,
          startedAtSeconds: start?.simulationTimeSeconds ?? 0,
          endedAtSeconds: terminal?.simulationTimeSeconds ?? null,
          outcome,
          fault: terminal?.fault ?? null,
        };
      });
  }

  get metrics(): SessionMetrics {
    const cycles = this.cycles;
    const terminal = cycles.filter(({ outcome }) => outcome !== 'in-progress');
    const completed = terminal.filter(({ outcome }) => outcome === 'completed');
    const breakdown = (key: 'packageId' | 'destinationId', values: readonly string[]) => {
      const record = Object.fromEntries(values.map((value) => [value, emptyBreakdown()])) as Record<
        string,
        { attempts: number; completed: number; failed: number; aborted: number }
      >;
      for (const cycle of cycles) {
        const value = cycle[key];
        if (!value || !record[value]) continue;
        const item = record[value]!;
        if (cycle.outcome !== 'in-progress') item.attempts += 1;
        if (cycle.outcome === 'completed') item.completed += 1;
        if (cycle.outcome === 'faulted') item.failed += 1;
        if (cycle.outcome === 'aborted') item.aborted += 1;
      }
      return record;
    };
    const placementFailuresByReason: Record<string, number> = {};
    for (const cycle of terminal.filter(({ outcome }) => outcome === 'faulted')) {
      if (
        cycle.fault &&
        ['incorrect-bin', 'outside-bin', 'placement-timeout'].includes(cycle.fault)
      )
        placementFailuresByReason[cycle.fault] = (placementFailuresByReason[cycle.fault] ?? 0) + 1;
    }
    const graspEvents = this.history.filter(({ kind }) => kind === 'grasp');
    const durations = completed.flatMap(({ startedAtSeconds, endedAtSeconds }) =>
      endedAtSeconds === null ? [] : [endedAtSeconds - startedAtSeconds],
    );
    const completedCycles = completed.length;
    const completedIds = new Set(completed.map(({ cycleId }) => cycleId));
    const failedCycles = terminal.filter(({ outcome }) => outcome === 'faulted').length;
    const abortedCycles = terminal.filter(({ outcome }) => outcome === 'aborted').length;
    return {
      completedCycles,
      successfulPlacements: this.history.filter(
        ({ cycleId, kind, state }) =>
          completedIds.has(cycleId) && kind === 'placement' && state === 'returning-home',
      ).length,
      failedCycles,
      abortedCycles,
      terminalAttempts: terminal.length,
      successRate: terminal.length ? completedCycles / terminal.length : null,
      averageCompletedCycleSeconds: durations.length
        ? durations.reduce((sum, seconds) => sum + seconds, 0) / durations.length
        : null,
      graspSuccesses: graspEvents.filter(({ message }) => message.includes('Successful')).length,
      graspRetries: graspEvents.filter(({ message }) => message.includes('attempt 2/2')).length,
      routePlanningRejections: terminal.filter(({ fault }) => fault === 'unreachable-route').length,
      placementFailuresByReason,
      byCategory: breakdown('packageId', ['S', 'M', 'L']) as SessionMetrics['byCategory'],
      byBin: breakdown('destinationId', ['B1', 'B2', 'B3']) as SessionMetrics['byBin'],
    };
  }

  exportJson(): string {
    return JSON.stringify(
      { metrics: this.metrics, cycles: this.cycles, events: this.events },
      null,
      2,
    );
  }
}
