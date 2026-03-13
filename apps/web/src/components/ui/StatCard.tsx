interface StatCardProps {
  icon: string;
  label: string;
  value: number | string;
  color?: "blue" | "amber" | "emerald" | "red";
}

const colors: Record<string, { bg: string; text: string }> = {
  blue: { bg: "bg-blue-100", text: "text-blue-600" },
  amber: { bg: "bg-amber-100", text: "text-amber-600" },
  emerald: { bg: "bg-emerald-100", text: "text-emerald-600" },
  red: { bg: "bg-red-100", text: "text-red-600" },
};

export function StatCard({ icon, label, value, color = "blue" }: StatCardProps) {
  const c = colors[color] || colors.blue;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-sm transition-shadow">
      <div className={`w-12 h-12 rounded-xl ${c.bg} ${c.text} flex items-center justify-center text-xl`}>{icon}</div>
      <div className="text-4xl font-bold text-slate-900 mt-3 tracking-tight">{value}</div>
      <div className="text-sm text-slate-500 mt-1">{label}</div>
    </div>
  );
}
