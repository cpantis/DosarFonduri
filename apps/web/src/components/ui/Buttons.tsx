import { ReactNode } from "react";

interface BtnProps {
  children: ReactNode;
  onClick?: () => void;
  icon?: string;
}

export function BtnPrimary({ children, onClick, icon }: BtnProps) {
  return (
    <button onClick={onClick} className="bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition-all flex items-center gap-2">
      {icon && <span>{icon}</span>}{children}
    </button>
  );
}

export function BtnSecondary({ children, onClick, icon }: BtnProps) {
  return (
    <button onClick={onClick} className="bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 text-slate-700 text-[13px] font-medium px-4 py-2 rounded-lg transition-all flex items-center gap-2">
      {icon && <span>{icon}</span>}{children}
    </button>
  );
}

export function BtnDanger({ children, onClick }: Omit<BtnProps, "icon">) {
  return (
    <button onClick={onClick} className="text-red-600 border border-red-200 hover:bg-red-50 text-[13px] font-medium px-4 py-2 rounded-lg transition-all">
      {children}
    </button>
  );
}
