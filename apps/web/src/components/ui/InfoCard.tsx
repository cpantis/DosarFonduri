import { ReactNode } from "react";

interface InfoCardProps {
  label: string;
  value?: string | null;
  span?: 1 | 2 | 3 | 4;
  accent?: boolean;
  muted?: boolean;
  children?: ReactNode;
}

export function InfoCard({ label, value, span = 1, accent = false, muted = false, children }: InfoCardProps) {
  const spanClass = span === 2 ? "col-span-2" : span === 3 ? "col-span-3" : span === 4 ? "col-span-4" : "";
  return (
    <div className={`${spanClass} bg-white rounded-xl border ${accent ? "border-l-4 border-l-blue-500" : ""} border-slate-200 p-5`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-400 font-medium mb-1.5">{label}</div>
      {children || (
        <div className={`text-[15px] font-semibold ${value ? (muted ? "text-slate-500" : "text-slate-900") : "text-slate-300 italic"}`}>
          {value || "—"}
        </div>
      )}
    </div>
  );
}
