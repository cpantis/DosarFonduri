"use client";

const TYPE_STYLES: Record<string, string> = {
  srl: "bg-blue-50 text-blue-700 border-blue-200",
  pfa: "bg-purple-50 text-purple-700 border-purple-200",
  sa: "bg-indigo-50 text-indigo-700 border-indigo-200",
  ii: "bg-teal-50 text-teal-700 border-teal-200",
  if: "bg-teal-50 text-teal-700 border-teal-200",
  snc: "bg-cyan-50 text-cyan-700 border-cyan-200",
  scs: "bg-cyan-50 text-cyan-700 border-cyan-200",
  sca: "bg-cyan-50 text-cyan-700 border-cyan-200",
  sc: "bg-slate-100 text-slate-700 border-slate-200",
  ra: "bg-orange-50 text-orange-700 border-orange-200",
  sa_bvb: "bg-indigo-50 text-indigo-700 border-indigo-200",
};

interface TypeBadgeProps {
  type: string;
  className?: string;
}

export function TypeBadge({ type, className = "" }: TypeBadgeProps) {
  const key = type.toLowerCase();
  const style = TYPE_STYLES[key] || "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span className={`inline-flex items-center text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${style} ${className}`}>
      {type.toUpperCase()}
    </span>
  );
}
