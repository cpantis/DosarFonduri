"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { getInitials } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";

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

const ROLES: Record<string, { label: string; color: string; perms: string[] }> = {
  admin: {
    label: "Administrator",
    color: "#4d8bff",
    perms: ["Toate permisiunile", "Gestionare utilizatori", "Configurari", "Stergere proiecte", "Export date", "Facturare"],
  },
  consultant: {
    label: "Consultant",
    color: "#34d399",
    perms: ["Creare/editare proiecte", "Solomon & Neemia", "Upload documente", "Validare elemente", "Export proiecte proprii"],
  },
  viewer: {
    label: "Vizualizare",
    color: "#64748b",
    perms: ["Vizualizare proiecte", "Vizualizare documente", "Fara editare", "Fara upload"],
  },
};

const AVATAR_BG: Record<string, string> = {
  admin: "#a78bfa",
  consultant: "#4d8bff",
  viewer: "#34d399",
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

// Color maps for distribution bars (using inline styles since these are dynamic)
const AGENT_COLORS: Record<string, string> = { solomon: "#4d8bff", neemia: "#a78bfa", ocr: "#fb923c", ghid_rules: "#fbbf24" };
const AGENT_DOT_COLORS: Record<string, string> = { solomon: "#4d8bff", neemia: "#a78bfa", ocr: "#fb923c", ghid_rules: "#fbbf24" };
const MODEL_COLORS: Record<string, string> = {
  "claude-haiku-4-5-20251001": "#34d399",
  "claude-sonnet-4-20250514": "#4d8bff",
  "claude-opus-4-6": "#a78bfa",
};

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
        <PageHeader title="Admin" />
        <div className="flex-1 flex items-center justify-center" style={{ background: "#f8fafc" }}>
          <div className="text-center">
            <div className="text-4xl mb-4">🔒</div>
            <div className="text-lg font-bold mb-2" style={{ color: "#0f172a" }}>Acces restrictionat</div>
            <div className="text-[13px]" style={{ color: "#64748b" }}>Doar administratorii au acces la acest panou.</div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Topbar */}
      <PageHeader title="Admin" />

      {/* Tabs */}
      <div
        className="flex px-8 flex-shrink-0"
        style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            className="px-5 py-3 text-[13px] font-semibold cursor-pointer border-b-2 transition-all flex items-center gap-2 bg-transparent border-t-0 border-l-0 border-r-0"
            style={
              activeTab === t.id
                ? { color: "#4d8bff", borderColor: "#4d8bff" }
                : { color: "#64748b", borderColor: "transparent" }
            }
            onClick={() => setActiveTab(t.id)}
          >
            {t.icon} {t.label}
            {t.id === "users" && users.length > 0 && (
              <span
                className="text-[11px] font-mono px-[7px] py-px rounded-lg"
                style={{ background: "#f8fafc", color: "#64748b" }}
              >
                {users.length}
              </span>
            )}
            {t.id === "audit" && auditTotal > 0 && (
              <span
                className="text-[11px] font-mono px-[7px] py-px rounded-lg"
                style={{ background: "#f8fafc", color: "#64748b" }}
              >
                {auditTotal}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6 max-w-7xl" style={{ background: "#f8fafc" }}>

        {/* ═══ UTILIZATORI ═══ */}
        {activeTab === "users" && (
          <>
            <div className="flex items-center gap-3 mb-5">
              <div className="text-lg font-semibold flex-1" style={{ color: "#0f172a" }}>
                Echipa — {users.length} utilizatori
              </div>
              <button
                className="font-medium px-4 py-2 rounded-lg text-[13px] flex items-center gap-1.5 cursor-pointer transition-all border-none shadow-sm"
                style={{ background: "#4d8bff", color: "#fff" }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.88")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
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
                    className="flex items-center gap-4 px-5 py-4 rounded-xl mb-2 cursor-pointer transition-all"
                    style={
                      isActive
                        ? {
                            border: "1px solid #4d8bff",
                            background: "#ffffff",
                          }
                        : {
                            border: "1px solid #e2e8f0",
                            background: "#ffffff",
                          }
                    }
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLDivElement).style.borderColor = "#cbd5e1";
                        (e.currentTarget as HTMLDivElement).style.background = "#f1f5f9";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLDivElement).style.borderColor = "#e2e8f0";
                        (e.currentTarget as HTMLDivElement).style.background = "#ffffff";
                      }
                    }}
                    onClick={() => setSelectedUser(isActive ? null : u.id)}
                  >
                    <div
                      className="w-[42px] h-[42px] rounded-full flex items-center justify-center text-[15px] font-bold flex-shrink-0"
                      style={{ background: AVATAR_BG[u.role] || "#4d8bff", color: "#fff" }}
                    >
                      {getInitials(u.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold flex items-center gap-2" style={{ color: "#0f172a" }}>
                        {u.name}
                        <span
                          className="text-[10px] font-semibold rounded-full px-2 py-0.5"
                          style={{ color: role.color, background: `${role.color}18` }}
                        >
                          {role.label}
                        </span>
                        <StatusBadge
                          status={u.status}
                          label={u.status === "active" ? "activ" : u.status === "invited" ? "invitat" : u.status}
                        />
                      </div>
                      <div className="text-xs mt-0.5 font-mono" style={{ color: "#94a3b8" }}>
                        {u.email}
                      </div>
                      <div className="flex gap-3 mt-1 text-[11px]" style={{ color: "#94a3b8" }}>
                        <span>Adaugat: {new Date(u.createdAt).toLocaleDateString("ro-RO")}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-lg font-extrabold font-mono" style={{ color: "#0f172a" }}>{u.projectCount}</div>
                      <div className="text-[10px]" style={{ color: "#94a3b8" }}>proiecte</div>
                      <div className="text-[11px] mt-1 font-mono" style={{ color: "#94a3b8" }}>
                        {timeAgo(u.lastActiveAt)}
                      </div>
                    </div>
                  </div>

                  {isActive && (
                    <div
                      className="p-5 rounded-xl mt-2 mb-2"
                      style={{ border: "1px solid #4d8bff", background: "#ffffff" }}
                    >
                      <div className="text-lg font-extrabold mb-1" style={{ color: "#0f172a" }}>{u.name}</div>
                      <div className="text-[13px] mb-3 font-mono" style={{ color: "#64748b" }}>{u.email}</div>
                      <div className="grid grid-cols-3 gap-2.5 mb-4">
                        <div
                          className="p-2.5 rounded-md"
                          style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}
                        >
                          <div className="text-[11px] uppercase tracking-wide font-medium mb-0.5" style={{ color: "#64748b" }}>Rol</div>
                          <div className="text-[13px] font-semibold" style={{ color: role.color }}>{role.label}</div>
                        </div>
                        <div
                          className="p-2.5 rounded-md"
                          style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}
                        >
                          <div className="text-[11px] uppercase tracking-wide font-medium mb-0.5" style={{ color: "#64748b" }}>Proiecte active</div>
                          <div className="text-[13px] font-semibold" style={{ color: "#0f172a" }}>{u.projectCount}</div>
                        </div>
                        <div
                          className="p-2.5 rounded-md"
                          style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}
                        >
                          <div className="text-[11px] uppercase tracking-wide font-medium mb-0.5" style={{ color: "#64748b" }}>Ultima activitate</div>
                          <div className="text-xs font-semibold" style={{ color: "#0f172a" }}>{timeAgo(u.lastActiveAt)}</div>
                        </div>
                      </div>
                      <div className="text-[11px] uppercase tracking-wide font-medium mb-2" style={{ color: "#64748b" }}>
                        Permisiuni ({role.label})
                      </div>
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {role.perms.map((p, i) => (
                          <span
                            key={i}
                            className="text-[11px] px-2.5 py-1 rounded-md"
                            style={{ background: "#f8fafc", border: "1px solid #e2e8f0", color: "#64748b" }}
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="rounded-lg px-4 py-2 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all"
                          style={{ background: "#ffffff", border: "1px solid #e2e8f0", color: "#0f172a" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "#ffffff")}
                          onClick={() => {
                            const next = u.role === "admin" ? "consultant" : u.role === "consultant" ? "viewer" : "admin";
                            handleChangeRole(u.id, next);
                          }}
                        >
                          Schimba rol
                        </button>
                        {u.status === "invited" && (
                          <button
                            className="rounded-lg px-4 py-2 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all"
                            style={{ background: "#ffffff", border: "1px solid #e2e8f0", color: "#0f172a" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "#ffffff")}
                          >
                            Retrimite invitatie
                          </button>
                        )}
                        {u.id !== user?.id && (
                          <button
                            className="rounded-lg px-4 py-2 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all"
                            style={{ background: `${("#f87171" as string)}18`, color: "#f87171", border: "1px solid #f87171" }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
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
              <div className="text-center py-10" style={{ color: "#94a3b8" }}>
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
              <div
                className="rounded-xl p-5"
                style={{ background: "#ffffff", border: "1px solid #e2e8f0" }}
              >
                <div className="text-[11px] uppercase tracking-wide font-medium mb-1.5" style={{ color: "#64748b" }}>Total luna curenta</div>
                <div className="text-2xl font-bold font-mono tracking-tight" style={{ color: "#0f172a" }}>
                  ${(costs?.totalMonth || 0).toFixed(2)}
                </div>
                {costs && (
                  <div
                    className="text-xs font-semibold mt-1"
                    style={{ color: costs.totalMonth > costs.totalPrevMonth ? "#f87171" : "#34d399" }}
                  >
                    {costs.totalMonth > costs.totalPrevMonth ? "↑" : "↓"} ${Math.abs(costs.totalMonth - costs.totalPrevMonth).toFixed(2)} vs. luna trecuta
                  </div>
                )}
              </div>
              {["solomon", "neemia", "ocr", "ghid_rules"].map((agent) => {
                const agentData = costs?.byAgent?.find((a: any) => a.agent === agent);
                const labels: Record<string, string> = { solomon: "Solomon (Expert Fonduri)", neemia: "Neemia (Generare Dosar)", ocr: "OCR", ghid_rules: "Ghid Reguli" };
                return (
                  <div
                    key={agent}
                    className="rounded-xl p-5"
                    style={{ background: "#ffffff", border: "1px solid #e2e8f0" }}
                  >
                    <div className="text-[11px] uppercase tracking-wide font-medium mb-1.5" style={{ color: "#64748b" }}>
                      {labels[agent] || agent}
                    </div>
                    <div className="text-2xl font-bold font-mono tracking-tight" style={{ color: "#0f172a" }}>
                      ${Number(agentData?.totalCost || 0).toFixed(2)}
                    </div>
                    <div className="text-xs mt-1" style={{ color: "#94a3b8" }}>
                      {costs?.totalMonth > 0 ? Math.round((Number(agentData?.totalCost || 0) / costs.totalMonth) * 100) : 0}% din total
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Distribution bar */}
            {costs && costs.totalMonth > 0 && (
              <div className="mb-6">
                <div className="text-[11px] uppercase tracking-wide font-medium mb-2" style={{ color: "#64748b" }}>Distributie cost per agent</div>
                <div className="flex overflow-hidden h-3 rounded-md" style={{ background: "#f8fafc" }}>
                  {costs.byAgent?.map((a: any) => {
                    const pct = (Number(a.totalCost) / costs.totalMonth) * 100;
                    return <div key={a.agent} className="transition-all duration-400" style={{ width: `${pct}%`, background: AGENT_COLORS[a.agent] || "#5a6478" }} />;
                  })}
                </div>
                <div className="flex gap-4 mt-1.5 text-[11px]" style={{ color: "#94a3b8" }}>
                  {costs.byAgent?.map((a: any) => {
                    const labels: Record<string, string> = { solomon: "Solomon", neemia: "Neemia", ocr: "OCR", ghid_rules: "Ghid Reguli" };
                    return (
                      <span key={a.agent} className="flex items-center gap-1">
                        <span
                          className="inline-block w-2 h-2 rounded-full"
                          style={{ background: AGENT_DOT_COLORS[a.agent] || "#94a3b8" }}
                        />
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
                <div className="text-[11px] uppercase tracking-wide font-medium mb-2" style={{ color: "#64748b" }}>Cost per model AI</div>
                <div className="flex overflow-hidden h-3 rounded-md" style={{ background: "#f8fafc" }}>
                  {costs.byModel.map((m: any) => {
                    const pct = (Number(m.totalCost) / costs.totalMonth) * 100;
                    return <div key={m.model} className="transition-all duration-400" style={{ width: `${pct}%`, background: MODEL_COLORS[m.model] || "#fb923c" }} />;
                  })}
                </div>
                <div className="flex gap-4 mt-1.5 text-[11px]" style={{ color: "#94a3b8" }}>
                  {costs.byModel.map((m: any) => {
                    const modelNames: Record<string, string> = {
                      "claude-haiku-4-5-20251001": "Haiku",
                      "claude-sonnet-4-20250514": "Sonnet",
                      "claude-opus-4-6": "Opus",
                    };
                    return (
                      <span key={m.model} className="flex items-center gap-1">
                        <span
                          className="inline-block w-2 h-2 rounded-full"
                          style={{ background: MODEL_COLORS[m.model] || "#fb923c" }}
                        />
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
                <div className="text-[11px] uppercase tracking-wide font-medium mb-2.5" style={{ color: "#64748b" }}>Evolutie zilnica</div>
                <div className="flex items-end gap-1.5 h-20 px-1">
                  {costs.daily.map((d: any, i: number) => {
                    const maxCost = Math.max(...costs.daily.map((x: any) => Number(x.totalCost)));
                    const h = maxCost > 0 ? (Number(d.totalCost) / maxCost) * 100 : 0;
                    return (
                      <div key={i} className="flex flex-col items-center gap-1 flex-1">
                        <span className="text-[10px] font-mono" style={{ color: "#94a3b8" }}>${Number(d.totalCost).toFixed(2)}</span>
                        <div className="w-full rounded-t transition-all duration-300" style={{ height: `${h}%`, minHeight: 4, background: "#4d8bff" }} />
                        <span className="text-[9px]" style={{ color: "#94a3b8" }}>{d.date}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Per project table */}
            {costs?.byProject && costs.byProject.length > 0 && (
              <>
                <div className="text-[11px] uppercase tracking-wide font-medium mb-2.5" style={{ color: "#64748b" }}>Cost detaliat per proiect</div>
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0", background: "#ffffff" }}>
                  <table className="w-full border-collapse text-[13px]">
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        <th className="px-4 py-2.5 font-medium text-[11px] uppercase tracking-wide text-left" style={{ color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>Proiect</th>
                        <th className="px-4 py-2.5 font-medium text-[11px] uppercase tracking-wide text-center" style={{ color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>Agent</th>
                        <th className="px-4 py-2.5 font-medium text-[11px] uppercase tracking-wide text-center" style={{ color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>Apeluri</th>
                        <th className="px-4 py-2.5 font-medium text-[11px] uppercase tracking-wide text-center" style={{ color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costs.byProject.map((p: any, i: number) => (
                        <tr
                          key={i}
                          style={{ borderBottom: "1px solid #e2e8f0" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                        >
                          <td className="px-4 py-2.5 text-left">
                            <div className="font-semibold text-[13px]" style={{ color: "#0f172a" }}>{p.projectName || "N/A"}</div>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-center" style={{ color: "#64748b" }}>{p.agent}</td>
                          <td className="px-4 py-2.5 font-mono text-center" style={{ color: "#64748b" }}>{p.totalCalls}</td>
                          <td className="px-4 py-2.5 font-extrabold font-mono text-center" style={{ color: "#fbbf24" }}>${Number(p.totalCost).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {(!costs || costs.totalMonth === 0) && (
              <div className="text-center py-10" style={{ color: "#94a3b8" }}>
                Niciun cost AI inregistrat luna aceasta.
              </div>
            )}
          </>
        )}

        {/* ═══ JURNAL ACTIVITATE ═══ */}
        {activeTab === "audit" && (
          <>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="text-lg font-semibold flex-1" style={{ color: "#0f172a" }}>Jurnal activitate</div>
              <div className="flex rounded-lg p-0.5 gap-px" style={{ background: "#f8fafc" }}>
                {[
                  { id: "all", label: "Toate" },
                  { id: "create", label: "Creare" },
                  { id: "upload", label: "Upload" },
                  { id: "user", label: "Utilizatori" },
                  { id: "config", label: "Config" },
                ].map((f) => (
                  <button
                    key={f.id}
                    className="px-2.5 py-1 rounded-md text-[11px] font-semibold border-none cursor-pointer transition-all"
                    style={
                      auditFilter === f.id
                        ? { background: "#4d8bff", color: "#fff" }
                        : { background: "transparent", color: "#94a3b8" }
                    }
                    onMouseEnter={(e) => {
                      if (auditFilter !== f.id) (e.currentTarget.style.color = "#64748b");
                    }}
                    onMouseLeave={(e) => {
                      if (auditFilter !== f.id) (e.currentTarget.style.color = "#94a3b8");
                    }}
                    onClick={() => setAuditFilter(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-0.5">
              {auditLogs.map((a) => (
                <div
                  key={a.id}
                  className="flex items-start gap-3 px-4 py-3 rounded-md transition-colors"
                  style={{ borderBottom: "1px solid #e2e8f0" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                >
                  <div
                    className="w-8 h-8 flex items-center justify-center text-sm flex-shrink-0 rounded-md"
                    style={{ background: "#f8fafc", border: "1px solid #e2e8f0", color: "#64748b" }}
                  >
                    {AUDIT_ICONS[a.action] || "📋"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium mb-px" style={{ color: "#0f172a" }}>{a.action}</div>
                    <div className="text-xs" style={{ color: "#64748b" }}>
                      {a.entityType && `${a.entityType}`}
                      {a.details && typeof a.details === "object" && a.details.description && ` — ${a.details.description}`}
                    </div>
                    <div className="flex gap-2 mt-0.5">
                      <span className="text-[11px]" style={{ color: "#94a3b8" }}>👤 {a.userName || "System"}</span>
                      <span className="font-mono text-[12px]" style={{ color: "#64748b" }}>{timeAgo(a.createdAt)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {auditLogs.length === 0 && (
              <div className="text-center py-10" style={{ color: "#94a3b8" }}>
                Nicio activitate inregistrata.
              </div>
            )}
          </>
        )}
      </div>

      {/* ═══ INVITE MODAL ═══ */}
      {showInvite && (
        <div
          className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-[100] animate-[fadeIn_0.2s]"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={(e) => e.target === e.currentTarget && setShowInvite(false)}
        >
          <div
            className="rounded-xl p-6 w-[460px] animate-[slideUp_0.3s_ease]"
            style={{ background: "#ffffff", border: "1px solid #e2e8f0" }}
          >
            <div className="flex justify-between items-center mb-1">
              <div className="text-xl font-extrabold" style={{ color: "#0f172a" }}>Invita consultant</div>
              <button
                className="text-lg cursor-pointer bg-transparent border-none"
                style={{ color: "#94a3b8" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#64748b")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
                onClick={() => setShowInvite(false)}
              >
                ✕
              </button>
            </div>
            <div className="text-[13px] mb-5" style={{ color: "#64748b" }}>
              Trimite o invitatie pe email. Consultantul va primi un link de activare cont.
            </div>

            <div className="mb-4">
              <label className="block text-[11px] uppercase tracking-wide font-medium mb-1.5" style={{ color: "#64748b" }}>
                Email
              </label>
              <input
                type="email"
                placeholder="consultant.nou@firma.ro"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  border: "1px solid #e2e8f0",
                  background: "#ffffff",
                  color: "#0f172a",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#4d8bff";
                  e.currentTarget.style.boxShadow = "0 0 0 1px #4d8bff";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#e2e8f0";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>

            <div className="mb-4">
              <label className="block text-[11px] uppercase tracking-wide font-medium mb-1.5" style={{ color: "#64748b" }}>
                Rol
              </label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(ROLES).map(([key, role]) => (
                  <div
                    key={key}
                    className="py-3 px-2.5 text-center cursor-pointer transition-all rounded-lg"
                    style={
                      inviteRole === key
                        ? { border: "2px solid #4d8bff", background: "#f8fafc" }
                        : { border: "2px solid #e2e8f0", background: "#f8fafc" }
                    }
                    onMouseEnter={(e) => {
                      if (inviteRole !== key) (e.currentTarget as HTMLDivElement).style.borderColor = "#cbd5e1";
                    }}
                    onMouseLeave={(e) => {
                      if (inviteRole !== key) (e.currentTarget as HTMLDivElement).style.borderColor = "#e2e8f0";
                    }}
                    onClick={() => setInviteRole(key)}
                  >
                    <div className="text-[13px] font-bold mb-0.5" style={{ color: role.color }}>{role.label}</div>
                    <div className="text-[10px] leading-tight" style={{ color: "#94a3b8" }}>{role.perms.slice(0, 2).join(", ")}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2.5 justify-end mt-4">
              <button
                className="rounded-lg px-5 py-2.5 text-sm font-semibold cursor-pointer"
                style={{ background: "#ffffff", border: "1px solid #e2e8f0", color: "#0f172a" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#ffffff")}
                onClick={() => setShowInvite(false)}
              >
                Anuleaza
              </button>
              <button
                className="font-medium px-5 py-2.5 rounded-lg text-sm cursor-pointer border-none disabled:opacity-40"
                style={{ background: "#4d8bff", color: "#fff" }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.88")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                disabled={!inviteEmail.includes("@")}
                onClick={handleInvite}
              >
                Trimite invitatie
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
      `}</style>
    </>
  );
}
