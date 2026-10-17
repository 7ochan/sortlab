# Phase 3 — Package Physics and Gripper Transfer

**Status:** Implemented locally on `main`. This phase adds manual package handling to the Phase 2 kinematic preview. It does not implement autonomous sorting or Phase 4 control.

## Implemented behavior

- `src/engineering/packagePhysics.ts` owns Rapier initialization, the 1/60 s fixed world, environment/package colliders, package selection/reset, gripper alignment/contact checks, attachment, carry, release and cleanup. The app owns one simulation instance and uses a six-step-per-render accumulator cap; the renderer does not determine the physics timestep.
- The physics scene contains a static table, conveyor support and three bins with floors and walls. The SCARA remains a kinematic visual driven by the existing FK and route state; robot link bodies, motor dynamics and link-package collision are not modeled.
- One package body exists at a time. S/carton uses a cuboid; M/cylinder uses a vertical cylinder with diameter equal to its configured width and height equal to package height; L/pouch uses a rounded cuboid. The pouch proxy cannot fold, deform, shift contents or model fabric/contact pressure.
- Package mass uses the approved baseline (0.10/0.30/0.60 kg). `docs/ENGINEERING-BASELINE.md` records the configurable friction, restitution, gravity, gripper geometry and provisional grasp tolerances. These are assumed simulation inputs, not measured coefficients or physical gripper specifications.
- “Open” moves the two kinematic sensor pads to the configured maximum opening. “Close” places them at the selected package width with the configured 1 mm geometric overlap. A grasp succeeds only after both Rapier sensor pads overlap the package and TCP-to-package distance, yaw, width, and virtual jaw-force checks pass. Failures return a reason; the package is never teleported to the TCP.
- Success creates a Rapier fixed joint between a kinematic gripper anchor and the existing dynamic package. It preserves the captured relative position/yaw. While attached, the anchor follows FK TCP transforms on fixed steps. Release removes the joint, transfers the last finite-difference anchor velocity to the package, and resumes dynamic simulation.
- Package controls allow category selection/reset, open, close, attempt grasp and release. The panel shows dynamic/attached state, fixed-step status, package world pose, and the latest result. A carried package can follow route playback. Direct joints, route selection, route scrubbing and return-to-pickup are disabled while attached; play/pause stays available. Manual joint inspection and the route preview remain available when not carrying.

## Grasp model and engineering meaning

World frame W remains X forward, Y lateral, Z up; angles are radians internally. J1/J2/J4 use +Z revolute rotations and the existing FK tool yaw. J3 is TCP world-Z in metres. The route's pickup waypoint is a package-center target, so the modeled TCP capture origin coincides with the package center. The visible palm/pads are schematic and do not claim a physical gripper's calibrated geometry.

The geometric contact overlap is a small configurable penetration used with Rapier sensor colliders to define simultaneous two-pad contact. The virtual holding-force estimate reuses the Phase 1 mass/friction/safety-factor equation. No jaw force is applied to the object, and grasp strength does not emerge from contact friction. The fixed joint is an ideal constraint. It avoids solver jitter in this small kinematic carry preview but masks slip, compliance, inertial load, jaw closure dynamics, and release shock. These distinctions prevent the successful simulated grasp from being interpreted as hardware validation.

Fixed support/bin colliders allow packages to land under gravity. They do not form a complete collision model of the cell. There are no moving arm colliders, swept-volume checks, inter-package cases, verified bin-capacity rules, CCD campaign, tunneling guarantee, placement detector or collision-based robot stop. A route preview is still not collision-free or safe to execute on a real robot.

## Verification evidence

Commands run in the local project:

| Check | Result |
|---|---|
| `npm run format:check` | Pass; all matched files use Prettier style (source was formatted with `npm run format`). |
| `npm run lint` | Pass; no ESLint findings. |
| `npm run typecheck` | Pass for app and Vite configuration TypeScript. |
| `npm test` | Pass: 3 files, 32 tests (11 kinematics/config, 8 trajectory/routes, 13 Rapier package/gripper). |
| `npm run build` | Pass; Vite production bundle built. Rapier chunk remains 4,368.41 kB minified and triggers the existing >500 kB advisory. |
| `npm run verify:rapier-node` | Pass; Rapier 0.21.0 initialized and stepped an empty world at 1/60 s. Package body behavior is additionally covered by Vitest. |
| `SORTLAB_URL=http://127.0.0.1:5174/ npm run smoke:browser` | Pass in cached Chrome for Testing 153.0.8010.12. WebGL 2 scene rendered, all three bins visible, existing J1–J4 sliders changed rendered pixels and matched FK values, B1/B2/B3 routes/playback/scrubbing worked, Rapier initialized, M package grasped/carried by route preview/released and fell, direct joint controls locked while attached, and no console errors, failed requests or HTTP errors were observed. |

Vite used port 5174 because port 5173 was already occupied. Browser rendering used the script's SwiftShader WebGL flags; hardware GPU acceleration is not verified. The browser test used a cached executable and did not install another browser. Smoke screenshots were written to a temporary directory, not treated as committed project evidence.

Unit tests cover fixed-step advancement/reset and body counts; S/M/L proxy mapping; aligned grasp for each category; open-state, distant and yaw rejection; carry coordination; release/fall; repeated package-selection/reset and grasp/release cycles; finite TCP input; and retention of the three destination routes. Browser smoke covers route preview and direct joint controls with the physics panel present.

The deterministic carry unit case measured a maximum TCP/package-center position discrepancy of less than `1e-4 m` after four fixed steps (the observed run was approximately `5.15e-5 m`). This is a test result for the simplified constraint model, not a physical accuracy claim.

## Phase 3 limitations and deferred work

- Physics coefficients, jaw geometry, overlap, and tolerances are provisional; no source measurement or physical calibration is available.
- Robot links are kinematic; their contacts do not affect packages. No link, gripper, route swept-volume, or obstacle-clearance claim is established.
- Fixed joint attachment is an ideal carry approximation, not a contact-force grasp. Pouch deformation, rolling friction realism, CCD completeness and release behavior under fast motion are not validated.
- The display-frame accumulator caps catch-up at six fixed ticks and discards excess delayed time. Unit tests are deterministic for explicitly requested fixed ticks; wall-clock playback is not a hard real-time simulation.
- No automatic identification, sorting state machine, retry policy, fault handling, placement confirmation, throughput evaluation, or hardware behavior is implemented. These belong to Phase 4 or later approved work.

## Next phase boundary

Phase 4 may implement an autonomous sorting controller only after owner approval. It should define typed states/events, classify configured simulated IDs, coordinate validated routes and package interactions, verify placement before awarding success, and add deterministic normal/fault scenarios. Before calling any route safe, it must add and test robot/tool/package swept collision checks and a stop/recovery policy.
