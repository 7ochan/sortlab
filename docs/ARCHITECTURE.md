# SortLab Architecture Decision

**Status:** selected planning baseline; not implemented or locally tested

**Date:** 2026-10-17

## Selected stack

- TypeScript + React 19 + Vite for application logic, UI, and development server.
- React Three Fiber 9 + Three.js/WebGL 2 for the interactive scene.
- Rapier 3D JavaScript deterministic compatibility build for fixed-step package physics, colliders, contact events, and grasp/release constraints.
- Application-owned analytic SCARA FK/IK, collision/clearance checks, cubic joint trajectories, and finite-state sorting controller.
- Vitest for unit and deterministic scenario tests; Playwright for browser end-to-end checks.
- Markdown + Mermaid as source documentation; cumulative report export follows the university format.

Use compatible stable versions pinned in package-lock.json; avoid canary/alpha and unpinned latest. React 19.3 is listed as current, and R3F v9 pairs with React 19. Vite's documented Node floor is 20.19 or 22.12; Playwright supports Node 22/24/26 and macOS 14+. Observed Node 26.9 and macOS 27.0.1 satisfy those stated floors. Browser/WebGL and exact peer compatibility remain a Phase 1 local check, not a claim of tested installation. [React versions](https://react.dev/versions), [R3F compatibility](https://r3f.docs.pmnd.rs/getting-started/installation), [Vite requirements](https://vite.dev/guide/), [Playwright requirements](https://playwright.dev/docs/next/intro).

### Rationale and scope

The interface and 3D workcell need shared live state; the browser stack delivers these together on the available Mac without requiring a ROS/native-simulator setup. TypeScript domain logic can be tested independently of rendering. Rapier adds meaningful package contact/fall/release behavior.

This is a kinematic educational digital twin, not an industrial dynamics twin: robot motion follows commanded joints and explicit speed/acceleration limits; link inertia, calibrated motors, compliance and safety-rated controls are not modeled. Rapier is not the robot controller. Its kinematic bodies ignore contact forces, so application collision queries and controller stops are mandatory. [Rapier body types](https://rapier.rs/docs/user_guides/javascript/rigid_body_type/).

Webots remains a contingency only if the course expects a dedicated robotics simulator. Gazebo Harmonic + ROS 2 is not selected because official docs describe macOS as best-effort and its GUI as unstable; the extra ROS/native setup is not justified for this fixed four-axis cell. CoppeliaSim adds another app/integration surface. A hand-scripted Three.js-only animation is a fallback if physics integration fails. General RRT/MoveIt is unnecessary for three fixed stations: use a bounded waypoint graph with complete collision checks. [Gazebo support caveats](https://gazebosim.org/docs/harmonic/install/), [macOS behavior](https://gazebosim.org/docs/harmonic/getstarted/).

## Architecture and module contracts

~~~mermaid
flowchart LR
  UI[React dashboard] -->|typed commands| CTRL[Sorting state machine]
  CFG[Cell configuration] --> CTRL
  CFG --> KIN[SCARA FK / IK]
  SCEN[Seeded scenarios] --> CTRL
  ID[Simulated barcode] --> CTRL
  CTRL --> PLAN[Waypoint graph and clearance]
  KIN --> PLAN
  PLAN --> TRAJ[Cubic joint trajectories]
  TRAJ --> LOOP[Fixed 1/60 s simulation loop]
  LOOP --> ARM[Kinematic robot and gripper]
  LOOP --> PHYS[Rapier package world]
  ARM --> PHYS
  PHYS -->|contact and placement events| CTRL
  ARM --> VIEW[Three.js workcell]
  PHYS --> VIEW
  CTRL --> EVT[Events and metrics]
  EVT --> UI
  TESTS[Vitest + Playwright] -.verify.-> KIN
  TESTS -.verify.-> PLAN
  TESTS -.verify.-> CTRL
  TESTS -.verify.-> UI
~~~

| Module | Owns | Interface |
|---|---|---|
| Domain/config | Units, geometry, limits, speeds, package/bin definitions, scenarios | Validated immutable config |
| Kinematics | FK/IK, elbow branches, wrist yaw, singularities and limit margins | Pose ↔ joint solution with explicit failure reason |
| Route planner | Named waypoint graph, sampled link/package clearance, branch choice, route failure | Validated trajectory waypoint list and minimum margin |
| Trajectory | Cubic joint profiles and position/velocity/acceleration checks | Timestamped joint states |
| Controller | State transitions, ID routing, retries, timeouts, fault latch, event generation | Typed commands/events |
| Simulation adapter | Fixed clock, Rapier world, arm transforms, package lifecycle, grasp/release and contact reporting | Simulated observations to controller |
| Presentation | Scene geometry, camera, UI controls and read-only state display | Commands to controller; events/metrics from controller |
| Evaluation | Seeded scenario sets, run definitions, aggregation and export of raw simulated results | Versioned JSON/CSV run data |
| Documentation | Requirement mapping, assumptions, calculations, diagrams, cumulative report history | Evidence traceability |

## Simulation loop and data flow

1. A typed start command selects a versioned configuration and seeded scenario.
2. The controller consumes a simulated barcode ID (not camera vision), resolves its bin, requests approach/grasp/lift/transfer/place/retreat/home targets.
3. FK/IK checks pose, joint limits and branches. A waypoint graph tries the preferred elbow solution, alternate branch, then elevated transit route.
4. All cubic joint segments are sampled against arm links, package envelope, conveyor and bins. A complete path must pass clearance before the arm moves.
5. Control and physics advance on a fixed 1/60 s tick with capped catch-up. Rendering interpolates state separately at display refresh; frame rate never defines cycle time. Pause/step act on simulation ticks.
6. Kinematic robot links are updated from joint state. Rapier advances package bodies and reports contacts. Collision guard checks every fixed tick and latches a stop on unsafe contact; physics does not stop the kinematic arm by itself.
7. Grasp qualifies only when package center/contact is within capture tolerance, jaw opening fits, force demand is below configured virtual capacity, and route/pose checks pass. A fixed constraint attaches the package for transport; release removes the constraint and returns the package to dynamic physics.
8. Placement is counted only when the package settles inside the assigned bin. Every transition has an event and timeout. Cycle time is pick-cycle start through verified release and return-ready in simulated seconds.

The browser animation loop is not the simulation clock. Use an accumulator with a fixed 1/60-second control/physics step and a documented cap on catch-up steps. Pause and single-step operate on simulation ticks.

## State machine and fault behavior

Idle → Validate → Identify → PlanApproach → Approach → Grip → VerifyGrip → Lift → PlanTransfer → Transfer → Place → Release → VerifyPlacement → ReturnHome → Complete.

- Unknown ID: hold at pickup, log, await operator reset; never guess destination.
- Missed grasp: one controlled retry; second miss enters failed/recovery with no success count.
- Full/blocked bin or no valid route: stop before entry and wait/report.
- Collision guard, trajectory timeout or simulated emergency stop: stop commanded motion, latch a fault; checked home/reset is operator initiated.
- Failed placement check: no sort credit; pause for recovery.
- Reset must preserve one clear owner for each package so it cannot duplicate or vanish.

## Planning, UI and metrics

Planner is fixed-cell rather than general warehouse navigation. It checks IK, limits, joint-space cubic samples, tool/package envelopes, link clearance and bin entry. If direct motion is blocked, try the alternate elbow branch and elevated transit waypoint. Physics contact is a runtime backstop, not proof of swept-volume safety. Sample spacing and minimum clearance are set and checked in Phase 1.

UI: 3D cell; operating state; selected ID/bin; start/pause/step/reset; scenario/fault controls; joint pose/limit warning; event history; configuration assumptions; sorted/failed counts; run/seed; cycle-time median and 95th percentile; throughput; explicit simulated-results label.

Metrics: correct-sort fraction, wrong-bin count, retry rate, faults/recoveries, cycle-time distribution, packages per simulated minute, unreachable-route count, and minimum path clearance. Each metric records denominator, run length, config version, seed, timestep, software lockfile and runtime.

## Verification

- Vitest: FK/IK round trips and branches, limits/singularities, workspace, cubic coefficients/derivatives, force/clearance formulae, controller transitions and metric arithmetic.
- Scenario tests: all three nominal package types plus each injected fault; expected terminal state and exact item counts.
- Playwright: load, start/pause/step/reset, scenario/fault controls, visible transfer, UI/event/count agreement.
- Engineering review: independently recompute representative kinematics and grip force; review clearance and diagrams.
- Evaluation: at least 100 nominal cycles plus repeated fault cases. All outputs labeled simulated.

The deterministic Rapier JS/WASM variant is selected to improve repeatability. Rapier documents cross-platform deterministic execution but requires identical initialization/order/steps; initialization math such as sin/cos may vary. We therefore require fixed-step, seeded scenarios and claim only repeatability demonstrated for the recorded app/runtime. The compat build embeds WASM, increasing bundle size for simpler bundler support; cell scale is small. [Rapier determinism](https://rapier.rs/docs/user_guides/javascript/determinism/), [package variants](https://www.npmjs.com/package/%40dimforge/rapier3d-deterministic-compat).

## Limits and licenses

No real camera, barcode hardware, calibrated motor torque/current, link flexibility, gear backlash, contact compliance, industrial safety, stopping distance, physical throughput, endurance or hardware result is claimed. "Digital twin" means a software model of the proposed cell, not a live-connected physical installation.

Current package listings/docs identify R3F as MIT and Rapier JS as Apache-2.0. Retain third-party notices and verify selected dependency licenses before release. [R3F license](https://github.com/pmndrs/react-three-fiber/blob/master/LICENSE), [Rapier package](https://www.npmjs.com/package/%40dimforge/rapier3d-deterministic-compat).
