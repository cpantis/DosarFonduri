"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebar } from "@/hooks/useSidebar";

/** Map URL path segments to Romanian labels */
const PATH_LABELS: Record<string, string> = {
  dashboard: "Panou",
  companies: "Firme",
  projects: "Proiecte",
  documents: "Documente",
  settings: "Configurări",
  admin: "Admin",
};

/** Map URL segments to icons */
const PATH_ICONS: Record<string, string> = {
  dashboard: "📊",
  companies: "🏢",
  projects: "📁",
  documents: "📄",
  settings: "⚙️",
  admin: "🔧",
};

interface Crumb {
  label: string;
  href: string;
  icon?: string;
}

function buildCrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const href = "/" + segments.slice(0, i + 1).join("/");

    // Skip UUID segments as standalone crumbs — they'll be shown as "Detalii" or merged
    if (/^[0-9a-f]{8}-[0-9a-f]{4}/.test(seg)) {
      const parentSeg = segments[i - 1];
      const parentLabel = PATH_LABELS[parentSeg] || parentSeg;
      crumbs.push({ label: `${parentLabel} — detalii`, href });
      continue;
    }

    // Template sub-paths
    if (seg === "template" && i + 1 < segments.length) {
      continue; // Skip "template", the next segment (UUID) will show
    }

    const label = PATH_LABELS[seg] || seg.charAt(0).toUpperCase() + seg.slice(1);
    crumbs.push({ label, href, icon: PATH_ICONS[seg] });
  }

  return crumbs;
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const { isCollapsed, expand } = useSidebar();
  const crumbs = buildCrumbs(pathname);

  if (crumbs.length === 0) return null;

  return (
    <div style={{
      height: 44,
      padding: "0 24px",
      borderBottom: "1px solid rgba(226,232,240,.6)",
      display: "flex",
      alignItems: "center",
      gap: 0,
      background: "#ffffff",
      flexShrink: 0,
    }}>
      {/* Hamburger for mobile / expand button when collapsed */}
      {isCollapsed && (
        <button
          onClick={expand}
          className="breadcrumb-expand-btn"
          title="Extinde sidebar (⌘B)"
          style={{
            width: 28, height: 28, borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "transparent", border: "none",
            color: "#94a3b8", cursor: "pointer",
            marginRight: 8, transition: "all .15s",
            flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.color = "#475569"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#94a3b8"; }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 3v18" />
            <path d="m14 9 3 3-3 3" />
          </svg>
        </button>
      )}

      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={crumb.href} style={{ display: "flex", alignItems: "center" }}>
            {i > 0 && (
              <span style={{ color: "#cbd5e1", fontSize: 12, margin: "0 8px", userSelect: "none" }}>›</span>
            )}
            {isLast ? (
              <span style={{
                fontSize: 13,
                fontWeight: 500,
                color: "#0f172a",
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}>
                {crumb.icon && <span style={{ fontSize: 13 }}>{crumb.icon}</span>}
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                style={{
                  fontSize: 13,
                  fontWeight: 400,
                  color: "#64748b",
                  textDecoration: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  transition: "color .15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.color = "#0f172a"; e.currentTarget.style.textDecoration = "underline"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "#64748b"; e.currentTarget.style.textDecoration = "none"; }}
              >
                {crumb.icon && <span style={{ fontSize: 13 }}>{crumb.icon}</span>}
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </div>
  );
}
