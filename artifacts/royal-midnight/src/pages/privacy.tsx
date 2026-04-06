export default function Privacy() {
  return (
    <div className="py-24 min-h-screen">
      <div className="container mx-auto max-w-4xl px-4">
        <h1 className="font-serif text-4xl md:text-5xl mb-8">Privacy Policy</h1>
        
        <div className="prose prose-invert prose-p:text-muted-foreground max-w-none">
          <p>Last Updated: October 1, 2023</p>
          
          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">1. Information We Collect</h2>
          <p>
            We collect personal information necessary to provide our luxury transportation services, 
            including name, contact details, payment information, and pickup/dropoff locations.
          </p>

          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">2. How We Use Your Information</h2>
          <p>
            Your information is used solely for the purpose of executing your reservations, communicating 
            updates regarding your ride, processing payments, and improving our services.
          </p>

          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">3. Data Security</h2>
          <p>
            We implement industry-standard security measures to protect your personal and payment data. 
            We do not sell your personal information to third parties.
          </p>

          <h2 className="font-serif text-2xl text-foreground mt-8 mb-4">4. Absolute Discretion</h2>
          <p>
            As a premium service, we maintain strict confidentiality regarding our clients' identities, 
            destinations, and conversations held within our vehicles.
          </p>
        </div>
      </div>
    </div>
  );
}
