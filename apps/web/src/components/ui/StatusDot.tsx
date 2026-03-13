/** Status dot indicator — colored circle per status */
export function StatusDot({ status, className = "" }: { status: "valid" | "warning" | "invalid" | "pending" | string; className?: string }) {
  const colors: Record<string, string> = {
    valid: "bg-emerald-400",
    pass: "bg-emerald-400",
    confirmat: "bg-emerald-400",
    warning: "bg-amber-400",
    propus: "bg-amber-400",
    invalid: "bg-red-400",
    fail: "bg-red-400",
    pending: "bg-slate-300",
    empty: "bg-slate-300",
  };
  const color = colors[status] || "bg-slate-300";
  return <span className={`inline-block w-2 h-2 rounded-full ${color} ${className}`} />;
}
