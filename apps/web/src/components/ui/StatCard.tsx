interface StatCardProps {
  icon: string;
  label: string;
  value: number | string;
  color?: "blue" | "amber" | "emerald" | "red" | "purple";
  trend?: { value: string; up?: boolean };
}

export function StatCard({ icon, label, value, color = "blue", trend }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-[0_1px_3px_rgba(0,0,0,.04),0_1px_2px_rgba(0,0,0,.06)] hover:shadow-[0_4px_12px_rgba(0,0,0,.06),0_1px_3px_rgba(0,0,0,.04)] hover:border-slate-300/80 transition-all group">
      <div className="flex items-start justify-between">
        <div className="w-10 h-10 rounded-xl bg-slate-50 ring-1 ring-slate-200/60 flex items-center justify-center text-[18px]" style={{ filter: "grayscale(1) opacity(0.55)" }}>{icon}</div>
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
