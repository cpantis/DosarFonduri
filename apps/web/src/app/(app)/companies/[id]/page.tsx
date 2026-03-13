"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { isSOC, isPF, FORME_JURIDICE, getCompanyTabs, getFieldLabel } from "@/hooks/useFormaJuridica";
import { apiGet, apiPost, apiDelete, api } from "@/lib/api";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TypeBadge } from "@/components/ui/TypeBadge";
import { InfoCard } from "@/components/ui/InfoCard";
import { DataTable } from "@/components/ui/DataTable";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Tabs } from "@/components/ui/Tabs";
import { BtnPrimary, BtnSecondary, BtnDanger } from "@/components/ui/Buttons";
import { EmptyState } from "@/components/ui/EmptyState";

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
  const tabObjects = tabs.map(t => ({ key: t, label: t }));

  return (
    <div className="flex flex-col h-full overflow-hidden animate-[fadeIn_.2s_ease-out]">
      {/* LOADING STATE */}
      {loading && (
        <div className="flex-1 flex items-center justify-center flex-col gap-3 text-slate-400">
          <svg className="w-5 h-5 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
          <div className="text-[13px]">Se încarcă detaliile firmei...</div>
        </div>
      )}

      {/* ERROR STATE */}
      {!loading && error && (
        <div className="flex-1 flex items-center justify-center flex-col gap-3 text-slate-400">
          <div className="text-sm text-red-500">{error}</div>
          <button
            className="px-4 py-2 text-[13px] font-medium bg-white border border-slate-300 rounded-lg hover:bg-slate-50 hover:border-slate-400 text-slate-700 mt-2 transition-colors"
            onClick={fetchDetail}
          >
            Reincearca
          </button>
          <Link href="/companies" className="text-[13px] font-semibold text-blue-600 hover:text-blue-700 mt-3">
            &larr; Inapoi la lista
          </Link>
        </div>
      )}

      {/* DETAIL VIEW */}
      {!loading && !error && sel && (<>
        {/* PROCESSING BANNER */}
        {sel.processingStatus === "processing" && (
          <div className="px-8 py-3.5 bg-blue-50 border-b border-blue-200 flex items-center gap-3 flex-shrink-0">
            <div className="w-[18px] h-[18px] border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <span className="text-sm font-semibold text-blue-600">Se proceseaza documentul... Datele firmei se actualizeaza automat.</span>
          </div>
        )}
        {sel.processingStatus === "error" && (
          <div className="px-8 py-3.5 bg-red-50 border-b border-red-200 flex items-center gap-3 flex-shrink-0">
            <span className="text-sm font-semibold text-red-600">Eroare la procesare: {sel.processingError || "Eroare necunoscuta"}</span>
            <button
              className="ml-auto px-4 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-700 transition-colors"
              onClick={() => setShowOnrcUpload(true)}
            >
              Reincearca upload
            </button>
          </div>
        )}

        {/* HEADER */}
        <div className="bg-white border-b border-slate-200/80">
          <div className="max-w-6xl mx-auto px-8 py-6">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-1.5 mb-3">
              <Link href="/companies" className="text-[13px] text-slate-500 hover:text-slate-700 transition-colors no-underline">Firme</Link>
              <svg className="w-3.5 h-3.5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              <span className="text-[13px] text-slate-400">{sel.denumire}</span>
            </nav>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <h1 className="text-[24px] font-bold text-slate-900 tracking-tight">{sel.denumire}</h1>
                  <TypeBadge type={sel.forma} />
                  <StatusBadge status={sel.stare || "activ"} />
                </div>
                <p className="text-[13px] text-slate-500 mt-1">
                  <span className="font-mono tabular-nums text-slate-400">CUI: {sel.cui}</span> · {sel.regCom || "\u2014"}{sel.euid ? ` · EUID: ${sel.euid}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <BtnSecondary size="sm" onClick={handleSyncOnrc}>Actualizare CUI</BtnSecondary>
                <BtnSecondary size="sm" onClick={() => setShowOnrcUpload(true)}>Upload ONRC</BtnSecondary>
                <BtnSecondary size="sm" onClick={() => setShowBilantUpload(true)}>Upload Bilanț</BtnSecondary>
                <BtnDanger size="sm" onClick={handleDelete}>Șterge</BtnDanger>
              </div>
            </div>
            <div className="mt-5">
              <Tabs tabs={tabObjects} active={activeTab} onChange={setActiveTab} />
            </div>
          </div>
        </div>

        {/* TAB CONTENT */}
        <div className="flex-1 overflow-y-auto bg-slate-50">
          <div className="max-w-6xl mx-auto px-8 py-6">

          {/* GENERAL */}
          {activeTab === "General" && (<>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-5 mb-6">
              <InfoCard label="Forma juridica" span={2}>
                <div className="text-[15px] font-semibold text-slate-900">
                  {FORME_JURIDICE.find(fj => fj.cod === sel.forma)?.label || sel.forma}
                </div>
              </InfoCard>
              <InfoCard label="Stare">
                <StatusBadge status={sel.stare || "activ"} />
              </InfoCard>
              <InfoCard label="Adresa" span={2}>
                <div className="text-[15px] font-semibold text-slate-900">{sel.adresa || "\u2014"}</div>
                <div className="text-[13px] font-normal mt-1 text-slate-400">
                  {sel.localitate || ""}{sel.localitate && sel.judet ? ", " : ""}{sel.judet || ""} {sel.codPostal || ""}
                </div>
              </InfoCard>
              <InfoCard label="Telefon" value={sel.telefon || "\u2014"} />
              {sel.email && (
                <InfoCard label="Email" value={sel.email} />
              )}
              {sel.website && (
                <InfoCard label="Website">
                  <a href={sel.website.startsWith('http') ? sel.website : `https://${sel.website}`} target="_blank" rel="noopener noreferrer" className="text-[15px] font-semibold text-blue-600 hover:underline">
                    {sel.website}
                  </a>
                </InfoCard>
              )}
              <InfoCard label={getFieldLabel("durata_label", sel.forma)} value={sel.durata || "\u2014"} />
              <InfoCard label="An infiintare" value={sel.anInfiintare || "\u2014"} />
              <InfoCard label="CAEN" value={`${sel.caen || "\u2014"} \u2014 ${sel.caenDesc}`} />
              {sel.regCom && (
                <InfoCard label="Nr. Reg. Com." value={sel.regCom} />
              )}
              {sel.euid && (
                <InfoCard label="EUID" value={sel.euid} />
              )}
            </div>
            {sel.activitatiSecundare && sel.activitatiSecundare.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200/80 p-5 mt-5 mb-2">
                <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 mb-3">Activitati secundare ({sel.activitatiSecundare.length})</div>
                <div className="flex flex-wrap gap-2">
                  {sel.activitatiSecundare.slice(0, 5).map((a: any, i: number) => (
                    <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200/80 bg-slate-50 text-[12px] text-slate-500">
                      <span className="font-mono text-[11px] text-slate-400">{a.cod}</span>
                      {a.den}
                    </span>
                  ))}
                  {sel.activitatiSecundare.length > 5 && (
                    <button className="text-[12px] font-semibold text-blue-600 hover:underline cursor-pointer border-none bg-transparent" onClick={() => setActiveTab("Activitati")}>
                      +{sel.activitatiSecundare.length - 5} mai multe
                    </button>
                  )}
                </div>
              </div>
            )}
            {isPF(sel.forma) && sel.patrimoniu_afectat && (
              <InfoCard label="Patrimoniu de afectatiune" accent>
                <div className="text-[14px] leading-relaxed text-slate-900">{sel.patrimoniu_afectat}</div>
              </InfoCard>
            )}
            <div className="mt-5">
              <InfoCard label="Ultima mentiune" accent>
                <div className="text-[14px] leading-relaxed text-slate-900">{sel.ultimaMentiune}</div>
              </InfoCard>
            </div>
            {isSOC(sel.forma) && sel.capitalSocial && (
              <div className="bg-white rounded-xl border border-slate-200/80 p-6 mt-6">
                <div className="text-[14px] font-bold text-slate-900 mb-5">Capital social</div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
                  <InfoCard label="Subscris" value={fmt(sel.capitalSocial)} />
                  <InfoCard label={getFieldLabel("parti_actiuni", sel.forma)} value={sel.partiSociale || sel.actiuni || "\u2014"} />
                  <InfoCard label={getFieldLabel("valoare_parte", sel.forma)} value={fmt(sel.valoareParte || sel.valoareActiune)} />
                  <InfoCard label="Natura">
                    <div className="text-[15px] font-semibold text-slate-900">
                      privat autohton {sel.natura?.privatAutohton || sel.natura?.privat_autohton || 0}%
                      {((sel.natura?.privatStrain ?? sel.natura?.privat_strain ?? 0) > 0) ? `, strain ${sel.natura?.privatStrain || sel.natura?.privat_strain}%` : ""}
                      {((sel.natura?.stat ?? 0) > 0) ? `, stat ${sel.natura!.stat}%` : ""}
                    </div>
                  </InfoCard>
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
              <DataTable
                columns={[
                  { key: "denumire", label: "Denumire", className: "text-slate-900 font-medium" },
                  { key: "calitate", label: "Calitate" },
                  { key: "tara", label: "Tara" },
                  { key: "cotaBeneficii", label: "Cota %", className: "text-right font-mono text-slate-500", render: (row: any) => `${row.cotaBeneficii}%` },
                  { key: "aport", label: "Aport", className: "text-right font-mono text-slate-500" },
                ]}
                rows={sel.asociatiPJ}
              />
              <div className="mb-5" />
            </>)}
            <SectionTitle>
              {getFieldLabel("asociati_label", sel.forma)} &mdash; Persoane Fizice ({sel.asociatiPF.length})
            </SectionTitle>
            <DataTable
              columns={[
                { key: "nume", label: "Nume", className: "text-slate-900 font-medium" },
                { key: "calitate", label: "Calitate" },
                { key: "cetatenie", label: "Cetatenie" },
                { key: "cotaBeneficii", label: "Cota %", className: "text-right font-mono text-slate-500", render: (row: any) => `${row.cotaBeneficii}%` },
                { key: "partiSociale", label: sel.forma === "SA" ? "Actiuni" : "Parti soc.", className: "text-right font-mono text-slate-500", render: (row: any) => row.partiSociale || row.actiuni },
                { key: "aport", label: "Aport", className: "text-right font-mono text-slate-500" },
              ]}
              rows={sel.asociatiPF}
            />
          </>)}

          {/* TITULAR (PFA/II) */}
          {activeTab === "Titular" && sel.titular && (<>
            <SectionTitle>Titular</SectionTitle>
            <div className="grid grid-cols-2 gap-4">
              <InfoCard label="Nume" value={sel.titular.nume} />
              <InfoCard label="Cetatenie" value={sel.titular.cetatenie} />
              <InfoCard label="Data nasterii" value={sel.titular.dataNasterii} />
              <InfoCard label="Stare civila" value={sel.titular.stare_civila} />
            </div>
          </>)}
          {activeTab === "Titular" && !sel.titular && (
            <EmptyState icon="&#128100;" title="Nicio informatie despre titular disponibila." />
          )}

          {/* MEMBRI IF */}
          {activeTab === "Membri IF" && (<>
            <SectionTitle>Reprezentant</SectionTitle>
            <div className="bg-white rounded-xl border border-slate-200/80 p-4 flex items-center gap-3 mb-5">
              <span className="text-lg">&#128084;</span>
              <div className="text-sm font-semibold text-slate-900">{sel.reprezentantIF || "\u2014"}</div>
              <span className="ml-auto text-xs font-mono text-slate-500">Reprezentant IF</span>
            </div>
            <SectionTitle>Membri ({(sel.membriIF || []).length})</SectionTitle>
            <DataTable
              columns={[
                { key: "nume", label: "Nume", className: "text-slate-900 font-medium" },
                { key: "calitate", label: "Calitate" },
                { key: "gradRudenie", label: "Grad rudenie" },
                { key: "cetatenie", label: "Cetatenie" },
              ]}
              rows={sel.membriIF || []}
            />
          </>)}

          {/* ADMINISTRARE */}
          {activeTab === "Administrare" && (<>
            <SectionTitle>
              {getFieldLabel("admin_label", sel.forma)} ({sel.administratori.length})
            </SectionTitle>
            <DataTable
              columns={[
                { key: "nume", label: "Nume", className: "text-slate-900 font-medium" },
                { key: "functie", label: "Functie" },
                { key: "puteri", label: "Puteri" },
                { key: "durataMandatLabel", label: "Mandat" },
              ]}
              rows={sel.administratori}
            />
            {sel.cenzori && sel.cenzori.length > 0 && (<>
              <SectionTitle>Cenzori / Auditori</SectionTitle>
              <DataTable
                columns={[
                  { key: "nume", label: "Nume", className: "text-slate-900 font-medium" },
                  { key: "calitate", label: "Calitate" },
                  { key: "nrAutorizare", label: "Nr. autorizare", className: "font-mono text-slate-500" },
                ]}
                rows={sel.cenzori}
              />
            </>)}
          </>)}

          {/* ACTIVITATI */}
          {activeTab === "Activitati" && (<>
            <SectionTitle>Activitate principala</SectionTitle>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5">
              <div className="text-[11px] uppercase tracking-wide font-semibold text-blue-600 mb-1">CAEN {sel.caen || "\u2014"}</div>
              <div className="text-[15px] font-semibold text-slate-900">{sel.caenDesc}</div>
            </div>
            {sel.activitatiSecundare.length > 0 && (<>
              <SectionTitle>Activitati secundare ({sel.activitatiSecundare.length})</SectionTitle>
              <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden">
                {sel.activitatiSecundare.map((a: any, i: number) => (
                  <div
                    key={i}
                    className={`flex items-center gap-4 px-4 py-2.5 ${i > 0 ? "border-t border-slate-100" : ""}`}
                  >
                    <span className="font-mono text-xs min-w-[55px] text-slate-500">{a.cod}</span>
                    <span className="text-sm text-slate-900">{a.den}</span>
                  </div>
                ))}
              </div>
            </>)}
          </>)}

          {/* SEDII */}
          {activeTab === "Sedii" && (<>
            <SectionTitle>Sediu social</SectionTitle>
            <InfoCard
              label="Adresa completa"
              value={`${sel.adresa || "\u2014"}, ${sel.localitate || ""}, ${sel.judet || ""} ${sel.codPostal || ""}`}
            />
            {sel.sediiSecundare && sel.sediiSecundare.length > 0 && (<>
              <SectionTitle>Sedii secundare / Puncte de lucru ({sel.sediiSecundare.length})</SectionTitle>
              <div className="space-y-2">
                {sel.sediiSecundare.map((s: any, i: number) => (
                  <div key={i} className="bg-white rounded-xl border border-slate-200/80 p-4 flex items-center gap-3">
                    <span className="text-lg">&#128205;</span>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{s.denumire}</div>
                      <div className="text-xs mt-0.5 text-slate-500">{s.adresa}</div>
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
                <DataTable
                  columns={[
                    { key: "an", label: "An", className: "text-slate-900 font-semibold" },
                    { key: "cifraAfaceri", label: "Cifra afaceri", className: "text-right font-mono text-slate-500", render: (row: any) => fmtLei(row.cifraAfaceri) },
                    { key: "profitNet", label: "Profit net", className: "text-right font-mono", render: (row: any) => <span className={(row.profitNet ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}>{fmtLei(row.profitNet)}</span> },
                    { key: "angajati", label: "Angajati", className: "text-right font-mono text-slate-500", render: (row: any) => row.angajati ?? "\u2014" },
                    ...(isSOC(sel.forma) ? [{ key: "capitaluriProprii", label: "Capitaluri proprii", className: "text-right font-mono text-slate-500", render: (row: any) => fmtLei(row.capitaluriProprii) }] : []),
                    ...(isPF(sel.forma) ? [
                      { key: "venituriTotale", label: "Venituri", className: "text-right font-mono text-slate-500", render: (row: any) => fmtLei(row.venituriTotale) },
                      { key: "cheltuieliTotale", label: "Cheltuieli", className: "text-right font-mono text-slate-500", render: (row: any) => fmtLei(row.cheltuieliTotale) },
                    ] : []),
                  ]}
                  rows={sel.situatiiFinanciare}
                />
                <div className="mt-3 text-xs text-slate-400">Sursa: Date publice ONRC / termene.ro</div>
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
              {/* Header with year selector + upload button */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-[13px] font-semibold text-slate-700 uppercase tracking-wide">Bilant ANAF</h3>
                  {anafYears.length > 1 && (
                    <select
                      value={viewYear ?? ""}
                      onChange={e => setSelectedBilantYear(Number(e.target.value))}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200/80 bg-white text-[13px] font-mono text-slate-900"
                    >
                      {anafYears.map((y: number) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  )}
                  {anafYears.length === 1 && <span className="text-sm font-mono text-slate-500">{viewYear}</span>}
                </div>
                <BtnSecondary onClick={() => setShowBilantUpload(true)}>Upload bilant</BtnSecondary>
              </div>

              {/* Summary table all years */}
              <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden mb-6">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-5 py-3 text-[11px] uppercase tracking-wide text-slate-500 font-medium">An</th>
                      <th className="text-right px-5 py-3 text-[11px] uppercase tracking-wide text-slate-500 font-medium">Cifra afaceri</th>
                      <th className="text-right px-5 py-3 text-[11px] uppercase tracking-wide text-slate-500 font-medium">Profit net</th>
                      <th className="text-right px-5 py-3 text-[11px] uppercase tracking-wide text-slate-500 font-medium">Rezultat exploatare</th>
                      <th className="text-right px-5 py-3 text-[11px] uppercase tracking-wide text-slate-500 font-medium">Angajati</th>
                      {isSOC(sel.forma) && <th className="text-right px-5 py-3 text-[11px] uppercase tracking-wide text-slate-500 font-medium">Capitaluri proprii</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {anafData.map((s: any, i: number) => (
                      <tr
                        key={i}
                        className={`transition-colors cursor-pointer hover:bg-slate-50/50 ${s.an === viewYear ? "bg-blue-50/50" : ""}`}
                        onClick={() => setSelectedBilantYear(s.an)}
                      >
                        <td className={`px-5 py-4 text-[13px] ${s.an === viewYear ? "font-bold text-slate-900" : "font-medium text-slate-900"}`}>{s.an}</td>
                        <td className="px-5 py-4 text-[13px] text-right font-mono text-slate-500">{fmtLei(s.cifraAfaceri)}</td>
                        <td className={`px-5 py-4 text-[13px] text-right font-mono ${(s.profitNet ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmtLei(s.profitNet)}</td>
                        <td className="px-5 py-4 text-[13px] text-right font-mono text-slate-500">{fmtLei(raw?.f20?.rezultatExploatare)}</td>
                        <td className="px-5 py-4 text-[13px] text-right font-mono text-slate-500">{s.angajati ?? "\u2014"}</td>
                        {isSOC(sel.forma) && <td className="px-5 py-4 text-[13px] text-right font-mono text-slate-500">{fmtLei(s.capitaluriProprii)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Detailed data for selected year */}
              {f20 && (<>
                <SectionTitle>Cont profit si pierderi ({viewYear})</SectionTitle>
                <div className="grid grid-cols-2 gap-4 mb-5">
                  <InfoCard label="Cifra afaceri neta" value={fmtLei(f20.cifraAfaceriNeta)} />
                  <InfoCard label="Venituri exploatare" value={fmtLei(f20.venituriExploatare)} />
                  <InfoCard label="Cheltuieli exploatare" value={fmtLei(f20.cheltuieliExploatare)} />
                  <InfoCard label="Rezultat exploatare">
                    <span className={`text-[15px] font-semibold font-mono ${(f20.rezultatExploatare ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmtLei(f20.rezultatExploatare)}</span>
                  </InfoCard>
                  <InfoCard label="Venituri financiare" value={fmtLei(f20.venituriFinanciare)} />
                  <InfoCard label="Cheltuieli financiare" value={fmtLei(f20.cheltuieliFinanciare)} />
                  <InfoCard label="Rezultat brut">
                    <span className={`text-[15px] font-semibold font-mono ${(f20.rezultatBrut ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmtLei(f20.rezultatBrut)}</span>
                  </InfoCard>
                  <InfoCard label="Rezultat net">
                    <span className={`text-[15px] font-semibold font-mono ${(f20.profitNet ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmtLei(f20.profitNet)}</span>
                  </InfoCard>
                </div>
              </>)}

              {f10 && (<>
                <SectionTitle>Bilant ({viewYear})</SectionTitle>
                <div className="grid grid-cols-2 gap-4 mb-5">
                  <InfoCard label="Active imobilizate" value={fmtLei(f10.activeImobilizate)} />
                  <InfoCard label="Active circulante" value={fmtLei(f10.activeCirculante)} />
                  <InfoCard label="Stocuri" value={fmtLei(f10.stocuri)} />
                  <InfoCard label="Creante" value={fmtLei(f10.creante)} />
                  <InfoCard label="Casa si conturi" value={fmtLei(f10.casaSiConturi)} />
                  <InfoCard label="Datorii sub 1 an" value={fmtLei(f10.datoriiSub1An)} />
                  <InfoCard label="Datorii peste 1 an" value={fmtLei(f10.datoriiPeste1An)} />
                  <InfoCard label="Capitaluri proprii">
                    <span className={`text-[15px] font-semibold font-mono ${(f10.capitaluriProprii ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmtLei(f10.capitaluriProprii)}</span>
                  </InfoCard>
                </div>
              </>)}

              {f30 && (f30.numarMediuSalariati || f30.numarSalariati31Dec) && (<>
                <SectionTitle>Date informative ({viewYear})</SectionTitle>
                <div className="grid grid-cols-2 gap-4">
                  {f30.numarMediuSalariati != null && (
                    <InfoCard label="Nr. mediu salariati" value={f30.numarMediuSalariati} />
                  )}
                  {f30.numarSalariati31Dec != null && (
                    <InfoCard label="Nr. salariati la 31 dec" value={f30.numarSalariati31Dec} />
                  )}
                </div>
              </>)}

              <div className="mt-3 text-xs text-slate-400">Sursa: Bilant ANAF uploadat</div>
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
            <div className="bg-white rounded-xl border border-slate-200/80 p-5 mb-5 space-y-3">
              {[
                { key: "insolventa", label: "Insolventa", value: sel.insolventa },
                { key: "dizolvare", label: "Dizolvare", value: sel.dizolvare },
                { key: "lichidare", label: "Lichidare", value: sel.lichidare },
                { key: "restrictii", label: "Restrictii", value: sel.restrictii },
              ].map(item => (
                <div key={item.key} className="flex items-center gap-3 text-sm">
                  <span className={item.value ? "text-red-500" : "text-emerald-500"}>{item.value ? "\u274C" : "\u2705"}</span>
                  <span className={`font-medium ${item.value ? "text-red-600" : "text-slate-900"}`}>{item.label}</span>
                </div>
              ))}
            </div>
            {!sel.insolventa && !sel.dizolvare && !sel.lichidare && !sel.restrictii && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-5 text-sm text-emerald-700 flex items-center gap-2">
                <span>&#9989;</span> Fara restrictii, insolventa, dizolvare sau lichidare
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <InfoCard label="Nr. Reg. Comertului" value={sel.regCom} />
              <InfoCard label="Forma juridica" value={FORME_JURIDICE.find(fj => fj.cod === sel.forma)?.label || sel.forma} />
            </div>
            <div className="mt-4">
              <InfoCard label="Ultima mentiune" accent>
                <div className="text-[13px] leading-relaxed text-slate-500">{sel.ultimaMentiune}</div>
              </InfoCard>
            </div>
          </>)}

          </div>
        </div>
      </>)}

      {/* ONRC UPLOAD MODAL */}
      {showOnrcUpload && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100]"
          onClick={e => { if (e.target === e.currentTarget) setShowOnrcUpload(false); }}
        >
          <div className="bg-white border border-slate-200/80 rounded-2xl w-[480px] max-h-[85vh] overflow-y-auto p-7 shadow-xl animate-[fadeUp_.2s_ease-out]">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-[18px] font-bold text-slate-900">Upload Certificat Constatator</h2>
              <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" onClick={() => setShowOnrcUpload(false)}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-[13px] mb-5 leading-relaxed text-slate-500">
              Încarcă un certificat constatator ONRC (PDF). Datele firmei se vor actualiza automat cu informațiile extrase.
            </p>
            <input type="file" ref={onrcFileRef} accept=".pdf" className="hidden" onChange={() => {}} />
            <div
              className="border-2 border-dashed border-slate-200 rounded-xl p-7 text-center mb-5 cursor-pointer hover:border-blue-300 hover:bg-slate-50/50 transition-all"
              onClick={() => onrcFileRef.current?.click()}
            >
              <div className="text-2xl mb-1.5">{onrcFileRef.current?.files?.[0] ? "✅" : "📄"}</div>
              <div className="text-[14px] font-medium text-slate-900">{onrcFileRef.current?.files?.[0]?.name || "Certificat constatator (PDF)"}</div>
              <div className="text-[12px] mt-1 text-slate-400">Click pentru a selecta fișierul</div>
            </div>
            <div className="flex gap-2 justify-end">
              <BtnSecondary onClick={() => setShowOnrcUpload(false)}>Anulează</BtnSecondary>
              <BtnPrimary disabled={onrcUploading} onClick={handleOnrcUpload}>
                {onrcUploading ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> : "Actualizează datele"}
              </BtnPrimary>
            </div>
          </div>
        </div>
      )}

      {/* BILANT ANAF UPLOAD MODAL */}
      {showBilantUpload && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100]"
          onClick={e => { if (e.target === e.currentTarget) setShowBilantUpload(false); }}
        >
          <div className="bg-white border border-slate-200/80 rounded-2xl w-[480px] max-h-[85vh] overflow-y-auto p-7 shadow-xl animate-[fadeUp_.2s_ease-out]">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-[18px] font-bold text-slate-900">Upload bilanț ANAF</h2>
              <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" onClick={() => setShowBilantUpload(false)}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-[13px] mb-5 leading-relaxed text-slate-500">
              Încarcă un bilanț ANAF (PDF descărcat din SPV). Se acceptă Formularul 10 (bilanț), Formularul 20 (cont profit/pierderi), Formularul 30/40. Datele financiare se extrag automat.
            </p>
            <div className="mb-4">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">An fiscal</label>
              <select
                value={bilantYear}
                onChange={e => setBilantYear(Number(e.target.value))}
                className="px-3.5 py-2.5 rounded-lg border border-slate-200/80 bg-white text-sm font-mono text-slate-900 w-[140px]"
              >
                {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 1 - i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <input type="file" ref={bilantFileRef} accept=".pdf" className="hidden" onChange={() => {}} />
            <div
              className="border-2 border-dashed border-slate-200 rounded-xl p-7 text-center mb-5 cursor-pointer hover:border-blue-300 hover:bg-slate-50/50 transition-all"
              onClick={() => bilantFileRef.current?.click()}
            >
              <div className="text-2xl mb-1.5">{bilantFileRef.current?.files?.[0] ? "✅" : "📊"}</div>
              <div className="text-[14px] font-medium text-slate-900">{bilantFileRef.current?.files?.[0]?.name || "Bilanț ANAF (PDF)"}</div>
              <div className="text-[12px] mt-1 text-slate-400">Click pentru a selecta fișierul</div>
            </div>
            <div className="flex gap-2 justify-end">
              <BtnSecondary onClick={() => setShowBilantUpload(false)}>Anulează</BtnSecondary>
              <BtnPrimary disabled={bilantUploading} onClick={handleBilantUpload}>
                {bilantUploading ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> : "Extrage date financiare"}
              </BtnPrimary>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
