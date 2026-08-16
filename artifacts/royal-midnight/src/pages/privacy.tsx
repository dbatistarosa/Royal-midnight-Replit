import { PageSeo } from "@/components/PageSeo";

export default function Privacy() {
  return (
    <div className="py-24 min-h-screen">
      <PageSeo
        title="Privacy Policy | Royal Midnight"
        description="Royal Midnight's privacy policy. How we collect, use, and protect your personal data when using our luxury black car and chauffeur service in South Florida."
        path="/privacy"
      />
      <div className="container mx-auto max-w-4xl px-4">
        <h1 className="font-serif text-4xl md:text-5xl mb-8">Privacy Policy</h1>
        
        <div className="prose prose-invert prose-p:text-muted-foreground max-w-none">
          <p>Last Updated: August 16, 2026</p>

          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">1. Information We Collect</h2>
          <p>
            We collect personal information necessary to provide our luxury transportation services, including
            name, contact details, pickup/dropoff locations, and account credentials. For drivers, we additionally
            collect license, vehicle registration, insurance documents, and payout banking details. We do not
            store full payment card numbers — payment processing is handled by Stripe, our PCI-compliant payment
            processor.
          </p>
          <p>
            If you record cabin preferences — preferred temperature, music, beverage, how you wish to be
            addressed, or a preference for minimal conversation — these are stored on your account and shown
            to the chauffeur assigned to your trip so the vehicle can be prepared before you arrive. They are
            not used for any other purpose. Administrative notes about an account are internal and are never
            shown to the person they describe.
          </p>
          <p>
            When you accept our Terms, Privacy Policy or the Chauffeur Agreement, we record that acceptance
            together with the date, time, originating IP address, browser identifier and the version of the
            document accepted. This is kept as evidence of the agreement itself, not for tracking or
            profiling.
          </p>

          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">2. Location Data</h2>
          <p>
            To calculate fares and provide live trip tracking, we collect pickup/dropoff addresses and, during an
            active trip, your chauffeur's real-time GPS location. This live location is shared with the passenger
            on that trip (via a tracking link) and with our dispatch team, and is retained as trip history after
            the ride ends. Address and route data is processed through Mapbox's mapping and geocoding services.
          </p>

          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">3. How We Use Your Information</h2>
          <p>
            Your information is used to execute reservations, communicate updates about your ride (including
            booking confirmations, trip reminders, and chauffeur details via email and SMS), process payments,
            send post-ride receipts and review requests, administer our referral program, and improve our
            services. Driver documents are used solely to verify compliance with licensing, insurance, and
            registration requirements.
          </p>

          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">4. Service Providers</h2>
          <p>
            We share information with trusted third-party providers only as needed to deliver our service:
            Stripe (payment processing), Twilio (SMS notifications and OTP login), Resend (transactional email),
            Mapbox (mapping, geocoding, and route pricing), and Supabase (secure data storage and document
            uploads). We do not sell your personal information to third parties.
          </p>

          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">5. Data Security</h2>
          <p>
            We implement industry-standard security measures to protect your personal and payment data.
            Chauffeur payout details — bank routing and account numbers, and tax identification numbers — are
            encrypted before they are stored and are never displayed back in full, to the chauffeur or to
            staff; only the last four digits are ever shown. Uploaded documents are held in private storage
            and reachable only through short-lived links issued to authorised viewers. Connections to our
            database are TLS-verified, and access is role-based.
          </p>

          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">6. Retention</h2>
          <p>
            Reservation and trip records, including routes travelled, are retained as service history and for
            tax and accounting obligations. Chauffeur compliance documents are retained while the chauffeur is
            engaged and for the period afterwards required by law or insurance. Records of your acceptance of
            our agreements are retained for as long as they may be relevant to a dispute, which may outlast
            the account itself.
          </p>

          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">7. Your Choices</h2>
          <p>
            You may request access to, correction of, or deletion of your personal information by contacting us
            at the email below. SMS notifications can be opted out of at any time by following the instructions
            included in the message.
          </p>

          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">8. Absolute Discretion</h2>
          <p>
            As a premium service, we maintain strict confidentiality regarding our clients' identities,
            destinations, and conversations held within our vehicles.
          </p>

          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">9. Contact Us</h2>
          <p>
            Questions about this policy can be directed to concierge@royalmidnight.com or +1 (728) 230-4531.
          </p>
        </div>
      </div>
    </div>
  );
}
