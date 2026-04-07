import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Link } from "wouter";

const faqs = [
  {
    question: "What is your cancellation policy?",
    answer: "Cancellations made 24 hours prior to the scheduled pickup time are fully refundable. Cancellations within 24 hours may be subject to a fee. No-shows are charged the full fare."
  },
  {
    question: "How do I find my chauffeur at the airport?",
    answer: "Your chauffeur will meet you in the arrivals hall holding a customized digital name sign. For expedited service, curbside pickup is also available upon request."
  },
  {
    question: "What if my flight is delayed?",
    answer: "We track all incoming flights in real-time. If your flight is delayed, your chauffeur's arrival time will be adjusted automatically at no additional charge."
  },
  {
    question: "Do you provide child seats?",
    answer: "Yes, premium child safety seats can be provided upon request at the time of booking. Please specify the age and weight of the child."
  },
  {
    question: "Can I make multiple stops?",
    answer: "Yes, multiple stops can be arranged. For maximum flexibility with numerous stops, we recommend booking our Hourly Chauffeur service."
  }
];

export default function FAQ() {
  return (
    <div className="py-24 min-h-screen">
      <div className="container mx-auto max-w-3xl px-4">
        <div className="text-center mb-16">
          <h1 className="font-serif text-3xl sm:text-4xl md:text-6xl mb-6">Frequently Asked Questions</h1>
          <p className="text-xl text-muted-foreground">
            Everything you need to know about the Royal Midnight experience.
          </p>
        </div>

        <div className="bg-card border border-border p-8 rounded-lg">
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
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
