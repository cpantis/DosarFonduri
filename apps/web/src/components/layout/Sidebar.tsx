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
    items: [{ href: "/settings", icon: "🛠", label: "Configurări" }],
  },
  {
    section: "Sistem",
    items: [{ href: "/admin", icon: "⚙️", label: "Admin" }],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const { user, organization } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => setCollapsed(e.matches);
    mq.addEventListener("change", handler);
    setCollapsed(mq.matches);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <aside
      className="flex flex-col h-full bg-slate-900 border-r border-slate-800 flex-shrink-0 transition-all duration-200"
      style={{ width: collapsed ? 68 : 240, minWidth: collapsed ? 68 : 240 }}
    >
      {/* Logo */}
      <div className={`flex items-center gap-2.5 flex-shrink-0 border-b border-slate-800 ${collapsed ? "px-3.5 py-5 justify-center" : "px-5 py-5"}`}>
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-[13px] flex-shrink-0 shadow-lg shadow-blue-600/30">
          DF
        </div>
        {!collapsed && (
          <span className="text-[15px] font-semibold tracking-tight text-white">
            DosarFonduri
          </span>
        )}
      </div>

      {/* Active company card */}
      {!collapsed && organization?.name && (
        <div className="mx-3 mt-3 px-3 py-2.5 rounded-lg bg-slate-800/60 border border-slate-700/50">
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-medium mb-0.5">Cabinet activ</div>
          <div className="text-[13px] font-medium text-white truncate">{organization.name}</div>
        </div>
      )}

      {/* Navigation */}
      <nav className={`flex-1 overflow-y-auto ${collapsed ? "px-2 py-3" : "px-3 py-3"}`}>
        {NAV_ITEMS.map((section) => (
          <div key={section.section} className="mb-1">
            {!collapsed && (
              <div className="px-3 mt-6 mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-600">
                {section.section}
              </div>
            )}
            {collapsed && <div className="pt-2" />}
            {section.items.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center no-underline rounded-lg mb-0.5 transition-all duration-150 ${
                    collapsed ? "justify-center py-2.5" : "px-3 py-2 gap-2.5"
                  } ${
                    isActive
                      ? "bg-slate-800 text-white font-medium border-l-2 border-blue-400 pl-[10px]"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border-l-2 border-transparent"
                  }`}
                  style={{ fontSize: "13px" }}
                  title={item.label}
                >
                  <span className="flex-shrink-0 text-[14px]" style={{ width: 20 }}>{item.icon}</span>
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div className={collapsed ? "px-2.5 pb-1" : "px-3 pb-1"}>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center cursor-pointer w-full py-1.5 rounded-lg text-slate-600 border border-slate-800 bg-slate-800/30 hover:bg-slate-800/60 transition-all text-[11px]"
          title={collapsed ? "Extinde sidebar" : "Restrânge sidebar"}
          aria-label={collapsed ? "Extinde sidebar" : "Restrânge sidebar"}
          aria-expanded={!collapsed}
        >
          {collapsed ? "\u25B6" : "\u25C0"}
        </button>
      </div>

      {/* Footer — user info */}
      <div className={`flex items-center border-t border-slate-800 ${collapsed ? "px-2.5 py-4 justify-center" : "px-4 py-4 gap-2.5"}`}>
        <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
          {user?.name ? getInitials(user.name) : "?"}
        </div>
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-white truncate leading-tight">
                {user?.name || "..."}
              </div>
              <div className="text-[11px] text-slate-500 leading-tight">
                {user?.role === "admin" ? "Administrator" : user?.role === "consultant" ? "Consultant" : "Vizualizare"}
              </div>
            </div>
            <button
              onClick={toggle}
              className="flex items-center justify-center flex-shrink-0 cursor-pointer w-8 h-8 rounded-full border border-slate-700 bg-slate-800/50 hover:bg-slate-700 transition-all text-[15px]"
              title={theme === "dark" ? "Comută la Light Mode" : "Comută la Dark Mode"}
            >
              {theme === "dark" ? "\u2600\uFE0F" : "\uD83C\uDF19"}
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
