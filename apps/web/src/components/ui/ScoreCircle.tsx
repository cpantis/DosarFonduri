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

  const strokeColor = pct >= 80 ? "var(--accent-green)" : pct >= 50 ? "var(--accent-blue)" : pct >= 30 ? "var(--accent-yellow)" : "var(--accent-red)";

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
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
      <div className="absolute text-center" style={{ color: strokeColor }}>
        <div className="text-lg font-bold leading-none">{pct}</div>
        <div className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>%</div>
      </div>
    </div>
  );
}
