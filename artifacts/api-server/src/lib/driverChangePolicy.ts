/**
 * Driver-owned vehicle details are editable only during the renewal window.
 * The date is compared as a calendar date so timezone differences cannot turn
 * a document that expires today into an invalid edit window.
 */
export function vehicleEditDaysRemaining(
  expiry: string | null | undefined,
  today = new Date(),
): number | null {
  if (!expiry) return null;
  const expiryDate = new Date(`${expiry}T00:00:00Z`);
  if (Number.isNaN(expiryDate.getTime())) return null;
  const current = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return Math.floor((expiryDate.getTime() - current.getTime()) / 86_400_000);
}

export function canDriverEditVehicle(
  expiry: string | null | undefined,
  today = new Date(),
): boolean {
  const daysRemaining = vehicleEditDaysRemaining(expiry, today);
  return daysRemaining != null && daysRemaining >= 0 && daysRemaining <= 30;
}

export function vehicleEditDenialMessage(expiry: string | null | undefined): string {
  if (!expiry) return "Vehicle changes require an administrator approval request.";
  return "Vehicle changes can be requested only during the 30-day renewal window before expiration.";
}
