import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="bg-black border-t border-white/10 pt-20 pb-10">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          <div className="col-span-1 md:col-span-2">
            <Link href="/" className="block mb-6">
              <img src="/royal-midnight-logo-original.png" alt="Royal Midnight" className="h-28 w-auto max-w-xs object-contain object-left" style={{ mixBlendMode: "screen" }} />
            </Link>
            <p className="text-gray-400 text-sm max-w-sm leading-relaxed mb-8">
              South Florida's premier black car service. Discretion, reliability, and first-class comfort. Covering FLL, MIA, and PBI airports.
            </p>
          </div>
          
          <div>
            <h4 className="text-white uppercase tracking-widest text-xs font-bold mb-6">Explore</h4>
            <ul className="space-y-4">
              <li>
                <Link href="/" className="text-gray-400 hover:text-primary text-sm transition-colors">Home</Link>
              </li>
              <li>
                <Link href="/fleet" className="text-gray-400 hover:text-primary text-sm transition-colors">The Fleet</Link>
              </li>
              <li>
                <Link href="/book" className="text-gray-400 hover:text-primary text-sm transition-colors">Reserve Now</Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white uppercase tracking-widest text-xs font-bold mb-6">Connect</h4>
            <ul className="space-y-4">
              <li>
                <a href="mailto:concierge@royalmidnight.com" className="text-gray-400 hover:text-primary text-sm transition-colors">concierge@royalmidnight.com</a>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between">
          <p className="text-gray-500 text-xs">
            &copy; {new Date().getFullYear()} Royal Midnight Chauffeur Service. All rights reserved.
          </p>
          <div className="flex space-x-6 mt-4 md:mt-0">
            <Link href="/privacy" className="text-gray-500 text-xs hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="text-gray-500 text-xs hover:text-white transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
