export function digitsOnly(value: string, maxLength?: number): string {
  const digits = value.replace(/\D/g, "");
  return maxLength == null ? digits : digits.slice(0, maxLength);
}

export function validatePayoutSecrets(input: { ssn?: string; routingNumber?: string; accountNumber?: string }): string | null {
  if (input.ssn && digitsOnly(input.ssn).length !== 9) return "A Tax ID / SSN must contain 9 digits.";
  if (input.routingNumber && digitsOnly(input.routingNumber).length !== 9) return "A routing number must contain 9 digits.";
  if (input.accountNumber && digitsOnly(input.accountNumber).length < 4) return "The account number looks too short.";
  return null;
}
