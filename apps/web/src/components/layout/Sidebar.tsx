"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

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

function NavItem({ item, active }: { item: { href: string; icon: string; label: string }; active: boolean }) {
  return (
    <Link
      href={item.href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        color: active ? "#2563eb" : "#64748b",
        background: active ? "rgba(37,99,235,.08)" : "transparent",
        textDecoration: "none",
        transition: "all .15s",
        marginBottom: 2,
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
      <span>{item.label}</span>
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
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
    }}>{children}</div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { organization, user } = useAuth();

  const isActive = (key: string, href: string) => {
    if (key === "dashboard") return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  };

  const cabinetName = organization?.name || "Cabinet";
  const initials = cabinetName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div style={{
      width: 248,
      minHeight: "100vh",
      background: "#ffffff",
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
      borderRight: "1px solid rgba(226,232,240,.8)",
    }}>
      {/* Logo */}
      <div style={{ padding: "20px 20px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center",
            color: "#ffffff", fontSize: 11, fontWeight: 700,
            boxShadow: "0 4px 12px rgba(37,99,235,.2)",
          }}>DF</div>
          <span style={{ color: "#0f172a", fontWeight: 600, fontSize: 15, letterSpacing: "-0.01em" }}>DosarFonduri</span>
        </div>
      </div>

      {/* Cabinet card */}
      <div style={{ padding: "0 16px 12px" }}>
        <div style={{
          background: "#f8fafc", borderRadius: 8, padding: 12,
          border: "1px solid rgba(226,232,240,.8)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
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

      {/* Navigation */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "4px 8px" }}>
        <SectionLabel>Principal</SectionLabel>
        {navItems.map((item) => (
          <NavItem key={item.key} item={item} active={isActive(item.key, item.href)} />
        ))}

        <SectionLabel>Configurare</SectionLabel>
        {configItems.map((item) => (
          <NavItem key={item.key} item={item} active={isActive(item.key, item.href)} />
        ))}

        <SectionLabel>Sistem</SectionLabel>
        {systemItems.map((item) => (
          <NavItem key={item.key} item={item} active={isActive(item.key, item.href)} />
        ))}
      </nav>

      {/* User footer */}
      {user && (
        <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(226,232,240,.8)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: "rgba(37,99,235,.08)", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 700, color: "#2563eb",
            }}>
              {(user.name || user.email || "U").charAt(0).toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, color: "#475569", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name || user.email}</div>
              <div style={{ fontSize: 10, color: "#94a3b8", textTransform: "capitalize" }}>{user.role || "consultant"}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
