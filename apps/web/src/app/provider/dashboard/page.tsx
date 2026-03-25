"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

const API_URL = "";

// Provider-specific fetch with provider token
async function providerApi<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("df-provider-token") : null;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { headers, credentials: "include", ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Request failed" }));
    const details = body.details ? `: ${body.details.map((d: any) => `${d.path?.join(".")}: ${d.message}`).join(", ")}` : "";
    throw new Error((body.error || `HTTP ${res.status}`) + details);
  }
  return res.json();
}

const providerGet = <T = any>(path: string) => providerApi<T>(path);
const providerPost = <T = any>(path: string, body: any) => providerApi<T>(path, { method: "POST", body: JSON.stringify(body) });
const providerPut = <T = any>(path: string, body: any) => providerApi<T>(path, { method: "PUT", body: JSON.stringify(body) });
const providerDelete = <T = any>(path: string) => providerApi<T>(path, { method: "DELETE" });

// ─── Types ───
interface Cabinet {
  id: string;
  name: string;
  code: string;
  plan: string;
  maxUsers: number;
  status: string;
  trialEndsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UnusedCode {
  id: string;
  code: string;
  plan: string;
  maxUsers: number;
  trialDays: number;
  cui: string | null;
  companyName: string | null;
  isActive: boolean;
  createdAt: string;
}

interface PlatformUser {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  createdAt: string;
  lastActiveAt: string | null;
  organizationId: string | null;
  cabinetName: string | null;
  cabinetCode: string | null;
  cabinetPlan: string | null;
}

interface Revenue {
  totalCabinets: number;
  activeCabinets: number;
  trialCabinets: number;
  mrr: number;
}

const STATUS_MAP: Record<string, { label: string; colorClass: string; bgClass: string }> = {
  active: { label: "Activ", colorClass: "text-emerald-500", bgClass: "bg-emerald-500/10" },
  trial: { label: "Trial", colorClass: "text-amber-500", bgClass: "bg-amber-500/10" },
  inactive: { label: "Inactiv", colorClass: "text-slate-400", bgClass: "bg-slate-400/10" },
  expired: { label: "Expirat", colorClass: "text-red-500", bgClass: "bg-red-500/10" },
};

const PLAN_COLOR_CLASSES: Record<string, string> = { starter: "text-orange-500", professional: "text-blue-600", enterprise: "text-violet-500" };
const PLAN_BG_CLASSES: Record<string, string> = { starter: "bg-orange-500", professional: "bg-blue-600", enterprise: "bg-violet-500" };
const PLAN_PRICES: Record<string, number> = { starter: 49, professional: 149, enterprise: 399 };

export default function ProviderDashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("cabinets");
  const [cabinets, setCabinets] = useState<Cabinet[]>([]);
  const [codes, setCodes] = useState<UnusedCode[]>([]);
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [platformUsers, setPlatformUsers] = useState<PlatformUser[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [selectedCabinet, setSelectedCabinet] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showGenerate, setShowGenerate] = useState(false);
  const [genPlan, setGenPlan] = useState("professional");
  const [genMaxUsers, setGenMaxUsers] = useState(5);
  const [genTrial, setGenTrial] = useState(30);
  const [genCode, setGenCode] = useState<string | null>(null);
  const [genCui, setGenCui] = useState("");
  const [genCuiLoad, setGenCuiLoad] = useState(false);
  const [genCuiRes, setGenCuiRes] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Edit plan modal state
  const [editModal, setEditModal] = useState<{ id: string; plan: string; maxUsers: number } | null>(null);
  // Email modal state
  const [emailModal, setEmailModal] = useState<{ id: string; name: string } | null>(null);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  // Reassign modal state
  const [reassignModal, setReassignModal] = useState<{ id: string; name: string; email: string; currentCabinetId: string | null } | null>(null);
  const [reassignTarget, setReassignTarget] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [cabs, unusedCodes, rev, usrs] = await Promise.all([
        providerGet("/api/provider/cabinets"),
        providerGet("/api/provider/codes/unused"),
        providerGet("/api/provider/revenue"),
        providerGet("/api/provider/users"),
      ]);
      setCabinets(cabs);
      setCodes(unusedCodes);
      setRevenue(rev);
      setPlatformUsers(usrs);
    } catch (err: any) {
      if (err.message.includes("Unauthorized") || err.message.includes("Invalid token")) {
        router.push("/provider/login");
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const token = localStorage.getItem("df-provider-token");
    if (!token) {
      router.push("/provider/login");
      return;
    }
    loadData();
  }, [loadData, router]);

  const handleLookupCui = async () => {
    const clean = genCui.replace(/\D/g, "");
    if (clean.length < 6) return;
    setGenCuiLoad(true);
    setGenCuiRes(null);
    try {
      const result = await providerGet(`/api/provider/lookup-cui/${clean}`);
      setGenCuiRes(result);
    } catch {
      setGenCuiRes("error");
    } finally {
      setGenCuiLoad(false);
    }
  };

  const handleGenerateCode = async () => {
    try {
      const created = await providerPost("/api/provider/codes", {
        plan: genPlan,
        maxUsers: genMaxUsers,
        trialDays: genTrial,
        cui: genCuiRes && genCuiRes !== "error" ? genCuiRes.taxCode : undefined,
        companyName: genCuiRes && genCuiRes !== "error" ? genCuiRes.name : undefined,
      });
      setGenCode(created.code);
      setCodes((prev) => [...prev, created]);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteCode = async (id: string) => {
    try {
      await providerDelete(`/api/provider/codes/${id}`);
      setCodes((prev) => prev.filter((c) => c.id !== id));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("df-provider-token");
    router.push("/provider/login");
  };

  const handleEditPlan = async () => {
    if (!editModal) return;
    try {
      const updated = await providerPut(`/api/provider/cabinets/${editModal.id}`, {
        plan: editModal.plan,
        maxUsers: editModal.maxUsers,
      });
      setCabinets((prev) => prev.map((c) => c.id === editModal.id ? { ...c, plan: updated.plan, maxUsers: updated.maxUsers } : c));
      setEditModal(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm("Sigur vrei să dezactivezi acest cabinet?")) return;
    try {
      await providerPost(`/api/provider/cabinets/${id}/deactivate`, {});
      setCabinets((prev) => prev.map((c) => c.id === id ? { ...c, status: "inactive" } : c));
      setSelectedCabinet(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAccessCabinet = async (id: string) => {
    try {
      const data = await providerPost(`/api/provider/cabinets/${id}/access`, {});
      // Store the user-level token so the app works normally
      localStorage.setItem("df-token", data.token);
      // Open in new tab so provider dashboard stays open
      window.open("/dashboard", "_blank");
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSendEmail = async () => {
    if (!emailModal || !emailSubject.trim() || !emailMessage.trim()) return;
    setEmailSending(true);
    try {
      const result = await providerPost(`/api/provider/cabinets/${emailModal.id}/email`, {
        subject: emailSubject,
        message: emailMessage,
      });
      alert(`Email trimis la ${result.sent}/${result.total} utilizatori.`);
      setEmailModal(null);
      setEmailSubject("");
      setEmailMessage("");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setEmailSending(false);
    }
  };

  const handleToggleCode = async (id: string) => {
    try {
      const updated = await providerPost(`/api/provider/codes/${id}/toggle`, {});
      setCodes((prev) => prev.map((c) => c.id === id ? { ...c, isActive: updated.isActive } : c));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteUser = async (id: string, email: string) => {
    if (!confirm(`Sigur vrei sa stergi utilizatorul ${email}? Aceasta actiune este ireversibila.`)) return;
    try {
      await providerDelete(`/api/provider/users/${id}`);
      setPlatformUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleReassignUser = async () => {
    if (!reassignModal || !reassignTarget) return;
    try {
      const result = await providerPut(`/api/provider/users/${reassignModal.id}/reassign`, { targetCabinetId: reassignTarget });
      alert(`${reassignModal.name} mutat in cabinetul ${result.movedTo}`);
      setReassignModal(null);
      setReassignTarget("");
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const filteredUsers = platformUsers.filter((u) => {
    if (!userSearch) return true;
    const q = userSearch.toLowerCase();
    return u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q) || (u.cabinetName || "").toLowerCase().includes(q);
  });

  const filtered = cabinets.filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);
    }
    return true;
  });

  const totalMRR = cabinets.filter((c) => c.status === "active").reduce((s, c) => s + (PLAN_PRICES[c.plan] || 0), 0);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-sm text-slate-400">Se incarca...</div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">
        {/* Sidebar */}
        <div className="w-[220px] min-w-[220px] bg-white border-r border-slate-200 flex flex-col">
          <div className="p-5 flex items-center gap-2.5 border-b border-slate-200">
            <div
              className="w-9 h-9 flex items-center justify-center text-base font-extrabold text-white rounded-lg bg-violet-500"
            >
              DF
            </div>
            <div>
              <div className="text-[15px] font-extrabold">DosarFonduri</div>
              <div className="text-[10px] font-semibold uppercase text-violet-500" style={{ letterSpacing: ".5px" }}>
                Provider
              </div>
            </div>
          </div>
          <div className="flex-1 p-3">
            {[
              { id: "cabinets", icon: "🏢", label: "Cabinete" },
              { id: "codes", icon: "🔑", label: "Coduri acces" },
              { id: "users", icon: "👥", label: "Utilizatori" },
              { id: "revenue", icon: "💰", label: "Revenue" },
            ].map((item) => (
              <div
                key={item.id}
                className={`flex items-center gap-2.5 py-2.5 px-3 rounded-lg cursor-pointer text-sm font-medium transition-all mb-0.5 ${
                  activeTab === item.id
                    ? "bg-violet-500/10 text-violet-500 font-semibold"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                }`}
                onClick={() => setActiveTab(item.id)}
              >
                {item.icon} {item.label}
              </div>
            ))}
          </div>
          <div className="p-3 text-xs border-t border-slate-200 text-slate-400">
            Provider Admin
            <br />
            <span className="cursor-pointer text-violet-500" onClick={handleLogout}>
              Deconectare
            </span>
          </div>
        </div>

        {/* Main */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Topbar */}
          <div className="px-6 py-3.5 flex items-center gap-4 flex-shrink-0 border-b border-slate-200 bg-white">
            <div className="text-xl font-extrabold flex-1">
              {activeTab === "cabinets" ? "Cabinete" : activeTab === "codes" ? "Coduri de acces" : activeTab === "users" ? "Utilizatori platforma" : "Revenue & Metrici"}
            </div>
            <button
              className="px-4 py-2 text-[13px] font-bold text-white flex items-center gap-1.5 cursor-pointer rounded-lg border-none bg-violet-500 font-sans shadow-[0_2px_12px_rgba(167,139,250,.25)]"
              onClick={() => { setShowGenerate(true); setGenCode(null); setGenCui(""); setGenCuiRes(null); }}
            >
              🔑 Genereaza cod nou
            </button>
          </div>

          {/* Stats bar */}
          <div className="grid grid-cols-4 gap-3.5 p-5 border-b border-slate-200 bg-white">
            <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
              <div className="text-[11px] font-semibold uppercase mb-1.5 text-slate-400" style={{ letterSpacing: ".6px" }}>Cabinete active</div>
              <div className="text-[28px] font-extrabold font-mono text-emerald-500" style={{ letterSpacing: "-1px" }}>
                {revenue?.activeCabinets || 0}
              </div>
              <div className="text-xs text-slate-400">din {revenue?.totalCabinets || 0} total</div>
            </div>
            <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
              <div className="text-[11px] font-semibold uppercase mb-1.5 text-slate-400" style={{ letterSpacing: ".6px" }}>MRR</div>
              <div className="text-[28px] font-extrabold font-mono text-blue-600" style={{ letterSpacing: "-1px" }}>
                {revenue?.mrr || 0}€
              </div>
              <div className="text-xs text-slate-400">venit lunar recurent</div>
            </div>
            <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
              <div className="text-[11px] font-semibold uppercase mb-1.5 text-slate-400" style={{ letterSpacing: ".6px" }}>Trial</div>
              <div className="text-[28px] font-extrabold font-mono text-amber-500" style={{ letterSpacing: "-1px" }}>
                {revenue?.trialCabinets || 0}
              </div>
              <div className="text-xs text-slate-400">cabinete in trial</div>
            </div>
            <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
              <div className="text-[11px] font-semibold uppercase mb-1.5 text-slate-400" style={{ letterSpacing: ".6px" }}>Utilizatori</div>
              <div className="text-[28px] font-extrabold font-mono" style={{ letterSpacing: "-1px" }}>
                {platformUsers.filter(u => u.status === "active").length}
              </div>
              <div className="text-xs text-slate-400">activi din {platformUsers.length} total</div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5">

            {/* ═══ CABINETE ═══ */}
            {activeTab === "cabinets" && (
              <>
                <div className="flex items-center gap-2.5 mb-4">
                  <input
                    className="px-3.5 py-2 text-[13px] outline-none w-[260px] rounded-lg border border-slate-200 bg-slate-50 text-slate-900 font-sans"
                    placeholder="Cauta cabinet, cod..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <div className="flex bg-slate-50 rounded-lg p-0.5 gap-px">
                    {[
                      { id: "all", label: "Toate" },
                      { id: "active", label: "Active" },
                      { id: "trial", label: "Trial" },
                      { id: "inactive", label: "Inactive" },
                    ].map((f) => (
                      <button
                        key={f.id}
                        className={`py-1 px-2.5 rounded-lg text-[11px] font-semibold border-none cursor-pointer font-sans transition-all ${
                          statusFilter === f.id ? "bg-violet-500 text-white" : "bg-transparent text-slate-400 hover:text-slate-500"
                        }`}
                        onClick={() => setStatusFilter(f.id)}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {filtered.map((c) => {
                  const st = STATUS_MAP[c.status] || STATUS_MAP.inactive;
                  const isActive = selectedCabinet === c.id;
                  const trialDays = c.trialEndsAt ? Math.max(0, Math.ceil((new Date(c.trialEndsAt).getTime() - Date.now()) / 86400000)) : 0;
                  return (
                    <div key={c.id}>
                      <div
                        className={`flex items-center gap-4 py-4 px-5 rounded-lg border bg-white mb-2 cursor-pointer transition-all ${
                          isActive ? "border-violet-500 bg-violet-500/[.04]" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                        onClick={() => setSelectedCabinet(isActive ? null : c.id)}
                      >
                        <div
                          className={`w-10 h-10 flex items-center justify-center text-base font-extrabold text-white flex-shrink-0 rounded-md font-mono ${PLAN_BG_CLASSES[c.plan] || "bg-slate-400"}`}
                        >
                          {c.plan?.[0]?.toUpperCase() || "?"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold flex items-center gap-2">
                            {c.name}
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.bgClass} ${st.colorClass}`}>{st.label}</span>
                            {c.status === "trial" && trialDays > 0 && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500">
                                {trialDays}z ramase
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-mono text-slate-400">{c.code}</div>
                          <div className="flex gap-2.5 mt-1 text-[11px] text-slate-400">
                            <span>👥 {c.maxUsers} utilizatori max</span>
                            <span className="capitalize">{c.plan}</span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className={`text-base font-extrabold font-mono ${PLAN_COLOR_CLASSES[c.plan] || "text-slate-400"}`}>
                            {PLAN_PRICES[c.plan] || 0}€
                          </div>
                          <div className="text-[10px] text-slate-400">/ luna</div>
                        </div>
                      </div>

                      {isActive && (
                        <div className="p-5 rounded-lg border border-violet-500 bg-violet-500/[.03] mt-2 mb-2">
                          <div className="text-lg font-extrabold mb-0.5">{c.name}</div>
                          <div className="text-[13px] mb-3 font-mono text-slate-500">{c.code}</div>
                          <div className="grid grid-cols-4 gap-2.5 mb-4">
                            {[
                              { label: "Plan", value: c.plan, colorClass: PLAN_COLOR_CLASSES[c.plan] },
                              { label: "Max utilizatori", value: String(c.maxUsers) },
                              { label: "Status", value: st.label, colorClass: st.colorClass },
                              { label: "Creat", value: new Date(c.createdAt).toLocaleDateString("ro-RO") },
                            ].map((cell, i) => (
                              <div key={i} className="p-2.5 bg-slate-50 rounded-md border border-slate-200">
                                <div className="text-[10px] font-semibold uppercase mb-0.5 text-slate-400" style={{ letterSpacing: ".5px" }}>{cell.label}</div>
                                <div className={`text-[13px] font-semibold capitalize font-mono ${cell.colorClass || ""}`}>
                                  {cell.value}
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <button
                              className="px-4 py-2 text-xs font-bold cursor-pointer transition-all rounded-lg border border-blue-500 bg-blue-600/[.08] text-blue-600 font-sans"
                              onClick={() => handleAccessCabinet(c.id)}
                            >
                              🔓 Acceseaza cabinet
                            </button>
                            <button
                              className="px-4 py-2 text-xs font-semibold cursor-pointer transition-all rounded-lg border border-slate-200 bg-transparent text-slate-500 font-sans"
                              onClick={() => setEditModal({ id: c.id, plan: c.plan, maxUsers: c.maxUsers })}
                            >
                              ✏️ Editeaza plan
                            </button>
                            <button
                              className="px-4 py-2 text-xs font-semibold cursor-pointer transition-all rounded-lg border border-slate-200 bg-transparent text-slate-500 font-sans"
                              onClick={() => { setEmailModal({ id: c.id, name: c.name }); setEmailSubject(""); setEmailMessage(""); }}
                            >
                              📧 Trimite email
                            </button>
                            <button
                              className="px-4 py-2 text-xs font-semibold cursor-pointer transition-all rounded-lg border border-red-500/25 bg-transparent text-red-500 font-sans"
                              onClick={() => handleDeactivate(c.id)}
                            >
                              🚫 Dezactiveaza
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {filtered.length === 0 && (
                  <div className="text-center py-10 text-slate-400">Niciun cabinet gasit.</div>
                )}
              </>
            )}

            {/* ═══ CODURI NEFOLOSITE ═══ */}
            {activeTab === "codes" && (
              <>
                <div className="text-sm mb-4 text-slate-500">
                  Coduri generate dar neactivate inca de niciun cabinet. Poti activa/dezactiva fiecare cod.
                </div>
                {codes.map((c) => (
                  <div className="flex items-center gap-4 py-3.5 px-[18px] rounded-lg border border-slate-200 bg-white mb-2" key={c.id} style={{ opacity: c.isActive ? 1 : 0.55 }}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className={`text-base font-extrabold font-mono ${c.isActive ? "text-violet-500" : "text-slate-400"}`} style={{ letterSpacing: "1px" }}>
                          {c.code}
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            c.isActive ? "bg-emerald-500/[.12] text-emerald-500" : "bg-slate-400/[.12] text-slate-400"
                          }`}
                        >
                          {c.isActive ? "Activ" : "Dezactivat"}
                        </span>
                      </div>
                      {c.companyName && (
                        <div className="text-[13px] font-semibold mt-0.5 text-slate-900">
                          {c.companyName}
                          {c.cui && <span className="text-xs ml-1.5 font-mono text-slate-400">CUI {c.cui}</span>}
                        </div>
                      )}
                      <div className="text-xs mt-1 text-slate-400">
                        <span className="capitalize">{c.plan}</span> · {c.maxUsers} utilizatori · Trial {c.trialDays}z · Creat: {new Date(c.createdAt).toLocaleDateString("ro-RO")}
                      </div>
                    </div>
                    <button
                      className={`px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all rounded-lg border bg-transparent font-sans ${
                        c.isActive ? "border-red-500/25 text-red-500" : "border-emerald-500/25 text-emerald-500"
                      }`}
                      onClick={() => handleToggleCode(c.id)}
                    >
                      {c.isActive ? "Dezactiveaza" : "Activeaza"}
                    </button>
                    <button
                      className="px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all rounded-lg border border-slate-200 bg-transparent text-slate-500 font-sans"
                      onClick={() => navigator.clipboard?.writeText(c.code)}
                    >
                      📋 Copiaza
                    </button>
                    <button
                      className="px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all rounded-lg border border-red-500/25 bg-transparent text-red-500 font-sans"
                      onClick={() => handleDeleteCode(c.id)}
                    >
                      🗑
                    </button>
                  </div>
                ))}
                {codes.length === 0 && (
                  <div className="text-center py-10 text-slate-400">Niciun cod nefolosit</div>
                )}
              </>
            )}

            {/* ═══ UTILIZATORI ═══ */}
            {activeTab === "users" && (
              <>
                <div className="flex items-center gap-2.5 mb-4">
                  <input
                    className="px-3.5 py-2 text-[13px] outline-none w-[300px] rounded-lg border border-slate-200 bg-slate-50 text-slate-900 font-sans"
                    placeholder="Cauta dupa email, nume sau cabinet..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                  />
                  <div className="text-xs text-slate-400">
                    {filteredUsers.length} din {platformUsers.length} utilizatori
                  </div>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                  {/* Table header */}
                  <div className="grid items-center border-b border-slate-200" style={{ gridTemplateColumns: "1fr 1fr 100px 80px 140px 80px" }}>
                    {["Utilizator", "Cabinet", "Rol", "Status", "Ultima activitate", ""].map((h, i) => (
                      <div key={i} className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-400" style={{ letterSpacing: ".5px" }}>{h}</div>
                    ))}
                  </div>

                  {/* Table rows */}
                  {filteredUsers.map((u) => {
                    const statusColorClass = u.status === "active" ? "text-emerald-500" : u.status === "invited" ? "text-amber-500" : u.status === "disabled" ? "text-red-500" : "text-slate-400";
                    const statusBgClass = u.status === "active" ? "bg-emerald-500/10" : u.status === "invited" ? "bg-amber-500/10" : u.status === "disabled" ? "bg-red-500/10" : "bg-slate-400/10";
                    return (
                      <div key={u.id} className="grid items-center transition-colors hover:bg-slate-100 border-b border-slate-100" style={{ gridTemplateColumns: "1fr 1fr 100px 80px 140px 80px" }}>
                        <div className="px-4 py-2.5">
                          <div className="text-[13px] font-semibold">{u.name}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{u.email}</div>
                        </div>
                        <div className="px-4 py-2.5">
                          {u.cabinetName ? (
                            <>
                              <div className="text-[13px] font-semibold">{u.cabinetName}</div>
                              <div className="text-[11px] text-slate-400 font-mono">{u.cabinetCode}</div>
                            </>
                          ) : (
                            <span className="text-[11px] text-slate-400">Fara cabinet</span>
                          )}
                        </div>
                        <div className="px-4 py-2.5 text-[12px] font-medium capitalize text-slate-500">{u.role}</div>
                        <div className="px-4 py-2.5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBgClass} ${statusColorClass}`}>{u.status}</span>
                        </div>
                        <div className="px-4 py-2.5 text-[11px] text-slate-400">
                          {u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleDateString("ro-RO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Niciodata"}
                        </div>
                        <div className="px-4 py-2.5 flex gap-1.5">
                          <button
                            className="px-2 py-1 text-[11px] font-semibold cursor-pointer transition-all rounded-lg border border-blue-500/25 bg-transparent text-blue-500 font-sans"
                            onClick={() => setReassignModal({ id: u.id, name: u.name, email: u.email, currentCabinetId: u.organizationId })}
                            title="Muta in alt cabinet"
                          >
                            ↗
                          </button>
                          <button
                            className="px-2 py-1 text-[11px] font-semibold cursor-pointer transition-all rounded-lg border border-red-500/25 bg-transparent text-red-500 font-sans"
                            onClick={() => handleDeleteUser(u.id, u.email)}
                            title="Sterge utilizator"
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {filteredUsers.length === 0 && (
                    <div className="text-center py-10 text-slate-400">Niciun utilizator gasit</div>
                  )}
                </div>

                {/* Reassign modal */}
                {reassignModal && (
                  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }} onClick={() => setReassignModal(null)}>
                    <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 420, boxShadow: "0 20px 60px rgba(0,0,0,.15)" }} onClick={(e) => e.stopPropagation()}>
                      <div className="text-[15px] font-bold mb-1">Muta utilizator in alt cabinet</div>
                      <div className="text-[13px] text-slate-500 mb-4">{reassignModal.name} ({reassignModal.email})</div>

                      <label className="block text-[11px] font-semibold uppercase mb-1.5 text-slate-400" style={{ letterSpacing: ".7px" }}>Cabinet destinatie</label>
                      <select
                        className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-lg bg-slate-50 mb-4 outline-none"
                        value={reassignTarget}
                        onChange={(e) => setReassignTarget(e.target.value)}
                      >
                        <option value="">Selecteaza cabinetul...</option>
                        {cabinets
                          .filter((c) => c.id !== reassignModal.currentCabinetId)
                          .map((c) => (
                            <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                          ))}
                      </select>

                      <div className="flex gap-2">
                        <button
                          className="px-4 py-2 text-[13px] font-semibold rounded-lg bg-blue-500 text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={!reassignTarget}
                          onClick={handleReassignUser}
                        >
                          Muta
                        </button>
                        <button
                          className="px-4 py-2 text-[13px] font-semibold rounded-lg border border-slate-200 text-slate-600 cursor-pointer"
                          onClick={() => { setReassignModal(null); setReassignTarget(""); }}
                        >
                          Anuleaza
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ═══ REVENUE ═══ */}
            {activeTab === "revenue" && (
              <>
                <div className="text-sm mb-5 text-slate-500">Overview financiar pe toate cabinetele.</div>
                <div className="grid grid-cols-3 gap-3.5 mb-6">
                  <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
                    <div className="text-[11px] font-semibold uppercase mb-1.5 text-slate-400" style={{ letterSpacing: ".6px" }}>MRR (Monthly Recurring Revenue)</div>
                    <div className="text-[28px] font-extrabold font-mono text-emerald-500" style={{ letterSpacing: "-1px" }}>{totalMRR}€</div>
                  </div>
                  <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
                    <div className="text-[11px] font-semibold uppercase mb-1.5 text-slate-400" style={{ letterSpacing: ".6px" }}>Cabinete active</div>
                    <div className="text-[28px] font-extrabold font-mono text-blue-600" style={{ letterSpacing: "-1px" }}>
                      {cabinets.filter((c) => c.status === "active").length}
                    </div>
                  </div>
                  <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
                    <div className="text-[11px] font-semibold uppercase mb-1.5 text-slate-400" style={{ letterSpacing: ".6px" }}>Trial</div>
                    <div className="text-[28px] font-extrabold font-mono text-amber-500" style={{ letterSpacing: "-1px" }}>
                      {cabinets.filter((c) => c.status === "trial").length}
                    </div>
                  </div>
                </div>

                <div className="text-[11px] font-bold uppercase mb-2.5 text-slate-400" style={{ letterSpacing: ".8px" }}>Revenue per cabinet</div>
                <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                  <div className="grid gap-0" style={{ gridTemplateColumns: "1fr 100px 80px 100px" }}>
                    {["Cabinet", "Plan", "MRR", "Status"].map((h, i) => (
                      <div key={i} className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-400 border-b border-slate-200" style={{ letterSpacing: ".5px" }}>{h}</div>
                    ))}
                  </div>
                  {cabinets.filter((c) => c.status === "active" || c.status === "trial").map((c) => {
                    const mrr = PLAN_PRICES[c.plan] || 0;
                    const st = STATUS_MAP[c.status] || STATUS_MAP.inactive;
                    return (
                      <div key={c.id} className="grid items-center transition-colors hover:bg-slate-100 border-b border-slate-100" style={{ gridTemplateColumns: "1fr 100px 80px 100px" }}>
                        <div className="px-4 py-2.5">
                          <div className="text-[13px] font-semibold">{c.name}</div>
                          <div className="text-[11px] text-slate-400">{c.code}</div>
                        </div>
                        <div className={`px-4 py-2.5 text-[13px] font-semibold capitalize ${PLAN_COLOR_CLASSES[c.plan] || ""}`}>{c.plan}</div>
                        <div className="px-4 py-2.5 text-[13px] font-mono">{mrr}€</div>
                        <div className="px-4 py-2.5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.bgClass} ${st.colorClass}`}>{st.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ═══ GENERATE CODE MODAL ═══ */}
        {showGenerate && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] animate-[fadeIn_0.2s]" onClick={(e) => e.target === e.currentTarget && setShowGenerate(false)}>
            <div className="bg-white border border-slate-200 rounded-[18px] w-[480px] p-8 animate-[slideUp_0.3s_ease] shadow-[0_24px_64px_rgba(0,0,0,.10)]">
              <div className="flex justify-between items-center mb-1">
                <div className="text-[19px] font-extrabold tracking-[-0.01em]">🔑 Genereaza cod cabinet</div>
                <button className="cursor-pointer text-lg bg-transparent border-none text-slate-400" onClick={() => setShowGenerate(false)}>✕</button>
              </div>
              <div className="text-sm mb-5 text-slate-500">
                Codul va fi unic si poate fi trimis consultantului pentru activare.
              </div>

              {!genCode ? (
                <>
                  <div className="mb-4">
                    <label className="block text-[11px] font-semibold uppercase mb-1.5 text-slate-400" style={{ letterSpacing: ".7px" }}>Plan tarifar</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["starter", "professional", "enterprise"] as const).map((p) => (
                        <div
                          key={p}
                          className={`py-3 px-2.5 text-center cursor-pointer transition-all rounded-lg border-2 ${
                            genPlan === p ? "border-violet-500 bg-violet-500/[.06]" : "border-slate-200 bg-slate-50"
                          }`}
                          style={{ borderRadius: 10 }}
                          onClick={() => setGenPlan(p)}
                        >
                          <div className={`text-[13px] font-bold capitalize ${PLAN_COLOR_CLASSES[p]}`}>{p}</div>
                          <div className="text-[11px] text-slate-400">{PLAN_PRICES[p]}€/luna</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-3 mb-4">
                    <div className="flex-1">
                      <label className="block text-[11px] font-semibold uppercase mb-1.5 text-slate-400" style={{ letterSpacing: ".7px" }}>Max utilizatori</label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={genMaxUsers}
                        onChange={(e) => setGenMaxUsers(parseInt(e.target.value) || 1)}
                        className="w-full px-3.5 py-2.5 text-sm text-center outline-none rounded-[10px] border border-slate-200 bg-slate-50 text-slate-900 font-mono"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[11px] font-semibold uppercase mb-1.5 text-slate-400" style={{ letterSpacing: ".7px" }}>Perioada trial (zile)</label>
                      <input
                        type="number"
                        min={0}
                        max={90}
                        value={genTrial}
                        onChange={(e) => setGenTrial(parseInt(e.target.value) || 0)}
                        className="w-full px-3.5 py-2.5 text-sm text-center outline-none rounded-[10px] border border-slate-200 bg-slate-50 text-slate-900 font-mono"
                      />
                    </div>
                  </div>

                  {/* CUI lookup — tie code to a specific company */}
                  <div className="mb-4">
                    <label className="block text-[11px] font-semibold uppercase mb-1.5 text-slate-400" style={{ letterSpacing: ".7px" }}>
                      Firma destinatara (CUI) — optional
                    </label>
                    <div className="flex gap-2">
                      <input
                        value={genCui}
                        onChange={(e) => { setGenCui(e.target.value); setGenCuiRes(null); }}
                        onKeyDown={(e) => e.key === "Enter" && handleLookupCui()}
                        className={`flex-1 px-3.5 py-2.5 text-sm outline-none rounded-[10px] border bg-slate-50 text-slate-900 font-mono ${
                          genCuiRes && genCuiRes !== "error" ? "border-emerald-500" : genCuiRes === "error" ? "border-red-500" : "border-slate-200"
                        }`}
                        style={{ letterSpacing: "1px" }}
                        placeholder="ex: 19893984"
                      />
                      <button
                        className="px-4 py-2.5 text-sm font-semibold cursor-pointer rounded-[10px] border border-slate-200 bg-transparent text-slate-500 font-sans"
                        onClick={handleLookupCui}
                        disabled={genCuiLoad || genCui.replace(/\D/g, "").length < 6}
                      >
                        {genCuiLoad ? "..." : "Verifica"}
                      </button>
                    </div>
                    <div className="text-[11px] mt-1 text-slate-400">
                      Daca specifici un CUI, codul va putea fi activat doar de firma respectiva.
                    </div>

                    {genCuiRes && genCuiRes !== "error" && (
                      <div className="mt-2 p-3 rounded-lg border border-emerald-500 bg-emerald-500/[.04]">
                        <div className="text-[15px] font-bold text-emerald-500">{genCuiRes.name}</div>
                        <div className="text-xs mt-1 text-slate-500">
                          CUI: {genCuiRes.taxCode} · {genCuiRes.county}{genCuiRes.city ? `, ${genCuiRes.city}` : ""}
                          {genCuiRes.nace ? ` · CAEN: ${genCuiRes.nace}` : ""}
                        </div>
                        <div className="text-xs text-slate-400">
                          {genCuiRes.address}
                          {genCuiRes.status && (
                            <span className={`font-semibold ml-2 ${genCuiRes.status?.toLowerCase().includes("activ") ? "text-emerald-500" : "text-red-500"}`}>
                              {genCuiRes.status}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {genCuiRes === "error" && (
                      <div className="mt-2 p-2.5 text-xs rounded-lg border border-red-500 bg-red-500/[.04] text-red-500">
                        CUI-ul nu a fost gasit. Verifica si incearca din nou.
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2.5 justify-end">
                    <button className="px-6 py-2.5 text-sm font-semibold cursor-pointer rounded-[10px] border border-slate-200/60 bg-transparent text-slate-500 font-sans min-w-[100px]" onClick={() => setShowGenerate(false)}>Anuleaza</button>
                    <button className="px-6 py-2.5 text-sm font-bold text-white cursor-pointer rounded-[10px] border-none bg-violet-500 font-sans min-w-[100px] shadow-sm shadow-violet-500/20" onClick={handleGenerateCode}>🔑 Genereaza cod</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-5 mb-4 text-center rounded-lg border border-emerald-500 bg-emerald-500/[.04]">
                    <div className="text-2xl font-extrabold mb-2 font-mono text-violet-500" style={{ letterSpacing: "2px" }}>
                      {genCode}
                    </div>
                    <div className="text-xs text-slate-500">
                      Plan: <span className="capitalize">{genPlan}</span> · {genMaxUsers} utilizatori · Trial: {genTrial} zile
                    </div>
                    {genCuiRes && genCuiRes !== "error" && (
                      <div className="text-xs mt-1.5 text-emerald-500">
                        Destinat: {genCuiRes.name} (CUI {genCuiRes.taxCode})
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2.5 justify-end">
                    <button
                      className="px-6 py-2.5 text-sm font-semibold cursor-pointer rounded-[10px] border border-slate-200/60 bg-transparent text-slate-500 font-sans min-w-[100px]"
                      onClick={() => navigator.clipboard?.writeText(genCode!)}
                    >
                      📋 Copiaza cod
                    </button>
                    <button
                      className="px-6 py-2.5 text-sm font-bold text-white cursor-pointer rounded-[10px] border-none bg-violet-500 font-sans min-w-[100px] shadow-sm shadow-violet-500/20"
                      onClick={() => setShowGenerate(false)}
                    >
                      Gata
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        {/* ═══ EDIT PLAN MODAL ═══ */}
        {editModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] animate-[fadeIn_0.2s]" onClick={(e) => e.target === e.currentTarget && setEditModal(null)}>
            <div className="bg-white border border-slate-200 rounded-[18px] w-[480px] p-8 animate-[slideUp_0.3s_ease] shadow-[0_24px_64px_rgba(0,0,0,.10)]">
              <div className="flex justify-between items-center mb-1">
                <div className="text-[19px] font-extrabold tracking-[-0.01em]">✏️ Editeaza plan cabinet</div>
                <button className="cursor-pointer text-lg bg-transparent border-none text-slate-400" onClick={() => setEditModal(null)}>✕</button>
              </div>
              <div className="text-sm mb-5 text-slate-500">
                Modifică planul tarifar și limita de utilizatori.
              </div>

              <div className="mb-4">
                <label className="block text-[11px] font-semibold uppercase mb-1.5 text-slate-400" style={{ letterSpacing: ".7px" }}>Plan tarifar</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["starter", "professional", "enterprise"] as const).map((p) => (
                    <div
                      key={p}
                      className={`py-3 px-2.5 text-center cursor-pointer transition-all border-2 ${
                        editModal.plan === p ? "border-violet-500 bg-violet-500/[.06]" : "border-slate-200 bg-slate-50"
                      }`}
                      style={{ borderRadius: 10 }}
                      onClick={() => setEditModal({ ...editModal, plan: p })}
                    >
                      <div className={`text-[13px] font-bold capitalize ${PLAN_COLOR_CLASSES[p]}`}>{p}</div>
                      <div className="text-[11px] text-slate-400">{PLAN_PRICES[p]}€/luna</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-[11px] font-semibold uppercase mb-1.5 text-slate-400" style={{ letterSpacing: ".7px" }}>Max utilizatori</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={editModal.maxUsers}
                  onChange={(e) => setEditModal({ ...editModal, maxUsers: parseInt(e.target.value) || 1 })}
                  className="w-full px-3.5 py-2.5 text-sm text-center outline-none rounded-[10px] border border-slate-200 bg-slate-50 text-slate-900 font-mono"
                />
              </div>

              <div className="flex gap-2.5 justify-end">
                <button className="px-6 py-2.5 text-sm font-semibold cursor-pointer rounded-[10px] border border-slate-200/60 bg-transparent text-slate-500 font-sans min-w-[100px]" onClick={() => setEditModal(null)}>Anuleaza</button>
                <button className="px-6 py-2.5 text-sm font-bold text-white cursor-pointer rounded-[10px] border-none bg-violet-500 font-sans min-w-[100px] shadow-sm shadow-violet-500/20" onClick={handleEditPlan}>Salveaza</button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ EMAIL MODAL ═══ */}
        {emailModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] animate-[fadeIn_0.2s]" onClick={(e) => e.target === e.currentTarget && setEmailModal(null)}>
            <div className="bg-white border border-slate-200 rounded-[18px] w-[480px] p-8 animate-[slideUp_0.3s_ease] shadow-[0_24px_64px_rgba(0,0,0,.10)]">
              <div className="flex justify-between items-center mb-1">
                <div className="text-[19px] font-extrabold tracking-[-0.01em]">📧 Trimite email</div>
                <button className="cursor-pointer text-lg bg-transparent border-none text-slate-400" onClick={() => setEmailModal(null)}>✕</button>
              </div>
              <div className="text-sm mb-5 text-slate-500">
                Trimite un email către toți utilizatorii din <strong>{emailModal.name}</strong>.
              </div>

              <div className="mb-3">
                <label className="block text-[11px] font-semibold uppercase mb-1.5 text-slate-400" style={{ letterSpacing: ".7px" }}>Subiect</label>
                <input
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm outline-none rounded-[10px] border border-slate-200 bg-slate-50 text-slate-900 font-sans"
                  placeholder="Subiect email..."
                />
              </div>

              <div className="mb-4">
                <label className="block text-[11px] font-semibold uppercase mb-1.5 text-slate-400" style={{ letterSpacing: ".7px" }}>Mesaj</label>
                <textarea
                  value={emailMessage}
                  onChange={(e) => setEmailMessage(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm outline-none rounded-[10px] border border-slate-200 bg-slate-50 text-slate-900 font-sans min-h-[120px] resize-y"
                  placeholder="Scrie mesajul..."
                />
              </div>

              <div className="flex gap-2.5 justify-end">
                <button className="px-6 py-2.5 text-sm font-semibold cursor-pointer rounded-[10px] border border-slate-200/60 bg-transparent text-slate-500 font-sans min-w-[100px]" onClick={() => setEmailModal(null)}>Anuleaza</button>
                <button
                  className="px-6 py-2.5 text-sm font-bold text-white cursor-pointer rounded-[10px] border-none bg-blue-600 font-sans min-w-[100px] shadow-sm shadow-blue-600/20"
                  style={{ opacity: emailSending ? 0.5 : 1 }}
                  onClick={handleSendEmail}
                  disabled={emailSending || !emailSubject.trim() || !emailMessage.trim()}
                >
                  {emailSending ? "Se trimite..." : "Trimite email"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
