-- Performance indexes: reduce query time on hot paths
-- Applied as part of the cache + performance optimization pass

-- Bookings: driver availability check (getDriverBusyWindows uses driver_id + status filter)
CREATE INDEX IF NOT EXISTS idx_bookings_driver_status
  ON bookings (driver_id, status)
  WHERE status IN ('confirmed', 'in_progress', 'on_way', 'on_location');

-- Bookings: dispatch board and admin list (status + pickup_at sort)
CREATE INDEX IF NOT EXISTS idx_bookings_status_pickup
  ON bookings (status, pickup_at);

-- Bookings: user booking history (GET /users/:id/bookings)
CREATE INDEX IF NOT EXISTS idx_bookings_user_id
  ON bookings (user_id);

-- Drivers: lookup by user_id (used on every authenticated driver request)
CREATE INDEX IF NOT EXISTS idx_drivers_user_id
  ON drivers (user_id);

-- Pricing rules: quote endpoint lookup by class + active flag
CREATE INDEX IF NOT EXISTS idx_pricing_rules_class_active
  ON pricing_rules (vehicle_class, is_active);

-- Geo zones: fetch all active zones for zone multiplier
CREATE INDEX IF NOT EXISTS idx_geo_zones_active
  ON geo_zones (is_active);

-- Promo codes: validation lookup by code + active flag
CREATE INDEX IF NOT EXISTS idx_promo_codes_code_active
  ON promo_codes (code, is_active);
