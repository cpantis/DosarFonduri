/** Badge for rule type: EG (eligibilitate), CS (selectie), Anexa */
const RULE_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  eg: { bg: "var(--accent-red-bg)", color: "var(--accent-red)", border: "var(--accent-red-border)" },
  eligibilitate: { bg: "var(--accent-red-bg)", color: "var(--accent-red)", border: "var(--accent-red-border)" },
  fixed: { bg: "var(--accent-red-bg)", color: "var(--accent-red)", border: "var(--accent-red-border)" },
  cs: { bg: "var(--accent-green-bg)", color: "var(--accent-green)", border: "var(--accent-green-border)" },
  selectie: { bg: "var(--accent-green-bg)", color: "var(--accent-green)", border: "var(--accent-green-border)" },
  interpreted: { bg: "var(--accent-green-bg)", color: "var(--accent-green)", border: "var(--accent-green-border)" },
  anexa: { bg: "var(--accent-blue-bg)", color: "var(--accent-blue)", border: "var(--accent-blue-border)" },
};

const RULE_LABELS: Record<string, string> = {
  fixed: "EG",
  interpreted: "CS",
  eg: "EG",
  cs: "CS",
};

const DEFAULT = { bg: "var(--bg-elevated)", color: "var(--text-secondary)", border: "var(--border)" };

export function RuleBadge({ type, className = "" }: { type: string; className?: string }) {
  const key = type.toLowerCase();
  const s = RULE_STYLES[key] || DEFAULT;
  const label = RULE_LABELS[key] || type.toUpperCase();
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${className}`}
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {label}
    </span>
  );
}
