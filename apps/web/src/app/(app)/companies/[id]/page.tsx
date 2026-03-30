"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { isSOC, isPF, FORME_JURIDICE, getCompanyTabs, getFieldLabel } from "@/hooks/useFormaJuridica";
import { useAuth } from "@/hooks/useAuth";
import { apiGet, apiPost, apiPut, apiDelete, api } from "@/lib/api";
import { getCaenDescription } from "@/lib/caen";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TypeBadge } from "@/components/ui/TypeBadge";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { BtnPrimary, BtnSecondary, BtnDanger, IconRefresh, IconUpload, IconTrash } from "@/components/ui/Buttons";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  formatConditionText as rcFormatConditionText,
  formatFieldName as rcFormatFieldName,
  formatConditionValue as rcFormatConditionValue,
  OPERATOR_LABELS as RC_OP_LABELS,
} from "@/components/shared/RuleCard";

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
  return n.toLocaleString("ro-RO") + " LEI";
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
    caenDesc: raw.caenDesc || raw.caen_desc || raw.NACEDescription || "\u2014",
    activitatiSecundare: (raw.activitatiSecundare || raw.activitati_secundare || (raw.caenSecundare || []).map((c: string) => ({ cod: c, den: "" }))),
    sediiSecundare: raw.sediiSecundare || raw.sedii_secundare || [],
    insolventa: raw.insolventa ?? false, dizolvare: raw.dizolvare ?? false,
    lichidare: raw.lichidare ?? false, restrictii: raw.restrictii ?? false,
    titular: raw.titular || null, cenzori: raw.cenzori || null,
    ultimaMentiune: raw.ultimaMentiune || raw.ultima_mentiune || "\u2014",
    natura: d.naturaCapital || null,
    platitorTVA: raw.vat || raw.VAT || null,
    dataInfiintare: raw.foundedDate || raw.Date || null,
    situatiiFinanciare, asociatiPF, asociatiPJ, administratori, membriIF,
  };
};

/* === COMPONENT === */
export default function CompanyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, organization } = useAuth();
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
  const bilantFileRef = useRef<HTMLInputElement>(null);
  const [bilantFileName, setBilantFileName] = useState<string | null>(null);
  const [onrcFileName, setOnrcFileName] = useState<string | null>(null);
  const [selectedBilantYear, setSelectedBilantYear] = useState<number | null>(null);

  // Biblioteca Elemente
  const [elementsData, setElementsData] = useState<any>(null);
  const [elementsLoading, setElementsLoading] = useState(false);
  const [elementsSearch, setElementsSearch] = useState("");
  const [elementsCategory, setElementsCategory] = useState("Toate");
  const [elementsFilter, setElementsFilter] = useState<"all" | "empty" | "proposed">("all");
  const [showAddElement, setShowAddElement] = useState(false);
  const [newElKey, setNewElKey] = useState("");
  const [newElLabel, setNewElLabel] = useState("");
  const [newElValue, setNewElValue] = useState("");
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  // Linked companies
  const [linkedCompanies, setLinkedCompanies] = useState<any[]>([]);
  const [linkedLoading, setLinkedLoading] = useState(false);
  const [linkedLoaded, setLinkedLoaded] = useState(false);
  const [linkedAnalyzing, setLinkedAnalyzing] = useState(false);
  const [showAddManual, setShowAddManual] = useState(false);
  const [manualForm, setManualForm] = useState({ linkedName: "", personName: "", personRoleMain: "", notes: "", linkedCui: "" });

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
      // Year is auto-detected from PDF by AI — no manual selection needed
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

  // Fetch company elements when Elemente tab activates
  const fetchElements = useCallback(async () => {
    if (!id) return;
    setElementsLoading(true);
    try {
      const data = await apiGet(`/api/companies/${id}/elements`);
      setElementsData(data);
    } catch { setElementsData(null); }
    finally { setElementsLoading(false); }
  }, [id]);

  useEffect(() => {
    if (activeTab === "Elemente" && !elementsData) fetchElements();
  }, [activeTab, elementsData, fetchElements]);

  // Pre-eligibility removed — now handled by Solomon Q2 in project context

  // Element CRUD handlers
  const handleSaveElement = async (key: string, value: string, source: string = "manual") => {
    try {
      await apiPut(`/api/companies/${id}/elements`, { elementKey: key, value: value || null, source });
      await fetchElements();
    } catch (err: any) { alert(err.message || "Eroare la salvare"); }
  };

  const handleAddElement = async () => {
    if (!newElKey.trim()) return;
    await handleSaveElement(newElKey.trim(), newElValue.trim());
    setNewElKey(""); setNewElLabel(""); setNewElValue(""); setShowAddElement(false);
  };

  const handleDeleteElement = async (elementId: string) => {
    if (!confirm("Sigur doriti sa stergeti acest element?")) return;
    try {
      await apiDelete(`/api/companies/${id}/elements/${elementId}`);
      await fetchElements();
    } catch (err: any) { alert(err.message || "Eroare la stergere"); }
  };

  // Filtered elements for UI
  const filteredElements = (elementsData?.elements || []).filter((el: any) => {
    if (elementsCategory !== "Toate" && (elementsData?.fieldCategories?.[el.category]?.label || "Custom") !== elementsCategory) return false;
    if (elementsFilter === "empty" && el.value) return false;
    if (elementsFilter === "proposed" && el.autoPopulated) return false;
    if (elementsSearch) {
      const q = elementsSearch.toLowerCase();
      return el.elementKey.toLowerCase().includes(q) || (el.label || "").toLowerCase().includes(q) || (el.value || "").toLowerCase().includes(q);
    }
    return true;
  });

  // Category counts
  const categoryCounts = (elementsData?.elements || []).reduce((acc: Record<string, number>, el: any) => {
    const catLabel = elementsData?.fieldCategories?.[el.category]?.label || "Custom";
    acc[catLabel] = (acc[catLabel] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const totalCount = (elementsData?.elements || []).length;

  const sel = detail;
  const tabs = sel ? getCompanyTabs(sel.forma) : [];

  // Fetch linked companies when tab activates
  useEffect(() => {
    if (activeTab === "Firme legate" && !linkedLoaded && sel) {
      setLinkedLoading(true);
      apiGet(`/api/companies/${sel.id}/linked-companies`)
        .then((data: any[]) => { setLinkedCompanies(data); setLinkedLoaded(true); })
        .catch(() => setLinkedLoaded(true))
        .finally(() => setLinkedLoading(false));
    }
  }, [activeTab, linkedLoaded, sel]);

  return (
    <div className="flex flex-col h-full overflow-hidden animate-[fadeIn_.2s_ease-out]">
      <style>{`
        .cd-info{padding:14px 20px;border-radius:12px;border:1px solid rgba(226,232,240,.7);background:#ffffff;transition:all .2s}
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
        .cd-card{padding:14px 20px;border-radius:12px;border:1px solid rgba(226,232,240,.7);background:#ffffff;transition:all .2s}
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
          <div className="skeleton" style={{ height: 40, borderRadius: 12 }} />
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
          <BtnSecondary size="sm" icon={<IconRefresh />} onClick={handleSyncOnrc}>Actualizare CUI</BtnSecondary>
          <BtnSecondary size="sm" icon={<IconUpload />} onClick={() => setShowOnrcUpload(true)}>Reîncarcă certificat</BtnSecondary>
          <BtnSecondary size="sm" icon={<IconUpload />} onClick={() => setShowBilantUpload(true)}>Upload bilanț</BtnSecondary>
          <BtnDanger size="sm" icon={<IconTrash />} onClick={handleDelete}>Șterge firma</BtnDanger>
        </PageHeader>

        {/* GAP 7: Insolvency/restriction banner */}
        {(sel.stare === "dizolvata" || sel.stare === "lichidare" || sel.stare === "radiata") && (
          <div style={{ maxWidth: 1152, margin: "0 auto", padding: "12px 32px" }}>
            <div style={{ padding: "12px 16px", borderRadius: 12, background: "rgba(248,113,113,.08)", border: "1px solid rgba(248,113,113,.3)", display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "#dc2626" }}>
              <span style={{ fontSize: 20 }}>{"\u26A0"}</span>
              <div>
                <strong>Aten&#539;ie:</strong> Aceast&#259; firm&#259; are statut{" "}
                <strong>{sel.stare === "dizolvata" ? "dizolvată" : sel.stare === "lichidare" ? "în lichidare" : "radiată"}</strong>.
                {" "}Nu este eligibil&#259; pentru finan&#539;are.
              </div>
            </div>
          </div>
        )}

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
                <div className="cd-info-sub">{sel.caenDesc !== "\u2014" ? sel.caenDesc : getCaenDescription(sel.caen) || "\u2014"}</div>
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
              {sel.platitorTVA && (
                <div className="cd-info">
                  <div className="cd-info-label">Platitor TVA</div>
                  <div className="cd-info-value">{sel.platitorTVA}</div>
                </div>
              )}
              {sel.dataInfiintare && (
                <div className="cd-info">
                  <div className="cd-info-label">Data infiintare</div>
                  <div className="cd-info-value">{sel.dataInfiintare}</div>
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
              <div style={{ fontSize: 15, fontWeight: 600, color: "#0f172a" }}>{sel.caenDesc !== "\u2014" ? sel.caenDesc : getCaenDescription(sel.caen) || "\u2014"}</div>
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
                    <span style={{ fontSize: 13, color: "#0f172a" }}>{a.den || getCaenDescription(a.cod) || a.cod}</span>
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
                {/* GAP 22: Financial trend chart */}
                {sel.situatiiFinanciare.length >= 2 && (() => {
                  const sorted = [...sel.situatiiFinanciare].sort((a: any, b: any) => a.an - b.an);
                  const years = sorted.map((s: any) => s.an);
                  const revenues = sorted.map((s: any) => Number(s.cifraAfaceri) || 0);
                  const profits = sorted.map((s: any) => Number(s.profitNet) || 0);
                  const allVals = [...revenues, ...profits];
                  const maxVal = Math.max(...allVals, 1);
                  const minVal = Math.min(...allVals, 0);
                  const range = maxVal - minVal || 1;
                  const W = 440, H = 160, PL = 10, PR = 10, PT = 10, PB = 25;
                  const chartW = W - PL - PR, chartH = H - PT - PB;
                  const toX = (i: number) => PL + (i / (years.length - 1)) * chartW;
                  const toY = (v: number) => PT + chartH - ((v - minVal) / range) * chartH;
                  const makePath = (vals: number[]) => vals.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
                  return (
                    <div className="cd-card" style={{ padding: 16, marginTop: 16, marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#64748b", marginBottom: 12, display: "flex", alignItems: "center", gap: 16 }}>
                        Evoluție financiară
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: "#2563eb" }}>
                          <span style={{ width: 12, height: 2, background: "#2563eb", borderRadius: 1 }} /> Cifra afaceri
                        </span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: profits[profits.length - 1] >= 0 ? "#059669" : "#dc2626" }}>
                          <span style={{ width: 12, height: 2, background: profits[profits.length - 1] >= 0 ? "#059669" : "#dc2626", borderRadius: 1 }} /> Profit net
                        </span>
                      </div>
                      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W }}>
                        {/* Zero line if needed */}
                        {minVal < 0 && <line x1={PL} y1={toY(0)} x2={W - PR} y2={toY(0)} stroke="#e2e8f0" strokeWidth={1} strokeDasharray="4,3" />}
                        {/* Revenue line */}
                        <path d={makePath(revenues)} fill="none" stroke="#2563eb" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                        {revenues.map((v, i) => <circle key={`r${i}`} cx={toX(i)} cy={toY(v)} r={3} fill="#2563eb" />)}
                        {/* Profit line */}
                        <path d={makePath(profits)} fill="none" stroke={profits[profits.length - 1] >= 0 ? "#059669" : "#dc2626"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                        {profits.map((v, i) => <circle key={`p${i}`} cx={toX(i)} cy={toY(v)} r={3} fill={v >= 0 ? "#059669" : "#dc2626"} />)}
                        {/* Year labels */}
                        {years.map((y: number, i: number) => (
                          <text key={y} x={toX(i)} y={H - 4} textAnchor="middle" fontSize={10} fill="#94a3b8" fontFamily="'JetBrains Mono', monospace">{y}</text>
                        ))}
                      </svg>
                    </div>
                  );
                })()}
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
                <BtnSecondary size="sm" icon={<IconUpload />} onClick={() => setShowBilantUpload(true)}>Upload bilanț</BtnSecondary>
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
                    {anafData.map((s: any, i: number) => {
                      const rowRaw = (detail?.financials || []).find((f: any) => f.source === "anaf_upload" && f.year === s.an);
                      return (
                      <tr
                        key={i}
                        className={`clickable ${s.an === viewYear ? "active" : ""}`}
                        onClick={() => setSelectedBilantYear(s.an)}
                      >
                        <td style={{ fontWeight: s.an === viewYear ? 700 : 500 }} className="name">{s.an}</td>
                        <td className="right mono">{fmtLei(s.cifraAfaceri)}</td>
                        <td className="right" style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums", color: (s.profitNet ?? 0) >= 0 ? "#059669" : "#dc2626" }}>{fmtLei(s.profitNet)}</td>
                        <td className="right mono">{fmtLei(rowRaw?.f20?.profitExploatare ?? rowRaw?.f20?.rezultatExploatare)}</td>
                        <td className="right mono">{s.angajati ?? "\u2014"}</td>
                        {isSOC(sel.forma) && <td className="right mono">{fmtLei(s.capitaluriProprii)}</td>}
                      </tr>
                      );
                    })}
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
                    { label: "Rezultat exploatare", value: fmtLei(f20.profitExploatare ?? f20.rezultatExploatare), color: (f20.profitExploatare ?? f20.rezultatExploatare ?? 0) >= 0 },
                    { label: "Cheltuieli materiale", value: fmtLei(f20.cheltuieliMatPrim) },
                    { label: "Cheltuieli personal", value: fmtLei(f20.cheltuieliPersonal) },
                    { label: "Venituri financiare", value: fmtLei(f20.venituriFinanciare) },
                    { label: "Cheltuieli financiare", value: fmtLei(f20.cheltuieliFinanciare) },
                    { label: "Venituri totale", value: fmtLei(f20.venituriTotale) },
                    { label: "Cheltuieli totale", value: fmtLei(f20.cheltuieliTotale) },
                    { label: "Rezultat brut", value: fmtLei(f20.profitBrut ?? f20.rezultatBrut), color: (f20.profitBrut ?? f20.rezultatBrut ?? 0) >= 0 },
                    { label: "Impozit profit", value: fmtLei(f20.impozitProfit) },
                    { label: "Rezultat net", value: fmtLei(f20.profitNet), color: (f20.profitNet ?? 0) >= 0 },
                  ].filter(item => item.value !== "\u2014").map(item => (
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
                    { label: "Active imobilizate", value: fmtLei(f10.activeImobilizate?.total ?? f10.activeImobilizate) },
                    { label: "  - Necorporale", value: fmtLei(f10.activeImobilizate?.necorporale) },
                    { label: "  - Corporale", value: fmtLei(f10.activeImobilizate?.corporale) },
                    { label: "  - Financiare", value: fmtLei(f10.activeImobilizate?.financiare) },
                    { label: "Active circulante", value: fmtLei(f10.activeCirculante?.total ?? f10.activeCirculante) },
                    { label: "  - Stocuri", value: fmtLei(f10.activeCirculante?.stocuri ?? f10.stocuri) },
                    { label: "  - Creante", value: fmtLei(f10.activeCirculante?.creante ?? f10.creante) },
                    { label: "  - Casa si conturi", value: fmtLei(f10.activeCirculante?.casa ?? f10.casaSiConturi) },
                    { label: "Cheltuieli in avans", value: fmtLei(f10.cheltuieliAvans) },
                    { label: "Datorii sub 1 an", value: fmtLei(f10.datoriiSubAnul ?? f10.datoriiSub1An) },
                    { label: "Datorii peste 1 an", value: fmtLei(f10.datoriiPesteAnul ?? f10.datoriiPeste1An) },
                    { label: "Venituri in avans", value: fmtLei(f10.venituriAvans) },
                    { label: "Capital subscris varsat", value: fmtLei(f10.capital?.subscrisVarsat) },
                    { label: "Rezerve", value: fmtLei(f10.capital?.rezerve) },
                    { label: "Profit reportat", value: fmtLei(f10.capital?.profitReportat) },
                    { label: "Profit exercitiu", value: fmtLei(f10.capital?.profitExercitiu) },
                    { label: "Capitaluri proprii", value: fmtLei(f10.capitaluriProprii), color: (f10.capitaluriProprii ?? 0) >= 0 },
                  ].filter(item => item.value !== "\u2014").map(item => (
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

          {/* BIBLIOTECA ELEMENTE */}
          {activeTab === "Elemente" && (<>
            <SectionTitle>Biblioteca Elemente</SectionTitle>
            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16, lineHeight: 1.6 }}>
              Toate datele companiei disponibile pentru verificarea regulilor de eligibilitate. Elementele se populeaza automat din ONRC si bilant, dar pot fi adaugate/editate manual.
            </p>

            {/* Search + category filters + action buttons */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 16 }}>
              <div style={{ position: "relative", flex: "0 1 220px" }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 14 }}>&#x1F50D;</span>
                <input
                  type="text"
                  placeholder="Cauta element..."
                  value={elementsSearch}
                  onChange={e => setElementsSearch(e.target.value)}
                  className="cd-input"
                  style={{ paddingLeft: 32, fontSize: 13, height: 34 }}
                />
              </div>
              {/* Category pills */}
              {[
                { label: "Toate", count: totalCount },
                ...Object.entries(categoryCounts).sort(([a], [b]) => {
                  const order = ["Solicitant", "Financiar", "Exploatatie", "Locatie", "Documente", "Tehnic", "Persoane", "Custom"];
                  return order.indexOf(a) - order.indexOf(b);
                }).map(([label, count]) => ({ label, count })),
              ].map(({ label, count }) => (
                <button
                  key={label}
                  onClick={() => setElementsCategory(label)}
                  style={{
                    padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: "1px solid",
                    cursor: "pointer", transition: "all .15s", whiteSpace: "nowrap",
                    background: elementsCategory === label ? "#3b82f6" : "#fff",
                    color: elementsCategory === label ? "#fff" : "#475569",
                    borderColor: elementsCategory === label ? "#3b82f6" : "#e2e8f0",
                  }}
                >
                  {label} <span style={{ opacity: 0.8, fontWeight: 400 }}>{count as number}</span>
                </button>
              ))}

              {/* Spacer */}
              <div style={{ flex: 1 }} />

              {/* Filter toggles */}
              <button
                onClick={() => setElementsFilter(elementsFilter === "empty" ? "all" : "empty")}
                style={{
                  padding: "5px 12px", borderRadius: 20, fontSize: 12, border: "1px solid",
                  cursor: "pointer", transition: "all .15s",
                  background: elementsFilter === "empty" ? "#fef3c7" : "#fff",
                  color: elementsFilter === "empty" ? "#92400e" : "#64748b",
                  borderColor: elementsFilter === "empty" ? "#fde68a" : "#e2e8f0",
                }}
              >
                &#x25CB; Goale
              </button>
              <button
                onClick={() => setElementsFilter(elementsFilter === "proposed" ? "all" : "proposed")}
                style={{
                  padding: "5px 12px", borderRadius: 20, fontSize: 12, border: "1px solid",
                  cursor: "pointer", transition: "all .15s",
                  background: elementsFilter === "proposed" ? "#fef3c7" : "#fff",
                  color: elementsFilter === "proposed" ? "#92400e" : "#64748b",
                  borderColor: elementsFilter === "proposed" ? "#fde68a" : "#e2e8f0",
                }}
              >
                &#x26A0; Propuse
              </button>
              <button
                onClick={() => setShowAddElement(!showAddElement)}
                style={{
                  padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: "1px solid #f97316",
                  cursor: "pointer", background: showAddElement ? "#f97316" : "#fff",
                  color: showAddElement ? "#fff" : "#f97316", transition: "all .15s",
                }}
              >
                + Adauga
              </button>
            </div>

            {/* Add new element form */}
            {showAddElement && (
              <div className="cd-card" style={{ marginBottom: 16, padding: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", marginBottom: 12 }}>Element nou</div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <input
                    type="text"
                    placeholder="Cheie (ex: nr_angajati)"
                    value={newElKey}
                    onChange={e => setNewElKey(e.target.value)}
                    className="cd-input"
                    style={{ flex: "1 1 280px", fontSize: 13 }}
                  />
                  <input
                    type="text"
                    placeholder="Eticheta (ex: Numar angajati)"
                    value={newElLabel}
                    onChange={e => setNewElLabel(e.target.value)}
                    className="cd-input"
                    style={{ flex: "1 1 280px", fontSize: 13 }}
                  />
                </div>
                <div style={{ marginTop: 10 }}>
                  <input
                    type="text"
                    placeholder="Valoare (optional)"
                    value={newElValue}
                    onChange={e => setNewElValue(e.target.value)}
                    className="cd-input"
                    style={{ width: "100%", fontSize: 13 }}
                    onKeyDown={e => { if (e.key === "Enter") handleAddElement(); }}
                  />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <BtnPrimary onClick={handleAddElement} disabled={!newElKey.trim()}>Salveaza</BtnPrimary>
                  <BtnSecondary onClick={() => { setShowAddElement(false); setNewElKey(""); setNewElLabel(""); setNewElValue(""); }}>Anuleaza</BtnSecondary>
                </div>
              </div>
            )}

            {/* Elements table */}
            {elementsLoading ? (
              <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>Se incarca...</div>
            ) : filteredElements.length === 0 ? (
              <EmptyState
                icon="&#x1F4CB;"
                title="Niciun element gasit"
                description={elementsSearch ? "Incearca un alt termen de cautare." : "Nu exista elemente in aceasta categorie."}
              />
            ) : (
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                      <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 600, color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>Cheie</th>
                      <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 600, color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>Eticheta</th>
                      <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 600, color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>Valoare</th>
                      <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 600, color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", width: 90 }}>Sursa</th>
                      <th style={{ width: 70 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredElements.map((el: any) => (
                      <tr key={el.id} style={{ borderBottom: "1px solid #f1f5f9", transition: "background .1s" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#f8fafc")}
                        onMouseLeave={e => (e.currentTarget.style.background = "")}
                      >
                        <td style={{ padding: "8px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#3b82f6" }}>{el.elementKey}</td>
                        <td style={{ padding: "8px 14px", color: "#0f172a" }}>{el.label}</td>
                        <td style={{ padding: "8px 14px" }}>
                          {editingElementId === el.id ? (
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <input
                                type="text"
                                value={editingValue}
                                onChange={e => setEditingValue(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === "Enter") { handleSaveElement(el.elementKey, editingValue); setEditingElementId(null); }
                                  if (e.key === "Escape") setEditingElementId(null);
                                }}
                                className="cd-input"
                                style={{ fontSize: 12, padding: "3px 8px", width: "100%" }}
                                autoFocus
                              />
                              <button
                                onClick={() => { handleSaveElement(el.elementKey, editingValue); setEditingElementId(null); }}
                                style={{ background: "#10b981", color: "#fff", border: "none", borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}
                              >OK</button>
                              <button
                                onClick={() => setEditingElementId(null)}
                                style={{ background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontSize: 11 }}
                              >&#x2715;</button>
                            </div>
                          ) : (
                            <span
                              onClick={() => { setEditingElementId(el.id); setEditingValue(el.value || ""); }}
                              style={{ cursor: "pointer", color: el.value ? "#0f172a" : "#cbd5e1", fontStyle: el.value ? "normal" : "italic", padding: "2px 0", display: "block" }}
                              title="Click pentru a edita"
                            >
                              {el.value || "— gol —"}{el.unit ? ` ${el.unit}` : ""}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "8px 14px" }}>
                          <span style={{
                            fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em",
                            padding: "2px 8px", borderRadius: 10,
                            background: el.source === "manual" || el.source === "consultant_manual" ? "#ede9fe" :
                              el.source === "calculated" || el.source === "derived" ? "#fef3c7" : "#e0f2fe",
                            color: el.source === "manual" || el.source === "consultant_manual" ? "#6d28d9" :
                              el.source === "calculated" || el.source === "derived" ? "#92400e" : "#0369a1",
                          }}>
                            {el.source}
                          </span>
                        </td>
                        <td style={{ padding: "8px 14px", textAlign: "center" }}>
                          {!el.autoPopulated && (
                            <button
                              onClick={() => handleDeleteElement(el.id)}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "#cbd5e1", fontSize: 14, padding: 4, transition: "color .15s" }}
                              onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
                              onMouseLeave={e => (e.currentTarget.style.color = "#cbd5e1")}
                              title="Sterge element"
                            >
                              <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>)}

          {/* FIRME LEGATE */}
          {activeTab === "Firme legate" && sel && (<>
            <SectionTitle>Firme legate</SectionTitle>
            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16, lineHeight: 1.6 }}>
              Verificare automata a conexiunilor prin asociati si administratori comuni cu alte firme.
              Rezultatele sunt folosite la evaluarea eligibilitatii (IMM consolidat, conditii artificiale).
            </p>

            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              <button
                style={{ padding: "10px 20px", borderRadius: 8, background: "#2563eb", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none", opacity: linkedAnalyzing ? 0.5 : 1 }}
                disabled={linkedAnalyzing}
                onClick={async () => {
                  if (!confirm(`Verificarea va interoga ListaFirme.ro pentru fiecare asociat/administrator. Cost estimat: ~${(detail?.associates?.length || 3) + 1} credite API. Continuati?`)) return;
                  setLinkedAnalyzing(true);
                  try {
                    const result = await apiPost(`/api/companies/${sel.id}/linked-companies/analyze`, {});
                    setLinkedCompanies((result as any).links?.map((l: any, i: number) => ({ id: `temp-${i}`, ...l })) || []);
                    setLinkedLoaded(true);
                    alert(`Verificare completa: ${(result as any).companiesFound} firme legate gasite, ${(result as any).creditsUsed} credite folosite.`);
                  } catch (err: any) {
                    alert(err.message || "Eroare la verificare");
                  } finally {
                    setLinkedAnalyzing(false);
                    // Reload from DB
                    const data = await apiGet(`/api/companies/${sel.id}/linked-companies`).catch(() => []);
                    setLinkedCompanies(data);
                  }
                }}
              >
                {linkedAnalyzing ? "Verificare in curs..." : "Verifica firme legate"}
              </button>
              <button
                style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#0f172a", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                onClick={() => setShowAddManual(true)}
              >
                + Adauga manual
              </button>
            </div>

            {/* Manual add form */}
            {showAddManual && (
              <div style={{ marginBottom: 20, padding: 16, borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff" }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Adauga conexiune manuala</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>Firma legata *</label>
                    <input style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13 }} placeholder="Denumire firma..." value={manualForm.linkedName} onChange={e => setManualForm(p => ({ ...p, linkedName: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>CUI (optional)</label>
                    <input style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13 }} placeholder="CUI..." value={manualForm.linkedCui} onChange={e => setManualForm(p => ({ ...p, linkedCui: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>Persoana legatura *</label>
                    <input style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13 }} placeholder="Nume persoana..." value={manualForm.personName} onChange={e => setManualForm(p => ({ ...p, personName: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>Relatie</label>
                    <input style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13 }} placeholder="sot/sotie, frate, administrator..." value={manualForm.personRoleMain} onChange={e => setManualForm(p => ({ ...p, personRoleMain: e.target.value }))} />
                  </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>Note</label>
                  <textarea style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13, minHeight: 60 }} placeholder="Detalii suplimentare..." value={manualForm.notes} onChange={e => setManualForm(p => ({ ...p, notes: e.target.value }))} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    style={{ padding: "8px 16px", borderRadius: 6, background: "#2563eb", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none" }}
                    disabled={!manualForm.linkedName || !manualForm.personName}
                    onClick={async () => {
                      try {
                        await apiPost(`/api/companies/${sel.id}/linked-companies/manual`, manualForm);
                        setShowAddManual(false);
                        setManualForm({ linkedName: "", personName: "", personRoleMain: "", notes: "", linkedCui: "" });
                        const data = await apiGet(`/api/companies/${sel.id}/linked-companies`);
                        setLinkedCompanies(data);
                      } catch (err: any) {
                        alert(err.message);
                      }
                    }}
                  >
                    Adauga
                  </button>
                  <button style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #e2e8f0", background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }} onClick={() => setShowAddManual(false)}>
                    Anuleaza
                  </button>
                </div>
              </div>
            )}

            {/* Results table */}
            {linkedLoading && <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>Se incarca...</div>}
            {!linkedLoading && linkedCompanies.length === 0 && linkedLoaded && (
              <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>&#x1F517;</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Nicio firma legata detectata</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Apasati "Verifica firme legate" pentru a scana conexiunile prin asociati si administratori.</div>
              </div>
            )}
            {linkedCompanies.length > 0 && (
              <div style={{ borderRadius: 10, border: "1px solid #e2e8f0", overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 0.8fr 0.6fr 80px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  {["Firma legata", "Persoana conexiune", "CAEN / Judet", "Risc", "Status"].map(h => (
                    <div key={h} style={{ padding: "10px 14px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "#94a3b8" }}>{h}</div>
                  ))}
                </div>
                {linkedCompanies.map((lc: any) => {
                  const riskColor = lc.riskScore >= 60 ? "#dc2626" : lc.riskScore >= 30 ? "#d97706" : "#059669";
                  const riskBg = lc.riskScore >= 60 ? "rgba(220,38,38,.08)" : lc.riskScore >= 30 ? "rgba(217,119,6,.08)" : "rgba(5,150,105,.08)";
                  return (
                    <div key={lc.id} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 0.8fr 0.6fr 80px", borderBottom: "1px solid #f1f5f9", alignItems: "center", opacity: lc.dismissed ? 0.4 : 1 }}>
                      <div style={{ padding: "12px 14px" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{lc.linkedName}</div>
                        <div style={{ fontSize: 11, color: "#64748b", fontFamily: "'JetBrains Mono', monospace" }}>{lc.linkedCui || "—"}</div>
                        {lc.linkedStatus && <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{lc.linkedStatus}</div>}
                      </div>
                      <div style={{ padding: "12px 14px" }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{lc.personName}</div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>{lc.personRoleMain || ""}{lc.personSharesMain ? ` (${lc.personSharesMain}%)` : ""}</div>
                        {lc.personRoleLinked && <div style={{ fontSize: 10, color: "#94a3b8" }}>In firma legata: {lc.personRoleLinked}{lc.personSharesLinked ? ` (${lc.personSharesLinked}%)` : ""}</div>}
                      </div>
                      <div style={{ padding: "12px 14px" }}>
                        <div style={{ fontSize: 12, color: "#0f172a" }}>{lc.linkedNace || "—"}</div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>{lc.linkedCounty || "—"}</div>
                      </div>
                      <div style={{ padding: "12px 14px" }}>
                        <div style={{ display: "inline-flex", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, color: riskColor, background: riskBg }}>
                          {lc.riskScore}
                        </div>
                        {Array.isArray(lc.riskFlags) && lc.riskFlags.length > 0 && (
                          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4, lineHeight: 1.4 }}>
                            {lc.riskFlags.slice(0, 2).join("; ")}
                          </div>
                        )}
                      </div>
                      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
                        {lc.dismissed ? (
                          <span style={{ fontSize: 10, color: "#94a3b8", fontStyle: "italic" }}>Exclus</span>
                        ) : lc.confirmed ? (
                          <span style={{ fontSize: 10, color: "#059669", fontWeight: 700 }}>&#x2713; Confirmat</span>
                        ) : (
                          <>
                            <button
                              style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid #059669", background: "transparent", color: "#059669", fontSize: 10, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                              title="Confirmă — aceeași persoană"
                              onClick={async () => {
                                await (api as any)(`/api/companies/${sel.id}/linked-companies/${lc.id}`, { method: "PATCH", body: JSON.stringify({ confirmed: true }) }).catch(() => {});
                                setLinkedCompanies(prev => prev.map(x => x.id === lc.id ? { ...x, confirmed: true, dismissed: false } : x));
                              }}
                            >
                              &#x2713;
                            </button>
                            <button
                              style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid #94a3b8", background: "transparent", color: "#94a3b8", fontSize: 10, cursor: "pointer", whiteSpace: "nowrap" }}
                              title="Nu e aceeași persoană"
                              onClick={async () => {
                                await (api as any)(`/api/companies/${sel.id}/linked-companies/${lc.id}`, { method: "PATCH", body: JSON.stringify({ dismissed: true }) }).catch(() => {});
                                setLinkedCompanies(prev => prev.map(x => x.id === lc.id ? { ...x, dismissed: true, confirmed: false } : x));
                              }}
                            >
                              &#x2715;
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {linkedCompanies.length > 0 && (
              <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: "#f0f7ff", border: "1px solid rgba(37,99,235,.15)", fontSize: 12, color: "#334155", lineHeight: 1.5 }}>
                <strong>Nota:</strong> Verificarea automata detecteaza doar conexiuni prin nume identice.
                Relatiile de rudenie (sot/sotie, frati), suprapunerea terenurilor APIA si proiectele AFIR existente
                trebuie adaugate manual de consultant folosind butonul "Adauga manual".
              </div>
            )}
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
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.style.borderColor = "#2563eb"; e.currentTarget.style.background = "rgba(37,99,235,.05)"; }}
              onDragLeave={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = ""; e.currentTarget.style.background = ""; }}
              onDrop={(e) => {
                e.preventDefault(); e.stopPropagation();
                e.currentTarget.style.borderColor = ""; e.currentTarget.style.background = "";
                const file = e.dataTransfer.files?.[0];
                if (file && file.type === "application/pdf" && onrcFileRef.current) {
                  const dt = new DataTransfer(); dt.items.add(file);
                  onrcFileRef.current.files = dt.files;
                  setOnrcFileName(file.name);
                }
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 6 }}>{onrcFileName ? "\u2705" : "\ud83d\udcc4"}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{onrcFileName || "Certificat constatator (PDF)"}</div>
              <div style={{ fontSize: 12, marginTop: 4, color: "#94a3b8" }}>Trage fisierul aici sau click pentru a selecta</div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <BtnSecondary onClick={() => setShowOnrcUpload(false)}>Anuleaza</BtnSecondary>
              <BtnPrimary icon={<IconUpload />} disabled={onrcUploading} onClick={handleOnrcUpload}>
                {onrcUploading ? "Se procesează..." : "Actualizează datele"}
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
              Incarca un bilant ANAF (PDF descarcat din SPV). Se accepta Formularul 10 (bilant), Formularul 20 (cont profit/pierderi), Formularul 30/40. Anul fiscal si datele financiare se detecteaza automat.
            </p>
            <input type="file" ref={bilantFileRef} accept=".pdf" className="hidden" onChange={() => { setBilantFileName(bilantFileRef.current?.files?.[0]?.name || null); }} />
            <div
              className="cd-drop-zone"
              onClick={() => bilantFileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.style.borderColor = "#2563eb"; e.currentTarget.style.background = "rgba(37,99,235,.05)"; }}
              onDragLeave={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = ""; e.currentTarget.style.background = ""; }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.style.borderColor = "";
                e.currentTarget.style.background = "";
                const file = e.dataTransfer.files?.[0];
                if (file && file.type === "application/pdf") {
                  const dt = new DataTransfer();
                  dt.items.add(file);
                  if (bilantFileRef.current) {
                    bilantFileRef.current.files = dt.files;
                    setBilantFileName(file.name);
                  }
                }
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 6 }}>{bilantFileName ? "\u2705" : "\ud83d\udcca"}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{bilantFileName || "Bilant ANAF (PDF)"}</div>
              <div style={{ fontSize: 12, marginTop: 4, color: "#94a3b8" }}>Trage fisierul aici sau click pentru a selecta</div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <BtnSecondary onClick={() => setShowBilantUpload(false)}>Anuleaza</BtnSecondary>
              <BtnPrimary icon={<IconUpload />} disabled={bilantUploading} onClick={handleBilantUpload}>
                {bilantUploading ? "Se procesează..." : "Extrage date financiare"}
              </BtnPrimary>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
