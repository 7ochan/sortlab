# Phase 7 — Deliverables and Evidence Audit

**Audit date:** 18 October 2026  
**Authority:** *Robotics Course Project Brief.docx*, “Robotics - Individual Design Project,” BCA UG Semester VII, Option 01: Automated Warehouse Package Sorting Robot. The source file was found in `/Users/lochan/Downloads/Robotics Course Project Brief.docx`; it is not copied or modified. The brief specifies one evolving PDF workbook, versions 1.0/2.0/3.0, a V3.0 final report of 7–10 pages excluding references/appendices, and a demonstration. Its V3 deadline is written `30-1 Oct 2026`, which is ambiguous and should be confirmed with faculty.

## Requirement traceability

| Brief requirement | Report treatment | Evidence / status |
|---|---|---|
| Title page with student name, registration number, course, semester, option, version and summary | Cover has explicit placeholders for name and USN; course, semester, option, V3.0 and concise summary are included | Identifiers are missing user input; replace placeholders before submission. |
| Define the warehouse problem, three objects, destinations, pick and home stations | Report defines S→B1, M→B2, L→B3, package sizes/masses, pickup and home | `docs/ENGINEERING-BASELINE.md`; `src/engineering/config.ts`; route code. Package properties are configured assumptions. |
| List assumptions and compare at least two robot configurations | SCARA-style and Cartesian gantry comparison; assumptions separated from measurements | Baseline and architecture. Tradeoff is engineering rationale, not a procurement study. |
| System block diagram: sensors, controller, actuators, mechanism, end effector, power and feedback | Diagram shows implemented software/simulation blocks and visually distinguishes conceptual/unimplemented physical blocks | Actual software: `src/engineering/sortingController.ts`, `routes.ts`, `trajectory.ts`, `packagePhysics.ts`; no physical sensors, actuator sizing or power distribution are implemented. |
| Robot anatomy, DOF, frames and workspace | Four-axis SCARA-like arrangement, XYZ/yaw convention, links/joints and configured range | `docs/ENGINEERING-BASELINE.md`, `src/engineering/config.ts`, `kinematics.ts`; workspace grid results in `validation/results/numerics.json`. |
| At least four workspace points | Pickup, B1, B2, B3 shown with coordinates and route endpoints | Baseline and route/numerics evidence. Coordinates are configured inputs; reach checks are computed. |
| One planar two-link FK or IK numerical example | Worked FK and inverse branch using L1=.30 m, L2=.25 m, q1=30°, q2=−60° | Equations and numeric result independently checked against `src/engineering/kinematics.ts`; example is analytic, not a robot measurement. |
| Actuator choice and simplified grip-force calculation | Conceptual electric rotary drives, vertical linear drive and parallel-jaw gripper; safety-factored force estimate with sensitivity | `config.ts`, `packagePhysics.ts`, baseline. Values and friction are assumptions; no motor or gripper is selected or physically rated. Phase 7 fixed the code to include configured vertical acceleration in the virtual check. |
| Full flowchart and fault action | Controller state diagram and discussion of bounded retry, recoverable fault, abort and reset | `src/engineering/sortingController.ts`; `docs/PHASE-4-IMPLEMENTATION.md`; Phase 6 fault results. |
| Waypoints home/pick/lift/place/return | Route table and sequence diagram | `src/engineering/routes.ts`; route records in `validation/results/numerics.json`. Routes are sampled, not swept-volume certified. |
| Joint-space versus Cartesian-space discussion | Describes joint cubic and sampled Cartesian waypoint timing and when each is useful | `src/engineering/trajectory.ts`, `routes.ts`, Phase 2 and Phase 6 records. |
| Simple cubic trajectory example with intermediate point | Rest-to-rest single-joint example evaluated at midpoint, with analytic speed/acceleration limits | Mathematical illustration consistent with the cubic profile; not claimed as a measured route. |
| At least three hazards, controls and residual risks | Four hazards with mitigation and residual limitations | Engineering risk analysis; not a formal machinery risk assessment or certification. |
| Conclusion and build verification | Summarizes actual simulated system and performance | Phase 5 browser smoke and Phase 6 production-path campaigns; no hardware build or demonstration has occurred. |
| References, appendices and change log | Technical references, reproducibility/evidence appendix and evidence-based version notes | External references are linked and bibliographic details verified; no faculty feedback or signatures are invented. |

## Measured evidence reconciliation

The Phase 6 campaign summary and the follow-up campaign after the Phase 7 force-gate correction agree on the nominal results: 100 terminal attempts, distributed S=34, M=33, L=33 (therefore B1=34, B2=33, B3=33); all 100 ended completed with an accepted placement in the configured destination. Success-rate denominator is all terminal attempts: 100/100=100%, above the fixed 95% target. Completed-cycle durations are mean 30.680 s, median 30.350 s, min 29.917 s, max 31.783 s. The configured <=12 s median goal is missed. Each nominal grasp succeeded on its first attempt; zero retry, final grasp failure, route rejection, incorrect-bin, outside-bin or placement timeout occurred.

There are 36 fault trials: three for each of 12 classes. All 36 matched the declared fault/abort outcome, recorded no false-positive placement, reset without stale attachment or duplicate body/collider count, and were followed by 36 successful nominal reruns. Some conditions use controller hooks or validation-only pose setup, not a naturally arising physical failure. See `docs/PHASE-6-VALIDATION.md`, `validation/results/faults-phase7-grip-fix-summary.json`, and raw rows in `validation/results/faults-phase7-grip-fix.json`.

Numerical campaign: 5,000/5,000 FK→IK→FK samples; maximum position error 4.9651e−16 m and angular error 1.7764e−15 rad, under the 1e−10 tolerances. At configured home Z/yaw, 3,968 of 6,561 workspace samples were reachable. All three destination routes had exact reported endpoints, zero endpoint speed, and sampled max speed/acceleration ratios below 1. Physics: two 120-step traces matched; fixed step=1/60 s; package tracking error=8.0380e−8 m; terminal maximum linear/angular velocities were 2.0446e−6 m/s and 6.5854e−5 rad/s. Placement thresholds and geometry are listed in Phase 4/6 records. None of these are physical accuracy measurements.

**Evidence-backed defect correction:** the runtime virtual jaw-force gate had omitted configured vertical acceleration although its documented equation included it. `src/engineering/packagePhysics.ts` now computes `S m (g+a_z)/(2μ)`. A regression test with a 12 N/jaw cap rejects the L package at the expected 12.13 N. The follow-up campaign (`phase7-grip-fix`) reproduced the nominal 100/100 and fault 36/36 outcomes without changing placement criteria. This corrects a simulated safety-factor check only; it does not demonstrate real gripping force.

The audit also found an old home-position note inconsistent with the actual configured joint vector. Current home joints are `(0,0,0.56,0)`; FK gives TCP `(+0.55,0,0.56) m`. The engineering baseline and report now state this computed pose. The earlier Mission 0 plan retains its historical preliminary estimate and should not be treated as the implemented home pose.

## Classification of report claims

- **Measured software outputs:** campaign counts/outcomes/durations, fixed-step trace comparisons, FK/IK residuals, route sample ratios, Rapier snapshots and browser smoke behavior. Exact raw data: `validation/results/nominal-phase7-grip-fix.json`, its generated summary, fault raw/summary files, `numerics.json`, and `physics.json`.
- **Configured assumptions:** link lengths, limits, package masses/dimensions, bin geometry, grasp tolerances, friction, gravity, vertical acceleration, virtual jaw capacity, speed/acceleration caps and 12 s median target. Source: `src/engineering/config.ts` and `docs/ENGINEERING-BASELINE.md`.
- **Approximations:** ideal rigid links, fixed-joint grasp, proxy carton/cylinder/pouch colliders, package-center bin acceptance region, deterministic operator-selected package type, and sampled rather than swept collision checks.
- **Future work:** physical actuator/power sizing, real package identification, robot/link dynamics, calibrated contact/friction, swept-volume/collision safety, hardware verification and actual demonstration evidence.

## Required before submission

1. Replace `[Full student name]` and `[University registration / USN]`; verify the exact filename convention `<Name>_<Roll>_Robotics_W3.pdf` from the brief.
2. Confirm with faculty whether the V3 deadline typo means 30 October or 1 November 2026, and whether the requested editable DOCX should accompany the required PDF workbook.
3. Review the actual app screenshot in `deliverables/assets/workcell-smoke-capture.png`; capture a fresh demonstration/dashboard screenshot if the instructor expects UI evidence. The existing image is a real Playwright screenshot of the running workcell on 18 October 2026, not a physical robot.
4. Student should personally verify all calculations, review the report, and acknowledge AI assistance as required by the brief. No student signature, hardware result, institutional logo, faculty feedback or physical demonstration is supplied.
5. The delivered report is structured to the requested 7–10 technical pages, with title page, references and appendices outside that body count. Confirm final page count/rendering after filling personal identifiers.
