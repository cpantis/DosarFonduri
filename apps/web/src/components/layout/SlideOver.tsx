"use client";
import { useEffect } from "react";

interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  width?: string;
  children: React.ReactNode;
}

export function SlideOver({ open, onClose, title, width = "400px", children }: SlideOverProps) {
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className="fixed top-0 right-0 h-full z-50 border-l shadow-2xl transition-transform overflow-y-auto"
        style={{
          width,
          maxWidth: "90vw",
          background: "var(--bg-surface)",
          borderColor: "var(--border)",
        }}
      >
        {title && (
          <div className="flex items-center gap-3 p-4" style={{ borderBottom: "1px solid var(--border)" }}>
            <button
              onClick={onClose}
              className="transition-colors"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
            >
              &#8592;
            </button>
            <h3 className="font-bold" style={{ color: "var(--text-primary)" }}>{title}</h3>
          </div>
        )}
        {children}
      </div>
    </>
  );
}
