import { VEHICLE_CLASSES } from "@/lib/constants";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Fleet() {
  return (
    <div className="min-h-screen bg-black pt-32 pb-24">
      <div className="container mx-auto px-6">
        <div className="text-center mb-20 max-w-3xl mx-auto">
          <h1 className="text-5xl font-serif text-white mb-6">The Royal Fleet</h1>
          <p className="text-gray-400 text-lg leading-relaxed">
            Our vehicles are more than mere transportation; they are sanctuaries of privacy and comfort. 
            Every vehicle in our fleet is meticulously maintained, featuring deep tinted windows, 
            premium leather interiors, and complimentary amenities.
          </p>
        </div>

        <div className="space-y-32">
          {VEHICLE_CLASSES.map((vehicle, idx) => (
            <div 
              key={vehicle.id} 
              className={`flex flex-col md:flex-row items-center gap-12 lg:gap-24 ${
                idx % 2 !== 0 ? "md:flex-row-reverse" : ""
              }`}
            >
              <div className="w-full md:w-3/5 relative aspect-video">
                <div className="absolute inset-0 bg-primary/20 blur-3xl -z-10 rounded-full mix-blend-screen transform scale-75"></div>
                <img 
                  src={vehicle.image} 
                  alt={vehicle.name} 
                  className="w-full h-full object-cover border border-white/10"
                />
              </div>

              <div className="w-full md:w-2/5">
                <h3 className="text-primary text-sm uppercase tracking-widest mb-4 border-b border-primary/30 pb-2 inline-block">Class {idx + 1}</h3>
                <h2 className="text-4xl font-serif text-white mb-6">{vehicle.name}</h2>
                <p className="text-gray-400 text-lg mb-8 leading-relaxed">
                  {vehicle.description} Perfect for airport transfers, executive road shows, or a discrete night out.
                </p>
                
                <div className="grid grid-cols-2 gap-6 mb-10 border-t border-b border-white/10 py-6">
                  <div>
                    <span className="block text-xs uppercase tracking-widest text-gray-500 mb-1">Capacity</span>
                    <span className="text-white text-lg">{vehicle.passengers} Passengers</span>
                  </div>
                  <div>
                    <span className="block text-xs uppercase tracking-widest text-gray-500 mb-1">Luggage</span>
                    <span className="text-white text-lg">{vehicle.bags} Bags</span>
                  </div>
                </div>

                <Link href={`/book?class=${vehicle.id}`}>
                  <Button className="bg-primary text-black hover:bg-primary/90 font-medium uppercase tracking-widest text-sm px-10 py-6 rounded-none">
                    Select Vehicle
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
