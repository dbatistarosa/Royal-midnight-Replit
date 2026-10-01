# Driver App Findings and Approval Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans (recommended) to implement this plan.

**Goal:** Make the existing Royal Midnight Driver App reliable and policy-compliant across trip status, maps, passenger preferences, earnings presentation, reviews, navigation, profile changes, vehicle changes, and compliance holds, using the user-provided findings as the acceptance baseline.

**Architecture:** Keep booking lifecycle state, driver availability state, and compliance eligibility as separate domain policies. Make the API the enforcement point for privacy, payouts, and admin approval; expose a small driver-safe DTO to native/web clients; persist pending changes as reviewable records; then update native and web presentation to reflect pending/approved/rejected states. Preserve explicit return targets for navigation and provider-independent map fallback behavior.

**Tech Stack:** Expo SDK 57, React Native, Expo Router, TypeScript, TanStack Query, Express, Drizzle ORM/Postgres, Vitest, Expo/EAS preview builds, and the existing Mapbox/static-map integration.

**Spec:** [2026-09-30-driver-findings.md](../specs/2026-09-30-driver-findings.md)

---

## Global Constraints

- This plan covers the existing Driver App; do not replace it with a new app or redesign unrelated screens.
- Enforce sensitive rules on the API/database boundary; client-only hiding is insufficient.
- Never return the customer hourly rate or customer overtime charge in a driver-safe earnings view.
- Preserve open-pool privacy: passenger preferences stay masked until assignment.
- Phone remains immutable for drivers. Profile photos and vehicle changes are pending until admin approval.
- A compliance hold must block new driver work while keeping sign-in, documents, notifications, and support reachable.
- Do not conflate a confirmed reservation with live On Duty status.
- Keep all pre-existing user changes in the dirty worktree; do not reset, clean, or overwrite unrelated files.
- Do not create an APK, deploy, or change production data until the implementation is approved and verification is green.
- Before declaring completion, run the relevant unit/API tests, type checks, and a device smoke test on the affected journeys.

## Review Focus

- **Privacy:** email fallback for preferences must be an exact normalized match scoped to the assigned booking; open-pool masking must remain intact.
- **Money:** separate customer price, driver payout, extras, and overtime charge status; legacy `extraCharge` rows need explicit treatment.
- **Approval races:** two pending changes, rejection after a newer submission, admin approval after expiry, and stale clients must not overwrite the active record incorrectly.
- **Compliance boundaries:** exactly 30 days, 29 days, expired, missing expiry, pending document, rejected document, and all-documents-valid cases need deterministic tests.
- **Navigation:** Home, Upcoming, Completed, Cancelled, and Alerts must each round-trip without depending on stack history.
- **Session exit:** local logout must route to login before network cleanup completes and must not leave the authenticated group rendering its loading fallback.
- **Web parity:** native Documents must match the web portal’s status labels, remaining-day calculation, pending/rejected behavior, hold warning, upload gating, and document navigation.
- **Compliance notifications:** every actionable compliance reminder must create a driver-owned in-app Documents notification, not only an email or admin alert.
- **Passenger identification:** the assigned passenger may see only the Driver’s active approved photo, through a server-signed URL, with an enlarged preview and safe initials fallback.
- **Invoice/admin route integrity:** hourly invoices and admin booking details must use the persisted itinerary sequence, show every intermediate stop, and render the final destination exactly once.
- **Active-trip itinerary integrity:** the required/default hourly stop must survive acceptance and every live-trip status transition, and must be visible as text in both Driver clients rather than only as a map marker.
- **Provider failure:** missing map token and provider failure must be observable as distinct diagnostics while keeping a useful external maps fallback.

## Phase 0 — Baseline and reproducible audit fixtures

### Task 1: Add fixture coverage before changing behavior

**Files:**
- `artifacts/driver-app-v2/src/domain/driverStatus.test.mjs`
- `artifacts/driver-app-v2/src/domain/driverWorkflow.test.mjs`
- `artifacts/driver-app-v2/src/navigation/returnTarget.test.mjs`
- `artifacts/api-server/src/lib/driverEligibility.test.ts`
- `artifacts/api-server/src/lib/driverBookingView.test.ts`
- New focused tests beside any new pure policy module.

**Steps:**

1. Record the current failing expectations for confirmed-versus-live status, driver-safe hourly output, zero extras/overtime, and return targets.
2. Add fixture builders for a confirmed checklist trip, each live trip stage, completed/cancelled trips, an assigned user-linked booking, an email-linked booking, an open-pool booking, and document expiry boundary dates.
3. Keep failures focused on the requested contract, not on implementation details.

**Verification:** Run the existing driver-app domain tests and API Vitest files; capture failures as the red baseline before implementation.

## Phase 1 — Lifecycle, branding, and navigation

### Task 2: Separate live On Duty state from committed trip state

**Files:**
- `artifacts/driver-app-v2/src/domain/driverStatus.ts`
- `artifacts/driver-app-v2/src/domain/driverStatus.test.mjs`
- `artifacts/driver-app-v2/app/(app)/index.tsx`
- `artifacts/driver-app-v2/src/location/locationLifecycle.ts` and its tests, if live-location gating uses the same status.
- `artifacts/api-server/src/routes/bookings.ts` only where server-side location/availability enforcement currently reuses the broader `ACTIVE_TRIP_STATUSES` set.

**Steps:**

1. Define a separate `ON_DUTY_TRIP_STATUSES` policy for `on_way`, `on_location`, and `in_progress`.
2. Leave the broader committed/busy set available for scheduling and active-trip-card purposes.
3. Make Home status, availability toggle messaging, and live location behavior use the live policy.
4. Verify completed/cancelled trips immediately clear On Duty and do not re-enable location tracking.

**Tests:** Confirmed is not On Duty; all three live stages are; completed/cancelled are not; busy scheduling behavior remains unchanged.

### Task 3: Correct the splash and Home logo rendering

**Files:**
- `artifacts/driver-app-v2/src/components/LaunchExperience.tsx`
- `artifacts/driver-app-v2/assets/royal-midnight-logo-transparent.png`
- `artifacts/driver-app-v2/assets/icon.png`
- `artifacts/driver-app-v2/app/(app)/index.tsx`
- `artifacts/driver-app-v2/app.config.ts`

**Steps:**

1. Inspect the actual alpha bounds/aspect ratio of both assets and reproduce the screenshot on narrow/tall device dimensions.
2. Remove the circular mask from the Home header asset where it crops the crest/wordmark; use the transparent logo with an explicit contain treatment.
3. Adjust splash sizing and safe-area placement without stretching the logo or clipping the bottom wordmark.
4. Verify cold launch, warm launch, and Expo splash-to-custom-launch transitions.

**Tests:** Add a visual/manual device checklist for at least two aspect ratios; no code path may crop the transparent logo.

### Task 4: Make trip back navigation deterministic

**Files:**
- `artifacts/driver-app-v2/src/navigation/returnTarget.ts`
- `artifacts/driver-app-v2/src/navigation/returnTarget.test.mjs`
- `artifacts/driver-app-v2/src/components/DriverUI.tsx`
- `artifacts/driver-app-v2/app/(app)/trip/[bookingId].tsx`
- `artifacts/driver-app-v2/app/(app)/offer/[bookingId].tsx`
- `artifacts/driver-app-v2/app/(app)/trips/index.tsx`

**Steps:**

1. Parse and validate `returnTo` once, with a safe Home fallback.
2. Replace manual `router.back()` actions on trip/offer screens with the validated explicit destination when the route provides one.
3. Preserve the existing Completed/Cancelled “Back to Rides” behavior and make the title back action use the same route.
4. Test entry from Home, each rides tab, and Alerts, including direct/deep links with invalid targets.

### Task 4a: Make logout return to login deterministically

**Files:**
- `artifacts/driver-app-v2/src/auth/store.ts`
- `artifacts/driver-app-v2/src/auth/sessionHydration.test.mjs`
- New focused logout/auth-routing tests under `artifacts/driver-app-v2/src/auth` or `src/navigation`.
- `artifacts/driver-app-v2/app/index.tsx`
- `artifacts/driver-app-v2/app/(app)/_layout.tsx`
- `artifacts/driver-app-v2/app/(auth)/login.tsx`
- `artifacts/driver-app-v2/app/(app)/account/index.tsx`

**Steps:**

1. Treat clearing the local token/user as the authoritative logout event and route to `/(auth)/login` immediately; server session revocation, query cleanup, and location-task shutdown must not block that navigation.
2. Add an explicit authenticated-group redirect for a null token/user so the group cannot fall through to its `!driver` loading spinner after logout.
3. Make logout idempotent and safe when the API is offline or the revoke request times out; remove cached driver data and prevent authenticated screens from resurfacing through back navigation.
4. Keep automatic 401/403 logout behavior consistent with manual logout, while preserving the existing retry behavior for non-authentication network failures.

**Tests:** tapping Log Out lands on the login screen, SecureStore is cleared, cached queries are cleared, an offline/revocation timeout does not trap the UI, and restarting after logout opens login instead of an authenticated route.

## Phase 2 — Trip data, maps, and money visibility

### Task 5: Diagnose and harden route-map availability

**Files:**
- `artifacts/api-server/src/lib/maps.ts`
- `artifacts/api-server/src/lib/maps.test.ts`
- `artifacts/api-server/src/routes/bookings.ts`
- New map endpoint/diagnostic tests under `artifacts/api-server/src/lib` or `src/routes`.
- `artifacts/driver-app-v2/src/api/driverApi.ts`
- `artifacts/driver-app-v2/src/api/hooks.ts`
- `artifacts/driver-app-v2/src/api/types.ts`
- `artifacts/driver-app-v2/src/components/booking/RouteMapCard.tsx`
- `artifacts/driver-app-v2/app/(app)/trip/[bookingId].tsx`
- `artifacts/driver-app-v2/app/(app)/offer/[bookingId].tsx`

**Steps:**

1. Verify the production/staging map-token presence without printing the secret; reproduce the supplied route addresses against the configured provider.
2. Return stable reason codes for not configured, geocode failure, directions/static-image failure, timeout, and invalid image response.
3. Add bounded retry behavior and a clear loading/error state; keep “Open route in Maps” independent and test it on Android/iOS.
4. If the provider remains unavailable, use the agreed server-side or native fallback rather than claiming the route is unavailable when only the embedded image failed.

**Tests:** Mock missing token, successful geocode/directions/image, provider non-2xx, invalid content type, timeout, and external-map fallback.

### Task 6: Hydrate passenger preferences safely

**Files:**
- `artifacts/api-server/src/routes/bookings.ts`
- New shared resolver such as `artifacts/api-server/src/lib/passengerPreferences.ts` plus tests.
- `artifacts/api-server/src/lib/driverBookingView.ts`
- `artifacts/api-server/src/lib/driverBookingView.test.ts`
- `artifacts/driver-app-v2/src/components/booking/PassengerPreferencesCard.tsx`
- `artifacts/driver-app-v2/src/components/booking/DriverBookingManifest.tsx`
- `artifacts/driver-app-v2/src/api/types.ts`
- `artifacts/royal-midnight/src/components/TripPassengerPreferences.tsx` or the current shared/web preference component if its semantics need alignment.

**Steps:**

1. Resolve preferences by booking `userId`, then by normalized passenger email only for an assigned booking and an exact user match.
2. Keep `maskOpenPoolBooking` returning null preferences until assignment.
3. Normalize the `opensOwnDoor` meaning and copy across native/web/API; document the chosen meaning in the DTO test.
4. Show the preferences card only when at least one permitted field exists, including address title and VIP notes.

**Tests:** user-linked, email-linked, no-match, no-preferences, open-pool masking, and privacy regression cases.

### Task 7: Align driver earnings with the customer/driver boundary

**Files:**
- `artifacts/api-server/src/lib/driverBookingView.ts`
- `artifacts/api-server/src/lib/driverBookingView.test.ts`
- `artifacts/api-server/src/lib/hourlyOverage.ts`
- `artifacts/api-server/src/lib/hourlyOverage.test.ts`
- `artifacts/api-server/src/routes/bookings.ts`
- `artifacts/driver-app-v2/src/api/types.ts`
- `artifacts/driver-app-v2/src/components/booking/CharterDetailsCard.tsx`
- `artifacts/driver-app-v2/src/components/booking/TripExtrasCard.tsx`
- `artifacts/driver-app-v2/src/components/booking/DriverBookingManifest.tsx`
- `artifacts/royal-midnight/src/components/TripExtrasAndCharter.tsx`

**Steps:**

1. Remove customer `hourlyRate` from the driver presentation contract or rename/partition it so the native client cannot accidentally render it.
2. Define an explicit overtime lifecycle (`not_due`, `grace_active`, `charged`, `settled` or the approved equivalent) and only expose a driver overtime payout once charge/settlement is true.
3. Preserve actual selected extras and hide empty/zero summary lines; expose only driver amounts in driver views.
4. Audit legacy `extraCharge` fallback rows so an old customer charge cannot be mistaken for a driver payout.
5. Mirror the existing web driver-audience behavior in the native cards.

**Tests:** no hourly customer rate, no zero extras/overtime, selected extras, overtime before grace, after grace but unpaid, and charged/settled overtime.

### Task 7a: Include hourly itinerary stops in passenger invoices and receipts

**Files:**
- `lib/db/src/schema/booking-itinerary-stops.ts`
- `artifacts/api-server/src/routes/payments.ts`
- `artifacts/api-server/src/lib/mailer.ts`
- `artifacts/api-server/src/lib/mailer.test.ts`
- `artifacts/royal-midnight/src/pages/admin/bookings.tsx`
- `artifacts/api-server/src/routes/bookings.ts` or a shared itinerary helper extracted from its ordered loader.
- New focused itinerary/invoice formatter tests under `artifacts/api-server/src/lib` or the relevant route test file.
- `artifacts/royal-midnight/src/lib/receipt.ts` and the current passenger receipt/ride-detail component only if that surface displays route addresses.

**Steps:**

1. Load the persisted itinerary rows for the booking when the invoice is created; do not rely on a client-supplied waypoint array at billing time.
2. Add a small shared route formatter that emits Pickup, Stop 1…N, and Final destination in `sequence` order, with a legacy fallback to the booking pickup/drop-off when no itinerary rows exist.
3. Pass the ordered route into `sendInvoiceToPassenger` and render all intermediate stops in the invoice email summary. Keep customer pricing and driver earnings separate.
4. Prevent a duplicated final destination by treating the persisted `kind: "final"` row as the canonical final address and normalizing comparisons only for legacy/mixed data.
5. Audit the hosted/downloadable invoice context and passenger portal receipt. Where the route is controlled by this application, reuse the same formatter so email, PDF context, and portal presentation cannot disagree.
6. Add the same ordered, read-only itinerary to the admin `GET /bookings` DTO and the booking detail Trip Details section, including clear Stop 1…N labels and the final destination.
7. Preserve transfer behavior: pickup and final destination only when there are no hourly stops, and do not expose internal itinerary progress fields or driver-only data to the passenger or admin UI unless explicitly needed for operations.

**Tests:** hourly invoice with two stops in order, one stop, no stops, final address present in both sources without duplication, legacy booking without itinerary rows, HTML escaping for stop addresses, invoice creation passing the itinerary, admin booking DTO/detail rendering with the same sequence, and portal receipt route parity where applicable.

### Task 7b: Keep the hourly stop visible from offer through active trip

**Files:**
- `artifacts/api-server/src/routes/quote.ts`
- `artifacts/api-server/src/routes/bookings.ts`
- `artifacts/api-server/src/routes/adminBookingEdit.ts`
- `lib/db/src/schema/bookings.ts`
- `lib/db/src/schema/booking-itinerary-stops.ts`
- `artifacts/driver-app-v2/src/components/DriverUI.tsx`
- `artifacts/driver-app-v2/src/components/booking/RouteMapCard.tsx`
- `artifacts/driver-app-v2/src/components/booking/DriverBookingManifest.tsx`
- `artifacts/driver-app-v2/app/(app)/index.tsx`
- `artifacts/driver-app-v2/app/(app)/trip/[bookingId].tsx`
- `artifacts/driver-app-v2/app/(app)/trips/index.tsx`
- `artifacts/royal-midnight/src/pages/driver/dashboard.tsx`
- `artifacts/royal-midnight/src/components/maps/TripRouteMap.tsx`
- Focused API/domain/UI tests beside the affected itinerary and presentation modules.

**Steps:**

1. Decide and document the invariant: hourly service always requires one or more intermediate stops, and if the business means a default stop, create that stop in the authoritative booking transaction. Never synthesize it only in a client screen.
2. Create one server-side itinerary synchronization path for booking creation and admin edits. Keep `bookings.waypoints` as a compatibility mirror only, or remove its use after migration; update the `booking_itinerary_stops` rows atomically with the final destination row.
3. Verify the assigned offer, `GET /bookings`, `GET /bookings/:id`, and trip action responses all return the same ordered itinerary for hourly bookings, including legacy fallback behavior.
4. Render a prominent readable route sequence in the native Route card and active-trip manifest: Pickup, Stop 1…N, and Final destination. Keep the map and “Open route in Maps” action, but do not depend on either to communicate the stop.
5. Make the native embedded map use the same ordered pickup + stops + final route as the web map. Trace the mobile “Map unavailable” response through token/configuration, geocoding, image response, and API base/environment differences; preserve a visible retry/fallback reason when the provider is unavailable.
6. Build the external Maps URL from the same ordered itinerary and encode every intermediate stop as a waypoint. Test one stop, multiple stops, no-stop legacy fallback, and addresses containing spaces, commas, or URL characters.
7. Update the web Driver Portal’s active ride card so the stop is visible without requiring the operator to infer it from the map or scroll past the primary trip summary. Keep the lower operational itinerary/status actions synchronized with the same rows.
8. Confirm the stop remains present after accept, checklist, on-way, on-location, start, arrive/depart stop, and complete-trip refreshes. Do not expose internal progress timestamps where the audience only needs the address.

**Tests:** hourly booking with the required/default stop, accepted offer to active trip response parity, Home/native trip detail/trips list rendering, mobile and web map route parity, map-provider failure/retry states, external Maps URLs with ordered waypoints, web active ride rendering, admin edit synchronization, legacy booking fallback, final destination deduplication, and status-transition refreshes that preserve sequence and address.

## Phase 3 — Reviews and controlled profile changes

### Task 8: Make reviews context-specific

**Files:**
- `artifacts/driver-app-v2/app/(app)/account/index.tsx`
- `artifacts/driver-app-v2/app/(app)/trip/[bookingId].tsx`
- `artifacts/driver-app-v2/src/components/booking/DriverBookingManifest.tsx`
- `artifacts/api-server/src/routes/reviews.ts`
- `artifacts/api-server/src/routes/bookings.ts`
- Review/presentation tests under `artifacts/driver-app-v2/src` and `artifacts/api-server/src/lib`.

**Steps:**

1. Keep only aggregate stars/count on Profile; remove the individual review list from that screen.
2. Ensure the completed booking DTO includes only the review for that booking and only when the trip is completed.
3. Verify no-review and comment-review states, without exposing reviews from another booking in a list response.

### Task 9: Introduce server-enforced pending driver changes

**Files:**
- `lib/db/src/schema/drivers.ts`
- New schema such as `lib/db/src/schema/driver-change-requests.ts` (or the approved equivalent).
- `lib/db/src/schema/index.ts`
- New Drizzle migration under `lib/db/drizzle/`.
- `artifacts/api-server/src/routes/drivers.ts`
- `artifacts/api-server/src/routes/admin.ts`
- New approval/policy helpers under `artifacts/api-server/src/lib` with tests.
- `artifacts/driver-app-v2/src/api/driverApi.ts`
- `artifacts/driver-app-v2/src/api/hooks.ts`
- `artifacts/driver-app-v2/src/api/types.ts`
- `artifacts/driver-app-v2/app/(app)/account/index.tsx`
- `artifacts/royal-midnight/src/pages/driver/profile.tsx` where the shared API contract requires web alignment.

**Steps:**

1. Remove driver phone editing from the native UI and reject phone mutation from driver-authenticated API requests.
2. Store profile-photo submissions as pending change requests; keep the active photo unchanged until an admin approves.
3. Add admin list/detail/approve/reject operations with actor, timestamp, reason, and stale-request protection.
4. Notify the driver on submission, approval, and rejection; invalidate native/web queries so the displayed status matches the server.
5. Keep admin-authorized direct edits explicit and separate from driver self-service.

**Tests:** driver cannot mutate phone, photo remains active until approval, rejection preserves active photo, repeated/stale approvals are safe, and only the owning driver/admin can access the request.

### Task 9a: Show and enlarge the assigned Driver photo in the passenger portal

**Files:**
- `artifacts/royal-midnight/src/pages/passenger/rides.tsx`
- `artifacts/royal-midnight/src/pages/passenger/ride-detail.tsx`
- New shared passenger component if useful, such as `artifacts/royal-midnight/src/components/passenger/DriverPhotoPreview.tsx`.
- `artifacts/api-server/src/routes/drivers.ts`
- `artifacts/api-server/src/routes/bookings.ts`
- `artifacts/api-server/src/lib/signedUrl.ts`
- `artifacts/api-server/src/lib/signedUrl.test.ts`
- New passenger driver-info/API tests under `artifacts/api-server/src/lib` or route tests.

**Steps:**

1. Trace the screenshot path end-to-end: confirm the assigned passenger is authorized, the response contains the active approved `profilePicture`, the signed path is reachable from the deployed API base, and the image is not being replaced by a null/fallback value.
2. Reuse the server-generated short-lived signed download path; never make the passenger client sign an arbitrary Driver object. Keep the existing trip ownership/tracking-token authorization and phone privacy window intact.
3. Extract a reusable photo/fallback presentation that shows the approved photo in the “Your Chauffeur” card, handles load failure by switching to initials, and avoids broken-image UI.
4. Make the photo tappable and open an accessible enlarged preview/lightbox with close/back behavior, keyboard/touch support, and no navigation away from the trip.
5. Ensure a pending or rejected Driver photo is never returned as the passenger-facing active photo; the previous approved photo remains the visible one until the replacement is approved.

**Tests:** authorized passenger receives a signed active photo, unrelated passenger is denied, no photo uses initials, image error uses initials, clicking opens the full-size preview, close returns to the card, signed URL expiry is handled, and pending-photo changes do not leak to the passenger.

## Phase 4 — Vehicle approval and 30-day compliance policy

### Task 10: Gate vehicle changes and connect document status to work eligibility

**Files:**
- `lib/db/src/schema/driver-vehicles.ts`
- New pending vehicle-change schema or a generalized change-request schema from Task 9.
- `lib/db/drizzle/` new migration.
- `artifacts/api-server/src/routes/drivers.ts`
- `artifacts/api-server/src/routes/admin.ts`
- `artifacts/api-server/src/lib/driverEligibility.ts`
- `artifacts/api-server/src/lib/driverEligibility.test.ts`
- `artifacts/api-server/src/lib/cron-jobs.ts`
- `artifacts/api-server/src/routes/notifications.ts`
- `artifacts/driver-app-v2/app/(app)/account/vehicle.tsx`
- `artifacts/driver-app-v2/app/(app)/account/documents.tsx`
- `artifacts/driver-app-v2/app/(gates)/compliance-hold.tsx`
- `artifacts/driver-app-v2/src/api/driverApi.ts`
- `artifacts/driver-app-v2/src/api/hooks.ts`
- `artifacts/driver-app-v2/src/api/types.ts`
- `artifacts/royal-midnight/src/pages/driver/vehicles.tsx`

**Steps:**

1. Define the date policy at midnight in one pure helper: eligible for change at 30 days remaining, ineligible while more than 30 days remain, and blocked when expired/invalid; document the initial-registration behavior.
2. Convert driver vehicle create/update/delete/default actions into approval requests or restrict them until the appropriate document window is open; never mutate the active vehicle directly from the driver path.
3. Add admin review and atomic approval that updates the active vehicle/legacy mirror only once approved.
4. Make notifications idempotent for the 30-day reminder and document rejection/renewal events.
5. Ensure expired/missing/rejected required documents set the work-blocking compliance state, unassign unsafe future work according to current policy, and prevent new acceptance; keep document upload and support accessible.
6. Clear the hold only after every required document is valid and approved, with tests for boundary dates and concurrent approvals.

**Tests:** 31/30/29-day boundaries, expired, missing, pending, rejected, all-valid, driver API authorization, admin approval, notification deduplication, and work-gate behavior.

### Task 10a: Match the web compliance experience and populate Driver Alerts

**Files:**
- `artifacts/royal-midnight/src/pages/driver/documents.tsx`
- `artifacts/royal-midnight/src/pages/driver/dashboard.tsx`
- `artifacts/royal-midnight/src/config/portalNav.ts`
- `artifacts/driver-app-v2/app/(app)/account/documents.tsx`
- `artifacts/driver-app-v2/app/(app)/notifications/index.tsx`
- `artifacts/driver-app-v2/src/theme/driverPresentation.ts`
- `artifacts/driver-app-v2/src/api/types.ts`
- `artifacts/driver-app-v2/src/api/hooks.ts`
- `artifacts/driver-app-v2/src/api/driverApi.ts`
- `artifacts/api-server/src/lib/cron-jobs.ts`
- `artifacts/api-server/src/routes/admin.ts`
- `artifacts/api-server/src/routes/drivers.ts`
- `artifacts/api-server/src/routes/notifications.ts`
- `lib/db/src/schema/notifications.ts`
- New notification/compliance helper and focused tests under `artifacts/api-server/src/lib`.

**Steps:**

1. Treat the web Documents page as the reference behavior and create a parity matrix for status labels, expiry countdown/overdue text, latest submission, proposed expiry, admin notes, view action, refresh/error/loading states, and the pending-review upload lock.
2. Update the native Documents screen to expose those same states and actions, including the web’s 0–30-day warning and expired-document hold guidance while preserving native document picker and signed viewing.
3. Add a server-side notification writer that targets the driver’s owning user and is safe to call from expiry reminders, compliance lockout, document submission, approval, rejection, and the admin “remind” action. Use document/compliance notification types recognized by `notificationCategory` and prevent duplicate reminders for the same event/window.
4. Make notification rows include a useful title/message, unread state, creation time, and optional deep-link context; tapping a document notification must open the native Documents screen and mark it read.
5. Keep the web dashboard/document behavior aligned with the same server truth; do not invent a native-only expiry calculation or a client-only hold state.

**Tests:** exact status mapping for active/expiring/expired/pending/no-expiry, 30/0/negative day counts, pending upload disabled, rejection note and re-upload path, notification creation for each compliance event, deduplication, ownership, Documents tab filtering, mark-read, and deep-link navigation.

## Phase 5 — Verification and APK gate

### Task 11: Run the full regression matrix before packaging

**Files:**
- No new product files unless a test exposes a defect.
- Existing package scripts in `artifacts/driver-app-v2/package.json`, `artifacts/api-server/package.json`, and workspace configuration.

**Steps:**

1. Run native domain tests, API Vitest suites, TypeScript/type checks, and Expo diagnostics appropriate to the repository’s configured SDK.
2. Verify on a device/emulator: cold launch logo, Home availability before/after On My Way, map retry and external maps, preferences, hourly earnings, completed review, all back targets, photo pending state, vehicle request state, and compliance hold/document upload.
3. Confirm no driver response contains customer hourly price, customer overtime charge, phone mutation path, or unapproved active profile/vehicle data.
4. Review the diff for unrelated files and preserve existing user changes.
5. Only after the user approves the implementation and verification passes, create the preview APK, report the artifact URL, and wait for device testing feedback before production distribution.

**Exit criteria:** all acceptance criteria in the spec are covered by passing tests or an explicitly documented device/environment result; no known blocker is silently deferred.

## Execution order and handoff

The safest implementation order is Tasks 1–4 and 4a first, then Tasks 5–8 and 7a–7b, then the schema/API approval work in Tasks 9–10 and 10a plus the passenger-photo work in Task 9a, and finally Task 11. Tasks 5–8, 7a, 7b, and 9a are partially independent, but the earnings, itinerary, and preference DTO contracts should be settled before native UI edits. The approval workflow, signed-photo authorization, compliance notifications, and itinerary/invoice route should be implemented server-first so a client update cannot bypass server policy or display data that the server never authorized or persisted.

After this plan is approved, execute it in small verified slices using the project’s implementation skill, keeping the API tests and migration review in the same slice as each policy change. Do not generate a new APK merely because code compiles; package only after the targeted device checks pass.
