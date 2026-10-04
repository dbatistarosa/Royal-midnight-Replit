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
- The user later authorized pushing the isolated branch and opening a draft PR. No merge, production deployment, migration application, EAS publication, Stripe operation, Supabase write, or production-data write is authorized.
- Draft PR: `https://github.com/dbatistarosa/Royal-midnight-Replit/pull/18` (base `main`, head `phase0/source-of-truth`).

## Verification matrix

| Gate | Result | Evidence |
|---|---|---|
| Toolchain | PASS | Node `v24.16.0`; Corepack pnpm `11.7.0`. |
| Frozen dependency install | PASS | Hoisted install from `pnpm-lock.yaml`; the security-only dependency update resolves Nodemailer `10.0.13` and `brace-expansion` `5.0.12`. |
| Root typecheck | PASS | Libraries plus API, web, Driver legacy, Driver v2, mockup sandbox, and scripts exited 0. |
| Workspace tests | PASS after test-runner correction | Scripts 6/6; Driver v2 39/39; web 3/3; API 259/259. Total: 307 tests, zero failures. |
| Web production build | PASS in Linux CI; BLOCKED locally on Windows | GitHub Actions run `37026835443` completed the normal minified production build. The local Windows/OneDrive host still fails during esbuild temporary-file cleanup after transforming 4,590 modules; a diagnostic unminified local build also completed all modules. |
| API production build | PASS | `dist/app.mjs` built and cold-imported with a dummy database URL as `function`; no real database connection was made. |
| Driver v2 typecheck | PASS | `tsc -p tsconfig.json --noEmit` exited 0. |
| Driver v2 unit tests | PASS | 39/39 tests passed with zero failures. |
| Driver Android export | PASS | The clean Linux CI run `37134433945` installed the updated lockfile, typechecked the Driver, ran its unit tests, exported Android successfully, and verified resolved native configuration. No EAS build or publication occurred. |
| Driver Expo config | PASS | Package `com.royalmidnight.driver`; API `https://www.royalmidnight.com/api`; resolved config contains `x86_64`. |
| Production dependency audit | PASS with two scoped unfixable exceptions | CI run `37134433945` passed `pnpm audit --audit-level high --prod`. Nodemailer and `brace-expansion` are patched. `GHSA-86w9-cpqp-85rv` (`node-forge` 1.4.0) and `GHSA-vfj7-8cjw-p6xm` (`braces` 3.0.3) have no published patched release as of 2026-10-03. Their reported paths are limited to Expo CLI/code-signing/Metro build tooling and are not bundled into either APK. |
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
- The first PR CI run (`37026835443`) proved the Linux web build, root typecheck, 307 tests, and Driver Android quality job all pass. It failed only at the production audit, which reported five high advisories: two in Nodemailer 9.1.1, two in `brace-expansion` 5.0.9, and one unfixable `node-forge` advisory.
- The remediated lockfile resolves Nodemailer 10.0.13 and `brace-expansion` 5.0.12. The local production audit now exits 0. `node-forge` remains at the latest published version, 1.4.0; `GHSA-86w9-cpqp-85rv` explicitly lists no patched version, so the repository contains a narrow documented `auditConfig.ignoreGhsas` exception rather than a false version override.
- PR CI run `37133834256` passed the Driver Android job, typecheck, all tests, and the Linux web build. Its audit then surfaced newly reviewed `GHSA-vfj7-8cjw-p6xm` in `braces` 3.0.3. GitHub lists no patched version and npm still reports 3.0.3 as latest; all 100 audit paths are under Expo/Metro build tooling. A second narrow GHSA exception records this temporary upstream debt.
- Final PR CI run `37134433945` passed every step: frozen install, typecheck, 307 tests, Linux web production build, production audit, API build, API cold import, Driver Android export, and native configuration.
- Nodemailer 10's ESM package layout initially appeared to fail the API cold-import inside the filesystem sandbox. Repeating the exact import with access to the pnpm junction succeeded (`Bundle loaded OK: function`), confirming no application compatibility change.
- A post-update Android export on this host exposed incomplete local pnpm package materialization: successively missing files from React, `react-native-css-interop`, Expo Modules Core, and TanStack Query. A forced frozen hoisted reinstall restored some files but not the entire Expo tree. No source workaround was added for a corrupt local cache; the clean Linux CI job is the acceptance gate.
- The user selected Production for the read-only migration-state check. The existing ignored local export contains the expected key once, but its substituted value is not a PostgreSQL connection URI; the local CLI attempt therefore stopped before any connection or query and cleared the process variable.
- A proposed refresh of all Production variables from Vercel was rejected because it would unnecessarily download every production secret, and it was not retried. The already connected Supabase integration provided the narrower safe path: project discovery reported `royal-midnight` as active and healthy, followed by read-only metadata/hash queries only.
- Production contains all ten authoritative migration names. Nine normalized SQL SHA-256 values match the local manifest exactly. The sole mismatch is `20260916093000_backfill_default_vehicle_capacity.sql`; its production history uses an earlier version/content variant and the filename is already explicitly listed in `ALLOW_MIGRATION_DRIFT` in `vercel.json`. Applied migration SQL was not displayed.
- No secret value, database URL, database host, username, password, provider token, private key, or applied migration statement was written to this report.

## Commands and commit evidence

| Area | Command or evidence | Result |
|---|---|---|
| Dependencies | `corepack pnpm install --frozen-lockfile --config.node-linker=hoisted` with pnpm `11.7.0` | PASS; security lockfile resolves Nodemailer `10.0.13` and `brace-expansion` `5.0.12`. |
| Types | `corepack pnpm typecheck` | PASS. |
| Tests | `corepack pnpm test` | PASS, 307/307 after commit `476bb5f`. |
| API | package production build plus cold import of `dist/app.mjs` | PASS. |
| Web | package production build | PASS in GitHub Actions Linux run `37026835443`; local Windows limitation remains documented. |
| Driver v2 | explicit TypeScript check, 39 tests, Android export, resolved Expo config | PASS in final CI run `37134433945`; no EAS build or publication. |
| Migrations | manifest validator, local `corepack pnpm db:check` attempt without `--apply`, and read-only Supabase metadata/hash query | Local manifest PASS; Production 10/10 present, 9 exact, 1 explicitly allowlisted known drift. |
| Security | tracked-path scan, changed-line pattern scan, and `pnpm audit --audit-level high --prod` | PASS in final CI run `37134433945`; zero secret findings; patched high advisories removed; two no-fix Expo-build-tool advisories explicitly scoped and ignored. |
| Git | ancestry checks and `git diff --check recovery/phase0-2026-10-01...HEAD` | PASS. |

## Phase 0 disposition

The integration branch is reconciled and all code, test, build, security, and Driver gates are green in final CI run `37134433945`. One migration-history debt remains open:

1. decide in a later authorized phase how to canonicalize the already allowlisted `backfill_default_vehicle_capacity` history without editing or replaying an applied production migration.

The isolated branch was pushed and draft PR 18 was opened with explicit authorization. No merge, production deployment, migration application, EAS build/publication, Stripe operation, Supabase write, or production-data write occurred.
