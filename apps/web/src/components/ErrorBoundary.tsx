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
        <div className="flex items-center justify-center min-h-[400px] p-8">
          <div className="text-center max-w-md">
            <div className="w-14 h-14 mx-auto mb-5 flex items-center justify-center text-2xl rounded-2xl bg-red-50 border border-red-200">
              ⚠️
            </div>
            <h2 className="text-[18px] font-bold text-slate-900 mb-1.5">Ceva nu a mers bine</h2>
            <p className="text-[13px] text-slate-500 mb-5 leading-relaxed">{this.state.error.message}</p>
            {canRetry ? (
              <button
                onClick={this.handleRetry}
                className="bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium px-5 py-2.5 rounded-lg transition-all hover:shadow-sm"
              >
                Încearcă din nou ({MAX_RETRIES - this.state.retryCount} încercări rămase)
              </button>
            ) : (
              <p className="text-[13px] text-red-600 font-medium">
                Eroare persistentă. Reîncarcă pagina.
              </p>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
