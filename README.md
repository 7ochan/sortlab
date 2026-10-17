# SortLab

**SortLab — Advanced Warehouse Robotics Digital Twin** is a browser-based engineering project for a simulated SCARA package-sorting workcell. The product is being built in owner-approved phases.

## Current phase

**Phase 2: Trajectory and route planning.** SortLab now includes the Phase 1 TypeScript/React/Vite foundation, validated engineering baseline, SCARA FK/IK and workspace analysis, constraint-checked cubic joint trajectories, fixed-cell Cartesian waypoint routes to all three bins, an interactive 3D route overlay, route selection, playback/scrubbing, and direct joint inspection. The preview is kinematic only: it does not sort or transfer packages and does not validate collision clearance.

The course brief was not available in the inspected workspace. Course-specific dates, marks, formatting, physical-hardware obligations, and AI policy remain unverified; see [the Mission 0 plan](docs/MISSION-0-PLAN.md). Phase boundaries remain in force; Phase 3 requires explicit owner approval.

## Requirements

- Node.js 20.19+ (or 22.12+); npm 11 was used for the lockfile. Node 26 was the observed development runtime.
- A modern browser with WebGL 2 for the workcell view.
- Git for source history. `package-lock.json` locks direct and transitive npm dependencies.

## Setup and commands

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. The direct joint sliders update the same joint state used by the FK display and 3D arm hierarchy.

```sh
npm run format:check  # formatting verification
npm run lint          # ESLint
npm run typecheck     # browser and Vite configuration TypeScript checks
npm test              # deterministic Vitest unit tests
npm run verify:rapier-node # bounded Rapier package/WASM initialization check in Node
npm run smoke:browser # Playwright smoke test against a running Vite URL
npm run build         # type checks and production bundle
npm run preview       # serve the production bundle locally
```

For browser smoke testing, start Vite and pass the URL it prints:

```sh
npm run dev -- --host 127.0.0.1
SORTLAB_URL=http://127.0.0.1:5173/ npm run smoke:browser
```

The smoke test uses pinned Playwright Core 1.63.0 and its matching cached Chromium revision 1243; it does not download or install a browser. It checks WebGL 2, the rendered workcell, joint controls and FK readouts, all three route selections, playback/scrubbing, browser errors/network failures, and the bounded Rapier initialization result.

Use `npm run format` to format application/config source. No course report export is generated yet.

## Engineering conventions

World frame W is right-handed: X forward, Y lateral, Z up; positive revolute rotation is about +Z, counterclockwise viewed from +Z. SI units are used internally; J1, J2, and J4 are radians; J3 is TCP world-Z in metres. The exact provisional values live in [the validated configuration](src/engineering/config.ts), and the equations, branch rules, workspace distinctions, tolerances, and limitations are in [Phase 1 implementation notes](docs/PHASE-1-IMPLEMENTATION.md).

## Documentation and project status

- [Mission 0 requirements and roadmap](docs/MISSION-0-PLAN.md)
- [Architecture decision and module boundaries](docs/ARCHITECTURE.md)
- [Engineering baseline](docs/ENGINEERING-BASELINE.md)
- [GitHub workflow and current access status](docs/GITHUB-WORKFLOW.md)
- [Phase 1 implementation and verification record](docs/PHASE-1-IMPLEMENTATION.md)
- [Phase 2 trajectory and route implementation](docs/PHASE-2-IMPLEMENTATION.md)

Phase 2 adds fixed-cell kinematic route planning and trajectory preview. Collision-checked swept paths, package dynamics, grasp and release behavior, sorting control, fault scenarios, performance campaigns, and the operational dashboard remain future work. No physical test or validated hardware performance is claimed.
