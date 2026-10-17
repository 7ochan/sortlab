import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { CONFIG } from './engineering/config';
import { planAllDestinationRoutes } from './engineering/routes';
import { sampleTrajectoryAtTime } from './engineering/trajectory';
import { StatusPanel } from './components/StatusPanel';
import { RoutePanel } from './components/RoutePanel';
import type { JointState } from './engineering/types';
import './styles.css';

const Workcell = lazy(() =>
  import('./components/Workcell').then((module) => ({ default: module.Workcell })),
);

class SceneBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  componentDidCatch(error: Error) {
    console.error('Scene initialization failed:', error);
  }
  render() {
    if (this.state.error)
      return (
        <div className="scene-error" role="alert">
          3D scene could not initialize: {this.state.error}
        </div>
      );
    return this.props.children;
  }
}

function App() {
  const [routes] = useState(() => planAllDestinationRoutes(CONFIG));
  const [selectedDestination, setSelectedDestination] = useState<'B1' | 'B2' | 'B3'>('B1');
  const route =
    routes.find(({ destinationId }) => destinationId === selectedDestination) ?? routes[0]!;
  const [joints, setJoints] = useState<JointState>(
    () => routes[0]!.trajectory.samples[0]!.position,
  );
  const [playbackTime, setPlaybackTime] = useState(0);
  const playbackTimeRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [manualInspection, setManualInspection] = useState(false);
  const [webglSupported] = useState<boolean>(() => {
    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('webgl2');
      context?.getExtension('WEBGL_lose_context')?.loseContext();
      return context !== null;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!playing) return;
    const startWallTime = performance.now();
    const startSimulationTime = playbackTimeRef.current;
    let frame = 0;
    const advance = (now: number) => {
      const time = Math.min(
        route.trajectory.durationSeconds,
        startSimulationTime + (now - startWallTime) / 1000,
      );
      playbackTimeRef.current = time;
      setPlaybackTime(time);
      setJoints(sampleTrajectoryAtTime(route.trajectory, time).position);
      if (time >= route.trajectory.durationSeconds) {
        setPlaying(false);
      } else {
        frame = requestAnimationFrame(advance);
      }
    };
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, [playing, route]);

  const inspectJointState = (next: JointState) => {
    setPlaying(false);
    setManualInspection(true);
    setJoints(next);
  };

  const scrubTrajectory = (time: number) => {
    setPlaying(false);
    playbackTimeRef.current = time;
    setPlaybackTime(time);
    setManualInspection(false);
    setJoints(sampleTrajectoryAtTime(route.trajectory, time).position);
  };

  const togglePlayback = () => {
    setManualInspection(false);
    if (playbackTimeRef.current >= route.trajectory.durationSeconds) scrubTrajectory(0);
    setPlaying((current) => !current);
  };

  const resetRoute = () => scrubTrajectory(0);

  const selectDestination = (destination: 'B1' | 'B2' | 'B3') => {
    const selectedRoute = routes.find(({ destinationId }) => destinationId === destination);
    if (!selectedRoute) return;
    setSelectedDestination(destination);
    setPlaying(false);
    playbackTimeRef.current = 0;
    setPlaybackTime(0);
    setManualInspection(false);
    setJoints(selectedRoute.trajectory.samples[0]!.position);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#home" aria-label="SortLab home">
          <span className="brand-mark">
            <i />
            <i />
            <i />
          </span>
          <span>
            SORT<span className="brand-accent">LAB</span>
          </span>
        </a>
        <div className="topbar-context">
          <span>ROBOTICS DIGITAL TWIN</span>
          <span className="context-separator" />
          PHASE 02 · ROUTES &amp; TRAJECTORIES
        </div>
        <div className="topbar-right">
          <span className="connection-indicator">
            <i /> LOCAL SIMULATION
          </span>
          <span className="version-tag">v0.1.0</span>
        </div>
      </header>
      <section className="intro-row">
        <div>
          <span className="eyebrow">SORTLAB / WORKCELL 01</span>
          <h1>SCARA engineering preview</h1>
          <p>Analytical kinematics with constraint-checked, scrubbable SCARA route previews.</p>
        </div>
        <div className="assumption-chip">
          <span className="chip-dot" />
          <span>PROVISIONAL ENGINEERING MODEL</span>
        </div>
      </section>
      <section className="workspace-layout">
        <div className="viewport-card">
          <div className="viewport-heading">
            <div>
              <span className="eyebrow">CELL VIEW</span>
              <strong>Pick &amp; sort stations</strong>
            </div>
            <span className="axis-key">
              <i>X</i> forward <i>Y</i> lateral <i>Z</i> up
            </span>
          </div>
          <div className="viewport" aria-label="Interactive 3D SCARA workcell">
            {!webglSupported ? (
              <div className="scene-error" role="alert">
                WebGL 2 is unavailable in this browser. Enable hardware acceleration or use a WebGL
                2 capable browser to view the workcell.
              </div>
            ) : (
              <SceneBoundary>
                <Suspense fallback={<div className="scene-error">Loading 3D scene…</div>}>
                  <Workcell joints={joints} route={route} />
                </Suspense>
              </SceneBoundary>
            )}
            {webglSupported && (
              <div className="viewport-overlay">
                <span>
                  <i /> LIVE 3D SCENE
                </span>
                <span>SCHEMATIC GEOMETRY · SI SCALE</span>
              </div>
            )}
          </div>
          <div className="cell-legend">
            <div>
              <i className="legend-robot" />
              SCARA · 4 arm axes
            </div>
            <div>
              <i className="legend-pick" />
              Pickup area
            </div>
            <div>
              <i className="legend-bin" />
              B1 — Small
            </div>
            <div>
              <i className="legend-bin two" />
              B2 — Medium
            </div>
            <div>
              <i className="legend-bin three" />
              B3 — Large
            </div>
            <div>
              <i className="legend-route" />
              TCP route
            </div>
          </div>
        </div>
        <div className="control-column">
          <StatusPanel joints={joints} onChange={inspectJointState} />
          <RoutePanel
            route={route}
            selectedDestination={selectedDestination}
            playbackTime={playbackTime}
            playing={playing}
            manualInspection={manualInspection}
            onDestinationChange={selectDestination}
            onPlaybackTimeChange={scrubTrajectory}
            onTogglePlayback={togglePlayback}
            onReset={resetRoute}
          />
        </div>
      </section>
      <footer className="footer">
        <span>SORTLAB ENGINEERING · CONFIGURATION-DRIVEN VIEW</span>
        <span>SIMULATED / NOT HARDWARE-VALIDATED</span>
      </footer>
    </main>
  );
}

export default App;
