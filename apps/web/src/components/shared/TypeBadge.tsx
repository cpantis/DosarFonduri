"use client";

const TYPE_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  srl: { bg: "var(--accent-blue-bg)", color: "var(--accent-blue)", border: "var(--accent-blue-border)" },
  pfa: { bg: "var(--accent-purple-bg)", color: "var(--accent-purple)", border: "var(--accent-purple-border)" },
  sa: { bg: "var(--accent-blue-bg)", color: "var(--accent-blue)", border: "var(--accent-blue-border)" },
  ii: { bg: "var(--accent-green-bg)", color: "var(--accent-green)", border: "var(--accent-green-border)" },
  if: { bg: "var(--accent-green-bg)", color: "var(--accent-green)", border: "var(--accent-green-border)" },
  snc: { bg: "var(--accent-blue-bg)", color: "var(--accent-blue)", border: "var(--accent-blue-border)" },
  scs: { bg: "var(--accent-blue-bg)", color: "var(--accent-blue)", border: "var(--accent-blue-border)" },
  sca: { bg: "var(--accent-blue-bg)", color: "var(--accent-blue)", border: "var(--accent-blue-border)" },
  sc: { bg: "var(--bg-elevated)", color: "var(--text-secondary)", border: "var(--border)" },
  ra: { bg: "var(--accent-orange-bg)", color: "var(--accent-orange)", border: "var(--accent-orange-border)" },
  sa_bvb: { bg: "var(--accent-blue-bg)", color: "var(--accent-blue)", border: "var(--accent-blue-border)" },
};

const DEFAULT_STYLE = { bg: "var(--bg-elevated)", color: "var(--text-secondary)", border: "var(--border)" };

interface TypeBadgeProps {
  type: string;
  className?: string;
}

export function TypeBadge({ type, className = "" }: TypeBadgeProps) {
  const key = type.toLowerCase();
  const s = TYPE_STYLES[key] || DEFAULT_STYLE;
  return (
    <span
      className={`inline-flex items-center text-[12px] font-semibold px-3 py-1 rounded-full ${className}`}
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {type.toUpperCase()}
    </span>
  );
}
