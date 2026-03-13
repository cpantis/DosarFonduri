/** Label + value pattern used in cards */
export function CardLabel({
  label,
  value,
  mono = false,
  size = "default",
  className = "",
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  size?: "default" | "lg";
  className?: string;
}) {
  const valueSize = size === "lg" ? "text-[20px]" : "text-[15px]";
  return (
    <div className={className}>
      <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-1">
        {label}
      </div>
      <div className={`${valueSize} font-semibold leading-snug text-slate-900 ${mono ? "font-mono tabular-nums" : ""}`}>
        {value || <span className="text-slate-300">—</span>}
      </div>
    </div>
  );
}
