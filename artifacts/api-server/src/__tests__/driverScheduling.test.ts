/**
 * Unit tests for checkDriverAvailability and getTransitMinutes.
 *
 * The database layer and fetch are mocked so tests are fully isolated.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Hoist shared mock state so it is initialised before vi.mock factories run ─

const { dbCallQueue, dbMock } = vi.hoisted(() => {
  const dbCallQueue: Array<unknown[]> = [];

  const makeQueryBuilder = (rows: unknown[]) => ({
    from: () => makeQueryBuilder(rows),
    where: () => makeQueryBuilder(rows),
    limit: () => Promise.resolve(rows),
    then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(rows).then(onFulfilled),
  });

  const dbMock = {
    select: () => {
      const rows = dbCallQueue.shift() ?? [];
      return makeQueryBuilder(rows);
    },
  };

  return { dbCallQueue, dbMock };
});

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => ({
  db: dbMock,
  bookingsTable: {
    id: { name: "id" },
    driverId: { name: "driver_id" },
    status: { name: "status" },
    pickupAt: { name: "pickup_at" },
    pickupAddress: { name: "pickup_address" },
    dropoffAddress: { name: "dropoff_address" },
    estimatedDurationMinutes: { name: "estimated_duration_minutes" },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
  ne: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  or: vi.fn(() => ({})),
  gte: vi.fn(() => ({})),
  lt: vi.fn(() => ({})),
}));

vi.mock("../lib/maps.js", () => ({ DEFAULT_DURATION_MINUTES: 60 }));

// ── Import module under test after mocks are set up ───────────────────────────
import { checkDriverAvailability, getTransitMinutes } from "../lib/driverScheduling.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

function mockMapsSuccess(durationSeconds: number) {
  global.fetch = vi.fn().mockResolvedValueOnce({
    json: vi.fn().mockResolvedValueOnce({
      status: "OK",
      rows: [{ elements: [{ status: "OK", duration: { value: durationSeconds } }] }],
    }),
  } as unknown as Response);
}

function mockMapsFailure() {
  global.fetch = vi.fn().mockResolvedValueOnce({
    json: vi.fn().mockResolvedValueOnce({ status: "REQUEST_DENIED", rows: [] }),
  } as unknown as Response);
}

beforeEach(() => {
  dbCallQueue.length = 0;
  delete process.env.GOOGLE_MAPS_API_KEY;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// getTransitMinutes
// ─────────────────────────────────────────────────────────────────────────────

describe("getTransitMinutes", () => {
  it("returns null when GOOGLE_MAPS_API_KEY is not set", async () => {
    expect(await getTransitMinutes("A", "B")).toBeNull();
  });

  it("returns null when the Maps API returns non-OK status", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    mockMapsFailure();
    expect(await getTransitMinutes("A", "B")).toBeNull();
  });

  it("returns null when fetch throws a network error", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    global.fetch = vi.fn().mockRejectedValueOnce(new Error("network error"));
    expect(await getTransitMinutes("A", "B")).toBeNull();
  });

  it("returns duration in minutes for a successful response", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    mockMapsSuccess(1800); // 30 minutes
    expect(await getTransitMinutes("A", "B")).toBe(30);
  });

  it("enforces a minimum of 1 minute for near-zero durations", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    mockMapsSuccess(10); // 0.17 min → clamped to 1
    expect(await getTransitMinutes("A", "B")).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkDriverAvailability — Rule 1: exact pickup-time overlap
// ─────────────────────────────────────────────────────────────────────────────

describe("checkDriverAvailability — Rule 1 (exact overlap)", () => {
  it("returns false when an existing trip has the identical pickup time", async () => {
    const pickupAt = new Date(Date.UTC(2025, 0, 15, 10, 0, 0));
    dbCallQueue.push([{ id: 999, pickupAt, pickupAddress: "A", dropoffAddress: "B", estimatedDurationMinutes: 60 }]);
    dbCallQueue.push([{ id: 1, pickupAt, dropoffAddress: "C", estimatedDurationMinutes: 60 }]);

    expect(await checkDriverAvailability(42, 999)).toBe(false);
  });

  it("returns true when there are no same-day trips", async () => {
    const pickupAt = new Date(Date.UTC(2025, 0, 15, 10, 0, 0));
    dbCallQueue.push([{ id: 999, pickupAt, pickupAddress: "A", dropoffAddress: "B", estimatedDurationMinutes: 60 }]);
    dbCallQueue.push([]); // no existing trips

    expect(await checkDriverAvailability(42, 999)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkDriverAvailability — Rule 2: 60-minute pre-ride block
// ─────────────────────────────────────────────────────────────────────────────

describe("checkDriverAvailability — Rule 2 (60-min pre-ride block)", () => {
  it("returns false when new pickup is 30 min before an existing pickup", async () => {
    const newPickup = new Date(Date.UTC(2025, 0, 15, 10, 0, 0));
    const existingPickup = new Date(Date.UTC(2025, 0, 15, 10, 30, 0)); // 30 min later

    dbCallQueue.push([{ id: 999, pickupAt: newPickup, pickupAddress: "A", dropoffAddress: "B", estimatedDurationMinutes: 60 }]);
    dbCallQueue.push([{ id: 1, pickupAt: existingPickup, dropoffAddress: "C", estimatedDurationMinutes: 60 }]);

    expect(await checkDriverAvailability(42, 999)).toBe(false);
  });

  it("returns false when new pickup is 59 min before an existing pickup", async () => {
    const newPickup = new Date(Date.UTC(2025, 0, 15, 10, 0, 0));
    const existingPickup = new Date(Date.UTC(2025, 0, 15, 10, 59, 0)); // 59 min later

    dbCallQueue.push([{ id: 999, pickupAt: newPickup, pickupAddress: "A", dropoffAddress: "B", estimatedDurationMinutes: 60 }]);
    dbCallQueue.push([{ id: 1, pickupAt: existingPickup, dropoffAddress: "C", estimatedDurationMinutes: 60 }]);

    expect(await checkDriverAvailability(42, 999)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkDriverAvailability — Rule 3: back-to-back with Maps transit
// ─────────────────────────────────────────────────────────────────────────────

describe("checkDriverAvailability — Rule 3 (back-to-back buffer)", () => {
  it("returns false (fail-closed) when Maps is unavailable — no silent fallback", async () => {
    // Existing: 08:00 pickup, 60-min trip → ends 09:00
    // New: 11:00 pickup (2 h gap, outside Rule 2 window)
    // No API key → getTransitMinutes returns null → must deny
    const existingPickup = new Date(Date.UTC(2025, 0, 15, 8, 0, 0));
    const newPickup = new Date(Date.UTC(2025, 0, 15, 11, 0, 0));

    dbCallQueue.push([{ id: 999, pickupAt: newPickup, pickupAddress: "Pick B", dropoffAddress: "Drop B", estimatedDurationMinutes: 60 }]);
    dbCallQueue.push([{ id: 1, pickupAt: existingPickup, dropoffAddress: "Drop A", estimatedDurationMinutes: 60 }]);

    // No GOOGLE_MAPS_API_KEY set → null → fail-closed
    expect(await checkDriverAvailability(42, 999)).toBe(false);
  });

  it("returns false when existing end + transit + 15 min exceeds new pickup", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";

    // Existing: 08:00 pickup, 60 min → ends 09:00
    // New: 10:00 pickup
    // Transit = 70 min → 09:00 + 70 + 15 = 10:25 > 10:00 → conflict
    const existingPickup = new Date(Date.UTC(2025, 0, 15, 8, 0, 0));
    const newPickup = new Date(Date.UTC(2025, 0, 15, 10, 0, 0));

    dbCallQueue.push([{ id: 999, pickupAt: newPickup, pickupAddress: "Pick B", dropoffAddress: "Drop B", estimatedDurationMinutes: 60 }]);
    dbCallQueue.push([{ id: 1, pickupAt: existingPickup, dropoffAddress: "Drop A", estimatedDurationMinutes: 60 }]);

    mockMapsSuccess(70 * 60); // 70 min transit

    expect(await checkDriverAvailability(42, 999)).toBe(false);
  });

  it("returns true when existing end + transit + 15 min fits within new pickup", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";

    // Existing: 08:00 pickup, 60 min → ends 09:00
    // New: 11:00 pickup
    // Transit = 30 min → 09:00 + 30 + 15 = 09:45 ≤ 11:00 → OK
    const existingPickup = new Date(Date.UTC(2025, 0, 15, 8, 0, 0));
    const newPickup = new Date(Date.UTC(2025, 0, 15, 11, 0, 0));

    dbCallQueue.push([{ id: 999, pickupAt: newPickup, pickupAddress: "Pick B", dropoffAddress: "Drop B", estimatedDurationMinutes: 60 }]);
    dbCallQueue.push([{ id: 1, pickupAt: existingPickup, dropoffAddress: "Drop A", estimatedDurationMinutes: 60 }]);

    mockMapsSuccess(30 * 60); // 30 min transit

    expect(await checkDriverAvailability(42, 999)).toBe(true);
  });
});
