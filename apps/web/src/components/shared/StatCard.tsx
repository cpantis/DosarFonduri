"use client";

const COLOR_MAP: Record<string, string> = {
  blue: "bg-blue-100 text-blue-600",
  amber: "bg-amber-100 text-amber-600",
  emerald: "bg-emerald-100 text-emerald-600",
  red: "bg-red-100 text-red-600",
  purple: "bg-purple-100 text-purple-600",
  indigo: "bg-indigo-100 text-indigo-600",
};

interface StatCardProps {
  icon: string;
  label: string;
  value: number | string;
  color?: string;
}

export function StatCard({ icon, label, value, color = "blue" }: StatCardProps) {
  const iconStyle = COLOR_MAP[color] || COLOR_MAP.blue;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${iconStyle}`}>
        {icon}
      </div>
      <div className="text-4xl font-bold text-slate-900 mt-3">{value}</div>
      <div className="text-sm text-slate-500 mt-1">{label}</div>
    </div>
  );
}
