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
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all no-underline group relative ${
        active
          ? "bg-blue-50 text-blue-600 font-semibold"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-blue-600 rounded-r-full" />}
      <span className="text-[15px] w-5 text-center shrink-0">{item.icon}</span>
      <span>{item.label}</span>
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400 font-semibold px-3 mt-6 mb-1.5 first:mt-0">{children}</div>
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
    <div className="w-[248px] min-h-screen bg-white flex flex-col shrink-0 border-r border-slate-200/80">
      {/* Logo */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white text-[11px] font-bold shadow-lg shadow-blue-600/20">DF</div>
          <span className="text-slate-900 font-semibold text-[15px] tracking-tight">DosarFonduri</span>
        </div>
      </div>

      {/* Cabinet card */}
      <div className="px-4 pb-3">
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/10 flex items-center justify-center text-[11px] font-bold text-blue-600">{initials}</div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400 mb-0.5">Cabinet activ</div>
              <div className="text-slate-900 text-[13px] font-medium leading-snug truncate">{cabinetName}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-1">
        <SectionLabel>Principal</SectionLabel>
        <div className="space-y-0.5">
          {navItems.map((item) => (
            <NavItem key={item.key} item={item} active={isActive(item.key, item.href)} />
          ))}
        </div>

        <SectionLabel>Configurare</SectionLabel>
        <div className="space-y-0.5">
          {configItems.map((item) => (
            <NavItem key={item.key} item={item} active={isActive(item.key, item.href)} />
          ))}
        </div>

        <SectionLabel>Sistem</SectionLabel>
        <div className="space-y-0.5">
          {systemItems.map((item) => (
            <NavItem key={item.key} item={item} active={isActive(item.key, item.href)} />
          ))}
        </div>
      </nav>

      {/* User footer */}
      {user && (
        <div className="px-4 py-3 border-t border-slate-200/80">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-blue-600/10 flex items-center justify-center text-[10px] font-bold text-blue-600">
              {(user.name || user.email || "U").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] text-slate-700 font-medium truncate">{user.name || user.email}</div>
              <div className="text-[10px] text-slate-400 capitalize">{user.role || "consultant"}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
