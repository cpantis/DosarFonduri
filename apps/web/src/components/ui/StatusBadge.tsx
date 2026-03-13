interface StatusBadgeProps {
  status?: string | null;
  label?: string;
}

const map: Record<string, string> = {
  "funcțiune": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "functiune": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "active": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "activ": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "radiată": "bg-red-50 text-red-700 border-red-200",
  "radiata": "bg-red-50 text-red-700 border-red-200",
  "suspendată": "bg-amber-50 text-amber-700 border-amber-200",
  "în lucru": "bg-blue-50 text-blue-700 border-blue-200",
  "in_progress": "bg-blue-50 text-blue-700 border-blue-200",
  "complet": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "approved": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "blocat": "bg-red-50 text-red-700 border-red-200",
  "rejected": "bg-red-50 text-red-700 border-red-200",
  "ciornă": "bg-slate-50 text-slate-600 border-slate-200",
  "draft": "bg-slate-50 text-slate-600 border-slate-200",
  "review": "bg-amber-50 text-amber-700 border-amber-200",
  "submitted": "bg-blue-50 text-blue-700 border-blue-200",
  "invited": "bg-amber-50 text-amber-700 border-amber-200",
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-3 py-1 rounded-full border ${map[status?.toLowerCase() ?? ""] || "bg-slate-50 text-slate-600 border-slate-200"}`}>
      {label || status}
    </span>
  );
}
