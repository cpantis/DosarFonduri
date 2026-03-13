"use client";

const COLOR_MAP: Record<string, { bg: string; text: string }> = {
  blue: { bg: "var(--accent-blue-bg)", text: "var(--accent-blue)" },
  amber: { bg: "var(--accent-yellow-bg)", text: "var(--accent-yellow)" },
  emerald: { bg: "var(--accent-green-bg)", text: "var(--accent-green)" },
  red: { bg: "var(--accent-red-bg)", text: "var(--accent-red)" },
  purple: { bg: "var(--accent-purple-bg)", text: "var(--accent-purple)" },
  indigo: { bg: "var(--accent-blue-bg)", text: "var(--accent-blue)" },
};

interface StatCardProps {
  icon: string;
  label: string;
  value: number | string;
  color?: string;
}

export function StatCard({ icon, label, value, color = "blue" }: StatCardProps) {
  const c = COLOR_MAP[color] || COLOR_MAP.blue;
  return (
    <div
      className="rounded-xl p-6 transition-shadow hover:shadow-sm"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl" style={{ background: c.bg, color: c.text }}>
          {icon}
        </div>
      </div>
      <div className="text-[36px] font-bold leading-none" style={{ color: "var(--text-primary)" }}>{value}</div>
      <div className="text-[14px] mt-2 font-medium" style={{ color: "var(--text-secondary)" }}>{label}</div>
    </div>
  );
}
