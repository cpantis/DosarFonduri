"use client";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTitle } from "@/components/ui/SectionTitle";

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
    <>
      <PageHeader title={`Bun venit, ${userName}`} subtitle={`${cabinetName} · Panou de control`} />
      <div className="max-w-6xl mx-auto px-8 py-6">
        {loading ? (
          <div className="flex items-center justify-center h-72">
            <div className="text-[13px] text-slate-500">Se incarca...</div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-4">
              <StatCard icon="🏢" label="Firme" value={stats?.companies ?? 0} color="blue" />
              <StatCard icon="📁" label="Proiecte active" value={stats?.projects ?? 0} color="amber" />
              <StatCard icon="✅" label="Conforme" value={stats?.documents ?? 0} color="emerald" />
              <StatCard icon="⚠️" label="Blocate" value={stats?.approvalRate ?? 0} color="red" />
            </div>

            <div className="grid grid-cols-3 gap-6 mt-6">
              <div className="col-span-2">
                <SectionTitle>Proiecte recente</SectionTitle>
                {(!data?.recentProjects || data.recentProjects.length === 0) ? (
                  <EmptyState icon="📁" title="Niciun proiect încă" description="Creează primul proiect pentru a începe pregătirea dosarului de finanțare." actionLabel="Creează primul proiect" onAction={() => router.push("/projects")} />
                ) : (
                  <div className="space-y-3">
                    {data.recentProjects.map(p => (
                      <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-sm hover:border-slate-300 transition-all cursor-pointer" onClick={() => router.push(`/projects/${p.id}`)}>
                        <div className="text-[15px] font-semibold text-slate-900">{p.name}</div>
                        <div className="text-[13px] text-slate-500 mt-1">{p.firma}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <SectionTitle>Termene apropiate</SectionTitle>
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  {(!data?.deadlines || data.deadlines.length === 0) ? (
                    <div className="text-sm text-slate-400 italic text-center py-4">Niciun termen apropiat</div>
                  ) : (
                    data.deadlines.map((d, i) => (
                      <div key={i} className="flex gap-3 py-2 border-b border-slate-100 last:border-0">
                        <span className="text-[13px] font-bold font-mono text-slate-600">{d.daysLeft}z</span>
                        <div>
                          <div className="text-[13px] font-semibold text-slate-900">{d.event}</div>
                          <div className="text-[12px] text-slate-400">{d.project}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <SectionTitle>Activitate recentă</SectionTitle>
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  {(!data?.activity || data.activity.length === 0) ? (
                    <div className="text-sm text-slate-400 italic text-center py-4">Nicio activitate</div>
                  ) : (
                    data.activity.slice(0, 5).map((a) => (
                      <div key={a.id} className="py-2 border-b border-slate-100 last:border-0">
                        <div className="text-[13px] text-slate-700">{a.userName && <strong className="text-slate-900">{a.userName}: </strong>}{a.action}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
