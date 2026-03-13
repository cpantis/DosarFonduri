/** Circular score indicator with percentage */
export function ScoreCircle({
  score,
  max = 100,
  size = 80,
  strokeWidth = 5,
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

  const strokeColor = pct >= 80 ? "#059669" : pct >= 50 ? "#2563eb" : pct >= 30 ? "#d97706" : "#dc2626";
  const trackColor = "#f1f5f9";

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={strokeColor} strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} className="transition-all duration-700 ease-out" />
      </svg>
      <div className="absolute text-center">
        <div className="text-[17px] font-bold leading-none text-slate-900">{pct}</div>
        <div className="text-[10px] font-medium text-slate-400">%</div>
      </div>
    </div>
  );
}
