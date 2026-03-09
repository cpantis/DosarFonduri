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
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

const providerGet = <T = any>(path: string) => providerApi<T>(path);
const providerPost = <T = any>(path: string, body: any) => providerApi<T>(path, { method: "POST", body: JSON.stringify(body) });
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
  expiresAt: string;
  createdAt: string;
}

interface Revenue {
  totalCabinets: number;
  activeCabinets: number;
  trialCabinets: number;
  mrr: number;
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: "Activ", color: "#34d399", bg: "rgba(52,211,153,.12)" },
  trial: { label: "Trial", color: "#fbbf24", bg: "rgba(251,191,36,.12)" },
  inactive: { label: "Inactiv", color: "#5a6478", bg: "rgba(90,100,120,.12)" },
  expired: { label: "Expirat", color: "#f87171", bg: "rgba(248,113,113,.12)" },
};

const PLAN_COLORS: Record<string, string> = { starter: "#fb923c", professional: "#4d8bff", enterprise: "#a78bfa" };
const PLAN_PRICES: Record<string, number> = { starter: 49, professional: 149, enterprise: 399 };

export default function ProviderDashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("cabinets");
  const [cabinets, setCabinets] = useState<Cabinet[]>([]);
  const [codes, setCodes] = useState<UnusedCode[]>([]);
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [selectedCabinet, setSelectedCabinet] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showGenerate, setShowGenerate] = useState(false);
  const [genPlan, setGenPlan] = useState("professional");
  const [genMaxUsers, setGenMaxUsers] = useState(5);
  const [genTrial, setGenTrial] = useState(30);
  const [genCode, setGenCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [cabs, unusedCodes, rev] = await Promise.all([
        providerGet("/api/provider/cabinets"),
        providerGet("/api/provider/codes/unused"),
        providerGet("/api/provider/revenue"),
      ]);
      setCabinets(cabs);
      setCodes(unusedCodes);
      setRevenue(rev);
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

  const handleGenerateCode = async () => {
    try {
      const created = await providerPost("/api/provider/codes", {
        plan: genPlan,
        maxUsers: genMaxUsers,
        trialDays: genTrial,
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
      <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--bg-deep)" }}>
        <div className="text-sm" style={{ color: "var(--text-muted)" }}>Se incarca...</div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .page{display:flex;height:100vh;overflow:hidden;background:var(--bg-deep);color:var(--text-primary)}
        .side{width:220px;min-width:220px;background:var(--bg-surface);border-right:1px solid var(--border);display:flex;flex-direction:column}
        .s-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:var(--r-sm);cursor:pointer;font-size:14px;font-weight:500;color:var(--text-secondary);transition:all .15s;margin-bottom:2px}
        .s-item:hover{background:var(--bg-hover);color:var(--text-primary)}.s-item.active{background:rgba(167,139,250,.1);color:var(--accent-purple);font-weight:600}
        .stat{padding:16px 18px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-elevated)}
        .cab-card{display:flex;align-items:center;gap:16px;padding:16px 20px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-surface);margin-bottom:8px;cursor:pointer;transition:all .15s}
        .cab-card:hover{border-color:var(--border-active);background:var(--bg-elevated)}
        .cab-card.active{border-color:var(--accent-purple);background:rgba(167,139,250,.04)}
        .cab-detail{padding:20px;border-radius:var(--r-md);border:1px solid var(--accent-purple);background:rgba(167,139,250,.03);margin-top:8px;margin-bottom:8px}
        .pill-group{display:flex;background:var(--bg-deep);border-radius:var(--r-md);padding:2px;gap:1px}
        .pill{padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;border:none;cursor:pointer;background:transparent;color:var(--text-muted);font-family:var(--font-sans);transition:all .15s}
        .pill:hover{color:var(--text-secondary)}.pill.on{background:var(--accent-purple);color:#fff}
        .code-card{display:flex;align-items:center;gap:16px;padding:14px 18px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-surface);margin-bottom:8px}
        .overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;animation:fadeIn .2s}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        .modal{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r-lg);width:480px;padding:28px;animation:slideUp .3s ease}
        @keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      <div className="page">
        {/* Sidebar */}
        <div className="side">
          <div className="p-5 flex items-center gap-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
            <div
              className="w-9 h-9 flex items-center justify-center text-base font-extrabold text-white"
              style={{ borderRadius: 10, background: "var(--accent-purple)" }}
            >
              DF
            </div>
            <div>
              <div className="text-[15px] font-extrabold">DosarFonduri</div>
              <div className="text-[10px] font-semibold uppercase" style={{ color: "var(--accent-purple)", letterSpacing: ".5px" }}>
                Provider
              </div>
            </div>
          </div>
          <div className="flex-1 p-3">
            <div className={`s-item ${activeTab === "cabinets" ? "active" : ""}`} onClick={() => setActiveTab("cabinets")}>🏢 Cabinete</div>
            <div className={`s-item ${activeTab === "codes" ? "active" : ""}`} onClick={() => setActiveTab("codes")}>🔑 Coduri nefolosite</div>
            <div className={`s-item ${activeTab === "revenue" ? "active" : ""}`} onClick={() => setActiveTab("revenue")}>💰 Revenue</div>
          </div>
          <div className="p-3 text-xs" style={{ borderTop: "1px solid var(--border)", color: "var(--text-muted)" }}>
            Provider Admin
            <br />
            <span className="cursor-pointer" style={{ color: "var(--accent-purple)" }} onClick={handleLogout}>
              Deconectare
            </span>
          </div>
        </div>

        {/* Main */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Topbar */}
          <div className="px-6 py-3.5 flex items-center gap-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-surface)" }}>
            <div className="text-xl font-extrabold flex-1">
              {activeTab === "cabinets" ? "Cabinete" : activeTab === "codes" ? "Coduri de acces" : "Revenue & Metrici"}
            </div>
            <button
              className="px-4 py-2 text-[13px] font-bold text-white flex items-center gap-1.5 cursor-pointer"
              style={{
                borderRadius: "var(--r-md)",
                border: "none",
                background: "var(--accent-purple)",
                fontFamily: "var(--font-sans)",
                boxShadow: "0 2px 12px rgba(167,139,250,.25)",
              }}
              onClick={() => { setShowGenerate(true); setGenCode(null); }}
            >
              🔑 Genereaza cod nou
            </button>
          </div>

          {/* Stats bar */}
          <div className="grid grid-cols-4 gap-3.5 p-5" style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-surface)" }}>
            <div className="stat">
              <div className="text-[11px] font-semibold uppercase mb-1.5" style={{ letterSpacing: ".6px", color: "var(--text-muted)" }}>Cabinete active</div>
              <div className="text-[28px] font-extrabold" style={{ fontFamily: "var(--font-mono)", letterSpacing: "-1px", color: "var(--accent-green)" }}>
                {revenue?.activeCabinets || 0}
              </div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>din {revenue?.totalCabinets || 0} total</div>
            </div>
            <div className="stat">
              <div className="text-[11px] font-semibold uppercase mb-1.5" style={{ letterSpacing: ".6px", color: "var(--text-muted)" }}>MRR</div>
              <div className="text-[28px] font-extrabold" style={{ fontFamily: "var(--font-mono)", letterSpacing: "-1px", color: "var(--accent-blue)" }}>
                {revenue?.mrr || 0}€
              </div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>venit lunar recurent</div>
            </div>
            <div className="stat">
              <div className="text-[11px] font-semibold uppercase mb-1.5" style={{ letterSpacing: ".6px", color: "var(--text-muted)" }}>Trial</div>
              <div className="text-[28px] font-extrabold" style={{ fontFamily: "var(--font-mono)", letterSpacing: "-1px", color: "var(--accent-yellow)" }}>
                {revenue?.trialCabinets || 0}
              </div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>cabinete in trial</div>
            </div>
            <div className="stat">
              <div className="text-[11px] font-semibold uppercase mb-1.5" style={{ letterSpacing: ".6px", color: "var(--text-muted)" }}>Coduri nefolosite</div>
              <div className="text-[28px] font-extrabold" style={{ fontFamily: "var(--font-mono)", letterSpacing: "-1px" }}>
                {codes.length}
              </div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>disponibile</div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5">

            {/* ═══ CABINETE ═══ */}
            {activeTab === "cabinets" && (
              <>
                <div className="flex items-center gap-2.5 mb-4">
                  <input
                    className="px-3.5 py-2 text-[13px] outline-none"
                    style={{
                      width: 260,
                      borderRadius: "var(--r-md)",
                      border: "1px solid var(--border)",
                      background: "var(--bg-deep)",
                      color: "var(--text-primary)",
                      fontFamily: "var(--font-sans)",
                    }}
                    placeholder="Cauta cabinet, cod..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <div className="pill-group">
                    {[
                      { id: "all", label: "Toate" },
                      { id: "active", label: "Active" },
                      { id: "trial", label: "Trial" },
                      { id: "inactive", label: "Inactive" },
                    ].map((f) => (
                      <button key={f.id} className={`pill ${statusFilter === f.id ? "on" : ""}`} onClick={() => setStatusFilter(f.id)}>
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
                      <div className={`cab-card ${isActive ? "active" : ""}`} onClick={() => setSelectedCabinet(isActive ? null : c.id)}>
                        <div
                          className="w-10 h-10 flex items-center justify-center text-base font-extrabold text-white flex-shrink-0"
                          style={{ borderRadius: "var(--r-sm)", background: PLAN_COLORS[c.plan] || "#5a6478", fontFamily: "var(--font-mono)" }}
                        >
                          {c.plan?.[0]?.toUpperCase() || "?"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold flex items-center gap-2">
                            {c.name}
                            <span className="text-[10px] font-bold px-2 py-0.5" style={{ borderRadius: 10, background: st.bg, color: st.color }}>{st.label}</span>
                            {c.status === "trial" && trialDays > 0 && (
                              <span className="text-[10px] font-bold px-2 py-0.5" style={{ borderRadius: 10, background: "rgba(251,191,36,.12)", color: "#fbbf24" }}>
                                {trialDays}z ramase
                              </span>
                            )}
                          </div>
                          <div className="text-xs" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{c.code}</div>
                          <div className="flex gap-2.5 mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                            <span>👥 {c.maxUsers} utilizatori max</span>
                            <span className="capitalize">{c.plan}</span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-base font-extrabold" style={{ fontFamily: "var(--font-mono)", color: PLAN_COLORS[c.plan] }}>
                            {PLAN_PRICES[c.plan] || 0}€
                          </div>
                          <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>/ luna</div>
                        </div>
                      </div>

                      {isActive && (
                        <div className="cab-detail">
                          <div className="text-lg font-extrabold mb-0.5">{c.name}</div>
                          <div className="text-[13px] mb-3" style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{c.code}</div>
                          <div className="grid grid-cols-4 gap-2.5 mb-4">
                            {[
                              { label: "Plan", value: c.plan, color: PLAN_COLORS[c.plan] },
                              { label: "Max utilizatori", value: String(c.maxUsers) },
                              { label: "Status", value: st.label, color: st.color },
                              { label: "Creat", value: new Date(c.createdAt).toLocaleDateString("ro-RO") },
                            ].map((cell, i) => (
                              <div key={i} className="p-2.5" style={{ background: "var(--bg-deep)", borderRadius: "var(--r-sm)", border: "1px solid var(--border)" }}>
                                <div className="text-[10px] font-semibold uppercase mb-0.5" style={{ letterSpacing: ".5px", color: "var(--text-muted)" }}>{cell.label}</div>
                                <div className="text-[13px] font-semibold capitalize" style={{ fontFamily: "var(--font-mono)", color: cell.color }}>
                                  {cell.value}
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <button className="px-4 py-2 text-xs font-semibold cursor-pointer transition-all" style={{ borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontFamily: "var(--font-sans)" }}>
                              ✏️ Editeaza plan
                            </button>
                            <button className="px-4 py-2 text-xs font-semibold cursor-pointer transition-all" style={{ borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontFamily: "var(--font-sans)" }}>
                              📧 Trimite email
                            </button>
                            <button className="px-4 py-2 text-xs font-semibold cursor-pointer transition-all" style={{ borderRadius: "var(--r-sm)", border: "1px solid rgba(248,113,113,.25)", background: "transparent", color: "var(--accent-red)", fontFamily: "var(--font-sans)" }}>
                              🚫 Dezactiveaza
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {filtered.length === 0 && (
                  <div className="text-center py-10" style={{ color: "var(--text-muted)" }}>Niciun cabinet gasit.</div>
                )}
              </>
            )}

            {/* ═══ CODURI NEFOLOSITE ═══ */}
            {activeTab === "codes" && (
              <>
                <div className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
                  Coduri generate dar neactivate inca de niciun cabinet.
                </div>
                {codes.map((c) => (
                  <div className="code-card" key={c.id}>
                    <div className="flex-1">
                      <div className="text-base font-extrabold" style={{ fontFamily: "var(--font-mono)", color: "var(--accent-purple)", letterSpacing: "1px" }}>
                        {c.code}
                      </div>
                      <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                        <span className="capitalize">{c.plan}</span> · {c.maxUsers} utilizatori · Trial {c.trialDays}z
                      </div>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                        Creat: {new Date(c.createdAt).toLocaleDateString("ro-RO")} · Expira: {new Date(c.expiresAt).toLocaleDateString("ro-RO")}
                      </div>
                    </div>
                    <button
                      className="px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all"
                      style={{ borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontFamily: "var(--font-sans)" }}
                      onClick={() => navigator.clipboard?.writeText(c.code)}
                    >
                      📋 Copiaza
                    </button>
                    <button
                      className="px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all"
                      style={{ borderRadius: "var(--r-sm)", border: "1px solid rgba(248,113,113,.25)", background: "transparent", color: "var(--accent-red)", fontFamily: "var(--font-sans)" }}
                      onClick={() => handleDeleteCode(c.id)}
                    >
                      🗑
                    </button>
                  </div>
                ))}
                {codes.length === 0 && (
                  <div className="text-center py-10" style={{ color: "var(--text-muted)" }}>Niciun cod nefolosit</div>
                )}
              </>
            )}

            {/* ═══ REVENUE ═══ */}
            {activeTab === "revenue" && (
              <>
                <div className="text-sm mb-5" style={{ color: "var(--text-secondary)" }}>Overview financiar pe toate cabinetele.</div>
                <div className="grid grid-cols-3 gap-3.5 mb-6">
                  <div className="stat">
                    <div className="text-[11px] font-semibold uppercase mb-1.5" style={{ letterSpacing: ".6px", color: "var(--text-muted)" }}>MRR (Monthly Recurring Revenue)</div>
                    <div className="text-[28px] font-extrabold" style={{ fontFamily: "var(--font-mono)", letterSpacing: "-1px", color: "var(--accent-green)" }}>{totalMRR}€</div>
                  </div>
                  <div className="stat">
                    <div className="text-[11px] font-semibold uppercase mb-1.5" style={{ letterSpacing: ".6px", color: "var(--text-muted)" }}>Cabinete active</div>
                    <div className="text-[28px] font-extrabold" style={{ fontFamily: "var(--font-mono)", letterSpacing: "-1px", color: "var(--accent-blue)" }}>
                      {cabinets.filter((c) => c.status === "active").length}
                    </div>
                  </div>
                  <div className="stat">
                    <div className="text-[11px] font-semibold uppercase mb-1.5" style={{ letterSpacing: ".6px", color: "var(--text-muted)" }}>Trial</div>
                    <div className="text-[28px] font-extrabold" style={{ fontFamily: "var(--font-mono)", letterSpacing: "-1px", color: "var(--accent-yellow)" }}>
                      {cabinets.filter((c) => c.status === "trial").length}
                    </div>
                  </div>
                </div>

                <div className="text-[11px] font-bold uppercase mb-2.5" style={{ letterSpacing: ".8px", color: "var(--text-muted)" }}>Revenue per cabinet</div>
                <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", overflow: "hidden", background: "var(--bg-surface)" }}>
                  <div className="grid gap-0" style={{ gridTemplateColumns: "1fr 100px 80px 100px" }}>
                    <div className="px-4 py-2.5 text-[10px] font-bold uppercase" style={{ letterSpacing: ".5px", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>Cabinet</div>
                    <div className="px-4 py-2.5 text-[10px] font-bold uppercase" style={{ letterSpacing: ".5px", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>Plan</div>
                    <div className="px-4 py-2.5 text-[10px] font-bold uppercase" style={{ letterSpacing: ".5px", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>MRR</div>
                    <div className="px-4 py-2.5 text-[10px] font-bold uppercase" style={{ letterSpacing: ".5px", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>Status</div>
                  </div>
                  {cabinets.filter((c) => c.status === "active" || c.status === "trial").map((c) => {
                    const mrr = PLAN_PRICES[c.plan] || 0;
                    const st = STATUS_MAP[c.status] || STATUS_MAP.inactive;
                    return (
                      <div key={c.id} className="grid items-center transition-colors hover:bg-[var(--bg-hover)]" style={{ gridTemplateColumns: "1fr 100px 80px 100px", borderBottom: "1px solid rgba(42,48,64,.5)" }}>
                        <div className="px-4 py-2.5">
                          <div className="text-[13px] font-semibold">{c.name}</div>
                          <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{c.code}</div>
                        </div>
                        <div className="px-4 py-2.5 text-[13px] font-semibold capitalize" style={{ color: PLAN_COLORS[c.plan] }}>{c.plan}</div>
                        <div className="px-4 py-2.5 text-[13px]" style={{ fontFamily: "var(--font-mono)" }}>{mrr}€</div>
                        <div className="px-4 py-2.5">
                          <span className="text-[10px] font-bold px-2 py-0.5" style={{ borderRadius: 10, background: st.bg, color: st.color }}>{st.label}</span>
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
          <div className="overlay" onClick={(e) => e.target === e.currentTarget && setShowGenerate(false)}>
            <div className="modal">
              <div className="flex justify-between items-center mb-1">
                <div className="text-xl font-extrabold">🔑 Genereaza cod cabinet</div>
                <button className="cursor-pointer text-lg" style={{ background: "none", border: "none", color: "var(--text-muted)" }} onClick={() => setShowGenerate(false)}>✕</button>
              </div>
              <div className="text-sm mb-5" style={{ color: "var(--text-secondary)" }}>
                Codul va fi unic si poate fi trimis consultantului pentru activare.
              </div>

              {!genCode ? (
                <>
                  <div className="mb-4">
                    <label className="block text-[11px] font-semibold uppercase mb-1.5" style={{ letterSpacing: ".7px", color: "var(--text-muted)" }}>Plan tarifar</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["starter", "professional", "enterprise"] as const).map((p) => (
                        <div
                          key={p}
                          className="py-3 px-2.5 text-center cursor-pointer transition-all"
                          style={{
                            borderRadius: "var(--r-sm)",
                            border: `2px solid ${genPlan === p ? "var(--accent-purple)" : "var(--border)"}`,
                            background: genPlan === p ? "rgba(167,139,250,.06)" : "var(--bg-elevated)",
                          }}
                          onClick={() => setGenPlan(p)}
                        >
                          <div className="text-[13px] font-bold capitalize" style={{ color: PLAN_COLORS[p] }}>{p}</div>
                          <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{PLAN_PRICES[p]}€/luna</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-3 mb-4">
                    <div className="flex-1">
                      <label className="block text-[11px] font-semibold uppercase mb-1.5" style={{ letterSpacing: ".7px", color: "var(--text-muted)" }}>Max utilizatori</label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={genMaxUsers}
                        onChange={(e) => setGenMaxUsers(parseInt(e.target.value) || 1)}
                        className="w-full px-3.5 py-2.5 text-sm text-center outline-none"
                        style={{ borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "var(--bg-deep)", color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[11px] font-semibold uppercase mb-1.5" style={{ letterSpacing: ".7px", color: "var(--text-muted)" }}>Perioada trial (zile)</label>
                      <input
                        type="number"
                        min={0}
                        max={90}
                        value={genTrial}
                        onChange={(e) => setGenTrial(parseInt(e.target.value) || 0)}
                        className="w-full px-3.5 py-2.5 text-sm text-center outline-none"
                        style={{ borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "var(--bg-deep)", color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
                      />
                    </div>
                  </div>

                  <div className="flex gap-2.5 justify-end">
                    <button className="px-5 py-2.5 text-sm font-semibold cursor-pointer" style={{ borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontFamily: "var(--font-sans)" }} onClick={() => setShowGenerate(false)}>Anuleaza</button>
                    <button className="px-5 py-2.5 text-sm font-bold text-white cursor-pointer" style={{ borderRadius: "var(--r-md)", border: "none", background: "var(--accent-purple)", fontFamily: "var(--font-sans)" }} onClick={handleGenerateCode}>🔑 Genereaza cod</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-5 mb-4 text-center" style={{ borderRadius: "var(--r-md)", border: "1px solid var(--accent-green)", background: "rgba(52,211,153,.04)" }}>
                    <div className="text-2xl font-extrabold mb-2" style={{ fontFamily: "var(--font-mono)", color: "var(--accent-purple)", letterSpacing: "2px" }}>
                      {genCode}
                    </div>
                    <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      Plan: <span className="capitalize">{genPlan}</span> · {genMaxUsers} utilizatori · Trial: {genTrial} zile
                    </div>
                  </div>
                  <div className="flex gap-2.5 justify-end">
                    <button
                      className="px-5 py-2.5 text-sm font-semibold cursor-pointer"
                      style={{ borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontFamily: "var(--font-sans)" }}
                      onClick={() => navigator.clipboard?.writeText(genCode!)}
                    >
                      📋 Copiaza cod
                    </button>
                    <button
                      className="px-5 py-2.5 text-sm font-bold text-white cursor-pointer"
                      style={{ borderRadius: "var(--r-md)", border: "none", background: "var(--accent-purple)", fontFamily: "var(--font-sans)" }}
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
      </div>
    </>
  );
}
