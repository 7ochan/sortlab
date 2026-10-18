import type { PlannedRoute } from '../engineering/routes';

export function RoutePanel({
  route,
  selectedDestination,
  playbackTime,
  playing,
  manualInspection,
  controlsLocked,
  playbackLocked,
  onDestinationChange,
  onPlaybackTimeChange,
  onTogglePlayback,
  onReset,
}: {
  route: PlannedRoute;
  selectedDestination: PlannedRoute['destinationId'];
  playbackTime: number;
  playing: boolean;
  manualInspection: boolean;
  controlsLocked: boolean;
  playbackLocked: boolean;
  onDestinationChange: (destination: PlannedRoute['destinationId']) => void;
  onPlaybackTimeChange: (time: number) => void;
  onTogglePlayback: () => void;
  onReset: () => void;
}) {
  return (
    <section className="route-panel" aria-label="Route and trajectory preview">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">PHASE 02 · KINEMATIC PLAN</span>
          <h2>Route preview</h2>
        </div>
        <span className="state-badge route-badge">
          <i /> PREVIEW
        </span>
      </div>
      <p className="panel-copy">
        Cartesian TCP path with cubic timing and continuous analytic IK. No package transfer or
        collision guarantee.
      </p>

      <label className="route-select-label" htmlFor="route-destination">
        Destination bin
      </label>
      <select
        id="route-destination"
        aria-label="Destination bin"
        disabled={controlsLocked}
        value={selectedDestination}
        onChange={(event) =>
          onDestinationChange(event.currentTarget.value as PlannedRoute['destinationId'])
        }
      >
        <option value="B1">B1 · Small</option>
        <option value="B2">B2 · Medium</option>
        <option value="B3">B3 · Large</option>
      </select>

      <div className="route-summary">
        <span>Planned kinematic time</span>
        <b>{route.trajectory.durationSeconds.toFixed(2)} s</b>
      </div>
      <div className="route-summary">
        <span>Cartesian waypoints</span>
        <b>{route.waypoints.length}</b>
      </div>
      <ol className="route-waypoints" aria-label="Planned route waypoints">
        {route.waypoints.map((waypoint, index) => (
          <li key={waypoint.id}>
            <i className={`route-step route-step-${waypoint.kind}`} />
            <span>
              <strong>
                {String(index + 1).padStart(2, '0')} · {waypoint.label}
              </strong>
              <small>
                ({waypoint.pose.x.toFixed(2)}, {waypoint.pose.y.toFixed(2)},{' '}
                {waypoint.pose.z.toFixed(2)}) m
              </small>
            </span>
          </li>
        ))}
      </ol>

      <div className="playback-controls">
        <div className="playback-heading">
          <span className="eyebrow">SIMULATION TIME</span>
          <b>
            {playbackTime.toFixed(2)} / {route.trajectory.durationSeconds.toFixed(2)} s
          </b>
        </div>
        <input
          aria-label="Trajectory playback time"
          type="range"
          min={0}
          max={route.trajectory.durationSeconds}
          step={1 / 60}
          value={Math.min(playbackTime, route.trajectory.durationSeconds)}
          disabled={controlsLocked}
          onChange={(event) => onPlaybackTimeChange(Number(event.currentTarget.value))}
        />
        <div className="route-actions">
          <button type="button" onClick={onTogglePlayback} disabled={playbackLocked}>
            {playing ? 'Pause' : 'Play preview'}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={onReset}
            disabled={controlsLocked}
          >
            Return to pickup
          </button>
        </div>
        <p className="route-mode" aria-live="polite">
          {manualInspection
            ? 'Manual joint inspection · playback paused'
            : 'Kinematic pose preview · 1×'}
        </p>
      </div>
      <p className="scope-note">
        Transit corridor is a TCP-level assumption. Link, tool, package, and bin swept-volume
        collision checks are not implemented in Phase 2.
      </p>
    </section>
  );
}
