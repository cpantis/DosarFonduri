"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { isPF, FORME_JURIDICE } from "@/hooks/useFormaJuridica";
import { apiGet, apiPost, api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TypeBadge } from "@/components/ui/TypeBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { BtnPrimary, BtnSecondary } from "@/components/ui/Buttons";
import { SkeletonCard } from "@/components/ui/Skeleton";

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

  return (
    <div className="animate-[fadeIn_.2s_ease-out]">
      <PageHeader title="Firme" subtitle={`${filtered.length} firme gestionate`}>
        <BtnPrimary icon="+" onClick={() => { setShowAdd(true); setCui(""); setCuiRes(null); setAddMode("auto"); setAddForma("SRL"); setUploadFile(null); setCuiSearchResults([]); }}>Adaugă firmă</BtnPrimary>
      </PageHeader>

      <div className="max-w-6xl mx-auto px-8 py-6">
        {/* Search + filter bar */}
        {!loading && companies.length > 0 && (
          <div className="flex items-center gap-3 mb-5">
            <div className="relative flex-1 max-w-sm">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Caută după denumire, CUI, CAEN..."
                className="w-full pl-9 pr-4 py-2 text-[13px] bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-50 transition-all text-slate-900 placeholder:text-slate-400"
              />
            </div>
            <div className="flex items-center gap-1">
              {[
                { key: "all", label: "Toate" },
                { key: "activ", label: "Active" },
                { key: "soc", label: "Societăți" },
                { key: "pf", label: "PF/II/IF" },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`text-[12px] font-medium px-3 py-1.5 rounded-lg transition-all ${
                    filter === f.key
                      ? "bg-slate-900 text-white"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="space-y-3">
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-[13px] text-red-700 flex items-center gap-2">
            <span className="text-red-500">⚠️</span> {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && filtered.length === 0 && (
          <EmptyState icon="🏢" title="Nicio firmă adăugată" description="Adaugă prima firmă pentru a începe" actionLabel="Adaugă firmă" onAction={() => { setShowAdd(true); setCui(""); setCuiRes(null); setAddMode("auto"); }} />
        )}

        {/* Company list */}
        {!loading && !error && filtered.length > 0 && (
          <div className="space-y-2">
            {filtered.map(c => {
              const forma = c.formaJuridica || "SRL";
              return (
                <a
                  key={c.id}
                  href={`/companies/${c.id}`}
                  className="flex items-center justify-between bg-white rounded-xl border border-slate-200/80 px-5 py-4 hover:shadow-sm hover:border-slate-300/80 transition-all cursor-pointer no-underline group"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <span className="text-[15px] font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">{c.denumire}</span>
                      <TypeBadge type={forma} />
                      <StatusBadge status={c.stare || "funcțiune"} />
                    </div>
                    <div className="text-[13px] text-slate-500 mt-1 flex items-center gap-2">
                      <span className="font-mono tabular-nums text-slate-400">CUI: {c.cui}</span>
                      {c.caen && <><span className="text-slate-200">·</span><span>CAEN: {c.caen}</span></>}
                      {c.judet && <><span className="text-slate-200">·</span><span>{c.judet}</span></>}
                    </div>
                  </div>
                  <svg className="w-4 h-4 text-slate-300 group-hover:text-slate-400 transition-colors shrink-0 ml-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </a>
              );
            })}
          </div>
        )}
      </div>

      {/* ADD MODAL */}
      {showAdd && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] bg-black/40 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setShowAdd(false); }}>
          <div className="bg-white rounded-2xl w-[540px] max-h-[85vh] overflow-y-auto p-7 border border-slate-200/80 shadow-xl animate-[fadeUp_.2s_ease-out]">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[18px] font-bold text-slate-900">Adaugă firmă</h2>
              <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" onClick={() => setShowAdd(false)}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Mode toggle */}
            <div className="flex gap-1 p-1 bg-slate-100 rounded-lg mb-5">
              <button
                className={`flex-1 py-2 text-[13px] font-medium rounded-md transition-all ${addMode === "auto" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                onClick={() => setAddMode("auto")}
              >Automat (CUI)</button>
              <button
                className={`flex-1 py-2 text-[13px] font-medium rounded-md transition-all ${addMode === "manual" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                onClick={() => setAddMode("manual")}
              >Manual (Upload ONRC)</button>
            </div>

            {addMode === "auto" ? (<>
              <p className="text-[13px] text-slate-500 leading-relaxed mb-4">
                Caută după CUI sau denumire firmă. Datele se preiau automat de la ListaFirme.ro / ONRC.
              </p>
              <div className="flex gap-2 mb-3 relative">
                <input
                  className={`flex-1 rounded-lg px-3.5 py-2.5 text-[13px] font-mono outline-none bg-white text-slate-900 border transition-all focus:ring-2 ${
                    cuiRes && cuiRes !== "error" ? "border-emerald-300 focus:ring-emerald-50" : cuiRes === "error" ? "border-red-300 focus:ring-red-50" : "border-slate-200 focus:ring-blue-50 focus:border-blue-300"
                  }`}
                  placeholder="CUI sau denumire firmă..."
                  value={cui}
                  onChange={e => { setCui(e.target.value); setCuiRes(null); searchCUI(e.target.value); }}
                  onKeyDown={e => e.key === "Enter" && checkCui()}
                />
                <BtnPrimary onClick={checkCui} disabled={cuiLoad || cui.replace(/\D/g, "").length < 4}>
                  {cuiLoad ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  ) : "Adaugă"}
                </BtnPrimary>
              </div>

              {/* Search results dropdown */}
              {cuiSearchResults.length > 0 && !cuiRes && (
                <div className="rounded-xl overflow-hidden mb-3 border border-slate-200 bg-white shadow-sm">
                  {cuiSearching && <div className="px-4 py-2 text-[11px] text-slate-400">Se caută...</div>}
                  {cuiSearchResults.map((r: any, idx: number) => (
                    <div key={idx}
                      className="px-4 py-3 cursor-pointer transition-colors text-[13px] border-b border-slate-50 last:border-0 hover:bg-slate-50"
                      onClick={() => { const code = r.fiscalCode || r.taxCode || ""; setCui(code); setCuiSearchResults([]); addFromListaFirme(code); }}
                    >
                      <div className="font-medium text-slate-900">{r.name}</div>
                      <div className="text-[11px] flex gap-3 mt-0.5 text-slate-400">
                        <span className="font-mono">CUI: {r.fiscalCode || r.taxCode || "—"}</span>
                        {r.county && <span>{r.county}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Success result */}
              {cuiRes && cuiRes !== "error" && (
                <div className="p-4 rounded-xl mb-4 border border-emerald-200 bg-emerald-50/50">
                  <div className="text-[15px] font-bold mb-2 text-emerald-700">{cuiRes.denumire}</div>
                  <div className="space-y-1">
                    <div className="text-[13px] text-slate-600 flex gap-2"><span className="text-slate-400 w-16 shrink-0">Adresă</span><span>{cuiRes.adresa}</span></div>
                    <div className="text-[13px] text-slate-600 flex gap-2"><span className="text-slate-400 w-16 shrink-0">CAEN</span><span>{cuiRes.caen}</span></div>
                    <div className="text-[13px] text-slate-600 flex gap-2"><span className="text-slate-400 w-16 shrink-0">Stare</span><span className="text-emerald-700 font-medium">{cuiRes.stare}</span></div>
                  </div>
                </div>
              )}

              {/* Error result */}
              {cuiRes === "error" && (
                <div className="p-4 rounded-xl mb-4 text-[13px] border border-red-200 bg-red-50/50 text-red-700 flex items-center gap-2">
                  <span>⚠️</span> CUI-ul nu a fost găsit sau a apărut o eroare.
                </div>
              )}

              <div className="flex gap-2 justify-end pt-2">
                <BtnSecondary onClick={() => setShowAdd(false)}>Anulează</BtnSecondary>
                <BtnPrimary onClick={() => setShowAdd(false)} disabled={!cuiRes || cuiRes === "error"}>Închide</BtnPrimary>
              </div>
            </>) : (<>
              <p className="text-[13px] text-slate-500 leading-relaxed mb-4">Încarcă documentul ONRC și agenții vor face restul:</p>
              <div className="flex items-center gap-2 text-[11px] text-slate-400 px-4 py-2.5 rounded-lg bg-slate-50 mb-5">
                {["Upload", "OCR automat", "Extragere date", "Validare", "Stocare"].map((step, i) => (
                  <span key={step} className="flex items-center gap-2">
                    {i > 0 && <span className="text-slate-300">→</span>}
                    <span className="font-medium">{step}</span>
                  </span>
                ))}
              </div>

              <div className="text-[11px] uppercase tracking-wider font-medium mt-4 mb-2 text-slate-400">Societăți comerciale</div>
              <div className="grid grid-cols-3 gap-1.5 mb-5">
                {FORME_JURIDICE.filter(f => f.group === "SOC").map(f => (
                  <div key={f.cod}
                    className={`py-2 px-2.5 rounded-lg cursor-pointer text-center transition-all text-[12px] border ${
                      addForma === f.cod ? "border-blue-300 bg-blue-50 ring-2 ring-blue-50" : "border-slate-200/80 bg-white hover:bg-slate-50"
                    }`}
                    onClick={() => setAddForma(f.cod)}
                  >
                    <div className="font-bold font-mono text-[13px] text-slate-900">{f.short}</div>
                    <div className="text-[10px] leading-tight text-slate-400 mt-0.5">{f.label}</div>
                  </div>
                ))}
              </div>

              <div className="text-[11px] uppercase tracking-wider font-medium mt-4 mb-2 text-slate-400">Persoane fizice / Întreprinderi</div>
              <div className="grid grid-cols-3 gap-1.5 mb-5">
                {FORME_JURIDICE.filter(f => f.group === "PF").map(f => (
                  <div key={f.cod}
                    className={`py-2 px-2.5 rounded-lg cursor-pointer text-center transition-all text-[12px] border ${
                      addForma === f.cod ? "border-blue-300 bg-blue-50 ring-2 ring-blue-50" : "border-slate-200/80 bg-white hover:bg-slate-50"
                    }`}
                    onClick={() => setAddForma(f.cod)}
                  >
                    <div className="font-bold font-mono text-[13px] text-slate-900">{f.short}</div>
                    <div className="text-[10px] leading-tight text-slate-400 mt-0.5">{f.label}</div>
                  </div>
                ))}
              </div>

              <input type="file" ref={fileInputRef} accept=".pdf" className="hidden" onChange={handleFileSelect} />
              <div
                className={`border-2 border-dashed rounded-xl py-8 px-5 text-center mb-5 transition-all cursor-pointer ${
                  uploadFile ? "border-emerald-300 bg-emerald-50/30" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                }`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={handleFileDrop}
              >
                <div className="text-2xl mb-2">{uploadFile ? "✅" : "📄"}</div>
                <div className="text-[14px] font-medium text-slate-900 mb-1">{uploadFile ? uploadFile.name : "Certificat constatator / Document ONRC"}</div>
                <div className="text-[12px] text-slate-400">{uploadFile ? `${(uploadFile.size / 1024 / 1024).toFixed(1)} MB` : "Click sau trage fișierul aici (PDF, max 10MB)"}</div>
              </div>

              <div className="flex gap-2 justify-end">
                <BtnSecondary onClick={() => setShowAdd(false)}>Anulează</BtnSecondary>
                <BtnPrimary disabled={!uploadFile || uploadLoading} onClick={handleManualUpload}>
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
