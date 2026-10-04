import { usersTable } from "@workspace/db";

/**
 * Serialize the fields that are safe for user-facing user responses.
 *
 * Keep this as an allowlist. The database row also contains password hashes,
 * Stripe identifiers, VIP notes and other operational fields that must never
 * cross an API boundary by accident.
 */
export function serializeUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    cabinTempF: user.cabinTempF,
    musicPreference: user.musicPreference,
    quietRide: user.quietRide,
    preferredBeverage: user.preferredBeverage,
    opensOwnDoor: user.opensOwnDoor,
    addressTitle: user.addressTitle,
  };
}
