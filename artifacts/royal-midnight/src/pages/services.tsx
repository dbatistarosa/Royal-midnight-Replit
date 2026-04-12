import { Link } from "wouter";
import { Plane, Clock, Briefcase, GlassWater, ArrowRight } from "lucide-react";
import { PageSeo } from "@/components/PageSeo";
import { Helmet } from "react-helmet-async";

const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "How do I book a Royal Midnight ride?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "You can book online at royalmidnight.com/book in minutes. Simply enter your pickup and dropoff locations, select your date and time, choose a vehicle, and confirm your reservation. You'll receive an email confirmation with full details."
      }
    },
    {
      "@type": "Question",
      "name": "What airports does Royal Midnight serve?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Royal Midnight provides luxury airport transfer service to and from Fort Lauderdale-Hollywood International (FLL), Miami International (MIA), and Palm Beach International (PBI). We track all flights in real time."
      }
    },
    {
      "@type": "Question",
      "name": "Is the pricing flat-rate or metered?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "All Royal Midnight rides are flat-rate with no surge pricing, hidden fees, or meters. The price you are quoted when you book is exactly what you pay — guaranteed."
      }
    },
    {
      "@type": "Question",
      "name": "What is the cancellation policy?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Cancellations made more than 24 hours before pickup receive a full refund. Cancellations within 24 hours incur a 25% fee. No-shows are charged 50% of the fare. Please contact us as early as possible if your plans change."
      }
    },
    {
      "@type": "Question",
      "name": "What areas does Royal Midnight serve?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "We serve all of South Florida including Miami, Miami Beach, Fort Lauderdale, Boca Raton, West Palm Beach, and surrounding communities. We also offer long-distance transfers throughout Florida."
      }
    },
    {
      "@type": "Question",
      "name": "Do you offer corporate accounts?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. Royal Midnight provides dedicated corporate accounts with streamlined invoicing, account management, and priority service. Contact us at concierge@royalmidnight.com to set up a corporate account."
      }
    }
  ]
};

const services = [
  {
    id: "airport-transfers",
    title: "Airport Transfers",
    description: "Seamless travel to and from FLL, MIA, and PBI with real-time flight tracking.",
    icon: Plane,
    href: "/services/airport-transfers"
  },
  {
    id: "hourly-chauffeur",
    title: "Hourly Chauffeur",
    description: "As-directed service giving you the ultimate flexibility for your day.",
    icon: Clock,
    href: "/services/hourly-chauffeur"
  },
  {
    id: "corporate",
    title: "Corporate Accounts",
    description: "Streamlined executive transportation with dedicated account management.",
    icon: Briefcase,
    href: "/services/corporate"
  },
  {
    id: "events",
    title: "Special Events",
    description: "Make a grand entrance at galas, weddings, and premium sporting events.",
    icon: GlassWater,
    href: "/services/events"
  }
];

export default function Services() {
  return (
    <div className="py-24">
      <PageSeo
        title="Our Services — Luxury Transportation"
        description="Royal Midnight offers airport transfers, hourly chauffeur service, corporate accounts, and special event transportation across South Florida. Flat-rate luxury rides, no surge pricing."
        path="/services"
      />
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(FAQ_JSON_LD)}</script>
      </Helmet>
      <div className="container mx-auto max-w-6xl px-4">
        <div className="text-center mb-16">
          <h1 className="font-serif text-3xl sm:text-4xl md:text-6xl mb-6">Our Services</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Tailored transportation solutions designed for those who demand excellence in every journey.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {services.map((service) => {
            const Icon = service.icon;
            return (
              <Link 
                key={service.id} 
                href={service.href}
                className="group block bg-card border border-border rounded-lg p-8 hover:border-primary transition-colors"
              >
                <div className="flex items-start justify-between mb-6">
                  <div className="bg-background border border-border p-4 rounded-full">
                    <Icon className="w-8 h-8 text-primary" />
                  </div>
                  <ArrowRight className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <h3 className="font-serif text-2xl mb-4 group-hover:text-primary transition-colors">{service.title}</h3>
                <p className="text-muted-foreground text-lg">{service.description}</p>
              </Link>
            );
          })}
        </div>

        <div className="mt-24 text-center bg-card border border-border rounded-lg p-12">
          <h2 className="font-serif text-3xl mb-6">Ready to Experience Royal Midnight?</h2>
          <Link 
            href="/book" 
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-8"
          >
            Book Now
          </Link>
        </div>
      </div>
    </div>
  );
}
