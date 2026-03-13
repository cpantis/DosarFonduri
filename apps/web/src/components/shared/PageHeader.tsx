"use client";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  badges?: React.ReactNode;
}

export function PageHeader({ title, subtitle, children, badges }: PageHeaderProps) {
  return (
    <div className="bg-white border-b border-slate-200 px-8 py-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
            {badges}
          </div>
          {subtitle && (
            <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
          )}
        </div>
        {children && (
          <div className="flex items-center gap-2">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
