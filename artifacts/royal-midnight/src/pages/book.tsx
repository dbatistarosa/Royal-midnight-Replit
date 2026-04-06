import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, addHours } from "date-fns";
import { CalendarIcon, Loader2, CheckCircle2, Lock, ChevronLeft } from "lucide-react";

import { useCreateBooking, useGetQuote } from "@workspace/api-client-react";
import { QuoteRequestVehicleClass, CreateBookingBodyVehicleClass } from "@workspace/api-client-react/src/generated/api.schemas";
import { VEHICLE_CLASSES, API_BASE } from "@/lib/constants";
import { useAuth } from "@/contexts/auth";
import { PlacesAutocomplete } from "@/components/maps/PlacesAutocomplete";
import { StripePaymentForm } from "@/components/payment/StripePaymentForm";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";

const bookingSchema = z.object({
  pickupAddress: z.string().min(3, "Pickup location is required"),
  dropoffAddress: z.string().min(3, "Dropoff location is required"),
  pickupDate: z.date({ required_error: "Date is required" }),
  pickupTime: z.string().min(1, "Time is required"),
  passengers: z.coerce.number().min(1).max(6),
  luggage: z.coerce.number().min(0).max(6),
  passengerName: z.string().min(2, "Full name is required"),
  passengerEmail: z.string().email("Valid email is required"),
  passengerPhone: z.string().min(10, "Phone number is required"),
  flightNumber: z.string().optional(),
  specialRequests: z.string().optional(),
  password: z.string().optional(),
});

type BookingFormValues = z.infer<typeof bookingSchema>;

interface QuoteResult {
  vehicleClass: string;
  baseFare: number;
  distanceCharge: number;
  airportFee: number;
  taxRate: number;
  taxAmount: number;
  totalWithTax: number;
  estimatedDistance: number;
  estimatedDuration: number;
}

const VEHICLE_INFO = {
  business: {
    name: "Business Class Sedan",
    description: "Elevated executive comfort for the discerning professional.",
    maxPassengers: 3,
    maxBags: 3,
    class: 1,
  },
  suv: {
    name: "Premium SUV",
    subtitle: "2026 Chevrolet Suburban",
    description: "Commanding presence and expansive cabin for groups and families.",
    maxPassengers: 6,
    maxBags: 6,
    class: 2,
  },
};

type StepKey = 1 | 2 | 3;

const STEPS = [
  { num: 1, label: "Trip Details" },
  { num: 2, label: "Select Vehicle" },
  { num: 3, label: "Review & Pay" },
];

export default function Book() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, login } = useAuth();
  const [step, setStep] = useState<StepKey>(1);
  const [quotes, setQuotes] = useState<{ business: QuoteResult | null; suv: QuoteResult | null }>({ business: null, suv: null });
  const [selectedVehicle, setSelectedVehicle] = useState<"business" | "suv" | null>(null);
  const [isGettingQuotes, setIsGettingQuotes] = useState(false);
  const [paymentClientSecret, setPaymentClientSecret] = useState<string | null>(null);
  const [paymentPublishableKey, setPaymentPublishableKey] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [minBookingHours, setMinBookingHours] = useState(2);

  const getQuote = useGetQuote();
  const createBooking = useCreateBooking();

  const searchParams = new URLSearchParams(window.location.search);

  const form = useForm<BookingFormValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      pickupAddress: searchParams.get("pickup") || "",
      dropoffAddress: searchParams.get("dropoff") || "",
      passengers: 1,
      luggage: 0,
      passengerName: user?.name || "",
      passengerEmail: user?.email || "",
      passengerPhone: user?.phone || "",
      flightNumber: "",
      specialRequests: "",
      password: "",
      pickupTime: "12:00",
    }
  });

  useEffect(() => {
    if (user) {
      form.setValue("passengerName", user.name || "");
      form.setValue("passengerEmail", user.email || "");
      form.setValue("passengerPhone", user.phone || "");
    }
  }, [user]);

  // Fetch public settings (min booking hours)
  useEffect(() => {
    fetch(`${API_BASE}/settings/public`)
      .then(r => r.json())
      .then((data: Record<string, string>) => {
        if (data.min_booking_hours) {
          setMinBookingHours(parseFloat(data.min_booking_hours));
        }
      })
      .catch(() => {});
  }, []);

  const passengers = form.watch("passengers");
  const showBusiness = Number(passengers) <= 3;

  const selectedQuote = selectedVehicle ? quotes[selectedVehicle] : null;

  // Step 1 → Step 2: Get quotes for both vehicle types
  const handleGetQuotes = async () => {
    const valid = await form.trigger([
      "pickupAddress", "dropoffAddress", "pickupDate", "pickupTime",
      "passengers", "luggage", "passengerName", "passengerEmail", "passengerPhone"
    ]);
    if (!valid) return;

    const { pickupAddress, dropoffAddress, pickupDate, pickupTime, passengers } = form.getValues();
    const isoDate = new Date(`${format(pickupDate, "yyyy-MM-dd")}T${pickupTime}:00`).toISOString();
    const numPax = Number(passengers) || 1;

    setIsGettingQuotes(true);
    try {
      const [businessRes, suvRes] = await Promise.allSettled([
        getQuote.mutateAsync({ data: { pickupAddress, dropoffAddress, vehicleClass: "business" as QuoteRequestVehicleClass, passengers: numPax, pickupAt: isoDate } }),
        getQuote.mutateAsync({ data: { pickupAddress, dropoffAddress, vehicleClass: "suv" as QuoteRequestVehicleClass, passengers: numPax, pickupAt: isoDate } }),
      ]);

      const newQuotes = { business: null as QuoteResult | null, suv: null as QuoteResult | null };
      let firstError = "";

      if (businessRes.status === "fulfilled") {
        const r = businessRes.value;
        newQuotes.business = {
          vehicleClass: r.vehicleClass,
          baseFare: r.baseFare,
          distanceCharge: r.distanceCharge,
          airportFee: (r as any).airportFee ?? 0,
          taxRate: (r as any).taxRate ?? 0.07,
          taxAmount: (r as any).taxAmount ?? 0,
          totalWithTax: (r as any).totalWithTax ?? r.estimatedPrice,
          estimatedDistance: r.estimatedDistance,
          estimatedDuration: r.estimatedDuration,
        };
      } else {
        firstError = (businessRes.reason as any)?.message || "Could not get pricing.";
      }

      if (suvRes.status === "fulfilled") {
        const r = suvRes.value;
        newQuotes.suv = {
          vehicleClass: r.vehicleClass,
          baseFare: r.baseFare,
          distanceCharge: r.distanceCharge,
          airportFee: (r as any).airportFee ?? 0,
          taxRate: (r as any).taxRate ?? 0.07,
          taxAmount: (r as any).taxAmount ?? 0,
          totalWithTax: (r as any).totalWithTax ?? r.estimatedPrice,
          estimatedDistance: r.estimatedDistance,
          estimatedDuration: r.estimatedDuration,
        };
      } else {
        if (!firstError) firstError = (suvRes.reason as any)?.message || "Could not get pricing.";
      }

      if (!newQuotes.business && !newQuotes.suv) {
        toast({ title: "Pricing unavailable", description: firstError, variant: "destructive" });
        setIsGettingQuotes(false);
        return;
      }

      setQuotes(newQuotes);
      // Auto-select the appropriate vehicle
      setSelectedVehicle(showBusiness && newQuotes.business ? "business" : "suv");
      setStep(2);
    } catch (err: any) {
      const msg = err?.message || "Could not retrieve pricing.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
    setIsGettingQuotes(false);
  };

  // Register or login during booking
  const ensureAccount = useCallback(async (name: string, email: string, phone: string, password: string): Promise<number | null> => {
    if (user) return user.id;

    type AuthResponse = { token: string; user: { id: number; name: string; email: string; phone: string | null; role: "passenger" | "driver" | "admin" } };

    // Try to register first
    const regRes = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, phone, password, role: "passenger" }),
    });

    if (regRes.ok) {
      const data = await regRes.json() as AuthResponse;
      login(data.user, data.token);
      return data.user.id;
    }

    const regData = await regRes.json() as { error?: string };
    if (regData.error?.includes("already registered")) {
      if (!password) {
        toast({
          title: "Account exists",
          description: "An account with this email already exists. Please enter your existing password.",
          variant: "destructive",
        });
        return null;
      }
      const loginRes = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (loginRes.ok) {
        const data = await loginRes.json() as AuthResponse;
        login(data.user, data.token);
        return data.user.id;
      }
      toast({
        title: "Incorrect password",
        description: "An account exists with this email. The password you entered is incorrect.",
        variant: "destructive",
      });
      return null;
    }

    toast({ title: "Account error", description: regData.error || "Could not create account.", variant: "destructive" });
    return null;
  }, [user, login, toast]);

  // Step 3: Initiate payment
  const handleConfirmAndPay = async () => {
    if (!selectedQuote || !selectedVehicle) return;

    const values = form.getValues();
    const { passengerName, passengerEmail, passengerPhone, password } = values;

    // Validate password if not logged in
    if (!user && (!password || password.length < 6)) {
      toast({ title: "Password required", description: "Please create a password (min 6 characters) to track your booking.", variant: "destructive" });
      return;
    }

    setIsConfirming(true);
    setPaymentError("");

    try {
      // 1. Ensure user account
      const userId = await ensureAccount(passengerName, passengerEmail, passengerPhone, password || "");
      if (userId === null) {
        setIsConfirming(false);
        return;
      }

      // 2. Create payment intent first
      const configRes = await fetch(`${API_BASE}/payments/config`);
      if (!configRes.ok) throw new Error("Payment configuration failed.");
      const { publishableKey } = await configRes.json() as { publishableKey: string };

      const intentRes = await fetch(`${API_BASE}/payments/create-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: selectedQuote.totalWithTax }),
      });
      if (!intentRes.ok) throw new Error("Could not initiate payment.");
      const { clientSecret } = await intentRes.json() as { clientSecret: string };

      setPaymentClientSecret(clientSecret);
      setPaymentPublishableKey(publishableKey);
    } catch (err: any) {
      setPaymentError(err?.message || "Could not initiate payment. Please try again.");
      toast({ title: "Payment Error", description: err?.message || "Could not initiate payment.", variant: "destructive" });
    }
    setIsConfirming(false);
  };

  // Called by Stripe after successful payment
  const handlePaymentSuccess = async (paymentIntentId: string) => {
    if (!selectedQuote || !selectedVehicle) return;

    const values = form.getValues();
    const isoDate = new Date(`${format(values.pickupDate, "yyyy-MM-dd")}T${values.pickupTime}:00`).toISOString();

    try {
      const userId = user?.id ?? undefined;
      const result = await createBooking.mutateAsync({
        data: {
          pickupAddress: values.pickupAddress,
          dropoffAddress: values.dropoffAddress,
          vehicleClass: selectedVehicle as CreateBookingBodyVehicleClass,
          passengers: Number(values.passengers),
          luggageCount: Number(values.luggage),
          pickupAt: isoDate,
          passengerName: values.passengerName,
          passengerEmail: values.passengerEmail,
          passengerPhone: values.passengerPhone,
          flightNumber: values.flightNumber || undefined,
          specialRequests: values.specialRequests || undefined,
          priceQuoted: selectedQuote.totalWithTax,
          taxAmount: selectedQuote.taxAmount,
          userId: userId as any,
        }
      });

      setLocation(`/booking-confirmation/${result.id}`);
    } catch (err: any) {
      toast({ title: "Booking Error", description: err?.message || "Payment received but booking failed. Please contact support.", variant: "destructive" });
    }
  };

  const handlePaymentError = (message: string) => {
    setPaymentError(message);
    setPaymentClientSecret(null);
    setPaymentPublishableKey(null);
  };

  const pickupDate = form.watch("pickupDate");
  const pickupTime = form.watch("pickupTime");

  // Min date for calendar: today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const formattedDateTime = pickupDate && pickupTime
    ? `${format(pickupDate, "MMMM d, yyyy")} at ${pickupTime}`
    : null;

  return (
    <div className="min-h-screen bg-[#050505] pt-28 pb-24">
      <div className="container mx-auto px-4 max-w-5xl">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-serif text-white uppercase tracking-widest mb-3">Reserve Vehicle</h1>
          {/* Step Indicators */}
          <div className="flex items-center justify-center gap-0 mt-6">
            {STEPS.map((s, i) => (
              <div key={s.num} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium border transition-all
                    ${step > s.num ? "bg-primary border-primary text-black" : step === s.num ? "border-primary text-primary" : "border-white/20 text-white/30"}`}>
                    {step > s.num ? <CheckCircle2 className="w-4 h-4" /> : s.num}
                  </div>
                  <span className={`text-[10px] uppercase tracking-widest mt-1 whitespace-nowrap ${step === s.num ? "text-primary" : "text-white/30"}`}>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`h-px w-16 md:w-24 mx-2 mb-5 transition-all ${step > s.num ? "bg-primary" : "bg-white/10"}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        <Form {...form}>
          <form className="space-y-0">

            {/* ─── STEP 1: TRIP DETAILS ─── */}
            {step === 1 && (
              <div className="bg-black border border-white/10 shadow-2xl relative">
                <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent opacity-40" />
                <div className="p-8 md:p-10 space-y-8">
                  <h2 className="text-2xl font-serif text-white border-b border-white/10 pb-4">Trip & Passenger Details</h2>

                  {/* Route */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField control={form.control} name="pickupAddress" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-400 uppercase tracking-widest text-xs">Pickup Location</FormLabel>
                        <FormControl>
                          <PlacesAutocomplete
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="FLL, MIA, PBI or any address"
                            className="w-full bg-white/5 border border-white/10 text-white rounded-none h-12 px-4 text-sm focus:outline-none focus:border-primary"
                            id="pickupAddress"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="dropoffAddress" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-400 uppercase tracking-widest text-xs">Dropoff Location</FormLabel>
                        <FormControl>
                          <PlacesAutocomplete
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="Destination or Airport Code"
                            className="w-full bg-white/5 border border-white/10 text-white rounded-none h-12 px-4 text-sm focus:outline-none focus:border-primary"
                            id="dropoffAddress"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  {/* Date / Time / Passengers / Luggage */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <FormField control={form.control} name="pickupDate" render={({ field }) => (
                      <FormItem className="flex flex-col col-span-2 md:col-span-1">
                        <FormLabel className="text-gray-400 uppercase tracking-widest text-xs">Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button variant="outline" className={`w-full bg-white/5 border-white/10 text-white rounded-none h-12 justify-start text-left font-normal ${!field.value && "text-muted-foreground"}`}>
                                {field.value ? format(field.value, "MMM d, yyyy") : <span className="text-gray-500">Pick a date</span>}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 bg-black border-white/20" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) => date < today}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="pickupTime" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-400 uppercase tracking-widest text-xs">Time (EST)</FormLabel>
                        <FormControl>
                          <Input type="time" className="bg-white/5 border-white/10 text-white rounded-none h-12" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="passengers" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-400 uppercase tracking-widest text-xs">Passengers</FormLabel>
                        <Select onValueChange={field.onChange} value={String(field.value)}>
                          <FormControl>
                            <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-none h-12">
                              <SelectValue placeholder="1" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-black border-white/20 text-white">
                            {[1,2,3,4,5,6].map(n => (
                              <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="luggage" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-400 uppercase tracking-widest text-xs">Luggage</FormLabel>
                        <Select onValueChange={field.onChange} value={String(field.value)}>
                          <FormControl>
                            <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-none h-12">
                              <SelectValue placeholder="0" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-black border-white/20 text-white">
                            {[0,1,2,3,4,5,6].map(n => (
                              <SelectItem key={n} value={String(n)}>{n} {n === 1 ? "bag" : "bags"}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <div className="border-t border-white/10 pt-6">
                    <h3 className="text-sm font-medium text-gray-400 uppercase tracking-widest mb-4">Passenger Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <FormField control={form.control} name="passengerName" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-400 uppercase tracking-widest text-xs">Full Name</FormLabel>
                          <FormControl>
                            <Input placeholder="John Smith" className="bg-white/5 border-white/10 text-white rounded-none h-12" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="passengerEmail" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-400 uppercase tracking-widest text-xs">Email Address</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="john@example.com" className="bg-white/5 border-white/10 text-white rounded-none h-12" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="passengerPhone" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-400 uppercase tracking-widest text-xs">Phone Number</FormLabel>
                          <FormControl>
                            <Input placeholder="+1 (305) 000-0000" className="bg-white/5 border-white/10 text-white rounded-none h-12" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="flightNumber" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-400 uppercase tracking-widest text-xs">Flight Number <span className="normal-case text-gray-600">(optional)</span></FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. AA1234" className="bg-white/5 border-white/10 text-white rounded-none h-12" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    <div className="mt-5">
                      <FormField control={form.control} name="specialRequests" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-400 uppercase tracking-widest text-xs">Special Requests <span className="normal-case text-gray-600">(optional)</span></FormLabel>
                          <FormControl>
                            <Textarea placeholder="Child seat, water preference, meet & greet instructions..." className="bg-white/5 border-white/10 text-white rounded-none min-h-[90px] resize-none" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  </div>

                  {/* Account Creation - only if not logged in */}
                  {!user && (
                    <div className="border border-primary/20 bg-primary/5 p-5 space-y-3">
                      <div>
                        <p className="text-sm text-white font-medium">Create your account to track bookings</p>
                        <p className="text-xs text-gray-500 mt-0.5">A Royal Midnight account will be created with your email so you can track your booking status.</p>
                      </div>
                      <FormField control={form.control} name="password" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-400 uppercase tracking-widest text-xs">Create Password</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="Minimum 6 characters" className="bg-white/5 border-white/10 text-white rounded-none h-12" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <Button
                      type="button"
                      onClick={handleGetQuotes}
                      disabled={isGettingQuotes}
                      className="bg-primary text-black hover:bg-primary/90 font-medium uppercase tracking-widest text-sm px-12 h-12 rounded-none"
                    >
                      {isGettingQuotes ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Getting Pricing...</> : "Get Pricing"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ─── STEP 2: VEHICLE SELECTION ─── */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  {(["business", "suv"] as const).map((vc) => {
                    const info = VEHICLE_INFO[vc];
                    const quote = quotes[vc];
                    const pax = Number(passengers);
                    const isDisabled = vc === "business" && pax > 3;
                    const isSelected = selectedVehicle === vc;

                    if (isDisabled) return null;

                    return (
                      <div
                        key={vc}
                        onClick={() => !isDisabled && setSelectedVehicle(vc)}
                        className={`cursor-pointer border bg-black transition-all relative ${isSelected ? "border-primary" : "border-white/10 hover:border-white/30"}`}
                      >
                        <div className="absolute top-0 left-0 w-full h-0.5 transition-all" style={{ background: isSelected ? "linear-gradient(90deg, transparent, #c9a84c, transparent)" : "none" }} />
                        <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                          {/* Left: info */}
                          <div className="md:col-span-2">
                            <div className="flex items-start justify-between mb-1">
                              <div>
                                <p className="text-xs text-primary uppercase tracking-widest mb-1">Class {info.class}</p>
                                <h3 className="text-xl font-serif text-white">{info.name}</h3>
                                {"subtitle" in info && <p className="text-xs text-gray-500 mt-0.5">{info.subtitle}</p>}
                              </div>
                              {isSelected && <CheckCircle2 className="text-primary w-6 h-6 flex-shrink-0" />}
                            </div>
                            <p className="text-sm text-gray-400 mt-2">{info.description}</p>
                            <div className="flex gap-6 mt-3">
                              <div>
                                <p className="text-xs text-gray-600 uppercase tracking-widest">Capacity</p>
                                <p className="text-sm text-white mt-0.5">Up to {info.maxPassengers} passengers</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-600 uppercase tracking-widest">Luggage</p>
                                <p className="text-sm text-white mt-0.5">Up to {info.maxBags} bags</p>
                              </div>
                            </div>
                          </div>

                          {/* Right: price breakdown */}
                          {quote ? (
                            <div className="border-t md:border-t-0 md:border-l border-white/10 pt-4 md:pt-0 md:pl-8">
                              <div className="space-y-1.5 text-sm">
                                <div className="flex justify-between text-gray-400">
                                  <span>Base fare</span>
                                  <span className="text-white">${quote.baseFare.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-gray-400">
                                  <span>Distance ({quote.estimatedDistance.toFixed(1)} mi)</span>
                                  <span className="text-white">${quote.distanceCharge.toFixed(2)}</span>
                                </div>
                                {quote.airportFee > 0 && (
                                  <div className="flex justify-between text-gray-400">
                                    <span>Airport fee</span>
                                    <span className="text-white">${quote.airportFee.toFixed(2)}</span>
                                  </div>
                                )}
                                <div className="flex justify-between text-gray-400">
                                  <span>Florida tax ({(quote.taxRate * 100).toFixed(0)}%)</span>
                                  <span className="text-white">${quote.taxAmount.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between pt-2 border-t border-white/10 font-medium">
                                  <span className="text-white">Total</span>
                                  <span className="text-primary text-lg font-serif">${quote.totalWithTax.toFixed(2)}</span>
                                </div>
                              </div>
                              <p className="text-xs text-gray-600 mt-2">{quote.estimatedDuration} min estimated</p>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center text-gray-600 text-sm">
                              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Calculating...
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Note if only SUV available */}
                  {Number(passengers) > 3 && (
                    <div className="border border-white/5 bg-white/3 p-4">
                      <p className="text-xs text-gray-500 text-center">For groups of 4 or more passengers, the Premium SUV is the required vehicle.</p>
                    </div>
                  )}
                </div>

                <div className="flex justify-between pt-2">
                  <Button type="button" variant="outline" onClick={() => setStep(1)} className="border-white/20 text-white hover:bg-white hover:text-black rounded-none uppercase tracking-widest text-xs px-6 h-11">
                    <ChevronLeft className="w-4 h-4 mr-1" /> Back
                  </Button>
                  <Button
                    type="button"
                    onClick={() => selectedVehicle && setStep(3)}
                    disabled={!selectedVehicle}
                    className="bg-primary text-black hover:bg-primary/90 font-medium uppercase tracking-widest text-sm px-12 h-12 rounded-none"
                  >
                    Continue to Review
                  </Button>
                </div>
              </div>
            )}

            {/* ─── STEP 3: REVIEW & PAY ─── */}
            {step === 3 && selectedQuote && selectedVehicle && (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Summary - Left */}
                <div className="lg:col-span-3 bg-black border border-white/10 shadow-2xl relative">
                  <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent opacity-40" />
                  <div className="p-7 space-y-5">
                    <h2 className="text-xl font-serif text-white border-b border-white/10 pb-3">Booking Summary</h2>

                    <div className="space-y-4 text-sm">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                        <div>
                          <p className="text-xs text-gray-600 uppercase tracking-widest mb-1">Pickup</p>
                          <p className="text-gray-300 leading-snug">{form.getValues("pickupAddress")}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 uppercase tracking-widest mb-1">Dropoff</p>
                          <p className="text-gray-300 leading-snug">{form.getValues("dropoffAddress")}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 uppercase tracking-widest mb-1">Date & Time</p>
                          <p className="text-white">{formattedDateTime} EST</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 uppercase tracking-widest mb-1">Vehicle</p>
                          <p className="text-white">{VEHICLE_INFO[selectedVehicle].name}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 uppercase tracking-widest mb-1">Passengers</p>
                          <p className="text-white">{form.getValues("passengers")}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 uppercase tracking-widest mb-1">Luggage</p>
                          <p className="text-white">{form.getValues("luggage")} {Number(form.getValues("luggage")) === 1 ? "bag" : "bags"}</p>
                        </div>
                      </div>

                      <div className="border-t border-white/10 pt-4 space-y-2">
                        <p className="text-xs text-gray-600 uppercase tracking-widest mb-2">Passenger Details</p>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Name</span>
                          <span className="text-white">{form.getValues("passengerName")}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Email</span>
                          <span className="text-white">{form.getValues("passengerEmail")}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Phone</span>
                          <span className="text-white">{form.getValues("passengerPhone")}</span>
                        </div>
                        {form.getValues("flightNumber") && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Flight</span>
                            <span className="text-white">{form.getValues("flightNumber")}</span>
                          </div>
                        )}
                        {form.getValues("specialRequests") && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Requests</span>
                            <span className="text-white text-right max-w-[60%]">{form.getValues("specialRequests")}</span>
                          </div>
                        )}
                      </div>

                      {/* Price Breakdown */}
                      <div className="border-t border-white/10 pt-4 space-y-2">
                        <p className="text-xs text-gray-600 uppercase tracking-widest mb-2">Price Breakdown</p>
                        <div className="flex justify-between text-gray-400">
                          <span>Base fare</span>
                          <span>${selectedQuote.baseFare.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-gray-400">
                          <span>Distance ({selectedQuote.estimatedDistance.toFixed(1)} mi)</span>
                          <span>${selectedQuote.distanceCharge.toFixed(2)}</span>
                        </div>
                        {selectedQuote.airportFee > 0 && (
                          <div className="flex justify-between text-gray-400">
                            <span>Airport fee</span>
                            <span>${selectedQuote.airportFee.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-gray-400">
                          <span>Subtotal</span>
                          <span>${(selectedQuote.baseFare + selectedQuote.distanceCharge + selectedQuote.airportFee).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-gray-400">
                          <span>Florida tax ({(selectedQuote.taxRate * 100).toFixed(0)}%)</span>
                          <span>${selectedQuote.taxAmount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between pt-3 border-t border-white/20 text-lg font-medium">
                          <span className="text-white font-serif">Total Due</span>
                          <span className="text-primary font-serif text-2xl">${selectedQuote.totalWithTax.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Payment - Right */}
                <div className="lg:col-span-2 bg-black border border-white/10 shadow-2xl relative">
                  <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent opacity-40" />
                  <div className="p-7 space-y-6">
                    <h2 className="text-xl font-serif text-white border-b border-white/10 pb-3">Payment</h2>

                    {paymentClientSecret && paymentPublishableKey ? (
                      <div className="space-y-4">
                        <p className="text-xs text-gray-500 uppercase tracking-widest">Secure payment powered by Stripe</p>
                        <StripePaymentForm
                          clientSecret={paymentClientSecret}
                          publishableKey={paymentPublishableKey}
                          amount={selectedQuote.totalWithTax}
                          onSuccess={handlePaymentSuccess}
                          onError={handlePaymentError}
                        />
                        {paymentError && (
                          <p className="text-red-400 text-sm border border-red-900/50 bg-red-900/10 p-3">{paymentError}</p>
                        )}
                        <button
                          type="button"
                          onClick={() => { setPaymentClientSecret(null); setPaymentPublishableKey(null); setPaymentError(""); }}
                          className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="bg-white/3 border border-white/10 p-4 flex items-start gap-3">
                          <Lock className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm text-white font-medium">Secure Checkout</p>
                            <p className="text-xs text-gray-500 mt-0.5">Your reservation is confirmed immediately upon payment. We accept all major credit cards via Stripe.</p>
                          </div>
                        </div>

                        <div className="bg-white/3 border border-white/10 p-4">
                          <p className="text-xs text-gray-600 uppercase tracking-widest mb-2">You will be charged</p>
                          <p className="text-3xl font-serif text-primary">${selectedQuote.totalWithTax.toFixed(2)}</p>
                          <p className="text-xs text-gray-600 mt-1">All inclusive — no surprise fees</p>
                        </div>

                        {paymentError && (
                          <p className="text-red-400 text-sm border border-red-900/50 bg-red-900/10 p-3">{paymentError}</p>
                        )}

                        <div className="space-y-3 pt-2">
                          <Button
                            type="button"
                            onClick={handleConfirmAndPay}
                            disabled={isConfirming}
                            className="w-full bg-primary text-black hover:bg-primary/90 font-medium uppercase tracking-widest text-sm h-14 rounded-none"
                          >
                            {isConfirming ? (
                              <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Preparing Payment...</>
                            ) : (
                              `Pay $${selectedQuote.totalWithTax.toFixed(2)}`
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setStep(2)}
                            className="w-full border-white/20 text-white hover:bg-white hover:text-black rounded-none uppercase tracking-widest text-xs h-11"
                          >
                            <ChevronLeft className="w-4 h-4 mr-1" /> Change Vehicle
                          </Button>
                        </div>

                        <div className="flex items-center justify-center gap-2 pt-2">
                          <Lock className="w-3 h-3 text-gray-600" />
                          <p className="text-xs text-gray-600">256-bit SSL encryption. No reservation held without payment.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

          </form>
        </Form>
      </div>
    </div>
  );
}
