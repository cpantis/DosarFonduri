"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "./ThemeProvider";
import { useAuth } from "@/hooks/useAuth";
import { getInitials } from "@/lib/utils";

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

  return (
    <aside className="w-60 min-w-60 flex flex-col h-full transition-colors"
      style={{ background: "var(--bg-surface)", borderRight: "1px solid var(--border)" }}>
      {/* Logo */}
      <div className="p-5 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div
          className="w-9 h-9 flex items-center justify-center text-white text-base font-extrabold"
          style={{
            borderRadius: "10px",
            background: "var(--accent-blue)",
            boxShadow: "0 2px 12px rgba(77,139,255,.25)",
          }}
        >
          DF
        </div>
        <span
          className="text-[17px] font-extrabold tracking-tight"
          style={{ color: "var(--text-primary)" }}
        >
          DosarFonduri
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((section) => (
          <div key={section.section}>
            <div
              className="px-3 pt-4 pb-1.5 text-[10px] font-bold uppercase"
              style={{ letterSpacing: "1px", color: "var(--text-muted)" }}
            >
              {section.section}
            </div>
            {section.items.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm font-medium transition-colors mb-0.5"
                  style={{
                    borderRadius: "var(--r-sm)",
                    background: isActive ? "rgba(77,139,255,.1)" : undefined,
                    color: isActive ? "var(--accent-blue)" : "var(--text-secondary)",
                    fontWeight: isActive ? 600 : 500,
                  }}
                >
                  <span className="w-5 text-center text-base">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div
        className="p-3 flex items-center gap-2.5"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
          style={{ background: "var(--accent-purple)" }}
        >
          {user?.name ? getInitials(user.name) : "?"}
        </div>
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
          className="w-8 h-8 rounded-full flex items-center justify-center text-base transition-all"
          style={{
            border: "1px solid var(--border)",
            background: "var(--bg-elevated)",
          }}
          title={theme === "dark" ? "Comuta la Light Mode" : "Comuta la Dark Mode"}
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
      </div>
    </aside>
  );
}
