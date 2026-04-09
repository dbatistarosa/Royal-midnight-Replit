import { useState, useMemo } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Loader2, Lock, AlertCircle } from "lucide-react";

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
  const [isElementReady, setIsElementReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) {
      setErrorMessage("Payment form is still loading. Please wait a moment and try again.");
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
        confirmParams: {
          return_url: returnUrl || window.location.href,
        },
      });

      if (error) {
        const detail = error.code ? ` (${error.type}: ${error.code})` : "";
        if (error.type === "card_error" || error.type === "validation_error") {
          // Keep the form mounted — user can correct the card details and retry
          setErrorMessage((error.message || "Card error.") + detail);
        } else {
          // Network/API errors — surface via parent so the booking state resets if needed
          onError((error.message || "Payment failed. Please try again.") + detail);
        }
      } else if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
        onSuccess(paymentIntent.id);
      } else {
        const status = paymentIntent?.status ?? "unknown";
        setErrorMessage(`Unexpected payment status: ${status}. Please contact support.`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setErrorMessage(msg);
    }

    setIsProcessing(false);
  };

  const isDisabled = !stripe || !isElementReady || isProcessing;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement
        onChange={(e) => {
          setIsElementReady(e.complete);
          if (e.complete) setErrorMessage(null);
        }}
      />

      {errorMessage && (
        <div className="flex items-start gap-2 text-sm text-red-400 p-3 border border-red-900/40 bg-red-900/10 rounded-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="flex items-center justify-between pt-4 border-t border-white/10">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="w-3.5 h-3.5" />
          Secured by Stripe
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button
            type="submit"
            disabled={isDisabled}
            className="bg-primary text-black hover:bg-primary/90 font-medium uppercase tracking-widest text-sm px-10 py-6 rounded-none disabled:opacity-40"
          >
            {isProcessing ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Processing...</>
            ) : (
              `Pay $${amount.toFixed(2)}`
            )}
          </Button>
          {!isElementReady && !isProcessing && stripe && (
            <p className="text-xs text-gray-600">Enter card details above to continue</p>
          )}
        </div>
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
  const stripePromise = useMemo(() => loadStripe(publishableKey), [publishableKey]);

  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance }}>
      <CheckoutForm amount={amount} returnUrl={returnUrl} onSuccess={onSuccess} onError={onError} />
    </Elements>
  );
}
