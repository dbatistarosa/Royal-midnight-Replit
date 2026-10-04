export interface OnlineTransitionDependencies {
  startLocation: () => Promise<boolean>;
  stopLocation: () => Promise<void>;
  setStatus: (status: "available") => Promise<void>;
}

/**
 * Starts location sharing only as a provisional step. If the server refuses
 * the online transition, tracking is immediately rolled back so local and
 * server availability cannot silently diverge.
 */
export async function applyOnlineTransition({
  startLocation,
  stopLocation,
  setStatus,
}: OnlineTransitionDependencies): Promise<boolean> {
  const started = await startLocation();
  if (!started) return false;

  try {
    await setStatus("available");
    return true;
  } catch (error) {
    await stopLocation().catch(() => {});
    throw error;
  }
}
