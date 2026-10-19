# SortLab final report — requirements and QA record

**Report edition:** V3.0, audited 18 October 2026  
**Authority:** `Robotics Course Project Brief.docx`, found at `/Users/lochan/Downloads/Robotics Course Project Brief.docx`. The brief requires Option 01, cumulative V3 report, student/registration details, a technical body of 7–10 pages excluding references and appendices, and the listed engineering evidence. It explicitly allows a credible drawing, model or simulation without a physical robot. The V3 date appears as `30-1 October 2026`; the wording is ambiguous.

## Requirements / evidence matrix

| Brief requirement | Report location | Evidence and classification | Limitation / submission action |
|---|---|---|---|
| 1. Problem, project choice, object categories, measurable assumptions and sorting requirements | §1, p.3; cover | Configured assumptions and design scope; project brief | Category is selected as a simulated label. No camera/barcode classification. |
| 2. Object dimensions/mass, stations, pick/bin coordinates, payload margin, reach, cycle-time target | §1 p.3, Table 1/Fig. 1; §2 p.4; §4 p.6; §7 p.9 | Package/station inputs from `src/engineering/config.ts`; cycle stats from campaign data; analytical reach/grip calculation | No arm structural payload rating exists, so arm payload margin is explicitly unquantified. Virtual gripper capacity ratio is not an arm rating. The 12 s median aspiration was missed. |
| 3. Architecture: ID/sensing, controller, drives, mechanism, end effector, power and feedback | §4 p.6, Fig. 5 | Solid blocks are implemented software/simulation; dashed sensor, drive and supply blocks are conceptual | No physical sensor, controller, actuator, power supply or encoder is built. |
| 4. Compare two robot configurations and justify selection | §2 p.4, Table 2 | Qualitative engineering comparison: SCARA-style vs Cartesian gantry | No measured cost, accuracy, payload or cycle comparison. |
| 5. Anatomy, base, links, joints, TCP, independent DOF | §2 p.4, Fig. 2 | Configured R–R–P–R kinematic model; four commanded axes | Four task axes do not provide arbitrary 6D pose control. |
| 6. Workspace, four named points, reach and clearance | §2 p.4, Fig. 3; §5 p.7, Table 3 | Analytic reach, configured stations and measured IK grid (3,968/6,561 reachable) | Reach grid is sampled TCP reachability, not collision-free volume; no swept-link/tool/package clearance proof. |
| 7. Worked two-link planar FK/IK with coordinate sketch and units | §3 p.5, Fig. 4 | Analytical calculation using configured L₁=.30 m, L₂=.25 m | Numerical residuals measure solver consistency only, not physical accuracy. |
| 8. Drive/tool selection, alternatives and force calculation with safety factor | §4 p.6, Fig. 6 | Conceptual electric drives/parallel jaws; virtual friction model with configured mass, acceleration, μ, and safety factor 2 | Not a selected or rated motor/gripper; virtual force is not contact-force evidence. |
| 9. Complete detect-to-return sequence and fault handling | §6 p.8, Fig. 8 | Production controller flow, Rapier attachment and placement checks; validation records | Detection is simulated category input. Fault tests mix hooks, explicit aborts and validation-only pose setup. |
| 10. Named home, approach, pick, lift, transfer, place, return waypoints | §5 p.7, Table 3 | `routes.ts`, controller and config values; configured home FK | Coordinates are simulation model values. |
| 11. Path planning, orientation/obstacles, joint vs Cartesian, cubic example | §5 p.7, Fig. 7 | Route/trajectory implementation plus worked cubic calculation | Routes are discretely sampled; no continuous swept collision guarantee. Cubic example is analytical, not a measured campaign path. |
| 12. At least three hazards with controls and residual risks | §8 p.10, Table 5 | Preliminary design hazard review informed by OSHA references | Not a formal risk assessment, safety validation or certification. |
| 13. Demonstration evidence, limitations, feasibility, improvements, construction verification conclusion | §8 p.10, Fig. 10; §§6–8 | Existing Playwright browser screenshot; measured simulation campaign; explicit hardware verification list | Screenshot is a browser/software capture, not a robot photograph. No physical build or hardware validation is claimed. |
| 14. References and version/change log | §8 p.10; References p.11; Appendix p.12 | V1–V3 source history and verified technical references | No faculty review/comments were available. Student must add any institution-required cover identifiers and AI-use acknowledgment details. |

## Evidence classification and reconciled measurements

- **Measured nominal simulation:** 100 terminal attempts; balanced S/M/L = 34/33/33; 100 correct accepted placements. Denominator = all 100 terminal nominal attempts. Success requires `completed`, accepted target-bin classification and detached final package snapshot in the same bin. Rate = 100/100 = 100%; the 95% target was met in simulation.
- **Measured cycle times:** mean 30.680 s; median 30.350 s; min 29.917 s; max 31.783 s, all simulated seconds. The configured 12 s median aspiration was not achieved. Per-category values and the chart are computed from raw attempt rows by `build_report.py`.
- **Measured grasp/placement:** all 100 grasps succeeded first attempt; zero retries/final grasp failures; zero nominal wrong-bin/outside-bin/timeouts/route rejections. Max final package velocities were 2.0446×10⁻⁶ m/s linear and 6.5854×10⁻⁵ rad/s angular.
- **Measured injected faults:** 12 named classes ×3 = 36 expected outcomes matched, 0 false-positive placements, 36/36 clean resets and nominal reruns. Classes are unreachable route, grasp misalignment, lost attachment in transport, release failure, incorrect bin, outside bin, placement timeout, abort during pickup, abort during transport, abort during release, abort during verification, and invalid transition. Tests are not all physical failures; the report distinguishes controller hooks, pose injection and actual Rapier detach/abort behavior.
- **Measured numerical/physics checks:** 5,000 FK/IK round trips; maximum position residual 4.9651×10⁻¹⁶ m and angular residual 1.7764×10⁻¹⁵ rad at 1e−10 tolerance; 3,968/6,561 sampled workspace targets IK-reachable; identical 120-step traces under repeated same setup; carry tracking residual 8.0380×10⁻⁸ m; corrected clock mismatch 5.2225×10⁻¹³ s. These are software/simulation checks, not hardware accuracy.
- **Analytical calculations:** two-link FK/IK, cubic trajectory midpoint and virtual grip force. Inputs and units are shown; assumptions are labeled. The computed 2.06 virtual force-capacity/requirement ratio is not an arm payload margin.
- **Configured assumptions:** link lengths, limits, package dimensions/masses, station coordinates, gravity/friction/virtual grip cap, acceptance region and velocity/settling gates come from project configuration and validation code. They are not surveyed or hardware-calibrated values.
- **Conceptual illustrations:** electric rotary/prismatic drives, physical power/sensing/feedback blocks, hazard mitigations and alternative robot comparison are design proposals, not components purchased or tested.
- **Physical claims:** none are made for real accuracy, payload, grip force, industrial safety, hardware reliability or production throughput.

Evidence inputs bundled at `source-data/` are exact copies of the raw/summary JSON committed under `validation/results/` in local commit `8368c84`, so this report package can rebuild independently of the current checkout’s incomplete validation directory.

## Document and visual QA

- DOCX reopened with `python-docx`: **PASS**; 135 paragraphs, 7 tables, 10 embedded images, 10 sequential figure captions, one section. DOCX ZIP integrity test returned no corrupt member.
- PDF exported from the final DOCX by LibreOffice: **PASS**; 12 pages. Pages 3–10 are eight pages of technical body, within the brief’s 7–10 page target excluding references/appendices.
- PDF text extraction with `pypdf`: **PASS**; 22,234 selectable text characters, and every page has extractable text (793–2,148 characters per page; page 10 has 2,992). The report is not flattened to images.
- Body justification: **PASS**; 27 long narrative paragraphs identified as explanatory report body are `JUSTIFY` in the DOCX. The cover disclaimer, references, captions, headings, lists, tables, equations and code are intentionally left/center aligned. Rendered paragraphs show even justification without conspicuous gaps after the final reference and appendix layout adjustment.
- Figures/captions and lists: **PASS**; figures are numbered 1–10 in sequence, captions are present, and the contents/figure/table page numbers match the final 12-page render. The final report includes 5 numbered tables.
- Per-page visual inspection: **PASS**; all 12 PDF pages were rendered at 1.5× page scale to PNG and viewed individually, with a contact sheet used for pagination review. The final pass showed no blank/near-empty pages, clipping, overflow, broken symbols, orphaned headings or missing figures. Figure 1, 3, 5, 7 and 8 were revised after initial inspection to remove label collisions and improve legibility; the final PDF was re-exported and re-rendered.
- DOCX/PDF content parity: **PASS** for headings, equations, values, tables and report claims; the PDF extraction contains the campaign totals, cycle statistics, fault totals and analytical statements in the DOCX.
- References: **PASS** for publisher/course/library/safety sources checked during report preparation (Cambridge University Press, Northwestern Modern Robotics, Rapier documentation and OSHA). Source links and access dates are printed in the report.
- Technical report length, figures, and tables: **PASS** at eight technical pages, ten figures, five labeled report tables (the contents table is additional).

## Remaining submission actions and limitations

1. Replace `[Full student name]` and `[Registration number]` on the cover; ensure any required university/institution wording is correct.
2. Confirm the ambiguous V3 due date `30-1 October 2026` with the course instructor.
3. Independently verify the derivations, source attributions and report wording; the brief asks the student to acknowledge AI assistance. The report explicitly discloses its use.
4. The report reflects simulation and configured design assumptions only. Physical grip force, drive sizing, payload, reach clearance, collision safety, cycle time, repeatability and reliability require physical/engineering validation before construction.
5. The original assignment brief is outside the repository (`/Users/lochan/Downloads/...`) and is not copied into this package; it was not modified.
6. The current project checkout entered an unrelated, unresolved Git rebase/conflict during report production. No application files were changed by this report task and no remote operation was run by this task. The deliverables remain uncommitted in `deliverables-2/`; do not resolve or commit the pre-existing conflict as part of report review.
