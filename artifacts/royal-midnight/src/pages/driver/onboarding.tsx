import { LayoutDashboard, History, DollarSign, User, CalendarRange } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function DriverOnboarding() {
  const [step, setStep] = useState(1);

  return (
    <div className="min-h-screen bg-background py-12">
      <div className="container max-w-2xl mx-auto px-4">
        <div className="mb-12 text-center">
          <h1 className="font-serif text-4xl mb-4">Chauffeur Onboarding</h1>
          <p className="text-muted-foreground">Join the elite fleet of Royal Midnight.</p>
        </div>

        <div className="flex justify-between mb-8 relative">
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-border -z-10 -translate-y-1/2"></div>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step >= i ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground border border-border'}`}>
              {i}
            </div>
          ))}
        </div>

        <div className="bg-card border border-border rounded-lg p-8">
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="font-serif text-2xl mb-4">Personal Information</h2>
              <div className="grid gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Full Legal Name</label>
                  <Input placeholder="John Doe" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Email</label>
                  <Input placeholder="john@example.com" type="email" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Phone Number</label>
                  <Input placeholder="(555) 000-0000" />
                </div>
              </div>
              <Button className="w-full mt-6" onClick={() => setStep(2)}>Next Step</Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <h2 className="font-serif text-2xl mb-4">License & Certification</h2>
              <div className="grid gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Driver's License Number</label>
                  <Input placeholder="A1234567" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Chauffeur License/Hack Badge</label>
                  <Input placeholder="H-98765" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Expiration Date</label>
                  <Input type="date" />
                </div>
              </div>
              <div className="flex gap-4 mt-6">
                <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>Back</Button>
                <Button className="flex-1" onClick={() => setStep(3)}>Next Step</Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <h2 className="font-serif text-2xl mb-4">Vehicle Information (Optional)</h2>
              <p className="text-sm text-muted-foreground mb-4">If you are an independent operator with your own luxury vehicle, please provide details. Otherwise, skip.</p>
              <div className="grid gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Vehicle Make & Model</label>
                  <Input placeholder="Mercedes-Benz S-Class" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Year & Color</label>
                  <Input placeholder="2023, Black" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">License Plate</label>
                  <Input placeholder="RMLUX-1" />
                </div>
              </div>
              <div className="flex gap-4 mt-6">
                <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>Back</Button>
                <Button className="flex-1" onClick={() => setStep(4)}>Complete</Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-primary/20 text-primary rounded-full flex items-center justify-center mx-auto mb-6">
                <CalendarRange className="w-8 h-8" />
              </div>
              <h2 className="font-serif text-2xl mb-4">Application Submitted</h2>
              <p className="text-muted-foreground mb-8">
                Thank you for applying to Royal Midnight. Our fleet management team will review your application and contact you within 48 hours to schedule an interview.
              </p>
              <Link href="/driver/dashboard" className="text-primary hover:underline font-medium">
                Go to Dashboard (Mock)
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
