interface StatCardProps {
  icon: string;
  label: string;
  value: number | string;
  color?: "blue" | "amber" | "emerald" | "red" | "purple";
  trend?: { value: string; up?: boolean };
}

const colors: Record<string, { bg: string; text: string; ring: string }> = {
  blue:    { bg: "bg-blue-50",    text: "text-blue-600",    ring: "ring-blue-100" },
  amber:   { bg: "bg-amber-50",   text: "text-amber-600",   ring: "ring-amber-100" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600", ring: "ring-emerald-100" },
  red:     { bg: "bg-red-50",     text: "text-red-600",     ring: "ring-red-100" },
  purple:  { bg: "bg-purple-50",  text: "text-purple-600",  ring: "ring-purple-100" },
};

export function StatCard({ icon, label, value, color = "blue", trend }: StatCardProps) {
  const c = colors[color] || colors.blue;
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-[0_1px_3px_rgba(0,0,0,.04),0_1px_2px_rgba(0,0,0,.06)] hover:shadow-[0_4px_12px_rgba(0,0,0,.06),0_1px_3px_rgba(0,0,0,.04)] hover:border-slate-300/80 transition-all group">
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl ${c.bg} ${c.text} ring-1 ${c.ring} flex items-center justify-center text-[18px]`}>{icon}</div>
        {trend && (
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${trend.up ? "text-emerald-600 bg-emerald-50" : "text-red-600 bg-red-50"}`}>
            {trend.up ? "↑" : "↓"} {trend.value}
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
