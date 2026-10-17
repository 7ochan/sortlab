# SortLab — Mission 0 Discovery & Engineering Plan

**Prepared:** 2026-10-17
**Status:** Engineering plan finalized for the product requirements supplied in the Mission 0/1 conversation. The local course brief is unavailable, so institution-specific dates, mark allocations, submission format and policy wording remain unverified. That gap does not block the product architecture.

## Executive summary

SortLab is fixed as an advanced warehouse robotics digital twin: a four-axis SCARA-like robot sorts three package classes from one known pickup area into three bins. The final planning choice is a TypeScript/React/Vite browser application with React Three Fiber/Three.js rendering, Rapier 3D deterministic JS physics for package contacts, application-owned analytical kinematics and a fixed-cell clearance-checked waypoint planner. The reasoning, module contracts, simulation loop, fault behavior and limitations are detailed in [Architecture Decision](ARCHITECTURE.md).

The source DOCX is still absent; only course-specific metadata and any requirements outside the supplied project context remain unverified. Node 26.9, npm, Git and the Apple M2 Pro/Mac were observed, and official documentation supports the proposed runtime version ranges. No local package installation, browser check, prototype, test, physical result or simulation benchmark is claimed.

Project folder: ~/Desktop/SortLab. Local Git is on main with no commits and no remote. GitHub CLI reports an invalid saved token, so no GitHub repository has been verified or created. See [GitHub workflow](GITHUB-WORKFLOW.md).

### Evidence labels

- **Confirmed:** observed directly in workspace or command output.
- **Researched:** stated in linked official/project-maintained documentation checked 2026-10-17.
- **Assumption:** provisional design value, not measured or sourced from the assignment.
- **Recommendation:** engineering judgment to validate.
- **Open:** blocked on the brief, owner input, or later verification.

## 1. Requirements and deliverables checklist

Rows C-01 through C-10 are sourced from the owner's Mission 0/1 instructions and supplied project context. They define the requirements baseline for SortLab; they are not fabricated quotations from the unavailable course DOCX. Where the owner described a course requirement (such as weekly submissions or viva), the requirement to investigate it is confirmed while exact dates/rubric wording remain unverified.

| ID | Requirement to verify | Brief source | Planned evidence and verification | Milestone |
|---|---|---|---|---|
| C-01 | Record weekly deliverables, deadlines, marks, and submission format | Mission 0 request; course-specific facts unavailable | Exact course schedule/rubric transcription when DOCX is recovered | Phase 0.1; do not guess dates |
| C-02 | Robot design evidence and engineering calculations | Mission 0 request | Baseline, geometry diagrams, kinematics and load/grip calculations independently recomputed | Phases 1–2; report V1/V2 |
| C-03 | Architecture and robot-configuration comparison | Mission 0 request | Decision record and architecture diagram | Phase 0 complete; report V1 |
| C-04 | Robot anatomy, DOF and workspace | Mission 0 request | Labeled mechanism, joint table and calculated/visualized reachable workspace | Phase 1; report V1/V2 |
| C-05 | Forward/inverse kinematics example | Mission 0 request | Worked calculation plus unit/property tests and numeric cross-check | Phase 1; report V1/V2 |
| C-06 | Actuator, end-effector and holding-force calculations | Mission 0 request | Assumptions, equations, safety factors, force/torque budgets; no unsourced motor selection | Phase 1; report V1/V2 |
| C-07 | Control sequence, fault handling, waypoints and cubic trajectory | Mission 0 request | State diagram, routes, trajectory derivation and fault coverage | Phases 2–4; report V2/V3 |
| C-08 | Safety analysis | Mission 0 request | Hazard/risk analysis; explicit virtual-vs-physical limitations | Phases 0/4/6; report V2/V3 |
| C-09 | Demonstration, references, version history and viva expectations | Mission 0 request | Run script, source register, cumulative report history, demo and viva pack | Phase 6; report V3 |
| C-10 | Hardware/software/simulation constraints and AI assistance rules | Mission 0 request | Verify exact course policy when available; maintain assistance and validation record | Phase 0.1 and throughout |
| C-11 | One pickup area, three destination bins, three package categories | Fixed Mission 0/1 project definition | Shared configuration and cell model; all three nominal sort outcomes verified | Phases 1–4 |
| C-12 | Complete detect/approach/grip/lift/transfer/place/release/return sequence | Fixed product goals | State/event trace and full visible cycles | Phases 3–4 |
| C-13 | Interactive workcell, interface, state, configuration, history and metrics | Fixed product goals | Browser interaction checks and metric reconciliation against event log | Phases 4–5 |
| C-14 | Identification, motion planning, reachability and collision/clearance | Fixed product goals | Deterministic simulated ID, FK/IK, route validation and runtime stop cases | Phases 1–3 |
| C-15 | Fault scenarios, automated tests and reproducible evaluation | Fixed product goals | Unit/integration/E2E suites and seeded run artifacts | Phases 2–6 |
| C-16 | Diagrams, calculations, technical docs, cumulative report, demo and viva prep | Fixed product goals | Traceable released evidence and owner teach-back | Throughout; release Phase 6 |
| C-17 | Distinguish assumptions, predictions, simulation results and physical results | Mission 0 integrity requirements | Every data item has provenance label; no physical claims without physical measurement | Every phase/report |

**Mandatory vs optional:** C-11–C-17 are fixed product/integrity requirements from the supplied project context. C-01–C-10 are course-related topics explicitly asked for; exact deadlines, rubric weighting, submission format, and institution policy must be verified from the actual brief. Extra camera vision, arbitrary warehouse path planning, industrial dynamics and physical hardware are not baseline deliverables; add only if the course later requires them and scope allows.

## 2. Current-state assessment

### Workspace

- **Confirmed:** Desktop has many unrelated folders and projects; its root is not a Git repository.
- Exact-name and case-insensitive searches under Desktop did not find Robotics Course Project Brief.docx or another robotics course brief.
- No existing robotics source project was identified. A new isolated folder, SortLab, was created; no other project was changed.

### Environment observed 2026-10-17

| Item | Observation | Practical effect |
|---|---|---|
| Machine | MacBook Pro, Apple M2 Pro, 16 GB RAM | Likely adequate for a modest browser scene; actual performance unmeasured |
| OS | macOS 27.0.1, arm64 | Prefer browser/cross-platform tooling; verify native software on this environment |
| Node/npm | v26.9.0 / 11.19.1 | JS tooling available; package compatibility unverified |
| Python | 3.14.7 | Available; robotics-library compatibility not assumed |
| Git | 2.55.0 | Local history available; repository initialized |
| GitHub CLI | 2.96.0; saved token invalid per gh auth status | Local private push blocked until browser re-auth; no remote configured |
| Docker | CLI present; daemon socket unavailable | Container execution unavailable at inspection; don't require Docker |
| ROS 2, Gazebo, Blender | Commands not found on PATH | Not installed in checked command locations |
| LibreOffice | Not found; soffice at ~/.local/bin/soffice | Document rendering may be possible later; not tested |
| Disk | Approximately 255 GiB free on reported data volume | No apparent disk constraint |

### Unresolved questions

1. The official DOCX was not present in Desktop. Course-specific dates, marks, submission formatting and exact policy wording remain unverified, but the product direction and architecture are fixed from the supplied project context.
2. GitHub CLI authentication is invalid. See [GitHub workflow](GITHUB-WORKFLOW.md) for secure browser-login recovery; no remote exists yet.
3. Available weekly effort and physical hardware access remain unknown. The baseline is simulation-only.
4. No candidate package was installed or tested. Official-documentation compatibility findings are in [Architecture Decision](ARCHITECTURE.md).

## 3. Technology evaluation

### Evaluated alternatives and final selection

| Candidate | Advantages | Trade-offs and risk | Assessment |
|---|---|---|---|
| **React 19 + TypeScript + Vite + R3F 9 + Three.js/WebGL2 + Rapier 3D deterministic JS/WASM** | Integrated dashboard and scene; documented version families fit observed Node; package contacts; deterministic physics variant; browser delivery on current Mac. | Application owns IK/control/clearance; grasp is simplified and not hardware-calibrated. Browser WebGL2 and exact peer/build compatibility need a bounded Phase 1 check. | **Selected stack.** Details in ARCHITECTURE.md. |
| Webots | Integrated joints, sensors and physics; Apache-2.0. | Separate native simulator/UI, more setup and model/controller learning. | Not selected; reopen only if the course/lab explicitly requires it. |
| Gazebo Harmonic + ROS 2 | Broad robotics ecosystem. | macOS best-effort/GUI caveats and significant native/version setup on this ARM Mac. | Not selected for this fixed cell. |
| CoppeliaSim | Capable manipulator simulator. | Adds an app and integration surface without a known rubric benefit. | Not selected. |
| Three.js without physics | Light renderer-only fallback. | Contact/grasp/falls become scripted. | Fallback only if Rapier integration proves unreliable. |

### Alternatives and recommended choices by concern

| Concern | Recommendation | Trade-off |
|---|---|---|
| Robot | 4-axis SCARA-like arm: two horizontal rotary links, vertical slide, wrist yaw. | Fits repeated pick/place; analytic planar IK is explainable and testable. |
| Kinematics | Analytic 2R planar FK/IK plus independent Z and wrist axes; expose elbow branches, singularities and limits. | Transparent and teachable; requires careful frame convention and no hidden black-box planner. |
| Visualization/physics | Three.js via R3F; Rapier deterministic JS/WASM for package contacts; arm remains kinematic. | Integrated web product, not calibrated industrial dynamics. |
| Package ID | Visible labels/colors plus deterministic simulated barcode result at inspection station. | This is a simulated input, not an implemented vision system. Add camera classification only if required and feasible. |
| Motion/collision | Fixed waypoint graph, analytic IK, sampled swept-clearance on cubic joint paths, alternate elbow/high-transit candidates and runtime guard. | Auditable fixed-cell planning; kinematic links require application-owned collision stops. |
| Gripper | Two-jaw parallel gripper; explicit opening and force model; confirm grasp/release through simulated condition. | More suitable for varied boxes than suction but requires a friction assumption and package-compression caveat. |
| Control/faults | Finite-state machine with timeout, missed-grip, unknown-ID, blocked-bin, pause/rehome and safe fault states. | Clear and testable; UI must not become a second controller. |
| UI | Browser dashboard and 3D scene; controls, state, outcomes, simulated cycle-time/throughput, log and fault injection. | Single integrated deliverable; keep metrics definitions visible. |
| Tests | Vitest for math/controller/scenarios; Playwright for browser end-to-end flows. | Current Node/macOS meet documented Vite/Playwright floors; exact versions and browser path are not yet tested. |
| Docs | Source-controlled Markdown, Mermaid, diagrams and cumulative report; export once course format is known. | Avoid premature report tooling decision. |

Decision criteria: fit to supplied product goals; execution on current Mac; transparent calculations; integrated UI/scene; reproducible evaluation; no-cost permissive tools; individual-project setup effort. The browser stack is selected. The missing course DOCX remains a compliance-data dependency, not a reason to defer the architecture.

## 4. Final system architecture

The component diagram, data flow, fixed-step simulation loop, state machine, path strategy, UI contract and metrics are defined in [Architecture Decision](ARCHITECTURE.md). The architecture separates domain math/controller logic from rendering and physics. One validated configuration is the source of all values; the interface displays read-only state. Only controller verification increments sorted totals.

## 5. Engineering baseline

All numbers are **provisional assumptions**, not assignment values or measured specifications. The consolidated source is [Engineering Baseline](ENGINEERING-BASELINE.md); keep later config, diagrams, calculations and report synchronized with it.

### Robot and stations

- SCARA-like 4 arm DOF: J1 shoulder revolute, J2 elbow revolute, J3 vertical prismatic, J4 wrist revolute. Gripper opening is an end-effector actuator, not an arm DOF.
- Frames: X forward, Y lateral, Z up; metres; radians internally.
- Link lengths L1=0.30 m, L2=0.25 m. Ideal radial workspace 0.05–0.55 m before joint limits, body envelopes, self-collision and access. This is not the verified workspace.
- Provisional limits: J1 ±150°, J2 ±160°, TCP world-Z range 0.30–0.58 m (0.28 m travel), J4 ±180°. The center-bin point is near the folded-arm boundary.
- Table plane z=0.25 m; input belt support z=0.35 m; bin floor z=0.30 m and lip z=0.46 m; transfer TCP z=0.54 m; home TCP near (0.30, 0, 0.56) m.
- Pick center (0.30, 0.00) m. Bin centers: B1 (-0.15, 0.25), B2 (-0.15, 0.00), B3 (-0.15, -0.25) m. Bin support z=0.30 m. Points fit the ideal annulus but limits and clearances are unverified.
- Gripper opening 0.03–0.16 m and virtual capacity 25 N per jaw; simple jaw pads; side-face grasp; no deformable packages or selected physical actuator.

### Package classes and simulated ID

| Class | Nominal L×W×H | Assumed mass | Route |
|---|---:|---:|---|
| Small | 0.08 × 0.06 × 0.04 m | 0.10 kg | B1 |
| Medium | 0.12 × 0.09 × 0.06 m | 0.30 kg | B2 |
| Large | 0.16 × 0.12 × 0.08 m | 0.60 kg | B3 |

These values are illustrative, not a measured population. Color/label is display-only; logic consumes structured ID data. Baseline category ID is a deterministic simulated barcode read at a fixed inspection point. Unknown/misread cases are scenario faults. No camera or classifier is claimed.

### Preliminary grip-force calculation

For equal normal force N on each jaw in a two-sided vertical friction grasp:

2 μ N ≥ S m (g + a_z), so N ≥ S m (g + a_z) / (2 μ).

Assume worst package m=0.60 kg, safety factor S=2.0, g=9.81 m/s², vertical acceleration a_z=0.30 m/s², and jaw/package friction μ=0.50. Required normal force is 12.13 N per jaw (about 12.1 N). If μ=0.30, this rises to 20.2 N per jaw. This is an estimate, not a selected or tested actuator rating. Actual friction, compression limit, acceleration, alignment and actuator margin remain unknown.

### Calculations and checks still required

- Worked FK/IK example for actual targets, both elbow branches, limit filtering and forward-substitution.
- Reachability of each pre-grasp/grasp/lift/transit/place/retreat waypoint including TCP, package envelope, bin lip and obstacles.
- J1/J2 torque and speed from link/payload masses and inertia; Z-axis thrust from moving mass, gravity and acceleration; wrist and gripper margins. Link mass and motor ratings are open.
- Cubic trajectory coefficients from declared endpoint position/velocity; sampled position, velocity and acceleration checked against limits.
- Self-collision, conveyor/bin/guard clearances, drop zone and recovery pose.

### Provisional evaluation targets (not results)

- Median simulated cycle ≤12 s from pick request to release and return-ready, for a fixed scenario mix.
- ≥95% correct placement over at least 100 deterministic nominal simulation trials; report sample count, failures and distribution.
- Every nominal waypoint has a within-limit solution and clearance above a configured minimum.
- Every named fault reaches a documented safe/reject/recovery outcome within a bounded timeout; nothing silently counts as sorted.
- Repeated code/config/seed should reproduce event logs and pass/fail outcomes. Physics timing cross-platform determinism must be demonstrated before claiming it.
- UI automation verifies each control and state outcome.

Targets may change after rubric review and baseline measurement. No target has been achieved yet.

## 6. Verification strategy

| Area | Planned check | Evidence |
|---|---|---|
| Traceability | Every brief clause gets ID, page, artifact, check and milestone | Final matrix with no unmapped mandatory clause |
| Kinematics | Known poses, FK/IK round trips, branches, singular/limit/unreachable and units | Tests plus hand-worked example |
| Reachability | Joint limits and station/tool/package envelopes; clearance | Reachability table and workspace plot |
| Trajectory | Endpoints, declared boundary velocities, continuity and derivative limits | Derivation and numeric assertions |
| Gripper | Worst payload force, friction/acceleration sensitivity and actuator margin | Recomputable force budget; no physical claim |
| Controller/faults | Nominal classes, unknown ID, missed grip, blocked/full bin, collision guard, timeout, reset | Transition coverage, event traces, bounded outcomes |
| Simulation | Complete cycle, contact/drop/release and replay | Run log and actual capture only after implementation |
| UI | Start/pause/step/reset/scenario/fault controls, counters and state | Browser automation |
| Evaluation | Fixed seeds, explicit cycle-time definition, nominal campaign and faults | Versioned config/results and environment metadata |
| Safety | Simulated hazard review and virtual interlock limitations | Risk register; distinguish from safety-rated hardware |
| Consistency | Compare code config, model, diagrams, calculations, report and UI | Per-release consistency checklist |

There is no implementation, so no tests were run in Mission 0.

## 7. Phased roadmap

Effort is a rough estimate in focused person-days (about 5–6 hours/day); schedule cannot be assigned without course dates. Owner approval is required at each phase boundary.

| Phase | Deliverables and dependencies | Acceptance criteria | Risks | Estimate |
|---|---|---|---|---:|
| **0 Plan and repository (current)** | Architecture, engineering baseline, checklist, Git workflow and research. Product architecture does not depend on the unavailable DOCX; private push needs valid GitHub authentication. | Four planning docs reviewed; user-supplied requirements mapped; private main push verified when authentication is restored. Current blocker: invalid token. | Push unavailable yet | 1–2 d |
| **1 Foundation and kinematics** | After explicit approval: scaffold Vite/React/TypeScript; pin compatible dependencies; validate config; render workcell/articulated SCARA; implement pure FK/IK/workspace and tests. | Repeatable clean dependency install; WebGL2 scene shows arm and all bins; FK→IK→FK errors ≤1e-6 m and ≤1e-6 rad on references; rejects invalid/limit cases; tests pass. | Peer/WebGL/coordinate errors | 4–6 d |
| **2 Trajectory and route planning** | Cubic joint profiles; approach/lift/transfer/place/home waypoint graph; branch selection and sampled swept clearance. Requires Phase 1. | Endpoints and derivative tests pass; no speed/acceleration bound is exceeded; all nominal route samples meet clearance; blocked route fails before movement. | Clearance/layout conflict | 4–6 d |
| **3 Physics and gripper transfer** | Fixed-step Rapier package world, cell colliders, virtual jaw/grasp criteria, attach/release and contact guard. Requires Phase 2. | Fixed tick independent of render frame; each item grasps/releases; release is dynamic; contact stop latches; no object duplicates/disappears. | Physics/contact tuning | 4–6 d |
| **4 Sorting controller and full cycle** | Finite-state machine, simulated barcode ID, retries, timeout, recovery, visible nominal cycles. Requires Phases 1–3. | All three classes reach assigned bins and return; item counts reconcile; every fault reaches bounded safe state; faulted items never count sorted. | State/physics races | 4–6 d |
| **5 Dashboard, scenarios and metrics** | Operating controls, state/history, fault/scenario selection, metric definitions and exports. Requires Phase 4. | Each UI action maps to controller outcome; displayed events/counters reconcile; fixture metrics match hand calculation; used config is visible. | UI/controller divergence | 4–6 d |
| **6 Validation and evaluation** | Unit/integration/browser suites; nominal/fault campaigns; reproducible run metadata. Requires Phase 5. | Suites pass; ≥100 nominal cycles meet ≥95% correct-sort goal or report gap; every fault covered; same config/seed/runtime reproduces event outcomes; results labeled simulated. | Reliability below target | 4–7 d |
| **7 Report, demo and viva** | Cumulative V1/V2/V3 report, diagrams/calculations, run guide, polished demo and owner teach-back. Requires validated evidence and course format. | Every supplied requirement has evidence; assumptions/results distinguished; demo is repeatable; owner can explain FK/IK, grip force, trajectory, faults and safety limits. | Dates/format still unverified | 5–8 d |

## 8. University submission strategy — cumulative report

These labels are proposals, not confirmed university submission versions or dates.

- **Version 1.0 — concept and feasibility:** requirements, configuration comparison, architecture, anatomy/DOF/workspace, assumptions, initial kinematics and load estimates, risks, references and changelog. Tailor to the actual first milestone.
- **Version 2.0 — detailed design/control:** retain and update Version 1; add finalized geometry, FK/IK, reachability, actuator/gripper estimates, waypoints, cubic trajectory, state/fault/safety diagrams and simulator design. Explain substantive changes.
- **Version 3.0 — validated final:** same cumulative report; add integrated simulation evidence, simulated test results with sample counts/config/seed, faults, limitations, run instructions, demo/viva appendix and final references. Physical results only if actually measured.

Follow exact required naming, format, reference style, limits, medium and dates once the brief is read. Keep a version history; do not fabricate screenshots, hardware evidence or performance.

## 9. Risk register

| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| Course DOCX missing | Medium / medium | Product architecture uses supplied mission requirements; exact marks, dates, format, AI wording and any extra clause remain flagged, then map them when the DOCX is available. |
| GitHub token invalid | High / medium | Complete browser auth; inspect/create private repo only after successful status; verify visibility and pushed branch. |
| Physics looks more realistic than it is | Medium / high | Separate analytic math from contact simulation; label simplifications and results; test invariants. |
| Reachability or collision fails | Medium / high | Check all tool/package envelopes in Phase 1; adjust stations before UI polish. |
| WASM/package compatibility on Mac/Node | Medium / medium | Small locked-version spike; record browser/runtime; don't install large native stack by default. |
| Feature creep | High / high | Rubric-first baseline; add enhancements after a complete cycle passes. |
| Physical build required but unavailable | Medium / critical | Confirm brief; seek course clarification if ambiguous; don't equate simulation with hardware validation. |
| Parameters drift across artifacts | Medium / high | Single config, generated values, release consistency gate. |
| Friction or package crush invalidates grip math | Medium / high | Sensitivity analysis; physical build requires measured friction and crushing limit. |
| AI policy or shallow understanding | Medium / critical | Read brief policy; maintain AI assistance log; owner checks every calculation and practices explanation. |
| Simulated measurements presented as real | Low / critical | Label every result; retain raw counts/run metadata; physical claims need physical tests. |
| Report polish delays required work | Medium / high | Build evidence in rubric order; maintain cumulative report incrementally. |

## 10. Immediate next step — proposed Phase 1, not authorized yet

**Prerequisites:** owner explicitly approves Phase 1. The supplied mission defines the product baseline; incorporate any additional constraints if the course DOCX becomes available. Restore GitHub CLI authentication to push the planning milestone privately.

**Scope:** scaffold Vite + TypeScript + React with stable pinned dependencies; validate one cell configuration; implement the SCARA joint hierarchy and pure analytic FK/IK/workspace functions; render the static workcell and articulated arm in WebGL 2; add kinematics/config tests; run a bounded WebGL 2 and Rapier deterministic-compat initialization check. Do not implement sorting control, package physics, gripper transfer, the full dashboard or fault scenarios in Phase 1.

**Completion criteria:**

1. A clean dependency install and documented dev command work on the owner's Mac with pinned lockfile versions.
2. Browser shows the labeled cell, robot and four arm joints; all values use documented SI frames.
3. Unit tests cover known FK, both IK branches, round-trip error ≤1e-6 m/1e-6 rad, unreachable/invalid targets, joint limits and malformed config.
4. Pick/bin targets each have a valid in-limit IK branch and recorded joint-limit margin; route clearance is deferred to Phase 2.
5. WebGL 2 renders and Rapier deterministic-compat initializes/steps in the bounded spike; record exact versions and actual output.
6. No physical or unverified performance claim is made. Push the Phase 1 milestone to private main if GitHub auth is working.
7. Owner reviews Phase 1 evidence and explicitly approves Phase 2.

## 11. Research register

Official/project-maintained documentation checked 2026-10-17. It supports the cited capabilities/caveats, not a claim that any simulator has run locally.

| Topic | Finding | Source |
|---|---|---|
| Gazebo support | Harmonic LTS through May 2029; Ubuntu amd64 official support, macOS best-effort; macOS guide notes GUI instability and separate server/GUI processes. | [Install/platforms](https://gazebosim.org/docs/harmonic/install/), [macOS getting started](https://gazebosim.org/docs/harmonic/getstarted/), [release lifecycle](https://gazebosim.org/docs/harmonic/releases/) |
| ROS integration | Gazebo comparison lists ros_gz support for ROS 2 Jazzy (binary) / Rolling (source); this does not establish convenient installation on this Mac. | [Gazebo feature comparison](https://gazebosim.org/docs/harmonic/comparison/) |
| Webots | Integrated physics-based simulator; guide states Apache 2.0 open source; standard ROS controller is Linux-only while a custom Python ROS controller supports macOS with extra setup. | [Introduction](https://cyberbotics.com/doc/guide/introduction-to-webots?version=released), [license](https://cyberbotics.com/doc/guide/foreword?version=R2023a), [ROS guide](https://cyberbotics.com/doc/guide/using-ros?version=2a3f8c3) |
| Three.js | WebGLRenderer uses WebGL2 (WebGL1 unsupported since r163); docs advise setAnimationLoop for compatibility. | [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer) |
| React/Vite compatibility | Current React docs list v19.3; R3F v9 pairs with React 19; Vite requires Node 20.19+ or 22.12+. | [React versions](https://react.dev/versions), [R3F installation](https://r3f.docs.pmnd.rs/getting-started/installation), [Vite guide](https://vite.dev/guide/) |
| Rapier physics | Deterministic JS/WASM variant exists; kinematic bodies ignore contact forces, so collision stop is application-owned. Compatibility package embeds WASM. | [Determinism](https://rapier.rs/docs/user_guides/javascript/determinism/), [body types](https://rapier.rs/docs/user_guides/javascript/rigid_body_type/), [deterministic compat package](https://www.npmjs.com/package/%40dimforge/rapier3d-deterministic-compat) |
| Testing | Vitest uses Vite and documents Node support; current Playwright docs support Node 22/24/26 and macOS 14+. | [Vitest](https://vitest.dev/guide/index.html), [Playwright requirements](https://playwright.dev/docs/next/intro) |
| GitHub privacy | Private repository access is limited to owner, explicitly authorized users and applicable organization members; CLI supports private repository creation. | [Repository privacy](https://docs.github.com/en/repositories/creating-and-managing-repositories/about-repositories), [create repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository) |

## Owner review and approval gates

1. Restore GitHub authentication so the intended private SortLab remote can be created and planning documents pushed to main.
2. Optionally provide the course DOCX to fill institution-specific dates, marks, formatting and policy text; it does not change the selected product architecture absent a genuine conflicting requirement.
3. Explicitly approve Phase 1 before implementation begins.

**Mission 1 planning is complete. No Phase 1 implementation is authorized by this plan.**
