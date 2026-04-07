import { useState, useEffect } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, Calendar, Users, Car, Map, DollarSign, Tag, MessageSquare, BarChart, Settings, ChevronDown, ChevronUp, Loader2, Send, X } from "lucide-react";
import { format } from "date-fns";
import { API_BASE } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";

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

type Ticket = {
  id: number;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: string;
  priority: string;
  createdAt: string;
};

type TicketMessage = {
  id: number;
  ticketId: number;
  userId: number | null;
  authorRole: string;
  message: string;
  createdAt: string;
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  open: { label: "Open", bg: "bg-red-500/10", color: "text-red-400", border: "border-red-500/20" },
  in_progress: { label: "In Progress", bg: "bg-amber-500/10", color: "text-amber-400", border: "border-amber-500/20" },
  closed: { label: "Closed", bg: "bg-white/5", color: "text-muted-foreground", border: "border-white/10" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: "Low", color: "text-muted-foreground" },
  medium: { label: "Medium", color: "text-amber-400" },
  high: { label: "High", color: "text-red-400" },
  urgent: { label: "Urgent", color: "text-red-500" },
};

function TicketPanel({ ticket, authHeader, onStatusChange }: {
  ticket: Ticket;
  authHeader: string;
  onStatusChange: (id: number, status: string) => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);

  const fetchMessages = async () => {
    setLoadingMsgs(true);
    try {
      const res = await fetch(`${API_BASE}/support/${ticket.id}/messages`, {
        headers: { Authorization: authHeader },
      });
      if (res.ok) {
        const data = await res.json() as TicketMessage[];
        setMessages(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoadingMsgs(false);
    }
  };

  const handleToggle = () => {
    if (!open) void fetchMessages();
    setOpen(o => !o);
  };

  const handleSend = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/support/${ticket.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ message: reply.trim() }),
      });
      if (res.ok) {
        const msg = await res.json() as TicketMessage;
        setMessages(prev => [...prev, msg]);
        setReply("");
        toast({ title: "Reply sent" });
      } else {
        const err = await res.json() as { error?: string };
        toast({ title: "Send failed", description: err.error ?? "Could not send reply.", variant: "destructive" });
      }
    } finally {
      setSending(false);
    }
  };

  const handleClose = async () => {
    setClosing(true);
    try {
      const res = await fetch(`${API_BASE}/support/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ status: "closed" }),
      });
      if (res.ok) {
        onStatusChange(ticket.id, "closed");
        toast({ title: "Ticket closed" });
      } else {
        toast({ title: "Error", description: "Could not close ticket.", variant: "destructive" });
      }
    } finally {
      setClosing(false);
    }
  };

  const handleReopen = async () => {
    try {
      const res = await fetch(`${API_BASE}/support/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ status: "open" }),
      });
      if (res.ok) {
        onStatusChange(ticket.id, "open");
        toast({ title: "Ticket reopened" });
      }
    } catch {
      toast({ title: "Error", description: "Could not reopen ticket.", variant: "destructive" });
    }
  };

  const cfg = STATUS_CONFIG[ticket.status] ?? STATUS_CONFIG["open"]!;
  const priCfg = PRIORITY_CONFIG[ticket.priority] ?? { label: ticket.priority, color: "text-muted-foreground" };

  return (
    <div className="bg-card border border-border">
      <button
        onClick={handleToggle}
        className="w-full flex justify-between items-start p-5 text-left hover:bg-white/2 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <span className="font-medium">#{ticket.id} — {ticket.subject}</span>
            <span className={`text-xs px-2 py-0.5 border ${cfg.bg} ${cfg.color} ${cfg.border} uppercase tracking-widest`}>
              {cfg.label}
            </span>
            <span className={`text-xs ${priCfg.color} uppercase tracking-widest`}>{priCfg.label}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {ticket.name} ({ticket.email}) · {format(new Date(ticket.createdAt), "MMM d, yyyy 'at' h:mm a")}
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1 ml-4" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1 ml-4" />}
      </button>

      {open && (
        <div className="border-t border-border">
          {loadingMsgs ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : (
            <div className="p-5 space-y-4">
              {/* Original message */}
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-none bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-xs font-medium flex-shrink-0">
                  {ticket.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-foreground">{ticket.name}</span>
                    <span className="text-xs text-muted-foreground">{format(new Date(ticket.createdAt), "MMM d 'at' h:mm a")}</span>
                  </div>
                  <p className="text-sm text-foreground/80 leading-relaxed">{ticket.message}</p>
                </div>
              </div>

              {/* Thread messages */}
              {messages.map(msg => {
                const isAdmin = msg.authorRole === "admin";
                return (
                  <div key={msg.id} className={`flex gap-3 ${isAdmin ? "flex-row-reverse" : ""}`}>
                    <div className={`w-8 h-8 rounded-none flex items-center justify-center text-xs font-medium flex-shrink-0 ${isAdmin ? "bg-blue-500/20 border border-blue-500/30 text-blue-400" : "bg-primary/20 border border-primary/30 text-primary"}`}>
                      {isAdmin ? "RM" : ticket.name.charAt(0).toUpperCase()}
                    </div>
                    <div className={`flex-1 min-w-0 ${isAdmin ? "text-right" : ""}`}>
                      <div className={`flex items-center gap-2 mb-1 ${isAdmin ? "justify-end" : ""}`}>
                        <span className={`text-xs font-medium ${isAdmin ? "text-blue-400" : "text-foreground"}`}>
                          {isAdmin ? "Royal Midnight Support" : ticket.name}
                        </span>
                        <span className="text-xs text-muted-foreground">{format(new Date(msg.createdAt), "MMM d 'at' h:mm a")}</span>
                      </div>
                      <div className={`inline-block max-w-[85%] p-3 text-sm leading-relaxed ${isAdmin ? "bg-blue-500/10 border border-blue-500/20 text-foreground/90" : "bg-white/5 border border-white/10 text-foreground/80"}`}>
                        {msg.message}
                      </div>
                    </div>
                  </div>
                );
              })}

              {messages.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-2">No replies yet.</p>
              )}

              {/* Admin controls */}
              <div className="pt-4 border-t border-border/50 space-y-3">
                {ticket.status !== "closed" && (
                  <>
                    <textarea
                      value={reply}
                      onChange={e => setReply(e.target.value)}
                      placeholder="Type your reply to the passenger..."
                      className="w-full bg-white/5 border border-white/10 text-white rounded-none p-3 min-h-[80px] text-sm resize-none focus:outline-none focus:border-primary/50"
                      disabled={sending}
                    />
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => void handleClose()}
                        disabled={closing}
                        className="flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {closing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                        Close Ticket
                      </button>
                      <button
                        onClick={() => void handleSend()}
                        disabled={!reply.trim() || sending}
                        className="flex items-center gap-1.5 px-5 py-2 bg-primary text-black text-xs uppercase tracking-widest font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        Send Reply
                      </button>
                    </div>
                  </>
                )}

                {ticket.status === "closed" && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">This ticket is closed.</span>
                    <button
                      onClick={() => void handleReopen()}
                      className="text-xs text-primary hover:text-primary/80 underline transition-colors"
                    >
                      Reopen
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminSupport() {
  const { token } = useAuth();
  const authHeader = `Bearer ${token ?? ""}`;
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all");

  useEffect(() => {
    const url = filter === "all" ? `${API_BASE}/support` : `${API_BASE}/support?status=${filter}`;
    setLoading(true);
    fetch(url, { headers: { Authorization: authHeader } })
      .then(r => r.ok ? r.json() as Promise<Ticket[]> : Promise.resolve([]))
      .then(data => setTickets(Array.isArray(data) ? data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) : []))
      .catch(() => setTickets([]))
      .finally(() => setLoading(false));
  }, [filter, authHeader]);

  const handleStatusChange = (id: number, status: string) => {
    setTickets(prev => prev.map(t => t.id === id ? { ...t, status } : t));
  };

  const openCount = tickets.filter(t => t.status === "open").length;

  return (
    <PortalLayout title="Royal Admin" navItems={adminNavItems}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-3xl">Support Tickets</h1>
          {openCount > 0 && (
            <p className="text-sm text-muted-foreground mt-1">{openCount} open ticket{openCount !== 1 ? "s" : ""} awaiting reply</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(["all", "open", "closed"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 text-xs uppercase tracking-widest border transition-colors ${
                filter === f
                  ? "bg-primary text-black border-primary"
                  : "bg-white/5 border-white/10 text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="bg-card border border-border p-12 text-center text-muted-foreground">
          No {filter !== "all" ? filter : ""} tickets found.
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map(ticket => (
            <TicketPanel key={ticket.id} ticket={ticket} authHeader={authHeader} onStatusChange={handleStatusChange} />
          ))}
        </div>
      )}
    </PortalLayout>
  );
}
