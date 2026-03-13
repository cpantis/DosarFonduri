/** Badge for data source: ONRC, ANAF, Solomon, Document, Calculat */
const SOURCE_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  onrc: { bg: "var(--accent-blue-bg)", color: "var(--accent-blue)", border: "var(--accent-blue-border)" },
  "date onrc": { bg: "var(--accent-blue-bg)", color: "var(--accent-blue)", border: "var(--accent-blue-border)" },
  onrc_auto: { bg: "var(--accent-blue-bg)", color: "var(--accent-blue)", border: "var(--accent-blue-border)" },
  anaf: { bg: "var(--accent-purple-bg)", color: "var(--accent-purple)", border: "var(--accent-purple-border)" },
  anaf_auto: { bg: "var(--accent-purple-bg)", color: "var(--accent-purple)", border: "var(--accent-purple-border)" },
  solomon: { bg: "var(--accent-purple-bg)", color: "var(--accent-purple)", border: "var(--accent-purple-border)" },
  solomon_chat: { bg: "var(--accent-purple-bg)", color: "var(--accent-purple)", border: "var(--accent-purple-border)" },
  "chat solomon": { bg: "var(--accent-purple-bg)", color: "var(--accent-purple)", border: "var(--accent-purple-border)" },
  document: { bg: "var(--accent-yellow-bg)", color: "var(--accent-yellow)", border: "var(--accent-yellow-border)" },
  document_extracted: { bg: "var(--accent-yellow-bg)", color: "var(--accent-yellow)", border: "var(--accent-yellow-border)" },
  "document uploadat": { bg: "var(--accent-yellow-bg)", color: "var(--accent-yellow)", border: "var(--accent-yellow-border)" },
  calculat: { bg: "var(--bg-elevated)", color: "var(--text-secondary)", border: "var(--border)" },
  derived: { bg: "var(--bg-elevated)", color: "var(--text-secondary)", border: "var(--border)" },
  consultant_manual: { bg: "var(--bg-elevated)", color: "var(--text-secondary)", border: "var(--border)" },
  manual: { bg: "var(--bg-elevated)", color: "var(--text-secondary)", border: "var(--border)" },
  ghid: { bg: "var(--accent-orange-bg)", color: "var(--accent-orange)", border: "var(--accent-orange-border)" },
};

const SOURCE_LABELS: Record<string, string> = {
  onrc_auto: "ONRC",
  anaf_auto: "ANAF",
  solomon_chat: "Solomon",
  document_extracted: "Document",
  consultant_manual: "Manual",
  derived: "Calculat",
};

const DEFAULT = { bg: "var(--bg-elevated)", color: "var(--text-secondary)", border: "var(--border)" };

export function SourceBadge({ source, className = "" }: { source: string; className?: string }) {
  const key = source.toLowerCase();
  const s = SOURCE_STYLES[key] || DEFAULT;
  const label = SOURCE_LABELS[key] || source;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${className}`}
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {label}
    </span>
  );
}
