interface RuleBadgeProps {
  code: string;
}

export function RuleBadge({ code }: RuleBadgeProps) {
  const color = code.startsWith("EG") ? "bg-red-50 text-red-600 border-red-200" : code.startsWith("CS") ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-blue-50 text-blue-600 border-blue-200";
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${color}`}>{code}</span>;
}
