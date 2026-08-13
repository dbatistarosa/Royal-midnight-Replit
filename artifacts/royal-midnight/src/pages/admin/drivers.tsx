import React, { useState, useEffect, useCallback } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, Calendar, Users, Car, Map, DollarSign, Tag, MessageSquare, BarChart, Settings, CheckCircle, XCircle, ChevronDown, ChevronUp, Loader2, Plus, X, FileText, ExternalLink, Wallet, Gift, Building2, Pencil, PauseCircle, Ban, PlayCircle, ShieldCheck, ShieldAlert } from "lucide-react";
import { API_BASE } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";
import { useSignedDocUrl } from "@/hooks/use-signed-doc-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminNavItems } from "@/config/portalNav";

const LABEL = "text-gray-400 uppercase tracking-widest text-xs block mb-1.5";
const FINPUT = "bg-white/5 border-white/10 text-white rounded-none h-10 text-sm";

function DocViewButton({ path, label }: { path?: string | null; label: string }) {
  const [open, setOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  // Private documents need a signed, short-lived URL — minted only once the
  // admin actually opens the viewer (CN-003).
  const { url, loading } = useSignedDocUrl(open ? path : null);

  if (!path) return <span className="text-gray-700 text-sm">—</span>;

  return (
    <>
      <button
        type="button"
        onClick={() => { setImgFailed(false); setOpen(true); }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 text-primary text-xs uppercase tracking-widest transition-all"
      >
        <FileText className="w-3 h-3" />
        View
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative bg-[#0a0a0a] border border-white/10 max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 flex-shrink-0">
              <p className="text-xs uppercase tracking-widest text-primary">{label}</p>
              <div className="flex items-center gap-3">
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Open in new tab
                  </a>
                )}
                <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white transition-colors p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center p-4 min-h-[300px]">
              {loading ? (
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              ) : !url ? (
                <p className="text-gray-400 text-sm">This document could not be loaded.</p>
              ) : imgFailed ? (
                <div className="text-center space-y-4">
                  <FileText className="w-12 h-12 text-gray-600 mx-auto" />
                  <p className="text-gray-400 text-sm">This document cannot be previewed inline.</p>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-black text-xs uppercase tracking-widest hover:bg-primary/90 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Open Document
                  </a>
                </div>
              ) : (
                <img
                  src={url}
                  alt={label}
                  className="max-w-full max-h-[70vh] object-contain"
                  onError={() => setImgFailed(true)}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const REJECT_REASONS = [
  "Expired Document",
  "Blurry Image",
  "No Match",
  "Other",
];

type DocSubmission = {
  id: number;
  docType: string;
  status: string;
  fileUrl: string;
  newExpiry: string | null;
  adminNotes: string | null;
  submittedAt: string;
};

type DriverDocuments = {
  currentExpiries: Record<string, string | undefined>;
  complianceHold: boolean;
  submissions: DocSubmission[];
};

type ReviewModalState = {
  submission: DocSubmission;
  driverId: number;
} | null;

function DocReviewModal({
  modal,
  onClose,
  onApprove,
  onReject,
  saving,
}: {
  modal: ReviewModalState;
  onClose: () => void;
  onApprove: (docId: number, newExpiry: string, notes: string) => Promise<void>;
  onReject: (docId: number, reason: string) => Promise<void>;
  saving: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const [mode, setMode] = useState<"approve" | "reject" | null>(null);
  const [newExpiry, setNewExpiry] = useState("");
  const [approveNotes, setApproveNotes] = useState("");
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]);
  // Must run before the early return — hooks cannot be called conditionally.
  const { url, loading: urlLoading } = useSignedDocUrl(modal?.submission.fileUrl ?? null);

  if (!modal) return null;

  const submittedAt = new Date(modal.submission.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="fixed inset-0 z-[300] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#0a0a0a] border border-white/10 w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
          <div>
            <p className="text-xs uppercase tracking-widest text-primary">{modal.submission.docType}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Submitted {submittedAt}{modal.submission.newExpiry ? ` · Expiry: ${modal.submission.newExpiry}` : ""}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Document image */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-4 min-h-[200px] max-h-[50vh]">
          {urlLoading ? (
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          ) : !url ? (
            <p className="text-muted-foreground text-sm">No file URL</p>
          ) : imgFailed ? (
            <div className="text-center space-y-3">
              <FileText className="w-10 h-10 text-gray-600 mx-auto" />
              <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-black text-xs uppercase tracking-widest hover:bg-primary/90 transition-colors">
                <ExternalLink className="w-3.5 h-3.5" /> Open Document
              </a>
            </div>
          ) : (
            <img
              src={url}
              alt={modal.submission.docType}
              className="max-w-full max-h-full object-contain"
              onError={() => setImgFailed(true)}
            />
          )}
        </div>

        {/* Action area */}
        <div className="border-t border-white/10 p-5 flex-shrink-0 space-y-4">
          {mode === null && (
            <div className="flex gap-3">
              <button
                onClick={() => setMode("approve")}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
              >
                <ShieldCheck className="w-4 h-4" /> Approve
              </button>
              <button
                onClick={() => setMode("reject")}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-700 hover:bg-red-800 text-white text-sm font-medium transition-colors"
              >
                <ShieldAlert className="w-4 h-4" /> Reject & Request Re-upload
              </button>
            </div>
          )}

          {mode === "approve" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-widest block mb-2">New Expiry Date <span className="text-red-400">*</span></label>
                <Input
                  type="date"
                  value={newExpiry}
                  onChange={e => setNewExpiry(e.target.value)}
                  className="rounded-none bg-white/5 border-white/10 text-white"
                  defaultValue={modal.submission.newExpiry ?? ""}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-widest block mb-2">Admin Notes (optional)</label>
                <Input
                  value={approveNotes}
                  onChange={e => setApproveNotes(e.target.value)}
                  placeholder="e.g. Verified against DL record"
                  className="rounded-none bg-white/5 border-white/10 text-white"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => onApprove(modal.submission.id, newExpiry, approveNotes)}
                  disabled={!newExpiry || saving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm transition-colors"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  Confirm Approval
                </button>
                <button onClick={() => setMode(null)} className="px-4 py-2.5 border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Back
                </button>
              </div>
            </div>
          )}

          {mode === "reject" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-widest block mb-2">Reason for Rejection <span className="text-red-400">*</span></label>
                <div className="relative">
                  <select
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 text-white rounded-none h-10 px-3 pr-8 appearance-none text-sm focus:outline-none focus:border-red-500"
                  >
                    {REJECT_REASONS.map(r => (
                      <option key={r} value={r} className="bg-zinc-900">{r}</option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">The driver will be emailed and asked to re-upload.</p>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => onReject(modal.submission.id, rejectReason)}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white text-sm transition-colors"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                  Confirm Rejection
                </button>
                <button onClick={() => setMode(null)} className="px-4 py-2.5 border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type AddDriverForm = {
  name: string; email: string; phone: string; licenseNumber: string;
  vehicleClass: string; vehicleYear: string; vehicleMake: string; vehicleModel: string; vehicleColor: string; passengerCapacity: string;
};
const EMPTY_DRIVER: AddDriverForm = { name: "", email: "", phone: "", licenseNumber: "", vehicleClass: "", vehicleYear: "", vehicleMake: "", vehicleModel: "", vehicleColor: "", passengerCapacity: "" };

type EditDriverForm = {
  name: string; phone: string; licenseNumber: string;
  vehicleClass: string; vehicleYear: string; vehicleMake: string; vehicleModel: string; vehicleColor: string; passengerCapacity: string;
};


type DriverRow = {
  id: number;
  userId?: number | null;
  name: string;
  email: string;
  phone: string;
  status: string;
  isOnline: boolean;
  rating?: number | null;
  totalRides: number;
  approvalStatus?: string;
  rejectionReason?: string | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleYear?: string | null;
  vehicleColor?: string | null;
  passengerCapacity?: number | null;
  luggageCapacity?: number | null;
  hasCarSeat?: boolean | null;
  serviceArea?: string | null;
  licenseNumber?: string | null;
  licenseExpiry?: string | null;
  licenseDoc?: string | null;
  regVin?: string | null;
  regPlate?: string | null;
  regExpiry?: string | null;
  regDoc?: string | null;
  insuranceExpiry?: string | null;
  insuranceDoc?: string | null;
};

function ApprovalBadge({ status }: { status?: string }) {
  if (status === "approved") return <span className="px-2 py-0.5 text-[10px] uppercase tracking-widest rounded-full bg-green-500/10 text-green-400 border border-green-500/20">Approved</span>;
  if (status === "rejected") return <span className="px-2 py-0.5 text-[10px] uppercase tracking-widest rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Rejected</span>;
  return <span className="px-2 py-0.5 text-[10px] uppercase tracking-widest rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Pending</span>;
}

function DetailRow({ label, value }: { label: string; value?: string | number | boolean | null }) {
  const display = value == null ? "—" : typeof value === "boolean" ? (value ? "Yes" : "No") : String(value) || "—";
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <p className="text-sm text-white">{display}</p>
    </div>
  );
}

export default function AdminDrivers() {
  const { toast } = useToast();
  const { token } = useAuth();
  const [drivers, setDrivers] = useState<DriverRow[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<number, string>>({});
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<AddDriverForm>(EMPTY_DRIVER);
  const [addSaving, setAddSaving] = useState(false);
  const [editingDriver, setEditingDriver] = useState<DriverRow | null>(null);
  const [editForm, setEditForm] = useState<EditDriverForm>({ name: "", phone: "", licenseNumber: "", vehicleClass: "", vehicleYear: "", vehicleMake: "", vehicleModel: "", vehicleColor: "", passengerCapacity: "" });
  const [editSaving, setEditSaving] = useState(false);

  // Per-driver compliance docs (loaded lazily when row is expanded)
  const [driverDocs, setDriverDocs] = useState<Record<number, DriverDocuments>>({});
  const [docsLoading, setDocsLoading] = useState<number | null>(null);
  const [reviewModal, setReviewModal] = useState<ReviewModalState>(null);
  const [reviewSaving, setReviewSaving] = useState(false);

  const authHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const refetch = useCallback(() => {
    if (!token) return;
    setIsLoading(true);
    fetch(`${API_BASE}/drivers`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() as Promise<DriverRow[]> : Promise.reject(new Error("Failed")))
      .then(data => setDrivers(data))
      .catch(() => setDrivers([]))
      .finally(() => setIsLoading(false));
  }, [token]);

  useEffect(() => { refetch(); }, [refetch]);

  const loadDriverDocs = useCallback(async (driverId: number) => {
    if (driverDocs[driverId] || docsLoading === driverId) return;
    setDocsLoading(driverId);
    try {
      const res = await fetch(`${API_BASE}/drivers/${driverId}/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json() as DriverDocuments;
        setDriverDocs(prev => ({ ...prev, [driverId]: data }));
      }
    } catch { /* non-fatal */ }
    setDocsLoading(null);
  }, [driverDocs, docsLoading, token]);

  const handleToggleExpand = (driverId: number) => {
    const isExpanding = expandedId !== driverId;
    setExpandedId(isExpanding ? driverId : null);
    if (isExpanding) loadDriverDocs(driverId);
  };

  const reloadDriverDocs = async (driverId: number) => {
    const res = await fetch(`${API_BASE}/drivers/${driverId}/documents`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json() as DriverDocuments;
      setDriverDocs(prev => ({ ...prev, [driverId]: data }));
    }
  };

  const handleApproveDoc = async (docId: number, newExpiry: string, adminNotes: string) => {
    if (!reviewModal) return;
    setReviewSaving(true);
    try {
      const res = await fetch(`${API_BASE}/admin/compliance/documents/${docId}/approve`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ newExpiry, adminNotes }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Document approved", description: "Expiry updated. Compliance hold lifted if all docs are valid." });
      setReviewModal(null);
      await reloadDriverDocs(reviewModal.driverId);
      refetch();
    } catch {
      toast({ title: "Error", description: "Could not approve document.", variant: "destructive" });
    }
    setReviewSaving(false);
  };

  const handleRejectDoc = async (docId: number, reason: string) => {
    if (!reviewModal) return;
    setReviewSaving(true);
    try {
      const res = await fetch(`${API_BASE}/admin/compliance/documents/${docId}/reject`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Document rejected", description: "Driver will be emailed to re-upload." });
      setReviewModal(null);
      await reloadDriverDocs(reviewModal.driverId);
    } catch {
      toast({ title: "Error", description: "Could not reject document.", variant: "destructive" });
    }
    setReviewSaving(false);
  };

  const handleApprove = async (driverId: number) => {
    setActionLoading(driverId);
    try {
      const res = await fetch(`${API_BASE}/drivers/${driverId}/approve`, {
        method: "PATCH",
        headers: authHeaders,
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error || "Failed to approve");
      }
      toast({ title: "Driver approved", description: "The driver can now go online." });
      refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not approve driver.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
    setActionLoading(null);
  };

  const handleReject = async (driverId: number) => {
    setActionLoading(driverId);
    try {
      const reason = rejectReason[driverId] || "";
      const res = await fetch(`${API_BASE}/drivers/${driverId}/reject`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error || "Failed to reject");
      }
      toast({ title: "Driver rejected", description: "The driver has been notified." });
      setRejectingId(null);
      refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not reject driver.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
    setActionLoading(null);
  };

  const handleAddDriver = async () => {
    if (!addForm.name || !addForm.email || !addForm.phone || !addForm.licenseNumber) {
      toast({ title: "Missing fields", description: "Name, email, phone, and license number are required.", variant: "destructive" });
      return;
    }
    setAddSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: addForm.name, email: addForm.email, phone: addForm.phone, licenseNumber: addForm.licenseNumber,
      };
      if (addForm.vehicleClass) payload.vehicleClass = addForm.vehicleClass;
      if (addForm.vehicleYear) payload.vehicleYear = addForm.vehicleYear;
      if (addForm.vehicleMake) payload.vehicleMake = addForm.vehicleMake;
      if (addForm.vehicleModel) payload.vehicleModel = addForm.vehicleModel;
      if (addForm.vehicleColor) payload.vehicleColor = addForm.vehicleColor;
      if (addForm.passengerCapacity) payload.passengerCapacity = parseInt(addForm.passengerCapacity);

      const res = await fetch(`${API_BASE}/drivers`, {
        method: "POST", headers: authHeaders, body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json() as { error?: string }; throw new Error(e.error ?? "Failed"); }
      toast({ title: "Driver created", description: `${addForm.name} has been added and emailed a link to set their password and upload documents.` });
      setShowAdd(false);
      setAddForm(EMPTY_DRIVER);
      refetch();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not create driver.", variant: "destructive" });
    }
    setAddSaving(false);
  };

  const patchDriver = async (driverId: number, body: Record<string, unknown>, successMsg: string) => {
    setActionLoading(driverId);
    try {
      const res = await fetch(`${API_BASE}/drivers/${driverId}`, {
        method: "PATCH", headers: authHeaders, body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error || "Failed"); }
      toast({ title: successMsg });
      refetch();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not update driver.", variant: "destructive" });
    }
    setActionLoading(null);
  };

  const handlePause = (d: DriverRow) => patchDriver(d.id, { status: "inactive" }, `${d.name} paused — cannot go online until reactivated.`);
  const handleDeactivate = (d: DriverRow) => patchDriver(d.id, { status: "inactive", approvalStatus: "rejected" }, `${d.name} deactivated.`);
  const handleReactivate = (d: DriverRow) => patchDriver(d.id, { status: "active", approvalStatus: "approved" }, `${d.name} reactivated.`);

  const openEdit = (d: DriverRow) => {
    setEditForm({
      name: d.name ?? "", phone: d.phone ?? "", licenseNumber: d.licenseNumber ?? "",
      vehicleClass: "", vehicleYear: d.vehicleYear ?? "", vehicleMake: d.vehicleMake ?? "",
      vehicleModel: d.vehicleModel ?? "", vehicleColor: d.vehicleColor ?? "",
      passengerCapacity: d.passengerCapacity != null ? String(d.passengerCapacity) : "",
    });
    setEditingDriver(d);
  };

  const handleEditSave = async () => {
    if (!editingDriver) return;
    setEditSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (editForm.name) body.name = editForm.name;
      if (editForm.phone) body.phone = editForm.phone;
      if (editForm.licenseNumber) body.licenseNumber = editForm.licenseNumber;
      if (editForm.vehicleMake !== undefined) body.vehicleMake = editForm.vehicleMake || null;
      if (editForm.vehicleModel !== undefined) body.vehicleModel = editForm.vehicleModel || null;
      if (editForm.vehicleYear !== undefined) body.vehicleYear = editForm.vehicleYear || null;
      if (editForm.vehicleColor !== undefined) body.vehicleColor = editForm.vehicleColor || null;
      if (editForm.vehicleClass !== undefined) body.vehicleClass = editForm.vehicleClass || null;
      if (editForm.passengerCapacity) body.passengerCapacity = parseInt(editForm.passengerCapacity);
      const res = await fetch(`${API_BASE}/drivers/${editingDriver.id}`, {
        method: "PATCH", headers: authHeaders, body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error || "Failed"); }
      toast({ title: "Driver updated" });
      setEditingDriver(null);
      refetch();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not update driver.", variant: "destructive" });
    }
    setEditSaving(false);
  };

  const pendingCount = drivers?.filter(d => !d.approvalStatus || d.approvalStatus === "pending").length ?? 0;

  return (
    <PortalLayout title="Royal Admin" navItems={adminNavItems}>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-6 sm:mb-8 gap-3">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl mb-1">Drivers</h1>
          {pendingCount > 0 && (
            <p className="text-sm text-yellow-400">{pendingCount} application{pendingCount > 1 ? "s" : ""} pending review</p>
          )}
        </div>
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
          <span className="text-xs text-muted-foreground">{drivers?.length ?? 0} total</span>
          <Button
            onClick={() => setShowAdd(true)}
            className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest px-5 min-h-[44px]"
          >
            <Plus className="w-4 h-4 mr-2" />Add Driver
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[600px]">
            <thead className="bg-background/50 border-b border-border">
              <tr>
                <th className="px-5 py-4 font-medium text-muted-foreground">ID</th>
                <th className="px-5 py-4 font-medium text-muted-foreground">Name</th>
                <th className="px-5 py-4 font-medium text-muted-foreground">Application</th>
                <th className="px-5 py-4 font-medium text-muted-foreground hidden md:table-cell">Online</th>
                <th className="px-5 py-4 font-medium text-muted-foreground hidden md:table-cell">Rating</th>
                <th className="px-5 py-4 font-medium text-muted-foreground hidden md:table-cell">Rides</th>
                <th className="px-5 py-4 font-medium text-muted-foreground">Actions</th>
                <th className="px-5 py-4 font-medium text-muted-foreground w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading drivers...
                  </td>
                </tr>
              ) : !drivers?.length ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-muted-foreground">No drivers found.</td>
                </tr>
              ) : (drivers ?? []).map((driver) => {
                const isPending = !driver.approvalStatus || driver.approvalStatus === "pending";
                const isExpanded = expandedId === driver.id;
                const isRejecting = rejectingId === driver.id;
                const loading = actionLoading === driver.id;
                const docs = driverDocs[driver.id];
                const pendingSubmissions = docs?.submissions.filter(s => s.status === "pending_review") ?? [];

                return (
                  <React.Fragment key={driver.id}>
                    <tr className={`hover:bg-background/50 ${isPending ? "bg-yellow-500/[0.02]" : ""}`}>
                      <td className="px-5 py-4 font-medium text-muted-foreground">#{driver.id}</td>
                      <td className="px-5 py-4">
                        <div className="font-medium text-white">{driver.name}</div>
                        <div className="text-xs text-muted-foreground">{driver.email}</div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <ApprovalBadge status={driver.approvalStatus} />
                          {isExpanded && docsLoading !== driver.id && pendingSubmissions.length > 0 && (
                            <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              {pendingSubmissions.length} doc{pendingSubmissions.length > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 hidden md:table-cell">
                        {driver.isOnline ? (
                          <span className="text-green-400 text-xs">Online</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">Offline</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground hidden md:table-cell">{driver.rating?.toFixed(2) ?? "—"}</td>
                      <td className="px-5 py-4 text-muted-foreground hidden md:table-cell">{driver.totalRides}</td>
                      <td className="px-5 py-4">
                        {isPending && (
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white rounded-none text-xs h-8 px-3"
                              onClick={() => handleApprove(driver.id)}
                              disabled={loading}
                            >
                              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <><CheckCircle className="w-3 h-3 mr-1" />Approve</>}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-900/40 text-red-400 hover:bg-red-900/10 rounded-none text-xs h-8 px-3"
                              onClick={() => setRejectingId(isRejecting ? null : driver.id)}
                              disabled={loading}
                            >
                              <XCircle className="w-3 h-3 mr-1" />Reject
                            </Button>
                          </div>
                        )}
                        {driver.approvalStatus === "approved" && (
                          <span className="text-xs text-muted-foreground">Active driver</span>
                        )}
                        {driver.approvalStatus === "rejected" && (
                          <span className="text-xs text-muted-foreground">Rejected</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => handleToggleExpand(driver.id)}
                          className="text-muted-foreground hover:text-white transition-colors"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </td>
                    </tr>

                    {isRejecting && (
                      <tr className="bg-red-900/5">
                        <td colSpan={8} className="px-5 py-4">
                          <div className="flex items-center gap-3 max-w-xl">
                            <Input
                              placeholder="Optional: reason for rejection"
                              value={rejectReason[driver.id] || ""}
                              onChange={e => setRejectReason(prev => ({ ...prev, [driver.id]: e.target.value }))}
                              className="bg-white/5 border-white/10 text-white rounded-none h-9 text-xs"
                            />
                            <Button
                              size="sm"
                              className="bg-red-700 hover:bg-red-800 text-white rounded-none text-xs h-9 px-4 shrink-0"
                              onClick={() => handleReject(driver.id)}
                              disabled={loading}
                            >
                              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirm Reject"}
                            </Button>
                            <button type="button" className="text-xs text-muted-foreground hover:text-white" onClick={() => setRejectingId(null)}>Cancel</button>
                          </div>
                        </td>
                      </tr>
                    )}

                    {isExpanded && (
                      <tr className="bg-background/30">
                        <td colSpan={8} className="px-5 py-5">
                          <div className="space-y-5">
                            {/* Admin action buttons */}
                            <div className="flex flex-wrap gap-2 pb-3 border-b border-white/8">
                              <button
                                onClick={() => openEdit(driver)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-white/20 text-gray-300 hover:text-white hover:border-white/40 transition-all uppercase tracking-widest"
                              >
                                <Pencil className="w-3 h-3" /> Edit
                              </button>
                              {driver.approvalStatus === "approved" && driver.status !== "inactive" && (
                                <button
                                  onClick={() => handlePause(driver)}
                                  disabled={loading}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 transition-all uppercase tracking-widest disabled:opacity-50"
                                >
                                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <><PauseCircle className="w-3 h-3" /> Pause</>}
                                </button>
                              )}
                              {driver.approvalStatus === "approved" && (
                                <button
                                  onClick={() => handleDeactivate(driver)}
                                  disabled={loading}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all uppercase tracking-widest disabled:opacity-50"
                                >
                                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Ban className="w-3 h-3" /> Deactivate</>}
                                </button>
                              )}
                              {(driver.approvalStatus === "rejected" || driver.status === "inactive") && (
                                <button
                                  onClick={() => handleReactivate(driver)}
                                  disabled={loading}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-green-500/30 text-green-400 hover:bg-green-500/10 transition-all uppercase tracking-widest disabled:opacity-50"
                                >
                                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <><PlayCircle className="w-3 h-3" /> Reactivate</>}
                                </button>
                              )}
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                              <DetailRow label="Phone" value={driver.phone} />
                              <DetailRow label="Service Area" value={driver.serviceArea} />
                              <DetailRow label="User ID" value={driver.userId} />
                              <DetailRow label="Status" value={driver.status} />
                            </div>

                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 border-b border-white/8 pb-1">Vehicle</p>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                                <DetailRow label="Year" value={driver.vehicleYear} />
                                <DetailRow label="Make" value={driver.vehicleMake} />
                                <DetailRow label="Model" value={driver.vehicleModel} />
                                <DetailRow label="Color" value={driver.vehicleColor} />
                                <DetailRow label="Passenger Capacity" value={driver.passengerCapacity} />
                                <DetailRow label="Luggage Capacity" value={driver.luggageCapacity} />
                                <DetailRow label="Has Car Seat" value={driver.hasCarSeat} />
                              </div>
                            </div>

                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 border-b border-white/8 pb-1">Driver's License</p>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                                <DetailRow label="License #" value={driver.licenseNumber} />
                                <DetailRow label="Expiry" value={driver.licenseExpiry} />
                                <div>
                                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Document</p>
                                  <DocViewButton path={driver.licenseDoc} label="Driver's License" />
                                </div>
                              </div>
                            </div>

                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 border-b border-white/8 pb-1">Vehicle Registration</p>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                                <DetailRow label="VIN" value={driver.regVin} />
                                <DetailRow label="Plate" value={driver.regPlate} />
                                <DetailRow label="Reg. Expiry" value={driver.regExpiry} />
                                <div>
                                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Document</p>
                                  <DocViewButton path={driver.regDoc} label="Vehicle Registration" />
                                </div>
                              </div>
                            </div>

                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 border-b border-white/8 pb-1">Insurance</p>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                                <DetailRow label="Policy Expiry" value={driver.insuranceExpiry} />
                                <div>
                                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Certificate</p>
                                  <DocViewButton path={driver.insuranceDoc} label="Insurance Certificate" />
                                </div>
                              </div>
                            </div>

                            {/* ── Compliance Document Submissions ── */}
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 border-b border-white/8 pb-1 flex items-center gap-2">
                                Compliance Submissions
                                {docsLoading === driver.id && <Loader2 className="w-3 h-3 animate-spin" />}
                              </p>
                              {docsLoading === driver.id ? (
                                <p className="text-xs text-muted-foreground">Loading...</p>
                              ) : !docs ? (
                                <p className="text-xs text-muted-foreground">—</p>
                              ) : docs.submissions.length === 0 ? (
                                <p className="text-xs text-muted-foreground">No documents uploaded yet.</p>
                              ) : (
                                <div className="space-y-2">
                                  {docs.submissions.map(sub => {
                                    const statusColor = sub.status === "approved" ? "text-green-400 bg-green-500/10 border-green-500/20"
                                      : sub.status === "rejected" ? "text-red-400 bg-red-500/10 border-red-500/20"
                                      : "text-amber-400 bg-amber-500/10 border-amber-500/20";
                                    return (
                                      <div key={sub.id} className="flex items-center gap-3 p-3 bg-white/3 border border-white/8">
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 mb-0.5">
                                            <span className="text-xs text-white font-medium">{sub.docType}</span>
                                            <span className={`px-1.5 py-0.5 text-[10px] rounded border ${statusColor}`}>
                                              {sub.status === "pending_review" ? "Pending" : sub.status === "approved" ? "Approved" : "Rejected"}
                                            </span>
                                          </div>
                                          <p className="text-[11px] text-muted-foreground">
                                            {new Date(sub.submittedAt).toLocaleDateString()}
                                            {sub.newExpiry ? ` · Expiry: ${sub.newExpiry}` : ""}
                                            {sub.adminNotes ? ` · ${sub.adminNotes}` : ""}
                                          </p>
                                        </div>
                                        {sub.status === "pending_review" ? (
                                          <button
                                            onClick={() => setReviewModal({ submission: sub, driverId: driver.id })}
                                            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs uppercase tracking-widest transition-all"
                                          >
                                            <FileText className="w-3 h-3" /> Review
                                          </button>
                                        ) : (
                                          <DocViewButton path={sub.fileUrl} label={sub.docType} />
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {driver.approvalStatus === "rejected" && driver.rejectionReason && (
                              <div className="bg-red-900/10 border border-red-900/30 p-4">
                                <p className="text-[10px] uppercase tracking-widest text-red-400 mb-1">Rejection Reason</p>
                                <p className="text-sm text-red-300">{driver.rejectionReason}</p>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-card border border-border w-full max-w-lg">
            <div className="flex items-center justify-between px-7 py-5 border-b border-border">
              <h2 className="font-serif text-xl">Add Driver</h2>
              <button onClick={() => { setShowAdd(false); setAddForm(EMPTY_DRIVER); }} className="text-muted-foreground hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-7 space-y-5 max-h-[60vh] overflow-y-auto">
              <p className="text-xs text-muted-foreground">Admin-created drivers bypass the approval flow and are immediately active. They'll receive an email with a link to set their password and upload their license, registration, and insurance documents.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Full Name *</label>
                  <Input value={addForm.name} onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))} className={FINPUT} placeholder="James Williams" />
                </div>
                <div>
                  <label className={LABEL}>Email Address *</label>
                  <Input type="email" value={addForm.email} onChange={e => setAddForm(p => ({ ...p, email: e.target.value }))} className={FINPUT} placeholder="driver@royalmidnight.com" />
                </div>
                <div>
                  <label className={LABEL}>Phone Number *</label>
                  <Input value={addForm.phone} onChange={e => setAddForm(p => ({ ...p, phone: e.target.value }))} className={FINPUT} placeholder="+1 (305) 555-0000" />
                </div>
                <div>
                  <label className={LABEL}>License Number *</label>
                  <Input value={addForm.licenseNumber} onChange={e => setAddForm(p => ({ ...p, licenseNumber: e.target.value }))} className={FINPUT} placeholder="FL-D12345678" />
                </div>
              </div>
              <div className="border-t border-white/10 pt-4">
                <p className="text-xs text-muted-foreground mb-3 uppercase tracking-widest">Vehicle Details (Optional)</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className={LABEL}>Vehicle Class</label>
                    <select value={addForm.vehicleClass} onChange={e => setAddForm(p => ({ ...p, vehicleClass: e.target.value }))} className="bg-white/5 border border-white/10 text-white rounded-none h-10 text-sm px-3 w-full">
                      <option value="">— Select class —</option>
                      <option value="business">Business Class Sedan</option>
                      <option value="suv">Premium SUV (Chevrolet Suburban)</option>
                    </select>
                  </div>
                  <div>
                    <label className={LABEL}>Make</label>
                    <Input value={addForm.vehicleMake} onChange={e => setAddForm(p => ({ ...p, vehicleMake: e.target.value }))} className={FINPUT} placeholder="Chevrolet" />
                  </div>
                  <div>
                    <label className={LABEL}>Model</label>
                    <Input value={addForm.vehicleModel} onChange={e => setAddForm(p => ({ ...p, vehicleModel: e.target.value }))} className={FINPUT} placeholder="Suburban" />
                  </div>
                  <div>
                    <label className={LABEL}>Year</label>
                    <Input value={addForm.vehicleYear} onChange={e => setAddForm(p => ({ ...p, vehicleYear: e.target.value }))} className={FINPUT} placeholder="2026" />
                  </div>
                  <div>
                    <label className={LABEL}>Color</label>
                    <Input value={addForm.vehicleColor} onChange={e => setAddForm(p => ({ ...p, vehicleColor: e.target.value }))} className={FINPUT} placeholder="Midnight Black" />
                  </div>
                  <div>
                    <label className={LABEL}>Passenger Capacity</label>
                    <Input type="number" min="1" max="14" value={addForm.passengerCapacity} onChange={e => setAddForm(p => ({ ...p, passengerCapacity: e.target.value }))} className={FINPUT} placeholder="6" />
                  </div>
                </div>
              </div>
            </div>
            <div className="px-7 py-5 border-t border-border flex justify-end gap-3">
              <Button variant="outline" onClick={() => { setShowAdd(false); setAddForm(EMPTY_DRIVER); }} className="rounded-none border-white/20 text-white hover:bg-white/10 text-xs uppercase tracking-widest">Cancel</Button>
              <Button onClick={handleAddDriver} disabled={addSaving} className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest px-6">
                {addSaving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Creating...</> : "Create Driver"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {editingDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-card border border-border w-full max-w-lg">
            <div className="flex items-center justify-between px-7 py-5 border-b border-border">
              <h2 className="font-serif text-xl">Edit Driver — {editingDriver.name}</h2>
              <button onClick={() => setEditingDriver(null)} className="text-muted-foreground hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-7 space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Full Name</label>
                  <Input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} className={FINPUT} />
                </div>
                <div>
                  <label className={LABEL}>Phone</label>
                  <Input value={editForm.phone} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} className={FINPUT} />
                </div>
                <div>
                  <label className={LABEL}>License Number</label>
                  <Input value={editForm.licenseNumber} onChange={e => setEditForm(p => ({ ...p, licenseNumber: e.target.value }))} className={FINPUT} />
                </div>
              </div>
              <div className="border-t border-white/10 pt-4">
                <p className="text-xs text-muted-foreground mb-3 uppercase tracking-widest">Vehicle</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL}>Make</label>
                    <Input value={editForm.vehicleMake} onChange={e => setEditForm(p => ({ ...p, vehicleMake: e.target.value }))} className={FINPUT} placeholder="Mercedes-Benz" />
                  </div>
                  <div>
                    <label className={LABEL}>Model</label>
                    <Input value={editForm.vehicleModel} onChange={e => setEditForm(p => ({ ...p, vehicleModel: e.target.value }))} className={FINPUT} placeholder="S-Class" />
                  </div>
                  <div>
                    <label className={LABEL}>Year</label>
                    <Input value={editForm.vehicleYear} onChange={e => setEditForm(p => ({ ...p, vehicleYear: e.target.value }))} className={FINPUT} placeholder="2026" />
                  </div>
                  <div>
                    <label className={LABEL}>Color</label>
                    <Input value={editForm.vehicleColor} onChange={e => setEditForm(p => ({ ...p, vehicleColor: e.target.value }))} className={FINPUT} placeholder="Black" />
                  </div>
                  <div>
                    <label className={LABEL}>Passenger Capacity</label>
                    <Input type="number" min="1" max="14" value={editForm.passengerCapacity} onChange={e => setEditForm(p => ({ ...p, passengerCapacity: e.target.value }))} className={FINPUT} placeholder="3" />
                  </div>
                </div>
              </div>
            </div>
            <div className="px-7 py-5 border-t border-border flex justify-end gap-3">
              <Button variant="outline" onClick={() => setEditingDriver(null)} className="rounded-none border-white/20 text-white hover:bg-white/10 text-xs uppercase tracking-widest">Cancel</Button>
              <Button onClick={handleEditSave} disabled={editSaving} className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest px-6">
                {editSaving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</> : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <DocReviewModal
        modal={reviewModal}
        onClose={() => setReviewModal(null)}
        onApprove={handleApproveDoc}
        onReject={handleRejectDoc}
        saving={reviewSaving}
      />
    </PortalLayout>
  );
}
