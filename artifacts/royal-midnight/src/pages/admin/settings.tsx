import { useState, useEffect } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { API_BASE } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Settings, LayoutDashboard, Calendar, Users, Car, Map, DollarSign, Tag, MessageSquare, BarChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const adminNavItems = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Bookings", href: "/admin/bookings", icon: Calendar },
  { label: "Dispatch", href: "/admin/dispatch", icon: Map },
  { label: "Passengers", href: "/admin/passengers", icon: Users },
  { label: "Drivers", href: "/admin/drivers", icon: Users },
  { label: "Fleet", href: "/admin/fleet", icon: Car },
  { label: "Pricing", href: "/admin/pricing", icon: DollarSign },
  { label: "Promos", href: "/admin/promos", icon: Tag },
  { label: "Support", href: "/admin/support", icon: MessageSquare },
  { label: "Reports", href: "/admin/reports", icon: BarChart },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

interface SettingField {
  key: string;
  label: string;
  description: string;
  suffix: string;
  min: number;
  max: number;
  step: number;
}

const SETTING_FIELDS: SettingField[] = [
  {
    key: "min_booking_hours",
    label: "Minimum Booking Lead Time",
    description: "Customers cannot book rides less than this many hours in advance (enforced in Eastern Time).",
    suffix: "hours",
    min: 0,
    max: 48,
    step: 0.5,
  },
  {
    key: "florida_tax_rate",
    label: "Florida Tax Rate",
    description: "Applied to all bookings as a percentage of the subtotal (base + distance + airport fee).",
    suffix: "%",
    min: 0,
    max: 20,
    step: 0.1,
  },
  {
    key: "driver_commission_pct",
    label: "Driver Commission Rate",
    description: "Percentage of the trip subtotal that goes to the driver. For example, 70 means the driver earns 70% and Royal Midnight retains 30%.",
    suffix: "%",
    min: 0,
    max: 100,
    step: 1,
  },
];

function AdminSettingsInner() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/admin/settings`)
      .then(r => r.json())
      .then((data: Record<string, string>) => {
        setSettings(data);
        // Convert stored values for display
        const displayed: Record<string, string> = {};
        for (const [k, v] of Object.entries(data)) {
          if (k === "florida_tax_rate") {
            displayed[k] = String(parseFloat(v) * 100);
          } else {
            displayed[k] = v;
          }
        }
        setEditValues(displayed);
      })
      .catch(() => toast({ title: "Error", description: "Could not load settings.", variant: "destructive" }))
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async (field: SettingField) => {
    const raw = editValues[field.key] ?? "";
    const numVal = parseFloat(raw);
    if (isNaN(numVal) || numVal < field.min || numVal > field.max) {
      toast({ title: "Invalid value", description: `${field.label} must be between ${field.min} and ${field.max}.`, variant: "destructive" });
      return;
    }

    // For tax rate, store as decimal (e.g. 7% → 0.07)
    const storedValue = field.key === "florida_tax_rate" ? String(numVal / 100) : String(numVal);

    setSaving(field.key);
    try {
      const res = await fetch(`${API_BASE}/admin/settings/${field.key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: storedValue }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSettings(prev => ({ ...prev, [field.key]: storedValue }));
      toast({ title: "Saved", description: `${field.label} updated successfully.` });
    } catch {
      toast({ title: "Error", description: "Could not save setting.", variant: "destructive" });
    }
    setSaving(null);
  };

  return (
    <PortalLayout title="Royal Admin" navItems={adminNavItems}>
      <div className="flex justify-between items-end mb-10">
        <div>
          <h1 className="font-serif text-3xl mb-1">System Settings</h1>
          <p className="text-muted-foreground text-sm">Configure booking rules and pricing parameters.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-6 max-w-2xl">
          {SETTING_FIELDS.map(field => {
            const currentDisplay = editValues[field.key] ?? "";
            const storedVal = settings[field.key];
            const displayedStored = field.key === "florida_tax_rate"
              ? `${(parseFloat(storedVal ?? "0.07") * 100).toFixed(1)}%`
              : `${storedVal ?? ""} ${field.suffix}`;

            return (
              <div key={field.key} className="bg-card border border-border rounded-lg p-6">
                <div className="mb-4">
                  <h3 className="font-medium text-foreground mb-1">{field.label}</h3>
                  <p className="text-sm text-muted-foreground">{field.description}</p>
                  <p className="text-xs text-primary mt-1">Current: <strong>{displayedStored}</strong></p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      type="number"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={currentDisplay}
                      onChange={e => setEditValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                      className="w-32"
                    />
                    <span className="text-sm text-muted-foreground">{field.suffix}</span>
                  </div>
                  <Button
                    onClick={() => handleSave(field)}
                    disabled={saving === field.key}
                    size="sm"
                    className="bg-primary text-black hover:bg-primary/90"
                  >
                    {saving === field.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" /> Save</>}
                  </Button>
                </div>
              </div>
            );
          })}

          <div className="bg-muted/30 border border-border rounded-lg p-5 text-sm text-muted-foreground">
            <strong className="text-foreground block mb-1">Booking Lead Time</strong>
            All pickup times are validated against Eastern Time (EST/EDT). Setting 2 hours means customers must book at least 2 hours before the desired pickup time.
          </div>
        </div>
      )}
    </PortalLayout>
  );
}

export default function AdminSettings() {
  return (
    <AuthGuard requiredRole="admin">
      <AdminSettingsInner />
    </AuthGuard>
  );
}
