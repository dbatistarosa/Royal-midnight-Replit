import { useState } from "react";
import { useLocation } from "wouter";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useAuth } from "@/contexts/auth";
import { API_BASE } from "@/lib/constants";
import { PlacesAutocomplete } from "@/components/maps/PlacesAutocomplete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, LayoutDashboard, Plus, BookOpen, User, Car, CheckCircle2 } from "lucide-react";

const corporateNavItems = [
  { label: "Dashboard", href: "/corporate/dashboard", icon: LayoutDashboard },
  { label: "Book a Trip", href: "/corporate/book", icon: Plus },
  { label: "All Bookings", href: "/corporate/bookings", icon: BookOpen },
  { label: "Profile", href: "/corporate/profile", icon: User },
];

const VEHICLE_OPTIONS = [
  {
    value: "business",
    label: "Business Class Sedan",
    description: "Luxury sedan — up to 3 passengers",
  },
  {
    value: "suv",
    label: "Premium SUV — 2026 Chevrolet Suburban",
    description: "Spacious SUV — up to 6 passengers",
  },
];

type BookingResult = { id: number };
type QuoteResult = { estimatedPrice: number };

function CorporateBookInner() {
  const { user, token } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [form, setForm] = useState({
    passengerName: "",
    passengerEmail: "",
    passengerPhone: "",
    pickupAddress: "",
    dropoffAddress: "",
    pickupAt: "",
    vehicleClass: "business",
    passengers: 1,
    specialRequests: "",
    notes: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quotedPrice, setQuotedPrice] = useState<number | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [confirmed, setConfirmed] = useState<{ id: number; price: number } | null>(null);

  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

  const fetchQuote = async () => {
    if (!form.pickupAddress || !form.dropoffAddress || !form.vehicleClass) return;
    setIsQuoting(true);
    try {
      const res = await fetch(`${API_BASE}/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickupAddress: form.pickupAddress,
          dropoffAddress: form.dropoffAddress,
          vehicleClass: form.vehicleClass,
          passengers: form.passengers,
          pickupAt: form.pickupAt ? new Date(form.pickupAt).toISOString() : new Date().toISOString(),
        }),
      });
      if (res.ok) {
        const data = await res.json() as QuoteResult;
        setQuotedPrice(data.estimatedPrice);
      }
    } catch {
      // Quote not critical — silently ignore
    } finally {
      setIsQuoting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.passengerName || !form.pickupAddress || !form.dropoffAddress || !form.pickupAt) {
      toast({ title: "Missing fields", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      // Get a fresh quote if we don't have one yet
      let price = quotedPrice;
      if (price === null) {
        const qRes = await fetch(`${API_BASE}/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pickupAddress: form.pickupAddress,
            dropoffAddress: form.dropoffAddress,
            vehicleClass: form.vehicleClass,
            passengers: form.passengers,
            pickupAt: new Date(form.pickupAt).toISOString(),
          }),
        });
        if (qRes.ok) {
          const qData = await qRes.json() as QuoteResult;
          price = qData.estimatedPrice;
          setQuotedPrice(price);
        }
      }

      const res = await fetch(`${API_BASE}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({
          passengerName: form.passengerName,
          passengerEmail: form.passengerEmail || user?.email || "corporate@royalmidnight.com",
          passengerPhone: form.passengerPhone || user?.phone || "N/A",
          pickupAddress: form.pickupAddress,
          dropoffAddress: form.dropoffAddress,
          pickupAt: new Date(form.pickupAt).toISOString(),
          vehicleClass: form.vehicleClass,
          passengers: form.passengers,
          specialRequests: form.notes || null,
          priceQuoted: price ?? 0,
          userId: user?.id ?? null,
          paymentType: "corporate_account",
        }),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Booking failed");
      }

      const data = await res.json() as BookingResult;
      setConfirmed({ id: data.id, price: price ?? 0 });
    } catch (err: unknown) {
      toast({
        title: "Booking failed",
        description: err instanceof Error ? err.message : "Could not create booking.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setConfirmed(null);
    setQuotedPrice(null);
    setForm({ passengerName: "", passengerEmail: "", passengerPhone: "", pickupAddress: "", dropoffAddress: "", pickupAt: "", vehicleClass: "business", passengers: 1, specialRequests: "", notes: "" });
  };

  if (confirmed) {
    return (
      <PortalLayout title="Corporate Portal" navItems={corporateNavItems}>
        <div className="max-w-lg mx-auto text-center py-16">
          <div className="w-16 h-16 bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl mb-3">Booking Confirmed</h1>
          <p className="text-muted-foreground text-sm mb-2">
            Reference: <span className="font-mono text-primary">RM-{String(confirmed.id).padStart(6, "0")}</span>
          </p>
          {confirmed.price > 0 && (
            <p className="text-primary font-medium text-lg mb-2">${confirmed.price.toFixed(2)}</p>
          )}
          <p className="text-muted-foreground text-sm mb-8">
            Your booking has been confirmed and will be billed to your corporate account. Our team will be in touch to confirm chauffeur details.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={() => setLocation("/corporate/bookings")}
              className="bg-primary text-black hover:bg-primary/90 rounded-none uppercase tracking-widest text-xs px-8 min-h-[44px]"
            >
              View All Bookings
            </Button>
            <Button
              variant="outline"
              onClick={resetForm}
              className="border-border text-foreground hover:bg-white/5 rounded-none uppercase tracking-widest text-xs px-8 min-h-[44px]"
            >
              Book Another
            </Button>
          </div>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title="Corporate Portal" navItems={corporateNavItems}>
      <div className="mb-8">
        <h1 className="font-serif text-2xl sm:text-3xl mb-1">Book a Trip</h1>
        <p className="text-muted-foreground text-sm">Schedule ground transportation for your client or guest. Billed to your corporate account.</p>
      </div>

      <form onSubmit={e => void handleSubmit(e)} className="max-w-2xl space-y-8">
        <div className="bg-card border border-border p-6 sm:p-8 space-y-5">
          <h2 className="font-serif text-lg border-b border-border pb-4 mb-2">Passenger Details</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label className="text-gray-400 uppercase tracking-widest text-xs block mb-1.5">Passenger Name *</Label>
              <Input
                value={form.passengerName}
                onChange={e => setForm(p => ({ ...p, passengerName: e.target.value }))}
                placeholder="Guest or client name"
                className="bg-white/5 border-white/10 text-white rounded-none min-h-[44px] text-sm"
                required
              />
            </div>
            <div>
              <Label className="text-gray-400 uppercase tracking-widest text-xs block mb-1.5">Passenger Phone</Label>
              <Input
                value={form.passengerPhone}
                onChange={e => setForm(p => ({ ...p, passengerPhone: e.target.value }))}
                placeholder="+1 (305) 555-0000"
                className="bg-white/5 border-white/10 text-white rounded-none min-h-[44px] text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <Label className="text-gray-400 uppercase tracking-widest text-xs block mb-1.5">Passenger Email</Label>
              <Input
                type="email"
                value={form.passengerEmail}
                onChange={e => setForm(p => ({ ...p, passengerEmail: e.target.value }))}
                placeholder="passenger@example.com"
                className="bg-white/5 border-white/10 text-white rounded-none min-h-[44px] text-sm"
              />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border p-6 sm:p-8 space-y-5">
          <h2 className="font-serif text-lg border-b border-border pb-4 mb-2">Trip Details</h2>

          <div>
            <Label className="text-gray-400 uppercase tracking-widest text-xs block mb-1.5">Pickup Location *</Label>
            <PlacesAutocomplete
              value={form.pickupAddress}
              onChange={v => setForm(p => ({ ...p, pickupAddress: v }))}
              placeholder="Hotel, address, or airport"
              className="bg-white/5 border-white/10 text-white rounded-none min-h-[44px] text-sm"
            />
          </div>

          <div>
            <Label className="text-gray-400 uppercase tracking-widest text-xs block mb-1.5">Drop-off Location *</Label>
            <PlacesAutocomplete
              value={form.dropoffAddress}
              onChange={v => setForm(p => ({ ...p, dropoffAddress: v }))}
              placeholder="Destination address"
              className="bg-white/5 border-white/10 text-white rounded-none min-h-[44px] text-sm"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label className="text-gray-400 uppercase tracking-widest text-xs block mb-1.5">Date & Time *</Label>
              <Input
                type="datetime-local"
                value={form.pickupAt}
                onChange={e => setForm(p => ({ ...p, pickupAt: e.target.value }))}
                className="bg-white/5 border-white/10 text-white rounded-none min-h-[44px] text-sm"
                required
              />
            </div>
            <div>
              <Label className="text-gray-400 uppercase tracking-widest text-xs block mb-1.5">Passengers</Label>
              <Input
                type="number"
                min={1}
                max={6}
                value={form.passengers}
                onChange={e => setForm(p => ({ ...p, passengers: parseInt(e.target.value) || 1 }))}
                className="bg-white/5 border-white/10 text-white rounded-none min-h-[44px] text-sm"
              />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border p-6 sm:p-8">
          <h2 className="font-serif text-lg border-b border-border pb-4 mb-5">Vehicle Class</h2>

          <div className="space-y-3">
            {VEHICLE_OPTIONS.map(opt => (
              <label
                key={opt.value}
                className={`flex items-start gap-4 p-4 border cursor-pointer transition-colors ${
                  form.vehicleClass === opt.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-border/80"
                }`}
              >
                <input
                  type="radio"
                  name="vehicleClass"
                  value={opt.value}
                  checked={form.vehicleClass === opt.value}
                  onChange={() => setForm(p => ({ ...p, vehicleClass: opt.value }))}
                  className="mt-1 accent-primary"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <Car className="w-4 h-4 text-primary" />
                    <span className="font-medium text-sm">{opt.label}</span>
                  </div>
                  <p className="text-muted-foreground text-xs mt-0.5">{opt.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border p-6 sm:p-8">
          <h2 className="font-serif text-lg border-b border-border pb-4 mb-5">Notes</h2>
          <textarea
            value={form.notes}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            placeholder="Special requests, flight number, meet & greet instructions..."
            rows={3}
            className="w-full bg-white/5 border border-white/10 text-white text-sm p-3 resize-none focus:outline-none focus:border-primary/50 placeholder:text-muted-foreground"
          />
        </div>

        <div className="bg-card border border-border p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Estimated Fare</p>
              {isQuoting ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Calculating...</span>
                </div>
              ) : quotedPrice !== null ? (
                <p className="font-serif text-2xl text-primary">${quotedPrice.toFixed(2)}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Enter route and vehicle class to see estimate</p>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!form.pickupAddress || !form.dropoffAddress || isQuoting}
              onClick={() => void fetchQuote()}
              className="border-border text-foreground hover:bg-white/5 rounded-none uppercase tracking-widest text-xs px-6 min-h-[44px]"
            >
              {isQuoting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Quoting...</> : "Get Quote"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            <strong className="text-foreground/70">Corporate Billing:</strong> Trip confirmed immediately. Fare billed to your corporate account — no payment required at booking.
          </p>
        </div>

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={isSubmitting}
            className="bg-primary text-black hover:bg-primary/90 rounded-none uppercase tracking-widest text-xs px-10 min-h-[44px]"
          >
            {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Confirming...</> : "Confirm Booking"}
          </Button>
        </div>
      </form>
    </PortalLayout>
  );
}

export default function CorporateBook() {
  return (
    <AuthGuard requiredRole="corporate">
      <CorporateBookInner />
    </AuthGuard>
  );
}
