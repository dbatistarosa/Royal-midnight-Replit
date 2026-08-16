import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Recovering from a Stripe customer id that no longer exists.
 *
 * users.stripe_customer_id is written once and then trusted forever. That
 * assumption breaks the moment the Stripe account or mode changes — and it did:
 * ids minted under the previous account survived the switch to the current one,
 * so every payment attempt by an affected passenger failed with
 *
 *     StripeInvalidRequestError: No such customer: 'cus_...'
 *
 * which reached the browser as the generic "Stripe error — please try again."
 * The customer lookup in create-intent was already wrapped in its own
 * try/catch, but that only guarded reading the id; passing the stale value to
 * paymentIntents.create was outside it, so the whole request 500'd.
 *
 * Every path that passes a stored customer id to Stripe therefore has to be
 * able to answer "that customer is gone" without failing the request. Clearing
 * the row is safe: the id is a cache of a Stripe object, and a fresh customer
 * is created on the next payment. defaultPaymentMethodId is cleared with it
 * because a payment method belonging to a customer that does not exist cannot
 * be charged either, and leaving it behind would fail the same way one step
 * later.
 */

type StripeLikeError = {
  code?: string;
  rawType?: string;
  param?: string;
  message?: string;
  statusCode?: number;
};

/**
 * True when Stripe is telling us the *customer* is missing, as opposed to any
 * other resource. The `param` check matters: `resource_missing` is also how
 * Stripe reports an unknown payment method or payment intent, and clearing the
 * customer id in those cases would discard a perfectly good record.
 */
export function isMissingCustomerError(err: unknown): boolean {
  const e = err as StripeLikeError | null;
  if (!e || typeof e !== "object") return false;
  if (e.code !== "resource_missing") return false;
  if (e.param === "customer") return true;
  // paymentMethods.list rejects with param unset but names the id in the message.
  return typeof e.message === "string" && /No such customer/i.test(e.message);
}

/**
 * Forget a customer id that Stripe no longer recognises. Never throws: this
 * runs inside error-recovery paths, where a failed cleanup must not replace the
 * original error with a less useful one.
 */
export async function forgetStaleStripeCustomer(
  userId: number,
  log?: { warn: (obj: object, msg: string) => void },
): Promise<void> {
  try {
    await db
      .update(usersTable)
      .set({ stripeCustomerId: null, defaultPaymentMethodId: null })
      .where(eq(usersTable.id, userId));
    log?.warn({ userId }, "stripe_customer_stale_cleared");
  } catch (err) {
    log?.warn({ userId, err: (err as Error).message }, "stripe_customer_stale_clear_failed");
  }
}
