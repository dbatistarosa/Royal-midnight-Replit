# Driver Web–Native Parity Design

**Date:** 2026-09-29  
**Status:** Proposed; awaiting user approval  
**Audit:** `docs/handoff/driver-build24-parity-audit-2026-09-29.md`

## Purpose

Make the native Driver application a complete mobile surface for the capabilities already available to a driver in the working web portal. The web implementation is the behavioral reference and is read-only for this effort. Backend work is permitted only where the native app needs a consistent authorized contract, server-owned configuration, or protected map/media delivery.

## Product principles

- A driver should never need the web portal to understand or execute a trip.
- The same reservation has one canonical set of driver-visible facts.
- Presentation can adapt to mobile, but information, privacy and workflow rules must remain equivalent.
- Buttons derive from server state and configured windows, never from hard-coded timers.
- Pre-accept privacy remains intact; assigned-trip operational details become complete.
- Every error must tell the driver what can be done next.

## Data design

### Canonical driver booking view

Introduce a server helper that builds the authorized driver view used by both booking collection and detail routes. It includes the existing booking fields plus:

- service/charter mode and hours;
- estimated distance and duration;
- vehicle/class and capacity context;
- driver earnings and breakdown;
- passengers and luggage;
- extras and paid-to-driver amounts;
- ordered hourly itinerary and stop state;
- passenger preferences after assignment;
- special requests and contact after assignment;
- trip/checklist timestamps needed for the state machine.

The open-pool view uses the same base facts but forcibly removes passenger identity, contact, special requests and preferences.

### Driver workflow configuration

Expose a driver-authenticated, secret-free configuration response for confirm/release/grace windows. The native state selector consumes the returned values and timestamps to compute visible/enabled actions and explanatory copy. Server mutation endpoints remain authoritative.

### Protected route map

Add a booking-scoped route-map endpoint. Authorization must permit only an approved driver who can see the open offer or the assigned driver. The server calls the existing map provider with its private credential, includes ordered itinerary stops, and proxies a static image with private caching. No provider token reaches the APK. Failure returns a typed response so the app can show the route text and an optional retry instead of breaking the page.

### Protected profile media

Use the existing authenticated object-download mechanism or a short-lived own-profile URL. Never render the raw stored object path. The client must show initials while loading or after an image error.

## Native presentation design

### Shared booking manifest

A reusable manifest component renders sections according to booking type, state and authorization:

- service badge and scheduled date/time;
- route map, pickup, ordered stops and drop-off;
- distance and duration;
- passenger and luggage counts;
- assigned vehicle;
- flight information when present;
- all passenger preferences and special requests after assignment;
- hourly terms, included miles and overage rule;
- extras and driver-paid amounts;
- driver earnings breakdown where appropriate.

The component is used by offer, active trip and read-only history so those screens cannot drift independently.

### Offer

Remove the countdown and all expiry navigation. Keep Back, Accept and Decline. Show the complete privacy-safe manifest. Filter eligible vehicles using the same class/capacity/luggage rules as web; explain when none qualifies.

### Active trip state machine

Implement pure selectors for states and actions: assigned/checklist, on the way, arrived, passenger in car/in progress, itinerary stops and completed. The five checklist items must be explicitly checked. `On My Way` is a separate action and is disabled with an exact availability time outside the configured window. Hourly itinerary arrivals/departures precede final completion. The in-progress hourly timer uses the trip start timestamp; it is unrelated to offers.

### Navigation

Each source screen passes a validated `returnTo` value and optional tab/filter. The header back action uses navigation history where valid and a deterministic safe fallback otherwise. Completed/cancelled details remain read-only and return to their originating Rides tab, not Home.

### Account and operational parity

Profile gains authenticated photo display/update, phone editing, performance/reviews and full status choices. Earnings gains web-equivalent range and breakdown/PDF functions. Payout gains secure Tax ID/SSN entry and masked status. Existing vehicle, documents, alerts and support behavior is preserved and regression-tested.

## Error handling

Normalize server errors into safe typed categories: outside action window, stale booking, incompatible vehicle, network/offline, permission denied, unavailable external app and unexpected server failure. Preserve the server's actionable message when safe. Mutations disable duplicate taps and refetch canonical data after success or conflict.

## Verification strategy

- Unit tests for authorization shaping, time-window selectors, workflow transitions, vehicle compatibility and return navigation.
- API tests for list/detail parity, pre-accept masking, map authorization and configuration response.
- component tests for normal, hourly, flight, empty, loading and error manifests.
- regression tests for profile media and completed-trip return behavior.
- full server/type/test checks before deployment.
- production smoke checks without modifying web behavior.
- one new Android build only after server and client tests pass.
- real-phone matrix with screenshots and timestamps; do not infer success from EAS.

## Out of scope

- Redesigning or changing the working web Driver portal.
- Changing customer pricing or discount economics.
- Exposing passenger-private information before assignment.
- Adding Mercedes Sprinter imagery or service support.
