/**
 * Cache keys shared across route files — anything read in one file and
 * invalidated in another (vehicle-catalog is written from both admin.ts and
 * drivers.ts) lives here so the two sides can't drift out of sync with a
 * typo'd literal.
 */
export const VEHICLE_CATALOG_CACHE_KEY = "vehicle-catalog";
