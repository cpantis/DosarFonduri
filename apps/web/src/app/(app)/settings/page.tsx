"use client";
import { useState, useEffect, useCallback } from "react";
import { apiGet, apiPut, apiPost, apiDelete } from "@/lib/api";
import { getToken } from "@/lib/auth";

// ─── Types ───
interface OrgConfig {
  solomonModel: string;
  solomonET: boolean;
  neemiaModel: string;
  reguliFixeModel: string;
  reguliInterpModel: string;
  reguliInterpET: boolean;
  reviewThreshold: string;
  notifNewElement: boolean;
  notifEligFail: boolean;
  notifTemplateReady: boolean;
  notifDeadline: boolean;
  emailFrom: string | null;
}

interface ApiIntegration {
  id: string;
  name: string;
  type: string;
  url: string;
  apiKeyMasked: string | null;
  enabled: boolean;
  autoSync: boolean;
  syncIntervalDays: number;
  status: string;
  lastTestedAt: string | null;
  lastTestResult: string | null;
}

const AI_MODELS = [
  { id: "claude-haiku-4-5-20251001", short: "haiku", name: "Claude Haiku", speed: "Rapid", cost: "~$0.001/apel", use: "Clasificare, OCR text nativ", color: "#34d399" },
  { id: "claude-sonnet-4-20250514", short: "sonnet", name: "Claude Sonnet", speed: "Mediu", cost: "~$0.04/apel", use: "Extragere date, reguli fixe, completare template", color: "#2563eb" },
  { id: "claude-opus-4-6", short: "opus", name: "Claude Opus", speed: "Lent", cost: "~$0.25/apel", use: "Eligibilitate complexa, reguli interpretate, Solomon expert", color: "#8b5cf6" },
];

const SECTIONS = [
  { id: "solomon", icon: "🤖", label: "Solomon (Expert Fonduri)" },
  { id: "neemia", icon: "📝", label: "Neemia (Generare Dosar)" },
  { id: "ghid", icon: "📖", label: "Ghid Finantare (Reguli)" },
  { id: "branding", icon: "🎨", label: "Branding Documente" },
  { id: "api", icon: "🔌", label: "Integrare API" },
  { id: "notificari", icon: "🔔", label: "Notificari" },
  { id: "export", icon: "📤", label: "Export & Backup" },
];

const TYPE_ICONS: Record<string, string> = { ONRC: "🏛", ANAF: "📊", Email: "📧", SMS: "📱", Storage: "☁️", Custom: "🔗" };

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState("solomon");
  const [config, setConfig] = useState<OrgConfig | null>(null);
  const [apis, setApis] = useState<ApiIntegration[]>([]);
  const [saved, setSaved] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [testingApi, setTestingApi] = useState<string | null>(null);
  const [showAddApi, setShowAddApi] = useState(false);
  const [newApi, setNewApi] = useState({ name: "", type: "ONRC", url: "", apiKey: "" });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Branding state
  const [branding, setBranding] = useState<{
    primaryColor: string;
    accentColor: string;
    fontFamily: string;
    footerText: string;
    highlightColor: string;
    warningColor: string;
    logoOnWorkDocs: boolean;
    logoOnFinalDocs: boolean;
  }>({
    primaryColor: "#1a3a5c",
    accentColor: "#4d8bff",
    fontFamily: "Inter",
    footerText: "",
    highlightColor: "#FFF3CD",
    warningColor: "#f87171",
    logoOnWorkDocs: true,
    logoOnFinalDocs: false,
  });
  const [brandingSaved, setBrandingSaved] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      setConfigError(null);
      const data = await apiGet("/api/config");
      setConfig(data);
    } catch (err: any) {
      setConfigError(err.message || "Eroare la incarcarea configurarilor");
    }
  }, []);

  const loadApis = useCallback(async () => {
    try {
      const data = await apiGet("/api/config/api-integrations");
      setApis(data);
    } catch (err: any) {
      console.error("Failed to load API integrations:", err.message);
    }
  }, []);

  const loadBranding = useCallback(async () => {
    try {
      const data = await apiGet("/api/config/branding");
      if (data && typeof data === "object") {
        setBranding(prev => ({
          ...prev,
          ...data,
        }));
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadConfig();
    loadApis();
    loadBranding();
  }, [loadConfig, loadApis, loadBranding]);

  const updateConfig = async (updates: Partial<OrgConfig>) => {
    if (!config) return;
    const previous = config;
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    try {
      await apiPut("/api/config", updates);
    } catch {
      setConfig(previous);
    }
  };

  const handleSave = async () => {
    if (!config) return;
    try {
      await apiPut("/api/config", config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSaveBranding = async () => {
    try {
      await apiPut("/api/config/branding", branding);
      setBrandingSaved(true);
      setTimeout(() => setBrandingSaved(false), 2000);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleTestApi = async (id: string) => {
    setTestingApi(id);
    try {
      const result = await apiPost(`/api/config/api-integrations/${id}/test`, {});
      setApis((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, status: result.success ? "connected" : "error", lastTestResult: result.result, lastTestedAt: new Date().toISOString() }
            : a
        )
      );
    } catch (err: any) {
      setApis((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, status: "error", lastTestResult: err.message || "Test esuat", lastTestedAt: new Date().toISOString() }
            : a
        )
      );
    } finally {
      setTestingApi(null);
    }
  };

  const handleAddApi = async () => {
    if (!newApi.name || !newApi.url) return;
    try {
      const created = await apiPost("/api/config/api-integrations", newApi);
      setApis((prev) => [...prev, created]);
      setNewApi({ name: "", type: "ONRC", url: "", apiKey: "" });
      setShowAddApi(false);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleExport = async (path: string, filename: string) => {
    try {
      const token = getToken();
      const res = await fetch(`${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteApi = async (id: string) => {
    try {
      await apiDelete(`/api/config/api-integrations/${id}`);
      setApis((prev) => prev.filter((a) => a.id !== id));
      setDeleteConfirmId(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleToggleApi = async (id: string) => {
    const apiItem = apis.find((a) => a.id === id);
    if (!apiItem) return;
    const previousEnabled = apiItem.enabled;
    setApis((prev) => prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)));
    try {
      await apiPut(`/api/config/api-integrations/${id}`, { enabled: !previousEnabled });
    } catch {
      setApis((prev) => prev.map((a) => (a.id === id ? { ...a, enabled: previousEnabled } : a)));
    }
  };

  if (!config) {
    return (
      <>
        <div className="flex items-center gap-4 flex-shrink-0 bg-white border-b border-slate-200" style={{ padding: "18px 32px" }}>
          <div className="flex-1" style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.4px" }}>Configurari</div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          {configError ? (
            <div className="text-center">
              <div className="text-sm mb-3 text-red-500">{configError}</div>
              <button
                className="px-4 py-2 text-sm font-semibold cursor-pointer rounded-md border border-slate-200 bg-transparent text-slate-500 font-sans"
                onClick={loadConfig}
              >
                Reincearca
              </button>
            </div>
          ) : (
            <div className="text-sm text-slate-400">Se incarca...</div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`
        .cfg-layout{flex:1;display:flex;overflow:hidden}
        .cfg-nav{width:240px;min-width:240px;border-right:1px solid #e2e8f0;background:#ffffff;padding:16px 8px;overflow-y:auto}
        .cfg-nav-item{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;color:#64748b;transition:all .15s;margin-bottom:2px}
        .cfg-nav-item:hover{background:#f1f5f9;color:#0f172a}
        .cfg-nav-item.active{background:rgba(37,99,235,.08);color:#2563eb;font-weight:600}
        .cfg-content{flex:1;overflow-y:auto;padding:28px 36px;background:#f8fafc}
        .setting{display:flex;align-items:flex-start;gap:16px;padding:16px;border-radius:10px;border:1px solid #e2e8f0;background:#ffffff;margin-bottom:10px;transition:all .15s}
        .setting:hover{border-color:#cbd5e1}
        .toggle{width:44px;height:24px;border-radius:12px;background:#e2e8f0;cursor:pointer;position:relative;transition:background .2s;flex-shrink:0}
        .toggle.on{background:#2563eb}
        .toggle-knob{width:20px;height:20px;border-radius:50%;background:#fff;position:absolute;top:2px;left:2px;transition:left .2s;box-shadow:0 1px 4px rgba(0,0,0,.3)}
        .toggle.on .toggle-knob{left:22px}
        .model-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}
        .model-card{padding:14px;border-radius:10px;border:2px solid #e2e8f0;background:#f8fafc;cursor:pointer;transition:all .15s;text-align:center}
        .model-card:hover{border-color:#cbd5e1}
        .model-card.on{border-color:#2563eb;background:rgba(37,99,235,.04)}
        .api-card{padding:16px;border-radius:10px;border:1px solid #e2e8f0;background:#ffffff;margin-bottom:10px;transition:all .15s}
        .api-card:hover{border-color:#cbd5e1}
        .api-card.disabled{opacity:.5}
        .api-spinner{width:12px;height:12px;border:2px solid rgba(37,99,235,.3);border-top-color:#2563eb;border-radius:50%;animation:spin .7s linear infinite;display:inline-block}
        @keyframes spin{to{transform:rotate(360deg)}}
        .export-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .export-btn{padding:20px;border-radius:10px;border:1px solid #e2e8f0;background:#f8fafc;cursor:pointer;transition:all .15s;text-align:center}
        .export-btn:hover{border-color:#cbd5e1;background:#f1f5f9}
      `}</style>

      {/* Topbar */}
      <div className="flex items-center gap-4 flex-shrink-0 bg-white border-b border-slate-200" style={{ padding: "18px 32px" }}>
        <div className="flex-1" style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.4px" }}>Configurari</div>
        <button
          className="px-5 py-2 text-[13px] font-bold text-white flex items-center gap-1.5 cursor-pointer transition-all rounded-[10px] border-none bg-emerald-500 font-sans"
          onClick={handleSave}
        >
          {saved ? "✓ Salvat" : "💾 Salveaza modificarile"}
        </button>
      </div>

      <div className="cfg-layout">
        {/* Left nav */}
        <div className="cfg-nav">
          {SECTIONS.map((s) => (
            <div
              key={s.id}
              className={`cfg-nav-item ${activeSection === s.id ? "active" : ""}`}
              onClick={() => setActiveSection(s.id)}
            >
              <span className="text-base w-5 text-center">{s.icon}</span> {s.label}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="cfg-content">

          {/* ═══ SOLOMON ═══ */}
          {activeSection === "solomon" && (
            <>
              <div className="text-[22px] font-extrabold mb-1">🤖 Solomon — Expert Fonduri Europene</div>
              <div className="text-sm mb-7 leading-relaxed text-slate-500">
                Configureaza modelul AI pentru Solomon — expert in pregatirea si conformitatea proiectelor cu finantare europeana, cu cunostinte de achizitii, eligibilitate cheltuieli, specificatii tehnice si cerinte documentare.
              </div>

              <div className="mb-7">
                <div className="text-[11px] font-bold uppercase mb-3 flex items-center gap-2 text-slate-400" style={{ letterSpacing: ".8px" }}>
                  Model implicit
                </div>
                <div className="model-grid">
                  {AI_MODELS.map((m) => (
                    <div
                      key={m.id}
                      className={`model-card ${config.solomonModel === m.id ? "on" : ""}`}
                      onClick={() => updateConfig({ solomonModel: m.id })}
                    >
                      <div className="text-sm font-bold mb-1 text-slate-900">
                        <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: m.color }} />
                        {m.name}
                      </div>
                      <div className="text-[11px] mb-0.5 text-slate-400">Viteza: {m.speed}</div>
                      <div className="text-[11px] mb-1.5 font-mono text-slate-500">Cost: {m.cost}</div>
                      <div className="text-[11px] leading-snug text-slate-400">{m.use}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="setting">
                <div className="flex-1">
                  <div className="text-sm font-semibold mb-0.5">Extended Thinking (ET)</div>
                  <div className="text-xs text-slate-400">Activeaza rationament avansat pentru intrebari complexe de eligibilitate. Creste calitatea dar si costul si timpul de raspuns.</div>
                </div>
                <div className={`toggle ${config.solomonET ? "on" : ""}`} onClick={() => updateConfig({ solomonET: !config.solomonET })}>
                  <div className="toggle-knob" />
                </div>
              </div>

              <div className="p-3 mt-3 flex items-center gap-3 rounded-md bg-slate-50 border border-slate-200">
                <span className="text-xs flex-1 text-slate-400">Cost estimat per conversatie medie (15 mesaje):</span>
                <span className="text-sm font-bold font-mono text-amber-500">
                  {config.solomonModel.includes("opus") ? "~$0.35" : config.solomonModel.includes("sonnet") ? "~$0.08" : "~$0.02"}
                </span>
              </div>
            </>
          )}

          {/* ═══ NEEMIA ═══ */}
          {activeSection === "neemia" && (
            <>
              <div className="text-[22px] font-extrabold mb-1">📝 Neemia — Expert Generare Dosar</div>
              <div className="text-sm mb-7 leading-relaxed text-slate-500">
                Configureaza modelul AI pentru Neemia — expert in generarea dosarului complet de finantare, completarea template-urilor DOCX/XLSX, verificarea consistentei intre documente si validarea conformitatii.
              </div>

              <div className="mb-7">
                <div className="text-[11px] font-bold uppercase mb-3 text-slate-400" style={{ letterSpacing: ".8px" }}>Model completare</div>
                <div className="model-grid">
                  {AI_MODELS.filter((m) => m.short !== "haiku").map((m) => (
                    <div
                      key={m.id}
                      className={`model-card ${config.neemiaModel === m.id ? "on" : ""}`}
                      onClick={() => updateConfig({ neemiaModel: m.id })}
                    >
                      <div className="text-sm font-bold mb-1 text-slate-900">
                        <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: m.color }} />
                        {m.name}
                      </div>
                      <div className="text-[11px] mb-1.5 font-mono text-slate-500">Cost: {m.cost}</div>
                      <div className="text-[11px] leading-snug text-slate-400">{m.use}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="setting">
                <div className="flex-1">
                  <div className="text-sm font-semibold mb-0.5">Completare progresiva (SSE streaming)</div>
                  <div className="text-xs text-slate-400">Afiseaza completarea pagina cu pagina in timp real. Dezactivat = completare batch, rezultat la final.</div>
                </div>
                <div className="toggle on"><div className="toggle-knob" /></div>
              </div>

              <div className="setting">
                <div className="flex-1">
                  <div className="text-sm font-semibold mb-0.5">Validare automata elemente inainte de completare</div>
                  <div className="text-xs text-slate-400">Neemia verifica daca toate elementele necesare sunt confirmate, valideaza consistenta datelor intre documente si se asigura ca dosarul respecta cerintele programului inainte de generare.</div>
                </div>
                <div className="toggle on"><div className="toggle-knob" /></div>
              </div>
            </>
          )}

          {/* ═══ GHID FINANTARE ═══ */}
          {activeSection === "ghid" && (
            <>
              <div className="text-[22px] font-extrabold mb-1">📖 Ghid Finantare — Extragere Reguli</div>
              <div className="text-sm mb-7 leading-relaxed text-slate-500">
                Configureaza modelele AI pentru extragerea regulilor fixe si interpretate din ghidurile de finantare.
              </div>

              <div className="mb-7">
                <div className="text-[11px] font-bold uppercase mb-3 text-slate-400" style={{ letterSpacing: ".8px" }}>Reguli fixe (binar, verificabile)</div>
                <div className="setting">
                  <div className="flex-1">
                    <div className="text-sm font-semibold mb-0.5">Model extragere reguli fixe</div>
                    <div className="text-xs text-slate-400">Dimensiuni minime, plafoane, categorii eligibile. ~25-30 reguli/ghid, precizie 92-97%.</div>
                  </div>
                  <select
                    className="px-3 py-2 text-[13px] outline-none cursor-pointer min-w-[160px] rounded-md border border-slate-200 bg-slate-50 text-slate-900 font-sans"
                    value={config.reguliFixeModel}
                    onChange={(e) => updateConfig({ reguliFixeModel: e.target.value })}
                  >
                    <option value="claude-sonnet-4-20250514">Sonnet (~$0.04, ~12s)</option>
                    <option value="claude-opus-4-6">Opus (~$0.25, ~35s)</option>
                  </select>
                </div>
              </div>

              <div className="mb-7">
                <div className="text-[11px] font-bold uppercase mb-3 text-slate-400" style={{ letterSpacing: ".8px" }}>Reguli interpretate (context, arbori decizionali)</div>
                <div className="setting">
                  <div className="flex-1">
                    <div className="text-sm font-semibold mb-0.5">Model extragere reguli interpretate</div>
                    <div className="text-xs text-slate-400">Intensitate sprijin, criterii selectie complexe. Precizie 75-85%, necesita validare umana.</div>
                  </div>
                  <select
                    className="px-3 py-2 text-[13px] outline-none cursor-pointer min-w-[160px] rounded-md border border-slate-200 bg-slate-50 text-slate-900 font-sans"
                    value={config.reguliInterpModel}
                    onChange={(e) => updateConfig({ reguliInterpModel: e.target.value })}
                  >
                    <option value="claude-opus-4-6">Opus + ET (~$0.25, ~35s)</option>
                    <option value="claude-sonnet-4-20250514">Sonnet (~$0.04, ~12s)</option>
                  </select>
                </div>

                <div className="setting">
                  <div className="flex-1">
                    <div className="text-sm font-semibold mb-0.5">Extended Thinking pentru reguli interpretate</div>
                    <div className="text-xs text-slate-400">Budget tokens: 8000-12000. Creste semnificativ calitatea pe arbori decizionali complexi.</div>
                  </div>
                  <div className={`toggle ${config.reguliInterpET ? "on" : ""}`} onClick={() => updateConfig({ reguliInterpET: !config.reguliInterpET })}>
                    <div className="toggle-knob" />
                  </div>
                </div>
              </div>

              <div className="setting">
                <div className="flex-1">
                  <div className="text-sm font-semibold mb-0.5">Prag auto-review consultant</div>
                  <div className="text-xs text-slate-400">Regulile cu confidence sub acest prag sunt marcate automat pentru verificare umana.</div>
                </div>
                <div className="flex items-center gap-1.5 text-[13px] text-slate-500">
                  <input
                    type="number"
                    min={50}
                    max={99}
                    value={Math.round(Number(config.reviewThreshold) * 100)}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val) && val >= 50 && val <= 99) {
                        updateConfig({ reviewThreshold: (val / 100).toFixed(2) });
                      }
                    }}
                    className="w-[70px] text-center px-3 py-2 text-[13px] outline-none rounded-md border border-slate-200 bg-slate-50 text-slate-900 font-mono"
                  />
                  <span>%</span>
                </div>
              </div>

              <div className="p-3 mt-3 flex items-center gap-3 rounded-md bg-slate-50 border border-slate-200">
                <span className="text-xs flex-1 text-slate-400">Cost estimat procesare completa ghid (60 pag.):</span>
                <span className="text-sm font-bold font-mono text-amber-500">~$0.30 (~50s)</span>
              </div>
            </>
          )}

          {/* ═══ INTEGRARE API ═══ */}
          {activeSection === "api" && (
            <>
              <div className="text-[22px] font-extrabold mb-1">🔌 Integrare API</div>
              <div className="text-sm mb-7 leading-relaxed text-slate-500">
                Gestioneaza conexiunile cu servicii externe: date ONRC, ANAF, email, si altele. Fiecare API poate fi testat independent.
              </div>

              {apis.map((api) => {
                const isTesting = testingApi === api.id;
                const statusColor = api.status === "connected" ? "#34d399" : api.status === "error" ? "#ef4444" : "#f59e0b";
                return (
                  <div key={api.id} className={`api-card ${!api.enabled ? "disabled" : ""}`}>
                    <div className="flex items-center gap-3 mb-2.5">
                      <div
                        className="w-9 h-9 flex items-center justify-center text-lg flex-shrink-0 rounded-md bg-slate-50 border border-slate-200"
                      >
                        {TYPE_ICONS[api.type] || "🔗"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold flex items-center gap-2">
                          {api.name}
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-lg bg-slate-50 text-slate-400">
                            {api.type}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-400">{api.url}</div>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: statusColor }}>
                        <span className="w-2 h-2 rounded-full" style={{ background: statusColor }} />
                        {api.status}
                      </div>
                      <div className={`toggle ${api.enabled ? "on" : ""}`} onClick={() => handleToggleApi(api.id)}>
                        <div className="toggle-knob" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-2.5">
                      <div className="p-2 bg-slate-50 rounded-md border border-slate-200">
                        <div className="text-[10px] font-semibold uppercase mb-0.5 text-slate-400" style={{ letterSpacing: ".5px" }}>API Key</div>
                        <div className="text-xs font-mono text-slate-500">{api.apiKeyMasked || "—"}</div>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-md border border-slate-200">
                        <div className="text-[10px] font-semibold uppercase mb-0.5 text-slate-400" style={{ letterSpacing: ".5px" }}>Ultimul test</div>
                        <div className="text-xs font-mono" style={{ color: api.lastTestResult?.includes("OK") ? "#34d399" : "#94a3b8" }}>
                          {api.lastTestResult || "—"}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-1.5">
                      <button
                        className="px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all rounded-md border border-blue-300/30 bg-transparent text-blue-600 font-sans"
                        style={{ opacity: isTesting ? 0.6 : 1 }}
                        onClick={() => !isTesting && handleTestApi(api.id)}
                      >
                        {isTesting ? <><span className="api-spinner" /> Se testeaza...</> : "⚡ Test conexiune"}
                      </button>
                      <button
                        className="px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all rounded-md border border-slate-200 bg-transparent text-slate-500 font-sans"
                      >
                        ✏️ Editeaza
                      </button>
                      {deleteConfirmId === api.id ? (
                        <>
                          <span className="text-xs font-semibold text-red-500">Sigur stergi?</span>
                          <button
                            className="px-3 py-1.5 text-xs font-bold cursor-pointer rounded-md border border-red-500 bg-red-500/10 text-red-500 font-sans"
                            onClick={() => handleDeleteApi(api.id)}
                          >
                            Da, sterge
                          </button>
                          <button
                            className="px-3 py-1.5 text-xs font-semibold cursor-pointer rounded-md border border-slate-200 bg-transparent text-slate-500 font-sans"
                            onClick={() => setDeleteConfirmId(null)}
                          >
                            Anuleaza
                          </button>
                        </>
                      ) : (
                        <button
                          className="px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all rounded-md border border-red-500/25 bg-transparent text-red-500 font-sans"
                          onClick={() => setDeleteConfirmId(api.id)}
                        >
                          🗑 Sterge
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {!showAddApi ? (
                <button
                  className="w-full py-2.5 mt-2.5 text-xs font-semibold cursor-pointer transition-all text-center rounded-md border border-dashed border-slate-200 bg-transparent text-slate-400 font-sans"
                  onClick={() => setShowAddApi(true)}
                >
                  + Adauga integrare API
                </button>
              ) : (
                <div className="p-4 mt-2.5 rounded-[10px] border border-dashed border-slate-200 bg-slate-50">
                  <div className="flex justify-between items-center mb-3">
                    <div className="text-[13px] font-bold">Adauga API nou</div>
                    <button className="cursor-pointer bg-none border-none text-slate-400 text-sm" onClick={() => setShowAddApi(false)}>✕</button>
                  </div>
                  <div className="flex gap-2 mb-2">
                    <input
                      className="flex-1 px-3 py-2 text-[13px] outline-none rounded-md border border-slate-200 bg-slate-50 text-slate-900 font-mono"
                      placeholder="Nume (ex: termene.ro)"
                      value={newApi.name}
                      onChange={(e) => setNewApi((p) => ({ ...p, name: e.target.value }))}
                    />
                    <select
                      className="px-3 py-2 text-[13px] outline-none cursor-pointer rounded-md border border-slate-200 bg-slate-50 text-slate-900 font-sans"
                      value={newApi.type}
                      onChange={(e) => setNewApi((p) => ({ ...p, type: e.target.value }))}
                    >
                      <option value="ONRC">ONRC</option>
                      <option value="ANAF">ANAF</option>
                      <option value="Email">Email</option>
                      <option value="SMS">SMS</option>
                      <option value="Storage">Storage</option>
                      <option value="Custom">Custom</option>
                    </select>
                  </div>
                  <input
                    className="w-full px-3 py-2 text-[13px] outline-none mb-2 rounded-md border border-slate-200 bg-slate-50 text-slate-900 font-mono"
                    placeholder="URL endpoint (ex: https://api.termene.ro/v1)"
                    value={newApi.url}
                    onChange={(e) => setNewApi((p) => ({ ...p, url: e.target.value }))}
                  />
                  <input
                    className="w-full px-3 py-2 text-[13px] outline-none mb-2 rounded-md border border-slate-200 bg-slate-50 text-slate-900 font-mono"
                    placeholder="API Key"
                    type="password"
                    value={newApi.apiKey}
                    onChange={(e) => setNewApi((p) => ({ ...p, apiKey: e.target.value }))}
                  />
                  <div className="flex gap-2 justify-end mt-2.5">
                    <button
                      className="px-3.5 py-1.5 text-xs font-semibold cursor-pointer rounded-md border border-slate-200 bg-transparent text-slate-500 font-sans"
                      onClick={() => setShowAddApi(false)}
                    >
                      Anuleaza
                    </button>
                    <button
                      className="px-4 py-1.5 text-xs font-bold text-white cursor-pointer rounded-md border-none bg-emerald-500 font-sans"
                      style={{
                        opacity: !newApi.name || !newApi.url ? 0.4 : 1,
                      }}
                      disabled={!newApi.name || !newApi.url}
                      onClick={handleAddApi}
                    >
                      Adauga
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ═══ BRANDING DOCUMENTE ═══ */}
          {activeSection === "branding" && (
            <>
              <div className="text-[22px] font-extrabold mb-1">🎨 Branding Documente</div>
              <div className="text-sm mb-7 leading-relaxed text-slate-500">
                Personalizeaza aspectul documentelor generate de Neemia cu culorile si fontul cabinetului tau.
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-[11px] font-semibold uppercase mb-1.5 text-slate-400" style={{ letterSpacing: ".7px" }}>Culoare principala (header tabele)</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={branding.primaryColor}
                      onChange={(e) => setBranding(prev => ({ ...prev, primaryColor: e.target.value }))}
                      className="cursor-pointer w-10 h-8 border border-slate-200 rounded-md bg-transparent p-0"
                    />
                    <input
                      className="flex-1 px-3 py-2 text-[13px] outline-none rounded-md border border-slate-200 bg-slate-50 text-slate-900 font-mono"
                      value={branding.primaryColor}
                      onChange={(e) => setBranding(prev => ({ ...prev, primaryColor: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase mb-1.5 text-slate-400" style={{ letterSpacing: ".7px" }}>Culoare accent (badge-uri)</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={branding.accentColor}
                      onChange={(e) => setBranding(prev => ({ ...prev, accentColor: e.target.value }))}
                      className="cursor-pointer w-10 h-8 border border-slate-200 rounded-md bg-transparent p-0"
                    />
                    <input
                      className="flex-1 px-3 py-2 text-[13px] outline-none rounded-md border border-slate-200 bg-slate-50 text-slate-900 font-mono"
                      value={branding.accentColor}
                      onChange={(e) => setBranding(prev => ({ ...prev, accentColor: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-[11px] font-semibold uppercase mb-1.5 text-slate-400" style={{ letterSpacing: ".7px" }}>Font documente</label>
                  <select
                    className="w-full px-3 py-2 text-[13px] outline-none rounded-md border border-slate-200 bg-slate-50 text-slate-900 font-sans"
                    value={branding.fontFamily}
                    onChange={(e) => setBranding(prev => ({ ...prev, fontFamily: e.target.value }))}
                  >
                    <option value="Inter">Inter</option>
                    <option value="Arial">Arial</option>
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Calibri">Calibri</option>
                    <option value="Georgia">Georgia</option>
                    <option value="Roboto">Roboto</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase mb-1.5 text-slate-400" style={{ letterSpacing: ".7px" }}>Culoare evidentiare (randuri)</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={branding.highlightColor}
                      onChange={(e) => setBranding(prev => ({ ...prev, highlightColor: e.target.value }))}
                      className="cursor-pointer w-10 h-8 border border-slate-200 rounded-md bg-transparent p-0"
                    />
                    <input
                      className="flex-1 px-3 py-2 text-[13px] outline-none rounded-md border border-slate-200 bg-slate-50 text-slate-900 font-mono"
                      value={branding.highlightColor}
                      onChange={(e) => setBranding(prev => ({ ...prev, highlightColor: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-[11px] font-semibold uppercase mb-1.5 text-slate-400" style={{ letterSpacing: ".7px" }}>Text footer cabinet</label>
                <input
                  className="w-full px-3 py-2 text-[13px] outline-none rounded-md border border-slate-200 bg-slate-50 text-slate-900 font-sans"
                  placeholder="ex: Cabinet Consultant ABC SRL - dosarfonduri.ro"
                  value={branding.footerText}
                  onChange={(e) => setBranding(prev => ({ ...prev, footerText: e.target.value }))}
                />
              </div>

              <div className="flex gap-6 mb-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={branding.logoOnWorkDocs}
                    onChange={(e) => setBranding(prev => ({ ...prev, logoOnWorkDocs: e.target.checked }))}
                  />
                  <span className="text-[13px]">Logo pe documente de lucru</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={branding.logoOnFinalDocs}
                    onChange={(e) => setBranding(prev => ({ ...prev, logoOnFinalDocs: e.target.checked }))}
                  />
                  <span className="text-[13px]">Logo pe documente finale</span>
                </label>
              </div>

              {/* Preview */}
              <div className="mb-6 p-4 rounded-[10px] border border-slate-200 bg-slate-50">
                <div className="text-[11px] font-semibold uppercase mb-3 text-slate-400" style={{ letterSpacing: ".7px" }}>Previzualizare tabel</div>
                <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ background: branding.primaryColor, color: "#fff", padding: "6px 10px", fontFamily: branding.fontFamily, fontWeight: 700, textAlign: "left" }}>Element</th>
                      <th style={{ background: branding.primaryColor, color: "#fff", padding: "6px 10px", fontFamily: branding.fontFamily, fontWeight: 700, textAlign: "left" }}>Valoare</th>
                      <th style={{ background: branding.primaryColor, color: "#fff", padding: "6px 10px", fontFamily: branding.fontFamily, fontWeight: 700, textAlign: "center" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td style={{ padding: "5px 10px", fontFamily: branding.fontFamily, borderBottom: "1px solid #dee2e6" }}>Denumire firma</td><td style={{ padding: "5px 10px", fontFamily: branding.fontFamily, borderBottom: "1px solid #dee2e6" }}>COMEXIM R SRL</td><td style={{ padding: "5px 10px", fontFamily: branding.fontFamily, borderBottom: "1px solid #dee2e6", textAlign: "center", color: branding.accentColor, fontWeight: 700 }}>CONFORM</td></tr>
                    <tr style={{ background: "#f8f9fa" }}><td style={{ padding: "5px 10px", fontFamily: branding.fontFamily, borderBottom: "1px solid #dee2e6" }}>CUI</td><td style={{ padding: "5px 10px", fontFamily: branding.fontFamily, borderBottom: "1px solid #dee2e6" }}>2146135</td><td style={{ padding: "5px 10px", fontFamily: branding.fontFamily, borderBottom: "1px solid #dee2e6", textAlign: "center", color: branding.accentColor, fontWeight: 700 }}>CONFORM</td></tr>
                    <tr style={{ background: branding.highlightColor }}><td style={{ padding: "5px 10px", fontFamily: branding.fontFamily, fontWeight: 700, borderBottom: "1px solid #dee2e6" }}>Valoare proiect</td><td style={{ padding: "5px 10px", fontFamily: branding.fontFamily, fontWeight: 700, borderBottom: "1px solid #dee2e6" }}>2,500,000 EUR</td><td style={{ padding: "5px 10px", fontFamily: branding.fontFamily, borderBottom: "1px solid #dee2e6", textAlign: "center", color: branding.warningColor, fontWeight: 700 }}>ATENTIE</td></tr>
                  </tbody>
                </table>
                {branding.footerText && (
                  <div className="mt-3 text-[10px]" style={{ color: "#888", fontFamily: branding.fontFamily }}>{branding.footerText}</div>
                )}
              </div>

              <button
                className="px-5 py-2.5 text-sm font-bold text-white cursor-pointer rounded-[10px] border-none bg-blue-600 font-sans"
                onClick={handleSaveBranding}
              >
                {brandingSaved ? "✓ Salvat!" : "Salveaza branding"}
              </button>
            </>
          )}

          {/* ═══ NOTIFICARI ═══ */}
          {activeSection === "notificari" && (
            <>
              <div className="text-[22px] font-extrabold mb-1">🔔 Notificari</div>
              <div className="text-sm mb-7 leading-relaxed text-slate-500">
                Configureaza cand si cum primesti notificari despre activitatea din proiecte.
              </div>

              <div className="mb-7">
                <div className="text-[11px] font-bold uppercase mb-3 text-slate-400" style={{ letterSpacing: ".8px" }}>Email</div>
                <div className="setting">
                  <div className="flex-1">
                    <div className="text-sm font-semibold mb-0.5">Adresa expeditor</div>
                    <div className="text-xs text-slate-400">Adresa de email de la care se trimit notificarile (via Resend).</div>
                  </div>
                  <input
                    className="px-3 py-2 text-[13px] outline-none rounded-md border border-slate-200 bg-slate-50 text-slate-900 font-mono"
                    style={{ width: 260 }}
                    value={config.emailFrom || ""}
                    onChange={(e) => updateConfig({ emailFrom: e.target.value })}
                  />
                </div>
              </div>

              <div className="mb-7">
                <div className="text-[11px] font-bold uppercase mb-3 text-slate-400" style={{ letterSpacing: ".8px" }}>Evenimente</div>
                {[
                  { key: "notifNewElement" as const, label: "Element nou identificat de Solomon", desc: "Cand Solomon identifica si extrage un element din conversatie, document sau analiza." },
                  { key: "notifEligFail" as const, label: "Eligibilitate esuata", desc: "Cand o verificare de eligibilitate nu trece." },
                  { key: "notifTemplateReady" as const, label: "Document generat", desc: "Cand Neemia finalizeaza generarea si verificarea unui document din dosar." },
                  { key: "notifDeadline" as const, label: "Termen apropiat", desc: "Cu 7 zile inainte de deadline-ul sesiunii de depunere." },
                ].map((n) => (
                  <div key={n.key} className="setting">
                    <div className="flex-1">
                      <div className="text-sm font-semibold mb-0.5">{n.label}</div>
                      <div className="text-xs text-slate-400">{n.desc}</div>
                    </div>
                    <div
                      className={`toggle ${config[n.key] ? "on" : ""}`}
                      onClick={() => updateConfig({ [n.key]: !config[n.key] })}
                    >
                      <div className="toggle-knob" />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ═══ EXPORT & BACKUP ═══ */}
          {activeSection === "export" && (
            <>
              <div className="text-[22px] font-extrabold mb-1">📤 Export & Backup</div>
              <div className="text-sm mb-7 leading-relaxed text-slate-500">
                Exporta datele proiectelor sau creeaza backup-uri ale configurarilor.
              </div>

              <div className="export-grid">
                <div className="export-btn" onClick={() => handleExport("/api/export/projects", `dosarfonduri_projects_${new Date().toISOString().slice(0, 10)}.json`)}>
                  <div className="text-2xl mb-1.5">📦</div>
                  <div className="text-[13px] font-semibold mb-0.5 text-slate-900">Export toate proiectele</div>
                  <div className="text-[11px] text-slate-400">JSON cu elemente, documente, template-uri completate</div>
                </div>
                <div className="export-btn" onClick={() => handleExport("/api/export/config", `dosarfonduri_config_${new Date().toISOString().slice(0, 10)}.json`)}>
                  <div className="text-2xl mb-1.5">⚙️</div>
                  <div className="text-[13px] font-semibold mb-0.5 text-slate-900">Export configurari</div>
                  <div className="text-[11px] text-slate-400">JSON cu toate setarile curente</div>
                </div>
                <div className="export-btn" style={{ opacity: 0.5, cursor: "not-allowed" }}>
                  <div className="text-2xl mb-1.5">🗄</div>
                  <div className="text-[13px] font-semibold mb-0.5 text-slate-900">Backup baza de date</div>
                  <div className="text-[11px] text-slate-400">PostgreSQL dump (disponibil in curand)</div>
                </div>
                <div className="export-btn" onClick={() => handleExport("/api/export/activity", `dosarfonduri_activity_${new Date().toISOString().slice(0, 10)}.csv`)}>
                  <div className="text-2xl mb-1.5">📊</div>
                  <div className="text-[13px] font-semibold mb-0.5 text-slate-900">Raport activitate</div>
                  <div className="text-[11px] text-slate-400">CSV cu toate actiunile pe ultimele 30 zile</div>
                </div>
                <div className="export-btn" onClick={() => handleExport("/api/export/projects-csv", `dosarfonduri_proiecte_${new Date().toISOString().slice(0, 10)}.csv`)}>
                  <div className="text-2xl mb-1.5">📋</div>
                  <div className="text-[13px] font-semibold mb-0.5 text-slate-900">Export proiecte CSV</div>
                  <div className="text-[11px] text-slate-400">CSV cu toate proiectele, firme, elemente, deadline-uri</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
