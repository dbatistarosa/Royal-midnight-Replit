import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import type { DriverBooking } from "@/api/types";
import { Card } from "@/components/Card";

export function CharterTimer({ booking, graceMinutes = 20 }: { booking: DriverBooking; graceMinutes?: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (booking.status !== "in_progress" || !booking.tripStartedAt) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [booking.status, booking.tripStartedAt]);
  const elapsedMinutes = useMemo(() => booking.tripStartedAt ? Math.max(0, (now - Date.parse(booking.tripStartedAt)) / 60_000) : 0, [booking.tripStartedAt, now]);
  if (booking.charterMode !== "hourly" || booking.status !== "in_progress" || !booking.tripStartedAt) return null;
  const contractedMinutes = (booking.charterHours ?? 0) * 60;
  const overageMinutes = Math.max(0, elapsedMinutes - contractedMinutes - graceMinutes);
  return <Card className="mb-4"><Text className="text-[11px] uppercase text-muted mb-2">Charter Time</Text><View className="flex-row justify-between"><Text className="text-white text-sm">Elapsed {Math.floor(elapsedMinutes / 60)}h {Math.floor(elapsedMinutes % 60)}m</Text><Text className={overageMinutes > 0 ? "text-danger text-sm" : "text-success text-sm"}>{overageMinutes > 0 ? `${Math.ceil(overageMinutes)} min over` : "Within grace"}</Text></View><Text className="text-muted text-xs mt-2">Includes {graceMinutes} minutes of grace; overage is billed by full hour.</Text></Card>;
}
