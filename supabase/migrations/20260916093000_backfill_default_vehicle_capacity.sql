-- Older chauffeur profiles stored capacity on drivers before driver_vehicles
-- became the source of truth. Fill only missing fields on the default vehicle;
-- never overwrite a value the chauffeur or an administrator already selected.
UPDATE public.driver_vehicles AS vehicle
SET
  passenger_capacity = COALESCE(vehicle.passenger_capacity, driver.passenger_capacity),
  luggage_capacity = COALESCE(vehicle.luggage_capacity, driver.luggage_capacity)
FROM public.drivers AS driver
WHERE vehicle.driver_id = driver.id
  AND vehicle.is_default = true
  AND (
    (vehicle.passenger_capacity IS NULL AND driver.passenger_capacity IS NOT NULL)
    OR (vehicle.luggage_capacity IS NULL AND driver.luggage_capacity IS NOT NULL)
  );
