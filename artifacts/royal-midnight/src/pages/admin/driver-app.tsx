import { useEffect, useState } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, Calendar, Users, Car, Map, DollarSign, Tag, MessageSquare, BarChart, Settings, Wallet, Smartphone, Gift, Building2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { API_BASE } from "@/lib/constants";

const adminNavItems = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Bookings", href: "/admin/bookings", icon: Calendar },
  { label: "Dispatch", href: "/admin/dispatch", icon: Map },
  { label: "Passengers", href: "/admin/passengers", icon: Users },
  { label: "Drivers", href: "/admin/drivers", icon: Users },
  { label: "Fleet", href: "/admin/fleet", icon: Car },
  { label: "Driver App", href: "/admin/driver-app", icon: Smartphone },
  { label: "Pricing", href: "/admin/pricing", icon: DollarSign },
  { label: "Extras & Routes", href: "/admin/extras", icon: Tag },
  { label: "Promos", href: "/admin/promos", icon: Tag },
  { label: "Affiliates", href: "/admin/affiliates", icon: Gift },
  { label: "Corporate Accounts", href: "/admin/corporate-accounts", icon: Building2 },
  { label: "Support", href: "/admin/support", icon: MessageSquare },
  { label: "Reports", href: "/admin/reports", icon: BarChart },
  { label: "Payouts", href: "/admin/payouts", icon: Wallet },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

const ANDROID_KEY = "driver_app_android_link";
const IOS_KEY = "driver_app_ios_link";

function getAuthHeader(): string {
  try {
    const raw = localStorage.getItem("rm_auth");
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { token?: string };
    return parsed.token ? `Bearer ${parsed.token}` : "";
  } catch {
    return "";
  }
}

function LinkCard({ title, value, onChange, onSave, saving }: {
  title: string; value: string; onChange: (v: string) => void; onSave: () => void; saving: boolean;
}) {
  return (
    <div className="border border-border bg-card p-6">
      <h2 className="font-serif text-lg mb-4">{title}</h2>
      {value ? (
        <div className="flex flex-col items-center mb-4">
          <div className="p-4 bg-[#0a0a0f]">
            <QRCodeSVG value={value} size={200} bgColor="#0a0a0f" fgColor="#c9a84c" />
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground mb-4">No link set yet.</p>
      )}
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://…"
          className="flex-1 bg-background border border-border px-3 py-2 text-sm"
        />
        <button
          onClick={onSave}
          disabled={saving}
          className="px-4 py-2 bg-primary text-primary-foreground text-xs uppercase tracking-wide disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

export default function AdminDriverApp() {
  const [androidUrl, setAndroidUrl] = useState("");
  const [iosUrl, setIosUrl] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/settings`, { headers: { Authorization: getAuthHeader() } });
        if (res.ok) {
          const data = await res.json() as Record<string, string>;
          setAndroidUrl(data[ANDROID_KEY] ?? "");
          setIosUrl(data[IOS_KEY] ?? "");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function saveKey(key: string, value: string) {
    setSavingKey(key);
    try {
      await fetch(`${API_BASE}/settings/${key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: getAuthHeader() },
        body: JSON.stringify({ value }),
      });
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <PortalLayout title="Royal Admin" navItems={adminNavItems}>
      <h1 className="font-serif text-3xl mb-2">Driver App</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Scan to install the Royal Midnight Driver app directly — not yet published to the App Store or Play Store.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
          <LinkCard
            title="Android"
            value={androidUrl}
            onChange={setAndroidUrl}
            onSave={() => saveKey(ANDROID_KEY, androidUrl)}
            saving={savingKey === ANDROID_KEY}
          />
          <LinkCard
            title="iOS (TestFlight)"
            value={iosUrl}
            onChange={setIosUrl}
            onSave={() => saveKey(IOS_KEY, iosUrl)}
            saving={savingKey === IOS_KEY}
          />
        </div>
      )}

      <div className="mt-8 max-w-3xl text-xs text-muted-foreground space-y-1">
        <p><strong className="text-foreground">Android:</strong> upload the latest .apk to Supabase Storage and paste its public URL above.</p>
        <p><strong className="text-foreground">iOS:</strong> paste the public TestFlight join link from App Store Connect (set up once, stays stable across builds).</p>
      </div>
    </PortalLayout>
  );
}
