"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { getInitials } from "@/lib/utils";

// ─── Types ───
interface OrgUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "consultant" | "viewer";
  status: string;
  createdAt: string;
  lastActiveAt: string | null;
  projectCount: number;
}

interface AuditEntry {
  id: string;
  userName: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: any;
  createdAt: string;
}

const ROLES: Record<string, { label: string; color: string; bg: string; perms: string[] }> = {
  admin: {
    label: "Administrator",
    color: "var(--accent-purple)",
    bg: "rgba(167,139,250,0.12)",
    perms: ["Toate permisiunile", "Gestionare utilizatori", "Configurari", "Stergere proiecte", "Export date", "Facturare"],
  },
  consultant: {
    label: "Consultant",
    color: "var(--accent-blue)",
    bg: "rgba(77,139,255,0.12)",
    perms: ["Creare/editare proiecte", "Solomon & Neemia", "Upload documente", "Validare elemente", "Export proiecte proprii"],
  },
  viewer: {
    label: "Vizualizare",
    color: "var(--accent-green)",
    bg: "rgba(52,211,153,0.12)",
    perms: ["Vizualizare proiecte", "Vizualizare documente", "Fara editare", "Fara upload"],
  },
};

const AVATAR_COLORS: Record<string, string> = {
  admin: "var(--accent-purple)",
  consultant: "var(--accent-blue)",
  viewer: "var(--accent-green)",
};

const AUDIT_ICONS: Record<string, string> = {
  create: "+",
  upload: "^",
  sync: "~",
  template: "T",
  user: "U",
  check: "V",
  billing: "$",
  config: "*",
  submit: ">",
};

const TABS = [
  { id: "users", icon: "👥", label: "Utilizatori" },
  { id: "costs", icon: "💰", label: "Audit AI / Costuri" },
  { id: "audit", icon: "📋", label: "Jurnal activitate" },
];

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "Acum";
  if (diff < 3600) return `Acum ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Acum ${Math.floor(diff / 3600)} ore`;
  return d.toLocaleDateString("ro-RO", { day: "numeric", month: "short" });
}

export default function AdminPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("users");
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("consultant");
  const [loading, setLoading] = useState(true);

  // Costs state
  const [costs, setCosts] = useState<any>(null);

  // Audit state
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditFilter, setAuditFilter] = useState("all");

  const loadUsers = useCallback(async () => {
    try {
      const data = await apiGet("/api/admin/users");
      setUsers(data);
    } catch {
      // Will show empty state
    }
  }, []);

  const loadCosts = useCallback(async () => {
    try {
      const data = await apiGet("/api/admin/ai-costs");
      setCosts(data);
    } catch {
      // silent
    }
  }, []);

  const loadAudit = useCallback(async () => {
    try {
      const data = await apiGet(`/api/admin/audit-log?type=${auditFilter}`);
      setAuditLogs(data.logs);
      setAuditTotal(data.total);
    } catch {
      // silent
    }
  }, [auditFilter]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await loadUsers();
      setLoading(false);
    };
    load();
  }, [loadUsers]);

  useEffect(() => {
    if (activeTab === "costs") loadCosts();
    if (activeTab === "audit") loadAudit();
  }, [activeTab, loadCosts, loadAudit]);

  const handleInvite = async () => {
    if (!inviteEmail.includes("@")) return;
    try {
      await apiPost("/api/admin/users", { email: inviteEmail, role: inviteRole });
      setShowInvite(false);
      setInviteEmail("");
      await loadUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    try {
      await apiPut(`/api/admin/users/${userId}`, { role: newRole });
      await loadUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleToggleStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === "disabled" ? "active" : "disabled";
    try {
      await apiPut(`/api/admin/users/${userId}`, { status: newStatus });
      await loadUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Check if current user is admin
  if (user?.role !== "admin") {
    return (
      <>
        <div className="flex items-center gap-4 flex-shrink-0" style={{ padding: "18px 32px", borderBottom: "1px solid var(--border)", background: "var(--bg-surface)" }}>
          <div className="flex-1" style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.4px" }}>Administrare</div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-4">🔒</div>
            <div className="text-lg font-bold mb-2" style={{ color: "var(--text-primary)" }}>Acces restrictionat</div>
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>Doar administratorii au acces la acest panou.</div>
          </div>
        </div>
      </>
    );
  }

  const selUser = users.find((u) => u.id === selectedUser);

  return (
    <>
      <style>{`
        .admin-tabs{display:flex;border-bottom:1px solid var(--border);padding:0 32px;background:var(--bg-surface);flex-shrink:0}
        .admin-tab{padding:12px 20px;font-size:13px;font-weight:600;color:var(--text-secondary);cursor:pointer;border-bottom:2px solid transparent;transition:all .15s;font-family:var(--font-sans);background:none;border-top:none;border-left:none;border-right:none;display:flex;align-items:center;gap:8px}
        .admin-tab:hover{color:var(--text-primary)}.admin-tab.on{color:var(--accent-blue);border-bottom-color:var(--accent-blue)}
        .admin-tab .tab-count{font-size:11px;font-family:var(--font-mono);background:var(--bg-elevated);padding:1px 7px;border-radius:8px;color:var(--text-muted)}
        .user-card{display:flex;align-items:center;gap:16px;padding:16px 20px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-surface);margin-bottom:8px;cursor:pointer;transition:all .15s}
        .user-card:hover{border-color:var(--border-active);background:var(--bg-elevated)}
        .user-card.active{border-color:var(--accent-blue);background:rgba(77,139,255,.04)}
        .u-detail{padding:20px;border-radius:var(--r-md);border:1px solid var(--accent-blue);background:rgba(77,139,255,.03);margin-top:8px;margin-bottom:8px}
        .ud-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px}
        .ud-cell{padding:10px 12px;background:var(--bg-deep);border-radius:var(--r-sm);border:1px solid var(--border)}
        .cost-card{padding:14px 16px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-surface)}
        .cost-table-wrap{border:1px solid var(--border);border-radius:var(--r-md);overflow:hidden;background:var(--bg-surface)}
        .cost-table{width:100%;border-collapse:collapse;font-size:12px}
        .cost-table th{padding:10px 14px;font-weight:700;color:var(--text-muted);border-bottom:1px solid var(--border);font-size:10px;text-transform:uppercase;letter-spacing:.5px;text-align:center}
        .cost-table td{padding:10px 14px;border-bottom:1px solid var(--separator);font-family:var(--font-mono);color:var(--text-secondary);text-align:center}
        .cost-table tbody tr{transition:background .12s}.cost-table tbody tr:hover{background:var(--bg-hover)}
        .cost-table tfoot td{border-top:2px solid var(--accent-blue);border-bottom:none;color:var(--text-primary)}
        .pill-group{display:flex;background:var(--bg-deep);border-radius:var(--r-md);padding:2px;gap:1px}
        .pill{padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;border:none;cursor:pointer;background:transparent;color:var(--text-muted);font-family:var(--font-sans);transition:all .15s}
        .pill:hover{color:var(--text-secondary)}.pill.on{background:var(--accent-blue);color:#fff}
        .audit-item{display:flex;align-items:flex-start;gap:12px;padding:12px 16px;border-radius:var(--r-sm);transition:background .12s}
        .audit-item:hover{background:var(--bg-surface)}
        .overlay{position:fixed;inset:0;background:var(--overlay-bg);display:flex;align-items:center;justify-content:center;z-index:100;animation:fadeIn .2s}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        .modal{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r-lg);width:460px;padding:28px;animation:slideUp .3s ease}
        @keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      {/* Topbar */}
      <div className="flex items-center gap-4 flex-shrink-0" style={{ padding: "18px 32px", borderBottom: "1px solid var(--border)", background: "var(--bg-surface)" }}>
        <div className="flex-1" style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.4px" }}>Administrare</div>
      </div>

      {/* Tabs */}
      <div className="admin-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`admin-tab ${activeTab === t.id ? "on" : ""}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.icon} {t.label}
            {t.id === "users" && users.length > 0 && <span className="tab-count">{users.length}</span>}
            {t.id === "audit" && auditTotal > 0 && <span className="tab-count">{auditTotal}</span>}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto" style={{ padding: "24px 32px" }}>

        {/* ═══ UTILIZATORI ═══ */}
        {activeTab === "users" && (
          <>
            <div className="flex items-center gap-3 mb-5">
              <div className="text-base font-bold flex-1">
                Echipa — {users.length} utilizatori
              </div>
              <button
                className="px-4 py-2 text-[13px] font-bold text-white flex items-center gap-1.5 cursor-pointer transition-all"
                style={{
                  borderRadius: "var(--r-md)",
                  border: "none",
                  background: "var(--accent-blue)",
                  fontFamily: "var(--font-sans)",
                  boxShadow: "0 2px 12px rgba(77,139,255,.25)",
                }}
                onClick={() => { setShowInvite(true); setInviteEmail(""); setInviteRole("consultant"); }}
              >
                + Invita consultant
              </button>
            </div>

            {users.map((u) => {
              const role = ROLES[u.role] || ROLES.viewer;
              const isActive = selectedUser === u.id;
              return (
                <div key={u.id}>
                  <div
                    className={`user-card ${isActive ? "active" : ""}`}
                    onClick={() => setSelectedUser(isActive ? null : u.id)}
                  >
                    <div
                      className="w-[42px] h-[42px] rounded-full flex items-center justify-center text-[15px] font-bold text-white flex-shrink-0"
                      style={{ background: AVATAR_COLORS[u.role] || "var(--accent-blue)" }}
                    >
                      {getInitials(u.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold flex items-center gap-2">
                        {u.name}
                        <span className="text-[10px] font-bold px-2 py-0.5" style={{ borderRadius: 10, background: role.bg, color: role.color }}>
                          {role.label}
                        </span>
                        <span
                          className="text-[10px] font-bold px-2 py-0.5"
                          style={{
                            borderRadius: 10,
                            background: u.status === "active" ? "rgba(52,211,153,.12)" : u.status === "invited" ? "rgba(251,191,36,.12)" : "rgba(90,100,120,.12)",
                            color: u.status === "active" ? "var(--accent-green)" : u.status === "invited" ? "var(--accent-yellow)" : "var(--text-muted)",
                          }}
                        >
                          {u.status === "active" ? "activ" : u.status === "invited" ? "invitat" : u.status}
                        </span>
                      </div>
                      <div className="text-xs mt-0.5" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                        {u.email}
                      </div>
                      <div className="flex gap-3 mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                        <span>Adaugat: {new Date(u.createdAt).toLocaleDateString("ro-RO")}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-lg font-extrabold" style={{ fontFamily: "var(--font-mono)" }}>{u.projectCount}</div>
                      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>proiecte</div>
                      <div className="text-[11px] mt-1" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                        {timeAgo(u.lastActiveAt)}
                      </div>
                    </div>
                  </div>

                  {isActive && (
                    <div className="u-detail">
                      <div className="text-lg font-extrabold mb-1">{u.name}</div>
                      <div className="text-[13px] mb-3" style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{u.email}</div>
                      <div className="ud-grid">
                        <div className="ud-cell">
                          <div className="text-[10px] font-semibold uppercase mb-0.5" style={{ letterSpacing: ".5px", color: "var(--text-muted)" }}>Rol</div>
                          <div className="text-[13px] font-semibold" style={{ color: role.color }}>{role.label}</div>
                        </div>
                        <div className="ud-cell">
                          <div className="text-[10px] font-semibold uppercase mb-0.5" style={{ letterSpacing: ".5px", color: "var(--text-muted)" }}>Proiecte active</div>
                          <div className="text-[13px] font-semibold">{u.projectCount}</div>
                        </div>
                        <div className="ud-cell">
                          <div className="text-[10px] font-semibold uppercase mb-0.5" style={{ letterSpacing: ".5px", color: "var(--text-muted)" }}>Ultima activitate</div>
                          <div className="text-xs font-semibold">{timeAgo(u.lastActiveAt)}</div>
                        </div>
                      </div>
                      <div className="text-[11px] font-bold uppercase mb-2" style={{ letterSpacing: ".8px", color: "var(--text-muted)" }}>
                        Permisiuni ({role.label})
                      </div>
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {role.perms.map((p, i) => (
                          <span key={i} className="text-[11px] px-2.5 py-1" style={{ borderRadius: "var(--r-sm)", background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                            {p}
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="px-4 py-2 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all"
                          style={{ borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontFamily: "var(--font-sans)" }}
                          onClick={() => {
                            const next = u.role === "admin" ? "consultant" : u.role === "consultant" ? "viewer" : "admin";
                            handleChangeRole(u.id, next);
                          }}
                        >
                          Schimba rol
                        </button>
                        {u.status === "invited" && (
                          <button
                            className="px-4 py-2 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all"
                            style={{ borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontFamily: "var(--font-sans)" }}
                          >
                            Retrimite invitatie
                          </button>
                        )}
                        {u.id !== user?.id && (
                          <button
                            className="px-4 py-2 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all"
                            style={{
                              borderRadius: "var(--r-sm)",
                              border: "1px solid rgba(248,113,113,.25)",
                              background: "transparent",
                              color: "var(--accent-red)",
                              fontFamily: "var(--font-sans)",
                            }}
                            onClick={() => handleToggleStatus(u.id, u.status)}
                          >
                            {u.status === "disabled" ? "Activeaza" : "Dezactiveaza"}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {users.length === 0 && !loading && (
              <div className="text-center py-10" style={{ color: "var(--text-muted)" }}>
                Niciun utilizator gasit.
              </div>
            )}
          </>
        )}

        {/* ═══ AUDIT AI / COSTURI ═══ */}
        {activeTab === "costs" && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-5 gap-3 mb-6">
              <div className="cost-card">
                <div className="text-[11px] font-semibold uppercase mb-1.5" style={{ letterSpacing: ".6px", color: "var(--text-muted)" }}>Total luna curenta</div>
                <div className="text-[22px] font-extrabold" style={{ fontFamily: "var(--font-mono)", letterSpacing: "-1px" }}>
                  ${(costs?.totalMonth || 0).toFixed(2)}
                </div>
                {costs && (
                  <div className="text-xs font-semibold mt-1" style={{ color: costs.totalMonth > costs.totalPrevMonth ? "var(--accent-red)" : "var(--accent-green)" }}>
                    {costs.totalMonth > costs.totalPrevMonth ? "↑" : "↓"} ${Math.abs(costs.totalMonth - costs.totalPrevMonth).toFixed(2)} vs. luna trecuta
                  </div>
                )}
              </div>
              {["solomon", "neemia", "ocr", "ghid_rules"].map((agent) => {
                const agentData = costs?.byAgent?.find((a: any) => a.agent === agent);
                const labels: Record<string, string> = { solomon: "Solomon (Expert Fonduri)", neemia: "Neemia (Generare Dosar)", ocr: "OCR", ghid_rules: "Ghid Reguli" };
                return (
                  <div key={agent} className="cost-card">
                    <div className="text-[11px] font-semibold uppercase mb-1.5" style={{ letterSpacing: ".6px", color: "var(--text-muted)" }}>
                      {labels[agent] || agent}
                    </div>
                    <div className="text-[22px] font-extrabold" style={{ fontFamily: "var(--font-mono)", letterSpacing: "-1px" }}>
                      ${Number(agentData?.totalCost || 0).toFixed(2)}
                    </div>
                    <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                      {costs?.totalMonth > 0 ? Math.round((Number(agentData?.totalCost || 0) / costs.totalMonth) * 100) : 0}% din total
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Distribution bar */}
            {costs && costs.totalMonth > 0 && (
              <div className="mb-6">
                <div className="text-[11px] font-bold uppercase mb-2" style={{ letterSpacing: ".8px", color: "var(--text-muted)" }}>Distributie cost per agent</div>
                <div className="flex overflow-hidden" style={{ height: 12, borderRadius: 6, background: "var(--bg-deep)" }}>
                  {costs.byAgent?.map((a: any) => {
                    const colors: Record<string, string> = { solomon: "var(--accent-blue)", neemia: "var(--accent-purple)", ocr: "var(--accent-orange)", ghid_rules: "var(--accent-yellow)" };
                    const pct = (Number(a.totalCost) / costs.totalMonth) * 100;
                    return <div key={a.agent} style={{ width: `${pct}%`, background: colors[a.agent] || "var(--text-muted)", transition: "width .4s" }} />;
                  })}
                </div>
                <div className="flex gap-4 mt-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {costs.byAgent?.map((a: any) => {
                    const colors: Record<string, string> = { solomon: "var(--accent-blue)", neemia: "var(--accent-purple)", ocr: "var(--accent-orange)", ghid_rules: "var(--accent-yellow)" };
                    const labels: Record<string, string> = { solomon: "Solomon", neemia: "Neemia", ocr: "OCR", ghid_rules: "Ghid Reguli" };
                    return (
                      <span key={a.agent} className="flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-full" style={{ background: colors[a.agent] || "var(--text-muted)" }} />
                        {labels[a.agent] || a.agent}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Distribution by model */}
            {costs?.byModel && costs.byModel.length > 0 && (
              <div className="mb-6">
                <div className="text-[11px] font-bold uppercase mb-2" style={{ letterSpacing: ".8px", color: "var(--text-muted)" }}>Cost per model AI</div>
                <div className="flex overflow-hidden" style={{ height: 12, borderRadius: 6, background: "var(--bg-deep)" }}>
                  {costs.byModel.map((m: any) => {
                    const modelColors: Record<string, string> = {
                      "claude-haiku-4-5-20251001": "var(--accent-green)",
                      "claude-sonnet-4-20250514": "var(--accent-blue)",
                      "claude-opus-4-6": "var(--accent-purple)",
                    };
                    const pct = (Number(m.totalCost) / costs.totalMonth) * 100;
                    return <div key={m.model} style={{ width: `${pct}%`, background: modelColors[m.model] || "var(--accent-orange)", transition: "width .4s" }} />;
                  })}
                </div>
                <div className="flex gap-4 mt-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {costs.byModel.map((m: any) => {
                    const modelColors: Record<string, string> = {
                      "claude-haiku-4-5-20251001": "var(--accent-green)",
                      "claude-sonnet-4-20250514": "var(--accent-blue)",
                      "claude-opus-4-6": "var(--accent-purple)",
                    };
                    const modelNames: Record<string, string> = {
                      "claude-haiku-4-5-20251001": "Haiku",
                      "claude-sonnet-4-20250514": "Sonnet",
                      "claude-opus-4-6": "Opus",
                    };
                    return (
                      <span key={m.model} className="flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-full" style={{ background: modelColors[m.model] || "var(--accent-orange)" }} />
                        {modelNames[m.model] || m.model} — ${Number(m.totalCost).toFixed(2)} ({Number(m.totalCalls)} apeluri)
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Daily chart */}
            {costs?.daily && costs.daily.length > 0 && (
              <div className="mb-6">
                <div className="text-[11px] font-bold uppercase mb-2.5" style={{ letterSpacing: ".8px", color: "var(--text-muted)" }}>Evolutie zilnica</div>
                <div className="flex items-end gap-1.5" style={{ height: 80, padding: "0 4px" }}>
                  {costs.daily.map((d: any, i: number) => {
                    const maxCost = Math.max(...costs.daily.map((x: any) => Number(x.totalCost)));
                    const h = maxCost > 0 ? (Number(d.totalCost) / maxCost) * 100 : 0;
                    return (
                      <div key={i} className="flex flex-col items-center gap-1" style={{ flex: 1 }}>
                        <span className="text-[10px]" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>${Number(d.totalCost).toFixed(2)}</span>
                        <div style={{ width: "100%", height: `${h}%`, minHeight: 4, background: "var(--accent-blue)", borderRadius: "4px 4px 0 0", transition: "height .3s" }} />
                        <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>{d.date}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Per project table */}
            {costs?.byProject && costs.byProject.length > 0 && (
              <>
                <div className="text-[11px] font-bold uppercase mb-2.5" style={{ letterSpacing: ".8px", color: "var(--text-muted)" }}>Cost detaliat per proiect</div>
                <div className="cost-table-wrap">
                  <table className="cost-table">
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>Proiect</th>
                        <th>Agent</th>
                        <th>Apeluri</th>
                        <th>Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costs.byProject.map((p: any, i: number) => (
                        <tr key={i}>
                          <td style={{ textAlign: "left" }}>
                            <div className="font-semibold text-[13px]" style={{ color: "var(--text-primary)" }}>{p.projectName || "N/A"}</div>
                          </td>
                          <td>{p.agent}</td>
                          <td>{p.totalCalls}</td>
                          <td className="font-extrabold" style={{ color: "var(--accent-yellow)" }}>${Number(p.totalCost).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {(!costs || costs.totalMonth === 0) && (
              <div className="text-center py-10" style={{ color: "var(--text-muted)" }}>
                Niciun cost AI inregistrat luna aceasta.
              </div>
            )}
          </>
        )}

        {/* ═══ JURNAL ACTIVITATE ═══ */}
        {activeTab === "audit" && (
          <>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="text-base font-bold flex-1">Jurnal activitate</div>
              <div className="pill-group">
                {[
                  { id: "all", label: "Toate" },
                  { id: "create", label: "Creare" },
                  { id: "upload", label: "Upload" },
                  { id: "user", label: "Utilizatori" },
                  { id: "config", label: "Config" },
                ].map((f) => (
                  <button key={f.id} className={`pill ${auditFilter === f.id ? "on" : ""}`} onClick={() => setAuditFilter(f.id)}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-0.5">
              {auditLogs.map((a) => (
                <div key={a.id} className="audit-item">
                  <div
                    className="w-8 h-8 flex items-center justify-center text-sm flex-shrink-0"
                    style={{ borderRadius: "var(--r-sm)", background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
                  >
                    {AUDIT_ICONS[a.action] || "📋"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold mb-px">{a.action}</div>
                    <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      {a.entityType && `${a.entityType}`}
                      {a.details && typeof a.details === "object" && a.details.description && ` — ${a.details.description}`}
                    </div>
                    <div className="flex gap-2 mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                      <span>👤 {a.userName || "System"}</span>
                      <span>{timeAgo(a.createdAt)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {auditLogs.length === 0 && (
              <div className="text-center py-10" style={{ color: "var(--text-muted)" }}>
                Nicio activitate inregistrata.
              </div>
            )}
          </>
        )}
      </div>

      {/* ═══ INVITE MODAL ═══ */}
      {showInvite && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setShowInvite(false)}>
          <div className="modal">
            <div className="flex justify-between items-center mb-1">
              <div className="text-xl font-extrabold">Invita consultant</div>
              <button
                className="text-lg cursor-pointer"
                style={{ background: "none", border: "none", color: "var(--text-muted)" }}
                onClick={() => setShowInvite(false)}
              >
                ✕
              </button>
            </div>
            <div className="text-sm mb-5" style={{ color: "var(--text-secondary)" }}>
              Trimite o invitatie pe email. Consultantul va primi un link de activare cont.
            </div>

            <div className="mb-4">
              <label className="block text-[11px] font-semibold uppercase mb-1.5" style={{ letterSpacing: ".7px", color: "var(--text-muted)" }}>
                Email
              </label>
              <input
                type="email"
                placeholder="consultant.nou@firma.ro"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm outline-none"
                style={{
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--border)",
                  background: "var(--bg-deep)",
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-sans)",
                }}
              />
            </div>

            <div className="mb-4">
              <label className="block text-[11px] font-semibold uppercase mb-1.5" style={{ letterSpacing: ".7px", color: "var(--text-muted)" }}>
                Rol
              </label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(ROLES).map(([key, role]) => (
                  <div
                    key={key}
                    className="py-3 px-2.5 text-center cursor-pointer transition-all"
                    style={{
                      borderRadius: "var(--r-sm)",
                      border: `2px solid ${inviteRole === key ? "var(--accent-blue)" : "var(--border)"}`,
                      background: inviteRole === key ? "rgba(77,139,255,.04)" : "var(--bg-elevated)",
                    }}
                    onClick={() => setInviteRole(key)}
                  >
                    <div className="text-[13px] font-bold mb-0.5" style={{ color: role.color }}>{role.label}</div>
                    <div className="text-[10px] leading-tight" style={{ color: "var(--text-muted)" }}>{role.perms.slice(0, 2).join(", ")}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2.5 justify-end mt-4">
              <button
                className="px-5 py-2.5 text-sm font-semibold cursor-pointer"
                style={{ borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontFamily: "var(--font-sans)" }}
                onClick={() => setShowInvite(false)}
              >
                Anuleaza
              </button>
              <button
                className="px-5 py-2.5 text-sm font-bold text-white cursor-pointer"
                style={{
                  borderRadius: "var(--r-md)",
                  border: "none",
                  background: "var(--accent-blue)",
                  fontFamily: "var(--font-sans)",
                  opacity: !inviteEmail.includes("@") ? 0.4 : 1,
                }}
                disabled={!inviteEmail.includes("@")}
                onClick={handleInvite}
              >
                Trimite invitatie
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
