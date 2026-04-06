import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { CalendarIcon, Loader2, CheckCircle2, Lock, ChevronLeft, ArrowRight, MapPin, Users, Briefcase, Clock } from "lucide-react";

import { useCreateBooking, useGetQuote } from "@workspace/api-client-react";
import { QuoteRequestVehicleClass, CreateBookingBodyVehicleClass } from "@workspace/api-client-react/src/generated/api.schemas";
import { API_BASE } from "@/lib/constants";
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
  taxRate: number;
  taxAmount: number;
  totalWithTax: number;
  estimatedDistance: number;
  estimatedDuration: number;
}

const VEHICLE_INFO = {
  business: {
    name: "Business Class Sedan",
    tagline: "Refined executive travel",
    description: "Elevated executive comfort for the discerning professional. Professional chauffeur, premium amenities.",
    maxPassengers: 3,
    maxBags: 3,
    class: "CLASS 1",
  },
  suv: {
    name: "Premium SUV",
    subtitle: "2026 Chevrolet Suburban",
    tagline: "Space, presence & luxury",
    description: "Commanding presence and expansive cabin for groups and families. Maximum space with no compromise on luxury.",
    maxPassengers: 6,
    maxBags: 6,
    class: "CLASS 2",
  },
};

const STEPS = [
  { num: 1, label: "Trip Details" },
  { num: 2, label: "Select Vehicle" },
  { num: 3, label: "Review & Pay" },
];

type StepKey = 1 | 2 | 3;

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
    },
  });

  useEffect(() => {
    if (user) {
      form.setValue("passengerName", user.name || "");
      form.setValue("passengerEmail", user.email || "");
      form.setValue("passengerPhone", user.phone || "");
    }
  }, [user]);

  useEffect(() => {
    fetch(`${API_BASE}/settings/public`)
      .then(r => r.json())
      .then((data: Record<string, string>) => {
        if (data.min_booking_hours) setMinBookingHours(parseFloat(data.min_booking_hours));
      })
      .catch(() => {});
  }, []);

  const passengers = form.watch("passengers");
  const pickupDate = form.watch("pickupDate");
  const pickupTime = form.watch("pickupTime");
  const pickupAddress = form.watch("pickupAddress");
  const dropoffAddress = form.watch("dropoffAddress");

  const showBusiness = Number(passengers) <= 3;
  const selectedQuote = selectedVehicle ? quotes[selectedVehicle] : null;

  const formattedDateTime = pickupDate && pickupTime
    ? `${format(pickupDate, "EEEE, MMMM d, yyyy")} at ${pickupTime} EST`
    : null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const handleGetQuotes = async () => {
    const valid = await form.trigger([
      "pickupAddress", "dropoffAddress", "pickupDate", "pickupTime",
      "passengers", "luggage", "passengerName", "passengerEmail", "passengerPhone",
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
      setSelectedVehicle(showBusiness && newQuotes.business ? "business" : "suv");
      setStep(2);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Could not retrieve pricing.", variant: "destructive" });
    }
    setIsGettingQuotes(false);
  };

  const ensureAccount = useCallback(async (name: string, email: string, phone: string, password: string): Promise<number | null> => {
    if (user) return user.id;

    type AuthResponse = { token: string; user: { id: number; name: string; email: string; phone: string | null; role: "passenger" | "driver" | "admin" } };

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
        toast({ title: "Account exists", description: "An account with this email already exists. Please enter your existing password.", variant: "destructive" });
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
      toast({ title: "Incorrect password", description: "An account exists with this email. The password you entered is incorrect.", variant: "destructive" });
      return null;
    }

    toast({ title: "Account error", description: regData.error || "Could not create account.", variant: "destructive" });
    return null;
  }, [user, login, toast]);

  const handleConfirmAndPay = async () => {
    if (!selectedQuote || !selectedVehicle) return;
    const values = form.getValues();

    if (!user && (!values.password || values.password.length < 6)) {
      toast({ title: "Password required", description: "Please create a password (min 6 characters) to track your booking.", variant: "destructive" });
      return;
    }

    setIsConfirming(true);
    setPaymentError("");
    try {
      const userId = await ensureAccount(values.passengerName, values.passengerEmail, values.passengerPhone, values.password || "");
      if (userId === null) { setIsConfirming(false); return; }

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
      toast({ title: "Payment Error", description: err?.message, variant: "destructive" });
    }
    setIsConfirming(false);
  };

  const handlePaymentSuccess = async (paymentIntentId: string) => {
    if (!selectedQuote || !selectedVehicle) return;
    const values = form.getValues();
    const isoDate = new Date(`${format(values.pickupDate, "yyyy-MM-dd")}T${values.pickupTime}:00`).toISOString();
    try {
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
          userId: user?.id as any,
        },
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

  const inputClass = "w-full bg-white/4 border border-white/12 text-white rounded-none h-12 px-4 text-sm focus:outline-none focus:border-primary/60 transition-colors placeholder:text-gray-600";

  return (
    <div className="min-h-screen bg-[#050505]">
      {/* Hero banner */}
      <div className="relative pt-28 pb-12 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-black via-[#050505] to-[#050505]" />
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.12) 0%, transparent 70%)" }} />
        <div className="relative container mx-auto px-4 max-w-4xl text-center">
          <p className="text-xs uppercase tracking-[0.4em] text-primary mb-3">South Florida Luxury Transportation</p>
          <h1 className="text-5xl md:text-6xl font-serif text-white mb-4">Reserve Your Ride</h1>
          <p className="text-gray-500 text-sm tracking-wide">Professional chauffeur service — FLL, MIA &amp; PBI</p>

          {/* Step indicators */}
          <div className="flex items-center justify-center mt-10 gap-0">
            {STEPS.map((s, i) => (
              <div key={s.num} className="flex items-center">
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium transition-all duration-300
                    ${step > s.num ? "bg-primary text-black" : step === s.num ? "border-2 border-primary text-primary bg-primary/10" : "border border-white/15 text-white/25 bg-white/3"}`}>
                    {step > s.num ? <CheckCircle2 className="w-4 h-4" /> : s.num}
                  </div>
                  <span className={`text-[10px] uppercase tracking-[0.15em] transition-colors ${step === s.num ? "text-primary" : step > s.num ? "text-white/50" : "text-white/20"}`}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`h-px w-20 md:w-32 mx-3 mb-5 transition-colors duration-500 ${step > s.num ? "bg-primary/50" : "bg-white/8"}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-5xl pb-24">
        <Form {...form}>
          <form className="space-y-0">

            {/* ─── STEP 1: TRIP DETAILS ─── */}
            {step === 1 && (
              <div className="space-y-px">
                {/* Route section */}
                <div className="bg-[#0a0a0a] border border-white/8 p-7 md:p-10 space-y-6">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-5 h-px bg-primary" />
                    <p className="text-xs uppercase tracking-[0.3em] text-primary">Your Route</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-start">
                    <FormField control={form.control} name="pickupAddress" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-500 uppercase tracking-widest text-[10px] flex items-center gap-1.5 mb-2">
                          <MapPin className="w-3 h-3 text-primary" /> Pickup Location
                        </FormLabel>
                        <FormControl>
                          <PlacesAutocomplete
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="FLL, MIA, PBI or any address"
                            className={inputClass}
                            id="pickupAddress"
                          />
                        </FormControl>
                        <FormMessage className="text-red-400 text-xs mt-1" />
                      </FormItem>
                    )} />

                    <div className="hidden md:flex items-center justify-center pt-8">
                      <div className="flex items-center gap-1 text-white/15">
                        <div className="w-6 h-px bg-white/15" />
                        <ArrowRight className="w-4 h-4" />
                      </div>
                    </div>

                    <FormField control={form.control} name="dropoffAddress" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-500 uppercase tracking-widest text-[10px] flex items-center gap-1.5 mb-2">
                          <MapPin className="w-3 h-3 text-gray-600" /> Dropoff Location
                        </FormLabel>
                        <FormControl>
                          <PlacesAutocomplete
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="Destination or Airport Code"
                            className={inputClass}
                            id="dropoffAddress"
                          />
                        </FormControl>
                        <FormMessage className="text-red-400 text-xs mt-1" />
                      </FormItem>
                    )} />
                  </div>

                  {/* Date / Time / Passengers / Luggage */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                    <FormField control={form.control} name="pickupDate" render={({ field }) => (
                      <FormItem className="flex flex-col col-span-2 md:col-span-1">
                        <FormLabel className="text-gray-500 uppercase tracking-widest text-[10px] flex items-center gap-1.5 mb-2">
                          <CalendarIcon className="w-3 h-3" /> Date
                        </FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button variant="outline" className={`w-full ${inputClass} justify-start font-normal border-white/12 bg-white/4 hover:bg-white/8`}>
                                {field.value ? format(field.value, "MMM d, yyyy") : <span className="text-gray-600">Pick a date</span>}
                                <CalendarIcon className="ml-auto h-3.5 w-3.5 text-gray-600" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 bg-[#0d0d0d] border-white/15" align="start">
                            <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date < today} initialFocus />
                          </PopoverContent>
                        </Popover>
                        <FormMessage className="text-red-400 text-xs" />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="pickupTime" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-500 uppercase tracking-widest text-[10px] flex items-center gap-1.5 mb-2">
                          <Clock className="w-3 h-3" /> Time (EST)
                        </FormLabel>
                        <FormControl>
                          <Input type="time" className={inputClass} {...field} />
                        </FormControl>
                        <FormMessage className="text-red-400 text-xs" />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="passengers" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-500 uppercase tracking-widest text-[10px] flex items-center gap-1.5 mb-2">
                          <Users className="w-3 h-3" /> Passengers
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={String(field.value)}>
                          <FormControl>
                            <SelectTrigger className={`${inputClass} [&>span]:text-white`}>
                              <SelectValue placeholder="1" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-[#0d0d0d] border-white/15 text-white">
                            {[1,2,3,4,5,6].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FormMessage className="text-red-400 text-xs" />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="luggage" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-500 uppercase tracking-widest text-[10px] flex items-center gap-1.5 mb-2">
                          <Briefcase className="w-3 h-3" /> Luggage
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={String(field.value)}>
                          <FormControl>
                            <SelectTrigger className={`${inputClass} [&>span]:text-white`}>
                              <SelectValue placeholder="0" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-[#0d0d0d] border-white/15 text-white">
                            {[0,1,2,3,4,5,6].map(n => <SelectItem key={n} value={String(n)}>{n} {n === 1 ? "bag" : "bags"}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FormMessage className="text-red-400 text-xs" />
                      </FormItem>
                    )} />
                  </div>
                </div>

                {/* Passenger info section */}
                <div className="bg-[#0a0a0a] border border-white/8 border-t-0 p-7 md:p-10 space-y-6">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-5 h-px bg-primary" />
                    <p className="text-xs uppercase tracking-[0.3em] text-primary">Passenger Information</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <FormField control={form.control} name="passengerName" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-500 uppercase tracking-widest text-[10px]">Full Name</FormLabel>
                        <FormControl><Input placeholder="John Smith" className={inputClass} {...field} /></FormControl>
                        <FormMessage className="text-red-400 text-xs" />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="passengerEmail" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-500 uppercase tracking-widest text-[10px]">Email Address</FormLabel>
                        <FormControl><Input type="email" placeholder="john@example.com" className={inputClass} {...field} /></FormControl>
                        <FormMessage className="text-red-400 text-xs" />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="passengerPhone" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-500 uppercase tracking-widest text-[10px]">Phone Number</FormLabel>
                        <FormControl><Input type="tel" placeholder="+1 (305) 000-0000" className={inputClass} {...field} /></FormControl>
                        <FormMessage className="text-red-400 text-xs" />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="flightNumber" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-500 uppercase tracking-widest text-[10px]">
                          Flight Number <span className="normal-case text-gray-700 ml-1">optional</span>
                        </FormLabel>
                        <FormControl><Input placeholder="AA1234" className={inputClass} {...field} /></FormControl>
                        <FormMessage className="text-red-400 text-xs" />
                      </FormItem>
                    )} />
                  </div>

                  <FormField control={form.control} name="specialRequests" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-500 uppercase tracking-widest text-[10px]">
                        Special Requests <span className="normal-case text-gray-700 ml-1">optional</span>
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Child seat, water preference, meet & greet instructions..."
                          className="bg-white/4 border border-white/12 text-white rounded-none min-h-[90px] resize-none focus:outline-none focus:border-primary/60 text-sm placeholder:text-gray-600"
                          {...field}
                        />
                      </FormControl>
                    </FormItem>
                  )} />
                </div>

                {/* Account creation */}
                {!user && (
                  <div className="bg-[#0d0a04] border border-primary/15 border-t-0 p-7 md:p-10">
                    <div className="flex items-start gap-4">
                      <Lock className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <div className="flex-1 space-y-4">
                        <div>
                          <p className="text-sm text-white font-medium">Create your account to track your ride</p>
                          <p className="text-xs text-gray-600 mt-1">A Royal Midnight account will be linked to your booking so you can track your driver in real time.</p>
                        </div>
                        <FormField control={form.control} name="password" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-gray-500 uppercase tracking-widest text-[10px]">Create Password</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="Minimum 6 characters" className={`${inputClass} max-w-sm`} {...field} />
                            </FormControl>
                            <FormMessage className="text-red-400 text-xs" />
                          </FormItem>
                        )} />
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-5">
                  <Button
                    type="button"
                    onClick={handleGetQuotes}
                    disabled={isGettingQuotes}
                    className="bg-primary text-black hover:bg-primary/90 font-semibold uppercase tracking-[0.2em] text-xs px-14 h-13 rounded-none h-[52px] shadow-[0_0_30px_rgba(201,168,76,0.2)]"
                  >
                    {isGettingQuotes
                      ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Getting Pricing...</>
                      : <>View Pricing <ArrowRight className="w-4 h-4 ml-2" /></>}
                  </Button>
                </div>
              </div>
            )}

            {/* ─── STEP 2: VEHICLE SELECTION ─── */}
            {step === 2 && (
              <div className="space-y-5">
                {/* Route banner */}
                <div className="bg-[#0a0a0a] border border-white/8 px-6 py-4 flex items-center gap-3 text-sm">
                  <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                  <span className="text-gray-400 truncate">{pickupAddress}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-white/20 flex-shrink-0" />
                  <span className="text-gray-400 truncate">{dropoffAddress}</span>
                  {quotes.business && (
                    <span className="ml-auto flex items-center gap-1 text-gray-600 text-xs whitespace-nowrap">
                      <Clock className="w-3 h-3" /> ~{quotes.business.estimatedDuration} min · {quotes.business.estimatedDistance} mi
                    </span>
                  )}
                </div>

                <p className="text-center text-xs uppercase tracking-[0.3em] text-gray-600 py-1">Select your vehicle</p>

                {(["business", "suv"] as const).map((vc) => {
                  const info = VEHICLE_INFO[vc];
                  const quote = quotes[vc];
                  const isDisabled = vc === "business" && Number(passengers) > 3;
                  const isSelected = selectedVehicle === vc;

                  if (isDisabled) return null;

                  return (
                    <div
                      key={vc}
                      onClick={() => !isDisabled && setSelectedVehicle(vc)}
                      className={`cursor-pointer relative overflow-hidden transition-all duration-300 ${
                        isSelected
                          ? "border border-primary/60 shadow-[0_0_40px_rgba(201,168,76,0.12)]"
                          : "border border-white/8 hover:border-white/20"
                      }`}
                    >
                      {/* Top accent line */}
                      <div className={`absolute top-0 left-0 right-0 h-px transition-all duration-300 ${isSelected ? "bg-gradient-to-r from-transparent via-primary to-transparent" : "bg-transparent"}`} />

                      <div className="grid grid-cols-1 md:grid-cols-[1fr_280px]">
                        {/* Left: Vehicle info */}
                        <div className={`p-8 md:p-10 relative ${isSelected ? "bg-gradient-to-br from-[#0d0b06] to-[#080808]" : "bg-[#080808]"}`}>
                          <div className="flex items-start justify-between mb-6">
                            <div>
                              <p className="text-[10px] uppercase tracking-[0.35em] text-primary mb-2">{info.class}</p>
                              <h3 className="text-2xl md:text-3xl font-serif text-white leading-tight">{info.name}</h3>
                              {"subtitle" in info && <p className="text-xs text-gray-600 mt-1">{info.subtitle}</p>}
                              <p className="text-xs text-gray-500 mt-1 italic">{info.tagline}</p>
                            </div>
                            <div className={`w-8 h-8 rounded-full border flex items-center justify-center flex-shrink-0 transition-all ${isSelected ? "border-primary bg-primary/10" : "border-white/15"}`}>
                              {isSelected && <CheckCircle2 className="w-5 h-5 text-primary" />}
                            </div>
                          </div>

                          <p className="text-sm text-gray-500 leading-relaxed mb-6 max-w-md">{info.description}</p>

                          <div className="flex gap-8">
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-gray-700 mb-1">Passengers</p>
                              <p className="text-sm text-white flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5 text-gray-500" /> Up to {info.maxPassengers}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-gray-700 mb-1">Luggage</p>
                              <p className="text-sm text-white flex items-center gap-1.5">
                                <Briefcase className="w-3.5 h-3.5 text-gray-500" /> Up to {info.maxBags} bags
                              </p>
                            </div>
                            {quote && (
                              <div>
                                <p className="text-[10px] uppercase tracking-widest text-gray-700 mb-1">Est. Time</p>
                                <p className="text-sm text-white flex items-center gap-1.5">
                                  <Clock className="w-3.5 h-3.5 text-gray-500" /> {quote.estimatedDuration} min
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Right: Price */}
                        {quote ? (
                          <div className={`border-t md:border-t-0 md:border-l ${isSelected ? "border-primary/20 bg-[#0d0b04]" : "border-white/8 bg-[#060606]"} p-8 md:p-10 flex flex-col justify-between`}>
                            <div className="space-y-3 text-sm">
                              <div className="flex justify-between items-center text-gray-500">
                                <span>Base fare</span>
                                <span className="text-gray-300">${quote.baseFare.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between items-center text-gray-500">
                                <span>Distance ({quote.estimatedDistance.toFixed(1)} mi)</span>
                                <span className="text-gray-300">${quote.distanceCharge.toFixed(2)}</span>
                              </div>
                              <div className="h-px bg-white/8 my-1" />
                              <div className="flex justify-between items-center text-gray-500">
                                <span>Subtotal</span>
                                <span className="text-gray-300">${(quote.baseFare + quote.distanceCharge).toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between items-center text-gray-500">
                                <span>Florida tax ({(quote.taxRate * 100).toFixed(0)}%)</span>
                                <span className="text-gray-300">${quote.taxAmount.toFixed(2)}</span>
                              </div>
                            </div>
                            <div className="mt-6 pt-4 border-t border-white/10">
                              <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">Total</p>
                              <p className={`text-4xl font-serif transition-colors ${isSelected ? "text-primary" : "text-white"}`}>
                                ${quote.totalWithTax.toFixed(2)}
                              </p>
                              <p className="text-xs text-gray-700 mt-1">All inclusive</p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center p-8 text-gray-600 text-sm">
                            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Calculating...
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {Number(passengers) > 3 && (
                  <p className="text-xs text-gray-600 text-center py-2">For groups of 4 or more, the Premium SUV is required.</p>
                )}

                <div className="flex justify-between pt-3">
                  <Button type="button" variant="outline" onClick={() => setStep(1)} className="border-white/15 text-white/60 hover:text-white hover:bg-white/5 rounded-none uppercase tracking-widest text-xs px-6 h-11">
                    <ChevronLeft className="w-4 h-4 mr-1" /> Back
                  </Button>
                  <Button
                    type="button"
                    onClick={() => selectedVehicle && setStep(3)}
                    disabled={!selectedVehicle}
                    className="bg-primary text-black hover:bg-primary/90 font-semibold uppercase tracking-[0.2em] text-xs px-12 h-[52px] rounded-none shadow-[0_0_30px_rgba(201,168,76,0.2)]"
                  >
                    Continue to Review <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {/* ─── STEP 3: REVIEW & PAY ─── */}
            {step === 3 && selectedQuote && selectedVehicle && (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                {/* Summary */}
                <div className="lg:col-span-3 bg-[#0a0a0a] border border-white/8">
                  <div className="h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
                  <div className="p-8 space-y-7">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.3em] text-primary mb-1">Booking Summary</p>
                      <h2 className="text-xl font-serif text-white">{VEHICLE_INFO[selectedVehicle].name}</h2>
                    </div>

                    {/* Route */}
                    <div className="space-y-4">
                      <div className="flex gap-4">
                        <div className="flex flex-col items-center pt-1">
                          <div className="w-2 h-2 rounded-full bg-primary" />
                          <div className="w-px flex-1 bg-white/10 my-1" />
                          <div className="w-2 h-2 rounded-full border border-white/30" />
                        </div>
                        <div className="flex-1 space-y-4">
                          <div>
                            <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-0.5">Pickup</p>
                            <p className="text-sm text-white leading-snug">{form.getValues("pickupAddress")}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-0.5">Dropoff</p>
                            <p className="text-sm text-white leading-snug">{form.getValues("dropoffAddress")}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Trip details grid */}
                    <div className="grid grid-cols-2 gap-4 border-t border-white/8 pt-5">
                      {[
                        { label: "Date & Time", value: formattedDateTime || "—" },
                        { label: "Vehicle", value: VEHICLE_INFO[selectedVehicle].name },
                        { label: "Passengers", value: String(form.getValues("passengers")) },
                        { label: "Luggage", value: `${form.getValues("luggage")} ${Number(form.getValues("luggage")) === 1 ? "bag" : "bags"}` },
                        { label: "Name", value: form.getValues("passengerName") },
                        { label: "Email", value: form.getValues("passengerEmail") },
                        { label: "Phone", value: form.getValues("passengerPhone") },
                        ...(form.getValues("flightNumber") ? [{ label: "Flight", value: form.getValues("flightNumber")! }] : []),
                      ].map(item => (
                        <div key={item.label}>
                          <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-0.5">{item.label}</p>
                          <p className="text-sm text-gray-300 leading-snug">{item.value}</p>
                        </div>
                      ))}
                    </div>

                    {form.getValues("specialRequests") && (
                      <div className="border-t border-white/8 pt-4">
                        <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">Special Requests</p>
                        <p className="text-sm text-gray-400 italic">{form.getValues("specialRequests")}</p>
                      </div>
                    )}

                    {/* Price breakdown */}
                    <div className="border-t border-white/8 pt-5 space-y-2.5">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-gray-600 mb-3">Price Breakdown</p>
                      <div className="flex justify-between text-sm text-gray-500">
                        <span>Base fare</span>
                        <span>${selectedQuote.baseFare.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-gray-500">
                        <span>Distance ({selectedQuote.estimatedDistance.toFixed(1)} mi)</span>
                        <span>${selectedQuote.distanceCharge.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-gray-500 border-t border-white/8 pt-2">
                        <span>Subtotal</span>
                        <span>${(selectedQuote.baseFare + selectedQuote.distanceCharge).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-gray-500">
                        <span>Florida tax ({(selectedQuote.taxRate * 100).toFixed(0)}%)</span>
                        <span>${selectedQuote.taxAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-baseline pt-3 border-t border-white/15">
                        <span className="text-base text-white font-serif">Total Due</span>
                        <span className="text-3xl font-serif text-primary">${selectedQuote.totalWithTax.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Payment */}
                <div className="lg:col-span-2 bg-[#0a0a0a] border border-white/8">
                  <div className="h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
                  <div className="p-8 space-y-6">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.3em] text-primary mb-1">Secure Payment</p>
                      <h2 className="text-xl font-serif text-white">Complete Your Reservation</h2>
                    </div>

                    {paymentClientSecret && paymentPublishableKey ? (
                      <div className="space-y-4">
                        <p className="text-xs text-gray-600 uppercase tracking-widest">Powered by Stripe</p>
                        <StripePaymentForm
                          clientSecret={paymentClientSecret}
                          publishableKey={paymentPublishableKey}
                          amount={selectedQuote.totalWithTax}
                          onSuccess={handlePaymentSuccess}
                          onError={handlePaymentError}
                        />
                        {paymentError && <p className="text-red-400 text-sm p-3 border border-red-900/40 bg-red-900/8">{paymentError}</p>}
                        <button type="button" onClick={() => { setPaymentClientSecret(null); setPaymentPublishableKey(null); setPaymentError(""); }} className="text-xs text-gray-700 hover:text-gray-500 transition-colors">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        {/* Amount callout */}
                        <div className="bg-primary/5 border border-primary/15 p-5 text-center">
                          <p className="text-[10px] uppercase tracking-[0.3em] text-gray-600 mb-1">You will be charged</p>
                          <p className="text-4xl font-serif text-primary">${selectedQuote.totalWithTax.toFixed(2)}</p>
                          <p className="text-xs text-gray-700 mt-1">All inclusive — no hidden fees</p>
                        </div>

                        <div className="bg-white/3 border border-white/8 p-4 flex gap-3 items-start">
                          <Lock className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs text-white font-medium">256-bit SSL Encryption</p>
                            <p className="text-xs text-gray-600 mt-0.5">Payment secured by Stripe. Your card information is never stored on our servers.</p>
                          </div>
                        </div>

                        {paymentError && <p className="text-red-400 text-sm p-3 border border-red-900/40 bg-red-900/8">{paymentError}</p>}

                        <Button
                          type="button"
                          onClick={handleConfirmAndPay}
                          disabled={isConfirming}
                          className="w-full bg-primary text-black hover:bg-primary/90 font-semibold uppercase tracking-[0.2em] text-xs h-[52px] rounded-none shadow-[0_0_30px_rgba(201,168,76,0.2)]"
                        >
                          {isConfirming
                            ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Preparing...</>
                            : `Pay $${selectedQuote.totalWithTax.toFixed(2)}`}
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setStep(2)}
                          className="w-full border-white/12 text-white/50 hover:text-white hover:bg-white/5 rounded-none uppercase tracking-widest text-xs h-10"
                        >
                          <ChevronLeft className="w-4 h-4 mr-1" /> Change Vehicle
                        </Button>
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
