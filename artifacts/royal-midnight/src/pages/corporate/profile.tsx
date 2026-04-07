import { PortalLayout } from "@/components/layout/PortalLayout";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useAuth } from "@/contexts/auth";
import { LayoutDashboard, Plus, BookOpen, User, Building2, Mail, Phone } from "lucide-react";

const corporateNavItems = [
  { label: "Dashboard", href: "/corporate/dashboard", icon: LayoutDashboard },
  { label: "Book a Trip", href: "/corporate/book", icon: Plus },
  { label: "All Bookings", href: "/corporate/bookings", icon: BookOpen },
  { label: "Profile", href: "/corporate/profile", icon: User },
];

function CorporateProfileInner() {
  const { user } = useAuth();
  const [companyName, contactName] = (user?.name ?? "").split(" — ");

  return (
    <PortalLayout title="Corporate Portal" navItems={corporateNavItems}>
      <div className="mb-8">
        <h1 className="font-serif text-2xl sm:text-3xl mb-1">Account Profile</h1>
        <p className="text-muted-foreground text-sm">Your corporate account information.</p>
      </div>

      <div className="max-w-lg space-y-6">
        <div className="bg-card border border-border p-6 sm:p-8 space-y-6">
          <h2 className="font-serif text-lg border-b border-border pb-4">Company Details</h2>

          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Building2 className="w-7 h-7 text-primary" />
            </div>
            <div>
              <p className="font-medium text-lg">{companyName || user?.name}</p>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Corporate Account</p>
            </div>
          </div>

          {contactName && (
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Contact Name</p>
              <p className="text-sm">{contactName}</p>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-widest mb-0.5">Email</p>
                <p className="text-sm">{user?.email}</p>
              </div>
            </div>
            {user?.phone && (
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-widest mb-0.5">Phone</p>
                  <p className="text-sm">{user.phone}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-card border border-border p-6 sm:p-8">
          <h2 className="font-serif text-lg border-b border-border pb-4 mb-4">Billing</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your account is set up for corporate billing. All trips are billed monthly to your account. For billing inquiries, contact us at{" "}
            <a href="mailto:billing@royalmidnight.com" className="text-primary hover:text-primary/80 transition-colors">
              billing@royalmidnight.com
            </a>
            .
          </p>
        </div>

        <div className="bg-card border border-border p-6 sm:p-8">
          <h2 className="font-serif text-lg border-b border-border pb-4 mb-4">Support</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            For account changes, password resets, or corporate inquiries, contact your Royal Midnight account manager at{" "}
            <a href="mailto:corporate@royalmidnight.com" className="text-primary hover:text-primary/80 transition-colors">
              corporate@royalmidnight.com
            </a>
            {" "}or call{" "}
            <a href="tel:+13055550100" className="text-primary hover:text-primary/80 transition-colors">
              (305) 555-0100
            </a>
            .
          </p>
        </div>
      </div>
    </PortalLayout>
  );
}

export default function CorporateProfile() {
  return (
    <AuthGuard requiredRole="corporate">
      <CorporateProfileInner />
    </AuthGuard>
  );
}
