interface StatusBadgeProps {
  status?: string | null;
  label?: string;
  size?: "sm" | "md";
}

const map: Record<string, { cls: string; dot: string }> = {
  "funcțiune":   { cls: "bg-emerald-50 text-emerald-700 border-emerald-200/60", dot: "bg-emerald-500" },
  "functiune":   { cls: "bg-emerald-50 text-emerald-700 border-emerald-200/60", dot: "bg-emerald-500" },
  "active":      { cls: "bg-emerald-50 text-emerald-700 border-emerald-200/60", dot: "bg-emerald-500" },
  "activ":       { cls: "bg-emerald-50 text-emerald-700 border-emerald-200/60", dot: "bg-emerald-500" },
  "complet":     { cls: "bg-emerald-50 text-emerald-700 border-emerald-200/60", dot: "bg-emerald-500" },
  "approved":    { cls: "bg-emerald-50 text-emerald-700 border-emerald-200/60", dot: "bg-emerald-500" },
  "radiată":     { cls: "bg-red-50 text-red-700 border-red-200/60", dot: "bg-red-500" },
  "radiata":     { cls: "bg-red-50 text-red-700 border-red-200/60", dot: "bg-red-500" },
  "blocat":      { cls: "bg-red-50 text-red-700 border-red-200/60", dot: "bg-red-500" },
  "rejected":    { cls: "bg-red-50 text-red-700 border-red-200/60", dot: "bg-red-500" },
  "suspendată":  { cls: "bg-amber-50 text-amber-700 border-amber-200/60", dot: "bg-amber-500" },
  "review":      { cls: "bg-amber-50 text-amber-700 border-amber-200/60", dot: "bg-amber-500" },
  "invited":     { cls: "bg-amber-50 text-amber-700 border-amber-200/60", dot: "bg-amber-500" },
  "în lucru":    { cls: "bg-blue-50 text-blue-700 border-blue-200/60", dot: "bg-blue-500" },
  "in_progress": { cls: "bg-blue-50 text-blue-700 border-blue-200/60", dot: "bg-blue-500" },
  "submitted":   { cls: "bg-blue-50 text-blue-700 border-blue-200/60", dot: "bg-blue-500" },
  "ciornă":      { cls: "bg-slate-50 text-slate-600 border-slate-200/60", dot: "bg-slate-400" },
  "draft":       { cls: "bg-slate-50 text-slate-600 border-slate-200/60", dot: "bg-slate-400" },
};

const fallback = { cls: "bg-slate-50 text-slate-600 border-slate-200/60", dot: "bg-slate-400" };

export function StatusBadge({ status, label, size = "sm" }: StatusBadgeProps) {
  const s = map[status?.toLowerCase() ?? ""] || fallback;
  const sizeClasses = size === "md" ? "text-[12px] px-3 py-1" : "text-[11px] px-2.5 py-0.5";
  return (
    <span className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${sizeClasses} ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {label || status}
    </span>
  );
}
