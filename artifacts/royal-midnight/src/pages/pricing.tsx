import { Link } from "wouter";
import { Loader2 } from "lucide-react";
import { useListPricingRules } from "@workspace/api-client-react";
import { PageSeo } from "@/components/PageSeo";

export default function Pricing() {
  const { data, isLoading } = useListPricingRules();

  const tiers = (data ?? [])
    .filter(r => r.isActive && r.vehicleClass && r.name && r.passengers != null)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  return (
    <div className="py-24">
      <PageSeo
        title="Pricing & Rates | Flat-Rate Luxury Black Car Service South Florida"
        description="Transparent flat-rate pricing for Royal Midnight's luxury black car service in South Florida. No surge pricing, no hidden fees. See exact rates for airport transfers and hourly chauffeur."
        path="/pricing"
      />
      <div className="container mx-auto max-w-6xl px-4">
        <div className="text-center mb-16">
          <h1 className="font-serif text-4xl md:text-6xl mb-6">Transparent Pricing</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            No surge pricing. No hidden fees. Just uncompromising quality at clear, predictable rates.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-24">
          {tiers.map((tier) => (
            <div key={tier.id} className="bg-card border border-border rounded-lg p-6 flex flex-col">
              <h3 className="font-serif text-2xl mb-2">{tier.name}</h3>
              <p className="text-muted-foreground text-sm mb-4">{tier.description}</p>

              <div className="mb-6 pb-6 border-b border-border">
                <div className="text-3xl font-bold text-primary mb-1">${tier.baseFare.toFixed(0)}</div>
                <div className="text-sm text-muted-foreground">Base transfer rate</div>
              </div>

              <div className="space-y-3 mb-8 flex-1 text-sm">
                {tier.hourlyRate != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Hourly:</span>
                    <span>${tier.hourlyRate.toFixed(0)}/hr</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Per Mile:</span>
                  <span>${tier.ratePerMile.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Capacity:</span>
                  <span>Up to {tier.passengers} passengers</span>
                </div>
              </div>

              <Link
                href={`/book?class=${tier.vehicleClass}`}
                className="w-full inline-flex items-center justify-center rounded-md text-sm font-medium border border-primary text-primary hover:bg-primary hover:text-primary-foreground h-10 transition-colors"
              >
                Book Now
              </Link>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}
