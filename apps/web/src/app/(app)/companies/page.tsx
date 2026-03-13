"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { isPF, FORME_JURIDICE } from "@/hooks/useFormaJuridica";
import { apiGet, apiPost, api } from "@/lib/api";

/* ═══ HELPERS ═══ */
const formaColorClasses = (cod: string): { iconBg: string; iconText: string; badgeCls: string } => {
  if (isPF(cod)) return { iconBg: "bg-orange-50", iconText: "text-orange-600", badgeCls: "bg-purple-50 text-purple-700 border-purple-200" };
  const map: Record<string, { iconBg: string; iconText: string; badgeCls: string }> = {
    SRL: { iconBg: "bg-blue-50", iconText: "text-blue-600", badgeCls: "bg-blue-50 text-blue-700 border-blue-200" },
    SA: { iconBg: "bg-purple-50", iconText: "text-purple-600", badgeCls: "bg-purple-50 text-purple-700 border-purple-200" },
    SNC: { iconBg: "bg-emerald-50", iconText: "text-emerald-600", badgeCls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    SCS: { iconBg: "bg-emerald-50", iconText: "text-emerald-600", badgeCls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    SCA: { iconBg: "bg-purple-50", iconText: "text-purple-600", badgeCls: "bg-purple-50 text-purple-700 border-purple-200" },
  };
  return map[cod] || { iconBg: "bg-blue-50", iconText: "text-blue-600", badgeCls: "bg-blue-50 text-blue-700 border-blue-200" };
};

const stareClasses = (stare: string | undefined, isProcessing: boolean): string => {
  if (isProcessing) return "bg-blue-50 text-blue-700 border-blue-200";
  if (stare === "radiata") return "bg-red-50 text-red-700 border-red-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
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
  const months = ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "nov", "dec"];
  return `${d.getDate()} ${months[d.getMonth()]}, ${hh}:${mm}`;
};

/* ═══ COMPONENT ═══ */
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
    <div className="px-8 py-6 max-w-7xl mx-auto">
      {/* TOPBAR */}
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex-1 tracking-tight">Firme</h1>
        <span className="text-[13px] text-slate-500 font-medium">{loading ? "..." : `${filtered.length} firme`}</span>
        <button
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-[13px] transition-colors shadow-sm"
          onClick={() => { setShowAdd(true); setCui(""); setCuiRes(null); setAddMode("auto"); setAddForma("SRL"); setUploadFile(null); setCuiSearchResults([]); }}
        >+ Adauga firma</button>
      </div>

      {/* TOOLBAR */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <input
          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-[13px] text-slate-700 placeholder:text-slate-400 focus:border-blue-300 focus:ring-1 focus:ring-blue-100 outline-none transition-colors w-80"
          placeholder="Cauta firma, CUI, CAEN, judet, forma..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5">
          {[
            { key: "all", label: "Toate" },
            { key: "activ", label: "Active" },
            { key: "radiat", label: "Radiate" },
            { key: "soc", label: "Societati" },
            { key: "pf", label: "PFA/II/IF" },
          ].map(item => (
            <button
              key={item.key}
              className={`px-3.5 py-1.5 rounded-md text-[12px] font-semibold border-none cursor-pointer transition-colors whitespace-nowrap ${
                filter === item.key
                  ? "bg-blue-600 text-white"
                  : "bg-transparent text-slate-500 hover:text-slate-700"
              }`}
              onClick={() => setFilter(item.key)}
            >{item.label}</button>
          ))}
        </div>
      </div>

      {/* COMPANY CARDS GRID */}
      <div className="flex-1">
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
            <span className="inline-block w-7 h-7 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
            <div className="text-[14px] text-center">Se incarca firmele...</div>
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
            <div className="text-[14px] text-center text-red-500">{error}</div>
            <button className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg px-4 py-2 text-[13px] font-medium mt-2 cursor-pointer" onClick={fetchCompanies}>Reincearca</button>
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
            <div className="text-5xl opacity-40">&#128269;</div>
            <div className="text-[14px] text-center">Nicio firma gasita</div>
          </div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(420px,1fr))] gap-4">
            {filtered.map(f => {
              const forma = f.formaJuridica || "";
              const fc = formaColorClasses(forma);
              const isProcessing = f.processingStatus === "processing";
              const stareCls = stareClasses(f.stare, isProcessing);
              return (
                <div
                  key={f.id}
                  className="flex items-start gap-4 p-5 rounded-xl border border-slate-200 bg-white cursor-pointer transition-all hover:border-slate-300 hover:shadow-sm hover:-translate-y-px"
                  onClick={() => router.push(`/companies/${f.id}`)}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-[13px] font-extrabold shrink-0 font-mono ${fc.iconBg} ${fc.iconText}`}>{forma}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-semibold text-slate-900 mb-1.5 leading-tight">{f.denumire}</div>
                    <div className="flex gap-1.5 flex-wrap mb-2">
                      <span className={`text-[10px] font-semibold rounded-full border px-2 py-0.5 ${stareCls}`}>{isProcessing ? "Se proceseaza..." : f.stare || "activ"}</span>
                      <span className={`text-[10px] font-semibold rounded-full border px-2 py-0.5 ${fc.badgeCls}`}>{FORME_JURIDICE.find(fj => fj.cod === forma)?.short || forma}</span>
                      {f.caen && <span className="text-[10px] font-semibold rounded-full border px-2 py-0.5 bg-slate-50 text-slate-500 border-slate-200">CAEN {f.caen}</span>}
                    </div>
                    <div className="text-[12px] text-slate-500 flex gap-3 flex-wrap leading-relaxed">
                      <span className="flex items-center gap-1">CUI: {f.cui}</span>
                      {f.judet && <span>{f.judet}</span>}
                      {f.anInfiintare && <span>Din {f.anInfiintare}</span>}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mt-1.5">Sync: {formatSyncTime(f.lastSyncedAt)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ADD MODAL */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] animate-[fadeIn_0.2s]" onClick={e => { if (e.target === e.currentTarget) setShowAdd(false); }}>
          <div className="bg-white border border-slate-200 rounded-2xl w-[560px] max-h-[85vh] overflow-y-auto p-8 animate-[slideUp_0.3s_ease]">
            <div className="text-xl font-bold text-slate-900 mb-1.5 flex items-center justify-between">
              Adauga firma
              <button className="bg-transparent border-none text-slate-400 cursor-pointer text-xl p-1 hover:text-slate-700" onClick={() => setShowAdd(false)}>&times;</button>
            </div>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden mb-5">
              <button
                className={`flex-1 py-3 text-[13px] font-semibold cursor-pointer border-none border-r border-slate-200 flex items-center justify-center gap-1.5 transition-colors ${
                  addMode === "auto" ? "bg-blue-600 text-white" : "bg-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                }`}
                onClick={() => setAddMode("auto")}
              >Automat (CUI)</button>
              <button
                className={`flex-1 py-3 text-[13px] font-semibold cursor-pointer border-none flex items-center justify-center gap-1.5 transition-colors ${
                  addMode === "manual" ? "bg-blue-600 text-white" : "bg-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                }`}
                onClick={() => setAddMode("manual")}
              >Manual (Upload ONRC)</button>
            </div>

            {addMode === "auto" ? (<>
              <div className="text-[13px] text-slate-500 mb-3.5 leading-relaxed">
                Cauta dupa CUI sau denumire firma. Datele se preiau automat de la ListaFirme.ro / ONRC.
              </div>
              <div className="flex gap-2.5 mb-3.5 relative">
                <input
                  className={`flex-1 bg-white border rounded-lg px-3 py-2 text-[13px] text-slate-700 placeholder:text-slate-400 focus:border-blue-300 focus:ring-1 focus:ring-blue-100 outline-none font-mono transition-colors ${
                    cuiRes && cuiRes !== "error" ? "border-emerald-400" : cuiRes === "error" ? "border-red-400" : "border-slate-200"
                  }`}
                  placeholder="CUI sau denumire firma..."
                  value={cui}
                  onChange={e => { setCui(e.target.value); setCuiRes(null); searchCUI(e.target.value); }}
                  onKeyDown={e => e.key === "Enter" && checkCui()}
                />
                <button
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-[14px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={checkCui}
                  disabled={cuiLoad || cui.replace(/\D/g, "").length < 4}
                >
                  {cuiLoad ? <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Adauga"}
                </button>
              </div>

              {cuiSearchResults.length > 0 && !cuiRes && (
                <div className="border border-slate-200 rounded-lg bg-white overflow-hidden mb-2.5">
                  {cuiSearching && <div className="px-4 py-2 text-[11px] text-slate-400">Se cauta...</div>}
                  {cuiSearchResults.map((r: any, idx: number) => (
                    <div key={idx}
                      className="px-4 py-3 cursor-pointer border-b border-slate-200 transition-colors text-[13px] hover:bg-slate-50"
                      onClick={() => { const code = r.fiscalCode || r.taxCode || ""; setCui(code); setCuiSearchResults([]); addFromListaFirme(code); }}
                    >
                      <div className="font-semibold text-slate-900">{r.name}</div>
                      <div className="text-[11px] text-slate-400 flex gap-3 mt-0.5">
                        <span className="font-mono">CUI: {r.fiscalCode || r.taxCode || "\u2014"}</span>
                        {r.county && <span>{r.county}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {cuiLoad && (
                <div className="flex items-center gap-2.5 p-3.5 rounded-lg border border-slate-200 bg-slate-50 mb-3.5 text-[13px] text-slate-500">
                  <span className="inline-block w-4 h-4 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" /> Se verifica si se adauga firma...
                </div>
              )}
              {cuiRes && cuiRes !== "error" && (
                <div className="p-4 rounded-lg border border-emerald-300 bg-emerald-50/40 mb-3.5">
                  <div className="text-[16px] font-bold text-emerald-600 mb-1.5">{cuiRes.denumire}</div>
                  <div className="text-[13px] text-slate-500 mb-0.5 leading-relaxed"><strong className="text-slate-900 font-semibold mr-2">Adresa:</strong>{cuiRes.adresa}</div>
                  <div className="text-[13px] text-slate-500 mb-0.5 leading-relaxed"><strong className="text-slate-900 font-semibold mr-2">CAEN:</strong>{cuiRes.caen}</div>
                  <div className="text-[13px] text-slate-500 mb-0.5 leading-relaxed"><strong className="text-slate-900 font-semibold mr-2">Stare:</strong><span className="text-emerald-600">{cuiRes.stare}</span></div>
                </div>
              )}
              {cuiRes === "error" && <div className="p-3.5 rounded-lg border border-red-300 bg-red-50/40 mb-3.5 text-[13px] text-red-600">CUI-ul nu a fost gasit sau a aparut o eroare.</div>}
              <div className="flex gap-2.5 justify-end">
                <button className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg px-4 py-2 text-[14px] font-medium cursor-pointer" onClick={() => setShowAdd(false)}>Anuleaza</button>
                <button className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-[14px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled={!cuiRes || cuiRes === "error"} onClick={() => setShowAdd(false)}>Inchide</button>
              </div>
            </>) : (<>
              <div className="text-[14px] text-slate-500 mb-5 leading-relaxed">Incarca documentul ONRC si agentii vor face restul:</div>
              <div className="text-[12px] text-slate-500 mb-4 px-3.5 py-2.5 bg-slate-50 rounded-md text-center">Upload &rarr; OCR automat &rarr; Extragere date &rarr; Validare &rarr; Stocare</div>

              <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mt-3.5 mb-2">Societati comerciale</div>
              <div className="grid grid-cols-3 gap-2 mb-5">
                {FORME_JURIDICE.filter(f => f.group === "SOC").map(f => (
                  <div
                    key={f.cod}
                    className={`py-2.5 px-3 rounded-md border cursor-pointer text-center transition-colors text-[12px] ${
                      addForma === f.cod
                        ? "border-blue-400 bg-blue-50"
                        : "border-slate-200 bg-slate-50 hover:border-slate-300"
                    }`}
                    onClick={() => setAddForma(f.cod)}
                  >
                    <div className="font-bold font-mono text-[13px] text-slate-900 mb-0.5">{f.short}</div>
                    <div className="text-[10px] text-slate-400 leading-tight">{f.label}</div>
                  </div>
                ))}
              </div>

              <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mt-3.5 mb-2">Persoane fizice / Intreprinderi</div>
              <div className="grid grid-cols-3 gap-2 mb-5">
                {FORME_JURIDICE.filter(f => f.group === "PF").map(f => (
                  <div
                    key={f.cod}
                    className={`py-2.5 px-3 rounded-md border cursor-pointer text-center transition-colors text-[12px] ${
                      addForma === f.cod
                        ? "border-blue-400 bg-blue-50"
                        : "border-slate-200 bg-slate-50 hover:border-slate-300"
                    }`}
                    onClick={() => setAddForma(f.cod)}
                  >
                    <div className="font-bold font-mono text-[13px] text-slate-900 mb-0.5">{f.short}</div>
                    <div className="text-[10px] text-slate-400 leading-tight">{f.label}</div>
                  </div>
                ))}
              </div>

              <input type="file" ref={fileInputRef} accept=".pdf" className="hidden" onChange={handleFileSelect} />
              <div
                className="border-2 border-dashed border-slate-200 rounded-lg py-8 px-5 text-center mb-4 transition-colors cursor-pointer hover:border-blue-400 hover:bg-blue-50/30"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={handleFileDrop}
              >
                <div className="text-[28px] mb-2">{uploadFile ? "\u2705" : "\u{1F4C4}"}</div>
                <div className="text-[14px] font-semibold text-slate-700 mb-1">{uploadFile ? uploadFile.name : "Certificat constatator / Document ONRC"}</div>
                <div className="text-[12px] text-slate-400">{uploadFile ? `${(uploadFile.size / 1024 / 1024).toFixed(1)} MB` : "Click sau trage fisierul aici (PDF, max 10MB)"}</div>
              </div>

              <div className="flex gap-2.5 justify-end">
                <button className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg px-4 py-2 text-[14px] font-medium cursor-pointer" onClick={() => setShowAdd(false)}>Anuleaza</button>
                <button
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-[14px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!uploadFile || uploadLoading}
                  onClick={handleManualUpload}
                >{uploadLoading ? <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Proceseaza si creeaza firma"}</button>
              </div>
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}
