/** Badge for data source: ONRC, ANAF, Solomon, Document, Calculat */
const SOURCE_STYLES: Record<string, string> = {
  onrc: "bg-blue-50 text-blue-700 border-blue-200",
  "date onrc": "bg-blue-50 text-blue-700 border-blue-200",
  onrc_auto: "bg-blue-50 text-blue-700 border-blue-200",
  anaf: "bg-indigo-50 text-indigo-700 border-indigo-200",
  anaf_auto: "bg-indigo-50 text-indigo-700 border-indigo-200",
  solomon: "bg-violet-50 text-violet-700 border-violet-200",
  solomon_chat: "bg-violet-50 text-violet-700 border-violet-200",
  "chat solomon": "bg-violet-50 text-violet-700 border-violet-200",
  document: "bg-amber-50 text-amber-700 border-amber-200",
  document_extracted: "bg-amber-50 text-amber-700 border-amber-200",
  "document uploadat": "bg-amber-50 text-amber-700 border-amber-200",
  calculat: "bg-slate-100 text-slate-600 border-slate-200",
  derived: "bg-slate-100 text-slate-600 border-slate-200",
  consultant_manual: "bg-slate-100 text-slate-600 border-slate-200",
};

const SOURCE_LABELS: Record<string, string> = {
  onrc_auto: "ONRC",
  anaf_auto: "ANAF",
  solomon_chat: "Solomon",
  document_extracted: "Document",
  consultant_manual: "Manual",
  derived: "Calculat",
};

export function SourceBadge({ source, className = "" }: { source: string; className?: string }) {
  const key = source.toLowerCase();
  const style = SOURCE_STYLES[key] || "bg-slate-100 text-slate-600 border-slate-200";
  const label = SOURCE_LABELS[key] || source;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${style} ${className}`}>
      {label}
    </span>
  );
}
