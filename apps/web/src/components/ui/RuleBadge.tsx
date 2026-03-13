/** Badge for rule type: EG (eligibilitate), CS (selectie), Anexa */
const RULE_STYLES: Record<string, string> = {
  eg: "bg-red-50 text-red-600 border-red-200",
  eligibilitate: "bg-red-50 text-red-600 border-red-200",
  fixed: "bg-red-50 text-red-600 border-red-200",
  cs: "bg-emerald-50 text-emerald-600 border-emerald-200",
  selectie: "bg-emerald-50 text-emerald-600 border-emerald-200",
  interpreted: "bg-emerald-50 text-emerald-600 border-emerald-200",
  anexa: "bg-blue-50 text-blue-600 border-blue-200",
};

const RULE_LABELS: Record<string, string> = {
  fixed: "EG",
  interpreted: "CS",
  eg: "EG",
  cs: "CS",
};

export function RuleBadge({ type, className = "" }: { type: string; className?: string }) {
  const key = type.toLowerCase();
  const style = RULE_STYLES[key] || "bg-slate-100 text-slate-600 border-slate-200";
  const label = RULE_LABELS[key] || type.toUpperCase();
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${style} ${className}`}>
      {label}
    </span>
  );
}
