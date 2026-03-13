"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { isSOC, isPF, FORME_JURIDICE, getCompanyTabs, getFieldLabel } from "@/hooks/useFormaJuridica";
import { apiGet, apiPost, apiDelete, api } from "@/lib/api";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { TypeBadge } from "@/components/shared/TypeBadge";
import { CardLabel } from "@/components/ui/CardLabel";

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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* LOADING STATE */}
      {loading && (
        <div className="flex-1 flex items-center justify-center flex-col gap-3 text-slate-400">
          <div className="w-7 h-7 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
          <div className="text-sm">Se incarca detaliile firmei...</div>
        </div>
      )}

      {/* ERROR STATE */}
      {!loading && error && (
        <div className="flex-1 flex items-center justify-center flex-col gap-3 text-slate-400">
          <div className="text-sm text-red-500">{error}</div>
          <button
            className="px-4 py-2 text-[13px] font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 mt-2"
            onClick={fetchDetail}
          >
            Reincearca
          </button>
          <Link href="/companies" className="text-[13px] font-semibold text-slate-500 hover:text-blue-600 mt-3">
            &larr; Inapoi la lista
          </Link>
        </div>
      )}

      {/* DETAIL VIEW */}
      {!loading && !error && sel && (<>
        {/* PROCESSING BANNER */}
        {sel.processingStatus === "processing" && (
          <div className="px-8 py-3.5 bg-blue-50/60 border-b border-blue-400 flex items-center gap-3 flex-shrink-0">
            <div className="w-[18px] h-[18px] border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
            <span className="text-sm font-semibold text-blue-600">Se proceseaza documentul... Datele firmei se actualizeaza automat.</span>
          </div>
        )}
        {sel.processingStatus === "error" && (
          <div className="px-8 py-3.5 bg-red-50/60 border-b border-red-400 flex items-center gap-3 flex-shrink-0">
            <span className="text-sm font-semibold text-red-500">Eroare la procesare: {sel.processingError || "Eroare necunoscuta"}</span>
            <button
              className="ml-auto px-4 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              onClick={() => setShowOnrcUpload(true)}
            >
              Reincearca upload
            </button>
          </div>
        )}

        {/* HEADER */}
        <PageHeader
          title={sel.denumire}
          subtitle={`CUI: ${sel.cui} \u00b7 ${sel.regCom || "\u2014"}`}
          badges={
            <>
              <TypeBadge type={sel.forma} />
              <StatusBadge status={sel.stare || "activ"} label={sel.stare} />
            </>
          }
        >
          <button
            className="px-4 py-2 text-[13px] font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            onClick={handleSyncOnrc}
          >
            Actualizare CUI
          </button>
          <button
            className="px-4 py-2 text-[13px] font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            onClick={() => setShowOnrcUpload(true)}
          >
            Upload ONRC
          </button>
          <button
            className="px-4 py-2 text-[13px] font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            onClick={() => setShowBilantUpload(true)}
          >
            Upload Bilant
          </button>
          <button
            className="px-4 py-2 text-[13px] font-medium text-red-600 bg-white border border-red-300 rounded-lg hover:bg-red-50"
            onClick={handleDelete}
          >
            Sterge
          </button>
        </PageHeader>

        {/* TABS */}
        <div className="flex border-b border-slate-200 bg-white px-8 flex-shrink-0 overflow-x-auto gap-0">
          {tabs.map(t => (
            <button
              key={t}
              className={`px-4 text-sm font-medium cursor-pointer transition-colors whitespace-nowrap ${
                activeTab === t
                  ? "text-blue-600 border-b-2 border-blue-600 pb-3 pt-3"
                  : "text-slate-600 hover:text-slate-900 pb-3 pt-3 border-b-2 border-transparent"
              }`}
              onClick={() => setActiveTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        {/* TAB CONTENT */}
        <div className="flex-1 overflow-y-auto px-8 py-6 bg-slate-50">

          {/* GENERAL */}
          {activeTab === "General" && (<>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
              <div className="bg-white rounded-xl border border-slate-200 p-4 col-span-2">
                <CardLabel label="Forma juridica" value={FORME_JURIDICE.find(fj => fj.cod === sel.forma)?.label || sel.forma} />
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <CardLabel label="Stare" value={<StatusBadge status={sel.stare || "activ"} label={sel.stare} />} />
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4 col-span-2">
                <CardLabel
                  label="Adresa"
                  value={
                    <>
                      <div>{sel.adresa || "\u2014"}</div>
                      <div className="text-xs text-slate-400 font-normal mt-1">
                        {sel.localitate || ""}{sel.localitate && sel.judet ? ", " : ""}{sel.judet || ""} {sel.codPostal || ""}
                      </div>
                    </>
                  }
                />
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <CardLabel label="Telefon" value={sel.telefon || "\u2014"} mono />
              </div>
              {sel.email && (
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <CardLabel label="Email" value={sel.email} mono />
                </div>
              )}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <CardLabel label={getFieldLabel("durata_label", sel.forma)} value={sel.durata || "\u2014"} />
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <CardLabel label="An infiintare" value={sel.anInfiintare || "\u2014"} mono />
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <CardLabel label="CAEN" value={`${sel.caen || "\u2014"} — ${sel.caenDesc}`} />
              </div>
            </div>
            {isPF(sel.forma) && sel.patrimoniu_afectat && (
              <div className="bg-white rounded-xl border border-slate-200 border-l-[3px] border-l-blue-500 p-4 mb-5">
                <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-1">Patrimoniu de afectatiune</div>
                <div className="text-[13px] text-slate-600 leading-relaxed">{sel.patrimoniu_afectat}</div>
              </div>
            )}
            <div className="bg-white rounded-xl border border-slate-200 border-l-[3px] border-l-blue-500 p-4 mb-5">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-1">Ultima mentiune</div>
              <div className="text-[13px] text-slate-600 leading-relaxed">{sel.ultimaMentiune}</div>
            </div>
            {isSOC(sel.forma) && sel.capitalSocial && (<>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-5 mb-3">Capital social</div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <CardLabel label="Subscris" value={fmt(sel.capitalSocial)} mono />
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <CardLabel label={getFieldLabel("parti_actiuni", sel.forma)} value={sel.partiSociale || sel.actiuni || "\u2014"} mono />
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <CardLabel label={getFieldLabel("valoare_parte", sel.forma)} value={fmt(sel.valoareParte || sel.valoareActiune)} mono />
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <CardLabel
                    label="Natura capital"
                    value={
                      <span className="text-xs">
                        privat autohton {sel.natura?.privatAutohton || sel.natura?.privat_autohton || 0}%
                        {((sel.natura?.privatStrain ?? sel.natura?.privat_strain ?? 0) > 0) ? `, strain ${sel.natura?.privatStrain || sel.natura?.privat_strain}%` : ""}
                        {((sel.natura?.stat ?? 0) > 0) ? `, stat ${sel.natura!.stat}%` : ""}
                      </span>
                    }
                  />
                </div>
              </div>
            </>)}
          </>)}

          {/* ASOCIATI / ACTIONARI */}
          {(activeTab === "Asociati" || activeTab === "Actionari") && (<>
            {sel.asociatiPJ.length > 0 && (<>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-2 mb-3">
                {getFieldLabel("asociati_label", sel.forma)} &mdash; Persoane Juridice ({sel.asociatiPJ.length})
              </div>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Denumire</th>
                      <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Calitate</th>
                      <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Tara</th>
                      <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Cota %</th>
                      <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Aport</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sel.asociatiPJ.map((a: any, i: number) => (
                      <tr key={i} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-900">{a.denumire}</td>
                        <td className="px-4 py-3 text-slate-600">{a.calitate}</td>
                        <td className="px-4 py-3 text-slate-600">{a.tara}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-600">{a.cotaBeneficii}%</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-600">{a.aport}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>)}
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-2 mb-3">
              {getFieldLabel("asociati_label", sel.forma)} &mdash; Persoane Fizice ({sel.asociatiPF.length})
            </div>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Nume</th>
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Calitate</th>
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Cetatenie</th>
                    <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Cota %</th>
                    <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">{sel.forma === "SA" ? "Actiuni" : "Parti soc."}</th>
                    <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Aport</th>
                  </tr>
                </thead>
                <tbody>
                  {sel.asociatiPF.map((a: any, i: number) => (
                    <tr key={i} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-900">{a.nume}</td>
                      <td className="px-4 py-3 text-slate-600">{a.calitate}</td>
                      <td className="px-4 py-3 text-slate-600">{a.cetatenie}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">{a.cotaBeneficii}%</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">{a.partiSociale || a.actiuni}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">{a.aport}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>)}

          {/* TITULAR (PFA/II) */}
          {activeTab === "Titular" && sel.titular && (<>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-2 mb-3">Titular</div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <CardLabel label="Nume" value={sel.titular.nume} />
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <CardLabel label="Cetatenie" value={sel.titular.cetatenie} />
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <CardLabel label="Data nasterii" value={sel.titular.dataNasterii} mono />
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <CardLabel label="Stare civila" value={sel.titular.stare_civila} />
              </div>
            </div>
          </>)}
          {activeTab === "Titular" && !sel.titular && (
            <div className="flex items-center justify-center flex-col gap-3 text-slate-400 py-16">
              <div className="text-4xl opacity-50">&#128100;</div>
              <div className="text-sm">Nicio informatie despre titular disponibila.</div>
            </div>
          )}

          {/* MEMBRI IF */}
          {activeTab === "Membri IF" && (<>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-2 mb-3">Reprezentant</div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 mb-5">
              <span className="text-lg">&#128084;</span>
              <div className="text-sm font-semibold text-slate-900">{sel.reprezentantIF || "\u2014"}</div>
              <span className="ml-auto text-xs font-mono text-slate-500">Reprezentant IF</span>
            </div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-2 mb-3">Membri ({(sel.membriIF || []).length})</div>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Nume</th>
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Calitate</th>
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Grad rudenie</th>
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Cetatenie</th>
                  </tr>
                </thead>
                <tbody>
                  {(sel.membriIF || []).map((m: any, i: number) => (
                    <tr key={i} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-900">{m.nume}</td>
                      <td className="px-4 py-3 text-slate-600">{m.calitate}</td>
                      <td className="px-4 py-3 text-slate-600">{m.gradRudenie}</td>
                      <td className="px-4 py-3 text-slate-600">{m.cetatenie}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>)}

          {/* ADMINISTRARE */}
          {activeTab === "Administrare" && (<>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-2 mb-3">
              {getFieldLabel("admin_label", sel.forma)} ({sel.administratori.length})
            </div>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Nume</th>
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Functie</th>
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Puteri</th>
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Mandat</th>
                  </tr>
                </thead>
                <tbody>
                  {sel.administratori.map((a: any, i: number) => (
                    <tr key={i} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-900">{a.nume}</td>
                      <td className="px-4 py-3 text-slate-600">{a.functie}</td>
                      <td className="px-4 py-3 text-slate-600">{a.puteri}</td>
                      <td className="px-4 py-3 text-slate-600">{a.durataMandatLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sel.cenzori && sel.cenzori.length > 0 && (<>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-5 mb-3">Cenzori / Auditori</div>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Nume</th>
                      <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Calitate</th>
                      <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Nr. autorizare</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sel.cenzori.map((c: any, i: number) => (
                      <tr key={i} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-900">{c.nume}</td>
                        <td className="px-4 py-3 text-slate-600">{c.calitate}</td>
                        <td className="px-4 py-3 font-mono text-slate-600">{c.nrAutorizare}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>)}
          </>)}

          {/* ACTIVITATI */}
          {activeTab === "Activitati" && (<>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-2 mb-3">Activitate principala</div>
            <div className="bg-white rounded-xl border border-blue-200 bg-blue-50/30 p-4 mb-5">
              <div className="text-[11px] uppercase tracking-wide text-blue-600 font-semibold mb-1">CAEN {sel.caen || "\u2014"}</div>
              <div className="text-[15px] font-semibold text-slate-900">{sel.caenDesc}</div>
            </div>
            {sel.activitatiSecundare.length > 0 && (<>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-5 mb-3">
                Activitati secundare ({sel.activitatiSecundare.length})
              </div>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {sel.activitatiSecundare.map((a: any, i: number) => (
                  <div
                    key={i}
                    className={`flex items-center gap-4 px-4 py-2.5 ${i > 0 ? "border-t border-slate-100" : ""}`}
                  >
                    <span className="font-mono text-xs text-slate-500 min-w-[55px]">{a.cod}</span>
                    <span className="text-sm text-slate-900">{a.den}</span>
                  </div>
                ))}
              </div>
            </>)}
          </>)}

          {/* SEDII */}
          {activeTab === "Sedii" && (<>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-2 mb-3">Sediu social</div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5">
              <CardLabel
                label="Adresa completa"
                value={`${sel.adresa || "\u2014"}, ${sel.localitate || ""}, ${sel.judet || ""} ${sel.codPostal || ""}`}
              />
            </div>
            {sel.sediiSecundare && sel.sediiSecundare.length > 0 && (<>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-5 mb-3">
                Sedii secundare / Puncte de lucru ({sel.sediiSecundare.length})
              </div>
              <div className="space-y-2">
                {sel.sediiSecundare.map((s: any, i: number) => (
                  <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
                    <span className="text-lg">&#128205;</span>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{s.denumire}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{s.adresa}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>)}
          </>)}

          {/* FIN. ONRC */}
          {activeTab === "Fin. ONRC" && (<>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-2 mb-3">Situatii financiare (din date ONRC)</div>
            {sel.situatiiFinanciare.length > 0 ? (
              <>
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">An</th>
                        <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Cifra afaceri</th>
                        <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Profit net</th>
                        <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Angajati</th>
                        {isSOC(sel.forma) && <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Capitaluri proprii</th>}
                        {isPF(sel.forma) && (<>
                          <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Venituri</th>
                          <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Cheltuieli</th>
                        </>)}
                      </tr>
                    </thead>
                    <tbody>
                      {sel.situatiiFinanciare.map((s: any, i: number) => (
                        <tr key={i} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-semibold text-slate-900">{s.an}</td>
                          <td className="px-4 py-3 text-right font-mono text-slate-600">{fmtLei(s.cifraAfaceri)}</td>
                          <td className={`px-4 py-3 text-right font-mono ${(s.profitNet ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmtLei(s.profitNet)}</td>
                          <td className="px-4 py-3 text-right font-mono text-slate-600">{s.angajati ?? "\u2014"}</td>
                          {isSOC(sel.forma) && <td className="px-4 py-3 text-right font-mono text-slate-600">{fmtLei(s.capitaluriProprii)}</td>}
                          {isPF(sel.forma) && (<>
                            <td className="px-4 py-3 text-right font-mono text-slate-600">{fmtLei(s.venituriTotale)}</td>
                            <td className="px-4 py-3 text-right font-mono text-slate-600">{fmtLei(s.cheltuieliTotale)}</td>
                          </>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 text-xs text-slate-400">Sursa: Date publice ONRC / termene.ro</div>
              </>
            ) : (
              <div className="flex items-center justify-center flex-col gap-3 text-slate-400 py-16">
                <div className="text-4xl opacity-50">&#128202;</div>
                <div className="text-sm">Nicio situatie financiara disponibila.</div>
              </div>
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
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Bilant ANAF</div>
                  {anafYears.length > 1 && (
                    <select
                      value={viewYear ?? ""}
                      onChange={e => setSelectedBilantYear(Number(e.target.value))}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 text-[13px] font-mono"
                    >
                      {anafYears.map((y: number) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  )}
                  {anafYears.length === 1 && <span className="text-sm font-mono text-slate-500">{viewYear}</span>}
                </div>
                <button
                  className="px-4 py-2 text-[13px] font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                  onClick={() => setShowBilantUpload(true)}
                >
                  Upload bilant
                </button>
              </div>

              {/* Summary table all years */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">An</th>
                      <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Cifra afaceri</th>
                      <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Profit net</th>
                      <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Rezultat exploatare</th>
                      <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Angajati</th>
                      {isSOC(sel.forma) && <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Capitaluri proprii</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {anafData.map((s: any, i: number) => (
                      <tr
                        key={i}
                        className={`border-t border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer ${s.an === viewYear ? "bg-blue-50/50" : ""}`}
                        onClick={() => setSelectedBilantYear(s.an)}
                      >
                        <td className={`px-4 py-3 ${s.an === viewYear ? "font-bold" : "font-medium"} text-slate-900`}>{s.an}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-600">{fmtLei(s.cifraAfaceri)}</td>
                        <td className={`px-4 py-3 text-right font-mono ${(s.profitNet ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmtLei(s.profitNet)}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-600">{fmtLei(raw?.f20?.rezultatExploatare)}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-600">{s.angajati ?? "\u2014"}</td>
                        {isSOC(sel.forma) && <td className="px-4 py-3 text-right font-mono text-slate-600">{fmtLei(s.capitaluriProprii)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Detailed data for selected year */}
              {f20 && (<>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-5 mb-3">Cont profit si pierderi ({viewYear})</div>
                <div className="grid grid-cols-2 gap-4 mb-5">
                  <div className="bg-white rounded-xl border border-slate-200 p-4"><CardLabel label="Cifra afaceri neta" value={fmtLei(f20.cifraAfaceriNeta)} mono /></div>
                  <div className="bg-white rounded-xl border border-slate-200 p-4"><CardLabel label="Venituri exploatare" value={fmtLei(f20.venituriExploatare)} mono /></div>
                  <div className="bg-white rounded-xl border border-slate-200 p-4"><CardLabel label="Cheltuieli exploatare" value={fmtLei(f20.cheltuieliExploatare)} mono /></div>
                  <div className="bg-white rounded-xl border border-slate-200 p-4"><CardLabel label="Rezultat exploatare" value={<span className={`font-mono ${(f20.rezultatExploatare ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmtLei(f20.rezultatExploatare)}</span>} /></div>
                  <div className="bg-white rounded-xl border border-slate-200 p-4"><CardLabel label="Venituri financiare" value={fmtLei(f20.venituriFinanciare)} mono /></div>
                  <div className="bg-white rounded-xl border border-slate-200 p-4"><CardLabel label="Cheltuieli financiare" value={fmtLei(f20.cheltuieliFinanciare)} mono /></div>
                  <div className="bg-white rounded-xl border border-slate-200 p-4"><CardLabel label="Rezultat brut" value={<span className={`font-mono ${(f20.rezultatBrut ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmtLei(f20.rezultatBrut)}</span>} /></div>
                  <div className="bg-white rounded-xl border border-slate-200 p-4"><CardLabel label="Rezultat net" value={<span className={`font-mono ${(f20.profitNet ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmtLei(f20.profitNet)}</span>} /></div>
                </div>
              </>)}

              {f10 && (<>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-5 mb-3">Bilant ({viewYear})</div>
                <div className="grid grid-cols-2 gap-4 mb-5">
                  <div className="bg-white rounded-xl border border-slate-200 p-4"><CardLabel label="Active imobilizate" value={fmtLei(f10.activeImobilizate)} mono /></div>
                  <div className="bg-white rounded-xl border border-slate-200 p-4"><CardLabel label="Active circulante" value={fmtLei(f10.activeCirculante)} mono /></div>
                  <div className="bg-white rounded-xl border border-slate-200 p-4"><CardLabel label="Stocuri" value={fmtLei(f10.stocuri)} mono /></div>
                  <div className="bg-white rounded-xl border border-slate-200 p-4"><CardLabel label="Creante" value={fmtLei(f10.creante)} mono /></div>
                  <div className="bg-white rounded-xl border border-slate-200 p-4"><CardLabel label="Casa si conturi" value={fmtLei(f10.casaSiConturi)} mono /></div>
                  <div className="bg-white rounded-xl border border-slate-200 p-4"><CardLabel label="Datorii sub 1 an" value={fmtLei(f10.datoriiSub1An)} mono /></div>
                  <div className="bg-white rounded-xl border border-slate-200 p-4"><CardLabel label="Datorii peste 1 an" value={fmtLei(f10.datoriiPeste1An)} mono /></div>
                  <div className="bg-white rounded-xl border border-slate-200 p-4"><CardLabel label="Capitaluri proprii" value={<span className={`font-mono ${(f10.capitaluriProprii ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmtLei(f10.capitaluriProprii)}</span>} /></div>
                </div>
              </>)}

              {f30 && (f30.numarMediuSalariati || f30.numarSalariati31Dec) && (<>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-5 mb-3">Date informative ({viewYear})</div>
                <div className="grid grid-cols-2 gap-4">
                  {f30.numarMediuSalariati != null && (
                    <div className="bg-white rounded-xl border border-slate-200 p-4"><CardLabel label="Nr. mediu salariati" value={f30.numarMediuSalariati} mono /></div>
                  )}
                  {f30.numarSalariati31Dec != null && (
                    <div className="bg-white rounded-xl border border-slate-200 p-4"><CardLabel label="Nr. salariati la 31 dec" value={f30.numarSalariati31Dec} mono /></div>
                  )}
                </div>
              </>)}

              <div className="mt-3 text-xs text-slate-400">Sursa: Bilant ANAF uploadat</div>
            </>) : (
              <div className="flex items-center justify-center flex-col gap-3 text-slate-400 py-16">
                <div className="text-4xl opacity-50">&#128202;</div>
                <div className="text-sm">Niciun bilant ANAF incarcat.</div>
                <button
                  className="mt-3 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-500 transition-colors"
                  onClick={() => setShowBilantUpload(true)}
                >
                  Upload bilant ANAF
                </button>
              </div>
            );
          })()}

          {/* JURIDIC */}
          {activeTab === "Juridic" && (<>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-2 mb-3">Stare juridica</div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5 space-y-2">
              <div className="flex items-center gap-3 text-sm">
                <span className={sel.insolventa ? "text-red-500" : "text-emerald-500"}>{sel.insolventa ? "\u274C" : "\u2705"}</span>
                <span className={`font-medium ${sel.insolventa ? "text-red-600" : "text-slate-700"}`}>Insolventa</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className={sel.dizolvare ? "text-red-500" : "text-emerald-500"}>{sel.dizolvare ? "\u274C" : "\u2705"}</span>
                <span className={`font-medium ${sel.dizolvare ? "text-red-600" : "text-slate-700"}`}>Dizolvare</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className={sel.lichidare ? "text-red-500" : "text-emerald-500"}>{sel.lichidare ? "\u274C" : "\u2705"}</span>
                <span className={`font-medium ${sel.lichidare ? "text-red-600" : "text-slate-700"}`}>Lichidare</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className={sel.restrictii ? "text-red-500" : "text-emerald-500"}>{sel.restrictii ? "\u274C" : "\u2705"}</span>
                <span className={`font-medium ${sel.restrictii ? "text-red-600" : "text-slate-700"}`}>Restrictii</span>
              </div>
            </div>
            {!sel.insolventa && !sel.dizolvare && !sel.lichidare && !sel.restrictii && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 mb-5 text-sm text-emerald-700 flex items-center gap-2">
                <span>\u2705</span> Fara restrictii, insolventa, dizolvare sau lichidare
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <CardLabel label="Nr. Reg. Comertului" value={sel.regCom} mono />
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <CardLabel label="Forma juridica" value={FORME_JURIDICE.find(fj => fj.cod === sel.forma)?.label || sel.forma} />
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 border-l-[3px] border-l-blue-500 p-4 mt-4">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-1">Ultima mentiune</div>
              <div className="text-[13px] text-slate-600 leading-relaxed">{sel.ultimaMentiune}</div>
            </div>
          </>)}

        </div>
      </>)}

      {/* ONRC UPLOAD MODAL */}
      {showOnrcUpload && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] animate-in fade-in"
          onClick={e => { if (e.target === e.currentTarget) setShowOnrcUpload(false); }}
        >
          <div className="bg-white border border-slate-200 rounded-2xl w-[480px] max-h-[85vh] overflow-y-auto p-7 animate-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-extrabold text-slate-900">Upload Certificat Constatator</h2>
              <button className="text-slate-400 hover:text-slate-900 text-lg p-1" onClick={() => setShowOnrcUpload(false)}>&times;</button>
            </div>
            <p className="text-[13px] text-slate-500 mb-5 leading-relaxed">
              Incarca un certificat constatator ONRC (PDF). Datele firmei se vor actualiza automat cu informatiile extrase.
            </p>
            <input type="file" ref={onrcFileRef} accept=".pdf" style={{ display: "none" }} onChange={() => {}} />
            <div
              className="border-2 border-dashed border-slate-200 rounded-xl p-7 text-center mb-5 cursor-pointer hover:border-blue-500 hover:bg-blue-50/30 transition-all"
              onClick={() => onrcFileRef.current?.click()}
            >
              <div className="text-2xl mb-1.5">{onrcFileRef.current?.files?.[0] ? "\u2705" : "\ud83d\udcc4"}</div>
              <div className="text-sm font-semibold text-slate-900">{onrcFileRef.current?.files?.[0]?.name || "Certificat constatator (PDF)"}</div>
              <div className="text-xs text-slate-400 mt-1">Click pentru a selecta fisierul</div>
            </div>
            <div className="flex gap-2.5 justify-end">
              <button
                className="px-5 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-semibold hover:border-slate-300 hover:text-slate-900 transition-colors"
                onClick={() => setShowOnrcUpload(false)}
              >
                Anuleaza
              </button>
              <button
                className="px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={onrcUploading}
                onClick={handleOnrcUpload}
              >
                {onrcUploading ? <span className="inline-block w-[18px] h-[18px] border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Actualizeaza datele"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BILANT ANAF UPLOAD MODAL */}
      {showBilantUpload && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] animate-in fade-in"
          onClick={e => { if (e.target === e.currentTarget) setShowBilantUpload(false); }}
        >
          <div className="bg-white border border-slate-200 rounded-2xl w-[480px] max-h-[85vh] overflow-y-auto p-7 animate-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-extrabold text-slate-900">Upload bilant ANAF</h2>
              <button className="text-slate-400 hover:text-slate-900 text-lg p-1" onClick={() => setShowBilantUpload(false)}>&times;</button>
            </div>
            <p className="text-[13px] text-slate-500 mb-5 leading-relaxed">
              Incarca un bilant ANAF (PDF descarcat din SPV). Se accepta Formularul 10 (bilant), Formularul 20 (cont profit/pierderi), Formularul 30/40. Datele financiare se extrag automat.
            </p>
            <div className="mb-4">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">An fiscal</label>
              <select
                value={bilantYear}
                onChange={e => setBilantYear(Number(e.target.value))}
                className="px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 text-sm font-mono w-[140px]"
              >
                {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 1 - i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <input type="file" ref={bilantFileRef} accept=".pdf" style={{ display: "none" }} onChange={() => {}} />
            <div
              className="border-2 border-dashed border-slate-200 rounded-xl p-7 text-center mb-5 cursor-pointer hover:border-blue-500 hover:bg-blue-50/30 transition-all"
              onClick={() => bilantFileRef.current?.click()}
            >
              <div className="text-2xl mb-1.5">{bilantFileRef.current?.files?.[0] ? "\u2705" : "\ud83d\udcca"}</div>
              <div className="text-sm font-semibold text-slate-900">{bilantFileRef.current?.files?.[0]?.name || "Bilant ANAF (PDF)"}</div>
              <div className="text-xs text-slate-400 mt-1">Click pentru a selecta fisierul</div>
            </div>
            <div className="flex gap-2.5 justify-end">
              <button
                className="px-5 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-semibold hover:border-slate-300 hover:text-slate-900 transition-colors"
                onClick={() => setShowBilantUpload(false)}
              >
                Anuleaza
              </button>
              <button
                className="px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={bilantUploading}
                onClick={handleBilantUpload}
              >
                {bilantUploading ? <span className="inline-block w-[18px] h-[18px] border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Extrage date financiare"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
