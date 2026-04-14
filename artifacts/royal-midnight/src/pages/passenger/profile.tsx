import { useGetUser, useUpdateUser, getGetUserQueryKey } from "@workspace/api-client-react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useAuth } from "@/contexts/auth";
import { LayoutDashboard, Car, MapPin, User, MessageSquare, Thermometer, Music, Volume2, Coffee, DoorOpen, Tag, Users, Plus, Trash2, Loader2, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE } from "@/lib/constants";

const passengerNavItems = [
  { label: "Dashboard", href: "/passenger/dashboard", icon: LayoutDashboard },
  { label: "My Rides", href: "/passenger/rides", icon: Car },
  { label: "Reports", href: "/passenger/reports", icon: BarChart2 },
  { label: "Saved Addresses", href: "/passenger/addresses", icon: MapPin },
  { label: "Profile", href: "/passenger/profile", icon: User },
  { label: "Support", href: "/passenger/support", icon: MessageSquare },
];

const MUSIC_OPTIONS = ["No Preference", "Jazz", "Classical", "R&B / Soul", "Pop", "Rock", "Hip-Hop", "Latin", "Silence"];
const BEVERAGE_OPTIONS = ["No Preference", "Sparkling Water", "Still Water", "None"];
const TITLE_OPTIONS = ["No Preference", "Mr.", "Ms.", "Mrs.", "Dr.", "Prof."];
const TEMP_PRESETS = [65, 68, 70, 72, 74, 76, 78];

type UserPrefs = {
  cabinTempF: number | null;
  musicPreference: string | null;
  quietRide: boolean;
  preferredBeverage: string | null;
  opensOwnDoor: boolean;
  addressTitle: string | null;
};

function TogglePill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs border transition-colors ${
        active
          ? "bg-primary text-black border-primary font-semibold"
          : "bg-transparent text-muted-foreground border-border hover:border-white/30 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

type ManagedTraveler = { eaUserId: number; travelerId: number; travelerName: string | null; travelerEmail: string | null };

function ManagedTravelersPanel({ userId, token }: { userId: number; token: string }) {
  const { toast } = useToast();
  const [travelers, setTravelers] = useState<ManagedTraveler[]>([]);
  const [loading, setLoading] = useState(true);
  const [addEmail, setAddEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/users/${userId}/managed-travelers`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() as Promise<ManagedTraveler[]> : Promise.resolve([]))
      .then(setTravelers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId, token]);

  const handleAdd = async () => {
    if (!addEmail.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`${API_BASE}/users/${userId}/managed-travelers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: addEmail.trim() }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        toast({ title: err.error || "Could not add traveler", variant: "destructive" }); return;
      }
      const t = await res.json() as ManagedTraveler;
      setTravelers(prev => [...prev, t]);
      setAddEmail("");
      toast({ title: "Traveler linked" });
    } catch {
      toast({ title: "Error adding traveler", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (travelerId: number) => {
    setRemoving(travelerId);
    try {
      await fetch(`${API_BASE}/users/${userId}/managed-travelers/${travelerId}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      setTravelers(prev => prev.filter(t => t.travelerId !== travelerId));
      toast({ title: "Traveler removed" });
    } catch {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="bg-card border border-border p-5 sm:p-7 space-y-4">
      <div className="flex items-start gap-3 mb-2">
        <div className="w-8 h-8 bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Users className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium text-white">Delegate / Travel Manager</p>
          <p className="text-xs text-muted-foreground mt-0.5">Link travelers whose bookings you manage. When booking you can switch who the trip is for.</p>
        </div>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
      ) : (
        <>
          {travelers.length > 0 && (
            <div className="space-y-0 divide-y divide-white/5">
              {travelers.map(t => (
                <div key={t.travelerId} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm text-white">{t.travelerName ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{t.travelerEmail ?? ""}</p>
                  </div>
                  <button
                    onClick={() => handleRemove(t.travelerId)}
                    disabled={removing === t.travelerId}
                    className="text-gray-600 hover:text-red-400 p-1 transition-colors"
                  >
                    {removing === t.travelerId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              className="flex-1 rounded-none bg-white/5 border-white/10 text-white placeholder:text-gray-600"
              placeholder="Traveler's Royal Midnight email"
              value={addEmail}
              onChange={e => setAddEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && void handleAdd()}
            />
            <Button
              onClick={handleAdd}
              disabled={adding || !addEmail.trim()}
              className="rounded-none bg-primary text-black hover:bg-primary/90 text-xs uppercase tracking-widest px-4"
            >
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            The traveler must have an existing Royal Midnight account. Enter their exact login email.
          </p>
        </>
      )}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-8 h-8 rounded-none bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div>
        <p className="text-sm font-medium text-white">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function PassengerProfileInner() {
  const { user: authUser, token } = useAuth();
  const userId = authUser?.id;
  const { data: user, isLoading } = useGetUser(userId ?? 0, {
    query: { enabled: userId != null, queryKey: getGetUserQueryKey(userId ?? 0) },
  });
  const updateUser = useUpdateUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Basic info
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  // Preferences
  const [prefs, setPrefs] = useState<UserPrefs>({
    cabinTempF: null,
    musicPreference: null,
    quietRide: false,
    preferredBeverage: null,
    opensOwnDoor: false,
    addressTitle: null,
  });
  const [prefsSaving, setPrefsSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setPhone(user.phone || "");
      const u = user as any;
      setPrefs({
        cabinTempF: u.cabinTempF ?? null,
        musicPreference: u.musicPreference ?? null,
        quietRide: u.quietRide ?? false,
        preferredBeverage: u.preferredBeverage ?? null,
        opensOwnDoor: u.opensOwnDoor ?? false,
        addressTitle: u.addressTitle ?? null,
      });
    }
  }, [user]);

  const handleSaveBasic = () => {
    if (userId == null) return;
    updateUser.mutate(
      { id: userId, data: { name, phone } },
      {
        onSuccess: () => {
          toast({ title: "Profile updated" });
          queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(userId) });
        },
        onError: () => toast({ title: "Error", description: "Could not save changes.", variant: "destructive" }),
      }
    );
  };

  const handleSavePrefs = async () => {
    if (userId == null || !token) return;
    setPrefsSaving(true);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Preferences saved", description: "Your cabin preferences will be shared with your chauffeur." });
      queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(userId) });
    } catch {
      toast({ title: "Error", description: "Could not save preferences.", variant: "destructive" });
    } finally {
      setPrefsSaving(false);
    }
  };

  return (
    <PortalLayout title="Passenger Portal" navItems={passengerNavItems}>
      <h1 className="font-serif text-2xl sm:text-3xl mb-6 sm:mb-8">My Profile</h1>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading profile...</div>
      ) : (
        <div className="space-y-8 max-w-2xl">
          {/* ── Basic Info ── */}
          <div className="bg-card border border-border p-8">
            <h2 className="font-serif text-lg mb-6">Account Details</h2>
            <div className="space-y-5">
              <div>
                <label className="text-xs uppercase tracking-widest text-muted-foreground block mb-1.5">Email Address</label>
                <Input value={user?.email || ""} disabled className="bg-muted rounded-none" />
                <p className="text-xs text-muted-foreground mt-1">Email cannot be changed.</p>
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-muted-foreground block mb-1.5">Full Name</label>
                <Input value={name} onChange={e => setName(e.target.value)} className="rounded-none" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-muted-foreground block mb-1.5">Phone Number</label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} className="rounded-none" placeholder="+1 (555) 000-0000" />
              </div>
              <div className="pt-4 border-t border-border">
                <Button onClick={handleSaveBasic} disabled={updateUser.isPending} className="rounded-none bg-white text-black hover:bg-white/90 text-xs uppercase tracking-widest">
                  {updateUser.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </div>

          {/* ── Preference Center ── */}
          <div className="bg-card border border-primary/20 p-8">
            <div className="mb-6">
              <h2 className="font-serif text-lg text-primary mb-1">Cabin Preference Center</h2>
              <p className="text-xs text-muted-foreground">
                These preferences are automatically shared with your assigned chauffeur before every booking so your vehicle is staged exactly as you like it.
              </p>
            </div>

            <div className="space-y-8">
              {/* Preferred Title */}
              <div>
                <SectionHeader icon={Tag} title="How should we address you?" subtitle="Shown on your driver's trip manifest." />
                <div className="flex flex-wrap gap-2">
                  {TITLE_OPTIONS.map(t => (
                    <TogglePill
                      key={t}
                      active={(prefs.addressTitle ?? "No Preference") === t}
                      onClick={() => setPrefs(p => ({ ...p, addressTitle: t === "No Preference" ? null : t }))}
                    >
                      {t}
                    </TogglePill>
                  ))}
                </div>
              </div>

              {/* Cabin Temperature */}
              <div>
                <SectionHeader icon={Thermometer} title="Cabin Temperature" subtitle="Your preferred temperature in °F." />
                <div className="flex flex-wrap gap-2">
                  <TogglePill
                    active={prefs.cabinTempF == null}
                    onClick={() => setPrefs(p => ({ ...p, cabinTempF: null }))}
                  >
                    No Preference
                  </TogglePill>
                  {TEMP_PRESETS.map(t => (
                    <TogglePill
                      key={t}
                      active={prefs.cabinTempF === t}
                      onClick={() => setPrefs(p => ({ ...p, cabinTempF: t }))}
                    >
                      {t}°F
                    </TogglePill>
                  ))}
                </div>
              </div>

              {/* Music */}
              <div>
                <SectionHeader icon={Music} title="Music Preference" subtitle="Genre or style you'd like playing on pickup." />
                <div className="flex flex-wrap gap-2">
                  {MUSIC_OPTIONS.map(m => (
                    <TogglePill
                      key={m}
                      active={(prefs.musicPreference ?? "No Preference") === m}
                      onClick={() => setPrefs(p => ({ ...p, musicPreference: m === "No Preference" ? null : m }))}
                    >
                      {m}
                    </TogglePill>
                  ))}
                </div>
              </div>

              {/* Quiet Ride */}
              <div>
                <SectionHeader icon={Volume2} title="Quiet Ride" subtitle="Let your chauffeur know you prefer minimal conversation." />
                <div className="flex gap-2">
                  <TogglePill active={!prefs.quietRide} onClick={() => setPrefs(p => ({ ...p, quietRide: false }))}>
                    Happy to chat
                  </TogglePill>
                  <TogglePill active={prefs.quietRide} onClick={() => setPrefs(p => ({ ...p, quietRide: true }))}>
                    Quiet ride please
                  </TogglePill>
                </div>
              </div>

              {/* Preferred Beverage */}
              <div>
                <SectionHeader icon={Coffee} title="Preferred Beverage" subtitle="For routes where refreshments are provided." />
                <div className="flex flex-wrap gap-2">
                  {BEVERAGE_OPTIONS.map(b => (
                    <TogglePill
                      key={b}
                      active={(prefs.preferredBeverage ?? "No Preference") === b}
                      onClick={() => setPrefs(p => ({ ...p, preferredBeverage: b === "No Preference" ? null : b }))}
                    >
                      {b}
                    </TogglePill>
                  ))}
                </div>
                <div className="mt-3">
                  <Input
                    className="rounded-none bg-white/5 border-white/10 text-sm max-w-xs"
                    placeholder="Other (e.g. Espresso, Coconut Water)"
                    value={BEVERAGE_OPTIONS.includes(prefs.preferredBeverage ?? "No Preference") ? "" : (prefs.preferredBeverage ?? "")}
                    onChange={e => setPrefs(p => ({ ...p, preferredBeverage: e.target.value || null }))}
                  />
                </div>
              </div>

              {/* Door preference */}
              <div>
                <SectionHeader icon={DoorOpen} title="Door Service" subtitle="Should your chauffeur open and close the door for you?" />
                <div className="flex gap-2">
                  <TogglePill active={!prefs.opensOwnDoor} onClick={() => setPrefs(p => ({ ...p, opensOwnDoor: false }))}>
                    Please open my door
                  </TogglePill>
                  <TogglePill active={prefs.opensOwnDoor} onClick={() => setPrefs(p => ({ ...p, opensOwnDoor: true }))}>
                    I prefer to open it myself
                  </TogglePill>
                </div>
              </div>
            </div>

            <div className="pt-6 mt-6 border-t border-primary/20">
              <Button
                onClick={() => void handleSavePrefs()}
                disabled={prefsSaving}
                className="rounded-none bg-primary text-black hover:bg-primary/90 text-xs uppercase tracking-widest px-6"
              >
                {prefsSaving ? "Saving Preferences..." : "Save Preferences"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Managed Travelers / Delegate panel */}
      {authUser && token && (
        <ManagedTravelersPanel userId={authUser.id} token={token} />
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
