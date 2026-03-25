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
    <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", flexShrink: 0 }}>
      {breadcrumb && breadcrumb.length > 0 && (
        <nav style={{ padding: "10px 28px 0", display: "flex", alignItems: "center", gap: 6 }}>
          {breadcrumb.map((item, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {i > 0 && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>}
              {item.href ? (
                <a href={item.href} style={{ fontSize: 12, color: "#94a3b8", textDecoration: "none", transition: "color .15s" }}>{item.label}</a>
              ) : (
                <span style={{ fontSize: 12, color: "#94a3b8" }}>{item.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div style={{ padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", letterSpacing: "-.3px", lineHeight: 1, fontFamily: "'Inter', system-ui, sans-serif", margin: 0 }}>{title}</h1>
          {badgeContent}
          {subtitle && <span style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1 }}>{subtitle}</span>}
        </div>
        {children && <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>{children}</div>}
      </div>
    </div>
  );
}
