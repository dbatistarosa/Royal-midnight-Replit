import { Link } from "wouter";
import { Plane, Clock, Briefcase, GlassWater, ArrowRight } from "lucide-react";

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
      <div className="container mx-auto max-w-6xl px-4">
        <div className="text-center mb-16">
          <h1 className="font-serif text-4xl md:text-6xl mb-6">Our Services</h1>
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
