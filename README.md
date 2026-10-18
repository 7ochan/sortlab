# SortLab

**SortLab — Advanced Warehouse Robotics Digital Twin** is a browser-based engineering project for a simulated SCARA package-sorting workcell. The product is being built in owner-approved phases.

## Current phase

**Phase 6: Validation and evaluation.** Phases 1–5 provide the engineering dashboard and autonomous sorting simulation. Phase 6 adds a headless deterministic campaign harness, measured 100-cycle nominal results, fault-injection campaigns, and broad numerical/physics checks. The latest campaign measured 100/100 verified placements (S 34, M 33, L 33); these are software simulation results, not hardware or sensor validation. Routes do not have swept robot-link/tool collision checks.

The course brief was not available in the inspected workspace. Course-specific dates, marks, formatting, physical-hardware obligations, and AI policy remain unverified; see [the Mission 0 plan](docs/MISSION-0-PLAN.md). Phase boundaries remain in force; Phase 7 requires explicit owner approval.

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
npm run verify:rapier-node # Rapier package/WASM initialization check in Node
npm run smoke:browser # Playwright smoke test against a running Vite URL
npm run validate:campaign # 100 real controller/Rapier cycles + validation campaigns
npm run build         # type checks and production bundle
npm run preview       # serve the production bundle locally
```

For browser smoke testing, start Vite and pass the URL it prints:

```sh
npm run dev -- --host 127.0.0.1
SORTLAB_URL=http://127.0.0.1:5173/ npm run smoke:browser
```

The smoke test uses pinned Playwright Core 1.63.0 and its matching cached Chromium revision 1243; it does not download or install a browser. It checks WebGL 2, the rendered workcell, joint controls and FK readouts, all three route selections, playback/scrubbing, package grasp/carry/release and free fall, one autonomous cycle, nominal S scenario completion, unreachable-route rejection, JSON metrics export, and browser errors/network failures.

See [validation instructions](validation/README.md) to reproduce the deterministic 100-attempt nominal campaign, fault campaigns, kinematics/trajectory checks, and Rapier placement/gripper checks. Generated evidence is stored in `validation/results/`; the measured analysis is in [the Phase 6 validation record](docs/PHASE-6-VALIDATION.md).

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
- [Phase 3 package physics and gripper transfer](docs/PHASE-3-IMPLEMENTATION.md)
- [Phase 4 autonomous sorting controller](docs/PHASE-4-IMPLEMENTATION.md)
- [Phase 5 dashboard, scenarios and metrics](docs/PHASE-5-IMPLEMENTATION.md)
- [Phase 6 validation and evaluation](docs/PHASE-6-VALIDATION.md)

Phase 3 package handling, Phase 4 placement verification, Phase 5 performance metrics, and Phase 6 campaign results are software simulation evidence. Swept-link collision checking, hardware validation, and the final university report remain future work. Phase 7 is not started. No physical test or validated hardware performance is claimed.
