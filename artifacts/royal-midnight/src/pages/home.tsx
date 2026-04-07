import { Link, useLocation } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AIRPORTS, VEHICLE_CLASSES } from "@/lib/constants";
import { PlacesAutocomplete } from "@/components/maps/PlacesAutocomplete";

export default function Home() {
  const [, setLocation] = useLocation();
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");

  const handleBook = (e: React.FormEvent) => {
    e.preventDefault();
    const search = new URLSearchParams();
    if (pickup) search.set("pickup", pickup);
    if (dropoff) search.set("dropoff", dropoff);
    setLocation(`/book?${search.toString()}`);
  };

  return (
    <div className="w-full">
      {/* Hero Section */}
      <section className="relative h-screen min-h-[700px] flex items-center pt-20">
        <div className="absolute inset-0 z-0">
          <img 
            src="/hero-bg.png" 
            alt="Luxury black sedan at night" 
            className="w-full h-full object-cover object-center opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/40 to-black"></div>
        </div>

        <div className="container mx-auto px-4 sm:px-6 relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
          <div className="max-w-2xl text-left">
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-serif text-white mb-4 md:mb-6 leading-tight animate-in fade-in slide-in-from-bottom-8 duration-1000">
              The <span className="text-primary italic">Pinnacle</span> of South Florida Transport.
            </h1>
            <p className="text-base md:text-lg text-gray-300 mb-6 md:mb-10 max-w-xl leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
              Discretion, reliability, and first-class comfort. No surge pricing, no uncertainty. Just flat-rate luxury rides booked in advance.
            </p>
          </div>

          {/* Quick Booking Widget */}
          <div className="w-full lg:w-auto lg:flex-shrink-0 max-w-md animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300">
            <div className="bg-black/80 backdrop-blur-xl border border-white/10 p-6 sm:p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50"></div>
              <h3 className="text-xl font-serif text-white mb-6 tracking-widest uppercase">Reserve a Vehicle</h3>
              
              <form onSubmit={handleBook} className="space-y-4">
                <div>
                  <label className="block text-xs uppercase tracking-widest text-gray-400 mb-2">Pick-up Location</label>
                  <PlacesAutocomplete
                    value={pickup}
                    onChange={setPickup}
                    placeholder="FLL, MIA, PBI or any address"
                    className="w-full bg-white/5 border border-white/10 text-white rounded-none h-12 px-4 text-sm focus:outline-none focus:border-primary placeholder:text-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-gray-400 mb-2">Drop-off Location</label>
                  <PlacesAutocomplete
                    value={dropoff}
                    onChange={setDropoff}
                    placeholder="Address or Airport Code"
                    className="w-full bg-white/5 border border-white/10 text-white rounded-none h-12 px-4 text-sm focus:outline-none focus:border-primary placeholder:text-gray-600"
                  />
                </div>
                <Button type="submit" className="w-full h-14 mt-4 bg-primary text-black hover:bg-primary/90 font-medium uppercase tracking-widest text-sm rounded-none">
                  Get a Quote
                </Button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Services / Philosophy */}
      <section className="py-16 md:py-32 bg-black border-t border-white/5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-1/3 h-full bg-primary/5 blur-[120px] rounded-full pointer-events-none"></div>
        <div className="container mx-auto px-4 sm:px-6 relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-16">
            <div className="text-center md:text-left">
              <h3 className="text-primary text-sm uppercase tracking-widest mb-4">Discretion</h3>
              <h4 className="text-2xl font-serif text-white mb-4">Silent & Private</h4>
              <p className="text-gray-400 leading-relaxed">
                Our chauffeurs are trained to provide a serene environment. Whether you need to conduct business calls or simply rest, your privacy is our highest priority.
              </p>
            </div>
            <div className="text-center md:text-left">
              <h3 className="text-primary text-sm uppercase tracking-widest mb-4">Reliability</h3>
              <h4 className="text-2xl font-serif text-white mb-4">Always Ahead of Time</h4>
              <p className="text-gray-400 leading-relaxed">
                We track flights in real-time and arrive 15 minutes early as a standard. You will never wait for a Royal Midnight vehicle.
              </p>
            </div>
            <div className="text-center md:text-left">
              <h3 className="text-primary text-sm uppercase tracking-widest mb-4">Transparency</h3>
              <h4 className="text-2xl font-serif text-white mb-4">Flat-Rate Luxury</h4>
              <p className="text-gray-400 leading-relaxed">
                No meters, no surge pricing, no hidden fees. The price you are quoted is exactly the price you pay, guaranteed.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Fleet Teaser */}
      <section className="py-16 md:py-32 bg-[#0a0a0a]">
        <div className="container mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif text-white mb-4">An Impeccable Fleet</h2>
          <p className="text-gray-400 max-w-2xl mx-auto mb-10 md:mb-16">
            Meticulously maintained. Perfectly appointed. Choose the vehicle that suits your occasion.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 md:gap-8">
            {VEHICLE_CLASSES.slice(0, 3).map((vehicle) => (
              <div key={vehicle.id} className="group relative overflow-hidden bg-black border border-white/5 aspect-[4/3]">
                <img 
                  src={vehicle.image} 
                  alt={vehicle.name} 
                  className="w-full h-full object-cover opacity-60 group-hover:opacity-80 group-hover:scale-105 transition-all duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent"></div>
                <div className="absolute bottom-0 left-0 p-8 text-left w-full">
                  <h3 className="text-2xl font-serif text-white mb-2">{vehicle.name}</h3>
                  <p className="text-primary text-sm uppercase tracking-widest mb-4">Up to {vehicle.passengers} Passengers</p>
                  <Link href="/book" className="text-white text-sm uppercase tracking-widest border-b border-primary pb-1 hover:text-primary transition-colors inline-block">
                    Reserve
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-16">
            <Link href="/fleet">
              <Button variant="outline" className="border-white/20 text-white hover:bg-white hover:text-black font-medium uppercase tracking-widest text-sm px-10 py-6 rounded-none h-auto">
                View Entire Fleet
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Experience Image */}
      <section className="relative h-[600px] flex items-center justify-center">
        <div className="absolute inset-0 z-0">
          <img 
            src="/interior.png" 
            alt="Luxury interior" 
            className="w-full h-full object-cover opacity-50"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black"></div>
        </div>
        <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-6xl font-serif text-white mb-8 italic">"The anticipation of the journey should equal the destination."</h2>
          <Link href="/book">
            <Button className="bg-primary text-black hover:bg-primary/90 font-medium uppercase tracking-widest text-sm px-12 py-7 rounded-none">
              Begin Your Journey
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
