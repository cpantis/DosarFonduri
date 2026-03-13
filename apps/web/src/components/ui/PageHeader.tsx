import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  badges?: ReactNode;
  children?: ReactNode;
  breadcrumb?: { label: string; href?: string }[];
}

export function PageHeader({ title, subtitle, badge, badges, children, breadcrumb }: PageHeaderProps) {
  const badgeContent = badge || badges;
  return (
    <div className="bg-white border-b border-slate-200/80">
      <div className="max-w-6xl mx-auto px-8 py-6">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav className="flex items-center gap-1.5 mb-3">
            {breadcrumb.map((item, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <svg className="w-3.5 h-3.5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>}
                {item.href ? (
                  <a href={item.href} className="text-[13px] text-slate-500 hover:text-slate-700 transition-colors no-underline">{item.label}</a>
                ) : (
                  <span className="text-[13px] text-slate-400">{item.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-[24px] font-bold text-slate-900 tracking-tight leading-tight">{title}</h1>
              {badgeContent}
            </div>
            {subtitle && <p className="text-[13px] text-slate-500 mt-1 leading-relaxed">{subtitle}</p>}
          </div>
          {children && <div className="flex items-center gap-2.5 shrink-0">{children}</div>}
        </div>
      </div>
    </div>
  );
}
