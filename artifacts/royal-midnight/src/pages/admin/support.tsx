import { useListTickets } from "@workspace/api-client-react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, Calendar, Users, Car, Map, DollarSign, Tag, MessageSquare, BarChart } from "lucide-react";
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
];

export default function AdminSupport() {
  const { data: tickets, isLoading } = useListTickets();

  return (
    <PortalLayout title="Royal Admin" navItems={adminNavItems}>
      <h1 className="font-serif text-3xl mb-8">Support Tickets</h1>
      
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-background/50 border-b border-border">
              <tr>
                <th className="px-6 py-4 font-medium text-muted-foreground">ID</th>
                <th className="px-6 py-4 font-medium text-muted-foreground">Date</th>
                <th className="px-6 py-4 font-medium text-muted-foreground">Name</th>
                <th className="px-6 py-4 font-medium text-muted-foreground">Subject</th>
                <th className="px-6 py-4 font-medium text-muted-foreground">Priority</th>
                <th className="px-6 py-4 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">Loading tickets...</td>
                </tr>
              ) : tickets?.map((ticket) => (
                <tr key={ticket.id} className="hover:bg-background/50">
                  <td className="px-6 py-4 font-medium">#{ticket.id}</td>
                  <td className="px-6 py-4">{format(new Date(ticket.createdAt), "MMM d, HH:mm")}</td>
                  <td className="px-6 py-4">{ticket.name}</td>
                  <td className="px-6 py-4">{ticket.subject}</td>
                  <td className="px-6 py-4 capitalize">{ticket.priority}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs capitalize ${
                      ticket.status === 'open' ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                      ticket.status === 'in_progress' ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20' :
                      'bg-green-500/10 text-green-500 border border-green-500/20'
                    }`}>
                      {ticket.status.replace('_', ' ')}
                    </span>
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
