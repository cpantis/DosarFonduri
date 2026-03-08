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

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "Ciornă", color: "var(--text-muted)", bg: "rgba(90,100,120,0.12)" },
  in_progress: { label: "În lucru", color: "var(--accent-blue)", bg: "rgba(77,139,255,0.12)" },
  review: { label: "Verificare", color: "var(--accent-yellow)", bg: "rgba(251,191,36,0.12)" },
  submitted: { label: "Depus", color: "var(--accent-green)", bg: "rgba(52,211,153,0.12)" },
  approved: { label: "Aprobat", color: "var(--accent-green)", bg: "rgba(52,211,153,0.12)" },
  rejected: { label: "Respins", color: "var(--accent-red)", bg: "rgba(248,113,113,0.12)" },
};

const ACTION_TYPE_MAP: Record<string, { icon: string; color: string }> = {
  "element.extracted": { icon: "🤖", color: "var(--accent-blue)" },
  "eligibility.checked": { icon: "✅", color: "var(--accent-green)" },
  "document.generated": { icon: "📄", color: "var(--accent-purple)" },
  "company.created": { icon: "🏢", color: "var(--accent-yellow)" },
  "project.created": { icon: "📁", color: "var(--accent-blue)" },
  "document.uploaded": { icon: "📤", color: "var(--accent-orange)" },
  "user.login": { icon: "🔑", color: "var(--text-muted)" },
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
    { label: "Proiecte active", value: stats?.projects ?? "–", change: "", icon: "📁" },
    { label: "Firme gestionate", value: stats?.companies ?? "–", change: "", icon: "🏢" },
    { label: "Documente procesate", value: stats?.documents ?? "–", change: "", icon: "📄" },
    { label: "Rată de aprobare", value: stats ? `${stats.approvalRate}%` : "–", change: "", icon: "🏆" },
  ];

  return (
    <>
      <style>{`
        .dash-grid{display:grid;grid-template-columns:1fr 360px;gap:24px}
        .proj-table{width:100%;border:1px solid var(--border);border-radius:var(--r-md);overflow:hidden;background:var(--bg-surface)}
        .proj-row{display:grid;grid-template-columns:1fr 140px 100px 100px 100px 90px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--border);transition:background .12s;cursor:pointer}
        .proj-row:last-child{border-bottom:none}
        .proj-row:hover{background:var(--bg-hover)}
        .proj-row.header{background:var(--bg-elevated);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--text-muted);cursor:default}
        .proj-row.header:hover{background:var(--bg-elevated)}
        .proj-name{font-size:14px;font-weight:600;margin-bottom:2px}
        .proj-firma{font-size:12px;color:var(--text-muted)}
        .proj-program{font-size:12px;color:var(--text-secondary);font-family:var(--font-mono)}
        .status-badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700}
        .mini-bar{height:4px;border-radius:2px;background:var(--bg-deep);overflow:hidden;width:100%}
        .mini-bar-fill{height:100%;border-radius:2px;transition:width .4s}
        .mini-pct{font-size:11px;font-family:var(--font-mono);font-weight:600;color:var(--text-secondary);margin-top:2px}
        .proj-time{font-size:12px;color:var(--text-muted)}

        .feed-card{border:1px solid var(--border);border-radius:var(--r-md);background:var(--bg-surface);overflow:hidden}
        .feed-header{padding:14px 16px;border-bottom:1px solid var(--border);font-size:14px;font-weight:700;display:flex;align-items:center;gap:8px}
        .feed-scroll{max-height:340px;overflow-y:auto}
        .feed-item{padding:10px 16px;border-bottom:1px solid rgba(42,48,64,.5);transition:background .12s}
        .feed-item:hover{background:var(--bg-hover)}
        .feed-item:last-child{border-bottom:none}
        .feed-time{font-size:11px;font-family:var(--font-mono);color:var(--text-muted);margin-bottom:2px;display:flex;align-items:center;gap:6px}
        .feed-type{width:6px;height:6px;border-radius:50%;flex-shrink:0}
        .feed-text{font-size:13px;color:var(--text-secondary);line-height:1.4}
        .feed-proj{font-size:11px;color:var(--text-muted);margin-top:2px}

        .deadline-item{display:flex;gap:12px;padding:10px 16px;border-bottom:1px solid rgba(42,48,64,.5)}
        .deadline-item:last-child{border-bottom:none}
        .dl-date{min-width:56px;font-size:13px;font-weight:700;font-family:var(--font-mono);color:var(--text-secondary)}
        .dl-date.urgent{color:var(--accent-red)}
        .dl-info{flex:1}
        .dl-event{font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:2px}
        .dl-proj{font-size:12px;color:var(--text-muted)}

        .quick-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px 16px}
        .quick-btn{padding:12px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--bg-elevated);cursor:pointer;transition:all .15s;text-align:center;font-family:var(--font-sans)}
        .quick-btn:hover{border-color:var(--accent-blue);background:rgba(77,139,255,.04)}
        .quick-btn .qb-icon{font-size:20px;margin-bottom:4px}
        .quick-btn .qb-label{font-size:12px;font-weight:600;color:var(--text-secondary)}

        @media(max-width:1200px){.dash-grid{grid-template-columns:1fr}}
        @media(max-width:768px){.stats-responsive{grid-template-columns:repeat(2,1fr)!important}}
      `}</style>

      {/* Topbar */}
      <div className="px-7 py-3.5 flex items-center gap-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-surface)" }}>
        <div className="text-xl font-extrabold flex-1" style={{ letterSpacing: "-.3px" }}>Panou</div>
        {organization && (
          <div className="flex items-center gap-2 px-3.5 py-1.5 text-[13px] cursor-pointer transition-colors" style={{ borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-secondary)" }}>
            <span>&#127970;</span>
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{organization.name}</span>
            <span style={{ color: "var(--text-muted)" }}>&#9662;</span>
          </div>
        )}
        <div className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer relative text-[15px]" style={{ border: "1px solid var(--border)" }}>
          &#128276;
          {(data?.deadlines?.length ?? 0) > 0 && (
            <div className="absolute" style={{ top: 6, right: 6, width: 8, height: 8, borderRadius: "50%", background: "var(--accent-red)", border: "2px solid var(--bg-surface)" }} />
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-7">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>Se încarcă...</div>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-4 stats-responsive gap-4 mb-7">
              {STATS.map((s, i) => (
                <div key={i} className="p-5 transition-all hover:-translate-y-px" style={{ borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="w-9 h-9 flex items-center justify-center text-[17px]" style={{ borderRadius: "var(--r-sm)", background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                      {s.icon}
                    </div>
                  </div>
                  <div className="text-[32px] font-extrabold leading-none" style={{ fontFamily: "var(--font-mono)", letterSpacing: "-1px" }}>{s.value}</div>
                  <div className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div className="dash-grid">
              {/* LEFT: Projects table */}
              <div style={{ minWidth: 0 }}>
                <div className="flex items-center justify-between mb-3.5">
                  <div className="text-base font-bold flex items-center gap-2">&#128193; Proiecte recente</div>
                  <div className="text-[13px] font-semibold cursor-pointer" style={{ color: "var(--accent-blue)" }} onClick={() => router.push("/projects")}>Vezi toate &rarr;</div>
                </div>
                <div className="proj-table">
                  <div className="proj-row header">
                    <div>Proiect / Firmă</div>
                    <div>Program</div>
                    <div>Status</div>
                    <div>Eligibilitate</div>
                    <div>Elemente</div>
                    <div>Actualizat</div>
                  </div>
                  {(!data?.recentProjects || data.recentProjects.length === 0) ? (
                    <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                      Niciun proiect încă. <span className="cursor-pointer" style={{ color: "var(--accent-blue)" }} onClick={() => router.push("/projects")}>Creează primul proiect</span>
                    </div>
                  ) : data.recentProjects.map(p => {
                    const st = STATUS_MAP[p.status] || STATUS_MAP.draft;
                    return (
                      <div className="proj-row" key={p.id} onClick={() => router.push(`/projects/${p.id}`)}>
                        <div>
                          <div className="proj-name">{p.name}</div>
                          <div className="proj-firma">{p.firma}</div>
                        </div>
                        <div className="proj-program">{p.program}</div>
                        <div><span className="status-badge" style={{ background: st.bg, color: st.color }}>{st.label}</span></div>
                        <div>
                          <div className="mini-bar">
                            <div className="mini-bar-fill" style={{
                              width: `${pct(p.eligibility, p.eligTotal)}%`,
                              background: pct(p.eligibility, p.eligTotal) === 100 ? "var(--accent-green)" : pct(p.eligibility, p.eligTotal) > 0 ? "var(--accent-yellow)" : "var(--accent-red)"
                            }} />
                          </div>
                          <div className="mini-pct">{p.eligibility}/{p.eligTotal}</div>
                        </div>
                        <div>
                          <div className="mini-bar">
                            <div className="mini-bar-fill" style={{
                              width: `${pct(p.elements, p.elemTotal)}%`,
                              background: pct(p.elements, p.elemTotal) === 100 ? "var(--accent-green)" : pct(p.elements, p.elemTotal) > 50 ? "var(--accent-blue)" : "var(--accent-orange)"
                            }} />
                          </div>
                          <div className="mini-pct">{p.elements}/{p.elemTotal}</div>
                        </div>
                        <div className="proj-time">{timeAgo(p.updatedAt)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* RIGHT: Feed + Deadlines */}
              <div className="flex flex-col gap-5">
                {/* Quick Actions */}
                <div className="feed-card">
                  <div className="feed-header">&#9889; Acțiuni rapide</div>
                  <div className="quick-grid">
                    <div className="quick-btn" onClick={() => router.push("/projects")}><div className="qb-icon">&#10133;</div><div className="qb-label">Proiect nou</div></div>
                    <div className="quick-btn" onClick={() => router.push("/companies")}><div className="qb-icon">&#127970;</div><div className="qb-label">Firmă nouă</div></div>
                    <div className="quick-btn" onClick={() => router.push("/documents")}><div className="qb-icon">&#128228;</div><div className="qb-label">Upload doc</div></div>
                    <div className="quick-btn"><div className="qb-icon">&#129302;</div><div className="qb-label">Solomon</div></div>
                  </div>
                </div>

                {/* Deadlines */}
                <div className="feed-card">
                  <div className="feed-header">&#128197; Termene apropiate</div>
                  {(!data?.deadlines || data.deadlines.length === 0) ? (
                    <div className="p-4 text-center text-sm" style={{ color: "var(--text-muted)" }}>Niciun termen apropiat</div>
                  ) : data.deadlines.map((d, i) => (
                    <div className="deadline-item" key={i}>
                      <div className={`dl-date ${d.urgent ? "urgent" : ""}`}>
                        {d.daysLeft <= 0 ? "Azi" : `${d.daysLeft}z`}
                      </div>
                      <div className="dl-info">
                        <div className="dl-event">{d.event}</div>
                        <div className="dl-proj">{d.project}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Activity Feed */}
                <div className="feed-card">
                  <div className="feed-header">&#128225; Activitate recentă</div>
                  <div className="feed-scroll">
                    {(!data?.activity || data.activity.length === 0) ? (
                      <div className="p-4 text-center text-sm" style={{ color: "var(--text-muted)" }}>Nicio activitate</div>
                    ) : data.activity.map((a) => {
                      const at = ACTION_TYPE_MAP[a.action] || { icon: "📋", color: "var(--text-muted)" };
                      return (
                        <div className="feed-item" key={a.id}>
                          <div className="feed-time">
                            <span className="feed-type" style={{ background: at.color }} />
                            {timeAgo(a.createdAt)}
                          </div>
                          <div className="feed-text">
                            {a.userName && <strong>{a.userName}: </strong>}
                            {a.action}{a.entityType ? ` (${a.entityType})` : ""}
                          </div>
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
    </>
  );
}
