import { Link, useLocation } from "wouter";
import { Menu, X, User, LogOut, LayoutDashboard, Car } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth";

export function Navbar() {
  const [location, setLocation] = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const navLinks = [
    { name: "Home", path: "/" },
    { name: "About", path: "/about" },
    { name: "Services", path: "/services" },
    { name: "Fleet", path: "/fleet" },
    { name: "Contact", path: "/contact" },
  ];

  function handleLogout() {
    logout();
    setAccountMenuOpen(false);
    setLocation("/");
  }

  const portalLink = user?.role === "admin"
    ? "/admin"
    : user?.role === "driver"
    ? "/driver/dashboard"
    : user?.role === "corporate"
    ? "/corporate/dashboard"
    : "/passenger/dashboard";

  const portalLabel = user?.role === "admin"
    ? "Director's Office"
    : user?.role === "driver"
    ? "Driver Portal"
    : user?.role === "corporate"
    ? "Corporate Portal"
    : "My Account";

  return (
    <nav
      className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        isScrolled || location !== "/"
          ? "bg-black/90 backdrop-blur-md border-b border-white/10 py-4"
          : "bg-transparent py-6"
      }`}
    >
      <div className="container mx-auto px-6 flex items-center justify-between">
        <Link href="/" className="text-2xl font-serif text-white tracking-widest">
          ROYAL <span className="text-primary italic">MIDNIGHT</span>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center space-x-8">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              href={link.path}
              className={`text-sm uppercase tracking-wider transition-colors ${
                location === link.path
                  ? "text-primary"
                  : "text-gray-300 hover:text-white"
              }`}
            >
              {link.name}
            </Link>
          ))}

          {user ? (
            <div className="relative" ref={accountRef}>
              <button
                onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                className="flex items-center gap-2 text-sm uppercase tracking-wider text-gray-300 hover:text-white transition-colors border border-white/20 hover:border-primary/50 px-4 py-2"
              >
                <User className="w-4 h-4" />
                <span className="hidden lg:block max-w-[120px] truncate">{user.name.split(" ")[0]}</span>
              </button>

              {accountMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-black border border-white/10 shadow-2xl py-1 z-50">
                  <div className="px-4 py-3 border-b border-white/10">
                    <p className="text-white text-sm font-medium truncate">{user.name}</p>
                    <p className="text-gray-500 text-xs truncate">{user.email}</p>
                  </div>
                  <Link
                    href={portalLink}
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    {portalLabel}
                  </Link>
                  {user.role === "passenger" && (
                    <Link
                      href="/passenger/rides"
                      onClick={() => setAccountMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      <Car className="w-4 h-4" />
                      My Rides
                    </Link>
                  )}
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 w-full px-4 py-3 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors border-t border-white/10"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link href="/auth/login">
              <Button variant="outline" className="border-white/20 text-white hover:border-primary hover:text-primary bg-transparent rounded-none uppercase tracking-widest text-xs px-5 py-5">
                Sign In
              </Button>
            </Link>
          )}

          <Link href="/book">
            <Button className="bg-primary text-black hover:bg-primary/90 font-medium uppercase tracking-widest text-xs px-8 py-6 rounded-none">
              Reserve Now
            </Button>
          </Link>
        </div>

        {/* Mobile Nav Toggle */}
        <button
          className="md:hidden text-white"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Nav Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 w-full bg-black/95 backdrop-blur-xl border-b border-white/10 py-6 px-6 flex flex-col space-y-6">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              href={link.path}
              onClick={() => setMobileMenuOpen(false)}
              className={`text-lg font-serif tracking-widest ${
                location === link.path ? "text-primary" : "text-white"
              }`}
            >
              {link.name}
            </Link>
          ))}
          {user ? (
            <>
              <Link href={portalLink} onClick={() => setMobileMenuOpen(false)} className="text-lg font-serif tracking-widest text-primary">
                {portalLabel}
              </Link>
              <button onClick={() => { handleLogout(); setMobileMenuOpen(false); }} className="text-left text-lg font-serif tracking-widest text-gray-400">
                Sign Out
              </button>
            </>
          ) : (
            <Link href="/auth/login" onClick={() => setMobileMenuOpen(false)} className="text-lg font-serif tracking-widest text-gray-300">
              Sign In
            </Link>
          )}
          <Link href="/book" onClick={() => setMobileMenuOpen(false)}>
            <Button className="w-full bg-primary text-black hover:bg-primary/90 font-medium uppercase tracking-widest text-sm py-6 rounded-none">
              Reserve Now
            </Button>
          </Link>
        </div>
      )}
    </nav>
  );
}
