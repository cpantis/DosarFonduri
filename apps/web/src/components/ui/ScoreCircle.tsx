/** Circular score indicator with percentage */
export function ScoreCircle({
  score,
  max = 100,
  size = 80,
  strokeWidth = 6,
  className = "",
}: {
  score: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((score / max) * 100)) : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  const color = pct >= 80 ? "text-emerald-500" : pct >= 50 ? "text-blue-500" : pct >= 30 ? "text-amber-500" : "text-red-500";
  const strokeColor = pct >= 80 ? "#10b981" : pct >= 50 ? "#3b82f6" : pct >= 30 ? "#f59e0b" : "#ef4444";

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className={`absolute text-center ${color}`}>
        <div className="text-lg font-bold leading-none">{pct}</div>
        <div className="text-[9px] text-slate-400 font-medium">%</div>
      </div>
    </div>
  );
}
