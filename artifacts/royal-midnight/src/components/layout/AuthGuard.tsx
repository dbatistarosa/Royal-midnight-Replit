import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { Loader2 } from "lucide-react";

interface AuthGuardProps {
  children: React.ReactNode;
  requiredRole?: "passenger" | "driver" | "admin";
  redirectTo?: string;
}

export function AuthGuard({ children, requiredRole, redirectTo = "/auth/login" }: AuthGuardProps) {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation(redirectTo);
    } else if (requiredRole && user?.role !== requiredRole && user?.role !== "admin") {
      setLocation("/");
    }
  }, [isAuthenticated, user, requiredRole, redirectTo, setLocation]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (requiredRole && user?.role !== requiredRole && user?.role !== "admin") {
    return null;
  }

  return <>{children}</>;
}
