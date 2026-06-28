import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Link } from "wouter";
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
          <Accordion type="single" collapsible className="w-full">
            {FAQ_ITEMS.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger className="text-left font-serif text-lg">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-base leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
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
