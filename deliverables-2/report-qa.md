# SortLab report requirements, evidence and QA

## Pre-draft compliance and evidence matrix

Authority inspected before drafting: original `Robotics Course Project Brief.docx` in `/Users/lochan/Downloads`. It specifies Option 01, a cumulative V3.0 PDF, required first-page student fields, the common engineering sections, and a 7–10 page final body excluding references/appendices. It expressly says a physical robot, paid software, advanced AI model or working code is not required; a credible drawing, model or simulation is acceptable. The V3 deadline appears as `30-1 October 2026` in the brief and is ambiguous.

| Requirement | Planned evidence in report | Evidence classification / source | Status or caveat |
|---|---|---|---|
| Problem, option, requirements, three classes and measurable assumptions | Problem statement; S/M/L→B1/B2/B3; sizes, masses, stations, cycle target | Configured assumptions: `src/engineering/config.ts`; brief | Category selection is simulated label input, not vision. |
| Payload, reach, cycle-time target | Force estimate, link reach, configured 12 s median aspiration and measured cycles | Force/reach inputs configured; campaign time measured: `validation/results/nominal-phase7-grip-fix-summary.json` | 12 s median aspiration missed; no robot structural payload rating exists. Virtual grip margin is not arm payload margin. |
| Architecture with sensing, controller, drives, mechanism, tool, power, feedback | System diagram with implemented simulation path solid and conceptual hardware dashed | `src/engineering/*`, OSHA reference [R4] | Sensor, drives, supply and feedback blocks are concepts; not implemented hardware. |
| Compare two configurations and select | SCARA-style vs Cartesian gantry comparison and rationale | Engineering reasoning under configured task assumptions | No physical cost, accuracy, payload or throughput comparison. |
| Anatomy, links, joints, TCP, DOF | Dedicated SCARA anatomy vector drawing | `config.ts`, `kinematics.ts`, Phase 1 record | Four commanded axes: R-R-P-R; yaw/position task, not 6D pose. |
| Workspace and ≥4 named points; reach/clearance | Workcell/workspace drawings and waypoint table | Configured coordinates plus analytical IK; grid measured in `numerics.json` | Grid is sampled reachability, not collision-free volume; no swept-link proof. |
| Planar two-link FK/IK example and coordinate sketch | Labeled W/arm frames and worked two-link calculation | Analytical calculation checked against `kinematics.ts` | Analytic illustration, not measured robot accuracy. |
| Drives, end effector and grip force | Electric-drive concept, parallel-jaw design, rejected alternatives, force calculation | Config assumptions and `packagePhysics.ts` | Actuators are not selected or rated. Grip model is virtual; force gate includes a_z after evidence-backed fix. |
| Full control process and failure action | Controller flow diagram; event/state/fault explanation | `sortingController.ts`, Phase 4, fault results | Fault hooks and pose injections are labeled injected tests. |
| Home/approach/pick/lift/transfer/place/return waypoints | Explicit waypoint table, including configured home joint vector and FK TCP | `routes.ts`, `sortingController.ts`, `config.ts` | Home is q=(0,0,.56,0) → TCP (+.55,0,.56) m. Mission 0's .30 m home estimate is an obsolete preliminary note. |
| Path planning, orientation/obstacles, spaces and cubic example | Dedicated route drawing; joint vs Cartesian discussion; worked rest-to-rest cubic | `routes.ts`, `trajectory.ts`, `numerics.json`; analytical example | Samples do not certify continuous/swept collision safety. Cubic example is illustrative, not measured route data. |
| ≥3 hazards and credible controls | Risk table with hazard, controls and residual risk | OSHA OTM and hazard source [R4, R5]; design analysis | Educational hazard discussion only; not a formal risk assessment or safety certification. |
| Demo, feasibility, limitations, improvement, build verification conclusion | Real browser smoke screenshot and captions; validation and future work | Existing Playwright screenshot; Phase 6/7 artifacts | Simulation evidence only. No hardware is required by brief, and none is claimed. |
| References and version/change log | Verified technical references and evidence-based V1/V2/V3 change history | Cambridge/Northwestern, Rapier, OSHA, local source/history | No faculty comments were found; the change log will not invent them. |

### Verified evidence ledger (pre-draft)

- **Measured simulation/campaign:** 100 nominal terminal attempts; S/M/L=34/33/33; 100/100 correct accepted placements (denominator: all terminal nominal attempts); mean 30.680 s, median 30.350 s, min 29.917 s, max 31.783 s; 100 first-try grasps; no nominal placement failures or route rejections. Source: raw campaign plus summary `validation/results/nominal-phase7-grip-fix*.json`.
- **Measured injected fault trials:** 12 classes ×3=36, expected outcomes 36/36, false-positive placements 0, reset-clean 36/36, nominal rerun 36/36. Source: `validation/results/faults-phase7-grip-fix-summary.json` and raw JSON. Route/grasp/release-response/timeout classes include controller hooks; wrong/outside use validation-only poses; attachment loss uses Rapier detach; aborts issue actual controller abort. Not physical failures.
- **Measured numerical checks:** 5,000/5,000 FK–IK–FK; max position residual 4.9651e−16 m; max angular residual 1.7764e−15 rad; tolerance 1e−10. Grid: 3,968/6,561 reachable. Routes map to bins and meet sampled constraints. Source: `validation/results/numerics.json`.
- **Measured physics:** two same-setup 120-step traces match at 1/60 s; carry tracking max 8.0380e−8 m; 19 rigid bodies/20 colliders after reset; placement thresholds and boundary cases in `physics.json`. Clock mismatch after earlier correction: 5.2225e−13 s. Source: `validation/results/physics.json`, nominal summary.
- **Analytical calculations:** two-link FK/IK example; cubic interpolation example; virtual friction-grip force. Values are derived from configured inputs and equations, with assumptions stated. They are not physical measurements.
- **Configured assumptions:** L1=.30 m, L2=.25 m; limits J1±150°, J2±160°, J3=.30–.58 m, J4±180°; S/M/L masses .10/.30/.60 kg and dimensions .08×.06×.04 / .12×.09×.06 / .16×.12×.08 m; target median 12 s; gripper virtual cap 25 N/jaw; μ=.50, safety factor 2, a_z=.30 m/s².
- **Conceptual/unverified:** electric motor and power selection, physical sensors and feedback, collision safeguarding, dynamics, compliance, production payload, force output, real accuracy and safety certification. These will be labeled as proposals or future work.

### Verified external references

- [R1] Lynch & Park, *Modern Robotics: Mechanics, Planning, and Control*, Cambridge University Press, 2017, DOI 10.1017/9781316661239; publisher and chapter listing verified at `https://www.cambridge.org/core/books/modern-robotics/57C3BB1C6D5CB40320FA96E5FA3BCEC6`. Northwestern materials for FK/IK and trajectory generation: `https://modernrobotics.northwestern.edu/nu-gm-book-resource/` and point-to-point cubic lesson `https://modernrobotics.northwestern.edu/nu-gm-book-resource/9-1-and-9-2-point-to-point-trajectories-part-2-of-2/`.
- [R2] Rapier JavaScript determinism guide, `https://rapier.rs/docs/user_guides/javascript/determinism/`; checked note about equal initial conditions and construction order. Report will preserve the project's measured same-environment scope, not overgeneralize the library's broader claim.
- [R3] Rapier JavaScript rigid-body types, `https://rapier.rs/docs/user_guides/javascript/rigid_body_type/`; confirms kinematic bodies ignore contact force and can pass through geometry unless the application handles it.
- [R4] OSHA, *Industrial Robot Systems and Industrial Robot System Safety*, Technical Manual Section IV Chapter 4, `https://www.osha.gov/otm/section-4-safety-hazards/chapter-4`; checked components, hazards, risk assessment and safeguard context.
- [R5] OSHA, *Robotics: Hazards*, `https://www.osha.gov/robotics/hazards`.

## Final document QA (to be completed after generation)

- Assignment compliance: pending final cross-check against the matrix above.
- Programmatic DOCX structure/styles/tables/captions/embedded figures: pending.
- PDF export and text extraction: pending.
- Per-page rendered visual inspection: pending.
- Justified body paragraph styles and word spacing: pending.
- Figure/list/cross-reference sequence and content parity: pending.
- Final page count and unresolved limitations: pending.
