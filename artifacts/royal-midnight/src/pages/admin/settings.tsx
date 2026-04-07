import { useState, useEffect } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { API_BASE } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";
import { format } from "date-fns";
import { Loader2, Save, Settings, LayoutDashboard, Calendar, Users, Car, Map, DollarSign, Tag, MessageSquare, BarChart, UserPlus, CheckCircle2, Building2 } from "lucide-react";
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

type AdminForm = { name: string; email: string; password: string; confirmPassword: string; phone: string };
const EMPTY_ADMIN: AdminForm = { name: "", email: "", password: "", confirmPassword: "", phone: "" };

type CorporateForm = { companyName: string; contactName: string; email: string; password: string; confirmPassword: string; phone: string };
const EMPTY_CORP: CorporateForm = { companyName: "", contactName: "", email: "", password: "", confirmPassword: "", phone: "" };

type CorporateAccount = { id: number; name: string; email: string; phone: string | null; createdAt: string };

function AdminSettingsInner() {
  const { toast } = useToast();
  const { token } = useAuth();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [adminForm, setAdminForm] = useState<AdminForm>(EMPTY_ADMIN);
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminCreated, setAdminCreated] = useState<{ email: string; name: string } | null>(null);
  const [corporateForm, setCorporateForm] = useState<CorporateForm>(EMPTY_CORP);
  const [corporateSaving, setCorporateSaving] = useState(false);
  const [corporateCreated, setCorporateCreated] = useState<{ email: string; companyName: string } | null>(null);
  const [corporateAccounts, setCorporateAccounts] = useState<CorporateAccount[]>([]);
  const [corporateLoading, setCorporateLoading] = useState(true);

  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  useEffect(() => {
    fetch(`${API_BASE}/admin/settings`, { headers: authHeader })
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/auth/corporate-accounts`, { headers: authHeader })
      .then(r => r.ok ? r.json() as Promise<CorporateAccount[]> : Promise.reject())
      .then(data => setCorporateAccounts(data))
      .catch(() => setCorporateAccounts([]))
      .finally(() => setCorporateLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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
        headers: { "Content-Type": "application/json", ...authHeader },
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

  const handleCreateAdmin = async () => {
    if (!adminForm.name || !adminForm.email || !adminForm.password) {
      toast({ title: "Missing fields", description: "Name, email, and password are required.", variant: "destructive" });
      return;
    }
    if (adminForm.password !== adminForm.confirmPassword) {
      toast({ title: "Passwords do not match", description: "Please re-enter matching passwords.", variant: "destructive" });
      return;
    }
    if (adminForm.password.length < 8) {
      toast({ title: "Password too short", description: "Password must be at least 8 characters.", variant: "destructive" });
      return;
    }
    setAdminSaving(true);
    try {
      const res = await fetch(`${API_BASE}/auth/admin-register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ name: adminForm.name, email: adminForm.email, password: adminForm.password, phone: adminForm.phone || null }),
      });
      if (!res.ok) { const e = await res.json() as { error?: string }; throw new Error(e.error ?? "Failed"); }
      setAdminCreated({ name: adminForm.name, email: adminForm.email });
      setAdminForm(EMPTY_ADMIN);
      toast({ title: "Admin account created", description: `${adminForm.name} can now sign in.` });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not create admin.", variant: "destructive" });
    }
    setAdminSaving(false);
  };

  const handleCreateCorporate = async () => {
    if (!corporateForm.companyName || !corporateForm.contactName || !corporateForm.email || !corporateForm.password) {
      toast({ title: "Missing fields", description: "Company name, contact name, email, and password are required.", variant: "destructive" });
      return;
    }
    if (corporateForm.password !== corporateForm.confirmPassword) {
      toast({ title: "Passwords do not match", description: "Please re-enter matching passwords.", variant: "destructive" });
      return;
    }
    if (corporateForm.password.length < 8) {
      toast({ title: "Password too short", description: "Password must be at least 8 characters.", variant: "destructive" });
      return;
    }
    setCorporateSaving(true);
    try {
      const res = await fetch(`${API_BASE}/auth/corporate-register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({
          companyName: corporateForm.companyName,
          contactName: corporateForm.contactName,
          email: corporateForm.email,
          password: corporateForm.password,
          phone: corporateForm.phone || null,
        }),
      });
      if (!res.ok) { const e = await res.json() as { error?: string }; throw new Error(e.error ?? "Failed"); }
      const created = await res.json() as { user: CorporateAccount };
      setCorporateCreated({ email: corporateForm.email, companyName: corporateForm.companyName });
      setCorporateAccounts(prev => [...prev, created.user]);
      setCorporateForm(EMPTY_CORP);
      toast({ title: "Corporate account created", description: `${corporateForm.companyName} can now sign in.` });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not create account.", variant: "destructive" });
    }
    setCorporateSaving(false);
  };

  return (
    <PortalLayout title="Royal Admin" navItems={adminNavItems}>
      <div className="flex justify-between items-end mb-8 sm:mb-10">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl mb-1">System Settings</h1>
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

      {/* Create Admin Account Section */}
      <div className="mt-12">
        <div className="flex items-center gap-3 mb-6">
          <UserPlus className="w-5 h-5 text-primary" />
          <h2 className="font-serif text-2xl">Create Admin Account</h2>
        </div>

        {adminCreated && (
          <div className="bg-green-400/10 border border-green-400/20 rounded-none p-5 mb-6 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
            <div className="text-sm">
              <strong className="text-green-400">{adminCreated.name}</strong>
              <span className="text-muted-foreground"> ({adminCreated.email}) can now sign in to the admin portal.</span>
            </div>
            <button onClick={() => setAdminCreated(null)} className="ml-auto text-muted-foreground hover:text-white text-xs uppercase tracking-widest">Dismiss</button>
          </div>
        )}

        <div className="bg-card border border-border rounded-none p-7">
          <p className="text-sm text-muted-foreground mb-6">Admin accounts have full access to this portal, including booking management, driver oversight, and settings changes.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label className="text-gray-400 uppercase tracking-widest text-xs block mb-1.5">Full Name *</Label>
              <Input
                value={adminForm.name}
                onChange={e => setAdminForm(p => ({ ...p, name: e.target.value }))}
                className="bg-white/5 border-white/10 text-white rounded-none h-10 text-sm"
                placeholder="Sarah Martinez"
              />
            </div>
            <div>
              <Label className="text-gray-400 uppercase tracking-widest text-xs block mb-1.5">Email Address *</Label>
              <Input
                type="email"
                value={adminForm.email}
                onChange={e => setAdminForm(p => ({ ...p, email: e.target.value }))}
                className="bg-white/5 border-white/10 text-white rounded-none h-10 text-sm"
                placeholder="sarah@royalmidnight.com"
              />
            </div>
            <div>
              <Label className="text-gray-400 uppercase tracking-widest text-xs block mb-1.5">Phone (Optional)</Label>
              <Input
                value={adminForm.phone}
                onChange={e => setAdminForm(p => ({ ...p, phone: e.target.value }))}
                className="bg-white/5 border-white/10 text-white rounded-none h-10 text-sm"
                placeholder="+1 (305) 555-0000"
              />
            </div>
            <div />
            <div>
              <Label className="text-gray-400 uppercase tracking-widest text-xs block mb-1.5">Password *</Label>
              <Input
                type="password"
                value={adminForm.password}
                onChange={e => setAdminForm(p => ({ ...p, password: e.target.value }))}
                className="bg-white/5 border-white/10 text-white rounded-none h-10 text-sm"
                placeholder="Min. 8 characters"
              />
            </div>
            <div>
              <Label className="text-gray-400 uppercase tracking-widest text-xs block mb-1.5">Confirm Password *</Label>
              <Input
                type="password"
                value={adminForm.confirmPassword}
                onChange={e => setAdminForm(p => ({ ...p, confirmPassword: e.target.value }))}
                className="bg-white/5 border-white/10 text-white rounded-none h-10 text-sm"
                placeholder="Repeat password"
              />
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <Button
              onClick={handleCreateAdmin}
              disabled={adminSaving}
              className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest px-8 h-10"
            >
              {adminSaving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Creating...</> : <><UserPlus className="w-4 h-4 mr-2" />Create Admin</>}
            </Button>
          </div>
        </div>
      </div>

      {/* Corporate Accounts Section */}
      <div className="mt-12">
        <div className="flex items-center gap-3 mb-6">
          <Building2 className="w-5 h-5 text-primary" />
          <h2 className="font-serif text-2xl">Corporate Accounts</h2>
        </div>

        {corporateCreated && (
          <div className="bg-green-400/10 border border-green-400/20 rounded-none p-5 mb-6 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
            <div className="text-sm">
              <strong className="text-green-400">{corporateCreated.companyName}</strong>
              <span className="text-muted-foreground"> ({corporateCreated.email}) can now sign in to the corporate portal.</span>
            </div>
            <button onClick={() => setCorporateCreated(null)} className="ml-auto text-muted-foreground hover:text-white text-xs uppercase tracking-widest">Dismiss</button>
          </div>
        )}

        <div className="bg-card border border-border rounded-none p-7 mb-6">
          <p className="text-sm text-muted-foreground mb-6">Create a portal login for a hotel, law firm, or business. Corporate accounts can book trips on behalf of their clients without payment at time of booking.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label className="text-gray-400 uppercase tracking-widest text-xs block mb-1.5">Company Name *</Label>
              <Input
                value={corporateForm.companyName}
                onChange={e => setCorporateForm(p => ({ ...p, companyName: e.target.value }))}
                className="bg-white/5 border-white/10 text-white rounded-none h-10 text-sm"
                placeholder="Acme Hotels"
              />
            </div>
            <div>
              <Label className="text-gray-400 uppercase tracking-widest text-xs block mb-1.5">Contact Name *</Label>
              <Input
                value={corporateForm.contactName}
                onChange={e => setCorporateForm(p => ({ ...p, contactName: e.target.value }))}
                className="bg-white/5 border-white/10 text-white rounded-none h-10 text-sm"
                placeholder="Concierge Manager"
              />
            </div>
            <div>
              <Label className="text-gray-400 uppercase tracking-widest text-xs block mb-1.5">Email Address *</Label>
              <Input
                type="email"
                value={corporateForm.email}
                onChange={e => setCorporateForm(p => ({ ...p, email: e.target.value }))}
                className="bg-white/5 border-white/10 text-white rounded-none h-10 text-sm"
                placeholder="concierge@acmehotels.com"
              />
            </div>
            <div>
              <Label className="text-gray-400 uppercase tracking-widest text-xs block mb-1.5">Phone (Optional)</Label>
              <Input
                value={corporateForm.phone}
                onChange={e => setCorporateForm(p => ({ ...p, phone: e.target.value }))}
                className="bg-white/5 border-white/10 text-white rounded-none h-10 text-sm"
                placeholder="+1 (305) 555-0000"
              />
            </div>
            <div>
              <Label className="text-gray-400 uppercase tracking-widest text-xs block mb-1.5">Password *</Label>
              <Input
                type="password"
                value={corporateForm.password}
                onChange={e => setCorporateForm(p => ({ ...p, password: e.target.value }))}
                className="bg-white/5 border-white/10 text-white rounded-none h-10 text-sm"
                placeholder="Min. 8 characters"
              />
            </div>
            <div>
              <Label className="text-gray-400 uppercase tracking-widest text-xs block mb-1.5">Confirm Password *</Label>
              <Input
                type="password"
                value={corporateForm.confirmPassword}
                onChange={e => setCorporateForm(p => ({ ...p, confirmPassword: e.target.value }))}
                className="bg-white/5 border-white/10 text-white rounded-none h-10 text-sm"
                placeholder="Repeat password"
              />
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <Button
              onClick={() => void handleCreateCorporate()}
              disabled={corporateSaving}
              className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest px-8 h-10"
            >
              {corporateSaving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Creating...</> : <><Building2 className="w-4 h-4 mr-2" />Create Corporate Account</>}
            </Button>
          </div>
        </div>

        {/* List existing corporate accounts */}
        <div className="bg-card border border-border rounded-none overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">Existing Corporate Accounts</h3>
          </div>
          {corporateLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            </div>
          ) : corporateAccounts.length === 0 ? (
            <div className="px-6 py-8 text-center text-muted-foreground text-sm">No corporate accounts created yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left min-w-[400px]">
                <thead className="bg-background/50 border-b border-border">
                  <tr>
                    <th className="px-5 py-3 text-xs text-muted-foreground font-medium uppercase tracking-widest">Company / Contact</th>
                    <th className="px-5 py-3 text-xs text-muted-foreground font-medium uppercase tracking-widest">Email</th>
                    <th className="px-5 py-3 text-xs text-muted-foreground font-medium uppercase tracking-widest">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {corporateAccounts.map(acct => {
                    const [company, contact] = acct.name.split(" — ");
                    return (
                      <tr key={acct.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-5 py-3">
                          <div className="font-medium">{company}</div>
                          {contact && <div className="text-xs text-muted-foreground">{contact}</div>}
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">{acct.email}</td>
                        <td className="px-5 py-3 text-muted-foreground whitespace-nowrap">{format(new Date(acct.createdAt), "MMM d, yyyy")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
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
