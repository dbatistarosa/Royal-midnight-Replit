import test from "node:test";
import assert from "node:assert/strict";
import { averagePerRide, earningsPeriodLabel, periodFareShare, statementHtml, statementText, buildCustomEarningsRange } from "./earnings.ts";

test("earnings breakdown keeps tips separate from fare share", () => {
  assert.equal(periodFareShare(245.5, 20.5), 225);
  assert.equal(averagePerRide(245.5, 2), 122.75);
  assert.equal(averagePerRide(0, 0), 0);
});

test("custom and all-time statements are readable exports", () => {
  assert.equal(earningsPeriodLabel("custom", "2026-09-01", "2026-09-29"), "2026-09-01 – 2026-09-29");
  assert.equal(earningsPeriodLabel("all"), "All Time");
  assert.match(statementText({ periodLabel: "All Time", periodEarnings: 245.5, periodTips: 20.5, periodRides: 2, commissionPct: 0.7 }), /Fare share: \$225\.00 \(70%\)/);
});

test("PDF statement HTML escapes the selected period", () => {
  const html = statementHtml({ periodLabel: "<Custom> & review", periodEarnings: 245.5, periodTips: 20.5, periodRides: 2, commissionPct: 0.7 });
  assert.match(html, /&lt;Custom&gt; &amp; review/);
  assert.doesNotMatch(html, /<Custom>/);
  assert.match(html, /Total earnings/);
});

test("custom earnings dates reject impossible calendar dates and reversed ranges", () => {
  assert.deepEqual(buildCustomEarningsRange("2026-02-28", "2026-03-01"), {
    startDate: new Date("2026-02-28T00:00:00").toISOString(),
    endDate: new Date("2026-03-01T23:59:59.999").toISOString(),
  });
  assert.equal(buildCustomEarningsRange("2026-02-30", "2026-03-01"), null);
  assert.equal(buildCustomEarningsRange("2026-03-02", "2026-03-01"), null);
  assert.equal(buildCustomEarningsRange("03/01/2026", "2026-03-02"), null);
});
