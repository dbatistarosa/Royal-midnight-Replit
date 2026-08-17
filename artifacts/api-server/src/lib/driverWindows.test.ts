import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The bug this pins down: "On the Way" was refused until 60 minutes before
 * pickup, and the release sweep took the trip away at 60 minutes before pickup.
 * The window in which a driver could confirm and the deadline by which they had
 * to have confirmed opened at the same instant, so a sweep landing a minute
 * later punished a driver who had had sixty seconds to act — warning, permanent
 * block on that trip, and a third strike suspends the account.
 *
 * getDriverWindows() must never return a pair that can reproduce that, whatever
 * an operator types into Settings.
 */

const settingsRows = new Map<string, string>();

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (cond: { key?: string }) => Promise.resolve(
          cond?.key && settingsRows.has(cond.key) ? [{ value: settingsRows.get(cond.key) }] : [],
        ),
      }),
    }),
  },
  settingsTable: { key: "key", value: "value" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (_col: unknown, value: string) => ({ key: value }),
}));

let getDriverWindows: typeof import("./driverWindows").getDriverWindows;
let MIN_GRACE_MINUTES: number;
let DEFAULT_CONFIRM_WINDOW_MINUTES: number;
let DEFAULT_RELEASE_MINUTES: number;

beforeEach(async () => {
  settingsRows.clear();
  const mod = await import("./driverWindows");
  getDriverWindows = mod.getDriverWindows;
  MIN_GRACE_MINUTES = mod.MIN_GRACE_MINUTES;
  DEFAULT_CONFIRM_WINDOW_MINUTES = mod.DEFAULT_CONFIRM_WINDOW_MINUTES;
  DEFAULT_RELEASE_MINUTES = mod.DEFAULT_RELEASE_MINUTES;
});

afterEach(() => vi.clearAllMocks());

describe("getDriverWindows", () => {
  it("defaults to a window that is strictly wider than the deadline", async () => {
    const w = await getDriverWindows();
    expect(w.confirmWindowMinutes).toBe(DEFAULT_CONFIRM_WINDOW_MINUTES);
    expect(w.releaseMinutes).toBe(DEFAULT_RELEASE_MINUTES);
    expect(w.confirmWindowMinutes).toBeGreaterThan(w.releaseMinutes);
    expect(w.graceMinutes).toBeGreaterThanOrEqual(MIN_GRACE_MINUTES);
  });

  it("refuses to reproduce the original bug when both are set to 60", async () => {
    settingsRows.set("driver_confirm_window_minutes", "60");
    settingsRows.set("driver_release_minutes", "60");
    const w = await getDriverWindows();
    // The release is pulled back rather than the driver being left with nothing.
    expect(w.releaseMinutes).toBeLessThan(w.confirmWindowMinutes);
    expect(w.graceMinutes).toBeGreaterThanOrEqual(MIN_GRACE_MINUTES);
  });

  it("clamps a release deadline set beyond the confirmation window", async () => {
    settingsRows.set("driver_confirm_window_minutes", "90");
    settingsRows.set("driver_release_minutes", "200");
    const w = await getDriverWindows();
    expect(w.releaseMinutes).toBe(90 - MIN_GRACE_MINUTES);
    expect(w.graceMinutes).toBe(MIN_GRACE_MINUTES);
  });

  it("honours a sensible operator configuration unchanged", async () => {
    settingsRows.set("driver_confirm_window_minutes", "180");
    settingsRows.set("driver_release_minutes", "60");
    const w = await getDriverWindows();
    expect(w).toEqual({ confirmWindowMinutes: 180, releaseMinutes: 60, graceMinutes: 120 });
  });

  it("falls back to defaults for blank, zero, negative and nonsense values", async () => {
    for (const bad of ["", "0", "-30", "abc"]) {
      settingsRows.set("driver_confirm_window_minutes", bad);
      settingsRows.set("driver_release_minutes", bad);
      const w = await getDriverWindows();
      expect(w.confirmWindowMinutes).toBe(DEFAULT_CONFIRM_WINDOW_MINUTES);
      expect(w.releaseMinutes).toBe(DEFAULT_RELEASE_MINUTES);
      expect(w.graceMinutes).toBeGreaterThanOrEqual(MIN_GRACE_MINUTES);
    }
  });

  it("never returns a release deadline at or below zero", async () => {
    settingsRows.set("driver_confirm_window_minutes", "5");
    settingsRows.set("driver_release_minutes", "5");
    const w = await getDriverWindows();
    expect(w.releaseMinutes).toBeGreaterThan(0);
  });
});
