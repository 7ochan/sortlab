# Phase 5 — Dashboard, Scenarios and Performance Metrics

**Status:** Implemented locally on the current branch. Simulation only; Phase 6 campaigns and physical validation have not started.

## Dashboard

The existing workcell and Phase 1–4 controls remain in place. A responsive engineering dashboard adds scenario controls, live robot/controller/physics telemetry, session performance metrics, and a persistent event history. The workcell remains the primary view; dashboard columns collapse to one column on tablet and laptop-width layouts. Existing route preview/scrubbing, package inspection, gripper controls, and direct joint controls remain available when no autonomous cycle is active. Controls that can conflict with autonomous motion are disabled while the controller is active.

Robot and simulation fields come from the existing joint state, controller snapshot, and Rapier fixed-step count. The displayed fixed step is the configured 1/60 s. Simulation time is the Rapier fixed-step count multiplied by that timestep. Event timestamps are controller simulation seconds within each cycle and include both cycle ID and monotonically increasing controller tick.

## Scenarios and expected outcomes

`src/engineering/scenarios.ts` contains a typed registry. Selecting a scenario displays its intent and expected terminal result. Running it resets the controller/package first, selects the declared package category, configures its optional deterministic hook, and starts the normal controller lifecycle. Scenario setup is outside the controller’s default behavior. A result passes only when the observed terminal controller state and fault type match the declared expectation.

| Scenario | Package / mapping | Setup | Expected terminal result |
| --- | --- | --- | --- |
| Nominal S | S → B1 | Existing Rapier/controller path | `completed`, verified placement |
| Nominal M | M → B2 | Existing Rapier/controller path | `completed`, verified placement |
| Nominal L | L → B3 | Existing Rapier/controller path | `completed`, verified placement |
| Unreachable route | S → B1 | Route-planner hook throws before motion | `recoverable-fault`, `unreachable-route` |
| Bounded grasp failure | M → B2 | Grasp hook returns two deterministic misses | `recoverable-fault`, `failed-grasp` |
| Placement timeout | L → B3 | Placement classifier remains unsettled | `recoverable-fault`, `placement-timeout` |

The injected hooks do not alter ordinary Rapier collision or grasp behavior and are cleared by reset. They exercise controller fault paths; they are not physical failure models. Scenarios cannot run concurrently with an active cycle.

## Event sources and metric definitions

The controller assigns monotonically increasing event IDs and cycle IDs to actual start, transition, grasp, release, placement, terminal, control, and fault records. `MetricsRecorder` ingests snapshots from the fixed-step simulation loop and deduplicates by event ID. The recorder outlives controller resets for the current page session; it does not synthesize cycles from React render counts.

- **Completed cycles:** terminal attempts whose controller state is `completed`.
- **Successful placements:** accepted `placement` events belonging to completed cycles. An abort/fault during the return after placement acceptance does not receive credit.
- **Failed cycles:** terminal attempts ending in `recoverable-fault`.
- **Aborted cycles:** terminal attempts ending in `aborted`.
- **Terminal attempts:** completed + faulted + aborted. In-progress attempts are excluded.
- **Success rate:** completed cycles ÷ terminal attempts; shown as an em dash when there are no terminal attempts.
- **Average completed cycle time:** mean of controller elapsed simulation seconds from start to `completed`, over completed attempts only; shown as an em dash before any completed attempt.
- **Per-category and per-bin breakdowns:** terminal attempts grouped by selected package ID or configured destination, with completed, faulted, and aborted counts. In-progress cycles do not enter the attempt denominator.
- **Grasp successes / retries:** actual grasp result events whose recorded result says success, and actual second-attempt result events, respectively. Scenario-injected misses are included because they are observed controller attempt outcomes.
- **Placement failures by reason:** terminal fault events for `incorrect-bin`, `outside-bin`, and `placement-timeout`.
- **Route planning rejections:** terminal fault events of type `unreachable-route`.

One attempt can have at most one terminal outcome. Aborts and faults never increment completed cycles or successful placements. Export is a downloadable `sortlab-session-metrics.json` containing the exact on-screen `metrics` object, derived cycle records, and deduplicated raw controller events.

## Verification

Vitest covers empty and mixed metrics, cycle-time averaging, category/bin outcomes, event deduplication/export parity, scenario registry and outcome comparison, route rejection before motion, bounded injected grasp failure, placement timeout, and existing real Rapier S/M/L full cycles. The browser smoke test continues to exercise manual joints/routes/package grasp/release and autonomous M→B2 operation, then runs nominal S and route rejection scenarios and checks the downloaded JSON metrics.

## Assumptions and limitations

The browser fixed-step accumulator can discard wall time after a long frame; simulation time and metrics remain based on completed fixed steps, not wall-clock duration. Event history is in-memory for the current page session and is not persisted between reloads. Controller events retain cycle-relative simulation time while their IDs and ticks remain session-monotonic. Scenario fault hooks establish deterministic controller behavior, not altered Rapier physics. The metric uses configured placement verification from the Rapier package pose and velocity; it does not imply camera, barcode, or real robot sensing. Existing routes still lack swept robot/tool/package collision checking. No throughput campaign, hardware calibration, or Phase 6 validation campaign is claimed.
