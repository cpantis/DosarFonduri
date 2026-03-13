interface StatusDotProps {
  status: string;
}

const map: Record<string, string> = {
  valid: "bg-emerald-400",
  warning: "bg-amber-400",
  invalid: "bg-red-400",
  pending: "bg-slate-300",
  pass: "bg-emerald-400",
  fail: "bg-red-400",
};

export function StatusDot({ status }: StatusDotProps) {
  return <span className={`inline-block w-2 h-2 rounded-full ${map[status] || "bg-slate-300"}`} />;
}
