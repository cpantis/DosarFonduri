"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

const navItems = [
  { key: "dashboard", label: "Panou", icon: "📊", href: "/dashboard" },
  { key: "companies", label: "Firme", icon: "🏢", href: "/companies" },
  { key: "projects", label: "Proiecte", icon: "📁", href: "/projects" },
  { key: "documents", label: "Documente", icon: "📄", href: "/documents" },
];
const configItems = [
  { key: "settings", label: "Configurări", icon: "⚙️", href: "/settings" },
];
const systemItems = [
  { key: "admin", label: "Admin", icon: "🔧", href: "/admin" },
];

function NavItem({ item, active }: { item: { href: string; icon: string; label: string }; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] transition-all no-underline ${
        active
          ? "bg-slate-800 text-white font-medium border-l-2 border-blue-400 pl-[10px]"
          : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
      }`}
    >
      <span className="text-[15px] w-5 text-center">{item.icon}</span>
      <span>{item.label}</span>
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.12em] text-slate-600 font-medium px-3 mt-6 mb-2">{children}</div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { organization } = useAuth();

  const isActive = (key: string, href: string) => {
    if (key === "dashboard") return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  };

  const cabinetName = organization?.name || "Cabinet";

  return (
    <div className="w-[248px] min-h-screen bg-slate-900 flex flex-col shrink-0">
      {/* Logo */}
      <div className="p-5 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white text-[11px] font-bold">DF</div>
          <span className="text-white font-semibold text-[15px] tracking-tight">DosarFonduri</span>
        </div>
      </div>

      {/* Cabinet */}
      <div className="px-4 pb-4">
        <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50">
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500 mb-1">Cabinet activ</div>
          <div className="text-white text-[13px] font-medium leading-snug truncate">{cabinetName}</div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3">
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
      </div>
    </div>
  );
}
