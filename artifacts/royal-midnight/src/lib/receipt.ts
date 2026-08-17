/**
 * The one place a passenger receipt is assembled.
 *
 * There were two, and both were wrong in the same way. The ride-detail screen
 * printed `priceQuoted * 0.8` as the fare and `priceQuoted * 0.2` as
 * "Taxes & Fees"; the downloadable PDF printed the identical invented split.
 * Neither fraction was ever anybody's tax rate — Florida tax is 7% and the card
 * fee 4%.
 *
 * The screen then listed the add-ons as separate lines and added them to the
 * total a second time (price_quoted already contains them), while the PDF left
 * them out completely, subtracted the discount that price_quoted had already
 * been reduced by, and ignored extra time. So the same trip could be shown to
 * the same customer as $2,013.67 on screen and something else again on paper,
 * against a card that was charged $1,121.51.
 *
 * price_quoted is the whole authorised amount: service + add-ons + tax + card
 * fee, less any discount. Every line below is derived from it, never a fraction
 * of it.
 */

export type ReceiptExtra = { id: number; name: string; quantity: number; total: number | string };

/** The per-line amounts the server recorded when the booking was sold.
 *  Null fields mean the booking predates that recording (migration 0012). */
export type StoredReceipt = {
  taxAmount: number | null;
  cardFee: number | null;
  airportFee: number | null;
  extrasTotal: number | null;
  overageFare: number | null;
  overageTax: number | null;
  overageCardFee: number | null;
  extraChargePaymentIntentId: string | null;
};

export type ReceiptInput = {
  priceQuoted: number;
  discountAmount?: number | null;
  tipAmount?: number | null;
  extraCharge?: number | null;
  overageMinutes?: number | null;
  charterMode?: string | null;
  charterHours?: number | null;
  extras?: ReceiptExtra[] | null;
  receipt?: StoredReceipt | null;
};

export type ReceiptLine = {
  label: string;
  amount: number;
  note?: string;
  /** "credit" lines (discount, gratuity) render green; "extra" renders amber. */
  tone?: "credit" | "extra";
};

export type Receipt = {
  lines: ReceiptLine[];
  total: number;
  /** True when extra time was billed but no card charge succeeded for it. */
  extraTimeUnpaid: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildReceipt(booking: ReceiptInput): Receipt {
  const lines: ReceiptLine[] = [];
  const priceQuoted = booking.priceQuoted ?? 0;
  const extras = booking.extras ?? [];
  const extrasFromList = round2(extras.reduce((sum, e) => sum + Number(e.total), 0));
  const r = booking.receipt ?? null;
  const discount = booking.discountAmount ?? 0;
  const extraCharge = Number(booking.extraCharge ?? 0);
  const tip = Number(booking.tipAmount ?? 0);

  const fareLabel = booking.charterMode === "hourly" && booking.charterHours
    ? `Hourly charter · ${booking.charterHours} hr${booking.charterHours === 1 ? "" : "s"}`
    : "Fare";

  const extraLine = (e: ReceiptExtra): ReceiptLine => ({
    label: e.quantity > 1 ? `${e.name} × ${e.quantity}` : e.name,
    amount: Number(e.total),
  });

  if (r?.taxAmount != null) {
    // Recorded breakdown: decompose price_quoted exactly.
    const tax = r.taxAmount;
    const cardFee = r.cardFee ?? 0;
    const airportFee = r.airportFee ?? 0;
    const extrasTotal = r.extrasTotal ?? extrasFromList;
    const service = round2(priceQuoted + discount - tax - cardFee - extrasTotal);

    lines.push({ label: fareLabel, amount: round2(service - airportFee) });
    if (airportFee > 0) lines.push({ label: "Airport fee", amount: airportFee });
    for (const e of extras) lines.push(extraLine(e));
    if (discount > 0) lines.push({ label: "Discount", amount: -discount, tone: "credit" });
    if (tax > 0) lines.push({ label: "Florida tax", amount: tax });
    if (cardFee > 0) lines.push({ label: "Card processing", amount: cardFee });
  } else {
    // Sold before the breakdown existed. price_quoted then meant "fare
    // including tax and card fee", with the add-ons bolted on untaxed — so one
    // combined line is the honest presentation rather than a made-up split.
    lines.push({ label: `${fareLabel} (incl. taxes & fees)`, amount: round2(priceQuoted - extrasFromList) });
    for (const e of extras) lines.push(extraLine(e));
  }

  if (extraCharge > 0) {
    lines.push({
      label: "Extra time",
      amount: extraCharge,
      ...(booking.overageMinutes != null ? { note: `${booking.overageMinutes} min over` } : {}),
      tone: "extra",
    });
  }
  if (tip > 0) lines.push({ label: "Gratuity", amount: tip, tone: "credit" });

  return {
    lines,
    total: round2(priceQuoted + extraCharge + tip),
    // Only claim money is outstanding when the attempt was actually recorded.
    extraTimeUnpaid: extraCharge > 0 && r != null && r.overageFare != null && !r.extraChargePaymentIntentId,
  };
}
