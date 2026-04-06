import { useListAddresses, useCreateAddress, useDeleteAddress } from "@workspace/api-client-react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useAuth } from "@/contexts/auth";
import { LayoutDashboard, Car, MapPin, User, MessageSquare, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const passengerNavItems = [
  { label: "Dashboard", href: "/passenger/dashboard", icon: LayoutDashboard },
  { label: "My Rides", href: "/passenger/rides", icon: Car },
  { label: "Saved Addresses", href: "/passenger/addresses", icon: MapPin },
  { label: "Profile", href: "/passenger/profile", icon: User },
  { label: "Support", href: "/passenger/support", icon: MessageSquare },
];

function PassengerAddressesInner() {
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const { data: addresses, isLoading } = useListAddresses({ userId }, { query: { enabled: !!userId, queryKey: ["addresses", userId] } });
  const createAddress = useCreateAddress();
  const deleteAddress = useDeleteAddress();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isAdding, setIsAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");

  const handleAdd = () => {
    if (!label || !address) return;
    
    createAddress.mutate({
      data: {
        userId,
        label,
        address
      }
    }, {
      onSuccess: () => {
        toast({ title: "Address saved" });
        setIsAdding(false);
        setLabel("");
        setAddress("");
        queryClient.invalidateQueries({ queryKey: ["addresses", userId] });
      }
    });
  };

  return (
    <PortalLayout title="Passenger Portal" navItems={passengerNavItems}>
      <div className="flex justify-between items-center mb-8">
        <h1 className="font-serif text-3xl">Saved Addresses</h1>
        {!isAdding && (
          <Button onClick={() => setIsAdding(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Add Address
          </Button>
        )}
      </div>

      {isAdding && (
        <div className="bg-card border border-border p-6 rounded-lg mb-8 space-y-4">
          <h3 className="font-serif text-xl mb-4">Add New Address</h3>
          <div className="grid gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Label (e.g. Home, Office)</label>
              <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Home" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Full Address</label>
              <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St, Miami, FL 33132" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={handleAdd} disabled={!label || !address || createAddress.isPending}>Save</Button>
            <Button variant="outline" onClick={() => setIsAdding(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading addresses...</div>
      ) : addresses?.length ? (
        <div className="grid md:grid-cols-2 gap-6">
          {addresses.map(addr => (
            <div key={addr.id} className="bg-card border border-border p-6 rounded-lg flex justify-between items-start group">
              <div>
                <h3 className="font-medium text-lg mb-1">{addr.label}</h3>
                <p className="text-muted-foreground">{addr.address}</p>
              </div>
              <button
                className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => {
                  deleteAddress.mutate(
                    { id: addr.id },
                    {
                      onSuccess: () => {
                        toast({ title: "Address removed" });
                        queryClient.invalidateQueries({ queryKey: ["addresses", userId] });
                      },
                    }
                  );
                }}
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg p-12 text-center text-muted-foreground">
          No saved addresses yet.
        </div>
      )}
    </PortalLayout>
  );
}

export default function PassengerAddresses() {
  return (
    <AuthGuard requiredRole="passenger">
      <PassengerAddressesInner />
    </AuthGuard>
  );
}
