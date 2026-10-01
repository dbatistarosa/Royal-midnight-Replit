import { useState, useEffect, useRef } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, History, DollarSign, User, Loader2, Star, Building2, ShieldCheck, Eye, EyeOff, Calendar, Lock, BarChart2, Camera, FileText, Car } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useDriverStatus } from "@/contexts/driverStatus";
import { useAuth } from "@/contexts/auth";
import { useSignedDocUrl } from "@/hooks/use-signed-doc-url";
import { API_BASE } from "@/lib/constants";
import { jsonAuthHeaders } from "@/lib/authHeaders";
import { useUpload } from "@workspace/object-storage-web";
import { driverNavItems } from "@/config/portalNav";

const labelClass = "text-gray-400 uppercase tracking-widest text-xs block mb-1.5";
const inputClass = "bg-white/5 border-white/10 text-white rounded-none h-11";

function ProfilePhotoUpload({
  currentUrl,
  onUploaded,
}: {
  currentUrl: string | null | undefined;
  onUploaded: (objectPath: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { url: signedPhotoUrl } = useSignedDocUrl(currentUrl ?? null);
  const { uploadFile, isUploading, progress } = useUpload({
    basePath: `${API_BASE}/storage`,
    onSuccess: (res) => {
      onUploaded(res.objectPath);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void uploadFile(file);
  };

  // Signed, short-lived URL — the photo lives in the private bucket, and a
  // stored absolute URL is never followed directly (CN-003, CN-041).
  const photoSrc = signedPhotoUrl;

  return (
    <div className="flex items-center gap-6">
      <div className="relative w-20 h-20 flex-shrink-0">
        {photoSrc ? (
          <img
            src={photoSrc}
            alt="Profile photo"
            className="w-20 h-20 rounded-full object-cover border border-border"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-white/10 border border-border flex items-center justify-center">
            <User className="w-8 h-8 text-muted-foreground" />
          </div>
        )}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="absolute -bottom-1 -right-1 bg-primary text-black rounded-full w-7 h-7 flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-50"
          title="Upload photo"
        >
          {isUploading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Camera className="w-3.5 h-3.5" />
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
      <div className="text-sm">
        <p className="text-foreground font-medium mb-0.5">Profile Photo</p>
        <p className="text-muted-foreground text-xs">
          {isUploading ? `Uploading… ${progress}%` : "Click the camera icon to upload a photo."}
        </p>
      </div>
    </div>
  );
}

export default function DriverProfile() {
  const { driverRecord, isLoading: driverLoading, refetch } = useDriverStatus();
  const { user, token } = useAuth();
  const { toast } = useToast();
  const [pendingPhotoPath, setPendingPhotoPath] = useState<string | null>(null);

  const handlePhotoUploaded = async (objectPath: string) => {
    if (!driverRecord?.id) {
      setPendingPhotoPath(objectPath);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/drivers/${driverRecord.id}/contact`, {
        method: "PATCH",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ profilePicture: objectPath }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        toast({ title: "Photo save failed", description: err.error ?? "Could not save photo.", variant: "destructive" });
        return;
      }
      toast({ title: "Photo submitted", description: "Your profile photo is waiting for administrator approval." });
      setPendingPhotoPath(objectPath);
      refetch();
    } catch {
      toast({ title: "Error", description: "Could not save photo.", variant: "destructive" });
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
      <h1 className="font-serif text-2xl sm:text-3xl mb-6 sm:mb-8">My Profile</h1>

      <div className="max-w-2xl space-y-8">
        <div className="bg-card border border-border rounded-none p-8">
          <h2 className="font-serif text-lg mb-6 text-muted-foreground uppercase tracking-widest text-sm">Account Information</h2>
          <div className="space-y-5">

            {/* Profile Photo */}
            <ProfilePhotoUpload
              currentUrl={driverRecord?.profilePicture}
              onUploaded={(path) => void handlePhotoUploaded(path)}
            />
            {pendingPhotoPath && (
              <p className="text-xs text-primary mt-2">A new photo is pending administrator approval. Your current approved photo remains active until then.</p>
            )}

            <div className="border-t border-border pt-5">
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
              <Input value={driverRecord?.phone ?? ""} disabled className={inputClass + " opacity-50"} />
              <p className="text-xs text-muted-foreground mt-1">Phone number changes require an administrator.</p>
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
                <span className="text-2xl font-serif">{driverRecord?.rating != null ? driverRecord.rating.toFixed(1) : "—"}</span>
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

      </div>
    </PortalLayout>
  );
}
