export type PassengerTrip = {
  id: number;
  pickupAddress: string;
  dropoffAddress: string;
  pickupAt: string | Date;
  status: string;
  priceQuoted: number;
};

export type PassengerReportData = {
  passengerName: string;
  dateRangeLabel: string;
  totalSpent: number;
  tripCount: number;
  avgCostPerTrip: number;
  trips: PassengerTrip[];
};

const fmt$ = (n: number) => `$${n.toFixed(2)}`;

export async function generatePassengerReportPdf(data: PassengerReportData): Promise<void> {
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({ unit: "pt", format: "letter" });

  const gold = [201, 168, 76] as [number, number, number];
  const white = [255, 255, 255] as [number, number, number];
  const dark = [18, 18, 30] as [number, number, number];
  const mid = [40, 40, 58] as [number, number, number];
  const muted = [120, 120, 140] as [number, number, number];
  const green = [74, 222, 128] as [number, number, number];

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
  doc.text("TRAVEL REPORT", W - 48, 32, { align: "right" });
  doc.setFontSize(11);
  doc.setTextColor(...white);
  doc.text(data.dateRangeLabel, W - 48, 50, { align: "right" });

  let y = 100;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text("TRIP SUMMARY", 48, y);
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.5);
  doc.line(48, y + 6, W - 48, y + 6);
  y += 24;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text(`Generated: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`, 48, y);
  doc.text(`Passenger: ${data.passengerName}`, 48, y + 14);
  doc.text(`Period: ${data.dateRangeLabel}`, 48, y + 28);
  y += 52;

  const cardW = (W - 96 - 24) / 3;
  const cardH = 72;
  const summaryCards = [
    { label: "TOTAL SPENT", value: fmt$(data.totalSpent), sub: "All completed trips", color: gold },
    { label: "TRIPS TAKEN", value: String(data.tripCount), sub: "Completed rides", color: green },
    { label: "AVG COST / TRIP", value: fmt$(data.avgCostPerTrip), sub: "Period average", color: muted },
  ];

  let col = 0;
  for (const card of summaryCards) {
    const x = 48 + col * (cardW + 12);
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
    col++;
  }
  y += cardH + 24;

  if (data.trips.length > 0) {
    doc.setDrawColor(...mid);
    doc.setLineWidth(0.5);
    doc.line(48, y, W - 48, y);
    y += 20;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...muted);
    doc.text("TRIP DETAIL", 48, y);
    y += 16;

    const colDate = 48;
    const colRoute = 160;
    const colStatus = 360;
    const colAmt = W - 48;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text("Date", colDate, y);
    doc.text("Route", colRoute, y);
    doc.text("Status", colStatus, y);
    doc.text("Amount", colAmt, y, { align: "right" });
    y += 6;
    doc.line(48, y, W - 48, y);
    y += 14;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    for (const trip of data.trips) {
      if (y > H - 80) break;
      const dateStr = new Date(trip.pickupAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const pickup = trip.pickupAddress.split(",")[0] ?? trip.pickupAddress;
      const dropoff = trip.dropoffAddress.split(",")[0] ?? trip.dropoffAddress;
      const route = `${pickup} → ${dropoff}`;
      const routeTrunc = route.length > 36 ? route.slice(0, 34) + "…" : route;

      doc.setTextColor(...muted);
      doc.text(dateStr, colDate, y);
      doc.setTextColor(...white);
      doc.text(routeTrunc, colRoute, y);
      doc.setTextColor(...muted);
      doc.text(trip.status, colStatus, y);
      doc.setTextColor(...gold);
      doc.text(fmt$(trip.priceQuoted), colAmt, y, { align: "right" });
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
  doc.text("Confidential — Passenger travel statement.", W / 2, footerY + 13, { align: "center" });

  const filename = `royal-midnight-travel-report-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
