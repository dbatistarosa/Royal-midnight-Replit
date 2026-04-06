import { Clock, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";

export default function HourlyChauffeur() {
  return (
    <div className="py-24">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="max-w-3xl mb-16">
          <Link href="/services" className="text-primary hover:underline mb-6 inline-block">&larr; Back to Services</Link>
          <h1 className="font-serif text-4xl md:text-6xl mb-6">Hourly Chauffeur</h1>
          <p className="text-xl text-muted-foreground">
            Ultimate flexibility. Keep a dedicated chauffeur and luxury vehicle at your disposal for as long as you need.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-12 items-start mb-16">
          <div>
            <h2 className="font-serif text-2xl mb-6">Unrestricted Freedom</h2>
            <p className="text-muted-foreground mb-6">
              Our as-directed hourly service is the pinnacle of convenience. Whether you have multiple meetings across Miami, a day of shopping in Palm Beach, or simply prefer the security of having your car waiting, this service adapts instantly to your changing schedule.
            </p>
            <p className="text-muted-foreground mb-6">
              Your chauffeur remains on standby, ready to proceed to your next destination the moment you are.
            </p>
          </div>

          <div className="bg-card border border-border p-8 rounded-lg">
            <Clock className="w-12 h-12 text-primary mb-6" />
            <h3 className="font-serif text-2xl mb-6">Perfect for:</h3>
            <ul className="space-y-4">
              {[
                "Multi-stop executive roadshows",
                "Real estate viewing tours",
                "Shopping excursions",
                "Dinner and entertainment",
                "Nights out in South Florida"
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 pt-8 border-t border-border">
              <Link 
                href="/book?service=hourly" 
                className="w-full inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-8"
              >
                Reserve Hourly Service
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
