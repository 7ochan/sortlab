import type { ControllerSnapshot } from '../engineering/sortingController';
import type { PackageClass } from '../engineering/types';

export function AutonomousPanel({
  snapshot,
  packages,
  selectedPackage,
  ready,
  packageAttached,
  paused,
  onPackageChange,
  onStart,
  onPause,
  onAbort,
  onReset,
}: {
  snapshot: ControllerSnapshot;
  packages: readonly PackageClass[];
  selectedPackage: PackageClass['id'];
  ready: boolean;
  packageAttached: boolean;
  paused: boolean;
  onPackageChange: (id: PackageClass['id']) => void;
  onStart: () => void;
  onPause: () => void;
  onAbort: () => void;
  onReset: () => void;
}) {
  const active = snapshot.active;
  return (
    <section
      className={`autonomous-panel ${snapshot.fault ? 'has-fault' : ''}`}
      aria-label="Autonomous sorting controller"
      data-testid="autonomous-panel"
    >
      <div className="panel-heading">
        <div>
          <span className="eyebrow">PHASE 04 · FIXED TICK</span>
          <h2>Autonomous sort</h2>
        </div>
        <span
          className={`state-badge ${snapshot.fault ? 'fault-badge' : snapshot.state === 'completed' ? 'complete-badge' : 'route-badge'}`}
          data-testid="controller-state"
        >
          <i />
          {snapshot.state.toUpperCase()}
        </span>
      </div>
      <p className="panel-copy">
        One package cycle with route validation, confirmed grasp, Rapier release and settled
        placement verification.
      </p>
      <label className="route-select-label" htmlFor="autonomous-package">
        Package to sort
      </label>
      <select
        id="autonomous-package"
        aria-label="Autonomous package"
        value={selectedPackage}
        disabled={!ready || active || packageAttached}
        onChange={(event) => onPackageChange(event.currentTarget.value as PackageClass['id'])}
      >
        {packages.map((item) => (
          <option key={item.id} value={item.id}>
            {item.id} · {item.name} → {item.destination}
          </option>
        ))}
      </select>
      <div className="route-summary">
        <span>Current action</span>
        <b>{snapshot.action}</b>
      </div>
      <div className="route-summary">
        <span>Cycle</span>
        <b>
          {snapshot.packageId ?? '—'} → {snapshot.destinationId ?? '—'}
        </b>
      </div>
      <div className="route-summary">
        <span>Elapsed simulation time</span>
        <b data-testid="controller-time">{snapshot.elapsedSeconds.toFixed(2)} s</b>
      </div>
      <div
        className="controller-progress"
        role="progressbar"
        aria-label="Cycle progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(snapshot.progress * 100)}
      >
        <i style={{ width: `${snapshot.progress * 100}%` }} />
      </div>
      <div className="physics-state" aria-live="polite">
        <p>
          Grasp:{' '}
          <span className={snapshot.graspResult.startsWith('Successful') ? 'result-ok' : ''}>
            {snapshot.graspResult}
          </span>
        </p>
        <p>
          Placement:{' '}
          <span
            className={
              snapshot.placementResult?.status === 'accepted'
                ? 'result-ok'
                : snapshot.placementResult && snapshot.placementResult.status !== 'settling'
                  ? 'result-error'
                  : ''
            }
          >
            {snapshot.placementResult?.message ?? 'Not verified'}
          </span>
        </p>
        {snapshot.fault && (
          <p className="controller-fault" role="alert">
            {snapshot.fault.type}: {snapshot.fault.message}
          </p>
        )}
      </div>
      <div className="route-actions controller-actions">
        <button
          type="button"
          onClick={onStart}
          disabled={!ready || packageAttached || snapshot.state !== 'idle'}
        >
          Start autonomous sort
        </button>
        <button type="button" className="secondary-button" onClick={onPause} disabled={!active}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button type="button" className="secondary-button" onClick={onAbort} disabled={!active}>
          Abort
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={onReset}
          disabled={!ready || active}
        >
          Reset / recover
        </button>
      </div>
      <div className="controller-log" aria-label="Controller event log">
        <span className="eyebrow">RECENT EVENTS</span>
        {snapshot.events
          .slice(-5)
          .reverse()
          .map((event, index) => (
            <p key={`${event.tick}-${index}`}>
              t={event.simulationTimeSeconds.toFixed(2)}s · {event.message}
            </p>
          ))}
        {snapshot.events.length === 0 && <p>Awaiting start command.</p>}
      </div>
    </section>
  );
}
