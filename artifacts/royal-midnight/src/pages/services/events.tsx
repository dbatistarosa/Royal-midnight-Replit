import { GlassWater, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";

export default function Events() {
  return (
    <div className="py-24">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="max-w-3xl mb-16">
          <Link href="/services" className="text-primary hover:underline mb-6 inline-block">&larr; Back to Services</Link>
          <h1 className="font-serif text-4xl md:text-6xl mb-6">Special Events</h1>
          <p className="text-xl text-muted-foreground">
            Make a flawless entrance. Premium transportation for life's most significant moments.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-12 items-start mb-16">
          <div>
            <h2 className="font-serif text-2xl mb-6">Elevate the Occasion</h2>
            <p className="text-muted-foreground mb-6">
              When the event demands perfection, Royal Midnight delivers. From galas and premieres to weddings and high-profile sporting events in Miami, our fleet ensures your arrival is as memorable as the event itself.
            </p>
            <p className="text-muted-foreground mb-6">
              We handle the logistics of traffic, parking, and timing, allowing you to immerse yourself entirely in the experience.
            </p>
          </div>

          <div className="bg-card border border-border p-8 rounded-lg">
            <GlassWater className="w-12 h-12 text-primary mb-6" />
            <h3 className="font-serif text-2xl mb-6">Ideal for:</h3>
            <ul className="space-y-4">
              {[
                "Art Basel & VIP Art Events",
                "Charity Galas and Fundraisers",
                "Weddings & Anniversaries",
                "Miami Grand Prix & Sporting Events",
                "Concerts and Premieres"
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 pt-8 border-t border-border">
              <Link 
                href="/book?service=event" 
                className="w-full inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-8"
              >
                Book Event Transportation
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
