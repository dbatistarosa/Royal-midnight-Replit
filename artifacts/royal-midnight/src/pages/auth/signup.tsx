import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRegister } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const signupSchema = z.object({
  name: z.string().min(2, "Full name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(10, "Phone number is required").optional().or(z.literal("")),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type SignupFormValues = z.infer<typeof signupSchema>;

export default function Signup() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const registerMutation = useRegister();

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", email: "", phone: "", password: "", confirmPassword: "" },
  });

  async function onSubmit(values: SignupFormValues) {
    try {
      const result = await registerMutation.mutateAsync({
        data: {
          name: values.name,
          email: values.email,
          phone: values.phone || null,
          password: values.password,
          role: "passenger",
        },
      });
      login(result.user as any, result.token);
      toast({ title: "Account created", description: "Welcome to Royal Midnight." });
      setLocation("/passenger/dashboard");
    } catch (err: any) {
      const msg = err?.response?.data?.error || "Could not create account.";
      toast({ title: "Registration failed", description: msg, variant: "destructive" });
    }
  }

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center px-6 pt-24 pb-16">
      <div className="w-full max-w-md">
        <div className="text-center mb-12">
          <Link href="/" className="block mb-8">
            <img src="/royal-midnight-logo.png" alt="Royal Midnight" className="h-20 w-auto mx-auto" />
          </Link>
          <h1 className="text-3xl font-serif text-white mb-2">Create Account</h1>
          <p className="text-gray-400 text-sm">Join the Royal Midnight experience</p>
        </div>

        <div className="bg-black border border-white/10 p-10 relative">
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary to-transparent opacity-40" />

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-gray-400 uppercase tracking-widest text-xs">Full Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Alexandra Monroe"
                      className="bg-white/5 border-white/10 text-white rounded-none h-12 focus:border-primary"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

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

              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-gray-400 uppercase tracking-widest text-xs">Phone Number <span className="text-gray-600">(optional)</span></FormLabel>
                  <FormControl>
                    <Input
                      type="tel"
                      placeholder="+1 (305) 555-0100"
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
                      placeholder="Min. 8 characters"
                      className="bg-white/5 border-white/10 text-white rounded-none h-12 focus:border-primary"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="confirmPassword" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-gray-400 uppercase tracking-widest text-xs">Confirm Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Repeat password"
                      className="bg-white/5 border-white/10 text-white rounded-none h-12 focus:border-primary"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <Button
                type="submit"
                disabled={registerMutation.isPending}
                className="w-full bg-primary text-black hover:bg-primary/90 rounded-none uppercase tracking-widest text-xs py-6 font-medium mt-2"
              >
                {registerMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Account"}
              </Button>
            </form>
          </Form>

          <div className="mt-8 pt-6 border-t border-white/10 text-center">
            <p className="text-gray-500 text-sm">
              Already have an account?{" "}
              <Link href="/auth/login" className="text-primary hover:text-primary/80 transition-colors">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
