# Reliability release — 2026-09-07

Authorized scope: address the review findings, verify in stages, apply migrations,
push to GitHub and deploy. Existing local itinerary and social work is preserved.

Baseline: 135 API tests; web/API/mobile typechecks pass; mockup typecheck fails;
web/API builds pass; production audit has unhandled high advisories.

Live discovery: production Supabase is qpqmefenkleyzwnlleih; staging is
tktdvxodcitwlcqcrssu. Only check-reservation-status is deployed; the three unsafe
legacy Edge functions have already been removed. Vercel connector returns 403.
Branch: fix/royal-midnight-reliability, initially identical to origin/main.

Verification and release results will be recorded here as each stage completes.
