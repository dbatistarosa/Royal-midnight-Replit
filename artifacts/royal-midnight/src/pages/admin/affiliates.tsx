import { useState, useEffect, useCallback } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import {
  LayoutDashboard, Calendar, Users, Car, Map, DollarSign, Tag,
  MessageSquare, BarChart, Settings, Wallet, Loader2, Gift, CheckCircle, Clock, Building2,
} from "lucide-react";
import { format } from "date-fns";
import { API_BASE } from "@/lib/constants";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { adminNavItems } from "@/config/portalNav";


type Referral = {
  refereeId: number;
  refereeName: string;
  refereeEmail: string;
  refereeCreatedAt: string;
  referrerId: number | null;
  referrerName: string;
  referrerEmail: string;
  referrerCode: string | null;
  rewarded: boolean;
  rewardedAt: string | null;
};

type TopReferrer = {
  referrerId: number;
  referrerName: string;
  referrerEmail: string;
  referralCode: string | null;
  referredCount: number;
  rewardedCount: number;
};

type AffiliateData = {
  creditAmount: number;
  totals: { totalReferrers: number; totalReferred: number; totalRewarded: number; totalRewardedAmount: number };
  topReferrers: TopReferrer[];
  referrals: Referral[];
};

export default function AdminAffiliates() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<AffiliateData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const authHdr = token ? `Bearer ${token}` : "";

  const fetchAffiliates = useCallback(() => {
    if (!token) return;
    setIsLoading(true);
    fetch(`${API_BASE}/admin/affiliates`, { headers: { Authorization: authHdr } })
      .then(r => r.ok ? r.json() as Promise<AffiliateData> : Promise.reject(new Error("Failed")))
      .then(setData)
      .catch(() => toast({ title: "Error", description: "Could not load referral data.", variant: "destructive" }))
      .finally(() => setIsLoading(false));
  }, [token, authHdr, toast]);

  useEffect(() => { fetchAffiliates(); }, [fetchAffiliates]);

  return (
    <PortalLayout title="Royal Admin" navItems={adminNavItems}>
      <div className="mb-6 sm:mb-8">
        <h1 className="font-serif text-2xl sm:text-3xl">Affiliates &amp; Referrals</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every passenger gets a shareable link. Both sides earn ride credit once a referred friend completes their first ride.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : !data ? (
        <div className="p-12 text-center text-muted-foreground">Could not load referral data.</div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-card border border-border p-5">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Active Referrers</p>
              <p className="font-serif text-2xl text-primary">{data.totals.totalReferrers}</p>
            </div>
            <div className="bg-card border border-border p-5">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Total Referred Signups</p>
              <p className="font-serif text-2xl">{data.totals.totalReferred}</p>
            </div>
            <div className="bg-card border border-border p-5">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Rewards Paid</p>
              <p className="font-serif text-2xl text-green-400">{data.totals.totalRewarded}</p>
            </div>
            <div className="bg-card border border-border p-5">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Total Credited</p>
              <p className="font-serif text-2xl text-amber-400">${data.totals.totalRewardedAmount.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-1">${data.creditAmount.toFixed(0)} per successful referral</p>
            </div>
          </div>

          {/* Top Referrers */}
          <h2 className="font-serif text-lg mb-4">Top Referrers</h2>
          <div className="bg-card border border-border overflow-hidden mb-8">
            {!data.topReferrers.length ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No referrals yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[600px]">
                  <thead className="bg-background/50 border-b border-border">
                    <tr>
                      <th className="px-5 py-4 text-left text-xs text-muted-foreground uppercase tracking-widest font-medium">Referrer</th>
                      <th className="px-5 py-4 text-left text-xs text-muted-foreground uppercase tracking-widest font-medium">Code</th>
                      <th className="px-5 py-4 text-center text-xs text-muted-foreground uppercase tracking-widest font-medium">Referred</th>
                      <th className="px-5 py-4 text-center text-xs text-muted-foreground uppercase tracking-widest font-medium">Rewarded</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.topReferrers.map(r => (
                      <tr key={r.referrerId} className="hover:bg-background/30 transition-colors">
                        <td className="px-5 py-4">
                          <div className="font-medium">{r.referrerName}</div>
                          <div className="text-xs text-muted-foreground">{r.referrerEmail}</div>
                        </td>
                        <td className="px-5 py-4 font-mono text-primary">{r.referralCode ?? "—"}</td>
                        <td className="px-5 py-4 text-center">{r.referredCount}</td>
                        <td className="px-5 py-4 text-center text-green-400">{r.rewardedCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* All Referrals */}
          <h2 className="font-serif text-lg mb-4">All Referrals</h2>
          <div className="bg-card border border-border overflow-hidden">
            {!data.referrals.length ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No referrals yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead className="bg-background/50 border-b border-border">
                    <tr>
                      <th className="px-5 py-4 text-left text-xs text-muted-foreground uppercase tracking-widest font-medium">Referred Passenger</th>
                      <th className="px-5 py-4 text-left text-xs text-muted-foreground uppercase tracking-widest font-medium">Referred By</th>
                      <th className="px-5 py-4 text-left text-xs text-muted-foreground uppercase tracking-widest font-medium">Signed Up</th>
                      <th className="px-5 py-4 text-left text-xs text-muted-foreground uppercase tracking-widest font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.referrals.map(r => (
                      <tr key={r.refereeId} className="hover:bg-background/30 transition-colors">
                        <td className="px-5 py-4">
                          <div className="font-medium">{r.refereeName}</div>
                          <div className="text-xs text-muted-foreground">{r.refereeEmail}</div>
                        </td>
                        <td className="px-5 py-4">
                          <div>{r.referrerName}</div>
                          <div className="text-xs text-muted-foreground">{r.referrerEmail}</div>
                        </td>
                        <td className="px-5 py-4 text-muted-foreground">{format(new Date(r.refereeCreatedAt), "MMM d, yyyy")}</td>
                        <td className="px-5 py-4">
                          {r.rewarded ? (
                            <span className="flex items-center gap-1 text-xs text-green-400">
                              <CheckCircle className="w-3.5 h-3.5" />
                              Rewarded {r.rewardedAt ? format(new Date(r.rewardedAt), "MMM d, yyyy") : ""}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-amber-400">
                              <Clock className="w-3.5 h-3.5" />
                              Awaiting first completed ride
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </PortalLayout>
  );
}
