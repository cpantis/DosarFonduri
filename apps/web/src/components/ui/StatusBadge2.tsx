/** Badge for company/project status with design tokens */
const STATUS_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  functiune: { bg: "var(--accent-green-bg)", color: "var(--accent-green)", border: "var(--accent-green-border)" },
  active: { bg: "var(--accent-green-bg)", color: "var(--accent-green)", border: "var(--accent-green-border)" },
  radiata: { bg: "var(--accent-red-bg)", color: "var(--accent-red)", border: "var(--accent-red-border)" },
  dizolvata: { bg: "var(--accent-red-bg)", color: "var(--accent-red)", border: "var(--accent-red-border)" },
  lichidare: { bg: "var(--accent-yellow-bg)", color: "var(--accent-yellow)", border: "var(--accent-yellow-border)" },
  srl: { bg: "var(--accent-blue-bg)", color: "var(--accent-blue)", border: "var(--accent-blue-border)" },
  sa: { bg: "var(--accent-blue-bg)", color: "var(--accent-blue)", border: "var(--accent-blue-border)" },
  pfa: { bg: "var(--accent-purple-bg)", color: "var(--accent-purple)", border: "var(--accent-purple-border)" },
  ii: { bg: "var(--accent-purple-bg)", color: "var(--accent-purple)", border: "var(--accent-purple-border)" },
  if: { bg: "var(--accent-purple-bg)", color: "var(--accent-purple)", border: "var(--accent-purple-border)" },
  draft: { bg: "var(--bg-elevated)", color: "var(--text-secondary)", border: "var(--border)" },
  in_progress: { bg: "var(--accent-blue-bg)", color: "var(--accent-blue)", border: "var(--accent-blue-border)" },
  progress: { bg: "var(--accent-blue-bg)", color: "var(--accent-blue)", border: "var(--accent-blue-border)" },
  review: { bg: "var(--accent-yellow-bg)", color: "var(--accent-yellow)", border: "var(--accent-yellow-border)" },
  submitted: { bg: "var(--accent-green-bg)", color: "var(--accent-green)", border: "var(--accent-green-border)" },
  complet: { bg: "var(--accent-green-bg)", color: "var(--accent-green)", border: "var(--accent-green-border)" },
  approved: { bg: "var(--accent-green-bg)", color: "var(--accent-green)", border: "var(--accent-green-border)" },
  rejected: { bg: "var(--accent-red-bg)", color: "var(--accent-red)", border: "var(--accent-red-border)" },
  blocat: { bg: "var(--accent-red-bg)", color: "var(--accent-red)", border: "var(--accent-red-border)" },
  uploaded: { bg: "var(--bg-elevated)", color: "var(--text-secondary)", border: "var(--border)" },
  processing: { bg: "var(--accent-blue-bg)", color: "var(--accent-blue)", border: "var(--accent-blue-border)" },
  processed: { bg: "var(--accent-green-bg)", color: "var(--accent-green)", border: "var(--accent-green-border)" },
  error: { bg: "var(--accent-red-bg)", color: "var(--accent-red)", border: "var(--accent-red-border)" },
  failed: { bg: "var(--accent-red-bg)", color: "var(--accent-red)", border: "var(--accent-red-border)" },
};

const DEFAULT = { bg: "var(--bg-elevated)", color: "var(--text-secondary)", border: "var(--border)" };

export function StatusBadge2({ status, label, className = "" }: { status: string; label?: string; className?: string }) {
  const key = status.toLowerCase().replace(/\s+/g, "_");
  const s = STATUS_STYLES[key] || DEFAULT;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${className}`}
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {label || status}
    </span>
  );
}
