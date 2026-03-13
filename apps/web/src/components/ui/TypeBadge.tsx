interface TypeBadgeProps {
  type: string;
}

const map: Record<string, string> = {
  SRL: "bg-blue-50 text-blue-700 border-blue-200",
  SA: "bg-indigo-50 text-indigo-700 border-indigo-200",
  PFA: "bg-purple-50 text-purple-700 border-purple-200",
  II: "bg-teal-50 text-teal-700 border-teal-200",
  IF: "bg-cyan-50 text-cyan-700 border-cyan-200",
};

export function TypeBadge({ type }: TypeBadgeProps) {
  return (
    <span className={`inline-flex items-center text-[11px] font-bold px-2.5 py-0.5 rounded-md border ${map[type] || "bg-slate-50 text-slate-600 border-slate-200"}`}>
      {type}
    </span>
  );
}
