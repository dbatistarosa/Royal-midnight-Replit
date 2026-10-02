# Royal Midnight Phase 0 Verification — 2026-10-01

- Recovery commit: `ba90d4101c7a023b286a678994d5ee1f5d5ddda0`
- Remote main before merge: `2e41f9438082ebff7b93fe57976cbdd14df0475e`
- Integration branch: `phase0/source-of-truth`
- Integration base before merge: `1b2f731aa338d187afe90534e7ada8c6ac0ec045`
- Reconciliation merge: `fce2276c72a2365208f17aaeec00c9eca45c3d26`
- Node: `v24.16.0`
- Declared pnpm: `11.7.0`

## Scope and safety

- Driver v2 at `artifacts/driver-app-v2` is the build-29 production candidate.
- `supabase/migrations` is the authoritative deployable migration stream.
- No remote push, deployment, migration application, EAS publication, Stripe operation, or production write is authorized in Phase 0.

## Verification matrix

| Gate | Result | Evidence |
|---|---|---|
| Toolchain | PASS | Node `v24.16.0`; Corepack pnpm `11.7.0`. |
| Frozen dependency install | PASS | Hoisted install from `pnpm-lock.yaml`; Driver Expo and React Native packages present; package manifests and lockfile unchanged. |
| Root typecheck | PASS | Libraries plus API, web, Driver legacy, Driver v2, mockup sandbox, and scripts exited 0. |
| Workspace tests | PASS after test-runner correction | Scripts 6/6; Driver v2 39/39; web 3/3; API 259/259. Total: 307 tests, zero failures. |
| Web production build | BLOCKED — Windows platform | Vite transformed 4,590 modules, then esbuild 0.28.2 failed to remove a temporary input file held by another process. A diagnostic `esnext`/unminified build completed all 4,590 modules, but it does not satisfy the production-build gate. |
| API production build | PASS | `dist/app.mjs` built and cold-imported with a dummy database URL as `function`; no real database connection was made. |
| Driver v2 typecheck | PASS | `tsc -p tsconfig.json --noEmit` exited 0. |
| Driver v2 unit tests | PASS | 39/39 tests passed with zero failures. |
| Driver Android export | PASS | Metro bundled 2,228 modules and wrote an 8.2 MB Android JavaScript bundle without publishing. |
| Driver Expo config | PASS | Package `com.royalmidnight.driver`; API `https://www.royalmidnight.com/api`; resolved config contains `x86_64`. |
| Production dependency audit | BLOCKED — external registry | Two `pnpm audit --audit-level high --prod` attempts produced no registry response and were stopped after bounded waits; no dependency was modified. |
| Supabase migration manifest | PASS | `node --test scripts/migration-manifest.test.mjs`: 6/6; ten ordered, nonempty, uniquely versioned migration files with checksums. Commit `5565fc5`. |
| Production migration state | PASS with one documented exception | Read-only Supabase query: all ten authoritative migration names are present; nine normalized SHA-256 values match exactly. `backfill_default_vehicle_capacity` has the known content drift already explicitly allowlisted in `vercel.json`. No SQL was applied. |
| Forbidden tracked paths | PASS | Zero tracked `.env*` files other than `.env.example`, mobile service files, private-key containers, Vercel environment exports, `.playwright-cli`, or `.superpowers` ledgers. |
| Changed-text secret scan | PASS | Zero unresolved private-key, provider-token, credentialed-database-URL, or hardcoded provider-secret findings in `recovery/phase0-2026-10-01...HEAD`. Output was restricted to rule, path, and line. |
| Git whitespace and lineage | PASS | `git diff --check` exited 0; both `origin/main` and recovery commit `ba90d41` are ancestors of `HEAD`. |

## Findings and rulings

- The fresh fetch advanced `origin/main` from `21adb855c665a7c73ac7cb0a0bf437864022fa64` to `2e41f9438082ebff7b93fe57976cbdd14df0475e`.
- Before reconciliation, `origin/main...phase0/source-of-truth` was 6 commits on main and 23 commits on the integration branch.
- The merge completed without conflicts. Both `origin/main` and the immutable recovery commit are ancestors of the integration branch, and all four critical application/migration paths remain present.
- API originally reported 256 passing assertions but failed the suite because `driverBookingView.contract.test.mjs` registered three tests with `node:test` inside a Vitest package. Commit `476bb5f` converts only that contract file to Vitest; the focused 3/3 and complete API 259/259 suites pass.
- The web failure was reproduced independently with esbuild transforming input larger than 1 MB. A temporary-directory change, native-binary inclusion, disabled esbuild worker threads, and a Windows stdio patch did not produce an acceptable production build. All unsuccessful dependency/configuration experiments were fully reverted; no esbuild patch or lockfile drift remains.
- The diagnostic web build proves that Rollup can transform and render the recovered source on this host, but the final production esbuild-transpile step remains blocked by Windows file locking. This is recorded as a platform limitation, not reported as a passing production build.
- The production audit reached no response from the npm audit service in two attempts, including one with bounded fetch settings. This is recorded as missing external verification, not as a clean audit.
- The user selected Production for the read-only migration-state check. The existing ignored local export contains the expected key once, but its substituted value is not a PostgreSQL connection URI; the local CLI attempt therefore stopped before any connection or query and cleared the process variable.
- A proposed refresh of all Production variables from Vercel was rejected because it would unnecessarily download every production secret, and it was not retried. The already connected Supabase integration provided the narrower safe path: project discovery reported `royal-midnight` as active and healthy, followed by read-only metadata/hash queries only.
- Production contains all ten authoritative migration names. Nine normalized SQL SHA-256 values match the local manifest exactly. The sole mismatch is `20260916093000_backfill_default_vehicle_capacity.sql`; its production history uses an earlier version/content variant and the filename is already explicitly listed in `ALLOW_MIGRATION_DRIFT` in `vercel.json`. Applied migration SQL was not displayed.
- No secret value, database URL, database host, username, password, provider token, private key, or applied migration statement was written to this report.

## Commands and commit evidence

| Area | Command or evidence | Result |
|---|---|---|
| Dependencies | `corepack pnpm install --frozen-lockfile` with pnpm `11.7.0` | PASS; manifests and lockfile unchanged. |
| Types | `corepack pnpm typecheck` | PASS. |
| Tests | `corepack pnpm test` | PASS, 307/307 after commit `476bb5f`. |
| API | package production build plus cold import of `dist/app.mjs` | PASS. |
| Web | package production build | BLOCKED at esbuild 0.28.2 temporary-file cleanup on Windows; diagnostic unminified build only passed. |
| Driver v2 | explicit TypeScript check, 39 tests, Android export, resolved Expo config | PASS; no EAS build or publication. |
| Migrations | manifest validator, local `corepack pnpm db:check` attempt without `--apply`, and read-only Supabase metadata/hash query | Local manifest PASS; Production 10/10 present, 9 exact, 1 explicitly allowlisted known drift. |
| Security | tracked-path scan and changed-line pattern scan | PASS, zero findings. |
| Git | ancestry checks and `git diff --check recovery/phase0-2026-10-01...HEAD` | PASS. |

## Phase 0 disposition

The integration branch is locally reconciled and the validated code/test gates pass, but Phase 0 is **not fully green**. Two external/platform gates and one migration-history debt remain open:

1. run the normal minified web production build on a non-affected runner (recommended: Linux CI);
2. obtain a successful production dependency audit response from the npm registry;
3. decide how to canonicalize the already allowlisted `backfill_default_vehicle_capacity` history without editing or replaying an applied production migration.

No remote push, deployment, migration application, EAS build/publication, Stripe operation, Supabase write, or production-data write occurred.
