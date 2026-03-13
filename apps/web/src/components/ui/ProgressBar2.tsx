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
  const gradients: Record<string, string> = {
    scoring: "bg-gradient-to-r from-blue-500 to-emerald-500",
    collection: "bg-gradient-to-r from-blue-500 to-violet-500",
    simple: "bg-blue-500",
  };
  const fill = gradients[variant] || gradients.simple;
  return (
    <div className={`bg-slate-100 rounded-full h-2 overflow-hidden ${className}`}>
      <div
        className={`h-full rounded-full transition-all duration-500 ${fill}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
