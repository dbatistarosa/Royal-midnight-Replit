import { Building2, Shield, Star, Clock } from "lucide-react";

export default function About() {
  return (
    <div className="py-24">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="text-center mb-16">
          <h1 className="font-serif text-4xl md:text-6xl mb-6">About Royal Midnight</h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            The premier luxury black car service of South Florida. 
            Discreet, impeccable, and always on time.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-12 items-center mb-24">
          <div>
            <h2 className="font-serif text-3xl mb-6">Our Mission</h2>
            <p className="text-muted-foreground mb-4">
              Founded on the principles of uncompromising quality and absolute discretion, 
              Royal Midnight was established to serve the exacting standards of South Florida's elite.
            </p>
            <p className="text-muted-foreground">
              We don't just provide transportation; we provide peace of mind. Every vehicle in our 
              meticulously maintained fleet is a sanctuary, and every chauffeur is a trained professional 
              dedicated to your comfort and security.
            </p>
          </div>
          <div className="bg-card border border-border p-8 rounded-lg">
            <h3 className="font-serif text-2xl mb-6 text-primary">The Royal Standard</h3>
            <ul className="space-y-4">
              {[
                "Immaculate late-model luxury vehicles",
                "Professionally trained, background-checked chauffeurs",
                "Strict confidentiality and privacy protocols",
                "Real-time flight tracking and adjustment",
                "24/7 dedicated concierge support"
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <Star className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-card border border-border p-8 rounded-lg text-center">
            <Shield className="w-12 h-12 text-primary mx-auto mb-6" />
            <h3 className="font-serif text-xl mb-4">Uncompromising Safety</h3>
            <p className="text-muted-foreground">
              Rigorous vehicle maintenance schedules and exhaustive chauffeur vetting ensure your journey is always secure.
            </p>
          </div>
          <div className="bg-card border border-border p-8 rounded-lg text-center">
            <Clock className="w-12 h-12 text-primary mx-auto mb-6" />
            <h3 className="font-serif text-xl mb-4">Absolute Punctuality</h3>
            <p className="text-muted-foreground">
              To be early is to be on time. We guarantee arrival 15 minutes prior to your scheduled departure.
            </p>
          </div>
          <div className="bg-card border border-border p-8 rounded-lg text-center">
            <Building2 className="w-12 h-12 text-primary mx-auto mb-6" />
            <h3 className="font-serif text-xl mb-4">Corporate Excellence</h3>
            <p className="text-muted-foreground">
              Dedicated account managers and streamlined billing for our corporate and high-volume clients.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
