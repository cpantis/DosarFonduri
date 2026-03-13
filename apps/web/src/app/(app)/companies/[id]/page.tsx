"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { isSOC, isPF, FORME_JURIDICE, getCompanyTabs, getFieldLabel } from "@/hooks/useFormaJuridica";
import { apiGet, apiPost, apiDelete, api } from "@/lib/api";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TypeBadge } from "@/components/ui/TypeBadge";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { BtnPrimary, BtnSecondary, BtnDanger } from "@/components/ui/Buttons";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

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
const fmtLei = (v: number | string | null | undefined) => {
  if (v == null) return "\u2014";
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/[^0-9-]/g, ""));
  if (isNaN(n)) return String(v);
  return n.toLocaleString("de-DE") + " LEI";
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
    activitatiSecundare: (raw.activitatiSecundare || raw.activitati_secundare || (raw.caenSecundare || []).map((c: string) => ({ cod: c, den: "" }))),
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

  // Bilant ANAF upload
  const [showBilantUpload, setShowBilantUpload] = useState(false);
  const [bilantUploading, setBilantUploading] = useState(false);
  const [bilantYear, setBilantYear] = useState(new Date().getFullYear() - 1);
  const bilantFileRef = useRef<HTMLInputElement>(null);
  const [selectedBilantYear, setSelectedBilantYear] = useState<number | null>(null);

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

  // Poll for processing status
  useEffect(() => {
    if (!detail || (detail.processingStatus !== "processing")) return;
    const interval = setInterval(async () => {
      try {
        const status = await apiGet(`/api/companies/${id}/processing-status`);
        if (status.processingStatus !== "processing") {
          clearInterval(interval);
          fetchDetail();
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

  const handleBilantUpload = async () => {
    if (!bilantFileRef.current?.files?.[0]) return;
    setBilantUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", bilantFileRef.current.files[0]);
      formData.append("year", String(bilantYear));
      await api<any>(`/api/companies/${id}/upload-bilant`, {
        method: "POST",
        body: formData,
        timeout: 120_000,
      });
      await fetchDetail();
      setShowBilantUpload(false);
      bilantFileRef.current.value = "";
    } catch (err: any) {
      alert("Eroare la upload bilant: " + (err.message || "Eroare necunoscuta"));
    } finally {
      setBilantUploading(false);
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
    <div className="flex flex-col h-full overflow-hidden animate-[fadeIn_.2s_ease-out]">
      <style>{`
        .cd-info{padding:16px;border-radius:12px;border:1px solid rgba(226,232,240,.8);background:#ffffff;transition:all .15s}
        .cd-info:hover{border-color:#cbd5e1}
        .cd-info-label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;font-weight:600;color:#94a3b8;margin-bottom:6px}
        .cd-info-value{font-size:15px;font-weight:600;color:#0f172a}
        .cd-info-sub{font-size:13px;font-weight:400;color:#94a3b8;margin-top:4px}
        .cd-info.accent{border-left:3px solid #2563eb}
        .cd-tab{padding:10px 16px;font-size:13px;font-weight:500;color:#64748b;cursor:pointer;border:none;background:transparent;border-bottom:2px solid transparent;transition:all .15s;white-space:nowrap}
        .cd-tab:hover{color:#0f172a}
        .cd-tab.on{color:#2563eb;border-bottom-color:#2563eb;font-weight:600}
        .cd-table{width:100%;border-collapse:collapse}
        .cd-table thead th{text-align:left;padding:12px 16px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;font-weight:600;color:#94a3b8;background:#f8fafc;border-bottom:1px solid rgba(226,232,240,.8)}
        .cd-table thead th.right{text-align:right}
        .cd-table tbody td{padding:12px 16px;font-size:13px;color:#475569;border-bottom:1px solid #f1f5f9}
        .cd-table tbody td.right{text-align:right}
        .cd-table tbody td.mono{font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;color:#64748b}
        .cd-table tbody td.name{color:#0f172a;font-weight:500}
        .cd-table tbody tr:hover{background:#f8fafc}
        .cd-table tbody tr.clickable{cursor:pointer}
        .cd-table tbody tr.active{background:rgba(37,99,235,.04)}
        .cd-card{padding:20px;border-radius:12px;border:1px solid rgba(226,232,240,.8);background:#ffffff;transition:all .15s}
        .cd-card:hover{border-color:#cbd5e1}
        .cd-banner{margin:0 32px;margin-top:16px;padding:14px 20px;border-radius:12px;display:flex;align-items:center;gap:12px;flex-shrink:0}
        .cd-banner.processing{background:rgba(37,99,235,.04);border:1px solid rgba(37,99,235,.15)}
        .cd-banner.error{background:rgba(248,113,113,.04);border:1px solid rgba(248,113,113,.15)}
        .cd-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:100}
        .cd-modal{background:#ffffff;border-radius:16px;width:480px;max-height:85vh;overflow-y:auto;padding:28px;border:1px solid rgba(226,232,240,.8);box-shadow:0 20px 60px rgba(0,0,0,.08);animation:fadeUp .2s ease-out}
        .cd-drop-zone{border:2px dashed rgba(226,232,240,.8);border-radius:12px;padding:28px 20px;text-align:center;cursor:pointer;transition:all .15s;margin-bottom:20px}
        .cd-drop-zone:hover{border-color:#cbd5e1;background:#f8fafc}
        .cd-select{border:1px solid rgba(226,232,240,.8);border-radius:8px;padding:8px 12px;font-size:13px;background:#ffffff;color:#0f172a;outline:none;cursor:pointer;font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums}
        .cd-select:focus{border-color:#2563eb}
        .cd-badge-row{display:flex;flex-wrap:wrap;gap:8px}
        .cd-caen-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:6px;border:1px solid rgba(226,232,240,.8);background:#f8fafc;font-size:12px;color:#64748b}
        .cd-caen-code{font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;font-size:11px;color:#94a3b8}
        .cd-legal-row{display:flex;align-items:center;gap:12px;font-size:14px;padding:4px 0}
        .cd-legal-ok{color:#059669}
        .cd-legal-bad{color:#dc2626}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>

      {/* LOADING STATE */}
      {loading && (
        <div style={{ padding: "32px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="skeleton" style={{ height: 60, borderRadius: 12 }} />
          <div className="skeleton" style={{ height: 40, borderRadius: 8 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            {[1,2,3,4,5,6].map(i => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />)}
          </div>
        </div>
      )}

      {/* ERROR STATE */}
      {!loading && error && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: "#94a3b8" }}>
          <div style={{ fontSize: 14, color: "#dc2626" }}>{error}</div>
          <button
            onClick={fetchDetail}
            style={{ padding: "8px 16px", fontSize: 13, fontWeight: 500, background: "#ffffff", border: "1px solid rgba(226,232,240,.8)", borderRadius: 8, color: "#475569", cursor: "pointer", transition: "all .15s" }}
          >
            Reincearca
          </button>
          <Link href="/companies" style={{ fontSize: 13, fontWeight: 600, color: "#2563eb", textDecoration: "none", marginTop: 8 }}>
            &larr; Inapoi la lista
          </Link>
        </div>
      )}

      {/* DETAIL VIEW */}
      {!loading && !error && sel && (<>
        {/* BANNERS */}
        {sel.processingStatus === "processing" && (
          <div className="cd-banner processing">
            <div style={{ width: 18, height: 18, border: "2px solid rgba(37,99,235,.2)", borderTopColor: "#2563eb", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "#2563eb" }}>Se proceseaza documentul... Datele firmei se actualizeaza automat.</span>
          </div>
        )}
        {sel.processingStatus === "error" && (
          <div className="cd-banner error">
            <span style={{ fontSize: 13, fontWeight: 600, color: "#dc2626" }}>Eroare la procesare: {sel.processingError || "Eroare necunoscuta"}</span>
            <button
              onClick={() => setShowOnrcUpload(true)}
              style={{ marginLeft: "auto", padding: "6px 12px", fontSize: 12, fontWeight: 500, background: "#ffffff", border: "1px solid rgba(226,232,240,.8)", borderRadius: 8, color: "#475569", cursor: "pointer", transition: "all .15s" }}
            >
              Reincearca upload
            </button>
          </div>
        )}

        {/* HEADER */}
        <PageHeader
          title={sel.denumire}
          subtitle={`CUI: ${sel.cui} \u00b7 ${sel.regCom || "\u2014"}${sel.euid ? ` \u00b7 EUID: ${sel.euid}` : ""}`}
          breadcrumb={[{ label: "Firme", href: "/companies" }, { label: sel.denumire }]}
          badges={<><TypeBadge type={sel.forma} /><StatusBadge status={sel.stare || "activ"} /></>}
        >
          <BtnSecondary size="sm" onClick={handleSyncOnrc}>Actualizare CUI</BtnSecondary>
          <BtnSecondary size="sm" onClick={() => setShowOnrcUpload(true)}>Upload ONRC</BtnSecondary>
          <BtnSecondary size="sm" onClick={() => setShowBilantUpload(true)}>Upload Bilant</BtnSecondary>
          <BtnDanger size="sm" onClick={handleDelete}>Sterge</BtnDanger>
        </PageHeader>

        {/* TABS */}
        <div style={{ background: "#ffffff", borderBottom: "1px solid rgba(226,232,240,.8)" }}>
          <div style={{ maxWidth: 1152, margin: "0 auto", padding: "0 32px", display: "flex", overflowX: "auto", gap: 0 }}>
            {tabs.map(t => (
              <button
                key={t}
                className={`cd-tab ${activeTab === t ? "on" : ""}`}
                onClick={() => setActiveTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* TAB CONTENT */}
        <div style={{ flex: 1, overflowY: "auto", background: "#f8fafc" }}>
          <div style={{ maxWidth: 1152, margin: "0 auto", padding: "24px 32px", animation: "fadeUp .2s ease-out" }}>

          {/* GENERAL */}
          {activeTab === "General" && (<>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
              <div className="cd-info" style={{ gridColumn: "span 2" }}>
                <div className="cd-info-label">Forma juridica</div>
                <div className="cd-info-value">{FORME_JURIDICE.find(fj => fj.cod === sel.forma)?.label || sel.forma}</div>
              </div>
              <div className="cd-info">
                <div className="cd-info-label">Stare</div>
                <div style={{ marginTop: 2 }}><StatusBadge status={sel.stare || "activ"} /></div>
              </div>
              <div className="cd-info" style={{ gridColumn: "span 2" }}>
                <div className="cd-info-label">Adresa</div>
                <div className="cd-info-value">{sel.adresa || "\u2014"}</div>
                <div className="cd-info-sub">
                  {sel.localitate || ""}{sel.localitate && sel.judet ? ", " : ""}{sel.judet || ""} {sel.codPostal || ""}
                </div>
              </div>
              <div className="cd-info">
                <div className="cd-info-label">Telefon</div>
                <div className="cd-info-value">{sel.telefon || "\u2014"}</div>
              </div>
              {sel.email && (
                <div className="cd-info">
                  <div className="cd-info-label">Email</div>
                  <div className="cd-info-value">{sel.email}</div>
                </div>
              )}
              {sel.website && (
                <div className="cd-info">
                  <div className="cd-info-label">Website</div>
                  <a href={sel.website.startsWith('http') ? sel.website : `https://${sel.website}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 15, fontWeight: 600, color: "#2563eb", textDecoration: "none" }}>
                    {sel.website}
                  </a>
                </div>
              )}
              <div className="cd-info">
                <div className="cd-info-label">{getFieldLabel("durata_label", sel.forma)}</div>
                <div className="cd-info-value">{sel.durata || "\u2014"}</div>
              </div>
              <div className="cd-info">
                <div className="cd-info-label">An infiintare</div>
                <div className="cd-info-value">{sel.anInfiintare || "\u2014"}</div>
              </div>
              <div className="cd-info">
                <div className="cd-info-label">CAEN</div>
                <div className="cd-info-value">{sel.caen || "\u2014"}</div>
                <div className="cd-info-sub">{sel.caenDesc}</div>
              </div>
              {sel.regCom && (
                <div className="cd-info">
                  <div className="cd-info-label">Nr. Reg. Com.</div>
                  <div className="cd-info-value">{sel.regCom}</div>
                </div>
              )}
              {sel.euid && (
                <div className="cd-info">
                  <div className="cd-info-label">EUID</div>
                  <div className="cd-info-value" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>{sel.euid}</div>
                </div>
              )}
            </div>

            {sel.activitatiSecundare && sel.activitatiSecundare.length > 0 && (
              <div className="cd-card" style={{ marginBottom: 12 }}>
                <div className="cd-info-label" style={{ marginBottom: 12 }}>Activitati secundare ({sel.activitatiSecundare.length})</div>
                <div className="cd-badge-row">
                  {sel.activitatiSecundare.slice(0, 5).map((a: any, i: number) => (
                    <span key={i} className="cd-caen-badge">
                      <span className="cd-caen-code">{a.cod}</span>
                      {a.den}
                    </span>
                  ))}
                  {sel.activitatiSecundare.length > 5 && (
                    <button onClick={() => setActiveTab("Activitati")} style={{ fontSize: 12, fontWeight: 600, color: "#2563eb", background: "transparent", border: "none", cursor: "pointer" }}>
                      +{sel.activitatiSecundare.length - 5} mai multe
                    </button>
                  )}
                </div>
              </div>
            )}

            {isPF(sel.forma) && sel.patrimoniu_afectat && (
              <div className="cd-info accent" style={{ marginBottom: 12 }}>
                <div className="cd-info-label">Patrimoniu de afectatiune</div>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: "#0f172a" }}>{sel.patrimoniu_afectat}</div>
              </div>
            )}

            <div className="cd-info accent" style={{ marginTop: 20 }}>
              <div className="cd-info-label">Ultima mentiune</div>
              <div style={{ fontSize: 14, lineHeight: 1.6, color: "#0f172a" }}>{sel.ultimaMentiune}</div>
            </div>

            {isSOC(sel.forma) && sel.capitalSocial && (
              <div className="cd-card" style={{ marginTop: 24 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 16 }}>Capital social</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                  <div className="cd-info">
                    <div className="cd-info-label">Subscris</div>
                    <div className="cd-info-value" style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums" }}>{fmt(sel.capitalSocial)}</div>
                  </div>
                  <div className="cd-info">
                    <div className="cd-info-label">{getFieldLabel("parti_actiuni", sel.forma)}</div>
                    <div className="cd-info-value">{sel.partiSociale || sel.actiuni || "\u2014"}</div>
                  </div>
                  <div className="cd-info">
                    <div className="cd-info-label">{getFieldLabel("valoare_parte", sel.forma)}</div>
                    <div className="cd-info-value" style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums" }}>{fmt(sel.valoareParte || sel.valoareActiune)}</div>
                  </div>
                  <div className="cd-info">
                    <div className="cd-info-label">Natura</div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#0f172a" }}>
                      privat autohton {sel.natura?.privatAutohton || sel.natura?.privat_autohton || 0}%
                      {((sel.natura?.privatStrain ?? sel.natura?.privat_strain ?? 0) > 0) ? `, strain ${sel.natura?.privatStrain || sel.natura?.privat_strain}%` : ""}
                      {((sel.natura?.stat ?? 0) > 0) ? `, stat ${sel.natura!.stat}%` : ""}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>)}

          {/* ASOCIATI / ACTIONARI */}
          {(activeTab === "Asociati" || activeTab === "Actionari") && (<>
            {sel.asociatiPJ.length > 0 && (<>
              <SectionTitle>
                {getFieldLabel("asociati_label", sel.forma)} &mdash; Persoane Juridice ({sel.asociatiPJ.length})
              </SectionTitle>
              <div className="cd-card" style={{ overflow: "hidden", padding: 0, marginBottom: 20 }}>
                <table className="cd-table">
                  <thead>
                    <tr>
                      <th>Denumire</th>
                      <th>Calitate</th>
                      <th>Tara</th>
                      <th className="right">Cota %</th>
                      <th className="right">Aport</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sel.asociatiPJ.map((row: any, i: number) => (
                      <tr key={i}>
                        <td className="name">{row.denumire}</td>
                        <td>{row.calitate}</td>
                        <td>{row.tara}</td>
                        <td className="right mono">{row.cotaBeneficii}%</td>
                        <td className="right mono">{row.aport}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>)}
            <SectionTitle>
              {getFieldLabel("asociati_label", sel.forma)} &mdash; Persoane Fizice ({sel.asociatiPF.length})
            </SectionTitle>
            <div className="cd-card" style={{ overflow: "hidden", padding: 0 }}>
              <table className="cd-table">
                <thead>
                  <tr>
                    <th>Nume</th>
                    <th>Calitate</th>
                    <th>Cetatenie</th>
                    <th className="right">Cota %</th>
                    <th className="right">{sel.forma === "SA" ? "Actiuni" : "Parti soc."}</th>
                    <th className="right">Aport</th>
                  </tr>
                </thead>
                <tbody>
                  {sel.asociatiPF.map((row: any, i: number) => (
                    <tr key={i}>
                      <td className="name">{row.nume}</td>
                      <td>{row.calitate}</td>
                      <td>{row.cetatenie}</td>
                      <td className="right mono">{row.cotaBeneficii}%</td>
                      <td className="right mono">{row.partiSociale || row.actiuni}</td>
                      <td className="right mono">{row.aport}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>)}

          {/* TITULAR (PFA/II) */}
          {activeTab === "Titular" && sel.titular && (<>
            <SectionTitle>Titular</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                { label: "Nume", value: sel.titular.nume },
                { label: "Cetatenie", value: sel.titular.cetatenie },
                { label: "Data nasterii", value: sel.titular.dataNasterii },
                { label: "Stare civila", value: sel.titular.stare_civila },
              ].map(item => (
                <div key={item.label} className="cd-info">
                  <div className="cd-info-label">{item.label}</div>
                  <div className="cd-info-value">{item.value || "\u2014"}</div>
                </div>
              ))}
            </div>
          </>)}
          {activeTab === "Titular" && !sel.titular && (
            <EmptyState icon="&#128100;" title="Nicio informatie despre titular disponibila." />
          )}

          {/* MEMBRI IF */}
          {activeTab === "Membri IF" && (<>
            <SectionTitle>Reprezentant</SectionTitle>
            <div className="cd-card" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <span style={{ fontSize: 18 }}>&#128084;</span>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{sel.reprezentantIF || "\u2014"}</div>
              <span style={{ marginLeft: "auto", fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: "#94a3b8" }}>Reprezentant IF</span>
            </div>
            <SectionTitle>Membri ({(sel.membriIF || []).length})</SectionTitle>
            <div className="cd-card" style={{ overflow: "hidden", padding: 0 }}>
              <table className="cd-table">
                <thead>
                  <tr>
                    <th>Nume</th>
                    <th>Calitate</th>
                    <th>Grad rudenie</th>
                    <th>Cetatenie</th>
                  </tr>
                </thead>
                <tbody>
                  {(sel.membriIF || []).map((row: any, i: number) => (
                    <tr key={i}>
                      <td className="name">{row.nume}</td>
                      <td>{row.calitate}</td>
                      <td>{row.gradRudenie}</td>
                      <td>{row.cetatenie}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>)}

          {/* ADMINISTRARE */}
          {activeTab === "Administrare" && (<>
            <SectionTitle>
              {getFieldLabel("admin_label", sel.forma)} ({sel.administratori.length})
            </SectionTitle>
            <div className="cd-card" style={{ overflow: "hidden", padding: 0, marginBottom: 20 }}>
              <table className="cd-table">
                <thead>
                  <tr>
                    <th>Nume</th>
                    <th>Functie</th>
                    <th>Puteri</th>
                    <th>Mandat</th>
                  </tr>
                </thead>
                <tbody>
                  {sel.administratori.map((row: any, i: number) => (
                    <tr key={i}>
                      <td className="name">{row.nume}</td>
                      <td>{row.functie}</td>
                      <td>{row.puteri}</td>
                      <td>{row.durataMandatLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sel.cenzori && sel.cenzori.length > 0 && (<>
              <SectionTitle>Cenzori / Auditori</SectionTitle>
              <div className="cd-card" style={{ overflow: "hidden", padding: 0 }}>
                <table className="cd-table">
                  <thead>
                    <tr>
                      <th>Nume</th>
                      <th>Calitate</th>
                      <th>Nr. autorizare</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sel.cenzori.map((row: any, i: number) => (
                      <tr key={i}>
                        <td className="name">{row.nume}</td>
                        <td>{row.calitate}</td>
                        <td className="mono">{row.nrAutorizare}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>)}
          </>)}

          {/* ACTIVITATI */}
          {activeTab === "Activitati" && (<>
            <SectionTitle>Activitate principala</SectionTitle>
            <div style={{ padding: 16, borderRadius: 12, background: "rgba(37,99,235,.04)", border: "1px solid rgba(37,99,235,.12)", marginBottom: 20 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600, color: "#2563eb", marginBottom: 4 }}>CAEN {sel.caen || "\u2014"}</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#0f172a" }}>{sel.caenDesc}</div>
            </div>
            {sel.activitatiSecundare.length > 0 && (<>
              <SectionTitle>Activitati secundare ({sel.activitatiSecundare.length})</SectionTitle>
              <div className="cd-card" style={{ overflow: "hidden", padding: 0 }}>
                {sel.activitatiSecundare.map((a: any, i: number) => (
                  <div
                    key={i}
                    style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 16px", borderBottom: i < sel.activitatiSecundare.length - 1 ? "1px solid #f1f5f9" : "none" }}
                  >
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums", fontSize: 12, minWidth: 55, color: "#94a3b8" }}>{a.cod}</span>
                    <span style={{ fontSize: 13, color: "#0f172a" }}>{a.den}</span>
                  </div>
                ))}
              </div>
            </>)}
          </>)}

          {/* SEDII */}
          {activeTab === "Sedii" && (<>
            <SectionTitle>Sediu social</SectionTitle>
            <div className="cd-info accent" style={{ marginBottom: 20 }}>
              <div className="cd-info-label">Adresa completa</div>
              <div className="cd-info-value">{sel.adresa || "\u2014"}, {sel.localitate || ""}, {sel.judet || ""} {sel.codPostal || ""}</div>
            </div>
            {sel.sediiSecundare && sel.sediiSecundare.length > 0 && (<>
              <SectionTitle>Sedii secundare / Puncte de lucru ({sel.sediiSecundare.length})</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sel.sediiSecundare.map((s: any, i: number) => (
                  <div key={i} className="cd-card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 18 }}>&#128205;</span>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{s.denumire}</div>
                      <div style={{ fontSize: 12, marginTop: 2, color: "#94a3b8" }}>{s.adresa}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>)}
          </>)}

          {/* FIN. ONRC */}
          {activeTab === "Fin. ONRC" && (<>
            <SectionTitle>Situatii financiare (din date ONRC)</SectionTitle>
            {sel.situatiiFinanciare.length > 0 ? (
              <>
                <div className="cd-card" style={{ overflow: "hidden", padding: 0, marginBottom: 12 }}>
                  <table className="cd-table">
                    <thead>
                      <tr>
                        <th>An</th>
                        <th className="right">Cifra afaceri</th>
                        <th className="right">Profit net</th>
                        <th className="right">Angajati</th>
                        {isSOC(sel.forma) && <th className="right">Capitaluri proprii</th>}
                        {isPF(sel.forma) && <><th className="right">Venituri</th><th className="right">Cheltuieli</th></>}
                      </tr>
                    </thead>
                    <tbody>
                      {sel.situatiiFinanciare.map((row: any, i: number) => (
                        <tr key={i}>
                          <td className="name">{row.an}</td>
                          <td className="right mono">{fmtLei(row.cifraAfaceri)}</td>
                          <td className="right" style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums", color: (row.profitNet ?? 0) >= 0 ? "#059669" : "#dc2626" }}>{fmtLei(row.profitNet)}</td>
                          <td className="right mono">{row.angajati ?? "\u2014"}</td>
                          {isSOC(sel.forma) && <td className="right mono">{fmtLei(row.capitaluriProprii)}</td>}
                          {isPF(sel.forma) && <><td className="right mono">{fmtLei(row.venituriTotale)}</td><td className="right mono">{fmtLei(row.cheltuieliTotale)}</td></>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 12 }}>Sursa: Date publice ONRC / termene.ro</div>
              </>
            ) : (
              <EmptyState icon="&#128202;" title="Nicio situatie financiara disponibila." />
            )}
          </>)}

          {/* FIN. ANAF */}
          {activeTab === "Fin. ANAF" && (() => {
            const anafData = sel.situatiiFinanciare.filter((s: any) => s.source === "anaf_upload");
            const anafYears = anafData.map((s: any) => s.an).sort((a: number, b: number) => b - a);
            const viewYear = selectedBilantYear ?? anafYears[0] ?? null;
            const raw = (detail?.financials || []).find((f: any) => f.source === "anaf_upload" && f.year === viewYear);
            const f10 = raw?.f10;
            const f20 = raw?.f20;
            const f30 = raw?.f30;

            return anafData.length > 0 ? (<>
              {/* Header with year selector */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: ".06em" }}>Bilant ANAF</h3>
                  {anafYears.length > 1 && (
                    <select
                      value={viewYear ?? ""}
                      onChange={e => setSelectedBilantYear(Number(e.target.value))}
                      className="cd-select"
                    >
                      {anafYears.map((y: number) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  )}
                  {anafYears.length === 1 && <span style={{ fontSize: 14, fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums", color: "#64748b" }}>{viewYear}</span>}
                </div>
                <BtnSecondary size="sm" onClick={() => setShowBilantUpload(true)}>Upload bilant</BtnSecondary>
              </div>

              {/* Summary table */}
              <div className="cd-card" style={{ overflow: "hidden", padding: 0, marginBottom: 24 }}>
                <table className="cd-table">
                  <thead>
                    <tr>
                      <th>An</th>
                      <th className="right">Cifra afaceri</th>
                      <th className="right">Profit net</th>
                      <th className="right">Rezultat exploatare</th>
                      <th className="right">Angajati</th>
                      {isSOC(sel.forma) && <th className="right">Capitaluri proprii</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {anafData.map((s: any, i: number) => (
                      <tr
                        key={i}
                        className={`clickable ${s.an === viewYear ? "active" : ""}`}
                        onClick={() => setSelectedBilantYear(s.an)}
                      >
                        <td style={{ fontWeight: s.an === viewYear ? 700 : 500 }} className="name">{s.an}</td>
                        <td className="right mono">{fmtLei(s.cifraAfaceri)}</td>
                        <td className="right" style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums", color: (s.profitNet ?? 0) >= 0 ? "#059669" : "#dc2626" }}>{fmtLei(s.profitNet)}</td>
                        <td className="right mono">{fmtLei(raw?.f20?.rezultatExploatare)}</td>
                        <td className="right mono">{s.angajati ?? "\u2014"}</td>
                        {isSOC(sel.forma) && <td className="right mono">{fmtLei(s.capitaluriProprii)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Detailed data for selected year */}
              {f20 && (<>
                <SectionTitle>Cont profit si pierderi ({viewYear})</SectionTitle>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                  {[
                    { label: "Cifra afaceri neta", value: fmtLei(f20.cifraAfaceriNeta) },
                    { label: "Venituri exploatare", value: fmtLei(f20.venituriExploatare) },
                    { label: "Cheltuieli exploatare", value: fmtLei(f20.cheltuieliExploatare) },
                    { label: "Rezultat exploatare", value: fmtLei(f20.rezultatExploatare), color: (f20.rezultatExploatare ?? 0) >= 0 },
                    { label: "Venituri financiare", value: fmtLei(f20.venituriFinanciare) },
                    { label: "Cheltuieli financiare", value: fmtLei(f20.cheltuieliFinanciare) },
                    { label: "Rezultat brut", value: fmtLei(f20.rezultatBrut), color: (f20.rezultatBrut ?? 0) >= 0 },
                    { label: "Rezultat net", value: fmtLei(f20.profitNet), color: (f20.profitNet ?? 0) >= 0 },
                  ].map(item => (
                    <div key={item.label} className="cd-info">
                      <div className="cd-info-label">{item.label}</div>
                      <div className="cd-info-value" style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums", color: item.color !== undefined ? (item.color ? "#059669" : "#dc2626") : "#0f172a" }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </>)}

              {f10 && (<>
                <SectionTitle>Bilant ({viewYear})</SectionTitle>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                  {[
                    { label: "Active imobilizate", value: fmtLei(f10.activeImobilizate) },
                    { label: "Active circulante", value: fmtLei(f10.activeCirculante) },
                    { label: "Stocuri", value: fmtLei(f10.stocuri) },
                    { label: "Creante", value: fmtLei(f10.creante) },
                    { label: "Casa si conturi", value: fmtLei(f10.casaSiConturi) },
                    { label: "Datorii sub 1 an", value: fmtLei(f10.datoriiSub1An) },
                    { label: "Datorii peste 1 an", value: fmtLei(f10.datoriiPeste1An) },
                    { label: "Capitaluri proprii", value: fmtLei(f10.capitaluriProprii), color: (f10.capitaluriProprii ?? 0) >= 0 },
                  ].map(item => (
                    <div key={item.label} className="cd-info">
                      <div className="cd-info-label">{item.label}</div>
                      <div className="cd-info-value" style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums", color: item.color !== undefined ? (item.color ? "#059669" : "#dc2626") : "#0f172a" }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </>)}

              {f30 && (f30.numarMediuSalariati || f30.numarSalariati31Dec) && (<>
                <SectionTitle>Date informative ({viewYear})</SectionTitle>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {f30.numarMediuSalariati != null && (
                    <div className="cd-info">
                      <div className="cd-info-label">Nr. mediu salariati</div>
                      <div className="cd-info-value" style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums" }}>{f30.numarMediuSalariati}</div>
                    </div>
                  )}
                  {f30.numarSalariati31Dec != null && (
                    <div className="cd-info">
                      <div className="cd-info-label">Nr. salariati la 31 dec</div>
                      <div className="cd-info-value" style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums" }}>{f30.numarSalariati31Dec}</div>
                    </div>
                  )}
                </div>
              </>)}

              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 12 }}>Sursa: Bilant ANAF uploadat</div>
            </>) : (
              <EmptyState
                icon="&#128202;"
                title="Niciun bilant ANAF incarcat."
                actionLabel="Upload bilant ANAF"
                onAction={() => setShowBilantUpload(true)}
              />
            );
          })()}

          {/* JURIDIC */}
          {activeTab === "Juridic" && (<>
            <SectionTitle>Stare juridica</SectionTitle>
            <div className="cd-card" style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { key: "insolventa", label: "Insolventa", value: sel.insolventa },
                  { key: "dizolvare", label: "Dizolvare", value: sel.dizolvare },
                  { key: "lichidare", label: "Lichidare", value: sel.lichidare },
                  { key: "restrictii", label: "Restrictii", value: sel.restrictii },
                ].map(item => (
                  <div key={item.key} className="cd-legal-row">
                    <span className={item.value ? "cd-legal-bad" : "cd-legal-ok"}>{item.value ? "\u274C" : "\u2705"}</span>
                    <span style={{ fontWeight: 500, color: item.value ? "#dc2626" : "#0f172a" }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
            {!sel.insolventa && !sel.dizolvare && !sel.lichidare && !sel.restrictii && (
              <div style={{ padding: 16, borderRadius: 12, background: "rgba(5,150,105,.04)", border: "1px solid rgba(5,150,105,.15)", marginBottom: 20, fontSize: 14, color: "#059669", display: "flex", alignItems: "center", gap: 8 }}>
                <span>&#9989;</span> Fara restrictii, insolventa, dizolvare sau lichidare
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
              <div className="cd-info">
                <div className="cd-info-label">Nr. Reg. Comertului</div>
                <div className="cd-info-value">{sel.regCom || "\u2014"}</div>
              </div>
              <div className="cd-info">
                <div className="cd-info-label">Forma juridica</div>
                <div className="cd-info-value">{FORME_JURIDICE.find(fj => fj.cod === sel.forma)?.label || sel.forma}</div>
              </div>
            </div>
            <div className="cd-info accent" style={{ marginTop: 16 }}>
              <div className="cd-info-label">Ultima mentiune</div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: "#64748b" }}>{sel.ultimaMentiune}</div>
            </div>
          </>)}

          </div>
        </div>
      </>)}

      {/* ONRC UPLOAD MODAL */}
      {showOnrcUpload && (
        <div
          className="cd-modal-overlay"
          onClick={e => { if (e.target === e.currentTarget) setShowOnrcUpload(false); }}
        >
          <div className="cd-modal">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Upload Certificat Constatator</h2>
              <button
                onClick={() => setShowOnrcUpload(false)}
                style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: "#94a3b8", transition: "all .15s" }}
              >
                <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p style={{ fontSize: 13, marginBottom: 20, lineHeight: 1.6, color: "#64748b" }}>
              Incarca un certificat constatator ONRC (PDF). Datele firmei se vor actualiza automat cu informatiile extrase.
            </p>
            <input type="file" ref={onrcFileRef} accept=".pdf" className="hidden" onChange={() => {}} />
            <div
              className="cd-drop-zone"
              onClick={() => onrcFileRef.current?.click()}
            >
              <div style={{ fontSize: 24, marginBottom: 6 }}>{onrcFileRef.current?.files?.[0] ? "\u2705" : "\ud83d\udcc4"}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{onrcFileRef.current?.files?.[0]?.name || "Certificat constatator (PDF)"}</div>
              <div style={{ fontSize: 12, marginTop: 4, color: "#94a3b8" }}>Click pentru a selecta fisierul</div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <BtnSecondary onClick={() => setShowOnrcUpload(false)}>Anuleaza</BtnSecondary>
              <BtnPrimary disabled={onrcUploading} onClick={handleOnrcUpload}>
                {onrcUploading ? <span style={{ display: "inline-block", width: 18, height: 18, border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#ffffff", borderRadius: "50%", animation: "spin .7s linear infinite" }} /> : "Actualizeaza datele"}
              </BtnPrimary>
            </div>
          </div>
        </div>
      )}

      {/* BILANT ANAF UPLOAD MODAL */}
      {showBilantUpload && (
        <div
          className="cd-modal-overlay"
          onClick={e => { if (e.target === e.currentTarget) setShowBilantUpload(false); }}
        >
          <div className="cd-modal">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Upload bilant ANAF</h2>
              <button
                onClick={() => setShowBilantUpload(false)}
                style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: "#94a3b8", transition: "all .15s" }}
              >
                <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p style={{ fontSize: 13, marginBottom: 20, lineHeight: 1.6, color: "#64748b" }}>
              Incarca un bilant ANAF (PDF descarcat din SPV). Se accepta Formularul 10 (bilant), Formularul 20 (cont profit/pierderi), Formularul 30/40. Datele financiare se extrag automat.
            </p>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", color: "#94a3b8", marginBottom: 6 }}>An fiscal</div>
              <select
                value={bilantYear}
                onChange={e => setBilantYear(Number(e.target.value))}
                className="cd-select"
                style={{ width: 140 }}
              >
                {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 1 - i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <input type="file" ref={bilantFileRef} accept=".pdf" className="hidden" onChange={() => {}} />
            <div
              className="cd-drop-zone"
              onClick={() => bilantFileRef.current?.click()}
            >
              <div style={{ fontSize: 24, marginBottom: 6 }}>{bilantFileRef.current?.files?.[0] ? "\u2705" : "\ud83d\udcca"}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{bilantFileRef.current?.files?.[0]?.name || "Bilant ANAF (PDF)"}</div>
              <div style={{ fontSize: 12, marginTop: 4, color: "#94a3b8" }}>Click pentru a selecta fisierul</div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <BtnSecondary onClick={() => setShowBilantUpload(false)}>Anuleaza</BtnSecondary>
              <BtnPrimary disabled={bilantUploading} onClick={handleBilantUpload}>
                {bilantUploading ? <span style={{ display: "inline-block", width: 18, height: 18, border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#ffffff", borderRadius: "50%", animation: "spin .7s linear infinite" }} /> : "Extrage date financiare"}
              </BtnPrimary>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
