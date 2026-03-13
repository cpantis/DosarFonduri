"use client";

export function Spinner({ size = 18, light }: { size?: number; light?: boolean }) {
  return (
    <div
      role="status"
      aria-label="Se incarca"
      className="shrink-0"
      style={{
        width: size,
        height: size,
        border: `2px solid ${light ? "rgba(255,255,255,.3)" : "#e0e4ea"}`,
        borderTopColor: light ? "#fff" : "#4d8bff",
        borderRadius: "50%",
        animation: "spin .7s linear infinite",
      }}
    />
  );
}
