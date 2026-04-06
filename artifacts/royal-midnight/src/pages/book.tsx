import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { CalendarIcon, Loader2, CheckCircle2, Tag, X } from "lucide-react";

import { useCreateBooking, useGetQuote, useValidatePromo } from "@workspace/api-client-react";
import { QuoteRequestVehicleClass, CreateBookingBodyVehicleClass } from "@workspace/api-client-react/src/generated/api.schemas";
import { VEHICLE_CLASSES } from "@/lib/constants";
import { useAuth } from "@/contexts/auth";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";

const bookingSchema = z.object({
  pickupAddress: z.string().min(3, "Pickup is required"),
  dropoffAddress: z.string().min(3, "Dropoff is required"),
  pickupDate: z.date({ required_error: "Date is required" }),
  pickupTime: z.string().min(1, "Time is required"),
  vehicleClass: z.enum(["standard", "business", "first_class", "suv", "van"]),
  passengers: z.coerce.number().min(1).max(10),
  passengerName: z.string().min(2, "Name is required"),
  passengerEmail: z.string().email("Invalid email"),
  passengerPhone: z.string().min(10, "Phone is required"),
  flightNumber: z.string().optional(),
  specialRequests: z.string().optional()
});

type BookingFormValues = z.infer<typeof bookingSchema>;

export default function Book() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [quoteData, setQuoteData] = useState<{ price: number; duration: number; distance: number } | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discountAmount: number; finalAmount: number } | null>(null);
  const [promoError, setPromoError] = useState("");

  const getQuote = useGetQuote();
  const createBooking = useCreateBooking();
  const validatePromo = useValidatePromo();

  const searchParams = new URLSearchParams(window.location.search);
  
  const form = useForm<BookingFormValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      pickupAddress: searchParams.get("pickup") || "",
      dropoffAddress: searchParams.get("dropoff") || "",
      vehicleClass: (searchParams.get("class") as any) || "standard",
      passengers: 1,
      passengerName: user?.name || "",
      passengerEmail: user?.email || "",
      passengerPhone: user?.phone || "",
      flightNumber: "",
      specialRequests: "",
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

  const finalPrice = appliedPromo?.finalAmount ?? quoteData?.price ?? 0;

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return;
    setPromoError("");
    try {
      const result = await validatePromo.mutateAsync({
        data: { code: promoCode.trim().toUpperCase(), bookingAmount: quoteData?.price ?? 0 }
      });
      if (!result.valid) {
        setPromoError(result.message || "Invalid or expired promo code.");
        return;
      }
      setAppliedPromo({
        code: promoCode.trim().toUpperCase(),
        discountAmount: result.discountAmount ?? 0,
        finalAmount: result.finalAmount ?? quoteData?.price ?? 0
      });
      setPromoCode("");
    } catch {
      setPromoError("Invalid or expired promo code.");
      setAppliedPromo(null);
    }
  };

  const handleGetQuote = async () => {
    const { pickupAddress, dropoffAddress, vehicleClass, passengers, pickupDate, pickupTime } = form.getValues();
    
    // Validate first step fields
    if (!pickupAddress || !dropoffAddress || !pickupDate || !pickupTime) {
      toast({ title: "Incomplete details", description: "Please fill all route details.", variant: "destructive" });
      return;
    }

    const isoDate = new Date(`${format(pickupDate, 'yyyy-MM-dd')}T${pickupTime}:00`).toISOString();

    try {
      const result = await getQuote.mutateAsync({
        data: {
          pickupAddress,
          dropoffAddress,
          vehicleClass: vehicleClass as QuoteRequestVehicleClass,
          passengers,
          pickupAt: isoDate
        }
      });
      setQuoteData({
        price: result.estimatedPrice,
        duration: result.estimatedDuration,
        distance: result.estimatedDistance
      });
      setStep(2);
    } catch (err: any) {
      toast({ title: "Quote Failed", description: err?.message || "Could not retrieve quote.", variant: "destructive" });
    }
  };

  const handleConfirm = async (data: BookingFormValues) => {
    if (!quoteData) return;

    const isoDate = new Date(`${format(data.pickupDate, 'yyyy-MM-dd')}T${data.pickupTime}:00`).toISOString();

    try {
      const result = await createBooking.mutateAsync({
        data: {
          pickupAddress: data.pickupAddress,
          dropoffAddress: data.dropoffAddress,
          vehicleClass: data.vehicleClass as CreateBookingBodyVehicleClass,
          passengers: data.passengers,
          pickupAt: isoDate,
          passengerName: data.passengerName,
          passengerEmail: data.passengerEmail,
          passengerPhone: data.passengerPhone,
          flightNumber: data.flightNumber || undefined,
          specialRequests: data.specialRequests || undefined,
          priceQuoted: finalPrice,
          promoCode: appliedPromo?.code || undefined,
          promoDiscount: appliedPromo?.discountAmount || undefined,
          userId: user?.id || undefined
        }
      });
      
      toast({ title: "Booking Confirmed", description: "Your vehicle has been reserved." });
      setLocation(`/booking-confirmation/${result.id}`);
    } catch (err: any) {
      toast({ title: "Booking Failed", description: err?.message || "An error occurred.", variant: "destructive" });
    }
  };

  const selectedVehicle = VEHICLE_CLASSES.find(v => v.id === form.watch("vehicleClass"));

  return (
    <div className="min-h-screen bg-[#050505] pt-32 pb-24">
      <div className="container mx-auto px-6 max-w-4xl">
        <h1 className="text-4xl font-serif text-white mb-2 uppercase tracking-widest text-center">Reserve Vehicle</h1>
        <div className="flex justify-center items-center space-x-4 mb-12 text-sm">
          <span className={step >= 1 ? "text-primary" : "text-gray-600"}>Route & Vehicle</span>
          <span className="text-gray-600">→</span>
          <span className={step >= 2 ? "text-primary" : "text-gray-600"}>Details</span>
          <span className="text-gray-600">→</span>
          <span className={step >= 3 ? "text-primary" : "text-gray-600"}>Review & Confirm</span>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleConfirm)} className="space-y-8 bg-black border border-white/10 p-8 md:p-12 shadow-2xl relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-30"></div>

            {/* STEP 1: ROUTE & VEHICLE */}
            <div className={step !== 1 ? "hidden" : "space-y-8"}>
              <h2 className="text-2xl font-serif text-white border-b border-white/10 pb-4">Trip Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField control={form.control} name="pickupAddress" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-400 uppercase tracking-widest text-xs">Pickup Location</FormLabel>
                    <FormControl>
                      <Input placeholder="FLL, MIA, PBI or Address" className="bg-white/5 border-white/10 text-white rounded-none h-12" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="dropoffAddress" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-400 uppercase tracking-widest text-xs">Dropoff Location</FormLabel>
                    <FormControl>
                      <Input placeholder="Address or Airport Code" className="bg-white/5 border-white/10 text-white rounded-none h-12" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField control={form.control} name="pickupDate" render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="text-gray-400 uppercase tracking-widest text-xs">Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant="outline" className={`w-full bg-white/5 border-white/10 text-white rounded-none h-12 justify-start text-left font-normal ${!field.value && "text-muted-foreground"}`}>
                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 bg-black border-white/20" align="start">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date < new Date()} initialFocus />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="pickupTime" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-400 uppercase tracking-widest text-xs">Time (24h)</FormLabel>
                    <FormControl>
                      <Input type="time" className="bg-white/5 border-white/10 text-white rounded-none h-12" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="passengers" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-400 uppercase tracking-widest text-xs">Passengers</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={String(field.value)}>
                      <FormControl>
                        <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-none h-12">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-black border-white/20 text-white">
                        {[1,2,3,4,5,6,7,8,9,10].map(n => (
                          <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="space-y-4">
                <p className="text-gray-400 uppercase tracking-widest text-xs block">Vehicle Class</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {VEHICLE_CLASSES.map(vehicle => (
                    <div 
                      key={vehicle.id}
                      onClick={() => form.setValue("vehicleClass", vehicle.id as any)}
                      className={`cursor-pointer border p-4 transition-all ${form.watch("vehicleClass") === vehicle.id ? "border-primary bg-primary/5" : "border-white/10 bg-white/5 hover:border-white/30"}`}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-serif text-lg text-white">{vehicle.name}</span>
                        {form.watch("vehicleClass") === vehicle.id && <CheckCircle2 className="text-primary w-5 h-5" />}
                      </div>
                      <p className="text-xs text-gray-500 uppercase tracking-widest">Up to {vehicle.passengers} Pax • {vehicle.bags} Bags</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button type="button" onClick={handleGetQuote} disabled={getQuote.isPending} className="bg-primary text-black hover:bg-primary/90 font-medium uppercase tracking-widest text-sm px-10 py-6 rounded-none">
                  {getQuote.isPending ? <Loader2 className="animate-spin w-5 h-5" /> : "Continue to Details"}
                </Button>
              </div>
            </div>

            {/* STEP 2: PASSENGER DETAILS */}
            <div className={step !== 2 ? "hidden" : "space-y-8"}>
              <h2 className="text-2xl font-serif text-white border-b border-white/10 pb-4">Passenger Details</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField control={form.control} name="passengerName" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-400 uppercase tracking-widest text-xs">Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" className="bg-white/5 border-white/10 text-white rounded-none h-12" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="passengerEmail" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-400 uppercase tracking-widest text-xs">Email</FormLabel>
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
                      <Input placeholder="+1 (555) 000-0000" className="bg-white/5 border-white/10 text-white rounded-none h-12" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="flightNumber" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-400 uppercase tracking-widest text-xs">Flight Number (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. AA1234" className="bg-white/5 border-white/10 text-white rounded-none h-12" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="specialRequests" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-gray-400 uppercase tracking-widest text-xs">Special Requests (Optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Child seat, specific beverage preference, etc." className="bg-white/5 border-white/10 text-white rounded-none min-h-[100px] resize-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="flex justify-between pt-4 border-t border-white/10">
                <Button type="button" variant="outline" onClick={() => setStep(1)} className="border-white/20 text-white hover:bg-white hover:text-black rounded-none uppercase tracking-widest text-xs px-6">
                  Back
                </Button>
                <Button type="button" onClick={() => form.trigger().then(valid => { if (valid) setStep(3); })} className="bg-primary text-black hover:bg-primary/90 font-medium uppercase tracking-widest text-sm px-10 py-6 rounded-none">
                  Review Booking
                </Button>
              </div>
            </div>

            {/* STEP 3: REVIEW */}
            <div className={step !== 3 ? "hidden" : "space-y-8"}>
              <h2 className="text-2xl font-serif text-white border-b border-white/10 pb-4">Review & Confirm</h2>
              
              <div className="bg-white/5 border border-white/10 p-6 flex flex-col md:flex-row justify-between items-start md:items-center">
                <div>
                  <h3 className="text-xl font-serif text-white mb-2">Flat Rate Quote</h3>
                  <p className="text-sm text-gray-400 mb-1">Estimated Distance: <span className="text-white">{quoteData?.distance.toFixed(1)} miles</span></p>
                  <p className="text-sm text-gray-400">Estimated Duration: <span className="text-white">{quoteData?.duration} minutes</span></p>
                </div>
                <div className="mt-4 md:mt-0 text-right">
                  {appliedPromo && (
                    <p className="text-sm text-gray-500 line-through mb-1">${quoteData?.price.toFixed(2)}</p>
                  )}
                  <p className="text-4xl font-serif text-primary">${finalPrice.toFixed(2)}</p>
                  {appliedPromo && (
                    <p className="text-xs text-green-400 uppercase tracking-widest mt-1">
                      ${appliedPromo.discountAmount.toFixed(2)} discount applied
                    </p>
                  )}
                  {!appliedPromo && (
                    <p className="text-xs text-gray-500 uppercase tracking-widest mt-1">All Inclusive</p>
                  )}
                </div>
              </div>

              {/* Promo Code */}
              <div className="border border-white/10 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Tag className="w-4 h-4 text-primary" />
                  <span className="text-sm uppercase tracking-widest text-gray-400">Promo Code</span>
                </div>
                {appliedPromo ? (
                  <div className="flex items-center justify-between bg-primary/10 border border-primary/30 px-4 py-3">
                    <span className="text-primary font-mono text-sm">{appliedPromo.code}</span>
                    <button
                      type="button"
                      onClick={() => setAppliedPromo(null)}
                      className="text-gray-500 hover:text-white transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      value={promoCode}
                      onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoError(""); }}
                      placeholder="ROYAL10"
                      className="bg-white/5 border-white/10 text-white rounded-none h-11 font-mono uppercase placeholder:normal-case placeholder:font-sans"
                      onKeyDown={e => e.key === "Enter" && (e.preventDefault(), handleApplyPromo())}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleApplyPromo}
                      disabled={validatePromo.isPending || !promoCode.trim()}
                      className="border-white/20 text-white hover:bg-white hover:text-black rounded-none uppercase tracking-widest text-xs px-6 whitespace-nowrap"
                    >
                      {validatePromo.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
                    </Button>
                  </div>
                )}
                {promoError && <p className="text-xs text-red-400 mt-2">{promoError}</p>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
                <div>
                  <h4 className="text-primary uppercase tracking-widest text-xs mb-4">Trip Itinerary</h4>
                  <div className="space-y-3 text-gray-300">
                    <p><strong className="text-white w-24 inline-block">From:</strong> {form.getValues("pickupAddress")}</p>
                    <p><strong className="text-white w-24 inline-block">To:</strong> {form.getValues("dropoffAddress")}</p>
                    <p><strong className="text-white w-24 inline-block">Date:</strong> {form.getValues("pickupDate") ? format(form.getValues("pickupDate"), "PPP") : ""} at {form.getValues("pickupTime")}</p>
                    <p><strong className="text-white w-24 inline-block">Vehicle:</strong> {selectedVehicle?.name}</p>
                  </div>
                </div>
                <div>
                  <h4 className="text-primary uppercase tracking-widest text-xs mb-4">Passenger</h4>
                  <div className="space-y-3 text-gray-300">
                    <p><strong className="text-white w-24 inline-block">Name:</strong> {form.getValues("passengerName")}</p>
                    <p><strong className="text-white w-24 inline-block">Contact:</strong> {form.getValues("passengerPhone")}</p>
                    <p><strong className="text-white w-24 inline-block">Email:</strong> {form.getValues("passengerEmail")}</p>
                    {form.getValues("flightNumber") && <p><strong className="text-white w-24 inline-block">Flight:</strong> {form.getValues("flightNumber")}</p>}
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-8 border-t border-white/10">
                <Button type="button" variant="outline" onClick={() => setStep(2)} className="border-white/20 text-white hover:bg-white hover:text-black rounded-none uppercase tracking-widest text-xs px-6">
                  Edit Details
                </Button>
                <Button type="submit" disabled={createBooking.isPending} className="bg-primary text-black hover:bg-primary/90 font-medium uppercase tracking-widest text-sm px-10 py-6 rounded-none">
                  {createBooking.isPending ? <Loader2 className="animate-spin w-5 h-5 mr-2" /> : null}
                  Confirm Reservation
                </Button>
              </div>
            </div>

          </form>
        </Form>
      </div>
    </div>
  );
}
