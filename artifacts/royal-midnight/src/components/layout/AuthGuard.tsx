import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { Loader2 } from "lucide-react";

interface AuthGuardProps {
  children: React.ReactNode;
  requiredRole?: "passenger" | "driver" | "admin" | "corporate";
  redirectTo?: string;
}

export function AuthGuard({ children, requiredRole, redirectTo = "/auth/login" }: AuthGuardProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  // Corporate routes are strictly corporate-only — admin bypass does not apply
  const isCorporateRoute = requiredRole === "corporate";
  const hasAccess = !requiredRole || user?.role === requiredRole || (!isCorporateRoute && user?.role === "admin");

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      setLocation(redirectTo);
    } else if (!hasAccess) {
      setLocation("/");
    }
  }, [isLoading, isAuthenticated, hasAccess, redirectTo, setLocation]);

  // Wait for localStorage restore before making any routing decision
  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (!hasAccess) {
    return null;
  }

  return <>{children}</>;
}
