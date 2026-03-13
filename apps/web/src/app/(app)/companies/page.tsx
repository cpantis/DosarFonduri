"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { isPF, FORME_JURIDICE } from "@/hooks/useFormaJuridica";
import { apiGet, apiPost, api } from "@/lib/api";

/* ═══ HELPERS ═══ */
const formaColor = (cod: string): { bg: string; color: string } => {
  if (isPF(cod)) return { bg: "rgba(251,146,60,0.12)", color: "var(--accent-orange)" };
  const map: Record<string, { bg: string; color: string }> = {
    SRL: { bg: "rgba(77,139,255,0.12)", color: "var(--accent-blue)" },
    SA: { bg: "rgba(167,139,250,0.12)", color: "var(--accent-purple)" },
    SNC: { bg: "rgba(52,211,153,0.12)", color: "var(--accent-green)" },
    SCS: { bg: "rgba(52,211,153,0.12)", color: "var(--accent-green)" },
    SCA: { bg: "rgba(167,139,250,0.12)", color: "var(--accent-purple)" },
  };
  return map[cod] || { bg: "rgba(77,139,255,0.12)", color: "var(--accent-blue)" };
};

const formatSyncTime = (iso: string | null | undefined) => {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  if (diffDays === 0) return `Azi, ${hh}:${mm}`;
  if (diffDays === 1) return `Ieri, ${hh}:${mm}`;
  const months = ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "nov", "dec"];
  return `${d.getDate()} ${months[d.getMonth()]}, ${hh}:${mm}`;
};

/* ═══ COMPONENT ═══ */
export default function CompaniesPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState("auto");
  const [addForma, setAddForma] = useState("SRL");
  const [cui, setCui] = useState("");
  const [cuiLoad, setCuiLoad] = useState(false);
  const [cuiRes, setCuiRes] = useState<{ denumire: string; adresa: string; caen: string; stare: string } | "error" | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cuiSearchResults, setCuiSearchResults] = useState<any[]>([]);
  const [cuiSearching, setCuiSearching] = useState(false);
  const cuiSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCompanies = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiGet<any[]>("/api/companies");
      setCompanies(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Eroare la incarcarea firmelor");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  const filtered = companies.filter(f => {
    const forma = f.formaJuridica || "";
    if (filter === "activ" && f.stare === "radiata") return false;
    if (filter === "radiat" && f.stare !== "radiata") return false;
    if (filter === "soc" && !["SRL", "SA", "SNC", "SCS", "SCA"].includes(forma)) return false;
    if (filter === "pf" && !isPF(forma)) return false;
    if (search) {
      const q = search.toLowerCase();
      return (f.denumire || "").toLowerCase().includes(q) || (f.cui || "").toLowerCase().includes(q) || (f.caen || "").includes(q) || (f.judet || "").toLowerCase().includes(q) || forma.toLowerCase().includes(q);
    }
    return true;
  });

  const checkCui = async () => {
    const cleanCui = cui.replace(/\D/g, "");
    if (cleanCui.length < 6) return;
    setCuiLoad(true);
    setCuiRes(null);
    try {
      const result = await apiPost<any>("/api/companies", { cui: cleanCui, mode: "auto" });
      setCuiRes({ denumire: result.denumire || result.name || "Firma adaugata", adresa: result.adresa || "\u2014", caen: result.caen || "\u2014", stare: result.stare || "ACTIV" });
      await fetchCompanies();
      if (result.id) router.push(`/companies/${result.id}`);
    } catch {
      setCuiRes("error");
    } finally {
      setCuiLoad(false);
    }
  };

  const searchCUI = useCallback((query: string) => {
    if (cuiSearchTimer.current) clearTimeout(cuiSearchTimer.current);
    if (!query || query.length < 3) { setCuiSearchResults([]); return; }
    setCuiSearching(true);
    cuiSearchTimer.current = setTimeout(async () => {
      try {
        const results = await apiGet(`/api/companies/search-cui?q=${encodeURIComponent(query)}`);
        setCuiSearchResults(Array.isArray(results) ? results : []);
      } catch { setCuiSearchResults([]); }
      finally { setCuiSearching(false); }
    }, 400);
  }, []);

  const addFromListaFirme = async (fiscalCode: string) => {
    setCuiLoad(true);
    setCuiSearchResults([]);
    try {
      const result = await apiPost<any>("/api/companies/from-listafirme", { cui: fiscalCode });
      setCuiRes({ denumire: result.denumire || "Firma adaugata", adresa: result.adresa || "\u2014", caen: result.caen || "\u2014", stare: result.stare || "ACTIV" });
      await fetchCompanies();
      if (result.id) router.push(`/companies/${result.id}`);
    } catch {
      try {
        const result = await apiPost<any>("/api/companies", { cui: fiscalCode, mode: "auto" });
        setCuiRes({ denumire: result.denumire || "Firma adaugata", adresa: result.adresa || "\u2014", caen: result.caen || "\u2014", stare: result.stare || "ACTIV" });
        await fetchCompanies();
        if (result.id) router.push(`/companies/${result.id}`);
      } catch { setCuiRes("error"); }
    } finally { setCuiLoad(false); }
  };

  const handleManualUpload = async () => {
    if (!uploadFile) return;
    setUploadLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("formaJuridica", addForma);
      const result = await api<any>("/api/companies", { method: "POST", body: formData, timeout: 120_000 });
      await fetchCompanies();
      setShowAdd(false);
      setUploadFile(null);
      if (result.id) router.push(`/companies/${result.id}`);
    } catch (err: any) {
      alert("Eroare la upload: " + (err.message || "Eroare necunoscuta"));
    } finally { setUploadLoading(false); }
  };

  const handleFileDrop = (e: React.DragEvent) => { e.preventDefault(); const file = e.dataTransfer.files?.[0]; if (file && file.type === "application/pdf") setUploadFile(file); };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) setUploadFile(file); };

  return (
    <>
      <style>{`
        .topbar{padding:18px 32px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:16px;background:var(--bg-surface);flex-shrink:0}
        .tb-title{font-size:22px;font-weight:800;flex:1;letter-spacing:-.4px}.tb-count{font-size:14px;color:var(--text-muted);font-weight:500}
        .btn-add{display:flex;align-items:center;gap:6px;padding:10px 22px;border-radius:var(--r-md);border:none;background:var(--accent-blue);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font-sans);transition:all .15s;box-shadow:0 2px 12px rgba(77,139,255,.25)}
        .btn-add:hover{background:#5d9bff}
        .firme-toolbar{padding:14px 32px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--border);background:var(--bg-surface);flex-shrink:0;flex-wrap:wrap}
        .fi{padding:10px 16px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-deep);color:var(--text-primary);font-size:13px;font-family:var(--font-sans);outline:none;transition:border-color .2s}
        .fi:focus{border-color:var(--accent-blue)}.fi::placeholder{color:var(--text-muted)}.fi.mono{font-family:var(--font-mono)}
        .fi.ok{border-color:var(--accent-green)}.fi.err{border-color:var(--accent-red)}
        .pill-group{display:flex;background:var(--bg-deep);border-radius:var(--r-md);padding:3px;gap:2px}
        .pill{padding:6px 14px;border-radius:8px;font-size:12px;font-weight:600;border:none;cursor:pointer;background:transparent;color:var(--text-secondary);font-family:var(--font-sans);transition:all .15s;white-space:nowrap}
        .pill:hover{color:var(--text-primary)}.pill.on{background:var(--accent-blue);color:#fff}

        .firme-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:16px;padding:28px 32px}
        .firma-card{display:flex;align-items:flex-start;gap:16px;padding:20px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-surface);cursor:pointer;transition:all .18s}
        .firma-card:hover{border-color:var(--border-active);box-shadow:0 2px 12px rgba(0,0,0,.08);transform:translateY(-1px)}
        .fc-icon{width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;flex-shrink:0;font-family:var(--font-mono)}
        .fc-info{flex:1;min-width:0}
        .fc-name{font-size:15px;font-weight:700;margin-bottom:6px;line-height:1.3;color:var(--text-primary)}
        .fc-badges{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
        .fc-badge{font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px;white-space:nowrap}
        .fc-meta{font-size:12px;color:var(--text-muted);display:flex;gap:12px;flex-wrap:wrap;line-height:1.5}
        .fc-meta span{display:flex;align-items:center;gap:3px}
        .fc-sync{font-size:11px;color:var(--text-muted);font-family:var(--font-mono);margin-top:6px}

        .empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 32px;color:var(--text-muted);gap:12px}
        .empty-state .es-icon{font-size:48px;opacity:.4}.empty-state .es-text{font-size:14px;text-align:center}

        .overlay{position:fixed;inset:0;background:var(--overlay-bg);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:100;animation:fadeIn .2s}
        .modal{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r-lg);width:560px;max-height:85vh;overflow-y:auto;padding:32px;animation:slideUp .3s ease}
        .modal-title{font-size:20px;font-weight:800;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between}
        .modal-close{background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:20px;padding:4px}.modal-close:hover{color:var(--text-primary)}
        .modal-sub{font-size:14px;color:var(--text-secondary);margin-bottom:20px;line-height:1.5}
        .mode-toggle{display:flex;border-radius:var(--r-md);border:1px solid var(--border);overflow:hidden;margin-bottom:20px}
        .mode-btn{flex:1;padding:12px;font-size:13px;font-weight:600;cursor:pointer;background:transparent;border:none;color:var(--text-secondary);font-family:var(--font-sans);transition:all .15s;display:flex;align-items:center;justify-content:center;gap:6px}
        .mode-btn:first-child{border-right:1px solid var(--border)}
        .mode-btn:hover{color:var(--text-primary);background:var(--bg-hover)}.mode-btn.on{background:var(--accent-blue);color:#fff}
        .add-row{display:flex;gap:10px;margin-bottom:14px}.add-row .fi{flex:1}
        .btn-p{padding:10px 22px;border-radius:var(--r-md);border:none;background:var(--accent-blue);color:#fff;font-size:14px;font-weight:700;font-family:var(--font-sans);cursor:pointer;transition:all .15s}
        .btn-p:hover{background:#5d9bff}.btn-p:disabled{opacity:.5;cursor:not-allowed}
        .btn-s{padding:10px 22px;border-radius:var(--r-md);border:1px solid var(--border);background:transparent;color:var(--text-secondary);font-size:14px;font-weight:600;font-family:var(--font-sans);cursor:pointer}
        .btn-s:hover{border-color:var(--border-active);color:var(--text-primary)}
        .spinner{width:16px;height:16px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;display:inline-block}
        .cui-ok{padding:16px;border-radius:var(--r-md);border:1px solid var(--accent-green);background:rgba(52,211,153,.04);margin-bottom:14px}
        .cui-ok .cn{font-size:16px;font-weight:700;color:var(--accent-green);margin-bottom:6px}
        .cui-ok .cr{font-size:13px;color:var(--text-secondary);margin-bottom:3px;line-height:1.5}
        .cui-ok .cr strong{color:var(--text-primary);font-weight:600;margin-right:8px}
        .cui-err{padding:14px;border-radius:var(--r-md);border:1px solid var(--accent-red);background:rgba(248,113,113,.04);margin-bottom:14px;font-size:13px;color:var(--accent-red)}
        .cui-load{display:flex;align-items:center;gap:10px;padding:14px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-elevated);margin-bottom:14px;font-size:13px;color:var(--text-secondary)}
        .upload-zone{border:2px dashed var(--border);border-radius:var(--r-md);padding:32px 20px;text-align:center;margin-bottom:16px;transition:all .2s;cursor:pointer}
        .upload-zone:hover{border-color:var(--accent-blue);background:rgba(77,139,255,.03)}
        .upload-zone .uz-icon{font-size:28px;margin-bottom:8px}.upload-zone .uz-title{font-size:14px;font-weight:600;margin-bottom:4px}.upload-zone .uz-sub{font-size:12px;color:var(--text-muted)}
        .upload-flow{font-size:12px;color:var(--text-secondary);margin-bottom:16px;padding:10px 14px;background:var(--bg-elevated);border-radius:var(--r-sm);text-align:center}
        .forma-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:20px}
        .forma-radio{padding:10px 12px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--bg-elevated);cursor:pointer;text-align:center;transition:all .15s;font-size:12px}
        .forma-radio:hover{border-color:var(--border-active)}.forma-radio.on{border-color:var(--accent-blue);background:rgba(77,139,255,.06)}
        .forma-radio .fr-cod{font-weight:700;font-family:var(--font-mono);font-size:13px;color:var(--text-primary);margin-bottom:2px}
        .forma-radio .fr-label{font-size:10px;color:var(--text-muted);line-height:1.3}
        .forma-group-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin:14px 0 8px}
      `}</style>

      {/* TOPBAR */}
      <div className="topbar">
        <div className="tb-title">Firme</div>
        <span className="tb-count">{loading ? "..." : `${filtered.length} firme`}</span>
        <button className="btn-add" onClick={() => { setShowAdd(true); setCui(""); setCuiRes(null); setAddMode("auto"); setAddForma("SRL"); setUploadFile(null); setCuiSearchResults([]); }}>+ Adauga firma</button>
      </div>

      {/* TOOLBAR */}
      <div className="firme-toolbar">
        <input className="fi" placeholder="Cauta firma, CUI, CAEN, judet, forma..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 320 }} />
        <div className="pill-group">
          <button className={`pill ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>Toate</button>
          <button className={`pill ${filter === "activ" ? "on" : ""}`} onClick={() => setFilter("activ")}>Active</button>
          <button className={`pill ${filter === "radiat" ? "on" : ""}`} onClick={() => setFilter("radiat")}>Radiate</button>
          <button className={`pill ${filter === "soc" ? "on" : ""}`} onClick={() => setFilter("soc")}>Societati</button>
          <button className={`pill ${filter === "pf" ? "on" : ""}`} onClick={() => setFilter("pf")}>PFA/II/IF</button>
        </div>
      </div>

      {/* COMPANY CARDS GRID */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="empty-state">
            <span className="spinner" style={{ width: 28, height: 28, borderColor: "var(--border)", borderTopColor: "var(--accent-blue)" }} />
            <div className="es-text">Se incarca firmele...</div>
          </div>
        )}
        {error && (
          <div className="empty-state">
            <div className="es-text" style={{ color: "var(--accent-red)" }}>{error}</div>
            <button className="btn-s" onClick={fetchCompanies} style={{ marginTop: 8 }}>Reincearca</button>
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="empty-state">
            <div className="es-icon">&#128269;</div>
            <div className="es-text">Nicio firma gasita</div>
          </div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <div className="firme-grid">
            {filtered.map(f => {
              const forma = f.formaJuridica || "";
              const fc = formaColor(forma);
              const isProcessing = f.processingStatus === "processing";
              const stareColor = isProcessing
                ? { bg: "rgba(77,139,255,.12)", color: "var(--accent-blue)" }
                : f.stare === "radiata"
                ? { bg: "rgba(248,113,113,.12)", color: "var(--accent-red)" }
                : { bg: "rgba(52,211,153,.12)", color: "var(--accent-green)" };
              return (
                <div key={f.id} className="firma-card" onClick={() => router.push(`/companies/${f.id}`)}>
                  <div className="fc-icon" style={{ background: fc.bg, color: fc.color }}>{forma}</div>
                  <div className="fc-info">
                    <div className="fc-name">{f.denumire}</div>
                    <div className="fc-badges">
                      <span className="fc-badge" style={stareColor}>{isProcessing ? "Se proceseaza..." : f.stare || "activ"}</span>
                      <span className="fc-badge" style={fc}>{FORME_JURIDICE.find(fj => fj.cod === forma)?.short || forma}</span>
                      {f.caen && <span className="fc-badge" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>CAEN {f.caen}</span>}
                    </div>
                    <div className="fc-meta">
                      <span>CUI: {f.cui}</span>
                      {f.judet && <span>{f.judet}</span>}
                      {f.anInfiintare && <span>Din {f.anInfiintare}</span>}
                    </div>
                    <div className="fc-sync">Sync: {formatSyncTime(f.lastSyncedAt)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ADD MODAL */}
      {showAdd && (
        <div className="overlay" onClick={e => { if (e.target === e.currentTarget) setShowAdd(false); }}>
          <div className="modal">
            <div className="modal-title">Adauga firma<button className="modal-close" onClick={() => setShowAdd(false)}>&times;</button></div>
            <div className="mode-toggle">
              <button className={`mode-btn ${addMode === "auto" ? "on" : ""}`} onClick={() => setAddMode("auto")}>Automat (CUI)</button>
              <button className={`mode-btn ${addMode === "manual" ? "on" : ""}`} onClick={() => setAddMode("manual")}>Manual (Upload ONRC)</button>
            </div>

            {addMode === "auto" ? (<>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 14, lineHeight: 1.5 }}>
                Cauta dupa CUI sau denumire firma. Datele se preiau automat de la ListaFirme.ro / ONRC.
              </div>
              <div className="add-row" style={{ position: "relative" }}>
                <input className={`fi mono ${cuiRes && cuiRes !== "error" ? "ok" : cuiRes === "error" ? "err" : ""}`}
                  placeholder="CUI sau denumire firma..."
                  value={cui}
                  onChange={e => { setCui(e.target.value); setCuiRes(null); searchCUI(e.target.value); }}
                  onKeyDown={e => e.key === "Enter" && checkCui()}
                  style={{ flex: 1 }}
                />
                <button className="btn-p" onClick={checkCui} disabled={cuiLoad || cui.replace(/\D/g, "").length < 4}>
                  {cuiLoad ? <span className="spinner" /> : "Adauga"}
                </button>
              </div>

              {cuiSearchResults.length > 0 && !cuiRes && (
                <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--bg-surface)", overflow: "hidden", marginBottom: 10 }}>
                  {cuiSearching && <div style={{ padding: "8px 16px", fontSize: 11, color: "var(--text-muted)" }}>Se cauta...</div>}
                  {cuiSearchResults.map((r: any, idx: number) => (
                    <div key={idx}
                      style={{ padding: "12px 16px", cursor: "pointer", borderBottom: "1px solid var(--border)", transition: "background .12s", fontSize: 13 }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      onClick={() => { const code = r.fiscalCode || r.taxCode || ""; setCui(code); setCuiSearchResults([]); addFromListaFirme(code); }}
                    >
                      <div style={{ fontWeight: 600 }}>{r.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", gap: 12, marginTop: 3 }}>
                        <span style={{ fontFamily: "var(--font-mono)" }}>CUI: {r.fiscalCode || r.taxCode || "\u2014"}</span>
                        {r.county && <span>{r.county}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {cuiLoad && <div className="cui-load"><span className="spinner" /> Se verifica si se adauga firma...</div>}
              {cuiRes && cuiRes !== "error" && (
                <div className="cui-ok">
                  <div className="cn">{cuiRes.denumire}</div>
                  <div className="cr"><strong>Adresa:</strong>{cuiRes.adresa}</div>
                  <div className="cr"><strong>CAEN:</strong>{cuiRes.caen}</div>
                  <div className="cr"><strong>Stare:</strong><span style={{ color: "var(--accent-green)" }}>{cuiRes.stare}</span></div>
                </div>
              )}
              {cuiRes === "error" && <div className="cui-err">CUI-ul nu a fost gasit sau a aparut o eroare.</div>}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button className="btn-s" onClick={() => setShowAdd(false)}>Anuleaza</button>
                <button className="btn-p" disabled={!cuiRes || cuiRes === "error"} onClick={() => setShowAdd(false)}>Inchide</button>
              </div>
            </>) : (<>
              <div className="modal-sub">Incarca documentul ONRC si agentii vor face restul:</div>
              <div className="upload-flow">Upload &rarr; OCR automat &rarr; Extragere date &rarr; Validare &rarr; Stocare</div>

              <div className="forma-group-title">Societati comerciale</div>
              <div className="forma-grid">
                {FORME_JURIDICE.filter(f => f.group === "SOC").map(f => (
                  <div key={f.cod} className={`forma-radio ${addForma === f.cod ? "on" : ""}`} onClick={() => setAddForma(f.cod)}>
                    <div className="fr-cod">{f.short}</div><div className="fr-label">{f.label}</div>
                  </div>
                ))}
              </div>

              <div className="forma-group-title">Persoane fizice / Intreprinderi</div>
              <div className="forma-grid">
                {FORME_JURIDICE.filter(f => f.group === "PF").map(f => (
                  <div key={f.cod} className={`forma-radio ${addForma === f.cod ? "on" : ""}`} onClick={() => setAddForma(f.cod)}>
                    <div className="fr-cod">{f.short}</div><div className="fr-label">{f.label}</div>
                  </div>
                ))}
              </div>

              <input type="file" ref={fileInputRef} accept=".pdf" style={{ display: "none" }} onChange={handleFileSelect} />
              <div className="upload-zone" onClick={() => fileInputRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={handleFileDrop}>
                <div className="uz-icon">{uploadFile ? "\u2705" : "\u{1F4C4}"}</div>
                <div className="uz-title">{uploadFile ? uploadFile.name : "Certificat constatator / Document ONRC"}</div>
                <div className="uz-sub">{uploadFile ? `${(uploadFile.size / 1024 / 1024).toFixed(1)} MB` : "Click sau trage fisierul aici (PDF, max 10MB)"}</div>
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button className="btn-s" onClick={() => setShowAdd(false)}>Anuleaza</button>
                <button className="btn-p" disabled={!uploadFile || uploadLoading} onClick={handleManualUpload}>{uploadLoading ? <span className="spinner" /> : "Proceseaza si creeaza firma"}</button>
              </div>
            </>)}
          </div>
        </div>
      )}
    </>
  );
}
