import { Plane, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import { PageSeo } from "@/components/PageSeo";

export default function AirportTransfers() {
  return (
    <div className="py-24">
      <PageSeo
        title="Airport Transfers FLL, MIA & PBI | Luxury Black Car South Florida"
        description="Luxury airport transfers serving Fort Lauderdale (FLL), Miami (MIA), and Palm Beach (PBI). Flat-rate pricing, real-time flight tracking, professional meet & greet. Book your South Florida airport transfer."
        path="/services/airport-transfers"
      />
      <div className="container mx-auto max-w-6xl px-4">
        <div className="max-w-3xl mb-16">
          <Link href="/services" className="text-primary hover:underline mb-6 inline-block">&larr; Back to Services</Link>
          <h1 className="font-serif text-4xl md:text-6xl mb-6">Airport Transfers</h1>
          <p className="text-xl text-muted-foreground">
            Impeccable service to and from Miami International (MIA), Fort Lauderdale-Hollywood (FLL), and Palm Beach International (PBI) airports.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-12 items-start mb-16">
          <div>
            <h2 className="font-serif text-2xl mb-6">The Departure Experience</h2>
            <p className="text-muted-foreground mb-6">
              Begin your journey in absolute tranquility. Your chauffeur will arrive exactly 15 minutes before your scheduled departure time, assisting with luggage and ensuring a smooth, stress-free ride to the terminal.
            </p>
            
            <h2 className="font-serif text-2xl mb-6 mt-12">The Arrival Experience</h2>
            <p className="text-muted-foreground mb-6">
              We monitor your flight in real-time. Whether you land early or are delayed, your chauffeur will be waiting in the arrivals hall or curbside, ready to provide immediate relief from the chaos of travel.
            </p>
          </div>

          <div className="bg-card border border-border p-8 rounded-lg">
            <Plane className="w-12 h-12 text-primary mb-6" />
            <h3 className="font-serif text-2xl mb-6">Included in every transfer:</h3>
            <ul className="space-y-4">
              {[
                "Real-time flight tracking",
                "60 minutes complimentary wait time for arrivals",
                "Meet & Greet service in arrivals hall",
                "Luggage assistance",
                "Complimentary bottled water",
                "Wi-Fi equipped vehicles"
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 pt-8 border-t border-border">
              <Link 
                href="/book?service=airport" 
                className="w-full inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-8"
              >
                Book Airport Transfer
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
