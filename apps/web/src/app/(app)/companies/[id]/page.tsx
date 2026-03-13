"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { isSOC, isPF, FORME_JURIDICE, getCompanyTabs, getFieldLabel } from "@/hooks/useFormaJuridica";
import { apiGet, apiPost, apiDelete, api } from "@/lib/api";

/* === HELPERS === */
const fmt = (v: string | number | null | undefined) => {
  if (v == null) return "\u2014";
  const n = parseInt(String(v).replace(/[^0-9-]/g, ""));
  return isNaN(n) ? String(v) : n.toLocaleString("ro-RO") + " RON";
};
const fmtNum = (v: number | string | null | undefined) => {
  if (v == null) return "\u2014";
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/[^0-9-]/g, ""));
  return isNaN(n) ? String(v) : n.toLocaleString("ro-RO");
};
const formaColor = (cod: string) => {
  if (isPF(cod)) return { bg: "rgba(251,146,60,0.12)", color: "var(--accent-orange)" };
  return { bg: "rgba(77,139,255,0.12)", color: "var(--accent-blue)" };
};

/** Map API company detail to the shapes expected by JSX */
const mapDetail = (d: any) => {
  const raw = d.onrcRawData || {};
  const situatiiFinanciare = (d.financials || []).map((f: any) => ({
    an: f.year,
    cifraAfaceri: f.f20?.cifraAfaceriNeta ?? null,
    profitNet: f.f20?.profitNet ?? null,
    angajati: f.f30?.numarMediuSalariati ?? null,
    capitaluriProprii: f.f10?.capitaluriProprii ?? null,
    venituriTotale: f.f20?.venituriTotale ?? null,
    cheltuieliTotale: f.f20?.cheltuieliTotale ?? null,
    source: f.source,
  }));
  const asociatiPF = (d.asociatiPF || []).map((a: any) => ({
    nume: a.name, calitate: a.role || a.tipAsociat || "asociat",
    cetatenie: a.citizenshipOrCountry || "\u2014", aport: a.contribution || "\u2014",
    partiSociale: a.shares ?? null, actiuni: a.shares ?? null,
    cotaBeneficii: a.pctBenefits ?? 0, cotaPierderi: a.pctLosses ?? 0,
  }));
  const asociatiPJ = (d.asociatiPJ || []).map((a: any) => ({
    denumire: a.name, calitate: a.role || a.tipAsociat || "asociat",
    tara: a.citizenshipOrCountry || "\u2014", cui: a.cui || "\u2014",
    aport: a.contribution || "\u2014", actiuni: a.shares ?? null,
    cotaBeneficii: a.pctBenefits ?? 0, cotaPierderi: a.pctLosses ?? 0,
  }));
  const administratori = (d.administratori || []).map((a: any) => ({
    nume: a.name, functie: a.role || "administrator",
    puteri: a.powers || "\u2014", durataMandatLabel: a.mandateDuration || "\u2014",
    dataNumirii: a.appointmentDate || "\u2014",
  }));
  const membriIF = (d.ifMembers || []).map((m: any) => ({
    nume: m.name, calitate: m.role || "membru",
    gradRudenie: m.kinship || "\u2014", cetatenie: m.citizenshipOrCountry || "\u2014",
  }));
  return {
    ...d, forma: d.formaJuridica || "SRL",
    caenDesc: raw.caenDesc || raw.caen_desc || "\u2014",
    activitatiSecundare: raw.activitatiSecundare || raw.activitati_secundare || [],
    sediiSecundare: raw.sediiSecundare || raw.sedii_secundare || [],
    insolventa: raw.insolventa ?? false, dizolvare: raw.dizolvare ?? false,
    lichidare: raw.lichidare ?? false, restrictii: raw.restrictii ?? false,
    titular: raw.titular || null, cenzori: raw.cenzori || null,
    ultimaMentiune: raw.ultimaMentiune || raw.ultima_mentiune || "\u2014",
    natura: d.naturaCapital || null,
    situatiiFinanciare, asociatiPF, asociatiPJ, administratori, membriIF,
  };
};

/* === COMPONENT === */
export default function CompanyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [detail, setDetail] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("General");

  // ONRC upload modal
  const [showOnrcUpload, setShowOnrcUpload] = useState(false);
  const [onrcUploading, setOnrcUploading] = useState(false);
  const onrcFileRef = useRef<HTMLInputElement>(null);

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiGet(`/api/companies/${id}`);
      setDetail(mapDetail(data));
    } catch (err: any) {
      setError(err.message || "Eroare la incarcarea detaliilor firmei");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) fetchDetail();
  }, [id, fetchDetail]);

  // Poll for processing status when company is being processed
  useEffect(() => {
    if (!detail || (detail.processingStatus !== "processing")) return;
    const interval = setInterval(async () => {
      try {
        const status = await apiGet(`/api/companies/${id}/processing-status`);
        if (status.processingStatus !== "processing") {
          clearInterval(interval);
          fetchDetail(); // Reload full data when processing is done
        }
      } catch { /* ignore polling errors */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [detail?.processingStatus, id, fetchDetail]);

  const handleDelete = async () => {
    if (!confirm("Sigur doriti sa stergeti aceasta firma?")) return;
    try {
      await apiDelete(`/api/companies/${id}`);
      router.push("/companies");
    } catch (err: any) {
      alert("Eroare la stergere: " + (err.message || "Eroare necunoscuta"));
    }
  };

  const handleSyncOnrc = async () => {
    try {
      await apiPost(`/api/companies/${id}/sync-onrc`, {});
      await fetchDetail();
    } catch (err: any) {
      alert("Eroare la sincronizare: " + (err.message || "Eroare necunoscuta"));
    }
  };

  const handleOnrcUpload = async () => {
    if (!onrcFileRef.current?.files?.[0]) return;
    setOnrcUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", onrcFileRef.current.files[0]);
      await api<any>(`/api/companies/${id}/upload-onrc`, {
        method: "POST",
        body: formData,
        timeout: 120_000,
      });
      await fetchDetail();
      setShowOnrcUpload(false);
    } catch (err: any) {
      alert("Eroare la upload ONRC: " + (err.message || "Eroare necunoscuta"));
    } finally {
      setOnrcUploading(false);
    }
  };

  const sel = detail;
  const tabs = sel ? getCompanyTabs(sel.forma) : [];

  return (
    <>
      <style>{`
        .cd-page{display:flex;flex-direction:column;height:100%;overflow:hidden}
        .cd-back{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--text-secondary);text-decoration:none;transition:color .15s;padding:0;background:none;border:none;cursor:pointer;font-family:var(--font-sans)}
        .cd-back:hover{color:var(--accent-blue)}
        .cd-header{padding:24px 32px;border-bottom:1px solid var(--border);background:var(--bg-surface);flex-shrink:0}
        .cd-header-top{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:8px}
        .cd-name{font-size:22px;font-weight:800;color:var(--text-primary);letter-spacing:-.3px;margin:0 0 4px}
        .cd-sub{font-size:13px;font-family:var(--font-mono);color:var(--text-secondary);margin-bottom:10px}
        .cd-badges{display:flex;gap:6px;flex-wrap:wrap}
        .cd-badge{font-size:11px;font-weight:700;padding:3px 10px;border-radius:12px;white-space:nowrap}
        .cd-actions{display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;align-items:flex-start}
        .cd-act{padding:7px 14px;border-radius:var(--r-sm);border:1px solid var(--border);background:transparent;color:var(--text-secondary);font-size:12px;font-weight:600;cursor:pointer;font-family:var(--font-sans);transition:all .15s;display:flex;align-items:center;gap:5px;white-space:nowrap}
        .cd-act:hover{border-color:var(--border-active);color:var(--text-primary);background:var(--bg-hover)}
        .cd-act.danger{color:var(--accent-red);border-color:rgba(248,113,113,.25)}.cd-act.danger:hover{background:rgba(248,113,113,.06)}

        .cd-tabs{display:flex;border-bottom:1px solid var(--border);padding:0 32px;background:var(--bg-surface);flex-shrink:0;overflow-x:auto;gap:0}
        .cd-tab{padding:11px 18px;font-size:14px;font-weight:600;color:var(--text-secondary);cursor:pointer;border-bottom:2px solid transparent;transition:all .15s;font-family:var(--font-sans);background:none;border-top:none;border-left:none;border-right:none;white-space:nowrap}
        .cd-tab:hover{color:var(--text-primary)}.cd-tab.on{color:var(--accent-blue);border-bottom-color:var(--accent-blue)}

        .cd-body{flex:1;overflow-y:auto;padding:24px 32px}
        .cd-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:20px}
        .cd-grid.c2{grid-template-columns:1fr 1fr}.cd-grid.c4{grid-template-columns:repeat(4,1fr)}
        .cd-card{padding:16px 18px;background:var(--bg-deep);border-radius:var(--r-md);border:1px solid var(--border)}
        .cd-card.full{grid-column:1/-1}.cd-card.span2{grid-column:span 2}
        .cd-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:4px}
        .cd-val{font-size:15px;font-weight:600;color:var(--text-primary)}.cd-val.mono{font-family:var(--font-mono)}
        .cd-val.green{color:var(--accent-green)}.cd-val.red{color:var(--accent-red)}
        .cd-val.sub{font-size:12px;color:var(--text-muted);font-weight:400;margin-top:3px}

        .cd-mention{padding:14px 16px;background:var(--bg-deep);border-radius:var(--r-md);border-left:3px solid var(--accent-blue);margin-bottom:20px}
        .cd-mention-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:4px}
        .cd-mention-text{font-size:13px;color:var(--text-secondary);line-height:1.6}

        .cd-stitle{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin:20px 0 10px}
        .cd-assoc{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-elevated);margin-bottom:6px}
        .cd-assoc-name{font-size:14px;font-weight:600;flex:1}.cd-assoc-detail{font-size:13px;color:var(--text-secondary);font-family:var(--font-mono)}

        .cd-warn{padding:12px 16px;border-radius:var(--r-md);border:1px solid var(--accent-red);background:rgba(248,113,113,.04);margin-bottom:8px;font-size:14px;color:var(--accent-red);display:flex;align-items:center;gap:8px}
        .cd-ok{padding:12px 16px;border-radius:var(--r-md);border:1px solid var(--accent-green);background:rgba(52,211,153,.04);margin-bottom:8px;font-size:14px;color:var(--accent-green);display:flex;align-items:center;gap:8px}

        .cd-fin-table{width:100%;border-collapse:collapse;font-size:13px}
        .cd-fin-table th{text-align:left;padding:8px 12px;font-weight:600;color:var(--text-muted);border-bottom:1px solid var(--border);font-size:11px;text-transform:uppercase;letter-spacing:.5px}
        .cd-fin-table td{padding:8px 12px;border-bottom:1px solid var(--border);font-family:var(--font-mono);color:var(--text-secondary)}
        .cd-fin-table td.green{color:var(--accent-green)}.cd-fin-table td.red{color:var(--accent-red)}

        .cd-empty{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;color:var(--text-muted);padding:60px 20px}
        .cd-empty-icon{font-size:44px;opacity:.5}.cd-empty-text{font-size:14px}

        .cd-overlay{position:fixed;inset:0;background:var(--overlay-bg);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:100;animation:cdFadeIn .2s}
        @keyframes cdFadeIn{from{opacity:0}to{opacity:1}}
        .cd-modal{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r-lg);width:480px;max-height:85vh;overflow-y:auto;padding:28px;animation:cdSlideUp .3s ease}
        @keyframes cdSlideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        .cd-modal-title{font-size:18px;font-weight:800;margin-bottom:4px;display:flex;align-items:center;justify-content:space-between}
        .cd-modal-close{background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;padding:4px}.cd-modal-close:hover{color:var(--text-primary)}

        .cd-upload-zone{border:2px dashed var(--border);border-radius:var(--r-md);padding:28px 20px;text-align:center;margin-bottom:16px;transition:all .2s;cursor:pointer}
        .cd-upload-zone:hover{border-color:var(--accent-blue);background:rgba(77,139,255,.03)}
        .cd-upload-zone .uz-icon{font-size:24px;margin-bottom:6px}.cd-upload-zone .uz-title{font-size:14px;font-weight:600;margin-bottom:3px}.cd-upload-zone .uz-sub{font-size:12px;color:var(--text-muted)}

        .cd-btn-p{padding:10px 20px;border-radius:var(--r-md);border:none;background:var(--accent-blue);color:#fff;font-size:14px;font-weight:700;font-family:var(--font-sans);cursor:pointer;transition:all .15s}
        .cd-btn-p:hover{background:#5d9bff}.cd-btn-p:disabled{opacity:.5;cursor:not-allowed}
        .cd-btn-s{padding:10px 20px;border-radius:var(--r-md);border:1px solid var(--border);background:transparent;color:var(--text-secondary);font-size:14px;font-weight:600;font-family:var(--font-sans);cursor:pointer}
        .cd-btn-s:hover{border-color:var(--border-active);color:var(--text-primary)}

        .cd-spinner{width:18px;height:18px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:cdSpin .7s linear infinite;display:inline-block}
        @keyframes cdSpin{to{transform:rotate(360deg)}}
        .cd-spinner-dark{border-color:var(--border);border-top-color:var(--accent-blue)}

        .cd-body::-webkit-scrollbar{width:5px}
        .cd-body::-webkit-scrollbar-track{background:transparent}
        .cd-body::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
      `}</style>

      <div className="cd-page">
        {/* LOADING STATE */}
        {loading && (
          <div className="cd-empty" style={{ flex: 1 }}>
            <span className="cd-spinner cd-spinner-dark" style={{ width: 28, height: 28 }} />
            <div className="cd-empty-text">Se incarca detaliile firmei...</div>
          </div>
        )}

        {/* ERROR STATE */}
        {!loading && error && (
          <div className="cd-empty" style={{ flex: 1 }}>
            <div className="cd-empty-text" style={{ color: "var(--accent-red)" }}>{error}</div>
            <button className="cd-btn-s" onClick={fetchDetail} style={{ marginTop: 8 }}>Reincearca</button>
            <Link href="/companies" className="cd-back" style={{ marginTop: 12 }}>&larr; Inapoi la lista</Link>
          </div>
        )}

        {/* DETAIL VIEW */}
        {!loading && !error && sel && (<>
          {/* PROCESSING BANNER */}
          {sel.processingStatus === "processing" && (
            <div style={{ padding: "14px 32px", background: "rgba(77,139,255,0.06)", borderBottom: "1px solid var(--accent-blue)", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
              <span className="cd-spinner cd-spinner-dark" style={{ width: 18, height: 18 }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--accent-blue)" }}>Se proceseaza documentul... Datele firmei se actualizeaza automat.</span>
            </div>
          )}
          {sel.processingStatus === "error" && (
            <div style={{ padding: "14px 32px", background: "rgba(248,113,113,0.06)", borderBottom: "1px solid var(--accent-red)", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--accent-red)" }}>Eroare la procesare: {sel.processingError || "Eroare necunoscuta"}</span>
              <button className="cd-btn-s" style={{ marginLeft: "auto", padding: "6px 14px", fontSize: 12 }} onClick={() => setShowOnrcUpload(true)}>Reincearca upload</button>
            </div>
          )}

          {/* HEADER */}
          <div className="cd-header">
            <div style={{ marginBottom: 16 }}>
              <Link href="/companies" className="cd-back">&larr; Firme</Link>
            </div>
            <div className="cd-header-top">
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1 className="cd-name">{sel.denumire}</h1>
                <div className="cd-sub">CUI: {sel.cui} &middot; {sel.regCom || "\u2014"}</div>
                <div className="cd-badges">
                  <span className="cd-badge" style={sel.stare === "radiata" ? { background: "rgba(248,113,113,.12)", color: "var(--accent-red)" } : { background: "rgba(52,211,153,.12)", color: "var(--accent-green)" }}>{sel.stare}</span>
                  <span className="cd-badge" style={formaColor(sel.forma)}>{sel.forma}</span>
                  <span className="cd-badge" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>CAEN {sel.caen || "\u2014"}</span>
                </div>
              </div>
              <div className="cd-actions">
                <button className="cd-act" onClick={handleSyncOnrc}>Actualizare CUI</button>
                <button className="cd-act" onClick={() => setShowOnrcUpload(true)}>Upload ONRC</button>
                <button className="cd-act danger" onClick={handleDelete}>Sterge</button>
              </div>
            </div>
          </div>

          {/* TABS */}
          <div className="cd-tabs">
            {tabs.map(t => (
              <button key={t} className={`cd-tab ${activeTab === t ? "on" : ""}`} onClick={() => setActiveTab(t)}>{t}</button>
            ))}
          </div>

          {/* TAB CONTENT */}
          <div className="cd-body">

            {/* GENERAL */}
            {activeTab === "General" && (<>
              <div className="cd-grid">
                <div className="cd-card span2"><div className="cd-label">Forma juridica</div><div className="cd-val">{FORME_JURIDICE.find(fj => fj.cod === sel.forma)?.label || sel.forma}</div></div>
                <div className="cd-card"><div className="cd-label">Stare</div><div className="cd-val"><span className="cd-badge" style={sel.stare === "radiata" ? { background: "rgba(248,113,113,.12)", color: "var(--accent-red)" } : { background: "rgba(52,211,153,.12)", color: "var(--accent-green)" }}>{sel.stare}</span></div></div>
                <div className="cd-card span2"><div className="cd-label">Adresa</div><div className="cd-val">{sel.adresa || "\u2014"}</div><div className="cd-val sub">{sel.localitate || ""}{sel.localitate && sel.judet ? ", " : ""}{sel.judet || ""} {sel.codPostal || ""}</div></div>
                <div className="cd-card"><div className="cd-label">Telefon</div><div className="cd-val mono">{sel.telefon || "\u2014"}</div></div>
                {sel.email && <div className="cd-card"><div className="cd-label">Email</div><div className="cd-val mono" style={{ fontSize: 13 }}>{sel.email}</div></div>}
                <div className="cd-card"><div className="cd-label">{getFieldLabel("durata_label", sel.forma)}</div><div className="cd-val">{sel.durata || "\u2014"}</div></div>
                <div className="cd-card"><div className="cd-label">An infiintare</div><div className="cd-val mono">{sel.anInfiintare || "\u2014"}</div></div>
              </div>
              {isPF(sel.forma) && sel.patrimoniu_afectat && (
                <div className="cd-mention"><div className="cd-mention-label">Patrimoniu de afectatiune</div><div className="cd-mention-text">{sel.patrimoniu_afectat}</div></div>
              )}
              <div className="cd-mention"><div className="cd-mention-label">Ultima mentiune</div><div className="cd-mention-text">{sel.ultimaMentiune}</div></div>
              {isSOC(sel.forma) && sel.capitalSocial && (<>
                <div className="cd-stitle">Capital social</div>
                <div className="cd-grid c4">
                  <div className="cd-card"><div className="cd-label">Subscris</div><div className="cd-val mono">{fmt(sel.capitalSocial)}</div></div>
                  <div className="cd-card"><div className="cd-label">{getFieldLabel("parti_actiuni", sel.forma)}</div><div className="cd-val mono">{sel.partiSociale || sel.actiuni || "\u2014"}</div></div>
                  <div className="cd-card"><div className="cd-label">{getFieldLabel("valoare_parte", sel.forma)}</div><div className="cd-val mono">{fmt(sel.valoareParte || sel.valoareActiune)}</div></div>
                  <div className="cd-card"><div className="cd-label">Natura capital</div><div className="cd-val" style={{ fontSize: 12 }}>privat autohton {sel.natura?.privatAutohton || sel.natura?.privat_autohton || 0}%{((sel.natura?.privatStrain ?? sel.natura?.privat_strain ?? 0) > 0) ? `, strain ${sel.natura?.privatStrain || sel.natura?.privat_strain}%` : ""}{((sel.natura?.stat ?? 0) > 0) ? `, stat ${sel.natura!.stat}%` : ""}</div></div>
                </div>
              </>)}
            </>)}

            {/* ASOCIATI / ACTIONARI */}
            {(activeTab === "Asociati" || activeTab === "Actionari") && (<>
              {sel.asociatiPJ.length > 0 && (<>
                <div className="cd-stitle">{getFieldLabel("asociati_label", sel.forma)} &mdash; Persoane Juridice ({sel.asociatiPJ.length})</div>
                {sel.asociatiPJ.map((a: any, i: number) => (
                  <div className="cd-assoc" key={i}>
                    <span style={{ fontSize: 18 }}>&#127970;</span>
                    <div className="cd-assoc-name">{a.denumire}<div style={{ fontSize: 12, color: "var(--text-muted)" }}>{a.calitate} &middot; {a.tara}</div></div>
                    <div className="cd-assoc-detail">{a.cotaBeneficii}%</div>
                    <div className="cd-assoc-detail">{a.aport}</div>
                  </div>
                ))}
              </>)}
              <div className="cd-stitle">{getFieldLabel("asociati_label", sel.forma)} &mdash; Persoane Fizice ({sel.asociatiPF.length})</div>
              {sel.asociatiPF.map((a: any, i: number) => (
                <div className="cd-assoc" key={i}>
                  <span style={{ fontSize: 18 }}>&#128100;</span>
                  <div className="cd-assoc-name">{a.nume}<div style={{ fontSize: 12, color: "var(--text-muted)" }}>{a.calitate} &middot; {a.cetatenie}</div></div>
                  <div className="cd-assoc-detail">{a.cotaBeneficii}%</div>
                  <div className="cd-assoc-detail">{a.partiSociale || a.actiuni} {sel.forma === "SA" ? "actiuni" : "p.s."}</div>
                  <div className="cd-assoc-detail">{a.aport}</div>
                </div>
              ))}
            </>)}

            {/* TITULAR (PFA/II) */}
            {activeTab === "Titular" && sel.titular && (<>
              <div className="cd-stitle">Titular</div>
              <div className="cd-grid c2">
                <div className="cd-card"><div className="cd-label">Nume</div><div className="cd-val">{sel.titular.nume}</div></div>
                <div className="cd-card"><div className="cd-label">Cetatenie</div><div className="cd-val">{sel.titular.cetatenie}</div></div>
                <div className="cd-card"><div className="cd-label">Data nasterii</div><div className="cd-val mono">{sel.titular.dataNasterii}</div></div>
                <div className="cd-card"><div className="cd-label">Stare civila</div><div className="cd-val">{sel.titular.stare_civila}</div></div>
              </div>
            </>)}
            {activeTab === "Titular" && !sel.titular && (
              <div className="cd-empty"><div className="cd-empty-icon">&#128100;</div><div className="cd-empty-text">Nicio informatie despre titular disponibila.</div></div>
            )}

            {/* MEMBRI IF */}
            {activeTab === "Membri IF" && (<>
              <div className="cd-stitle">Reprezentant</div>
              <div className="cd-assoc"><span style={{ fontSize: 18 }}>&#128084;</span><div className="cd-assoc-name">{sel.reprezentantIF || "\u2014"}</div><div className="cd-assoc-detail">Reprezentant IF</div></div>
              <div className="cd-stitle">Membri ({(sel.membriIF || []).length})</div>
              {(sel.membriIF || []).map((m: any, i: number) => (
                <div className="cd-assoc" key={i}>
                  <span style={{ fontSize: 18 }}>&#128100;</span>
                  <div className="cd-assoc-name">{m.nume}<div style={{ fontSize: 12, color: "var(--text-muted)" }}>{m.calitate}</div></div>
                  <div className="cd-assoc-detail">{m.gradRudenie}</div>
                  <div className="cd-assoc-detail">{m.cetatenie}</div>
                </div>
              ))}
            </>)}

            {/* ADMINISTRARE */}
            {activeTab === "Administrare" && (<>
              <div className="cd-stitle">{getFieldLabel("admin_label", sel.forma)} ({sel.administratori.length})</div>
              {sel.administratori.map((a: any, i: number) => (
                <div className="cd-assoc" key={i}>
                  <span style={{ fontSize: 18 }}>&#128084;</span>
                  <div className="cd-assoc-name">{a.nume}<div style={{ fontSize: 12, color: "var(--text-muted)" }}>{a.functie}</div></div>
                  <div className="cd-assoc-detail">Puteri: {a.puteri}</div>
                  <div className="cd-assoc-detail">Mandat: {a.durataMandatLabel}</div>
                </div>
              ))}
              {sel.cenzori && sel.cenzori.length > 0 && (<>
                <div className="cd-stitle">Cenzori / Auditori</div>
                {sel.cenzori.map((c: any, i: number) => (
                  <div className="cd-assoc" key={i}><span style={{ fontSize: 18 }}>&#128269;</span><div className="cd-assoc-name">{c.nume}<div style={{ fontSize: 12, color: "var(--text-muted)" }}>{c.calitate}</div></div><div className="cd-assoc-detail">{c.nrAutorizare}</div></div>
                ))}
              </>)}
            </>)}

            {/* ACTIVITATI */}
            {activeTab === "Activitati" && (<>
              <div className="cd-stitle">Activitate principala</div>
              <div className="cd-card full" style={{ marginBottom: 16 }}><div className="cd-label">CAEN {sel.caen || "\u2014"}</div><div className="cd-val">{sel.caenDesc}</div></div>
              {sel.activitatiSecundare.length > 0 && (<>
                <div className="cd-stitle">Activitati secundare ({sel.activitatiSecundare.length})</div>
                {sel.activitatiSecundare.map((a: any, i: number) => (
                  <div className="cd-assoc" key={i} style={{ padding: "9px 16px" }}><div className="cd-assoc-detail" style={{ minWidth: 55 }}>{a.cod}</div><div className="cd-assoc-name" style={{ fontSize: 14 }}>{a.den}</div></div>
                ))}
              </>)}
            </>)}

            {/* SEDII */}
            {activeTab === "Sedii" && (<>
              <div className="cd-stitle">Sediu social</div>
              <div className="cd-card full" style={{ marginBottom: 16 }}><div className="cd-label">Adresa completa</div><div className="cd-val">{sel.adresa || "\u2014"}, {sel.localitate || ""}, {sel.judet || ""} {sel.codPostal || ""}</div></div>
              {sel.sediiSecundare && sel.sediiSecundare.length > 0 && (<>
                <div className="cd-stitle">Sedii secundare / Puncte de lucru ({sel.sediiSecundare.length})</div>
                {sel.sediiSecundare.map((s: any, i: number) => (
                  <div className="cd-assoc" key={i}><span style={{ fontSize: 18 }}>&#128205;</span><div className="cd-assoc-name">{s.denumire}<div style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.adresa}</div></div></div>
                ))}
              </>)}
            </>)}

            {/* FIN. ONRC */}
            {activeTab === "Fin. ONRC" && (<>
              <div className="cd-stitle">Situatii financiare (din date ONRC)</div>
              {sel.situatiiFinanciare.length > 0 ? (
                <>
                  <table className="cd-fin-table">
                    <thead><tr>
                      <th>An</th><th>Cifra afaceri</th><th>Profit net</th><th>Angajati</th>
                      {isSOC(sel.forma) && <th>Capitaluri proprii</th>}
                      {isPF(sel.forma) && <><th>Venituri</th><th>Cheltuieli</th></>}
                    </tr></thead>
                    <tbody>{sel.situatiiFinanciare.map((s: any, i: number) => (
                      <tr key={i}>
                        <td>{s.an}</td>
                        <td>{fmtNum(s.cifraAfaceri)}</td>
                        <td className={(s.profitNet ?? 0) >= 0 ? "green" : "red"}>{fmtNum(s.profitNet)}</td>
                        <td>{s.angajati ?? "\u2014"}</td>
                        {isSOC(sel.forma) && <td>{fmtNum(s.capitaluriProprii)}</td>}
                        {isPF(sel.forma) && <><td>{fmtNum(s.venituriTotale)}</td><td>{fmtNum(s.cheltuieliTotale)}</td></>}
                      </tr>
                    ))}</tbody>
                  </table>
                  <div style={{ marginTop: 14, fontSize: 12, color: "var(--text-muted)" }}>Sursa: Date publice ONRC / termene.ro</div>
                </>
              ) : (
                <div className="cd-empty">
                  <div className="cd-empty-icon">&#128202;</div>
                  <div className="cd-empty-text">Nicio situatie financiara disponibila.</div>
                </div>
              )}
            </>)}

            {/* FIN. ANAF */}
            {activeTab === "Fin. ANAF" && (
              <div className="cd-empty">
                <div className="cd-empty-icon">&#128202;</div>
                <div className="cd-empty-text">Niciun bilant incarcat.<br />Uploadeaza un bilant PDF pentru a extrage datele automat.</div>
              </div>
            )}

            {/* JURIDIC */}
            {activeTab === "Juridic" && (<>
              <div className="cd-stitle">Stare juridica</div>
              {sel.insolventa && <div className="cd-warn">Firma in insolventa</div>}
              {sel.dizolvare && <div className="cd-warn">Firma dizolvata</div>}
              {sel.lichidare && <div className="cd-warn">Firma in lichidare</div>}
              {sel.restrictii && <div className="cd-warn">Restrictii active</div>}
              {!sel.insolventa && !sel.dizolvare && !sel.lichidare && !sel.restrictii && <div className="cd-ok">Fara restrictii, insolventa, dizolvare sau lichidare</div>}
              <div className="cd-grid c2" style={{ marginTop: 16 }}>
                <div className="cd-card"><div className="cd-label">Nr. Reg. Comertului</div><div className="cd-val mono">{sel.regCom}</div></div>
                <div className="cd-card"><div className="cd-label">Forma juridica</div><div className="cd-val">{FORME_JURIDICE.find(fj => fj.cod === sel.forma)?.label || sel.forma}</div></div>
              </div>
              <div className="cd-mention" style={{ marginTop: 16 }}><div className="cd-mention-label">Ultima mentiune</div><div className="cd-mention-text">{sel.ultimaMentiune}</div></div>
            </>)}

          </div>
        </>)}
      </div>

      {/* ONRC UPLOAD MODAL */}
      {showOnrcUpload && (
        <div className="cd-overlay" onClick={e => { if (e.target === e.currentTarget) setShowOnrcUpload(false); }}>
          <div className="cd-modal">
            <div className="cd-modal-title">Upload Certificat Constatator<button className="cd-modal-close" onClick={() => setShowOnrcUpload(false)}>&times;</button></div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 18, lineHeight: 1.6 }}>
              Incarca un certificat constatator ONRC (PDF). Datele firmei se vor actualiza automat cu informatiile extrase.
            </div>
            <input type="file" ref={onrcFileRef} accept=".pdf" style={{ display: "none" }} onChange={() => {}} />
            <div className="cd-upload-zone" onClick={() => onrcFileRef.current?.click()} style={{ marginBottom: 18 }}>
              <div className="uz-icon">{onrcFileRef.current?.files?.[0] ? "\u2705" : "\u{1F4C4}"}</div>
              <div className="uz-title">{onrcFileRef.current?.files?.[0]?.name || "Certificat constatator (PDF)"}</div>
              <div className="uz-sub">Click pentru a selecta fisierul</div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="cd-btn-s" onClick={() => setShowOnrcUpload(false)}>Anuleaza</button>
              <button className="cd-btn-p" disabled={onrcUploading} onClick={handleOnrcUpload}>
                {onrcUploading ? <span className="cd-spinner" /> : "Actualizeaza datele"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
