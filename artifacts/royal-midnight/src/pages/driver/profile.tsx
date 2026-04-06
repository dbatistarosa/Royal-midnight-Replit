import { useGetDriver, useUpdateDriver, getGetDriverQueryKey } from "@workspace/api-client-react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, History, DollarSign, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

const driverNavItems = [
  { label: "Dashboard", href: "/driver/dashboard", icon: LayoutDashboard },
  { label: "History", href: "/driver/history", icon: History },
  { label: "Earnings", href: "/driver/earnings", icon: DollarSign },
  { label: "Profile", href: "/driver/profile", icon: User },
];

export default function DriverProfile() {
  const driverId = 1; // Mock session
  const { data: driver, isLoading } = useGetDriver(driverId, { query: { enabled: true, queryKey: getGetDriverQueryKey(driverId) } });
  const updateDriver = useUpdateDriver();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [license, setLicense] = useState("");

  useEffect(() => {
    if (driver) {
      setName(driver.name);
      setPhone(driver.phone);
      setLicense(driver.licenseNumber);
    }
  }, [driver]);

  const handleSave = () => {
    updateDriver.mutate({
      id: driverId,
      data: { 
        status: driver?.status || "active"
      }
    }, {
      onSuccess: () => {
        toast({ title: "Profile updated" });
        queryClient.invalidateQueries({ queryKey: getGetDriverQueryKey(driverId) });
      }
    });
  };

  return (
    <PortalLayout title="Driver Portal" navItems={driverNavItems}>
      <h1 className="font-serif text-3xl mb-8">My Profile</h1>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading profile...</div>
      ) : (
        <div className="max-w-2xl bg-card border border-border p-8 rounded-lg">
          <div className="space-y-6">
            <div>
              <label className="text-sm font-medium mb-2 block">Email Address</label>
              <Input value={driver?.email || ""} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground mt-1">Email cannot be changed.</p>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Full Name</label>
              <Input value={name} onChange={e => setName(e.target.value)} disabled />
              <p className="text-xs text-muted-foreground mt-1">Contact admin to change legal name.</p>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Phone Number</label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">License Number</label>
              <Input value={license} onChange={e => setLicense(e.target.value)} disabled />
            </div>

            <div className="pt-6 border-t border-border">
              <Button onClick={handleSave} disabled={updateDriver.isPending}>
                {updateDriver.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
