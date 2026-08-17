import { useState, useEffect, useCallback } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { Loader2, Wallet, ShieldCheck, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useDriverStatus } from "@/contexts/driverStatus";
import { useAuth } from "@/contexts/auth";
import { API_BASE } from "@/lib/constants";
import { authHeaders, jsonAuthHeaders } from "@/lib/authHeaders";
import { driverNavItems } from "@/config/portalNav";

/**
 * Where a chauffeur enters their own payout details.
 *
 * GET/PATCH /drivers/:id/payout have existed the whole time and are already
 * scoped to the driver's own record, but nothing in the portal ever linked to
 * them — so the only way banking information could be entered was for an
 * administrator to type it on the driver's behalf from the Payouts board.
 *
 * The three secrets (SSN, routing, account) are write-only by design: the
 * server returns last-four masks and never the values, so an empty field here
 * means "leave what is stored alone" rather than "clear it". That is why the
 * inputs start blank even when a value exists.
 */

type PayoutInfo = {
  payoutLegalName: string;
  payoutEmail: string;
  payoutBankName: string;
  hasSsn: boolean;
  ssnLast4: string | null;
  hasRoutingNumber: boolean;
  routingLast4: string | null;
  hasAccountNumber: boolean;
  accountLast4: string | null;
};

const labelClass = "text-gray-400 uppercase tracking-widest text-xs block mb-1.5";
const inputClass = "bg-white/5 border-white/10 text-white rounded-none h-11";

function StoredHint({ has, last4, noun }: { has: boolean; last4: string | null; noun: string }) {
  if (!has) {
    return <p className="text-xs text-muted-foreground mt-1.5">No {noun} on file yet.</p>;
  }
  return (
    <p className="text-xs text-emerald-400/80 mt-1.5 flex items-center gap-1.5">
      <CheckCircle2 className="w-3 h-3" />
      {last4 ? `Ending in ${last4}` : "On file"} · leave blank to keep it unchanged
    </p>
  );
}

export default function DriverPayout() {
  const { driverRecord, isLoading: driverLoading } = useDriverStatus();
  const { token } = useAuth();
  const { toast } = useToast();

  const [info, setInfo] = useState<PayoutInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [legalName, setLegalName] = useState("");
  const [payoutEmail, setPayoutEmail] = useState("");
  const [bankName, setBankName] = useState("");
  const [ssn, setSsn] = useState("");
  const [routingNumber, setRoutingNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");

  const driverId = driverRecord?.id;

  const load = useCallback(() => {
    if (!driverId) return;
    setLoading(true);
    fetch(`${API_BASE}/drivers/${driverId}/payout`, { headers: authHeaders(token) })
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => null) as { error?: string } | null;
          throw new Error(body?.error || "Could not load your payout details.");
        }
        return r.json() as Promise<PayoutInfo>;
      })
      .then(data => {
        setInfo(data);
        setLegalName(data.payoutLegalName ?? "");
        setPayoutEmail(data.payoutEmail ?? "");
        setBankName(data.payoutBankName ?? "");
      })
      .catch((err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [driverId, token, toast]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!driverId) return;

    // Checked here as well as on the server so a mistyped routing number is
    // caught before it costs a round trip — the server remains the authority.
    const digits = (s: string) => s.replace(/\D/g, "");
    if (routingNumber && digits(routingNumber).length !== 9) {
      toast({ title: "Check the routing number", description: "A routing number is exactly 9 digits.", variant: "destructive" });
      return;
    }
    if (ssn && digits(ssn).length !== 9) {
      toast({ title: "Check the SSN", description: "An SSN is exactly 9 digits.", variant: "destructive" });
      return;
    }
    if (accountNumber && digits(accountNumber).length < 4) {
      toast({ title: "Check the account number", description: "That account number looks too short.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      // Only the secrets that were actually typed are sent. Sending an empty
      // string would be indistinguishable from "clear this field".
      const body: Record<string, string> = {
        payoutLegalName: legalName,
        payoutEmail: payoutEmail,
        payoutBankName: bankName,
      };
      if (ssn) body.payoutSsn = ssn;
      if (routingNumber) body.payoutRoutingNumber = routingNumber;
      if (accountNumber) body.payoutAccountNumber = accountNumber;

      const res = await fetch(`${API_BASE}/drivers/${driverId}/payout`, {
        method: "PATCH",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(errBody?.error || `Save failed (HTTP ${res.status}).`);
      }
      const updated = await res.json() as PayoutInfo;
      setInfo(updated);
      // Clear the write-only fields so the masks below become the source of truth.
      setSsn("");
      setRoutingNumber("");
      setAccountNumber("");
      toast({ title: "Payout details saved", description: "Your banking information has been updated." });
    } catch (err) {
      toast({
        title: "Could not save payout details",
        description: err instanceof Error ? err.message : "Unexpected error.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (driverLoading || loading) {
    return (
      <PortalLayout title="Driver Portal" navItems={driverNavItems}>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </PortalLayout>
    );
  }

  if (!driverRecord) {
    return (
      <PortalLayout title="Driver Portal" navItems={driverNavItems}>
        <div className="py-20 text-center text-muted-foreground">
          No driver profile found for this account.
        </div>
      </PortalLayout>
    );
  }

  const complete = !!(info?.payoutBankName && info?.hasRoutingNumber && info?.hasAccountNumber);

  return (
    <PortalLayout title="Driver Portal" navItems={driverNavItems}>
      <div className="mb-6">
        <h1 className="font-serif text-2xl sm:text-3xl flex items-center gap-2">
          <Wallet className="w-6 h-6 text-primary" /> Payout Details
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Where your weekly earnings are sent. Payouts run every Monday.
        </p>
      </div>

      {!complete && (
        <div className="mb-6 border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            Your banking details are incomplete. We cannot send your earnings until the bank name,
            routing number and account number are all on file.
          </span>
        </div>
      )}

      <div className="max-w-2xl space-y-6">
        <div className="bg-card border border-border p-6">
          <h2 className="text-sm uppercase tracking-widest text-primary mb-4">Payee</h2>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Legal Name (as it appears on your bank account)</label>
              <Input value={legalName} onChange={e => setLegalName(e.target.value)} className={inputClass} placeholder="Full legal name" />
            </div>
            <div>
              <label className={labelClass}>Payout Email</label>
              <Input
                type="email"
                value={payoutEmail}
                onChange={e => setPayoutEmail(e.target.value)}
                className={inputClass}
                placeholder="Where your earnings statement is sent"
              />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border p-6">
          <h2 className="text-sm uppercase tracking-widest text-primary mb-1 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Bank Account
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            These values are encrypted before they are stored, and are never shown back to you in full.
          </p>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Bank Name</label>
              <Input value={bankName} onChange={e => setBankName(e.target.value)} className={inputClass} placeholder="e.g. Chase, Bank of America" />
            </div>
            <div>
              <label className={labelClass}>Routing Number</label>
              <Input
                inputMode="numeric"
                autoComplete="off"
                value={routingNumber}
                onChange={e => setRoutingNumber(e.target.value.replace(/\D/g, "").slice(0, 9))}
                className={inputClass}
                placeholder="9 digits"
              />
              <StoredHint has={!!info?.hasRoutingNumber} last4={info?.routingLast4 ?? null} noun="routing number" />
            </div>
            <div>
              <label className={labelClass}>Account Number</label>
              <Input
                inputMode="numeric"
                autoComplete="off"
                value={accountNumber}
                onChange={e => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 20))}
                className={inputClass}
                placeholder="Your account number"
              />
              <StoredHint has={!!info?.hasAccountNumber} last4={info?.accountLast4 ?? null} noun="account number" />
            </div>
            <div>
              <label className={labelClass}>SSN / Tax ID</label>
              <Input
                inputMode="numeric"
                autoComplete="off"
                value={ssn}
                onChange={e => setSsn(e.target.value.replace(/\D/g, "").slice(0, 9))}
                className={inputClass}
                placeholder="9 digits — required for your 1099"
              />
              <StoredHint has={!!info?.hasSsn} last4={info?.ssnLast4 ?? null} noun="SSN" />
            </div>
          </div>
        </div>

        <Button
          onClick={() => void handleSave()}
          disabled={saving}
          className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest px-8 py-6"
        >
          {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</> : "Save Payout Details"}
        </Button>
      </div>
    </PortalLayout>
  );
}
