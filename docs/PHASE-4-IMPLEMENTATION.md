# Phase 4 — Autonomous Sorting Controller

**Status:** Implemented locally on the current branch. Simulation only; no physical robot or sensor validation.

## Cycle and state machine

`SortingController` is a typed fixed-tick state machine in `src/engineering/sortingController.ts`; React only sends commands and renders its snapshot. A start selects the chosen configured package and its `PackageClass.destination`, validates the package body, plans the existing fixed-cell route, validates sampled finite poses, an 8 s checked cubic from the current inspected joint pose to pickup, and a checked return-home cubic. It moves to pickup, closes the existing gripper, and calls the Phase 3 `attemptGrasp()`. Lift/transport motion starts only after both the actual grasp result and the Rapier attachment state confirm success. The controller releases through the existing gripper model, waits for placement evidence, and returns along the sampled route in reverse before following a checked joint cubic to `robot.home`.

States and nominal transitions:

```text
Idle → Selecting → Planning → MovingToPickup → AligningAndGrasping
  → Lifting → Transporting → Releasing → VerifyingPlacement
  → ReturningHome → Completed
```

The code uses kebab-case state names (`moving-to-pickup`, `aligning-and-grasping`, etc.). A failed cycle ends in `recoverable-fault`; user cancellation ends in `aborted`. Every transition is recorded with fixed tick and simulation time. A second start or invalid command is rejected into a diagnosed fault. Reset is accepted from idle or terminal/fault states, calls the existing package reset (which removes the joint and old body), clears the cycle, and returns the selected package to pickup. One grasp retry is allowed at the pickup pose; a second miss faults. No automatic retry continues after a fault.

The selected mapping is resolved from config at runtime: S→B1, M→B2, L→B3. Route planning is completed before the first commanded joint movement. The route planner checks sampled TCP IK continuity, joint limits and configured speed/acceleration constraints; it does **not** prove swept robot/tool/package clearance. Simulated execution must not be interpreted as collision-safe real robot motion.

## Fixed timing and ownership

The existing app accumulator uses `CONFIG.performance.fixedStepSeconds` (1/60 s) and advances at most six steps per rendered frame, discarding excess wall time. During an autonomous tick, the controller commands the joint pose and corresponding TCP before the same fixed Rapier step. The package follows the TCP only while `PackagePhysicsSimulation.isAttached` confirms the fixed-joint grasp. Pause skips both controller and physics ticks; resume continues from the same simulation state. Elapsed time, retry counts, placement settling, and timeouts count simulation ticks only. Rendering cadence does not directly choose trajectory samples.

The controller runs one package per cycle. Package identity is an operator-selected simulated category, not camera/barcode sensing. There is one dynamic package body in the Rapier world.

## Placement acceptance

`classifyPlacement` uses the existing bin coordinates and dimensions in metres. For each configured bin, the package-center XY region is the interior rectangle shrunk by the package's projected half-extents at its current yaw (cylinder radius for M) plus a 5 mm edge margin. The center Z interval is from `floorZ + packageHeight/2 − 0.012 m` to `lipZ − packageHeight/2 − 0.010 m`. A location must classify inside a bin and have linear speed below 0.04 m/s and angular speed below 0.12 rad/s continuously for 0.25 simulated seconds. Velocity comes from the dynamic Rapier body. The controller only awards a correct sort when this region and settling window match the configured destination.

The outcomes distinguish accepted placement, a settled package in the wrong bin, a package outside all regions, placement timeout, failed grasp, lost attachment, and abort. Placement is checked against simulated rigid-body pose/velocity, not a simulated camera or real sensor. The bin base collider uses a 40 mm slab with its top at configured `floorZ`; the thicker slab prevents the 1/60 s discrete-step package proxy from tunneling through the original thin base in end-to-end runs. This remains a simplified model, not a general CCD guarantee.

## Fault handling and UI

Faults record type, selected package, intended destination, controller state, elapsed simulation seconds, and a human-readable reason. Infeasible routes fault before motion. Grasp misses get one retry. Attachment loss during lift/transport stops commanded motion. An unsuccessful release never starts placement success accounting. Wrong/outside placement is rejected after settlement or at timeout; unresolved motion times out after 8 simulation seconds. Invalid controller calls and caught exceptions become visible controller faults.

Abort stops joint commands at the current pose; if attached, it releases and opens the gripper so Rapier continues to simulate the dropped package. If release fails, abort resets the package to pickup to guarantee there is no stale attachment. Reset also clears the package and any stale attachment. The UI panel exposes start, deterministic pause/resume, abort, reset/recover, package/destination, action, state, cycle progress, actual grasp and placement outcomes, elapsed simulation time, and a bounded recent event log. Joint, route, and manual package/gripper controls are locked while an autonomous cycle is active and become available again after terminal state.

## Verification and limitations

Vitest includes real Rapier full cycles for all three package types plus pure controller transition/fault tests with a controlled physics port. Browser smoke covers the existing preview/manual controls and one complete autonomous M→B2 cycle through visible terminal placement status. No physical accuracy, robot-link collision avoidance, hardware sensor confirmation, bin capacity, deformable pouch behavior, or real-world throughput is established. The controller executes existing TCP routes without a swept-volume guard; operators should treat it as an educational simulation only.
