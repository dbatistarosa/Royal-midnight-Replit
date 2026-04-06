import { useState, useEffect } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, History, DollarSign, User, Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useDriverStatus } from "@/contexts/driverStatus";
import { useAuth } from "@/contexts/auth";
import { API_BASE } from "@/lib/constants";
import { format } from "date-fns";

type Review = {
  id: number;
  rating: number;
  comment: string | null;
  createdAt: string;
  bookingId: number;
};

const driverNavItems = [
  { label: "Dashboard", href: "/driver/dashboard", icon: LayoutDashboard },
  { label: "History", href: "/driver/history", icon: History },
  { label: "Earnings", href: "/driver/earnings", icon: DollarSign },
  { label: "Profile", href: "/driver/profile", icon: User },
];

const labelClass = "text-gray-400 uppercase tracking-widest text-xs block mb-1.5";
const inputClass = "bg-white/5 border-white/10 text-white rounded-none h-11";

export default function DriverProfile() {
  const { driverRecord, isLoading: driverLoading, refetch } = useDriverStatus();
  const { user, token } = useAuth();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (driverRecord?.phone) setPhone(driverRecord.phone);
  }, [driverRecord?.phone]);

  useEffect(() => {
    if (!driverRecord?.id) return;
    setReviewsLoading(true);
    fetch(`${API_BASE}/reviews?driverId=${driverRecord.id}`)
      .then(r => r.ok ? r.json() as Promise<Review[]> : Promise.resolve([]))
      .then(data => setReviews(Array.isArray(data) ? data : []))
      .catch(() => setReviews([]))
      .finally(() => setReviewsLoading(false));
  }, [driverRecord?.id]);

  const handleSave = async () => {
    if (!driverRecord?.id || !token) return;
    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE}/drivers/${driverRecord.id}/contact`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        toast({ title: "Save failed", description: err.error ?? "Could not save profile.", variant: "destructive" });
        return;
      }
      toast({ title: "Profile updated", description: "Your changes have been saved." });
      refetch();
    } catch {
      toast({ title: "Error", description: "Could not save profile.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (driverLoading) {
    return (
      <PortalLayout title="Driver Portal" navItems={driverNavItems}>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title="Driver Portal" navItems={driverNavItems}>
      <h1 className="font-serif text-3xl mb-8">My Profile</h1>

      <div className="max-w-2xl space-y-8">
        <div className="bg-card border border-border rounded-none p-8">
          <h2 className="font-serif text-lg mb-6 text-muted-foreground uppercase tracking-widest text-sm">Account Information</h2>
          <div className="space-y-5">
            <div>
              <label className={labelClass}>Email Address</label>
              <Input value={user?.email ?? ""} disabled className={inputClass + " opacity-50"} />
              <p className="text-xs text-muted-foreground mt-1">Email cannot be changed.</p>
            </div>

            <div>
              <label className={labelClass}>Full Name</label>
              <Input value={driverRecord?.name ?? user?.name ?? ""} disabled className={inputClass + " opacity-50"} />
              <p className="text-xs text-muted-foreground mt-1">Contact admin to change legal name.</p>
            </div>

            <div>
              <label className={labelClass}>Phone Number</label>
              <Input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className={inputClass}
                placeholder="+1 (305) 555-0000"
              />
            </div>

            <div className="pt-4">
              <Button
                onClick={handleSave}
                disabled={isSaving || !driverRecord}
                className="bg-primary text-black hover:bg-primary/90 rounded-none uppercase tracking-[0.2em] text-xs px-8 h-11"
              >
                {isSaving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</> : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-none p-8">
          <h2 className="font-serif text-lg mb-6 text-muted-foreground uppercase tracking-widest text-sm">Vehicle Information</h2>
          {driverRecord?.vehicleMake ? (
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className={labelClass}>Year</label>
                <Input value={driverRecord.vehicleYear ?? ""} disabled className={inputClass + " opacity-50"} />
              </div>
              <div>
                <label className={labelClass}>Make</label>
                <Input value={driverRecord.vehicleMake ?? ""} disabled className={inputClass + " opacity-50"} />
              </div>
              <div>
                <label className={labelClass}>Model</label>
                <Input value={driverRecord.vehicleModel ?? ""} disabled className={inputClass + " opacity-50"} />
              </div>
              <div>
                <label className={labelClass}>Color</label>
                <Input value={driverRecord.vehicleColor ?? ""} disabled className={inputClass + " opacity-50"} />
              </div>
              {driverRecord.passengerCapacity != null && (
                <div>
                  <label className={labelClass}>Passenger Capacity</label>
                  <Input value={String(driverRecord.passengerCapacity)} disabled className={inputClass + " opacity-50"} />
                </div>
              )}
              {driverRecord.serviceArea && (
                <div>
                  <label className={labelClass}>Service Area</label>
                  <Input value={driverRecord.serviceArea} disabled className={inputClass + " opacity-50"} />
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No vehicle information on file. Contact admin to update.</p>
          )}
        </div>

        <div className="bg-card border border-border rounded-none p-8">
          <h2 className="font-serif text-lg mb-6 text-muted-foreground uppercase tracking-widest text-sm">Performance</h2>
          <div className="grid grid-cols-3 gap-6">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Star className="w-4 h-4 text-primary fill-primary" />
                <span className="text-2xl font-serif">{driverRecord?.rating?.toFixed(1) ?? "—"}</span>
              </div>
              <div className="text-xs text-muted-foreground uppercase tracking-widest">Rating</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-serif mb-1">{driverRecord?.totalRides ?? 0}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-widest">Total Rides</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-serif mb-1 capitalize">{driverRecord?.approvalStatus ?? "—"}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-widest">Status</div>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-none p-8">
          <h2 className="font-serif text-lg mb-6 text-muted-foreground uppercase tracking-widest text-sm">Customer Reviews</h2>
          {reviewsLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => <div key={i} className="h-16 bg-muted/20 animate-pulse rounded-none" />)}
            </div>
          ) : reviews.length > 0 ? (
            <div className="space-y-4">
              {reviews.slice(0, 10).map(review => (
                <div key={review.id} className="border border-border/50 p-4 rounded-none">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map(star => (
                        <Star
                          key={star}
                          className={`w-3.5 h-3.5 ${star <= review.rating ? "text-primary fill-primary" : "text-muted-foreground/30"}`}
                        />
                      ))}
                      <span className="text-xs text-muted-foreground ml-1">{review.rating}/5</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(review.createdAt), "MMM d, yyyy")}
                    </span>
                  </div>
                  {review.comment && (
                    <p className="text-sm text-foreground/80 italic">"{review.comment}"</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No reviews yet. Complete your first ride to receive feedback.</p>
          )}
        </div>
      </div>
    </PortalLayout>
  );
}
