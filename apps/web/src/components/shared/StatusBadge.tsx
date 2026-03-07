"use client";

interface StatusBadgeProps {
  label: string;
  color: string;
  bg?: string;
}

export function StatusBadge({ label, color, bg }: StatusBadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-bold"
      style={{
        borderRadius: "12px",
        background: bg || `${color}1f`,
        color,
      }}
    >
      {label}
    </span>
  );
}
