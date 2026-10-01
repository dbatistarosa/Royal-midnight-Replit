# Royal Midnight Driver Reliability and Full-Scan Implementation Plan

> **For Codex:** Execute this plan in the current session with systematic debugging, test-driven development, and verification before completion. Preserve all existing local changes and use the main repository as the source of truth.

**Goal:** Correct the six runtime problems reported from Android build 23, audit every Driver screen and its real API interactions, and produce one grouped Android build for device verification.

**Architecture:** Keep the mobile app on the existing Expo Router/React Query structure. Reuse the server's already-secured open-pool list for both cards and offer details, centralize pure calculations and presentation rules behind unit tests, and change server pricing/promo behavior at the authoritative booking boundary so web, payment, receipts, and Driver agree.

**Tech Stack:** Expo 57, React Native 0.86, TypeScript, React Query, Express 5, Drizzle/PostgreSQL, Vitest, Node test runner, pnpm monorepo, EAS Android preview builds.

---

## Constraints and evidence baseline

- Preserve the dirty worktree; no reset, clean, destructive dependency reinstall, or copying staging sources back over the repository.
- Build 23 (`f1ca474b-566d-4c6b-a94a-87de92198bee`) is installed and visually approved by the user, but its runtime behavior is not approved.
- Runtime evidence lives in `docs/handoff/build23-runtime-evidence/` and remains immutable except for the report.
- A passing compile/build is insufficient. Build 24 must be installed and exercised on the user's Android phone before any completion claim.
- Pause after saving exact state if either usage window falls below 5%; do not consume a reset credit without explicit permission.

## Task 1: Open-pool uniqueness and offer detail

**Files:**
- Modify: `artifacts/driver-app-v2/src/api/driverApi.ts`
- Modify: `artifacts/driver-app-v2/src/api/hooks.ts`
- Create: `artifacts/driver-app-v2/src/api/openPool.ts`
- Create: `artifacts/driver-app-v2/src/api/openPool.test.mjs`
- Modify: `artifacts/driver-app-v2/app/(app)/offer/[bookingId].tsx`
- Modify: `artifacts/driver-app-v2/package.json`

1. Add failing tests proving duplicate IDs collapse deterministically and a missing requested offer is distinguished from a transport failure.
2. Implement one canonical open-pool request (`status=pending`, which the server deliberately widens to pending/authorized/confirmed) plus defensive ID uniqueness.
3. Make both the Home pool and Offer screen use the same React Query entry. Do not call the assigned-booking endpoint for an unassigned offer.
4. Show an accurate unavailable/taken message when the offer is absent and a connection message only for a real request error.
5. Run the focused mobile tests and typecheck.

## Task 2: Expo push delivery

**Files:**
- Create: `artifacts/api-server/src/lib/push.test.ts`
- Modify: `artifacts/api-server/src/lib/push.ts`
- Review/modify only if evidence requires: `artifacts/driver-app-v2/src/notifications/registerForPushNotifications.ts`
- Review/modify only if evidence requires: `artifacts/driver-app-v2/src/notifications/useNotificationHandlers.ts`

1. Add failing tests for both valid Expo token formats (`ExponentPushToken[...]` and `ExpoPushToken[...]`) and invalid strings.
2. Extract and use a token predicate/filter so modern tokens are sent instead of silently discarded.
3. Audit foreground/background registration and navigation behavior. Change it only for a confirmed lifecycle defect and cover pure lifecycle logic with tests.
4. Run focused API tests and typecheck.

## Task 3: WELCOME20 once-per-customer enforcement

**Files:**
- Create: `artifacts/api-server/src/lib/promoPolicy.ts`
- Create: `artifacts/api-server/src/lib/promoPolicy.test.ts`
- Modify: `artifacts/api-server/src/routes/promos.ts`
- Create: `lib/db/drizzle/0015_welcome20_once_per_customer.sql`
- Create matching migration under: `supabase/migrations/`

1. Add failing policy tests proving a once-per-customer code rejects a second redemption, requires an authenticated customer, and counts cancelled bookings as prior redemptions so cancellation cannot farm the offer.
2. Remove the contradictory cancelled-booking exclusion from per-user counting.
3. Add an idempotent data migration setting `max_uses_per_user = 1` for `WELCOME20` case-insensitively without exposing or changing unrelated codes.
4. Keep row locking and server-side re-evaluation in booking creation.
5. Run focused promo tests, migration checks, and API typecheck.

## Task 4: Correct promotion arithmetic without reducing driver earnings

**Files:**
- Modify: `artifacts/api-server/src/lib/pricing.ts`
- Modify: `artifacts/api-server/src/lib/pricing.test.ts`
- Modify: `artifacts/api-server/src/routes/bookings.ts`
- Modify: `artifacts/royal-midnight/src/pages/book.tsx`
- Review: receipts, payment intent creation, admin booking edit, and confirmation displays

1. Add failing pricing tests for a percentage promo applied to the pre-tax subtotal, followed by recalculated tax and card fee.
2. Implement a pure discounted charge breakdown that caps the discount at the eligible subtotal and preserves the original pre-discount service fare used for chauffeur commission.
3. Use the eligible pre-tax subtotal for promo validation and booking-time revalidation. Store the discounted tax/card fee and the final charged total consistently.
4. Mirror the same pure ordering in the web checkout display and validation request: subtotal, discount, tax, card fee, total.
5. Verify Driver earnings still derive from pre-discount fare plus driver-paid extras, never from the passenger's discounted total.
6. Run pricing, commission, booking, payment, and typecheck suites.

## Task 5: Profile presentation defects

**Files:**
- Modify: `artifacts/driver-app-v2/src/theme/driverPresentation.ts`
- Modify: `artifacts/driver-app-v2/src/theme/driverPresentation.test.mjs`
- Modify: `artifacts/driver-app-v2/app/(app)/account/index.tsx`

1. Add failing tests for initials fallback and human-readable vehicle-class labels.
2. Render a stable initials fallback when no profile image exists.
3. Present stored class values such as `business` as `Business` without changing database/API values.
4. Run mobile tests and typecheck.

## Task 6: Full Driver static and contract scan

**Files:** every file under `artifacts/driver-app-v2/app/` and `src/`, plus each API route it calls.

1. Audit authentication/gates, tabs, offer acceptance, trip lifecycle, earnings, alerts, vehicle, documents/upload, payout, support, push, location, logout/session persistence, error/loading/empty states, accessibility, and navigation targets.
2. For every confirmed defect, document reproduction and root cause, add a failing test at the lowest stable layer, implement the smallest correction, and rerun focused verification.
3. Do not add speculative product features or fabricate data that the API does not provide.
4. Record reviewed areas and remaining device-only checks in the build evidence report.

## Task 7: Integrated verification, build, and Android evidence

**Files:**
- Update: `docs/handoff/build23-runtime-evidence/report.md`
- Update: `docs/handoff/royal-midnight-driver-session-handoff-2026-09-27.md`
- Create: `docs/handoff/build24-runtime-evidence/` when the build exists

1. Run focused tests after each slice, then the complete relevant API/mobile/web test and typecheck suites, `git diff --check`, Expo doctor/export, and dependency identity test.
2. Review the entire diff for secrets, unrelated edits, unsafe authorization changes, and pricing inconsistencies.
3. Sync only the verified Driver build inputs from the main repo to the existing staging directory and verify hashes; never reverse-sync staging into the repo.
4. Create one grouped Android preview build with the next version code, download it, record size/hash/build ID, and provide the stable install route.
5. Guide the user through a build-identified device matrix: unique pool card/count, offer details, new-booking push while backgrounded, WELCOME20 first/second use, displayed/charged price breakdown, unchanged driver earnings, profile fallback, and all scanned navigation/trip flows.
6. Correct any device-confirmed regressions and repeat only the affected verification. Do not declare completion until the exact APK passes the real-device checks or clearly list what remains unverified.
