/**
 * Client-side PDF invoice generator using jsPDF.
 * Generates a branded Royal Midnight receipt PDF that can be downloaded directly
 * in the browser without any server round-trip.
 */

export type InvoiceData = {
  bookingId: number;
  passengerName: string;
  passengerEmail?: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  pickupAt: string; // ISO string
  vehicleClass?: string | null;
  passengers?: number | null;
  flightNumber?: string | null;
  priceQuoted: number;
  discountAmount?: number | null;
  tipAmount?: number | null;
  status: string;
};

function vehicleLabel(cls: string | null | undefined): string {
  switch (cls) {
    case "business": return "Business Class";
    case "first": return "First Class";
    case "suv": return "Executive SUV";
    case "van": return "Executive Van";
    default: return cls ?? "Standard";
  }
}

export async function generateInvoicePdf(data: InvoiceData): Promise<void> {
  // Dynamic import so jsPDF is only loaded when the user clicks "Download"
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({ unit: "pt", format: "letter" });

  const gold = [201, 168, 76] as [number, number, number];
  const white = [255, 255, 255] as [number, number, number];
  const dark = [18, 18, 30] as [number, number, number];
  const mid = [40, 40, 58] as [number, number, number];
  const muted = [120, 120, 140] as [number, number, number];

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  // ── Background ──────────────────────────────────────────────────────────────
  doc.setFillColor(...dark);
  doc.rect(0, 0, W, H, "F");

  // ── Header bar ──────────────────────────────────────────────────────────────
  doc.setFillColor(...mid);
  doc.rect(0, 0, W, 80, "F");

  // Gold accent strip at top
  doc.setFillColor(...gold);
  doc.rect(0, 0, W, 4, "F");

  // Brand name
  doc.setFont("times", "bold");
  doc.setFontSize(26);
  doc.setTextColor(...gold);
  doc.text("ROYAL MIDNIGHT", 48, 48);

  // Ref number (right-aligned)
  const refStr = `RM-${String(data.bookingId).padStart(4, "0")}`;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...muted);
  doc.text("BOOKING REFERENCE", W - 48, 32, { align: "right" });
  doc.setFontSize(14);
  doc.setTextColor(...white);
  doc.text(refStr, W - 48, 50, { align: "right" });

  // ── "INVOICE / RECEIPT" label ────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text("INVOICE / RECEIPT", 48, 102);

  // Gold divider
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.5);
  doc.line(48, 108, W - 48, 108);

  // ── Passenger & Date block ───────────────────────────────────────────────────
  let y = 130;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text("BILLED TO", 48, y);
  doc.text("DATE OF SERVICE", W / 2, y);

  y += 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...white);
  doc.text(data.passengerName, 48, y);

  const dateStr = (() => {
    try {
      const d = new Date(data.pickupAt);
      return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    } catch { return data.pickupAt; }
  })();
  const timeStr = (() => {
    try {
      return new Date(data.pickupAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    } catch { return ""; }
  })();

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(dateStr, W / 2, y);
  if (data.passengerEmail) {
    y += 14;
    doc.setFontSize(9);
    doc.setTextColor(...muted);
    doc.text(data.passengerEmail, 48, y);
    doc.setTextColor(...white);
    doc.setFontSize(11);
    doc.text(timeStr, W / 2, y);
  } else {
    y += 14;
    doc.setTextColor(...white);
    doc.text(timeStr, W / 2, y);
  }

  // ── Trip Details ─────────────────────────────────────────────────────────────
  y += 30;
  doc.setDrawColor(...mid);
  doc.setLineWidth(1);
  doc.line(48, y, W - 48, y);
  y += 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text("TRIP DETAILS", 48, y);
  y += 14;

  const detailRows: [string, string][] = [
    ["Pickup", data.pickupAddress],
    ["Drop-off", data.dropoffAddress],
    ["Vehicle Class", vehicleLabel(data.vehicleClass)],
  ];
  if (data.passengers != null) detailRows.push(["Passengers", String(data.passengers)]);
  if (data.flightNumber) detailRows.push(["Flight", data.flightNumber]);

  doc.setFontSize(10);
  for (const [label, value] of detailRows) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...muted);
    doc.text(label, 48, y);
    doc.setTextColor(...white);
    // Wrap long addresses
    const lines = doc.splitTextToSize(value, W - 200) as string[];
    doc.text(lines, 180, y);
    y += Math.max(16, lines.length * 14);
  }

  // ── Charges Table ────────────────────────────────────────────────────────────
  y += 10;
  doc.setDrawColor(...mid);
  doc.line(48, y, W - 48, y);
  y += 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text("CHARGES", 48, y);
  y += 16;

  const baseFare = data.priceQuoted * 0.8;
  const taxesFees = data.priceQuoted * 0.2;
  const discount = data.discountAmount ?? 0;
  const tip = data.tipAmount ? Number(data.tipAmount) : 0;
  const total = data.priceQuoted - discount + tip;

  const chargeRows: [string, string, boolean?][] = [
    ["Base Fare", `$${baseFare.toFixed(2)}`],
    ["Taxes & Fees", `$${taxesFees.toFixed(2)}`],
  ];
  if (discount > 0) chargeRows.push(["Discount", `-$${discount.toFixed(2)}`, true]);
  if (tip > 0) chargeRows.push(["Gratuity", `+$${tip.toFixed(2)}`, true]);

  doc.setFontSize(11);
  for (const [label, amount, isGreen] of chargeRows) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...(isGreen ? ([74, 222, 128] as [number, number, number]) : muted));
    doc.text(label, 48, y);
    doc.setTextColor(...(isGreen ? ([74, 222, 128] as [number, number, number]) : white));
    doc.text(amount, W - 48, y, { align: "right" });
    y += 18;
  }

  // Total row
  y += 6;
  doc.setFillColor(...mid);
  doc.rect(40, y - 14, W - 80, 28, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...white);
  doc.text("TOTAL CHARGED", 48, y + 4);
  doc.setTextColor(...gold);
  doc.text(`$${total.toFixed(2)}`, W - 48, y + 4, { align: "right" });

  // ── Footer ───────────────────────────────────────────────────────────────────
  const footerY = H - 48;
  doc.setDrawColor(...mid);
  doc.setLineWidth(0.5);
  doc.line(48, footerY - 10, W - 48, footerY - 10);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text("Royal Midnight Transportation · Premium Chauffeured Services", W / 2, footerY, { align: "center" });
  doc.text("Thank you for choosing Royal Midnight.", W / 2, footerY + 13, { align: "center" });

  // ── Save ─────────────────────────────────────────────────────────────────────
  doc.save(`royal-midnight-${refStr}.pdf`);
}
