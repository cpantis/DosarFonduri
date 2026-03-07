"use client";
import { createContext, useContext, useState, useCallback, ReactNode } from "react";

type ToastType = "success" | "error" | "warning" | "info";
interface Toast { id: string; type: ToastType; message: string }

const ToastContext = createContext<{
  toast: (type: ToastType, message: string) => void;
}>({ toast: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((type: ToastType, message: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const colors: Record<ToastType, string> = {
    success: "var(--accent-green)",
    error: "var(--accent-red)",
    warning: "var(--accent-yellow)",
    info: "var(--accent-blue)",
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2">
        {toasts.map(t => (
          <div key={t.id} className="px-4 py-3 rounded-lg border shadow-lg text-sm font-medium"
            style={{
              background: "var(--bg-surface)",
              borderColor: colors[t.type],
              color: "var(--text-primary)",
              borderLeft: `3px solid ${colors[t.type]}`,
              animation: "slideUp .2s ease-out",
            }}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
