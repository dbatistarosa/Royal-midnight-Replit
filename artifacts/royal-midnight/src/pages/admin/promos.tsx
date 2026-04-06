import { useListPromos } from "@workspace/api-client-react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, Calendar, Users, Car, Map, DollarSign, Tag, MessageSquare, BarChart, Settings } from "lucide-react";
import { format } from "date-fns";

const adminNavItems = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Bookings", href: "/admin/bookings", icon: Calendar },
  { label: "Dispatch", href: "/admin/dispatch", icon: Map },
  { label: "Passengers", href: "/admin/passengers", icon: Users },
  { label: "Drivers", href: "/admin/drivers", icon: Users },
  { label: "Fleet", href: "/admin/fleet", icon: Car },
  { label: "Pricing", href: "/admin/pricing", icon: DollarSign },
  { label: "Promos", href: "/admin/promos", icon: Tag },
  { label: "Support", href: "/admin/support", icon: MessageSquare },
  { label: "Reports", href: "/admin/reports", icon: BarChart },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

export default function AdminPromos() {
  const { data: promos, isLoading } = useListPromos();

  return (
    <PortalLayout title="Royal Admin" navItems={adminNavItems}>
      <h1 className="font-serif text-3xl mb-8">Promo Codes</h1>
      
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-background/50 border-b border-border">
              <tr>
                <th className="px-6 py-4 font-medium text-muted-foreground">Code</th>
                <th className="px-6 py-4 font-medium text-muted-foreground">Description</th>
                <th className="px-6 py-4 font-medium text-muted-foreground">Discount</th>
                <th className="px-6 py-4 font-medium text-muted-foreground">Uses</th>
                <th className="px-6 py-4 font-medium text-muted-foreground">Expires</th>
                <th className="px-6 py-4 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">Loading promos...</td>
                </tr>
              ) : promos?.map((promo) => (
                <tr key={promo.id} className="hover:bg-background/50">
                  <td className="px-6 py-4 font-mono font-bold text-primary">{promo.code}</td>
                  <td className="px-6 py-4">{promo.description}</td>
                  <td className="px-6 py-4">
                    {promo.discountType === 'percentage' ? `${promo.discountValue}%` : `$${promo.discountValue}`}
                  </td>
                  <td className="px-6 py-4">
                    {promo.usedCount} {promo.maxUses ? `/ ${promo.maxUses}` : ''}
                  </td>
                  <td className="px-6 py-4">
                    {promo.expiresAt ? format(new Date(promo.expiresAt), "MMM d, yyyy") : 'Never'}
                  </td>
                  <td className="px-6 py-4">
                    {promo.isActive ? (
                      <span className="text-green-500">Active</span>
                    ) : (
                      <span className="text-muted-foreground">Inactive</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PortalLayout>
  );
}
