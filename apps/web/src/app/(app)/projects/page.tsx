"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";

/* ═══ HELPERS ═══ */

const STATUS_DOT: Record<string, string> = {
  draft: "bg-slate-400",
  in_progress: "bg-blue-500",
  review: "bg-amber-500",
  submitted: "bg-emerald-500",
};

const pct = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0;

// Workflow stage definitions
const WORKFLOW_STAGES = [
  { key: "eligibility", label: "Eligibilitate", icon: "\u{1F6E1}" },
  { key: "writing", label: "Scriere", icon: "\u{1F4DD}" },
  { key: "documents", label: "Documente", icon: "\u{1F4C4}" },
  { key: "review", label: "Verificare", icon: "\u{1F50D}" },
  { key: "submission", label: "Depunere", icon: "\u{1F4E4}" },
];

function getWorkflowStage(p: any): { currentStage: number; stageProgress: number[] } {
  const prog = p.progress || {};
  const eligibility = prog.eligibility || { passed: 0, total: 0 };
  const elements = prog.elements || { filled: 0, total: 0 };
  const docs = prog.docs || { done: 0, total: 0 };
  const templates = prog.templates || { done: 0, total: 0 };

  const eligPct = pct(eligibility.passed, eligibility.total);
  const elemPct = pct(elements.filled, elements.total);
  const docsPct = pct(docs.done, docs.total);
  const tplPct = pct(templates.done, templates.total);

  const stageProgress = [
    eligPct,                                    // Eligibilitate
    elemPct,                                    // Scriere (elements filled)
    Math.round((docsPct + tplPct) / 2),        // Documente (docs + templates)
    p.status === "review" || p.status === "submitted" || p.status === "approved" ? 100 : 0, // Verificare
    p.status === "submitted" || p.status === "approved" ? 100 : 0,                          // Depunere
  ];

  // Determine current stage
  if (p.status === "approved") return { currentStage: 5, stageProgress };
  if (p.status === "submitted") return { currentStage: 4, stageProgress };
  if (p.status === "review") return { currentStage: 3, stageProgress };
  if (stageProgress[2] > 50) return { currentStage: 2, stageProgress };
  if (stageProgress[1] > 30) return { currentStage: 1, stageProgress };
  return { currentStage: 0, stageProgress };
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "Acum";
  if (diffMin < 60) return `Acum ${diffMin} min`;
  if (diffHours < 24) return `Acum ${diffHours} ore`;
  if (diffDays === 1) return "Ieri";
  if (diffDays < 7) return `Acum ${diffDays} zile`;
  return date.toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" });
}

function formatValoare(val: string | null | undefined): string {
  if (!val) return "—";
  const num = Number(val);
  if (isNaN(num)) return val;
  return new Intl.NumberFormat("ro-RO").format(num) + " EUR";
}

interface FolderNode {
  id: string;
  name: string;
  type?: string;
  children?: FolderNode[];
}

interface ProgramTree {
  program: string;
  masuri: { name: string; sesiuni: { name: string; folderId: string }[] }[];
}

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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [programFilter, setProgramFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [showCreate, setShowCreate] = useState(false);
  const [createStep, setCreateStep] = useState(1);
  const [createData, setCreateData] = useState<{ name: string; firmaId: string | null; folderId: string | null; program: string | null; masura: string | null; sesiune: string | null }>({ name: "", firmaId: null, folderId: null, program: null, masura: null, sesiune: null });
  const [creating, setCreating] = useState(false);

  /* ═══ DATA STATE ═══ */
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<any[]>([]);
  const [folderTree, setFolderTree] = useState<ProgramTree[]>([]);

  /* ═══ FETCH PROJECTS ═══ */
  useEffect(() => {
    setLoading(true);
    apiGet("/api/projects")
      .then((data: any) => {
        setProjects(Array.isArray(data) ? data : data.projects || []);
      })
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  /* ═══ FETCH COMPANIES + FOLDERS WHEN MODAL OPENS ═══ */
  useEffect(() => {
    if (!showCreate) return;
    apiGet("/api/companies")
      .then((data: any) => {
        const list = Array.isArray(data) ? data : data.companies || [];
        setCompanies(list.map((c: any) => ({ id: c.id, name: c.denumire || c.name })));
      })
      .catch(() => setCompanies([]));
    apiGet("/api/documents/folders")
      .then((data: any) => {
        const folders = Array.isArray(data) ? data : data.folders || [];
        setFolderTree(buildProgramTree(folders));
      })
      .catch(() => setFolderTree([]));
  }, [showCreate]);

  /* ═══ DERIVED ═══ */
  const filtered = projects.filter(p => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    const progName = p.programPath?.program || "";
    if (programFilter !== "all" && progName !== programFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const firma = p.company?.denumire || "";
      return p.name.toLowerCase().includes(q) || firma.toLowerCase().includes(q) || progName.toLowerCase().includes(q);
    }
    return true;
  });

  const stats = {
    total: projects.length,
    draft: projects.filter(p => p.status === "draft").length,
    inProgress: projects.filter(p => p.status === "in_progress").length,
    review: projects.filter(p => p.status === "review").length,
    submitted: projects.filter(p => p.status === "submitted").length,
  };

  const overallProgress = (p: any) => {
    const prog = p.progress || {};
    const el = prog.elements || { filled: 0, total: 0 };
    const doc = prog.docs || { done: 0, total: 0 };
    const tpl = prog.templates || { done: 0, total: 0 };
    const e = pct(el.filled, el.total);
    const d = pct(doc.done, doc.total);
    const t = pct(tpl.done, tpl.total);
    return el.total > 0 ? Math.round((e + d + t) / 3) : 0;
  };

  /* ═══ CREATE PROJECT ═══ */
  const handleCreate = async () => {
    if (!createData.name.trim() || !createData.firmaId || !createData.folderId) return;
    setCreating(true);
    try {
      const result: any = await apiPost("/api/projects", {
        name: createData.name.trim(),
        companyId: createData.firmaId,
        folderId: createData.folderId,
      });
      setShowCreate(false);
      router.push(`/projects/${result.id}`);
    } catch (err) {
      console.error("Failed to create project:", err);
      setCreating(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-50 flex flex-col">
      {/* PageHeader */}
      <PageHeader title="Proiecte">
        <button
          className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 cursor-pointer transition-colors"
          onClick={() => { setShowCreate(true); setCreateStep(1); setCreateData({ name: "", firmaId: null, folderId: null, program: null, masura: null, sesiune: null }); }}
        >+ Proiect nou</button>
      </PageHeader>

      <div className="px-8 py-6 flex-1 flex flex-col">
        {/* Stats pills */}
        <div className="flex gap-3 pb-4 border-b border-slate-200 flex-shrink-0">
          <div
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer transition-all duration-150 border ${statusFilter === "all" ? "border-blue-300 bg-blue-50/60 text-slate-900" : "border-transparent text-slate-500 hover:bg-slate-50"}`}
            onClick={() => setStatusFilter("all")}
          >
            <span className="font-mono font-bold">{stats.total}</span> Total
          </div>
          <div
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer transition-all duration-150 border ${statusFilter === "draft" ? "border-blue-300 bg-blue-50/60 text-slate-900" : "border-transparent text-slate-500 hover:bg-slate-50"}`}
            onClick={() => setStatusFilter("draft")}
          >
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            <span className="font-mono font-bold">{stats.draft}</span> Ciornă
          </div>
          <div
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer transition-all duration-150 border ${statusFilter === "in_progress" ? "border-blue-300 bg-blue-50/60 text-slate-900" : "border-transparent text-slate-500 hover:bg-slate-50"}`}
            onClick={() => setStatusFilter("in_progress")}
          >
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="font-mono font-bold">{stats.inProgress}</span> În lucru
          </div>
          <div
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer transition-all duration-150 border ${statusFilter === "review" ? "border-blue-300 bg-blue-50/60 text-slate-900" : "border-transparent text-slate-500 hover:bg-slate-50"}`}
            onClick={() => setStatusFilter("review")}
          >
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="font-mono font-bold">{stats.review}</span> Verificare
          </div>
          <div
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer transition-all duration-150 border ${statusFilter === "submitted" ? "border-blue-300 bg-blue-50/60 text-slate-900" : "border-transparent text-slate-500 hover:bg-slate-50"}`}
            onClick={() => setStatusFilter("submitted")}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="font-mono font-bold">{stats.submitted}</span> Depus
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2.5 py-3 flex-shrink-0">
          <input
            className="w-72 bg-white border border-slate-200 rounded-lg px-3 py-2 text-[13px] text-slate-700 outline-none transition-colors duration-200 focus:border-blue-500 placeholder:text-slate-400"
            placeholder="Caută proiect, firmă, program..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="flex bg-slate-100 rounded-lg p-0.5 gap-px">
            <button
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border-none cursor-pointer transition-all duration-150 ${programFilter === "all" ? "bg-white shadow-sm text-slate-900" : "bg-transparent text-slate-500 hover:text-slate-700"}`}
              onClick={() => setProgramFilter("all")}
            >Toate</button>
            {[...new Set(projects.map(p => p.programPath?.program).filter(Boolean))].map(pr => (
              <button
                key={pr}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border-none cursor-pointer transition-all duration-150 ${programFilter === pr ? "bg-white shadow-sm text-slate-900" : "bg-transparent text-slate-500 hover:text-slate-700"}`}
                onClick={() => setProgramFilter(pr)}
              >{pr}</button>
            ))}
          </div>
          <div className="flex ml-auto bg-slate-100 rounded-md p-0.5 gap-px">
            <button
              className={`px-2.5 py-1.5 rounded border-none cursor-pointer text-sm transition-all duration-150 ${viewMode === "cards" ? "bg-white shadow-sm text-slate-900" : "bg-transparent text-slate-400 hover:bg-slate-50"}`}
              onClick={() => setViewMode("cards")} title="Carduri"
            >&#9638;</button>
            <button
              className={`px-2.5 py-1.5 rounded border-none cursor-pointer text-sm transition-all duration-150 ${viewMode === "table" ? "bg-white shadow-sm text-slate-900" : "bg-transparent text-slate-400 hover:bg-slate-50"}`}
              onClick={() => setViewMode("table")} title="Tabel"
            >&#9776;</button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pt-2 pb-8">
          {loading ? (
            <div className="text-center py-16 text-slate-400">
              <div className="text-[40px] opacity-50 mb-2">&#8987;</div>
              <div className="text-sm">Se încarcă proiectele...</div>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon="💼"
              title="Niciun proiect"
              description={search || statusFilter !== "all" || programFilter !== "all" ? "Niciun proiect nu corespunde filtrelor aplicate." : undefined}
              actionLabel="Creează primul proiect"
              onAction={() => { setShowCreate(true); setCreateStep(1); setCreateData({ name: "", firmaId: null, folderId: null, program: null, masura: null, sesiune: null }); }}
            />
          ) : viewMode === "cards" ? (
            <div className="space-y-3">
              {filtered.map(p => {
                const prog = p.progress || {};
                const elements = prog.elements || { filled: 0, total: 0 };
                const programPath = p.programPath || {};
                const elemPct = pct(elements.filled, elements.total);
                const scorePct = overallProgress(p);
                return (
                  <div
                    className="bg-white rounded-xl border border-slate-200 p-5 cursor-pointer transition-shadow hover:shadow-sm"
                    key={p.id}
                    onClick={() => router.push(`/projects/${p.id}`)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-semibold text-slate-900">{p.name}</div>
                        <div className="text-[13px] text-slate-500 mt-0.5">
                          {p.company?.denumire || "—"}
                          {(programPath.masura || programPath.sesiune) && (
                            <span> &middot; {programPath.masura || programPath.program || "—"}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {scorePct > 0 && (
                          <span className="text-lg font-bold text-slate-900">{scorePct}%</span>
                        )}
                        <StatusBadge status={p.status} />
                      </div>
                    </div>

                    {/* Progress bar: elements */}
                    {elements.total > 0 && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] text-slate-500">Elemente completate</span>
                          <span className="text-[11px] font-mono text-slate-400">{elements.filled}/{elements.total}</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-[width] duration-300"
                            style={{ width: `${elemPct}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Footer meta */}
                    <div className="flex items-center gap-2.5 mt-3 pt-3 border-t border-slate-100">
                      {p.lock && <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-600">&#128274; {p.lock.lockedByName}</span>}
                      <span className="text-[11px] text-slate-400 ml-auto font-mono">{p.updatedAt ? formatRelativeTime(p.updatedAt) : "—"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="w-full border border-slate-200 rounded-xl overflow-hidden bg-white">
              <div className="grid grid-cols-[1fr_140px_90px_100px_100px_100px_90px] items-center px-4 py-2.5 border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                <div>Proiect / Firmă</div>
                <div>Program</div>
                <div>Status</div>
                <div>Eligibilitate</div>
                <div>Elemente</div>
                <div>Documente</div>
                <div>Actualizat</div>
              </div>
              {filtered.map(p => {
                const prog = p.progress || {};
                const eligibility = prog.eligibility || { passed: 0, total: 0 };
                const elements = prog.elements || { filled: 0, total: 0 };
                const docs = prog.docs || { done: 0, total: 0 };
                const programPath = p.programPath || {};
                return (
                  <div
                    className="grid grid-cols-[1fr_140px_90px_100px_100px_100px_90px] items-center px-4 py-2.5 border-b border-slate-100 last:border-b-0 transition-colors duration-150 cursor-pointer hover:bg-slate-50"
                    key={p.id}
                    onClick={() => router.push(`/projects/${p.id}`)}
                  >
                    <div>
                      <div className="text-[13px] font-semibold text-slate-900">
                        {p.name}
                        {p.lock && <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-600 ml-2">&#128274;</span>}
                      </div>
                      <div className="text-[11px] text-slate-400">{p.company?.denumire || "—"}</div>
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">{programPath.masura || "—"}</div>
                    <div><StatusBadge status={p.status} /></div>
                    <div>
                      <div className="h-1 rounded-sm bg-slate-100 overflow-hidden w-full">
                        <div className={`h-full rounded-sm transition-[width] duration-400 ${pct(eligibility.passed, eligibility.total) === 100 ? "bg-emerald-500" : "bg-amber-400"}`} style={{ width: `${pct(eligibility.passed, eligibility.total)}%` }} />
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">{eligibility.passed}/{eligibility.total}</div>
                    </div>
                    <div>
                      <div className="h-1 rounded-sm bg-slate-100 overflow-hidden w-full">
                        <div className="h-full rounded-sm transition-[width] duration-400 bg-blue-500" style={{ width: `${pct(elements.filled, elements.total)}%` }} />
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">{elements.filled}/{elements.total}</div>
                    </div>
                    <div>
                      <div className="h-1 rounded-sm bg-slate-100 overflow-hidden w-full">
                        <div className="h-full rounded-sm transition-[width] duration-400 bg-orange-400" style={{ width: `${pct(docs.done, docs.total)}%` }} />
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">{docs.done}/{docs.total}</div>
                    </div>
                    <div className="text-[11px] text-slate-400">{p.updatedAt ? formatRelativeTime(p.updatedAt) : "—"}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ═══ CREATE PROJECT MODAL ═══ */}
      {showCreate && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] animate-[fadeIn_0.2s]"
          onClick={e => e.target === e.currentTarget && setShowCreate(false)}
        >
          <div className="bg-white border border-slate-200 rounded-2xl w-[540px] max-h-[85vh] overflow-y-auto p-7 animate-[slideUp_0.3s_ease]">
            <div className="text-xl font-extrabold text-slate-900 mb-1 flex justify-between items-center">
              Proiect nou
              <button className="bg-transparent border-none text-slate-400 cursor-pointer text-lg hover:text-slate-700" onClick={() => setShowCreate(false)}>&#10005;</button>
            </div>

            <div className="flex items-center mb-6">
              {["Firmă", "Program", "Confirmare"].map((label, i) => {
                const s = i + 1;
                return <div key={s} className="contents">
                  <div className={`flex items-center gap-1.5 text-[12px] font-semibold ${createStep === s ? "text-blue-600" : createStep > s ? "text-emerald-500" : "text-slate-400"}`}>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[11px] font-bold font-mono ${
                      createStep === s ? "border-blue-600 bg-blue-600 text-white" :
                      createStep > s ? "border-emerald-500 bg-emerald-500 text-white" :
                      "border-slate-300"
                    }`}>{createStep > s ? "✓" : s}</div>
                    <span>{label}</span>
                  </div>
                  {s < 3 && <div className={`flex-1 h-0.5 mx-2.5 ${createStep > s ? "bg-emerald-500" : "bg-slate-200"}`} />}
                </div>;
              })}
            </div>

            {/* Step 1: Select firma */}
            {createStep === 1 && (<>
              <div className="mb-4">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Selectează firma</label>
                <div className="grid grid-cols-2 gap-2">
                  {companies.map(f => (
                    <div key={f.id}
                      className={`p-3 rounded-md border cursor-pointer transition-all duration-150 text-[13px] font-semibold ${createData.firmaId === f.id ? "border-blue-500 bg-blue-50/60 text-blue-600" : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300"}`}
                      onClick={() => setCreateData(p => ({ ...p, firmaId: f.id }))}>
                      &#127970; {f.name}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2.5 justify-end mt-5">
                <button className="px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold cursor-pointer" onClick={() => setShowCreate(false)}>Anulează</button>
                <button className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed" disabled={!createData.firmaId} onClick={() => setCreateStep(2)}>Continuă &rarr;</button>
              </div>
            </>)}

            {/* Step 2: Select program path */}
            {createStep === 2 && (<>
              <div className="mb-4">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Selectează programul și sesiunea</label>
                {folderTree.map(prog => (
                  <div className="mb-3" key={prog.program}>
                    <div className="text-[13px] font-bold text-slate-900 mb-1.5 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> {prog.program}
                    </div>
                    {prog.masuri.map(m => (
                      <div key={m.name}>
                        <div className="py-2 px-3 pl-7 text-[13px] text-slate-500 flex items-center gap-1.5 cursor-pointer rounded-md transition-all duration-150 hover:bg-slate-50 hover:text-slate-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-400" /> {m.name}
                        </div>
                        {m.sesiuni.map(s => (
                          <div key={s.folderId}
                            className={`py-1.5 px-3 pl-[52px] text-[12px] flex items-center gap-1.5 cursor-pointer rounded-md transition-all duration-150 ${createData.folderId === s.folderId ? "bg-blue-50/60 text-blue-600 font-semibold" : "text-slate-400 hover:bg-slate-50 hover:text-slate-500"}`}
                            onClick={() => setCreateData(p => ({ ...p, folderId: s.folderId, program: prog.program, masura: m.name, sesiune: s.name }))}>
                            <span className="w-1 h-1 rounded-full bg-slate-300" /> {s.name}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="flex gap-2.5 justify-end mt-5">
                <button className="px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold cursor-pointer" onClick={() => setCreateStep(1)}>&larr; Înapoi</button>
                <button className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed" disabled={!createData.folderId} onClick={() => setCreateStep(3)}>Continuă &rarr;</button>
              </div>
            </>)}

            {/* Step 3: Name + confirm */}
            {createStep === 3 && (<>
              <div className="mb-4">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Denumire proiect</label>
                <input
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-900 text-sm outline-none focus:border-blue-500 placeholder:text-slate-400"
                  placeholder="ex: Modernizare linie producție..."
                  value={createData.name}
                  onChange={e => setCreateData(p => ({ ...p, name: e.target.value }))}
                  autoFocus
                />
              </div>

              <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/30 mb-4">
                <div className="flex gap-2 text-[13px] mb-1"><span className="text-slate-400 min-w-[80px]">Firmă:</span><span className="text-slate-900 font-semibold">{companies.find(f => f.id === createData.firmaId)?.name}</span></div>
                <div className="flex gap-2 text-[13px] mb-1"><span className="text-slate-400 min-w-[80px]">Program:</span><span className="text-slate-900 font-semibold">{createData.program}</span></div>
                <div className="flex gap-2 text-[13px] mb-1"><span className="text-slate-400 min-w-[80px]">Măsură:</span><span className="text-slate-900 font-semibold">{createData.masura}</span></div>
                <div className="flex gap-2 text-[13px]"><span className="text-slate-400 min-w-[80px]">Sesiune:</span><span className="text-slate-900 font-semibold">{createData.sesiune}</span></div>
              </div>

              <div className="text-[12px] text-slate-400 mb-4 leading-relaxed">
                La creare, proiectul va prelua automat ghidurile, template-urile și regulile din sesiunea selectată. Solomon va fi disponibil pentru pregătirea și verificarea conformității dosarului.
              </div>

              <div className="flex gap-2.5 justify-end mt-5">
                <button className="px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold cursor-pointer" onClick={() => setCreateStep(2)}>&larr; Înapoi</button>
                <button className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed" disabled={!createData.name.trim() || creating} onClick={handleCreate}>
                  {creating ? "Se creează..." : "Creează proiect"}
                </button>
              </div>
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}
