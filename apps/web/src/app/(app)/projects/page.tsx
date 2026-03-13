"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { BtnPrimary } from "@/components/ui/Buttons";

const pct = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0;

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
      .then((data: any) => {
        setProjects(Array.isArray(data) ? data : data.projects || []);
      })
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

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
      <PageHeader title="Proiecte" subtitle="Dosare de finanțare în lucru">
        <BtnPrimary icon="+" onClick={() => { setShowCreate(true); setCreateStep(1); setCreateData({ name: "", firmaId: null, folderId: null, program: null, masura: null, sesiune: null }); }}>Proiect nou</BtnPrimary>
      </PageHeader>

      <div className="max-w-6xl mx-auto px-8 py-6">
        {loading ? (
          <div className="text-center py-16 text-slate-400">
            <div className="text-sm">Se încarcă proiectele...</div>
          </div>
        ) : projects.length === 0 ? (
          <EmptyState icon="📁" title="Niciun proiect încă" description="Creează un proiect nou pentru a începe pregătirea dosarului." actionLabel="Creează primul proiect" onAction={() => { setShowCreate(true); setCreateStep(1); setCreateData({ name: "", firmaId: null, folderId: null, program: null, masura: null, sesiune: null }); }} />
        ) : (
          <div className="space-y-3">
            {projects.map(p => {
              const prog = p.progress || {};
              const eligibility = prog.eligibility || { passed: 0, total: 0 };
              const elements = prog.elements || { filled: 0, total: 0 };
              const programPath = p.programPath || {};
              return (
                <div
                  key={p.id}
                  className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-sm hover:border-slate-300 transition-all cursor-pointer"
                  onClick={() => router.push(`/projects/${p.id}`)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="text-[15px] font-semibold text-slate-900">{p.name}</span>
                        <StatusBadge status={p.status} />
                        {p.valoare && <span className="text-[13px] font-mono font-semibold text-emerald-600">{formatValoare(p.valoare)}</span>}
                      </div>
                      <div className="text-[13px] text-slate-500 mt-1 flex items-center gap-2">
                        <span>{p.company?.denumire || "—"}</span>
                        {programPath.masura && <><span className="text-slate-300">·</span><span>{programPath.masura}</span></>}
                        {p.updatedAt && <><span className="text-slate-300">·</span><span>{formatRelativeTime(p.updatedAt)}</span></>}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-[12px] text-slate-500">
                      {eligibility.total > 0 && <span>Elig. {eligibility.passed}/{eligibility.total}</span>}
                      {elements.total > 0 && <span>Elem. {elements.filled}/{elements.total}</span>}
                      <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
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
        <div
          className="fixed inset-0 flex items-center justify-center z-[100]"
          style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
          onClick={e => e.target === e.currentTarget && setShowCreate(false)}
        >
          <div className="bg-white rounded-2xl w-[540px] max-h-[85vh] overflow-y-auto p-7 border border-slate-200">
            <div className="text-xl font-extrabold mb-1 flex justify-between items-center text-slate-900">
              Proiect nou
              <button className="bg-transparent border-none cursor-pointer text-lg text-slate-400" onClick={() => setShowCreate(false)}>&#10005;</button>
            </div>

            <div className="flex items-center mb-6">
              {["Firmă", "Program", "Confirmare"].map((label, i) => {
                const s = i + 1;
                return <div key={s} className="contents">
                  <div className={`flex items-center gap-1.5 text-[12px] font-semibold ${createStep === s ? "text-blue-600" : createStep > s ? "text-emerald-600" : "text-slate-400"}`}>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[11px] font-bold font-mono ${
                      createStep === s ? "border-blue-600 bg-blue-600 text-white" :
                      createStep > s ? "border-emerald-500 bg-emerald-500 text-white" :
                      "border-slate-200"
                    }`}>{createStep > s ? "✓" : s}</div>
                    <span>{label}</span>
                  </div>
                  {s < 3 && <div className={`flex-1 h-0.5 mx-2.5 ${createStep > s ? "bg-emerald-500" : "bg-slate-200"}`} />}
                </div>;
              })}
            </div>

            {createStep === 1 && (<>
              <div className="mb-4">
                <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5 text-slate-500">Selectează firma</label>
                <div className="grid grid-cols-2 gap-2">
                  {companies.map(f => (
                    <div key={f.id}
                      className={`p-3 rounded-md cursor-pointer transition-all duration-150 text-[13px] font-semibold border ${createData.firmaId === f.id ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-50 text-slate-900"}`}
                      onClick={() => setCreateData(p => ({ ...p, firmaId: f.id }))}>
                      &#127970; {f.name}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2.5 justify-end mt-5">
                <button className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer bg-white border border-slate-300 text-slate-700" onClick={() => setShowCreate(false)}>Anulează</button>
                <button className="px-4 py-2 rounded-lg text-sm font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 text-white" disabled={!createData.firmaId} onClick={() => setCreateStep(2)}>Continuă &rarr;</button>
              </div>
            </>)}

            {createStep === 2 && (<>
              <div className="mb-4">
                <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5 text-slate-500">Selectează programul și sesiunea</label>
                {folderTree.map(prog => (
                  <div className="mb-3" key={prog.program}>
                    <div className="text-[13px] font-bold mb-1.5 flex items-center gap-1.5 text-slate-900">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> {prog.program}
                    </div>
                    {prog.masuri.map(m => (
                      <div key={m.name}>
                        <div className="py-2 px-3 pl-7 text-[13px] flex items-center gap-1.5 cursor-pointer rounded-md text-slate-500">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> {m.name}
                        </div>
                        {m.sesiuni.map(s => (
                          <div key={s.folderId}
                            className={`py-1.5 px-3 pl-[52px] text-[12px] flex items-center gap-1.5 cursor-pointer rounded-md transition-all ${createData.folderId === s.folderId ? "bg-blue-50 text-blue-600 font-semibold" : "text-slate-400"}`}
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
                <button className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer bg-white border border-slate-300 text-slate-700" onClick={() => setCreateStep(1)}>&larr; Înapoi</button>
                <button className="px-4 py-2 rounded-lg text-sm font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 text-white" disabled={!createData.folderId} onClick={() => setCreateStep(3)}>Continuă &rarr;</button>
              </div>
            </>)}

            {createStep === 3 && (<>
              <div className="mb-4">
                <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5 text-slate-500">Denumire proiect</label>
                <input
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none border border-slate-200 bg-white text-slate-900"
                  placeholder="ex: Modernizare linie producție..."
                  value={createData.name}
                  onChange={e => setCreateData(p => ({ ...p, name: e.target.value }))}
                  autoFocus
                />
              </div>

              <div className="p-4 rounded-xl mb-4 border border-blue-200 bg-blue-50">
                <div className="flex gap-2 text-[13px] mb-1"><span className="min-w-[80px] text-slate-400">Firmă:</span><span className="font-semibold text-slate-900">{companies.find(f => f.id === createData.firmaId)?.name}</span></div>
                <div className="flex gap-2 text-[13px] mb-1"><span className="min-w-[80px] text-slate-400">Program:</span><span className="font-semibold text-slate-900">{createData.program}</span></div>
                <div className="flex gap-2 text-[13px] mb-1"><span className="min-w-[80px] text-slate-400">Măsură:</span><span className="font-semibold text-slate-900">{createData.masura}</span></div>
                <div className="flex gap-2 text-[13px]"><span className="min-w-[80px] text-slate-400">Sesiune:</span><span className="font-semibold text-slate-900">{createData.sesiune}</span></div>
              </div>

              <div className="text-[12px] mb-4 leading-relaxed text-slate-400">
                La creare, proiectul va prelua automat ghidurile, template-urile și regulile din sesiunea selectată.
              </div>

              <div className="flex gap-2.5 justify-end mt-5">
                <button className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer bg-white border border-slate-300 text-slate-700" onClick={() => setCreateStep(2)}>&larr; Înapoi</button>
                <button className="px-4 py-2 rounded-lg text-sm font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 text-white" disabled={!createData.name.trim() || creating} onClick={handleCreate}>
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
