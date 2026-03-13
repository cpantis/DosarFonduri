"use client";

interface ProgressBarProps {
  value: number;
  max: number;
  color?: string;
  showLabel?: boolean;
}

export function ProgressBar({ value, max, color, showLabel = true }: ProgressBarProps) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const barColor =
    color ||
    (pct === 100 ? "#059669" : pct > 50 ? "#2563eb" : pct > 0 ? "#d97706" : "#dc2626");

  return (
    <div>
      <div
        className="w-full overflow-hidden bg-slate-100 rounded-full"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${value} din ${max}`}
        style={{ height: "5px" }}
      >
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>
      {showLabel && (
        <div className="text-[11px] font-medium mt-1 font-mono tabular-nums text-slate-500">
          {value}/{max}
        </div>
      )}
    </div>
  );
}
