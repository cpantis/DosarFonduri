"use client";

export function Spinner({ size = 18, light }: { size?: number; light?: boolean }) {
  return (
    <svg
      className="shrink-0 animate-spin"
      role="status"
      aria-label="Se încarcă"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className={light ? "opacity-30" : "opacity-20"}
        cx="12" cy="12" r="10"
        stroke={light ? "#fff" : "#94a3b8"}
        strokeWidth="3"
      />
      <path
        className="opacity-80"
        fill={light ? "#fff" : "#2563eb"}
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
