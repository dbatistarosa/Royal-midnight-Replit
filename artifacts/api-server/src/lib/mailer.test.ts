import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture what would have been sent via Resend instead of making a real
// network call — lets us assert on the actual HTML the recipient would see.
const sendMock = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { id: "test" } }));

vi.mock("resend", () => ({
  // `new Resend(...)` is called in mailer.ts — the mock must be a real
  // function (not an arrow function) so it's valid as a constructor.
  Resend: vi.fn().mockImplementation(function MockResend() {
    return { emails: { send: sendMock } };
  }),
}));

// mailer.ts also logs every send attempt to the DB; mock it out so this test
// has zero real I/O instead of relying on the dummy DATABASE_URL in
// vitest.config.ts to fail-and-swallow a real connection attempt.
vi.mock("@workspace/db", () => ({ db: { insert: () => ({ values: async () => {} }) } }));
vi.mock("@workspace/db/schema", () => ({ emailLogsTable: {} }));

process.env.RESEND_API_KEY = "test-key";

const { escapeHtml, sendBookingConfirmationPassenger, sendWeeklyDriverPayout } = await import("./mailer");

describe("escapeHtml", () => {
  it("escapes all five HTML-significant characters", () => {
    expect(escapeHtml(`<b>&"'</b>`)).toBe("&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;");
  });
});

describe("sendBookingConfirmationPassenger — XSS regression", () => {
  beforeEach(() => sendMock.mockClear());

  it("escapes a malicious passenger name and address instead of rendering them as live HTML", async () => {
    await sendBookingConfirmationPassenger({
      id: 1,
      passengerName: "<script>alert(1)</script>",
      passengerEmail: "test@example.com",
      pickupAddress: 'Test & "Quotes" <b>Bold</b>',
      dropoffAddress: "Drop <off>",
      pickupAt: new Date().toISOString(),
      vehicleClass: "business",
      passengers: 1,
      priceQuoted: 100,
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const html = sendMock.mock.calls[0]![0].html as string;

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");

    expect(html).not.toContain('<b>Bold</b>');
    expect(html).toContain("Test &amp; &quot;Quotes&quot; &lt;b&gt;Bold&lt;/b&gt;");
  });
});

describe("sendWeeklyDriverPayout — baseHtml regression", () => {
  beforeEach(() => sendMock.mockClear());

  it("no longer throws ReferenceError: baseHtml is not defined", async () => {
    await expect(
      sendWeeklyDriverPayout({
        driverName: "Jane Doe",
        driverEmail: "jane@example.com",
        weekLabel: "Jun 16 - Jun 22, 2026",
        rides: 5,
        grossEarnings: 500,
        commissionPct: 0.7,
        commission: 350,
        extrasTotal: 60,
        tipsTotal: 20,
        driverNet: 430,
        bankName: "Test Bank",
        routingNumber: "123456789",
        accountLast4: "2222",
        legalName: "Jane Doe",
      }),
    ).resolves.not.toThrow();

    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("shows the caller's figures rather than recomputing them, and totals correctly", async () => {
    // The statement used to derive commission itself as grossEarnings x
    // commissionPct, which stopped adding up to driverNet the moment add-ons
    // entered the payout: the chauffeur would read $350 + $20 = $430 with $60
    // unaccounted for.
    await sendWeeklyDriverPayout({
      driverName: "Jane Doe",
      driverEmail: "jane@example.com",
      weekLabel: "Jun 16 - Jun 22, 2026",
      rides: 5,
      grossEarnings: 500,
      commissionPct: 0.7,
      commission: 350,
      extrasTotal: 60,
      tipsTotal: 20,
      driverNet: 430,
      bankName: "Test Bank",
      routingNumber: "123456789",
      accountLast4: "2222",
      legalName: "Jane Doe",
    });

    const html = sendMock.mock.calls[0]![0].html as string;
    expect(html).toContain("$350.00");   // commission, as supplied
    expect(html).toContain("+$60.00");   // add-ons paid in full
    expect(html).toContain("+$20.00");   // tips
    expect(html).toContain("$430.00");   // total payout
  });

  it("masks the account with the last four it was given, not four characters of ciphertext", async () => {
    await sendWeeklyDriverPayout({
      driverName: "Jane Doe",
      driverEmail: "jane@example.com",
      weekLabel: "Jun 16 - Jun 22, 2026",
      rides: 1, grossEarnings: 100, commissionPct: 0.7,
      commission: 70, extrasTotal: 0, tipsTotal: 0, driverNet: 70,
      bankName: "Test Bank",
      routingNumber: "123456789",
      accountLast4: "4321",
      legalName: "Jane Doe",
    });

    const html = sendMock.mock.calls[0]![0].html as string;
    expect(html).toContain("****4321");
  });
});
