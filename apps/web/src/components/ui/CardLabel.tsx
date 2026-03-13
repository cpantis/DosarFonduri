/** Label + value pattern used in cards */
export function CardLabel({
  label,
  value,
  mono = false,
  size = "default",
  className = "",
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  size?: "default" | "lg";
  className?: string;
}) {
  const valueSize = size === "lg" ? "text-[20px]" : "text-[16px]";
  return (
    <div className={className}>
      <div
        className="text-[12px] uppercase tracking-wide font-medium mb-1.5"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </div>
      <div
        className={`${valueSize} font-semibold leading-snug ${mono ? "font-mono" : ""}`}
        style={{ color: "var(--text-primary)" }}
      >
        {value || <span style={{ color: "var(--text-muted)" }}>—</span>}
      </div>
    </div>
  );
}
