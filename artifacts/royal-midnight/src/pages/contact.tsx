import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useCreateTicket } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Mail, Phone, MapPin } from "lucide-react";
import { PageSeo } from "@/components/PageSeo";

const formSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Invalid email address"),
  subject: z.string().min(5, "Subject is required"),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

export default function Contact() {
  const { toast } = useToast();
  const createTicket = useCreateTicket();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      subject: "",
      message: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    createTicket.mutate(
      {
        data: {
          ...values,
          priority: "medium" as const,
        },
      },
      {
        onSuccess: () => {
          toast({
            title: "Message Sent",
            description: "We've received your message and will respond shortly.",
          });
          form.reset();
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to send message. Please try again.",
            variant: "destructive",
          });
        },
      }
    );
  }

  return (
    <div className="py-24">
      <PageSeo
        title="Contact Us — 24/7 Concierge"
        description="Reach Royal Midnight's concierge team 24/7. Call, email, or send a message — we're here to assist with reservations, corporate accounts, and any questions about our South Florida luxury service."
        path="/contact"
      />
      <div className="container mx-auto max-w-6xl px-4">
        <div className="text-center mb-16">
          <h1 className="font-serif text-3xl sm:text-4xl md:text-6xl mb-6">Contact Us</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Available 24/7. How may we assist you today?
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-16">
          <div>
            <h2 className="font-serif text-3xl mb-8">Get in Touch</h2>
            <div className="space-y-8 mb-12">
              <div className="flex items-start gap-4">
                <div className="bg-card border border-border p-3 rounded-full shrink-0">
                  <Phone className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium mb-1">Phone</h3>
                  <p className="text-muted-foreground">+1 (800) 555-0199</p>
                  <p className="text-sm text-muted-foreground mt-1">Available 24/7 for immediate assistance</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="bg-card border border-border p-3 rounded-full shrink-0">
                  <Mail className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium mb-1">Email</h3>
                  <p className="text-muted-foreground">concierge@royalmidnight.com</p>
                  <p className="text-sm text-muted-foreground mt-1">We aim to respond within 1 hour</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="bg-card border border-border p-3 rounded-full shrink-0">
                  <MapPin className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium mb-1">Headquarters</h3>
                  <p className="text-muted-foreground">100 Biscayne Blvd, Suite 2100<br/>Miami, FL 33132</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border p-8 rounded-lg">
            <h3 className="font-serif text-2xl mb-6">Send a Message</h3>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Your full name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="your.email@example.com" type="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="subject"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subject</FormLabel>
                      <FormControl>
                        <Input placeholder="How can we help?" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Message</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Please provide details..." 
                          className="min-h-[120px]"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={createTicket.isPending}>
                  {createTicket.isPending ? "Sending..." : "Send Message"}
                </Button>
              </form>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
}
