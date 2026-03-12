"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "./ThemeProvider";
import { useAuth } from "@/hooks/useAuth";
import { getInitials } from "@/lib/utils";
import { useState, useEffect } from "react";

const NAV_ITEMS = [
  {
    section: "Principal",
    items: [
      { href: "/dashboard", icon: "📊", label: "Panou" },
      { href: "/companies", icon: "🏢", label: "Firme" },
      { href: "/documents", icon: "📃", label: "Documente" },
      { href: "/projects", icon: "💼", label: "Proiecte" },
    ],
  },
  {
    section: "Configurare",
    items: [{ href: "/settings", icon: "🛠", label: "Configurari" }],
  },
  {
    section: "Sistem",
    items: [{ href: "/admin", icon: "⚙️", label: "Admin" }],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  // Auto-collapse on tablet (<=1024px)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => setCollapsed(e.matches);
    mq.addEventListener("change", handler);
    setCollapsed(mq.matches);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <aside
      className="flex flex-col h-full transition-all duration-200 flex-shrink-0"
      style={{
        width: collapsed ? 68 : 250,
        minWidth: collapsed ? 68 : 250,
        background: "var(--sidebar-bg)",
        borderRight: "1px solid var(--sidebar-border)",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 flex-shrink-0"
        style={{
          padding: collapsed ? "24px 14px" : "24px 22px",
          borderBottom: "1px solid var(--sidebar-border)",
          justifyContent: collapsed ? "center" : "flex-start",
        }}
      >
        <div
          className="flex items-center justify-center text-white font-extrabold flex-shrink-0"
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            fontSize: 15,
            background: "var(--accent-blue)",
            boxShadow: "0 2px 12px rgba(77,139,255,.3)",
          }}
        >
          DF
        </div>
        {!collapsed && (
          <span
            style={{
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: "-0.4px",
              color: "#ffffff",
            }}
          >
            DosarFonduri
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto" style={{ padding: collapsed ? "12px 8px" : "16px 12px" }}>
        {NAV_ITEMS.map((section) => (
          <div key={section.section} style={{ marginBottom: 8 }}>
            {!collapsed && (
              <div
                style={{
                  padding: "16px 14px 6px",
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "1.2px",
                  color: "var(--sidebar-section)",
                }}
              >
                {section.section}
              </div>
            )}
            {collapsed && <div style={{ paddingTop: 8 }} />}
            {section.items.map((item) => {
              const isActive = pathname.startsWith(item.href);
              const isHovered = hoveredItem === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center no-underline"
                  style={{
                    borderRadius: 8,
                    gap: 12,
                    padding: collapsed ? "11px 0" : "11px 14px",
                    marginBottom: 2,
                    justifyContent: collapsed ? "center" : "flex-start",
                    background: isActive
                      ? "var(--sidebar-active-bg)"
                      : isHovered
                      ? "var(--sidebar-hover)"
                      : "transparent",
                    color: isActive
                      ? "#ffffff"
                      : isHovered
                      ? "rgba(255,255,255,.9)"
                      : "var(--sidebar-text)",
                    fontWeight: isActive ? 600 : 500,
                    fontSize: 13.5,
                    transition: "all .15s",
                    borderLeft: isActive ? "3px solid var(--accent-blue)" : "3px solid transparent",
                    position: "relative",
                  }}
                  title={item.label}
                  onMouseEnter={() => setHoveredItem(item.href)}
                  onMouseLeave={() => setHoveredItem(null)}
                >
                  <span className="flex-shrink-0 text-center" style={{ width: 22, fontSize: 17 }}>{item.icon}</span>
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div style={{ padding: collapsed ? "4px 10px" : "4px 12px" }}>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center cursor-pointer"
          style={{
            width: "100%",
            padding: "7px 0",
            borderRadius: 8,
            color: "rgba(255,255,255,.35)",
            border: "1px solid var(--sidebar-border)",
            background: "rgba(255,255,255,.03)",
            transition: "all .15s",
            fontFamily: "var(--font-sans)",
            fontSize: 11,
          }}
          title={collapsed ? "Extinde sidebar" : "Restrange sidebar"}
          aria-label={collapsed ? "Extinde sidebar" : "Restrange sidebar"}
          aria-expanded={!collapsed}
        >
          {collapsed ? "\u25B6" : "\u25C0"}
        </button>
      </div>

      {/* Footer — user info */}
      <div
        className="flex items-center"
        style={{
          padding: collapsed ? "16px 10px" : "16px 18px",
          borderTop: "1px solid var(--sidebar-border)",
          gap: 10,
          justifyContent: collapsed ? "center" : "flex-start",
        }}
      >
        <div
          className="flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: "var(--accent-purple)",
          }}
        >
          {user?.name ? getInitials(user.name) : "?"}
        </div>
        {!collapsed && (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                className="truncate"
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#ffffff",
                  lineHeight: 1.3,
                }}
              >
                {user?.name || "..."}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,.4)",
                  lineHeight: 1.3,
                }}
              >
                {user?.role === "admin"
                  ? "Administrator"
                  : user?.role === "consultant"
                  ? "Consultant"
                  : "Vizualizare"}
              </div>
            </div>
            <button
              onClick={toggle}
              className="flex items-center justify-center flex-shrink-0 cursor-pointer"
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                border: "1px solid var(--sidebar-border)",
                background: "rgba(255,255,255,.05)",
                transition: "all .15s",
                fontSize: 15,
              }}
              title={theme === "dark" ? "Comuta la Light Mode" : "Comuta la Dark Mode"}
            >
              {theme === "dark" ? "\u2600\uFE0F" : "\uD83C\uDF19"}
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
