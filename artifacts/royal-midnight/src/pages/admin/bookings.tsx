import { useState, useEffect, useCallback, Fragment } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, Calendar, Users, Car, Map, DollarSign, Tag, MessageSquare, BarChart, Settings, Plus, X, Loader2, Plane, ChevronDown, ChevronUp, Phone, Briefcase, Clock, CreditCard, FileText, User, Send, AlertCircle, AlertTriangle, CheckCircle, XCircle, Ban, RefreshCw, Link, Wallet } from "lucide-react";
import { format } from "date-fns";
import { API_BASE } from "@/lib/constants";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlacesAutocomplete } from "@/components/maps/PlacesAutocomplete";
import { AIRLINES_BY_AIRPORT } from "@/data/airlines";
import { StripePaymentForm } from "@/components/payment/StripePaymentForm";

type AirportCode = "FLL" | "MIA" | "PBI";
function detectAirportCode(address: string): AirportCode | null {
  const upper = address.toUpperCase();
  if (/\bFLL\b/.test(upper)) return "FLL";
  if (/\bMIA\b/.test(upper)) return "MIA";
  if (/\bPBI\b/.test(upper)) return "PBI";
  return null;
}

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
  { label: "Payouts", href: "/admin/payouts", icon: Wallet },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

type BookingRow = {
  id: number;
  passengerName: string;
  passengerEmail: string;
  passengerPhone: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickupAt: string;
  vehicleClass: string;
  passengers: number;
  luggageCount?: number | null;
  status: string;
  priceQuoted: number;
  discountAmount?: number | null;
  promoCode?: string | null;
  driverId: number | null;
  flightNumber?: string | null;
  specialRequests?: string | null;
  paymentType?: string | null;
  userRole?: string | null;
  userId?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type DriverOption = { id: number; name: string; status: string };

const STATUS_COLORS: Record<string, string> = {
  awaiting_payment: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  pending:          "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  confirmed:        "text-primary bg-primary/10 border-primary/20",
  on_way:           "text-sky-400 bg-sky-400/10 border-sky-400/20",
  on_location:      "text-violet-400 bg-violet-400/10 border-violet-400/20",
  in_progress:      "text-blue-400 bg-blue-400/10 border-blue-400/20",
  completed:        "text-green-400 bg-green-400/10 border-green-400/20",
  cancelled:        "text-gray-400 bg-gray-400/10 border-gray-400/20",
};

const LABEL = "text-gray-400 uppercase tracking-widest text-xs block mb-1.5";
const INPUT = "bg-white/5 border-white/10 text-white rounded-none h-10 text-sm";
const SELECT = "bg-white/5 border border-white/10 text-white rounded-none h-10 text-sm px-3 w-full";

type FormData = {
  passengerName: string;
  passengerEmail: string;
  passengerPhone: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickupAt: string;
  vehicleClass: string;
  passengers: string;
  luggageCount: string;
  flightNumber: string;
  specialRequests: string;
  priceQuoted: string;
  driverId: string;
};

const EMPTY_FORM: FormData = {
  passengerName: "", passengerEmail: "", passengerPhone: "",
  pickupAddress: "", dropoffAddress: "", pickupAt: "",
  vehicleClass: "business", passengers: "1", luggageCount: "0",
  flightNumber: "", specialRequests: "", priceQuoted: "", driverId: "",
};

const VEHICLE_LIMITS = {
  business: { maxPassengers: 3, maxLuggage: 3 },
  suv:      { maxPassengers: 6, maxLuggage: 6 },
};

function Modal({ title, onClose, onSubmit, submitting, children }: {
  title: string; onClose: () => void; onSubmit: () => void;
  submitting: boolean; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-card border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-7 py-5 border-b border-border">
          <h2 className="font-serif text-xl">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-7 space-y-5">{children}</div>
        <div className="px-7 py-5 border-t border-border flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} className="rounded-none border-white/20 text-white hover:bg-white/10 text-xs uppercase tracking-widest">Cancel</Button>
          <Button onClick={onSubmit} disabled={submitting} className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest px-6">
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</> : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AdminBookings() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const [assignDriverId, setAssignDriverId] = useState<string>("");
  const [assignSaving, setAssignSaving] = useState(false);
  const [createForm, setCreateForm] = useState<FormData>(EMPTY_FORM);
  const [createSaving, setCreateSaving] = useState(false);
  const [isGettingQuote, setIsGettingQuote] = useState(false);
  const [pickupAirline, setPickupAirline] = useState("");
  const [dropoffAirline, setDropoffAirline] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Payment collection state
  const [chargeBooking, setChargeBooking] = useState<BookingRow | null>(null);
  const [chargeClientSecret, setChargeClientSecret] = useState<string | null>(null);
  const [chargePublishableKey, setChargePublishableKey] = useState<string | null>(null);
  const [chargeLoading, setChargeLoading] = useState(false);
  const [sendingInvoiceId, setSendingInvoiceId] = useState<number | null>(null);
  const [syncingPaymentId, setSyncingPaymentId] = useState<number | null>(null);
  const [linkingUserId, setLinkingUserId] = useState<Record<number, string>>({});
  const [linkingLoading, setLinkingLoading] = useState<number | null>(null);

  type PassengerUser = { id: number; email: string; name: string; role: string };
  const [passengerUsers, setPassengerUsers] = useState<PassengerUser[]>([]);
  useEffect(() => {
    fetch(`${API_BASE}/users`, { headers: { Authorization: authHdr } })
      .then(r => r.ok ? r.json() as Promise<PassengerUser[]> : Promise.resolve([]))
      .then(data => setPassengerUsers(Array.isArray(data) ? data.filter(u => u.role === "passenger" || u.role === "corporate") : []))
      .catch(() => {});
  }, [authHdr]);

  // Cancellation state
  type CancelPreview = {
    canCancel: boolean; tier: string; feePercent: number; feeAmount: number;
    netRefund: number; hoursUntilPickup: number; message: string; priceQuoted: number;
  };
  const [cancelPreview, setCancelPreview] = useState<{ booking: BookingRow; policy: CancelPreview } | null>(null);
  const [cancelPreviewLoading, setCancelPreviewLoading] = useState<number | null>(null);
  const [cancelConfirming, setCancelConfirming] = useState(false);

  const authHdr = token ? `Bearer ${token}` : "";

  const pickupAirportCode = detectAirportCode(createForm.pickupAddress);
  const dropoffAirportCode = detectAirportCode(createForm.dropoffAddress);
  const limits = VEHICLE_LIMITS[createForm.vehicleClass as keyof typeof VEHICLE_LIMITS] ?? VEHICLE_LIMITS.business;

  const refetch = useCallback(() => {
    if (!token) return;
    setIsLoading(true);
    fetch(`${API_BASE}/bookings`, { headers: { Authorization: authHdr } })
      .then(r => r.ok ? r.json() as Promise<BookingRow[]> : Promise.resolve([]))
      .then(data => setBookings(Array.isArray(data) ? data : []))
      .catch(() => setBookings([]))
      .finally(() => setIsLoading(false));
  }, [token, authHdr]);

  useEffect(() => {
    refetch();
    if (!token) return;
    fetch(`${API_BASE}/drivers`, { headers: { Authorization: authHdr } })
      .then(r => r.ok ? r.json() as Promise<DriverOption[]> : Promise.resolve([]))
      .then(data => setDrivers(Array.isArray(data) ? data : []))
      .catch(() => setDrivers([]));
  }, [refetch, token, authHdr]);

  const handleCreate = async () => {
    if (!createForm.passengerName || !createForm.passengerEmail || !createForm.passengerPhone || !createForm.pickupAddress || !createForm.dropoffAddress || !createForm.pickupAt || !createForm.priceQuoted) {
      toast({ title: "Missing fields", description: "Name, email, phone, addresses, pickup time, and price are required.", variant: "destructive" });
      return;
    }
    setCreateSaving(true);
    try {
      const body = {
        passengerName: createForm.passengerName,
        passengerEmail: createForm.passengerEmail,
        passengerPhone: createForm.passengerPhone,
        pickupAddress: createForm.pickupAddress,
        dropoffAddress: createForm.dropoffAddress,
        pickupAt: new Date(createForm.pickupAt).toISOString(),
        vehicleClass: createForm.vehicleClass,
        passengers: parseInt(createForm.passengers) || 1,
        luggageCount: parseInt(createForm.luggageCount) || 0,
        flightNumber: (pickupAirline || dropoffAirline || createForm.flightNumber) ? (createForm.flightNumber || null) : null,
        specialRequests: createForm.specialRequests || null,
        priceQuoted: parseFloat(createForm.priceQuoted),
      };
      const res = await fetch(`${API_BASE}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHdr },
        body: JSON.stringify(body),
      });

      const responseBody = await res.json() as BookingRow | { error?: string };
      if (!res.ok) {
        throw new Error((responseBody as { error?: string }).error ?? "Failed to create booking");
      }
      const created = responseBody as BookingRow;

      // If driver was specified, assign immediately
      if (createForm.driverId) {
        const assignRes = await fetch(`${API_BASE}/bookings/${created.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: authHdr },
          body: JSON.stringify({ driverId: parseInt(createForm.driverId), status: "confirmed" }),
        });
        if (!assignRes.ok) {
          toast({ title: "Booking created but driver assignment failed", description: "You can assign a driver from the bookings table.", variant: "destructive" });
        }
      }

      toast({ title: "Booking created", description: "The reservation has been created." });
      setShowCreate(false);
      setCreateForm(EMPTY_FORM);
      refetch();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not create booking.", variant: "destructive" });
    }
    setCreateSaving(false);
  };

  const handleAssign = async (bookingId: number) => {
    if (!assignDriverId) return;
    setAssignSaving(true);
    try {
      const res = await fetch(`${API_BASE}/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: authHdr },
        body: JSON.stringify({ driverId: parseInt(assignDriverId), status: "confirmed" }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Failed to assign driver");
      }
      toast({ title: "Driver assigned", description: "The driver has been assigned to this booking." });
      setAssigningId(null);
      setAssignDriverId("");
      refetch();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not assign driver.", variant: "destructive" });
    }
    setAssignSaving(false);
  };

  const handleUnassign = async (bookingId: number) => {
    if (!confirm("Unassign the driver from this booking? It will return to the available pool.")) return;
    try {
      const res = await fetch(`${API_BASE}/bookings/${bookingId}/unassign`, {
        method: "POST",
        headers: { Authorization: authHdr },
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Failed to unassign driver");
      }
      toast({ title: "Driver unassigned", description: "The booking is now back in the available pool." });
      refetch();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not unassign driver.", variant: "destructive" });
    }
  };

  const handleChargeCard = async (b: BookingRow) => {
    setChargeLoading(true);
    try {
      const [configRes, intentRes] = await Promise.all([
        fetch(`${API_BASE}/payments/config`, { headers: { Authorization: authHdr } }),
        fetch(`${API_BASE}/payments/create-intent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: authHdr },
          body: JSON.stringify({ bookingId: b.id, amount: b.priceQuoted }),
        }),
      ]);
      const { publishableKey } = await configRes.json() as { publishableKey: string };
      const { clientSecret } = await intentRes.json() as { clientSecret: string };
      setChargePublishableKey(publishableKey);
      setChargeClientSecret(clientSecret);
      setChargeBooking(b);
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not open payment form.", variant: "destructive" });
    } finally {
      setChargeLoading(false);
    }
  };

  const handlePaymentSuccess = async (paymentIntentId: string) => {
    if (!chargeBooking) return;
    try {
      const res = await fetch(`${API_BASE}/payments/confirm/${chargeBooking.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHdr },
        body: JSON.stringify({ paymentIntentId }),
      });
      if (!res.ok) throw new Error("Confirmation failed");
      toast({ title: "Payment successful", description: `Booking #RM-${String(chargeBooking.id).padStart(4, "0")} is now pending driver assignment.` });
      setChargeBooking(null);
      setChargeClientSecret(null);
      refetch();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Payment confirmed but status update failed.", variant: "destructive" });
    }
  };

  const handleSyncPayment = async (b: BookingRow) => {
    setSyncingPaymentId(b.id);
    try {
      const res = await fetch(`${API_BASE}/admin/payments/check/${b.id}`, {
        method: "POST",
        headers: { Authorization: authHdr },
      });
      const data = await res.json() as { confirmed?: boolean; message?: string };
      if (data.confirmed) {
        toast({ title: "Payment confirmed!", description: data.message ?? "Booking moved to pending." });
        void refetch();
      } else {
        toast({ title: "No payment found", description: data.message ?? "Could not verify payment in Stripe.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Could not reach the server.", variant: "destructive" });
    } finally {
      setSyncingPaymentId(null);
    }
  };

  const handleSendInvoice = async (b: BookingRow) => {
    if (!confirm(`Send a Stripe invoice to ${b.passengerEmail} for $${b.priceQuoted.toFixed(2)}?`)) return;
    setSendingInvoiceId(b.id);
    try {
      const res = await fetch(`${API_BASE}/payments/create-invoice/${b.id}`, {
        method: "POST",
        headers: { Authorization: authHdr },
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to send invoice");
      toast({ title: "Invoice sent", description: `Invoice emailed to ${b.passengerEmail}. Booking will auto-confirm when paid.` });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not send invoice.", variant: "destructive" });
    } finally {
      setSendingInvoiceId(null);
    }
  };

  const handleCancelPreview = async (b: BookingRow) => {
    setCancelPreviewLoading(b.id);
    try {
      const res = await fetch(`${API_BASE}/bookings/${b.id}/cancel-preview`, {
        headers: { Authorization: authHdr },
      });
      if (!res.ok) throw new Error("Could not load cancellation policy.");
      const policy = await res.json() as { canCancel: boolean; tier: string; feePercent: number; feeAmount: number; netRefund: number; hoursUntilPickup: number; message: string; priceQuoted: number };
      setCancelPreview({ booking: b, policy });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not load cancellation policy.", variant: "destructive" });
    } finally {
      setCancelPreviewLoading(null);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelPreview) return;
    setCancelConfirming(true);
    try {
      const res = await fetch(`${API_BASE}/bookings/${cancelPreview.booking.id}`, {
        method: "DELETE",
        headers: { Authorization: authHdr },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "Could not cancel booking.");
      }
      toast({
        title: "Booking cancelled",
        description: cancelPreview.policy.feeAmount > 0
          ? `Booking #RM-${String(cancelPreview.booking.id).padStart(4, "0")} cancelled. A ${cancelPreview.policy.feePercent}% fee ($${cancelPreview.policy.feeAmount.toFixed(2)}) applies.`
          : `Booking #RM-${String(cancelPreview.booking.id).padStart(4, "0")} cancelled at no charge.`,
      });
      setCancelPreview(null);
      refetch();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not cancel booking.", variant: "destructive" });
    } finally {
      setCancelConfirming(false);
    }
  };

  const setField = (k: keyof FormData, v: string) => setCreateForm(prev => {
    const updated = { ...prev, [k]: v };
    if (k === "vehicleClass") {
      const lim = VEHICLE_LIMITS[v as keyof typeof VEHICLE_LIMITS] ?? VEHICLE_LIMITS.business;
      if (parseInt(updated.passengers) > lim.maxPassengers) updated.passengers = String(lim.maxPassengers);
      if (parseInt(updated.luggageCount) > lim.maxLuggage) updated.luggageCount = String(lim.maxLuggage);
    }
    return updated;
  });

  // Reset airline selections when airport changes
  useEffect(() => { setPickupAirline(""); }, [pickupAirportCode]);
  useEffect(() => { setDropoffAirline(""); }, [dropoffAirportCode]);

  // Auto-fetch price quote when required fields are filled
  useEffect(() => {
    if (!createForm.pickupAddress || !createForm.dropoffAddress || !createForm.pickupAt || !createForm.vehicleClass) return;
    const timeout = setTimeout(async () => {
      setIsGettingQuote(true);
      try {
        const res = await fetch(`${API_BASE}/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pickupAddress: createForm.pickupAddress,
            dropoffAddress: createForm.dropoffAddress,
            vehicleClass: createForm.vehicleClass,
            passengers: parseInt(createForm.passengers) || 1,
            pickupAt: new Date(createForm.pickupAt).toISOString(),
          }),
        });
        if (res.ok) {
          const data = await res.json() as { totalWithTax?: number };
          if (data.totalWithTax != null) {
            setCreateForm(prev => ({ ...prev, priceQuoted: data.totalWithTax!.toFixed(2) }));
          }
        }
      } catch {}
      setIsGettingQuote(false);
    }, 700);
    return () => clearTimeout(timeout);
  }, [createForm.pickupAddress, createForm.dropoffAddress, createForm.pickupAt, createForm.vehicleClass, createForm.passengers]);

  return (
    <PortalLayout title="Royal Admin" navItems={adminNavItems}>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 sm:mb-8 gap-3">
        <h1 className="font-serif text-2xl sm:text-3xl">All Bookings</h1>
        <Button
          onClick={() => setShowCreate(true)}
          className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest px-5 min-h-[44px] self-start sm:self-auto"
        >
          <Plus className="w-4 h-4 mr-2" />New Booking
        </Button>
      </div>

      <div className="bg-card border border-border rounded-none overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[640px]">
            <thead className="bg-background/50 border-b border-border">
              <tr>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">ID</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Date</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Passenger</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs hidden md:table-cell">Route</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Status</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs hidden md:table-cell">Amount</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Driver</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading...
                </td></tr>
              ) : !bookings.length ? (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-muted-foreground">No bookings found.</td></tr>
              ) : bookings.map(b => (
                <Fragment key={b.id}>
                  <tr className="hover:bg-background/50 transition-colors">
                    <td className="px-5 py-4 font-medium text-muted-foreground">#{b.id}</td>
                    <td className="px-5 py-4">{format(new Date(b.pickupAt), "MMM d, yyyy HH:mm")}</td>
                    <td className="px-5 py-4">
                      <div className="font-medium">{b.passengerName}</div>
                      <div className="text-xs text-muted-foreground">{b.passengerEmail}</div>
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell max-w-[180px] text-muted-foreground text-xs truncate">
                      {b.pickupAddress.split(",")[0]} → {b.dropoffAddress.split(",")[0]}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-1 border text-xs uppercase tracking-widest ${STATUS_COLORS[b.status] ?? "text-muted-foreground"}`}>
                          {b.status.replace(/_/g, " ")}
                        </span>
                        {b.userRole === "corporate" && (
                          <span className="px-2 py-0.5 border border-purple-500/30 bg-purple-500/10 text-purple-400 text-xs uppercase tracking-widest">
                            Corporate
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell font-medium text-primary">${b.priceQuoted?.toFixed(2)}</td>
                    <td className="px-5 py-4">
                      {b.status === "awaiting_payment" ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => void handleChargeCard(b)}
                            disabled={chargeLoading}
                            className="flex items-center gap-1 text-xs border border-primary/40 text-primary hover:bg-primary/10 px-2.5 py-1.5 transition-colors disabled:opacity-50"
                          >
                            {chargeLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CreditCard className="w-3 h-3" />}
                            Charge Card
                          </button>
                          <button
                            onClick={() => void handleSendInvoice(b)}
                            disabled={sendingInvoiceId === b.id}
                            className="flex items-center gap-1 text-xs border border-white/20 text-muted-foreground hover:text-white hover:border-white/40 px-2.5 py-1.5 transition-colors disabled:opacity-50"
                          >
                            {sendingInvoiceId === b.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                            Send Invoice
                          </button>
                          <button
                            onClick={() => void handleSyncPayment(b)}
                            disabled={syncingPaymentId === b.id}
                            title="Check Stripe for a completed payment or paid invoice and update status"
                            className="flex items-center gap-1 text-xs border border-green-500/30 text-green-500 hover:bg-green-500/10 px-2.5 py-1.5 transition-colors disabled:opacity-50"
                          >
                            {syncingPaymentId === b.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                            Sync Payment
                          </button>
                        </div>
                      ) : assigningId === b.id ? (
                        <div className="flex items-center gap-2">
                          <select
                            className="bg-black border border-white/20 text-white text-xs rounded-none h-8 px-2"
                            value={assignDriverId}
                            onChange={e => setAssignDriverId(e.target.value)}
                          >
                            <option value="">— Select —</option>
                            {drivers.filter(d => d.status === "available" || d.status === "active").map(d => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                          </select>
                          <Button size="sm" disabled={!assignDriverId || assignSaving} onClick={() => handleAssign(b.id)} className="bg-primary text-black rounded-none text-xs h-8 px-3">
                            {assignSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Assign"}
                          </Button>
                          <button onClick={() => { setAssigningId(null); setAssignDriverId(""); }} className="text-muted-foreground hover:text-white text-xs">Cancel</button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          {b.driverId ? (
                            <span className="text-xs text-green-400">Driver #{b.driverId}</span>
                          ) : (
                            <span className="text-xs text-yellow-400">Unassigned</span>
                          )}
                          {!["completed", "cancelled"].includes(b.status) && (
                            <button
                              onClick={() => { setAssigningId(b.id); setAssignDriverId(b.driverId ? String(b.driverId) : ""); }}
                              className="text-xs text-muted-foreground hover:text-primary underline underline-offset-2"
                            >
                              {b.driverId ? "Reassign" : "Assign"}
                            </button>
                          )}
                          {b.driverId && !["completed", "cancelled"].includes(b.status) && (
                            <button
                              onClick={() => void handleUnassign(b.id)}
                              className="text-xs text-red-400/60 hover:text-red-400 underline underline-offset-2"
                            >
                              Unassign
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors whitespace-nowrap"
                      >
                        {expandedId === b.id ? (
                          <><ChevronUp className="w-3.5 h-3.5" /> Hide</>
                        ) : (
                          <><ChevronDown className="w-3.5 h-3.5" /> View</>
                        )}
                      </button>
                    </td>
                  </tr>
                  {expandedId === b.id && (
                    <tr className="bg-background/30">
                      <td colSpan={8} className="px-6 py-6 border-t border-border/50">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          {/* Customer Info */}
                          <div className="space-y-3">
                            <h4 className="text-[10px] uppercase tracking-widest text-primary flex items-center gap-1.5 border-b border-white/8 pb-2">
                              <User className="w-3.5 h-3.5" /> Customer
                            </h4>
                            <div className="space-y-2 text-sm">
                              <div>
                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Name</p>
                                <p className="text-white">{b.passengerName}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Email</p>
                                <p className="text-white break-all">{b.passengerEmail}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Phone</p>
                                <p className="text-white flex items-center gap-1.5">
                                  <Phone className="w-3 h-3 text-primary" />
                                  {b.passengerPhone || "—"}
                                </p>
                              </div>
                              {b.userRole && (
                                <div>
                                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Account Type</p>
                                  <p className="capitalize text-white">{b.userRole}</p>
                                </div>
                              )}
                              <div className="pt-1">
                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                                  {b.userId ? "Linked Account" : "Link to Account"}
                                </p>
                                {b.userId ? (
                                  <p className="text-xs text-primary">User #{b.userId} (linked)</p>
                                ) : null}
                                <div className="flex items-center gap-2 mt-1">
                                  <select
                                    className="bg-black border border-white/20 text-white text-xs rounded-none h-7 px-2 flex-1 min-w-0"
                                    value={linkingUserId[b.id] ?? ""}
                                    onChange={e => setLinkingUserId(prev => ({ ...prev, [b.id]: e.target.value }))}
                                  >
                                    <option value="">— Select passenger —</option>
                                    {passengerUsers.map(u => (
                                      <option key={u.id} value={u.id}>
                                        {u.name} ({u.email})
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    disabled={!linkingUserId[b.id] || linkingLoading === b.id}
                                    onClick={async () => {
                                      const uid = parseInt(linkingUserId[b.id] ?? "", 10);
                                      if (!uid) return;
                                      setLinkingLoading(b.id);
                                      try {
                                        const res = await fetch(`${API_BASE}/admin/bookings/${b.id}/link-user`, {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json", Authorization: authHdr },
                                          body: JSON.stringify({ userId: uid }),
                                        });
                                        const data = await res.json() as { ok?: boolean; userName?: string; error?: string };
                                        if (res.ok && data.ok) {
                                          toast({ title: "Account linked", description: `Booking #${b.id} linked to ${data.userName ?? "user"}.` });
                                          refetch();
                                        } else {
                                          toast({ title: "Link failed", description: data.error ?? "Unknown error", variant: "destructive" });
                                        }
                                      } catch {
                                        toast({ title: "Link failed", description: "Network error", variant: "destructive" });
                                      }
                                      setLinkingLoading(null);
                                    }}
                                    className="flex items-center gap-1 text-xs border border-primary/40 text-primary hover:bg-primary/10 px-2 py-1 transition-colors disabled:opacity-50 whitespace-nowrap"
                                  >
                                    {linkingLoading === b.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link className="w-3 h-3" />}
                                    Link
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Trip Info */}
                          <div className="space-y-3">
                            <h4 className="text-[10px] uppercase tracking-widest text-primary flex items-center gap-1.5 border-b border-white/8 pb-2">
                              <Car className="w-3.5 h-3.5" /> Trip Details
                            </h4>
                            <div className="space-y-2 text-sm">
                              <div>
                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Pick-up</p>
                                <p className="text-white">{b.pickupAddress}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Drop-off</p>
                                <p className="text-white">{b.dropoffAddress}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Pickup Time</p>
                                <p className="text-white">{format(new Date(b.pickupAt), "PPP 'at' p")}</p>
                              </div>
                              <div className="flex gap-6">
                                <div>
                                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Vehicle</p>
                                  <p className="text-white capitalize">{b.vehicleClass === "suv" ? "Premium SUV" : "Business Sedan"}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> Pax</p>
                                  <p className="text-white">{b.passengers}</p>
                                </div>
                                {b.luggageCount != null && (
                                  <div>
                                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1"><Briefcase className="w-3 h-3" /> Bags</p>
                                    <p className="text-white">{b.luggageCount}</p>
                                  </div>
                                )}
                              </div>
                              {b.flightNumber && (
                                <div>
                                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1"><Plane className="w-3 h-3" /> Flight</p>
                                  <p className="text-white font-mono">{b.flightNumber}</p>
                                </div>
                              )}
                              {b.specialRequests && (
                                <div>
                                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Special Requests</p>
                                  <p className="text-muted-foreground italic">{b.specialRequests}</p>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Payment & Driver Info */}
                          <div className="space-y-3">
                            <h4 className="text-[10px] uppercase tracking-widest text-primary flex items-center gap-1.5 border-b border-white/8 pb-2">
                              <CreditCard className="w-3.5 h-3.5" /> Payment & Assignment
                            </h4>
                            <div className="space-y-2 text-sm">
                              <div>
                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Amount Charged</p>
                                <p className="text-primary font-medium text-base">${b.priceQuoted?.toFixed(2)}</p>
                              </div>
                              {b.discountAmount != null && b.discountAmount > 0 && (
                                <div>
                                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Discount Applied</p>
                                  <p className="text-green-400">−${b.discountAmount.toFixed(2)} {b.promoCode && <span className="font-mono text-[10px] ml-1">({b.promoCode})</span>}</p>
                                </div>
                              )}
                              <div>
                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Payment Type</p>
                                <p className="text-white capitalize">{b.paymentType?.replace("_", " ") || "Standard"}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Driver</p>
                                <p className="text-white">{b.driverId ? `Driver #${b.driverId}` : "Not assigned"}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Status</p>
                                <span className={`inline-block px-2 py-0.5 border text-xs uppercase tracking-widest ${STATUS_COLORS[b.status] ?? "text-muted-foreground"}`}>
                                  {b.status.replace(/_/g, " ")}
                                </span>
                              </div>
                              {b.createdAt && (
                                <div>
                                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1"><FileText className="w-3 h-3" /> Booked On</p>
                                  <p className="text-muted-foreground text-xs">{format(new Date(b.createdAt), "PPP 'at' p")}</p>
                                </div>
                              )}

                              {/* Cancel booking */}
                              {!["completed", "cancelled"].includes(b.status) && (
                                <div className="pt-3 border-t border-white/8 mt-2">
                                  <button
                                    onClick={() => void handleCancelPreview(b)}
                                    disabled={cancelPreviewLoading === b.id}
                                    className="flex items-center gap-1.5 text-xs text-red-400/70 hover:text-red-400 transition-colors disabled:opacity-50"
                                  >
                                    {cancelPreviewLoading === b.id
                                      ? <><Loader2 className="w-3 h-3 animate-spin" />Loading policy...</>
                                      : <><Ban className="w-3 h-3" />Cancel Booking</>}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <Modal title="New Booking" onClose={() => { setShowCreate(false); setCreateForm(EMPTY_FORM); setPickupAirline(""); setDropoffAirline(""); }} onSubmit={handleCreate} submitting={createSaving}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Passenger info */}
            <div>
              <label className={LABEL}>Passenger Name *</label>
              <Input value={createForm.passengerName} onChange={e => setField("passengerName", e.target.value)} className={INPUT} placeholder="Full name" />
            </div>
            <div>
              <label className={LABEL}>Email *</label>
              <Input type="email" value={createForm.passengerEmail} onChange={e => setField("passengerEmail", e.target.value)} className={INPUT} placeholder="passenger@email.com" />
            </div>
            <div>
              <label className={LABEL}>Phone *</label>
              <Input value={createForm.passengerPhone} onChange={e => setField("passengerPhone", e.target.value)} className={INPUT} placeholder="+1 (305) 555-0000" />
            </div>
            <div>
              <label className={LABEL}>Vehicle Class *</label>
              <select value={createForm.vehicleClass} onChange={e => setField("vehicleClass", e.target.value)} className={SELECT}>
                <option value="business">Business Class Sedan (max 3 pax / 3 bags)</option>
                <option value="suv">Premium SUV (max 6 pax / 6 bags)</option>
              </select>
            </div>

            {/* Addresses with autocomplete */}
            <div className="md:col-span-2">
              <label className={LABEL}>Pick-up Address *</label>
              <PlacesAutocomplete
                value={createForm.pickupAddress}
                onChange={v => setField("pickupAddress", v)}
                placeholder="Pick-up location"
                className={`${INPUT} w-full px-3`}
              />
            </div>
            {pickupAirportCode && (
              <div className="md:col-span-2">
                <label className={LABEL}><Plane className="w-3 h-3 inline mr-1" />Airline at {pickupAirportCode} (Pick-up)</label>
                <select value={pickupAirline} onChange={e => setPickupAirline(e.target.value)} className={SELECT}>
                  <option value="">— Select airline (optional) —</option>
                  {AIRLINES_BY_AIRPORT[pickupAirportCode].map(a => (
                    <option key={a.code} value={a.code}>{a.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="md:col-span-2">
              <label className={LABEL}>Drop-off Address *</label>
              <PlacesAutocomplete
                value={createForm.dropoffAddress}
                onChange={v => setField("dropoffAddress", v)}
                placeholder="Destination"
                className={`${INPUT} w-full px-3`}
              />
            </div>
            {dropoffAirportCode && (
              <div className="md:col-span-2">
                <label className={LABEL}><Plane className="w-3 h-3 inline mr-1" />Airline at {dropoffAirportCode} (Drop-off)</label>
                <select value={dropoffAirline} onChange={e => setDropoffAirline(e.target.value)} className={SELECT}>
                  <option value="">— Select airline (optional) —</option>
                  {AIRLINES_BY_AIRPORT[dropoffAirportCode].map(a => (
                    <option key={a.code} value={a.code}>{a.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Date/time */}
            <div>
              <label className={LABEL}>Pickup Date & Time *</label>
              <Input type="datetime-local" value={createForm.pickupAt} onChange={e => setField("pickupAt", e.target.value)} className={INPUT} />
            </div>

            {/* Passengers */}
            <div>
              <label className={LABEL}>Passengers (max {limits.maxPassengers})</label>
              <select value={createForm.passengers} onChange={e => setField("passengers", e.target.value)} className={SELECT}>
                {Array.from({ length: limits.maxPassengers }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>{n} {n === 1 ? "passenger" : "passengers"}</option>
                ))}
              </select>
            </div>

            {/* Luggage */}
            <div>
              <label className={LABEL}>Luggage (max {limits.maxLuggage})</label>
              <select value={createForm.luggageCount} onChange={e => setField("luggageCount", e.target.value)} className={SELECT}>
                {Array.from({ length: limits.maxLuggage + 1 }, (_, i) => i).map(n => (
                  <option key={n} value={n}>{n} {n === 1 ? "bag" : "bags"}</option>
                ))}
              </select>
            </div>

            {/* Price quoted — auto-filled from quote API */}
            <div>
              <label className={LABEL}>
                Price Quoted ($) *
                {isGettingQuote && <Loader2 className="w-3 h-3 inline-block animate-spin ml-1.5 text-primary" />}
              </label>
              <Input
                type="number"
                step="0.01"
                value={createForm.priceQuoted}
                onChange={e => setField("priceQuoted", e.target.value)}
                className={INPUT}
                placeholder={isGettingQuote ? "Calculating..." : "0.00"}
              />
              {createForm.priceQuoted && !isGettingQuote && (
                <p className="text-[10px] text-primary mt-1 uppercase tracking-widest">Auto-calculated from route</p>
              )}
            </div>

            {/* Flight number */}
            <div>
              <label className={LABEL}>Flight Number</label>
              <Input value={createForm.flightNumber} onChange={e => setField("flightNumber", e.target.value)} className={INPUT} placeholder="AA1234 (optional)" />
            </div>

            <div>
              <label className={LABEL}>Assign Driver</label>
              <select value={createForm.driverId} onChange={e => setField("driverId", e.target.value)} className={SELECT}>
                <option value="">— No driver yet —</option>
                {drivers.filter(d => d.status === "available" || d.status === "active").map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className={LABEL}>Special Requests</label>
              <Input value={createForm.specialRequests} onChange={e => setField("specialRequests", e.target.value)} className={INPUT} placeholder="Any notes..." />
            </div>
          </div>
        </Modal>
      )}

      {/* Charge Card Modal */}
      {chargeBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0f0f0f] border border-white/10 w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 shrink-0">
              <div>
                <h2 className="text-sm uppercase tracking-widest font-semibold">Charge Card</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Booking #RM-{String(chargeBooking.id).padStart(4, "0")} — {chargeBooking.passengerName}
                </p>
              </div>
              <button
                onClick={() => { setChargeBooking(null); setChargeClientSecret(null); }}
                className="text-muted-foreground hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-6 overflow-y-auto flex-1">
              <div className="flex items-center gap-2 text-xs text-amber-400 border border-amber-400/20 bg-amber-400/5 px-3 py-2 mb-6">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Charging <strong>${chargeBooking.priceQuoted.toFixed(2)}</strong> to the passenger's card. Booking will move to <em>Pending</em> on success.</span>
              </div>
              {chargeClientSecret && chargePublishableKey ? (
                <StripePaymentForm
                  clientSecret={chargeClientSecret}
                  publishableKey={chargePublishableKey}
                  amount={chargeBooking.priceQuoted}
                  onSuccess={(id) => void handlePaymentSuccess(id)}
                  onError={(msg) => toast({ title: "Payment failed", description: msg, variant: "destructive" })}
                />
              ) : (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancel Booking Modal */}
      {cancelPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0f0f0f] border border-white/10 w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
              <div>
                <h2 className="text-sm uppercase tracking-widest font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" /> Cancel Booking
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  #{`RM-${String(cancelPreview.booking.id).padStart(4, "0")}`} — {cancelPreview.booking.passengerName}
                </p>
              </div>
              <button onClick={() => setCancelPreview(null)} className="text-muted-foreground hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-6 space-y-5">
              {/* Policy message */}
              <div className={`border p-4 text-sm flex items-start gap-2 ${cancelPreview.policy.tier === "free" ? "border-green-500/30 bg-green-500/5 text-green-400" : "border-amber-500/30 bg-amber-500/5 text-amber-400"}`}>
                {cancelPreview.policy.tier === "free"
                  ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
                <span>{cancelPreview.policy.message}</span>
              </div>

              {/* Fee breakdown */}
              <div className="space-y-2 text-sm border border-white/8 p-4">
                <div className="flex justify-between text-muted-foreground">
                  <span>Booking Total</span>
                  <span>${cancelPreview.policy.priceQuoted.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className={cancelPreview.policy.feeAmount > 0 ? "text-red-400" : "text-muted-foreground"}>
                    Cancellation Fee {cancelPreview.policy.feePercent > 0 ? `(${cancelPreview.policy.feePercent}%)` : ""}
                  </span>
                  <span className={cancelPreview.policy.feeAmount > 0 ? "text-red-400" : "text-muted-foreground"}>
                    {cancelPreview.policy.feeAmount > 0 ? `$${cancelPreview.policy.feeAmount.toFixed(2)}` : "None"}
                  </span>
                </div>
                <div className="flex justify-between font-medium pt-2 border-t border-white/8 text-base">
                  <span>Passenger Refund</span>
                  <span className="text-primary">${cancelPreview.policy.netRefund.toFixed(2)}</span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                This will cancel the booking and notify both the admin and the passenger by email. Stripe refunds must be processed manually via the Stripe dashboard.
              </p>
            </div>

            <div className="px-6 py-5 border-t border-white/10 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setCancelPreview(null)}
                disabled={cancelConfirming}
                className="rounded-none border-white/20 text-white hover:bg-white/10 text-xs uppercase tracking-widest"
              >
                Keep Booking
              </Button>
              <Button
                onClick={() => void handleConfirmCancel()}
                disabled={cancelConfirming}
                className="bg-red-600 hover:bg-red-700 text-white rounded-none text-xs uppercase tracking-widest px-6"
              >
                {cancelConfirming
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />Cancelling...</>
                  : <><XCircle className="w-3.5 h-3.5 mr-2" />Confirm Cancel</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
