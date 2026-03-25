"use client";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

import { StatusBadge } from "@/components/ui/StatusBadge";
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

const pct = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0;

/* ─── Mini progress bar ─── */
function MiniProgress({ value, total, color = "#4d8bff" }: { value: number; total: number; color?: string }) {
  const p = pct(value, total);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, height: 4, background: "#f1f5f9", borderRadius: 2, overflow: "hidden", minWidth: 48 }}>
        <div style={{ width: `${p}%`, height: "100%", borderRadius: 2, background: color, transition: "width .4s ease" }} />
      </div>
      <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: "#94a3b8", minWidth: 32 }}>{value}/{total}</span>
    </div>
  );
}

/* ─── Radial progress (for Rata succes) ─── */
function RadialProgress({ value, size = 52, stroke = 5 }: { value: number; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const color = value >= 70 ? "#059669" : value >= 40 ? "#d97706" : "#ef4444";
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset .6s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color, fontFamily: "'JetBrains Mono', monospace" }}>
        {value}%
      </div>
    </div>
  );
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
  const approvalRate = stats?.approvalRate ?? 0;

  return (
    <>
      <style>{`
        .db-page{animation:dbFadeIn .25s ease-out;padding:32px 40px 48px}
        @keyframes dbFadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}

        /* ─── Welcome header ─── */
        .db-welcome{margin-bottom:32px}
        .db-greeting{font-size:26px;font-weight:800;color:#0f172a;letter-spacing:-.5px;line-height:1.2;font-family:'Inter',system-ui,sans-serif}
        .db-subtitle{font-size:13px;color:#94a3b8;margin-top:6px;font-weight:500}

        /* ─── Quick actions ─── */
        .db-actions{display:flex;gap:10px;margin-top:16px}
        .db-action{display:inline-flex;align-items:center;gap:6px;padding:7px 16px;border-radius:10px;border:1px solid #e2e8f0;background:#fff;color:#475569;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s;font-family:'Inter',system-ui,sans-serif}
        .db-action:hover{border-color:#cbd5e1;background:#f8fafc;color:#0f172a;box-shadow:0 1px 3px rgba(0,0,0,.04)}

        /* ─── Stat cards row ─── */
        .db-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:32px}
        .db-stat{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:20px 22px;transition:all .2s;position:relative;overflow:hidden}
        .db-stat:hover{border-color:#cbd5e1;box-shadow:0 4px 24px rgba(0,0,0,.04);transform:translateY(-1px)}
        .db-stat-icon{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:18px;margin-bottom:14px;position:relative}
        .db-stat-value{font-size:32px;font-weight:800;color:#0f172a;letter-spacing:-.5px;line-height:1;font-family:'Inter',system-ui,sans-serif}
        .db-stat-label{font-size:13px;color:#64748b;font-weight:600;margin-top:4px}

        /* ─── Content grid ─── */
        .db-grid{display:grid;grid-template-columns:1fr 380px;gap:24px}
        .db-section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between}
        .db-section-action{font-size:12px;font-weight:600;color:#4d8bff;cursor:pointer;text-transform:none;letter-spacing:0}
        .db-section-action:hover{text-decoration:underline}

        /* ─── Project cards ─── */
        .db-project{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:18px 20px;margin-bottom:10px;cursor:pointer;transition:all .2s;position:relative}
        .db-project:hover{border-color:#cbd5e1;box-shadow:0 4px 20px rgba(0,0,0,.04);transform:translateY(-1px)}
        .db-project:last-child{margin-bottom:0}
        .db-project-top{display:flex;align-items:center;gap:10px;margin-bottom:8px}
        .db-project-name{font-size:15px;font-weight:700;color:#0f172a;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .db-project-meta{font-size:12px;color:#94a3b8;display:flex;align-items:center;gap:6px;margin-bottom:10px}
        .db-project-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
        .db-project-metric{display:flex;flex-direction:column;gap:3px}
        .db-project-metric-label{font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px}
        .db-project-arrow{position:absolute;right:16px;top:50%;transform:translateY(-50%);color:#cbd5e1;transition:color .15s}
        .db-project:hover .db-project-arrow{color:#94a3b8}

        /* ─── Right column cards ─── */
        .db-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;margin-bottom:20px}
        .db-card:last-child{margin-bottom:0}

        /* ─── Deadlines ─── */
        .db-deadline{display:flex;align-items:center;gap:14px;padding:14px 18px;border-bottom:1px solid #f1f5f9;transition:background .1s}
        .db-deadline:last-child{border-bottom:none}
        .db-deadline:hover{background:#fafbfc}
        .db-deadline-days{font-size:14px;font-weight:800;font-family:'JetBrains Mono',monospace;min-width:32px;text-align:center}
        .db-deadline-days.urgent{color:#ef4444}
        .db-deadline-days.normal{color:#64748b}
        .db-deadline-event{font-size:13px;font-weight:600;color:#0f172a}
        .db-deadline-project{font-size:11px;color:#94a3b8;margin-top:2px}

        /* ─── Activity timeline ─── */
        .db-activity{position:relative;padding:4px 0}
        .db-activity-item{display:flex;gap:14px;padding:12px 18px;border-bottom:1px solid #f1f5f9;transition:background .1s;position:relative}
        .db-activity-item:last-child{border-bottom:none}
        .db-activity-item:hover{background:#fafbfc}
        .db-activity-dot{width:32px;height:32px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;background:#f8fafc;border:1px solid #e2e8f0}
        .db-activity-text{font-size:13px;color:#475569;line-height:1.5}
        .db-activity-text strong{font-weight:600;color:#0f172a}
        .db-activity-time{font-size:11px;color:#cbd5e1;font-weight:500;margin-top:2px}

        /* ─── Empty states ─── */
        .db-empty{padding:40px 20px;text-align:center;color:#94a3b8}
        .db-empty-icon{font-size:32px;opacity:.4;margin-bottom:8px}
        .db-empty-text{font-size:13px;font-weight:500}
        .db-empty-cta{margin-top:12px;display:inline-flex;align-items:center;gap:6px;padding:8px 20px;border-radius:10px;background:#4d8bff;color:#fff;font-size:13px;font-weight:600;cursor:pointer;border:none;transition:all .15s;font-family:'Inter',system-ui,sans-serif}
        .db-empty-cta:hover{background:#3b7aed;box-shadow:0 4px 16px rgba(77,139,255,.25)}

        /* ─── Loading skeleton ─── */
        .db-skel{background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%);background-size:200% 100%;animation:dbSkelShine 1.5s infinite;border-radius:10px}
        @keyframes dbSkelShine{0%{background-position:200% 0}100%{background-position:-200% 0}}
      `}</style>

      <div className="db-page">
        {/* ─── WELCOME ─── */}
        <div className="db-welcome">
          <h1 className="db-greeting">Bun venit, {userName}</h1>
          <p className="db-subtitle">{cabinetName} &middot; Panou de control</p>
          <div className="db-actions">
            <button className="db-action" onClick={() => router.push("/companies")}>
              <span style={{ fontSize: 15 }}>{"\u{1F3E2}"}</span> Adaugă firmă
            </button>
            <button className="db-action" onClick={() => router.push("/projects")}>
              <span style={{ fontSize: 15 }}>{"\u{1F4C1}"}</span> Proiect nou
            </button>
            <button className="db-action" onClick={() => router.push("/documents")}>
              <span style={{ fontSize: 15 }}>{"\u{1F4C4}"}</span> Documente
            </button>
          </div>
        </div>

        {error && (
          <div style={{ marginBottom: 20, padding: "14px 18px", borderRadius: 12, border: "1px solid rgba(239,68,68,.3)", background: "rgba(239,68,68,.05)", color: "#dc2626", fontSize: 13, fontWeight: 500 }}>
            Eroare: {error}
          </div>
        )}

        {/* ─── STAT CARDS ─── */}
        {loading ? (
          <div className="db-stats">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="db-stat">
                <div className="db-skel" style={{ width: 40, height: 40, marginBottom: 14 }} />
                <div className="db-skel" style={{ width: 60, height: 28, marginBottom: 8 }} />
                <div className="db-skel" style={{ width: 80, height: 14 }} />
              </div>
            ))}
          </div>
        ) : (
          <div className="db-stats">
            <div className="db-stat">
              <div className="db-stat-icon" style={{ background: "rgba(37,99,235,.08)", border: "1px solid rgba(37,99,235,.15)" }}>
                {"\u{1F3E2}"}
              </div>
              <div className="db-stat-value">{stats?.companies ?? 0}</div>
              <div className="db-stat-label">Firme</div>
            </div>
            <div className="db-stat">
              <div className="db-stat-icon" style={{ background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.15)" }}>
                {"\u{1F4C1}"}
              </div>
              <div className="db-stat-value">{stats?.projects ?? 0}</div>
              <div className="db-stat-label">Proiecte active</div>
            </div>
            <div className="db-stat">
              <div className="db-stat-icon" style={{ background: "rgba(5,150,105,.08)", border: "1px solid rgba(5,150,105,.15)" }}>
                {"\u2705"}
              </div>
              <div className="db-stat-value">{stats?.documents ?? 0}</div>
              <div className="db-stat-label">Documente</div>
            </div>
            <div className="db-stat" style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <RadialProgress value={approvalRate} />
              <div>
                <div className="db-stat-label" style={{ marginTop: 0, marginBottom: 2 }}>Rata succes</div>
                <div style={{ fontSize: 11, color: "#cbd5e1", fontWeight: 500 }}>aprobări depuse</div>
              </div>
            </div>
          </div>
        )}

        {/* ─── CONTENT GRID ─── */}
        {!loading && (
          <div className="db-grid">
            {/* ─── LEFT: Recent projects ─── */}
            <div>
              <div className="db-section-title">
                Proiecte recente
                {data?.recentProjects && data.recentProjects.length > 0 && (
                  <span className="db-section-action" onClick={() => router.push("/projects")}>Vezi toate</span>
                )}
              </div>

              {(!data?.recentProjects || data.recentProjects.length === 0) ? (
                <div className="db-card">
                  <div className="db-empty">
                    <div className="db-empty-icon">{"\u{1F4C1}"}</div>
                    <div className="db-empty-text">Niciun proiect încă</div>
                    <button className="db-empty-cta" onClick={() => router.push("/projects")}>
                      + Creează primul proiect
                    </button>
                  </div>
                </div>
              ) : (
                data.recentProjects.map(p => {
                  const hasMetrics = (p.eligTotal ?? 0) > 0 || (p.elemTotal ?? 0) > 0 || (p.checkTotal ?? 0) > 0;
                  return (
                    <div key={p.id} className="db-project" onClick={() => router.push(`/projects/${p.id}`)}>
                      <div className="db-project-top">
                        <span className="db-project-name">{p.name}</span>
                        <StatusBadge status={p.status} />
                      </div>
                      <div className="db-project-meta">
                        <span>{p.firma}</span>
                        {p.program && <><span style={{ color: "#e2e8f0" }}>&middot;</span><span>{p.program}</span></>}
                      </div>
                      {hasMetrics && (
                        <div className="db-project-metrics">
                          {(p.eligTotal ?? 0) > 0 && (
                            <div className="db-project-metric">
                              <span className="db-project-metric-label">Eligibilitate</span>
                              <MiniProgress value={p.eligibility ?? 0} total={p.eligTotal!} color={pct(p.eligibility ?? 0, p.eligTotal!) >= 80 ? "#059669" : "#d97706"} />
                            </div>
                          )}
                          {(p.elemTotal ?? 0) > 0 && (
                            <div className="db-project-metric">
                              <span className="db-project-metric-label">Elemente</span>
                              <MiniProgress value={p.elements ?? 0} total={p.elemTotal!} color="#4d8bff" />
                            </div>
                          )}
                          {(p.checkTotal ?? 0) > 0 && (
                            <div className="db-project-metric">
                              <span className="db-project-metric-label">Checklist</span>
                              <MiniProgress value={p.checkDone ?? 0} total={p.checkTotal!} color="#a78bfa" />
                            </div>
                          )}
                        </div>
                      )}
                      <svg className="db-project-arrow" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </div>
                  );
                })
              )}
            </div>

            {/* ─── RIGHT: Deadlines + Activity ─── */}
            <div>
              {/* Deadlines */}
              <div className="db-section-title">Termene apropiate</div>
              <div className="db-card">
                {(!data?.deadlines || data.deadlines.length === 0) ? (
                  <div className="db-empty" style={{ padding: "28px 16px" }}>
                    <div className="db-empty-icon">{"\u{1F4C5}"}</div>
                    <div className="db-empty-text">Niciun termen apropiat</div>
                  </div>
                ) : (
                  data.deadlines.map((d, i) => (
                    <div key={i} className="db-deadline">
                      <div className={`db-deadline-days ${d.urgent ? "urgent" : "normal"}`}>
                        {d.daysLeft}z
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="db-deadline-event">{d.event}</div>
                        <div className="db-deadline-project">{d.project}</div>
                      </div>
                      {d.urgent && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "rgba(239,68,68,.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,.2)", textTransform: "uppercase", letterSpacing: ".4px" }}>Urgent</span>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Activity */}
              <div className="db-section-title" style={{ marginTop: 24 }}>Activitate recentă</div>
              <div className="db-card">
                {(!data?.activity || data.activity.length === 0) ? (
                  <div className="db-empty" style={{ padding: "28px 16px" }}>
                    <div className="db-empty-icon">{"\u{1F4AC}"}</div>
                    <div className="db-empty-text">Nicio activitate</div>
                  </div>
                ) : (
                  <div className="db-activity">
                    {data.activity
                      .filter(a => isSignificantAction(a.action))
                      .slice(0, 8)
                      .map(a => {
                        const h = humanizeAction(a.action);
                        return (
                          <div key={a.id} className="db-activity-item">
                            <div className="db-activity-dot">{h.icon}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="db-activity-text">
                                {a.userName && <strong>{a.userName} </strong>}
                                {h.text}
                              </div>
                              <div className="db-activity-time">{formatRelativeTime(a.createdAt)}</div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
