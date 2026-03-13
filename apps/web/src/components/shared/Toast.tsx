"use client";
import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";

type ToastType = "success" | "error" | "warning" | "info";
interface Toast { id: string; type: ToastType; message: string; dismissing?: boolean }

const ToastContext = createContext<{
  toast: (type: ToastType, message: string) => void;
}>({ toast: () => {} });

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

  const colors: Record<ToastType, string> = {
    success: "#34d399",
    error: "#f87171",
    warning: "#fbbf24",
    info: "#4d8bff",
  };

  const borderClasses: Record<ToastType, string> = {
    success: "border-emerald-500",
    error: "border-red-500",
    warning: "border-amber-500",
    info: "border-blue-500",
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className="px-4 py-3 rounded-lg text-sm font-medium"
            style={{
              background: "#ffffff",
              color: "#0f172a",
              border: `1px solid #e2e8f0`,
              borderLeft: `3px solid ${colors[t.type]}`,
              boxShadow: "0 4px 12px rgba(0,0,0,.15)",
              animation: t.dismissing ? "slideDown .2s ease-in forwards" : "slideUp .2s ease-out",
            }}>
            {t.message}
          </div>
        ))}
      </div>
      <style>{`@keyframes slideDown{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(8px)}}`}</style>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
