# Driver Web–Native Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox tracking and must preserve the approved baseline.

**Goal:** Make the Android Driver app expose and execute the same authorized trip, account and operational functions as the working Web Driver, fixing every build 24 issue without altering web behavior.

**Architecture:** Normalize one server-owned driver booking contract, expose server-owned workflow windows, protect maps/media behind authenticated endpoints, and compose native offer/trip/history screens from one booking manifest plus a tested state machine. The web is reference-only.

**Tech Stack:** TypeScript, Express, Drizzle/Postgres, Expo Router, React Native, TanStack Query, Expo Image, React Native SVG, Vitest/node:test, EAS Android.

**Spec:** `docs/superpowers/specs/2026-09-29-driver-web-native-parity-design.md`

## Global constraints

- [ ] Preserve the dirty worktree and all build 24 changes; never reset or clean user work.
- [ ] Do not edit `artifacts/royal-midnight/**` product behavior during this plan.
- [ ] Never include secrets, credentials or full passenger-private data in fixtures, logs or screenshots.
- [ ] Keep passenger identity/contact/preferences masked before acceptance.
- [ ] Use test-first changes and make small reviewable commits only if explicitly authorized.
- [ ] Deploy backend before building the APK when a client feature depends on a new contract.
- [ ] Create only one candidate Android build after all local/remote checks pass.
- [ ] Do not call the work complete until the real-phone matrix passes.

## Phase A — canonical data, rules and protected assets

### Task 1: Freeze the build 24 behavior contract

**Files:**
- Reference: `docs/handoff/driver-build24-parity-audit-2026-09-29.md`
- Test: `artifacts/api-server/src/routes/driverBookingView.test.ts`
- Test: `artifacts/driver-app-v2/src/api/driverBooking.contract.test.mjs`

- [ ] Add failing fixtures for a standard, airport/flight and hourly booking with extras, preferences and itinerary.
- [ ] Assert which fields must be present in assigned list and detail responses.
- [ ] Assert passenger identity, contact, notes and preferences remain absent from open-pool responses.
- [ ] Run the focused tests and record the expected red baseline before implementation.

### Task 2: Build one authorized driver-booking view

**Files:**
- Create: `artifacts/api-server/src/lib/driverBookingView.ts`
- Modify: `artifacts/api-server/src/routes/bookings.ts`
- Test: `artifacts/api-server/src/routes/driverBookingView.test.ts`

- [ ] Extract the common booking enrichment now duplicated across list/open-pool/detail paths.
- [ ] Include earnings breakdown, extras, ordered itinerary, preferences, service/charter fields, estimates and relevant state timestamps.
- [ ] Apply explicit open-pool masking after enrichment.
- [ ] Make both driver list and assigned detail use the same builder.
- [ ] Run focused API tests, broader booking tests and typecheck.

### Task 3: Expose workflow configuration safely

**Files:**
- Modify: `artifacts/api-server/src/routes/drivers.ts`
- Reference: `artifacts/api-server/src/lib/driverWindows.ts`
- Test: `artifacts/api-server/src/routes/driverConfig.test.ts`

- [ ] Add failing tests for authentication and the configured confirm/release/grace values.
- [ ] Add a driver-authenticated endpoint returning only operational window numbers.
- [ ] Verify changes to settings are reflected without an APK rebuild.
- [ ] Confirm no admin-only value or secret is returned.

### Task 4: Add an authenticated route-map endpoint

**Files:**
- Modify: `artifacts/api-server/src/lib/maps.ts`
- Modify: `artifacts/api-server/src/routes/bookings.ts`
- Test: `artifacts/api-server/src/routes/bookingRouteMap.test.ts`

- [ ] Write failing authorization tests for stranger, unapproved driver, eligible open-pool driver and assigned driver.
- [ ] Build route coordinates from pickup, ordered itinerary and final destination.
- [ ] Proxy a dark static map image without returning the provider token; add private cache headers and bounded dimensions.
- [ ] Return typed failures for missing route/provider outage and test textual-route fallback behavior.
- [ ] Add request limits/caching sufficient to prevent waste from list rerenders.

### Task 5: Serve own-profile media through an authorized path

**Files:**
- Modify: `artifacts/api-server/src/routes/drivers.ts`
- Reference: `artifacts/api-server/src/routes/storage.ts`
- Test: `artifacts/api-server/src/routes/driverProfileMedia.test.ts`

- [ ] Add tests proving the owner can fetch the current photo and another driver cannot.
- [ ] Reuse the existing signed/authenticated object mechanism instead of exposing the stored path.
- [ ] Cover no-photo, deleted-object and invalid-object cases.

## Phase B — mobile contract and shared presentation

### Task 6: Expand and validate the native API contract

**Files:**
- Modify: `artifacts/driver-app-v2/src/api/types.ts`
- Modify: `artifacts/driver-app-v2/src/api/driverApi.ts`
- Modify: `artifacts/driver-app-v2/src/api/hooks.ts`
- Test: `artifacts/driver-app-v2/src/api/driverBooking.contract.test.mjs`

- [ ] Add exact types for estimates, earnings breakdown, extras, preferences, hourly values, itinerary, workflow config and route-map/media URLs.
- [ ] Add API methods/hooks without exposing storage or map credentials.
- [ ] Parse/normalize nullable and legacy values in one place.
- [ ] Run contract tests and TypeScript checks.

### Task 7: Create pure booking presentation and state selectors

**Files:**
- Create: `artifacts/driver-app-v2/src/domain/driverBooking.ts`
- Create: `artifacts/driver-app-v2/src/domain/driverWorkflow.ts`
- Test: `artifacts/driver-app-v2/src/domain/driverBooking.test.mjs`
- Test: `artifacts/driver-app-v2/src/domain/driverWorkflow.test.mjs`

- [ ] Test service labels for airport, transfer and hourly bookings.
- [ ] Test configured-window button visibility and availability copy at boundaries.
- [ ] Test checklist, on-way, arrived, in-progress, hourly stop and completed transitions.
- [ ] Test compatible-vehicle filtering by class/passengers/luggage.
- [ ] Test privacy-safe display models before and after assignment.

### Task 8: Build the reusable native booking manifest

**Files:**
- Create: `artifacts/driver-app-v2/src/components/booking/DriverBookingManifest.tsx`
- Create: `artifacts/driver-app-v2/src/components/booking/RouteMapCard.tsx`
- Create: `artifacts/driver-app-v2/src/components/booking/PassengerPreferencesCard.tsx`
- Create: `artifacts/driver-app-v2/src/components/booking/CharterDetailsCard.tsx`
- Create: `artifacts/driver-app-v2/src/components/booking/TripExtrasCard.tsx`
- Test: `artifacts/driver-app-v2/src/components/booking/DriverBookingManifest.test.tsx`

- [ ] Add component-test support following the React Native testing skill before writing UI tests.
- [ ] Render date/time, route/map, distance/duration, passenger needs, vehicle, flight and earnings sections.
- [ ] Render all preference fields after assignment.
- [ ] Render hours, included miles, rates, 20-minute grace/full-hour overage text, itinerary and extras for hourly work.
- [ ] Cover loading, absent optional data, map failure and accessibility labels.

## Phase C — fix the reported phone failures

### Task 9: Replace the offer screen and remove the timer

**Files:**
- Modify: `artifacts/driver-app-v2/app/(app)/offer/[bookingId].tsx`
- Test: `artifacts/driver-app-v2/app/(app)/offer/offerScreen.test.tsx`

- [ ] First test that waiting longer than 25 seconds neither navigates nor expires the offer.
- [ ] Delete `OFFER_WINDOW_SECONDS`, countdown state and expiry navigation.
- [ ] Use the shared privacy-safe manifest for standard and hourly offers.
- [ ] Show only compatible approved vehicles and an actionable no-compatible-vehicle state.
- [ ] Keep Back, Accept and Decline; prevent duplicate acceptance and handle stale offers specifically.

### Task 10: Implement the real checklist and trip state machine

**Files:**
- Modify: `artifacts/driver-app-v2/app/(app)/trip/[bookingId].tsx`
- Create: `artifacts/driver-app-v2/src/components/trip/PreRideChecklist.tsx`
- Create: `artifacts/driver-app-v2/src/components/trip/HourlyItineraryActions.tsx`
- Create: `artifacts/driver-app-v2/src/components/trip/CharterTimer.tsx`
- Test: `artifacts/driver-app-v2/app/(app)/trip/tripScreen.test.tsx`

- [ ] Test and render the five web-equivalent checklist items.
- [ ] Separate checklist confirmation from `On My Way`.
- [ ] Reproduce the reported already-scheduled-trip failure and capture the HTTP status/body without logging passenger-private data.
- [ ] If the checklist succeeds but `On My Way` fails, refetch the booking and keep a recoverable state instead of leaving the combined action as a dead end.
- [ ] Show the typed server reason for window, authorization, conflict and network failures, with a retry or next-action path.
- [ ] Disable `On My Way` outside the server-configured window and show when it becomes available.
- [ ] Add Arrived, Passenger In Car/Start, hourly stop arrival/departure and Complete actions in valid order.
- [ ] Use the shared full manifest in assigned/active states.
- [ ] Add the legitimate hourly elapsed/grace/overage timer only after the trip starts.
- [ ] Preserve typed API errors and refetch after conflicts.

### Task 11: Correct source-aware navigation and history

**Files:**
- Create: `artifacts/driver-app-v2/src/navigation/returnTarget.ts`
- Modify: `artifacts/driver-app-v2/app/(app)/index.tsx`
- Modify: `artifacts/driver-app-v2/app/(app)/trips/index.tsx`
- Modify: `artifacts/driver-app-v2/app/(app)/notifications/index.tsx`
- Modify: `artifacts/driver-app-v2/app/(app)/trip/[bookingId].tsx`
- Test: `artifacts/driver-app-v2/src/navigation/returnTarget.test.mjs`

- [ ] Test validated sources for Home, Upcoming, Completed, Cancelled and Alerts.
- [ ] Pass source context when opening offer/trip screens.
- [ ] Replace completed `Back to Home` with return-to-origin behavior and safe fallback.
- [ ] Render completed/cancelled details as full read-only manifests with rating/review when present.
- [ ] Verify Android hardware Back and notification deep-link behavior.

### Task 12: Fix profile photo and complete profile parity

**Files:**
- Modify: `artifacts/driver-app-v2/app/(app)/account/index.tsx`
- Modify: `artifacts/driver-app-v2/src/api/driverApi.ts`
- Modify: `artifacts/driver-app-v2/src/api/hooks.ts`
- Test: `artifacts/driver-app-v2/app/(app)/account/profileScreen.test.tsx`

- [ ] Test private-path, loading, successful image and image-error fallback cases.
- [ ] Load the photo through the authorized endpoint with bearer authentication.
- [ ] Fall back to initials instead of a black circle.
- [ ] Add photo update, phone editing, performance summary and reviews already available on web.
- [ ] Handle gallery permission denial and upload failure without losing the current photo.

## Phase D — remaining parity and hardening

### Task 13: Match status controls

**Files:**
- Modify: `artifacts/driver-app-v2/app/(app)/index.tsx`
- Modify: `artifacts/driver-app-v2/app/(app)/account/index.tsx`
- Test: `artifacts/driver-app-v2/src/domain/driverStatus.test.mjs`

- [ ] Present Available, On Break and Unavailable and correctly show derived On Duty.
- [ ] Disable invalid changes during a live trip and preserve optimistic rollback/error messaging.

### Task 14: Complete earnings, statistics and payout parity

**Files:**
- Modify: `artifacts/driver-app-v2/app/(app)/earnings/index.tsx`
- Modify: `artifacts/driver-app-v2/app/(app)/account/payout.tsx`
- Modify: `artifacts/driver-app-v2/src/api/types.ts`
- Test: `artifacts/driver-app-v2/src/domain/earnings.test.mjs`
- Test: `artifacts/driver-app-v2/src/domain/payout.test.mjs`

- [ ] Add custom date/all-time ranges, fare commission and percentage, tips, average, ride count and daily chart parity.
- [ ] Add PDF export/share with explicit failure handling.
- [ ] Add secure Tax ID/SSN update and masked status without ever reading the full stored value back.
- [ ] Verify promo discounts do not reduce the server-provided driver earning amount.

### Task 15: Full static and runtime hardening scan

**Files:**
- Modify as findings require: `artifacts/driver-app-v2/**`
- Update: `docs/handoff/driver-build24-parity-audit-2026-09-29.md`

- [ ] Re-scan every Expo Router link and notification destination.
- [ ] Test phone/maps external links and report unavailable apps.
- [ ] Test offline/retry, stale auth, empty states, double taps, screen rotation/resume and Android hardware Back.
- [ ] Test Documents image/PDF viewing, permission denial, expiry/rejection, Vehicles CRUD/default, Alerts and Support.
- [ ] Run accessibility checks for touch targets, contrast, labels, font scaling and scroll reachability.
- [ ] Record each newly confirmed defect with severity, reproduction and evidence before fixing it.

## Phase E — verification, release and real-phone approval

### Task 16: Regression gate before deployment

**Files:**
- Update: `docs/handoff/driver-build25-verification-2026-09-29.md`

- [ ] Run all focused unit/component/API tests.
- [ ] Run server and Driver typechecks, dependency checks and `git diff --check`.
- [ ] Review the complete diff specifically for web edits, privacy regression and secret exposure.
- [ ] Confirm no required test was skipped because of the local OneDrive dependency issue; repair the environment without overwriting work if necessary.

### Task 17: Deploy additive server changes and verify production

- [ ] Request explicit deployment authorization if not already granted.
- [ ] Deploy once, record deployment ID and verify health/revision.
- [ ] Exercise authenticated list/detail parity, config, map/media authorization and state mutations.
- [ ] Smoke-test the existing web Driver to prove it remains unchanged and functional.
- [ ] Inspect production errors for the verification window.

### Task 18: Produce one Android candidate and preserve it

- [ ] Confirm no equivalent build is already running or complete.
- [ ] Create one preview build with the next versionCode.
- [ ] Download and verify size, SHA-256, manifest and bundle.
- [ ] Upload the verified APK to connected Google Drive and confirm stored size/access.
- [ ] Update the handoff with exact IDs, URLs and hashes without including secrets.

### Task 19: Real Android acceptance matrix

- [ ] Fresh/update install, launch artwork and login/session restore.
- [ ] Standard and hourly offer remain open indefinitely and show the full privacy-safe manifest/map.
- [ ] Accept with compatible vehicle; confirm no duplicate rides and correct earnings unaffected by customer coupon.
- [ ] Assigned trip shows full data/preferences and respects checklist/configured action windows.
- [ ] Execute on-way, arrived, start, hourly stops, charter timing, completion and error recovery.
- [ ] Open completed/cancelled history and return to the exact originating tab/context.
- [ ] Verify profile photo/update, status choices, reviews/stats, earnings/PDF and payout masking.
- [ ] Verify vehicles, documents, alerts, support, external links, offline recovery and push in foreground/background/closed.
- [ ] Save screenshots/log timestamps, update the audit and handoff, and only then declare the verified scope complete.
