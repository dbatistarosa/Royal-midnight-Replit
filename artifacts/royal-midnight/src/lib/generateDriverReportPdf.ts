export type DriverReportData = {
  driverName: string;
  dateRangeLabel: string;
  periodEarnings: number;
  periodTips: number;
  periodRides: number;
  commissionPct: number;
  avgPerRide: number;
  recentPayouts: { date: string; amount: number; rides: number }[];
};

const fmt$ = (n: number) => `$${n.toFixed(2)}`;
const fmtPct = (n: number) => `${(n * 100).toFixed(0)}%`;

export async function generateDriverReportPdf(data: DriverReportData): Promise<void> {
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({ unit: "pt", format: "letter" });

  const gold = [201, 168, 76] as [number, number, number];
  const white = [255, 255, 255] as [number, number, number];
  const dark = [18, 18, 30] as [number, number, number];
  const mid = [40, 40, 58] as [number, number, number];
  const muted = [120, 120, 140] as [number, number, number];
  const green = [74, 222, 128] as [number, number, number];
  const amber = [251, 191, 36] as [number, number, number];

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  doc.setFillColor(...dark);
  doc.rect(0, 0, W, H, "F");

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
  doc.text("DRIVER EARNINGS REPORT", W - 48, 32, { align: "right" });
  doc.setFontSize(11);
  doc.setTextColor(...white);
  doc.text(data.dateRangeLabel, W - 48, 50, { align: "right" });

  let y = 100;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text("EARNINGS SUMMARY", 48, y);
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.5);
  doc.line(48, y + 6, W - 48, y + 6);
  y += 24;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text(`Generated: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`, 48, y);
  doc.text(`Driver: ${data.driverName}`, 48, y + 14);
  doc.text(`Period: ${data.dateRangeLabel}`, 48, y + 28);
  doc.text(`Completed Rides: ${data.periodRides}`, 48, y + 42);
  y += 66;

  const cardW = (W - 96 - 12) / 2;
  const cardH = 72;
  const cards: { label: string; value: string; sub: string; color: [number, number, number] }[] = [
    {
      label: "TOTAL EARNINGS",
      value: fmt$(data.periodEarnings),
      sub: `Fare commission + tips`,
      color: gold,
    },
    {
      label: "TIPS RECEIVED",
      value: fmt$(data.periodTips),
      sub: "100% passed through",
      color: amber,
    },
    {
      label: "FARE COMMISSION",
      value: fmt$(Math.max(0, data.periodEarnings - data.periodTips)),
      sub: `Your share @ ${fmtPct(data.commissionPct)} of fares`,
      color: green,
    },
    {
      label: "AVERAGE PER RIDE",
      value: fmt$(data.avgPerRide),
      sub: `Across all-time completed rides`,
      color: muted,
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
  y += 14;

  if (data.recentPayouts.length > 0) {
    doc.setDrawColor(...mid);
    doc.setLineWidth(0.5);
    doc.line(48, y, W - 48, y);
    y += 20;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...muted);
    doc.text("DAILY BREAKDOWN", 48, y);
    y += 16;

    const colDate = 48;
    const colRides = 240;
    const colAmount = W - 48;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...muted);
    doc.text("Date", colDate, y);
    doc.text("Rides", colRides, y);
    doc.text("Earnings", colAmount, y, { align: "right" });
    y += 6;
    doc.line(48, y, W - 48, y);
    y += 14;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    for (const row of data.recentPayouts) {
      if (y > H - 80) break;
      doc.setTextColor(...white);
      doc.text(row.date, colDate, y);
      doc.setTextColor(...muted);
      doc.text(String(row.rides), colRides, y);
      doc.setTextColor(...gold);
      doc.text(fmt$(row.amount), colAmount, y, { align: "right" });
      y += 18;
    }
  }

  const footerY = H - 48;
  doc.setDrawColor(...mid);
  doc.setLineWidth(0.5);
  doc.line(48, footerY - 10, W - 48, footerY - 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text("Royal Midnight Transportation · Premium Chauffeured Services", W / 2, footerY, { align: "center" });
  doc.text("Confidential — Driver earnings statement.", W / 2, footerY + 13, { align: "center" });

  const filename = `royal-midnight-driver-report-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
