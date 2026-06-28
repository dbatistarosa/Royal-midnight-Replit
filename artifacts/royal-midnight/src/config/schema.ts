const SITE_URL = "https://www.royalmidnight.com";
const BUSINESS_ID = `${SITE_URL}/#business`;

export const airportTransferSchema = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: "Luxury Airport Transfer Service South Florida",
  provider: { "@id": BUSINESS_ID },
  serviceType: "Black Car Airport Transfer",
  areaServed: ["Fort Lauderdale", "Miami", "Palm Beach", "Boca Raton"],
  description:
    "Flat-rate luxury black car airport transfers to and from Fort Lauderdale-Hollywood International (FLL), Miami International (MIA), and Palm Beach International (PBI). Professional chauffeurs, meet & greet, real-time flight tracking, and no surge pricing.",
  offers: {
    "@type": "Offer",
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
    description: "Flat-rate pricing — no surge, no hidden fees",
  },
};

export const hourlyChauffeurSchema = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: "Hourly Chauffeur Service South Florida",
  provider: { "@id": BUSINESS_ID },
  serviceType: "Hourly Chauffeur",
  areaServed: ["Fort Lauderdale", "Miami", "Palm Beach"],
  description:
    "Book a professional chauffeur by the hour for business meetings, events, and full-day transportation across South Florida. Flat hourly rates, no surge pricing.",
  offers: {
    "@type": "Offer",
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
  },
};

export const corporateSchema = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: "Corporate Black Car Service South Florida",
  provider: { "@id": BUSINESS_ID },
  serviceType: "Corporate Executive Transportation",
  areaServed: ["Fort Lauderdale", "Miami", "Palm Beach", "Boca Raton"],
  description:
    "Executive transportation and corporate accounts for South Florida businesses. Centralized billing, dedicated fleet, and professional chauffeurs for executive teams and frequent travelers.",
  offers: {
    "@type": "Offer",
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
  },
};

export const eventsSchema = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: "Special Events Luxury Transportation South Florida",
  provider: { "@id": BUSINESS_ID },
  serviceType: "Event Transportation",
  areaServed: ["Fort Lauderdale", "Miami", "Palm Beach"],
  description:
    "Luxury black car service for weddings, galas, proms, and special occasions in South Florida. Arrive in style with Royal Midnight's professional fleet.",
  offers: {
    "@type": "Offer",
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
  },
};

// Single source of truth for FAQ content — rendered visibly on /faq and used to
// generate the FAQPage JSON-LD below, so the two can never say different things.
export const FAQ_ITEMS = [
  {
    question: "How do I book a Royal Midnight ride?",
    answer:
      "You can book online at royalmidnight.com/book in minutes. Simply enter your pickup and dropoff locations, select your date and time, choose a vehicle, and confirm your reservation. You'll receive an email confirmation with full details.",
  },
  {
    question: "What airports does Royal Midnight serve?",
    answer:
      "Royal Midnight provides luxury black car service to and from Fort Lauderdale-Hollywood International (FLL), Miami International (MIA), and Palm Beach International (PBI). We track all incoming flights in real time.",
  },
  {
    question: "Is the pricing flat-rate or metered?",
    answer:
      "All Royal Midnight rides are flat-rate with no surge pricing, hidden fees, or meters. The price you are quoted when you book is exactly what you pay — guaranteed.",
  },
  {
    question: "What is your cancellation policy?",
    answer:
      "Cancellation fees are based on how close to pickup you cancel: 1+ day before pickup is a full refund, 12–24 hours before is a 25% fee (75% refund), 2–12 hours before is a 50% fee, and within 2 hours of pickup (including no-shows) is a 100% fee with no refund.",
  },
  {
    question: "How do I find my chauffeur at the airport?",
    answer:
      "Your chauffeur will meet you in the arrivals hall holding a customized digital name sign. For expedited service, curbside pickup is also available upon request.",
  },
  {
    question: "What if my flight is delayed?",
    answer:
      "We track all incoming flights in real time. If your flight is delayed or arrives early, your chauffeur's arrival time is adjusted automatically at no additional charge.",
  },
  {
    question: "Do you provide child seats?",
    answer:
      "Yes, premium child safety seats can be provided upon request at the time of booking. Please specify the age and weight of the child.",
  },
  {
    question: "Can I make multiple stops?",
    answer:
      "Yes, multiple stops can be arranged. For maximum flexibility with numerous stops, we recommend booking our Hourly Chauffeur service.",
  },
  {
    question: "What areas does Royal Midnight serve?",
    answer:
      "We serve all of South Florida including Miami, Miami Beach, Fort Lauderdale, Boca Raton, West Palm Beach, and surrounding communities, plus long-distance transfers throughout Florida.",
  },
  {
    question: "Do you offer corporate accounts?",
    answer:
      "Yes. Royal Midnight provides dedicated corporate accounts with streamlined invoicing, account management, and priority service. Contact us at concierge@royalmidnight.com to set up a corporate account.",
  },
];

export const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
};

export const SCHEMA = {
  airportTransfers: [airportTransferSchema],
  hourlyChauffeur: [hourlyChauffeurSchema],
  corporate: [corporateSchema],
  events: [eventsSchema],
  faq: [faqSchema],
};
