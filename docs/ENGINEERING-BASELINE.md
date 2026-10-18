# SortLab Engineering Baseline

**Status:** Provisional design inputs for feasibility checks. Nothing below is measured or a purchased hardware specification. Use SI; X forward, Y lateral, Z up; angles in radians internally.

## Robot and operating envelope

| Parameter           |                                Baseline | Rationale / status                                        |
| ------------------- | --------------------------------------: | --------------------------------------------------------- |
| Mechanism           |                       4-axis SCARA-like | Fixed tabletop pick/place, explainable analytic planar IK |
| J1                  |        Shoulder revolute about Z, ±150° | Provisional limit                                         |
| J2                  |  Elbow revolute about parallel Z, ±160° | Allows near-folded center bin, with limited margin        |
| Link lengths        |                    L1=0.30 m, L2=0.25 m | Compact assumed cell; ideal radial reach 0.05–0.55 m      |
| J3                  |  TCP world Z 0.30–0.58 m; 0.28 m travel | Includes supports, package centers, transfer/home         |
| J4                  |                 Tool yaw about Z, ±180° | Align parallel jaws to package sides                      |
| Gripper             |      Parallel jaws, 0.03–0.16 m opening | Assumed 0.06–0.12 m package width                         |
| Virtual jaw force   |                            25 N per jaw | Design capacity assumption, not actuator rating           |
| Speed limits        |     J1/J2 90°/s; J3 0.25 m/s; J4 120°/s | Initial trajectory constraints                            |
| Acceleration limits | J1/J2 180°/s²; J3 0.50 m/s²; J4 240°/s² | Initial cubic profile constraints                         |
| Robot physics       |     Kinematically commanded rigid links | No motor/inertia model or physical robot available        |

## Phase 3 package, gripper, and physics assumptions

The existing route defines the TCP at the package-center grasp pose; there was no physical tool/capture envelope in the earlier baseline. Phase 3 adds the following configurable provisional geometry in `src/engineering/config.ts`:

| Item | Assumption | Rationale / limit |
|---|---:|---|
| Palm | 0.075 × 0.040 × 0.018 m; palm center 0.065 m above TCP | Schematic placement clears the package center; not a manufactured tool drawing |
| Pads | 0.035 m long × 0.008 m thick, contact plane 0.018 m above TCP center | Follows the existing package-center route convention; rigid virtual pads |
| Grasp tolerance | 0.012 m center distance and 8° yaw error | Provisional simulated capture envelope |
| Pad contact overlap | 0.001 m | Small geometric sensor overlap to define two-pad contact; not a force/contact-compliance estimate |
| Package friction / restitution | μ=0.65 / e=0.02 | Simplified common package-to-support material inputs |
| Static support friction | μ=0.80 | Simplified table/conveyor/bin contact input |
| Gravity | 9.81 m/s² in −Z | Standard assumed constant gravity |

Package collider mapping is S/carton → axis-aligned cuboid, M/cylinder → vertical cylinder whose diameter is the package width and height is package height, and L/pouch → rounded cuboid with 0.01 m corner radius. The pouch remains a rigid proxy: it has no folding, deformation, fill motion, fabric friction, or pressure distribution. These are model choices, not measured material properties. All values are stored/validated centrally and remain editable only through the typed configuration.

The grip acceptance check uses Rapier sensor-pad overlap on both sides, TCP/package-center distance, wrapped yaw error, jaw width bounds, and the baseline virtual-force calculation. A Rapier fixed joint holds the captured relative pose. This does not model jaw actuator dynamics, pad compliance, force control, slip, crush, or calibrated friction. Physics advances at the configured 1/60 s timestep using a bounded display-frame accumulator; delayed frames may discard excess wall-clock time rather than perform unbounded catch-up.

Planar radial reach: r²=L1²+L2²+2L1L2 cos(q2); ideal minimum 0.05 m at q2=180°, maximum 0.55 m at q2=0°. Limits, base geometry, tool/package envelope and obstacles reduce this range.

## Workcell coordinates and dimensions

Origin is shoulder axis; assumed tabletop plane z=0.25 m.

| Element         | Center/height                              | Assumed size                                                                 |
| --------------- | ------------------------------------------ | ---------------------------------------------------------------------------- |
| Base            | (0,0) XY                                   | Column footprint radius 0.08 m; model full height/arm offsets                |
| Input conveyor  | Center near (+0.34,0)                      | 0.45 m along X × 0.20 m along Y; belt/support z=0.35 m                       |
| Pick            | (+0.30,0) XY                               | One package presented at a time                                              |
| B1 / B2 / B3    | (-0.24,+0.25), (-0.24,0), (-0.24,-0.25) XY | Exterior 0.24 × 0.22 m; interior 0.20 × 0.18 m; lip z=0.46 m; floor z=0.30 m |
| Transfer height | TCP z=0.54 m                               | 0.08 m above bin lip; arm links still require checking                       |
| Home target     | (+0.30,0,0.56) m                           | Above pickup/conveyor; full swept path must be checked                       |

The bin pitch is 0.25 m across Y and exterior width 0.22 m, leaving 0.03 m nominal gaps. The middle bin's nearest outer face is x=-0.12 m, 0.04 m beyond the assumed base-column radius of 0.08 m. The conveyor begins at x=0.115 m, 0.035 m beyond that radius on the opposite side. Largest package footprint is 0.16 × 0.12 m, leaving 0.02/0.03 m margin inside the bin when aligned. These margins are tight and still require full 3D collision checks.

## Preliminary XY reach arithmetic

Pick P=(+0.30,0), r=0.300 m. B1/B3 radius = sqrt(0.24²+0.25²)=0.347 m. Center bin B2 radius=0.240 m. These fall inside the ideal 0.05–0.55 m annulus.

For B2, cos(q2)=(r²-L1²-L2²)/(2L1L2)≈-0.6327, giving |q2|≈129.3° versus the provisional 160° stop, about 30.7° margin. This moves the bins far enough to leave a nominal gap from the base column. Shoulder branch, package/tool pose, J3 mapping and collision clearance are not yet verified; this radius check does not prove route reachability.

## Package classes and simulated identification

| ID  | Category |            L × W × H | Assumed mass | Destination |
| --- | -------- | -------------------: | -----------: | ----------- |
| S   | Small    | 0.08 × 0.06 × 0.04 m |      0.10 kg | B1          |
| M   | Medium   | 0.12 × 0.09 × 0.06 m |      0.30 kg | B2          |
| L   | Large    | 0.16 × 0.12 × 0.08 m |      0.60 kg | B3          |

Nominal rigid proxies with centered mass. Values are illustrative, not a warehouse dataset. ID is a deterministic simulated barcode event; colors/labels are presentation only. No physical sensor or vision claim. Phase 3 shape mapping and limitations are specified below.

## Holding-force estimate

Symmetric friction grip with equal jaw normal force N:

2 μ N >= S m (g + a_z); therefore N_required=S m (g+a_z)/(2 μ).

For m=0.60 kg, safety factor S=2.0, g=9.81 m/s², vertical acceleration a_z=0.30 m/s²:

- Assumed μ=0.50: 12.13 N required per jaw.
- Sensitivity μ=0.30: 20.22 N required per jaw.
- Assumed virtual capacity 25 N/jaw: margins 2.06× and 1.24× over those safety-factored requirements.

This is a virtual grasp qualification limit, not a selected actuator. Model excludes crushing, pressure distribution, pad compliance, offset grasp, jerk and torsional slip. Any physical build needs measured friction/crush limits and sourced actuator data.

The production grasp gate uses the configured vertical acceleration term in this safety-factored estimate. A Phase 7 evidence audit found that the implementation had originally omitted it; `attemptGrasp()` was corrected and a regression test plus a fresh 100-cycle campaign were run. The numerical estimate remains a virtual qualification gate and does not establish physical jaw force.

## Performance and safety assumptions

- Piecewise cubic joint profiles with endpoint conditions; fixed 1/60 s simulation/control tick.
- Target median cycle <=12 simulated seconds from accepted pick start through verified release and return-ready. Report median and 95th percentile; target is not a result.
- Nominal acceptance goal: >=95% correct sorting over at least 100 seeded cycles; report failures/raw denominator.
- Virtual stop pauses commands and latches a fault. It is not a safety-rated emergency stop and does not demonstrate human-safe operation.
- Collision checks use sampled swept geometry and Rapier runtime contact queries. Kinematic links do not react physically to contacts; application guard must stop them.

## Phase 1 feasibility checks

1. FK/IK every approach, grasp, lift, transfer, place, retreat and home pose; record branches, limit margin and singularity.
2. Verify J3 world-Z mapping covers package centers and z=0.54–0.56 m.
3. Check sampled link/tool/package sweeps against base, conveyor, bins and neighbors; record minimum clearance and adjust layout if required.
4. Derive cubic coefficients and verify continuity, velocities, acceleration, duration and joint bounds (implemented in Phase 2; see below).
5. Recompute force sensitivity; later select motors only from sourced ratings and explicit link-mass/inertia assumptions.
6. Validate all nominal/fault scenario outcomes in automated simulation tests before using measurements in the report.

### Phase 1 implementation evidence

Phase 1 checked the configured home FK reference, the four station centers (pickup and B1/B2/B3) at transfer height and yaw 0, both nonsingular elbow branches, joint limits, the outer singularity and round-trip tolerances. The implemented workspace distinguishes the ideal 0.05–0.55 m link-only envelope from the configured-J2 radial range of approximately 0.10747–0.55 m. These are mathematical/unit-test checks, not swept-path or collision evidence. Phase 2 now covers cubic profile generation and fixed-cell TCP waypoint routes. Full package approach/grasp/place validation, link/tool/package clearance, physical actuator selection, and package/fault scenarios remain deferred to later phases. See [Phase 1 implementation notes](PHASE-1-IMPLEMENTATION.md).

Every changed value must stay aligned across configuration, calculations, diagrams, simulation and report.

### Phase 2 trajectory and route implementation

The Phase 2 preview uses the configured speed and acceleration limits for analytic cubic joint trajectories and sampled Cartesian-path timing. Routes start at the configured package-center pickup height (support height plus half the selected category height), rise to z=0.56 m, then pass through a TCP corridor at x=0.12 m, y=+0.40 m for B1/B2 or −0.40 m for B3 before approaching the selected bin. The route tries both elbow branches and verifies IK continuity and configured joint limits. This corridor is a provisional TCP routing assumption, not a checked obstacle or swept-volume clearance. Cartesian limit verification uses deterministic 1/60 s samples and is not hardware validation. Details are in [Phase 2 implementation notes](PHASE-2-IMPLEMENTATION.md).
