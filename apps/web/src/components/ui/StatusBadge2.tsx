/** Badge for company/project status with consistent design tokens */
const STATUS_STYLES: Record<string, string> = {
  // Company status
  functiune: "bg-emerald-50 text-emerald-700 border-emerald-200",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  radiata: "bg-red-50 text-red-700 border-red-200",
  dizolvata: "bg-red-50 text-red-700 border-red-200",
  lichidare: "bg-amber-50 text-amber-700 border-amber-200",
  // Forma juridica
  srl: "bg-blue-50 text-blue-700 border-blue-200",
  sa: "bg-blue-50 text-blue-700 border-blue-200",
  pfa: "bg-purple-50 text-purple-700 border-purple-200",
  ii: "bg-purple-50 text-purple-700 border-purple-200",
  if: "bg-purple-50 text-purple-700 border-purple-200",
  // Project status
  draft: "bg-slate-100 text-slate-600 border-slate-200",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  progress: "bg-blue-50 text-blue-700 border-blue-200",
  review: "bg-amber-50 text-amber-700 border-amber-200",
  submitted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  complet: "bg-emerald-50 text-emerald-700 border-emerald-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  blocat: "bg-red-50 text-red-700 border-red-200",
  // Document status
  uploaded: "bg-slate-100 text-slate-600 border-slate-200",
  processing: "bg-blue-50 text-blue-700 border-blue-200",
  processed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  error: "bg-red-50 text-red-700 border-red-200",
  failed: "bg-red-50 text-red-700 border-red-200",
};

export function StatusBadge2({ status, label, className = "" }: { status: string; label?: string; className?: string }) {
  const key = status.toLowerCase().replace(/\s+/g, "_");
  const style = STATUS_STYLES[key] || "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${style} ${className}`}>
      {label || status}
    </span>
  );
}
