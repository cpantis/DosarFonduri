"use client";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";

interface DashboardData {
  stats: { projects: number; companies: number; documents: number; approvalRate: number };
  recentProjects: Array<{
    id: string; name: string; status: string; updatedAt: string;
    firma: string; program: string;
    eligibility: number; eligTotal: number;
    elements: number; elemTotal: number;
    checkDone: number; checkTotal: number;
    docsGenerated: number; docsTotal: number;
  }>;
  activity: Array<{
    id: string; userId: string; userName: string | null;
    action: string; entityType: string | null; entityId: string | null;
    details: any; createdAt: string;
  }>;
  deadlines: Array<{
    date: string; project: string; event: string; urgent: boolean; daysLeft: number;
  }>;
}

const ACTION_LABELS: Record<string, string> = {
  "element.extracted": "Element extras de Solomon",
  "eligibility.checked": "Eligibilitate verificată",
  "document.generated": "Document generat de Neemia",
  "company.created": "Firmă adăugată",
  "project.created": "Proiect creat",
  "document.uploaded": "Document încărcat",
  "user.login": "Autentificare",
};

const ACTION_TYPE_MAP: Record<string, { icon: string; colorClass: string }> = {
  "element.extracted": { icon: "\u{1F916}", colorClass: "var(--accent-blue)" },
  "eligibility.checked": { icon: "\u2705", colorClass: "var(--accent-green)" },
  "document.generated": { icon: "\u{1F4C4}", colorClass: "var(--accent-purple)" },
  "company.created": { icon: "\u{1F3E2}", colorClass: "var(--accent-yellow)" },
  "project.created": { icon: "\u{1F4C1}", colorClass: "var(--accent-blue)" },
  "document.uploaded": { icon: "\u{1F4E4}", colorClass: "var(--accent-orange)" },
  "user.login": { icon: "\u{1F511}", colorClass: "var(--text-muted)" },
};

const pct = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0;

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Acum";
  if (mins < 60) return `Acum ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Acum ${hours} ore`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Ieri";
  if (days < 7) return `Acum ${days} zile`;
  return new Date(dateStr).toLocaleDateString("ro-RO", { day: "numeric", month: "short" });
}

function barColor(percent: number, type: "elig" | "elem"): string {
  if (type === "elig") {
    if (percent === 100) return "var(--accent-green)";
    if (percent > 0) return "var(--accent-yellow)";
    return "var(--accent-red)";
  }
  if (percent === 100) return "var(--accent-green)";
  if (percent > 50) return "var(--accent-blue)";
  return "var(--accent-orange)";
}

export default function DashboardPage() {
  const { user, organization } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<DashboardData>("/api/dashboard")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const stats = data?.stats;
  const userName = user?.name || user?.email || "Utilizator";
  const cabinetName = organization?.name || "Cabinet";

  return (
    <div className="min-h-screen">
      <PageHeader
        title={`Bun venit, ${userName}`}
        subtitle={`${cabinetName} · Panou de control`}
      />

      <div className="px-8 py-6" style={{ background: "var(--bg-deep)" }}>
        {loading ? (
          <div className="flex items-center justify-center h-72">
            <div className="text-[13px]" style={{ color: "var(--text-secondary)" }}>Se incarca...</div>
          </div>
        ) : (
          <>
            {/* Stat Cards */}
            <div className="grid grid-cols-4 gap-5 mb-8 max-[768px]:grid-cols-2">
              <StatCard icon="🏢" label="Firme gestionate" value={stats?.companies ?? "–"} color="blue" />
              <StatCard icon="📁" label="Proiecte active" value={stats?.projects ?? "–"} color="amber" />
              <StatCard icon="📄" label="Documente generate" value={stats?.documents ?? "–"} color="emerald" />
              <StatCard icon="📊" label="Rată aprobare" value={stats ? `${stats.approvalRate}%` : "–"} color="red" />
            </div>

            {/* Quick Actions */}
            <div className="flex gap-4 mb-8">
              {[
                { icon: "📁", label: "Proiect nou", desc: "Creează un proiect de finanțare", href: "/projects" },
                { icon: "🏢", label: "Firmă nouă", desc: "Adaugă firmă din CUI sau ONRC", href: "/companies" },
                { icon: "📋", label: "Documente", desc: "Administrează ghiduri și template-uri", href: "/documents" },
              ].map(a => (
                <button
                  key={a.href}
                  className="flex-1 rounded-xl p-5 text-left cursor-pointer transition-all"
                  style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--border-active)"; e.currentTarget.style.boxShadow = "var(--shadow-sm)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
                  onClick={() => router.push(a.href)}
                >
                  <div className="text-[22px] mb-2">{a.icon}</div>
                  <div className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>{a.label}</div>
                  <div className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>{a.desc}</div>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-[1fr_400px] gap-6 max-[1200px]:grid-cols-1">
              {/* LEFT: Projects table */}
              <div className="min-w-0">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-[20px] font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>Proiecte recente</h2>
                  <button className="text-[14px] font-semibold cursor-pointer" style={{ color: "var(--accent-blue)" }} onClick={() => router.push("/projects")}>Vezi toate &rarr;</button>
                </div>

                <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                  {(!data?.recentProjects || data.recentProjects.length === 0) ? (
                    <EmptyState
                      icon="📁"
                      title="Niciun proiect încă"
                      actionLabel="Creează primul proiect"
                      onAction={() => router.push("/projects")}
                    />
                  ) : (
                    <>
                      {/* Header row */}
                      <div className="grid grid-cols-[1fr_140px_100px_100px_100px_80px_80px_100px] items-center px-5 py-3 text-[11px] font-bold uppercase tracking-wide" style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                        <div>Proiect / Firma</div><div>Program</div><div>Status</div><div>Eligibilitate</div><div>Elemente</div><div>Checklist</div><div>Documente</div><div>Actualizat</div>
                      </div>
                      {data.recentProjects.map(p => {
                        const eligPct = pct(p.eligibility, p.eligTotal);
                        const elemPct = pct(p.elements, p.elemTotal);
                        const checkPct = pct(p.checkDone, p.checkTotal);
                        const docsPct = pct(p.docsGenerated, p.docsTotal);
                        return (
                          <div
                            className="grid grid-cols-[1fr_140px_100px_100px_100px_80px_80px_100px] items-center px-5 py-3.5 cursor-pointer transition-colors"
                            style={{ borderBottom: "1px solid var(--border)" }}
                            key={p.id}
                            onClick={() => router.push(`/projects/${p.id}`)}
                            onMouseEnter={e => e.currentTarget.style.background = "var(--bg-hover)"}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                          >
                            <div>
                              <div className="text-sm font-semibold leading-snug mb-0.5" style={{ color: "var(--text-primary)" }}>{p.name}</div>
                              <div className="text-xs leading-snug" style={{ color: "var(--text-muted)" }}>{p.firma}</div>
                            </div>
                            <div className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>{p.program}</div>
                            <div>
                              <StatusBadge status={p.status} />
                            </div>
                            <div>
                              <div className="h-1.5 rounded-full overflow-hidden w-full" style={{ background: "var(--bg-elevated)" }}>
                                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${eligPct}%`, background: barColor(eligPct, "elig") }} />
                              </div>
                              <div className="text-[11px] font-mono font-semibold mt-1" style={{ color: "var(--text-secondary)" }}>{p.eligibility}/{p.eligTotal}</div>
                            </div>
                            <div>
                              <div className="h-1.5 rounded-full overflow-hidden w-full" style={{ background: "var(--bg-elevated)" }}>
                                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${elemPct}%`, background: barColor(elemPct, "elem") }} />
                              </div>
                              <div className="text-[11px] font-mono font-semibold mt-1" style={{ color: "var(--text-secondary)" }}>{p.elements}/{p.elemTotal}</div>
                            </div>
                            <div>
                              <div className="h-1.5 rounded-full overflow-hidden w-full" style={{ background: "var(--bg-elevated)" }}>
                                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${checkPct}%`, background: barColor(checkPct, "elem") }} />
                              </div>
                              <div className="text-[11px] font-mono font-semibold mt-1" style={{ color: "var(--text-secondary)" }}>{p.checkDone}/{p.checkTotal}</div>
                            </div>
                            <div>
                              <div className="h-1.5 rounded-full overflow-hidden w-full" style={{ background: "var(--bg-elevated)" }}>
                                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${docsPct}%`, background: barColor(docsPct, "elem") }} />
                              </div>
                              <div className="text-[11px] font-mono font-semibold mt-1" style={{ color: "var(--text-secondary)" }}>{p.docsGenerated}/{p.docsTotal}</div>
                            </div>
                            <div className="text-xs" style={{ color: "var(--text-muted)" }}>{timeAgo(p.updatedAt)}</div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              </div>

              {/* RIGHT: Deadlines + Activity */}
              <div className="flex flex-col gap-6">
                {/* Deadlines */}
                <div className="rounded-xl p-6" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                  <div className="text-[16px] font-bold flex items-center gap-2 mb-4" style={{ color: "var(--text-primary)" }}>Termene apropiate</div>
                  {(!data?.deadlines || data.deadlines.length === 0) ? (
                    <div className="text-sm italic" style={{ color: "var(--text-muted)" }}>Niciun termen apropiat</div>
                  ) : data.deadlines.map((d, i) => (
                    <div className="flex gap-3.5 py-3 first:pt-0" style={{ borderBottom: "1px solid var(--border)" }} key={i}>
                      <div className="min-w-[56px] text-[13px] font-bold font-mono" style={{ color: d.urgent ? "var(--accent-red)" : "var(--text-secondary)" }}>
                        {d.daysLeft <= 0 ? "Azi" : `${d.daysLeft}z`}
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold leading-snug mb-0.5" style={{ color: "var(--text-primary)" }}>{d.event}</div>
                        <div className="text-xs" style={{ color: "var(--text-muted)" }}>{d.project}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Activity */}
                <div className="rounded-xl p-6" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                  <div className="text-[16px] font-bold flex items-center gap-2 mb-4" style={{ color: "var(--text-primary)" }}>Activitate recentă</div>
                  <div className="max-h-[360px] overflow-y-auto">
                    {(!data?.activity || data.activity.length === 0) ? (
                      <div className="text-sm italic" style={{ color: "var(--text-muted)" }}>Nicio activitate</div>
                    ) : data.activity.map((a) => {
                      const at = ACTION_TYPE_MAP[a.action] || { icon: "\u{1F4CB}", colorClass: "var(--text-muted)" };
                      return (
                        <div
                          className="py-3 first:pt-0 transition-colors"
                          style={{ borderBottom: "1px solid var(--border)" }}
                          key={a.id}
                        >
                          <div className="text-[11px] font-mono mb-0.5 flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                            <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: at.colorClass }} />
                            {timeAgo(a.createdAt)}
                          </div>
                          <div className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{a.userName && <strong style={{ color: "var(--text-primary)" }}>{a.userName}: </strong>}{ACTION_LABELS[a.action] || a.action}{a.details?.name ? ` — ${a.details.name}` : ""}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
