/** Label + value pattern used in cards */
export function CardLabel({
  label,
  value,
  mono = false,
  className = "",
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-1">{label}</div>
      <div className={`text-[15px] font-semibold text-slate-900 ${mono ? "font-mono" : ""}`}>
        {value || <span className="text-slate-300">—</span>}
      </div>
    </div>
  );
}
