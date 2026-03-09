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
        width: collapsed ? 64 : 240,
        minWidth: collapsed ? 64 : 240,
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 flex-shrink-0"
        style={{
          padding: collapsed ? "20px 12px" : "20px",
          borderBottom: "1px solid var(--border)",
          justifyContent: collapsed ? "center" : "flex-start",
        }}
      >
        <div
          className="w-9 h-9 flex items-center justify-center text-white text-base font-extrabold flex-shrink-0"
          style={{
            borderRadius: "10px",
            background: "var(--accent-blue)",
            boxShadow: "0 2px 12px rgba(77,139,255,.25)",
          }}
        >
          DF
        </div>
        {!collapsed && (
          <span
            className="text-[17px] font-extrabold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            DosarFonduri
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((section) => (
          <div key={section.section}>
            {!collapsed && (
              <div
                className="px-3 pt-4 pb-1.5 text-[10px] font-bold uppercase"
                style={{ letterSpacing: "1px", color: "var(--text-muted)" }}
              >
                {section.section}
              </div>
            )}
            {collapsed && <div className="pt-2" />}
            {section.items.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2.5 py-2 text-sm font-medium transition-colors mb-0.5"
                  style={{
                    borderRadius: "var(--r-sm)",
                    background: isActive ? "rgba(77,139,255,.1)" : undefined,
                    color: isActive ? "var(--accent-blue)" : "var(--text-secondary)",
                    fontWeight: isActive ? 600 : 500,
                    padding: collapsed ? "8px 0" : "8px 12px",
                    justifyContent: collapsed ? "center" : "flex-start",
                  }}
                  title={item.label}
                >
                  <span className="w-5 text-center text-base flex-shrink-0">{item.icon}</span>
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div className="px-3 py-1">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center py-1.5 text-xs transition-colors"
          style={{
            borderRadius: "var(--r-sm)",
            color: "var(--text-muted)",
            border: "1px solid var(--border)",
            background: "var(--bg-elevated)",
          }}
          title={collapsed ? "Extinde sidebar" : "Restrânge sidebar"}
          aria-label={collapsed ? "Extinde sidebar" : "Restrânge sidebar"}
          aria-expanded={!collapsed}
        >
          {collapsed ? "\u25B6" : "\u25C0"}
        </button>
      </div>

      {/* Footer */}
      <div
        className="p-3 flex items-center gap-2.5"
        style={{
          borderTop: "1px solid var(--border)",
          justifyContent: collapsed ? "center" : "flex-start",
        }}
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
          style={{ background: "var(--accent-purple)" }}
        >
          {user?.name ? getInitials(user.name) : "?"}
        </div>
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0">
              <div
                className="text-[13px] font-semibold truncate"
                style={{ color: "var(--text-primary)" }}
              >
                {user?.name || "..."}
              </div>
              <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {user?.role === "admin"
                  ? "Administrator"
                  : user?.role === "consultant"
                  ? "Consultant"
                  : "Vizualizare"}
              </div>
            </div>
            <button
              onClick={toggle}
              className="w-8 h-8 rounded-full flex items-center justify-center text-base transition-all flex-shrink-0"
              style={{
                border: "1px solid var(--border)",
                background: "var(--bg-elevated)",
              }}
              title={theme === "dark" ? "Comuta la Light Mode" : "Comuta la Dark Mode"}
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
