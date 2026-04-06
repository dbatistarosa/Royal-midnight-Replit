import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

// Pages
import Home from "@/pages/home";
import Fleet from "@/pages/fleet";
import Book from "@/pages/book";
import BookingConfirmation from "@/pages/booking-confirmation";
import Track from "@/pages/track";
import About from "@/pages/about";
import Services from "@/pages/services";
import AirportTransfers from "@/pages/services/airport-transfers";
import HourlyChauffeur from "@/pages/services/hourly-chauffeur";
import Corporate from "@/pages/services/corporate";
import Events from "@/pages/services/events";
import Pricing from "@/pages/pricing";
import Contact from "@/pages/contact";
import FAQ from "@/pages/faq";
import Terms from "@/pages/terms";
import Privacy from "@/pages/privacy";

// Passenger Portal
import PassengerDashboard from "@/pages/passenger/dashboard";
import PassengerRides from "@/pages/passenger/rides";
import PassengerRideDetail from "@/pages/passenger/ride-detail";
import PassengerAddresses from "@/pages/passenger/addresses";
import PassengerProfile from "@/pages/passenger/profile";
import PassengerSupport from "@/pages/passenger/support";

// Driver Portal
import DriverOnboarding from "@/pages/driver/onboarding";
import DriverDashboard from "@/pages/driver/dashboard";
import DriverHistory from "@/pages/driver/history";
import DriverEarnings from "@/pages/driver/earnings";
import DriverProfile from "@/pages/driver/profile";

// Admin Portal
import AdminDashboard from "@/pages/admin";
import AdminBookings from "@/pages/admin/bookings";
import AdminPassengers from "@/pages/admin/passengers";
import AdminDrivers from "@/pages/admin/drivers";
import AdminFleet from "@/pages/admin/fleet";
import AdminDispatch from "@/pages/admin/dispatch";
import AdminPricing from "@/pages/admin/pricing";
import AdminPromos from "@/pages/admin/promos";
import AdminSupport from "@/pages/admin/support";
import AdminReports from "@/pages/admin/reports";

const queryClient = new QueryClient();

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-foreground flex flex-col font-sans">
      <Navbar />
      <main className="flex-1 pt-24">{children}</main>
      <Footer />
    </div>
  );
}

function Router() {
  return (
    <Layout>
      <Switch>
        {/* Public Marketing */}
        <Route path="/" component={Home} />
        <Route path="/about" component={About} />
        <Route path="/services" component={Services} />
        <Route path="/services/airport-transfers" component={AirportTransfers} />
        <Route path="/services/hourly-chauffeur" component={HourlyChauffeur} />
        <Route path="/services/corporate" component={Corporate} />
        <Route path="/services/events" component={Events} />
        <Route path="/fleet" component={Fleet} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/contact" component={Contact} />
        <Route path="/faq" component={FAQ} />
        <Route path="/terms" component={Terms} />
        <Route path="/privacy" component={Privacy} />

        {/* Booking */}
        <Route path="/book" component={Book} />
        <Route path="/booking-confirmation/:id" component={BookingConfirmation} />
        <Route path="/track/:id" component={Track} />

        {/* Passenger Portal */}
        <Route path="/passenger/dashboard" component={PassengerDashboard} />
        <Route path="/passenger/rides" component={PassengerRides} />
        <Route path="/passenger/rides/:id" component={PassengerRideDetail} />
        <Route path="/passenger/addresses" component={PassengerAddresses} />
        <Route path="/passenger/profile" component={PassengerProfile} />
        <Route path="/passenger/support" component={PassengerSupport} />

        {/* Driver Portal */}
        <Route path="/driver" component={DriverDashboard} />
        <Route path="/driver/dashboard" component={DriverDashboard} />
        <Route path="/driver/onboarding" component={DriverOnboarding} />
        <Route path="/driver/history" component={DriverHistory} />
        <Route path="/driver/earnings" component={DriverEarnings} />
        <Route path="/driver/profile" component={DriverProfile} />

        {/* Admin Portal */}
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/admin/bookings" component={AdminBookings} />
        <Route path="/admin/passengers" component={AdminPassengers} />
        <Route path="/admin/drivers" component={AdminDrivers} />
        <Route path="/admin/fleet" component={AdminFleet} />
        <Route path="/admin/dispatch" component={AdminDispatch} />
        <Route path="/admin/pricing" component={AdminPricing} />
        <Route path="/admin/promos" component={AdminPromos} />
        <Route path="/admin/support" component={AdminSupport} />
        <Route path="/admin/reports" component={AdminReports} />

        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
