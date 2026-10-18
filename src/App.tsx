import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { CONFIG } from './engineering/config';
import { planAllDestinationRoutes } from './engineering/routes';
import { sampleTrajectoryAtTime } from './engineering/trajectory';
import { forwardKinematics } from './engineering/kinematics';
import {
  PackagePhysicsSimulation,
  type GraspResult,
  type PackageSnapshot,
} from './engineering/packagePhysics';
import { StatusPanel } from './components/StatusPanel';
import { RoutePanel } from './components/RoutePanel';
import { PackagePanel } from './components/PackagePanel';
import type { JointState, PackageClass } from './engineering/types';
import { SortingController } from './engineering/sortingController';
import { AutonomousPanel } from './components/AutonomousPanel';
import { OperationsDashboard } from './components/OperationsDashboard';
import { MetricsRecorder } from './engineering/metrics';
import { SCENARIOS, compareScenarioOutcome, type ScenarioId } from './engineering/scenarios';
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
  const physicsRef = useRef<PackagePhysicsSimulation | null>(null);
  const controllerRef = useRef<SortingController | null>(null);
  const metricsRef = useRef(new MetricsRecorder());
  const activeScenarioRef = useRef<Readonly<{ id: ScenarioId; cycleId: number }> | null>(null);
  const [sessionMetrics, setSessionMetrics] = useState(metricsRef.current.metrics);
  const [sessionEvents, setSessionEvents] = useState(metricsRef.current.events);
  const [selectedScenario, setSelectedScenario] = useState<ScenarioId>('nominal-s');
  const [scenarioOutcome, setScenarioOutcome] = useState<Readonly<{
    scenarioId: ScenarioId;
    passed: boolean;
    summary: string;
  }> | null>(null);
  const [simulationTick, setSimulationTick] = useState(0);
  const [packageClass, setPackageClass] = useState<PackageClass>(CONFIG.packages[0]!);
  const [packageSnapshot, setPackageSnapshot] = useState<PackageSnapshot | null>(null);
  const [physicsStatus, setPhysicsStatus] = useState('Initializing fixed-step Rapier world…');
  const [graspResult, setGraspResult] = useState<GraspResult | null>(null);
  const [gripperOpen, setGripperOpen] = useState(true);
  const [controllerSnapshot, setControllerSnapshot] = useState<SortingController['snapshot']>(
    () =>
      new SortingController({
        setJoints: () => {},
        getJoints: () => CONFIG.robot.home,
        getSnapshot: () => null,
        open: () => {},
        close: () => {},
        attemptGrasp: () => ({ success: false, reason: 'Physics is not ready.' }),
        release: () => ({ success: false, reason: 'Physics is not ready.' }),
        resetPackage: () => {},
        stepPhysics: () => null,
      }).snapshot,
  );
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

  useEffect(() => {
    let active = true;
    let simulation: PackagePhysicsSimulation | null = null;
    let frame = 0;
    let previous = 0;
    let accumulator = 0;
    void PackagePhysicsSimulation.create(CONFIG, packageClass.id)
      .then((created) => {
        if (!active) {
          created.dispose();
          return;
        }
        simulation = created;
        physicsRef.current = created;
        controllerRef.current = new SortingController({
          setJoints: (next) => {
            jointsRef.current = next;
            setJoints(next);
            created.setTcp(forwardKinematics(next, CONFIG));
          },
          getJoints: () => jointsRef.current,
          getSnapshot: () => created.stepFixed(0),
          open: () => {
            created.open();
            setGripperOpen(true);
          },
          close: () => {
            created.close();
            setGripperOpen(false);
          },
          attemptGrasp: () => {
            const result = created.attemptGrasp();
            setGraspResult(result);
            return result;
          },
          release: () => {
            const result = created.release();
            setGraspResult(result);
            return result;
          },
          resetPackage: () => {
            created.reset();
            setGripperOpen(true);
            setGraspResult(null);
          },
          stepPhysics: () => created.stepFixed(1),
          getPhysicsStepCount: () => created.fixedSteps,
        });
        setControllerSnapshot(controllerRef.current.snapshot);
        setPackageSnapshot(created.stepFixed(0));
        setPhysicsStatus(
          `Rapier ${CONFIG.performance.fixedStepSeconds.toFixed(5)} s fixed step · package dynamics active`,
        );
        const tick = (now: number) => {
          if (!active || !simulation) return;
          const dt = CONFIG.performance.fixedStepSeconds;
          if (!previous) previous = now;
          accumulator = Math.min(accumulator + Math.min((now - previous) / 1000, 0.1), dt * 6);
          previous = now;
          simulation.setTcp(forwardKinematics(jointsRef.current, CONFIG));
          let steps = 0;
          while (accumulator >= dt && steps < 6) {
            const controller = controllerRef.current;
            if (controller?.snapshot.active) {
              if (!controller.isPaused) controller.tick(dt);
              metricsRef.current.ingest(controller.snapshot.events);
            } else {
              simulation.stepFixed();
            }
            accumulator -= dt;
            steps += 1;
          }
          if (steps) {
            setPackageSnapshot(simulation.stepFixed(0));
            if (controllerRef.current) setControllerSnapshot(controllerRef.current.snapshot);
            setSimulationTick(simulation.fixedSteps);
            setSessionMetrics(metricsRef.current.metrics);
            setSessionEvents(metricsRef.current.events);
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      })
      .catch((error: unknown) =>
        setPhysicsStatus(
          `Rapier unavailable: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      physicsRef.current = null;
      controllerRef.current = null;
      simulation?.dispose();
    };
    // One world per mounted app; package selection resets the existing body below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jointsRef = useRef(joints);
  useEffect(() => {
    jointsRef.current = joints;
  }, [joints]);

  const inspectJointState = (next: JointState) => {
    if (physicsRef.current?.isAttached || controllerRef.current?.snapshot.active) return;
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

  const withPhysics = (action: (simulation: PackagePhysicsSimulation) => void) => {
    if (controllerRef.current?.snapshot.active) return;
    const simulation = physicsRef.current;
    if (!simulation) return;
    try {
      action(simulation);
      setPackageSnapshot(simulation.stepFixed(0));
    } catch (error) {
      setPhysicsStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const syncController = () => {
    const controller = controllerRef.current;
    if (!controller) return;
    metricsRef.current.ingest(controller.snapshot.events);
    setControllerSnapshot(controller.snapshot);
    setSessionMetrics(metricsRef.current.metrics);
    setSessionEvents(metricsRef.current.events);
  };

  const runScenario = () => {
    const controller = controllerRef.current;
    const simulation = physicsRef.current;
    const scenario = SCENARIOS.find(({ id }) => id === selectedScenario);
    if (!controller || !simulation || !scenario || controller.snapshot.active) return;
    setPlaying(false);
    if (!controller.reset()) return;
    if (simulation.packageClass.id !== scenario.packageId)
      simulation.selectPackage(scenario.packageId);
    const item = CONFIG.packages.find(({ id }) => id === scenario.packageId)!;
    const destinationRoute = routes.find(
      ({ destinationId }) => destinationId === item.destination,
    )!;
    setPackageClass(item);
    setSelectedDestination(item.destination);
    setManualInspection(false);
    setPlaybackTime(0);
    playbackTimeRef.current = 0;
    jointsRef.current = destinationRoute.trajectory.samples[0]!.position;
    setJoints(jointsRef.current);
    setGraspResult(null);
    setGripperOpen(true);
    controller.configureScenario(scenario.hooks);
    setScenarioOutcome(null);
    controller.start(scenario.packageId);
    activeScenarioRef.current = { id: scenario.id, cycleId: controller.snapshot.cycleId };
    syncController();
    setPackageSnapshot(simulation.stepFixed(0));
  };

  useEffect(() => {
    const activeScenario = activeScenarioRef.current;
    if (
      !activeScenario ||
      controllerSnapshot.cycleId !== activeScenario.cycleId ||
      !['completed', 'recoverable-fault', 'aborted'].includes(controllerSnapshot.state)
    )
      return;
    const scenario = SCENARIOS.find(({ id }) => id === activeScenario.id);
    if (!scenario) return;
    setScenarioOutcome({
      scenarioId: activeScenario.id,
      ...compareScenarioOutcome(scenario.expected, controllerSnapshot),
    });
    activeScenarioRef.current = null;
  }, [controllerSnapshot]);

  const exportSession = () => {
    const blob = new Blob([metricsRef.current.exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'sortlab-session-metrics.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

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
          PHASE 05 · SORTING OPERATIONS
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
          <h1>Warehouse robotics digital twin</h1>
          <p>
            Live SCARA workcell with repeatable sorting scenarios and event-derived performance.
          </p>
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
                  <Workcell
                    joints={joints}
                    route={route}
                    packageSnapshot={packageSnapshot}
                    packageClass={packageClass}
                    gripperOpen={gripperOpen}
                  />
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
          <StatusPanel
            joints={joints}
            onChange={inspectJointState}
            controlsLocked={Boolean(packageSnapshot?.attached) || controllerSnapshot.active}
          />
          <RoutePanel
            route={route}
            selectedDestination={selectedDestination}
            playbackTime={playbackTime}
            playing={playing}
            manualInspection={manualInspection}
            controlsLocked={Boolean(packageSnapshot?.attached) || controllerSnapshot.active}
            playbackLocked={
              controllerSnapshot.active ||
              (controllerSnapshot.state === 'recoverable-fault' &&
                Boolean(packageSnapshot?.attached))
            }
            onDestinationChange={selectDestination}
            onPlaybackTimeChange={scrubTrajectory}
            onTogglePlayback={togglePlayback}
            onReset={resetRoute}
          />
          <PackagePanel
            packages={CONFIG.packages}
            packageId={packageClass.id}
            status={physicsStatus}
            snapshot={packageSnapshot}
            attached={Boolean(packageSnapshot?.attached)}
            controlsLocked={controllerSnapshot.active}
            open={gripperOpen}
            result={graspResult}
            onSelect={(id) =>
              withPhysics((sim) => {
                sim.selectPackage(id);
                const item = CONFIG.packages.find((p) => p.id === id)!;
                const destinationRoute = routes.find((r) => r.destinationId === item.destination)!;
                setPackageClass(item);
                setSelectedDestination(item.destination);
                setPlaying(false);
                setManualInspection(false);
                setPlaybackTime(0);
                playbackTimeRef.current = 0;
                setJoints(destinationRoute.trajectory.samples[0]!.position);
                setGraspResult(null);
                setGripperOpen(true);
              })
            }
            onReset={() =>
              withPhysics((sim) => {
                sim.reset();
                setGraspResult(null);
                setGripperOpen(true);
              })
            }
            onOpen={() =>
              withPhysics((sim) => {
                sim.open();
                setGripperOpen(true);
                setGraspResult(null);
              })
            }
            onClose={() =>
              withPhysics((sim) => {
                sim.close();
                setGripperOpen(false);
                setGraspResult(null);
              })
            }
            onGrasp={() => withPhysics((sim) => setGraspResult(sim.attemptGrasp()))}
            onRelease={() =>
              withPhysics((sim) => {
                setGraspResult(sim.release());
                setGripperOpen(true);
                sim.open();
              })
            }
          />
          <AutonomousPanel
            snapshot={controllerSnapshot}
            packages={CONFIG.packages}
            selectedPackage={packageClass.id}
            ready={Boolean(physicsRef.current)}
            packageAttached={Boolean(packageSnapshot?.attached)}
            paused={Boolean(controllerRef.current?.isPaused)}
            onPackageChange={(id) => {
              withPhysics((sim) => {
                sim.selectPackage(id);
                const item = CONFIG.packages.find((p) => p.id === id)!;
                const destinationRoute = routes.find((r) => r.destinationId === item.destination)!;
                setPackageClass(item);
                setSelectedDestination(item.destination);
                setPlaying(false);
                setManualInspection(false);
                playbackTimeRef.current = 0;
                setPlaybackTime(0);
                jointsRef.current = destinationRoute.trajectory.samples[0]!.position;
                setJoints(jointsRef.current);
                setGraspResult(null);
                setGripperOpen(true);
              });
            }}
            onStart={() => {
              setPlaying(false);
              controllerRef.current?.start(packageClass.id);
              activeScenarioRef.current = null;
              syncController();
            }}
            onPause={() => {
              const controller = controllerRef.current;
              controller?.setPaused(!controller.isPaused);
              syncController();
            }}
            onAbort={() => {
              controllerRef.current?.abort();
              syncController();
              if (physicsRef.current) setPackageSnapshot(physicsRef.current.stepFixed(0));
            }}
            onReset={() => {
              const controller = controllerRef.current;
              if (controller?.reset()) {
                const selectedRoute = routes.find(
                  (r) => r.destinationId === packageClass.destination,
                )!;
                jointsRef.current = selectedRoute.trajectory.samples[0]!.position;
                setJoints(jointsRef.current);
                setSelectedDestination(packageClass.destination);
                setPlaybackTime(0);
                playbackTimeRef.current = 0;
                setPackageSnapshot(physicsRef.current?.stepFixed(0) ?? null);
                activeScenarioRef.current = null;
                syncController();
              }
            }}
          />
        </div>
      </section>
      <OperationsDashboard
        snapshot={controllerSnapshot}
        metrics={sessionMetrics}
        events={sessionEvents}
        joints={joints}
        simulationTime={
          (physicsRef.current?.fixedSteps ?? simulationTick) * CONFIG.performance.fixedStepSeconds
        }
        simulationTick={simulationTick}
        fixedStepSeconds={CONFIG.performance.fixedStepSeconds}
        physicsStatus={physicsStatus}
        tcpPose={forwardKinematics(joints, CONFIG)}
        selectedDestination={selectedDestination}
        previewTime={playbackTime}
        previewDuration={route.trajectory.durationSeconds}
        paused={Boolean(controllerRef.current?.isPaused)}
        previewPlaying={playing}
        selectedScenario={selectedScenario}
        scenarioOutcome={scenarioOutcome}
        onScenarioChange={setSelectedScenario}
        onRunScenario={runScenario}
        onExport={exportSession}
      />
      <footer className="footer">
        <span>SORTLAB ENGINEERING · CONFIGURATION-DRIVEN VIEW</span>
        <span>SIMULATED / NOT HARDWARE-VALIDATED</span>
      </footer>
    </main>
  );
}

export default App;
