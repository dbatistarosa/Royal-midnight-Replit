import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { PageSeo } from "@/components/PageSeo";
import { API_BASE } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Check, ArrowLeft } from "lucide-react";

function getToken(): string {
  const search = typeof window !== "undefined" ? window.location.search : "";
  const params = new URLSearchParams(search);
  return params.get("token") ?? "";
}

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = getToken();
    setToken(t);
    if (!t) setError("No reset token provided. Please use the link from your reset email.");
  }, []);

  async function handleReset() {
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const result = await res.json() as { message?: string; error?: string };
      if (res.ok) {
        setSuccess(true);
        toast({ title: "Password updated", description: "You can now sign in with your new password." });
      } else {
        setError(result.error ?? "Could not reset your password. The link may have expired.");
      }
    } catch {
      setError("Could not connect to server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center px-6 pt-24">
      <PageSeo
        title="Reset Password"
        description="Set a new password for your Royal Midnight account."
        path="/auth/reset-password"
        noIndex={true}
      />
      <div className="w-full max-w-md">
        <div className="text-center mb-12">
          <Link href="/" className="block mb-8">
            <img src="/royal-midnight-logo-original.png" alt="Royal Midnight" className="h-28 w-auto mx-auto max-w-xs object-contain" style={{ mixBlendMode: "screen" }} />
          </Link>
          <h1 className="text-3xl font-serif text-white mb-2">Set New Password</h1>
          <p className="text-gray-400 text-sm">Choose a secure password for your account</p>
        </div>

        <div className="bg-black border border-white/10 p-10 relative">
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary to-transparent opacity-40" />

          {success ? (
            <div className="space-y-6">
              <div className="bg-green-900/10 border border-green-900/30 p-5 flex items-start gap-3">
                <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-green-400 font-medium text-sm">Password updated successfully</p>
                  <p className="text-gray-400 text-xs mt-1">You can now sign in with your new password.</p>
                </div>
              </div>
              <Button
                onClick={() => setLocation("/auth/login")}
                className="w-full bg-primary text-black hover:bg-primary/90 rounded-none uppercase tracking-widest text-xs py-6 font-medium"
              >
                Go to Sign In
              </Button>
            </div>
          ) : (
            <div className="space-y-5">
              {error && (
                <div className="bg-red-900/10 border border-red-900/30 p-4">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              {!token ? null : (
                <>
                  <div>
                    <label className="text-gray-400 uppercase tracking-widest text-xs block mb-1.5">New Password</label>
                    <Input
                      type="password"
                      placeholder="Minimum 6 characters"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="bg-white/5 border-white/10 text-white rounded-none h-12 focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 uppercase tracking-widest text-xs block mb-1.5">Confirm Password</label>
                    <Input
                      type="password"
                      placeholder="Repeat your new password"
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      className="bg-white/5 border-white/10 text-white rounded-none h-12 focus:border-primary"
                      onKeyDown={e => { if (e.key === "Enter") void handleReset(); }}
                    />
                  </div>
                  <Button
                    onClick={() => void handleReset()}
                    disabled={!password || !confirm || submitting}
                    className="w-full bg-primary text-black hover:bg-primary/90 rounded-none uppercase tracking-widest text-xs py-6 font-medium"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Set New Password"}
                  </Button>
                </>
              )}

              <Link
                href="/auth/login"
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
