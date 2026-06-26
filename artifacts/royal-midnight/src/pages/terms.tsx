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
          <p>Last Updated: June 25, 2026</p>

          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">1. Introduction</h2>
          <p>
            These Terms of Service govern your use of the Royal Midnight service, including our website,
            passenger and corporate booking portals, and driver application. By booking a ride or using our
            platform, you agree to these terms.
          </p>

          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">2. Reservations, Pricing, and Cancellations</h2>
          <p>
            Reservations must be made at least 2 hours in advance. All quoted fares are flat-rate with no
            surge pricing. Hourly charter bookings include a set number of included hours and miles; usage
            beyond that allotment is billed as an extra-time charge at the rate disclosed at booking.
            Cancellations made more than 24 hours before the scheduled pickup time are eligible for a full
            refund. Cancellations made within 24 hours may incur a fee, and no-shows may be charged up to the
            full amount of the booking.
          </p>

          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">3. Payment</h2>
          <p>
            Payments are processed securely through Stripe. By saving a payment method, you authorize Royal
            Midnight to charge it for the booked fare, any applicable extra-time charges on hourly charters,
            and optional gratuity. Corporate accounts may be invoiced on separate agreed terms.
          </p>

          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">4. Referrals and Promotions</h2>
          <p>
            Referral credits and promotional codes are issued at Royal Midnight's discretion, have no cash
            value, may not be combined unless stated otherwise, and may be modified or discontinued at any time.
          </p>

          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">5. Driver Compliance</h2>
          <p>
            Drivers must maintain a valid license, vehicle registration, and insurance at all times. Royal
            Midnight may place a driver account on hold and reassign upcoming trips if any required document
            expires without a timely, approved renewal.
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

          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">8. Governing Law</h2>
          <p>
            These terms are governed by the laws of the State of Florida. We may update these terms from time
            to time; continued use of the service after changes take effect constitutes acceptance.
          </p>

          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">9. Contact Us</h2>
          <p>
            Questions about these terms can be directed to concierge@royalmidnight.com or +1 (728) 230-4531.
          </p>
        </div>
      </div>
    </div>
  );
}
