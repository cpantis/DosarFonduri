"use client";
import { Component, ReactNode } from "react";

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { error: Error | null; retryCount: number }

const MAX_RETRIES = 3;

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, retryCount: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error.message, errorInfo.componentStack);
  }

  handleRetry = () => {
    this.setState(prev => ({ error: null, retryCount: prev.retryCount + 1 }));
  };

  render() {
    if (this.state.error) {
      const canRetry = this.state.retryCount < MAX_RETRIES;
      return this.props.fallback || (
        <div className="flex items-center justify-center h-full">
          <div className="text-center p-8">
            <div className="text-4xl mb-4">&#9888;&#65039;</div>
            <h2 className="text-lg font-bold mb-2" style={{ color: "var(--text-primary)" }}>Ceva nu a mers bine</h2>
            <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>{this.state.error.message}</p>
            {canRetry ? (
              <button
                onClick={this.handleRetry}
                className="px-4 py-2 rounded-lg text-white font-semibold border-none cursor-pointer"
                style={{ background: "var(--accent-blue)" }}
              >
                Încearcă din nou ({MAX_RETRIES - this.state.retryCount} incercari ramase)
              </button>
            ) : (
              <p className="text-sm" style={{ color: "var(--accent-red)" }}>
                Eroare persistenta. Reincarca pagina.
              </p>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
