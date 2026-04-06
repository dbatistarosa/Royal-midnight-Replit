# Royal Midnight — Platform Architecture

## Overview

Royal Midnight is a premium luxury black car and chauffeur service platform for South Florida, serving FLL, MIA, and PBI airports. The platform offers flat-rate pricing, online booking, fleet management, and an admin dashboard.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui
- **Data fetching**: TanStack React Query

## Artifacts

- **`artifacts/royal-midnight`** — Main web app (preview path: `/`)
  - Landing page with booking widget
  - Multi-step booking wizard with real-time price quotes
  - Fleet showcase (5 vehicle classes)
  - Driver portal
  - Admin dashboard
  - Booking confirmation + tracking pages
- **`artifacts/api-server`** — Shared Express API (preview path: `/api`)

## Database Schema

- `users` — Passenger and driver accounts
- `vehicles` — Fleet vehicles (standard/business/first_class/suv/van)
- `drivers` — Chauffeur profiles with ratings
- `bookings` — Ride bookings with status tracking

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Design

- Color palette: Deep black (`#0a0a0a`) with champagne gold accents
- Typography: Playfair Display (headings) + Inter (body)
- Brand positioning: Premium members' club aesthetic — deliberate, expensive, no-nonsense
