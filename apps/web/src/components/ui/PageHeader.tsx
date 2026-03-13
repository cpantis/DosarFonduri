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
    <div className="bg-slate-50/80 border-b border-slate-200/80">
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="max-w-6xl mx-auto px-8 pt-3 flex items-center gap-1.5">
          {breadcrumb.map((item, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <svg className="w-3 h-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>}
              {item.href ? (
                <a href={item.href} className="text-[12px] text-slate-400 hover:text-slate-600 transition-colors no-underline">{item.label}</a>
              ) : (
                <span className="text-[12px] text-slate-400">{item.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="max-w-6xl mx-auto px-8 py-3 flex items-center justify-between gap-4">
        <div className="min-w-0 flex items-center gap-3">
          <h1 className="text-[15px] font-semibold text-slate-700 tracking-tight leading-none" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>{title}</h1>
          {badgeContent}
          {subtitle && <span className="text-[12px] text-slate-400 leading-none hidden sm:inline">·</span>}
          {subtitle && <p className="text-[12px] text-slate-400 leading-none hidden sm:inline">{subtitle}</p>}
        </div>
        {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
      </div>
    </div>
  );
}
