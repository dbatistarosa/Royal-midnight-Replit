import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const loginMutation = useLogin();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginFormValues) {
    try {
      const result = await loginMutation.mutateAsync({ data: values });
      login({
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        phone: result.user.phone ?? null,
        role: result.user.role as "passenger" | "driver" | "admin",
      }, result.token);
      toast({ title: "Welcome back", description: `Signed in as ${result.user.name}` });

      if (result.user.role === "admin") setLocation("/admin");
      else if (result.user.role === "driver") setLocation("/driver/dashboard");
      else setLocation("/passenger/dashboard");
    } catch {
      toast({ title: "Sign in failed", description: "Invalid email or password.", variant: "destructive" });
    }
  }

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center px-6 pt-24">
      <div className="w-full max-w-md">
        <div className="text-center mb-12">
          <Link href="/" className="text-2xl font-serif text-white tracking-widest block mb-8">
            ROYAL <span className="text-primary italic">MIDNIGHT</span>
          </Link>
          <h1 className="text-3xl font-serif text-white mb-2">Welcome Back</h1>
          <p className="text-gray-400 text-sm">Sign in to access your account</p>
        </div>

        <div className="bg-black border border-white/10 p-10 relative">
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary to-transparent opacity-40" />

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
                  <FormLabel className="text-gray-400 uppercase tracking-widest text-xs">Password</FormLabel>
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
                disabled={loginMutation.isPending}
                className="w-full bg-primary text-black hover:bg-primary/90 rounded-none uppercase tracking-widest text-xs py-6 font-medium"
              >
                {loginMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign In"}
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
