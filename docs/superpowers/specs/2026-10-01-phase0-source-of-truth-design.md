# Royal Midnight Phase 0 Source-of-Truth Design

**Date:** 2026-10-01
**Status:** Proposed for implementation

## Purpose

Turn the working Royal Midnight state that produced Driver build 29 into a
recoverable, reviewable, and reproducible source of truth for the public web
application, all dashboards, the API, database migrations, and Driver v2.

Phase 0 changes repository and delivery hygiene only. It must not intentionally
change product behavior, deploy production, apply a database migration, publish
an EAS build, charge Stripe, or expose a secret.

## Confirmed Starting State

- The original working branch was `fix/royal-midnight-reliability` at
  `aa9add8aca6e2e86671860a442b4d8cb636852ed`.
- The previously uncommitted product state comprised 170 source, test,
  migration, documentation, and asset files after excluding temporary agent and
  browser artifacts.
- That state is preserved locally on
  `recovery/phase0-2026-10-01` at
  `ba90d4101c7a023b286a678994d5ee1f5d5ddda0`.
- The recovery branch has not been pushed to a remote.
- The isolated implementation branch is `phase0/source-of-truth`, starting at
  the same recovery commit.
- `origin/main` was three merge commits ahead and 23 commits behind the former
  working branch at the last local comparison. A fresh fetch is required before
  reconciliation.
- Driver build 29 is the functional reference. Driver v2 is therefore the
  production candidate. The legacy Driver source remains untouched until a
  separate archival decision is approved.
- Driver v2's 39 dependency-independent unit tests pass in the recovered state.
- The existing root dependency installation is not a valid baseline: root
  pnpm stopped on a missing React Native package, and Driver typecheck could not
  resolve its Expo/React Native dependencies.
- The repository declares pnpm 11.7.0 and Node 24 in CI. The original machine
  was running pnpm 11.19.0, so validation must use the declared versions.
- The recent Drizzle and Supabase WELCOME20/compliance migrations are
  semantically equivalent. `driver_change_requests` is present in the
  authoritative Supabase migration stream and in the TypeScript schema but has
  no parallel numbered Drizzle SQL file.

## Safety Invariants

1. The recovery branch and commit remain unchanged throughout Phase 0.
2. No ignored environment file, Firebase configuration, Vercel environment
   export, private key, credential file, browser log, or agent runtime ledger is
   committed.
3. No remote branch is pushed without explicit user approval after a staged
   secret scan and final diff review.
4. No production deployment, EAS build, Stripe operation, Supabase write, or
   migration application occurs in Phase 0.
5. Reconciliation must preserve Driver v2 and the later reliability/security
   work. `origin/main` must never replace the recovered tree wholesale.
6. Destructive cleanup is limited to disposable worktrees created during this
   phase. The original checkout and recovery branch are not reset or cleaned.
7. Build and test claims require fresh command output from a clean checkout.

## Repository Model

### Recovery reference

`recovery/phase0-2026-10-01` is an immutable local safety reference. It contains
the exact meaningful product state recovered from the original dirty worktree.
It is not the integration branch and receives no additional commits.

### Integration branch

`phase0/source-of-truth` is the only branch modified during Phase 0. Work takes
place in an isolated sparse worktree. The sparse checkout excludes only
`attached_assets`, whose large historical videos and images caused OneDrive to
stall; those files remain present in Git and in the recovery commit.

### Canonical Driver

`artifacts/driver-app-v2` is the build-29 production candidate and participates
in every quality gate. `artifacts/driver-app` remains versioned but is treated
as legacy read-only source. Removing or archiving it is outside Phase 0.

## Reconciliation Strategy

1. Fetch `origin` to obtain authoritative current remote refs.
2. Recompute ahead/behind counts and tree differences.
3. Merge current `origin/main` into `phase0/source-of-truth` with an explicit
   merge commit so both histories remain traceable.
4. Resolve conflicts in favor of the recovered functional behavior unless a
   main-only change is demonstrably newer and compatible.
5. Review every conflict and the final merge diff; do not accept broad
   delete/replace resolutions.
6. Record provenance: recovery commit, remote main commit, merge commit, and
   verification commands.

Rebase and squash are deliberately rejected for this phase because they would
rewrite the recovered lineage and make production provenance harder to audit.

## Dependency Reproduction

The clean worktree must use Node 24 and pnpm 11.7.0, matching CI. Installation
must run from the repository root with:

```text
pnpm install --frozen-lockfile --config.node-linker=hoisted
```

The install must not change `pnpm-lock.yaml`. Driver v2 remains a workspace
package; its `package-lock.json` is retained only because EAS/npm history may
still depend on it, but root verification uses the pnpm lockfile and workspace
configuration.

If network access is needed, request approval for the scoped install command.
An offline cached install may be attempted first. Any package-manager drift or
lockfile mutation is a Phase 0 finding, not something to silently accept.

## Database Migration Verification

`supabase/migrations` is the authoritative deployable migration stream because
`scripts/migrate.mjs` reads that directory. Phase 0 must:

1. Validate filenames, order, duplicate names, and checksums locally.
2. Confirm that every schema object used by the recovered API has an
   authoritative migration.
3. Run the existing read-only migration check against the intended database
   only after the user identifies the environment and confirms that the
   corresponding `DATABASE_URL` is already configured locally.
4. Never print the connection string or migration secrets.
5. Report pending or drifted migrations; do not apply them in Phase 0.

The absence of a Drizzle-numbered mirror for `driver_change_requests` is to be
documented, not duplicated automatically, because the runtime migrator does not
consume `lib/db/drizzle`.

## Verification Gates

The source-of-truth branch is acceptable only when all applicable gates pass
from the clean worktree:

1. Frozen dependency installation with no lockfile change.
2. Root `pnpm run typecheck`.
3. Root `pnpm run test`.
4. Public web production build.
5. API production bundle build.
6. Import of the built API bundle using the CI dummy database URL.
7. Driver v2 typecheck.
8. Driver v2 unit tests, including all 39 current tests.
9. Driver Android export and resolved Expo configuration check, without
   publishing a build.
10. Production dependency audit at high severity.
11. `git diff --check`, allowing only reviewed Markdown hard breaks.
12. Clean `git status` apart from documented ignored build outputs.

A failed gate must be classified as one of:

- source defect;
- dependency/environment defect;
- platform-specific limitation;
- missing external configuration.

Phase 0 may fix source or repository defects needed to make these gates
reproducible, but it must not use product behavior changes to make a gate pass.

## Deliverables

1. Immutable local recovery branch and commit.
2. Clean reconciled `phase0/source-of-truth` branch.
3. Phase 0 implementation plan and execution ledger.
4. Migration inventory with local and optional remote verification results.
5. Verification report listing exact commands, versions, pass/fail counts, and
   any justified exclusions.
6. A proposed remote/pull-request handoff, requiring separate user approval
   before push.

## Completion Criteria

Phase 0 is complete only when:

- meaningful recovered changes are committed and recoverable;
- the integration branch contains current main history without losing Driver
  v2 or reliability work;
- dependency installation and all applicable verification gates succeed from
  the isolated checkout;
- migration state is verified without applying changes;
- the repository reports a clean, explainable status;
- no secret has been committed or disclosed;
- the final report identifies exact commits and any external decision still
  required before a push or deployment.

If an external environment prevents a gate, Phase 0 remains incomplete unless
the user explicitly narrows the completion requirement.
