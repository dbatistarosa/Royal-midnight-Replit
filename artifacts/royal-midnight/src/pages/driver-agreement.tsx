import { PageSeo } from "@/components/PageSeo";

/**
 * The chauffeur agreement.
 *
 * Drivers were being onboarded, approved and dispatched without ever being
 * shown terms — there was no document to show. The wording below states the
 * arrangement this business already runs on: independent contractors using
 * their own vehicles, paid a commission of the fare subtotal weekly, held to
 * the compliance and cancellation rules the software already enforces.
 *
 * It deliberately describes the system as built. The commission percentage, the
 * warning threshold and the cancellation windows are all admin-configurable, so
 * they are referred to rather than hard-coded into the text, except where the
 * software itself has a fixed rule (three warnings, the confirmation deadline).
 */

export const DRIVER_AGREEMENT_VERSION = "2026-08-16";

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <>
      <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">{n}. {title}</h2>
      {children}
    </>
  );
}

export default function DriverAgreement() {
  return (
    <div className="py-24 min-h-screen">
      <PageSeo
        title="Chauffeur Agreement | Royal Midnight"
        description="The independent contractor agreement between Royal Midnight and its chauffeurs: engagement, vehicle standards, compensation, compliance and cancellation."
        path="/driver-agreement"
      />
      <div className="container mx-auto max-w-4xl px-4">
        <h1 className="font-serif text-4xl md:text-5xl mb-8">Chauffeur Agreement</h1>

        <div className="prose prose-invert prose-p:text-muted-foreground max-w-none">
          <p>Version {DRIVER_AGREEMENT_VERSION}</p>
          <p>
            This Agreement governs the relationship between Royal Midnight Luxury Transportation
            (&ldquo;Royal Midnight&rdquo;, &ldquo;we&rdquo;) and you as an independent chauffeur
            (&ldquo;you&rdquo;). You accept it when you complete chauffeur onboarding, and your acceptance is
            recorded with the date, time and originating IP address.
          </p>

          <Section n={1} title="Independent Contractor Status">
            <p>
              You are an independent contractor, not an employee, partner or agent of Royal Midnight. You
              control the means and manner of your work, choose which trips to accept, and set your own
              working hours. Nothing here creates an employment relationship, and no wage, overtime, benefit
              or leave entitlement arises from it. You are responsible for your own federal, state and
              self-employment taxes. Royal Midnight reports your earnings on IRS Form 1099, which is why your
              legal name and tax identification number are required before payouts can be issued.
            </p>
          </Section>

          <Section n={2} title="Eligibility and Documentation">
            <p>
              You must hold a valid driver&rsquo;s licence, current vehicle registration and commercial
              automobile liability insurance meeting Florida minimums, naming you as an insured driver of the
              vehicle you operate. You must upload each document and keep it current. The platform tracks
              expiry dates and will place your account on a compliance hold when a document lapses; while a
              hold is in place you cannot view or accept trips. Clearing the hold requires uploading a valid
              replacement document, which we review before reinstating you.
            </p>
            <p>
              You must promptly notify us of any change that affects your eligibility, including licence
              suspension, an at-fault collision, a lapse in insurance, or a criminal charge relating to the
              operation of a vehicle.
            </p>
          </Section>

          <Section n={3} title="Vehicle Standards">
            <p>
              You supply your own vehicle. It must match the make, model, year, colour and class recorded on
              your chauffeur profile, and must be presented clean inside and out, mechanically sound, and
              with functioning climate control. Vehicles are subject to the model-year and class requirements
              published in the fleet catalogue. Smoking in the vehicle is prohibited at all times.
            </p>
            <p>
              Where a passenger has recorded cabin preferences — temperature, music, beverage, or a
              preference for minimal conversation — these appear on your trip manifest and are to be honoured
              before the passenger enters the vehicle.
            </p>
          </Section>

          <Section n={4} title="Service Areas and Trip Assignment">
            <p>
              You are assigned one or more service areas. Trips picking up inside an area you are assigned to
              are offered to you; trips outside it are not. A trip that no assigned chauffeur covers may be
              offered more widely or assigned directly by dispatch. Being offered a trip is not a guarantee
              of work, and accepting one is at your discretion.
            </p>
          </Section>

          <Section n={5} title="Accepting and Confirming Trips">
            <p>
              Accepting a trip is a commitment to perform it. You must mark yourself <em>On the Way</em>
              within the confirmation window before pickup. A trip you accept but do not confirm is
              automatically released back to the pool, you are recorded a warning, and you will not be
              offered that trip again. Three warnings suspend your account pending review.
            </p>
            <p>
              You must arrive at the pickup location at or before the scheduled time, and wait the
              complimentary period published for that service type before a no-show may be declared.
            </p>
          </Section>

          <Section n={6} title="Compensation and Payouts">
            <p>
              You are paid a commission on the fare subtotal of each completed trip, at the percentage shown
              in your chauffeur portal. The subtotal excludes taxes, card processing fees and any promotional
              discount — those are borne by Royal Midnight and never reduce your commission. Gratuities are
              passed to you in full.
            </p>
            <p>
              Payouts are calculated weekly and issued to the bank account on your payout profile. You are
              responsible for the accuracy of that information; we cannot recover funds sent to an account
              number you entered incorrectly. Banking details are encrypted at rest and are never displayed
              back to you in full.
            </p>
            <p>
              Airport fees, tolls and other pass-through charges are handled as published in the fee schedule
              and are not part of the commission base unless stated there.
            </p>
          </Section>

          <Section n={7} title="Passenger Data and Confidentiality">
            <p>
              Passenger names, contact details, addresses and any notes you receive are confidential and are
              provided solely to perform the assigned trip. You may not retain, copy, share or use them for
              any other purpose, and may not contact a passenger after a trip except through Royal Midnight.
              Open-pool listings deliberately withhold contact details until a trip is assigned to you.
            </p>
            <p>
              While a trip is active, your location is shared with the passenger and with dispatch. Location
              sharing outside an active trip is under your control.
            </p>
          </Section>

          <Section n={8} title="Cancellations by You">
            <p>
              Once accepted, a trip should be cancelled only for genuine cause, and as early as possible so
              it can be reassigned. Late cancellations and no-shows are recorded and, like unconfirmed trips,
              count toward the warning threshold in section 5.
            </p>
          </Section>

          <Section n={9} title="Insurance and Liability">
            <p>
              Your commercial automobile liability insurance is primary for all loss arising from your
              operation of the vehicle. Royal Midnight is not liable for damage to your vehicle, for your
              personal injury, or for loss of income. You agree to indemnify Royal Midnight against claims
              arising from your negligence, your breach of this Agreement, or your violation of law.
            </p>
          </Section>

          <Section n={10} title="Suspension and Termination">
            <p>
              Either party may terminate this Agreement at any time and for any reason, on notice. Royal
              Midnight may suspend your access immediately where a document has expired, where the warning
              threshold has been reached, or where passenger safety is in question. Termination does not
              affect commission already earned on completed trips, which is paid in the next scheduled payout
              cycle.
            </p>
          </Section>

          <Section n={11} title="Changes to this Agreement">
            <p>
              We may amend this Agreement. Material changes are published as a new version, and you will be
              asked to accept the new version before continuing to accept trips. The version you accepted,
              and when, is recorded; amending the text does not retroactively change what you agreed to.
            </p>
          </Section>

          <Section n={12} title="Governing Law">
            <p>
              This Agreement is governed by the laws of the State of Florida, and the parties submit to the
              exclusive jurisdiction of the state and federal courts located in Broward County, Florida.
            </p>
          </Section>

          <p className="mt-10 text-sm">
            Questions about this Agreement should be directed to the office before you accept it.
          </p>
        </div>
      </div>
    </div>
  );
}
