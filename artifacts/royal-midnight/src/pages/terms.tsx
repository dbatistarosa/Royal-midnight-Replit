import { PageSeo } from "@/components/PageSeo";

export default function Terms() {
  return (
    <div className="py-24 min-h-screen">
      <PageSeo
        title="Terms of Service | Royal Midnight"
        description="Terms and conditions governing use of Royal Midnight's luxury black car service in South Florida. Booking, cancellation, payment, and liability policies."
        path="/terms"
      />
      <div className="container mx-auto max-w-4xl px-4">
        <h1 className="font-serif text-4xl md:text-5xl mb-8">Terms of Service</h1>
        
        <div className="prose prose-invert prose-p:text-muted-foreground max-w-none">
          <p>Last Updated: August 16, 2026</p>

          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">1. Introduction</h2>
          <p>
            These Terms of Service govern your use of the Royal Midnight service, including our website,
            passenger and corporate booking portals, and driver application. By booking a ride or using our
            platform, you agree to these terms.
          </p>

          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">2. Reservations, Pricing, and Cancellations</h2>
          <p>
            Reservations must be made at least the minimum advance notice shown on the booking form, and
            hourly charters are subject to a published minimum duration. Both are set by Royal Midnight and
            are displayed before you pay. All quoted fares are flat-rate with no surge pricing. Hourly
            charter bookings include a set number of included hours and miles; usage beyond that allotment is
            billed as an extra-time charge at the rate disclosed at booking.
          </p>
          <p>
            Cancellations made 12 hours or more before the scheduled pickup time are eligible for a full
            refund. Cancellations made between 2 and 12 hours before pickup incur a 25% cancellation fee.
            Cancellations made less than 2 hours before pickup, and no-shows, are charged the full amount
            of the booking. Where a cancellation is our failure rather than yours, the fare is refunded in
            full regardless of timing.
          </p>
          <p>
            Royal Midnight may amend a confirmed reservation — for example to correct a pickup time taken
            over the phone. When we do, you are emailed a summary showing exactly which details changed.
          </p>

          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">3. Payment</h2>
          <p>
            Payments are processed securely through Stripe. Royal Midnight does not store full card numbers.
            The amount shown before you pay is the amount charged, and itemises the fare, Florida sales tax
            and — where applicable — a card processing fee, each as its own line. By saving a payment method
            you authorize Royal Midnight to charge it for the booked fare, any applicable extra-time charges
            on hourly charters, and optional gratuity. Corporate accounts may be invoiced on separate agreed
            terms.
          </p>

          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">4. Referrals and Promotions</h2>
          <p>
            Referral credits and promotional codes are issued at Royal Midnight's discretion, have no cash
            value, may not be combined unless stated otherwise, and may be modified or discontinued at any time.
          </p>

          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">5. Driver Compliance</h2>
          <p>
            Chauffeurs are independent contractors engaged under the{" "}
            <a href="/driver-agreement" className="text-primary underline underline-offset-2">Chauffeur Agreement</a>,
            which they accept during onboarding. They must maintain a valid licence, vehicle registration and
            insurance at all times. Royal Midnight may place a chauffeur account on hold and reassign upcoming
            trips if any required document expires without a timely, approved renewal, or if the chauffeur
            repeatedly fails to confirm accepted trips.
          </p>

          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">6. Passenger Conduct</h2>
          <p>
            Passengers are expected to behave in a respectful manner. Royal Midnight reserves the right
            to terminate a ride at any time if a passenger exhibits disruptive, dangerous, or illegal behavior.
          </p>

          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">7. Liability</h2>
          <p>
            Royal Midnight is not liable for items left in vehicles, missed flights due to traffic or weather
            conditions beyond our control.
          </p>

          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">8. Your Acceptance</h2>
          <p>
            You accept these Terms and the Privacy Policy when you confirm a reservation. Your acceptance is
            recorded together with the date, time, originating IP address and the version of each document
            in force at that moment. Amending these Terms later does not change what you agreed to; where a
            change is material we will ask you to accept the new version.
          </p>

          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">9. Governing Law</h2>
          <p>
            These terms are governed by the laws of the State of Florida. We may update these terms from time
            to time; continued use of the service after changes take effect constitutes acceptance.
          </p>

          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">10. Contact Us</h2>
          <p>
            Questions about these terms can be directed to concierge@royalmidnight.com or +1 (728) 230-4531.
          </p>
        </div>
      </div>
    </div>
  );
}
