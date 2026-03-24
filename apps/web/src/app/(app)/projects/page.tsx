"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost } from "@/lib/api";

import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { BtnPrimary, BtnSecondary, IconPlus, IconArrowLeft, IconArrowRight, IconCheck } from "@/components/ui/Buttons";
import { SkeletonCard } from "@/components/ui/Skeleton";

const pct = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0;

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "Acum";
  if (diffMin < 60) return `${diffMin} min`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return "Ieri";
  if (diffDays < 7) return `${diffDays} zile`;
  return date.toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" });
}

function formatValoare(val: string | null | undefined): string {
  if (!val) return "—";
  const num = Number(val);
  if (isNaN(num)) return val;
  return new Intl.NumberFormat("ro-RO").format(num) + " EUR";
}

interface FolderNode { id: string; name: string; type?: string; children?: FolderNode[]; }
interface ProgramTree { program: string; masuri: { name: string; sesiuni: { name: string; folderId: string }[] }[]; }

function buildProgramTree(folders: FolderNode[]): ProgramTree[] {
  const tree: ProgramTree[] = [];
  for (const prog of folders) {
    const entry: ProgramTree = { program: prog.name, masuri: [] };
    if (prog.children) {
      for (const masura of prog.children) {
        const sesiuni: { name: string; folderId: string }[] = [];
        if (masura.children) {
          for (const sesiune of masura.children) {
            sesiuni.push({ name: sesiune.name, folderId: sesiune.id });
          }
        }
        entry.masuri.push({ name: masura.name, sesiuni });
      }
    }
    tree.push(entry);
  }
  return tree;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [createStep, setCreateStep] = useState(1);
  const [createData, setCreateData] = useState<{ name: string; firmaId: string | null; folderId: string | null; program: string | null; masura: string | null; sesiune: string | null }>({ name: "", firmaId: null, folderId: null, program: null, masura: null, sesiune: null });
  const [creating, setCreating] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<any[]>([]);
  // GAP 17: Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchFilter, setSearchFilter] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "name" | "value">("date");
  const [folderTree, setFolderTree] = useState<ProgramTree[]>([]);
  const [rawFolders, setRawFolders] = useState<FolderNode[]>([]);
  const [guideWarning, setGuideWarning] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiGet("/api/projects")
      .then((data: any) => { setProjects(Array.isArray(data) ? data : data.data || data.projects || []); })
      .catch((err) => { console.warn("[projects] load failed:", err.message); setProjects([]); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!showCreate) return;
    apiGet("/api/companies").then((data: any) => {
      const list = Array.isArray(data) ? data : data.data || data.companies || [];
      setCompanies(list.map((c: any) => ({ id: c.id, name: c.denumire || c.name })));
    }).catch((err) => { console.warn("[projects] companies load:", err.message); setCompanies([]); });
    apiGet("/api/documents/folders").then((data: any) => {
      const folders = Array.isArray(data) ? data : data.folders || [];
      setRawFolders(folders);
      setFolderTree(buildProgramTree(folders));
    }).catch((err) => { console.warn("[projects] folders load:", err.message); setRawFolders([]); setFolderTree([]); });
  }, [showCreate]);

  // Check if selected session has a processed guide (guides live in a "ghiduri" child folder of the session)
  useEffect(() => {
    if (!createData.folderId) { setGuideWarning(null); return; }
    setGuideWarning(null);

    // Find the "ghiduri" subfolder of the selected session from the raw folder tree
    const findGhiduriFolderId = (nodes: FolderNode[]): string | null => {
      for (const node of nodes) {
        if (node.id === createData.folderId) {
          // Found session folder — look for "ghiduri" child
          const ghiduri = node.children?.find((c: FolderNode) => c.type === "ghiduri");
          return ghiduri?.id || null;
        }
        if (node.children) {
          const found = findGhiduriFolderId(node.children);
          if (found) return found;
        }
      }
      return null;
    };

    const ghiduriFolderId = findGhiduriFolderId(rawFolders);
    if (!ghiduriFolderId) {
      setGuideWarning("Sesiunea selectată nu are folder de ghiduri. Proiectul nu va avea reguli de eligibilitate.");
      return;
    }

    apiGet(`/api/documents/folders/${ghiduriFolderId}/documents`)
      .then((data: any) => {
        const docs = Array.isArray(data) ? data : data.documents || [];
        const hasProcessedGuide = docs.some((d: any) =>
          d.processingType === "ghid" && d.status === "processed"
        );
        if (!hasProcessedGuide) {
          setGuideWarning("Sesiunea selectată nu are ghid procesat. Proiectul nu va avea reguli de eligibilitate.");
        }
      })
      .catch(() => { /* ignore — non-critical check */ });
  }, [createData.folderId, rawFolders]);

  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!createData.name.trim() || !createData.firmaId || !createData.folderId) return;
    setCreating(true);
    setCreateError(null);
    try {
      const result: any = await apiPost("/api/projects", { name: createData.name.trim(), companyId: createData.firmaId, folderId: createData.folderId });
      console.log("[projects/create] Result:", JSON.stringify(result));
      if (!result?.id) {
        setCreateError("Proiectul a fost creat dar nu s-a primit ID-ul. Reîncarcă pagina.");
        setCreating(false);
        return;
      }
      setShowCreate(false);
      router.push(`/projects/${result.id}`);
    } catch (err: any) {
      const msg = err?.message || "Eroare necunoscută la crearea proiectului";
      setCreateError(msg);
      setCreating(false);
    }
  };

  const openCreate = () => {
    setShowCreate(true);
    setCreateStep(1);
    setCreating(false);
    setCreateError(null);
    setCreateData({ name: "", firmaId: null, folderId: null, program: null, masura: null, sesiune: null });
  };

  return (
    <div className="animate-[fadeIn_.2s_ease-out]">
      <div className="max-w-6xl mx-auto px-8 py-6">
        {/* Search + filters + action */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          {!loading && projects.length > 0 && (
            <>
              <input
                className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white outline-none focus:border-blue-500 transition-colors"
                placeholder="Caută proiect..."
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                style={{ width: 200 }}
              />
              <div className="flex rounded-lg p-0.5 gap-px bg-slate-100">
                {[
                  { id: "all", label: "Toate" },
                  { id: "draft", label: "Draft" },
                  { id: "in_progress", label: "În progres" },
                  { id: "review", label: "Review" },
                  { id: "submitted", label: "Depus" },
                  { id: "approved", label: "Aprobat" },
                  { id: "rejected", label: "Respins" },
                ].map(f => (
                  <button key={f.id}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold border-none cursor-pointer transition-all ${statusFilter === f.id ? "bg-blue-600 text-white" : "bg-transparent text-slate-400 hover:text-slate-600"}`}
                    onClick={() => setStatusFilter(f.id)}
                  >{f.label}</button>
                ))}
              </div>
              <select className="px-2 py-1.5 text-[12px] border border-slate-200 rounded-lg bg-white" value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
                <option value="date">Sort: Dată</option>
                <option value="name">Sort: Nume</option>
                <option value="value">Sort: Valoare</option>
              </select>
            </>
          )}
          <div style={{ marginLeft: "auto" }}>
            <BtnPrimary icon={<IconPlus />} size="lg" onClick={openCreate}>Proiect nou</BtnPrimary>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        ) : projects.length === 0 ? (
          <EmptyState icon={"\u{1F4C1}"} title="Niciun proiect încă" description="Crează un proiect nou pentru a începe pregătirea dosarului." actionLabel="Crează primul proiect" onAction={openCreate} />
        ) : (
          <div className="space-y-2">
            {projects
              .filter(p => statusFilter === "all" || p.status === statusFilter)
              .filter(p => !searchFilter || p.name?.toLowerCase().includes(searchFilter.toLowerCase()) || p.company?.denumire?.toLowerCase().includes(searchFilter.toLowerCase()))
              .sort((a, b) => {
                if (sortBy === "name") return (a.name || "").localeCompare(b.name || "");
                if (sortBy === "value") return (Number(b.valoare) || 0) - (Number(a.valoare) || 0);
                return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
              })
              .map(p => {
              const prog = p.progress || {};
              const eligibility = prog.eligibility || { passed: 0, total: 0 };
              const elements = prog.elements || { filled: 0, total: 0 };
              const docs = prog.docs || { done: 0, total: 0 };
              const programPath = p.programPath || {};
              const eligPct = pct(eligibility.passed, eligibility.total);
              const elemPct = pct(elements.filled, elements.total);
              const docsPct = pct(docs.done, docs.total);
              return (
                <div
                  key={p.id}
                  className="bg-white rounded-xl border border-slate-200/80 p-5 hover:shadow-sm hover:border-slate-300/80 transition-all cursor-pointer group overflow-hidden"
                  onClick={() => router.push(`/projects/${p.id}`)}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-[15px] font-semibold text-slate-900 group-hover:text-blue-600 transition-colors truncate max-w-full">{p.name}</span>
                        <StatusBadge status={p.status} />
                        {p.scoreSummary && p.scoreSummary.maxTotalPoints > 0 && (
                          <span className="text-[12px] font-mono font-bold tabular-nums px-1.5 py-0.5 rounded" style={{
                            background: p.scoreSummary.percentage >= 80 ? "rgba(52,211,153,.15)" : p.scoreSummary.percentage >= 60 ? "rgba(251,191,36,.15)" : "rgba(248,113,113,.15)",
                            color: p.scoreSummary.percentage >= 80 ? "#059669" : p.scoreSummary.percentage >= 60 ? "#d97706" : "#dc2626",
                          }}>{p.scoreSummary.totalPoints}/{p.scoreSummary.maxTotalPoints}</span>
                        )}
                        {p.valoare && <span className="text-[13px] font-mono font-semibold text-emerald-600 tabular-nums">{formatValoare(p.valoare)}</span>}
                      </div>
                      <div className="text-[13px] text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                        <span className="truncate max-w-[200px]">{p.company?.denumire || "—"}</span>
                        {programPath.masura && <><span className="text-slate-200">·</span><span className="text-slate-400 truncate max-w-[200px]">{programPath.masura}</span></>}
                        {p.updatedAt && <><span className="text-slate-200">·</span><span className="text-slate-400">{formatRelativeTime(p.updatedAt)}</span></>}
                      </div>
                    </div>
                    <div className="flex items-center gap-5 shrink-0">
                      {/* Progress indicators */}
                      {eligibility.total > 0 && (
                        <div className="text-right">
                          <div className="text-[11px] text-slate-400 mb-1">Eligibilitate</div>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${eligPct}%`, background: eligPct >= 80 ? "#059669" : eligPct >= 50 ? "#2563eb" : "#d97706" }} />
                            </div>
                            <span className="text-[12px] font-medium text-slate-600 tabular-nums">{eligibility.passed}/{eligibility.total}</span>
                          </div>
                        </div>
                      )}
                      {elements.total > 0 && (
                        <div className="text-right">
                          <div className="text-[11px] text-slate-400 mb-1">Elemente</div>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${elemPct}%`, background: elemPct >= 80 ? "#059669" : elemPct >= 50 ? "#2563eb" : "#d97706" }} />
                            </div>
                            <span className="text-[12px] font-medium text-slate-600 tabular-nums">{elements.filled}/{elements.total}</span>
                          </div>
                        </div>
                      )}
                      {/* GAP 18: Docs generated progress */}
                      {docs.total > 0 && (
                        <div className="text-right">
                          <div className="text-[11px] text-slate-400 mb-1">Documente</div>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${docsPct}%`, background: docsPct >= 80 ? "#a78bfa" : "#94a3b8" }} />
                            </div>
                            <span className="text-[12px] font-medium text-slate-600 tabular-nums">{docs.done}/{docs.total}</span>
                          </div>
                        </div>
                      )}
                      <svg className="w-4 h-4 text-slate-300 group-hover:text-slate-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CREATE PROJECT MODAL */}
      {showCreate && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] bg-black/30 backdrop-blur-[2px]" onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="bg-white rounded-[18px] w-[540px] max-h-[85vh] overflow-y-auto shadow-[0_24px_64px_rgba(0,0,0,.10)] animate-[fadeUp_.2s_ease-out] border border-slate-200/70" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-7 pt-6 pb-0">
              <div>
                <h2 className="text-[17px] font-bold text-slate-800">Proiect nou</h2>
                <p className="text-[12px] text-slate-400 mt-0.5">Configurează dosarul de finanțare</p>
              </div>
              <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-300 hover:text-slate-500 transition-colors" onClick={() => setShowCreate(false)}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Stepper */}
            <div className="px-7 pt-5 pb-6">
              <div className="flex items-center">
                {["Firmă", "Program", "Confirmare"].map((label, i) => {
                  const s = i + 1;
                  const isActive = createStep === s;
                  const isDone = createStep > s;
                  return <div key={s} className="contents">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-bold transition-all ${
                        isActive ? "bg-blue-500 text-white shadow-sm shadow-blue-500/30" :
                        isDone ? "bg-emerald-50 text-emerald-500 border border-emerald-200" :
                        "bg-slate-50 text-slate-400 border border-slate-200"
                      }`}>{isDone ? <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><polyline points="20 6 9 17 4 12" /></svg> : s}</div>
                      <span className={`text-[13px] font-medium ${isActive ? "text-slate-800" : isDone ? "text-emerald-600" : "text-slate-400"}`}>{label}</span>
                    </div>
                    {s < 3 && <div className={`flex-1 h-px mx-4 ${isDone ? "bg-emerald-200" : "bg-slate-100"}`} />}
                  </div>;
                })}
              </div>
            </div>

            {/* Step content */}
            <div className="px-7 pb-7">
              {createStep === 1 && (<>
                <label className="block text-[11px] font-semibold uppercase tracking-widest mb-3 text-slate-400">Selectează firma</label>
                <div className="space-y-1.5 mb-6">
                  {companies.length === 0 ? (
                    <div className="text-center py-8 text-[13px] text-slate-400">
                      <div className="text-2xl mb-2">🏢</div>
                      <div className="font-medium text-slate-500 mb-1">Nicio firmă adăugată</div>
                      <div>Adaugă o firmă din pagina <a href="/companies" className="text-blue-500 hover:underline">Firme</a> pentru a crea un proiect.</div>
                    </div>
                  ) : companies.map(f => (
                    <div key={f.id}
                      className={`px-4 py-3 rounded-lg cursor-pointer transition-all text-[13px] font-medium flex items-center gap-3 ${createData.firmaId === f.id ? "bg-blue-50 text-blue-700 ring-2 ring-blue-500/20" : "bg-slate-50/80 text-slate-600 hover:bg-slate-100"}`}
                      onClick={() => setCreateData(p => ({ ...p, firmaId: f.id }))}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[14px] ${createData.firmaId === f.id ? "bg-blue-100" : "bg-white border border-slate-200"}`}>🏢</div>
                      {f.name}
                      {createData.firmaId === f.id && <svg className="w-4 h-4 ml-auto text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2.5 justify-end pt-2 border-t border-slate-100">
                  <BtnSecondary onClick={() => setShowCreate(false)}>Anulează</BtnSecondary>
                  <BtnPrimary icon={<IconArrowRight />} disabled={!createData.firmaId} onClick={() => setCreateStep(2)}>Continuă</BtnPrimary>
                </div>
              </>)}

              {createStep === 2 && (<>
                <label className="block text-[11px] font-semibold uppercase tracking-widest mb-3 text-slate-400">Selectează programul și sesiunea</label>
                <div className="mb-6 space-y-1 rounded-xl bg-slate-50/80 p-3">
                {folderTree.length === 0 ? (
                    <div className="text-center py-8 text-[13px] text-slate-400">
                      <div className="text-2xl mb-2">📁</div>
                      <div className="font-medium text-slate-500 mb-1">Niciun program configurat</div>
                      <div>Creează structura de programe din pagina <a href="/documents" className="text-blue-500 hover:underline">Documente</a>.</div>
                    </div>
                ) : null}
                  {folderTree.map(prog => (
                    <div key={prog.program}>
                      <div className="text-[13px] font-semibold py-1.5 px-2 flex items-center gap-2.5 text-slate-800">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> {prog.program}
                      </div>
                      {prog.masuri.map(m => (
                        <div key={m.name}>
                          <div className="py-1 px-2 pl-7 text-[12px] flex items-center gap-2 text-slate-500 font-medium">
                            <div className="w-1 h-1 rounded-full bg-amber-400" /> {m.name}
                          </div>
                          {m.sesiuni.map(s => (
                            <div key={s.folderId}
                              className={`py-2 px-3 ml-10 text-[12px] flex items-center gap-2 cursor-pointer rounded-lg transition-all ${createData.folderId === s.folderId ? "bg-white text-blue-600 font-semibold shadow-sm" : "text-slate-400 hover:text-slate-600 hover:bg-white/60"}`}
                              onClick={() => setCreateData(p => ({ ...p, folderId: s.folderId, program: prog.program, masura: m.name, sesiune: s.name }))}>
                              {createData.folderId === s.folderId
                                ? <svg className="w-3.5 h-3.5 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>
                                : <div className="w-1 h-1 rounded-full bg-slate-300 shrink-0" />
                              }
                              {s.name}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                {guideWarning && (
                  <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-[12px] text-amber-800">
                    <span className="shrink-0 mt-0.5">⚠️</span>
                    <span>{guideWarning}</span>
                  </div>
                )}
                <div className="flex gap-2.5 justify-end pt-2 border-t border-slate-100">
                  <BtnSecondary icon={<IconArrowLeft />} onClick={() => setCreateStep(1)}>Înapoi</BtnSecondary>
                  <BtnPrimary icon={<IconArrowRight />} disabled={!createData.folderId} onClick={() => setCreateStep(3)}>Continuă</BtnPrimary>
                </div>
              </>)}

              {createStep === 3 && (<>
                <label className="block text-[11px] font-semibold uppercase tracking-widest mb-2 text-slate-400">Denumire proiect</label>
                <input
                  className="w-full px-4 py-3 rounded-[10px] text-[14px] outline-none border border-slate-200 bg-slate-50/50 text-slate-900 placeholder:text-slate-300 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all mb-5"
                  placeholder="ex: Modernizare linie producție..."
                  value={createData.name}
                  onChange={e => setCreateData(p => ({ ...p, name: e.target.value }))}
                  autoFocus
                />

                <div className="rounded-xl mb-5 bg-slate-50/80 overflow-hidden">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-4 pt-3 pb-1.5">Rezumat</div>
                  {[
                    { label: "Firmă", value: companies.find(f => f.id === createData.firmaId)?.name },
                    { label: "Program", value: createData.program },
                    { label: "Măsură", value: createData.masura },
                    { label: "Sesiune", value: createData.sesiune },
                  ].map((row, i) => (
                    <div key={row.label} className={`flex items-center gap-3 px-4 py-2.5 text-[13px] ${i < 3 ? "border-b border-slate-100" : ""}`}>
                      <span className="text-slate-400 w-16 shrink-0 text-[12px]">{row.label}</span>
                      <span className="font-medium text-slate-700">{row.value}</span>
                    </div>
                  ))}
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed mb-5">
                  La creare, proiectul va prelua automat ghidurile, template-urile și regulile din sesiunea selectată.
                </p>

                {/* F2.4: Show creation errors */}
                {createError && (
                  <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50/50 text-[13px] text-red-600 flex items-center gap-2">
                    <span>⚠️</span>
                    <span className="flex-1">{createError}</span>
                    <button className="text-red-400 hover:text-red-600 text-xs" onClick={() => setCreateError(null)}>✕</button>
                  </div>
                )}

                <div className="flex gap-2.5 justify-end pt-2 border-t border-slate-100">
                  <BtnSecondary icon={<IconArrowLeft />} onClick={() => setCreateStep(2)}>Înapoi</BtnSecondary>
                  <BtnPrimary icon={<IconCheck />} disabled={!createData.name.trim() || creating} onClick={handleCreate}>
                    {creating ? "Se creează..." : "Creează proiect"}
                  </BtnPrimary>
                </div>
              </>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
