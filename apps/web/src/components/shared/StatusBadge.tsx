"use client";

const STATUS_STYLES: Record<string, string> = {
  "funcțiune": "bg-emerald-50 text-emerald-700 border border-emerald-200",
  "functiune": "bg-emerald-50 text-emerald-700 border border-emerald-200",
  "active": "bg-emerald-50 text-emerald-700 border border-emerald-200",
  "activ": "bg-emerald-50 text-emerald-700 border border-emerald-200",
  "radiată": "bg-red-50 text-red-700 border border-red-200",
  "radiata": "bg-red-50 text-red-700 border border-red-200",
  "dizolvată": "bg-red-50 text-red-700 border border-red-200",
  "dizolvata": "bg-red-50 text-red-700 border border-red-200",
  "lichidare": "bg-red-50 text-red-700 border border-red-200",
  "draft": "bg-slate-100 text-slate-600 border border-slate-200",
  "în lucru": "bg-blue-50 text-blue-700 border border-blue-200",
  "in_progress": "bg-blue-50 text-blue-700 border border-blue-200",
  "review": "bg-amber-50 text-amber-700 border border-amber-200",
  "submitted": "bg-indigo-50 text-indigo-700 border border-indigo-200",
  "complet": "bg-emerald-50 text-emerald-700 border border-emerald-200",
  "approved": "bg-emerald-50 text-emerald-700 border border-emerald-200",
  "blocat": "bg-red-50 text-red-700 border border-red-200",
  "rejected": "bg-red-50 text-red-700 border border-red-200",
  "invited": "bg-amber-50 text-amber-700 border border-amber-200",
  "disabled": "bg-slate-100 text-slate-500 border border-slate-200",
};

const STATUS_LABELS: Record<string, string> = {
  "functiune": "Funcțiune",
  "radiata": "Radiată",
  "dizolvata": "Dizolvată",
  "in_progress": "În lucru",
  "draft": "Ciornă",
  "review": "Revizuire",
  "submitted": "Depus",
  "approved": "Aprobat",
  "rejected": "Respins",
  "active": "Activ",
};

interface StatusBadgeProps {
  status: string;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className = "" }: StatusBadgeProps) {
  const key = status.toLowerCase();
  const style = STATUS_STYLES[key] || "bg-slate-100 text-slate-600 border border-slate-200";
  const displayLabel = label || STATUS_LABELS[key] || status;
  return (
    <span className={`inline-flex items-center text-[11px] font-medium px-2.5 py-0.5 rounded-full ${style} ${className}`}>
      {displayLabel}
    </span>
  );
}
