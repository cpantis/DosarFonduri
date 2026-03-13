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
  const valueSize = size === "lg" ? "text-[20px]" : "text-[16px]";
  return (
    <div className={className}>
      <div className="text-[11px] uppercase tracking-wide text-slate-400 font-medium mb-1.5">
        {label}
      </div>
      <div className={`${valueSize} font-semibold leading-snug text-slate-900 ${mono ? "font-mono" : ""}`}>
        {value || <span className="text-slate-300">—</span>}
      </div>
    </div>
  );
}
