import { useEffect, useState } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, Calendar, Users, Car, Map, DollarSign, Tag, MessageSquare, BarChart, Settings, Wallet, Smartphone, Gift, Building2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { API_BASE } from "@/lib/constants";
import { authHeaders, jsonAuthHeaders } from "@/lib/authHeaders";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { adminNavItems } from "@/config/portalNav";


const ANDROID_KEY = "driver_app_android_link";
const IOS_KEY = "driver_app_ios_link";

// The local getAuthHeader() that used to live here dug a `token` field out of
// the `rm_auth` localStorage blob — a field nothing has written since CN-014
// moved the session into an HttpOnly cookie. It returned "" on every call. The
// screen worked anyway, on the cookie alone, which is why nobody noticed.

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
  const { token } = useAuth();
  const { toast } = useToast();
  const [androidUrl, setAndroidUrl] = useState("");
  const [iosUrl, setIosUrl] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/settings`, { headers: authHeaders(token) });
        if (res.ok) {
          const data = await res.json() as Record<string, string>;
          setAndroidUrl(data[ANDROID_KEY] ?? "");
          setIosUrl(data[IOS_KEY] ?? "");
        }
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function saveKey(key: string, value: string) {
    setSavingKey(key);
    try {
      const res = await fetch(`${API_BASE}/settings/${key}`, {
        method: "PATCH",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ value }),
      });
      // The result of this call used to be discarded entirely: a rejected save
      // stopped the spinner and said nothing, so the admin walked away
      // believing the install link had been updated when it had not.
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? `Save failed (HTTP ${res.status}).`);
      }
      toast({ title: "Link saved" });
    } catch (err) {
      toast({
        title: "Could not save the link",
        description: err instanceof Error ? err.message : "Unexpected error.",
        variant: "destructive",
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
