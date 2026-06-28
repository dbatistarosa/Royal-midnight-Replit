import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Sentry } from "@/lib/sentry";

type Props = { children: ReactNode };
type State = { hasError: boolean };

// React error boundaries must be class components — there is no hook equivalent.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <div className="w-14 h-14 border border-red-900/30 bg-red-900/10 flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-7 h-7 text-red-500" />
          </div>
          <h2 className="text-2xl font-serif text-white mb-3">Something Went Wrong</h2>
          <p className="text-gray-400 text-sm leading-relaxed mb-6">
            We hit an unexpected error on this page. Please try reloading — if the problem
            continues, contact support@royalmidnight.com.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-primary text-black px-6 py-2.5 text-xs uppercase tracking-widest font-medium"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }
}
