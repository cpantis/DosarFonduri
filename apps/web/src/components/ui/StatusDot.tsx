/** Status dot indicator — colored circle per status */
export function StatusDot({ status, className = "" }: { status: "valid" | "warning" | "invalid" | "pending" | string; className?: string }) {
  const colors: Record<string, string> = {
    valid: "var(--accent-green)",
    pass: "var(--accent-green)",
    confirmat: "var(--accent-green)",
    warning: "var(--accent-yellow)",
    propus: "var(--accent-yellow)",
    invalid: "var(--accent-red)",
    fail: "var(--accent-red)",
    pending: "var(--text-muted)",
    empty: "var(--text-muted)",
  };
  const color = colors[status] || "var(--text-muted)";
  return <span className={`inline-block w-2 h-2 rounded-full ${className}`} style={{ background: color }} />;
}
