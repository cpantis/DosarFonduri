"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { isSOC, isPF, FORME_JURIDICE, getCompanyTabs, getFieldLabel } from "@/hooks/useFormaJuridica";
import { apiGet, apiPost, apiDelete, api } from "@/lib/api";

/* ═══ HELPERS ═══ */
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
  const day = d.getDate();
  const months = ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "nov", "dec"];
  return `${day} ${months[d.getMonth()]}, ${hh}:${mm}`;
};

/** Map API company detail to the shapes expected by JSX */
const mapDetail = (d: any) => {
  const raw = d.onrcRawData || {};
  // Map financials → situatiiFinanciare
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

  // Map associates
  const asociatiPF = (d.asociatiPF || []).map((a: any) => ({
    nume: a.name,
    calitate: a.role || a.tipAsociat || "asociat",
    cetatenie: a.citizenshipOrCountry || "\u2014",
    aport: a.contribution || "\u2014",
    partiSociale: a.shares ?? null,
    actiuni: a.shares ?? null,
    cotaBeneficii: a.pctBenefits ?? 0,
    cotaPierderi: a.pctLosses ?? 0,
  }));
  const asociatiPJ = (d.asociatiPJ || []).map((a: any) => ({
    denumire: a.name,
    calitate: a.role || a.tipAsociat || "asociat",
    tara: a.citizenshipOrCountry || "\u2014",
    cui: a.cui || "\u2014",
    aport: a.contribution || "\u2014",
    actiuni: a.shares ?? null,
    cotaBeneficii: a.pctBenefits ?? 0,
    cotaPierderi: a.pctLosses ?? 0,
  }));
  const administratori = (d.administratori || []).map((a: any) => ({
    nume: a.name,
    functie: a.role || "administrator",
    puteri: a.powers || "\u2014",
    durataMandatLabel: a.mandateDuration || "\u2014",
    dataNumirii: a.appointmentDate || "\u2014",
  }));
  const membriIF = (d.ifMembers || []).map((m: any) => ({
    nume: m.name,
    calitate: m.role || "membru",
    gradRudenie: m.kinship || "\u2014",
    cetatenie: m.citizenshipOrCountry || "\u2014",
  }));

  return {
    ...d,
    forma: d.formaJuridica || "SRL",
    caenDesc: raw.caenDesc || raw.caen_desc || "\u2014",
    activitatiSecundare: raw.activitatiSecundare || raw.activitati_secundare || [],
    sediiSecundare: raw.sediiSecundare || raw.sedii_secundare || [],
    insolventa: raw.insolventa ?? false,
    dizolvare: raw.dizolvare ?? false,
    lichidare: raw.lichidare ?? false,
    restrictii: raw.restrictii ?? false,
    titular: raw.titular || null,
    cenzori: raw.cenzori || null,
    ultimaMentiune: raw.ultimaMentiune || raw.ultima_mentiune || "\u2014",
    natura: d.naturaCapital || null,
    situatiiFinanciare,
    asociatiPF,
    asociatiPJ,
    administratori,
    membriIF,
  };
};

/* ═══ COMPONENT ═══ */
export default function CompaniesPage() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState("auto");
  const [addForma, setAddForma] = useState("SRL");
  const [cui, setCui] = useState("");
  const [cuiLoad, setCuiLoad] = useState(false);
  const [cuiRes, setCuiRes] = useState<{ denumire: string; adresa: string; caen: string; stare: string } | "error" | null>(null);
  const [detailTab, setDetailTab] = useState("General");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // CUI search suggestions from ListaFirme.ro
  const [cuiSearchResults, setCuiSearchResults] = useState<any[]>([]);
  const [cuiSearching, setCuiSearching] = useState(false);
  const cuiSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ONRC upload for existing company
  const [showOnrcUpload, setShowOnrcUpload] = useState(false);
  const [onrcUploading, setOnrcUploading] = useState(false);
  const onrcFileRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const fetchDetail = useCallback(async (id: string) => {
    try {
      setDetailLoading(true);
      const data = await apiGet(`/api/companies/${id}`);
      setDetail(mapDetail(data));
    } catch (err: any) {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected) {
      fetchDetail(selected);
    } else {
      setDetail(null);
    }
  }, [selected, fetchDetail]);

  const filtered = companies.filter(f => {
    const forma = f.formaJuridica || "";
    if (filter === "activ" && f.stare === "radiata") return false;
    if (filter === "radiat" && f.stare !== "radiata") return false;
    if (filter === "soc" && !isSOC(forma)) return false;
    if (filter === "pf" && !isPF(forma)) return false;
    if (search) {
      const q = search.toLowerCase();
      return (f.denumire || "").toLowerCase().includes(q) || (f.cui || "").toLowerCase().includes(q) || (f.caen || "").includes(q) || (f.judet || "").toLowerCase().includes(q) || forma.toLowerCase().includes(q);
    }
    return true;
  });

  const sel = detail;
  const tabs = sel ? getCompanyTabs(sel.forma) : [];

  const checkCui = async () => {
    const cleanCui = cui.replace(/\D/g, "");
    if (cleanCui.length < 6) return;
    setCuiLoad(true);
    setCuiRes(null);
    try {
      const result = await apiPost<any>("/api/companies", { cui: cleanCui, mode: "auto" });
      setCuiRes({
        denumire: result.denumire || result.name || "Firma adaugata",
        adresa: result.adresa || "\u2014",
        caen: result.caen || "\u2014",
        stare: result.stare || "ACTIV",
      });
      await fetchCompanies();
      // Auto-select the newly created company
      if (result.id) {
        setSelected(result.id);
        setDetailTab("General");
      }
    } catch (err: any) {
      setCuiRes("error");
    } finally {
      setCuiLoad(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Sigur doriti sa stergeti aceasta firma?")) return;
    try {
      await apiDelete(`/api/companies/${id}`);
      setSelected(null);
      setDetail(null);
      await fetchCompanies();
    } catch (err: any) {
      alert("Eroare la stergere: " + (err.message || "Eroare necunoscuta"));
    }
  };

  const handleSyncOnrc = async (id: string) => {
    try {
      await apiPost(`/api/companies/${id}/sync-onrc`, {});
      await fetchDetail(id);
    } catch (err: any) {
      alert("Eroare la sincronizare: " + (err.message || "Eroare necunoscuta"));
    }
  };

  const handleManualUpload = async () => {
    if (!uploadFile) return;
    setUploadLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("formaJuridica", addForma);
      const result = await api<any>("/api/companies", {
        method: "POST",
        body: formData,
      });
      await fetchCompanies();
      setShowAdd(false);
      setUploadFile(null);
      if (result.id) {
        setSelected(result.id);
        setDetailTab("General");
      }
    } catch (err: any) {
      alert("Eroare la upload: " + (err.message || "Eroare necunoscuta"));
    } finally {
      setUploadLoading(false);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === "application/pdf") setUploadFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setUploadFile(file);
  };

  // Debounced CUI/name search via ListaFirme.ro
  const searchCUI = useCallback((query: string) => {
    if (cuiSearchTimer.current) clearTimeout(cuiSearchTimer.current);
    if (!query || query.length < 3) {
      setCuiSearchResults([]);
      return;
    }
    setCuiSearching(true);
    cuiSearchTimer.current = setTimeout(async () => {
      try {
        const results = await apiGet(`/api/companies/search-cui?q=${encodeURIComponent(query)}`);
        setCuiSearchResults(Array.isArray(results) ? results : []);
      } catch {
        setCuiSearchResults([]);
      } finally {
        setCuiSearching(false);
      }
    }, 400);
  }, []);

  // Add company from ListaFirme search result
  const addFromListaFirme = async (fiscalCode: string) => {
    setCuiLoad(true);
    setCuiSearchResults([]);
    try {
      const result = await apiPost<any>("/api/companies/from-listafirme", { cui: fiscalCode });
      setCuiRes({
        denumire: result.denumire || "Firma adaugata",
        adresa: result.adresa || "\u2014",
        caen: result.caen || "\u2014",
        stare: result.stare || "ACTIV",
      });
      await fetchCompanies();
      if (result.id) {
        setSelected(result.id);
        setDetailTab("General");
      }
    } catch (err: any) {
      // If ListaFirme fails, fall back to ONRC
      try {
        const result = await apiPost<any>("/api/companies", { cui: fiscalCode, mode: "auto" });
        setCuiRes({
          denumire: result.denumire || "Firma adaugata",
          adresa: result.adresa || "\u2014",
          caen: result.caen || "\u2014",
          stare: result.stare || "ACTIV",
        });
        await fetchCompanies();
        if (result.id) {
          setSelected(result.id);
          setDetailTab("General");
        }
      } catch (err2: any) {
        setCuiRes("error");
      }
    } finally {
      setCuiLoad(false);
    }
  };

  // Upload ONRC for existing company
  const handleOnrcUpload = async () => {
    if (!onrcFileRef.current?.files?.[0] || !selected) return;
    setOnrcUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", onrcFileRef.current.files[0]);
      await api<any>(`/api/companies/${selected}/upload-onrc`, {
        method: "POST",
        body: formData,
      });
      await fetchDetail(selected);
      setShowOnrcUpload(false);
    } catch (err: any) {
      alert("Eroare la upload ONRC: " + (err.message || "Eroare necunoscuta"));
    } finally {
      setOnrcUploading(false);
    }
  };

  return (
    <>
      <style>{`
        .topbar{padding:14px 28px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:16px;background:var(--bg-surface);flex-shrink:0}
        .tb-title{font-size:20px;font-weight:800;flex:1;letter-spacing:-.3px}.tb-count{font-size:14px;color:var(--text-muted)}
        .btn-add{display:flex;align-items:center;gap:6px;padding:8px 18px;border-radius:var(--r-md);border:none;background:var(--accent-blue);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font-sans);transition:all .15s;box-shadow:0 2px 12px rgba(77,139,255,.25)}
        .btn-add:hover{background:#5d9bff}
        .firme-layout{flex:1;display:flex;overflow:hidden}
        .firme-list{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}
        .firme-toolbar{padding:12px 24px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--border);background:var(--bg-surface);flex-shrink:0;flex-wrap:wrap}
        .fi{padding:8px 14px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-deep);color:var(--text-primary);font-size:13px;font-family:var(--font-sans);outline:none;transition:border-color .2s}
        .fi:focus{border-color:var(--accent-blue)}.fi::placeholder{color:var(--text-muted)}.fi.mono{font-family:var(--font-mono);font-size:13px}
        .fi.ok{border-color:var(--accent-green)}.fi.err{border-color:var(--accent-red)}
        .pill-group{display:flex;background:var(--bg-deep);border-radius:var(--r-md);padding:3px;gap:2px}
        .pill{padding:5px 12px;border-radius:7px;font-size:12px;font-weight:600;border:none;cursor:pointer;background:transparent;color:var(--text-secondary);font-family:var(--font-sans);transition:all .15s;white-space:nowrap}
        .pill:hover{color:var(--text-primary)}.pill.on{background:var(--accent-blue);color:#fff}
        .firme-scroll{flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:10px}
        .firma-card{display:flex;align-items:center;gap:16px;padding:14px 18px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-surface);cursor:pointer;transition:all .18s}
        .firma-card:hover{border-color:var(--border-active);background:var(--bg-elevated)}
        .firma-card.active{border-color:var(--accent-blue);background:rgba(77,139,255,.04)}
        .fc-icon{width:42px;height:42px;border-radius:var(--r-md);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;flex-shrink:0;font-family:var(--font-mono)}
        .fc-info{flex:1;min-width:0}
        .fc-name{font-size:14px;font-weight:700;margin-bottom:2px;display:flex;align-items:center;gap:8px}
        .fc-badge{font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;white-space:nowrap}
        .fc-meta{font-size:12px;color:var(--text-muted);display:flex;gap:10px;flex-wrap:wrap}
        .fc-right{text-align:right;flex-shrink:0}
        .fc-sync{font-size:11px;color:var(--text-muted);font-family:var(--font-mono)}

        .firma-detail{width:540px;min-width:540px;border-left:1px solid var(--border);background:var(--bg-surface);display:flex;flex-direction:column;overflow:hidden}
        .fd-top{padding:18px 22px;border-bottom:1px solid var(--border);display:flex;gap:12px}
        .fd-top-info{flex:1;min-width:0}
        .fd-name{font-size:18px;font-weight:800;margin-bottom:2px}.fd-cui{font-size:12px;font-family:var(--font-mono);color:var(--text-secondary)}
        .fd-badges{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}
        .fd-act-row{display:flex;gap:5px;flex-shrink:0;flex-wrap:wrap}
        .fd-act{padding:5px 10px;border-radius:var(--r-sm);border:1px solid var(--border);background:transparent;color:var(--text-secondary);font-size:11px;font-weight:600;cursor:pointer;font-family:var(--font-sans);transition:all .15s;display:flex;align-items:center;gap:4px;white-space:nowrap}
        .fd-act:hover{border-color:var(--border-active);color:var(--text-primary);background:var(--bg-hover)}
        .fd-act.danger{color:var(--accent-red);border-color:rgba(248,113,113,.25)}.fd-act.danger:hover{background:rgba(248,113,113,.06)}
        .fd-tabs{display:flex;border-bottom:1px solid var(--border);padding:0 22px;background:var(--bg-surface);flex-shrink:0;overflow-x:auto}
        .fd-tab{padding:9px 14px;font-size:12px;font-weight:600;color:var(--text-secondary);cursor:pointer;border-bottom:2px solid transparent;transition:all .15s;font-family:var(--font-sans);background:none;border-top:none;border-left:none;border-right:none;white-space:nowrap}
        .fd-tab:hover{color:var(--text-primary)}.fd-tab.on{color:var(--accent-blue);border-bottom-color:var(--accent-blue)}
        .fd-body{flex:1;overflow-y:auto;padding:18px 22px}
        .fd-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px}
        .fd-grid.c2{grid-template-columns:1fr 1fr}.fd-grid.c4{grid-template-columns:repeat(4,1fr)}
        .c{padding:10px 12px;background:var(--bg-deep);border-radius:var(--r-sm);border:1px solid var(--border)}
        .c.full{grid-column:1/-1}.c.span2{grid-column:span 2}
        .c-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:3px}
        .c-val{font-size:13px;font-weight:600;color:var(--text-primary)}.c-val.mono{font-family:var(--font-mono)}
        .c-val.green{color:var(--accent-green)}.c-val.red{color:var(--accent-red)}.c-val.sub{font-size:11px;color:var(--text-muted);font-weight:400;margin-top:2px}
        .mention{padding:12px;background:var(--bg-deep);border-radius:var(--r-sm);border-left:3px solid var(--accent-blue);margin-bottom:14px}
        .mention-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:3px}
        .mention-text{font-size:12px;color:var(--text-secondary);line-height:1.5}
        .fd-stitle{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin:14px 0 8px}
        .assoc-row{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--bg-elevated);margin-bottom:5px}
        .assoc-name{font-size:13px;font-weight:600;flex:1}.assoc-detail{font-size:12px;color:var(--text-secondary);font-family:var(--font-mono)}
        .warn-box{padding:10px 14px;border-radius:var(--r-sm);border:1px solid var(--accent-red);background:rgba(248,113,113,.04);margin-bottom:8px;font-size:13px;color:var(--accent-red);display:flex;align-items:center;gap:8px}
        .ok-box{padding:10px 14px;border-radius:var(--r-sm);border:1px solid var(--accent-green);background:rgba(52,211,153,.04);margin-bottom:8px;font-size:13px;color:var(--accent-green);display:flex;align-items:center;gap:8px}
        .fin-table{width:100%;border-collapse:collapse;font-size:12px}
        .fin-table th{text-align:left;padding:6px 10px;font-weight:600;color:var(--text-muted);border-bottom:1px solid var(--border);font-size:11px;text-transform:uppercase;letter-spacing:.5px}
        .fin-table td{padding:6px 10px;border-bottom:1px solid var(--separator);font-family:var(--font-mono);color:var(--text-secondary)}
        .fin-table td.green{color:var(--accent-green)}.fin-table td.red{color:var(--accent-red)}

        .empty-panel{flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;color:var(--text-muted)}
        .empty-panel .ep-icon{font-size:40px;opacity:.5}.empty-panel .ep-text{font-size:13px}

        .overlay{position:fixed;inset:0;background:var(--overlay-bg);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:100;animation:fadeIn .2s}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        .modal{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r-lg);width:540px;max-height:85vh;overflow-y:auto;padding:28px;animation:slideUp .3s ease}
        @keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        .modal-title{font-size:20px;font-weight:800;margin-bottom:4px;display:flex;align-items:center;justify-content:space-between}
        .modal-close{background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;padding:4px}.modal-close:hover{color:var(--text-primary)}
        .modal-sub{font-size:14px;color:var(--text-secondary);margin-bottom:20px}
        .mode-toggle{display:flex;border-radius:var(--r-md);border:1px solid var(--border);overflow:hidden;margin-bottom:20px}
        .mode-btn{flex:1;padding:10px;font-size:13px;font-weight:600;cursor:pointer;background:transparent;border:none;color:var(--text-secondary);font-family:var(--font-sans);transition:all .15s;display:flex;align-items:center;justify-content:center;gap:6px}
        .mode-btn:first-child{border-right:1px solid var(--border)}
        .mode-btn:hover{color:var(--text-primary);background:var(--bg-hover)}.mode-btn.on{background:var(--accent-blue);color:#fff}
        .add-row{display:flex;gap:8px;margin-bottom:12px}.add-row .fi{flex:1}
        .btn-p{padding:10px 20px;border-radius:var(--r-md);border:none;background:var(--accent-blue);color:#fff;font-size:14px;font-weight:700;font-family:var(--font-sans);cursor:pointer;transition:all .15s}
        .btn-p:hover{background:#5d9bff}.btn-p:disabled{opacity:.5;cursor:not-allowed}
        .btn-s{padding:10px 20px;border-radius:var(--r-md);border:1px solid var(--border);background:transparent;color:var(--text-secondary);font-size:14px;font-weight:600;font-family:var(--font-sans);cursor:pointer}
        .btn-s:hover{border-color:var(--border-active);color:var(--text-primary)}
        .spinner{width:16px;height:16px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;display:inline-block}
        @keyframes spin{to{transform:rotate(360deg)}}
        .cui-ok{padding:14px;border-radius:var(--r-md);border:1px solid var(--accent-green);background:rgba(52,211,153,.04);margin-bottom:14px}
        .cui-ok .cn{font-size:15px;font-weight:700;color:var(--accent-green);margin-bottom:4px}
        .cui-ok .cr{font-size:12px;color:var(--text-secondary);margin-bottom:2px}
        .cui-ok .cr strong{color:var(--text-primary);font-weight:600;margin-right:6px}
        .cui-err{padding:12px;border-radius:var(--r-md);border:1px solid var(--accent-red);background:rgba(248,113,113,.04);margin-bottom:14px;font-size:13px;color:var(--accent-red)}
        .cui-load{display:flex;align-items:center;gap:10px;padding:12px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-elevated);margin-bottom:14px;font-size:13px;color:var(--text-secondary)}
        .f-hint{font-size:12px;color:var(--accent-purple);margin-bottom:14px}
        .upload-zone{border:2px dashed var(--border);border-radius:var(--r-md);padding:28px 20px;text-align:center;margin-bottom:14px;transition:all .2s;cursor:pointer}
        .upload-zone:hover{border-color:var(--accent-blue);background:rgba(77,139,255,.03)}
        .upload-zone .uz-icon{font-size:24px;margin-bottom:6px}.upload-zone .uz-title{font-size:14px;font-weight:600;margin-bottom:3px}.upload-zone .uz-sub{font-size:12px;color:var(--text-muted)}
        .upload-flow{font-size:12px;color:var(--text-secondary);margin-bottom:14px;padding:8px 12px;background:var(--bg-elevated);border-radius:var(--r-sm);text-align:center}
        .forma-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:18px}
        .forma-radio{padding:8px 10px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--bg-elevated);cursor:pointer;text-align:center;transition:all .15s;font-size:12px}
        .forma-radio:hover{border-color:var(--border-active)}.forma-radio.on{border-color:var(--accent-blue);background:rgba(77,139,255,.06)}
        .forma-radio .fr-cod{font-weight:700;font-family:var(--font-mono);font-size:13px;color:var(--text-primary);margin-bottom:1px}
        .forma-radio .fr-label{font-size:10px;color:var(--text-muted);line-height:1.3}
        .forma-group-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin:12px 0 6px}

        .firme-scroll::-webkit-scrollbar,.fd-body::-webkit-scrollbar,.modal::-webkit-scrollbar{width:5px}
        .firme-scroll::-webkit-scrollbar-track,.fd-body::-webkit-scrollbar-track,.modal::-webkit-scrollbar-track{background:transparent}
        .firme-scroll::-webkit-scrollbar-thumb,.fd-body::-webkit-scrollbar-thumb,.modal::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
      `}</style>

      {/* TOPBAR */}
      <div className="topbar">
        <div className="tb-title">Firme</div>
        <span className="tb-count">{loading ? "..." : `${filtered.length} firme`}</span>
        <button className="btn-add" onClick={() => { setShowAdd(true); setCui(""); setCuiRes(null); setAddMode("auto"); setAddForma("SRL"); setUploadFile(null); }}>+ Adauga firma</button>
      </div>

      <div className="firme-layout">
        {/* LIST */}
        <div className="firme-list">
          <div className="firme-toolbar">
            <input className="fi" placeholder="Cauta firma, CUI, CAEN, judet, forma..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 280 }} />
            <div className="pill-group">
              <button className={`pill ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>Toate</button>
              <button className={`pill ${filter === "activ" ? "on" : ""}`} onClick={() => setFilter("activ")}>Active</button>
              <button className={`pill ${filter === "radiat" ? "on" : ""}`} onClick={() => setFilter("radiat")}>Radiate</button>
              <button className={`pill ${filter === "soc" ? "on" : ""}`} onClick={() => setFilter("soc")}>Societati</button>
              <button className={`pill ${filter === "pf" ? "on" : ""}`} onClick={() => setFilter("pf")}>PFA/II/IF</button>
            </div>
          </div>
          <div className="firme-scroll">
            {loading && <div className="empty-panel" style={{ padding: 60 }}><span className="spinner" style={{ width: 24, height: 24, borderColor: "var(--border)", borderTopColor: "var(--accent-blue)" }} /><div className="ep-text">Se incarca firmele...</div></div>}
            {error && <div className="empty-panel" style={{ padding: 60 }}><div className="ep-text" style={{ color: "var(--accent-red)" }}>{error}</div><button className="btn-s" onClick={fetchCompanies} style={{ marginTop: 8 }}>Reincearca</button></div>}
            {!loading && !error && filtered.map(f => {
              const forma = f.formaJuridica || "";
              const fc = formaColor(forma);
              return (
                <div key={f.id} className={`firma-card ${selected === f.id ? "active" : ""}`} onClick={() => { setSelected(f.id); setDetailTab("General"); }}>
                  <div className="fc-icon" style={{ background: fc.bg, color: fc.color }}>{forma}</div>
                  <div className="fc-info">
                    <div className="fc-name">
                      {f.denumire}
                      <span className="fc-badge" style={{ background: f.stare === "radiata" ? "rgba(248,113,113,.12)" : "rgba(52,211,153,.12)", color: f.stare === "radiata" ? "var(--accent-red)" : "var(--accent-green)" }}>{f.stare}</span>
                    </div>
                    <div className="fc-meta">
                      <span>CUI: {f.cui}</span>
                      <span>CAEN: {f.caen || "\u2014"}</span>
                      <span>{f.judet || "\u2014"}</span>
                    </div>
                  </div>
                  <div className="fc-right"><div className="fc-sync">Sync: {formatSyncTime(f.lastSyncedAt)}</div></div>
                </div>
              );
            })}
            {!loading && !error && filtered.length === 0 && <div className="empty-panel" style={{ padding: 60 }}><div className="ep-icon">&#128269;</div><div className="ep-text">Nicio firma gasita</div></div>}
          </div>
        </div>

        {/* DETAIL PANEL */}
        {sel ? (
          <div className="firma-detail" key={sel.id}>
            {detailLoading ? (
              <div className="empty-panel" style={{ flex: 1 }}><span className="spinner" style={{ width: 24, height: 24, borderColor: "var(--border)", borderTopColor: "var(--accent-blue)" }} /><div className="ep-text">Se incarca detaliile...</div></div>
            ) : (<>
            <div className="fd-top">
              <div className="fd-top-info">
                <div className="fd-name">{sel.denumire}</div>
                <div className="fd-cui">CUI: {sel.cui} &middot; {sel.regCom}</div>
                <div className="fd-badges">
                  <span className="fc-badge" style={sel.stare === "radiata" ? { background: "rgba(248,113,113,.12)", color: "var(--accent-red)" } : { background: "rgba(52,211,153,.12)", color: "var(--accent-green)" }}>{sel.stare}</span>
                  <span className="fc-badge" style={formaColor(sel.forma)}>{sel.forma}</span>
                  <span className="fc-badge" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>CAEN {sel.caen || "\u2014"}</span>
                  <span className="fc-badge" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>Din {sel.anInfiintare || "\u2014"}</span>
                </div>
              </div>
              <div className="fd-act-row">
                <button className="fd-act" onClick={() => handleSyncOnrc(sel.id)}>Actualizare CUI</button>
                <button className="fd-act" onClick={() => { setShowOnrcUpload(true); }}>Upload ONRC</button>
                <button className="fd-act danger" onClick={() => handleDelete(sel.id)}>Sterge</button>
              </div>
            </div>

            <div className="fd-tabs">
              {tabs.map(t => <button key={t} className={`fd-tab ${detailTab === t ? "on" : ""}`} onClick={() => setDetailTab(t)}>{t}</button>)}
            </div>

            <div className="fd-body">
              {/* GENERAL */}
              {detailTab === "General" && (<>
                <div className="fd-grid">
                  <div className="c span2"><div className="c-label">Forma juridica</div><div className="c-val">{FORME_JURIDICE.find(fj => fj.cod === sel.forma)?.label || sel.forma}</div></div>
                  <div className="c"><div className="c-label">Stare</div><div className="c-val"><span className="fc-badge" style={sel.stare === "radiata" ? { background: "rgba(248,113,113,.12)", color: "var(--accent-red)" } : { background: "rgba(52,211,153,.12)", color: "var(--accent-green)" }}>{sel.stare}</span></div></div>
                  <div className="c span2"><div className="c-label">Adresa</div><div className="c-val">{sel.adresa || "\u2014"}</div><div className="c-val sub">{sel.localitate || ""}{sel.localitate && sel.judet ? ", " : ""}{sel.judet || ""} {sel.codPostal || ""}</div></div>
                  <div className="c"><div className="c-label">Telefon</div><div className="c-val mono">{sel.telefon || "\u2014"}</div></div>
                  {sel.email && <div className="c"><div className="c-label">Email</div><div className="c-val mono" style={{ fontSize: 12 }}>{sel.email}</div></div>}
                  <div className="c"><div className="c-label">{getFieldLabel("durata_label", sel.forma)}</div><div className="c-val">{sel.durata || "\u2014"}</div></div>
                  <div className="c"><div className="c-label">An infiintare</div><div className="c-val mono">{sel.anInfiintare || "\u2014"}</div></div>
                </div>
                {isPF(sel.forma) && sel.patrimoniu_afectat && (
                  <div className="mention"><div className="mention-label">Patrimoniu de afectatiune</div><div className="mention-text">{sel.patrimoniu_afectat}</div></div>
                )}
                <div className="mention"><div className="mention-label">Ultima mentiune</div><div className="mention-text">{sel.ultimaMentiune}</div></div>
                {isSOC(sel.forma) && sel.capitalSocial && (<>
                  <div className="fd-stitle">Capital social</div>
                  <div className="fd-grid c4">
                    <div className="c"><div className="c-label">Subscris</div><div className="c-val mono">{fmt(sel.capitalSocial)}</div></div>
                    <div className="c"><div className="c-label">{getFieldLabel("parti_actiuni", sel.forma)}</div><div className="c-val mono">{sel.partiSociale || sel.actiuni || "\u2014"}</div></div>
                    <div className="c"><div className="c-label">{getFieldLabel("valoare_parte", sel.forma)}</div><div className="c-val mono">{fmt(sel.valoareParte || sel.valoareActiune)}</div></div>
                    <div className="c"><div className="c-label">Natura capital</div><div className="c-val" style={{ fontSize: 11 }}>privat autohton {sel.natura?.privatAutohton || sel.natura?.privat_autohton || 0}%{((sel.natura?.privatStrain ?? sel.natura?.privat_strain ?? 0) > 0) ? `, strain ${sel.natura?.privatStrain || sel.natura?.privat_strain}%` : ""}{((sel.natura?.stat ?? 0) > 0) ? `, stat ${sel.natura!.stat}%` : ""}</div></div>
                  </div>
                </>)}
              </>)}

              {/* ASOCIATI / ACTIONARI */}
              {(detailTab === "Asociati" || detailTab === "Actionari") && (<>
                {sel.asociatiPJ.length > 0 && (<>
                  <div className="fd-stitle">{getFieldLabel("asociati_label", sel.forma)} &mdash; Persoane Juridice ({sel.asociatiPJ.length})</div>
                  {sel.asociatiPJ.map((a: any, i: number) => (
                    <div className="assoc-row" key={i}>
                      <span style={{ fontSize: 16 }}>&#127970;</span>
                      <div className="assoc-name">{a.denumire}<div style={{ fontSize: 11, color: "var(--text-muted)" }}>{a.calitate} &middot; {a.tara}</div></div>
                      <div className="assoc-detail">{a.cotaBeneficii}%</div>
                      <div className="assoc-detail">{a.aport}</div>
                    </div>
                  ))}
                </>)}
                <div className="fd-stitle">{getFieldLabel("asociati_label", sel.forma)} &mdash; Persoane Fizice ({sel.asociatiPF.length})</div>
                {sel.asociatiPF.map((a: any, i: number) => (
                  <div className="assoc-row" key={i}>
                    <span style={{ fontSize: 16 }}>&#128100;</span>
                    <div className="assoc-name">{a.nume}<div style={{ fontSize: 11, color: "var(--text-muted)" }}>{a.calitate} &middot; {a.cetatenie}</div></div>
                    <div className="assoc-detail">{a.cotaBeneficii}%</div>
                    <div className="assoc-detail">{a.partiSociale || a.actiuni} {sel.forma === "SA" ? "actiuni" : "p.s."}</div>
                    <div className="assoc-detail">{a.aport}</div>
                  </div>
                ))}
              </>)}

              {/* TITULAR (PFA/II) */}
              {detailTab === "Titular" && sel.titular && (<>
                <div className="fd-stitle">Titular</div>
                <div className="fd-grid c2">
                  <div className="c"><div className="c-label">Nume</div><div className="c-val">{sel.titular.nume}</div></div>
                  <div className="c"><div className="c-label">Cetatenie</div><div className="c-val">{sel.titular.cetatenie}</div></div>
                  <div className="c"><div className="c-label">Data nasterii</div><div className="c-val mono">{sel.titular.dataNasterii}</div></div>
                  <div className="c"><div className="c-label">Stare civila</div><div className="c-val">{sel.titular.stare_civila}</div></div>
                </div>
              </>)}

              {/* MEMBRI IF */}
              {detailTab === "Membri IF" && sel.membriIF && (<>
                <div className="fd-stitle">Reprezentant</div>
                <div className="assoc-row"><span style={{ fontSize: 16 }}>&#128084;</span><div className="assoc-name">{sel.reprezentantIF || "\u2014"}</div><div className="assoc-detail">Reprezentant IF</div></div>
                <div className="fd-stitle">Membri ({sel.membriIF.length})</div>
                {sel.membriIF.map((m: any, i: number) => (
                  <div className="assoc-row" key={i}>
                    <span style={{ fontSize: 16 }}>&#128100;</span>
                    <div className="assoc-name">{m.nume}<div style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.calitate}</div></div>
                    <div className="assoc-detail">{m.gradRudenie}</div>
                    <div className="assoc-detail">{m.cetatenie}</div>
                  </div>
                ))}
              </>)}

              {/* ADMINISTRARE */}
              {detailTab === "Administrare" && (<>
                <div className="fd-stitle">{getFieldLabel("admin_label", sel.forma)} ({sel.administratori.length})</div>
                {sel.administratori.map((a: any, i: number) => (
                  <div className="assoc-row" key={i}>
                    <span style={{ fontSize: 16 }}>&#128084;</span>
                    <div className="assoc-name">{a.nume}<div style={{ fontSize: 11, color: "var(--text-muted)" }}>{a.functie}</div></div>
                    <div className="assoc-detail">Puteri: {a.puteri}</div>
                    <div className="assoc-detail">Mandat: {a.durataMandatLabel}</div>
                  </div>
                ))}
                {sel.cenzori && sel.cenzori.length > 0 && (<>
                  <div className="fd-stitle">Cenzori / Auditori</div>
                  {sel.cenzori.map((c: any, i: number) => (
                    <div className="assoc-row" key={i}><span style={{ fontSize: 16 }}>&#128269;</span><div className="assoc-name">{c.nume}<div style={{ fontSize: 11, color: "var(--text-muted)" }}>{c.calitate}</div></div><div className="assoc-detail">{c.nrAutorizare}</div></div>
                  ))}
                </>)}
              </>)}

              {/* ACTIVITATI */}
              {detailTab === "Activitati" && (<>
                <div className="fd-stitle">Activitate principala</div>
                <div className="c full" style={{ marginBottom: 12 }}><div className="c-label">CAEN {sel.caen || "\u2014"}</div><div className="c-val">{sel.caenDesc}</div></div>
                {sel.activitatiSecundare.length > 0 && (<>
                  <div className="fd-stitle">Activitati secundare ({sel.activitatiSecundare.length})</div>
                  {sel.activitatiSecundare.map((a: any, i: number) => (
                    <div className="assoc-row" key={i} style={{ padding: "7px 12px" }}><div className="assoc-detail" style={{ minWidth: 50 }}>{a.cod}</div><div className="assoc-name" style={{ fontSize: 13 }}>{a.den}</div></div>
                  ))}
                </>)}
              </>)}

              {/* SEDII */}
              {detailTab === "Sedii" && (<>
                <div className="fd-stitle">Sediu social</div>
                <div className="c full" style={{ marginBottom: 12 }}><div className="c-label">Adresa completa</div><div className="c-val">{sel.adresa || "\u2014"}, {sel.localitate || ""}, {sel.judet || ""} {sel.codPostal || ""}</div></div>
                {sel.sediiSecundare && sel.sediiSecundare.length > 0 && (<>
                  <div className="fd-stitle">Sedii secundare / Puncte de lucru ({sel.sediiSecundare.length})</div>
                  {sel.sediiSecundare.map((s: any, i: number) => (
                    <div className="assoc-row" key={i}><span style={{ fontSize: 16 }}>&#128205;</span><div className="assoc-name">{s.denumire}<div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.adresa}</div></div></div>
                  ))}
                </>)}
              </>)}

              {/* FIN. ONRC */}
              {detailTab === "Fin. ONRC" && (<>
                <div className="fd-stitle">Situatii financiare (din date ONRC)</div>
                {sel.situatiiFinanciare.length > 0 ? (
                  <>
                    <table className="fin-table">
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
                    <div style={{ marginTop: 12, fontSize: 11, color: "var(--text-muted)" }}>Sursa: Date publice ONRC / termene.ro</div>
                  </>
                ) : (
                  <div className="empty-panel" style={{ padding: 40 }}>
                    <div className="ep-icon">&#128202;</div>
                    <div className="ep-text">Nicio situatie financiara disponibila.</div>
                  </div>
                )}
              </>)}

              {/* FIN. ANAF */}
              {detailTab === "Fin. ANAF" && (
                <div className="empty-panel" style={{ padding: 40 }}>
                  <div className="ep-icon">&#128202;</div>
                  <div className="ep-text">Niciun bilant incarcat.<br />Uploadeaza un bilant PDF pentru a extrage datele automat.</div>
                </div>
              )}

              {/* JURIDIC */}
              {detailTab === "Juridic" && (<>
                <div className="fd-stitle">Stare juridica</div>
                {sel.insolventa && <div className="warn-box">Firma in insolventa</div>}
                {sel.dizolvare && <div className="warn-box">Firma dizolvata</div>}
                {sel.lichidare && <div className="warn-box">Firma in lichidare</div>}
                {sel.restrictii && <div className="warn-box">Restrictii active</div>}
                {!sel.insolventa && !sel.dizolvare && !sel.lichidare && !sel.restrictii && <div className="ok-box">Fara restrictii, insolventa, dizolvare sau lichidare</div>}
                <div className="fd-grid c2" style={{ marginTop: 12 }}>
                  <div className="c"><div className="c-label">Nr. Reg. Comertului</div><div className="c-val mono">{sel.regCom}</div></div>
                  <div className="c"><div className="c-label">Forma juridica</div><div className="c-val">{FORME_JURIDICE.find(fj => fj.cod === sel.forma)?.label || sel.forma}</div></div>
                </div>
                <div className="mention" style={{ marginTop: 12 }}><div className="mention-label">Ultima mentiune</div><div className="mention-text">{sel.ultimaMentiune}</div></div>
              </>)}
            </div>
            </>)}
          </div>
        ) : (
          <div className="firma-detail" style={{ alignItems: "center", justifyContent: "center" }}>
            <div className="empty-panel"><div className="ep-icon">&#127970;</div><div className="ep-text">Selecteaza o firma pentru detalii</div></div>
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
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
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

              {/* Search suggestions dropdown */}
              {cuiSearchResults.length > 0 && !cuiRes && (
                <div style={{
                  border: "1px solid var(--border)", borderRadius: "var(--r-md)",
                  background: "var(--bg-surface)", overflow: "hidden", marginTop: 4, marginBottom: 8,
                }}>
                  {cuiSearching && (
                    <div style={{ padding: "8px 14px", fontSize: 11, color: "var(--text-muted)" }}>Se cauta...</div>
                  )}
                  {cuiSearchResults.map((r: any, idx: number) => (
                    <div key={idx}
                      style={{
                        padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--border)",
                        transition: "background .12s", fontSize: 13,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      onClick={() => {
                        const code = r.fiscalCode || r.taxCode || "";
                        setCui(code);
                        setCuiSearchResults([]);
                        addFromListaFirme(code);
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{r.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", gap: 12, marginTop: 2 }}>
                        <span style={{ fontFamily: "var(--font-mono)" }}>CUI: {r.fiscalCode || r.taxCode || "—"}</span>
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
                    <div className="fr-cod">{f.short}</div>
                    <div className="fr-label">{f.label}</div>
                  </div>
                ))}
              </div>

              <div className="forma-group-title">Persoane fizice / Intreprinderi</div>
              <div className="forma-grid">
                {FORME_JURIDICE.filter(f => f.group === "PF").map(f => (
                  <div key={f.cod} className={`forma-radio ${addForma === f.cod ? "on" : ""}`} onClick={() => setAddForma(f.cod)}>
                    <div className="fr-cod">{f.short}</div>
                    <div className="fr-label">{f.label}</div>
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

      {/* ONRC UPLOAD MODAL */}
      {showOnrcUpload && selected && (
        <div className="overlay" onClick={e => { if (e.target === e.currentTarget) setShowOnrcUpload(false); }}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-title">Upload Certificat Constatator<button className="modal-close" onClick={() => setShowOnrcUpload(false)}>&times;</button></div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.5 }}>
              Incarca un certificat constatator ONRC (PDF). Datele firmei se vor actualiza automat cu informatiile extrase.
            </div>
            <input type="file" ref={onrcFileRef} accept=".pdf" style={{ display: "none" }} onChange={() => {}} />
            <div className="upload-zone" onClick={() => onrcFileRef.current?.click()} style={{ marginBottom: 16 }}>
              <div className="uz-icon">{onrcFileRef.current?.files?.[0] ? "\u2705" : "\u{1F4C4}"}</div>
              <div className="uz-title">{onrcFileRef.current?.files?.[0]?.name || "Certificat constatator (PDF)"}</div>
              <div className="uz-sub">Click pentru a selecta fisierul</div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn-s" onClick={() => setShowOnrcUpload(false)}>Anuleaza</button>
              <button className="btn-p" disabled={onrcUploading} onClick={handleOnrcUpload}>
                {onrcUploading ? <span className="spinner" /> : "Actualizeaza datele"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
