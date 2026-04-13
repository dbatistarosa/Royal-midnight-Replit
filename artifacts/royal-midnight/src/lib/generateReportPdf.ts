/**
 * Client-side admin financial report PDF generator using jsPDF.
 * Generates a branded Royal Midnight financial summary PDF.
 */

export type ReportFinancialData = {
  dateRangeLabel: string;
  completedRides: number;
  totalGrossIncome: number;
  totalTaxesCollected: number;
  totalFeesCollected: number;
  totalDriverCommissions: number;
  companyNetIncome: number;
  taxRatePct: number;
  ccFeePct: number;
  commissionPct: number;
};

const fmt$ = (n: number) => `$${n.toFixed(2)}`;
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

export async function generateReportPdf(data: ReportFinancialData): Promise<void> {
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({ unit: "pt", format: "letter" });

  const gold = [201, 168, 76] as [number, number, number];
  const white = [255, 255, 255] as [number, number, number];
  const dark = [18, 18, 30] as [number, number, number];
  const mid = [40, 40, 58] as [number, number, number];
  const muted = [120, 120, 140] as [number, number, number];
  const green = [74, 222, 128] as [number, number, number];
  const amber = [251, 191, 36] as [number, number, number];
  const blue = [96, 165, 250] as [number, number, number];
  const red = [248, 113, 113] as [number, number, number];

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  // ── Background ──────────────────────────────────────────────────────────────
  doc.setFillColor(...dark);
  doc.rect(0, 0, W, H, "F");

  // ── Header bar ──────────────────────────────────────────────────────────────
  doc.setFillColor(...mid);
  doc.rect(0, 0, W, 80, "F");
  doc.setFillColor(...gold);
  doc.rect(0, 0, W, 4, "F");

  doc.setFont("times", "bold");
  doc.setFontSize(26);
  doc.setTextColor(...gold);
  doc.text("ROYAL MIDNIGHT", 48, 48);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text("FINANCIAL REPORT", W - 48, 32, { align: "right" });
  doc.setFontSize(11);
  doc.setTextColor(...white);
  doc.text(data.dateRangeLabel, W - 48, 50, { align: "right" });

  // ── Report label & date ──────────────────────────────────────────────────────
  let y = 100;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text("FINANCIAL SUMMARY", 48, y);

  doc.setDrawColor(...gold);
  doc.setLineWidth(0.5);
  doc.line(48, y + 6, W - 48, y + 6);
  y += 24;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text(`Generated: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`, 48, y);
  doc.text(`Period: ${data.dateRangeLabel}`, 48, y + 14);
  doc.text(`Completed Rides: ${data.completedRides}`, 48, y + 28);
  y += 52;

  // ── Summary Cards ───────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text("INCOME BREAKDOWN", 48, y);
  y += 16;

  const cardW = (W - 96 - 12) / 2;
  const cardH = 72;
  const cards: { label: string; value: string; sub: string; color: [number, number, number] }[] = [
    {
      label: "TOTAL GROSS INCOME",
      value: fmt$(data.totalGrossIncome),
      sub: "All revenue charged to passengers",
      color: gold,
    },
    {
      label: "COMPANY NET INCOME",
      value: fmt$(data.companyNetIncome),
      sub: "After taxes, fees & commissions",
      color: green,
    },
    {
      label: "TOTAL TAXES COLLECTED",
      value: fmt$(data.totalTaxesCollected),
      sub: `Florida tax @ ${fmtPct(data.taxRatePct)}`,
      color: blue,
    },
    {
      label: "CC PROCESSING FEES",
      value: fmt$(data.totalFeesCollected),
      sub: `Processing fee @ ${fmtPct(data.ccFeePct)}`,
      color: amber,
    },
    {
      label: "DRIVER COMMISSIONS",
      value: fmt$(data.totalDriverCommissions),
      sub: `Driver share @ ${fmtPct(data.commissionPct)} of subtotal`,
      color: red,
    },
  ];

  let col = 0;
  for (const card of cards) {
    const x = col === 0 ? 48 : 48 + cardW + 12;
    doc.setFillColor(...mid);
    doc.rect(x, y, cardW, cardH, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(card.label, x + 12, y + 18);

    doc.setFont("times", "bold");
    doc.setFontSize(22);
    doc.setTextColor(...card.color);
    doc.text(card.value, x + 12, y + 46);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(card.sub, x + 12, y + 62);

    col = col === 0 ? 1 : 0;
    if (col === 0) y += cardH + 10;
  }
  if (col === 1) y += cardH + 10;
  y += 10;

  // ── Waterfall table ──────────────────────────────────────────────────────────
  doc.setDrawColor(...mid);
  doc.setLineWidth(0.5);
  doc.line(48, y, W - 48, y);
  y += 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text("CALCULATION WATERFALL", 48, y);
  y += 16;

  const rows: { label: string; value: string; isDeduction?: boolean; isFinal?: boolean }[] = [
    { label: "Gross Income (charged to passengers)", value: fmt$(data.totalGrossIncome) },
    { label: `– Florida Taxes @ ${fmtPct(data.taxRatePct)}`, value: `(${fmt$(data.totalTaxesCollected)})`, isDeduction: true },
    { label: `– CC Processing Fees @ ${fmtPct(data.ccFeePct)}`, value: `(${fmt$(data.totalFeesCollected)})`, isDeduction: true },
    { label: `– Driver Commissions @ ${fmtPct(data.commissionPct)} of subtotal`, value: `(${fmt$(data.totalDriverCommissions)})`, isDeduction: true },
    { label: "= Company Net Income", value: fmt$(data.companyNetIncome), isFinal: true },
  ];

  doc.setFontSize(11);
  for (const row of rows) {
    if (row.isFinal) {
      doc.setFillColor(...mid);
      doc.rect(40, y - 14, W - 80, 26, "F");
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...green);
    } else {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(row.isDeduction ? red[0] : white[0], row.isDeduction ? red[1] : white[1], row.isDeduction ? red[2] : white[2]);
    }
    doc.text(row.label, 48, y);
    doc.text(row.value, W - 48, y, { align: "right" });
    y += 22;
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  const footerY = H - 48;
  doc.setDrawColor(...mid);
  doc.setLineWidth(0.5);
  doc.line(48, footerY - 10, W - 48, footerY - 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text("Royal Midnight Transportation · Premium Chauffeured Services", W / 2, footerY, { align: "center" });
  doc.text("Confidential — For internal use only.", W / 2, footerY + 13, { align: "center" });

  const filename = `royal-midnight-report-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
