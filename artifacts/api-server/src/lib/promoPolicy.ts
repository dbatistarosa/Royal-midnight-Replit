export function promoPerCustomerLimitMessage(input: {
  maxUsesPerUser: number | null | undefined;
  userId: number | null | undefined;
  usedByUser: number;
}): string | null {
  const limit = input.maxUsesPerUser ?? null;
  if (limit == null || limit <= 0) return null;
  if (input.userId == null) {
    return "Sign in to use this promo code — it is limited per customer.";
  }
  if (input.usedByUser < limit) return null;
  return limit === 1
    ? "You have already used this promo code."
    : `You have already used this promo code ${limit} times.`;
}
