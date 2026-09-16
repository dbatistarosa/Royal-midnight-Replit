import type Stripe from "stripe";

/**
 * Gives Stripe's Payment Element access to an authenticated passenger's saved
 * cards. A tracking token, administrator, or account delegate can still pay,
 * but must never receive another user's reusable payment methods.
 */
export async function createBookingCustomerSession(
  stripe: Pick<Stripe, "customerSessions">,
  input: {
    customerId?: string;
    paymentAccountUserId: number | null;
    callerUserId?: number;
  },
): Promise<string | null> {
  if (
    !input.customerId ||
    input.paymentAccountUserId == null ||
    input.callerUserId !== input.paymentAccountUserId
  ) return null;

  const session = await stripe.customerSessions.create({
    customer: input.customerId,
    components: {
      payment_element: {
        enabled: true,
        features: {
          payment_method_redisplay: "enabled",
          payment_method_allow_redisplay_filters: [
            "always",
            "limited",
            "unspecified",
          ],
          payment_method_redisplay_limit: 10,
          payment_method_save: "enabled",
          payment_method_save_usage: "off_session",
        },
      },
    },
  });
  return session.client_secret;
}
