"use client";
import { Component, ReactNode } from "react";

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return this.props.fallback || (
        <div className="flex items-center justify-center h-full">
          <div className="text-center p-8">
            <div className="text-4xl mb-4">&#9888;&#65039;</div>
            <h2 className="text-lg font-bold mb-2" style={{ color: "var(--text-primary)" }}>Ceva nu a mers bine</h2>
            <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>{this.state.error.message}</p>
            <button
              onClick={() => this.setState({ error: null })}
              className="px-4 py-2 rounded-lg text-white font-semibold"
              style={{ background: "var(--accent-blue)" }}
            >
              Încearcă din nou
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
