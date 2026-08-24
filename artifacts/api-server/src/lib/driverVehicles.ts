import { and, eq, sql } from "drizzle-orm";
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

/** Upserts admin Fleet's vehicles-by-plate record. Shared by createDriverVehicle
 *  and syncDriverVehicleFromLegacy since both know a vehicle only belongs in
 *  Fleet once it has a plate. */
export async function syncFleetVehicle(
  dbOrTx: Db,
  driverId: number,
  input: Pick<DriverVehicleInput, "year" | "make" | "model" | "color" | "vehicleClass" | "passengerCapacity" | "regPlate">,
): Promise<void> {
  const { year, make, model, color, vehicleClass, passengerCapacity, regPlate } = input;
  if (!regPlate) return;

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

/** Writes drivers' legacy vehicle_* columns from a driver_vehicles row. Shared
 *  by createDriverVehicle (new default vehicle) and the driver's own vehicle
 *  PATCH (editing/re-defaulting an existing one) — both need the legacy
 *  columns to track whichever vehicle is currently the default, since "My
 *  Profile" and the admin driver-detail page still read those directly. */
export async function syncLegacyDriverColumns(
  dbOrTx: Db,
  driverId: number,
  input: Pick<DriverVehicleInput, "year" | "make" | "model" | "color" | "vehicleClass" | "passengerCapacity" | "luggageCapacity" | "hasCarSeat" | "regPlate">,
): Promise<void> {
  const { year, make, model, color, vehicleClass, passengerCapacity, luggageCapacity, hasCarSeat, regPlate } = input;
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
    await syncLegacyDriverColumns(dbOrTx, driverId, {
      make, model, year: year ?? null, color: color ?? null, vehicleClass: vehicleClass ?? null,
      passengerCapacity: passengerCapacity ?? null, luggageCapacity: luggageCapacity ?? null,
      hasCarSeat: hasCarSeat ?? false, regPlate: regPlate ?? null,
    });
  }

  // Sync to vehicles (admin Fleet → Registered Vehicles) when a plate is given —
  // independent of isDefault, since a driver's non-default second car with a
  // plate still belongs in Fleet.
  await syncFleetVehicle(dbOrTx, driverId, { year, make, model, color, vehicleClass, passengerCapacity, regPlate });

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

/**
 * The admin "Edit driver" form (PATCH /admin/drivers/:id/details) only ever
 * wrote the legacy vehicle_* columns on drivers — it predates driver_vehicles
 * and was never taught about it. That left an admin-entered vehicle invisible
 * on the driver's own "My Vehicles" screen and in Fleet's Registered Vehicles
 * (both read driver_vehicles/vehicles, not the legacy columns), even though
 * the same data was plainly visible on the admin's own driver-detail page.
 * Call this after committing the legacy-column update so both stay in sync:
 * it updates the driver's default driver_vehicles row if one exists, creates
 * one if not (a driver with no vehicle yet who now has make+model from the
 * edit), and upserts Fleet's plate-keyed record the same way createDriverVehicle
 * does.
 */
export async function syncDriverVehicleFromLegacy(
  dbOrTx: Db,
  driverId: number,
  driver: {
    vehicleYear: string | null;
    vehicleMake: string | null;
    vehicleModel: string | null;
    vehicleColor: string | null;
    vehicleClass: string | null;
    passengerCapacity: number | null;
    luggageCapacity: number | null;
    hasCarSeat: boolean | null;
    regPlate: string | null;
  },
): Promise<void> {
  const fields = {
    year: driver.vehicleYear,
    make: driver.vehicleMake,
    model: driver.vehicleModel,
    color: driver.vehicleColor,
    vehicleClass: driver.vehicleClass,
    passengerCapacity: driver.passengerCapacity,
    luggageCapacity: driver.luggageCapacity,
    hasCarSeat: driver.hasCarSeat ?? false,
    regPlate: driver.regPlate,
  };

  const [existingDefault] = await dbOrTx
    .select({ id: driverVehiclesTable.id })
    .from(driverVehiclesTable)
    .where(and(eq(driverVehiclesTable.driverId, driverId), eq(driverVehiclesTable.isDefault, true)));

  if (existingDefault) {
    await dbOrTx.update(driverVehiclesTable).set(fields).where(eq(driverVehiclesTable.id, existingDefault.id));
  } else if (fields.make && fields.model) {
    // Nothing to make a default of yet if the edit didn't include make+model
    // (e.g. an admin only changed the license/insurance fields).
    await dbOrTx.insert(driverVehiclesTable).values({ ...fields, driverId, make: fields.make, model: fields.model, isDefault: true });
  } else {
    return;
  }

  // vehicles.make/model are NOT NULL, so Fleet can't take a record — with or
  // without a plate — unless the edit gave us both.
  if (fields.make && fields.model) {
    await syncFleetVehicle(dbOrTx, driverId, { ...fields, make: fields.make, model: fields.model });
  }
}
