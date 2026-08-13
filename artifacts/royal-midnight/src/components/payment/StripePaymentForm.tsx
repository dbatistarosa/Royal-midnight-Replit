import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Loader2, Lock } from "lucide-react";

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
  onProcessing?: (paymentIntentId: string) => void;
  onError: (message: string) => void;
}

function CheckoutForm({ amount, isTestMode, returnUrl, onSuccess, onProcessing, onError }: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [stripeReady, setStripeReady] = useState(false);
  // When Stripe fails to initialise — blocked script, malformed publishable key,
  // a client_secret from a different account/mode, or a CSP that forbids
  // js.stripe.com — PaymentElement simply never fires onReady. The form used to
  // sit on "Loading payment form…" forever with nothing in the UI to act on.
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (stripeReady || loadError) return;
    const t = setTimeout(() => {
      setLoadError(
        "The payment form could not load. This is usually a browser extension or ad-blocker blocking Stripe. " +
        "Try again in a private window, or use the payment link we email you."
      );
    }, 12_000);
    return () => clearTimeout(t);
  }, [stripeReady, loadError]);

  const handlePayClick = async () => {
    if (!stripe || !elements) return;

    onError("");
    setPendingMessage(null);
    setIsProcessing(true);

    let navigating = false;
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
        confirmParams: {
          return_url: returnUrl,
        },
      });

      if (error) {
        // In test mode, append a helpful hint so the user knows to use test card numbers
        const hint = isTestMode && (error.code === "card_declined" || error.type === "card_error")
          ? " (Test mode: use card 4242 4242 4242 4242, any future expiry, any CVC)"
          : "";
        onError((error.message || "Payment failed. Please try again.") + hint);
      } else if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "requires_capture") {
        // "succeeded" = immediate capture; "requires_capture" = manual-capture authorization hold
        // Both are success states — the card was validated and a hold placed.
        navigating = true;
        onSuccess(paymentIntent.id);
      } else if (paymentIntent?.status === "processing") {
        if (onProcessing) {
          navigating = true;
          onProcessing(paymentIntent.id);
        } else {
          setPendingMessage(
            "Your payment is being processed. We'll confirm your booking by email once payment clears."
          );
        }
      } else {
        onError("Unexpected payment status. Please contact support.");
      }
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      if (!navigating) setIsProcessing(false);
    }
  };

  if (pendingMessage) {
    return (
      <div className="flex items-start gap-3 rounded-none border border-primary/30 bg-primary/5 p-4 text-sm text-primary/90 leading-relaxed">
        <Loader2 className="w-4 h-4 animate-spin mt-0.5 shrink-0" />
        <span>{pendingMessage}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isTestMode && (
        <div className="rounded-none border border-amber-500/60 bg-amber-500/10 px-4 py-3 text-sm text-amber-300 leading-snug">
          <span className="font-semibold uppercase tracking-wide text-amber-400">Test mode active</span>
          {" "}— use card number <span className="font-mono font-semibold">4242 4242 4242 4242</span>, any future expiry, any CVC.
        </div>
      )}
      {loadError && (
        <div className="rounded-none border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300 leading-relaxed">
          {loadError}
        </div>
      )}
      {!stripeReady && !loadError && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading payment form…
        </div>
      )}
      <PaymentElement
        onReady={() => { setStripeReady(true); setLoadError(null); }}
        onLoadError={(e) => {
          console.error("[payment] PaymentElement failed to load:", e.error);
          setLoadError(e.error?.message || "The payment form could not load. Please refresh and try again.");
        }}
      />
      <div className="flex items-center justify-between pt-4 border-t border-white/10">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="w-3.5 h-3.5" />
          Secured by Stripe
        </div>
        <Button
          type="button"
          onClick={handlePayClick}
          disabled={!stripe || !stripeReady || isProcessing}
          className="bg-primary text-black hover:bg-primary/90 font-medium uppercase tracking-widest text-sm px-10 py-6 rounded-none"
        >
          {isProcessing ? (
            <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Processing...</>
          ) : !stripeReady ? (
            <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…</>
          ) : (
            `Pay $${amount.toFixed(2)}`
          )}
        </Button>
      </div>
    </div>
  );
}

interface StripePaymentFormProps {
  clientSecret: string;
  publishableKey: string;
  amount: number;
  returnUrl?: string;
  onSuccess: (paymentIntentId: string) => void;
  onProcessing?: (paymentIntentId: string) => void;
  onError: (message: string) => void;
}

export function StripePaymentForm({
  clientSecret,
  publishableKey,
  amount,
  returnUrl,
  onSuccess,
  onProcessing,
  onError,
}: StripePaymentFormProps) {
  const stripePromise = getStripePromise(publishableKey);
  const isTestMode = publishableKey.startsWith("pk_test_");
  const resolvedReturnUrl = returnUrl ?? window.location.href;
  const [scriptBlocked, setScriptBlocked] = useState(false);

  // loadStripe resolves to null when js.stripe.com could not be fetched at all.
  // Elements renders nothing in that case, so catch it here rather than letting
  // the inner spinner run out its timeout.
  useEffect(() => {
    let alive = true;
    void stripePromise.then(s => { if (alive && !s) setScriptBlocked(true); }).catch(() => { if (alive) setScriptBlocked(true); });
    return () => { alive = false; };
  }, [stripePromise]);

  if (scriptBlocked) {
    return (
      <div className="rounded-none border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300 leading-relaxed">
        Stripe could not be reached, so the card form cannot be shown. An ad-blocker or privacy extension is the
        usual cause. Try a private window, or ask us to email you a payment link instead.
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance }}>
      <CheckoutForm
        amount={amount}
        isTestMode={isTestMode}
        returnUrl={resolvedReturnUrl}
        onSuccess={onSuccess}
        onProcessing={onProcessing}
        onError={onError}
      />
    </Elements>
  );
}
