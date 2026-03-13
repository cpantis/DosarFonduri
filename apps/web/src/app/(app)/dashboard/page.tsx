"use client";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

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

const STATUS_MAP: Record<string, { label: string; classes: string }> = {
  draft: { label: "Ciorna", classes: "bg-slate-100 text-slate-600" },
  in_progress: { label: "In lucru", classes: "bg-blue-50 text-blue-700" },
  review: { label: "Verificare", classes: "bg-amber-50 text-amber-700" },
  submitted: { label: "Depus", classes: "bg-purple-50 text-purple-700" },
  approved: { label: "Aprobat", classes: "bg-emerald-50 text-emerald-700" },
  rejected: { label: "Respins", classes: "bg-red-50 text-red-700" },
};

const ACTION_TYPE_MAP: Record<string, { icon: string; colorClass: string }> = {
  "element.extracted": { icon: "\u{1F916}", colorClass: "bg-blue-500" },
  "eligibility.checked": { icon: "\u2705", colorClass: "bg-emerald-500" },
  "document.generated": { icon: "\u{1F4C4}", colorClass: "bg-purple-500" },
  "company.created": { icon: "\u{1F3E2}", colorClass: "bg-amber-500" },
  "project.created": { icon: "\u{1F4C1}", colorClass: "bg-blue-500" },
  "document.uploaded": { icon: "\u{1F4E4}", colorClass: "bg-orange-500" },
  "user.login": { icon: "\u{1F511}", colorClass: "bg-slate-400" },
};

const STAT_ICON_STYLES = [
  "bg-blue-50 text-blue-600",
  "bg-amber-50 text-amber-600",
  "bg-emerald-50 text-emerald-600",
  "bg-red-50 text-red-600",
];

const STAT_VALUE_COLORS = [
  "text-blue-600",
  "text-amber-600",
  "text-emerald-600",
  "text-red-600",
];

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
    if (percent === 100) return "bg-emerald-500";
    if (percent > 0) return "bg-amber-500";
    return "bg-red-500";
  }
  if (percent === 100) return "bg-emerald-500";
  if (percent > 50) return "bg-blue-500";
  return "bg-orange-500";
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
  const STATS = [
    { label: "Firme", value: stats?.companies ?? "\u2013", icon: "\u{1F3E2}" },
    { label: "Proiecte active", value: stats?.projects ?? "\u2013", icon: "\u{1F4C1}" },
    { label: "Conforme", value: stats?.documents ?? "\u2013", icon: "\u{1F4C4}" },
    { label: "Blocate", value: stats ? `${stats.approvalRate}%` : "\u2013", icon: "\u{1F6A8}" },
  ];

  return (
    <div className="px-8 py-6 max-w-7xl mx-auto">
      {/* Topbar */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Panou</h1>
        <div className="flex items-center gap-3">
          {organization && (
            <button className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg px-4 py-2 text-[13px] cursor-pointer">
              <span>&#127970;</span>
              <span className="font-semibold text-slate-900">{organization.name}</span>
              <span className="text-slate-400">&#9662;</span>
            </button>
          )}
          <div className="relative flex items-center justify-center w-10 h-10 rounded-full border border-slate-200 bg-white hover:border-slate-300 cursor-pointer text-base">
            &#128276;
            {(data?.deadlines?.length ?? 0) > 0 && (
              <div className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white" />
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-72">
          <div className="text-[13px] text-slate-500">Se incarca...</div>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mb-6 max-[768px]:grid-cols-2">
            {STATS.map((s, i) => (
              <div key={i} className="flex items-center gap-3.5 bg-white rounded-xl border border-slate-200 p-5 hover:border-slate-300 hover:shadow-sm transition-all">
                <div className={`flex items-center justify-center flex-shrink-0 w-10 h-10 rounded-[10px] text-lg ${STAT_ICON_STYLES[i]}`}>
                  {s.icon}
                </div>
                <div className="min-w-0">
                  <div className={`text-3xl font-bold leading-none tracking-tight ${STAT_VALUE_COLORS[i]}`}>{s.value}</div>
                  <div className="text-[13px] text-slate-500 mt-1 font-medium">{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-[1fr_380px] gap-6 max-[1200px]:grid-cols-1">
            {/* LEFT: Projects table */}
            <div className="min-w-0">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">&#128193; Proiecte recente</h2>
                <button className="text-[13px] font-semibold text-blue-600 hover:text-blue-700 cursor-pointer" onClick={() => router.push("/projects")}>Vezi toate &rarr;</button>
              </div>
              <div className="w-full bg-white rounded-xl border border-slate-200 overflow-hidden">
                {/* Header row */}
                <div className="grid grid-cols-[1fr_140px_100px_100px_100px_100px] items-center px-5 py-3 bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <div>Proiect / Firma</div><div>Program</div><div>Status</div><div>Eligibilitate</div><div>Elemente</div><div>Actualizat</div>
                </div>
                {(!data?.recentProjects || data.recentProjects.length === 0) ? (
                  <div className="py-10 text-center text-[13px] text-slate-500">
                    Niciun proiect inca.{" "}
                    <span className="cursor-pointer text-blue-600 font-semibold hover:text-blue-700" onClick={() => router.push("/projects")}>Creeaza primul proiect</span>
                  </div>
                ) : data.recentProjects.map(p => {
                  const st = STATUS_MAP[p.status] || STATUS_MAP.draft;
                  const eligPct = pct(p.eligibility, p.eligTotal);
                  const elemPct = pct(p.elements, p.elemTotal);
                  return (
                    <div
                      className="grid grid-cols-[1fr_140px_100px_100px_100px_100px] items-center px-5 py-3.5 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 cursor-pointer transition-colors"
                      key={p.id}
                      onClick={() => router.push(`/projects/${p.id}`)}
                    >
                      <div>
                        <div className="text-sm font-semibold text-slate-900 leading-snug mb-0.5">{p.name}</div>
                        <div className="text-xs text-slate-400 leading-snug">{p.firma}</div>
                      </div>
                      <div className="text-xs text-slate-500 font-mono">{p.program}</div>
                      <div><span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-semibold ${st.classes}`}>{st.label}</span></div>
                      <div>
                        <div className="h-[5px] rounded-full bg-slate-100 overflow-hidden w-full">
                          <div className={`h-full rounded-full transition-all duration-300 ${barColor(eligPct, "elig")}`} style={{ width: `${eligPct}%` }} />
                        </div>
                        <div className="text-[11px] font-mono font-semibold text-slate-500 mt-1">{p.eligibility}/{p.eligTotal}</div>
                      </div>
                      <div>
                        <div className="h-[5px] rounded-full bg-slate-100 overflow-hidden w-full">
                          <div className={`h-full rounded-full transition-all duration-300 ${barColor(elemPct, "elem")}`} style={{ width: `${elemPct}%` }} />
                        </div>
                        <div className="text-[11px] font-mono font-semibold text-slate-500 mt-1">{p.elements}/{p.elemTotal}</div>
                      </div>
                      <div className="text-xs text-slate-400">{timeAgo(p.updatedAt)}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RIGHT: Deadlines + Activity */}
            <div className="flex flex-col gap-6">
              {/* Deadlines */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 text-sm font-bold text-slate-900 flex items-center gap-2">&#128197; Termene apropiate</div>
                {(!data?.deadlines || data.deadlines.length === 0) ? (
                  <div className="py-5 text-center text-[13px] text-slate-500">Niciun termen apropiat</div>
                ) : data.deadlines.map((d, i) => (
                  <div className="flex gap-3.5 px-5 py-3 border-b border-slate-100 last:border-b-0" key={i}>
                    <div className={`min-w-[56px] text-[13px] font-bold font-mono ${d.urgent ? "text-red-500" : "text-slate-500"}`}>
                      {d.daysLeft <= 0 ? "Azi" : `${d.daysLeft}z`}
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold text-slate-900 leading-snug mb-0.5">{d.event}</div>
                      <div className="text-xs text-slate-400">{d.project}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Activity */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 text-sm font-bold text-slate-900 flex items-center gap-2">&#128225; Activitate recenta</div>
                <div className="max-h-[360px] overflow-y-auto">
                  {(!data?.activity || data.activity.length === 0) ? (
                    <div className="py-5 text-center text-[13px] text-slate-500">Nicio activitate</div>
                  ) : data.activity.map((a) => {
                    const at = ACTION_TYPE_MAP[a.action] || { icon: "\u{1F4CB}", colorClass: "bg-slate-400" };
                    return (
                      <div className="px-5 py-3 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors" key={a.id}>
                        <div className="text-[11px] font-mono text-slate-400 mb-0.5 flex items-center gap-1.5">
                          <span className={`w-[7px] h-[7px] rounded-full flex-shrink-0 ${at.colorClass}`} />
                          {timeAgo(a.createdAt)}
                        </div>
                        <div className="text-[13px] text-slate-700 leading-relaxed">{a.userName && <strong>{a.userName}: </strong>}{a.action}{a.entityType ? ` (${a.entityType})` : ""}</div>
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
  );
}
