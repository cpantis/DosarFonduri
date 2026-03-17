"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useSidebar } from "@/hooks/useSidebar";
import { useState, useEffect } from "react";

const navItems = [
  { key: "dashboard", label: "Panou",      icon: "📊", href: "/dashboard" },
  { key: "companies", label: "Firme",      icon: "🏢", href: "/companies" },
  { key: "projects",  label: "Proiecte",   icon: "📁", href: "/projects" },
  { key: "documents", label: "Documente",  icon: "📄", href: "/documents" },
];
const configItems = [
  { key: "settings", label: "Configurări", icon: "⚙️", href: "/settings" },
];
const systemItems = [
  { key: "admin",    label: "Admin",       icon: "🔧", href: "/admin" },
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
  item: { href: string; icon: string; label: string };
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
          // In collapsed rail, click expands the sidebar instead of navigating
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
        color: active ? "#2563eb" : "#64748b",
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
          e.currentTarget.style.background = "#f1f5f9";
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
      <span style={{ fontSize: 15, width: 20, textAlign: "center", flexShrink: 0 }}>{item.icon}</span>
      {!collapsed && <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</span>}
    </Link>
  );
}

function SectionLabel({ children, collapsed }: { children: React.ReactNode; collapsed: boolean }) {
  if (collapsed) {
    return <div style={{ height: 1, background: "rgba(226,232,240,.6)", margin: "8px 12px" }} />;
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
  const { organization, user } = useAuth();
  const { isCollapsed, toggle, expand } = useSidebar();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const isActive = (key: string, href: string) => {
    if (key === "dashboard") return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  };

  const cabinetName = organization?.name || "Cabinet";
  const initials = cabinetName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

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
          background: "#fff", border: "1px solid #e2e8f0",
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
        borderRight: "1px solid rgba(226,232,240,.8)",
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

      {/* Cabinet card — hidden when collapsed */}
      {!isCollapsed && (
        <div style={{ padding: "0 16px 12px" }}>
          <div style={{
            background: "#f8fafc", borderRadius: 8, padding: 12,
            border: "1px solid rgba(226,232,240,.8)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: "rgba(37,99,235,.08)", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, color: "#2563eb",
              }}>{initials}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: "#94a3b8", marginBottom: 2 }}>Cabinet activ</div>
                <div style={{ color: "#0f172a", fontSize: 13, fontWeight: 500, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cabinetName}</div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Collapsed: just the cabinet initials */}
      {isCollapsed && (
        <div style={{ display: "flex", justifyContent: "center", padding: "0 0 8px" }} title={cabinetName}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: "rgba(37,99,235,.08)", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, color: "#2563eb",
          }}>{initials}</div>
        </div>
      )}

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
          onMouseEnter={e => { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.color = "#475569"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#94a3b8"; }}
        >
          <CollapseIcon collapsed={isCollapsed} />
        </button>
      </div>

      {/* User footer */}
      {user && (
        <div style={{
          padding: isCollapsed ? "12px 0" : "12px 16px",
          borderTop: "1px solid rgba(226,232,240,.8)",
          display: "flex",
          justifyContent: isCollapsed ? "center" : "flex-start",
          alignItems: "center",
          gap: isCollapsed ? 0 : 10,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
            background: "rgba(37,99,235,.08)", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 700, color: "#2563eb",
          }}
          title={isCollapsed ? (user.name || user.email || "Utilizator") : undefined}
          >
            {(user.name || user.email || "U").charAt(0).toUpperCase()}
          </div>
          {!isCollapsed && (
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, color: "#475569", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name || user.email}</div>
              <div style={{ fontSize: 10, color: "#94a3b8", textTransform: "capitalize" }}>{user.role || "consultant"}</div>
            </div>
          )}
        </div>
      )}
    </div>
    </>
  );
}
