import { useState, useMemo } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Loader2, Lock } from "lucide-react";

const appearance = {
  theme: "night" as const,
  variables: {
    colorPrimary: "#c9a84c",
    colorBackground: "#0a0a0a",
    colorText: "#ffffff",
    colorDanger: "#ef4444",
    fontFamily: "Inter, system-ui, sans-serif",
    borderRadius: "0px",
  },
  rules: {
    ".Input": {
      border: "1px solid rgba(255,255,255,0.12)",
      backgroundColor: "rgba(255,255,255,0.04)",
    },
    ".Input:focus": {
      border: "1px solid #c9a84c",
      boxShadow: "none",
    },
    ".Label": {
      color: "rgba(255,255,255,0.5)",
      textTransform: "uppercase" as const,
      letterSpacing: "0.1em",
      fontSize: "11px",
    },
  },
};

interface CheckoutFormProps {
  amount: number;
  returnUrl?: string;
  onSuccess: (paymentIntentId: string) => void;
  onError: (message: string) => void;
}

function CheckoutForm({ amount, returnUrl, onSuccess, onError }: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsProcessing(true);
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: {
        return_url: returnUrl || window.location.href,
      },
    });

    if (error) {
      onError(error.message || "Payment failed. Please try again.");
    } else if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
      // "processing" means the payment is underway (e.g. bank transfer / ACH).
      // Call onSuccess so the booking confirmation page is shown immediately;
      // the webhook will promote the booking to "pending" once the charge settles.
      onSuccess(paymentIntent.id);
    } else {
      onError("Unexpected payment status. Please contact support.");
    }
    setIsProcessing(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      <div className="flex items-center justify-between pt-4 border-t border-white/10">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="w-3.5 h-3.5" />
          Secured by Stripe
        </div>
        <Button
          type="submit"
          disabled={!stripe || isProcessing}
          className="bg-primary text-black hover:bg-primary/90 font-medium uppercase tracking-widest text-sm px-10 py-6 rounded-none"
        >
          {isProcessing ? (
            <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Processing...</>
          ) : (
            `Pay $${amount.toFixed(2)}`
          )}
        </Button>
      </div>
    </form>
  );
}

interface StripePaymentFormProps {
  clientSecret: string;
  publishableKey: string;
  amount: number;
  returnUrl?: string;
  onSuccess: (paymentIntentId: string) => void;
  onError: (message: string) => void;
}

export function StripePaymentForm({ clientSecret, publishableKey, amount, returnUrl, onSuccess, onError }: StripePaymentFormProps) {
  // Memoize so the Stripe instance isn't re-created on every parent render
  const stripePromise = useMemo(() => loadStripe(publishableKey), [publishableKey]);

  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance }}>
      <CheckoutForm amount={amount} returnUrl={returnUrl} onSuccess={onSuccess} onError={onError} />
    </Elements>
  );
}
