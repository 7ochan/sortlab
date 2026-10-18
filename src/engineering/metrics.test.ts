import { describe, expect, it } from 'vitest';
import { MetricsRecorder } from './metrics';
import type { ControllerEvent } from './sortingController';

function event(
  id: number,
  cycleId: number,
  kind: ControllerEvent['kind'],
  state: ControllerEvent['state'],
  seconds: number,
  message: string,
  fault?: ControllerEvent['fault'],
): ControllerEvent {
  return {
    id,
    cycleId,
    kind,
    state,
    tick: id,
    simulationTimeSeconds: seconds,
    packageId: 'S',
    destinationId: 'B1',
    message,
    ...(fault ? { fault } : {}),
  };
}

describe('session performance metrics', () => {
  it('returns null rate and average with zero terminal attempts', () => {
    const recorder = new MetricsRecorder();
    expect(recorder.metrics.successRate).toBeNull();
    expect(recorder.metrics.averageCompletedCycleSeconds).toBeNull();
    expect(recorder.metrics.terminalAttempts).toBe(0);
  });

  it('aggregates completed, faulted, and aborted attempts without counting active cycles', () => {
    const recorder = new MetricsRecorder();
    recorder.ingest([
      event(1, 1, 'start', 'selecting', 0, 'Started'),
      event(2, 1, 'grasp', 'lifting', 1, 'Successful: fixed-joint attachment confirmed'),
      event(3, 1, 'placement', 'returning-home', 5, 'Placement verified'),
      event(4, 1, 'terminal', 'completed', 8, 'Cycle complete'),
      event(5, 2, 'start', 'selecting', 10, 'Started'),
      event(6, 2, 'grasp', 'aligning-and-grasping', 11, 'Failed attempt 1/2'),
      event(7, 2, 'grasp', 'recoverable-fault', 12, 'Failed attempt 2/2', 'failed-grasp'),
      event(8, 3, 'start', 'selecting', 14, 'Started'),
      event(9, 3, 'placement', 'returning-home', 15, 'Placement verified'),
      event(10, 3, 'terminal', 'aborted', 16, 'Cycle aborted during return'),
      event(11, 4, 'start', 'planning', 17, 'In progress'),
    ]);
    const m = recorder.metrics;
    expect(m.completedCycles).toBe(1);
    expect(m.successfulPlacements).toBe(1);
    expect(m.failedCycles).toBe(1);
    expect(m.abortedCycles).toBe(1);
    expect(m.terminalAttempts).toBe(3);
    expect(m.successRate).toBeCloseTo(1 / 3);
    expect(m.averageCompletedCycleSeconds).toBe(8);
    expect(m.graspSuccesses).toBe(1);
    expect(m.graspRetries).toBe(1);
    expect(m.byCategory.S).toEqual({ attempts: 3, completed: 1, failed: 1, aborted: 1 });
    expect(m.byBin.B1).toEqual({ attempts: 3, completed: 1, failed: 1, aborted: 1 });
  });

  it('deduplicates event IDs and exports the same metrics and history as the recorder', () => {
    const recorder = new MetricsRecorder();
    const history = [
      event(1, 1, 'start', 'selecting', 0, 'Started'),
      event(2, 1, 'terminal', 'completed', 4, 'Done'),
    ];
    recorder.ingest(history);
    recorder.ingest(history);
    const exported = JSON.parse(recorder.exportJson()) as {
      metrics: unknown;
      events: ControllerEvent[];
    };
    expect(recorder.events).toHaveLength(2);
    expect(exported.events).toEqual(recorder.events);
    expect(exported.metrics).toEqual(recorder.metrics);
  });

  it('counts a successful second grasp attempt as both a success and a retry', () => {
    const recorder = new MetricsRecorder();
    recorder.ingest([
      event(1, 1, 'start', 'selecting', 0, 'Started'),
      event(
        2,
        1,
        'grasp',
        'aligning-and-grasping',
        1,
        'Grasp attempt 1/2 — Failed attempt 1/2: alignment miss',
      ),
      event(
        3,
        1,
        'grasp',
        'lifting',
        1.1,
        'Grasp attempt 2/2 — Successful on retry: attachment confirmed',
      ),
    ]);
    expect(recorder.metrics.graspSuccesses).toBe(1);
    expect(recorder.metrics.graspRetries).toBe(1);
  });
});
