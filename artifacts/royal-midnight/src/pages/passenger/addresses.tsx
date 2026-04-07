import { useState, useEffect } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useAuth } from "@/contexts/auth";
import { LayoutDashboard, Car, MapPin, User, MessageSquare, Plus, Trash2, Pencil, X, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/constants";

const passengerNavItems = [
  { label: "Dashboard", href: "/passenger/dashboard", icon: LayoutDashboard },
  { label: "My Rides", href: "/passenger/rides", icon: Car },
  { label: "Saved Addresses", href: "/passenger/addresses", icon: MapPin },
  { label: "Profile", href: "/passenger/profile", icon: User },
  { label: "Support", href: "/passenger/support", icon: MessageSquare },
];

const labelClass = "text-gray-400 uppercase tracking-widest text-xs block mb-1.5";
const inputClass = "bg-white/5 border-white/10 text-white rounded-none h-10 text-sm";

type Address = {
  id: number;
  userId: number;
  label: string;
  address: string;
  createdAt: string;
};

function AddressCard({ addr, authHeader, onDelete, onUpdate }: {
  addr: Address;
  authHeader: string;
  onDelete: (id: number) => void;
  onUpdate: (id: number, label: string, address: string) => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(addr.label);
  const [editAddress, setEditAddress] = useState(addr.address);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    if (!editLabel.trim() || !editAddress.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/addresses/${addr.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ label: editLabel.trim(), address: editAddress.trim() }),
      });
      if (res.ok) {
        onUpdate(addr.id, editLabel.trim(), editAddress.trim());
        setEditing(false);
        toast({ title: "Address updated" });
      } else {
        const err = await res.json() as { error?: string };
        toast({ title: "Error", description: err.error ?? "Could not update address.", variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/addresses/${addr.id}`, {
        method: "DELETE",
        headers: { Authorization: authHeader },
      });
      if (res.ok || res.status === 204) {
        onDelete(addr.id);
        toast({ title: "Address removed" });
      } else {
        toast({ title: "Error", description: "Could not delete address.", variant: "destructive" });
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleCancel = () => {
    setEditLabel(addr.label);
    setEditAddress(addr.address);
    setEditing(false);
  };

  return (
    <div className="bg-card border border-border p-5 group">
      {editing ? (
        <div className="space-y-3">
          <div>
            <label className={labelClass}>Label</label>
            <Input value={editLabel} onChange={e => setEditLabel(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Full Address</label>
            <Input value={editAddress} onChange={e => setEditAddress(e.target.value)} className={inputClass} />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => void handleSave()}
              disabled={!editLabel.trim() || !editAddress.trim() || saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-black text-xs uppercase tracking-widest font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Save
            </button>
            <button
              onClick={handleCancel}
              className="flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-medium text-base mb-1">{addr.label}</h3>
            <p className="text-muted-foreground text-sm">{addr.address}</p>
          </div>
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => setEditing(true)}
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
              title="Edit address"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
              title="Delete address"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PassengerAddressesInner() {
  const { user, token } = useAuth();
  const userId = user?.id ?? 0;
  const authHeader = `Bearer ${token ?? ""}`;
  const { toast } = useToast();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchAddresses = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/addresses?userId=${userId}`, {
        headers: { Authorization: authHeader },
      });
      if (res.ok) {
        const data = await res.json() as Address[];
        setAddresses(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId && token) void fetchAddresses();
  }, [userId, token]);

  const handleAdd = async () => {
    if (!label.trim() || !address.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`${API_BASE}/addresses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ userId, label: label.trim(), address: address.trim() }),
      });
      if (res.ok) {
        const newAddr = await res.json() as Address;
        setAddresses(prev => [...prev, newAddr]);
        setIsAdding(false);
        setLabel("");
        setAddress("");
        toast({ title: "Address saved" });
      } else {
        const err = await res.json() as { error?: string };
        toast({ title: "Error", description: err.error ?? "Could not save address.", variant: "destructive" });
      }
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = (id: number) => {
    setAddresses(prev => prev.filter(a => a.id !== id));
  };

  const handleUpdate = (id: number, newLabel: string, newAddress: string) => {
    setAddresses(prev => prev.map(a => a.id === id ? { ...a, label: newLabel, address: newAddress } : a));
  };

  return (
    <PortalLayout title="Passenger Portal" navItems={passengerNavItems}>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 sm:mb-8 gap-3">
        <h1 className="font-serif text-2xl sm:text-3xl">Saved Addresses</h1>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 px-5 min-h-[44px] bg-primary text-black text-xs uppercase tracking-widest font-medium hover:bg-primary/90 transition-colors self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" /> Add Address
          </button>
        )}
      </div>

      {isAdding && (
        <div className="bg-card border border-border p-6 mb-8 space-y-4">
          <h3 className="font-serif text-xl mb-2">Add New Address</h3>
          <div className="grid gap-4">
            <div>
              <label className={labelClass}>Label (e.g. Home, Office)</label>
              <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Home" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Full Address</label>
              <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St, Miami, FL 33132" className={inputClass} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => void handleAdd()}
              disabled={!label.trim() || !address.trim() || adding}
              className="px-6 min-h-[44px] bg-primary text-black text-xs uppercase tracking-widest font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {adding ? "Saving..." : "Save Address"}
            </button>
            <button
              onClick={() => setIsAdding(false)}
              className="px-6 min-h-[44px] bg-white/5 border border-white/10 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : addresses.length > 0 ? (
        <div className="grid md:grid-cols-2 gap-4">
          {addresses.map(addr => (
            <AddressCard
              key={addr.id}
              addr={addr}
              authHeader={authHeader}
              onDelete={handleDelete}
              onUpdate={handleUpdate}
            />
          ))}
        </div>
      ) : (
        <div className="bg-card border border-border p-12 text-center text-muted-foreground">
          No saved addresses yet. Click "Add Address" to save your first location.
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
