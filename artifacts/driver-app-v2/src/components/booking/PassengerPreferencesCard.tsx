import { Text } from "react-native";
import { Card } from "@/components/Card";
import type { PassengerPreferences } from "@/api/types";
import { formatPassengerPreferenceRows } from "@/domain/passengerPreferences";

export function PassengerPreferencesCard({ preferences }: { preferences?: PassengerPreferences | null }) {
  const rows = formatPassengerPreferenceRows(preferences);
  if (!rows.length) return null;
  return <Card className="mb-4"><Text className="text-[11px] uppercase text-muted mb-2">Passenger Preferences</Text>{rows.map((row) => <Text key={row} className="text-white text-sm mb-1">{row}</Text>)}</Card>;
}
