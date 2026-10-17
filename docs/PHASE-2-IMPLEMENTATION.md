# Phase 2 — Trajectory and Route Planning

**Status:** Implemented locally; no Phase 3 physics or sorting control.

## Delivered

- Deterministic joint-space cubic trajectories with explicit position and velocity at both ends, configurable duration/sample period, and analytic checks for joint bounds, peak speed, and peak acceleration.
- Cartesian waypoint paths using XYZ linear segments, shortest-angle yaw interpolation, a cubic rest-to-rest timing law, and application-owned analytic IK. Both elbow branches are tried for each fixed-cell route; the feasible continuous result with the shorter duration is selected.
- Fixed-cell routes from each package-category center-height pickup pose to its configured bin, plus sample-time lookup for scrubbing and playback.
- A route panel to select B1/B2/B3, inspect waypoint coordinates and duration, play/pause, scrub, and return to pickup. The workcell overlays the sampled TCP route and route waypoints. Existing direct J1–J4 inspection remains available.
- Tests for boundary conditions, deterministic sampling, explicit endpoint velocities, infeasible joint cubics, joint limits, Cartesian IK and limits, all three routes, invalid/discontinuous inputs, and playback sampling.

## Trajectory conventions and constraints

All internal positions use metres and radians; J3 is TCP world-Z in metres. Revolute velocity/acceleration use rad/s and rad/s²; J3 uses m/s and m/s². The Phase 1 baseline supplies assumed limits: J1/J2 90°/s and 180°/s², J3 0.25 m/s and 0.50 m/s², J4 120°/s and 240°/s². These remain provisional design inputs, not validated actuator capabilities.

For each joint, the general cubic is `q(t)=a t³+b t²+c t+d`. Start/end positions `q0,q1`, velocities `v0,v1`, and duration `T` determine:

```text
d = q0
c = v0
a = (2(q0-q1) + (v0+v1)T) / T³
b = (3(q1-q0) - (2v0+v1)T) / T²
```

The generator checks position extrema (roots of `q̇`), peak velocity (endpoints and roots of `q̈`), and peak acceleration (endpoints) analytically. It rejects an infeasible requested duration; it never clamps joint values or silently lengthens this joint-space trajectory.

Cartesian segments use `s(u)=3u²−2u³`, `u=t/T`, between typed `ToolPose` waypoints. XYZ is linear in `s`; yaw follows the shortest wrapped angle. IK is solved at 240 deterministic normalized path intervals and again at playback sample times, preserving a continuous elbow branch and rejecting unreachable or discontinuous paths. A segment duration is estimated using the configured per-joint limits and then checked against finite-difference velocities/accelerations at the 1/60 s baseline sample interval; duration is increased and rechecked if needed. This is a sampled numerical constraint check, not a formal continuous-time bound or hardware validation. Each waypoint segment begins and ends at rest.

## Fixed-cell route definition

Each route uses baseline coordinates; the destination maps to its configured package class and category-specific pickup height. Routes pass through:

Route waypoint values explicitly tag world frame `W`, position unit `m`, and angle unit `rad`; invalid targets and discontinuous segments are rejected during route generation.

1. Package-center pickup pose at `(0.30, 0.00, packageSupportZ + packageHeight/2)`, yaw 0; the package class is resolved from the selected bin (S/B1: z=0.37 m, M/B2: z=0.38 m, L/B3: z=0.39 m).
2. Vertical clearance at the same XY and `z=0.56 m`.
3. Elevated corridor at `x=baseRadius+0.04=0.12 m`, `y=+0.40 m` for B1/B2 or `y=−0.40 m` for B3, `z=0.56 m`.
4. Destination approach directly above the bin center at `z=0.56 m`.
5. Destination TCP target at the bin center and `z=0.54 m`, 0.08 m above its baseline lip.

At transit and approach, tool yaw is aligned to the selected elbow's planar link direction (`q1+q2`) to avoid wrist-yaw wrap discontinuities; pickup and target yaw are 0. Both elbow branches are tested. A route is rejected if any sampled waypoint is unreachable, joint-limited, discontinuous, or cannot meet sampled speed/acceleration limits.

Pickup height is an assumed TCP/package-center alignment derived from the configured support height and category dimensions. It does not implement grasp contact. The corridor is a provisional TCP routing assumption chosen to avoid crossing the SCARA's inner unreachable radial region. Only TCP kinematics are considered. This route has **no** swept-link, tool, package, base, conveyor, bin-wall, or inter-bin collision/clearance proof; it must not be presented as collision-safe.

## Verification

Checks run against the Phase 2 implementation:

| Command/check                | Observed result                                                                                                                                                                                                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`       | Pass.                                                                                                                                                                                                                                                                            |
| `npm run lint`               | Pass; ESLint reported no issues.                                                                                                                                                                                                                                                 |
| `npm run typecheck`          | Pass for browser and Vite configuration TypeScript.                                                                                                                                                                                                                              |
| `npm test`                   | Pass: 2 files, 19 tests (11 kinematics/configuration and 8 trajectory/route/playback).                                                                                                                                                                                           |
| `npm run verify:rapier-node` | Pass: Rapier 0.21.0 initialized and one empty 1/60 s world step completed. This does not implement or test package physics.                                                                                                                                                      |
| `npm run build`              | Pass. Vite 7.3.7 emitted 252.47 kB initial JS, 892.17 kB Workcell/Three/R3F chunk, and 4,368.41 kB Rapier chunk; the existing >500 kB warning remains.                                                                                                                           |
| Browser smoke                | Pass at `http://127.0.0.1:5174/` using cached Chrome for Testing 153.0.8010.12 / Chromium revision 1243 with Playwright Core 1.63.0. Vite chose 5174 because 5173 was already occupied.                                                                                          |
| Browser rendering/WebGL      | Pass: visible canvas (1001×620), SCARA, route overlay, pickup, and all three bins; WebGL 2 reported `WebGL 2.0 (OpenGL ES 3.0 Chromium)`. The launch used SwiftShader software-rendering flags, so hardware acceleration is not verified.                                        |
| Browser controls and routes  | Pass: all J1–J4 sliders changed viewport pixels and FK readouts; B1/B2/B3 route targets were selectable; B2 playback advanced to 0.39 s, End-key scrubbing reached 9.58 s, and Return to pickup reset the playhead. UI readout comparisons account for displayed joint rounding. |
| Browser errors and Rapier    | Pass: no console/uncaught errors, failed requests, or HTTP error responses; Rapier initialization panel reported one empty 1/60 s world tick.                                                                                                                                    |

The browser smoke check is a UI test, not physical robot validation. No clean `npm ci` was run because Phase 2 adds no dependencies and does not change the lockfile.

The Phase 2 browser preview is kinematic only. It samples routes at the configured 1/60 s interval, then playback interpolates between those samples at 1× simulated seconds per wall-clock second. Direct joint inspection pauses route playback and remains available. No package is moved, no gripper opens/closes, and no Rapier body/contact behavior is connected.

## Deferred

Phase 3 owns package rigid-body dynamics, contact, grasp/release behavior, and package transfer. Collision-checked swept paths, obstacle-aware rerouting, sorting state machine, retries/fault handling, performance campaigns, and physical validation remain future work.
