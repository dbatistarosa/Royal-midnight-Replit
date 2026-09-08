import { describe, it, expect } from "vitest";
import {
  businessDate,
  businessMidnight,
  addBusinessDays,
} from "./businessTime";
describe("Florida accounting dates", () => {
  it("keeps late evening trips on their local date", () =>
    expect(businessDate(new Date("2026-09-08T02:00:00Z"))).toBe("2026-09-07"));
  it("uses the winter UTC offset", () =>
    expect(businessMidnight("2026-01-05").toISOString()).toBe(
      "2026-01-05T05:00:00.000Z",
    ));
  it("uses the summer UTC offset", () =>
    expect(businessMidnight("2026-07-06").toISOString()).toBe(
      "2026-07-06T04:00:00.000Z",
    ));
  it("handles a 167-hour payroll week across spring DST", () => {
    const start = "2026-03-02";
    expect(
      (+businessMidnight(addBusinessDays(start, 7)) -
        +businessMidnight(start)) /
        3600000,
    ).toBe(167);
  });
  it("handles a 169-hour payroll week across fall DST", () => {
    const start = "2026-10-26";
    expect(
      (+businessMidnight(addBusinessDays(start, 7)) -
        +businessMidnight(start)) /
        3600000,
    ).toBe(169);
  });
});
