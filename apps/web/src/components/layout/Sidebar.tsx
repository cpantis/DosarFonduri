"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useSidebar } from "@/hooks/useSidebar";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

/* ─── Monochrome SVG icons (Linear-style) ─── */
function NavIcon({ name, className }: { name: string; className?: string }) {
  const props = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className };
  switch (name) {
    case "dashboard": return <svg {...props}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>;
    case "companies": return <svg {...props}><path d="M3 21h18" /><path d="M5 21V7l8-4v18" /><path d="M19 21V11l-6-4" /><path d="M9 9v.01" /><path d="M9 12v.01" /><path d="M9 15v.01" /><path d="M9 18v.01" /></svg>;
    case "projects":  return <svg {...props}><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg>;
    case "documents": return <svg {...props}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>;
    case "settings":  return <svg {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>;
    case "admin":     return <svg {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
    default:          return <svg {...props}><circle cx="12" cy="12" r="10" /></svg>;
  }
}

const navItems = [
  { key: "dashboard", label: "Panou",      href: "/dashboard" },
  { key: "companies", label: "Firme",      href: "/companies" },
  { key: "projects",  label: "Proiecte",   href: "/projects" },
  { key: "documents", label: "Documente",  href: "/documents" },
];
const configItems = [
  { key: "settings", label: "Configurări", href: "/settings" },
];
const systemItems = [
  { key: "admin",    label: "Admin",       href: "/admin" },
];

const EXPANDED_WIDTH = 248;
const COLLAPSED_WIDTH = 56;

/* ─── Collapse / Expand toggle icon (inline SVG, no dependency) ─── */
function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return collapsed ? (
    // PanelLeftOpen
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
      <path d="m14 9 3 3-3 3" />
    </svg>
  ) : (
    // PanelLeftClose
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
      <path d="m16 15-3-3 3-3" />
    </svg>
  );
}

function NavItem({
  item,
  active,
  collapsed,
  onExpandRequest,
}: {
  item: { href: string; key: string; label: string };
  active: boolean;
  collapsed: boolean;
  onExpandRequest: () => void;
}) {
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      onClick={(e) => {
        if (collapsed) {
          e.preventDefault();
          onExpandRequest();
        }
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: collapsed ? 0 : 10,
        padding: collapsed ? "10px 0" : "10px 14px",
        justifyContent: collapsed ? "center" : "flex-start",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        color: active ? "#0f172a" : "#64748b",
        background: active ? "rgba(37,99,235,.08)" : "transparent",
        textDecoration: "none",
        transition: "all .15s",
        marginBottom: 2,
        width: collapsed ? 40 : undefined,
        height: collapsed ? 40 : undefined,
        marginLeft: collapsed ? "auto" : undefined,
        marginRight: collapsed ? "auto" : undefined,
      }}
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.background = "rgba(0,0,0,.04)";
          e.currentTarget.style.color = "#0f172a";
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "#64748b";
        }
      }}
    >
      <span style={{ width: 20, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><NavIcon name={item.key} /></span>
      {!collapsed && <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</span>}
    </Link>
  );
}

function SectionLabel({ children, collapsed }: { children: React.ReactNode; collapsed: boolean }) {
  if (collapsed) {
    return <div style={{ height: 1, background: "#e2e8f0", margin: "8px 12px" }} />;
  }
  return (
    <div style={{
      fontSize: 10,
      textTransform: "uppercase",
      letterSpacing: "0.14em",
      color: "#94a3b8",
      fontWeight: 600,
      padding: "0 14px",
      marginTop: 24,
      marginBottom: 6,
      whiteSpace: "nowrap",
      overflow: "hidden",
    }}>{children}</div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { organization, user, logout } = useAuth();
  const { isCollapsed, toggle, expand } = useSidebar();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const isActive = (key: string, href: string) => {
    if (key === "dashboard") return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <>
      {/* Mobile hamburger toggle */}
      <button
        onClick={() => setMobileOpen(v => !v)}
        className="sidebar-mobile-toggle"
        style={{
          display: "none",
          position: "fixed", top: 12, left: 12, zIndex: 200,
          width: 40, height: 40, borderRadius: 10,
          background: "#ffffff", border: "1px solid #e2e8f0", color: "#0f172a",
          boxShadow: "0 2px 8px rgba(0,0,0,.08)",
          alignItems: "center", justifyContent: "center",
          fontSize: 18, cursor: "pointer",
        }}
      >
        {mobileOpen ? "\u2715" : "\u2630"}
      </button>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="sidebar-mobile-overlay"
          style={{
            display: "none",
            position: "fixed", inset: 0, zIndex: 149,
            background: "rgba(0,0,0,.3)",
          }}
        />
      )}
      <style>{`
        @media (max-width: 768px) {
          .sidebar-mobile-toggle { display: flex !important; }
          .sidebar-mobile-overlay { display: block !important; }
          .sidebar-panel { position: fixed !important; z-index: 150 !important; transform: translateX(-100%); }
          .sidebar-panel.open { transform: translateX(0); }
        }
      `}</style>
    <div
      className={`sidebar-panel ${mobileOpen ? "open" : ""}`}
      style={{
        width: mobileOpen ? EXPANDED_WIDTH : isCollapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH,
        minHeight: "100vh",
        background: "#ffffff",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        borderRight: "1px solid #e2e8f0",
        transition: "width 200ms ease",
        overflow: "hidden",
      }}
    >
      {/* Logo */}
      <div style={{ padding: isCollapsed ? "20px 0 12px" : "20px 20px 12px", display: "flex", justifyContent: isCollapsed ? "center" : "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center",
            color: "#ffffff", fontSize: 11, fontWeight: 700,
            boxShadow: "0 4px 12px rgba(37,99,235,.2)",
          }}>DF</div>
          {!isCollapsed && (
            <span style={{ color: "#0f172a", fontWeight: 600, fontSize: 15, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>DosarFonduri</span>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, overflowY: "auto", padding: isCollapsed ? "4px 0" : "4px 8px" }}>
        <SectionLabel collapsed={isCollapsed}>Principal</SectionLabel>
        {navItems.map((item) => (
          <NavItem key={item.key} item={item} active={isActive(item.key, item.href)} collapsed={isCollapsed} onExpandRequest={expand} />
        ))}

        <SectionLabel collapsed={isCollapsed}>Configurare</SectionLabel>
        {configItems.map((item) => (
          <NavItem key={item.key} item={item} active={isActive(item.key, item.href)} collapsed={isCollapsed} onExpandRequest={expand} />
        ))}

        {user?.role === "admin" && (
          <>
            <SectionLabel collapsed={isCollapsed}>Sistem</SectionLabel>
            {systemItems.map((item) => (
              <NavItem key={item.key} item={item} active={isActive(item.key, item.href)} collapsed={isCollapsed} onExpandRequest={expand} />
            ))}
          </>
        )}
      </nav>

      {/* Toggle button */}
      <div style={{
        padding: isCollapsed ? "8px 0" : "8px 8px",
        display: "flex",
        justifyContent: isCollapsed ? "center" : "flex-end",
      }}>
        <button
          onClick={toggle}
          title={isCollapsed ? "Extinde sidebar (⌘B)" : "Restrânge sidebar (⌘B)"}
          style={{
            width: 32, height: 32, borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "transparent", border: "none",
            color: "#94a3b8", cursor: "pointer",
            transition: "all .15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(0,0,0,.04)"; e.currentTarget.style.color = "#64748b"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#94a3b8"; }}
        >
          <CollapseIcon collapsed={isCollapsed} />
        </button>
      </div>

      {/* User footer */}
      {user && (
        <div style={{
          padding: isCollapsed ? "12px 0" : "12px 16px",
          borderTop: "1px solid #e2e8f0",
          display: "flex",
          flexDirection: isCollapsed ? "column" : "row",
          justifyContent: isCollapsed ? "center" : "flex-start",
          alignItems: "center",
          gap: isCollapsed ? 6 : 10,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
            background: "rgba(77,139,255,.15)", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 700, color: "#4d8bff",
          }}
          title={isCollapsed ? (user.name || user.email || "Utilizator") : undefined}
          >
            {(user.name || user.email || "U").charAt(0).toUpperCase()}
          </div>
          {!isCollapsed && (
            <>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, color: "#0f172a", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name || user.email}</div>
                <div style={{ fontSize: 10, color: "#94a3b8", textTransform: "capitalize" }}>{user.role || "consultant"}</div>
              </div>
              <button
                onClick={() => { logout(); router.push("/login"); }}
                title="Deconectare"
                style={{
                  width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "transparent", border: "none",
                  color: "#94a3b8", cursor: "pointer",
                  transition: "all .15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(248,113,113,.08)"; e.currentTarget.style.color = "#f87171"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#94a3b8"; }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </>
          )}
          {isCollapsed && (
            <button
              onClick={() => { logout(); router.push("/login"); }}
              title="Deconectare"
              style={{
                width: 28, height: 28, borderRadius: 6,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "transparent", border: "none",
                color: "#94a3b8", cursor: "pointer",
                transition: "all .15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(248,113,113,.08)"; e.currentTarget.style.color = "#f87171"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#94a3b8"; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
    </>
  );
}
