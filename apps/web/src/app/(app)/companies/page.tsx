"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { isPF, FORME_JURIDICE } from "@/hooks/useFormaJuridica";
import { apiGet, apiPost, api } from "@/lib/api";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { TypeBadge } from "@/components/shared/TypeBadge";
import { EmptyState } from "@/components/shared/EmptyState";

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
    <div className="min-h-full" style={{ background: "var(--bg-deep)" }}>
      <PageHeader title="Firme">
        <button
          className="rounded-lg px-4 py-2 text-sm font-medium transition-colors cursor-pointer"
          style={{ background: "var(--accent-blue)", color: "var(--text-on-accent)" }}
          onClick={() => { setShowAdd(true); setCui(""); setCuiRes(null); setAddMode("auto"); setAddForma("SRL"); setUploadFile(null); setCuiSearchResults([]); }}
        >+ Adaugă firmă</button>
      </PageHeader>

      <div className="px-8 py-6">
        {/* TOOLBAR */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <input
            className="rounded-lg px-3 py-2 text-[13px] outline-none transition-colors w-80"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            placeholder="Cauta firma, CUI, CAEN, judet, forma..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="flex rounded-lg p-0.5 gap-0.5" style={{ background: "var(--bg-elevated)" }}>
            {[
              { key: "all", label: "Toate" },
              { key: "activ", label: "Active" },
              { key: "radiat", label: "Radiate" },
              { key: "soc", label: "Societati" },
              { key: "pf", label: "PFA/II/IF" },
            ].map(item => (
              <button
                key={item.key}
                className="px-3.5 py-1.5 rounded-md text-[12px] font-semibold border-none cursor-pointer transition-colors whitespace-nowrap"
                style={filter === item.key
                  ? { background: "var(--accent-blue)", color: "var(--text-on-accent)" }
                  : { background: "transparent", color: "var(--text-secondary)" }
                }
                onClick={() => setFilter(item.key)}
              >{item.label}</button>
            ))}
          </div>
          {!loading && <span className="text-[13px] font-medium ml-auto" style={{ color: "var(--text-secondary)" }}>{filtered.length} firme</span>}
        </div>

        {/* COMPANY CARDS */}
        <div className="flex-1">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-3" style={{ color: "var(--text-muted)" }}>
              <span className="inline-block w-7 h-7 rounded-full animate-spin" style={{ border: "2px solid var(--border)", borderTopColor: "var(--accent-blue)" }} />
              <div className="text-[14px] text-center">Se incarca firmele...</div>
            </div>
          )}
          {error && (
            <div className="flex flex-col items-center justify-center py-20 gap-3" style={{ color: "var(--text-muted)" }}>
              <div className="text-[14px] text-center" style={{ color: "var(--accent-red)" }}>{error}</div>
              <button className="rounded-lg px-4 py-2 text-[13px] font-medium mt-2 cursor-pointer" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }} onClick={fetchCompanies}>Reincearca</button>
            </div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <EmptyState
              icon="🏢"
              title="Nicio firmă adăugată"
              description="Adaugă prima firmă pentru a începe"
            />
          )}
          {!loading && !error && filtered.length > 0 && (
            <div className="space-y-3">
              {filtered.map(f => {
                const forma = f.formaJuridica || "";
                const isProcessing = f.processingStatus === "processing";
                return (
                  <div
                    key={f.id}
                    className="rounded-xl p-5 cursor-pointer transition-shadow"
                    style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
                    onClick={() => router.push(`/companies/${f.id}`)}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = "var(--shadow-sm)"}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>{f.denumire}</div>
                      <div className="flex gap-1.5 flex-wrap shrink-0 ml-3">
                        <TypeBadge type={forma || "SRL"} />
                        <StatusBadge status={isProcessing ? "in_progress" : (f.stare || "functiune")} label={isProcessing ? "Se proceseaza..." : undefined} />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 mt-1">
                      <div className="text-[13px] flex items-center gap-2 flex-wrap" style={{ color: "var(--text-secondary)" }}>
                        <span className="font-mono" style={{ color: "var(--text-primary)" }}>CUI: {f.cui}</span>
                        {f.regCom && <><span style={{ color: "var(--text-muted)" }}>&middot;</span><span style={{ color: "var(--text-secondary)" }}>{f.regCom}</span></>}
                      </div>
                      {(f.localitate || f.judet) && (
                        <div className="text-[12px] flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                          <svg className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          <span>{[f.localitate, f.judet].filter(Boolean).join(", ")}</span>
                        </div>
                      )}
                      {f.caen && (
                        <div className="text-[12px] flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                          <span className="font-mono" style={{ color: "var(--text-secondary)" }}>CAEN {f.caen}</span>
                          {f.onrcRawData?.caenDesc && <span style={{ color: "var(--text-muted)" }}>&mdash; {f.onrcRawData.caenDesc}</span>}
                        </div>
                      )}
                      <div className="text-[12px] flex items-center gap-2 flex-wrap" style={{ color: "var(--text-muted)" }}>
                        {f.anInfiintare && <span>Din {f.anInfiintare}</span>}
                        {f.capitalSocial && <><span style={{ color: "var(--text-muted)" }}>&middot;</span><span>Capital: {Number(f.capitalSocial).toLocaleString("ro-RO")} RON</span></>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ADD MODAL */}
      {showAdd && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] animate-[fadeIn_0.2s]" style={{ background: "var(--overlay-bg)", backdropFilter: "blur(4px)" }} onClick={e => { if (e.target === e.currentTarget) setShowAdd(false); }}>
          <div className="rounded-2xl w-[560px] max-h-[85vh] overflow-y-auto p-8 animate-[slideUp_0.3s_ease]" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            <div className="text-xl font-bold mb-1.5 flex items-center justify-between" style={{ color: "var(--text-primary)" }}>
              Adauga firma
              <button className="bg-transparent border-none cursor-pointer text-xl p-1" style={{ color: "var(--text-muted)" }} onClick={() => setShowAdd(false)}>&times;</button>
            </div>
            <div className="flex rounded-lg overflow-hidden mb-5" style={{ border: "1px solid var(--border)" }}>
              <button
                className="flex-1 py-3 text-[13px] font-semibold cursor-pointer border-none flex items-center justify-center gap-1.5 transition-colors"
                style={addMode === "auto"
                  ? { background: "var(--accent-blue)", color: "var(--text-on-accent)" }
                  : { background: "transparent", color: "var(--text-secondary)" }
                }
                onClick={() => setAddMode("auto")}
              >Automat (CUI)</button>
              <button
                className="flex-1 py-3 text-[13px] font-semibold cursor-pointer border-none flex items-center justify-center gap-1.5 transition-colors"
                style={addMode === "manual"
                  ? { background: "var(--accent-blue)", color: "var(--text-on-accent)" }
                  : { background: "transparent", color: "var(--text-secondary)" }
                }
                onClick={() => setAddMode("manual")}
              >Manual (Upload ONRC)</button>
            </div>

            {addMode === "auto" ? (<>
              <div className="text-[13px] mb-3.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Cauta dupa CUI sau denumire firma. Datele se preiau automat de la ListaFirme.ro / ONRC.
              </div>
              <div className="flex gap-2.5 mb-3.5 relative">
                <input
                  className="flex-1 rounded-lg px-3 py-2 text-[13px] font-mono outline-none transition-colors"
                  style={{
                    background: "var(--bg-surface)",
                    color: "var(--text-primary)",
                    border: cuiRes && cuiRes !== "error" ? "1px solid var(--accent-green)" : cuiRes === "error" ? "1px solid var(--accent-red)" : "1px solid var(--border)",
                  }}
                  placeholder="CUI sau denumire firma..."
                  value={cui}
                  onChange={e => { setCui(e.target.value); setCuiRes(null); searchCUI(e.target.value); }}
                  onKeyDown={e => e.key === "Enter" && checkCui()}
                />
                <button
                  className="font-medium px-4 py-2 rounded-lg text-[14px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: "var(--accent-blue)", color: "var(--text-on-accent)" }}
                  onClick={checkCui}
                  disabled={cuiLoad || cui.replace(/\D/g, "").length < 4}
                >
                  {cuiLoad ? <span className="inline-block w-4 h-4 rounded-full animate-spin" style={{ border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff" }} /> : "Adauga"}
                </button>
              </div>

              {cuiSearchResults.length > 0 && !cuiRes && (
                <div className="rounded-lg overflow-hidden mb-2.5" style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
                  {cuiSearching && <div className="px-4 py-2 text-[11px]" style={{ color: "var(--text-muted)" }}>Se cauta...</div>}
                  {cuiSearchResults.map((r: any, idx: number) => (
                    <div key={idx}
                      className="px-4 py-3 cursor-pointer transition-colors text-[13px]"
                      style={{ borderBottom: "1px solid var(--border)" }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--bg-hover)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      onClick={() => { const code = r.fiscalCode || r.taxCode || ""; setCui(code); setCuiSearchResults([]); addFromListaFirme(code); }}
                    >
                      <div className="font-semibold" style={{ color: "var(--text-primary)" }}>{r.name}</div>
                      <div className="text-[11px] flex gap-3 mt-0.5" style={{ color: "var(--text-muted)" }}>
                        <span className="font-mono">CUI: {r.fiscalCode || r.taxCode || "\u2014"}</span>
                        {r.county && <span>{r.county}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {cuiLoad && (
                <div className="flex items-center gap-2.5 p-3.5 rounded-lg mb-3.5 text-[13px]" style={{ border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-secondary)" }}>
                  <span className="inline-block w-4 h-4 rounded-full animate-spin" style={{ border: "2px solid var(--border)", borderTopColor: "var(--accent-blue)" }} /> Se verifica si se adauga firma...
                </div>
              )}
              {cuiRes && cuiRes !== "error" && (
                <div className="p-4 rounded-lg mb-3.5" style={{ border: "1px solid var(--accent-green-border)", background: "var(--accent-green-bg)" }}>
                  <div className="text-[16px] font-bold mb-1.5" style={{ color: "var(--accent-green)" }}>{cuiRes.denumire}</div>
                  <div className="text-[13px] mb-0.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}><strong className="font-semibold mr-2" style={{ color: "var(--text-primary)" }}>Adresa:</strong>{cuiRes.adresa}</div>
                  <div className="text-[13px] mb-0.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}><strong className="font-semibold mr-2" style={{ color: "var(--text-primary)" }}>CAEN:</strong>{cuiRes.caen}</div>
                  <div className="text-[13px] mb-0.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}><strong className="font-semibold mr-2" style={{ color: "var(--text-primary)" }}>Stare:</strong><span style={{ color: "var(--accent-green)" }}>{cuiRes.stare}</span></div>
                </div>
              )}
              {cuiRes === "error" && <div className="p-3.5 rounded-lg mb-3.5 text-[13px]" style={{ border: "1px solid var(--accent-red-border)", background: "var(--accent-red-bg)", color: "var(--accent-red)" }}>CUI-ul nu a fost gasit sau a aparut o eroare.</div>}
              <div className="flex gap-2.5 justify-end">
                <button className="rounded-lg px-4 py-2 text-[14px] font-medium cursor-pointer" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }} onClick={() => setShowAdd(false)}>Anuleaza</button>
                <button className="font-medium px-4 py-2 rounded-lg text-[14px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed" style={{ background: "var(--accent-blue)", color: "var(--text-on-accent)" }} disabled={!cuiRes || cuiRes === "error"} onClick={() => setShowAdd(false)}>Inchide</button>
              </div>
            </>) : (<>
              <div className="text-[14px] mb-5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>Incarca documentul ONRC si agentii vor face restul:</div>
              <div className="text-[12px] mb-4 px-3.5 py-2.5 rounded-md text-center" style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}>Upload &rarr; OCR automat &rarr; Extragere date &rarr; Validare &rarr; Stocare</div>

              <div className="text-[11px] uppercase tracking-wide font-medium mt-3.5 mb-2" style={{ color: "var(--text-secondary)" }}>Societati comerciale</div>
              <div className="grid grid-cols-3 gap-2 mb-5">
                {FORME_JURIDICE.filter(f => f.group === "SOC").map(f => (
                  <div
                    key={f.cod}
                    className="py-2.5 px-3 rounded-md cursor-pointer text-center transition-colors text-[12px]"
                    style={addForma === f.cod
                      ? { border: "1px solid var(--accent-blue-border)", background: "var(--accent-blue-bg)" }
                      : { border: "1px solid var(--border)", background: "var(--bg-elevated)" }
                    }
                    onClick={() => setAddForma(f.cod)}
                  >
                    <div className="font-bold font-mono text-[13px] mb-0.5" style={{ color: "var(--text-primary)" }}>{f.short}</div>
                    <div className="text-[10px] leading-tight" style={{ color: "var(--text-muted)" }}>{f.label}</div>
                  </div>
                ))}
              </div>

              <div className="text-[11px] uppercase tracking-wide font-medium mt-3.5 mb-2" style={{ color: "var(--text-secondary)" }}>Persoane fizice / Intreprinderi</div>
              <div className="grid grid-cols-3 gap-2 mb-5">
                {FORME_JURIDICE.filter(f => f.group === "PF").map(f => (
                  <div
                    key={f.cod}
                    className="py-2.5 px-3 rounded-md cursor-pointer text-center transition-colors text-[12px]"
                    style={addForma === f.cod
                      ? { border: "1px solid var(--accent-blue-border)", background: "var(--accent-blue-bg)" }
                      : { border: "1px solid var(--border)", background: "var(--bg-elevated)" }
                    }
                    onClick={() => setAddForma(f.cod)}
                  >
                    <div className="font-bold font-mono text-[13px] mb-0.5" style={{ color: "var(--text-primary)" }}>{f.short}</div>
                    <div className="text-[10px] leading-tight" style={{ color: "var(--text-muted)" }}>{f.label}</div>
                  </div>
                ))}
              </div>

              <input type="file" ref={fileInputRef} accept=".pdf" className="hidden" onChange={handleFileSelect} />
              <div
                className="border-2 border-dashed rounded-lg py-8 px-5 text-center mb-4 transition-colors cursor-pointer"
                style={{ borderColor: "var(--border)" }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={handleFileDrop}
              >
                <div className="text-[28px] mb-2">{uploadFile ? "\u2705" : "\u{1F4C4}"}</div>
                <div className="text-[14px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{uploadFile ? uploadFile.name : "Certificat constatator / Document ONRC"}</div>
                <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>{uploadFile ? `${(uploadFile.size / 1024 / 1024).toFixed(1)} MB` : "Click sau trage fisierul aici (PDF, max 10MB)"}</div>
              </div>

              <div className="flex gap-2.5 justify-end">
                <button className="rounded-lg px-4 py-2 text-[14px] font-medium cursor-pointer" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }} onClick={() => setShowAdd(false)}>Anuleaza</button>
                <button
                  className="font-medium px-4 py-2 rounded-lg text-[14px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: "var(--accent-blue)", color: "var(--text-on-accent)" }}
                  disabled={!uploadFile || uploadLoading}
                  onClick={handleManualUpload}
                >{uploadLoading ? <span className="inline-block w-4 h-4 rounded-full animate-spin" style={{ border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff" }} /> : "Proceseaza si creeaza firma"}</button>
              </div>
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}
