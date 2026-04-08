import { Loader2, Clock, XCircle } from "lucide-react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/auth";
import { DriverStatusProvider, useDriverStatus } from "@/contexts/driverStatus";
import { AuthGuard } from "@/components/layout/AuthGuard";
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
import Contact from "@/pages/contact";
import FAQ from "@/pages/faq";
import Terms from "@/pages/terms";
import Privacy from "@/pages/privacy";

// Auth
import Login from "@/pages/auth/login";
import Signup from "@/pages/auth/signup";
import ResetPassword from "@/pages/auth/reset-password";

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

// Corporate Portal
import CorporateDashboard from "@/pages/corporate/dashboard";
import CorporateBook from "@/pages/corporate/book";
import CorporateBookings from "@/pages/corporate/bookings";
import CorporateProfile from "@/pages/corporate/profile";

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
import AdminSettings from "@/pages/admin/settings";
import AdminPayouts from "@/pages/admin/payouts";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const PORTAL_PATHS = ["/passenger", "/driver", "/admin", "/corporate", "/auth"];

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-foreground flex flex-col font-sans">
      <Navbar />
      <main className="flex-1 pt-24">{children}</main>
      <Footer />
    </div>
  );
}

function PortalWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-foreground font-sans">
      <Navbar />
      <main className="pt-20">{children}</main>
    </div>
  );
}

function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <PortalWrapper>
      <AuthGuard requiredRole="admin">
        <Component />
      </AuthGuard>
    </PortalWrapper>
  );
}

function DriverApprovalGate({ children }: { children: React.ReactNode }) {
  const { driverRecord, isLoading } = useDriverStatus();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (driverRecord?.approvalStatus === "rejected") {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <div className="w-14 h-14 border border-red-900/30 bg-red-900/10 flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-7 h-7 text-red-500" />
          </div>
          <h2 className="text-2xl font-serif text-white mb-3">Application Not Approved</h2>
          <p className="text-gray-400 text-sm leading-relaxed mb-4">
            We reviewed your application but were unable to approve it at this time.
          </p>
          {driverRecord.rejectionReason && (
            <div className="bg-red-900/10 border border-red-900/30 p-4 text-left mb-6">
              <p className="text-xs uppercase tracking-widest text-red-500 mb-1">Reason</p>
              <p className="text-sm text-gray-300">{driverRecord.rejectionReason}</p>
            </div>
          )}
          <p className="text-xs text-gray-600">Contact support@royalmidnight.com for assistance.</p>
        </div>
      </div>
    );
  }

  if (!driverRecord || driverRecord.approvalStatus === "pending") {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <div className="w-14 h-14 border border-primary/30 bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Clock className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-2xl font-serif text-white mb-3">Application Under Review</h2>
          <p className="text-gray-400 text-sm leading-relaxed mb-6">
            Your application is being reviewed by our fleet team. This typically takes 1–2 business days.
          </p>
          <p className="text-xs text-gray-600">Questions? Contact dispatch@royalmidnight.com</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function DriverRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <PortalWrapper>
      <AuthGuard requiredRole="driver">
        <DriverApprovalGate>
          <Component />
        </DriverApprovalGate>
      </AuthGuard>
    </PortalWrapper>
  );
}

function CorporateRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <PortalWrapper>
      <AuthGuard requiredRole="corporate">
        <Component />
      </AuthGuard>
    </PortalWrapper>
  );
}

function PassengerRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <PortalWrapper>
      <AuthGuard requiredRole="passenger">
        <Component />
      </AuthGuard>
    </PortalWrapper>
  );
}

function Router() {
  return (
    <Switch>
      {/* Auth (no footer, minimal layout) */}
      <Route path="/auth/login">
        <PortalWrapper><Login /></PortalWrapper>
      </Route>
      <Route path="/auth/signup">
        <PortalWrapper><Signup /></PortalWrapper>
      </Route>
      <Route path="/auth/reset-password">
        <PortalWrapper><ResetPassword /></PortalWrapper>
      </Route>

      {/* Passenger Portal */}
      <Route path="/passenger/dashboard">
        <PassengerRoute component={PassengerDashboard} />
      </Route>
      <Route path="/passenger/rides/:id">
        <PassengerRoute component={PassengerRideDetail} />
      </Route>
      <Route path="/passenger/rides">
        <PassengerRoute component={PassengerRides} />
      </Route>
      <Route path="/passenger/addresses">
        <PassengerRoute component={PassengerAddresses} />
      </Route>
      <Route path="/passenger/profile">
        <PassengerRoute component={PassengerProfile} />
      </Route>
      <Route path="/passenger/support">
        <PassengerRoute component={PassengerSupport} />
      </Route>

      {/* Corporate Portal */}
      <Route path="/corporate/book">
        <CorporateRoute component={CorporateBook} />
      </Route>
      <Route path="/corporate/bookings">
        <CorporateRoute component={CorporateBookings} />
      </Route>
      <Route path="/corporate/profile">
        <CorporateRoute component={CorporateProfile} />
      </Route>
      <Route path="/corporate/dashboard">
        <CorporateRoute component={CorporateDashboard} />
      </Route>
      <Route path="/corporate">
        <CorporateRoute component={CorporateDashboard} />
      </Route>

      {/* Driver Portal */}
      <Route path="/driver/onboarding">
        <PortalWrapper><DriverOnboarding /></PortalWrapper>
      </Route>
      <Route path="/driver/earnings">
        <DriverRoute component={DriverEarnings} />
      </Route>
      <Route path="/driver/history">
        <DriverRoute component={DriverHistory} />
      </Route>
      <Route path="/driver/profile">
        <DriverRoute component={DriverProfile} />
      </Route>
      <Route path="/driver/dashboard">
        <DriverRoute component={DriverDashboard} />
      </Route>
      <Route path="/driver">
        <DriverRoute component={DriverDashboard} />
      </Route>

      {/* Admin Portal */}
      <Route path="/admin/bookings">
        <AdminRoute component={AdminBookings} />
      </Route>
      <Route path="/admin/passengers">
        <AdminRoute component={AdminPassengers} />
      </Route>
      <Route path="/admin/drivers">
        <AdminRoute component={AdminDrivers} />
      </Route>
      <Route path="/admin/fleet">
        <AdminRoute component={AdminFleet} />
      </Route>
      <Route path="/admin/dispatch">
        <AdminRoute component={AdminDispatch} />
      </Route>
      <Route path="/admin/pricing">
        <AdminRoute component={AdminPricing} />
      </Route>
      <Route path="/admin/promos">
        <AdminRoute component={AdminPromos} />
      </Route>
      <Route path="/admin/support">
        <AdminRoute component={AdminSupport} />
      </Route>
      <Route path="/admin/reports">
        <AdminRoute component={AdminReports} />
      </Route>
      <Route path="/admin/settings">
        <AdminRoute component={AdminSettings} />
      </Route>
      <Route path="/admin/payouts">
        <AdminRoute component={AdminPayouts} />
      </Route>
      <Route path="/admin">
        <AdminRoute component={AdminDashboard} />
      </Route>

      {/* Public Marketing + Booking */}
      <Route path="/">
        <Layout><Home /></Layout>
      </Route>
      <Route path="/about">
        <Layout><About /></Layout>
      </Route>
      <Route path="/services/airport-transfers">
        <Layout><AirportTransfers /></Layout>
      </Route>
      <Route path="/services/hourly-chauffeur">
        <Layout><HourlyChauffeur /></Layout>
      </Route>
      <Route path="/services/corporate">
        <Layout><Corporate /></Layout>
      </Route>
      <Route path="/services/events">
        <Layout><Events /></Layout>
      </Route>
      <Route path="/services">
        <Layout><Services /></Layout>
      </Route>
      <Route path="/fleet">
        <Layout><Fleet /></Layout>
      </Route>
      <Route path="/contact">
        <Layout><Contact /></Layout>
      </Route>
      <Route path="/faq">
        <Layout><FAQ /></Layout>
      </Route>
      <Route path="/terms">
        <Layout><Terms /></Layout>
      </Route>
      <Route path="/privacy">
        <Layout><Privacy /></Layout>
      </Route>
      <Route path="/book">
        <Layout><Book /></Layout>
      </Route>
      <Route path="/booking-confirmation/:id">
        <Layout><BookingConfirmation /></Layout>
      </Route>
      <Route path="/track/:id">
        <Layout><Track /></Layout>
      </Route>

      <Route>
        <Layout><NotFound /></Layout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <DriverStatusProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </DriverStatusProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
