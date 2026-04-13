import { useState } from "react";
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, format } from "date-fns";
import { CalendarIcon } from "lucide-react";

export type DateRange = { startDate: Date; endDate: Date };
export type PresetKey = "today" | "this_week" | "this_month" | "custom";

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "this_week", label: "This Week" },
  { key: "this_month", label: "This Month" },
  { key: "custom", label: "Custom Range" },
];

function getPresetRange(key: PresetKey): DateRange | null {
  const now = new Date();
  switch (key) {
    case "today":
      return { startDate: startOfDay(now), endDate: endOfDay(now) };
    case "this_week":
      return { startDate: startOfWeek(now, { weekStartsOn: 1 }), endDate: endOfWeek(now, { weekStartsOn: 1 }) };
    case "this_month":
      return { startDate: startOfMonth(now), endDate: endOfMonth(now) };
    default:
      return null;
  }
}

interface DateRangeFilterProps {
  value: DateRange | null;
  onChange: (range: DateRange | null) => void;
}

export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  const [activePreset, setActivePreset] = useState<PresetKey>("this_month");
  const [showCustom, setShowCustom] = useState(false);
  const [customStart, setCustomStart] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));

  const handlePreset = (key: PresetKey) => {
    setActivePreset(key);
    if (key === "custom") {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    const range = getPresetRange(key);
    onChange(range);
  };

  const handleCustomApply = () => {
    if (!customStart || !customEnd) return;
    onChange({
      startDate: startOfDay(new Date(customStart + "T00:00:00")),
      endDate: endOfDay(new Date(customEnd + "T00:00:00")),
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex border border-border rounded-none overflow-hidden">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => handlePreset(p.key)}
            className={`px-3 py-1.5 text-xs uppercase tracking-widest font-medium transition-colors ${
              activePreset === p.key
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground hover:bg-background"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {showCustom && (
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-muted-foreground" />
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="bg-card border border-border text-foreground text-sm px-2 py-1 rounded-none focus:outline-none focus:border-primary"
          />
          <span className="text-muted-foreground text-sm">–</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="bg-card border border-border text-foreground text-sm px-2 py-1 rounded-none focus:outline-none focus:border-primary"
          />
          <button
            onClick={handleCustomApply}
            className="px-3 py-1.5 text-xs uppercase tracking-widest font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Apply
          </button>
        </div>
      )}

      {value && (
        <span className="text-xs text-muted-foreground">
          {format(value.startDate, "MMM d, yyyy")} – {format(value.endDate, "MMM d, yyyy")}
        </span>
      )}
    </div>
  );
}
