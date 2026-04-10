import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-black text-white px-6">
      <img
        src="/royal-midnight-logo-original.png"
        alt="Royal Midnight"
        className="h-24 mb-10 opacity-90"
      />

      <p className="text-primary font-serif text-6xl font-light mb-4">404</p>

      <h1 className="font-serif text-2xl sm:text-3xl text-white mb-4 tracking-wide">
        Page Not Found
      </h1>

      <p className="text-white/60 text-sm text-center max-w-sm mb-10 leading-relaxed">
        The page you're looking for doesn't exist or may have been moved. Let us take you somewhere better.
      </p>

      <Link
        href="/"
        className="inline-flex items-center gap-2 bg-primary text-black px-8 py-3 text-xs font-semibold uppercase tracking-widest hover:bg-primary/90 transition-colors"
      >
        Return Home
      </Link>
    </div>
  );
}
