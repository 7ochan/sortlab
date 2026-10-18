# Phase 6 — Validation and Evaluation

**Status:** Executed locally against the production TypeScript controller and Rapier package simulation. Results are simulated software evidence only. No robot, camera, or physical sensor was used.

## Environment and reproduction

The recorded environment was Node v26.9.0, npm 11.19.1, and cached Playwright Chromium 153.0.8010.12. The campaign uses the checked-in npm lockfile and deterministic Rapier compatibility build (`@dimforge/rapier3d-deterministic-compat` 0.21.0). All cycle advancement is by the configured fixed step of 1/60 s; the headless runner does not sleep or use browser frame timing. Each nominal attempt creates a fresh world with the configured package pose. The same process and fixed order reproduced all 100 raw attempt records exactly on two final runs.

Commands:

```sh
SORTLAB_CAMPAIGN_LABEL=final npm run validate:campaign
SORTLAB_CAMPAIGN_LABEL=final-repeat npx vitest run --config vitest.validation.config.ts validation/campaign.test.ts
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run verify:rapier-node
npm run dev -- --host 127.0.0.1
SORTLAB_URL=http://127.0.0.1:5173/ npm run smoke:browser
```

Runner design and per-artifact locations are in [validation/README.md](../validation/README.md). The nominal configuration is [campaign-config.json](../validation/campaign-config.json). The campaign drives the same `SortingController`, `planDestinationRoute`, trajectory generation, `PackagePhysicsSimulation` grasp/release and fixed stepping, and `classifyPlacement` used by the app. Each attempt checks an actual terminal state and compares controller placement with an independently classified final Rapier snapshot.

## Nominal campaign

The fixed sequence is `S,M,L` repeated 33 times, then `S`: 34 S→B1, 33 M→B2, and 33 L→B3. The denominator is all terminal nominal attempts; a successful placement requires both controller state `completed`, controller result `accepted` for the configured bin, and final package snapshot classification `accepted` for that same bin.

| Measure | Final result |
| --- | ---: |
| Attempts / terminal outcomes | 100 / 100 |
| Completed and verified placements | 100 |
| Failed / aborted cycles | 0 / 0 |
| Success rate (`verified / terminal attempts`) | 100 / 100 = **100%** |
| Required target | 95%; **met** |
| Mean completed cycle duration | 30.680 s |
| Median completed cycle duration | 30.350 s |
| Minimum / maximum completed cycle duration | 29.917 s / 31.783 s |
| Grasp attempts / first-attempt successes | 100 / 100 |
| Retry attempts / final grasp failures | 0 / 0 |
| Wrong-bin / outside-bin / placement-timeout failures | 0 / 0 / 0 |
| Route-planning rejections | 0 |

Category outcomes: S 34/34, M 33/33, L 33/33. Destination outcomes: B1 34/34, B2 33/33, B3 33/33. The cycle duration is controller simulation elapsed time from accepted start through terminal completion; setup and wall-clock time are excluded. The placement classifier's final snapshots had maximum linear speed 0.000002045 m/s and maximum angular speed 0.00006586 rad/s, below the configured 0.04 m/s and 0.12 rad/s limits. The existing classifier requires those thresholds for 0.25 s and has an 8 s verification timeout.

### Baseline comparison and defect correction

Before behavior changes, two nominal baseline runs both produced the same 100/100 result. However, `attemptGrasp()` itself advances one Rapier fixed step to refresh contact pairs, and the controller then also advanced its regular physics step during that tick. The measured maximum difference between physics elapsed time and controller elapsed time was one step: 0.016666666667 s. The controller port now exposes optional fixed-step count instrumentation; after a controller action, it skips the outer step only when the action already advanced Rapier. The production App adapter and validation adapters provide this count.

After the fix, the final 100-record campaign and its repeat have byte-for-byte identical attempt records, 100/100 placements, and a maximum absolute clock difference of 5.23e-13 s (floating point accumulation). The success target was already met before the fix; the fix corrects deterministic time accounting and does not loosen placement criteria or discard failures. Regression assertions also check actual fixed-step duration against controller elapsed time in the existing S/M/L integration tests.

## Fault-injection campaign

The runner executes 3 trials for each fault class (36 fault trials). It checks expected terminal status/fault, no successful placement credit, no stale attachment, reset body/collider counts, and then a successful normal cycle on the same controller and world. All 36/36 expected outcomes matched; 0 false-positive placements; 36/36 resets clean; 36/36 nominal reruns completed.

| Fault class | Injection and expected outcome | Result |
| --- | --- | ---: |
| Unreachable route | Scenario route hook throws; `unreachable-route` fault | 3/3 matched |
| Grasp misalignment | Scenario grasp hook returns a miss; `failed-grasp` after bounded retry | 3/3 matched |
| Lost attachment in transport | Real Rapier release removes fixed-joint attachment; `lost-attachment` | 3/3 matched |
| Release failure | One-shot adapter reports release failure while real attachment remains; `lost-attachment` | 3/3 matched |
| Incorrect bin | Validation setup teleports detached real package body into another configured bin; `incorrect-bin` | 3/3 matched |
| Outside bin | Validation setup teleports detached body outside acceptance bounds; `outside-bin` | 3/3 matched |
| Placement timeout | Classifier hook remains settling through timeout; `placement-timeout` | 3/3 matched |
| Abort during pickup | Actual abort command at `moving-to-pickup`; `aborted` | 3/3 matched |
| Abort during transport | Actual abort at `transporting`; `aborted` | 3/3 matched |
| Abort during release | Actual abort at `releasing`; `aborted` | 3/3 matched |
| Abort during verification | Actual abort at `verifying-placement`; `aborted` | 3/3 matched |
| Invalid transition | Duplicate start while selecting; `invalid-transition` | 3/3 matched |

Scenario hooks, one-shot adapter errors, and explicit pose setup are fault injections, not naturally generated failures in nominal physics. The release-failure result therefore validates controller handling of a failed release response, while the lost-attachment case validates actual Rapier detach. The package pose teleport is validation-only and does not change the production classifier. Unsupported as physical failure simulation: jammed jaws, sensor dropout, slipping under load, robot collision, and damaged/blocked bins. The normal simplified physics does not model those phenomena.

## Kinematics and trajectories

- 5,000 deterministic joint-limit-valid FK→IK→FK samples all found an inverse branch. Maximum position round-trip error was 4.97e-16 m and maximum wrapped angular error 1.78e-15 rad, well below the recorded 1e-10 tolerances.
- An 81×81 XY workspace grid at configured home Z/yaw had 3,968 reachable samples of 6,561 across −0.6 to +0.6 m. This is a sampled map, not an analytical clearance envelope.
- Outer reach just inside the 0.55 m link envelope was reachable; just outside was rejected. J3 minimum/maximum were accepted and values 1 µm outside rejected. The full extension is singular and accepted. The full folded radius is not reachable under configured J2 ±160° limits. Each individual joint validator rejected values 1e-9 outside both limits.
- B1/B2/B3 routes deterministically mapped to S/M/L, started at pickup, ended at configured TCP target (zero reported endpoint position error), and had zero endpoint velocity. Maximum sampled route speed was 0.9223 of its joint limit and maximum sampled acceleration was 0.8373 of its configured limit. The cubic trajectory endpoint/determinism checks passed; its analytic extrema are also checked by the production generator.
- Cartesian paths are discretely sampled for kinematic continuity and speed/acceleration. No swept-link, gripper, package, or obstacle collision proof is implemented or claimed.

## Physics, gripper and placement robustness

- Two independently initialized Rapier worlds had exactly equal 120-step package snapshot traces at 1/60 s.
- The real M package grasp passed at the configured 0.012 m position and 8° yaw gates; a 0.022 m offset was rejected. A real fixed-joint carry tracked a moved TCP within 8.04e-8 m; release detached the package.
- Placement checks accepted bin center, an interior point 1 µm inside the XY boundary, and the configured floor/lip tolerance boundaries. They rejected a point beyond the XY edge, 0.1 µm below floor tolerance, and 0.1 µm above lip tolerance. A settled M package in B1 classified `incorrect-bin`. Linear speed 0.039999 m/s was accepted and 0.04 m/s remained `settling`.
- Reset recreated a snapshot identical to a fresh M world and retained 19 rigid bodies / 20 colliders, with no attachment or duplicated package bodies. Fault resets across 36 trials matched original body/collider counts and each supported a successful rerun.
- Package dynamics use simplified colliders and an ideal fixed-joint grasp. No jaw compliance, applied grip force, payload slip, robot mass/inertia, CCD campaign, multi-package/bin capacity, or calibrated friction validation is covered. The placement edge checks test the existing package-center predicate, not detailed package/bin contact geometry.

## Regression outcomes

Final command results on the local development environment:

| Command | Outcome |
| --- | --- |
| `npm run format:check` | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS; 5 files, 68 tests |
| `npm run build` | PASS |
| `npm run verify:rapier-node` | PASS |
| `npm run smoke:browser` | PASS; cached Chromium, WebGL 2, manual controls, pause/resume, autonomous placement, nominal S and unreachable scenarios, JSON export |
| `SORTLAB_CAMPAIGN_LABEL=final npm run validate:campaign` | PASS; 4 validation tests, 100 nominal attempts and 36 fault trials, numerical and physics checks |
| `SORTLAB_CAMPAIGN_LABEL=final-repeat npx vitest run --config vitest.validation.config.ts validation/campaign.test.ts` | PASS; 100 attempts; raw records exactly match final run |

The browser smoke passed on Chromium 153.0.8010.12 with WebGL 2 and no console errors, failed requests, or bad responses. It verified J1–J4 manual controls and FK readouts, B1/B2/B3 route selection and playback/scrubbing, grasp/carry/release, pause/resume, completed M→B2 placement, passing nominal S and unreachable-route scenarios, and JSON export. The exported session contained 2 successful placements and 1 rejected route attempt (3 terminal attempts; 66.7% session success rate). No campaign was skipped. Commit ID and final worktree state are reported in the task handoff.

## Artifacts and limitations

- Nominal raw and summaries: `validation/results/nominal-baseline*.json`, `nominal-final*.json`, and `nominal-final-repeat*.json`.
- Fault raw and summary: `validation/results/faults-final.json` and `faults-final-summary.json`.
- Numerical and physics results: `validation/results/numerics.json` and `physics.json`.
- Runner, balance, and reproducibility instructions: `validation/campaign.test.ts`, `validation/fault-campaign.test.ts`, `validation/numerics.test.ts`, `validation/physics.test.ts`, `validation/campaign-config.json`, and `validation/README.md`.

The measured 100% nominal result is limited to three fixed package starting poses, one configured workcell, the current modeled grasp geometry and fixed-joint attachment, and deterministic Rapier stepping. It does not estimate field reliability or establish physical robot accuracy. The target was met for this deterministic campaign only. Phase 7 and the final university report remain deferred.
