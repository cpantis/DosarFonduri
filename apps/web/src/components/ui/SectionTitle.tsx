import { ReactNode } from "react";

interface SectionTitleProps {
  children: ReactNode;
  action?: ReactNode;
}

export function SectionTitle({ children, action }: SectionTitleProps) {
  return (
    <div className="flex items-center justify-between mb-3 mt-8 first:mt-0">
      <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{children}</h3>
      {action}
    </div>
  );
}
