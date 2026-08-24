import { eq, sql } from "drizzle-orm";
import { db, driversTable, driverVehiclesTable, vehiclesTable, vehicleCatalogTable } from "@workspace/db";

type Db = Pick<typeof db, "select" | "insert" | "update">;

export interface DriverVehicleInput {
  year?: string | null;
  make: string;
  model: string;
  color?: string | null;
  vehicleClass?: string | null;
  passengerCapacity?: number | null;
  luggageCapacity?: number | null;
  hasCarSeat?: boolean;
  regPlate?: string | null;
  isDefault?: boolean;
}

/**
 * Adds a vehicle for a driver and keeps every place a vehicle gets read from
 * in sync: the new per-driver driver_vehicles table (the driver's own
 * "My Vehicles" screen and a booking's selectedVehicleId), the legacy
 * vehicle_* columns on drivers ("My Profile" still reads these directly),
 * and vehicles (what admin Fleet reads). This is the exact logic
 * POST /drivers/:id/vehicles has always run, pulled out here so
 * driver-register can call it too — before this, registering with a vehicle
 * only ever wrote the drivers columns, leaving Fleet and "My Vehicles" empty
 * for every driver who signed up through the onboarding form.
 *
 * Accepts a plain db handle or a transaction — driver-register needs this
 * inside the same transaction that creates the account.
 */
export async function createDriverVehicle(
  dbOrTx: Db,
  driverId: number,
  input: DriverVehicleInput,
): Promise<typeof driverVehiclesTable.$inferSelect> {
  const {
    year, make, model, color, vehicleClass,
    passengerCapacity, luggageCapacity, hasCarSeat, regPlate, isDefault,
  } = input;

  if (isDefault) {
    await dbOrTx
      .update(driverVehiclesTable)
      .set({ isDefault: false })
      .where(eq(driverVehiclesTable.driverId, driverId));
  }

  const [vehicle] = await dbOrTx
    .insert(driverVehiclesTable)
    .values({
      driverId,
      year: year ?? null,
      make,
      model,
      color: color ?? null,
      vehicleClass: vehicleClass ?? null,
      passengerCapacity: passengerCapacity ?? null,
      luggageCapacity: luggageCapacity ?? null,
      hasCarSeat: hasCarSeat ?? false,
      regPlate: regPlate ?? null,
      isDefault: isDefault ?? false,
    })
    .returning();

  // Sync to drivers' legacy fields when this becomes the default vehicle
  if (isDefault) {
    await dbOrTx
      .update(driversTable)
      .set({
        vehicleMake: make,
        vehicleModel: model,
        vehicleYear: year ?? null,
        vehicleColor: color ?? null,
        vehicleClass: vehicleClass ?? null,
        passengerCapacity: passengerCapacity ?? null,
        luggageCapacity: luggageCapacity ?? null,
        hasCarSeat: hasCarSeat ?? false,
        regPlate: regPlate ?? null,
      })
      .where(eq(driversTable.id, driverId));
  }

  // Sync to vehicles (admin Fleet → Registered Vehicles) when a plate is given
  if (regPlate) {
    const yearInt = year ? parseInt(year, 10) : new Date().getFullYear();
    const capacity = typeof passengerCapacity === "number" ? passengerCapacity : 3;
    const vClass = vehicleClass ?? "standard";
    const existing = await dbOrTx
      .select({ id: vehiclesTable.id })
      .from(vehiclesTable)
      .where(eq(vehiclesTable.plate, regPlate));
    if (existing.length > 0) {
      await dbOrTx
        .update(vehiclesTable)
        .set({
          driverId,
          make,
          model,
          year: isNaN(yearInt) ? new Date().getFullYear() : yearInt,
          color: color ?? "Unknown",
          vehicleClass: vClass,
          capacity,
        })
        .where(eq(vehiclesTable.plate, regPlate));
    } else {
      await dbOrTx.insert(vehiclesTable).values({
        driverId,
        make,
        model,
        year: isNaN(yearInt) ? new Date().getFullYear() : yearInt,
        color: color ?? "Unknown",
        plate: regPlate,
        vehicleClass: vClass,
        capacity,
        isAvailable: true,
      });
    }
  }

  // If make+model isn't in the catalog yet, add a pending entry for admin to categorize
  const catalogMatch = await dbOrTx
    .select({ id: vehicleCatalogTable.id })
    .from(vehicleCatalogTable)
    .where(sql`LOWER(make) = LOWER(${make}) AND LOWER(model) = LOWER(${model})`);
  if (catalogMatch.length === 0) {
    await dbOrTx
      .insert(vehicleCatalogTable)
      .values({
        make,
        model,
        minYear: year ? (parseInt(year, 10) || new Date().getFullYear()) : new Date().getFullYear(),
        vehicleTypes: "",
        isActive: false,
        pendingReview: true,
        notes: `Submitted by driver #${driverId} — pending admin categorization`,
      })
      .catch(() => {});
  }

  return vehicle;
}
