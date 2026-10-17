# SortLab GitHub Workflow

## Intended repository and verified state

- Intended name: SortLab
- Intended owner: 7ochan (shown by the local GitHub CLI profile)
- Visibility: private
- Primary branch: main
- Intended URL after creation: https://github.com/7ochan/SortLab

As checked on 2026-10-17, this URL is only a target: no remote is configured and no GitHub repository was verified or created. Local Git is initialized on main but has no commit yet. GitHub CLI reports its saved github.com token is invalid. No credentials are stored in the project.

## Secure recovery

Run `gh auth login -h github.com` in a terminal and complete the browser login for the intended account. Do not paste a token, password, device code or credential into chat or project files. Then run `gh auth status`. If login succeeds but creation is denied, confirm personal-account ownership or organization permissions. The invalid saved credential was not read, printed, revoked or changed here.

## Initial private push

After authentication is valid:

1. Check whether SortLab already exists and inspect its owner, visibility and contents before attaching.
2. If absent, create it as private without a remote README: `gh repo create 7ochan/SortLab --private --source=. --remote=origin`.
3. Inspect status and staged diff; verify .gitignore; review staged paths for secrets, local caches, generated builds and personal files.
4. Commit the planning documents coherently on local main. Do not include dependencies, browser binaries, logs or machine-specific output.
5. Push main, then verify `git remote -v`, `git ls-remote --heads origin main` and `gh repo view 7ochan/SortLab --json name,visibility,url,defaultBranchRef`. Claim completion only if repository visibility is private and remote main is present.

This create/push sequence is gated on a successful auth check. Never publish public as fallback.

## Ongoing milestone workflow

- Keep main as the reviewable baseline.
- Use short-lived branches for substantial work (for example feat/kinematics, docs/report-v1); direct main commits are fine for small reviewed documentation fixes.
- Before commit, inspect status/diff, run the relevant agreed checks, and label simulation outputs.
- Commit focused milestones with descriptive messages; merge reviewed branches to main and push main after acceptance criteria pass.
- Keep source, tests, lockfiles, documentation, diagrams, config and curated evaluation evidence versioned.
- Exclude secrets, local environment, dependency caches, browser binaries, transient builds, coverage, test reports and machine-specific generated output. Large or transient result output may be regenerated; curated result tables with run metadata may be versioned.

## Ignore policy

.gitignore excludes node_modules, builds, Vite/coverage output, Playwright reports/local state, OS metadata, Python virtual environments/caches, TypeScript build metadata and local env files. It does not blanket-ignore documents, PDFs, images or CSVs because assignment briefs, authored report exports, diagrams and curated results may be required evidence. Review every file before staging.

## Recovery

- Auth/permission failure: complete browser login and recheck status/ownership.
- Repository already exists: inspect before attaching; fetch and compare histories. Never force-push or overwrite unknown work.
- Branch mismatch: inspect both histories and integrate explicitly; do not change default branch blindly.
- Secret staged or exposed: remove from staged content; if exposed, rotate/revoke with the issuing service. Ignore rules do not remove tracked secrets.
- Push not verifiable: report it as incomplete; inspect remote branch and privacy before claiming success.
