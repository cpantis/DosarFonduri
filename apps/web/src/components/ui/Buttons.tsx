import { ReactNode, ButtonHTMLAttributes } from "react";

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  icon?: string;
  size?: "sm" | "md";
}

export function BtnPrimary({ children, icon, size = "md", className = "", ...props }: BtnProps) {
  const sizeClasses = size === "sm" ? "text-[12px] px-3 py-1.5" : "text-[13px] px-4 py-2";
  return (
    <button
      {...props}
      className={`bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-sm hover:shadow-blue-600/20 ${sizeClasses} ${className}`}
    >
      {icon && <span className="text-[14px]">{icon}</span>}{children}
    </button>
  );
}

export function BtnSecondary({ children, icon, size = "md", className = "", ...props }: BtnProps) {
  const sizeClasses = size === "sm" ? "text-[12px] px-3 py-1.5" : "text-[13px] px-4 py-2";
  return (
    <button
      {...props}
      className={`bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-700 font-medium rounded-lg transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${sizeClasses} ${className}`}
    >
      {icon && <span className="text-[14px]">{icon}</span>}{children}
    </button>
  );
}

export function BtnDanger({ children, size = "md", className = "", ...props }: Omit<BtnProps, "icon">) {
  const sizeClasses = size === "sm" ? "text-[12px] px-3 py-1.5" : "text-[13px] px-4 py-2";
  return (
    <button
      {...props}
      className={`text-red-600 bg-white border border-red-200 hover:bg-red-50 hover:border-red-300 font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${sizeClasses} ${className}`}
    >
      {children}
    </button>
  );
}
