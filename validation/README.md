# SortLab Phase 6 validation runner

`npm run validate:campaign` runs the production-path validation tests in this directory. It uses the real `SortingController`, destination-route planner, trajectory generator, package/gripper port, `PackagePhysicsSimulation`, and `classifyPlacement`. Each nominal attempt gets a newly initialized Rapier world and the same 1/60 s fixed step as the application. No wall-clock delays drive the headless campaigns.

```sh
SORTLAB_CAMPAIGN_LABEL=run-01 npm run validate:campaign
SORTLAB_CAMPAIGN_LABEL=run-02 npx vitest run --config vitest.validation.config.ts validation/campaign.test.ts
```

The label is part of generated filenames. The default label is `latest`; existing baseline artifacts are not overwritten. The nominal order is 33 repetitions of S, M, L, followed by S: 34 S→B1, 33 M→B2, and 33 L→B3. Each world starts from the configured package pose and fresh Rapier initialization; no stochastic seed is needed. The runner checks unique attempt IDs, exact count, terminal state, controller and actual final package classification, and writes raw JSON plus a derived summary.

The fault campaign executes 3 trials for each of 12 fault classes (36 total), and after each fault resets the same controller/world and requires a successful nominal rerun with unchanged body/collider counts. Hooks/adapter responses are used only for controller-level route/grasp/timeout/release fault injection. Lost attachment uses the real Rapier release operation; wrong-bin/outside placement teleports the real detached package body through the validation-only pose setup method before production classification; aborts invoke the actual controller abort command at named states. These injections are not claims of naturally occurring hardware failures.

Kinematics/trajectory and physics tests write `numerics.json` and `physics.json`. The former covers 5,000 deterministic joint samples, an 81×81 workspace grid, limit/singularity/reach checks, and all configured routes. The latter compares two identical 120-step Rapier traces, tests real grasp/carry/release and misalignment rejection, tests placement tolerance boundaries, and compares reset state/body counts with a fresh world.

Artifacts are checked in under `validation/results/`. `nominal-baseline*.json` records the pre-fix 100-cycle baseline; `nominal-final*.json` records the final implementation and exact repeated-run output; `faults-final*.json`, `numerics.json`, and `physics.json` record the other campaigns. Summary files are generated from raw rows in the tests. Do not edit generated data by hand; rerun the command after changing runner behavior.
