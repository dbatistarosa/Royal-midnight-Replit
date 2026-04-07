import { useState, useEffect } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useAuth } from "@/contexts/auth";
import { LayoutDashboard, Car, MapPin, User, MessageSquare, Plus, ChevronDown, ChevronUp, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { API_BASE } from "@/lib/constants";

const passengerNavItems = [
  { label: "Dashboard", href: "/passenger/dashboard", icon: LayoutDashboard },
  { label: "My Rides", href: "/passenger/rides", icon: Car },
  { label: "Saved Addresses", href: "/passenger/addresses", icon: MapPin },
  { label: "Profile", href: "/passenger/profile", icon: User },
  { label: "Support", href: "/passenger/support", icon: MessageSquare },
];

const labelClass = "text-gray-400 uppercase tracking-widest text-xs block mb-1.5";
const inputClass = "bg-white/5 border-white/10 text-white rounded-none h-11";

type Ticket = {
  id: number;
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
  open: { label: "Open", bg: "bg-primary/10", color: "text-primary", border: "border-primary/20" },
  in_progress: { label: "In Progress", bg: "bg-amber-500/10", color: "text-amber-400", border: "border-amber-500/20" },
  closed: { label: "Closed", bg: "bg-white/5", color: "text-muted-foreground", border: "border-white/10" },
};

function TicketThread({ ticket, authHeader, userName }: { ticket: Ticket; authHeader: string; userName: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

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
      } else {
        const err = await res.json() as { error?: string };
        toast({ title: "Send failed", description: err.error ?? "Could not send message.", variant: "destructive" });
      }
    } finally {
      setSending(false);
    }
  };

  const cfg = STATUS_CONFIG[ticket.status] ?? STATUS_CONFIG["open"]!;

  return (
    <div className="bg-card border border-border">
      <button
        onClick={handleToggle}
        className="w-full flex justify-between items-start p-5 text-left hover:bg-white/2 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <span className="font-medium">{ticket.subject}</span>
            <span className={`text-xs px-2 py-0.5 border ${cfg.bg} ${cfg.color} ${cfg.border} uppercase tracking-widest`}>
              {cfg.label}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            #{ticket.id} · {format(new Date(ticket.createdAt), "MMM d, yyyy")}
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
                  {userName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-foreground">You</span>
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
                      {isAdmin ? "RM" : userName.charAt(0).toUpperCase()}
                    </div>
                    <div className={`flex-1 min-w-0 ${isAdmin ? "text-right" : ""}`}>
                      <div className={`flex items-center gap-2 mb-1 ${isAdmin ? "justify-end" : ""}`}>
                        <span className={`text-xs font-medium ${isAdmin ? "text-blue-400" : "text-foreground"}`}>
                          {isAdmin ? "Royal Midnight Support" : "You"}
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
                <p className="text-sm text-muted-foreground text-center py-2">No replies yet. A support agent will respond shortly.</p>
              )}

              {/* Reply box — only for open/in_progress tickets */}
              {ticket.status !== "closed" && (
                <div className="pt-4 border-t border-border/50 space-y-3">
                  <Textarea
                    value={reply}
                    onChange={e => setReply(e.target.value)}
                    placeholder="Type your reply..."
                    className="bg-white/5 border-white/10 text-white rounded-none min-h-[80px] text-sm"
                    disabled={sending}
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={() => void handleSend()}
                      disabled={!reply.trim() || sending}
                      className="flex items-center gap-2 px-5 py-2 bg-primary text-black text-xs uppercase tracking-widest font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      Send Reply
                    </button>
                  </div>
                </div>
              )}

              {ticket.status === "closed" && (
                <div className="pt-3 text-xs text-muted-foreground text-center">
                  This ticket has been closed.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PassengerSupportInner() {
  const { user, token } = useAuth();
  const userId = user?.id ?? 0;
  const authHeader = `Bearer ${token ?? ""}`;
  const { toast } = useToast();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/support?userId=${userId}`, {
        headers: { Authorization: authHeader },
      });
      if (res.ok) {
        const data = await res.json() as Ticket[];
        setTickets(Array.isArray(data) ? data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) : []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId && token) void fetchTickets();
  }, [userId, token]);

  const handleSubmit = async () => {
    if (!subject.trim() || !message.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/support`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({
          userId,
          name: user?.name ?? "Passenger",
          email: user?.email ?? "",
          subject: subject.trim(),
          message: message.trim(),
          priority: "medium",
        }),
      });
      if (res.ok) {
        toast({ title: "Ticket created", description: "A support agent will respond shortly." });
        setIsCreating(false);
        setSubject("");
        setMessage("");
        void fetchTickets();
      } else {
        const err = await res.json() as { error?: string };
        toast({ title: "Error", description: err.error ?? "Could not create ticket.", variant: "destructive" });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PortalLayout title="Passenger Portal" navItems={passengerNavItems}>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 sm:mb-8 gap-3">
        <h1 className="font-serif text-2xl sm:text-3xl">Support</h1>
        {!isCreating && (
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-5 min-h-[44px] bg-primary text-black text-xs uppercase tracking-widest font-medium hover:bg-primary/90 transition-colors self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" /> New Ticket
          </button>
        )}
      </div>

      {isCreating && (
        <div className="bg-card border border-border p-6 mb-8 space-y-4">
          <h3 className="font-serif text-xl mb-2">Create Support Ticket</h3>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Subject</label>
              <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="E.g., Issue with recent ride" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Message</label>
              <Textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Please describe your issue in detail..."
                className="bg-white/5 border-white/10 text-white rounded-none min-h-[120px]"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => void handleSubmit()}
              disabled={!subject.trim() || !message.trim() || submitting}
              className="px-6 min-h-[44px] bg-primary text-black text-xs uppercase tracking-widest font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Ticket"}
            </button>
            <button
              onClick={() => setIsCreating(false)}
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
      ) : tickets.length > 0 ? (
        <div className="space-y-3">
          {tickets.map(ticket => (
            <TicketThread key={ticket.id} ticket={ticket} authHeader={authHeader} userName={user?.name ?? "You"} />
          ))}
        </div>
      ) : (
        <div className="bg-card border border-border p-12 text-center text-muted-foreground">
          You have no support tickets. Click "New Ticket" to get help.
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
