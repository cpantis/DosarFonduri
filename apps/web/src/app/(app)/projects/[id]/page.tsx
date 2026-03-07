"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";

/* ═══ TYPES ═══ */
type ProjectElement = {
  id: string;
  value: string | null;
  source: string | null;
  confirmed: boolean;
  templateElement?: {
    key: string;
    label: string;
    type: string;
  };
};

type EligibilityRule = {
  id: string;
  ruleId: string;
  status: "passed" | "failed" | "pending";
  details: string;
  source: string;
  confidence?: number;
  rule?: {
    description: string;
    type: "fixed" | "interpreted";
  };
};

type ChecklistItem = {
  id: string;
  name: string;
  category: string;
  done: boolean;
  source: string;
  templateName?: string | null;
};

type GuideRule = {
  id: string;
  type: "fixed" | "interpreted";
  text: string;
  confidence: number;
  page?: number;
  section?: string;
};

type ProjectDetail = {
  id: string;
  name: string;
  status: string;
  companyId: string;
  folderId: string;
  valoare: string | null;
  company: {
    id: string;
    denumire: string;
    cui: string;
    formaJuridica: string;
    caen: string;
    localitate?: string;
    judet?: string;
    capitalSocial?: string;
    cifraAfaceri?: string;
  };
  folder?: any;
  programPath?: {
    program: string;
    masura: string;
    sesiune: string;
  };
  elements: ProjectElement[];
  eligibility: EligibilityRule[];
  generatedDocs: any[];
  checklist: ChecklistItem[];
};

type SolomonMessage = {
  role: "user" | "assistant";
  text: string;
  extractions: Array<{ key: string; label: string; value: string; confidence: number }> | null;
};

type SolomonElement = {
  key: string; label: string; value: string; source: string; status: "confirmat" | "propus";
};

type NeemiaDoc = {
  id: string;
  name: string;
  type: string;
  status: string;
  url?: string;
};

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "Ciornă", color: "#5a6478", bg: "rgba(90,100,120,0.12)" },
  in_progress: { label: "În lucru", color: "#4d8bff", bg: "rgba(77,139,255,0.12)" },
  review: { label: "Verificare", color: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
  submitted: { label: "Depus", color: "#34d399", bg: "rgba(52,211,153,0.12)" },
};

const pct = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0;

type LeafType = "sumar" | "eligibilitate" | "ghid" | "solomon" | "elemente" | "checklist" | "neemia";

/* ═══ HELPER: map API element to UI element ═══ */
function mapElementStatus(el: ProjectElement): "confirmat" | "propus_ai" | "gol" {
  if (!el.value) return "gol";
  if (el.confirmed) return "confirmat";
  return "propus_ai";
}

function mapElementSourceLabel(source: string | null): string | null {
  if (!source) return null;
  switch (source) {
    case "onrc": return "Date ONRC";
    case "manual": return "Completare manuală";
    case "solomon": return "Chat Solomon";
    default: return source;
  }
}

function mapElementSourceDot(source: string | null): string {
  if (!source) return "";
  switch (source) {
    case "onrc": return "company_data";
    case "manual": return "manual";
    case "solomon": return "solomon_chat";
    default: return source;
  }
}

/* ═══ HELPER: map API eligibility status to UI status ═══ */
function mapEligStatus(status: string): "pass" | "fail" | "pending" {
  switch (status) {
    case "passed": return "pass";
    case "failed": return "fail";
    default: return "pending";
  }
}

export default function ProjectViewPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  // Core data state
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eligibilityData, setEligibilityData] = useState<{ flat: EligibilityRule[]; grouped?: any; summary?: any } | null>(null);
  const [checklistData, setChecklistData] = useState<{ items: ChecklistItem[]; grouped?: Record<string, ChecklistItem[]>; summary?: any } | null>(null);
  const [guideRules, setGuideRules] = useState<GuideRule[]>([]);
  const [neemiaDocs, setNeemiaDocs] = useState<NeemiaDoc[]>([]);

  // UI state
  const [activeLeaf, setActiveLeaf] = useState<LeafType>("sumar");
  const [branches, setBranches] = useState<Record<string, boolean>>({ scriere: true, implementare: false, monitorizare: false });
  const [selectedRule, setSelectedRule] = useState<string | null>(null);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [elemFilter, setElemFilter] = useState("all");
  const [elemSearch, setElemSearch] = useState("");
  const [ghidTab, setGhidTab] = useState<"reguli" | "ghid">("reguli");
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});

  // Solomon state
  const [solomonModel, setSolomonModel] = useState<"sonnet" | "opus">("opus");
  const [solomonET, setSolomonET] = useState(true);
  const [solomonMessages, setSolomonMessages] = useState<SolomonMessage[]>([]);
  const [solomonInput, setSolomonInput] = useState("");
  const [solomonElements, setSolomonElements] = useState<SolomonElement[]>([]);
  const [extractionStates, setExtractionStates] = useState<Record<string, "confirmed" | "rejected">>({});
  const [refinePopup, setRefinePopup] = useState<{ text: string; x: number; y: number } | null>(null);
  const [refineInput, setRefineInput] = useState("");
  const [solomonConvId, setSolomonConvId] = useState<string | null>(null);
  const [solomonSending, setSolomonSending] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Neemia state
  const [neemiaActiveTemplate, setNeemiaActiveTemplate] = useState(0);
  const [neemiaActivePage, setNeemiaActivePage] = useState(0);
  const [neemiaAnimKey, setNeemiaAnimKey] = useState(0);

  /* ═══ DATA FETCHING ═══ */
  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    setError(null);

    Promise.all([
      apiGet<ProjectDetail>(`/api/projects/${projectId}`),
      apiGet<{ flat: EligibilityRule[]; grouped?: any; summary?: any }>(`/api/projects/${projectId}/eligibility`).catch(() => null),
      apiGet<{ items: ChecklistItem[]; grouped?: Record<string, ChecklistItem[]>; summary?: any }>(`/api/projects/${projectId}/checklist`).catch(() => null),
      apiGet<NeemiaDoc[]>(`/api/neemia/projects/${projectId}/documents`).catch(() => []),
    ])
      .then(([proj, elig, check, docs]) => {
        setProject(proj);
        if (elig) setEligibilityData(elig);
        if (check) setChecklistData(check);
        setNeemiaDocs(Array.isArray(docs) ? docs : []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message || "Failed to load project");
        setLoading(false);
      });
  }, [projectId]);

  // Fetch guide rules when ghid tab is activated
  useEffect(() => {
    if (activeLeaf !== "ghid" || guideRules.length > 0) return;
    if (!project?.folderId) return;
    // Try to get guide document rules from the folder
    apiGet<any[]>(`/api/rules/documents/${project.folderId}/rules`)
      .then(rules => {
        if (Array.isArray(rules)) {
          setGuideRules(rules.map(r => ({
            id: r.id,
            type: r.type || "fixed",
            text: r.description || r.text || "",
            confidence: r.confidence ?? 1,
            page: r.page,
            section: r.section,
          })));
        }
      })
      .catch(() => {
        // Guide rules may not be available yet
      });
  }, [activeLeaf, project?.folderId, guideRules.length]);

  // Solomon: initialize conversation when tab is activated
  useEffect(() => {
    if (activeLeaf !== "solomon" || solomonConvId) return;
    if (!projectId) return;

    apiGet<any[]>(`/api/solomon/projects/${projectId}/conversations`)
      .then(convs => {
        if (Array.isArray(convs) && convs.length > 0) {
          const conv = convs[0];
          setSolomonConvId(conv.id);
          // Load existing messages
          return apiGet<any[]>(`/api/solomon/conversations/${conv.id}/messages`).then(msgs => {
            if (Array.isArray(msgs)) {
              setSolomonMessages(msgs.map((m: any) => ({
                role: m.role,
                text: m.content || m.text || "",
                extractions: m.extractions || null,
              })));
            }
          });
        } else {
          // Create a new conversation
          return apiPost<any>(`/api/solomon/projects/${projectId}/conversations`, {
            model: solomonModel,
          }).then(conv => {
            setSolomonConvId(conv.id);
          });
        }
      })
      .catch(() => {
        // Solomon may not be available
      });
  }, [activeLeaf, projectId, solomonConvId, solomonModel]);

  // Build solomon elements from project elements
  useEffect(() => {
    if (!project) return;
    const mapped: SolomonElement[] = project.elements
      .filter(el => el.value)
      .map(el => ({
        key: el.templateElement?.key || el.id,
        label: el.templateElement?.label || el.templateElement?.key || "Element",
        value: el.value!,
        source: mapElementSourceLabel(el.source) || "Unknown",
        status: el.confirmed ? "confirmat" as const : "propus" as const,
      }));
    setSolomonElements(mapped);
  }, [project]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [solomonMessages]);

  // Close refine popup on outside click
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) setRefinePopup(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  /* ═══ DERIVED DATA ═══ */
  const eligRules = eligibilityData?.flat || project?.eligibility || [];
  const eligMapped = eligRules.map(r => ({
    id: r.id,
    name: r.rule?.description || r.details || "Regulă",
    status: mapEligStatus(r.status),
    detail: r.details || "",
    type: r.rule?.type || r.source || "fixed",
    confidence: r.confidence,
  }));

  const elements = (project?.elements || []).map(el => ({
    id: el.id,
    key: el.templateElement?.key || el.id,
    label: el.templateElement?.label || el.templateElement?.key || "Element",
    value: el.value,
    status: mapElementStatus(el),
    confidence: el.confirmed ? 100 : 80,
    source: mapElementSourceDot(el.source),
    sourceLabel: mapElementSourceLabel(el.source),
    templates: [] as string[],
  }));

  const checklistItems = checklistData?.items || project?.checklist || [];
  const checkCategories = [...new Set(checklistItems.map(i => i.category))];

  const eligPassed = eligMapped.filter(r => r.status === "pass").length;
  const eligTotal = eligMapped.length;
  const elemFilled = elements.filter(e => e.value).length;
  const elemTotal = elements.length;
  const checkDone = checklistItems.filter(i => i.done).length;
  const checkTotal = checklistItems.length;

  const filteredElements = elements.filter(e => {
    if (elemFilter === "gol" && e.status !== "gol") return false;
    if (elemFilter === "propus_ai" && e.status !== "propus_ai") return false;
    if (elemFilter === "confirmat" && e.status !== "confirmat") return false;
    if (elemSearch) {
      const q = elemSearch.toLowerCase();
      return e.label.toLowerCase().includes(q) || e.key.toLowerCase().includes(q) || (e.value || "").toLowerCase().includes(q);
    }
    return true;
  });

  const projectPath = project?.programPath
    ? [
        { label: project.programPath.program || "Program", level: "program" },
        { label: project.programPath.masura || "Măsura", level: "masura" },
        { label: project.programPath.sesiune || "Sesiunea", level: "sesiune" },
      ]
    : [];

  const projectStatus = project?.status || "draft";
  const statusInfo = STATUS_MAP[projectStatus] || STATUS_MAP.draft;

  /* ═══ HANDLERS ═══ */
  const handleSolomonSend = async () => {
    if (!solomonInput.trim() || solomonSending) return;
    const userText = solomonInput;
    setSolomonMessages(prev => [...prev, { role: "user", text: userText, extractions: null }]);
    setSolomonInput("");
    setSolomonSending(true);

    try {
      if (solomonConvId) {
        const response = await apiPost<any>(`/api/solomon/conversations/${solomonConvId}/messages`, {
          content: userText,
          model: solomonModel,
          extendedThinking: solomonET,
        });
        // Handle response - it may be a direct message or need parsing
        const assistantText = response?.content || response?.text || response?.message || "Am procesat informația.";
        const extractions = response?.extractions || null;
        setSolomonMessages(prev => [...prev, {
          role: "assistant",
          text: assistantText,
          extractions,
        }]);
      }
    } catch (err: any) {
      setSolomonMessages(prev => [...prev, {
        role: "assistant",
        text: `Eroare: ${err.message || "Nu am putut procesa mesajul."}`,
        extractions: null,
      }]);
    } finally {
      setSolomonSending(false);
    }
  };

  const handleConfirmExtraction = (msgIdx: number, extIdx: number) => {
    const k = `${msgIdx}-${extIdx}`;
    setExtractionStates(prev => ({ ...prev, [k]: "confirmed" }));
    const msg = solomonMessages[msgIdx];
    if (msg?.extractions?.[extIdx]) {
      const ext = msg.extractions[extIdx];
      setSolomonElements(prev => [
        { key: ext.key, label: ext.label, value: ext.value, source: "Chat Solomon", status: "confirmat" },
        ...prev,
      ]);
    }
  };

  const handleRejectExtraction = (msgIdx: number, extIdx: number) => {
    setExtractionStates(prev => ({ ...prev, [`${msgIdx}-${extIdx}`]: "rejected" }));
  };

  const handleConfirmElement = (idx: number) => {
    setSolomonElements(prev => prev.map((el, i) => i === idx ? { ...el, status: "confirmat" } : el));
  };

  const handleRejectElement = (idx: number) => {
    setSolomonElements(prev => prev.filter((_, i) => i !== idx));
  };

  const handleTextSelect = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString().trim();
    if (text.length < 5) return;
    const msgEl = (sel.anchorNode?.parentElement as HTMLElement)?.closest?.(".chat-msg.assistant");
    if (!msgEl) return;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setRefinePopup({ text, x: rect.left, y: rect.bottom + 8 });
    setRefineInput("");
  }, []);

  const handleRefineSubmit = () => {
    if (!refineInput.trim() || !refinePopup) return;
    setSolomonMessages(prev => [...prev, {
      role: "assistant",
      text: `Fragment rescris conform instrucțiunii "${refineInput}":\n\n${refinePopup.text.substring(0, 60)}${refinePopup.text.length > 60 ? "..." : ""} [actualizat]`,
      extractions: null,
    }]);
    setRefinePopup(null);
    setRefineInput("");
  };

  const renderMsgText = (text: string) => {
    return text.split(/(\*\*.*?\*\*)/).map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <span key={i} className="msg-bold">{part.slice(2, -2)}</span>;
      }
      return part;
    });
  };

  const solomonConfirmedCount = solomonElements.filter(e => e.status === "confirmat").length;

  const handleChecklistToggle = async (item: ChecklistItem) => {
    const newDone = !item.done;
    // Optimistic update
    if (checklistData) {
      setChecklistData({
        ...checklistData,
        items: checklistData.items.map(i => i.id === item.id ? { ...i, done: newDone } : i),
        grouped: checklistData.grouped
          ? Object.fromEntries(
              Object.entries(checklistData.grouped).map(([cat, items]) => [
                cat,
                (items as ChecklistItem[]).map(i => i.id === item.id ? { ...i, done: newDone } : i),
              ])
            )
          : undefined,
      });
    }
    try {
      await apiPut(`/api/projects/${projectId}/checklist/${item.id}`, { done: newDone });
    } catch {
      // Revert on error
      if (checklistData) {
        setChecklistData({
          ...checklistData,
          items: checklistData.items.map(i => i.id === item.id ? { ...i, done: !newDone } : i),
        });
      }
    }
  };

  const handleReCheckEligibility = async () => {
    try {
      await apiPost(`/api/projects/${projectId}/check-eligibility`, {});
      // Refresh eligibility data
      const elig = await apiGet<{ flat: EligibilityRule[]; grouped?: any; summary?: any }>(`/api/projects/${projectId}/eligibility`);
      setEligibilityData(elig);
    } catch (err: any) {
      // Could show error toast
    }
  };

  const handleNeemiaGenerate = async () => {
    try {
      await apiPost(`/api/neemia/projects/${projectId}/generate`, {});
      // Refresh docs
      const docs = await apiGet<NeemiaDoc[]>(`/api/neemia/projects/${projectId}/documents`);
      setNeemiaDocs(Array.isArray(docs) ? docs : []);
    } catch {
      // handle error
    }
  };

  const handleNeemiaTemplateClick = (idx: number) => {
    setNeemiaActiveTemplate(idx);
    setNeemiaActivePage(0);
    setNeemiaAnimKey(k => k + 1);
  };

  const handleNeemiaPageClick = (idx: number) => {
    setNeemiaActivePage(idx);
    setNeemiaAnimKey(k => k + 1);
  };

  const toggleBranch = (key: string) => setBranches(b => ({ ...b, [key]: !b[key] }));

  /* ═══ LOADING STATE ═══ */
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", background: "var(--bg-deep)", color: "var(--text-secondary)", fontSize: 15 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12, animation: "spin 1s linear infinite" }}>&#9881;</div>
          <div>Se încarcă proiectul...</div>
          <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", background: "var(--bg-deep)", color: "var(--accent-red)", fontSize: 15 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>&#9888;</div>
          <div>{error || "Proiectul nu a fost găsit."}</div>
          <button onClick={() => router.push("/projects")} style={{ marginTop: 16, padding: "8px 20px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-primary)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 13 }}>
            &larr; Înapoi la proiecte
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .pv-container{display:flex;height:100%;overflow:hidden;background:var(--bg-deep)}

        .tree-sidebar{width:260px;min-width:260px;background:var(--bg-surface);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow-y:auto}
        .tree-header{padding:20px 16px 12px;border-bottom:1px solid var(--border)}
        .tree-header h2{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin-bottom:8px}
        .project-name{font-size:17px;font-weight:700;color:var(--text-primary);margin-bottom:2px}
        .project-meta{font-size:12px;color:var(--text-secondary);font-family:var(--font-mono)}
        .project-path{display:flex;flex-wrap:wrap;gap:0;margin-top:8px;font-size:11px;line-height:1.6}
        .project-path .pp-seg{color:var(--text-muted);white-space:nowrap}
        .project-path .pp-seg:last-child{color:var(--accent-blue);font-weight:600}
        .project-path .pp-sep{color:var(--border-active);margin:0 4px;font-size:9px}

        .tree-nav{padding:12px 8px;flex:1}
        .tree-branch{margin-bottom:2px}
        .tree-branch-header{display:flex;align-items:center;gap:6px;padding:8px 10px;border-radius:var(--r-sm);cursor:pointer;font-size:14px;font-weight:600;color:var(--text-secondary);transition:all .15s;user-select:none}
        .tree-branch-header:hover{background:var(--bg-hover);color:var(--text-primary)}
        .tree-leaf{display:flex;align-items:center;gap:8px;padding:7px 10px 7px 34px;border-radius:var(--r-sm);cursor:pointer;font-size:13px;font-weight:500;color:var(--text-secondary);transition:all .15s;position:relative}
        .tree-leaf:hover{background:var(--bg-hover);color:var(--text-primary)}
        .tree-leaf.active{background:rgba(77,139,255,.1);color:var(--accent-blue)}
        .tree-leaf.active::before{content:'';position:absolute;left:12px;top:50%;transform:translateY(-50%);width:3px;height:16px;background:var(--accent-blue);border-radius:2px}
        .leaf-badge{margin-left:auto;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;font-family:var(--font-mono)}
        .leaf-badge.red{background:rgba(248,113,113,.15);color:var(--accent-red)}
        .leaf-badge.green{background:rgba(52,211,153,.15);color:var(--accent-green)}
        .leaf-badge.blue{background:rgba(77,139,255,.15);color:var(--accent-blue)}
        .leaf-badge.muted{background:var(--bg-hover);color:var(--text-muted)}

        .tree-back{padding:12px 16px;border-top:1px solid var(--border);margin-top:auto}
        .tree-back-btn{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-muted);cursor:pointer;padding:8px 10px;border-radius:var(--r-sm);transition:all .15s;border:none;background:none;font-family:var(--font-sans);width:100%}
        .tree-back-btn:hover{background:var(--bg-hover);color:var(--text-primary)}

        .main-content{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}
        .content-header{padding:16px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;background:var(--bg-surface);min-height:56px}
        .content-header h1{font-size:18px;font-weight:700;display:flex;align-items:center;gap:10px}
        .content-body{flex:1;overflow:hidden;min-height:0}

        /* Sumar */
        .sumar-panel{padding:24px;max-width:900px;overflow-y:auto;height:100%}
        .sumar-status{display:flex;align-items:center;gap:12px;margin-bottom:24px}
        .status-badge{display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border-radius:12px;font-size:11px;font-weight:700}
        .sumar-progress{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
        .sp-card{padding:16px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-surface);text-align:center;cursor:pointer;transition:all .15s}
        .sp-card:hover{border-color:var(--border-active)}
        .sp-card .sp-val{font-size:24px;font-weight:800;font-family:var(--font-mono)}
        .sp-card .sp-label{font-size:12px;color:var(--text-secondary);margin-top:4px}
        .sp-card .sp-bar{height:4px;background:var(--bg-deep);border-radius:2px;margin-top:8px;overflow:hidden}
        .sp-card .sp-fill{height:100%;border-radius:2px;transition:width .4s}
        .sumar-info{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
        .si-card{padding:16px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-surface)}
        .si-card h3{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--text-muted);margin-bottom:10px}
        .si-row{display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px}
        .si-row .si-label{color:var(--text-secondary)}
        .si-row .si-value{color:var(--text-primary);font-weight:600;font-family:var(--font-mono)}
        .sumar-actions{display:flex;gap:10px}
        .sa-btn{padding:10px 18px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-surface);color:var(--text-secondary);font-size:13px;font-weight:600;cursor:pointer;font-family:var(--font-sans);transition:all .15s;display:flex;align-items:center;gap:6px}
        .sa-btn:hover{border-color:var(--accent-blue);color:var(--accent-blue)}
        .sa-btn.primary{border-color:var(--accent-blue);background:var(--accent-blue);color:#fff}
        .sa-btn.primary:hover{background:#5d9bff}

        /* Eligibility */
        .elig-panel{padding:24px;max-width:900px;overflow-y:auto;height:100%}
        .elig-summary{display:flex;gap:16px;margin-bottom:24px}
        .elig-stat{padding:16px 20px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-surface);flex:1;text-align:center}
        .elig-stat .number{font-size:28px;font-weight:700;font-family:var(--font-mono)}
        .elig-stat .label{font-size:12px;color:var(--text-secondary);margin-top:4px}
        .elig-rule{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:var(--r-sm);border:1px solid var(--border);margin-bottom:6px;background:var(--bg-surface);transition:all .15s;cursor:pointer}
        .elig-rule:hover{border-color:var(--border-active);background:var(--bg-elevated)}
        .elig-icon{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px}
        .elig-icon.pass{background:rgba(52,211,153,.15);color:var(--accent-green)}
        .elig-icon.fail{background:rgba(248,113,113,.15);color:var(--accent-red)}
        .elig-icon.pending{background:rgba(251,191,36,.15);color:var(--accent-yellow)}
        .elig-name{font-size:14px;font-weight:500;flex:1}
        .elig-detail{font-size:12px;color:var(--text-secondary);font-family:var(--font-mono);max-width:300px;text-align:right}
        .elig-type-badge{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:2px 6px;border-radius:3px;margin-left:8px}
        .elig-type-badge.fixed{background:rgba(52,211,153,.12);color:var(--accent-green)}
        .elig-type-badge.interpreted{background:rgba(251,146,60,.12);color:var(--accent-orange)}

        /* Ghid */
        .ghid-layout{display:flex;flex-direction:column;height:100%}
        .ghid-sub-tabs{display:flex;gap:0;border-bottom:1px solid var(--border);background:var(--bg-surface);padding:0 20px}
        .ghid-sub-tab{padding:12px 20px;font-size:13px;font-weight:600;color:var(--text-secondary);cursor:pointer;border-bottom:2px solid transparent;transition:all .15s;background:none;border-top:none;border-left:none;border-right:none;font-family:var(--font-sans)}
        .ghid-sub-tab:hover{color:var(--text-primary)}
        .ghid-sub-tab.active{color:var(--accent-blue);border-bottom-color:var(--accent-blue)}
        .ghid-split{display:flex;flex:1;overflow:hidden}
        .rules-panel{width:400px;min-width:400px;overflow-y:auto;padding:16px;border-right:1px solid var(--border)}
        .rule-card{padding:12px 14px;border-radius:var(--r-sm);border:1px solid var(--border);margin-bottom:8px;cursor:pointer;transition:all .2s;background:var(--bg-surface)}
        .rule-card:hover,.rule-card.active{border-color:var(--accent-blue);background:rgba(77,139,255,.05)}
        .rule-type-badge{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:3px 10px;border-radius:4px;display:inline-block;margin-bottom:8px}
        .rule-type-badge.fixed{color:var(--accent-green);background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.25)}
        .rule-type-badge.interpreted{color:var(--accent-orange);background:rgba(251,146,60,.12);border:1px solid rgba(251,146,60,.25)}
        .rule-text{font-size:13px;line-height:1.5;color:var(--text-primary)}
        .rule-meta{font-size:11px;color:var(--text-muted);margin-top:6px;font-family:var(--font-mono);display:flex;gap:12px}
        .confidence-bar{width:48px;height:4px;background:var(--bg-deep);border-radius:2px;overflow:hidden;display:inline-block;vertical-align:middle;margin-left:4px}
        .confidence-fill{height:100%;border-radius:2px}
        .pdf-viewer{flex:1;background:var(--bg-deep);display:flex;align-items:center;justify-content:center;position:relative}
        .pdf-page-mock{width:480px;background:#fff;border-radius:4px;box-shadow:0 4px 24px rgba(0,0,0,.4);padding:48px 40px;min-height:620px;color:#1a1a2e;position:relative}
        .pdf-page-mock h3{font-size:16px;font-weight:700;margin-bottom:16px;color:#1a1a2e}
        .pdf-highlight{background:rgba(77,139,255,.2);border-left:3px solid var(--accent-blue);padding:8px 12px;margin:8px 0;border-radius:0 4px 4px 0;animation:highlightPulse 1.5s ease infinite}
        @keyframes highlightPulse{0%,100%{background:rgba(77,139,255,.15)}50%{background:rgba(77,139,255,.3)}}
        .pdf-text-line{height:10px;background:#d4d8e0;border-radius:2px;margin:8px 0}
        .pdf-page-num{position:absolute;bottom:16px;right:24px;font-size:12px;color:#888;font-family:var(--font-mono)}

        /* Elemente */
        .elemente-layout{display:flex;height:100%}
        .elemente-list{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}
        .completitudine-bar{padding:20px 24px;background:var(--bg-surface);border-bottom:1px solid var(--border)}
        .completitudine-top{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px}
        .cl-label{font-size:15px;font-weight:700;color:var(--text-primary)}
        .cl-pct{font-size:28px;font-weight:800;font-family:var(--font-mono)}
        .progress-track{height:8px;background:var(--bg-deep);border-radius:4px;overflow:hidden;display:flex;gap:2px;margin-bottom:10px}
        .progress-seg{height:100%;border-radius:3px;transition:width .5s}
        .completitudine-legend{display:flex;gap:20px;font-size:12px;color:var(--text-secondary)}
        .legend-item{display:flex;align-items:center;gap:6px}
        .legend-dot{width:8px;height:8px;border-radius:50%}
        .li-num{font-weight:700;font-family:var(--font-mono);color:var(--text-primary)}
        .elemente-filter-bar{padding:12px 24px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border);background:var(--bg-surface)}
        .elem-search{padding:7px 14px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-deep);color:var(--text-primary);font-size:13px;font-family:var(--font-sans);outline:none;width:180px}
        .elem-search:focus{border-color:var(--accent-blue)}.elem-search::placeholder{color:var(--text-muted)}
        .fp-group{display:flex;background:var(--bg-deep);border-radius:var(--r-md);padding:3px;gap:2px}
        .fp{padding:5px 14px;border-radius:7px;font-size:12px;font-weight:600;border:none;cursor:pointer;background:transparent;color:var(--text-secondary);font-family:var(--font-sans);transition:all .15s;white-space:nowrap}
        .fp:hover{color:var(--text-primary)}.fp.on{background:var(--accent-blue);color:#fff}
        .fp.on-green{background:var(--accent-green);color:var(--bg-deep)}
        .fp.on-yellow{background:var(--accent-yellow);color:var(--bg-deep)}
        .fp.on-red{background:var(--accent-red);color:#fff}
        .elemente-scroll{flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:10px}
        .elem-card{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r-md);padding:14px 18px;cursor:pointer;transition:all .18s}
        .elem-card:hover{border-color:var(--border-active);background:var(--bg-elevated)}
        .elem-card.active{border-color:var(--accent-blue);background:rgba(77,139,255,.04)}
        .ec-top{display:flex;align-items:center;gap:8px;margin-bottom:4px}
        .ec-key{font-size:12px;font-family:var(--font-mono);color:var(--text-muted)}
        .ec-status{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px}
        .ec-status.confirmat{background:rgba(52,211,153,.15);color:var(--accent-green)}
        .ec-status.propus_ai{background:rgba(251,191,36,.15);color:var(--accent-yellow)}
        .ec-status.gol{background:rgba(248,113,113,.12);color:var(--accent-red)}
        .ec-label{font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:4px}
        .ec-value{font-size:13px;font-family:var(--font-mono);color:var(--accent-blue)}
        .ec-value.missing{color:var(--accent-red);font-style:italic}
        .ec-source{font-size:11px;color:var(--text-muted);margin-top:4px;display:flex;align-items:center;gap:4px}
        .source-dot{width:6px;height:6px;border-radius:50%;display:inline-block}
        .source-dot.company_data{background:var(--accent-green)}
        .source-dot.solomon_chat{background:var(--accent-blue)}
        .source-dot.manual{background:var(--accent-purple)}

        .elem-detail{width:350px;min-width:350px;border-left:1px solid var(--border);background:var(--bg-surface);overflow-y:auto;padding:20px}
        .ed-header{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin-bottom:16px}
        .ed-field{margin-bottom:16px}
        .ed-label{font-size:12px;color:var(--text-muted);margin-bottom:4px}
        .ed-val{font-size:15px;font-weight:600;color:var(--text-primary);padding:10px 14px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--bg-elevated)}
        .ed-btn{padding:8px 16px;border-radius:var(--r-sm);border:1px solid var(--accent-green);background:transparent;color:var(--accent-green);font-size:12px;font-weight:600;cursor:pointer;font-family:var(--font-sans);transition:all .15s;display:flex;align-items:center;gap:4px}
        .ed-btn:hover{background:rgba(52,211,153,.1)}

        /* Checklist */
        .checklist-panel{padding:24px;max-width:900px;overflow-y:auto;height:100%}
        .check-progress{display:flex;align-items:center;gap:16px;margin-bottom:24px;padding:20px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-surface)}
        .check-ring{width:80px;height:80px;position:relative;flex-shrink:0}
        .check-ring svg{transform:rotate(-90deg)}
        .check-ring-text{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;font-family:var(--font-mono)}
        .check-info{flex:1}
        .check-info .ci-title{font-size:16px;font-weight:700;margin-bottom:4px}
        .check-info .ci-sub{font-size:13px;color:var(--text-secondary)}
        .check-category{margin-bottom:16px}
        .check-cat-header{display:flex;align-items:center;gap:8px;padding:8px 0;cursor:pointer;font-size:14px;font-weight:700;color:var(--text-secondary)}
        .check-cat-header:hover{color:var(--text-primary)}
        .check-cat-count{font-size:11px;color:var(--text-muted);font-family:var(--font-mono)}
        .check-item{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:var(--r-sm);margin-bottom:4px;transition:background .12s}
        .check-item:hover{background:var(--bg-hover)}
        .check-box{width:18px;height:18px;border-radius:4px;border:2px solid var(--border);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .15s;flex-shrink:0;font-size:11px}
        .check-box.done{border-color:var(--accent-green);background:var(--accent-green);color:#fff}
        .check-name{font-size:13px;font-weight:500;flex:1}
        .check-name.done-text{text-decoration:line-through;color:var(--text-muted)}
        .check-source-badge{font-size:9px;font-weight:700;text-transform:uppercase;padding:2px 6px;border-radius:3px;letter-spacing:.5px}
        .check-source-badge.ghid{background:rgba(77,139,255,.12);color:var(--accent-blue)}
        .check-source-badge.manual{background:rgba(167,139,250,.12);color:var(--accent-purple)}
        .check-template{font-size:11px;color:var(--accent-blue);cursor:pointer;white-space:nowrap}
        .check-template:hover{text-decoration:underline}

        /* Solomon Chat */
        .solomon-layout{display:flex;height:100%;overflow:hidden}
        .solomon-chat{flex:1;display:flex;flex-direction:column;min-width:0;height:100%;overflow:hidden}
        .solomon-toolbar{padding:10px 20px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--border);background:var(--bg-surface)}
        .solomon-avatar{width:32px;height:32px;border-radius:50%;background:var(--accent-blue);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;color:white;flex-shrink:0}
        .solomon-name-block{display:flex;flex-direction:column;gap:1px}
        .solomon-name-block .sn-name{font-size:14px;font-weight:700;color:var(--text-primary)}
        .solomon-name-block .sn-status{font-size:11px;color:var(--accent-green);display:flex;align-items:center;gap:4px}
        .sn-status-dot{width:6px;height:6px;border-radius:50%;background:var(--accent-green);animation:statusPulse 2s ease infinite}
        @keyframes statusPulse{0%,100%{opacity:1}50%{opacity:.4}}
        .model-selector{display:flex;gap:3px;background:var(--bg-deep);padding:3px;border-radius:var(--r-sm);margin-left:auto}
        .model-btn{padding:4px 10px;font-size:11px;font-weight:600;border-radius:4px;border:none;cursor:pointer;background:transparent;color:var(--text-secondary);font-family:var(--font-mono);transition:all .15s}
        .model-btn.active{background:var(--accent-blue);color:white}
        .model-btn:hover:not(.active){color:var(--text-primary);background:var(--bg-hover)}
        .et-toggle{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text-secondary);cursor:pointer;padding:4px 9px;border-radius:4px;border:1px solid var(--border);background:transparent;font-family:var(--font-sans);transition:all .15s}
        .et-toggle.on{border-color:var(--accent-purple);color:var(--accent-purple);background:rgba(167,139,250,.08)}
        .chat-messages{flex:1;overflow-y:auto;overflow-x:hidden;padding:20px;display:flex;flex-direction:column;gap:16px;min-height:0}
        .chat-msg{max-width:85%;padding:14px 18px;border-radius:var(--r-lg, 14px);font-size:14px;line-height:1.6;white-space:pre-wrap;position:relative}
        .chat-msg.assistant{background:var(--bg-elevated);border:1px solid var(--border);align-self:flex-start;border-bottom-left-radius:4px}
        .chat-msg.user{background:rgba(77,139,255,.1);border:1px solid rgba(77,139,255,.2);align-self:flex-end;border-bottom-right-radius:4px}
        .chat-msg .msg-bold{font-weight:600;color:var(--text-primary)}
        .extraction-cards{margin-top:10px;display:flex;flex-direction:column;gap:8px}
        .extraction-card{background:var(--bg-deep);border:1px solid var(--border);border-radius:var(--r-sm);padding:10px 14px;transition:all .2s}
        .extraction-card.confirmed{border-color:var(--accent-green);background:rgba(52,211,153,.05)}
        .extraction-card.rejected{border-color:var(--accent-red);opacity:.5;text-decoration:line-through}
        .exc-top{display:flex;align-items:center;gap:6px;margin-bottom:4px}
        .exc-label{font-size:12px;color:var(--text-muted);flex:1}
        .exc-confidence{font-size:11px;font-family:var(--font-mono);font-weight:600;color:var(--text-secondary)}
        .exc-value{font-size:14px;font-weight:600;color:var(--accent-blue);font-family:var(--font-mono);margin-bottom:8px}
        .exc-actions{display:flex;gap:6px}
        .exc-btn{padding:4px 12px;border-radius:4px;border:1px solid var(--border);font-size:12px;font-weight:600;cursor:pointer;font-family:var(--font-sans);display:flex;align-items:center;gap:4px;transition:all .15s;background:transparent}
        .exc-btn.confirm-btn{border-color:var(--accent-green);color:var(--accent-green)}
        .exc-btn.confirm-btn:hover{background:rgba(52,211,153,.1)}
        .exc-btn.edit-btn{color:var(--text-secondary)}
        .exc-btn.edit-btn:hover{color:var(--accent-yellow);border-color:var(--accent-yellow)}
        .exc-btn.reject-btn{color:var(--text-muted)}
        .exc-btn.reject-btn:hover{color:var(--accent-red);border-color:var(--accent-red)}
        .exc-confirmed-label{font-size:11px;font-weight:700;color:var(--accent-green);display:flex;align-items:center;gap:4px}
        .chat-timestamp{font-size:10px;color:var(--text-muted);margin-top:4px}
        .chat-input-area{padding:14px 20px;border-top:1px solid var(--border);background:var(--bg-surface)}
        .chat-input-row{display:flex;gap:8px;align-items:flex-end}
        .chat-input{flex:1;padding:12px 16px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-deep);color:var(--text-primary);font-size:14px;font-family:var(--font-sans);line-height:1.5;resize:none;outline:none;min-height:44px;max-height:160px;overflow-y:auto;transition:border-color .15s}
        .chat-input:focus{border-color:var(--accent-blue)}
        .chat-input::placeholder{color:var(--text-muted)}
        .chat-btn{width:44px;height:44px;border-radius:var(--r-md);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0}
        .chat-btn.send{background:var(--accent-blue);color:white;font-size:18px}
        .chat-btn.send:hover{background:#5d9bff}
        .chat-btn.upload-btn{background:var(--bg-elevated);color:var(--text-secondary);border:1px solid var(--border);font-size:16px}
        .chat-btn.upload-btn:hover{border-color:var(--border-active);color:var(--text-primary)}
        .solomon-elements-panel{width:320px;min-width:280px;border-left:1px solid var(--border);background:var(--bg-surface);display:flex;flex-direction:column;overflow:hidden;height:100%}
        .sep-header{padding:14px 16px;border-bottom:1px solid var(--border);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);display:flex;align-items:center;gap:8px}
        .sep-count{font-size:10px;padding:1px 6px;border-radius:8px;background:rgba(77,139,255,.12);color:var(--accent-blue);font-family:var(--font-mono)}
        .sep-scroll{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px}
        .sep-card{padding:12px 14px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--bg-elevated);transition:all .15s}
        .sep-card:hover{border-color:var(--border-active)}
        .sep-card.is-confirmed{border-left:3px solid var(--accent-green)}
        .sep-card.is-proposed{border-left:3px solid var(--accent-yellow)}
        .sep-card-label{font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:3px}
        .sep-card-value{font-size:14px;font-weight:600;color:var(--accent-yellow);font-family:var(--font-mono);margin-bottom:6px;word-break:break-word}
        .sep-card.is-confirmed .sep-card-value{color:var(--accent-green)}
        .sep-card-source{font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:4px}
        .sep-confirm-row{margin-top:8px;display:flex;gap:6px}
        .sep-confirm-btn{padding:3px 10px;border-radius:4px;border:1px solid var(--accent-green);background:transparent;color:var(--accent-green);font-size:11px;font-weight:600;cursor:pointer;font-family:var(--font-sans);display:flex;align-items:center;gap:3px;transition:all .15s}
        .sep-confirm-btn:hover{background:rgba(52,211,153,.1)}
        .sep-reject-btn{padding:3px 10px;border-radius:4px;border:1px solid var(--border);background:transparent;color:var(--text-muted);font-size:11px;font-weight:600;cursor:pointer;font-family:var(--font-sans);transition:all .15s}
        .sep-reject-btn:hover{color:var(--accent-red);border-color:var(--accent-red)}
        .sep-confirmed-badge{font-size:10px;color:var(--accent-green);font-weight:700;margin-top:6px;display:flex;align-items:center;gap:4px}
        .inline-refine-popup{position:fixed;z-index:1000;background:var(--bg-elevated);border:1px solid var(--accent-blue);border-radius:var(--r-md);padding:12px;box-shadow:0 8px 32px rgba(0,0,0,.5);width:340px;animation:popIn .15s ease}
        @keyframes popIn{from{opacity:0;transform:translateY(4px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
        .refine-selected-text{font-size:12px;color:var(--text-secondary);background:var(--bg-deep);padding:8px 10px;border-radius:var(--r-sm);margin-bottom:8px;max-height:60px;overflow:hidden;border-left:3px solid var(--accent-blue)}
        .refine-input-row{display:flex;gap:6px}
        .refine-input{flex:1;padding:8px 12px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--bg-deep);color:var(--text-primary);font-size:13px;font-family:var(--font-sans);outline:none}
        .refine-input:focus{border-color:var(--accent-blue)}
        .refine-submit{padding:8px 14px;border-radius:var(--r-sm);border:none;background:var(--accent-blue);color:white;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--font-sans)}

        /* Neemia */
        .neemia-layout{display:flex;height:100%}
        .neemia-templates{width:240px;min-width:240px;border-right:1px solid var(--border);padding:16px;overflow-y:auto}
        .neemia-templates h3{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin-bottom:12px}
        .template-card{padding:12px 14px;border-radius:var(--r-sm);border:1px solid var(--border);margin-bottom:8px;cursor:pointer;transition:all .15s;background:var(--bg-surface)}
        .template-card:hover{border-color:var(--border-active)}
        .template-card.active{border-color:var(--accent-blue);background:rgba(77,139,255,.05)}
        .template-card .tc-name{font-size:14px;font-weight:600;display:flex;align-items:center;gap:6px;margin-bottom:4px}
        .tc-badge{font-size:10px;font-weight:700;padding:1px 5px;border-radius:3px;background:var(--bg-hover);color:var(--text-muted);font-family:var(--font-mono)}
        .template-card .tc-info{font-size:12px;color:var(--text-secondary)}
        .template-card .tc-progress{height:3px;background:var(--bg-deep);border-radius:2px;margin-top:8px;overflow:hidden}
        .tc-progress-fill{height:100%;border-radius:2px;transition:width .5s ease}
        .neemia-doc-view{flex:1;display:flex;flex-direction:column;min-width:0}
        .neemia-page-nav{padding:12px 20px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border);background:var(--bg-surface)}
        .neemia-page-nav .nav-label{font-size:13px;font-weight:600;color:var(--text-secondary);margin-right:8px}
        .page-thumb{width:36px;height:36px;border-radius:var(--r-sm);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;cursor:pointer;border:2px solid transparent;transition:all .15s;font-family:var(--font-mono)}
        .page-thumb.complete{background:rgba(52,211,153,.15);color:var(--accent-green)}
        .page-thumb.partial{background:rgba(251,191,36,.15);color:var(--accent-yellow)}
        .page-thumb.empty{background:rgba(248,113,113,.12);color:var(--accent-red)}
        .page-thumb.active{border-color:var(--accent-blue);box-shadow:0 0 0 2px rgba(77,139,255,.3)}
        .download-btn{margin-left:auto;display:flex;align-items:center;gap:6px;padding:8px 16px;border-radius:var(--r-sm);border:none;background:var(--accent-green);color:#0a0c10;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font-sans);transition:all .15s}
        .download-btn:hover{background:#4ae3a9}
        .neemia-preview-area{flex:1;display:flex;overflow:hidden}
        .neemia-doc-preview{flex:1;display:flex;align-items:center;justify-content:center;background:var(--bg-deep);padding:24px}
        .doc-page{width:460px;min-height:580px;background:#fff;border-radius:4px;box-shadow:0 4px 24px rgba(0,0,0,.4);padding:40px 36px;color:#1a1a2e;position:relative;animation:pageSlide .55s ease}
        @keyframes pageSlide{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        .doc-page .doc-header-label{font-size:10px;text-transform:uppercase;letter-spacing:1.2px;color:#888;margin-bottom:4px}
        .doc-page .doc-page-title{font-size:20px;font-weight:700;margin-bottom:24px;color:#1a1a2e}
        .doc-field-group{margin-bottom:18px}
        .doc-field-label{font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:#888;margin-bottom:4px}
        .doc-field-value{font-size:15px;font-weight:600;color:#1a1a2e;padding-bottom:4px;border-bottom:2px solid #4d8bff}
        .doc-field-missing{font-size:15px;font-style:italic;color:#e74c3c;padding-bottom:4px;border-bottom:2px dashed #e74c3c}
        .doc-page-number{position:absolute;bottom:16px;right:24px;font-size:12px;color:#aaa;font-family:var(--font-mono)}
        .neemia-fields-panel{width:300px;min-width:300px;border-left:1px solid var(--border);overflow-y:auto;padding:16px;background:var(--bg-surface)}
        .neemia-fields-panel h3{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin-bottom:12px}
        .field-card{padding:10px 12px;border-radius:var(--r-sm);border:1px solid var(--border);margin-bottom:6px;background:var(--bg-elevated)}
        .field-card .field-name{font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:3px}
        .field-card .field-val{font-size:13px;color:var(--accent-blue);font-weight:500}
        .field-card .field-val.missing{color:var(--accent-red);font-style:italic}
        .field-source{font-size:10px;color:var(--text-muted);margin-top:3px;display:flex;align-items:center;gap:4px}
        .source-dot{width:6px;height:6px;border-radius:50%;display:inline-block}
        .source-dot.solomon{background:var(--accent-blue)}
        .source-dot.onrc{background:var(--accent-green)}
        .neemia-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--text-muted);gap:12px}
        .neemia-empty .ne-icon{font-size:40px;opacity:.5}
        .neemia-empty .ne-label{font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:1px}
        .neemia-empty .ne-desc{font-size:13px;color:var(--text-secondary)}

        .coming-soon{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--text-muted);gap:12px}
        .coming-soon .cs-icon{font-size:48px;opacity:.5}
        .coming-soon .cs-label{font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:1px}
        .coming-soon .cs-desc{font-size:13px;color:var(--text-secondary)}
      `}</style>

      <div className="pv-container">
        {/* --- SIDEBAR TREE --- */}
        <div className="tree-sidebar">
          <div className="tree-header">
            <h2>Proiect</h2>
            <div className="project-name">{project.name}</div>
            <div className="project-meta">{project.company?.denumire} &middot; {project.company?.cui}</div>
            <div className="project-path">
              {projectPath.map((seg, i) => (
                <span key={i}>
                  {i > 0 && <span className="pp-sep">&rsaquo;</span>}
                  <span className="pp-seg">{seg.label}</span>
                </span>
              ))}
            </div>
            <div style={{ marginTop: 8 }}>
              <span className="status-badge" style={{ background: statusInfo.bg, color: statusInfo.color }}>
                {statusInfo.label}
              </span>
            </div>
          </div>

          <div className="tree-nav">
            {/* Sumar leaf */}
            <div className={`tree-leaf ${activeLeaf === "sumar" ? "active" : ""}`} onClick={() => setActiveLeaf("sumar")}>
              <span>&#128203;</span> Sumar
            </div>

            {/* Scriere proiect branch */}
            <div className="tree-branch">
              <div className="tree-branch-header" onClick={() => toggleBranch("scriere")}>
                <span style={{ fontSize: 10, transition: "transform .15s", transform: branches.scriere ? "rotate(90deg)" : "none" }}>&#9654;</span>
                Scriere proiect
              </div>
              {branches.scriere && (
                <div>
                  <div className={`tree-leaf ${activeLeaf === "eligibilitate" ? "active" : ""}`} onClick={() => setActiveLeaf("eligibilitate")}>
                    <span>&#128737;</span> Eligibilitate
                    <span className={`leaf-badge ${eligPassed === eligTotal ? "green" : eligPassed > 0 ? "blue" : "red"}`}>{eligPassed}/{eligTotal}</span>
                  </div>
                  <div className={`tree-leaf ${activeLeaf === "ghid" ? "active" : ""}`} onClick={() => setActiveLeaf("ghid")}>
                    <span>&#128214;</span> Ghid Finanțare
                    <span className="leaf-badge blue">{guideRules.length}</span>
                  </div>
                  <div className={`tree-leaf ${activeLeaf === "solomon" ? "active" : ""}`} onClick={() => setActiveLeaf("solomon")}>
                    <span>&#129302;</span> Solomon
                    <span className="leaf-badge muted">{solomonModel === "opus" ? "Opus" : "Sonnet"}</span>
                  </div>
                  <div className={`tree-leaf ${activeLeaf === "elemente" ? "active" : ""}`} onClick={() => setActiveLeaf("elemente")}>
                    <span>&#128202;</span> Elemente
                    <span className={`leaf-badge ${elemFilled === elemTotal ? "green" : "blue"}`}>{elemFilled}/{elemTotal}</span>
                  </div>
                  <div className={`tree-leaf ${activeLeaf === "checklist" ? "active" : ""}`} onClick={() => setActiveLeaf("checklist")}>
                    <span>&#128203;</span> Checklist doc
                    <span className={`leaf-badge ${checkDone === checkTotal ? "green" : checkDone > 0 ? "blue" : "red"}`}>{checkDone}/{checkTotal}</span>
                  </div>
                  <div className={`tree-leaf ${activeLeaf === "neemia" ? "active" : ""}`} onClick={() => setActiveLeaf("neemia")}>
                    <span>&#128196;</span> Neemia
                    <span className="leaf-badge muted">{neemiaDocs.length}/{neemiaDocs.length || 0}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Implementare branch */}
            <div className="tree-branch">
              <div className="tree-branch-header" onClick={() => toggleBranch("implementare")}>
                <span style={{ fontSize: 10, transition: "transform .15s", transform: branches.implementare ? "rotate(90deg)" : "none" }}>&#9654;</span>
                Implementare
                <span className="leaf-badge muted" style={{ marginLeft: "auto" }}>TBD</span>
              </div>
            </div>

            {/* Monitorizare branch */}
            <div className="tree-branch">
              <div className="tree-branch-header" onClick={() => toggleBranch("monitorizare")}>
                <span style={{ fontSize: 10, transition: "transform .15s", transform: branches.monitorizare ? "rotate(90deg)" : "none" }}>&#9654;</span>
                Monitorizare
                <span className="leaf-badge muted" style={{ marginLeft: "auto" }}>TBD</span>
              </div>
            </div>
          </div>

          <div className="tree-back">
            <button className="tree-back-btn" onClick={() => router.push("/projects")}>
              &larr; Toate proiectele
            </button>
          </div>
        </div>

        {/* --- MAIN CONTENT --- */}
        <div className="main-content">
          <div className="content-header">
            <h1>
              {activeLeaf === "sumar" && <><span>&#128203;</span> Sumar proiect</>}
              {activeLeaf === "eligibilitate" && <><span>&#128737;</span> Eligibilitate</>}
              {activeLeaf === "ghid" && <><span>&#128214;</span> Ghid Finanțare</>}
              {activeLeaf === "solomon" && <><span>&#129302;</span> Solomon</>}
              {activeLeaf === "elemente" && <><span>&#128202;</span> Elemente proiect</>}
              {activeLeaf === "checklist" && <><span>&#128203;</span> Checklist documente</>}
              {activeLeaf === "neemia" && <><span>&#128196;</span> Neemia</>}
            </h1>
          </div>

          <div className="content-body">
            {/* SUMAR */}
            {activeLeaf === "sumar" && (
              <div className="sumar-panel">
                <div className="sumar-status">
                  <span style={{ fontSize: 20, fontWeight: 800 }}>{project.name}</span>
                </div>

                <div className="sumar-progress">
                  {[
                    { label: "Eligibilitate", val: `${eligPassed}/${eligTotal}`, p: pct(eligPassed, eligTotal), color: eligPassed === eligTotal ? "#34d399" : "#fbbf24", leaf: "eligibilitate" as LeafType },
                    { label: "Elemente", val: `${elemFilled}/${elemTotal}`, p: pct(elemFilled, elemTotal), color: elemFilled === elemTotal ? "#34d399" : "#4d8bff", leaf: "elemente" as LeafType },
                    { label: "Checklist doc", val: `${checkDone}/${checkTotal}`, p: pct(checkDone, checkTotal), color: checkDone === checkTotal ? "#34d399" : "#fb923c", leaf: "checklist" as LeafType },
                    { label: "Neemia", val: `${neemiaDocs.length}/${neemiaDocs.length || 0}`, p: neemiaDocs.length > 0 ? 100 : 0, color: "#a78bfa", leaf: "neemia" as LeafType },
                  ].map(item => (
                    <div className="sp-card" key={item.label} onClick={() => setActiveLeaf(item.leaf)}>
                      <div className="sp-val" style={{ color: item.color }}>{item.val}</div>
                      <div className="sp-label">{item.label}</div>
                      <div className="sp-bar"><div className="sp-fill" style={{ width: `${item.p}%`, background: item.color }} /></div>
                    </div>
                  ))}
                </div>

                <div className="sumar-info">
                  <div className="si-card">
                    <h3>Date firmă</h3>
                    <div className="si-row"><span className="si-label">CUI</span><span className="si-value">{project.company?.cui}</span></div>
                    <div className="si-row"><span className="si-label">Forma juridică</span><span className="si-value">{project.company?.formaJuridica}</span></div>
                    <div className="si-row"><span className="si-label">CAEN</span><span className="si-value">{project.company?.caen}</span></div>
                    <div className="si-row"><span className="si-label">Localitate</span><span className="si-value">{project.company?.localitate || "—"}{project.company?.judet ? `, ${project.company.judet}` : ""}</span></div>
                  </div>
                  <div className="si-card">
                    <h3>Date financiare</h3>
                    <div className="si-row"><span className="si-label">Capital social</span><span className="si-value">{project.company?.capitalSocial || "—"}</span></div>
                    <div className="si-row"><span className="si-label">Cifra afaceri</span><span className="si-value">{project.company?.cifraAfaceri || "—"}</span></div>
                    <div className="si-row"><span className="si-label">Valoare proiect</span><span className="si-value">{project.valoare || "—"}</span></div>
                  </div>
                </div>

                <div className="sumar-actions">
                  <button className="sa-btn primary" onClick={() => setActiveLeaf("eligibilitate")}>&#128737; Verifică eligibilitate</button>
                  <button className="sa-btn" onClick={() => setActiveLeaf("solomon")}>&#129302; Deschide Solomon</button>
                  <button className="sa-btn" onClick={() => setActiveLeaf("neemia")}>&#128196; Generează documente</button>
                </div>
              </div>
            )}

            {/* ELIGIBILITATE */}
            {activeLeaf === "eligibilitate" && (
              <div className="elig-panel">
                <div className="elig-summary">
                  <div className="elig-stat">
                    <div className="number" style={{ color: "var(--accent-green)" }}>{eligMapped.filter(r => r.status === "pass").length}</div>
                    <div className="label">Trecute</div>
                  </div>
                  <div className="elig-stat">
                    <div className="number" style={{ color: "var(--accent-red)" }}>{eligMapped.filter(r => r.status === "fail").length}</div>
                    <div className="label">Eșuate</div>
                  </div>
                  <div className="elig-stat">
                    <div className="number" style={{ color: "var(--accent-yellow)" }}>{eligMapped.filter(r => r.status === "pending").length}</div>
                    <div className="label">Pending</div>
                  </div>
                  <div className="elig-stat">
                    <div className="number">{eligMapped.length}</div>
                    <div className="label">Total</div>
                  </div>
                </div>

                {eligMapped.map(rule => (
                  <div className="elig-rule" key={rule.id}>
                    <div className={`elig-icon ${rule.status}`}>
                      {rule.status === "pass" ? "✓" : rule.status === "fail" ? "✕" : "?"}
                    </div>
                    <div className="elig-name">
                      {rule.name}
                      <span className={`elig-type-badge ${rule.type}`}>
                        {rule.type === "fixed" ? "⚡ FIXĂ" : "🧠 INTERPRETATĂ"}
                      </span>
                      {rule.type === "interpreted" && rule.confidence != null && rule.confidence < 0.85 && (
                        <span style={{ fontSize: 10, color: "var(--accent-yellow)", marginLeft: 6 }}>⚠️ Review</span>
                      )}
                    </div>
                    <div className="elig-detail">{rule.detail}</div>
                  </div>
                ))}

                <div style={{ marginTop: 16 }}>
                  <button className="sa-btn primary" style={{ display: "inline-flex" }} onClick={handleReCheckEligibility}>&#128260; Re-verifică eligibilitate</button>
                </div>
              </div>
            )}

            {/* GHID FINANTARE */}
            {activeLeaf === "ghid" && (
              <div className="ghid-layout">
                <div className="ghid-sub-tabs">
                  <button className={`ghid-sub-tab ${ghidTab === "reguli" ? "active" : ""}`} onClick={() => setGhidTab("reguli")}>Reguli ({guideRules.length})</button>
                  <button className={`ghid-sub-tab ${ghidTab === "ghid" ? "active" : ""}`} onClick={() => setGhidTab("ghid")}>Ghid complet</button>
                </div>
                <div className="ghid-split">
                  {ghidTab === "reguli" ? (
                    <>
                      <div className="rules-panel">
                        {guideRules.map(r => (
                          <div className={`rule-card ${selectedRule === r.id ? "active" : ""}`} key={r.id} onClick={() => setSelectedRule(r.id)}>
                            <div className={`rule-type-badge ${r.type}`}>
                              {r.type === "fixed" ? "FIXĂ" : "INTERPRETATĂ"}
                              {r.type === "interpreted" && r.confidence < 0.85 && <span style={{ marginLeft: 6, color: "var(--accent-yellow)", fontSize: 10 }}>⚠️ Review</span>}
                            </div>
                            <div className="rule-text">{r.text}</div>
                            <div className="rule-meta">
                              {r.page != null && <span>Pag. {r.page}</span>}
                              {r.section && <span>§{r.section}</span>}
                              <span>
                                {Math.round(r.confidence * 100)}%
                                <span className="confidence-bar"><span className="confidence-fill" style={{ width: `${r.confidence * 100}%`, background: r.confidence > 0.9 ? "var(--accent-green)" : r.confidence > 0.8 ? "var(--accent-blue)" : "var(--accent-yellow)" }} /></span>
                              </span>
                            </div>
                          </div>
                        ))}
                        {guideRules.length === 0 && (
                          <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                            Nu sunt reguli disponibile. Încărcați ghidul de finanțare pentru extragere automată.
                          </div>
                        )}
                      </div>
                      <div className="pdf-viewer">
                        <div className="pdf-page-mock">
                          <h3>Secțiunea {selectedRule ? guideRules.find(r => r.id === selectedRule)?.section || "3.1" : "3.1"} — Eligibilitate</h3>
                          <div className="pdf-text-line" style={{ width: "90%" }} />
                          <div className="pdf-text-line" style={{ width: "80%" }} />
                          <div className="pdf-text-line" style={{ width: "85%" }} />
                          {selectedRule && (
                            <div className="pdf-highlight">
                              <span style={{ fontSize: 13, lineHeight: 1.6 }}>
                                {guideRules.find(r => r.id === selectedRule)?.text}
                              </span>
                            </div>
                          )}
                          <div className="pdf-text-line" style={{ width: "75%" }} />
                          <div className="pdf-text-line" style={{ width: "88%" }} />
                          <div className="pdf-text-line" style={{ width: "60%" }} />
                          <div className="pdf-text-line" style={{ width: "92%" }} />
                          <div className="pdf-text-line" style={{ width: "70%" }} />
                          <div className="pdf-page-num">Pag. {selectedRule ? guideRules.find(r => r.id === selectedRule)?.page || 8 : 8}</div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="pdf-viewer" style={{ width: "100%" }}>
                      <div className="pdf-page-mock">
                        <h3>Ghid de Finanțare — {project.programPath?.masura || "Măsura"}</h3>
                        {Array.from({ length: 15 }).map((_, i) => (
                          <div className="pdf-text-line" key={i} style={{ width: `${60 + Math.random() * 35}%` }} />
                        ))}
                        <div className="pdf-page-num">Pag. 1 / 42</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ELEMENTE */}
            {activeLeaf === "elemente" && (
              <div className="elemente-layout">
                <div className="elemente-list">
                  <div className="completitudine-bar">
                    <div className="completitudine-top">
                      <span className="cl-label">Completitudine elemente</span>
                      <span className="cl-pct" style={{ color: pct(elemFilled, elemTotal) === 100 ? "var(--accent-green)" : "var(--accent-blue)" }}>
                        {pct(elemFilled, elemTotal)}%
                      </span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-seg" style={{ width: `${pct(elements.filter(e => e.status === "confirmat").length, elemTotal) * 100 / 100}%`, background: "var(--accent-green)" }} />
                      <div className="progress-seg" style={{ width: `${pct(elements.filter(e => e.status === "propus_ai").length, elemTotal) * 100 / 100}%`, background: "var(--accent-yellow)" }} />
                      <div className="progress-seg" style={{ width: `${pct(elements.filter(e => e.status === "gol").length, elemTotal) * 100 / 100}%`, background: "var(--accent-red)", opacity: 0.4 }} />
                    </div>
                    <div className="completitudine-legend">
                      <div className="legend-item"><span className="legend-dot" style={{ background: "var(--accent-green)" }} /><span className="li-num">{elements.filter(e => e.status === "confirmat").length}</span> Confirmate</div>
                      <div className="legend-item"><span className="legend-dot" style={{ background: "var(--accent-yellow)" }} /><span className="li-num">{elements.filter(e => e.status === "propus_ai").length}</span> Propuse AI</div>
                      <div className="legend-item"><span className="legend-dot" style={{ background: "var(--accent-red)" }} /><span className="li-num">{elements.filter(e => e.status === "gol").length}</span> Goale</div>
                    </div>
                  </div>

                  <div className="elemente-filter-bar">
                    <input className="elem-search" placeholder="Caută element..." value={elemSearch} onChange={e => setElemSearch(e.target.value)} />
                    <div className="fp-group">
                      <button className={`fp ${elemFilter === "all" ? "on" : ""}`} onClick={() => setElemFilter("all")}>Toate</button>
                      <button className={`fp ${elemFilter === "confirmat" ? "on-green" : ""}`} onClick={() => setElemFilter("confirmat")}>Confirmate</button>
                      <button className={`fp ${elemFilter === "propus_ai" ? "on-yellow" : ""}`} onClick={() => setElemFilter("propus_ai")}>Propuse AI</button>
                      <button className={`fp ${elemFilter === "gol" ? "on-red" : ""}`} onClick={() => setElemFilter("gol")}>Goale</button>
                    </div>
                  </div>

                  <div className="elemente-scroll">
                    {filteredElements.map(el => (
                      <div className={`elem-card ${selectedElement === el.id ? "active" : ""}`} key={el.id} onClick={() => setSelectedElement(el.id)}>
                        <div className="ec-top">
                          <span className="ec-key">{el.key}</span>
                          <span className={`ec-status ${el.status}`}>
                            {el.status === "confirmat" ? "✓ Confirmat" : el.status === "propus_ai" ? "AI Propus" : "Gol"}
                          </span>
                        </div>
                        <div className="ec-label">{el.label}</div>
                        <div className={`ec-value ${!el.value ? "missing" : ""}`}>
                          {el.value || "— necompletat —"}
                        </div>
                        {el.sourceLabel && (
                          <div className="ec-source">
                            <span className={`source-dot ${el.source}`} />
                            {el.sourceLabel}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {selectedElement && (() => {
                  const el = elements.find(e => e.id === selectedElement);
                  if (!el) return null;
                  return (
                    <div className="elem-detail">
                      <div className="ed-header">Detalii element</div>
                      <div className="ed-field">
                        <div className="ed-label">Key</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-muted)" }}>{el.key}</div>
                      </div>
                      <div className="ed-field">
                        <div className="ed-label">Label</div>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>{el.label}</div>
                      </div>
                      <div className="ed-field">
                        <div className="ed-label">Status</div>
                        <span className={`ec-status ${el.status}`}>
                          {el.status === "confirmat" ? "✓ Confirmat" : el.status === "propus_ai" ? "AI Propus" : "Gol"}
                        </span>
                      </div>
                      <div className="ed-field">
                        <div className="ed-label">Valoare curentă</div>
                        <div className="ed-val">{el.value || "—"}</div>
                      </div>
                      {el.sourceLabel && (
                        <div className="ed-field">
                          <div className="ed-label">Sursă</div>
                          <div className="ec-source" style={{ fontSize: 13 }}>
                            <span className={`source-dot ${el.source}`} />
                            {el.sourceLabel}
                          </div>
                        </div>
                      )}
                      {el.templates.length > 0 && (
                        <div className="ed-field">
                          <div className="ed-label">Folosit în template-uri</div>
                          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                            {el.templates.join(", ")}
                          </div>
                        </div>
                      )}
                      {el.status === "propus_ai" && (
                        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                          <button className="ed-btn">✓ Confirmă</button>
                          <button className="ed-btn" style={{ borderColor: "var(--accent-yellow)", color: "var(--accent-yellow)" }}>&#9998; Editează</button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* CHECKLIST */}
            {activeLeaf === "checklist" && (
              <div className="checklist-panel">
                <div className="check-progress">
                  <div className="check-ring">
                    <svg width="80" height="80" viewBox="0 0 80 80">
                      <circle cx="40" cy="40" r="34" fill="none" stroke="var(--bg-deep)" strokeWidth="6" />
                      <circle cx="40" cy="40" r="34" fill="none" stroke="var(--accent-green)" strokeWidth="6"
                        strokeDasharray={`${2 * Math.PI * 34}`}
                        strokeDashoffset={`${2 * Math.PI * 34 * (1 - (checkTotal > 0 ? checkDone / checkTotal : 0))}`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="check-ring-text">{pct(checkDone, checkTotal)}%</div>
                  </div>
                  <div className="check-info">
                    <div className="ci-title">{checkDone} din {checkTotal} documente bifate</div>
                    <div className="ci-sub">Documente necesare pentru dosarul de finanțare</div>
                  </div>
                </div>

                {checkCategories.map(cat => {
                  const catItems = checklistItems.filter(i => i.category === cat);
                  const catDone = catItems.filter(i => i.done).length;
                  const isCollapsed = collapsedCats[cat];

                  return (
                    <div className="check-category" key={cat}>
                      <div className="check-cat-header" onClick={() => setCollapsedCats(c => ({ ...c, [cat]: !c[cat] }))}>
                        <span style={{ fontSize: 10, transition: "transform .15s", transform: isCollapsed ? "none" : "rotate(90deg)" }}>&#9654;</span>
                        {cat}
                        <span className="check-cat-count">{catDone}/{catItems.length}</span>
                      </div>
                      {!isCollapsed && catItems.map(item => (
                        <div className="check-item" key={item.id}>
                          <div className={`check-box ${item.done ? "done" : ""}`}
                            onClick={() => handleChecklistToggle(item)}>
                            {item.done && "✓"}
                          </div>
                          <span className={`check-name ${item.done ? "done-text" : ""}`}>{item.name}</span>
                          <span className={`check-source-badge ${item.source}`}>{item.source}</span>
                          {item.templateName && (
                            <span className="check-template" onClick={() => setActiveLeaf("neemia")}>
                              &#128196; {item.templateName}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

            {/* SOLOMON CHAT */}
            {activeLeaf === "solomon" && (
              <div className="solomon-layout">
                {/* Chat area */}
                <div className="solomon-chat">
                  {/* Toolbar */}
                  <div className="solomon-toolbar">
                    <div className="solomon-avatar">S</div>
                    <div className="solomon-name-block">
                      <div className="sn-name">Solomon</div>
                      <div className="sn-status"><span className="sn-status-dot" /> Activ &middot; Agent colectare date</div>
                    </div>
                    <div className="model-selector">
                      <button className={`model-btn ${solomonModel === "sonnet" ? "active" : ""}`} onClick={() => setSolomonModel("sonnet")}>Sonnet</button>
                      <button className={`model-btn ${solomonModel === "opus" ? "active" : ""}`} onClick={() => setSolomonModel("opus")}>Opus</button>
                    </div>
                    <button className={`et-toggle ${solomonET ? "on" : ""}`} onClick={() => setSolomonET(!solomonET)}>
                      &#10024; ET
                    </button>
                  </div>

                  {/* Messages */}
                  <div className="chat-messages" ref={chatRef} onMouseUp={handleTextSelect}>
                    {solomonMessages.map((msg, msgIdx) => (
                      <div key={msgIdx}>
                        <div className={`chat-msg ${msg.role}`}>
                          {renderMsgText(msg.text)}
                          {msg.extractions && (
                            <div className="extraction-cards">
                              {msg.extractions.map((ext, extIdx) => {
                                const k = `${msgIdx}-${extIdx}`;
                                const state = extractionStates[k];
                                return (
                                  <div key={extIdx} className={`extraction-card ${state || ""}`}>
                                    <div className="exc-top">
                                      <span className="exc-label">{ext.label}</span>
                                      <span className="exc-confidence">{ext.confidence}%</span>
                                    </div>
                                    <div className="exc-value">{ext.value}</div>
                                    {!state ? (
                                      <div className="exc-actions">
                                        <button className="exc-btn confirm-btn" onClick={(e) => { e.stopPropagation(); handleConfirmExtraction(msgIdx, extIdx); }}>
                                          &#10003; Confirmă
                                        </button>
                                        <button className="exc-btn edit-btn" title="Editează înainte de confirmare">
                                          &#9998; Editează
                                        </button>
                                        <button className="exc-btn reject-btn" onClick={(e) => { e.stopPropagation(); handleRejectExtraction(msgIdx, extIdx); }}>
                                          &#10005; Respinge
                                        </button>
                                      </div>
                                    ) : state === "confirmed" ? (
                                      <div className="exc-confirmed-label">&#10003; Salvat în Elemente</div>
                                    ) : (
                                      <div style={{ fontSize: 11, color: "var(--accent-red)" }}>Respins</div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        {msg.role === "assistant" && (
                          <div className="chat-timestamp">
                            <div className="solomon-avatar" style={{ width: 20, height: 20, fontSize: 10, display: "inline-flex", verticalAlign: "middle", marginRight: 6 }}>S</div>
                            {new Date().toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        )}
                      </div>
                    ))}
                    {solomonSending && (
                      <div className="chat-msg assistant" style={{ opacity: 0.6 }}>
                        <span style={{ animation: "statusPulse 1s ease infinite" }}>Solomon se gândește...</span>
                      </div>
                    )}
                  </div>

                  {/* Input area */}
                  <div className="chat-input-area">
                    <div className="chat-input-row">
                      <button className="chat-btn upload-btn" title="Upload document">
                        &#128206;
                      </button>
                      <button className="chat-btn upload-btn" title="Paste snippet" style={{ fontSize: 12, fontWeight: 600, width: "auto", padding: "0 12px" }}>
                        &#128203;
                      </button>
                      <textarea
                        className="chat-input"
                        placeholder="Scrie detalii despre proiect, lipește date, sau întreabă..."
                        value={solomonInput}
                        rows={1}
                        onChange={e => {
                          setSolomonInput(e.target.value);
                          e.target.style.height = "auto";
                          e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                        }}
                        onKeyDown={e => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSolomonSend();
                            (e.target as HTMLTextAreaElement).style.height = "auto";
                          }
                        }}
                      />
                      <button className="chat-btn send" onClick={handleSolomonSend} disabled={solomonSending}>
                        &#10148;
                      </button>
                    </div>
                  </div>
                </div>

                {/* Elements panel */}
                <div className="solomon-elements-panel">
                  <div className="sep-header">
                    Elemente completate
                    <span className="sep-count">{solomonConfirmedCount}/{solomonElements.length}</span>
                  </div>
                  <div className="sep-scroll">
                    {solomonElements.map((el, i) => (
                      <div key={`${el.key}-${i}`} className={`sep-card ${el.status === "confirmat" ? "is-confirmed" : "is-proposed"}`}>
                        <div className="sep-card-label">{el.label}</div>
                        <div className="sep-card-value">{el.value}</div>
                        <div className="sep-card-source">
                          <span style={{ fontSize: 10 }}>&#128196;</span>
                          {el.source}
                        </div>
                        {el.status === "confirmat" ? (
                          <div className="sep-confirmed-badge">&#10003; Confirmat</div>
                        ) : (
                          <div className="sep-confirm-row">
                            <button className="sep-confirm-btn" onClick={() => handleConfirmElement(i)}>
                              &#10003; Confirmă
                            </button>
                            <button className="sep-reject-btn" onClick={() => handleRejectElement(i)}>
                              &#10005;
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Inline refine popup */}
            {refinePopup && (
              <div
                ref={popupRef}
                className="inline-refine-popup"
                style={{ left: Math.min(refinePopup.x, (typeof window !== "undefined" ? window.innerWidth : 1000) - 360), top: refinePopup.y }}
              >
                <div className="refine-selected-text">{refinePopup.text}</div>
                <div className="refine-input-row">
                  <input
                    className="refine-input"
                    placeholder="Ex: fă-l mai formal, adaugă detalii..."
                    value={refineInput}
                    onChange={e => setRefineInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleRefineSubmit()}
                    autoFocus
                  />
                  <button className="refine-submit" onClick={handleRefineSubmit}>Rescrie</button>
                </div>
              </div>
            )}

            {/* NEEMIA --- 3 PANE LAYOUT */}
            {activeLeaf === "neemia" && (
              <div className="neemia-layout">
                {/* Left: Templates list / Generated docs */}
                <div className="neemia-templates">
                  <h3>Documente generate</h3>
                  {neemiaDocs.length > 0 ? neemiaDocs.map((doc, i) => (
                    <div
                      key={doc.id}
                      className={`template-card ${neemiaActiveTemplate === i ? "active" : ""}`}
                      onClick={() => handleNeemiaTemplateClick(i)}
                    >
                      <div className="tc-name">
                        {doc.name}
                        <span className="tc-badge">{doc.type || "DOCX"}</span>
                      </div>
                      <div className="tc-info">{doc.status}</div>
                    </div>
                  )) : (
                    <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                      Niciun document generat încă.
                    </div>
                  )}
                  <button
                    className="sa-btn primary"
                    style={{ marginTop: 12, width: "100%", justifyContent: "center" }}
                    onClick={handleNeemiaGenerate}
                  >
                    &#128196; Generează documente
                  </button>
                </div>

                {/* Center + Right: Doc preview + Fields */}
                <div className="neemia-doc-view">
                  {neemiaDocs.length > 0 ? (
                    <>
                      <div className="neemia-page-nav">
                        <span className="nav-label">{neemiaDocs[neemiaActiveTemplate]?.name || "Document"}</span>
                        <button className="download-btn">
                          &#8595; Descarcă
                        </button>
                      </div>

                      <div className="neemia-preview-area">
                        <div className="neemia-doc-preview">
                          <div className="doc-page" key={neemiaAnimKey}>
                            <div className="doc-header-label">DOCUMENT OFICIAL &middot; GENERARE AUTOMATĂ</div>
                            <div className="doc-page-title">{neemiaDocs[neemiaActiveTemplate]?.name || "Document"}</div>
                            <div style={{ fontSize: 13, color: "#555", lineHeight: 1.8 }}>
                              Documentul a fost generat automat pe baza elementelor completate în proiect.
                            </div>
                            <div className="doc-page-number">Generat</div>
                          </div>
                        </div>
                        <div className="neemia-fields-panel">
                          <h3>Elemente utilizate</h3>
                          {elements.filter(e => e.value).slice(0, 8).map((el, fi) => (
                            <div className="field-card" key={fi}>
                              <div className="field-name">{el.label}</div>
                              <div className={`field-val ${!el.value ? "missing" : ""}`}>
                                {el.value || "Lipsă ⚠"}
                              </div>
                              {el.sourceLabel && (
                                <div className="field-source">
                                  <span className={`source-dot ${el.source}`} />
                                  {el.sourceLabel}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="neemia-empty">
                      <div className="ne-icon">&#128196;</div>
                      <div className="ne-label">Niciun document generat</div>
                      <div className="ne-desc">Apasă &ldquo;Generează documente&rdquo; pentru a crea documentele proiectului</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
