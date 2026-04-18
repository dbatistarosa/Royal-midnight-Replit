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
          <p>Last Updated: October 1, 2023</p>
          
          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">1. Introduction</h2>
          <p>
            These Terms of Service govern your use of the Royal Midnight service. By booking a ride 
            or using our platform, you agree to these terms.
          </p>

          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">2. Reservations and Cancellations</h2>
          <p>
            Reservations must be made at least 2 hours in advance. Cancellations made more than 24 hours 
            before the scheduled pickup time are eligible for a full refund. Cancellations made within 
            24 hours may incur a cancellation fee up to the full amount of the booking.
          </p>

          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">3. Passenger Conduct</h2>
          <p>
            Passengers are expected to behave in a respectful manner. Royal Midnight reserves the right 
            to terminate a ride at any time if a passenger exhibits disruptive, dangerous, or illegal behavior.
          </p>

          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">4. Liability</h2>
          <p>
            Royal Midnight is not liable for items left in vehicles, missed flights due to traffic or weather 
            conditions beyond our control.
          </p>
        </div>
      </div>
    </div>
  );
}
