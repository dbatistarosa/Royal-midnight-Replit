import { useState, useEffect, useRef } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import {
  LayoutDashboard, History, DollarSign, User, BarChart2, FileText,
  Loader2, Upload, CheckCircle, AlertTriangle, XCircle, Clock, ExternalLink,
  ShieldOff, RefreshCcw,
} from "lucide-react";
import { useDriverStatus } from "@/contexts/driverStatus";
import { useAuth } from "@/contexts/auth";
import { API_BASE } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@workspace/object-storage-web";
import { differenceInDays, parseISO, isValid } from "date-fns";

const driverNavItems = [
  { label: "Dashboard", href: "/driver/dashboard", icon: LayoutDashboard },
  { label: "Finished",  href: "/driver/history",   icon: History },
  { label: "Earnings",  href: "/driver/earnings",  icon: DollarSign },
  { label: "Stats",     href: "/driver/stats",     icon: BarChart2 },
  { label: "Documents", href: "/driver/documents", icon: FileText },
  { label: "Profile",   href: "/driver/profile",   icon: User },
];

const DOC_TYPES = ["Driver License", "Vehicle Registration", "Insurance"] as const;
type DocType = typeof DOC_TYPES[number];

type DocSubmission = {
  id: number;
  driverId: number;
  docType: string;
  status: string; // "pending_review" | "approved" | "rejected"
  fileUrl: string;
  newExpiry: string | null;
  adminNotes: string | null;
  submittedAt: string;
  reviewedAt: string | null;
};

type DocsResponse = {
  currentExpiries: Record<DocType, string | null>;
  complianceHold: boolean;
  submissions: DocSubmission[];
};

function daysUntil(expiry: string | null | undefined): number | null {
  if (!expiry) return null;
  try {
    const d = parseISO(expiry);
    if (!isValid(d)) return null;
    return differenceInDays(d, new Date());
  } catch {
    return null;
  }
}

type DocStatus = "active" | "expiring" | "expired" | "pending_review" | "no_expiry";

function getDocStatus(expiry: string | null, latestSubmission: DocSubmission | undefined): DocStatus {
  // If latest submission is pending review, show that regardless of expiry
  if (latestSubmission?.status === "pending_review") return "pending_review";
  const days = daysUntil(expiry);
  if (days === null) return "no_expiry";
  if (days < 0) return "expired";
  if (days <= 30) return "expiring";
  return "active";
}

const STATUS_CONFIG: Record<DocStatus, { label: string; icon: React.ElementType; classes: string; dotClass: string }> = {
  active:         { label: "Active",               icon: CheckCircle,    classes: "text-green-400 bg-green-400/10 border-green-400/20",  dotClass: "bg-green-400" },
  expiring:       { label: "Expiring Soon",         icon: AlertTriangle,  classes: "text-amber-400 bg-amber-400/10 border-amber-400/20",  dotClass: "bg-amber-400" },
  expired:        { label: "Expired",               icon: XCircle,        classes: "text-red-400 bg-red-400/10 border-red-400/20",        dotClass: "bg-red-400" },
  pending_review: { label: "Pending Admin Review",  icon: Clock,          classes: "text-sky-400 bg-sky-400/10 border-sky-400/20",        dotClass: "bg-sky-400" },
  no_expiry:      { label: "No expiry on file",     icon: AlertTriangle,  classes: "text-gray-500 bg-gray-500/10 border-gray-500/20",     dotClass: "bg-gray-500" },
};

function DocCard({
  docType,
  expiry,
  submissions,
  driverId,
  authHeader,
  onRefresh,
}: {
  docType: DocType;
  expiry: string | null;
  submissions: DocSubmission[];
  driverId: number;
  authHeader: string;
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [newExpiry, setNewExpiry] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);

  const { uploadFile, isUploading, progress } = useUpload({
    basePath: `${API_BASE}/storage`,
    onSuccess: (res) => {
      setUploadedPath(res.objectPath);
    },
    onError: (err) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const latestForType = submissions.find(s => s.docType === docType);
  const docStatus = getDocStatus(expiry, latestForType);
  const cfg = STATUS_CONFIG[docStatus];
  const StatusIcon = cfg.icon;
  const days = daysUntil(expiry);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void uploadFile(file);
  };

  const handleSubmit = async () => {
    if (!uploadedPath) {
      toast({ title: "No file", description: "Please upload a file first.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/drivers/${driverId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ docType, fileUrl: uploadedPath, newExpiry: newExpiry || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to submit" })) as { error?: string };
        toast({ title: "Submission failed", description: err.error ?? "Please try again.", variant: "destructive" });
        return;
      }
      toast({ title: "Document submitted", description: "Your document is now pending admin review." });
      setShowUpload(false);
      setUploadedPath(null);
      setNewExpiry("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      onRefresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-card border border-border p-6">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
            <FileText className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="font-medium text-sm">{docType}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {expiry
                ? `Expires: ${expiry}${days !== null ? ` · ${days < 0 ? `${Math.abs(days)}d overdue` : `${days}d remaining`}` : ""}`
                : "No expiry on file"}
            </p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 border ${cfg.classes} self-start sm:self-auto`}>
          <StatusIcon className="w-3.5 h-3.5" />
          {cfg.label}
        </span>
      </div>

      {/* Latest submission (if any) */}
      {latestForType && (
        <div className="mb-4 p-3 bg-background/50 border border-border/50 text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground uppercase tracking-widest">Last Submitted</span>
            <span className="text-foreground">{new Date(latestForType.submittedAt).toLocaleDateString()}</span>
          </div>
          {latestForType.newExpiry && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground uppercase tracking-widest">Proposed Expiry</span>
              <span className="text-foreground">{latestForType.newExpiry}</span>
            </div>
          )}
          {latestForType.status === "rejected" && latestForType.adminNotes && (
            <div className="mt-2 p-2 bg-red-900/10 border border-red-900/30">
              <p className="text-red-400 text-[11px] uppercase tracking-widest mb-0.5">Admin Note</p>
              <p className="text-gray-300">{latestForType.adminNotes}</p>
            </div>
          )}
          {latestForType.fileUrl && (
            <a
              href={latestForType.fileUrl.startsWith("http") ? latestForType.fileUrl : `${API_BASE}/storage/objects${latestForType.fileUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              View submitted file
            </a>
          )}
        </div>
      )}

      {/* Upload toggle */}
      {docStatus !== "pending_review" && (
        <button
          onClick={() => setShowUpload(v => !v)}
          className="text-xs uppercase tracking-widest text-primary border border-primary/30 px-4 py-2 hover:bg-primary/5 transition-colors flex items-center gap-2"
        >
          <Upload className="w-3.5 h-3.5" />
          {showUpload ? "Cancel Upload" : docStatus === "active" ? "Replace Document" : "Upload New Document"}
        </button>
      )}

      {/* Upload form */}
      {showUpload && (
        <div className="mt-4 space-y-4 border-t border-border/60 pt-4">
          {/* File picker */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-widest block mb-2">
              Select File <span className="text-gray-600">(PDF, JPG, or PNG)</span>
            </label>
            <div
              className="relative border border-dashed border-white/20 p-6 flex flex-col items-center gap-2 cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-6 h-6 text-primary animate-spin" />
                  <p className="text-xs text-muted-foreground">Uploading… {progress}%</p>
                </>
              ) : uploadedPath ? (
                <>
                  <CheckCircle className="w-6 h-6 text-green-400" />
                  <p className="text-xs text-green-400">File uploaded successfully</p>
                </>
              ) : (
                <>
                  <Upload className="w-6 h-6 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Click to choose a file</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                className="hidden"
                onChange={handleFileChange}
                disabled={isUploading}
              />
            </div>
          </div>

          {/* New expiry date */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-widest block mb-2">
              New Expiry Date <span className="text-gray-600">(optional — admin will verify)</span>
            </label>
            <input
              type="date"
              value={newExpiry}
              onChange={e => setNewExpiry(e.target.value)}
              className="w-full bg-white/5 border border-white/10 text-white text-sm px-3 h-11 focus:outline-none focus:border-primary/50 focus:ring-0"
            />
          </div>

          <button
            onClick={() => void handleSubmit()}
            disabled={!uploadedPath || submitting || isUploading}
            className="w-full py-2.5 text-xs uppercase tracking-widest bg-primary text-black font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {submitting ? "Submitting…" : "Submit for Review"}
          </button>
        </div>
      )}
    </div>
  );
}

function ComplianceHoldScreen({ driverName, docs }: { driverName: string; docs: DocsResponse }) {
  const expiredTypes = DOC_TYPES.filter(dt => {
    const days = daysUntil(docs.currentExpiries[dt]);
    return days !== null && days < 0;
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center px-6">
      <div className="max-w-lg w-full text-center">
        <div className="w-16 h-16 border border-red-900/40 bg-red-900/20 flex items-center justify-center mx-auto mb-6">
          <ShieldOff className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-2xl font-serif text-white mb-2">Account on Hold</h2>
        <p className="text-gray-400 text-sm mb-6 leading-relaxed">
          Hello {driverName.split(" ")[0]}, your account has been placed on a compliance hold because one or more
          required documents have expired. You cannot accept new rides until your documents are approved.
        </p>

        {expiredTypes.length > 0 && (
          <div className="bg-red-900/10 border border-red-900/30 p-4 mb-6 text-left space-y-2">
            <p className="text-xs uppercase tracking-widest text-red-500 mb-3">Expired Documents</p>
            {expiredTypes.map(dt => (
              <div key={dt} className="flex items-center gap-2 text-sm text-gray-300">
                <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                {dt}
                {docs.currentExpiries[dt] && (
                  <span className="text-gray-500 text-xs ml-auto">Expired {docs.currentExpiries[dt]}</span>
                )}
              </div>
            ))}
          </div>
        )}

        <a
          href="/driver/documents"
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-black text-sm font-semibold uppercase tracking-widest hover:bg-primary/90 transition-colors"
        >
          <Upload className="w-4 h-4" />
          Upload Documents Now
        </a>
        <p className="text-xs text-gray-600 mt-4">
          Your hold will be lifted once an admin approves your renewed documents.
        </p>
      </div>
    </div>
  );
}

export default function DriverDocuments() {
  const { driverRecord, isLoading: driverLoading } = useDriverStatus();
  const { token, user } = useAuth();
  const { toast } = useToast();
  const [docs, setDocs] = useState<DocsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const authHeader = `Bearer ${token ?? ""}`;

  const loadDocs = () => {
    if (!driverRecord?.id || !token) return;
    setLoading(true);
    fetch(`${API_BASE}/drivers/${driverRecord.id}/documents`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() as Promise<DocsResponse> : Promise.reject(new Error("Failed to load")))
      .then(d => setDocs(d))
      .catch(() => toast({ title: "Error", description: "Could not load document status.", variant: "destructive" }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (driverRecord?.id && token) loadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverRecord?.id, token]);

  if (driverLoading || loading) {
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
      {/* Compliance hold full-page overlay */}
      {docs?.complianceHold && driverRecord && (
        <ComplianceHoldScreen driverName={user?.name ?? driverRecord.name} docs={docs} />
      )}

      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl mb-1">My Documents</h1>
          <p className="text-muted-foreground text-sm">
            Keep your compliance documents up to date. Upload renewals here before they expire.
          </p>
        </div>
        <button
          onClick={loadDocs}
          className="self-start sm:self-auto flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground border border-border px-4 py-2 hover:text-foreground hover:border-foreground/30 transition-colors"
        >
          <RefreshCcw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {!driverRecord ? (
        <div className="bg-card border border-border p-8 text-center text-muted-foreground text-sm">
          Driver profile not found.
        </div>
      ) : !docs ? (
        <div className="bg-card border border-border p-8 text-center text-muted-foreground text-sm">
          Could not load document status. Please refresh.
        </div>
      ) : (
        <div className="space-y-4">
          {DOC_TYPES.map(dt => (
            <DocCard
              key={dt}
              docType={dt}
              expiry={docs.currentExpiries[dt] ?? null}
              submissions={docs.submissions.filter(s => s.docType === dt)}
              driverId={driverRecord.id}
              authHeader={authHeader}
              onRefresh={loadDocs}
            />
          ))}

          <div className="bg-card/50 border border-border/50 p-5 text-xs text-muted-foreground space-y-1.5">
            <p className="font-medium text-foreground/60 uppercase tracking-widest text-[11px] mb-2">How it works</p>
            <p>1. Upload a clear photo or PDF of your renewed document.</p>
            <p>2. Optionally enter the new expiry date to help admin verification.</p>
            <p>3. Your status changes to "Pending Admin Review" immediately.</p>
            <p>4. Once approved, your expiry date is updated and the hold (if any) is lifted.</p>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
