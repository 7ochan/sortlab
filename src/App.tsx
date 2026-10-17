import { Component, useState, type ReactNode } from 'react';
import { CONFIG } from './engineering/config';
import { Workcell } from './components/Workcell';
import { StatusPanel } from './components/StatusPanel';
import type { JointState } from './engineering/types';
import './styles.css';

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
  const [joints, setJoints] = useState<JointState>(CONFIG.robot.home);
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
          PHASE 01 · ENGINEERING FOUNDATION
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
          <p>Baseline geometry, analytical kinematics and interactive joint inspection.</p>
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
                <Workcell joints={joints} />
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
          </div>
        </div>
        <StatusPanel joints={joints} onChange={setJoints} />
      </section>
      <footer className="footer">
        <span>SORTLAB ENGINEERING · CONFIGURATION-DRIVEN VIEW</span>
        <span>SIMULATED / NOT HARDWARE-VALIDATED</span>
      </footer>
    </main>
  );
}

export default App;
