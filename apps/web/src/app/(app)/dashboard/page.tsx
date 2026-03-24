"use client";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SkeletonStatCard } from "@/components/ui/Skeleton";
import { humanizeAction, isSignificantAction } from "@/lib/auditHelpers";

interface DashboardData {
  stats: { projects: number; companies: number; documents: number; approvalRate?: number };
  recentProjects: Array<{
    id: string; name: string; status: string; updatedAt: string;
    firma: string; program: string;
    eligibility?: number; eligTotal?: number;
    elements?: number; elemTotal?: number;
    checkDone?: number; checkTotal?: number;
    docsGenerated?: number; docsTotal?: number;
  }>;
  activity: Array<{
    id: string; userId: string; userName: string | null;
    action: string; entityType: string | null; entityId: string | null;
    details: any; createdAt: string;
  }>;
  deadlines: Array<{
    date: string; project: string; event: string; urgent: boolean; daysLeft: number;
  }>;
  alerts?: Array<{ message: string }>;
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "Acum";
  if (diffMin < 60) return `${diffMin} min`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return "Ieri";
  if (diffDays < 7) return `${diffDays}z`;
  return date.toLocaleDateString("ro-RO", { day: "numeric", month: "short" });
}

export default function DashboardPage() {
  const { user, organization } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<DashboardData>("/api/dashboard")
      .then(setData)
      .catch((err) => setError(err?.message || "Eroare la încărcarea datelor"))
      .finally(() => setLoading(false));
  }, []);

  const stats = data?.stats;
  const userName = user?.name || user?.email?.split("@")[0] || "Utilizator";
  const cabinetName = organization?.name || "Cabinet";

  return (
    <div className="animate-[fadeIn_.2s_ease-out]">
      <div className="max-w-6xl mx-auto px-8 pt-10 pb-8">
        <div style={{ marginBottom: 28 }}>
          <h1 className="text-[20px] font-semibold text-slate-800 tracking-tight" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
            Bun venit, {userName}
          </h1>
          <p className="text-[13px] text-slate-400 mt-1">{cabinetName} &middot; Panou de control</p>
        </div>
        {error && (
          <div className="mb-4 p-4 rounded-xl border border-red-300/60 bg-red-50/30" style={{ color: "var(--accent-red)" }}>
            <span className="font-medium">Eroare: </span>{error}
          </div>
        )}
        {/* Stat cards */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <SkeletonStatCard /><SkeletonStatCard /><SkeletonStatCard /><SkeletonStatCard />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
            <StatCard icon={"\u{1F3E2}"} label="Firme" value={stats?.companies ?? 0} color="blue" />
            <StatCard icon={"\u{1F4C1}"} label="Proiecte active" value={stats?.projects ?? 0} color="amber" />
            <StatCard icon={"\u2705"} label="Documente" value={stats?.documents ?? 0} color="emerald" />
            <StatCard icon={"\u{1F3AF}"} label="Rata succes" value={stats?.approvalRate != null ? `${stats.approvalRate}%` : "-"} color={(stats?.approvalRate ?? 0) >= 70 ? "emerald" : (stats?.approvalRate ?? 0) >= 50 ? "amber" : "red"} />
          </div>
        )}


        {/* Content grid */}
        {!loading && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
            {/* Recent projects — takes 2 cols */}
            <div className="col-span-2">
              <SectionTitle>Proiecte recente</SectionTitle>
              {(!data?.recentProjects || data.recentProjects.length === 0) ? (
                <EmptyState
                  icon="📁"
                  title="Niciun proiect încă"
                  description="Creează primul proiect pentru a începe pregătirea dosarului de finanțare."
                  actionLabel="Creează primul proiect"
                  onAction={() => router.push("/projects")}
                />
              ) : (
                <div className="space-y-4">
                  {data.recentProjects.map(p => (
                    <div
                      key={p.id}
                      className="bg-white rounded-[12px] border border-slate-200/70 p-4 hover:border-slate-300 transition-all cursor-pointer group flex items-center justify-between overflow-hidden"
                      onClick={() => router.push(`/projects/${p.id}`)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="text-[15px] font-semibold text-slate-900 group-hover:text-blue-600 transition-colors truncate max-w-full">{p.name}</span>
                          <StatusBadge status={p.status} />
                        </div>
                        <div className="text-[13px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                          <span className="truncate max-w-[200px]">{p.firma}</span>
                          {p.program && <><span className="text-slate-300">·</span><span className="text-slate-400 truncate max-w-[200px]">{p.program}</span></>}
                        </div>
                        {(p.eligTotal != null && p.eligTotal > 0) && (
                          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400">
                            <span title="Eligibilitate">✓ {p.eligibility ?? 0}/{p.eligTotal}</span>
                            {p.elemTotal != null && p.elemTotal > 0 && <span title="Elemente">◈ {p.elements ?? 0}/{p.elemTotal}</span>}
                            {p.checkTotal != null && p.checkTotal > 0 && <span title="Checklist">☑ {p.checkDone ?? 0}/{p.checkTotal}</span>}
                            {p.docsTotal != null && p.docsTotal > 0 && <span title="Documente generate">⎙ {p.docsGenerated ?? 0}/{p.docsTotal}</span>}
                          </div>
                        )}
                      </div>
                      <svg className="w-4 h-4 text-slate-300 group-hover:text-slate-400 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right column */}
            <div className="space-y-6">
              {/* Deadlines */}
              <div>
                <SectionTitle>Termene apropiate</SectionTitle>
                <div className="bg-white rounded-[12px] border border-slate-200/70 overflow-hidden">
                  {(!data?.deadlines || data.deadlines.length === 0) ? (
                    <div className="text-[13px] text-slate-400 text-center py-8">Niciun termen apropiat</div>
                  ) : (
                    <div className="divide-y divide-slate-100/80">
                      {data.deadlines.map((d, i) => (
                        <div key={i} className="px-4 py-3 flex items-start gap-3">
                          <span className={`text-[13px] font-bold font-mono tabular-nums mt-0.5 ${d.urgent ? "text-red-600" : "text-slate-500"}`}>{d.daysLeft}z</span>
                          <div className="min-w-0">
                            <div className="text-[13px] font-medium text-slate-900">{d.event}</div>
                            <div className="text-[11px] text-slate-400 mt-0.5">{d.project}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Activity */}
              <div>
                <SectionTitle>Activitate recentă</SectionTitle>
                <div className="bg-white rounded-[12px] border border-slate-200/70 overflow-hidden">
                  {(!data?.activity || data.activity.length === 0) ? (
                    <div className="text-[13px] text-slate-400 text-center py-8">Nicio activitate</div>
                  ) : (
                    <div className="divide-y divide-slate-100/80">
                      {data.activity
                        .filter((a) => isSignificantAction(a.action))
                        .slice(0, 5).map((a) => {
                        const h = humanizeAction(a.action);
                        return (
                          <div key={a.id} className="px-4 py-3 flex items-start gap-3">
                            <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[12px] shrink-0 mt-0.5">
                              {h.icon}
                            </div>
                            <div className="min-w-0">
                              <div className="text-[13px] text-slate-700">
                                {a.userName && <span className="font-medium text-slate-900">{a.userName} </span>}
                                {h.text}
                              </div>
                              <div className="text-[11px] text-slate-400 mt-0.5">{formatRelativeTime(a.createdAt)}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
