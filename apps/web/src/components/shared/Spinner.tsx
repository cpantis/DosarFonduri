"use client";

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div
        role="status"
        aria-label="Se incarca"
        style={{
          width: size,
          height: size,
          border: "2px solid rgba(255,255,255,.3)",
          borderTopColor: "#fff",
          borderRadius: "50%",
          animation: "spin .7s linear infinite",
        }}
      />
    </>
  );
}
