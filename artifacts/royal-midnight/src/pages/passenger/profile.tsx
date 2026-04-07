import { useGetUser, useUpdateUser, getGetUserQueryKey } from "@workspace/api-client-react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useAuth } from "@/contexts/auth";
import { LayoutDashboard, Car, MapPin, User, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

const passengerNavItems = [
  { label: "Dashboard", href: "/passenger/dashboard", icon: LayoutDashboard },
  { label: "My Rides", href: "/passenger/rides", icon: Car },
  { label: "Saved Addresses", href: "/passenger/addresses", icon: MapPin },
  { label: "Profile", href: "/passenger/profile", icon: User },
  { label: "Support", href: "/passenger/support", icon: MessageSquare },
];

function PassengerProfileInner() {
  const { user: authUser, login } = useAuth();
  const userId = authUser?.id ?? 0;
  const { data: user, isLoading } = useGetUser(userId, { query: { enabled: !!userId, queryKey: getGetUserQueryKey(userId) } });
  const updateUser = useUpdateUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (user) {
      setName(user.name);
      setPhone(user.phone || "");
    }
  }, [user]);

  const handleSave = () => {
    updateUser.mutate({
      id: userId,
      data: { name, phone }
    }, {
      onSuccess: () => {
        toast({ title: "Profile updated" });
        queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(userId) });
      }
    });
  };

  return (
    <PortalLayout title="Passenger Portal" navItems={passengerNavItems}>
      <h1 className="font-serif text-2xl sm:text-3xl mb-6 sm:mb-8">My Profile</h1>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading profile...</div>
      ) : (
        <div className="max-w-2xl bg-card border border-border p-8 rounded-lg">
          <div className="space-y-6">
            <div>
              <label className="text-sm font-medium mb-2 block">Email Address</label>
              <Input value={user?.email || ""} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground mt-1">Email cannot be changed.</p>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Full Name</label>
              <Input value={name} onChange={e => setName(e.target.value)} />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Phone Number</label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} />
            </div>

            <div className="pt-6 border-t border-border">
              <Button onClick={handleSave} disabled={updateUser.isPending}>
                {updateUser.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}

export default function PassengerProfile() {
  return (
    <AuthGuard requiredRole="passenger">
      <PassengerProfileInner />
    </AuthGuard>
  );
}
