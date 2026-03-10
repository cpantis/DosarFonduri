"use client";

export function Spinner({ size = 18, light }: { size?: number; light?: boolean }) {
  return (
    <div
      role="status"
      aria-label="Se incarca"
      style={{
        width: size,
        height: size,
        border: `2px solid ${light ? "rgba(255,255,255,.3)" : "var(--spinner-track)"}`,
        borderTopColor: light ? "#fff" : "var(--spinner-head)",
        borderRadius: "50%",
        animation: "spin .7s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}
