"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, apiDelete } from "@/lib/api";

/* ═══ HELPERS ═══ */

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "Ciornă", color: "var(--badge-draft-color)", bg: "var(--badge-draft-bg)" },
  in_progress: { label: "În lucru", color: "var(--badge-progress-color)", bg: "var(--badge-progress-bg)" },
  review: { label: "Verificare", color: "var(--badge-review-color)", bg: "var(--badge-review-bg)" },
  submitted: { label: "Depus", color: "var(--badge-submitted-color)", bg: "var(--badge-submitted-bg)" },
  rejected: { label: "Respins", color: "var(--badge-rejected-color)", bg: "var(--badge-rejected-bg)" },
  approved: { label: "Aprobat", color: "var(--badge-approved-color)", bg: "var(--badge-approved-bg)" },
};

const pct = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0;

// Workflow stage definitions
const WORKFLOW_STAGES = [
  { key: "eligibility", label: "Eligibilitate", icon: "\u{1F6E1}", color: "var(--accent-yellow)" },
  { key: "writing", label: "Scriere", icon: "\u{1F4DD}", color: "var(--accent-blue)" },
  { key: "documents", label: "Documente", icon: "\u{1F4C4}", color: "var(--accent-orange)" },
  { key: "review", label: "Verificare", icon: "\u{1F50D}", color: "var(--accent-purple)" },
  { key: "submission", label: "Depunere", icon: "\u{1F4E4}", color: "var(--accent-green)" },
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
    <>
      <style>{`
        .btn-create{display:flex;align-items:center;gap:6px;padding:8px 18px;border-radius:var(--r-md);border:none;background:var(--accent-blue);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font-sans);box-shadow:0 2px 12px rgba(77,139,255,.25);transition:all .15s}
        .btn-create:hover{background:#5d9bff}

        .stats-row{display:flex;gap:12px;padding:16px 32px;border-bottom:1px solid var(--border);background:var(--bg-surface);flex-shrink:0}
        .stat-pill{display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;border:1px solid transparent}
        .stat-pill:hover{background:var(--bg-hover)}
        .stat-pill.active{border-color:var(--accent-blue);background:rgba(77,139,255,.06)}
        .stat-pill .sp-dot{width:8px;height:8px;border-radius:50%}
        .stat-pill .sp-count{font-family:var(--font-mono);font-weight:700}

        .toolbar{padding:12px 32px;display:flex;align-items:center;gap:10px;flex-shrink:0}
        .fi{padding:8px 14px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-deep);color:var(--text-primary);font-size:13px;font-family:var(--font-sans);outline:none;transition:border-color .2s}
        .fi:focus{border-color:var(--accent-blue)}.fi::placeholder{color:var(--text-muted)}
        .pill-group{display:flex;background:var(--bg-deep);border-radius:var(--r-md);padding:2px;gap:1px}
        .pill{padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;border:none;cursor:pointer;background:transparent;color:var(--text-muted);font-family:var(--font-sans);transition:all .15s}
        .pill:hover{color:var(--text-secondary)}.pill.on{background:var(--accent-blue);color:#fff}
        .view-toggle{display:flex;margin-left:auto;background:var(--bg-deep);border-radius:var(--r-sm);padding:2px;gap:1px}
        .vt-btn{padding:5px 10px;border-radius:4px;border:none;cursor:pointer;font-size:14px;background:transparent;transition:all .12s;color:var(--text-muted)}
        .vt-btn:hover{background:var(--bg-hover)}.vt-btn.on{background:var(--bg-elevated);color:var(--text-primary)}

        .proj-grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(380px, 1fr));gap:16px}
        .proj-card{padding:20px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-surface);cursor:pointer;transition:all .18s;display:flex;flex-direction:column;gap:14px}
        .proj-card:hover{border-color:var(--border-active);background:var(--bg-elevated);transform:translateY(-1px)}
        .pc-top{display:flex;align-items:flex-start;gap:12px}
        .pc-info{flex:1;min-width:0}
        .pc-name{font-size:16px;font-weight:700;margin-bottom:3px}
        .pc-firma{font-size:12px;color:var(--text-secondary);margin-bottom:6px}
        .pc-path{font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:4px}
        .pc-path .pp-dot{width:8px;height:8px;border-radius:50%;background:var(--accent-blue);flex-shrink:0}
        .status-badge{display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border-radius:12px;font-size:11px;font-weight:700}
        .pc-valoare{font-size:11px;font-family:var(--font-mono);color:var(--text-muted);margin-top:6px}
        .pc-progress{display:flex;flex-direction:column;gap:8px}
        .pc-bar-row{display:flex;align-items:center;gap:10px}
        .pc-bar-label{font-size:11px;color:var(--text-muted);width:80px;flex-shrink:0}
        .pc-bar{flex:1;height:6px;background:var(--bg-deep);border-radius:3px;overflow:hidden}
        .pc-bar-fill{height:100%;border-radius:3px;transition:width .4s}
        .pc-bar-pct{font-size:11px;font-family:var(--font-mono);color:var(--text-secondary);width:36px;text-align:right;flex-shrink:0}
        .pc-workflow{display:flex;align-items:center;gap:0;padding:10px 0;border-top:1px solid var(--border)}
        .wf-step{display:flex;flex-direction:column;align-items:center;flex:1;position:relative}
        .wf-icon{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;border:2px solid var(--border);background:var(--bg-deep);transition:all .2s;position:relative;z-index:1}
        .wf-step.done .wf-icon{border-color:var(--accent-green);background:rgba(52,211,153,.12)}
        .wf-step.active .wf-icon{border-color:var(--accent-blue);background:rgba(77,139,255,.12);box-shadow:0 0 8px rgba(77,139,255,.3)}
        .wf-label{font-size:9px;font-weight:600;color:var(--text-muted);margin-top:3px;text-align:center;white-space:nowrap}
        .wf-step.done .wf-label{color:var(--accent-green)}
        .wf-step.active .wf-label{color:var(--accent-blue)}
        .wf-line{position:absolute;top:14px;left:calc(50% + 14px);width:calc(100% - 28px);height:2px;background:var(--border);z-index:0}
        .wf-step.done .wf-line{background:var(--accent-green)}
        .wf-step.active .wf-line{background:linear-gradient(90deg, var(--accent-blue) 50%, var(--border) 50%)}
        .pc-overall{display:flex;align-items:center;gap:8px;padding:6px 0}
        .pc-overall-label{font-size:11px;font-weight:600;color:var(--text-secondary)}
        .pc-overall-bar{flex:1;height:8px;background:var(--bg-deep);border-radius:4px;overflow:hidden}
        .pc-overall-fill{height:100%;border-radius:4px;transition:width .4s}
        .pc-overall-pct{font-size:13px;font-family:var(--font-mono);font-weight:700;min-width:36px;text-align:right}
        .pc-footer{display:flex;align-items:center;gap:10px;padding-top:10px;border-top:1px solid var(--border)}
        .pc-consultant{font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:4px;flex:1}
        .pc-updated{font-size:11px;color:var(--text-muted);font-family:var(--font-mono)}
        .lock-indicator{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;background:var(--badge-review-bg);color:var(--accent-yellow)}

        .proj-table{width:100%;border:1px solid var(--border);border-radius:var(--r-md);overflow:hidden;background:var(--bg-surface)}
        .pt-row{display:grid;grid-template-columns:1fr 140px 90px 100px 100px 100px 90px;align-items:center;padding:10px 16px;border-bottom:1px solid var(--border);transition:background .12s;cursor:pointer}
        .pt-row:last-child{border-bottom:none}
        .pt-row:hover{background:var(--bg-hover)}
        .pt-row.header{background:var(--bg-elevated);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--text-muted);cursor:default}
        .pt-row.header:hover{background:var(--bg-elevated)}
        .pt-name{font-size:13px;font-weight:600}
        .pt-firma{font-size:11px;color:var(--text-muted)}
        .pt-program{font-size:11px;color:var(--text-secondary);font-family:var(--font-mono)}
        .mini-bar{height:4px;border-radius:2px;background:var(--bg-deep);overflow:hidden;width:100%}
        .mini-fill{height:100%;border-radius:2px;transition:width .4s}
        .mini-pct{font-size:10px;font-family:var(--font-mono);color:var(--text-muted);margin-top:2px}
        .pt-time{font-size:11px;color:var(--text-muted)}

        .empty-state{text-align:center;padding:60px;color:var(--text-muted)}
        .empty-state .es-icon{font-size:40px;opacity:.5;margin-bottom:8px}
        .empty-state .es-text{font-size:14px}

        .overlay{position:fixed;inset:0;background:var(--overlay-bg);display:flex;align-items:center;justify-content:center;z-index:100;animation:fadeIn .2s}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        .modal{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r-lg);width:540px;max-height:85vh;overflow-y:auto;padding:28px;animation:slideUp .3s ease}
        @keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        .modal-title{font-size:20px;font-weight:800;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center}
        .modal-close{background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:18px}.modal-close:hover{color:var(--text-primary)}

        .wz-bar{display:flex;align-items:center;margin-bottom:24px}
        .wz-step{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--text-muted)}
        .wz-step.on{color:var(--accent-blue)}.wz-step.done{color:var(--accent-green)}
        .wz-num{width:24px;height:24px;border-radius:50%;border:2px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;font-family:var(--font-mono)}
        .wz-step.on .wz-num{border-color:var(--accent-blue);background:var(--accent-blue);color:#fff}
        .wz-step.done .wz-num{border-color:var(--accent-green);background:var(--accent-green);color:#fff}
        .wz-line{flex:1;height:2px;background:var(--border);margin:0 10px}.wz-line.done{background:var(--accent-green)}

        .fg{margin-bottom:16px}
        .fl{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.7px;color:var(--text-muted);margin-bottom:6px}
        .fi-full{width:100%;padding:10px 14px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-deep);color:var(--text-primary);font-size:14px;font-family:var(--font-sans);outline:none}
        .fi-full:focus{border-color:var(--accent-blue)}.fi-full::placeholder{color:var(--text-muted)}

        .firma-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        .firma-option{padding:12px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--bg-elevated);cursor:pointer;transition:all .15s;font-size:13px;font-weight:600}
        .firma-option:hover{border-color:var(--border-active)}.firma-option.on{border-color:var(--accent-blue);background:rgba(77,139,255,.06);color:var(--accent-blue)}

        .prog-section{margin-bottom:12px}
        .prog-header{font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:6px;display:flex;align-items:center;gap:6px}
        .prog-header .ph-dot{width:10px;height:10px;border-radius:50%;background:var(--accent-blue)}
        .masura-row{padding:8px 12px 8px 28px;font-size:13px;color:var(--text-secondary);display:flex;align-items:center;gap:6px;cursor:pointer;border-radius:var(--r-sm);transition:all .12s}
        .masura-row:hover{background:var(--bg-hover);color:var(--text-primary)}
        .masura-row .mr-dot{width:6px;height:6px;border-radius:50%;background:var(--accent-orange)}
        .sesiune-row{padding:6px 12px 6px 52px;font-size:12px;color:var(--text-muted);display:flex;align-items:center;gap:6px;cursor:pointer;border-radius:var(--r-sm);transition:all .12s}
        .sesiune-row:hover{background:var(--bg-hover);color:var(--text-secondary)}
        .sesiune-row.on{background:rgba(77,139,255,.06);color:var(--accent-blue);font-weight:600}
        .sesiune-row .sr-dot{width:4px;height:4px;border-radius:50%;background:var(--text-muted)}

        .btn-row{display:flex;gap:10px;justify-content:flex-end;margin-top:20px}
        .btn-p{padding:10px 20px;border-radius:var(--r-md);border:none;background:var(--accent-blue);color:#fff;font-size:14px;font-weight:700;font-family:var(--font-sans);cursor:pointer}.btn-p:hover{background:#5d9bff}.btn-p:disabled{opacity:.4;cursor:not-allowed}
        .btn-s{padding:10px 20px;border-radius:var(--r-md);border:1px solid var(--border);background:transparent;color:var(--text-secondary);font-size:14px;font-weight:600;font-family:var(--font-sans);cursor:pointer}.btn-s:hover{border-color:var(--border-active);color:var(--text-primary)}

        .summary-card{padding:16px;border-radius:var(--r-md);border:1px solid var(--accent-blue);background:rgba(77,139,255,.04);margin-bottom:16px}
        .summary-row{display:flex;gap:8px;font-size:13px;margin-bottom:4px}
        .summary-row .sr-label{color:var(--text-muted);min-width:80px}
        .summary-row .sr-value{color:var(--text-primary);font-weight:600}
      `}</style>

      {/* Topbar */}
      <div className="flex items-center gap-4 flex-shrink-0" style={{ padding: "18px 32px", borderBottom: "1px solid var(--border)", background: "var(--bg-surface)" }}>
        <div className="flex-1" style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.4px" }}>Proiecte</div>
        <button className="btn-create" onClick={() => { setShowCreate(true); setCreateStep(1); setCreateData({ name: "", firmaId: null, folderId: null, program: null, masura: null, sesiune: null }); }}>+ Proiect nou</button>
      </div>

      {/* Stats pills */}
      <div className="stats-row">
        <div className={`stat-pill ${statusFilter === "all" ? "active" : ""}`} onClick={() => setStatusFilter("all")}>
          <span className="sp-count">{stats.total}</span> Total
        </div>
        <div className={`stat-pill ${statusFilter === "draft" ? "active" : ""}`} onClick={() => setStatusFilter("draft")}>
          <span className="sp-dot" style={{ background: "var(--badge-draft-color)" }} />
          <span className="sp-count">{stats.draft}</span> Ciornă
        </div>
        <div className={`stat-pill ${statusFilter === "in_progress" ? "active" : ""}`} onClick={() => setStatusFilter("in_progress")}>
          <span className="sp-dot" style={{ background: "var(--badge-progress-color)" }} />
          <span className="sp-count">{stats.inProgress}</span> În lucru
        </div>
        <div className={`stat-pill ${statusFilter === "review" ? "active" : ""}`} onClick={() => setStatusFilter("review")}>
          <span className="sp-dot" style={{ background: "var(--badge-review-color)" }} />
          <span className="sp-count">{stats.review}</span> Verificare
        </div>
        <div className={`stat-pill ${statusFilter === "submitted" ? "active" : ""}`} onClick={() => setStatusFilter("submitted")}>
          <span className="sp-dot" style={{ background: "var(--badge-submitted-color)" }} />
          <span className="sp-count">{stats.submitted}</span> Depus
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <input className="fi" placeholder="Caută proiect, firmă, program..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 280 }} />
        <div className="pill-group">
          <button className={`pill ${programFilter === "all" ? "on" : ""}`} onClick={() => setProgramFilter("all")}>Toate</button>
          {[...new Set(projects.map(p => p.programPath?.program).filter(Boolean))].map(pr => (
            <button key={pr} className={`pill ${programFilter === pr ? "on" : ""}`} onClick={() => setProgramFilter(pr)}>{pr}</button>
          ))}
        </div>
        <div className="view-toggle">
          <button className={`vt-btn ${viewMode === "cards" ? "on" : ""}`} onClick={() => setViewMode("cards")} title="Carduri">&#9638;</button>
          <button className={`vt-btn ${viewMode === "table" ? "on" : ""}`} onClick={() => setViewMode("table")} title="Tabel">&#9776;</button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto" style={{ padding: "24px 32px" }}>
        {loading ? (
          <div className="empty-state"><div className="es-icon">&#8987;</div><div className="es-text">Se încarcă proiectele...</div></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><div className="es-icon">&#128188;</div><div className="es-text">Niciun proiect găsit</div></div>
        ) : viewMode === "cards" ? (
          <div className="proj-grid">
            {filtered.map(p => {
              const st = STATUS_MAP[p.status] || STATUS_MAP.draft;
              const prog = p.progress || {};
              const eligibility = prog.eligibility || { passed: 0, total: 0 };
              const elements = prog.elements || { filled: 0, total: 0 };
              const docs = prog.docs || { done: 0, total: 0 };
              const templates = prog.templates || { done: 0, total: 0 };
              const programPath = p.programPath || {};
              const valDisplay = formatValoare(p.valoare);
              return (
                <div className="proj-card" key={p.id} onClick={() => router.push(`/projects/${p.id}`)}>
                  <div className="pc-top">
                    <div className="pc-info">
                      <div className="pc-name">{p.name}</div>
                      <div className="pc-firma">{p.company?.denumire || "—"}</div>
                      <div className="pc-path">
                        <span className="pp-dot" />
                        {programPath.program || "—"} &rsaquo; {programPath.masura || "—"} &rsaquo; {programPath.sesiune || "—"}
                      </div>
                      {valDisplay !== "—" && <div className="pc-valoare">{valDisplay}</div>}
                    </div>
                    <div>
                      <span className="status-badge" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                    </div>
                  </div>

                  {/* Workflow stages */}
                  {(() => {
                    const wf = getWorkflowStage(p);
                    const overallPct = Math.round(wf.stageProgress.reduce((s, v) => s + v, 0) / wf.stageProgress.length);
                    return <>
                      <div className="pc-workflow">
                        {WORKFLOW_STAGES.map((stage, i) => {
                          const done = wf.stageProgress[i] === 100;
                          const active = i === wf.currentStage;
                          return (
                            <div key={stage.key} className={`wf-step ${done ? "done" : ""} ${active ? "active" : ""}`}>
                              <div className="wf-icon">{stage.icon}</div>
                              <span className="wf-label">{stage.label}</span>
                              {i < WORKFLOW_STAGES.length - 1 && <div className="wf-line" />}
                            </div>
                          );
                        })}
                      </div>
                      <div className="pc-overall">
                        <span className="pc-overall-label">Progres</span>
                        <div className="pc-overall-bar">
                          <div className="pc-overall-fill" style={{
                            width: `${overallPct}%`,
                            background: overallPct === 100 ? "var(--accent-green)" : overallPct > 60 ? "var(--accent-blue)" : "var(--accent-yellow)"
                          }} />
                        </div>
                        <span className="pc-overall-pct" style={{
                          color: overallPct === 100 ? "var(--accent-green)" : overallPct > 60 ? "var(--accent-blue)" : "var(--accent-yellow)"
                        }}>{overallPct}%</span>
                      </div>
                    </>;
                  })()}

                  <div className="pc-footer">
                    <span className="pc-consultant">&#128100; {p.consultantId || "—"}</span>
                    {p.lock && <span className="lock-indicator">&#128274; {p.lock.lockedByName}</span>}
                    <span className="pc-updated">{p.updatedAt ? formatRelativeTime(p.updatedAt) : "—"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="proj-table">
            <div className="pt-row header">
              <div>Proiect / Firmă</div>
              <div>Program</div>
              <div>Status</div>
              <div>Eligibilitate</div>
              <div>Elemente</div>
              <div>Documente</div>
              <div>Actualizat</div>
            </div>
            {filtered.map(p => {
              const st = STATUS_MAP[p.status] || STATUS_MAP.draft;
              const prog = p.progress || {};
              const eligibility = prog.eligibility || { passed: 0, total: 0 };
              const elements = prog.elements || { filled: 0, total: 0 };
              const docs = prog.docs || { done: 0, total: 0 };
              const programPath = p.programPath || {};
              return (
                <div className="pt-row" key={p.id} onClick={() => router.push(`/projects/${p.id}`)}>
                  <div><div className="pt-name">{p.name}{p.lock && <span className="lock-indicator" style={{ marginLeft: 8 }}>&#128274;</span>}</div><div className="pt-firma">{p.company?.denumire || "—"}</div></div>
                  <div className="pt-program">{programPath.masura || "—"}</div>
                  <div><span className="status-badge" style={{ background: st.bg, color: st.color }}>{st.label}</span></div>
                  <div>
                    <div className="mini-bar"><div className="mini-fill" style={{ width: `${pct(eligibility.passed, eligibility.total)}%`, background: pct(eligibility.passed, eligibility.total) === 100 ? "var(--accent-green)" : "var(--accent-yellow)" }} /></div>
                    <div className="mini-pct">{eligibility.passed}/{eligibility.total}</div>
                  </div>
                  <div>
                    <div className="mini-bar"><div className="mini-fill" style={{ width: `${pct(elements.filled, elements.total)}%`, background: "var(--accent-blue)" }} /></div>
                    <div className="mini-pct">{elements.filled}/{elements.total}</div>
                  </div>
                  <div>
                    <div className="mini-bar"><div className="mini-fill" style={{ width: `${pct(docs.done, docs.total)}%`, background: "var(--accent-orange)" }} /></div>
                    <div className="mini-pct">{docs.done}/{docs.total}</div>
                  </div>
                  <div className="pt-time">{p.updatedAt ? formatRelativeTime(p.updatedAt) : "—"}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ CREATE PROJECT MODAL ═══ */}
      {showCreate && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="modal">
            <div className="modal-title">Proiect nou<button className="modal-close" onClick={() => setShowCreate(false)}>&#10005;</button></div>

            <div className="wz-bar">
              {["Firmă", "Program", "Confirmare"].map((label, i) => {
                const s = i + 1;
                return <div key={s} style={{ display: "contents" }}>
                  <div className={`wz-step ${createStep === s ? "on" : ""} ${createStep > s ? "done" : ""}`}>
                    <div className="wz-num">{createStep > s ? "✓" : s}</div><span>{label}</span>
                  </div>
                  {s < 3 && <div className={`wz-line ${createStep > s ? "done" : ""}`} />}
                </div>;
              })}
            </div>

            {/* Step 1: Select firma */}
            {createStep === 1 && (<>
              <div className="fg">
                <label className="fl">Selectează firma</label>
                <div className="firma-grid">
                  {companies.map(f => (
                    <div key={f.id} className={`firma-option ${createData.firmaId === f.id ? "on" : ""}`}
                      onClick={() => setCreateData(p => ({ ...p, firmaId: f.id }))}>
                      &#127970; {f.name}
                    </div>
                  ))}
                </div>
              </div>
              <div className="btn-row">
                <button className="btn-s" onClick={() => setShowCreate(false)}>Anulează</button>
                <button className="btn-p" disabled={!createData.firmaId} onClick={() => setCreateStep(2)}>Continuă &rarr;</button>
              </div>
            </>)}

            {/* Step 2: Select program path */}
            {createStep === 2 && (<>
              <div className="fg">
                <label className="fl">Selectează programul și sesiunea</label>
                {folderTree.map(prog => (
                  <div className="prog-section" key={prog.program}>
                    <div className="prog-header"><span className="ph-dot" /> {prog.program}</div>
                    {prog.masuri.map(m => (
                      <div key={m.name}>
                        <div className="masura-row"><span className="mr-dot" /> {m.name}</div>
                        {m.sesiuni.map(s => (
                          <div key={s.folderId}
                            className={`sesiune-row ${createData.folderId === s.folderId ? "on" : ""}`}
                            onClick={() => setCreateData(p => ({ ...p, folderId: s.folderId, program: prog.program, masura: m.name, sesiune: s.name }))}>
                            <span className="sr-dot" /> {s.name}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="btn-row">
                <button className="btn-s" onClick={() => setCreateStep(1)}>&larr; Înapoi</button>
                <button className="btn-p" disabled={!createData.folderId} onClick={() => setCreateStep(3)}>Continuă &rarr;</button>
              </div>
            </>)}

            {/* Step 3: Name + confirm */}
            {createStep === 3 && (<>
              <div className="fg">
                <label className="fl">Denumire proiect</label>
                <input className="fi-full" placeholder="ex: Modernizare linie producție..." value={createData.name} onChange={e => setCreateData(p => ({ ...p, name: e.target.value }))} autoFocus />
              </div>

              <div className="summary-card">
                <div className="summary-row"><span className="sr-label">Firmă:</span><span className="sr-value">{companies.find(f => f.id === createData.firmaId)?.name}</span></div>
                <div className="summary-row"><span className="sr-label">Program:</span><span className="sr-value">{createData.program}</span></div>
                <div className="summary-row"><span className="sr-label">Măsură:</span><span className="sr-value">{createData.masura}</span></div>
                <div className="summary-row"><span className="sr-label">Sesiune:</span><span className="sr-value">{createData.sesiune}</span></div>
              </div>

              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.5 }}>
                La creare, proiectul va prelua automat ghidurile, template-urile și regulile din sesiunea selectată. Solomon va fi disponibil pentru pregătirea și verificarea conformității dosarului.
              </div>

              <div className="btn-row">
                <button className="btn-s" onClick={() => setCreateStep(2)}>&larr; Înapoi</button>
                <button className="btn-p" disabled={!createData.name.trim() || creating} onClick={handleCreate}>
                  {creating ? "Se creează..." : "Creează proiect"}
                </button>
              </div>
            </>)}
          </div>
        </div>
      )}
    </>
  );
}
