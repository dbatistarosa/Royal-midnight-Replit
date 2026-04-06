import { useListTickets, useCreateTicket } from "@workspace/api-client-react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useAuth } from "@/contexts/auth";
import { LayoutDashboard, Car, MapPin, User, MessageSquare, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

const passengerNavItems = [
  { label: "Dashboard", href: "/passenger/dashboard", icon: LayoutDashboard },
  { label: "My Rides", href: "/passenger/rides", icon: Car },
  { label: "Saved Addresses", href: "/passenger/addresses", icon: MapPin },
  { label: "Profile", href: "/passenger/profile", icon: User },
  { label: "Support", href: "/passenger/support", icon: MessageSquare },
];

function PassengerSupportInner() {
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const { data: tickets, isLoading } = useListTickets({ userId }, { query: { enabled: !!userId, queryKey: ["tickets", userId] } });
  const createTicket = useCreateTicket();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isCreating, setIsCreating] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = () => {
    if (!subject || !message) return;
    
    createTicket.mutate({
      data: {
        userId,
        name: "Mock User",
        email: "mock@example.com",
        subject,
        message,
        priority: "normal"
      }
    }, {
      onSuccess: () => {
        toast({ title: "Ticket created" });
        setIsCreating(false);
        setSubject("");
        setMessage("");
        queryClient.invalidateQueries({ queryKey: ["tickets", userId] });
      }
    });
  };

  return (
    <PortalLayout title="Passenger Portal" navItems={passengerNavItems}>
      <div className="flex justify-between items-center mb-8">
        <h1 className="font-serif text-3xl">Support</h1>
        {!isCreating && (
          <Button onClick={() => setIsCreating(true)} className="gap-2">
            <Plus className="w-4 h-4" /> New Ticket
          </Button>
        )}
      </div>

      {isCreating && (
        <div className="bg-card border border-border p-6 rounded-lg mb-8 space-y-4">
          <h3 className="font-serif text-xl mb-4">Create Support Ticket</h3>
          <div className="grid gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Subject</label>
              <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="E.g., Issue with recent ride" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Message</label>
              <Textarea 
                value={message} 
                onChange={e => setMessage(e.target.value)} 
                placeholder="Please describe your issue in detail..."
                className="min-h-[120px]"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={handleSubmit} disabled={!subject || !message || createTicket.isPending}>Submit</Button>
            <Button variant="outline" onClick={() => setIsCreating(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading tickets...</div>
      ) : tickets?.length ? (
        <div className="space-y-4">
          {tickets.map(ticket => (
            <div key={ticket.id} className="bg-card border border-border p-6 rounded-lg flex flex-col md:flex-row justify-between items-start gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-medium text-lg">{ticket.subject}</h3>
                  <span className={`px-2 py-0.5 rounded text-xs capitalize ${
                    ticket.status === 'closed' ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary border border-primary/20'
                  }`}>
                    {ticket.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mb-3">{format(new Date(ticket.createdAt), "PPP")}</p>
                <p className="text-sm">{ticket.message}</p>
              </div>
              <div className="text-sm text-muted-foreground">
                Ticket #{ticket.id}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg p-12 text-center text-muted-foreground">
          You don't have any support tickets.
        </div>
      )}
    </PortalLayout>
  );
}

export default function PassengerSupport() {
  return (
    <AuthGuard requiredRole="passenger">
      <PassengerSupportInner />
    </AuthGuard>
  );
}
