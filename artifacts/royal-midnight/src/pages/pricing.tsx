import { Link } from "wouter";

const pricingTiers = [
  {
    name: "Business Sedan",
    description: "Cadillac CT6 or similar",
    capacity: "Up to 3 passengers",
    baseRate: "$95",
    hourlyRate: "$85/hr",
    perMile: "$3.50",
    features: ["Wi-Fi", "Bottled Water", "Leather Interior"]
  },
  {
    name: "Luxury SUV",
    description: "Cadillac Escalade or similar",
    capacity: "Up to 6 passengers",
    baseRate: "$125",
    hourlyRate: "$110/hr",
    perMile: "$4.50",
    features: ["Extra Luggage Space", "Wi-Fi", "Bottled Water", "Leather Interior"]
  },
  {
    name: "First Class",
    description: "Mercedes-Benz S-Class or similar",
    capacity: "Up to 3 passengers",
    baseRate: "$150",
    hourlyRate: "$130/hr",
    perMile: "$5.50",
    features: ["Premium Rear Seating", "Wi-Fi", "Bottled Water", "Massage Seats"]
  },
  {
    name: "Executive Van",
    description: "Mercedes-Benz Sprinter",
    capacity: "Up to 14 passengers",
    baseRate: "$200",
    hourlyRate: "$175/hr",
    perMile: "$6.50",
    features: ["Group Travel", "Wi-Fi", "Bottled Water", "Standing Room"]
  }
];

export default function Pricing() {
  return (
    <div className="py-24">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="text-center mb-16">
          <h1 className="font-serif text-4xl md:text-6xl mb-6">Transparent Pricing</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            No surge pricing. No hidden fees. Just uncompromising quality at clear, predictable rates.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-24">
          {pricingTiers.map((tier) => (
            <div key={tier.name} className="bg-card border border-border rounded-lg p-6 flex flex-col">
              <h3 className="font-serif text-2xl mb-2">{tier.name}</h3>
              <p className="text-muted-foreground text-sm mb-4">{tier.description}</p>
              
              <div className="mb-6 pb-6 border-b border-border">
                <div className="text-3xl font-bold text-primary mb-1">{tier.baseRate}</div>
                <div className="text-sm text-muted-foreground">Base transfer rate</div>
              </div>
              
              <div className="space-y-3 mb-8 flex-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Hourly:</span>
                  <span>{tier.hourlyRate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Per Mile:</span>
                  <span>{tier.perMile}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Capacity:</span>
                  <span>{tier.capacity}</span>
                </div>
              </div>
              
              <Link 
                href={`/book?class=${tier.name.toLowerCase().replace(' ', '_')}`}
                className="w-full inline-flex items-center justify-center rounded-md text-sm font-medium border border-primary text-primary hover:bg-primary hover:text-primary-foreground h-10 transition-colors"
              >
                Book Now
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
