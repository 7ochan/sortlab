import type { ControllerSnapshot } from '../engineering/sortingController';
import type { SessionMetrics } from '../engineering/metrics';
import { SCENARIOS, type ScenarioId } from '../engineering/scenarios';
import type { ControllerEvent } from '../engineering/sortingController';
import type { JointState } from '../engineering/types';

export function OperationsDashboard({
  snapshot,
  metrics,
  events,
  joints,
  simulationTime,
  simulationTick,
  fixedStepSeconds,
  physicsStatus,
  tcpPose,
  selectedDestination,
  previewTime,
  previewDuration,
  paused,
  previewPlaying,
  selectedScenario,
  scenarioOutcome,
  onScenarioChange,
  onRunScenario,
  onExport,
}: {
  snapshot: ControllerSnapshot;
  metrics: SessionMetrics;
  events: readonly ControllerEvent[];
  joints: JointState;
  simulationTime: number;
  simulationTick: number;
  fixedStepSeconds: number;
  physicsStatus: string;
  tcpPose: Readonly<{ x: number; y: number; z: number; yaw: number }>;
  selectedDestination: 'B1' | 'B2' | 'B3';
  previewTime: number;
  previewDuration: number;
  paused: boolean;
  previewPlaying: boolean;
  selectedScenario: ScenarioId;
  scenarioOutcome: Readonly<{ scenarioId: ScenarioId; passed: boolean; summary: string }> | null;
  onScenarioChange: (id: ScenarioId) => void;
  onRunScenario: () => void;
  onExport: () => void;
}) {
  const scenario = SCENARIOS.find(({ id }) => id === selectedScenario)!;
  const terminal = ['completed', 'recoverable-fault', 'aborted'].includes(snapshot.state);
  const formatRate = (rate: number | null) => (rate === null ? '—' : `${(rate * 100).toFixed(1)}%`);
  return (
    <section className="operations-dashboard" aria-label="Engineering dashboard">
      <div className="dashboard-column">
        <section className="dashboard-card scenario-card" aria-label="Scenario controls">
          <div className="dashboard-title">
            <div>
              <span className="eyebrow">REPEATABLE SETUPS</span>
              <h2>Scenarios</h2>
            </div>
            <span className="dashboard-tag">PHASE 05</span>
          </div>
          <label htmlFor="scenario-select">Scenario</label>
          <select
            id="scenario-select"
            value={selectedScenario}
            disabled={snapshot.active}
            onChange={(event) => onScenarioChange(event.currentTarget.value as ScenarioId)}
          >
            {SCENARIOS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <p className="dashboard-copy">{scenario.description}</p>
          <p className="scenario-expected">
            Expected:{' '}
            <b>
              {scenario.expected.state}
              {scenario.expected.fault ? ` · ${scenario.expected.fault}` : ''}
            </b>
          </p>
          <button
            type="button"
            onClick={onRunScenario}
            disabled={snapshot.active}
            aria-label="Reset and run selected scenario"
          >
            Reset and run scenario
          </button>
          {scenarioOutcome && scenarioOutcome.scenarioId === selectedScenario && terminal && (
            <p
              className={`scenario-result ${scenarioOutcome.passed ? 'result-ok' : 'result-error'}`}
              role="status"
            >
              {scenarioOutcome.passed ? 'Scenario passed. ' : 'Scenario did not match. '}
              {scenarioOutcome.summary}
            </p>
          )}
        </section>
        <section className="dashboard-card" aria-label="Robot and simulation status">
          <div className="dashboard-title">
            <div>
              <span className="eyebrow">LIVE TELEMETRY</span>
              <h2>Robot &amp; simulation</h2>
            </div>
          </div>
          <div className="telemetry-grid">
            <div>
              <span>Robot joints</span>
              <b>
                J1 {((joints.j1 * 180) / Math.PI).toFixed(1)}° · J2{' '}
                {((joints.j2 * 180) / Math.PI).toFixed(1)}° · J3 {joints.j3.toFixed(3)} m · J4{' '}
                {((joints.j4 * 180) / Math.PI).toFixed(1)}°
              </b>
            </div>
            <div>
              <span>TCP pose · W</span>
              <b>
                X {tcpPose.x.toFixed(3)} m · Y {tcpPose.y.toFixed(3)} m · Z {tcpPose.z.toFixed(3)} m
                · yaw {((tcpPose.yaw * 180) / Math.PI).toFixed(1)}°
              </b>
            </div>
            <div>
              <span>Selected preview route</span>
              <b>
                {selectedDestination} · {previewTime.toFixed(2)} / {previewDuration.toFixed(2)} s
              </b>
            </div>
            <div>
              <span>Controller / action</span>
              <b>
                {snapshot.state} · {snapshot.action}
              </b>
            </div>
            <div>
              <span>Target / package</span>
              <b>
                {snapshot.packageId ?? '—'} → {snapshot.destinationId ?? '—'}
              </b>
            </div>
            <div>
              <span>Simulation clock</span>
              <b>
                {simulationTime.toFixed(2)} s · tick {simulationTick} · Δt{' '}
                {fixedStepSeconds.toFixed(5)} s
              </b>
            </div>
            <div>
              <span>Physics</span>
              <b>{physicsStatus}</b>
            </div>
            <div>
              <span>Playback / pause</span>
              <b>
                {paused
                  ? 'Autonomous simulation paused'
                  : snapshot.active
                    ? 'Autonomous simulation running'
                    : previewPlaying
                      ? 'Route preview playing'
                      : 'Simulation ready / preview stopped'}
              </b>
            </div>
            <div>
              <span>Reset readiness</span>
              <b>
                {snapshot.active
                  ? 'Reset locked during active cycle'
                  : 'Reset / recovery available'}
              </b>
            </div>
            <div>
              <span>Grasp</span>
              <b>{snapshot.graspResult}</b>
            </div>
            <div>
              <span>Placement verification</span>
              <b>{snapshot.placementResult?.message ?? 'Not verified'}</b>
            </div>
          </div>
          {snapshot.fault && (
            <p className="dashboard-fault" role="alert">
              {snapshot.fault.type}: {snapshot.fault.message}
            </p>
          )}
        </section>
        <section className="dashboard-card metrics-card" aria-label="Session performance metrics">
          <div className="dashboard-title">
            <div>
              <span className="eyebrow">MEASURED SESSION EVENTS</span>
              <h2>Performance metrics</h2>
            </div>
            <button type="button" className="secondary-button" onClick={onExport}>
              Export JSON
            </button>
          </div>
          <p className="dashboard-copy">
            Success rate denominator: terminal attempts only (completed, faulted, or aborted).
            Average cycle time includes completed cycles only.
          </p>
          <div className="metric-grid">
            <Metric label="Completed cycles" value={metrics.completedCycles} />
            <Metric label="Verified placements" value={metrics.successfulPlacements} />
            <Metric
              label="Failed / aborted"
              value={`${metrics.failedCycles} / ${metrics.abortedCycles}`}
            />
            <Metric label="Success rate" value={formatRate(metrics.successRate)} />
            <Metric
              label="Avg. completed cycle"
              value={
                metrics.averageCompletedCycleSeconds === null
                  ? '—'
                  : `${metrics.averageCompletedCycleSeconds.toFixed(2)} s`
              }
            />
            <Metric
              label="Grasp successes / retries"
              value={`${metrics.graspSuccesses} / ${metrics.graspRetries}`}
            />
            <Metric label="Route rejections" value={metrics.routePlanningRejections} />
          </div>
          <div className="breakdown-row">
            <Breakdown title="By category" values={metrics.byCategory} />
            <Breakdown title="By bin" values={metrics.byBin} />
          </div>
          <div className="placement-failures">
            <b>Placement failures:</b>{' '}
            {Object.entries(metrics.placementFailuresByReason).length
              ? Object.entries(metrics.placementFailuresByReason)
                  .map(([reason, count]) => `${reason} ${count}`)
                  .join(' · ')
              : 'none'}
          </div>
        </section>
      </div>
      <section className="dashboard-card event-card" aria-label="Session event history">
        <div className="dashboard-title">
          <div>
            <span className="eyebrow">CONTROLLER EVENT SOURCE</span>
            <h2>Event log</h2>
          </div>
          <span className="event-count">{events.length} events</span>
        </div>
        <div className="event-list" aria-live="polite">
          {[...events].reverse().map((event) => (
            <div className="event-row" key={event.id}>
              <time>
                C{event.cycleId} · {event.simulationTimeSeconds.toFixed(2)} s · #{event.tick}
              </time>
              <span
                className={
                  event.fault ? 'result-error' : event.kind === 'placement' ? 'result-ok' : ''
                }
              >
                {event.kind}
              </span>
              <p>
                {event.message}
                {event.packageId
                  ? ` · ${event.packageId}${event.destinationId ? ` → ${event.destinationId}` : ''}`
                  : ''}
              </p>
            </div>
          ))}
          {!events.length && (
            <p className="empty-events">No autonomous events recorded in this session.</p>
          )}
        </div>
      </section>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric-item">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function Breakdown({
  title,
  values,
}: {
  title: string;
  values: Readonly<
    Record<
      string,
      Readonly<{ attempts: number; completed: number; failed: number; aborted: number }>
    >
  >;
}) {
  return (
    <div>
      <b>{title}</b>
      <ul>
        {Object.entries(values).map(([key, item]) => (
          <li key={key}>
            {key}: {item.completed}/{item.attempts} completed · {item.failed} failed ·{' '}
            {item.aborted} aborted
          </li>
        ))}
      </ul>
    </div>
  );
}
