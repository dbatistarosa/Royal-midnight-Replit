import { Link } from "wouter";
import { ChevronDown } from "lucide-react";
import { PageSeo } from "@/components/PageSeo";
import { FAQ_ITEMS, SCHEMA } from "@/config/schema";

export default function FAQ() {
  return (
    <div className="py-24 min-h-screen">
      <PageSeo
        title="FAQ | Royal Midnight Luxury Black Car Service South Florida"
        description="Answers to common questions about Royal Midnight's luxury black car service in South Florida. Learn about flat-rate pricing, vehicle classes, booking, cancellation policy, and airport pickups."
        path="/faq"
        schema={SCHEMA.faq}
      />
      <div className="container mx-auto max-w-3xl px-4">
        <div className="text-center mb-16">
          <h1 className="font-serif text-3xl sm:text-4xl md:text-6xl mb-6">Frequently Asked Questions</h1>
          <p className="text-xl text-muted-foreground">
            Everything you need to know about the Royal Midnight experience.
          </p>
        </div>

        <div className="bg-card border border-border p-8 rounded-lg">
          <div className="w-full">
            {FAQ_ITEMS.map((faq, index) => (
              <details key={index} className="group border-b border-border last:border-b-0">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left font-serif text-lg transition-colors hover:text-primary [&::-webkit-details-marker]:hidden">
                  <span>{faq.question}</span>
                  <ChevronDown
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                  />
                </summary>
                <div className="pb-5 pr-8 text-base leading-relaxed text-muted-foreground">
                  {faq.answer}
                </div>
              </details>
            ))}
          </div>
        </div>

        <div className="mt-12 text-center">
          <p className="text-muted-foreground mb-4">Still have questions?</p>
          <Link href="/contact" className="text-primary hover:underline font-medium">
            Contact our Concierge Team
          </Link>
        </div>
      </div>
    </div>
  );
}
