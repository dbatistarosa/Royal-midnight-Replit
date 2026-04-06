# Royal Midnight — Luxury Black Car Service Platform

## Overview
Full-stack luxury black car service platform for South Florida (FLL, MIA, PBI airports).
Dark midnight/champagne gold branding. Playfair Display headings, Inter body. No emojis.

## Architecture

### Monorepo Structure (pnpm)
- `artifacts/royal-midnight` — React+Vite web application (@workspace/royal-midnight)
- `artifacts/api-server` — Express 5 API server (@workspace/api-server)
- `lib/db` — Drizzle ORM + PostgreSQL schema (@workspace/db)
- `lib/api-spec` — OpenAPI v0.2.0 spec (openapi.yaml)
- `lib/api-client-react` — Generated TanStack React Query hooks (@workspace/api-client-react)
- `lib/api-zod` — Generated Zod validation schemas (@workspace/api-zod)

### Ports
- API server: 8080
- Web app: $PORT (dynamic, ~25848+)
- API base path: /api

## Database (PostgreSQL via Drizzle ORM)

### Tables
- `users` — Passengers, drivers, admins (has passwordHash for auth)
- `vehicles` — Fleet vehicles by class
- `drivers` — Driver profiles, status, ratings
- `bookings` — Trip bookings with status, pricing, promo codes
- `saved_addresses` — User saved addresses
- `reviews` — Post-ride reviews
- `support_tickets` — Customer support tickets
- `notifications` — In-app notifications (system-generated)
- `promo_codes` — Discount codes (percentage or fixed)
- `pricing_rules` — Per-vehicle-class pricing configuration

### DB Commands
```bash
pnpm --filter @workspace/db run push   # Push schema changes
pnpm --filter @workspace/db run seed   # Seed sample data
```

## API Routes

### Auth
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/send-otp
- POST /api/auth/verify-otp

### Bookings: /api/bookings (GET/POST), /api/bookings/:id (GET/PATCH/DELETE)
### Vehicles: /api/vehicles (GET/POST), /api/vehicles/:id (GET/PATCH/DELETE)
### Drivers: /api/drivers (GET/POST), /api/drivers/:id (GET/PATCH), /api/drivers/:id/toggle-availability, /api/drivers/:id/earnings
### Users: /api/users (GET/POST), /api/users/:id (GET/PATCH), /api/users/:id/bookings
### Quote: POST /api/quote
### Addresses: /api/addresses (GET/POST), /api/addresses/:id (DELETE)
### Reviews: /api/reviews (GET/POST)
### Support: /api/support (GET/POST), /api/support/:id (PATCH)
### Notifications: /api/notifications (GET), /api/notifications/:id/read (PATCH)
### Promos: /api/promos (GET/POST), /api/promos/:id (PATCH/DELETE), POST /api/promos/validate
### Pricing: /api/pricing (GET/POST), /api/pricing/:id (PATCH/DELETE)
### Admin: /api/admin/stats, /api/admin/recent-bookings, /api/admin/revenue, /api/admin/dispatch

## Frontend Pages

### Public Marketing
- `/` — Homepage with booking widget
- `/about` — Brand story and values
- `/services` — Services overview
- `/services/airport-transfers` — Airport transfer specialty
- `/services/hourly-chauffeur` — As-directed chauffeur
- `/services/corporate` — Corporate accounts
- `/services/events` — Weddings/galas/events
- `/pricing` — Transparent pricing tables
- `/contact` — Contact form
- `/faq` — FAQ
- `/terms` — Terms of service
- `/privacy` — Privacy policy
- `/fleet` — Fleet showcase
- `/book` — Booking flow
- `/booking-confirmation` — Confirmation page
- `/track` — Trip tracking

### Passenger Portal (/passenger/*)
- `/passenger/dashboard` — Overview, upcoming rides
- `/passenger/rides` — Ride history
- `/passenger/rides/:id` — Ride detail/receipt
- `/passenger/addresses` — Saved addresses
- `/passenger/profile` — Profile management
- `/passenger/support` — Submit support tickets

### Driver Portal (/driver/*)
- `/driver/dashboard` — Availability toggle, active trips
- `/driver/history` — Completed trips
- `/driver/earnings` — Earnings breakdown
- `/driver/profile` — Profile
- `/driver/onboarding` — Multi-step onboarding

### Admin Dashboard (/admin/*)
- `/admin` — KPIs, revenue, recent bookings ("Director's Office")
- `/admin/bookings` — All bookings with filters
- `/admin/passengers` — Passenger list
- `/admin/drivers` — Driver management
- `/admin/fleet` — Fleet management
- `/admin/dispatch` — Live dispatch board
- `/admin/pricing` — Pricing rules
- `/admin/promos` — Promo code management
- `/admin/support` — Support tickets
- `/admin/reports` — Revenue charts

## Code Conventions
- Express 5: `res.status().json(); return;` pattern with `Promise<void>` annotations
- Never use `console.log` in server code — use `req.log` or pino logger
- Numeric DB fields (priceQuoted, rating) must be `parseFloat()`'d before returning
- All timestamp fields returned as `.toISOString()` strings
- Generate codegen after any OpenAPI spec changes: `pnpm --filter @workspace/api-spec run codegen`

## Workflows
- `artifacts/api-server: API Server` — Express server on port 8080
- `artifacts/royal-midnight: web` — Vite dev server
- `artifacts/mockup-sandbox: Component Preview Server` — Canvas component previews

## Seed Data
- 5 vehicles (standard through van)
- 3 active drivers (Marcus Williams, Sofia Rodriguez, James Carter)
- 6 bookings in various statuses
- 5 pricing rules (one per vehicle class)
- 3 promo codes (ROYAL10, WELCOME25, CORPORATE15)
- Test passenger: alex@example.com / password123 (userId=1)
