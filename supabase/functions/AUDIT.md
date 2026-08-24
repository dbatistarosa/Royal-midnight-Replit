# Edge Function audit — 2026-08-13

**Update 2026-08-23:** all five functions are now in this repository (pulled
verbatim from the dashboard via the Supabase MCP `get_edge_function` tool) and
`supabase/config.toml` documents `verify_jwt` for each. `sent-dm-webhook` also
got the timestamp-freshness fix described below — **deployed to production as
version 3** via the Supabase MCP `deploy_edge_function` tool, with the user's
go-ahead. `update-driver-location` and `calculate-route-price` are still live
in production; re-confirmed on 2026-08-23 that nothing in the repo (web,
api-server, or driver-app) calls either one. Deleting them requires the
Supabase dashboard — there is no delete-function tool available via MCP or CLI
from this environment.

The Cyber Neo audit only ever saw `check-reservation-status`, because that was
the only function in this repository at the time. Production has **five
deployed**. The other four were created outside version control and had never
been reviewed before this update.

Findings below were confirmed by invoking the live endpoints with nothing but the
project's **public anon key** — not inferred from reading code.

`verify_jwt` is not an access control. Supabase accepts the anon key as a valid
JWT, and the anon key is public by design (it ships in the browser bundle). A
function with `verify_jwt: true` and no check of its own is a public endpoint.

| Function | verify_jwt | In repo | Callers in code | Verdict |
|---|---|---|---|---|
| `check-reservation-status` | false | yes | pg_cron (jobid 1, every minute) | CLOSED 2026-08-14 |
| `update-driver-location` | true | yes (2026-08-23) | **none** | **HIGH — still open, delete via dashboard** |
| `calculate-route-price` | false | yes (2026-08-23) | **none** | MEDIUM — still open, delete via dashboard |
| `send-message-via-sent` | true | yes (2026-08-23) | none | Dormant, unchanged |
| `sent-dm-webhook` | false | yes (2026-08-23) | Sent.dm (external) | **Replay fix deployed (v3), CLOSED** |

## CLOSED 2026-08-14 — `check-reservation-status`

Fixed and verified in production. The secret was seeded into
`settings.edge_function_invoke_secret`, the pg_cron job was rewritten to look it
up at call time and send it as a Bearer token, and version 3 of the function was
deployed with the constant-time gate.

Verified after deploy (03:03:34 UTC):

| Caller | Before | After |
|---|---|---|
| anon key | `200`, function executed | `401` |
| no header | `200` | `401` |
| wrong secret | — | `401` |
| pg_cron | `200` | `200`, zero failures |

Deployed with `verify_jwt = false` on purpose — see `supabase/config.toml`.
Setting it to true would break the cron without adding protection.

The original finding follows, for the record.

## CRITICAL (now fixed) — `check-reservation-status`

Runs with `service_role`, so RLS does not apply. Reads every in-progress hourly
booking with passenger names and emails, **writes `extra_charge` onto live
bookings**, and emails customers from our domain.

Confirmed: `POST` with only the anon key returned
`200 {"success":true,"checked":0,"overdue":0}`. The function executed.

A caller can inflate overage charges on live trips and, past the 15-minute
re-notify gate, send real customers billing claims that appear to come from us.

The gate is written and committed in `check-reservation-status/index.ts`, reading
its secret from `settings.edge_function_invoke_secret`. It is **not deployed**:
the pg_cron job that drives this every minute sends no Authorization header, so
the secret must be seeded and the cron updated in the same step, or billing
automation stops. See the SQL in the project notes.

## HIGH — `update-driver-location`

Takes `driver_id` from the **request body** and never checks that the caller owns
that driver. Writes to `driver_locations` and overwrites `drivers.latitude` /
`longitude` for whatever id it is given, using `service_role`.

Confirmed reachable: `POST` with the anon key and deliberately invalid
coordinates returned `400` from the *coordinate* validator — meaning the request
passed authentication and reached the function body.

Anyone can therefore place any chauffeur anywhere on the map. A passenger
tracking their ride would see a fabricated position. CWE-639, the same class as
CN-005.

**Nothing in this codebase calls it.** Removing it breaks nothing, and that is
the recommended fix. If it is kept, it must derive the driver from an
authenticated session rather than from the body.

## MEDIUM — `calculate-route-price`

Unauthenticated proxy to the Mapbox Directions API using our
`MAPBOX_ACCESS_TOKEN`. No database access and no billing impact — the
authoritative price is always recomputed server-side by `/quote`, so this cannot
be used to manipulate what a customer pays.

The exposure is cost: anyone can burn our Mapbox quota, with no rate limit.
**Nothing in this codebase calls it either.**

## Dormant — `send-message-via-sent`

Accepts an arbitrary phone number and arbitrary text and sends it as SMS or
WhatsApp on our account. That would be an open relay — spam billed to us, with
our sender identity — except that its secrets are not configured.

Confirmed: returns `500 "SENT_DM_API_KEY or SENT_DM_TEXT_TEMPLATE_NAME not
configured"`, and that check runs before anything is sent. Not currently
exploitable. **It must not be given secrets while it is unauthenticated.**

## OK — `sent-dm-webhook`

The one that was written correctly. Verifies an HMAC-SHA256 signature over
`{webhookId}.{timestamp}.{body}` with `timingSafeEqual`, and fails closed when
the signing secret is absent. `verify_jwt: false` is correct here — an external
webhook cannot present a Supabase JWT.

One gap: the timestamp is included in the signature but never checked for
freshness, so a captured payload stays replayable forever. Low impact while
Sent.dm is retired.

**Fixed and deployed 2026-08-23** (version 3, live in production): rejects
with `400` if `x-webhook-timestamp` is more than 5 minutes from the current
time, before spending a signature check on it — same tolerance window
Svix/Stripe use.

## The structural problem — CLOSED 2026-08-23

Four of five functions used to live only in the dashboard, invisible to code
review and to this repository's history — exactly how three publicly-reachable,
service_role-powered endpoints went unnoticed. All five are now pulled into
`supabase/functions/` with their `verify_jwt` setting recorded in
`supabase/config.toml`. The dashboard is no longer the source of truth; treat
future changes to any of these as a normal code change (edit here, deploy from
here) rather than a dashboard edit.
