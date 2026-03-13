/** Badge for company/project status with design tokens */
const STATUS_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  functiune: { bg: "#ecfdf5", color: "#34d399", border: "#a7f3d0" },
  active: { bg: "#ecfdf5", color: "#34d399", border: "#a7f3d0" },
  radiata: { bg: "#fef2f2", color: "#f87171", border: "#fecaca" },
  dizolvata: { bg: "#fef2f2", color: "#f87171", border: "#fecaca" },
  lichidare: { bg: "#fffbeb", color: "#fbbf24", border: "#fde68a" },
  srl: { bg: "#eff6ff", color: "#4d8bff", border: "#bfdbfe" },
  sa: { bg: "#eff6ff", color: "#4d8bff", border: "#bfdbfe" },
  pfa: { bg: "#f5f3ff", color: "#a78bfa", border: "#ddd6fe" },
  ii: { bg: "#f5f3ff", color: "#a78bfa", border: "#ddd6fe" },
  if: { bg: "#f5f3ff", color: "#a78bfa", border: "#ddd6fe" },
  draft: { bg: "#f8fafc", color: "#64748b", border: "#e2e8f0" },
  in_progress: { bg: "#eff6ff", color: "#4d8bff", border: "#bfdbfe" },
  progress: { bg: "#eff6ff", color: "#4d8bff", border: "#bfdbfe" },
  review: { bg: "#fffbeb", color: "#fbbf24", border: "#fde68a" },
  submitted: { bg: "#ecfdf5", color: "#34d399", border: "#a7f3d0" },
  complet: { bg: "#ecfdf5", color: "#34d399", border: "#a7f3d0" },
  approved: { bg: "#ecfdf5", color: "#34d399", border: "#a7f3d0" },
  rejected: { bg: "#fef2f2", color: "#f87171", border: "#fecaca" },
  blocat: { bg: "#fef2f2", color: "#f87171", border: "#fecaca" },
  uploaded: { bg: "#f8fafc", color: "#64748b", border: "#e2e8f0" },
  processing: { bg: "#eff6ff", color: "#4d8bff", border: "#bfdbfe" },
  processed: { bg: "#ecfdf5", color: "#34d399", border: "#a7f3d0" },
  error: { bg: "#fef2f2", color: "#f87171", border: "#fecaca" },
  failed: { bg: "#fef2f2", color: "#f87171", border: "#fecaca" },
};

const DEFAULT = { bg: "#f8fafc", color: "#64748b", border: "#e2e8f0" };

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
