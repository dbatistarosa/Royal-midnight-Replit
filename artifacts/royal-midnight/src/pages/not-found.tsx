import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-black">
      <div className="text-center px-6 max-w-md">
        <p className="text-primary uppercase tracking-widest text-xs mb-6 font-medium">404 — Page Not Found</p>
        <h1 className="text-5xl md:text-7xl font-serif text-white mb-6">Lost?</h1>
        <p className="text-gray-400 text-sm leading-relaxed mb-10">
          The page you're looking for doesn't exist or has been moved.
          Let us guide you back.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/">
            <Button className="bg-primary text-black hover:bg-primary/90 font-medium uppercase tracking-widest text-xs px-10 py-6 rounded-none w-full sm:w-auto">
              Return Home
            </Button>
          </Link>
          <Link href="/book">
            <Button variant="outline" className="border-white/20 text-white hover:bg-white hover:text-black font-medium uppercase tracking-widest text-xs px-10 py-6 rounded-none w-full sm:w-auto">
              Reserve a Ride
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
