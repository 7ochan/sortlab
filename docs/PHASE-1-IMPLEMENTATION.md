# Phase 1 — Foundation and Kinematics

**Status:** Implemented locally; acceptance review pending. No Phase 2 work has started.
**Verification date:** 2026-10-17.

## Delivered scope

- Pinned TypeScript, React, Vite, React Three Fiber, Three.js, Rapier deterministic-compat, Vitest, ESLint, and Prettier dependencies; reproducible npm lockfile.
- Runtime validation for the single source-of-truth engineering configuration.
- Pure SCARA FK, two-branch analytic IK, joint-limit checks, reachability, ideal and joint-limited radial bounds, and deterministic sampled workspace.
- An interactive WebGL 2 SCARA preview with baseline stations, a direct-joint inspection panel, and a visible unsupported-WebGL/scene-error state.
- A bounded Rapier package import + WASM initialization + one empty world tick. No body, package, contact, grip, or sorting code is implemented.
- Configuration and kinematics tests. The current suite has 11 deterministic tests.
- Acceptance stabilization: nested/missing configuration objects and package-to-bin mappings now receive explicit validation; malformed poses/joint states fail with actionable messages. The 3D workcell is dynamically imported so its rendering stack does not load in the initial UI bundle.

## Coordinate and joint convention

Frame W is right-handed. Its origin is the shoulder/J1 axis at cell XY `(0, 0)`; +X points toward the input, +Y toward B1, and +Z is up. Viewed from +Z, positive revolute angles rotate counterclockwise. Lengths are metres, masses kilograms, force newtons, revolute joints radians. Degrees appear only in the inspector. J3 is defined by the approved baseline as the **TCP's world-Z coordinate**, not an incremental slider displacement.

J1 rotates link 1 about +Z. J2 is relative to link 1 and rotates link 2 about a parallel +Z axis. J3 sets TCP world Z directly. J4 adds tool yaw about +Z. The gripper is not a fifth arm DOF.

## FK and IK

With link lengths `L1=0.30 m`, `L2=0.25 m`, joints `q1`, `q2`, TCP height `z`, and wrist rotation `q4`:

```text
x = L1 cos(q1) + L2 cos(q1 + q2)
y = L1 sin(q1) + L2 sin(q1 + q2)
z = q3
yaw = wrap(q1 + q2 + q4)
```

For target `(x,y,z,yaw)`, define `r²=x²+y²`:

```text
c2 = (r² - L1² - L2²) / (2 L1 L2)
q2 = +acos(c2) or -acos(c2)                   # positive/negative elbow branch
q1 = atan2(y,x) - atan2(L2 sin(q2), L1 + L2 cos(q2))
q4 = wrap(yaw - q1 - q2)
q3 = z
```

IK only clamps `c2` to [-1,1] when it lies at most `1e-12` beyond the mathematical interval; farther values are unreachable. Each candidate is checked against all configured limits. Results retain branch identity; if branches coalesce at a singularity they are deduplicated. The outer singularity `q2=0` is reachable under the baseline; `q2=±π` is outside its ±160° J2 limit. Singular targets are accepted when otherwise valid, with a `singular` marker. Angle comparisons use shortest signed/circular difference, so ±π are treated as the same orientation.

FK throws an actionable error for non-finite or out-of-limit joint input; IK throws for a malformed/non-finite pose and returns a typed unreachable reason for finite but unreachable/limit-infeasible targets. `validateConfig` rejects non-finite, non-positive, structurally inconsistent, unit-inconsistent, or out-of-range design values; it does not silently fill missing values.

## Baseline values applied

| Item | Value used |
|---|---|
| Links | L1 0.30 m, L2 0.25 m |
| Joint limits | J1 ±150°, J2 ±160°, J3 TCP world-Z 0.30–0.58 m, J4 ±180° |
| Home | `(q1,q2,q3,q4) = (0,0,0.56,0)` |
| Speeds | J1/J2 90°/s, J3 0.25 m/s, J4 120°/s |
| Accelerations | J1/J2 180°/s², J3 0.50 m/s², J4 240°/s² |
| Gripper assumptions | Opening 0.03–0.16 m; virtual capacity 25 N/jaw; μ=0.50; safety factor 2; g=9.81 m/s²; assumed vertical acceleration 0.30 m/s² |
| Cell | Table z=0.25 m; base radius 0.08 m; conveyor center (+0.34,0) m and size 0.45×0.20 m, support z=0.35 m; pickup (+0.30,0) m |
| Destinations | B1 (-0.24,+0.25), B2 (-0.24,0), B3 (-0.24,-0.25) m; exterior 0.24×0.22 m, interior 0.20×0.18 m, floor z=0.30 m, lip z=0.46 m |
| Packages | S 0.08×0.06×0.04 m / 0.10 kg → B1; M 0.12×0.09×0.06 m / 0.30 kg → B2; L 0.16×0.12×0.08 m / 0.60 kg → B3 |
| Operating targets | Transfer TCP z=0.54 m; target median cycle 12 s (not measured); fixed step 1/60 s |

Values are provisional assumptions as specified in the approved baseline, not selected hardware ratings or physical measurements.

## Workspace interpretation

The **ideal radial envelope** computed from the two lengths only is `|L1−L2|=0.05 m` through `L1+L2=0.55 m`; it assumes unrestricted elbow angle. The actual configured J2 is only ±160°. Over that interval, the calculated radial interval is approximately **0.10747–0.55 m** before shoulder/wrist limits. `inverseKinematics` applies all joint limits for a pose; `sampleReachableWorkspace` samples that joint-limited result on a deterministic XY grid at supplied Z/yaw. A finite grid is an approximation for visualization and does not prove continuous swept-volume collision clearance.

Pickup and all three destination centers at transfer z=0.54 m and yaw 0 were checked by the unit suite for at least one joint-limited IK branch. This verifies pose reachability only; it does not validate package extent, approach paths, or collisions.

## 3D preview convention and limitations

The React Three Fiber scene uses the same X/Y/Z values and J1/J2 transforms as FK: a child group translated exactly by L1 and then L2, with J3 represented as TCP world-Z from the table datum and J4 applied at the tool. Inspector controls write the joint state used by both `forwardKinematics` and the rendered hierarchy.

The display uses an assumed table presentation size (1.25×0.78 m), stylized base height (0.21 m above tabletop) and arm-plane datum at z=0.46 m, arm thickness, joint radii, jaw pads, and bin walls for readability. The approved baseline does not specify this structural Z offset. These visual-only choices are not part of the kinematic model, are not collision geometry, and are not evidence of manufacturable structure. Link centerlines/endpoints preserve the XY math; no detailed machine drawing, calibrated dimensions, other robot structural offsets, or collision checks are claimed. The one displayed gripper pose is open at the configured maximum opening; jaw actuation is deferred.

The page probes WebGL 2 and gives an explicit fallback if unavailable. Browser runtime verification is reported separately in the Phase 1 acceptance record; successful local compilation does not prove a browser rendered the scene.

## Verification record

The round-trip suite covers known reference poses, four valid source configurations, requested positive/negative elbow branches, both solutions for a nonsingular target, circular wrist-angle comparison, J1/J2/J3/J4 limit rejection, out-of-Z targets, pose unreachable because of radius and joint limits, outer singularity, a near-floating-boundary target, non-finite joint/pose values, approved station reachability, sampled workspace, and invalid configuration.

For the four FK→requested-branch IK→FK vectors, the test observed maximum position error `1.1102230246251565e-16 m`, maximum yaw error `0 rad`, and maximum joint-angle difference `4.440892098500626e-16 rad`. These are deterministic mathematical test outputs, not physical measurements. The 1e-6 m and 1e-6 rad criteria are satisfied with margin for those tested, nonsingular configurations. At a singularity, branch identity is undefined/coalesced, so pose and circular joint comparison are the meaningful checks; the test checks singular metadata and target reconstruction separately.

### Commands run and observed outcomes

| Command/check | Outcome |
|---|---|
| `npm ci` | Pass: clean install from lockfile; 226 packages installed. This run did not print an audit summary. npm's install-script policy warned that `esbuild` and `fsevents` scripts were not approved; Vite build and dev-server checks still passed. |
| `npm run format` / `npm run format:check` | Pass: all application/config files match Prettier. |
| `npm run lint` | Pass: ESLint reported no errors. |
| `npm run typecheck` | Pass: app and Vite config TypeScript checks. |
| `npm test` | Pass: 1 test file, 11 tests. Observed FK/IK errors are listed above. |
| `npm run verify:rapier-node` | Pass in Node only: Rapier 0.21.0 initialized and one empty 1/60 s step completed. This is not browser verification. |
| `npm run build` | Pass: Vite 7.3.7 production build. After lazy loading the workcell, initial app JS is 239.03 kB minified (74.68 kB gzip), workcell/Three/R3F chunk 891.47 kB (238.97 kB gzip), and lazy Rapier chunk 4,368.41 kB (1,661.43 kB gzip). The Rapier chunk warning remains. |
| Vite development server + HTTP requests | Pass: root, app entry, workcell module, and Rapier module returned HTTP 200. This checks serving/transforms, not browser rendering. |
| Safari WebDriver / browser scene / WebGL 2 | Not verified: Safari 27.0.1 and `safaridriver` are installed and the WebDriver service started, but `POST /session` failed with Safari's message that “Allow remote automation” is disabled in Safari Settings → Developer. After owner approval, I attempted `safaridriver --enable`; its password prompt reported the password was invalid and the setting remains unchanged. The in-app browser connection reported no available browser, and a desktop capture showed the development interface rather than the Safari page. No page was observed, so WebGL 2, canvas rendering, joint interaction, browser console, failed network requests, and browser Rapier initialization remain unverified. |
| Arc remote-debugging attempt | Not verified: Arc is installed, but launching with a temporary profile and `--remote-debugging-port=9222` did not expose its local DevTools endpoint; the port refused connections. No browser page was observed through this attempt. |
| Standalone `npm audit --audit-level=low` | Not verified: the command could not reach the npm audit endpoint because registry DNS resolution failed in the sandbox. The clean install's output did not include an audit summary, so no current audit result is claimed. |
| Physical robot validation | Not performed; no hardware or measurement is claimed. |

The Vite server and transformed application modules returned HTTP 200, but that is only a server/transform check and not evidence of browser rendering. The installed browser modules themselves were not automated in a real browser. The only Rapier runtime check was the Node smoke check above. No physical robot validation has been performed.

## Deferred by phase boundary

Phase 2 owns cubic trajectories, waypoint routes, and collision/clearance planning. Phase 3 owns package dynamics, grasp/release/contact behavior. Later phases own sorting state machine, retries and faults, operating dashboard, scenario campaigns, throughput/cycle metrics, report export, demonstration, and viva preparation. No package physics or sort cycle is represented by the current scene.
