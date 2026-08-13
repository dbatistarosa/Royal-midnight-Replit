import { useState, useEffect, useCallback } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import {
  LayoutDashboard, Calendar, Users, Car, Map, DollarSign, Tag,
  MessageSquare, BarChart, Settings, Loader2, CheckCircle, XCircle,
  Wallet, Plus, Trash2, X, ChevronDown, AlertTriangle, ShieldAlert,
  Mail, Clock, ExternalLink, Lock, Gift, Building2, FileText, ShieldCheck, ShieldX,
} from "lucide-react";
import { API_BASE } from "@/lib/constants";
import { useAuth } from "@/contexts/auth";
import { useSignedDocUrl } from "@/hooks/use-signed-doc-url";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminNavItems } from "@/config/portalNav";


type Vehicle = {
  id: number;
  make: string;
  model: string;
  year: number;
  color: string;
  plate: string;
  vehicleClass: string;
  capacity: number;
  isAvailable: boolean;
  imageUrl: string | null;
  driverId: number | null;
};

type CatalogEntry = {
  id: number;
  make: string;
  model: string;
  minYear: number;
  vehicleTypes: string;
  isActive: boolean;
  pendingReview: boolean;
  notes: string | null;
  createdAt: string;
};

const VEHICLE_TYPES = [
  "Business Sedan",
  "Premium SUV",
  "First Class Sedan",
  "Standard Sedan",
  "Van / Shuttle",
  "Sprinter Van",
];

const REJECT_REASONS = ["Expired Document", "Blurry Image", "No Match", "Other"];

const CLASS_LABELS: Record<string, string> = {
  standard: "Standard",
  business: "Business",
  first_class: "First Class",
  suv: "SUV",
  van: "Van",
};

const currentYear = new Date().getFullYear();
const MIN_CATALOG_YEAR = 2015;
const YEAR_OPTIONS = Array.from({ length: currentYear - MIN_CATALOG_YEAR + 1 }, (_, i) => currentYear - i);

type Tab = "vehicles" | "catalog" | "compliance";

type PendingDoc = { id: number; fileUrl: string; newExpiry: string | null; submittedAt: string };

type ComplianceAlert = {
  driverId: number;
  driverName: string;
  driverEmail: string;
  driverPhone: string;
  type: string;
  expiry: string;
  daysRemaining: number;
  complianceHold: boolean;
  pendingDoc?: PendingDoc;
};

type NewSubmission = {
  docId: number;
  driverId: number;
  driverName: string;
  driverEmail: string;
  docType: string;
  fileUrl: string;
  newExpiry: string | null;
  submittedAt: string;
  complianceHold: boolean;
};

export default function AdminFleet() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("vehicles");

  // Registered vehicles
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  // Compliance alerts
  const [compliance, setCompliance] = useState<ComplianceAlert[]>([]);
  const [newSubmissions, setNewSubmissions] = useState<NewSubmission[]>([]);
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [remindingKey, setRemindingKey] = useState<string | null>(null);

  // Unified doc review modal
  type ReviewModalDoc = { id: number; fileUrl: string; newExpiry: string | null; submittedAt: string; driverName: string; docType: string; driverId: number };
  const [reviewModal, setReviewModal] = useState<ReviewModalDoc | null>(null);
  const [reviewMode, setReviewMode] = useState<"approve" | "reject" | null>(null);
  const [approveExpiry, setApproveExpiry] = useState("");
  const [approveNotes, setApproveNotes] = useState("");
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  // Compliance documents live in the private bucket — resolve a signed,
  // short-lived URL rather than linking the raw object path (CN-003), and never
  // follow a driver-supplied absolute URL (CN-041).
  const { url: reviewDocUrl, loading: reviewDocLoading } = useSignedDocUrl(reviewModal?.fileUrl ?? null);

  // Vehicle catalog
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [togglingCatalogId, setTogglingCatalogId] = useState<number | null>(null);
  const [approvingCatalogId, setApprovingCatalogId] = useState<number | null>(null);
  const [approveCatalogModal, setApproveCatalogModal] = useState<CatalogEntry | null>(null);
  const [catalogApproveTypes, setCatalogApproveTypes] = useState<Set<string>>(new Set());
  const [catalogApproveYear, setCatalogApproveYear] = useState(currentYear);

  // Add catalog form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ make: "", model: "", minYear: currentYear, notes: "" });
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [addingEntry, setAddingEntry] = useState(false);

  const authHdr = token ? `Bearer ${token}` : "";

  const fetchVehicles = useCallback(() => {
    if (!token) return;
    setVehiclesLoading(true);
    fetch(`${API_BASE}/vehicles`, { headers: { Authorization: authHdr } })
      .then(r => r.ok ? r.json() as Promise<Vehicle[]> : Promise.resolve([]))
      .then(data => setVehicles(Array.isArray(data) ? data : []))
      .catch(() => setVehicles([]))
      .finally(() => setVehiclesLoading(false));
  }, [token, authHdr]);

  const fetchCatalog = useCallback(() => {
    if (!token) return;
    setCatalogLoading(true);
    fetch(`${API_BASE}/admin/vehicle-catalog`, { headers: { Authorization: authHdr } })
      .then(r => r.ok ? r.json() as Promise<CatalogEntry[]> : Promise.resolve([]))
      .then(data => setCatalog(Array.isArray(data) ? data : []))
      .catch(() => setCatalog([]))
      .finally(() => setCatalogLoading(false));
  }, [token, authHdr]);

  const fetchCompliance = useCallback(() => {
    if (!token) return;
    setComplianceLoading(true);
    Promise.all([
      fetch(`${API_BASE}/admin/compliance`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() as Promise<ComplianceAlert[]> : Promise.resolve([])),
      fetch(`${API_BASE}/admin/compliance/pending`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() as Promise<NewSubmission[]> : Promise.resolve([])),
    ]).then(([alerts, pending]) => {
      setCompliance(Array.isArray(alerts) ? alerts : []);
      setNewSubmissions(Array.isArray(pending) ? pending : []);
    }).catch(() => {
      setCompliance([]);
      setNewSubmissions([]);
    }).finally(() => setComplianceLoading(false));
  }, [token]);

  useEffect(() => { fetchVehicles(); }, [fetchVehicles]);
  useEffect(() => { if (tab === "catalog") fetchCatalog(); }, [tab, fetchCatalog]);
  useEffect(() => { if (tab === "compliance") fetchCompliance(); }, [tab, fetchCompliance]);

  const handleToggleAvailability = async (vehicle: Vehicle) => {
    setTogglingId(vehicle.id);
    try {
      const res = await fetch(`${API_BASE}/vehicles/${vehicle.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: authHdr },
        body: JSON.stringify({ isAvailable: !vehicle.isAvailable }),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast({ title: "Updated", description: `${vehicle.make} ${vehicle.model} marked as ${!vehicle.isAvailable ? "available" : "unavailable"}.` });
      fetchVehicles();
    } catch {
      toast({ title: "Error", description: "Could not update vehicle availability.", variant: "destructive" });
    } finally {
      setTogglingId(null);
    }
  };

  const handleToggleCatalog = async (entry: CatalogEntry) => {
    setTogglingCatalogId(entry.id);
    try {
      const res = await fetch(`${API_BASE}/admin/vehicle-catalog/${entry.id}/toggle`, {
        method: "PATCH",
        headers: { Authorization: authHdr },
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: entry.isActive ? "Entry deactivated" : "Entry activated" });
      fetchCatalog();
    } catch {
      toast({ title: "Error", description: "Could not toggle catalog entry.", variant: "destructive" });
    } finally {
      setTogglingCatalogId(null);
    }
  };

  const handleDeleteCatalog = async (entry: CatalogEntry) => {
    if (!confirm(`Delete ${entry.make} ${entry.model} from the catalog?`)) return;
    setDeletingId(entry.id);
    try {
      await fetch(`${API_BASE}/admin/vehicle-catalog/${entry.id}`, { method: "DELETE", headers: { Authorization: authHdr } });
      toast({ title: "Deleted" });
      fetchCatalog();
    } catch {
      toast({ title: "Error", description: "Could not delete catalog entry.", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const handleApproveCatalogEntry = async () => {
    if (!approveCatalogModal || catalogApproveTypes.size === 0) return;
    setApprovingCatalogId(approveCatalogModal.id);
    try {
      const res = await fetch(`${API_BASE}/admin/vehicle-catalog/${approveCatalogModal.id}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: authHdr },
        body: JSON.stringify({ vehicleTypes: Array.from(catalogApproveTypes), minYear: catalogApproveYear }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Vehicle approved", description: `${approveCatalogModal.make} ${approveCatalogModal.model} added to catalog.` });
      setApproveCatalogModal(null);
      setCatalogApproveTypes(new Set());
      fetchCatalog();
    } catch {
      toast({ title: "Error", description: "Could not approve vehicle.", variant: "destructive" });
    } finally {
      setApprovingCatalogId(null);
    }
  };

  const handleAddEntry = async () => {
    if (!addForm.make.trim() || !addForm.model.trim()) {
      toast({ title: "Missing fields", description: "Make and model are required.", variant: "destructive" });
      return;
    }
    if (selectedTypes.size === 0) {
      toast({ title: "Missing vehicle type", description: "Select at least one vehicle type.", variant: "destructive" });
      return;
    }
    setAddingEntry(true);
    try {
      const res = await fetch(`${API_BASE}/admin/vehicle-catalog`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHdr },
        body: JSON.stringify({
          make: addForm.make.trim(), model: addForm.model.trim(), minYear: addForm.minYear,
          vehicleTypes: Array.from(selectedTypes), notes: addForm.notes.trim() || undefined,
        }),
      });
      if (!res.ok) { const err = await res.json() as { error?: string }; throw new Error(err.error ?? "Failed"); }
      toast({ title: "Vehicle added to catalog" });
      setAddForm({ make: "", model: "", minYear: currentYear, notes: "" });
      setSelectedTypes(new Set());
      setShowAddForm(false);
      fetchCatalog();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not add entry.", variant: "destructive" });
    } finally {
      setAddingEntry(false);
    }
  };

  const toggleType = (type: string) => {
    setSelectedTypes(prev => { const n = new Set(prev); n.has(type) ? n.delete(type) : n.add(type); return n; });
  };

  const handleSendReminder = async (alert: ComplianceAlert) => {
    const key = `${alert.driverId}-${alert.type}`;
    setRemindingKey(key);
    try {
      const res = await fetch(`${API_BASE}/admin/compliance/remind`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHdr },
        body: JSON.stringify({ driverId: alert.driverId, docType: alert.type }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Reminder sent", description: `Email sent to ${alert.driverEmail}.` });
    } catch {
      toast({ title: "Error", description: "Could not send reminder.", variant: "destructive" });
    } finally {
      setRemindingKey(null);
    }
  };

  const openReviewModal = (doc: ReviewModalDoc) => {
    setReviewModal(doc);
    setReviewMode(null);
    setApproveExpiry(doc.newExpiry ?? "");
    setApproveNotes("");
    setRejectReason(REJECT_REASONS[0]);
    setImgFailed(false);
  };

  const handleApproveDoc = async () => {
    if (!reviewModal || !approveExpiry) return;
    setReviewSaving(true);
    try {
      const res = await fetch(`${API_BASE}/admin/compliance/documents/${reviewModal.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHdr },
        body: JSON.stringify({ newExpiry: approveExpiry, adminNotes: approveNotes }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Document approved", description: `${reviewModal.docType} updated.` });
      setReviewModal(null);
      fetchCompliance();
    } catch {
      toast({ title: "Error", description: "Could not approve document.", variant: "destructive" });
    } finally {
      setReviewSaving(false);
    }
  };

  const handleRejectDoc = async () => {
    if (!reviewModal) return;
    setReviewSaving(true);
    try {
      const res = await fetch(`${API_BASE}/admin/compliance/documents/${reviewModal.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHdr },
        body: JSON.stringify({ reason: rejectReason }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Document rejected", description: "Driver will be emailed to re-upload." });
      setReviewModal(null);
      fetchCompliance();
    } catch {
      toast({ title: "Error", description: "Could not reject document.", variant: "destructive" });
    } finally {
      setReviewSaving(false);
    }
  };

  const pendingCatalog = catalog.filter(e => e.pendingReview);
  const activeCatalog = catalog.filter(e => !e.pendingReview);

  return (
    <PortalLayout title="Royal Admin" navItems={adminNavItems}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <h1 className="font-serif text-2xl sm:text-3xl">Fleet Management</h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border mb-8">
        <button
          onClick={() => setTab("vehicles")}
          className={`px-6 py-3 text-xs uppercase tracking-widest border-b-2 -mb-px transition-colors ${tab === "vehicles" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-white"}`}
        >
          Registered Vehicles
        </button>
        <button
          onClick={() => setTab("catalog")}
          className={`px-6 py-3 text-xs uppercase tracking-widest border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${tab === "catalog" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-white"}`}
        >
          Vehicle Catalog
          {pendingCatalog.length > 0 && (
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 text-[10px]">{pendingCatalog.length}</span>
          )}
        </button>
        <button
          onClick={() => setTab("compliance")}
          className={`px-6 py-3 text-xs uppercase tracking-widest border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${tab === "compliance" ? "border-red-400 text-red-400" : "border-transparent text-muted-foreground hover:text-white"}`}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          Compliance
        </button>
      </div>

      {/* ── Registered Vehicles ── */}
      {tab === "vehicles" && (
        vehiclesLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : vehicles.length === 0 ? (
          <div className="bg-card border border-border p-12 text-center text-muted-foreground">
            No vehicles found. Vehicles are added when drivers complete their onboarding.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {vehicles.map(vehicle => (
              <div key={vehicle.id} className="bg-card border border-border p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-serif text-xl">{vehicle.make} {vehicle.model}</h3>
                    <p className="text-muted-foreground text-sm">{vehicle.year} · {vehicle.color}</p>
                  </div>
                  <button
                    onClick={() => void handleToggleAvailability(vehicle)}
                    disabled={togglingId === vehicle.id}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-xs border transition-colors ${
                      vehicle.isAvailable
                        ? "bg-green-500/10 text-green-500 border-green-500/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20"
                        : "bg-red-500/10 text-red-500 border-red-500/20 hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/20"
                    }`}
                  >
                    {togglingId === vehicle.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : vehicle.isAvailable ? (
                      <CheckCircle className="w-3 h-3" />
                    ) : (
                      <XCircle className="w-3 h-3" />
                    )}
                    {vehicle.isAvailable ? "Available" : "Unavailable"}
                  </button>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Class</span>
                    <span>{CLASS_LABELS[vehicle.vehicleClass] ?? vehicle.vehicleClass}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Plate</span>
                    <span className="font-mono">{vehicle.plate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Capacity</span>
                    <span>{vehicle.capacity} passengers</span>
                  </div>
                  {vehicle.driverId && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Driver ID</span>
                      <span>#{vehicle.driverId}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── Vehicle Catalog ── */}
      {tab === "catalog" && (
        <div className="space-y-8">
          {/* Pending driver-submitted entries */}
          {pendingCatalog.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4 px-4 py-3 bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <p className="text-sm text-amber-400 font-medium">
                  {pendingCatalog.length} vehicle{pendingCatalog.length > 1 ? "s" : ""} submitted by drivers — awaiting admin categorization
                </p>
              </div>
              <div className="bg-card border border-amber-500/20 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-background/50 border-b border-border">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs text-muted-foreground uppercase tracking-widest font-medium">Make / Model</th>
                      <th className="px-5 py-3 text-center text-xs text-muted-foreground uppercase tracking-widest font-medium">Year</th>
                      <th className="px-5 py-3 text-left text-xs text-muted-foreground uppercase tracking-widest font-medium">Notes</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pendingCatalog.map(entry => (
                      <tr key={entry.id} className="bg-amber-500/[0.03]">
                        <td className="px-5 py-4 font-medium">{entry.make} {entry.model}</td>
                        <td className="px-5 py-4 text-center text-muted-foreground">{entry.minYear}</td>
                        <td className="px-5 py-4 text-xs text-muted-foreground">{entry.notes ?? "—"}</td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => { setApproveCatalogModal(entry); setCatalogApproveTypes(new Set()); setCatalogApproveYear(entry.minYear); }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-colors"
                            >
                              <CheckCircle className="w-3 h-3" /> Approve
                            </button>
                            <button
                              onClick={() => void handleDeleteCatalog(entry)}
                              disabled={deletingId === entry.id}
                              className="text-muted-foreground hover:text-red-400 transition-colors p-1"
                            >
                              {deletingId === entry.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Active/inactive catalog */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Define which make/model/year combinations drivers may use when applying.
              </p>
              <Button
                onClick={() => setShowAddForm(v => !v)}
                className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest px-5 min-h-[44px] shrink-0"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Vehicle
              </Button>
            </div>

            {showAddForm && (
              <div className="bg-card border border-primary/30 p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-lg text-primary">Add to Catalog</h3>
                  <button onClick={() => setShowAddForm(false)} className="text-muted-foreground hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs uppercase tracking-widest text-muted-foreground block mb-1.5">Make</label>
                    <Input className="bg-white/5 border-white/10 text-white rounded-none" value={addForm.make} onChange={e => setAddForm(f => ({ ...f, make: e.target.value }))} placeholder="e.g. Chevrolet" />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-widest text-muted-foreground block mb-1.5">Model</label>
                    <Input className="bg-white/5 border-white/10 text-white rounded-none" value={addForm.model} onChange={e => setAddForm(f => ({ ...f, model: e.target.value }))} placeholder="e.g. Suburban" />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-widest text-muted-foreground block mb-1.5">Min Year</label>
                    <div className="relative">
                      <select value={addForm.minYear} onChange={e => setAddForm(f => ({ ...f, minYear: parseInt(e.target.value) }))} className="w-full bg-white/5 border border-white/10 text-white rounded-none h-10 px-3 pr-8 appearance-none text-sm focus:outline-none focus:border-primary">
                        {YEAR_OPTIONS.map(y => <option key={y} value={y} className="bg-zinc-900">{y}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground block mb-3">Vehicle Types Allowed</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {VEHICLE_TYPES.map(type => (
                      <button key={type} type="button" onClick={() => toggleType(type)} className={`px-4 py-2.5 text-sm border text-left transition-all ${selectedTypes.has(type) ? "border-primary/50 bg-primary/10 text-primary" : "border-white/10 bg-white/3 text-muted-foreground hover:border-white/20 hover:text-white"}`}>
                        {selectedTypes.has(type) && <CheckCircle className="w-3.5 h-3.5 inline mr-1.5 text-primary" />}
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground block mb-1.5">Notes (optional)</label>
                  <Input className="bg-white/5 border-white/10 text-white rounded-none" value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Black only, 7-seat configuration" />
                </div>
                <div className="flex justify-end gap-3 pt-2 border-t border-border">
                  <Button variant="outline" onClick={() => setShowAddForm(false)} className="rounded-none border-white/20 text-white hover:bg-white/10 text-xs uppercase tracking-widest">Cancel</Button>
                  <Button onClick={() => void handleAddEntry()} disabled={addingEntry} className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest px-8">
                    {addingEntry ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Adding...</> : "Add to Catalog"}
                  </Button>
                </div>
              </div>
            )}

            {catalogLoading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : activeCatalog.length === 0 ? (
              <div className="bg-card border border-border p-12 text-center">
                <Car className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground text-sm">No vehicles in the catalog yet.</p>
              </div>
            ) : (
              <div className="bg-card border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-background/50 border-b border-border">
                    <tr>
                      <th className="px-5 py-4 text-left text-xs text-muted-foreground uppercase tracking-widest font-medium">Make / Model</th>
                      <th className="px-5 py-4 text-center text-xs text-muted-foreground uppercase tracking-widest font-medium">Year Range</th>
                      <th className="px-5 py-4 text-left text-xs text-muted-foreground uppercase tracking-widest font-medium">Vehicle Types</th>
                      <th className="px-5 py-4 text-center text-xs text-muted-foreground uppercase tracking-widest font-medium">Status</th>
                      <th className="px-5 py-4" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {activeCatalog.map(entry => (
                      <tr key={entry.id} className={`hover:bg-background/30 transition-colors ${!entry.isActive ? "opacity-50" : ""}`}>
                        <td className="px-5 py-4">
                          <div className="font-medium">{entry.make} {entry.model}</div>
                          {entry.notes && <div className="text-xs text-muted-foreground mt-0.5">{entry.notes}</div>}
                        </td>
                        <td className="px-5 py-4 text-center text-muted-foreground">{entry.minYear} – {currentYear}</td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-1">
                            {entry.vehicleTypes.split(",").map(t => (
                              <span key={t} className="px-2 py-0.5 bg-primary/10 text-primary text-xs border border-primary/20">{t.trim()}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center">
                          <button
                            onClick={() => void handleToggleCatalog(entry)}
                            disabled={togglingCatalogId === entry.id}
                            className={`text-xs px-3 py-1 border transition-colors ${entry.isActive ? "bg-green-500/10 text-green-400 border-green-500/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20" : "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/20"}`}
                          >
                            {togglingCatalogId === entry.id ? <Loader2 className="w-3 h-3 animate-spin" /> : entry.isActive ? "Active" : "Inactive"}
                          </button>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button
                            onClick={() => void handleDeleteCatalog(entry)}
                            disabled={deletingId === entry.id}
                            className="text-muted-foreground hover:text-red-400 transition-colors p-1"
                          >
                            {deletingId === entry.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Compliance Tracker ── */}
      {tab === "compliance" && (
        <div className="space-y-8">
          {/* New driver submissions (no expiry on file yet) */}
          {newSubmissions.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                New Submissions — First-Time Uploads
              </h2>
              <p className="text-xs text-muted-foreground mb-4">Documents uploaded by drivers who have no expiry on file yet. Review and approve to complete their onboarding.</p>
              <div className="bg-card border border-amber-500/20 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-background/50 border-b border-border">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs text-muted-foreground uppercase tracking-widest">Driver</th>
                      <th className="px-5 py-3 text-left text-xs text-muted-foreground uppercase tracking-widest">Document</th>
                      <th className="px-5 py-3 text-left text-xs text-muted-foreground uppercase tracking-widest">Submitted</th>
                      <th className="px-5 py-3 text-left text-xs text-muted-foreground uppercase tracking-widest">Expiry (Driver Claim)</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {newSubmissions.map(sub => (
                      <tr key={sub.docId} className="bg-amber-500/[0.02]">
                        <td className="px-5 py-4">
                          <p className="font-medium text-white">{sub.driverName}</p>
                          <p className="text-xs text-muted-foreground">{sub.driverEmail}</p>
                        </td>
                        <td className="px-5 py-4 text-muted-foreground">{sub.docType}</td>
                        <td className="px-5 py-4 text-xs text-muted-foreground">
                          {new Date(sub.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                        <td className="px-5 py-4 font-mono text-sm">{sub.newExpiry ?? "—"}</td>
                        <td className="px-5 py-4 text-right">
                          <button
                            onClick={() => openReviewModal({ id: sub.docId, fileUrl: sub.fileUrl, newExpiry: sub.newExpiry, submittedAt: sub.submittedAt, driverName: sub.driverName, docType: sub.docType, driverId: sub.driverId })}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-colors"
                          >
                            <FileText className="w-3 h-3" /> Review
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Expiring/expired docs */}
          <div>
            <h2 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-400" />
              Expiring / Expired Documents
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Licenses, registrations, and insurance expiring within 30 days.
            </p>

            {complianceLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-12">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading...
              </div>
            ) : compliance.length === 0 ? (
              <div className="bg-green-500/5 border border-green-500/20 p-8 text-center">
                <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-green-400">All documents are current</p>
                <p className="text-xs text-muted-foreground mt-1">No documents expire within 30 days.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-4 px-4 py-3 bg-red-500/10 border border-red-500/20">
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-400">
                    <span className="font-semibold">{compliance.length} alert{compliance.length !== 1 ? "s" : ""}</span> require immediate attention
                  </p>
                </div>
                <div className="bg-card border border-border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left min-w-[700px]">
                      <thead className="bg-background/50 border-b border-border">
                        <tr>
                          <th className="px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest">Driver</th>
                          <th className="px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest">Document</th>
                          <th className="px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest">Expiry Date</th>
                          <th className="px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest">Status</th>
                          <th className="px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest">Submission</th>
                          <th className="px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {compliance.map((alert, i) => {
                          const isExpired = alert.daysRemaining < 0;
                          const isCritical = alert.daysRemaining <= 7;
                          const color = isExpired ? "text-red-400" : isCritical ? "text-orange-400" : "text-amber-400";
                          const bg = isExpired ? "bg-red-500/5" : isCritical ? "bg-orange-500/5" : "bg-amber-500/5";
                          const reminderKey = `${alert.driverId}-${alert.type}`;
                          return (
                            <tr key={i} className={bg}>
                              <td className="px-5 py-4">
                                <p className="font-medium flex items-center gap-1.5">
                                  {alert.driverName}
                                  {alert.complianceHold && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-red-500/10 border border-red-500/20 text-red-400">
                                      <Lock className="w-2.5 h-2.5" /> ON HOLD
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-muted-foreground">{alert.driverEmail}</p>
                              </td>
                              <td className="px-5 py-4 text-muted-foreground">{alert.type}</td>
                              <td className="px-5 py-4 font-mono text-sm">{alert.expiry}</td>
                              <td className={`px-5 py-4 font-semibold text-xs ${color}`}>
                                {isExpired ? `Expired ${Math.abs(alert.daysRemaining)}d ago` : alert.daysRemaining === 0 ? "Expires today" : `${alert.daysRemaining}d remaining`}
                              </td>
                              <td className="px-5 py-4">
                                {alert.pendingDoc ? (
                                  <button
                                    onClick={() => openReviewModal({ id: alert.pendingDoc!.id, fileUrl: alert.pendingDoc!.fileUrl, newExpiry: alert.pendingDoc!.newExpiry, submittedAt: alert.pendingDoc!.submittedAt, driverName: alert.driverName, docType: alert.type, driverId: alert.driverId })}
                                    className="inline-flex items-center gap-1.5 px-2 py-1 text-xs bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors"
                                  >
                                    <Clock className="w-3 h-3" /> Pending Review
                                  </button>
                                ) : (
                                  <span className="text-muted-foreground text-xs">No upload</span>
                                )}
                              </td>
                              <td className="px-5 py-4 text-right">
                                <button
                                  disabled={remindingKey === reminderKey}
                                  onClick={() => void handleSendReminder(alert)}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-border bg-background/50 hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-50"
                                >
                                  {remindingKey === reminderKey ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                                  Remind
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Unified Document Review Modal ── */}
      {reviewModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setReviewModal(null)}>
          <div className="bg-[#0a0a0a] border border-white/10 w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
              <div>
                <p className="text-xs uppercase tracking-widest text-primary">{reviewModal.docType}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {reviewModal.driverName} · Submitted {new Date(reviewModal.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  {reviewModal.newExpiry ? ` · Claimed expiry: ${reviewModal.newExpiry}` : ""}
                </p>
              </div>
              <button onClick={() => setReviewModal(null)} className="text-gray-500 hover:text-white transition-colors p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Inline image preview */}
            <div className="flex-1 overflow-auto flex items-center justify-center p-4 min-h-[200px] max-h-[50vh]">
              {reviewDocLoading ? (
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              ) : !reviewDocUrl ? (
                <p className="text-gray-400 text-sm">This document could not be loaded.</p>
              ) : imgFailed ? (
                <div className="text-center space-y-3">
                  <FileText className="w-10 h-10 text-gray-600 mx-auto" />
                  <a href={reviewDocUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-black text-xs uppercase tracking-widest hover:bg-primary/90 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" /> Open Document
                  </a>
                </div>
              ) : (
                <img
                  src={reviewDocUrl}
                  alt={reviewModal.docType}
                  className="max-w-full max-h-full object-contain"
                  onError={() => setImgFailed(true)}
                />
              )}
            </div>

            {/* Action area */}
            <div className="border-t border-white/10 p-5 flex-shrink-0 space-y-4">
              {reviewMode === null && (
                <div className="flex gap-3">
                  <button onClick={() => setReviewMode("approve")} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm transition-colors">
                    <ShieldCheck className="w-4 h-4" /> Approve
                  </button>
                  <button onClick={() => setReviewMode("reject")} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-700 hover:bg-red-800 text-white text-sm transition-colors">
                    <ShieldX className="w-4 h-4" /> Reject & Request Re-upload
                  </button>
                </div>
              )}

              {reviewMode === "approve" && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-widest block mb-2">New Expiry Date <span className="text-red-400">*</span></label>
                    <Input type="date" value={approveExpiry} onChange={e => setApproveExpiry(e.target.value)} className="rounded-none bg-white/5 border-white/10 text-white" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-widest block mb-2">Admin Notes (optional)</label>
                    <Input value={approveNotes} onChange={e => setApproveNotes(e.target.value)} placeholder="e.g. Verified against state record" className="rounded-none bg-white/5 border-white/10 text-white" />
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button onClick={() => void handleApproveDoc()} disabled={!approveExpiry || reviewSaving} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm transition-colors">
                      {reviewSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      Confirm Approval
                    </button>
                    <button onClick={() => setReviewMode(null)} className="px-4 py-2.5 border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">Back</button>
                  </div>
                </div>
              )}

              {reviewMode === "reject" && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-widest block mb-2">Reason for Rejection <span className="text-red-400">*</span></label>
                    <div className="relative">
                      <select value={rejectReason} onChange={e => setRejectReason(e.target.value)} className="w-full bg-white/5 border border-white/10 text-white rounded-none h-10 px-3 pr-8 appearance-none text-sm focus:outline-none focus:border-red-500">
                        {REJECT_REASONS.map(r => <option key={r} value={r} className="bg-zinc-900">{r}</option>)}
                      </select>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">The driver will be emailed and asked to re-upload.</p>
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button onClick={() => void handleRejectDoc()} disabled={reviewSaving} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white text-sm transition-colors">
                      {reviewSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                      Confirm Rejection
                    </button>
                    <button onClick={() => setReviewMode(null)} className="px-4 py-2.5 border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">Back</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Approve Catalog Entry Modal ── */}
      {approveCatalogModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setApproveCatalogModal(null)}>
          <div className="bg-card border border-border w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="font-serif text-xl">Approve Vehicle</h2>
                <p className="text-xs text-muted-foreground mt-1">{approveCatalogModal.make} {approveCatalogModal.model}</p>
              </div>
              <button onClick={() => setApproveCatalogModal(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-widest block mb-2">Min Year</label>
                <div className="relative">
                  <select value={catalogApproveYear} onChange={e => setCatalogApproveYear(parseInt(e.target.value))} className="w-full bg-white/5 border border-white/10 text-white rounded-none h-10 px-3 pr-8 appearance-none text-sm focus:outline-none focus:border-primary">
                    {YEAR_OPTIONS.map(y => <option key={y} value={y} className="bg-zinc-900">{y}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-widest block mb-2">Vehicle Types <span className="text-red-400">*</span></label>
                <div className="grid grid-cols-2 gap-2">
                  {VEHICLE_TYPES.map(type => (
                    <button key={type} type="button" onClick={() => { const n = new Set(catalogApproveTypes); n.has(type) ? n.delete(type) : n.add(type); setCatalogApproveTypes(n); }} className={`px-3 py-2 text-xs border text-left transition-all ${catalogApproveTypes.has(type) ? "border-primary/50 bg-primary/10 text-primary" : "border-white/10 text-muted-foreground hover:border-white/20 hover:text-white"}`}>
                      {catalogApproveTypes.has(type) && <CheckCircle className="w-3 h-3 inline mr-1 text-primary" />}
                      {type}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => void handleApproveCatalogEntry()}
                disabled={catalogApproveTypes.size === 0 || approvingCatalogId === approveCatalogModal.id}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500 text-white text-sm font-medium hover:bg-green-600 disabled:opacity-50 transition-colors"
              >
                {approvingCatalogId === approveCatalogModal.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Approve & Add to Catalog
              </button>
              <button onClick={() => setApproveCatalogModal(null)} className="px-4 py-2.5 border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
