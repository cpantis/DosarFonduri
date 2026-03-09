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
    success: "var(--accent-green)",
    error: "var(--accent-red)",
    warning: "var(--accent-yellow)",
    info: "var(--accent-blue)",
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className="px-4 py-3 rounded-lg border shadow-lg text-sm font-medium"
            style={{
              background: "var(--bg-surface)",
              borderColor: colors[t.type],
              color: "var(--text-primary)",
              borderLeft: `3px solid ${colors[t.type]}`,
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
