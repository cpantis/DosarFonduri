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

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title || "Panel"}
        className="fixed top-0 right-0 h-full z-50 shadow-2xl transition-transform overflow-y-auto"
        style={{
          width,
          maxWidth: "90vw",
          background: "#ffffff",
          borderLeft: "1px solid #e2e8f0",
        }}
      >
        {title && (
          <div className="flex items-center gap-3 p-4" style={{ borderBottom: "1px solid #e2e8f0" }}>
            <button
              onClick={onClose}
              className="transition-colors cursor-pointer border-none bg-transparent"
              style={{ color: "#64748b" }}
            >
              &#8592;
            </button>
            <h3 className="font-bold" style={{ color: "#0f172a" }}>{title}</h3>
          </div>
        )}
        {children}
      </div>
    </>
  );
}
