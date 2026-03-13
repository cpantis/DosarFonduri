"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
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
  const [folderTree, setFolderTree] = useState<ProgramTree[]>([]);

  useEffect(() => {
    setLoading(true);
    apiGet("/api/projects")
      .then((data: any) => { setProjects(Array.isArray(data) ? data : data.projects || []); })
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!showCreate) return;
    apiGet("/api/companies").then((data: any) => {
      const list = Array.isArray(data) ? data : data.companies || [];
      setCompanies(list.map((c: any) => ({ id: c.id, name: c.denumire || c.name })));
    }).catch(() => setCompanies([]));
    apiGet("/api/documents/folders").then((data: any) => {
      const folders = Array.isArray(data) ? data : data.folders || [];
      setFolderTree(buildProgramTree(folders));
    }).catch(() => setFolderTree([]));
  }, [showCreate]);

  const handleCreate = async () => {
    if (!createData.name.trim() || !createData.firmaId || !createData.folderId) return;
    setCreating(true);
    try {
      const result: any = await apiPost("/api/projects", { name: createData.name.trim(), companyId: createData.firmaId, folderId: createData.folderId });
      setShowCreate(false);
      router.push(`/projects/${result.id}`);
    } catch (err) {
      console.error("Failed to create project:", err);
      setCreating(false);
    }
  };

  const openCreate = () => {
    setShowCreate(true);
    setCreateStep(1);
    setCreateData({ name: "", firmaId: null, folderId: null, program: null, masura: null, sesiune: null });
  };

  return (
    <div className="animate-[fadeIn_.2s_ease-out]">
      <PageHeader title="Proiecte" subtitle="Dosare de finanțare în lucru">
        <BtnPrimary icon={<IconPlus />} onClick={openCreate}>Proiect nou</BtnPrimary>
      </PageHeader>

      <div className="max-w-6xl mx-auto px-8 py-6">
        {loading ? (
          <div className="space-y-3">
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        ) : projects.length === 0 ? (
          <EmptyState icon="📁" title="Niciun proiect încă" description="Creează un proiect nou pentru a începe pregătirea dosarului." actionLabel="Creează primul proiect" onAction={openCreate} />
        ) : (
          <div className="space-y-2">
            {projects.map(p => {
              const prog = p.progress || {};
              const eligibility = prog.eligibility || { passed: 0, total: 0 };
              const elements = prog.elements || { filled: 0, total: 0 };
              const programPath = p.programPath || {};
              const eligPct = pct(eligibility.passed, eligibility.total);
              const elemPct = pct(elements.filled, elements.total);
              return (
                <div
                  key={p.id}
                  className="bg-white rounded-xl border border-slate-200/80 p-5 hover:shadow-sm hover:border-slate-300/80 transition-all cursor-pointer group"
                  onClick={() => router.push(`/projects/${p.id}`)}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[15px] font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">{p.name}</span>
                        <StatusBadge status={p.status} />
                        {p.valoare && <span className="text-[13px] font-mono font-semibold text-emerald-600 tabular-nums">{formatValoare(p.valoare)}</span>}
                      </div>
                      <div className="text-[13px] text-slate-500 mt-1 flex items-center gap-2">
                        <span>{p.company?.denumire || "—"}</span>
                        {programPath.masura && <><span className="text-slate-200">·</span><span className="text-slate-400">{programPath.masura}</span></>}
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
        <div className="fixed inset-0 flex items-center justify-center z-[100] bg-black/40 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="bg-white rounded-2xl w-[520px] max-h-[85vh] overflow-y-auto p-7 border border-slate-200/80 shadow-xl animate-[fadeUp_.2s_ease-out]">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[18px] font-bold text-slate-900">Proiect nou</h2>
              <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" onClick={() => setShowCreate(false)}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Stepper */}
            <div className="flex items-center mb-6">
              {["Firmă", "Program", "Confirmare"].map((label, i) => {
                const s = i + 1;
                return <div key={s} className="contents">
                  <div className={`flex items-center gap-1.5 text-[12px] font-medium ${createStep === s ? "text-blue-600" : createStep > s ? "text-emerald-600" : "text-slate-400"}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold font-mono transition-all ${
                      createStep === s ? "bg-blue-600 text-white" :
                      createStep > s ? "bg-emerald-500 text-white" :
                      "bg-slate-100 text-slate-400"
                    }`}>{createStep > s ? "✓" : s}</div>
                    <span>{label}</span>
                  </div>
                  {s < 3 && <div className={`flex-1 h-px mx-3 ${createStep > s ? "bg-emerald-300" : "bg-slate-200"}`} />}
                </div>;
              })}
            </div>

            {createStep === 1 && (<>
              <label className="block text-[11px] font-medium uppercase tracking-wider mb-2 text-slate-400">Selectează firma</label>
              <div className="grid grid-cols-2 gap-1.5 mb-5">
                {companies.map(f => (
                  <div key={f.id}
                    className={`p-3 rounded-lg cursor-pointer transition-all text-[13px] font-medium border ${createData.firmaId === f.id ? "border-blue-300 bg-blue-50 text-blue-700 ring-2 ring-blue-50" : "border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50"}`}
                    onClick={() => setCreateData(p => ({ ...p, firmaId: f.id }))}>
                    🏢 {f.name}
                  </div>
                ))}
              </div>
              <div className="flex gap-2 justify-end">
                <BtnSecondary onClick={() => setShowCreate(false)}>Anulează</BtnSecondary>
                <BtnPrimary icon={<IconArrowRight />} disabled={!createData.firmaId} onClick={() => setCreateStep(2)}>Continuă</BtnPrimary>
              </div>
            </>)}

            {createStep === 2 && (<>
              <label className="block text-[11px] font-medium uppercase tracking-wider mb-2 text-slate-400">Selectează programul și sesiunea</label>
              <div className="mb-5 space-y-2">
                {folderTree.map(prog => (
                  <div key={prog.program}>
                    <div className="text-[13px] font-semibold mb-1 flex items-center gap-2 text-slate-900">
                      <span className="w-2 h-2 rounded-full bg-blue-500" /> {prog.program}
                    </div>
                    {prog.masuri.map(m => (
                      <div key={m.name}>
                        <div className="py-1.5 px-3 pl-7 text-[13px] flex items-center gap-2 text-slate-500">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> {m.name}
                        </div>
                        {m.sesiuni.map(s => (
                          <div key={s.folderId}
                            className={`py-1.5 px-3 pl-[52px] text-[12px] flex items-center gap-2 cursor-pointer rounded-lg transition-all ${createData.folderId === s.folderId ? "bg-blue-50 text-blue-600 font-medium" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"}`}
                            onClick={() => setCreateData(p => ({ ...p, folderId: s.folderId, program: prog.program, masura: m.name, sesiune: s.name }))}>
                            <span className="w-1 h-1 rounded-full bg-slate-300" /> {s.name}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="flex gap-2 justify-end">
                <BtnSecondary icon={<IconArrowLeft />} onClick={() => setCreateStep(1)}>Înapoi</BtnSecondary>
                <BtnPrimary icon={<IconArrowRight />} disabled={!createData.folderId} onClick={() => setCreateStep(3)}>Continuă</BtnPrimary>
              </div>
            </>)}

            {createStep === 3 && (<>
              <label className="block text-[11px] font-medium uppercase tracking-wider mb-2 text-slate-400">Denumire proiect</label>
              <input
                className="w-full px-3.5 py-2.5 rounded-lg text-[14px] outline-none border border-slate-200 bg-white text-slate-900 focus:border-blue-300 focus:ring-2 focus:ring-blue-50 transition-all mb-4"
                placeholder="ex: Modernizare linie producție..."
                value={createData.name}
                onChange={e => setCreateData(p => ({ ...p, name: e.target.value }))}
                autoFocus
              />

              <div className="p-4 rounded-xl mb-4 border border-blue-200/60 bg-blue-50/30">
                <div className="space-y-1.5">
                  <div className="flex gap-2 text-[13px]"><span className="text-slate-400 w-20 shrink-0">Firmă</span><span className="font-medium text-slate-900">{companies.find(f => f.id === createData.firmaId)?.name}</span></div>
                  <div className="flex gap-2 text-[13px]"><span className="text-slate-400 w-20 shrink-0">Program</span><span className="font-medium text-slate-900">{createData.program}</span></div>
                  <div className="flex gap-2 text-[13px]"><span className="text-slate-400 w-20 shrink-0">Măsură</span><span className="font-medium text-slate-900">{createData.masura}</span></div>
                  <div className="flex gap-2 text-[13px]"><span className="text-slate-400 w-20 shrink-0">Sesiune</span><span className="font-medium text-slate-900">{createData.sesiune}</span></div>
                </div>
              </div>

              <p className="text-[12px] text-slate-400 leading-relaxed mb-5">
                La creare, proiectul va prelua automat ghidurile, template-urile și regulile din sesiunea selectată.
              </p>

              <div className="flex gap-2 justify-end">
                <BtnSecondary icon={<IconArrowLeft />} onClick={() => setCreateStep(2)}>Înapoi</BtnSecondary>
                <BtnPrimary icon={<IconCheck />} disabled={!createData.name.trim() || creating} onClick={handleCreate}>
                  {creating ? "Se creează..." : "Creează proiect"}
                </BtnPrimary>
              </div>
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}
