import { useState, useRef, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, ChevronLeft, ArrowRight, Loader2, Car, User, MapPin, FileText, Upload, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";
import { API_BASE } from "@/lib/constants";
import { useUpload } from "@workspace/object-storage-web";

type CatalogEntry = {
  id: number;
  make: string;
  model: string;
  minYear: number;
  vehicleTypes: string;
  isActive: boolean;
};

const CURRENT_YEAR = new Date().getFullYear();

type DocUploadFieldProps = {
  label: string;
  hint?: string;
  accept?: string;
  objectPath: string | null;
  onChange: (path: string | null) => void;
};

function DocUploadField({ label, hint, accept = "image/*,.pdf", objectPath, onChange }: DocUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const { uploadFile, isUploading, progress } = useUpload({
    basePath: `${API_BASE}/storage`,
    onSuccess: (res) => {
      onChange(res.objectPath);
    },
    onError: (err) => {
      console.error("Upload error:", err);
    },
  });

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    await uploadFile(file);
  };

  const handleRemove = () => {
    onChange(null);
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      <p className="text-gray-400 uppercase tracking-widest text-xs">{label}</p>
      {hint && <p className="text-gray-600 text-xs">{hint}</p>}

      {objectPath ? (
        <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 p-3">
          <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-white text-sm flex-1 truncate">{fileName ?? "Uploaded"}</span>
          <button type="button" onClick={handleRemove} className="text-gray-600 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="w-full border border-dashed border-white/15 hover:border-primary/40 bg-white/3 hover:bg-primary/5 transition-all p-5 flex flex-col items-center gap-2 group disabled:opacity-60"
        >
          {isUploading ? (
            <>
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
              <span className="text-xs text-gray-500">Uploading... {progress}%</span>
            </>
          ) : (
            <>
              <Upload className="w-5 h-5 text-gray-600 group-hover:text-primary transition-colors" />
              <span className="text-xs text-gray-500 group-hover:text-gray-300 transition-colors">
                Click to upload <span className="text-gray-700">— JPG, PNG, or PDF</span>
              </span>
            </>
          )}
        </button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}

const STEPS = [
  { num: 1, label: "Personal Info", icon: User },
  { num: 2, label: "Service Area", icon: MapPin },
  { num: 3, label: "Vehicle", icon: Car },
  { num: 4, label: "Documents", icon: FileText },
];

const step1Schema = z.object({
  name: z.string().min(2, "Full name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(10, "Phone number is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

const step2Schema = z.object({
  serviceArea: z.string().min(1, "Please select a service area"),
});

const step3Schema = z.object({
  vehicleYear: z.string().min(4, "Year is required"),
  vehicleMake: z.string().min(1, "Make is required"),
  vehicleModel: z.string().min(1, "Model is required"),
  vehicleClass: z.string().min(1, "Vehicle type is required"),
  vehicleColor: z.string().min(1, "Color is required"),
  passengerCapacity: z.coerce.number().min(1).max(10),
  luggageCapacity: z.coerce.number().min(0).max(10),
  hasCarSeat: z.boolean().optional(),
});

const step4Schema = z.object({
  licenseNumber: z.string().min(1, "License number is required"),
  licenseExpiry: z.string().min(1, "License expiry is required"),
  regVin: z.string().optional(),
  regPlate: z.string().optional(),
  regExpiry: z.string().optional(),
  insuranceExpiry: z.string().optional(),
});

type Step1Values = z.infer<typeof step1Schema>;
type Step2Values = z.infer<typeof step2Schema>;
type Step3Values = z.infer<typeof step3Schema>;
type Step4Values = z.infer<typeof step4Schema>;

const inputClass = "bg-white/5 border-white/10 text-white rounded-none h-12 focus:border-primary placeholder:text-gray-600";
const labelClass = "text-gray-400 uppercase tracking-widest text-xs";

export default function DriverOnboarding() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { login } = useAuth();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Steps 1-3 store data locally; Step 4 submits all data atomically
  const [step1Data, setStep1Data] = useState<Step1Values | null>(null);
  const [step2Data, setStep2Data] = useState<Step2Values | null>(null);
  const [step3Data, setStep3Data] = useState<Step3Values | null>(null);

  const [profilePicPath, setProfilePicPath] = useState<string | null>(null);
  const [licenseDocPath, setLicenseDocPath] = useState<string | null>(null);
  const [regDocPath, setRegDocPath] = useState<string | null>(null);
  const [insuranceDocPath, setInsuranceDocPath] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/vehicle-catalog`)
      .then(r => r.ok ? r.json() as Promise<CatalogEntry[]> : Promise.resolve([]))
      .then(data => setCatalog(Array.isArray(data) ? data : []))
      .catch(() => setCatalog([]));
  }, []);

  const form1 = useForm<Step1Values>({ resolver: zodResolver(step1Schema), defaultValues: { name: "", email: "", phone: "", password: "", confirmPassword: "" } });
  const form2 = useForm<Step2Values>({ resolver: zodResolver(step2Schema), defaultValues: { serviceArea: "" } });
  const form3 = useForm<Step3Values>({ resolver: zodResolver(step3Schema), defaultValues: { vehicleYear: "", vehicleMake: "", vehicleModel: "", vehicleClass: "", vehicleColor: "", passengerCapacity: 4, luggageCapacity: 3, hasCarSeat: false } });
  const form4 = useForm<Step4Values>({ resolver: zodResolver(step4Schema), defaultValues: { licenseNumber: "", licenseExpiry: "", regVin: "", regPlate: "", regExpiry: "", insuranceExpiry: "" } });

  const watchedMake = form3.watch("vehicleMake");
  const watchedModel = form3.watch("vehicleModel");

  const availableMakes = [...new Set(catalog.map(e => e.make))].sort();
  const availableModels = catalog.filter(e => e.make === watchedMake).map(e => e.model).sort();
  const matchedEntry = catalog.find(e => e.make === watchedMake && e.model === watchedModel);
  const availableYears = matchedEntry
    ? Array.from({ length: CURRENT_YEAR - matchedEntry.minYear + 1 }, (_, i) => CURRENT_YEAR - i)
    : [];
  const availableTypes = matchedEntry ? matchedEntry.vehicleTypes.split(",").map(t => t.trim()).filter(Boolean) : [];

  // Reset downstream fields when Make changes
  useEffect(() => {
    form3.setValue("vehicleModel", "");
    form3.setValue("vehicleYear", "");
    form3.setValue("vehicleClass", "");
  }, [watchedMake]);

  // Reset year and type when Model changes
  useEffect(() => {
    form3.setValue("vehicleYear", "");
    form3.setValue("vehicleClass", "");
    // Auto-select type if only one available
    const entry = catalog.find(e => e.make === watchedMake && e.model === watchedModel);
    if (entry) {
      const types = entry.vehicleTypes.split(",").map(t => t.trim()).filter(Boolean);
      if (types.length === 1) form3.setValue("vehicleClass", types[0]);
    }
  }, [watchedModel]);

  const handleStep1 = form1.handleSubmit((data) => {
    setStep1Data(data);
    setStep(2);
  });

  const handleStep2 = form2.handleSubmit((data) => {
    setStep2Data(data);
    setStep(3);
  });

  const handleStep3 = form3.handleSubmit((data) => {
    setStep3Data(data);
    setStep(4);
  });

  // Step 4: Single atomic submission of all collected data
  const handleStep4 = form4.handleSubmit(async (step4Data) => {
    if (!step1Data || !step2Data || !step3Data) return;

    if (!licenseDocPath) {
      toast({ title: "Driver's License required", description: "Please upload a photo or scan of your driver's license.", variant: "destructive" });
      return;
    }
    if (!insuranceDocPath) {
      toast({ title: "Insurance Certificate required", description: "Please upload your car insurance certificate.", variant: "destructive" });
      return;
    }
    if (!regDocPath) {
      toast({ title: "Vehicle Registration required", description: "Please upload your vehicle registration document.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        name: step1Data.name,
        email: step1Data.email,
        phone: step1Data.phone,
        password: step1Data.password,
        serviceArea: step2Data.serviceArea,
        vehicleYear: step3Data.vehicleYear,
        vehicleMake: step3Data.vehicleMake,
        vehicleModel: step3Data.vehicleModel,
        vehicleClass: step3Data.vehicleClass,
        vehicleColor: step3Data.vehicleColor,
        passengerCapacity: Number(step3Data.passengerCapacity),
        luggageCapacity: Number(step3Data.luggageCapacity),
        hasCarSeat: Boolean(step3Data.hasCarSeat),
        licenseNumber: step4Data.licenseNumber,
        licenseExpiry: step4Data.licenseExpiry,
        licenseDoc: licenseDocPath,
        regVin: step4Data.regVin || "",
        regPlate: step4Data.regPlate || "",
        regExpiry: step4Data.regExpiry || "",
        regDoc: regDocPath,
        insuranceExpiry: step4Data.insuranceExpiry || "",
        insuranceDoc: insuranceDocPath,
        profilePicture: profilePicPath ?? undefined,
      };

      const res = await fetch(`${API_BASE}/auth/driver-register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json() as {
        token?: string;
        user?: { id: number; name: string; email: string; phone: string | null; role: "passenger" | "driver" | "admin" };
        error?: string;
      };

      if (!res.ok) {
        const isEmailTaken = data.error?.toLowerCase().includes("already registered");
        toast({
          title: isEmailTaken ? "Email already in use" : "Registration failed",
          description: isEmailTaken
            ? "An account exists for this email. Sign in to check your application status."
            : data.error || "Could not submit application.",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      if (data.token && data.user) {
        login({
          id: data.user.id,
          name: data.user.name,
          email: data.user.email,
          phone: data.user.phone ?? null,
          role: data.user.role,
        }, data.token);
      }

      setSubmitted(true);
    } catch {
      toast({ title: "Error", description: "Could not submit application. Please try again.", variant: "destructive" });
    }

    setIsSubmitting(false);
  });

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center px-6 pt-20 pb-16">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 border border-primary/30 bg-primary/10 flex items-center justify-center mx-auto mb-8">
            <CheckCircle2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-serif text-white mb-4">Application Submitted</h1>
          <p className="text-gray-400 text-sm leading-relaxed mb-2">
            Thank you for applying to join the Royal Midnight fleet. Our team will review your credentials and vehicle details.
          </p>
          <p className="text-gray-500 text-sm leading-relaxed mb-6">
            You will be notified once your application is approved. This typically takes 1–2 business days.
          </p>
          <div className="bg-primary/5 border border-primary/20 p-4 mb-10 text-left">
            <p className="text-xs uppercase tracking-widest text-primary mb-1">Billing &amp; Payment</p>
            <p className="text-sm text-gray-400 leading-relaxed">
              Once your application is approved, you will receive an email with instructions for setting up your payment and billing information.
            </p>
          </div>
          <Button
            onClick={() => setLocation("/driver/dashboard")}
            className="bg-primary text-black hover:bg-primary/90 rounded-none uppercase tracking-widest text-xs px-10 h-12"
          >
            View Application Status
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505]">
      <div className="relative pt-28 pb-10 overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.15) 0%, transparent 70%)" }} />
        <div className="relative container mx-auto px-4 max-w-3xl text-center">
          <p className="text-xs uppercase tracking-[0.4em] text-primary mb-3">Join the Fleet</p>
          <h1 className="text-4xl md:text-5xl font-serif text-white mb-3">Chauffeur Application</h1>
          <p className="text-gray-500 text-sm">Complete all four steps to submit your application for review.</p>

          <div className="flex items-center justify-center mt-10 gap-0">
            {STEPS.map((s, i) => (
              <div key={s.num} className="flex items-center">
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`w-9 h-9 flex items-center justify-center text-xs font-medium transition-all duration-300
                    ${step > s.num ? "bg-primary text-black" : step === s.num ? "border-2 border-primary text-primary bg-primary/10" : "border border-white/15 text-white/25 bg-white/3"}`}>
                    {step > s.num ? <CheckCircle2 className="w-4 h-4" /> : s.num}
                  </div>
                  <span className={`text-[10px] uppercase tracking-[0.15em] hidden md:block transition-colors ${step === s.num ? "text-primary" : step > s.num ? "text-white/50" : "text-white/20"}`}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`h-px w-16 md:w-24 mx-3 mb-5 transition-colors duration-500 ${step > s.num ? "bg-primary/50" : "bg-white/8"}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-2xl pb-24">
        <div className="bg-[#0a0a0a] border border-white/8">
          <div className="h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

          {/* Step 1 — Personal Info */}
          {step === 1 && (
            <Form {...form1}>
              <form onSubmit={handleStep1} className="p-8 md:p-10 space-y-6">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-primary mb-1">Step 1 of 4</p>
                  <h2 className="text-2xl font-serif text-white">Personal Information</h2>
                </div>

                <div className="grid grid-cols-1 gap-5">
                  <FormField control={form1.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel className={labelClass}>Full Legal Name</FormLabel>
                      <FormControl><Input placeholder="John Smith" className={inputClass} {...field} /></FormControl>
                      <FormMessage className="text-red-400 text-xs" />
                    </FormItem>
                  )} />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <FormField control={form1.control} name="email" render={({ field }) => (
                      <FormItem>
                        <FormLabel className={labelClass}>Email Address</FormLabel>
                        <FormControl><Input type="email" placeholder="john@example.com" className={inputClass} {...field} /></FormControl>
                        <FormMessage className="text-red-400 text-xs" />
                      </FormItem>
                    )} />

                    <FormField control={form1.control} name="phone" render={({ field }) => (
                      <FormItem>
                        <FormLabel className={labelClass}>Phone Number</FormLabel>
                        <FormControl><Input type="tel" placeholder="+1 (305) 000-0000" className={inputClass} {...field} /></FormControl>
                        <FormMessage className="text-red-400 text-xs" />
                      </FormItem>
                    )} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <FormField control={form1.control} name="password" render={({ field }) => (
                      <FormItem>
                        <FormLabel className={labelClass}>Create Password</FormLabel>
                        <FormControl><Input type="password" placeholder="Min. 6 characters" className={inputClass} {...field} /></FormControl>
                        <FormMessage className="text-red-400 text-xs" />
                      </FormItem>
                    )} />

                    <FormField control={form1.control} name="confirmPassword" render={({ field }) => (
                      <FormItem>
                        <FormLabel className={labelClass}>Confirm Password</FormLabel>
                        <FormControl><Input type="password" placeholder="Repeat password" className={inputClass} {...field} /></FormControl>
                        <FormMessage className="text-red-400 text-xs" />
                      </FormItem>
                    )} />
                  </div>
                </div>

                <div className="flex justify-between pt-2">
                  <Link href="/auth/login" className="text-gray-600 text-xs hover:text-gray-400 transition-colors flex items-center gap-1">
                    <ChevronLeft className="w-3 h-3" /> Already registered? Sign in
                  </Link>
                  <Button type="submit" className="bg-primary text-black hover:bg-primary/90 rounded-none uppercase tracking-[0.2em] text-xs px-10 h-11">
                    Continue <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </form>
            </Form>
          )}

          {/* Step 2 — Service Area */}
          {step === 2 && (
            <Form {...form2}>
              <form onSubmit={handleStep2} className="p-8 md:p-10 space-y-6">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-primary mb-1">Step 2 of 4</p>
                  <h2 className="text-2xl font-serif text-white">Service Area</h2>
                  <p className="text-sm text-gray-500 mt-1">Select the South Florida airport region you will primarily serve.</p>
                </div>

                <FormField control={form2.control} name="serviceArea" render={({ field }) => (
                  <FormItem>
                    <FormLabel className={labelClass}>Primary Service Area</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className={`${inputClass} [&>span]:text-white`}>
                          <SelectValue placeholder="Select area..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-[#0d0d0d] border-white/15 text-white">
                        <SelectItem value="FLL">FLL — Fort Lauderdale-Hollywood</SelectItem>
                        <SelectItem value="MIA">MIA — Miami International</SelectItem>
                        <SelectItem value="PBI">PBI — Palm Beach International</SelectItem>
                        <SelectItem value="all">All South Florida</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-red-400 text-xs" />
                  </FormItem>
                )} />

                <div className="grid grid-cols-3 gap-3 pt-2">
                  {[
                    { value: "FLL", label: "Fort Lauderdale", sub: "FLL" },
                    { value: "MIA", label: "Miami", sub: "MIA" },
                    { value: "PBI", label: "Palm Beach", sub: "PBI" },
                  ].map(a => {
                    const selected = form2.watch("serviceArea");
                    const isSelected = selected === a.value || selected === "all";
                    return (
                      <button
                        key={a.value}
                        type="button"
                        onClick={() => form2.setValue("serviceArea", a.value)}
                        className={`border p-4 text-left transition-all ${isSelected ? "border-primary/50 bg-primary/5" : "border-white/8 hover:border-white/20"}`}
                      >
                        <p className={`text-sm font-medium ${isSelected ? "text-primary" : "text-white"}`}>{a.sub}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{a.label}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="flex justify-between pt-2">
                  <Button type="button" variant="outline" onClick={() => setStep(1)} className="border-white/15 text-white/60 hover:text-white rounded-none uppercase tracking-widest text-xs px-6 h-11">
                    <ChevronLeft className="w-4 h-4 mr-1" /> Back
                  </Button>
                  <Button type="submit" className="bg-primary text-black hover:bg-primary/90 rounded-none uppercase tracking-[0.2em] text-xs px-10 h-11">
                    Continue <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </form>
            </Form>
          )}

          {/* Step 3 — Vehicle */}
          {step === 3 && (
            <Form {...form3}>
              <form onSubmit={handleStep3} className="p-8 md:p-10 space-y-6">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-primary mb-1">Step 3 of 4</p>
                  <h2 className="text-2xl font-serif text-white">Vehicle Information</h2>
                  <p className="text-sm text-gray-500 mt-1">Select your vehicle from the approved Royal Midnight fleet catalog.</p>
                </div>

                {catalog.length === 0 ? (
                  <div className="border border-amber-500/30 bg-amber-500/5 p-5 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-amber-300 font-medium text-sm">No approved vehicles in catalog</p>
                      <p className="text-gray-500 text-xs mt-1">Vehicle registration is temporarily unavailable. Please contact Royal Midnight to be notified when vehicle types are available.</p>
                    </div>
                  </div>
                ) : (
                <div className="grid grid-cols-1 gap-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form3.control} name="vehicleMake" render={({ field }) => (
                      <FormItem>
                        <FormLabel className={labelClass}>Make</FormLabel>
                        <Select value={field.value} onValueChange={v => { field.onChange(v); }}>
                          <FormControl>
                            <SelectTrigger className={`${inputClass} [&>span]:text-white`}>
                              <SelectValue placeholder="Select make..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-[#0d0d0d] border-white/15 text-white">
                            {availableMakes.map(make => (
                              <SelectItem key={make} value={make}>{make}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage className="text-red-400 text-xs" />
                      </FormItem>
                    )} />

                    <FormField control={form3.control} name="vehicleModel" render={({ field }) => (
                      <FormItem>
                        <FormLabel className={labelClass}>Model</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange} disabled={!watchedMake || availableModels.length === 0}>
                          <FormControl>
                            <SelectTrigger className={`${inputClass} [&>span]:text-white`}>
                              <SelectValue placeholder={watchedMake ? "Select model..." : "Select make first"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-[#0d0d0d] border-white/15 text-white">
                            {availableModels.map(model => (
                              <SelectItem key={model} value={model}>{model}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage className="text-red-400 text-xs" />
                      </FormItem>
                    )} />

                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form3.control} name="vehicleYear" render={({ field }) => (
                      <FormItem>
                        <FormLabel className={labelClass}>Year</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange} disabled={!watchedModel || availableYears.length === 0}>
                          <FormControl>
                            <SelectTrigger className={`${inputClass} [&>span]:text-white`}>
                              <SelectValue placeholder={watchedModel ? "Select year..." : "Select model first"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-[#0d0d0d] border-white/15 text-white">
                            {availableYears.map(y => (
                              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {matchedEntry && (
                          <p className="text-xs text-gray-500 mt-1">Accepted: {matchedEntry.minYear} – {CURRENT_YEAR}</p>
                        )}
                        <FormMessage className="text-red-400 text-xs" />
                      </FormItem>
                    )} />

                    <FormField control={form3.control} name="vehicleClass" render={({ field }) => (
                      <FormItem>
                        <FormLabel className={labelClass}>Vehicle Type</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange} disabled={!watchedModel || availableTypes.length === 0}>
                          <FormControl>
                            <SelectTrigger className={`${inputClass} [&>span]:text-white`}>
                              <SelectValue placeholder={watchedModel ? "Select type..." : "Select model first"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-[#0d0d0d] border-white/15 text-white">
                            {availableTypes.map(t => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage className="text-red-400 text-xs" />
                      </FormItem>
                    )} />
                  </div>

                  <FormField control={form3.control} name="vehicleColor" render={({ field }) => (
                    <FormItem>
                      <FormLabel className={labelClass}>Color</FormLabel>
                      <FormControl><Input placeholder="Black" className={inputClass} {...field} /></FormControl>
                      <FormMessage className="text-red-400 text-xs" />
                    </FormItem>
                  )} />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form3.control} name="passengerCapacity" render={({ field }) => (
                      <FormItem>
                        <FormLabel className={labelClass}>Passenger Capacity</FormLabel>
                        <Select value={String(field.value)} onValueChange={val => field.onChange(Number(val))}>
                          <FormControl>
                            <SelectTrigger className={`${inputClass} [&>span]:text-white`}>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-[#0d0d0d] border-white/15 text-white">
                            {[1,2,3,4,5,6,7,8].map(n => <SelectItem key={n} value={String(n)}>{n} passengers</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FormMessage className="text-red-400 text-xs" />
                      </FormItem>
                    )} />

                    <FormField control={form3.control} name="luggageCapacity" render={({ field }) => (
                      <FormItem>
                        <FormLabel className={labelClass}>Luggage Capacity</FormLabel>
                        <Select value={String(field.value)} onValueChange={val => field.onChange(Number(val))}>
                          <FormControl>
                            <SelectTrigger className={`${inputClass} [&>span]:text-white`}>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-[#0d0d0d] border-white/15 text-white">
                            {[0,1,2,3,4,5,6,7,8].map(n => <SelectItem key={n} value={String(n)}>{n} {n === 1 ? "bag" : "bags"}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FormMessage className="text-red-400 text-xs" />
                      </FormItem>
                    )} />
                  </div>

                  <FormField control={form3.control} name="hasCarSeat" render={({ field }) => (
                    <FormItem className="flex items-start gap-3">
                      <FormControl>
                        <Checkbox
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                          className="border-white/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary mt-0.5"
                        />
                      </FormControl>
                      <div>
                        <FormLabel className="text-sm text-white cursor-pointer">Child car seat available</FormLabel>
                        <p className="text-xs text-gray-500 mt-0.5">I can provide a compliant child safety seat upon request</p>
                      </div>
                    </FormItem>
                  )} />
                </div>
                )}

                <div className="flex justify-between pt-2">
                  <Button type="button" variant="outline" onClick={() => setStep(2)} className="border-white/15 text-white/60 hover:text-white rounded-none uppercase tracking-widest text-xs px-6 h-11">
                    <ChevronLeft className="w-4 h-4 mr-1" /> Back
                  </Button>
                  <Button type="submit" className="bg-primary text-black hover:bg-primary/90 rounded-none uppercase tracking-[0.2em] text-xs px-10 h-11">
                    Continue <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </form>
            </Form>
          )}

          {/* Step 4 — Documents */}
          {step === 4 && (
            <Form {...form4}>
              <form onSubmit={handleStep4} className="p-8 md:p-10 space-y-8">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-primary mb-1">Step 4 of 4</p>
                  <h2 className="text-2xl font-serif text-white">Documents</h2>
                  <p className="text-sm text-gray-500 mt-1">Provide your credentials for our compliance review.</p>
                </div>

                {/* Profile Photo */}
                <div className="space-y-4">
                  <p className="text-xs uppercase tracking-widest text-gray-500 pb-1 border-b border-white/8">Profile Photo <span className="text-gray-700">(optional)</span></p>
                  <p className="text-xs text-gray-600">A clear headshot helps passengers identify you. Professional attire preferred.</p>
                  <DocUploadField
                    label="Chauffeur Photo"
                    hint="JPG or PNG — your face should be clearly visible"
                    accept="image/jpeg,image/png,image/webp"
                    objectPath={profilePicPath}
                    onChange={setProfilePicPath}
                  />
                </div>

                {/* Driver's License */}
                <div className="space-y-4">
                  <p className="text-xs uppercase tracking-widest text-gray-500 pb-1 border-b border-white/8">Driver's License</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form4.control} name="licenseNumber" render={({ field }) => (
                      <FormItem>
                        <FormLabel className={labelClass}>License Number</FormLabel>
                        <FormControl><Input placeholder="A123456789" className={inputClass} {...field} /></FormControl>
                        <FormMessage className="text-red-400 text-xs" />
                      </FormItem>
                    )} />
                    <FormField control={form4.control} name="licenseExpiry" render={({ field }) => (
                      <FormItem>
                        <FormLabel className={labelClass}>Expiry Date</FormLabel>
                        <FormControl><Input type="date" className={inputClass} {...field} /></FormControl>
                        <FormMessage className="text-red-400 text-xs" />
                      </FormItem>
                    )} />
                  </div>
                  <DocUploadField
                    label="License Photo or Scan (required)"
                    hint="Front and/or back of your valid Florida driver's license"
                    objectPath={licenseDocPath}
                    onChange={setLicenseDocPath}
                  />
                </div>

                {/* Vehicle Registration */}
                <div className="space-y-4">
                  <p className="text-xs uppercase tracking-widest text-gray-500 pb-1 border-b border-white/8">Vehicle Registration</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField control={form4.control} name="regVin" render={({ field }) => (
                      <FormItem>
                        <FormLabel className={labelClass}>VIN</FormLabel>
                        <FormControl><Input placeholder="1GNSCBKC..." className={inputClass} {...field} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form4.control} name="regPlate" render={({ field }) => (
                      <FormItem>
                        <FormLabel className={labelClass}>Plate Number</FormLabel>
                        <FormControl><Input placeholder="ABC1234" className={inputClass} {...field} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form4.control} name="regExpiry" render={({ field }) => (
                      <FormItem>
                        <FormLabel className={labelClass}>Reg. Expiry</FormLabel>
                        <FormControl><Input type="date" className={inputClass} {...field} /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                  <DocUploadField
                    label="Registration Document (required)"
                    hint="Current vehicle registration certificate"
                    objectPath={regDocPath}
                    onChange={setRegDocPath}
                  />
                </div>

                {/* Insurance */}
                <div className="space-y-4">
                  <p className="text-xs uppercase tracking-widest text-gray-500 pb-1 border-b border-white/8">Insurance Certificate</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form4.control} name="insuranceExpiry" render={({ field }) => (
                      <FormItem>
                        <FormLabel className={labelClass}>Policy Expiry Date</FormLabel>
                        <FormControl><Input type="date" className={inputClass} {...field} /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                  <DocUploadField
                    label="Insurance Certificate (required)"
                    hint="Certificate of insurance showing minimum required liability coverage"
                    objectPath={insuranceDocPath}
                    onChange={setInsuranceDocPath}
                  />
                </div>

                <div className="bg-primary/5 border border-primary/15 p-4 text-xs text-gray-500">
                  All three documents are required. By submitting, you confirm all provided information is accurate and that you meet Royal Midnight's professional chauffeur standards.
                </div>

                <div className="flex justify-between pt-2">
                  <Button type="button" variant="outline" onClick={() => setStep(3)} className="border-white/15 text-white/60 hover:text-white rounded-none uppercase tracking-widest text-xs px-6 h-11">
                    <ChevronLeft className="w-4 h-4 mr-1" /> Back
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="bg-primary text-black hover:bg-primary/90 rounded-none uppercase tracking-[0.2em] text-xs px-10 h-11 shadow-[0_0_30px_rgba(201,168,76,0.2)]"
                  >
                    {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Submitting...</> : "Submit Application"}
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </div>
      </div>
    </div>
  );
}
