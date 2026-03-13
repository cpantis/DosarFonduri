"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { getInitials } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BtnPrimary, BtnSecondary } from "@/components/ui/Buttons";
import { Tabs } from "@/components/ui/Tabs";

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

const TAB_ITEMS = [
  { key: "users", icon: "👥", label: "Utilizatori" },
  { key: "costs", icon: "💰", label: "Audit AI / Costuri" },
  { key: "audit", icon: "📋", label: "Jurnal activitate" },
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

  // Compute tab counts for the Tabs component
  const tabItems = TAB_ITEMS.map((t) => {
    if (t.key === "users" && users.length > 0) return { ...t, count: users.length };
    if (t.key === "audit" && auditTotal > 0) return { ...t, count: auditTotal };
    return t;
  });

  // Check if current user is admin
  if (user?.role !== "admin") {
    return (
      <>
        <PageHeader title="Admin" />
        <div className="flex-1 flex items-center justify-center bg-slate-50">
          <div className="text-center">
            <div className="text-4xl mb-4">🔒</div>
            <div className="text-lg font-bold mb-2 text-slate-900">Acces restrictionat</div>
            <div className="text-[13px] text-slate-500">Doar administratorii au acces la acest panou.</div>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="animate-[fadeIn_.2s_ease-out]">
      {/* Topbar */}
      <PageHeader title="Admin" />

      {/* Tabs */}
      <div className="px-8 flex-shrink-0 bg-white">
        <Tabs tabs={tabItems} active={activeTab} onChange={setActiveTab} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6 max-w-7xl bg-slate-50">

        {/* ═══ UTILIZATORI ═══ */}
        {activeTab === "users" && (
          <>
            <div className="flex items-center gap-3 mb-5">
              <div className="text-lg font-semibold flex-1 text-slate-900">
                Echipa — {users.length} utilizatori
              </div>
              <BtnPrimary
                icon="+"
                onClick={() => { setShowInvite(true); setInviteEmail(""); setInviteRole("consultant"); }}
              >
                Invita consultant
              </BtnPrimary>
            </div>

            {users.map((u) => {
              const role = ROLES[u.role] || ROLES.viewer;
              const isActive = selectedUser === u.id;
              return (
                <div key={u.id}>
                  <div
                    className={`flex items-center gap-4 px-5 py-4 rounded-xl mb-2 cursor-pointer transition-all border bg-white ${
                      isActive
                        ? "border-blue-500"
                        : "border-slate-200/80 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                    onClick={() => setSelectedUser(isActive ? null : u.id)}
                  >
                    <div
                      className="w-[42px] h-[42px] rounded-full flex items-center justify-center text-[15px] font-bold flex-shrink-0 text-white"
                      style={{ background: AVATAR_BG[u.role] || "#4d8bff" }}
                    >
                      {getInitials(u.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold flex items-center gap-2 text-slate-900">
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
                      <div className="text-xs mt-0.5 font-mono text-slate-400">
                        {u.email}
                      </div>
                      <div className="flex gap-3 mt-1 text-[11px] text-slate-400">
                        <span>Adaugat: {new Date(u.createdAt).toLocaleDateString("ro-RO")}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-lg font-extrabold font-mono text-slate-900">{u.projectCount}</div>
                      <div className="text-[10px] text-slate-400">proiecte</div>
                      <div className="text-[11px] mt-1 font-mono text-slate-400">
                        {timeAgo(u.lastActiveAt)}
                      </div>
                    </div>
                  </div>

                  {isActive && (
                    <div className="p-5 rounded-xl mt-2 mb-2 border border-blue-500 bg-white">
                      <div className="text-lg font-extrabold mb-1 text-slate-900">{u.name}</div>
                      <div className="text-[13px] mb-3 font-mono text-slate-500">{u.email}</div>
                      <div className="grid grid-cols-3 gap-2.5 mb-4">
                        <div className="p-2.5 rounded-md bg-slate-50 border border-slate-200/80">
                          <div className="text-[11px] uppercase tracking-wide font-medium mb-0.5 text-slate-500">Rol</div>
                          <div className="text-[13px] font-semibold" style={{ color: role.color }}>{role.label}</div>
                        </div>
                        <div className="p-2.5 rounded-md bg-slate-50 border border-slate-200/80">
                          <div className="text-[11px] uppercase tracking-wide font-medium mb-0.5 text-slate-500">Proiecte active</div>
                          <div className="text-[13px] font-semibold text-slate-900">{u.projectCount}</div>
                        </div>
                        <div className="p-2.5 rounded-md bg-slate-50 border border-slate-200/80">
                          <div className="text-[11px] uppercase tracking-wide font-medium mb-0.5 text-slate-500">Ultima activitate</div>
                          <div className="text-xs font-semibold text-slate-900">{timeAgo(u.lastActiveAt)}</div>
                        </div>
                      </div>
                      <div className="text-[11px] uppercase tracking-wide font-medium mb-2 text-slate-500">
                        Permisiuni ({role.label})
                      </div>
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {role.perms.map((p, i) => (
                          <span
                            key={i}
                            className="text-[11px] px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200/80 text-slate-500"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <BtnSecondary
                          size="sm"
                          onClick={() => {
                            const next = u.role === "admin" ? "consultant" : u.role === "consultant" ? "viewer" : "admin";
                            handleChangeRole(u.id, next);
                          }}
                        >
                          Schimba rol
                        </BtnSecondary>
                        {u.status === "invited" && (
                          <BtnSecondary size="sm">
                            Retrimite invitatie
                          </BtnSecondary>
                        )}
                        {u.id !== user?.id && (
                          <button
                            className="rounded-lg px-3 py-1.5 text-[12px] font-semibold flex items-center gap-1 cursor-pointer transition-all text-red-500 border border-red-500 hover:opacity-80"
                            style={{ background: "rgba(248,113,113,0.09)" }}
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
              <div className="text-center py-10 text-slate-400">
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
              <div className="rounded-xl p-5 bg-white border border-slate-200/80">
                <div className="text-[11px] uppercase tracking-wide font-medium mb-1.5 text-slate-500">Total luna curenta</div>
                <div className="text-2xl font-bold font-mono tracking-tight text-slate-900">
                  ${(costs?.totalMonth || 0).toFixed(2)}
                </div>
                {costs && (
                  <div
                    className={`text-xs font-semibold mt-1 ${costs.totalMonth > costs.totalPrevMonth ? "text-red-500" : "text-emerald-500"}`}
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
                    className="rounded-xl p-5 bg-white border border-slate-200/80"
                  >
                    <div className="text-[11px] uppercase tracking-wide font-medium mb-1.5 text-slate-500">
                      {labels[agent] || agent}
                    </div>
                    <div className="text-2xl font-bold font-mono tracking-tight text-slate-900">
                      ${Number(agentData?.totalCost || 0).toFixed(2)}
                    </div>
                    <div className="text-xs mt-1 text-slate-400">
                      {costs?.totalMonth > 0 ? Math.round((Number(agentData?.totalCost || 0) / costs.totalMonth) * 100) : 0}% din total
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Distribution bar */}
            {costs && costs.totalMonth > 0 && (
              <div className="mb-6">
                <div className="text-[11px] uppercase tracking-wide font-medium mb-2 text-slate-500">Distributie cost per agent</div>
                <div className="flex overflow-hidden h-3 rounded-md bg-slate-50">
                  {costs.byAgent?.map((a: any) => {
                    const pct = (Number(a.totalCost) / costs.totalMonth) * 100;
                    return <div key={a.agent} className="transition-all duration-400" style={{ width: `${pct}%`, background: AGENT_COLORS[a.agent] || "#5a6478" }} />;
                  })}
                </div>
                <div className="flex gap-4 mt-1.5 text-[11px] text-slate-400">
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
                <div className="text-[11px] uppercase tracking-wide font-medium mb-2 text-slate-500">Cost per model AI</div>
                <div className="flex overflow-hidden h-3 rounded-md bg-slate-50">
                  {costs.byModel.map((m: any) => {
                    const pct = (Number(m.totalCost) / costs.totalMonth) * 100;
                    return <div key={m.model} className="transition-all duration-400" style={{ width: `${pct}%`, background: MODEL_COLORS[m.model] || "#fb923c" }} />;
                  })}
                </div>
                <div className="flex gap-4 mt-1.5 text-[11px] text-slate-400">
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
                <div className="text-[11px] uppercase tracking-wide font-medium mb-2.5 text-slate-500">Evolutie zilnica</div>
                <div className="flex items-end gap-1.5 h-20 px-1">
                  {costs.daily.map((d: any, i: number) => {
                    const maxCost = Math.max(...costs.daily.map((x: any) => Number(x.totalCost)));
                    const h = maxCost > 0 ? (Number(d.totalCost) / maxCost) * 100 : 0;
                    return (
                      <div key={i} className="flex flex-col items-center gap-1 flex-1">
                        <span className="text-[10px] font-mono text-slate-400">${Number(d.totalCost).toFixed(2)}</span>
                        <div className="w-full rounded-t transition-all duration-300 bg-blue-500" style={{ height: `${h}%`, minHeight: 4 }} />
                        <span className="text-[9px] text-slate-400">{d.date}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Per project table */}
            {costs?.byProject && costs.byProject.length > 0 && (
              <>
                <div className="text-[11px] uppercase tracking-wide font-medium mb-2.5 text-slate-500">Cost detaliat per proiect</div>
                <div className="rounded-xl overflow-hidden border border-slate-200/80 bg-white">
                  <table className="w-full border-collapse text-[13px]">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="px-4 py-2.5 font-medium text-[11px] uppercase tracking-wide text-left text-slate-500 border-b border-slate-200">Proiect</th>
                        <th className="px-4 py-2.5 font-medium text-[11px] uppercase tracking-wide text-center text-slate-500 border-b border-slate-200">Agent</th>
                        <th className="px-4 py-2.5 font-medium text-[11px] uppercase tracking-wide text-center text-slate-500 border-b border-slate-200">Apeluri</th>
                        <th className="px-4 py-2.5 font-medium text-[11px] uppercase tracking-wide text-center text-slate-500 border-b border-slate-200">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costs.byProject.map((p: any, i: number) => (
                        <tr
                          key={i}
                          className="border-b border-slate-200 hover:bg-slate-50 transition-colors"
                        >
                          <td className="px-4 py-2.5 text-left">
                            <div className="font-semibold text-[13px] text-slate-900">{p.projectName || "N/A"}</div>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-center text-slate-500">{p.agent}</td>
                          <td className="px-4 py-2.5 font-mono text-center text-slate-500">{p.totalCalls}</td>
                          <td className="px-4 py-2.5 font-extrabold font-mono text-center text-amber-500">${Number(p.totalCost).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {(!costs || costs.totalMonth === 0) && (
              <div className="text-center py-10 text-slate-400">
                Niciun cost AI inregistrat luna aceasta.
              </div>
            )}
          </>
        )}

        {/* ═══ JURNAL ACTIVITATE ═══ */}
        {activeTab === "audit" && (
          <>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="text-lg font-semibold flex-1 text-slate-900">Jurnal activitate</div>
              <div className="flex rounded-lg p-0.5 gap-px bg-slate-50">
                {[
                  { id: "all", label: "Toate" },
                  { id: "create", label: "Creare" },
                  { id: "upload", label: "Upload" },
                  { id: "user", label: "Utilizatori" },
                  { id: "config", label: "Config" },
                ].map((f) => (
                  <button
                    key={f.id}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border-none cursor-pointer transition-all ${
                      auditFilter === f.id
                        ? "bg-blue-600 text-white"
                        : "bg-transparent text-slate-400 hover:text-slate-500"
                    }`}
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
                  className="flex items-start gap-3 px-4 py-3 rounded-md transition-colors border-b border-slate-200 hover:bg-slate-100"
                >
                  <div className="w-8 h-8 flex items-center justify-center text-sm flex-shrink-0 rounded-md bg-slate-50 border border-slate-200/80 text-slate-500">
                    {AUDIT_ICONS[a.action] || "📋"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium mb-px text-slate-900">{a.action}</div>
                    <div className="text-xs text-slate-500">
                      {a.entityType && `${a.entityType}`}
                      {a.details && typeof a.details === "object" && a.details.description && ` — ${a.details.description}`}
                    </div>
                    <div className="flex gap-2 mt-0.5">
                      <span className="text-[11px] text-slate-400">👤 {a.userName || "System"}</span>
                      <span className="font-mono text-[12px] text-slate-500">{timeAgo(a.createdAt)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {auditLogs.length === 0 && (
              <div className="text-center py-10 text-slate-400">
                Nicio activitate inregistrata.
              </div>
            )}
          </>
        )}
      </div>

      {/* ═══ INVITE MODAL ═══ */}
      {showInvite && (
        <div
          className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-[100] animate-[fadeIn_0.2s] bg-black/40"
          onClick={(e) => e.target === e.currentTarget && setShowInvite(false)}
        >
          <div className="rounded-xl p-6 w-[460px] animate-[slideUp_0.3s_ease] bg-white border border-slate-200/80">
            <div className="flex justify-between items-center mb-1">
              <div className="text-xl font-extrabold text-slate-900">Invita consultant</div>
              <button
                className="text-lg cursor-pointer bg-transparent border-none text-slate-400 hover:text-slate-500 transition-colors"
                onClick={() => setShowInvite(false)}
              >
                ✕
              </button>
            </div>
            <div className="text-[13px] mb-5 text-slate-500">
              Trimite o invitatie pe email. Consultantul va primi un link de activare cont.
            </div>

            <div className="mb-4">
              <label className="block text-[11px] uppercase tracking-wide font-medium mb-1.5 text-slate-500">
                Email
              </label>
              <input
                type="email"
                placeholder="consultant.nou@firma.ro"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none border border-slate-200 bg-white text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
            </div>

            <div className="mb-4">
              <label className="block text-[11px] uppercase tracking-wide font-medium mb-1.5 text-slate-500">
                Rol
              </label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(ROLES).map(([key, role]) => (
                  <div
                    key={key}
                    className={`py-3 px-2.5 text-center cursor-pointer transition-all rounded-xl bg-slate-50 border-2 ${
                      inviteRole === key
                        ? "border-blue-500"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                    onClick={() => setInviteRole(key)}
                  >
                    <div className="text-[13px] font-bold mb-0.5" style={{ color: role.color }}>{role.label}</div>
                    <div className="text-[10px] leading-tight text-slate-400">{role.perms.slice(0, 2).join(", ")}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2.5 justify-end mt-4">
              <BtnSecondary onClick={() => setShowInvite(false)}>
                Anuleaza
              </BtnSecondary>
              <BtnPrimary
                disabled={!inviteEmail.includes("@")}
                onClick={handleInvite}
              >
                Trimite invitatie
              </BtnPrimary>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        .admin-toggle.on{background:#2563eb !important}
      `}</style>
    </div>
  );
}
