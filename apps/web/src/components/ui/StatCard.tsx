interface StatCardProps {
  icon: string;
  label: string;
  value: number | string;
  color?: "blue" | "amber" | "emerald" | "red" | "purple";
  trend?: { value: string; up?: boolean };
}

const iconColorMap: Record<string, { bg: string; ring: string }> = {
  blue:    { bg: "bg-blue-50",    ring: "ring-blue-200/60" },
  amber:   { bg: "bg-amber-50",   ring: "ring-amber-200/60" },
  emerald: { bg: "bg-emerald-50", ring: "ring-emerald-200/60" },
  red:     { bg: "bg-red-50",     ring: "ring-red-200/60" },
  purple:  { bg: "bg-purple-50",  ring: "ring-purple-200/60" },
};

export function StatCard({ icon, label, value, color = "blue", trend }: StatCardProps) {
  const ic = iconColorMap[color] || iconColorMap.blue;

  return (
    <div className="bg-white rounded-[12px] border border-slate-200/70 p-5 hover:border-slate-300 transition-all group">
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl ${ic.bg} ring-1 ${ic.ring} flex items-center justify-center text-[18px]`}>{icon}</div>
        {trend && (
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${trend.up ? "text-emerald-600 bg-emerald-50" : "text-red-600 bg-red-50"}`}>
            {trend.up ? "\u2191" : "\u2193"} {trend.value}
          </span>
        )}
      </div>
      <div className="mt-3">
        <div className="text-[28px] font-bold text-slate-900 tracking-tight tabular-nums leading-none">{value}</div>
        <div className="text-[13px] text-slate-500 mt-1 font-medium">{label}</div>
      </div>
    </div>
  );
}
