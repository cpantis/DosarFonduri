import { ReactNode } from "react";

interface SectionTitleProps {
  children: ReactNode;
}

export function SectionTitle({ children }: SectionTitleProps) {
  return <h3 className="text-[13px] font-semibold text-slate-700 uppercase tracking-wide mb-3 mt-8 first:mt-0">{children}</h3>;
}
