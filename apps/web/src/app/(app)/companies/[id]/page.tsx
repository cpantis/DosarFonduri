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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* LOADING STATE */}
      {loading && (
        <div className="flex-1 flex items-center justify-center flex-col gap-3" style={{ color: "var(--text-muted)" }}>
          <div className="w-7 h-7 border-2 border-t-blue-600 rounded-full animate-spin" style={{ borderColor: "var(--border)" }} />
          <div className="text-sm">Se incarca detaliile firmei...</div>
        </div>
      )}

      {/* ERROR STATE */}
      {!loading && error && (
        <div className="flex-1 flex items-center justify-center flex-col gap-3" style={{ color: "var(--text-muted)" }}>
          <div className="text-sm" style={{ color: "var(--accent-red)" }}>{error}</div>
          <button
            className="px-4 py-2 text-[13px] font-medium border rounded-lg hover: mt-2" style={{ color: "var(--text-primary)", background: "var(--bg-elevated)", borderColor: "var(--border-active)" }}
            onClick={fetchDetail}
          >
            Reincearca
          </button>
          <Link href="/companies" className="text-[13px] font-semibold hover: mt-3" style={{ color: "var(--accent-blue)" }}>
            &larr; Inapoi la lista
          </Link>
        </div>
      )}

      {/* DETAIL VIEW */}
      {!loading && !error && sel && (<>
        {/* PROCESSING BANNER */}
        {sel.processingStatus === "processing" && (
          <div className="px-8 py-3.5 /60 border-b flex items-center gap-3 flex-shrink-0" style={{ background: "var(--accent-blue-bg)", borderColor: "var(--accent-blue-border)" }}>
            <div className="w-[18px] h-[18px] border-2 border-t-blue-600 rounded-full animate-spin" style={{ borderColor: "var(--border)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--accent-blue)" }}>Se proceseaza documentul... Datele firmei se actualizeaza automat.</span>
          </div>
        )}
        {sel.processingStatus === "error" && (
          <div className="px-8 py-3.5 /60 border-b border-red-400 flex items-center gap-3 flex-shrink-0" style={{ background: "var(--accent-red-bg)" }}>
            <span className="text-sm font-semibold" style={{ color: "var(--accent-red)" }}>Eroare la procesare: {sel.processingError || "Eroare necunoscuta"}</span>
            <button
              className="ml-auto px-4 py-1.5 text-xs font-medium border rounded-lg hover:" style={{ color: "var(--text-primary)", background: "var(--bg-elevated)", borderColor: "var(--border-active)" }}
              onClick={() => setShowOnrcUpload(true)}
            >
              Reincearca upload
            </button>
          </div>
        )}

        {/* HEADER */}
        <PageHeader
          title={sel.denumire}
          subtitle={`CUI: ${sel.cui} \u00b7 ${sel.regCom || "\u2014"}${sel.euid ? ` \u00b7 EUID: ${sel.euid}` : ""}`}
          badges={
            <>
              <TypeBadge type={sel.forma} />
              <StatusBadge status={sel.stare || "activ"} label={sel.stare} />
            </>
          }
        >
          <button
            className="px-4 py-2 text-[13px] font-medium border rounded-lg hover:" style={{ color: "var(--text-primary)", background: "var(--bg-elevated)", borderColor: "var(--border-active)" }}
            onClick={handleSyncOnrc}
          >
            Actualizare CUI
          </button>
          <button
            className="px-4 py-2 text-[13px] font-medium border rounded-lg hover:" style={{ color: "var(--text-primary)", background: "var(--bg-elevated)", borderColor: "var(--border-active)" }}
            onClick={() => setShowOnrcUpload(true)}
          >
            Upload ONRC
          </button>
          <button
            className="px-4 py-2 text-[13px] font-medium border rounded-lg hover:" style={{ color: "var(--text-primary)", background: "var(--bg-elevated)", borderColor: "var(--border-active)" }}
            onClick={() => setShowBilantUpload(true)}
          >
            Upload Bilant
          </button>
          <button
            className="px-4 py-2 text-[13px] font-medium border rounded-lg hover:" style={{ color: "var(--accent-red)", background: "var(--accent-red-bg)", borderColor: "var(--accent-red-border)" }}
            onClick={handleDelete}
          >
            Sterge
          </button>
        </PageHeader>

        {/* TABS */}
        <div className="flex border-b px-8 flex-shrink-0 overflow-x-auto gap-0" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
          {tabs.map(t => (
            <button
              key={t}
              className="px-4 text-sm font-medium cursor-pointer transition-colors whitespace-nowrap pb-3 pt-3 border-b-2"
              style={activeTab === t
                ? { color: "var(--accent-blue)", borderBottomColor: "var(--accent-blue)" }
                : { color: "var(--text-secondary)", borderBottomColor: "transparent" }
              }
              onClick={() => setActiveTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        {/* TAB CONTENT */}
        <div className="flex-1 overflow-y-auto px-8 py-6" style={{ background: "var(--bg-elevated)" }}>

          {/* GENERAL */}
          {activeTab === "General" && (<>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
              <div className="rounded-xl border p-4 col-span-2" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                <CardLabel label="Forma juridica" value={FORME_JURIDICE.find(fj => fj.cod === sel.forma)?.label || sel.forma} />
              </div>
              <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                <CardLabel label="Stare" value={<StatusBadge status={sel.stare || "activ"} label={sel.stare} />} />
              </div>
              <div className="rounded-xl border p-4 col-span-2" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                <CardLabel
                  label="Adresa"
                  value={
                    <>
                      <div>{sel.adresa || "\u2014"}</div>
                      <div className="text-xs font-normal mt-1" style={{ color: "var(--text-muted)" }}>
                        {sel.localitate || ""}{sel.localitate && sel.judet ? ", " : ""}{sel.judet || ""} {sel.codPostal || ""}
                      </div>
                    </>
                  }
                />
              </div>
              <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                <CardLabel label="Telefon" value={sel.telefon || "\u2014"} mono />
              </div>
              {sel.email && (
                <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                  <CardLabel label="Email" value={sel.email} mono />
                </div>
              )}
              {sel.website && (
                <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                  <CardLabel label="Website" value={<a href={sel.website.startsWith('http') ? sel.website : `https://${sel.website}`} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "var(--accent-blue)" }}>{sel.website}</a>} />
                </div>
              )}
              <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                <CardLabel label={getFieldLabel("durata_label", sel.forma)} value={sel.durata || "\u2014"} />
              </div>
              <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                <CardLabel label="An infiintare" value={sel.anInfiintare || "\u2014"} mono />
              </div>
              <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                <CardLabel label="CAEN" value={`${sel.caen || "\u2014"} — ${sel.caenDesc}`} />
              </div>
              {sel.regCom && (
                <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                  <CardLabel label="Reg. Com." value={sel.regCom} mono />
                </div>
              )}
              {sel.euid && (
                <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                  <CardLabel label="EUID" value={sel.euid} mono />
                </div>
              )}
            </div>
            {sel.activitatiSecundare && sel.activitatiSecundare.length > 0 && (
              <div className="rounded-xl border p-4 mt-4 mb-1" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                <div className="text-[11px] uppercase tracking-wide font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Activitati secundare ({sel.activitatiSecundare.length})</div>
                <div className="flex flex-wrap gap-2">
                  {sel.activitatiSecundare.slice(0, 5).map((a: any, i: number) => (
                    <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[12px]" style={{ color: "var(--text-secondary)", background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
                      <span className="font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>{a.cod}</span>
                      {a.den}
                    </span>
                  ))}
                  {sel.activitatiSecundare.length > 5 && (
                    <button className="text-[12px] font-semibold hover:underline cursor-pointer border-none bg-transparent" style={{ color: "var(--accent-blue)" }} onClick={() => setActiveTab("Activitati")}>
                      +{sel.activitatiSecundare.length - 5} mai multe
                    </button>
                  )}
                </div>
              </div>
            )}
            {isPF(sel.forma) && sel.patrimoniu_afectat && (
              <div className="rounded-xl border border-l-[3px] border-l-blue-500 p-4 mb-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                <div className="text-[11px] uppercase tracking-wide font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Patrimoniu de afectatiune</div>
                <div className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{sel.patrimoniu_afectat}</div>
              </div>
            )}
            <div className="rounded-xl border border-l-[3px] border-l-blue-500 p-4 mb-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              <div className="text-[11px] uppercase tracking-wide font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Ultima mentiune</div>
              <div className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{sel.ultimaMentiune}</div>
            </div>
            {isSOC(sel.forma) && sel.capitalSocial && (<>
              <div className="text-xs font-bold uppercase tracking-wider mt-5 mb-3" style={{ color: "var(--text-muted)" }}>Capital social</div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                  <CardLabel label="Subscris" value={fmt(sel.capitalSocial)} mono />
                </div>
                <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                  <CardLabel label={getFieldLabel("parti_actiuni", sel.forma)} value={sel.partiSociale || sel.actiuni || "\u2014"} mono />
                </div>
                <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                  <CardLabel label={getFieldLabel("valoare_parte", sel.forma)} value={fmt(sel.valoareParte || sel.valoareActiune)} mono />
                </div>
                <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
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
              <div className="text-xs font-bold uppercase tracking-wider mt-2 mb-3" style={{ color: "var(--text-muted)" }}>
                {getFieldLabel("asociati_label", sel.forma)} &mdash; Persoane Juridice ({sel.asociatiPJ.length})
              </div>
              <div className="rounded-xl border overflow-hidden mb-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="" style={{ background: "var(--bg-elevated)" }}>
                      <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>Denumire</th>
                      <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>Calitate</th>
                      <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>Tara</th>
                      <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>Cota %</th>
                      <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>Aport</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sel.asociatiPJ.map((a: any, i: number) => (
                      <tr key={i} className="border-t hover: transition-colors" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
                        <td className="px-4 py-3 font-medium" style={{ color: "var(--text-primary)" }}>{a.denumire}</td>
                        <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{a.calitate}</td>
                        <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{a.tara}</td>
                        <td className="px-4 py-3 text-right font-mono" style={{ color: "var(--text-secondary)" }}>{a.cotaBeneficii}%</td>
                        <td className="px-4 py-3 text-right font-mono" style={{ color: "var(--text-secondary)" }}>{a.aport}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>)}
            <div className="text-xs font-bold uppercase tracking-wider mt-2 mb-3" style={{ color: "var(--text-muted)" }}>
              {getFieldLabel("asociati_label", sel.forma)} &mdash; Persoane Fizice ({sel.asociatiPF.length})
            </div>
            <div className="rounded-xl border overflow-hidden" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="" style={{ background: "var(--bg-elevated)" }}>
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>Nume</th>
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>Calitate</th>
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>Cetatenie</th>
                    <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>Cota %</th>
                    <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>{sel.forma === "SA" ? "Actiuni" : "Parti soc."}</th>
                    <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>Aport</th>
                  </tr>
                </thead>
                <tbody>
                  {sel.asociatiPF.map((a: any, i: number) => (
                    <tr key={i} className="border-t hover: transition-colors" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
                      <td className="px-4 py-3 font-medium" style={{ color: "var(--text-primary)" }}>{a.nume}</td>
                      <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{a.calitate}</td>
                      <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{a.cetatenie}</td>
                      <td className="px-4 py-3 text-right font-mono" style={{ color: "var(--text-secondary)" }}>{a.cotaBeneficii}%</td>
                      <td className="px-4 py-3 text-right font-mono" style={{ color: "var(--text-secondary)" }}>{a.partiSociale || a.actiuni}</td>
                      <td className="px-4 py-3 text-right font-mono" style={{ color: "var(--text-secondary)" }}>{a.aport}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>)}

          {/* TITULAR (PFA/II) */}
          {activeTab === "Titular" && sel.titular && (<>
            <div className="text-xs font-bold uppercase tracking-wider mt-2 mb-3" style={{ color: "var(--text-muted)" }}>Titular</div>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                <CardLabel label="Nume" value={sel.titular.nume} />
              </div>
              <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                <CardLabel label="Cetatenie" value={sel.titular.cetatenie} />
              </div>
              <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                <CardLabel label="Data nasterii" value={sel.titular.dataNasterii} mono />
              </div>
              <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                <CardLabel label="Stare civila" value={sel.titular.stare_civila} />
              </div>
            </div>
          </>)}
          {activeTab === "Titular" && !sel.titular && (
            <div className="flex items-center justify-center flex-col gap-3 py-16" style={{ color: "var(--text-muted)" }}>
              <div className="text-4xl opacity-50">&#128100;</div>
              <div className="text-sm">Nicio informatie despre titular disponibila.</div>
            </div>
          )}

          {/* MEMBRI IF */}
          {activeTab === "Membri IF" && (<>
            <div className="text-xs font-bold uppercase tracking-wider mt-2 mb-3" style={{ color: "var(--text-muted)" }}>Reprezentant</div>
            <div className="rounded-xl border p-4 flex items-center gap-3 mb-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              <span className="text-lg">&#128084;</span>
              <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{sel.reprezentantIF || "\u2014"}</div>
              <span className="ml-auto text-xs font-mono" style={{ color: "var(--text-secondary)" }}>Reprezentant IF</span>
            </div>
            <div className="text-xs font-bold uppercase tracking-wider mt-2 mb-3" style={{ color: "var(--text-muted)" }}>Membri ({(sel.membriIF || []).length})</div>
            <div className="rounded-xl border overflow-hidden" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="" style={{ background: "var(--bg-elevated)" }}>
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>Nume</th>
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>Calitate</th>
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>Grad rudenie</th>
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>Cetatenie</th>
                  </tr>
                </thead>
                <tbody>
                  {(sel.membriIF || []).map((m: any, i: number) => (
                    <tr key={i} className="border-t hover: transition-colors" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
                      <td className="px-4 py-3 font-medium" style={{ color: "var(--text-primary)" }}>{m.nume}</td>
                      <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{m.calitate}</td>
                      <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{m.gradRudenie}</td>
                      <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{m.cetatenie}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>)}

          {/* ADMINISTRARE */}
          {activeTab === "Administrare" && (<>
            <div className="text-xs font-bold uppercase tracking-wider mt-2 mb-3" style={{ color: "var(--text-muted)" }}>
              {getFieldLabel("admin_label", sel.forma)} ({sel.administratori.length})
            </div>
            <div className="rounded-xl border overflow-hidden mb-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="" style={{ background: "var(--bg-elevated)" }}>
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>Nume</th>
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>Functie</th>
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>Puteri</th>
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>Mandat</th>
                  </tr>
                </thead>
                <tbody>
                  {sel.administratori.map((a: any, i: number) => (
                    <tr key={i} className="border-t hover: transition-colors" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
                      <td className="px-4 py-3 font-medium" style={{ color: "var(--text-primary)" }}>{a.nume}</td>
                      <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{a.functie}</td>
                      <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{a.puteri}</td>
                      <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{a.durataMandatLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sel.cenzori && sel.cenzori.length > 0 && (<>
              <div className="text-xs font-bold uppercase tracking-wider mt-5 mb-3" style={{ color: "var(--text-muted)" }}>Cenzori / Auditori</div>
              <div className="rounded-xl border overflow-hidden" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="" style={{ background: "var(--bg-elevated)" }}>
                      <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>Nume</th>
                      <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>Calitate</th>
                      <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>Nr. autorizare</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sel.cenzori.map((c: any, i: number) => (
                      <tr key={i} className="border-t hover: transition-colors" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
                        <td className="px-4 py-3 font-medium" style={{ color: "var(--text-primary)" }}>{c.nume}</td>
                        <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{c.calitate}</td>
                        <td className="px-4 py-3 font-mono" style={{ color: "var(--text-secondary)" }}>{c.nrAutorizare}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>)}
          </>)}

          {/* ACTIVITATI */}
          {activeTab === "Activitati" && (<>
            <div className="text-xs font-bold uppercase tracking-wider mt-2 mb-3" style={{ color: "var(--text-muted)" }}>Activitate principala</div>
            <div className="rounded-xl border /30 p-4 mb-5" style={{ background: "var(--accent-blue-bg)", borderColor: "var(--accent-blue-border)" }}>
              <div className="text-[11px] uppercase tracking-wide font-semibold mb-1" style={{ color: "var(--accent-blue)" }}>CAEN {sel.caen || "\u2014"}</div>
              <div className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>{sel.caenDesc}</div>
            </div>
            {sel.activitatiSecundare.length > 0 && (<>
              <div className="text-xs font-bold uppercase tracking-wider mt-5 mb-3" style={{ color: "var(--text-muted)" }}>
                Activitati secundare ({sel.activitatiSecundare.length})
              </div>
              <div className="rounded-xl border overflow-hidden" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                {sel.activitatiSecundare.map((a: any, i: number) => (
                  <div
                    key={i}
                    className="flex items-center gap-4 px-4 py-2.5"
                    style={i > 0 ? { borderTop: "1px solid var(--border)" } : undefined}
                  >
                    <span className="font-mono text-xs min-w-[55px]" style={{ color: "var(--text-secondary)" }}>{a.cod}</span>
                    <span className="text-sm" style={{ color: "var(--text-primary)" }}>{a.den}</span>
                  </div>
                ))}
              </div>
            </>)}
          </>)}

          {/* SEDII */}
          {activeTab === "Sedii" && (<>
            <div className="text-xs font-bold uppercase tracking-wider mt-2 mb-3" style={{ color: "var(--text-muted)" }}>Sediu social</div>
            <div className="rounded-xl border p-4 mb-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              <CardLabel
                label="Adresa completa"
                value={`${sel.adresa || "\u2014"}, ${sel.localitate || ""}, ${sel.judet || ""} ${sel.codPostal || ""}`}
              />
            </div>
            {sel.sediiSecundare && sel.sediiSecundare.length > 0 && (<>
              <div className="text-xs font-bold uppercase tracking-wider mt-5 mb-3" style={{ color: "var(--text-muted)" }}>
                Sedii secundare / Puncte de lucru ({sel.sediiSecundare.length})
              </div>
              <div className="space-y-2">
                {sel.sediiSecundare.map((s: any, i: number) => (
                  <div key={i} className="rounded-xl border p-4 flex items-center gap-3" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                    <span className="text-lg">&#128205;</span>
                    <div>
                      <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{s.denumire}</div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{s.adresa}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>)}
          </>)}

          {/* FIN. ONRC */}
          {activeTab === "Fin. ONRC" && (<>
            <div className="text-xs font-bold uppercase tracking-wider mt-2 mb-3" style={{ color: "var(--text-muted)" }}>Situatii financiare (din date ONRC)</div>
            {sel.situatiiFinanciare.length > 0 ? (
              <>
                <div className="rounded-xl border overflow-hidden" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="" style={{ background: "var(--bg-elevated)" }}>
                        <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>An</th>
                        <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>Cifra afaceri</th>
                        <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>Profit net</th>
                        <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>Angajati</th>
                        {isSOC(sel.forma) && <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>Capitaluri proprii</th>}
                        {isPF(sel.forma) && (<>
                          <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>Venituri</th>
                          <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>Cheltuieli</th>
                        </>)}
                      </tr>
                    </thead>
                    <tbody>
                      {sel.situatiiFinanciare.map((s: any, i: number) => (
                        <tr key={i} className="border-t hover: transition-colors" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
                          <td className="px-4 py-3 font-semibold" style={{ color: "var(--text-primary)" }}>{s.an}</td>
                          <td className="px-4 py-3 text-right font-mono" style={{ color: "var(--text-secondary)" }}>{fmtLei(s.cifraAfaceri)}</td>
                          <td className="px-4 py-3 text-right font-mono" style={{ color: (s.profitNet ?? 0) >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>{fmtLei(s.profitNet)}</td>
                          <td className="px-4 py-3 text-right font-mono" style={{ color: "var(--text-secondary)" }}>{s.angajati ?? "\u2014"}</td>
                          {isSOC(sel.forma) && <td className="px-4 py-3 text-right font-mono" style={{ color: "var(--text-secondary)" }}>{fmtLei(s.capitaluriProprii)}</td>}
                          {isPF(sel.forma) && (<>
                            <td className="px-4 py-3 text-right font-mono" style={{ color: "var(--text-secondary)" }}>{fmtLei(s.venituriTotale)}</td>
                            <td className="px-4 py-3 text-right font-mono" style={{ color: "var(--text-secondary)" }}>{fmtLei(s.cheltuieliTotale)}</td>
                          </>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>Sursa: Date publice ONRC / termene.ro</div>
              </>
            ) : (
              <div className="flex items-center justify-center flex-col gap-3 py-16" style={{ color: "var(--text-muted)" }}>
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
                  <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Bilant ANAF</div>
                  {anafYears.length > 1 && (
                    <select
                      value={viewYear ?? ""}
                      onChange={e => setSelectedBilantYear(Number(e.target.value))}
                      className="px-2.5 py-1.5 rounded-lg border text-[13px] font-mono" style={{ color: "var(--text-primary)", background: "var(--bg-elevated)", borderColor: "var(--border)" }}
                    >
                      {anafYears.map((y: number) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  )}
                  {anafYears.length === 1 && <span className="text-sm font-mono" style={{ color: "var(--text-secondary)" }}>{viewYear}</span>}
                </div>
                <button
                  className="px-4 py-2 text-[13px] font-medium border rounded-lg hover:" style={{ color: "var(--text-primary)", background: "var(--bg-elevated)", borderColor: "var(--border-active)" }}
                  onClick={() => setShowBilantUpload(true)}
                >
                  Upload bilant
                </button>
              </div>

              {/* Summary table all years */}
              <div className="rounded-xl border overflow-hidden mb-6" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="" style={{ background: "var(--bg-elevated)" }}>
                      <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>An</th>
                      <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>Cifra afaceri</th>
                      <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>Profit net</th>
                      <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>Rezultat exploatare</th>
                      <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>Angajati</th>
                      {isSOC(sel.forma) && <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-secondary)" }}>Capitaluri proprii</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {anafData.map((s: any, i: number) => (
                      <tr
                        key={i}
                        className="transition-colors cursor-pointer"
                        style={{ borderTop: "1px solid var(--border)", background: s.an === viewYear ? "var(--accent-blue-bg)" : undefined }}
                        onClick={() => setSelectedBilantYear(s.an)}
                      >
                        <td className={`px-4 py-3 ${s.an === viewYear ? "font-bold" : "font-medium"}`} style={{ color: "var(--text-primary)" }}>{s.an}</td>
                        <td className="px-4 py-3 text-right font-mono" style={{ color: "var(--text-secondary)" }}>{fmtLei(s.cifraAfaceri)}</td>
                        <td className="px-4 py-3 text-right font-mono" style={{ color: (s.profitNet ?? 0) >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>{fmtLei(s.profitNet)}</td>
                        <td className="px-4 py-3 text-right font-mono" style={{ color: "var(--text-secondary)" }}>{fmtLei(raw?.f20?.rezultatExploatare)}</td>
                        <td className="px-4 py-3 text-right font-mono" style={{ color: "var(--text-secondary)" }}>{s.angajati ?? "\u2014"}</td>
                        {isSOC(sel.forma) && <td className="px-4 py-3 text-right font-mono" style={{ color: "var(--text-secondary)" }}>{fmtLei(s.capitaluriProprii)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Detailed data for selected year */}
              {f20 && (<>
                <div className="text-xs font-bold uppercase tracking-wider mt-5 mb-3" style={{ color: "var(--text-muted)" }}>Cont profit si pierderi ({viewYear})</div>
                <div className="grid grid-cols-2 gap-4 mb-5">
                  <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><CardLabel label="Cifra afaceri neta" value={fmtLei(f20.cifraAfaceriNeta)} mono /></div>
                  <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><CardLabel label="Venituri exploatare" value={fmtLei(f20.venituriExploatare)} mono /></div>
                  <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><CardLabel label="Cheltuieli exploatare" value={fmtLei(f20.cheltuieliExploatare)} mono /></div>
                  <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><CardLabel label="Rezultat exploatare" value={<span className="font-mono" style={{ color: (f20.rezultatExploatare ?? 0) >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>{fmtLei(f20.rezultatExploatare)}</span>} /></div>
                  <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><CardLabel label="Venituri financiare" value={fmtLei(f20.venituriFinanciare)} mono /></div>
                  <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><CardLabel label="Cheltuieli financiare" value={fmtLei(f20.cheltuieliFinanciare)} mono /></div>
                  <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><CardLabel label="Rezultat brut" value={<span className="font-mono" style={{ color: (f20.rezultatBrut ?? 0) >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>{fmtLei(f20.rezultatBrut)}</span>} /></div>
                  <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><CardLabel label="Rezultat net" value={<span className="font-mono" style={{ color: (f20.profitNet ?? 0) >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>{fmtLei(f20.profitNet)}</span>} /></div>
                </div>
              </>)}

              {f10 && (<>
                <div className="text-xs font-bold uppercase tracking-wider mt-5 mb-3" style={{ color: "var(--text-muted)" }}>Bilant ({viewYear})</div>
                <div className="grid grid-cols-2 gap-4 mb-5">
                  <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><CardLabel label="Active imobilizate" value={fmtLei(f10.activeImobilizate)} mono /></div>
                  <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><CardLabel label="Active circulante" value={fmtLei(f10.activeCirculante)} mono /></div>
                  <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><CardLabel label="Stocuri" value={fmtLei(f10.stocuri)} mono /></div>
                  <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><CardLabel label="Creante" value={fmtLei(f10.creante)} mono /></div>
                  <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><CardLabel label="Casa si conturi" value={fmtLei(f10.casaSiConturi)} mono /></div>
                  <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><CardLabel label="Datorii sub 1 an" value={fmtLei(f10.datoriiSub1An)} mono /></div>
                  <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><CardLabel label="Datorii peste 1 an" value={fmtLei(f10.datoriiPeste1An)} mono /></div>
                  <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><CardLabel label="Capitaluri proprii" value={<span className="font-mono" style={{ color: (f10.capitaluriProprii ?? 0) >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>{fmtLei(f10.capitaluriProprii)}</span>} /></div>
                </div>
              </>)}

              {f30 && (f30.numarMediuSalariati || f30.numarSalariati31Dec) && (<>
                <div className="text-xs font-bold uppercase tracking-wider mt-5 mb-3" style={{ color: "var(--text-muted)" }}>Date informative ({viewYear})</div>
                <div className="grid grid-cols-2 gap-4">
                  {f30.numarMediuSalariati != null && (
                    <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><CardLabel label="Nr. mediu salariati" value={f30.numarMediuSalariati} mono /></div>
                  )}
                  {f30.numarSalariati31Dec != null && (
                    <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}><CardLabel label="Nr. salariati la 31 dec" value={f30.numarSalariati31Dec} mono /></div>
                  )}
                </div>
              </>)}

              <div className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>Sursa: Bilant ANAF uploadat</div>
            </>) : (
              <div className="flex items-center justify-center flex-col gap-3 py-16" style={{ color: "var(--text-muted)" }}>
                <div className="text-4xl opacity-50">&#128202;</div>
                <div className="text-sm">Niciun bilant ANAF incarcat.</div>
                <button
                  className="mt-3 px-5 py-2.5 rounded-lg text-sm font-bold hover: transition-colors" style={{ color: "var(--text-on-accent)", background: "var(--accent-blue)" }}
                  onClick={() => setShowBilantUpload(true)}
                >
                  Upload bilant ANAF
                </button>
              </div>
            );
          })()}

          {/* JURIDIC */}
          {activeTab === "Juridic" && (<>
            <div className="text-xs font-bold uppercase tracking-wider mt-2 mb-3" style={{ color: "var(--text-muted)" }}>Stare juridica</div>
            <div className="rounded-xl border p-4 mb-5 space-y-2" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              <div className="flex items-center gap-3 text-sm">
                <span style={{ color: sel.insolventa ? "var(--accent-red)" : "var(--accent-green)" }}>{sel.insolventa ? "\u274C" : "\u2705"}</span>
                <span className="font-medium" style={{ color: sel.insolventa ? "var(--accent-red)" : "var(--text-primary)" }}>Insolventa</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span style={{ color: sel.dizolvare ? "var(--accent-red)" : "var(--accent-green)" }}>{sel.dizolvare ? "\u274C" : "\u2705"}</span>
                <span className="font-medium" style={{ color: sel.dizolvare ? "var(--accent-red)" : "var(--text-primary)" }}>Dizolvare</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span style={{ color: sel.lichidare ? "var(--accent-red)" : "var(--accent-green)" }}>{sel.lichidare ? "\u274C" : "\u2705"}</span>
                <span className="font-medium" style={{ color: sel.lichidare ? "var(--accent-red)" : "var(--text-primary)" }}>Lichidare</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span style={{ color: sel.restrictii ? "var(--accent-red)" : "var(--accent-green)" }}>{sel.restrictii ? "\u274C" : "\u2705"}</span>
                <span className="font-medium" style={{ color: sel.restrictii ? "var(--accent-red)" : "var(--text-primary)" }}>Restrictii</span>
              </div>
            </div>
            {!sel.insolventa && !sel.dizolvare && !sel.lichidare && !sel.restrictii && (
              <div className="rounded-xl border /50 p-4 mb-5 text-sm flex items-center gap-2" style={{ color: "var(--accent-green)", background: "var(--accent-green-bg)", borderColor: "var(--accent-green-border)" }}>
                <span>\u2705</span> Fara restrictii, insolventa, dizolvare sau lichidare
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                <CardLabel label="Nr. Reg. Comertului" value={sel.regCom} mono />
              </div>
              <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                <CardLabel label="Forma juridica" value={FORME_JURIDICE.find(fj => fj.cod === sel.forma)?.label || sel.forma} />
              </div>
            </div>
            <div className="rounded-xl border border-l-[3px] border-l-blue-500 p-4 mt-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              <div className="text-[11px] uppercase tracking-wide font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Ultima mentiune</div>
              <div className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{sel.ultimaMentiune}</div>
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
          <div className="border rounded-2xl w-[480px] max-h-[85vh] overflow-y-auto p-7 animate-in slide-in-from-bottom-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-extrabold" style={{ color: "var(--text-primary)" }}>Upload Certificat Constatator</h2>
              <button className="hover: text-lg p-1" style={{ color: "var(--text-muted)" }} onClick={() => setShowOnrcUpload(false)}>&times;</button>
            </div>
            <p className="text-[13px] mb-5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Incarca un certificat constatator ONRC (PDF). Datele firmei se vor actualiza automat cu informatiile extrase.
            </p>
            <input type="file" ref={onrcFileRef} accept=".pdf" style={{ display: "none" }} onChange={() => {}} />
            <div
              className="border-2 border-dashed rounded-xl p-7 text-center mb-5 cursor-pointer hover:border-blue-500 hover:/30 transition-all" style={{ background: "var(--accent-blue-bg)", borderColor: "var(--border)" }}
              onClick={() => onrcFileRef.current?.click()}
            >
              <div className="text-2xl mb-1.5">{onrcFileRef.current?.files?.[0] ? "\u2705" : "\ud83d\udcc4"}</div>
              <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{onrcFileRef.current?.files?.[0]?.name || "Certificat constatator (PDF)"}</div>
              <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Click pentru a selecta fisierul</div>
            </div>
            <div className="flex gap-2.5 justify-end">
              <button
                className="px-5 py-2.5 rounded-lg border text-sm font-semibold hover: hover: transition-colors" style={{ color: "var(--text-secondary)", background: "var(--bg-surface)", borderColor: "var(--border-active)" }}
                onClick={() => setShowOnrcUpload(false)}
              >
                Anuleaza
              </button>
              <button
                className="px-5 py-2.5 rounded-lg text-sm font-bold hover: transition-colors disabled:opacity-50 disabled:cursor-not-allowed" style={{ color: "var(--text-on-accent)", background: "var(--accent-blue)" }}
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
          <div className="border rounded-2xl w-[480px] max-h-[85vh] overflow-y-auto p-7 animate-in slide-in-from-bottom-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-extrabold" style={{ color: "var(--text-primary)" }}>Upload bilant ANAF</h2>
              <button className="hover: text-lg p-1" style={{ color: "var(--text-muted)" }} onClick={() => setShowBilantUpload(false)}>&times;</button>
            </div>
            <p className="text-[13px] mb-5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Incarca un bilant ANAF (PDF descarcat din SPV). Se accepta Formularul 10 (bilant), Formularul 20 (cont profit/pierderi), Formularul 30/40. Datele financiare se extrag automat.
            </p>
            <div className="mb-4">
              <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>An fiscal</label>
              <select
                value={bilantYear}
                onChange={e => setBilantYear(Number(e.target.value))}
                className="px-3.5 py-2.5 rounded-lg border text-sm font-mono w-[140px]" style={{ color: "var(--text-primary)", background: "var(--bg-elevated)", borderColor: "var(--border)" }}
              >
                {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 1 - i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <input type="file" ref={bilantFileRef} accept=".pdf" style={{ display: "none" }} onChange={() => {}} />
            <div
              className="border-2 border-dashed rounded-xl p-7 text-center mb-5 cursor-pointer hover:border-blue-500 hover:/30 transition-all" style={{ background: "var(--accent-blue-bg)", borderColor: "var(--border)" }}
              onClick={() => bilantFileRef.current?.click()}
            >
              <div className="text-2xl mb-1.5">{bilantFileRef.current?.files?.[0] ? "\u2705" : "\ud83d\udcca"}</div>
              <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{bilantFileRef.current?.files?.[0]?.name || "Bilant ANAF (PDF)"}</div>
              <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Click pentru a selecta fisierul</div>
            </div>
            <div className="flex gap-2.5 justify-end">
              <button
                className="px-5 py-2.5 rounded-lg border text-sm font-semibold hover: hover: transition-colors" style={{ color: "var(--text-secondary)", background: "var(--bg-surface)", borderColor: "var(--border-active)" }}
                onClick={() => setShowBilantUpload(false)}
              >
                Anuleaza
              </button>
              <button
                className="px-5 py-2.5 rounded-lg text-sm font-bold hover: transition-colors disabled:opacity-50 disabled:cursor-not-allowed" style={{ color: "var(--text-on-accent)", background: "var(--accent-blue)" }}
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
