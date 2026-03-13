"use client";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SkeletonStatCard } from "@/components/ui/Skeleton";

interface DashboardData {
  stats: { projects: number; companies: number; documents: number; approvalRate: number };
  recentProjects: Array<{
    id: string; name: string; status: string; updatedAt: string;
    firma: string; program: string;
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

  useEffect(() => {
    apiGet<DashboardData>("/api/dashboard")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const stats = data?.stats;
  const userName = user?.name || user?.email?.split("@")[0] || "Utilizator";
  const cabinetName = organization?.name || "Cabinet";

  return (
    <div className="animate-[fadeIn_.2s_ease-out]">
      <PageHeader title={`Bun venit, ${userName}`} subtitle={`${cabinetName} · Panou de control`} />
      <div className="max-w-6xl mx-auto px-8 py-6">
        {/* Stat cards */}
        {loading ? (
          <div className="grid grid-cols-4 gap-4">
            <SkeletonStatCard /><SkeletonStatCard /><SkeletonStatCard /><SkeletonStatCard />
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            <StatCard icon="🏢" label="Firme" value={stats?.companies ?? 0} color="blue" />
            <StatCard icon="📁" label="Proiecte active" value={stats?.projects ?? 0} color="amber" />
            <StatCard icon="✅" label="Conforme" value={stats?.documents ?? 0} color="emerald" />
            <StatCard icon="⚠️" label="Blocate" value={stats?.approvalRate ?? 0} color="red" />
          </div>
        )}

        {/* Content grid */}
        {!loading && (
          <div className="grid grid-cols-3 gap-6 mt-8">
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
                <div className="space-y-2">
                  {data.recentProjects.map(p => (
                    <div
                      key={p.id}
                      className="bg-white rounded-xl border border-slate-200/80 p-4 hover:shadow-sm hover:border-slate-300/80 transition-all cursor-pointer group flex items-center justify-between"
                      onClick={() => router.push(`/projects/${p.id}`)}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2.5">
                          <span className="text-[15px] font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">{p.name}</span>
                          <StatusBadge status={p.status} />
                        </div>
                        <div className="text-[13px] text-slate-500 mt-0.5 flex items-center gap-2">
                          <span>{p.firma}</span>
                          {p.program && <><span className="text-slate-300">·</span><span className="text-slate-400">{p.program}</span></>}
                        </div>
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
                <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden">
                  {(!data?.deadlines || data.deadlines.length === 0) ? (
                    <div className="text-[13px] text-slate-400 text-center py-8">Niciun termen apropiat</div>
                  ) : (
                    <div className="divide-y divide-slate-50">
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
                <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden">
                  {(!data?.activity || data.activity.length === 0) ? (
                    <div className="text-[13px] text-slate-400 text-center py-8">Nicio activitate</div>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {data.activity.slice(0, 5).map((a) => (
                        <div key={a.id} className="px-4 py-3 flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0 mt-0.5">
                            {(a.userName || "?").charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[13px] text-slate-700">
                              {a.userName && <span className="font-medium text-slate-900">{a.userName} </span>}
                              {a.action}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">{formatRelativeTime(a.createdAt)}</div>
                          </div>
                        </div>
                      ))}
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
