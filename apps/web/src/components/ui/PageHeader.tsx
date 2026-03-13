import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  badges?: ReactNode;
  children?: ReactNode;
}

export function PageHeader({ title, subtitle, badge, badges, children }: PageHeaderProps) {
  const badgeContent = badge || badges;
  return (
    <div className="bg-white border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-8 py-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
              {badgeContent}
            </div>
            {subtitle && <p className="text-[13px] text-slate-500 mt-1.5">{subtitle}</p>}
          </div>
          {children && <div className="flex items-center gap-2">{children}</div>}
        </div>
      </div>
    </div>
  );
}
