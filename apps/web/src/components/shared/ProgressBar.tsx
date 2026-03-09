"use client";

interface ProgressBarProps {
  value: number;
  max: number;
  color?: string;
}

export function ProgressBar({ value, max, color }: ProgressBarProps) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const barColor =
    color ||
    (pct === 100
      ? "var(--accent-green)"
      : pct > 50
      ? "var(--accent-blue)"
      : pct > 0
      ? "var(--accent-yellow)"
      : "var(--accent-red)");

  return (
    <div>
      <div
        className="w-full overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${value} din ${max}`}
        style={{
          height: "4px",
          borderRadius: "2px",
          background: "var(--bg-deep)",
        }}
      >
        <div
          className="h-full transition-all"
          style={{
            width: `${pct}%`,
            borderRadius: "2px",
            background: barColor,
          }}
        />
      </div>
      <div
        className="text-[11px] font-semibold mt-0.5"
        style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}
      >
        {value}/{max}
      </div>
    </div>
  );
}
