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
      ? "#34d399"
      : pct > 50
      ? "#4d8bff"
      : pct > 0
      ? "#fbbf24"
      : "#f87171");

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
          background: "#f8fafc",
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
        className="text-[11px] font-semibold mt-0.5 font-mono"
        style={{ color: "#64748b" }}
      >
        {value}/{max}
      </div>
    </div>
  );
}
