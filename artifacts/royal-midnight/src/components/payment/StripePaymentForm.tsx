import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Loader2, Lock } from "lucide-react";

// Fix 4: Module-level Map cache — loadStripe is invoked at most once per unique
// publishableKey per browser session, regardless of how often the parent re-renders.
const stripePromiseCache = new Map<string, ReturnType<typeof loadStripe>>();
function getStripePromise(publishableKey: string) {
  if (!stripePromiseCache.has(publishableKey)) {
    stripePromiseCache.set(publishableKey, loadStripe(publishableKey));
  }
  return stripePromiseCache.get(publishableKey)!;
}

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
  isTestMode: boolean;
  returnUrl: string;
  onSuccess: (paymentIntentId: string) => void;
  onError: (message: string) => void;
}

function CheckoutForm({ amount, isTestMode, returnUrl, onSuccess, onError }: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    // Fix 5: Clear any previous error so retries start with a clean slate
    onError("");

    setIsProcessing(true);

    // Fix 1: Track whether onSuccess was called. If it was, the parent will
    // unmount this component (navigation). Calling setIsProcessing(false) after
    // unmounting causes a "state update on unmounted component" crash. When
    // succeeded=true, leave isProcessing=true — the button stays in "Processing…"
    // state until the component naturally unmounts.
    let succeeded = false;
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
        confirmParams: {
          // Fix 3: Use the caller-supplied returnUrl so 3DS/bank redirects land
          // on the confirmation page, not back on the booking form.
          return_url: returnUrl,
        },
      });

      if (error) {
        onError(error.message || "Payment failed. Please try again.");
      } else if (paymentIntent?.status === "succeeded") {
        // Immediate card capture — confirmed, safe to call onSuccess.
        succeeded = true;
        onSuccess(paymentIntent.id);
      } else if (paymentIntent?.status === "processing") {
        // Fix 2: "processing" ≠ "succeeded". This status means the charge is
        // pending settlement (ACH, SEPA bank transfer, etc.) — money is NOT yet
        // confirmed. The payment_intent.succeeded webhook will fire when it
        // settles and promote the booking from awaiting_payment → pending.
        // We call onSuccess so the confirm endpoint can store the PI ID and the
        // user is navigated to the confirmation page which shows the pending state.
        succeeded = true;
        onSuccess(paymentIntent.id);
      } else {
        onError("Unexpected payment status. Please contact support.");
      }
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      // Fix 1: Only reset isProcessing when we are NOT navigating away.
      if (!succeeded) setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {isTestMode && (
        <div className="rounded-none border border-amber-500/60 bg-amber-500/10 px-4 py-3 text-sm text-amber-300 leading-snug">
          <span className="font-semibold uppercase tracking-wide text-amber-400">Test mode active</span>
          {" "}— use card number <span className="font-mono font-semibold">4242 4242 4242 4242</span>, any future expiry, any CVC.
        </div>
      )}
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
  /** Fix 3: URL the browser should return to after a 3DS / bank-auth redirect.
   *  Pass the booking-confirmation page URL so the user lands there, not back
   *  on the booking form. Falls back to window.location.href if omitted. */
  returnUrl?: string;
  onSuccess: (paymentIntentId: string) => void;
  onError: (message: string) => void;
}

export function StripePaymentForm({
  clientSecret,
  publishableKey,
  amount,
  returnUrl,
  onSuccess,
  onError,
}: StripePaymentFormProps) {
  const stripePromise = getStripePromise(publishableKey);
  const isTestMode = publishableKey.startsWith("pk_test_");
  const resolvedReturnUrl = returnUrl ?? window.location.href;

  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance }}>
      <CheckoutForm
        amount={amount}
        isTestMode={isTestMode}
        returnUrl={resolvedReturnUrl}
        onSuccess={onSuccess}
        onError={onError}
      />
    </Elements>
  );
}
