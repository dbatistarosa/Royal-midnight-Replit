import { useState } from "react";
import { Link, useLocation } from "wouter";
import { PageSeo } from "@/components/PageSeo";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/contexts/auth";
import { API_BASE } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

type LoginResponse = {
  token: string;
  driverId?: number;
  user: { id: number; name: string; email: string; phone: string | null; role: string };
  error?: string;
};

type ForgotResponse = {
  message: string;
  resetLink?: string;
  token?: string;
};

export default function Login() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotResult, setForgotResult] = useState<ForgotResponse | null>(null);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginFormValues) {
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await res.json() as LoginResponse;
      if (!res.ok) {
        toast({ title: "Sign in failed", description: result.error ?? "Invalid email or password.", variant: "destructive" });
        return;
      }
      login({
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        phone: result.user.phone ?? null,
        role: result.user.role as "passenger" | "driver" | "admin" | "corporate",
      }, result.token, result.driverId ?? null);
      toast({ title: "Welcome back", description: `Signed in as ${result.user.name}` });

      if (result.user.role === "admin") setLocation("/admin");
      else if (result.user.role === "driver") setLocation("/driver/dashboard");
      else if (result.user.role === "corporate") setLocation("/corporate/dashboard");
      else setLocation("/passenger/dashboard");
    } catch {
      toast({ title: "Sign in failed", description: "Could not connect to server. Please try again.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleForgot() {
    if (!forgotEmail.trim()) return;
    setForgotSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      const result = await res.json() as ForgotResponse;
      setForgotResult(result);
    } catch {
      toast({ title: "Error", description: "Could not process your request. Please try again.", variant: "destructive" });
    } finally {
      setForgotSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center px-6 pt-24">
      <PageSeo
        title="Sign In"
        description="Sign in to your Royal Midnight account to view bookings, manage your profile, and access your reservation history."
        path="/auth/login"
        noIndex={true}
      />
      <div className="w-full max-w-md">
        <div className="text-center mb-12">
          <Link href="/" className="block mb-8">
            <img src="/royal-midnight-logo-original.png" alt="Royal Midnight" className="h-28 w-auto mx-auto max-w-xs object-contain" />
          </Link>
          {mode === "login" ? (
            <>
              <h1 className="text-3xl font-serif text-white mb-2">Welcome Back</h1>
              <p className="text-gray-400 text-sm">Sign in to access your account</p>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-serif text-white mb-2">Reset Password</h1>
              <p className="text-gray-400 text-sm">Enter your email to receive a reset link</p>
            </>
          )}
        </div>

        <div className="bg-black border border-white/10 p-10 relative">
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary to-transparent opacity-40" />

          {mode === "login" ? (
            <>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-400 uppercase tracking-widest text-xs">Email Address</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="your@email.com"
                          className="bg-white/5 border-white/10 text-white rounded-none h-12 focus:border-primary"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="password" render={({ field }) => (
                    <FormItem>
                      <div className="flex justify-between items-center mb-1.5">
                        <FormLabel className="text-gray-400 uppercase tracking-widest text-xs">Password</FormLabel>
                        <button
                          type="button"
                          onClick={() => setMode("forgot")}
                          className="text-xs text-gray-500 hover:text-primary transition-colors"
                        >
                          Forgot password?
                        </button>
                      </div>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="••••••••"
                          className="bg-white/5 border-white/10 text-white rounded-none h-12 focus:border-primary"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-primary text-black hover:bg-primary/90 rounded-none uppercase tracking-widest text-xs py-6 font-medium"
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign In"}
                  </Button>
                </form>
              </Form>

              <div className="mt-8 pt-6 border-t border-white/10 text-center">
                <p className="text-gray-500 text-sm">
                  New to Royal Midnight?{" "}
                  <Link href="/auth/signup" className="text-primary hover:text-primary/80 transition-colors">
                    Create an account
                  </Link>
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-6">
              {!forgotResult ? (
                <>
                  <div>
                    <label className="text-gray-400 uppercase tracking-widest text-xs block mb-2">Email Address</label>
                    <Input
                      type="email"
                      placeholder="your@email.com"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      className="bg-white/5 border-white/10 text-white rounded-none h-12 focus:border-primary"
                      onKeyDown={e => { if (e.key === "Enter") void handleForgot(); }}
                    />
                  </div>
                  <Button
                    onClick={() => void handleForgot()}
                    disabled={!forgotEmail.trim() || forgotSubmitting}
                    className="w-full bg-primary text-black hover:bg-primary/90 rounded-none uppercase tracking-widest text-xs py-6 font-medium"
                  >
                    {forgotSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send Reset Link"}
                  </Button>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="bg-green-900/10 border border-green-900/30 p-4">
                    <p className="text-sm text-green-400">{forgotResult.message}</p>
                  </div>
                  {forgotResult.resetLink && (
                    <div className="bg-white/5 border border-white/10 p-4 space-y-2">
                      <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Your reset link</p>
                      <code className="text-xs text-primary break-all block leading-relaxed">{forgotResult.resetLink}</code>
                      <Link
                        href={forgotResult.resetLink}
                        className="mt-3 inline-block text-xs text-primary hover:text-primary/80 underline"
                      >
                        Go to reset page
                      </Link>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={() => { setMode("login"); setForgotResult(null); setForgotEmail(""); }}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to sign in
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">
          Driver or corporate partner?{" "}
          <Link href="/contact" className="text-gray-400 hover:text-white transition-colors">
            Contact us
          </Link>
        </p>
      </div>
    </div>
  );
}
