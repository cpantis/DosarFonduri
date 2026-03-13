import { ReactNode } from "react";

interface InfoCardProps {
  label: string;
  value?: string | null;
  span?: 1 | 2 | 3 | 4;
  accent?: boolean;
  muted?: boolean;
  mono?: boolean;
  children?: ReactNode;
}

export function InfoCard({ label, value, span = 1, accent = false, muted = false, mono = false, children }: InfoCardProps) {
  const spanClass = span === 2 ? "col-span-2" : span === 3 ? "col-span-3" : span === 4 ? "col-span-4" : "";
  return (
    <div className={`${spanClass} rounded-xl border border-slate-200/80 p-4 ${accent ? "border-l-[3px] border-l-blue-500 bg-blue-50/30" : "bg-white"}`}>
      <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-1">{label}</div>
      {children || (
        <div className={`text-[15px] font-semibold leading-snug ${mono ? "font-mono" : ""} ${value ? (muted ? "text-slate-500" : "text-slate-900") : "text-slate-300"}`}>
          {value || "—"}
        </div>
      )}
    </div>
  );
}
