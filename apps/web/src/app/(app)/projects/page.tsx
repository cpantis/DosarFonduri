"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";

/* ═══ HELPERS ═══ */

const pct = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0;

const progressColorVars: Record<string, string> = {
  emerald: "var(--accent-green)",
  blue: "var(--accent-blue)",
  purple: "var(--accent-purple)",
  orange: "var(--accent-orange)",
};

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
    eligPct,
    elemPct,
    Math.round((docsPct + tplPct) / 2),
    p.status === "review" || p.status === "submitted" || p.status === "approved" ? 100 : 0,
    p.status === "submitted" || p.status === "approved" ? 100 : 0,
  ];

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

  const statusDots: Record<string, string> = {
    draft: "var(--text-muted)",
    in_progress: "var(--accent-blue)",
    review: "var(--accent-yellow)",
    submitted: "var(--accent-green)",
  };

  return (
    <div className="min-h-full flex flex-col" style={{ background: "var(--bg-deep)" }}>
      {/* PageHeader */}
      <PageHeader title="Proiecte">
        <button
          className="rounded-lg px-4 py-2 text-sm font-medium cursor-pointer transition-colors"
          style={{ background: "var(--accent-blue)", color: "var(--text-on-accent)" }}
          onClick={() => { setShowCreate(true); setCreateStep(1); setCreateData({ name: "", firmaId: null, folderId: null, program: null, masura: null, sesiune: null }); }}
        >+ Proiect nou</button>
      </PageHeader>

      <div className="px-8 py-6 flex-1 flex flex-col">
        {/* Stats pills */}
        <div className="flex gap-3 pb-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          {[
            { key: "all", label: "Total", count: stats.total, dot: null },
            { key: "draft", label: "Ciornă", count: stats.draft, dot: statusDots.draft },
            { key: "in_progress", label: "În lucru", count: stats.inProgress, dot: statusDots.in_progress },
            { key: "review", label: "Verificare", count: stats.review, dot: statusDots.review },
            { key: "submitted", label: "Depus", count: stats.submitted, dot: statusDots.submitted },
          ].map(item => (
            <div
              key={item.key}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer transition-all duration-150"
              style={statusFilter === item.key
                ? { border: "1px solid var(--accent-blue-border)", background: "var(--accent-blue-bg)", color: "var(--text-primary)" }
                : { border: "1px solid transparent", color: "var(--text-secondary)" }
              }
              onClick={() => setStatusFilter(item.key)}
            >
              {item.dot && <span className="w-2 h-2 rounded-full" style={{ background: item.dot }} />}
              <span className="font-mono font-bold">{item.count}</span> {item.label}
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2.5 py-3 flex-shrink-0">
          <input
            className="w-72 rounded-lg px-3 py-2 text-[13px] outline-none transition-colors duration-200"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            placeholder="Caută proiect, firmă, program..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="flex rounded-lg p-0.5 gap-px" style={{ background: "var(--bg-elevated)" }}>
            <button
              className="px-2.5 py-1 rounded-md text-[11px] font-semibold border-none cursor-pointer transition-all duration-150"
              style={programFilter === "all"
                ? { background: "var(--bg-surface)", boxShadow: "var(--shadow-sm)", color: "var(--text-primary)" }
                : { background: "transparent", color: "var(--text-secondary)" }
              }
              onClick={() => setProgramFilter("all")}
            >Toate</button>
            {[...new Set(projects.map(p => p.programPath?.program).filter(Boolean))].map(pr => (
              <button
                key={pr}
                className="px-2.5 py-1 rounded-md text-[11px] font-semibold border-none cursor-pointer transition-all duration-150"
                style={programFilter === pr
                  ? { background: "var(--bg-surface)", boxShadow: "var(--shadow-sm)", color: "var(--text-primary)" }
                  : { background: "transparent", color: "var(--text-secondary)" }
                }
                onClick={() => setProgramFilter(pr)}
              >{pr}</button>
            ))}
          </div>
          <div className="flex ml-auto rounded-md p-0.5 gap-px" style={{ background: "var(--bg-elevated)" }}>
            <button
              className="px-2.5 py-1.5 rounded border-none cursor-pointer text-sm transition-all duration-150"
              style={viewMode === "cards"
                ? { background: "var(--bg-surface)", boxShadow: "var(--shadow-sm)", color: "var(--text-primary)" }
                : { background: "transparent", color: "var(--text-muted)" }
              }
              onClick={() => setViewMode("cards")} title="Carduri"
            >&#9638;</button>
            <button
              className="px-2.5 py-1.5 rounded border-none cursor-pointer text-sm transition-all duration-150"
              style={viewMode === "table"
                ? { background: "var(--bg-surface)", boxShadow: "var(--shadow-sm)", color: "var(--text-primary)" }
                : { background: "transparent", color: "var(--text-muted)" }
              }
              onClick={() => setViewMode("table")} title="Tabel"
            >&#9776;</button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pt-2 pb-8">
          {loading ? (
            <div className="text-center py-16" style={{ color: "var(--text-muted)" }}>
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
                const eligibility = prog.eligibility || { passed: 0, total: 0 };
                const elements = prog.elements || { filled: 0, total: 0 };
                const docs = prog.docs || { done: 0, total: 0 };
                const templates = prog.templates || { done: 0, total: 0 };
                const programPath = p.programPath || {};
                const scorePct = overallProgress(p);
                return (
                  <div
                    className="rounded-xl p-5 cursor-pointer transition-shadow"
                    style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
                    key={p.id}
                    onClick={() => router.push(`/projects/${p.id}`)}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = "var(--shadow-sm)"}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>{p.name}</span>
                          {p.valoare && (
                            <span className="text-[12px] font-mono font-semibold" style={{ color: "var(--accent-green)" }}>{formatValoare(p.valoare)}</span>
                          )}
                        </div>
                        <div className="text-[13px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                          {p.company?.denumire || "—"}
                          {(programPath.masura || programPath.sesiune) && (
                            <span> &middot; {programPath.masura || programPath.program || "—"}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {scorePct > 0 && (
                          <span className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{scorePct}%</span>
                        )}
                        <StatusBadge status={p.status} />
                      </div>
                    </div>

                    {/* Workflow Progress */}
                    <div className="grid grid-cols-4 gap-3 mt-3">
                      {[
                        { label: "Eligibilitate", filled: eligibility.passed, total: eligibility.total, color: "emerald" },
                        { label: "Elemente", filled: elements.filled, total: elements.total, color: "blue" },
                        { label: "Documente", filled: docs.done, total: docs.total, color: "purple" },
                        { label: "Template-uri", filled: templates.done, total: templates.total, color: "orange" },
                      ].filter(m => m.total > 0).map((m, i) => {
                        const mp = pct(m.filled, m.total);
                        return (
                          <div key={i}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>{m.label}</span>
                              <span className="text-[10px] font-mono" style={{ color: "var(--text-secondary)" }}>{m.filled}/{m.total}</span>
                            </div>
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
                              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${mp}%`, background: progressColorVars[m.color] }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Workflow stage indicator */}
                    {(() => {
                      const { currentStage } = getWorkflowStage(p);
                      if (currentStage < WORKFLOW_STAGES.length) {
                        const stage = WORKFLOW_STAGES[currentStage];
                        return (
                          <div className="flex items-center gap-1.5 text-[11px] mt-2" style={{ color: "var(--text-secondary)" }}>
                            <span>{stage.icon}</span>
                            <span className="font-medium">Etapă curentă: {stage.label}</span>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {/* Footer meta */}
                    <div className="flex items-center gap-2.5 mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                      {p.lock && <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: "var(--accent-yellow-bg)", color: "var(--accent-yellow)" }}>&#128274; {p.lock.lockedByName}</span>}
                      <span className="text-[11px] ml-auto font-mono" style={{ color: "var(--text-muted)" }}>{p.updatedAt ? formatRelativeTime(p.updatedAt) : "—"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="w-full rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
              <div className="grid grid-cols-[1fr_140px_90px_100px_100px_100px_90px] items-center px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide" style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-secondary)" }}>
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
                    className="grid grid-cols-[1fr_140px_90px_100px_100px_100px_90px] items-center px-4 py-2.5 transition-colors duration-150 cursor-pointer"
                    style={{ borderBottom: "1px solid var(--border)" }}
                    key={p.id}
                    onClick={() => router.push(`/projects/${p.id}`)}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--bg-hover)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <div>
                      <div className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                        {p.name}
                        {p.lock && <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ml-2" style={{ background: "var(--accent-yellow-bg)", color: "var(--accent-yellow)" }}>&#128274;</span>}
                      </div>
                      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{p.company?.denumire || "—"}</div>
                    </div>
                    <div className="text-[11px] font-mono" style={{ color: "var(--text-secondary)" }}>{programPath.masura || "—"}</div>
                    <div><StatusBadge status={p.status} /></div>
                    <div>
                      <div className="h-1 rounded-sm overflow-hidden w-full" style={{ background: "var(--bg-elevated)" }}>
                        <div className="h-full rounded-sm transition-[width] duration-400" style={{ width: `${pct(eligibility.passed, eligibility.total)}%`, background: pct(eligibility.passed, eligibility.total) === 100 ? "var(--accent-green)" : "var(--accent-yellow)" }} />
                      </div>
                      <div className="text-[10px] font-mono mt-0.5" style={{ color: "var(--text-muted)" }}>{eligibility.passed}/{eligibility.total}</div>
                    </div>
                    <div>
                      <div className="h-1 rounded-sm overflow-hidden w-full" style={{ background: "var(--bg-elevated)" }}>
                        <div className="h-full rounded-sm transition-[width] duration-400" style={{ width: `${pct(elements.filled, elements.total)}%`, background: "var(--accent-blue)" }} />
                      </div>
                      <div className="text-[10px] font-mono mt-0.5" style={{ color: "var(--text-muted)" }}>{elements.filled}/{elements.total}</div>
                    </div>
                    <div>
                      <div className="h-1 rounded-sm overflow-hidden w-full" style={{ background: "var(--bg-elevated)" }}>
                        <div className="h-full rounded-sm transition-[width] duration-400" style={{ width: `${pct(docs.done, docs.total)}%`, background: "var(--accent-orange)" }} />
                      </div>
                      <div className="text-[10px] font-mono mt-0.5" style={{ color: "var(--text-muted)" }}>{docs.done}/{docs.total}</div>
                    </div>
                    <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{p.updatedAt ? formatRelativeTime(p.updatedAt) : "—"}</div>
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
          className="fixed inset-0 flex items-center justify-center z-[100] animate-[fadeIn_0.2s]"
          style={{ background: "var(--overlay-bg)", backdropFilter: "blur(4px)" }}
          onClick={e => e.target === e.currentTarget && setShowCreate(false)}
        >
          <div className="rounded-2xl w-[540px] max-h-[85vh] overflow-y-auto p-7 animate-[slideUp_0.3s_ease]" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            <div className="text-xl font-extrabold mb-1 flex justify-between items-center" style={{ color: "var(--text-primary)" }}>
              Proiect nou
              <button className="bg-transparent border-none cursor-pointer text-lg" style={{ color: "var(--text-muted)" }} onClick={() => setShowCreate(false)}>&#10005;</button>
            </div>

            <div className="flex items-center mb-6">
              {["Firmă", "Program", "Confirmare"].map((label, i) => {
                const s = i + 1;
                return <div key={s} className="contents">
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: createStep === s ? "var(--accent-blue)" : createStep > s ? "var(--accent-green)" : "var(--text-muted)" }}>
                    <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center text-[11px] font-bold font-mono" style={
                      createStep === s ? { borderColor: "var(--accent-blue)", background: "var(--accent-blue)", color: "var(--text-on-accent)" } :
                      createStep > s ? { borderColor: "var(--accent-green)", background: "var(--accent-green)", color: "var(--text-on-accent)" } :
                      { borderColor: "var(--border)" }
                    }>{createStep > s ? "✓" : s}</div>
                    <span>{label}</span>
                  </div>
                  {s < 3 && <div className="flex-1 h-0.5 mx-2.5" style={{ background: createStep > s ? "var(--accent-green)" : "var(--border)" }} />}
                </div>;
              })}
            </div>

            {/* Step 1: Select firma */}
            {createStep === 1 && (<>
              <div className="mb-4">
                <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-secondary)" }}>Selectează firma</label>
                <div className="grid grid-cols-2 gap-2">
                  {companies.map(f => (
                    <div key={f.id}
                      className="p-3 rounded-md cursor-pointer transition-all duration-150 text-[13px] font-semibold"
                      style={createData.firmaId === f.id
                        ? { border: "1px solid var(--accent-blue)", background: "var(--accent-blue-bg)", color: "var(--accent-blue)" }
                        : { border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-primary)" }
                      }
                      onClick={() => setCreateData(p => ({ ...p, firmaId: f.id }))}>
                      &#127970; {f.name}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2.5 justify-end mt-5">
                <button className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }} onClick={() => setShowCreate(false)}>Anulează</button>
                <button className="px-4 py-2 rounded-lg text-sm font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: "var(--accent-blue)", color: "var(--text-on-accent)" }} disabled={!createData.firmaId} onClick={() => setCreateStep(2)}>Continuă &rarr;</button>
              </div>
            </>)}

            {/* Step 2: Select program path */}
            {createStep === 2 && (<>
              <div className="mb-4">
                <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-secondary)" }}>Selectează programul și sesiunea</label>
                {folderTree.map(prog => (
                  <div className="mb-3" key={prog.program}>
                    <div className="text-[13px] font-bold mb-1.5 flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--accent-blue)" }} /> {prog.program}
                    </div>
                    {prog.masuri.map(m => (
                      <div key={m.name}>
                        <div className="py-2 px-3 pl-7 text-[13px] flex items-center gap-1.5 cursor-pointer rounded-md transition-all duration-150" style={{ color: "var(--text-secondary)" }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent-orange)" }} /> {m.name}
                        </div>
                        {m.sesiuni.map(s => (
                          <div key={s.folderId}
                            className="py-1.5 px-3 pl-[52px] text-[12px] flex items-center gap-1.5 cursor-pointer rounded-md transition-all duration-150"
                            style={createData.folderId === s.folderId
                              ? { background: "var(--accent-blue-bg)", color: "var(--accent-blue)", fontWeight: 600 }
                              : { color: "var(--text-muted)" }
                            }
                            onClick={() => setCreateData(p => ({ ...p, folderId: s.folderId, program: prog.program, masura: m.name, sesiune: s.name }))}>
                            <span className="w-1 h-1 rounded-full" style={{ background: "var(--text-muted)" }} /> {s.name}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="flex gap-2.5 justify-end mt-5">
                <button className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }} onClick={() => setCreateStep(1)}>&larr; Înapoi</button>
                <button className="px-4 py-2 rounded-lg text-sm font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: "var(--accent-blue)", color: "var(--text-on-accent)" }} disabled={!createData.folderId} onClick={() => setCreateStep(3)}>Continuă &rarr;</button>
              </div>
            </>)}

            {/* Step 3: Name + confirm */}
            {createStep === 3 && (<>
              <div className="mb-4">
                <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-secondary)" }}>Denumire proiect</label>
                <input
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none"
                  style={{ border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
                  placeholder="ex: Modernizare linie producție..."
                  value={createData.name}
                  onChange={e => setCreateData(p => ({ ...p, name: e.target.value }))}
                  autoFocus
                />
              </div>

              <div className="p-4 rounded-xl mb-4" style={{ border: "1px solid var(--accent-blue-border)", background: "var(--accent-blue-bg)" }}>
                <div className="flex gap-2 text-[13px] mb-1"><span className="min-w-[80px]" style={{ color: "var(--text-muted)" }}>Firmă:</span><span className="font-semibold" style={{ color: "var(--text-primary)" }}>{companies.find(f => f.id === createData.firmaId)?.name}</span></div>
                <div className="flex gap-2 text-[13px] mb-1"><span className="min-w-[80px]" style={{ color: "var(--text-muted)" }}>Program:</span><span className="font-semibold" style={{ color: "var(--text-primary)" }}>{createData.program}</span></div>
                <div className="flex gap-2 text-[13px] mb-1"><span className="min-w-[80px]" style={{ color: "var(--text-muted)" }}>Măsură:</span><span className="font-semibold" style={{ color: "var(--text-primary)" }}>{createData.masura}</span></div>
                <div className="flex gap-2 text-[13px]"><span className="min-w-[80px]" style={{ color: "var(--text-muted)" }}>Sesiune:</span><span className="font-semibold" style={{ color: "var(--text-primary)" }}>{createData.sesiune}</span></div>
              </div>

              <div className="text-[12px] mb-4 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                La creare, proiectul va prelua automat ghidurile, template-urile și regulile din sesiunea selectată. Solomon va fi disponibil pentru pregătirea și verificarea conformității dosarului.
              </div>

              <div className="flex gap-2.5 justify-end mt-5">
                <button className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }} onClick={() => setCreateStep(2)}>&larr; Înapoi</button>
                <button className="px-4 py-2 rounded-lg text-sm font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: "var(--accent-blue)", color: "var(--text-on-accent)" }} disabled={!createData.name.trim() || creating} onClick={handleCreate}>
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
