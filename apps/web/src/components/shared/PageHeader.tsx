"use client";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  badges?: React.ReactNode;
}

export function PageHeader({ title, subtitle, children, badges }: PageHeaderProps) {
  return (
    <div className="px-8 py-5" style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{title}</h1>
            {badges}
          </div>
          {subtitle && (
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{subtitle}</p>
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
