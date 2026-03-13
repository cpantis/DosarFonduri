"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { isPF, FORME_JURIDICE } from "@/hooks/useFormaJuridica";
import { apiGet, apiPost, api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TypeBadge } from "@/components/ui/TypeBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { BtnPrimary } from "@/components/ui/Buttons";

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
      <PageHeader title="Firme" subtitle={`${filtered.length} firme gestionate`}>
        <BtnPrimary icon="+" onClick={() => { setShowAdd(true); setCui(""); setCuiRes(null); setAddMode("auto"); setAddForma("SRL"); setUploadFile(null); setCuiSearchResults([]); }}>Adaugă firmă</BtnPrimary>
      </PageHeader>

      <div className="max-w-6xl mx-auto px-8 py-6 space-y-3">
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <div className="text-[14px] text-center">Se incarca firmele...</div>
          </div>
        )}
        {error && (
          <div className="text-[14px] text-center py-20 text-red-600">{error}</div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <EmptyState icon="🏢" title="Nicio firmă adăugată" description="Adaugă prima firmă pentru a începe" />
        )}
        {!loading && !error && filtered.map(c => {
          const forma = c.formaJuridica || "SRL";
          return (
            <a key={c.id} href={`/companies/${c.id}`} className="block bg-white rounded-xl border border-slate-200 p-5 hover:shadow-sm hover:border-slate-300 transition-all cursor-pointer no-underline">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-[15px] font-semibold text-slate-900">{c.denumire}</span>
                    <TypeBadge type={forma} />
                    <StatusBadge status={c.stare || "funcțiune"} />
                  </div>
                  <div className="text-[13px] text-slate-500 mt-1 flex items-center gap-2">
                    <span className="font-mono">CUI: {c.cui}</span>
                    {c.caen && <><span className="text-slate-300">·</span><span>CAEN: {c.caen}</span></>}
                    {c.judet && <><span className="text-slate-300">·</span><span>{c.judet}</span></>}
                  </div>
                </div>
                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </div>
            </a>
          );
        })}
      </div>

      {/* ADD MODAL */}
      {showAdd && (
        <div className="fixed inset-0 flex items-center justify-center z-[100]" style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }} onClick={e => { if (e.target === e.currentTarget) setShowAdd(false); }}>
          <div className="bg-white rounded-2xl w-[560px] max-h-[85vh] overflow-y-auto p-8 border border-slate-200">
            <div className="text-xl font-bold mb-1.5 flex items-center justify-between text-slate-900">
              Adauga firma
              <button className="bg-transparent border-none cursor-pointer text-xl p-1 text-slate-400" onClick={() => setShowAdd(false)}>&times;</button>
            </div>
            <div className="flex rounded-lg overflow-hidden mb-5 border border-slate-200">
              <button
                className={`flex-1 py-3 text-[13px] font-semibold cursor-pointer border-none flex items-center justify-center gap-1.5 transition-colors ${addMode === "auto" ? "bg-blue-600 text-white" : "bg-transparent text-slate-500"}`}
                onClick={() => setAddMode("auto")}
              >Automat (CUI)</button>
              <button
                className={`flex-1 py-3 text-[13px] font-semibold cursor-pointer border-none flex items-center justify-center gap-1.5 transition-colors ${addMode === "manual" ? "bg-blue-600 text-white" : "bg-transparent text-slate-500"}`}
                onClick={() => setAddMode("manual")}
              >Manual (Upload ONRC)</button>
            </div>

            {addMode === "auto" ? (<>
              <div className="text-[13px] mb-3.5 leading-relaxed text-slate-500">
                Cauta dupa CUI sau denumire firma. Datele se preiau automat de la ListaFirme.ro / ONRC.
              </div>
              <div className="flex gap-2.5 mb-3.5 relative">
                <input
                  className={`flex-1 rounded-lg px-3 py-2 text-[13px] font-mono outline-none bg-white text-slate-900 border ${cuiRes && cuiRes !== "error" ? "border-emerald-400" : cuiRes === "error" ? "border-red-400" : "border-slate-200"}`}
                  placeholder="CUI sau denumire firma..."
                  value={cui}
                  onChange={e => { setCui(e.target.value); setCuiRes(null); searchCUI(e.target.value); }}
                  onKeyDown={e => e.key === "Enter" && checkCui()}
                />
                <button
                  className="font-medium px-4 py-2 rounded-lg text-[14px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={checkCui}
                  disabled={cuiLoad || cui.replace(/\D/g, "").length < 4}
                >
                  {cuiLoad ? "..." : "Adauga"}
                </button>
              </div>

              {cuiSearchResults.length > 0 && !cuiRes && (
                <div className="rounded-lg overflow-hidden mb-2.5 border border-slate-200 bg-white">
                  {cuiSearching && <div className="px-4 py-2 text-[11px] text-slate-400">Se cauta...</div>}
                  {cuiSearchResults.map((r: any, idx: number) => (
                    <div key={idx}
                      className="px-4 py-3 cursor-pointer transition-colors text-[13px] border-b border-slate-100 hover:bg-slate-50"
                      onClick={() => { const code = r.fiscalCode || r.taxCode || ""; setCui(code); setCuiSearchResults([]); addFromListaFirme(code); }}
                    >
                      <div className="font-semibold text-slate-900">{r.name}</div>
                      <div className="text-[11px] flex gap-3 mt-0.5 text-slate-400">
                        <span className="font-mono">CUI: {r.fiscalCode || r.taxCode || "\u2014"}</span>
                        {r.county && <span>{r.county}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {cuiRes && cuiRes !== "error" && (
                <div className="p-4 rounded-lg mb-3.5 border border-emerald-200 bg-emerald-50">
                  <div className="text-[16px] font-bold mb-1.5 text-emerald-700">{cuiRes.denumire}</div>
                  <div className="text-[13px] mb-0.5 text-slate-500"><strong className="font-semibold mr-2 text-slate-900">Adresa:</strong>{cuiRes.adresa}</div>
                  <div className="text-[13px] mb-0.5 text-slate-500"><strong className="font-semibold mr-2 text-slate-900">CAEN:</strong>{cuiRes.caen}</div>
                  <div className="text-[13px] text-slate-500"><strong className="font-semibold mr-2 text-slate-900">Stare:</strong><span className="text-emerald-700">{cuiRes.stare}</span></div>
                </div>
              )}
              {cuiRes === "error" && <div className="p-3.5 rounded-lg mb-3.5 text-[13px] border border-red-200 bg-red-50 text-red-600">CUI-ul nu a fost gasit sau a aparut o eroare.</div>}
              <div className="flex gap-2.5 justify-end">
                <button className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-[13px] font-medium px-4 py-2 rounded-lg" onClick={() => setShowAdd(false)}>Anuleaza</button>
                <button className="bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg disabled:opacity-50" disabled={!cuiRes || cuiRes === "error"} onClick={() => setShowAdd(false)}>Inchide</button>
              </div>
            </>) : (<>
              <div className="text-[14px] mb-5 leading-relaxed text-slate-500">Incarca documentul ONRC si agentii vor face restul:</div>
              <div className="text-[12px] mb-4 px-3.5 py-2.5 rounded-md text-center bg-slate-50 text-slate-500">Upload &rarr; OCR automat &rarr; Extragere date &rarr; Validare &rarr; Stocare</div>

              <div className="text-[11px] uppercase tracking-wide font-medium mt-3.5 mb-2 text-slate-500">Societati comerciale</div>
              <div className="grid grid-cols-3 gap-2 mb-5">
                {FORME_JURIDICE.filter(f => f.group === "SOC").map(f => (
                  <div
                    key={f.cod}
                    className={`py-2.5 px-3 rounded-md cursor-pointer text-center transition-colors text-[12px] border ${addForma === f.cod ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-slate-50"}`}
                    onClick={() => setAddForma(f.cod)}
                  >
                    <div className="font-bold font-mono text-[13px] mb-0.5 text-slate-900">{f.short}</div>
                    <div className="text-[10px] leading-tight text-slate-400">{f.label}</div>
                  </div>
                ))}
              </div>

              <div className="text-[11px] uppercase tracking-wide font-medium mt-3.5 mb-2 text-slate-500">Persoane fizice / Intreprinderi</div>
              <div className="grid grid-cols-3 gap-2 mb-5">
                {FORME_JURIDICE.filter(f => f.group === "PF").map(f => (
                  <div
                    key={f.cod}
                    className={`py-2.5 px-3 rounded-md cursor-pointer text-center transition-colors text-[12px] border ${addForma === f.cod ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-slate-50"}`}
                    onClick={() => setAddForma(f.cod)}
                  >
                    <div className="font-bold font-mono text-[13px] mb-0.5 text-slate-900">{f.short}</div>
                    <div className="text-[10px] leading-tight text-slate-400">{f.label}</div>
                  </div>
                ))}
              </div>

              <input type="file" ref={fileInputRef} accept=".pdf" className="hidden" onChange={handleFileSelect} />
              <div
                className="border-2 border-dashed rounded-lg py-8 px-5 text-center mb-4 transition-colors cursor-pointer border-slate-200"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={handleFileDrop}
              >
                <div className="text-[28px] mb-2">{uploadFile ? "\u2705" : "\u{1F4C4}"}</div>
                <div className="text-[14px] font-semibold mb-1 text-slate-900">{uploadFile ? uploadFile.name : "Certificat constatator / Document ONRC"}</div>
                <div className="text-[12px] text-slate-400">{uploadFile ? `${(uploadFile.size / 1024 / 1024).toFixed(1)} MB` : "Click sau trage fisierul aici (PDF, max 10MB)"}</div>
              </div>

              <div className="flex gap-2.5 justify-end">
                <button className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-[13px] font-medium px-4 py-2 rounded-lg" onClick={() => setShowAdd(false)}>Anuleaza</button>
                <button
                  className="bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!uploadFile || uploadLoading}
                  onClick={handleManualUpload}
                >{uploadLoading ? "Se proceseaza..." : "Proceseaza si creeaza firma"}</button>
              </div>
            </>)}
          </div>
        </div>
      )}
    </>
  );
}
