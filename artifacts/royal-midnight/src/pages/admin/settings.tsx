import { useState, useEffect } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { API_BASE } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";
import { format } from "date-fns";
import { Loader2, Save, Settings, LayoutDashboard, Calendar, Users, Car, Map, DollarSign, Tag, MessageSquare, BarChart, UserPlus, CheckCircle2, Building2, Webhook, Mail, AlertTriangle, RefreshCw, Copy, ExternalLink } from "lucide-react";
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

  type WebhookStatus = {
    stripeConfigured: boolean;
    webhookSecretSet: boolean;
    isRegistered?: boolean;
    expectedUrl: string;
    webhooks: { id: string; url: string; status: string; isOurs: boolean }[];
    mailer: { configured: boolean; provider: string };
    error?: string;
  };
  const [webhookStatus, setWebhookStatus] = useState<WebhookStatus | null>(null);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [registeringWebhook, setRegisteringWebhook] = useState(false);
  const [webhookRegResult, setWebhookRegResult] = useState<{ signingSecret?: string; message: string; alreadyExists?: boolean } | null>(null);

  type EmailLog = { id: number; to: string; subject: string; type: string; status: string; error: string | null; sentAt: string };
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [emailLogsLoading, setEmailLogsLoading] = useState(false);
  const [showEmailLogs, setShowEmailLogs] = useState(false);
  const [testEmailTo, setTestEmailTo] = useState("");
  const [testEmailSending, setTestEmailSending] = useState(false);

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

  const loadWebhookStatus = async () => {
    setWebhookLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/stripe/webhook-status`, { headers: authHeader });
      const data = await res.json() as WebhookStatus;
      setWebhookStatus(data);
    } catch {
      toast({ title: "Error", description: "Could not load Stripe status.", variant: "destructive" });
    }
    setWebhookLoading(false);
  };

  const handleRegisterWebhook = async () => {
    setRegisteringWebhook(true);
    setWebhookRegResult(null);
    try {
      const res = await fetch(`${API_BASE}/admin/stripe/register-webhook`, { method: "POST", headers: authHeader });
      const data = await res.json() as { signingSecret?: string; message: string; alreadyExists?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setWebhookRegResult(data);
      void loadWebhookStatus();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not register webhook.", variant: "destructive" });
    }
    setRegisteringWebhook(false);
  };

  const loadEmailLogs = async () => {
    setEmailLogsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/email-logs?limit=100`, { headers: authHeader });
      const data = await res.json() as EmailLog[];
      setEmailLogs(data);
    } catch {
      toast({ title: "Error", description: "Could not load email logs.", variant: "destructive" });
    }
    setEmailLogsLoading(false);
    setShowEmailLogs(true);
  };

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
      {/* Stripe Webhook Setup */}
      <div className="mt-12">
        <div className="flex items-center gap-3 mb-6">
          <Webhook className="w-5 h-5 text-primary" />
          <h2 className="font-serif text-2xl">Stripe Integration</h2>
        </div>

        <div className="bg-card border border-border rounded-none p-7">
          <p className="text-sm text-muted-foreground mb-5">
            The Stripe webhook enables automatic booking confirmation after payment.
            Without it, bookings may stay stuck in "awaiting payment" even after successful payment.
          </p>

          {!webhookStatus ? (
            <Button
              onClick={() => void loadWebhookStatus()}
              disabled={webhookLoading}
              variant="outline"
              className="rounded-none text-xs uppercase tracking-widest border-white/20"
            >
              {webhookLoading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Loading...</> : <><RefreshCw className="w-4 h-4 mr-2" />Check Stripe Status</>}
            </Button>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white/5 border border-white/10 p-4">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Stripe Keys</p>
                  <p className={`text-sm font-medium ${webhookStatus.stripeConfigured ? "text-green-400" : "text-red-400"}`}>
                    {webhookStatus.stripeConfigured ? "Configured" : "Missing"}
                  </p>
                  {!webhookStatus.stripeConfigured && (
                    <p className="text-xs text-muted-foreground mt-1">Set STRIPE_SECRET_KEY env var</p>
                  )}
                </div>
                <div className="bg-white/5 border border-white/10 p-4">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Webhook Registered</p>
                  <p className={`text-sm font-medium ${webhookStatus.isRegistered ? "text-green-400" : "text-orange-400"}`}>
                    {webhookStatus.isRegistered ? "Active" : "Not registered"}
                  </p>
                </div>
                <div className="bg-white/5 border border-white/10 p-4">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Signing Secret</p>
                  <p className={`text-sm font-medium ${webhookStatus.webhookSecretSet ? "text-green-400" : "text-orange-400"}`}>
                    {webhookStatus.webhookSecretSet ? "Set" : "Missing — set STRIPE_WEBHOOK_SECRET"}
                  </p>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 p-4">
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Expected Webhook URL</p>
                <code className="text-xs text-primary break-all">{webhookStatus.expectedUrl}</code>
              </div>

              {!webhookStatus.isRegistered && webhookStatus.stripeConfigured && (
                <div className="flex items-start gap-3 bg-orange-400/5 border border-orange-400/20 p-4">
                  <AlertTriangle className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="text-orange-400 font-medium mb-1">Webhook not registered</p>
                    <p className="text-muted-foreground text-xs">Click the button below to automatically register the webhook in your Stripe dashboard.</p>
                  </div>
                </div>
              )}

              {webhookRegResult && (
                <div className={`border p-5 ${webhookRegResult.signingSecret ? "bg-green-400/5 border-green-400/20" : "bg-blue-400/5 border-blue-400/20"}`}>
                  <p className={`text-sm font-medium mb-1 ${webhookRegResult.signingSecret ? "text-green-400" : "text-blue-400"}`}>
                    {webhookRegResult.message}
                  </p>
                  {webhookRegResult.signingSecret && (
                    <div className="mt-3">
                      <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
                        Signing Secret — Copy and set as STRIPE_WEBHOOK_SECRET environment variable
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="text-xs text-primary bg-white/5 px-3 py-2 border border-white/10 break-all flex-1">
                          {webhookRegResult.signingSecret}
                        </code>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            void navigator.clipboard.writeText(webhookRegResult.signingSecret ?? "");
                            toast({ title: "Copied", description: "Signing secret copied to clipboard." });
                          }}
                          className="rounded-none border-white/20 shrink-0"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                {webhookStatus.stripeConfigured && !webhookStatus.isRegistered && (
                  <Button
                    onClick={() => void handleRegisterWebhook()}
                    disabled={registeringWebhook}
                    className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest"
                  >
                    {registeringWebhook ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Registering...</> : <><Webhook className="w-4 h-4 mr-2" />Register Webhook</>}
                  </Button>
                )}
                <Button
                  onClick={() => void loadWebhookStatus()}
                  disabled={webhookLoading}
                  variant="outline"
                  className="rounded-none text-xs uppercase tracking-widest border-white/20"
                >
                  {webhookLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  Refresh
                </Button>
                <a
                  href="https://dashboard.stripe.com/webhooks"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs uppercase tracking-widest border border-white/20 text-muted-foreground hover:text-white hover:border-white/40 px-4 py-2 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Stripe Dashboard
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Email Configuration & Logs */}
      <div className="mt-12 mb-12">
        <div className="flex items-center gap-3 mb-6">
          <Mail className="w-5 h-5 text-primary" />
          <h2 className="font-serif text-2xl">Email Configuration</h2>
        </div>

        <div className="bg-card border border-border rounded-none p-7 mb-6">
          <p className="text-sm text-muted-foreground mb-4">
            Royal Midnight sends transactional emails for booking confirmations, driver assignments, and notifications.
            Configure one of the following:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
            <div className="bg-white/5 border border-white/10 p-5">
              <p className="text-sm font-medium text-white mb-1">Option A — Resend (Recommended)</p>
              <p className="text-xs text-muted-foreground mb-3">Create a free account at resend.com and add your API key.</p>
              <code className="text-xs text-primary">RESEND_API_KEY=re_xxxx</code>
            </div>
            <div className="bg-white/5 border border-white/10 p-5">
              <p className="text-sm font-medium text-white mb-1">Option B — SMTP</p>
              <p className="text-xs text-muted-foreground mb-3">Works with Gmail, SendGrid, Mailgun, etc.</p>
              <div className="space-y-1">
                <code className="text-xs text-primary block">SMTP_HOST=smtp.gmail.com</code>
                <code className="text-xs text-primary block">SMTP_PORT=587</code>
                <code className="text-xs text-primary block">SMTP_USER=you@gmail.com</code>
                <code className="text-xs text-primary block">SMTP_PASS=app-password</code>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-6">
            Also set <code className="text-primary">SMTP_FROM</code> (display name + address, e.g. "Royal Midnight &lt;noreply@yourdomain.com&gt;")
            and <code className="text-primary">ADMIN_EMAIL</code> to receive admin notifications.
          </p>

          {/* Test Email Send */}
          <div className="border-t border-white/10 pt-5">
            <p className="text-sm font-medium text-white mb-3">Send Test Email</p>
            <div className="flex gap-3 items-start">
              <input
                type="email"
                value={testEmailTo}
                onChange={e => setTestEmailTo(e.target.value)}
                placeholder="recipient@example.com"
                className="flex-1 bg-white/5 border border-white/20 text-sm text-white placeholder:text-muted-foreground px-3 py-2 rounded-none outline-none focus:border-primary/60 transition-colors"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  if (!testEmailTo) return;
                  setTestEmailSending(true);
                  try {
                    const r = await fetch(`${API_BASE}/admin/email/test-send`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", ...authHeader },
                      body: JSON.stringify({ to: testEmailTo }),
                    });
                    const data = await r.json() as { message?: string; error?: string };
                    if (r.ok) {
                      toast({ title: "Test email sent", description: data.message ?? "Check your inbox." });
                    } else {
                      toast({ title: "Failed", description: data.error ?? "Could not send test email.", variant: "destructive" });
                    }
                  } catch {
                    toast({ title: "Error", description: "Network error sending test email.", variant: "destructive" });
                  } finally {
                    setTestEmailSending(false);
                  }
                }}
                disabled={testEmailSending || !testEmailTo}
                className="rounded-none text-xs uppercase tracking-widest border-white/20 whitespace-nowrap"
              >
                {testEmailSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Send Test"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Sends a sample booking confirmation to verify your email provider is working.</p>
          </div>
        </div>

        {/* Email Audit Log */}
        <div className="bg-card border border-border rounded-none overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">Email Audit Log</h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (showEmailLogs) {
                  setShowEmailLogs(false);
                } else {
                  void loadEmailLogs();
                }
              }}
              disabled={emailLogsLoading}
              className="rounded-none text-xs uppercase tracking-widest border-white/20"
            >
              {emailLogsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : showEmailLogs ? "Hide" : "View Logs"}
            </Button>
          </div>

          {showEmailLogs && (
            emailLogs.length === 0 ? (
              <div className="px-6 py-8 text-center text-muted-foreground text-sm">No email logs yet.</div>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm text-left min-w-[640px]">
                  <thead className="bg-background/50 border-b border-border sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-xs text-muted-foreground font-medium uppercase tracking-widest">Date</th>
                      <th className="px-4 py-3 text-xs text-muted-foreground font-medium uppercase tracking-widest">To</th>
                      <th className="px-4 py-3 text-xs text-muted-foreground font-medium uppercase tracking-widest">Type</th>
                      <th className="px-4 py-3 text-xs text-muted-foreground font-medium uppercase tracking-widest">Status</th>
                      <th className="px-4 py-3 text-xs text-muted-foreground font-medium uppercase tracking-widest">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {emailLogs.map(log => (
                      <tr key={log.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(log.sentAt), "MMM d, HH:mm")}
                        </td>
                        <td className="px-4 py-3 text-xs truncate max-w-[180px]">{log.to}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{log.type.replace(/_/g, " ")}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 border uppercase tracking-widest ${
                            log.status === "sent" ? "text-green-400 border-green-400/20 bg-green-400/10" :
                            log.status === "failed" ? "text-red-400 border-red-400/20 bg-red-400/10" :
                            "text-orange-400 border-orange-400/20 bg-orange-400/10"
                          }`}>{log.status}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[200px]">
                          {log.error ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
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
