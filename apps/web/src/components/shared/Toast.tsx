"use client";
import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";

type ToastType = "success" | "error" | "warning" | "info";
interface Toast { id: string; type: ToastType; message: string; dismissing?: boolean }

const ToastContext = createContext<{
  toast: (type: ToastType, message: string) => void;
}>({ toast: () => {} });

const icons: Record<ToastType, string> = {
  success: "✓",
  error: "✕",
  warning: "!",
  info: "i",
};

const borderColors: Record<ToastType, string> = {
  success: "#059669",
  error: "#dc2626",
  warning: "#d97706",
  info: "#2563eb",
};

const bgColors: Record<ToastType, string> = {
  success: "#ecfdf5",
  error: "#fef2f2",
  warning: "#fffbeb",
  info: "#eff6ff",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    return () => {
      timersRef.current.forEach(timer => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, dismissing: true } : t));
    const removeTimer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      timersRef.current.delete(`remove-${id}`);
    }, 200);
    timersRef.current.set(`remove-${id}`, removeTimer);
  }, []);

  const toast = useCallback((type: ToastType, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts(prev => [...prev, { id, type, message }]);
    const timer = setTimeout(() => {
      dismissToast(id);
      timersRef.current.delete(id);
    }, 4000);
    timersRef.current.set(id, timer);
  }, [dismissToast]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2" role="status" aria-live="polite">
        {toasts.map(t => (
          <div
            key={t.id}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-[13px] font-medium bg-white shadow-sm border"
            style={{
              borderColor: "rgba(226,232,240,.8)",
              borderLeftWidth: "3px",
              borderLeftColor: borderColors[t.type],
              animation: t.dismissing ? "slideDown .2s ease-in forwards" : "slideUp .2s ease-out",
            }}
          >
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
              style={{ background: borderColors[t.type] }}
            >
              {icons[t.type]}
            </span>
            <span className="text-slate-900">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
