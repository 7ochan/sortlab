# Phase 7 — Demonstration Plan

**Target duration:** 8–10 minutes. Use the local app and current checked-in deterministic configuration. This is a software simulation demonstration, not a hardware demonstration.

## Before starting

- Run `npm run dev -- --host 127.0.0.1`, open the local URL, and wait for the 3D workcell and dashboard to finish initializing.
- Confirm the selected package category and destination map S→B1, M→B2, L→B3. Keep the browser console out of the main presentation; surface the status panel and event log.
- Start from a fresh/reset session. Avoid editing configuration during the demonstration.

## Timed script

| Time | Action and narration |
|---|---|
| 0:00–0:45 | Introduce the modeled workcell, origin and XYZ axes, SCARA-like four-axis mechanism, conveyor pickup, three bins and package categories. State clearly that this is a kinematic/Rapier software twin with assumed dimensions, not hardware. |
| 0:45–1:45 | Show package inspection and select S, M, then L. Point out their configured destinations and dimensions/mass assumptions. Show the bin geometry and package-size-adjusted placement region. |
| 1:45–2:45 | Use J1–J4 inspection controls to make a small joint change and show the TCP FK readout. Restore the home pose. Select B1/B2/B3 route previews, scrub one trajectory, and explain the waypoint corridor and sampled constraints. Do not claim swept-link collision checking. |
| 2:45–4:00 | Demonstrate the manual gripper controls at the pickup. Close only when package alignment is visible, then raise/translate using the available preview/manual interaction, release above a bin, and show that the actual simulated package settles. If manual handling would risk the remaining demo setup, reset afterwards. |
| 4:00–5:30 | Start nominal S→B1 autonomous sorting. Show state/action, package/target, progress, elapsed simulation time, grasp result, placement result, and event transitions. Let the controller return to its safe/home pose and reach completed. Explain fixed 1/60 s simulation ticks; no success is inferred merely from issuing the grasp/release command. |
| 5:30–6:20 | Show dashboard metrics and event history. Explain denominator: terminal attempts; show cycle times in simulated seconds. Use export and identify JSON contents if useful. In a fresh session, do not imply one cycle’s rate is the 100-run campaign. |
| 6:20–7:10 | Select the `Unreachable route` scenario and press **Reset and run selected scenario**. Show that route planning rejects before motion and reports a recoverable fault. Label it as a deterministic controller hook, not a naturally occurring physical failure. |
| 7:10–8:00 | Reset/recover and run a nominal M or L cycle to show a clean rerun. If time is short, show completed M from the prior run and explain the explicit rerun evidence in the Phase 6 artifacts. |
| 8:00–9:00 | Close with the measured campaign result: 100/100 placements on the fixed configuration and cycle median 30.35 simulated seconds versus the 12-second target, which was missed. Explain the deterministic test boundary and key collision/physics limitations. |

## Fallback

If the browser/WebGL or simulation fails, do not fabricate a live result. Show `deliverables/assets/workcell-smoke-capture.png` with its provenance, then open `validation/results/nominal-phase7-grip-fix-summary.json`, the matching raw campaign, fault summary, `numerics.json`, and `physics.json`. Explain the runner drives the production controller/Rapier path at 1/60 s with no wall-clock waits. Report the live demo as unavailable and distinguish these recorded campaign artifacts from the current session.
