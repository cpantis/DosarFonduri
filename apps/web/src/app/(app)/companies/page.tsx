"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { isPF, FORME_JURIDICE } from "@/hooks/useFormaJuridica";
import { apiGet, apiPost, api } from "@/lib/api";
import { getCaenDescription } from "@/lib/caen";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TypeBadge } from "@/components/ui/TypeBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { BtnPrimary, BtnSecondary, IconPlus, IconSearch, IconUpload, IconX } from "@/components/ui/Buttons";

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
      const data = await apiGet<any>("/api/companies");
      setCompanies(Array.isArray(data) ? data : data.data || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Eroare la încărcarea firmelor");
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
      setCuiRes({ denumire: result.denumire || result.name || "Firma adaugata", adresa: result.adresa || "—", caen: result.caen || "—", stare: result.stare || "ACTIV" });
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
      setCuiRes({ denumire: result.denumire || "Firma adaugata", adresa: result.adresa || "—", caen: result.caen || "—", stare: result.stare || "ACTIV" });
      await fetchCompanies();
      if (result.id) router.push(`/companies/${result.id}`);
    } catch {
      try {
        const result = await apiPost<any>("/api/companies", { cui: fiscalCode, mode: "auto" });
        setCuiRes({ denumire: result.denumire || "Firma adaugata", adresa: result.adresa || "—", caen: result.caen || "—", stare: result.stare || "ACTIV" });
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

  const openAdd = () => { setShowAdd(true); setCui(""); setCuiRes(null); setAddMode("auto"); setAddForma("SRL"); setUploadFile(null); setCuiSearchResults([]); };

  return (
    <div className="animate-[fadeIn_.2s_ease-out]">
      <style>{`
        .co-card{padding:20px;border-radius:12px;border:1px solid rgba(226,232,240,.8);background:#ffffff;transition:all .15s;cursor:pointer;display:flex;align-items:center;justify-content:space-between;text-decoration:none;margin-bottom:8px;overflow:hidden}
        .co-card:hover{border-color:#cbd5e1;box-shadow:0 1px 3px rgba(0,0,0,.04)}
        .co-stat{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:13px;color:#64748b}
        .co-stat .sep{color:#e2e8f0}
        .co-search{border:1px solid rgba(226,232,240,.8);border-radius:8px;padding:8px 12px 8px 36px;font-size:13px;background:#ffffff;color:#0f172a;outline:none;width:100%;transition:all .15s;font-family:'Inter',system-ui,sans-serif}
        .co-search:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.08)}
        .co-search::placeholder{color:#94a3b8}
        .co-filter{font-size:12px;font-weight:500;padding:6px 12px;border-radius:8px;border:none;cursor:pointer;transition:all .15s;background:transparent;color:#64748b}
        .co-filter:hover{background:#f1f5f9;color:#0f172a}
        .co-filter.on{background:#0f172a;color:#ffffff}
        .co-skeleton{height:72px;border-radius:12px;margin-bottom:8px}
        .co-dropdown{border-radius:12px;border:1px solid rgba(226,232,240,.8);background:#ffffff;box-shadow:0 4px 12px rgba(0,0,0,.06);overflow:hidden;margin-bottom:12px}
        .co-dropdown-item{padding:12px 16px;cursor:pointer;transition:all .15s;font-size:13px;border-bottom:1px solid #f8fafc}
        .co-dropdown-item:last-child{border-bottom:none}
        .co-dropdown-item:hover{background:#f8fafc}
        .co-forma-card{padding:8px 10px;border-radius:8px;cursor:pointer;text-align:center;transition:all .15s;font-size:12px;border:1px solid rgba(226,232,240,.8);background:#ffffff}
        .co-forma-card:hover{border-color:#cbd5e1;background:#f8fafc}
        .co-forma-card.on{border-color:#2563eb;background:rgba(37,99,235,.04)}
        .co-drop-zone{border:2px dashed rgba(226,232,240,.8);border-radius:12px;padding:32px 20px;text-align:center;cursor:pointer;transition:all .15s}
        .co-drop-zone:hover{border-color:#cbd5e1;background:#f8fafc}
        .co-drop-zone.has-file{border-color:#34d399;background:rgba(52,211,153,.04)}
        .co-result{padding:16px;border-radius:12px;border:1px solid rgba(226,232,240,.8);background:#ffffff;margin-bottom:16px}
        .co-result.ok{border-color:#34d399;background:rgba(52,211,153,.04)}
        .co-result.err{border-color:#f87171;background:rgba(248,113,113,.04)}
        .co-step-bar{display:flex;align-items:center;gap:8px;font-size:11px;color:#94a3b8;padding:10px 16px;border-radius:8px;background:#f8fafc;margin-bottom:20px}
        .co-step-bar .arrow{color:#cbd5e1}
        .co-modal-overlay{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:100;background:rgba(0,0,0,.35);backdrop-filter:blur(4px)}
        .co-modal{background:#ffffff;border-radius:16px;width:540px;max-height:85vh;overflow-y:auto;padding:28px;border:1px solid rgba(226,232,240,.8);box-shadow:0 20px 60px rgba(0,0,0,.08);animation:fadeUp .2s ease-out}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes statusPulse{0%,100%{opacity:1}50%{opacity:.3}}
        .co-mode-toggle{display:flex;gap:4px;padding:4px;background:#f1f5f9;border-radius:8px;margin-bottom:20px}
        .co-mode-btn{flex:1;padding:8px;font-size:13px;font-weight:500;border-radius:8px;border:none;cursor:pointer;transition:all .15s;background:transparent;color:#64748b}
        .co-mode-btn.on{background:#ffffff;color:#0f172a;box-shadow:0 1px 2px rgba(0,0,0,.05)}
      `}</style>

      <PageHeader title="Firme" subtitle={`${filtered.length} firme gestionate`}>
        <BtnPrimary icon={<IconPlus />} onClick={openAdd}>Adaugă firmă</BtnPrimary>
      </PageHeader>

      <div className="max-w-6xl mx-auto px-8 py-6">
        {/* Search + filter bar */}
        {!loading && companies.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
              <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "#94a3b8" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Caută după denumire, CUI, CAEN..."
                className="co-search"
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              {[
                { key: "all", label: "Toate" },
                { key: "activ", label: "Active" },
                { key: "soc", label: "Societăți" },
                { key: "pf", label: "PF/II/IF" },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`co-filter ${filter === f.key ? "on" : ""}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div>
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton co-skeleton" />
            ))}
          </div>
        )}

        {/* F1.3: Error state with retry button */}
        {error && (
          <div className="co-result err" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#dc2626" }}>
            <span>⚠️</span>
            <span style={{ flex: 1 }}>{error}</span>
            <button
              onClick={fetchCompanies}
              style={{
                padding: "6px 14px", borderRadius: 8, border: "1px solid #f87171",
                background: "rgba(248,113,113,.08)", color: "#dc2626", fontSize: 12,
                fontWeight: 600, cursor: "pointer", fontFamily: "'Inter', system-ui, sans-serif",
                transition: "all .15s", flexShrink: 0,
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.background = "rgba(248,113,113,.15)"; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background = "rgba(248,113,113,.08)"; }}
            >
              🔄 Reîncearcă
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && filtered.length === 0 && (
          <EmptyState icon="🏢" title="Nicio firmă adăugată" description="Adaugă prima firmă pentru a începe" actionLabel="Adaugă firmă" onAction={openAdd} />
        )}

        {/* Company list */}
        {!loading && !error && filtered.length > 0 && (
          <div>
            {filtered.map(c => {
              const forma = c.formaJuridica || "SRL";
              const hasRestrictions = c.stare === "dizolvata" || c.stare === "lichidare" || c.stare === "radiata";
              const capitalSocialNum = c.capitalSocial ? Number(c.capitalSocial) : null;
              const isProcessing = c.processingStatus === "processing";
              const cuiDisplay = (c.cui || "").startsWith("PROC-") ? "Se procesează..." : c.cui;
              // F1.6: Compute IMM category from onrcRawData
              const rawData = c.onrcRawData || {};
              const angajati = rawData.f30?.numarMediuSalariati ?? rawData.angajati;
              const caNet = rawData.f20?.cifraAfaceriNeta ?? rawData.cifraAfaceri;
              let immLabel: string | null = null;
              let immColor = "#64748b";
              if (angajati != null || caNet != null) {
                const emp = Number(angajati) || 0;
                const ca = Number(caNet) || 0;
                if (emp < 10 && ca < 2_000_000) { immLabel = "Micro"; immColor = "#34d399"; }
                else if (emp < 50 && ca < 10_000_000) { immLabel = "Mică"; immColor = "#2563eb"; }
                else if (emp < 250 && ca < 50_000_000) { immLabel = "Mijlocie"; immColor = "#a78bfa"; }
                else { immLabel = "Mare"; immColor = "#fb923c"; }
              }
              return (
                <a
                  key={c.id}
                  href={`/companies/${c.id}`}
                  className="co-card"
                  style={hasRestrictions ? { borderColor: "rgba(248,113,113,.4)" } : isProcessing ? { borderColor: "rgba(251,191,36,.4)" } : undefined}
                >
                  <div style={{ minWidth: 0 }}>
                    {/* F1.2: Processing status indicator */}
                    {isProcessing && (
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#d97706", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#fbbf24", animation: "statusPulse 1.5s ease infinite" }} />
                        Se procesează datele firmei...
                      </div>
                    )}
                    {/* Insolvency/restriction banner */}
                    {hasRestrictions && (
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", marginBottom: 4 }}>
                        {"\u26A0"} {c.stare === "dizolvata" ? "Dizolvare" : c.stare === "lichidare" ? "Lichidare" : "Radiată"}
                      </div>
                    )}
                    {/* Processing error indicator */}
                    {c.processingStatus === "error" && c.processingError && (
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                        ⚠️ Eroare procesare: {c.processingError.slice(0, 80)}{c.processingError.length > 80 ? "…" : ""}
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{c.denumire}</span>
                      <TypeBadge type={forma} />
                      <StatusBadge status={c.stare || "funcțiune"} />
                      {immLabel && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: `color-mix(in srgb, ${immColor} 12%, transparent)`, color: immColor, letterSpacing: ".3px" }}>
                          {immLabel}
                        </span>
                      )}
                    </div>
                    <div className="co-stat">
                      {/* F1.1: Hide raw PROC-* CUI, show friendly text instead */}
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums", color: "#94a3b8", fontSize: 12 }}>CUI: {cuiDisplay}</span>
                      {c.caen && <><span className="sep">{"\u00B7"}</span><span title={getCaenDescription(c.caen) || undefined}>CAEN: {c.caen}{getCaenDescription(c.caen) ? ` — ${getCaenDescription(c.caen)!.slice(0, 40)}${getCaenDescription(c.caen)!.length > 40 ? "…" : ""}` : ""}</span></>}
                      {c.judet && <><span className="sep">{"\u00B7"}</span><span>{c.judet}</span></>}
                      {capitalSocialNum != null && capitalSocialNum > 0 && <><span className="sep">{"\u00B7"}</span><span style={{ fontFamily: "'JetBrains Mono', monospace" }}>Cap: {capitalSocialNum.toLocaleString("ro-RO")} RON</span></>}
                      {c.anInfiintare && <><span className="sep">{"\u00B7"}</span><span>Din {c.anInfiintare}</span></>}
                    </div>
                  </div>
                  <svg style={{ width: 16, height: 16, color: "#cbd5e1", flexShrink: 0, marginLeft: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </a>
              );
            })}
          </div>
        )}
      </div>

      {/* ADD MODAL */}
      {showAdd && (
        <div className="co-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowAdd(false); }}>
          <div className="co-modal">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Adaugă firmă</h2>
              <button
                onClick={() => setShowAdd(false)}
                style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: "#94a3b8", transition: "all .15s" }}
                onMouseEnter={e => { (e.target as HTMLElement).style.background = "#f1f5f9"; (e.target as HTMLElement).style.color = "#475569"; }}
                onMouseLeave={e => { (e.target as HTMLElement).style.background = "transparent"; (e.target as HTMLElement).style.color = "#94a3b8"; }}
              >
                <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Mode toggle */}
            <div className="co-mode-toggle">
              <button className={`co-mode-btn ${addMode === "auto" ? "on" : ""}`} onClick={() => setAddMode("auto")}>Automat (CUI)</button>
              <button className={`co-mode-btn ${addMode === "manual" ? "on" : ""}`} onClick={() => setAddMode("manual")}>Manual (Upload ONRC)</button>
            </div>

            {addMode === "auto" ? (<>
              <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6, marginBottom: 16 }}>
                Caută după CUI sau denumire firmă. Datele se preiau automat de la ListaFirme.ro / ONRC.
              </p>
              <div style={{ display: "flex", gap: 8, marginBottom: 12, position: "relative" }}>
                <input
                  style={{
                    flex: 1, borderRadius: 8, padding: "10px 14px", fontSize: 13,
                    fontFamily: "'JetBrains Mono', monospace",
                    outline: "none", background: "#ffffff", color: "#0f172a",
                    border: `1px solid ${cuiRes && cuiRes !== "error" ? "#34d399" : cuiRes === "error" ? "#f87171" : "rgba(226,232,240,.8)"}`,
                    transition: "all .15s",
                  }}
                  placeholder="CUI sau denumire firmă..."
                  value={cui}
                  onChange={e => { setCui(e.target.value); setCuiRes(null); searchCUI(e.target.value); }}
                  onKeyDown={e => e.key === "Enter" && checkCui()}
                  onFocus={e => { if (!cuiRes) e.currentTarget.style.borderColor = "#2563eb"; }}
                  onBlur={e => { if (!cuiRes) e.currentTarget.style.borderColor = "rgba(226,232,240,.8)"; }}
                />
                <BtnPrimary icon={<IconSearch />} onClick={checkCui} disabled={cuiLoad || cui.replace(/\D/g, "").length < 4}>
                  {cuiLoad ? "Se caută..." : "Adaugă"}
                </BtnPrimary>
              </div>

              {/* Search results dropdown */}
              {cuiSearchResults.length > 0 && !cuiRes && (
                <div className="co-dropdown">
                  {cuiSearching && <div style={{ padding: "8px 16px", fontSize: 11, color: "#94a3b8" }}>Se caută...</div>}
                  {cuiSearchResults.map((r: any, idx: number) => (
                    <div key={idx}
                      className="co-dropdown-item"
                      onClick={() => { const code = r.fiscalCode || r.taxCode || ""; setCui(code); setCuiSearchResults([]); addFromListaFirme(code); }}
                    >
                      <div style={{ fontWeight: 500, color: "#0f172a" }}>{r.name}</div>
                      <div style={{ fontSize: 11, display: "flex", gap: 12, marginTop: 2, color: "#94a3b8" }}>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>CUI: {r.fiscalCode || r.taxCode || "—"}</span>
                        {r.county && <span>{r.county}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Success result */}
              {cuiRes && cuiRes !== "error" && (
                <div className="co-result ok">
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: "#059669" }}>{cuiRes.denumire}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {[
                      { label: "Adresă", value: cuiRes.adresa },
                      { label: "CAEN", value: cuiRes.caen },
                      { label: "Stare", value: cuiRes.stare },
                    ].map(row => (
                      <div key={row.label} style={{ fontSize: 13, color: "#475569", display: "flex", gap: 8 }}>
                        <span style={{ color: "#94a3b8", width: 60, flexShrink: 0 }}>{row.label}</span>
                        <span style={{ fontWeight: row.label === "Stare" ? 500 : 400, color: row.label === "Stare" ? "#059669" : "#475569" }}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Error result */}
              {cuiRes === "error" && (
                <div className="co-result err" style={{ fontSize: 13, color: "#dc2626", display: "flex", alignItems: "center", gap: 8 }}>
                  <span>⚠️</span> CUI-ul nu a fost găsit sau a apărut o eroare.
                </div>
              )}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 8 }}>
                <BtnSecondary onClick={() => setShowAdd(false)}>Anulează</BtnSecondary>
                <BtnPrimary onClick={() => setShowAdd(false)} disabled={!cuiRes || cuiRes === "error"}>Închide</BtnPrimary>
              </div>
            </>) : (<>
              <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6, marginBottom: 16 }}>Încarcă documentul ONRC și agenții vor face restul:</p>
              <div className="co-step-bar">
                {["Upload", "OCR automat", "Extragere date", "Validare", "Stocare"].map((step, i) => (
                  <span key={step} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {i > 0 && <span className="arrow">→</span>}
                    <span style={{ fontWeight: 500 }}>{step}</span>
                  </span>
                ))}
              </div>

              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginTop: 16, marginBottom: 8, color: "#94a3b8" }}>Societăți comerciale</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 20 }}>
                {FORME_JURIDICE.filter(f => f.group === "SOC").map(f => (
                  <div key={f.cod}
                    className={`co-forma-card ${addForma === f.cod ? "on" : ""}`}
                    onClick={() => setAddForma(f.cod)}
                  >
                    <div style={{ fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "#0f172a" }}>{f.short}</div>
                    <div style={{ fontSize: 10, lineHeight: 1.3, color: "#94a3b8", marginTop: 2 }}>{f.label}</div>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginTop: 16, marginBottom: 8, color: "#94a3b8" }}>Persoane fizice / Întreprinderi</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 20 }}>
                {FORME_JURIDICE.filter(f => f.group === "PF").map(f => (
                  <div key={f.cod}
                    className={`co-forma-card ${addForma === f.cod ? "on" : ""}`}
                    onClick={() => setAddForma(f.cod)}
                  >
                    <div style={{ fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "#0f172a" }}>{f.short}</div>
                    <div style={{ fontSize: 10, lineHeight: 1.3, color: "#94a3b8", marginTop: 2 }}>{f.label}</div>
                  </div>
                ))}
              </div>

              <input type="file" ref={fileInputRef} accept=".pdf" className="hidden" onChange={handleFileSelect} />
              <div
                className={`co-drop-zone ${uploadFile ? "has-file" : ""}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={handleFileDrop}
              >
                <div style={{ fontSize: 24, marginBottom: 8 }}>{uploadFile ? "✅" : "📄"}</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#0f172a", marginBottom: 4 }}>{uploadFile ? uploadFile.name : "Certificat constatator / Document ONRC"}</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>{uploadFile ? `${(uploadFile.size / 1024 / 1024).toFixed(1)} MB` : "Click sau trage fișierul aici (PDF, max 10MB)"}</div>
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
                <BtnSecondary onClick={() => setShowAdd(false)}>Anulează</BtnSecondary>
                <BtnPrimary icon={<IconUpload />} disabled={!uploadFile || uploadLoading} onClick={handleManualUpload}>
                  {uploadLoading ? "Se procesează..." : "Procesează și creează firma"}
                </BtnPrimary>
              </div>
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}
