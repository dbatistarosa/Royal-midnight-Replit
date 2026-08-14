import type { Request, Response } from "express";

/**
 * How a failed Stripe call is reported to the caller.
 *
 * `catch (err) { res.status(500).json({ error: err.message }) }` appeared at 16
 * places in payments.ts. Stripe SDK errors carry API object identifiers,
 * parameter names and account configuration details; several of those routes
 * are reachable from the public booking flow. The global handler in app.ts
 * already does this correctly — logs the detail, returns a flat message — and
 * these route-level catches were bypassing it.
 *
 * StripeCardError is the exception worth keeping: those messages are written
 * for the cardholder ("Your card was declined"), and hiding them turns an
 * actionable problem into a mystery. It was the reason the pattern was
 * introduced on create-intent in the first place; it then got copied to routes
 * where it does not apply.
 */
export function sendStripeError(
  req: Request,
  res: Response,
  err: unknown,
  fallback = "Payment processing failed — please try again.",
): void {
  const e = err as { type?: string; message?: string } | null;

  if (e?.type === "StripeCardError") {
    res.status(402).json({ error: e.message ?? "Your card was declined." });
    return;
  }

  req.log?.error({ err }, "stripe_operation_failed");
  res.status(500).json({ error: fallback });
}
