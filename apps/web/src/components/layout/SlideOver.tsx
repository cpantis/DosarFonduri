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
      />
      {/* Panel */}
      <div
        className="fixed top-0 right-0 h-full z-50 border-l border-slate-200 shadow-2xl transition-transform overflow-y-auto bg-white"
        style={{
          width,
          maxWidth: "90vw",
        }}
      >
        {title && (
          <div className="flex items-center gap-3 p-4 border-b border-slate-200">
            <button
              onClick={onClose}
              className="transition-colors text-slate-400 hover:text-slate-900"
            >
              &#8592;
            </button>
            <h3 className="font-bold text-slate-900">{title}</h3>
          </div>
        )}
        {children}
      </div>
    </>
  );
}
