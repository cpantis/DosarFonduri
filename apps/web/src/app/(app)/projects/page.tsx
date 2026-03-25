"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, apiDelete } from "@/lib/api";

import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { BtnPrimary, BtnOutline, BtnSecondary, IconPlus, IconArrowLeft, IconArrowRight, IconCheck } from "@/components/ui/Buttons";
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
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; status: string } | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleting, setDeleting] = useState(false);

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

  const openDeleteConfirm = (p: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget({ id: p.id, name: p.name, status: p.status });
    setDeleteStep(1);
    setDeleteConfirmText("");
    setDeleting(false);
  };

  const handleDeleteProject = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/projects/${deleteTarget.id}`);
      setProjects(prev => prev.filter(p => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err: any) {
      console.error("Delete project failed:", err);
      alert(err?.message || "Eroare la ștergerea proiectului");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div style={{ animation: "prjFadeIn .25s ease-out" }}>
      <style>{`
        @keyframes prjFadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .prj-header{margin-bottom:28px}
        .prj-header-title{font-size:26px;font-weight:800;color:#0f172a;letter-spacing:-.5px;line-height:1.2}
        .prj-header-sub{font-size:13px;color:#94a3b8;margin-top:6px;font-weight:500;display:flex;align-items:center;gap:12px}
        .prj-header-stat{display:inline-flex;align-items:center;gap:4px;font-weight:600;color:#64748b}
        .prj-header-stat .num{font-family:'JetBrains Mono',monospace;font-weight:700;color:#0f172a}
        .prj-toolbar{display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap}
        .prj-search-wrap{position:relative;flex:1 1 260px;max-width:380px}
        .prj-search-icon{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:#94a3b8;pointer-events:none}
        .prj-search{border:1px solid #e2e8f0;border-radius:12px;padding:10px 14px 10px 42px;font-size:14px;background:#fff;color:#0f172a;outline:none;width:100%;transition:all .15s;font-family:'Inter',system-ui,sans-serif}
        .prj-search:focus{border-color:#4d8bff;box-shadow:0 0 0 3px rgba(77,139,255,.1)}
        .prj-search::placeholder{color:#cbd5e1}
        .prj-filters{display:flex;align-items:center;gap:4px;padding:3px;background:#f8fafc;border-radius:12px;border:1px solid #f1f5f9}
        .prj-filter{font-size:11px;font-weight:600;padding:6px 12px;border-radius:9px;border:none;cursor:pointer;transition:all .15s;background:transparent;color:#94a3b8;font-family:'Inter',system-ui,sans-serif}
        .prj-filter:hover{color:#64748b}
        .prj-filter.on{background:#fff;color:#0f172a;box-shadow:0 1px 3px rgba(0,0,0,.06)}
        .prj-sort{padding:8px 12px;font-size:12px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#475569;font-family:'Inter',system-ui,sans-serif;cursor:pointer;font-weight:500;outline:none}
        .prj-sort:focus{border-color:#4d8bff}
        .prj-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:20px 22px;margin-bottom:10px;cursor:pointer;transition:all .2s;position:relative;overflow:hidden}
        .prj-card:hover{border-color:#cbd5e1;box-shadow:0 4px 20px rgba(0,0,0,.04);transform:translateY(-1px)}
        .prj-card-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px}
        .prj-card-name{font-size:15px;font-weight:700;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;transition:color .15s}
        .prj-card:hover .prj-card-name{color:#4d8bff}
        .prj-card-meta{font-size:12px;color:#94a3b8;display:flex;align-items:center;gap:8px;margin-bottom:12px}
        .prj-card-meta .sep{width:1px;height:12px;background:#e2e8f0}
        .prj-metrics{display:flex;gap:16px}
        .prj-metric{display:flex;flex-direction:column;gap:4px;min-width:100px}
        .prj-metric-label{font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px}
        .prj-metric-bar{display:flex;align-items:center;gap:6px}
        .prj-metric-track{flex:1;height:4px;background:#f1f5f9;border-radius:2px;overflow:hidden;min-width:48px}
        .prj-metric-fill{height:100%;border-radius:2px;transition:width .4s ease}
        .prj-metric-val{font-size:11px;font-family:'JetBrains Mono',monospace;font-weight:600;color:#94a3b8;min-width:32px}
        .prj-lock-badge{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;padding:2px 8px;border-radius:6px;background:rgba(251,191,36,.12);color:#b45309;white-space:nowrap}
        .prj-card-actions{position:absolute;right:16px;top:50%;transform:translateY(-50%);display:flex;align-items:center;gap:6px;opacity:0;transition:opacity .15s}
        .prj-card:hover .prj-card-actions{opacity:1}
        .prj-del-btn{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;color:#cbd5e1;cursor:pointer;transition:all .15s}
        .prj-del-btn:hover{background:rgba(239,68,68,.08);color:#ef4444}
        .prj-arrow{color:#cbd5e1;transition:color .15s}
        .prj-card:hover .prj-arrow{color:#94a3b8}
        .prj-skel{height:90px;border-radius:14px;margin-bottom:10px;background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%);background-size:200% 100%;animation:prjSkelShine 1.5s infinite}
        @keyframes prjSkelShine{0%{background-position:200% 0}100%{background-position:-200% 0}}
      `}</style>

      <div style={{ padding: "32px 40px 48px" }}>
        {/* ─── HEADER ─── */}
        <div className="prj-header">
          <h1 className="prj-header-title">Proiecte</h1>
          {!loading && (
            <div className="prj-header-sub">
              <span className="prj-header-stat"><span className="num">{projects.length}</span> proiecte</span>
              <span className="prj-header-stat"><span className="num">{projects.filter(p => p.status === "in_progress").length}</span> in lucru</span>
              <span className="prj-header-stat"><span className="num">{projects.filter(p => p.status === "submitted" || p.status === "approved").length}</span> depuse</span>
            </div>
          )}
        </div>

        {/* ─── TOOLBAR ─── */}
        <div className="prj-toolbar">
          {!loading && projects.length > 0 && (
            <>
              <div className="prj-search-wrap">
                <svg className="prj-search-icon" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input className="prj-search" placeholder="Caută proiect sau firmă..." value={searchFilter} onChange={e => setSearchFilter(e.target.value)} />
              </div>
              <div className="prj-filters">
                {[
                  { id: "all", label: "Toate", count: projects.length },
                  { id: "draft", label: "Draft", count: projects.filter(p => p.status === "draft").length },
                  { id: "in_progress", label: "In progres", count: projects.filter(p => p.status === "in_progress").length },
                  { id: "review", label: "Review", count: projects.filter(p => p.status === "review").length },
                  { id: "submitted", label: "Depus", count: projects.filter(p => p.status === "submitted").length },
                ].filter(f => f.id === "all" || f.count > 0).map(f => (
                  <button key={f.id} className={`prj-filter ${statusFilter === f.id ? "on" : ""}`} onClick={() => setStatusFilter(f.id)}>
                    {f.label} <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, opacity: .6, marginLeft: 2 }}>{f.count}</span>
                  </button>
                ))}
              </div>
              <select className="prj-sort" value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
                <option value="date">Sort: Dată</option>
                <option value="name">Sort: Nume</option>
                <option value="value">Sort: Valoare</option>
              </select>
            </>
          )}
          <div style={{ marginLeft: "auto", flexShrink: 0 }}>
            <BtnPrimary icon={<IconPlus />} size="sm" onClick={openCreate}>Proiect nou</BtnPrimary>
          </div>
        </div>

        {/* ─── CONTENT ─── */}
        {loading ? (
          <div>{[1, 2, 3].map(i => <div key={i} className="prj-skel" />)}</div>
        ) : projects.length === 0 ? (
          <EmptyState icon={"\u{1F4C1}"} title="Niciun proiect încă" description="Crează un proiect nou pentru a începe pregătirea dosarului." actionLabel="Crează primul proiect" onAction={openCreate} />
        ) : (
          <div>
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
              const hasMetrics = eligibility.total > 0 || elements.total > 0 || docs.total > 0;
              return (
                <div key={p.id} className="prj-card" onClick={() => router.push(`/projects/${p.id}`)}>
                  {/* Row 1: Name + badges */}
                  <div className="prj-card-top">
                    <span className="prj-card-name">{p.name}</span>
                    <StatusBadge status={p.status} />
                    {p.lock && (
                      <span className="prj-lock-badge" title={`Blocat de ${p.lock.lockedByName || "alt utilizator"} din ${p.lock.lockedAt ? new Date(p.lock.lockedAt).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" }) : "—"}`}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        {p.lock.lockedByName || "Blocat"}
                      </span>
                    )}
                    {p.scoreSummary && p.scoreSummary.maxTotalPoints > 0 && (
                      <span style={{
                        fontSize: 12, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                        background: p.scoreSummary.percentage >= 80 ? "rgba(52,211,153,.15)" : p.scoreSummary.percentage >= 60 ? "rgba(251,191,36,.15)" : "rgba(248,113,113,.15)",
                        color: p.scoreSummary.percentage >= 80 ? "#059669" : p.scoreSummary.percentage >= 60 ? "#d97706" : "#dc2626",
                      }}>{p.scoreSummary.totalPoints}/{p.scoreSummary.maxTotalPoints} pct</span>
                    )}
                    {p.valoare && <span style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: "#059669" }}>{formatValoare(p.valoare)}</span>}
                  </div>

                  {/* Row 2: Meta */}
                  <div className="prj-card-meta">
                    <span>{p.company?.denumire || "—"}</span>
                    {programPath.masura && <><div className="sep" /><span>{programPath.masura}</span></>}
                    {p.updatedAt && <><div className="sep" /><span>{formatRelativeTime(p.updatedAt)}</span></>}
                  </div>

                  {/* Row 3: Progress metrics */}
                  {hasMetrics && (
                    <div className="prj-metrics">
                      {eligibility.total > 0 && (
                        <div className="prj-metric">
                          <span className="prj-metric-label">Eligibilitate</span>
                          <div className="prj-metric-bar">
                            <div className="prj-metric-track"><div className="prj-metric-fill" style={{ width: `${eligPct}%`, background: eligPct >= 80 ? "#059669" : eligPct >= 50 ? "#4d8bff" : "#d97706" }} /></div>
                            <span className="prj-metric-val">{eligibility.passed}/{eligibility.total}</span>
                          </div>
                        </div>
                      )}
                      {elements.total > 0 && (
                        <div className="prj-metric">
                          <span className="prj-metric-label">Elemente</span>
                          <div className="prj-metric-bar">
                            <div className="prj-metric-track"><div className="prj-metric-fill" style={{ width: `${elemPct}%`, background: elemPct >= 80 ? "#059669" : elemPct >= 50 ? "#4d8bff" : "#d97706" }} /></div>
                            <span className="prj-metric-val">{elements.filled}/{elements.total}</span>
                          </div>
                        </div>
                      )}
                      {docs.total > 0 && (
                        <div className="prj-metric">
                          <span className="prj-metric-label">Documente</span>
                          <div className="prj-metric-bar">
                            <div className="prj-metric-track"><div className="prj-metric-fill" style={{ width: `${docsPct}%`, background: docsPct >= 80 ? "#a78bfa" : "#94a3b8" }} /></div>
                            <span className="prj-metric-val">{docs.done}/{docs.total}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Hover actions */}
                  <div className="prj-card-actions">
                    <button className="prj-del-btn" title="Sterge proiectul" onClick={(e) => openDeleteConfirm(p, e)}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                    <svg className="prj-arrow" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
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
      {/* DELETE PROJECT MODAL — double confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] bg-black/30 backdrop-blur-[2px]" onClick={e => e.target === e.currentTarget && setDeleteTarget(null)}>
          <div className="bg-white rounded-[18px] w-[440px] shadow-[0_24px_64px_rgba(0,0,0,.10)] animate-[fadeUp_.2s_ease-out] border border-slate-200/70" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
            <div className="p-6">
              {deleteStep === 1 ? (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </div>
                    <div>
                      <div className="text-[15px] font-semibold text-slate-900">Șterge proiectul</div>
                      <div className="text-[13px] text-slate-500">Această acțiune este ireversibilă</div>
                    </div>
                  </div>
                  <div className="bg-red-50/80 rounded-xl p-4 mb-4 border border-red-100">
                    <div className="text-[13px] font-semibold text-red-800 mb-2">{deleteTarget.name}</div>
                    <div className="text-[12px] text-red-600 leading-relaxed">
                      Se vor șterge permanent: toate elementele, eligibilitatea, conversațiile Solomon, documentele generate (Neemia), checklistul și scoringul.
                    </div>
                  </div>
                  {(deleteTarget.status === "submitted" || deleteTarget.status === "approved") ? (
                    <div className="bg-amber-50 rounded-xl p-3 mb-4 border border-amber-200 text-[12px] text-amber-700">
                      Proiectele depuse sau aprobate nu pot fi șterse.
                    </div>
                  ) : null}
                  <div className="flex gap-2.5 justify-end pt-2 border-t border-slate-100">
                    <button className="px-4 py-2 rounded-lg text-[13px] font-medium text-slate-600 hover:bg-slate-50 transition-colors" onClick={() => setDeleteTarget(null)}>Anulează</button>
                    <button
                      className="px-4 py-2 rounded-lg text-[13px] font-medium bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-40"
                      disabled={deleteTarget.status === "submitted" || deleteTarget.status === "approved"}
                      onClick={() => setDeleteStep(2)}
                    >Continuă</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[15px] font-semibold text-slate-900 mb-1">Confirmare finală</div>
                  <div className="text-[13px] text-slate-500 mb-4">
                    Tastează <span className="font-mono font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">{deleteTarget.name}</span> pentru a confirma ștergerea.
                  </div>
                  <input
                    type="text"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-[14px] text-slate-900 focus:border-red-400 focus:ring-2 focus:ring-red-100 outline-none transition-all mb-4"
                    placeholder="Numele proiectului..."
                    value={deleteConfirmText}
                    onChange={e => setDeleteConfirmText(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-2.5 justify-end pt-2 border-t border-slate-100">
                    <button className="px-4 py-2 rounded-lg text-[13px] font-medium text-slate-600 hover:bg-slate-50 transition-colors" onClick={() => { setDeleteStep(1); setDeleteConfirmText(""); }}>Înapoi</button>
                    <button
                      className="px-4 py-2 rounded-lg text-[13px] font-medium bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-40"
                      disabled={deleteConfirmText !== deleteTarget.name || deleting}
                      onClick={handleDeleteProject}
                    >{deleting ? "Se șterge..." : "Șterge definitiv"}</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
