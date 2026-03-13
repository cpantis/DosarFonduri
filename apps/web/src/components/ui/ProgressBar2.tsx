/** Progress bar with gradient — for scoring and collection progress */
export function ProgressBar2({
  value,
  max = 100,
  variant = "scoring",
  className = "",
}: {
  value: number;
  max?: number;
  variant?: "scoring" | "collection" | "simple";
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const fills: Record<string, string> = {
    scoring: "#4d8bff",
    collection: "#a78bfa",
    simple: "#4d8bff",
  };
  const fillColor = fills[variant] || fills.simple;
  return (
    <div className={`rounded-full h-2 overflow-hidden ${className}`} style={{ background: "#f8fafc" }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: fillColor }}
      />
    </div>
  );
}
