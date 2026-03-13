"use client";

const STATUS_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  "funcțiune": { bg: "var(--accent-green-bg)", color: "var(--accent-green)", border: "var(--accent-green-border)" },
  "functiune": { bg: "var(--accent-green-bg)", color: "var(--accent-green)", border: "var(--accent-green-border)" },
  "active": { bg: "var(--accent-green-bg)", color: "var(--accent-green)", border: "var(--accent-green-border)" },
  "activ": { bg: "var(--accent-green-bg)", color: "var(--accent-green)", border: "var(--accent-green-border)" },
  "radiată": { bg: "var(--accent-red-bg)", color: "var(--accent-red)", border: "var(--accent-red-border)" },
  "radiata": { bg: "var(--accent-red-bg)", color: "var(--accent-red)", border: "var(--accent-red-border)" },
  "dizolvată": { bg: "var(--accent-red-bg)", color: "var(--accent-red)", border: "var(--accent-red-border)" },
  "dizolvata": { bg: "var(--accent-red-bg)", color: "var(--accent-red)", border: "var(--accent-red-border)" },
  "lichidare": { bg: "var(--accent-red-bg)", color: "var(--accent-red)", border: "var(--accent-red-border)" },
  "draft": { bg: "var(--bg-elevated)", color: "var(--text-secondary)", border: "var(--border)" },
  "în lucru": { bg: "var(--accent-blue-bg)", color: "var(--accent-blue)", border: "var(--accent-blue-border)" },
  "in_progress": { bg: "var(--accent-blue-bg)", color: "var(--accent-blue)", border: "var(--accent-blue-border)" },
  "review": { bg: "var(--accent-yellow-bg)", color: "var(--accent-yellow)", border: "var(--accent-yellow-border)" },
  "submitted": { bg: "var(--accent-blue-bg)", color: "var(--accent-blue)", border: "var(--accent-blue-border)" },
  "complet": { bg: "var(--accent-green-bg)", color: "var(--accent-green)", border: "var(--accent-green-border)" },
  "approved": { bg: "var(--accent-green-bg)", color: "var(--accent-green)", border: "var(--accent-green-border)" },
  "blocat": { bg: "var(--accent-red-bg)", color: "var(--accent-red)", border: "var(--accent-red-border)" },
  "rejected": { bg: "var(--accent-red-bg)", color: "var(--accent-red)", border: "var(--accent-red-border)" },
  "invited": { bg: "var(--accent-yellow-bg)", color: "var(--accent-yellow)", border: "var(--accent-yellow-border)" },
  "disabled": { bg: "var(--bg-elevated)", color: "var(--text-muted)", border: "var(--border)" },
};

const DEFAULT_STYLE = { bg: "var(--bg-elevated)", color: "var(--text-secondary)", border: "var(--border)" };

const STATUS_LABELS: Record<string, string> = {
  "functiune": "Funcțiune",
  "radiata": "Radiată",
  "dizolvata": "Dizolvată",
  "in_progress": "În lucru",
  "draft": "Ciornă",
  "review": "Revizuire",
  "submitted": "Depus",
  "approved": "Aprobat",
  "rejected": "Respins",
  "active": "Activ",
};

interface StatusBadgeProps {
  status: string;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className = "" }: StatusBadgeProps) {
  const key = status.toLowerCase();
  const s = STATUS_STYLES[key] || DEFAULT_STYLE;
  const displayLabel = label || STATUS_LABELS[key] || status;
  return (
    <span
      className={`inline-flex items-center text-[12px] font-semibold px-3 py-1 rounded-full ${className}`}
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {displayLabel}
    </span>
  );
}
