# Driver App findings and acceptance criteria

This document records the findings reported from the Driver App screenshots and the corresponding code-audit evidence. It is a requirements baseline for a later implementation pass; it does not authorize code changes, deployment, or APK generation.

## Scope

- Driver App (`artifacts/driver-app-v2`).
- Shared driver-facing API and database policy (`artifacts/api-server`, `lib/db`).
- The web driver portal only where it shares the same API or is the existing source of truth for compliance and driver earnings presentation.

## Findings and required behavior

1. **Branding and splash screen**
   - The complete Royal Midnight logo must be visible on the splash screen at supported phone aspect ratios.
   - The Home header must not mask the logo into a circular crop. The transparent brand asset should be used where the current icon treatment crops the shield or wordmark.
   - Acceptance: visual snapshots show the full crest and wordmark with safe margins on a narrow and tall device; no logo text is clipped.

2. **Availability versus trip lifecycle**
   - A reservation in `confirmed`/checklist state is a committed trip, but it is not yet an “On Duty” live route.
   - The driver is “On Duty” only from `on_way` through `on_location` and `in_progress`, and leaves that state when the trip completes or is cancelled.
   - Acceptance: `confirmed` does not force the Home status to On Duty; the live-route stages do; availability controls and location tracking use the same rule.

3. **Maps**
   - The route map must load when the map provider is configured and return a useful retry/fallback state when it is not.
   - The API must distinguish missing configuration, address/geocoding failure, provider failure, timeout, and a successful image response without exposing secrets.
   - The external “Open route in Maps” action remains available and must be tested independently from the embedded map.

4. **Passenger preferences**
   - Assigned trips should show the passenger’s saved address title, cabin temperature, music preference, quiet-ride preference, beverage preference, door preference, and permitted VIP notes.
   - Open-pool offers must continue masking passenger preferences before assignment.
   - Driver-visible preference hydration must work for both a linked `userId` and a verified passenger-email match, without broadening access to unrelated users.
   - The meaning of `opensOwnDoor` must be normalized across the API, Driver App, and web portal before UI copy is finalized.

5. **Hourly charter, extras, and overtime**
   - Drivers see booked hours, included miles, and their own earnings—not the passenger/customer hourly rate.
   - Extras are absent when none were selected; a zero-value extras line is not shown.
   - Overtime is absent until the grace period has actually been exceeded and the charge/driver payout is recorded. When present, the driver sees only the amount payable to the driver, not the customer charge.
   - Acceptance: driver DTOs and UI cannot leak `hourlyRate` as a customer price; earnings tests cover no extras, selected extras, uncharged overage, and charged overage.

6. **Reviews**
   - The Driver Profile displays only aggregate rating and review count.
   - An individual passenger review appears in the corresponding completed trip only when that passenger left one.
   - Acceptance: profile rendering contains no review-comment list; completed-trip rendering remains booking-scoped and handles no-review correctly.

7. **Back navigation**
   - A trip opened from Home returns to Home.
   - A trip opened from Upcoming, Completed, Cancelled, or Alerts returns to that originating destination and tab.
   - Navigation must use an explicit validated return target rather than relying on an incidental router history stack.

8. **Driver profile and approval workflow**
   - Phone is read-only for drivers and cannot be changed through the API by a driver.
   - Profile-photo changes create a pending admin-review request. The active photo remains unchanged until approval; rejection preserves the active photo and explains the reason.
   - Every driver-submitted profile/vehicle change is approval-gated server-side. The UI must accurately label pending, approved, and rejected states.

9. **Vehicle and document compliance**
   - Vehicle information changes are accepted only when the relevant document expires within 30 days, or under an explicitly documented exception for an initial registration if product confirms one.
   - The driver is notified when renewal is needed and can upload replacement documents from the compliance screen.
   - Expired or otherwise invalid required documentation places the account on a work-blocking compliance hold/pause. The driver may still sign in and access documents/support, but cannot accept or continue new work contrary to the agreed operational policy.
   - A newly uploaded document does not restore work or replace the active expiry until an administrator approves it. Approval clears the hold only after all required documents are valid.

10. **Logout and return to login**
   - When the driver taps Log Out, the local session must be cleared and the app must immediately navigate to the login screen where email/username, password, and the remaining sign-in controls are available.
   - Revoking the server session, stopping location sharing, and clearing cached queries must not leave the UI waiting on a network request.
   - Acceptance: after logout the app never remains on an indeterminate spinner; restarting the app shows login; pressing back cannot expose authenticated screens after the local session is gone.

11. **Web-to-native compliance parity and reminders**
   - The web Driver Portal is the visual and behavioral reference for documents: each card shows Active, Expiring Soon, Expired, Pending Admin Review, or No expiry on file; it shows remaining/overdue days, last submission, proposed expiry, admin rejection notes, and a file-view action.
   - While a document is pending review, the web portal does not offer another upload for that document. The native screen must follow the same rule and state copy.
   - The web dashboard shows an expiry warning for documents with 0–30 days remaining and a clear compliance-hold overlay for expired documents, with a direct route to upload documents.
   - A compliance reminder must create an in-app notification of type `documents`/`compliance` for the driver, so it appears under Alerts → Documents and opens the Documents screen. Email alone is not sufficient.
   - Acceptance: the same document status, countdown, pending/rejected behavior, hold messaging, refresh behavior, and notification-to-documents action are available in the Driver App.

12. **Passenger identification of the assigned Driver**
   - In the passenger portal’s assigned-trip “Your Chauffeur” card, show the Driver’s active approved profile photo so passengers can identify the vehicle and Driver in crowded pickup areas.
   - Tapping the photo must open an enlarged, accessible preview/lightbox with a clear close action. It must work on both the passenger rides list card and the ride-detail view where the chauffeur is shown.
   - The photo must be delivered only through the existing assigned-trip authorization and a short-lived server-signed download path. The passenger must not be able to sign arbitrary Driver objects or view a pending/unapproved photo.
   - If no approved photo exists or the image fails to load, keep the initials fallback and do not leave a broken-image element.
   - Acceptance: an authorized passenger sees the approved photo, can enlarge/close it, an unauthorized passenger cannot obtain it, and a pending photo never replaces the currently active photo.

13. **Hourly-service itinerary on the passenger invoice and admin booking detail**
   - For an hourly service, the passenger-facing invoice/receipt must show the pickup address, every intermediate stop in its saved sequence, and the final destination/drop-off.
   - The administrator’s booking list/detail view must show the same intermediate stops when opening “view booking information”; the admin must not have to infer them from the map or raw data.
   - If an hourly booking has no intermediate stops, preserve the current pickup-to-final-destination presentation.
   - The final destination must be rendered once only, even when it is present both as the booking drop-off and as the `kind: "final"` itinerary row.
   - The invoice route must use the persisted booking itinerary, not an unsaved client-side waypoint list, and must preserve the same order across the email summary, downloadable invoice context, and any passenger portal receipt/route summary that displays addresses.
   - Acceptance: invoices and admin booking details with two stops, one stop, no stops, and legacy bookings without itinerary rows all render the correct ordered route without duplicates or missing addresses.

14. **Hourly stop visibility throughout the active-trip lifecycle**
   - The intermediate stop for an hourly service must remain visible after the booking is accepted and while the trip is On the Way, Arrived, or In Progress. It cannot disappear when the offer becomes an active trip.
   - The Driver App and the web Driver Portal must show the stop as a readable route item between pickup and final destination. A map marker alone, or an itinerary block hidden below the active-trip summary, is not sufficient for operational use.
   - The Driver App must display the same usable route map as the web Driver Portal when the provider is configured, including the intermediate stop marker and route segment. If the embedded map cannot load, the app must show a truthful reason and retry/fallback state rather than silently presenting a route without its map.
   - The Driver App’s external “Open route in Maps” link must include pickup, every intermediate stop in sequence, and final destination. It must not open a shortened pickup-to-drop-off route when stops exist.
   - The current product rule requires at least one intermediate stop for an hourly service. If the intended rule is a system-provided default stop, that stop must be created and persisted by the booking workflow; it must not exist only in one client’s local state.
   - Every client and status transition must consume the same persisted itinerary, including accepted offers, Home/Active Trip, trip detail, route map, and arrival/departure actions.
   - Acceptance: an hourly booking with its required/default stop shows Pickup → Stop 1 → Final in the offer, active Driver App trip, web Driver Portal active ride, and admin detail, with the same address and sequence.
   - Acceptance: the embedded Driver App map and web map use the same ordered route, and opening external Maps preserves all waypoints in that same order.

## Audit evidence classification

### Confirmed from current code

- Home derives “On Duty” from an active-trip set that includes `confirmed`, and `displayDriverStatus` treats any active trip as On Duty.
- The native hourly card renders `booking.hourlyRate`; the manifest can render zero-valued Extras and Overtime lines.
- The native profile renders up to three individual reviews and exposes an editable phone field/save action.
- Vehicle POST/PATCH/DELETE/default operations mutate the live vehicle rows immediately; no approval request is created.
- Trip screens use `router.back()` for the manual title back action while completed/cancelled buttons use explicit routes.
- The logout action clears the auth store, but the authenticated group has no explicit redirect for a now-null token/user; its `!driver` fallback renders an indefinite loading spinner instead of routing to login. The server revoke request and location cleanup also run inside the awaited logout operation, so the logout flow needs a non-blocking navigation contract.
- The API exposes notification listing and read endpoints, but the current compliance cron only sends an admin lockout email; the admin reminder sends email, and document rejection sends email. There is no compliance notification insert for the driver's in-app Alerts feed, explaining the empty Documents tab in the screenshot.
- The web documents page already implements the reference status/countdown/pending-review/rejection/hold experience. The native documents page currently shows only a colored dot, localized expiry, submission status/date, and upload controls, so it is not functionally equivalent.
- The passenger rides card already requests `profilePicture` and falls back to initials, while the API has signed-photo fields on the public driver and booking driver-info endpoints; the current UI has no enlarged-photo interaction, and the screenshot shows the initials fallback. The payload, active approved photo, signed URL response, and image failure path must be traced before declaring the missing photo fixed.
- Hourly booking creation already persists each waypoint as a `stop` row and the drop-off as a `final` row in `booking_itinerary_stops`, ordered by `sequence`.
- The passenger invoice sender currently receives and renders only `pickupAddress` and `dropoffAddress`; the invoice-creation route does not load the booking itinerary before calling it, so intermediate stops cannot appear in the invoice summary.
- The passenger portal receipt builder currently assembles monetary lines only. If the portal’s receipt or invoice view displays the route, it must consume the same ordered itinerary formatter rather than reconstructing the route separately.
- The admin `GET /bookings` response enriches bookings with extras and receipt data but does not load or return itinerary rows. The admin booking screen’s `BookingRow` type and Trip Details section therefore render only Pick-up and Drop-off, so intermediate stops are also absent from the administrator’s booking information view.
- The quote/booking flow currently rejects an hourly service when no waypoint is supplied; it enforces that a caller provides a stop but does not create a default stop itself.
- The native assigned-trip API path returns `itinerary`, and `RouteMapCard` has support for passing non-final rows to `RouteStops`; the supplied active-trip screenshot still shows only pickup/final, so the runtime response/build path must be verified rather than assuming the existing component is enough.
- The native `RouteMapCard` builds its external Google Maps URL with only `origin` and `destination`; it does not add `booking.itinerary` waypoints, so a driver can be sent on a shortened route even after the stop is displayed elsewhere.
- The native route-map endpoint does pass persisted intermediate stops to `getRouteMapImage`, while the web `TripRouteMap` builds its map address list as pickup + stops + drop-off. The mobile “Map unavailable” result therefore needs an environment/provider/response-path check against the working web map, not a client-side removal of the stop.
- The web Driver Portal has a lower `Hourly itinerary` block and sends stop addresses to the map, but the active ride summary still presents only pickup → drop-off and the textual stop can be outside the immediately visible operational section.
- The admin edit route updates the legacy `bookings.waypoints` JSON field but does not synchronize the `booking_itinerary_stops` rows, which can make the map, active-trip clients, invoice, and admin detail disagree after an itinerary edit.
- The API’s driver contact route directly updates phone/profile picture and has no pending approval state.
- Compliance has a `complianceHold`, document submissions, nightly enforcement, and admin approval flow, but the requested 30-day vehicle-change gate and full profile/vehicle approval workflow are not yet represented as one consistent policy.

### Requires environment/device confirmation before implementation is declared complete

- Whether production has a valid `MAPBOX_ACCESS_TOKEN` and whether the failing address/provider responses are configuration, geocoding, timeout, or static-image failures.
- Exact pixel bounds/aspect ratio of the splash/logo assets on the target devices.
- Whether the affected reservation has `booking.userId` populated or relies on passenger email, which determines why preferences are absent in that case.
- The intended business meaning of `opensOwnDoor` and whether a compliance hold must also set `drivers.status` to `paused`, or whether the existing work-blocking hold is the canonical operational pause.

## Non-goals for this audit pass

- No production code, database, environment variable, admin data, or deployed service is changed.
- No APK is built until the implementation is approved and the tests pass.
