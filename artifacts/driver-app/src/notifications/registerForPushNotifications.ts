// Push notifications are temporarily disabled: expo-notifications pulls in
// Firebase Cloud Messaging on Android, which crashes on launch without a
// configured Firebase project (no google-services.json exists yet). In-app
// notifications (the /notifications screen, backed by the API) and email
// still work. Re-add expo-notifications + this file's real implementation
// once Firebase is set up for com.royalmidnight.driver.
export async function registerForPushNotifications(_driverId: number): Promise<void> {}
