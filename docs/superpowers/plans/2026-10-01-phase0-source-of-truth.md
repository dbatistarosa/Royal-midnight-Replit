# Royal Midnight Phase 0 Source-of-Truth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a clean, traceable, and reproducible Royal Midnight branch that preserves the build-29 state, contains current `main` history, validates migrations without applying them, and proves web, API, and Driver v2 from a clean checkout.

**Architecture:** Keep `recovery/phase0-2026-10-01` immutable and perform all integration on `phase0/source-of-truth` in its isolated sparse worktree. Merge remote history without rewriting it, install exactly the CI toolchain, add a small dependency-free migration-manifest validator, run the repository's production gates, and capture evidence in one handoff report. No remote push, production write, deployment, or EAS publication belongs to this plan.

**Tech Stack:** Git worktrees, Node.js 24, pnpm 11.7.0, TypeScript, Vitest/Node test runner, Vite, Express, Expo SDK 57, PostgreSQL/Supabase migrations

**Spec:** `docs/superpowers/specs/2026-10-01-phase0-source-of-truth-design.md`

## Global Constraints

- Preserve `recovery/phase0-2026-10-01` at `ba90d4101c7a023b286a678994d5ee1f5d5ddda0` unchanged.
- Work only on `phase0/source-of-truth` in `C:\Users\encue\OneDrive\Escritorio\Hermes\Royal-midnight-phase0-consolidation`.
- Driver v2 (`artifacts/driver-app-v2`) is the build-29 production candidate; the legacy Driver source remains untouched.
- Use Node 24 and pnpm 11.7.0, matching `.github/workflows/ci.yml` and `package.json`.
- Never commit or print ignored environment files, Firebase configuration, Vercel environment exports, private keys, tokens, cookies, or database credentials.
- Do not push, deploy, apply migrations, publish EAS builds, or perform Stripe/Supabase writes.
- `supabase/migrations` is the authoritative deployable migration stream.
- `attached_assets` remains in Git but outside the sparse checkout; no build gate may depend on it.
- Any product-behavior change discovered during verification requires a failing regression test and a ledger ruling before implementation.

## Review Focus

- A merge resolution that silently removes or downgrades Driver v2 must fail Task 1's critical-path and ancestry checks.
- A package-manager mismatch or install that rewrites the lockfile must fail Task 2 before any quality gate is trusted.
- Duplicate, malformed, empty, or reordered Supabase migrations must fail Task 3's manifest tests.
- A locally green unit suite with an unloadable API bundle or invalid Expo config must fail Task 4's cold-start/export checks.
- A migration check pointed at an unconfirmed environment or run with `--apply` must be rejected by Task 5 before any database connection is made.

---

### Task 1: Reconcile Remote History Without Losing the Recovered Tree

**Files:**
- Create: `docs/handoff/phase0-source-of-truth-verification-2026-10-01.md`
- Verify: `artifacts/driver-app-v2/**`
- Verify: `artifacts/api-server/**`
- Verify: `artifacts/royal-midnight/**`
- Verify: `supabase/migrations/**`

**Interfaces:**
- Consumes: recovery commit `ba90d4101c7a023b286a678994d5ee1f5d5ddda0`, local branch `phase0/source-of-truth`, remote `origin`.
- Produces: a merge commit whose history contains current `origin/main`, plus a report header containing the recovery SHA, fetched main SHA, merge SHA, Node version, and package-manager version.

- [ ] **Step 1: Verify the immutable recovery reference and clean integration worktree**

Run:

```powershell
git rev-parse recovery/phase0-2026-10-01
git branch --show-current
git status --porcelain
```

Expected: recovery resolves to `ba90d4101c7a023b286a678994d5ee1f5d5ddda0`, branch is `phase0/source-of-truth`, and status is empty before the plan file/report work is committed.

- [ ] **Step 2: Fetch authoritative remote refs**

Run: `git fetch --prune origin`

Expected: exit 0. This changes only remote-tracking refs and must not alter the worktree.

- [ ] **Step 3: Record pre-merge provenance in the verification report**

Create the report with these exact fields and resolved values:

```markdown
# Royal Midnight Phase 0 Verification — 2026-10-01

- Recovery commit: `ba90d4101c7a023b286a678994d5ee1f5d5ddda0`
- Remote main before merge: `<git rev-parse origin/main>`
- Integration branch: `phase0/source-of-truth`
- Integration base before merge: `<git rev-parse HEAD>`
- Node: `<node --version>`
- Declared pnpm: `11.7.0`
```

- [ ] **Step 4: Merge `origin/main` with traceable history**

Run: `git merge --no-ff origin/main -m "merge: reconcile main into phase 0 source of truth"`

Expected: either a clean merge commit or an explicit conflict list. For conflicts, preserve recovered Driver v2 and later reliability/security behavior; inspect each file with `git diff --cc`, resolve only that file, and record every resolution as a ledger ruling before completing the merge.

- [ ] **Step 5: Verify ancestry and critical paths**

Run:

```powershell
git merge-base --is-ancestor origin/main HEAD
git merge-base --is-ancestor ba90d4101c7a023b286a678994d5ee1f5d5ddda0 HEAD
Test-Path artifacts/driver-app-v2/package.json
Test-Path artifacts/api-server/src/app.ts
Test-Path artifacts/royal-midnight/src/main.tsx
Test-Path supabase/migrations/20260930120000_driver_change_requests.sql
git diff --name-status ba90d4101c7a023b286a678994d5ee1f5d5ddda0..HEAD
```

Expected: both ancestry commands exit 0, all four path checks return `True`, and every tree change from the recovery commit is explained by the spec/plan/report or reviewed main integration.

- [ ] **Step 6: Commit the report skeleton if the merge did not already include it**

```powershell
git add docs/handoff/phase0-source-of-truth-verification-2026-10-01.md
git commit -m "docs: record phase 0 provenance"
```

Expected: the report header is committed separately from product code.

### Task 2: Reproduce the Declared Dependency Environment

**Files:**
- Verify unchanged: `package.json`
- Verify unchanged: `pnpm-lock.yaml`
- Verify unchanged: `pnpm-workspace.yaml`
- Verify unchanged: `artifacts/driver-app-v2/package-lock.json`

**Interfaces:**
- Consumes: the reconciled Task 1 tree and package manager declaration `pnpm@11.7.0`.
- Produces: a root hoisted `node_modules` installed from the frozen pnpm lockfile without a tracked-file diff.

- [ ] **Step 1: Verify toolchain selection**

Run:

```powershell
node --version
corepack pnpm --version
```

Expected: Node reports `v24.x`; Corepack pnpm reports exactly `11.7.0`.

- [ ] **Step 2: Attempt a cached frozen installation**

Run: `corepack pnpm install --offline --frozen-lockfile --config.node-linker=hoisted`

Expected: exit 0 without changing `pnpm-lock.yaml`. If and only if it fails because an artifact is absent from the local pnpm store, request network approval and rerun the same command without `--offline`.

- [ ] **Step 3: Prove the install did not mutate source or lockfiles**

Run:

```powershell
git diff --exit-code -- package.json pnpm-lock.yaml pnpm-workspace.yaml artifacts/driver-app-v2/package.json artifacts/driver-app-v2/package-lock.json
Test-Path artifacts/driver-app-v2/node_modules/expo/package.json
Test-Path artifacts/driver-app-v2/node_modules/react-native/package.json
```

Expected: diff exits 0 and both dependency path checks return `True`.

### Task 3: Add Deterministic Local Migration-Manifest Validation

**Files:**
- Create: `scripts/migration-manifest.mjs`
- Create: `scripts/migration-manifest.test.mjs`
- Modify: `scripts/migrate.mjs`
- Modify: `scripts/package.json`
- Test: `scripts/migration-manifest.test.mjs`

**Interfaces:**
- Consumes: migration files named `YYYYMMDDHHMMSS_snake_case.sql` from `supabase/migrations`.
- Produces: `normalizeSql(sql)`, `checksumSql(sql)`, `buildMigrationManifest(files)`, and `loadMigrationManifest(directory)`; each manifest entry is `{ file, version, name, source, checksum }` sorted by filename.

- [ ] **Step 1: Write manifest validation tests**

Add Node test cases asserting:

- unsorted valid entries return filename order;
- CRLF and surrounding whitespace produce the same checksum as normalized LF;
- an invalid filename throws `Invalid migration filename: <file>`;
- duplicate versions throw `Duplicate migration version: <version>`;
- duplicate names throw `Duplicate migration name: <name>`;
- empty normalized SQL throws `Empty migration: <file>`.

- [ ] **Step 2: Run the new test to verify RED**

Run: `node --test scripts/migration-manifest.test.mjs`

Expected: FAIL because `scripts/migration-manifest.mjs` does not exist.

- [ ] **Step 3: Implement the manifest module**

Implement these exact exports in `scripts/migration-manifest.mjs` using only `node:fs/promises`, `node:path`, and `node:crypto`:

```javascript
export function normalizeSql(sql) {}
export function checksumSql(sql) {}
export function buildMigrationManifest(files) {}
export async function loadMigrationManifest(directory) {}
```

`buildMigrationManifest` accepts `{ file, sql }[]` and returns the interface above. SHA-256 is calculated from normalized SQL.

- [ ] **Step 4: Run the manifest tests to verify GREEN**

Run: `node --test scripts/migration-manifest.test.mjs`

Expected: all six cases pass.

- [ ] **Step 5: Make the existing migrator consume the validated manifest**

Replace `scripts/migrate.mjs`'s inline filename parsing, normalization, checksum, directory read, and sort with `loadMigrationManifest(directory)`. Preserve transaction, advisory lock, drift allowlist, `--apply`, and credential-handling behavior exactly.

- [ ] **Step 6: Add the package test hook and run it through pnpm**

Add to `scripts/package.json`:

```json
"test": "node --test migration-manifest.test.mjs"
```

Run: `corepack pnpm --filter @workspace/scripts test`

Expected: all migration-manifest tests pass.

- [ ] **Step 7: Validate the real Supabase migration directory**

Run:

```powershell
node -e "import('./scripts/migration-manifest.mjs').then(async m=>{const x=await m.loadMigrationManifest('supabase/migrations');console.log(x.map(({file,checksum})=>({file,checksum})))})"
```

Expected: ten ordered migration records, unique versions/names, non-empty sources, and SHA-256 checksums; no SQL or credentials are printed.

- [ ] **Step 8: Commit the migration validator**

```powershell
git add scripts/migration-manifest.mjs scripts/migration-manifest.test.mjs scripts/migrate.mjs scripts/package.json
git commit -m "test: validate migration manifests"
```

### Task 4: Execute the Web, API, and Driver Quality Gates

**Files:**
- Verify: `.github/workflows/ci.yml`
- Verify: `artifacts/api-server/**`
- Verify: `artifacts/royal-midnight/**`
- Verify: `artifacts/driver-app-v2/**`
- Append: `docs/handoff/phase0-source-of-truth-verification-2026-10-01.md`

**Interfaces:**
- Consumes: Task 2's frozen dependencies and Task 3's migration test hook.
- Produces: fresh pass/fail evidence for every local CI-equivalent gate.

- [ ] **Step 1: Run root typecheck**

Run: `corepack pnpm run typecheck`

Expected: exit 0 across libraries and all artifact packages.

- [ ] **Step 2: Run the complete workspace test suite**

Run: `corepack pnpm run test`

Expected: exit 0. Record package-level test counts in the report.

- [ ] **Step 3: Build the public web application**

Run: `corepack pnpm --filter @workspace/royal-midnight run build`

Expected: exit 0 with production assets and prerender output generated.

- [ ] **Step 4: Build and cold-import the API bundle**

Run:

```powershell
corepack pnpm --filter @workspace/api-server run build
$env:DATABASE_URL='postgresql://u:p@localhost:5432/none'
node -e "import('./artifacts/api-server/dist/app.mjs').then(m=>{console.log('Bundle loaded OK:',typeof m.default);process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})"
Remove-Item Env:DATABASE_URL
```

Expected: build exits 0 and import prints `Bundle loaded OK: function` without attempting a real database connection.

- [ ] **Step 5: Run Driver v2 typecheck and all unit tests**

Run:

```powershell
corepack pnpm --dir artifacts/driver-app-v2 run typecheck
corepack pnpm --dir artifacts/driver-app-v2 test
```

Expected: typecheck exits 0 and at least the current 39 tests pass with zero failures.

- [ ] **Step 6: Verify Android export and resolved configuration without publishing**

Run:

```powershell
$env:EXPO_PUBLIC_API_BASE_URL='https://www.royalmidnight.com/api'
corepack pnpm --dir artifacts/driver-app-v2 exec expo export --platform android --no-bytecode --no-minify --output-dir dist-android-ci
corepack pnpm --dir artifacts/driver-app-v2 exec expo config --json | Set-Content -Encoding utf8 artifacts/driver-app-v2/dist-android-ci/expo-config.json
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync('artifacts/driver-app-v2/dist-android-ci/expo-config.json','utf8').replace(/^\uFEFF/,''));if(c.android?.package!=='com.royalmidnight.driver')throw new Error('Unexpected Android package');if(c.extra?.apiBaseUrl!=='https://www.royalmidnight.com/api')throw new Error('Unexpected API base URL');if(!JSON.stringify(c).includes('x86_64'))throw new Error('x86_64 ABI is not present in resolved config');console.log({package:c.android.package,api:c.extra.apiBaseUrl,buildArchs:c.android.buildArchs??'declared by plugin'})"
Remove-Item Env:EXPO_PUBLIC_API_BASE_URL
```

Expected: export exits 0; package is `com.royalmidnight.driver`; API base is `https://www.royalmidnight.com/api`; resolved configuration contains `x86_64`.

- [ ] **Step 7: Run the production dependency audit**

Run: `corepack pnpm audit --audit-level high --prod`

Expected: exit 0 with no high or critical production advisory.

- [ ] **Step 8: Classify and handle any failing gate**

For each failure, append the command, exit code, smallest root cause, and classification (`source`, `dependency/environment`, `platform`, or `external configuration`) to the ledger and report. Environment-only corrections may continue; a source fix must use systematic debugging and a regression test that fails before the fix and passes after it.

### Task 5: Verify the Intended Database Migration State Read-Only

**Files:**
- Verify: `scripts/migrate.mjs`
- Verify: `supabase/migrations/**`
- Append: `docs/handoff/phase0-source-of-truth-verification-2026-10-01.md`

**Interfaces:**
- Consumes: Task 3's validated manifest and a user-confirmed locally configured `DATABASE_URL` for exactly one named environment.
- Produces: read-only `Verified`/`Pending`/`Migration drift` evidence; never applies SQL.

- [ ] **Step 1: Stop and request the target environment**

Offer `Production (recommended for final source-of-truth verification)`, `Staging`, or `Skip temporarily`. Explain that no new account is needed if the existing Vercel/Supabase project remains accessible and that the user must provide only a non-secret environment choice, never the connection string.

- [ ] **Step 2: Confirm the credential is available without displaying it**

Use the existing ignored Vercel environment export in the original checkout:

- Production: `C:\Users\encue\OneDrive\Escritorio\Hermes\Royal-midnight-Replit\.vercel\.env.production.local`
- Staging: `C:\Users\encue\OneDrive\Escritorio\Hermes\Royal-midnight-Replit\.vercel\.env.preview.qa.local`

Select the `DATABASE_URL=` line in memory, remove only its surrounding quote
characters, assign it to the process-scoped `DATABASE_URL`, and print only
`DATABASE_URL configured: True`. Do not copy the file into the worktree.

Expected: `True`. Never echo, interpolate into logs, or persist the value.

- [ ] **Step 3: Run the read-only migration check and clear the process secret**

Run `corepack pnpm db:check` inside a `try` block and execute
`Remove-Item Env:DATABASE_URL` in `finally`.

Expected: all authoritative migrations print `Verified`; no `Pending`, drift, duplicate, or connection error. The command must not include `--apply`.

- [ ] **Step 4: Record the sanitized result**

Append environment name, timestamp, migration filenames, and status only. Do not record URLs, project keys, usernames, hosts, passwords, or statement contents.

### Task 6: Finalize Evidence, Secret Scan, and Clean-Tree Proof

**Files:**
- Modify: `docs/handoff/phase0-source-of-truth-verification-2026-10-01.md`
- Verify: entire tracked tree

**Interfaces:**
- Consumes: Tasks 1–5 commits and command evidence.
- Produces: final Phase 0 report and a clean local branch ready for user-authorized push/PR handoff.

- [ ] **Step 1: Complete the verification matrix**

For each gate, record command, tool version, result, test count where available, and commit SHA. Include migration status and explicit statements that no deployment, migration apply, EAS publish, Stripe operation, or remote push occurred.

- [ ] **Step 2: Scan every tracked path for forbidden files**

Run a tracked-path check for `.env*` except `.env.example`, `google-services.json`, `GoogleService-Info.plist`, private key files, Vercel environment exports, `.playwright-cli`, and `.superpowers` runtime ledgers.

Expected: zero forbidden tracked paths.

- [ ] **Step 3: Scan changed text without printing matched values**

Run the Phase 0 secret-pattern scanner against `git diff recovery/phase0-2026-10-01...HEAD`, reporting only rule, path, and line number.

Expected: zero unresolved private-key, provider-token, credentialed-database-URL, or hardcoded-secret findings.

- [ ] **Step 4: Verify final repository state**

Run:

```powershell
git diff --check recovery/phase0-2026-10-01...HEAD
git status --short --branch
git merge-base --is-ancestor origin/main HEAD
git log --graph --decorate --oneline -n 20
```

Expected: only reviewed Markdown hard-break warnings, clean status after the report commit, current main is an ancestor, and history visibly retains recovery plus main lineage.

- [ ] **Step 5: Commit the final report**

```powershell
git add docs/handoff/phase0-source-of-truth-verification-2026-10-01.md
git commit -m "docs: record phase 0 verification"
```

- [ ] **Step 6: Run final whole-branch review**

Review `recovery/phase0-2026-10-01...HEAD` against the spec, Review Focus, and execution ledger. Critical/Important findings receive one TDD fix pass; Minor findings are recorded for the user.

- [ ] **Step 7: Stop before remote mutation**

Present the final commits, verification matrix, rulings, deferred minors, and proposed push/PR command. Ask for explicit approval before any `git push`, pull request, production deployment, migration application, or EAS build.
