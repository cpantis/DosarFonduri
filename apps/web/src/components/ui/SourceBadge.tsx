interface SourceBadgeProps {
  source?: string | null;
}

const map: Record<string, string> = {
  ONRC: "bg-blue-50 text-blue-700 border-blue-200",
  onrc_auto: "bg-blue-50 text-blue-700 border-blue-200",
  ANAF: "bg-indigo-50 text-indigo-700 border-indigo-200",
  anaf_auto: "bg-indigo-50 text-indigo-700 border-indigo-200",
  Solomon: "bg-violet-50 text-violet-700 border-violet-200",
  solomon_chat: "bg-violet-50 text-violet-700 border-violet-200",
  Document: "bg-amber-50 text-amber-700 border-amber-200",
  document_extracted: "bg-amber-50 text-amber-700 border-amber-200",
  Calculat: "bg-slate-100 text-slate-600 border-slate-200",
  derived: "bg-slate-100 text-slate-600 border-slate-200",
  Manual: "bg-slate-100 text-slate-600 border-slate-200",
  consultant_manual: "bg-slate-100 text-slate-600 border-slate-200",
};

const labels: Record<string, string> = {
  onrc_auto: "ONRC",
  anaf_auto: "ANAF",
  solomon_chat: "Solomon",
  document_extracted: "Document",
  derived: "Calculat",
  consultant_manual: "Manual",
};

export function SourceBadge({ source }: SourceBadgeProps) {
  if (!source) return null;
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${map[source] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
      {labels[source] || source}
    </span>
  );
}
