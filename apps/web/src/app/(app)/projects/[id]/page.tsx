"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { getCaenDescription } from "@/lib/caen";
import { useToast } from "@/components/shared/Toast";
import { useSSE } from "@/hooks/useSSE";

const API_URL = "";

type SolomonMessage = {
  role: "user" | "assistant";
  text: string;
  extractions: Array<{ key: string; label: string; value: string; confidence: number }> | null;
};

type SolomonElement = {
  key: string; label: string; value: string; source: string; status: "confirmat" | "propus";
};

type TemplateField = { key: string; name: string; value: string | null; source: string | null; confirmed: boolean; fieldType: string; group: string | null };
type TemplatePage = { num: number; title: string; status: "complete" | "partial" | "empty"; fields: TemplateField[]; totalFields: number; filledFields: number; confirmedFields: number };

type ComposeSection = {
  marker: string;
  type: "narrative" | "table" | "calculation";
  label: string;
  content?: string;
  tableData?: {
    headers: Array<{ key: string; label: string }>;
    rows: Array<Record<string, any>>;
    highlightRows?: number[];
    footerRow?: Record<string, any>;
    caption?: string;
    headerColor?: string;
  };
  approved: boolean;
};

type NeemiaTemplate = {
  id: string;
  name: string;
  type: string;
  pages: TemplatePage[];
  totalFields: number;
  filledFields: number;
  templateDocumentId: string;
  status: string;
  downloadUrl: string | null;
  generationMode?: "fill" | "compose";
  composeSections?: ComposeSection[];
};

type EligibilityRule = {
  id: string;
  ruleId?: string;
  name: string;
  status: "pass" | "fail" | "pending";
  detail: string;
  type: "fixed" | "interpreted";
  confidence?: number;
  page?: number;
  section?: string;
  category?: string;
  needsReview?: boolean;
  sourceDocument?: { id: string; name: string; fileType: string } | null;
  hasReferenceData?: boolean;
  referenceTableNames?: string[];
};

type GuideRule = {
  id: string;
  type: "fixed" | "interpreted";
  text: string;
  confidence: number;
  page: number;
  section: string;
  category: string;
  sourceText: string | null;
  condition: any;
  validated: boolean;
  needsReview: boolean;
  sourceDocument: { id: string; name: string; fileType: string } | null;
};

type ElementItem = {
  id: string;
  key: string;
  label: string;
  value: string | null;
  status: "confirmat" | "propus_ai" | "gol";
  confidence: number;
  source: string | null;
  sourceLabel: string | null;
  templates: string[];
};

type ChecklistItem = {
  id: string;
  name: string;
  category: string;
  source: string;
  templateId: string | null;
  templateName: string | null;
  done: boolean;
  notes: string | null;
};

type ProjectData = {
  id: string;
  name: string;
  status: string;
  valoare: string | null;
  company: {
    id: string;
    cui: string;
    denumire: string;
    formaJuridica: string;
    caen: string;
    adresa: string;
    capitalSocial?: string;
    cifraAfaceri?: string;
    onrcRawData?: any;
  } | null;
  programPath: { program: string; masura: string; sesiune: string };
  elements: any[];
  eligibility: any[];
  generatedDocs: any[];
  checklist: any[];
  // Program metadata (collected by Solomon)
  programFinantare: string | null;
  codMasura: string | null;
  codSesiune: string | null;
  codNomenclator: string | null;
  prefixDocumente: string | null;
  codMysmis: string | null;
  structuraDosar: string | null;
};

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "Ciornă", color: "#64748b", bg: "#f0f2f5" },
  in_progress: { label: "În lucru", color: "#2563eb", bg: "#eff6ff" },
  review: { label: "Verificare", color: "#d97706", bg: "#fffbeb" },
  submitted: { label: "Depus", color: "#059669", bg: "#ecfdf5" },
};

const pct = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0;
const formatRON = (v: number | null | undefined) => v != null ? `${Number(v).toLocaleString("ro-RO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} RON` : "-";

type LeafType = "sumar" | "eligibilitate" | "ghid" | "solomon" | "elemente" | "checklist" | "neemia";

function parseAdresa(adresa: string | undefined): { localitate: string; judet: string } {
  if (!adresa) return { localitate: "-", judet: "-" };
  const parts = adresa.split(",").map(s => s.trim());
  if (parts.length >= 2) {
    return { localitate: parts[parts.length - 2] || parts[0], judet: parts[parts.length - 1] };
  }
  return { localitate: adresa, judet: "-" };
}

function mapEligibilityRules(flat: any[]): EligibilityRule[] {
  return flat.map(item => {
    const conf = parseFloat(item.rule?.confidence) || item.confidence;
    return {
      id: item.id,
      ruleId: item.ruleId || item.rule?.id,
      name: item.rule?.description || "Regulă necunoscută",
      status: item.status === "passed" ? "pass" : item.status === "failed" ? "fail" : "pending",
      detail: item.detail || "",
      type: item.rule?.type || "fixed",
      confidence: conf,
      page: item.rule?.sourcePage ?? item.rule?.page,
      section: item.rule?.section,
      category: item.rule?.category || "",
      needsReview: item.rule?.needsReview ?? (conf != null && conf < 0.85),
      sourceDocument: item.rule?.sourceDocument || null,
    };
  });
}

function mapGuideRules(grouped: any[]): GuideRule[] {
  const rules: GuideRule[] = [];
  for (const group of grouped) {
    for (const item of group.rules || []) {
      rules.push({
        id: item.id,
        type: item.rule?.type || "fixed",
        text: item.rule?.description || "",
        confidence: parseFloat(item.rule?.confidence) || 0.5,
        page: item.rule?.sourcePage ?? item.rule?.page ?? 0,
        section: item.rule?.category || "",
        category: item.rule?.category || "",
        sourceText: item.rule?.sourceText || null,
        condition: item.rule?.condition || null,
        validated: item.rule?.validated ?? false,
        needsReview: item.rule?.needsReview ?? (parseFloat(item.rule?.confidence) < 0.85),
        sourceDocument: item.rule?.sourceDocument || group.document || null,
      });
    }
  }
  return rules;
}

function mapElements(elements: any[]): ElementItem[] {
  return elements.map(el => {
    const confirmed = el.confirmed;
    const hasValue = !!el.value;
    let status: "confirmat" | "propus_ai" | "gol" = "gol";
    if (confirmed) status = "confirmat";
    else if (hasValue) status = "propus_ai";

    const sourceMap: Record<string, string> = {
      onrc: "Date ONRC",
      onrc_auto: "ONRC (auto)",
      anaf_auto: "ANAF (auto)",
      manual: "Completare manuală",
      consultant_manual: "Consultant",
      solomon: "Solomon",
      solomon_chat: "Solomon Chat",
      document: "Document uploadat",
      document_extracted: "Extras din document",
      calculated: "Calculat automat",
      derived: "Derivat",
      ghid: "Ghid finanțare",
    };

    // Resolve key/label: prefer elementDefinition (new anchor), fallback to templateElement
    const elemDef = el.elementDefinition;
    const tmplEl = el.templateElement;
    const key = elemDef?.elementKey || tmplEl?.key || el.elementDefId || el.templateElementId || el.id;
    const label = elemDef?.displayName || tmplEl?.label || key;

    // Format value for display: JSON objects/arrays should be shown readable
    let displayValue = el.value;
    if (displayValue && typeof displayValue === "string") {
      try {
        const parsed = JSON.parse(displayValue);
        if (Array.isArray(parsed)) {
          displayValue = parsed.map((item: any) =>
            typeof item === "object" ? Object.values(item).filter(Boolean).join(", ") : String(item)
          ).join("; ");
        } else if (typeof parsed === "object" && parsed !== null) {
          displayValue = Object.entries(parsed)
            .filter(([, v]) => v != null)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ");
        }
      } catch {
        // Not JSON — keep as is
      }
    }

    return {
      id: el.id,
      key,
      label,
      value: displayValue,
      status,
      confidence: confirmed ? 100 : hasValue ? 85 : 0,
      source: el.source,
      sourceLabel: sourceMap[el.source] || el.source || null,
      templates: [],
    };
  });
}

function mapChecklist(items: any[]): ChecklistItem[] {
  return items.map(item => ({
    id: item.id,
    name: item.name,
    category: item.category || "General",
    source: item.source || "manual",
    templateId: item.templateId || null,
    templateName: item.templateName || null,
    done: item.done,
    notes: item.notes || null,
  }));
}

export default function ProjectViewPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectData | null>(null);
  const [eligibilityRules, setEligibilityRules] = useState<EligibilityRule[]>([]);
  const [guideRules, setGuideRules] = useState<GuideRule[]>([]);
  const [elements, setElements] = useState<ElementItem[]>([]);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [neemiaTemplates, setNeemiaTemplates] = useState<NeemiaTemplate[]>([]);

  const { toast } = useToast();

  // F5.2: SSE live update — auto-refresh elements when backend pushes updates
  useSSE({
    projectId,
    enabled: !loading,
    onEvent: useCallback((evt: { event: string; data: any }) => {
      if (evt.event === "elements_updated" || evt.event === "element_validated" || evt.event === "extraction_complete") {
        apiGet<any>(`/api/projects/${projectId}`).then(proj => {
          setElements(mapElements(proj.elements || []));
        }).catch(() => {});
      }
      if (evt.event === "eligibility_updated") {
        apiGet<any>(`/api/projects/${projectId}/eligibility`).then(eligData => {
          setEligibilityRules(mapEligibilityRules(eligData.flat || []));
        }).catch(() => {});
      }
      if (evt.event === "score_updated") {
        apiGet<any>(`/api/projects/${projectId}/scores`)
          .then(setProjectScores)
          .catch(console.error);
      }
      if (evt.event === "checklist_updated") {
        // Re-fetch checklist when backend auto-matches an item
        apiGet<any>(`/api/projects/${projectId}`).then(proj => {
          setChecklistItems(mapChecklist(proj.checklist || []));
        }).catch(() => {});
      }
    }, [projectId]),
  });

  const [activeLeaf, setActiveLeaf] = useState<LeafType>("sumar");
  const [branches, setBranches] = useState<Record<string, boolean>>({ scriere: true, implementare: false, monitorizare: false });
  const [selectedRule, setSelectedRule] = useState<string | null>(null);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [elementConstraints, setElementConstraints] = useState<any[]>([]);
  const [elemFilter, setElemFilter] = useState("all");
  const [elemSearch, setElemSearch] = useState("");
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [editingElementValue, setEditingElementValue] = useState("");
  const [ghidTab, setGhidTab] = useState<"reguli" | "ghid" | "anexe">("reguli");
  const [referenceTables, setReferenceTables] = useState<any[]>([]);
  const [selectedRefTable, setSelectedRefTable] = useState<string | null>(null);
  const [refTablesLoading, setRefTablesLoading] = useState(false);
  const [ghidCategoryFilter, setGhidCategoryFilter] = useState<string>("all");
  const [ghidViewerData, setGhidViewerData] = useState<{
    guides: Array<{
      id: string; name: string; fileType: string; pageCount: number | null;
      status: string; downloadUrl: string | null; totalRules: number; totalScoring: number;
      rules: any[]; scoringCriteria: any[]; rulesByPage: Record<string, any[]>;
    }>;
  } | null>(null);
  const [ghidViewerLoading, setGhidViewerLoading] = useState(false);
  const [ghidViewerPage, setGhidViewerPage] = useState(1);
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});
  const [checkAddOpen, setCheckAddOpen] = useState(false);
  const [checkNewName, setCheckNewName] = useState("");
  const [checkNewCat, setCheckNewCat] = useState("");
  const [checkActionId, setCheckActionId] = useState<string | null>(null);
  const [checkMapOpen, setCheckMapOpen] = useState<string | null>(null);

  const [solomonModel, setSolomonModel] = useState<"sonnet" | "opus">("sonnet");
  const [solomonET, setSolomonET] = useState(false);
  const [solomonMessages, setSolomonMessages] = useState<SolomonMessage[]>([]);
  const [solomonInput, setSolomonInput] = useState("");
  const [solomonElements, setSolomonElements] = useState<SolomonElement[]>([]);
  const [solomonConvId, setSolomonConvId] = useState<string | null>(null);
  const [solomonStreaming, setSolomonStreaming] = useState(false);
  const [extractionStates, setExtractionStates] = useState<Record<string, "confirmed" | "rejected">>({});
  const [extractionValidations, setExtractionValidations] = useState<Record<string, any>>({});
  const [editingExtraction, setEditingExtraction] = useState<string | null>(null);
  const [editingExtractionValue, setEditingExtractionValue] = useState("");
  const [refinePopup, setRefinePopup] = useState<{ text: string; x: number; y: number } | null>(null);
  const [refineInput, setRefineInput] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const [solomonAutoScroll, setSolomonAutoScroll] = useState(true);
  const popupRef = useRef<HTMLDivElement>(null);
  const solomonFileRef = useRef<HTMLInputElement>(null);
  const solomonAbortRef = useRef<AbortController | null>(null);
  const [solomonDragOver, setSolomonDragOver] = useState(false);
  const [solomonTimedOut, setSolomonTimedOut] = useState(false);
  const solomonTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [recheckLoading, setRecheckLoading] = useState(false);

  // GAP 1: Project scores
  const [projectScores, setProjectScores] = useState<{ scores: any[]; totalPoints: number; maxTotalPoints: number; percentage: number } | null>(null);
  // GAP 2: Budget validation
  const [budgetValidation, setBudgetValidation] = useState<{ results: any[]; summary: any } | null>(null);
  // GAP 8: Learnings
  const [learnings, setLearnings] = useState<any | null>(null);
  const [cabinetBranding, setCabinetBranding] = useState<{ fontFamily?: string; primaryColor?: string; footerText?: string } | null>(null);

  const [neemiaActiveTemplate, setNeemiaActiveTemplate] = useState(0);
  const [neemiaActivePage, setNeemiaActivePage] = useState(0);
  const [neemiaAnimKey, setNeemiaAnimKey] = useState(0);
  const [neemiaGenerating, setNeemiaGenerating] = useState(false);
  const [neemiaSplitWidth, setNeemiaSplitWidth] = useState(380);
  const neemiaSplitDragging = useRef(false);
  const neemiaSplitRef = useRef<HTMLDivElement>(null);

  // COMPOSE mode state
  const [composePreviewSections, setComposePreviewSections] = useState<ComposeSection[]>([]);
  const [composePreviewing, setComposePreviewing] = useState(false);
  const [composeEditing, setComposeEditing] = useState<number | null>(null); // index of section being edited
  const [composeEditText, setComposeEditText] = useState("");
  const [composeModel, setComposeModel] = useState("");

  // Versioning state
  const [neemiaVersions, setNeemiaVersions] = useState<any[]>([]);
  const [neemiaVersionsOpen, setNeemiaVersionsOpen] = useState<string | null>(null); // templateDocumentId

  // Drag handler for Neemia split pane
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!neemiaSplitDragging.current || !neemiaSplitRef.current) return;
      const rect = neemiaSplitRef.current.getBoundingClientRect();
      const newWidth = Math.min(Math.max(e.clientX - rect.left, 260), 600);
      setNeemiaSplitWidth(newWidth);
    };
    const onMouseUp = () => { neemiaSplitDragging.current = false; document.body.style.cursor = ""; document.body.style.userSelect = ""; };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => { document.removeEventListener("mousemove", onMouseMove); document.removeEventListener("mouseup", onMouseUp); };
  }, []);

  const [neemiaGenStatus, setNeemiaGenStatus] = useState<string | null>(null);
  const [neemiaGenProgress, setNeemiaGenProgress] = useState<number>(0); // 0-100 for progress bar
  const [neemiaValidation, setNeemiaValidation] = useState<{ warnings: string[]; stats?: any; sectionReadiness?: Array<{ sectionId: string; sectionTitle: string; requiredComplete: number; requiredTotal: number; requiredMissing: string[]; optionalComplete: number; optionalTotal: number; readiness: number; qualityLevel: "full" | "partial" | "minimal" }> } | null>(null);
  // GAP 3: Consistency check
  const [consistencyResult, setConsistencyResult] = useState<{ consistent: boolean; conflicts: any[] } | null>(null);
  const [consistencyLoading, setConsistencyLoading] = useState(false);
  const [neemiaBulkGenerating, setNeemiaBulkGenerating] = useState(false);

  // ─── LOCK STATE ───
  const [lockOwned, setLockOwned] = useState(false);
  const [lockError, setLockError] = useState<{ lockedByName: string; lockedAt: string } | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Acquire lock on mount, release on unmount
  useEffect(() => {
    let cancelled = false;

    async function acquireLock() {
      try {
        const res = await apiPost<any>(`/api/projects/${projectId}/lock`, {});
        if (!cancelled) {
          setLockOwned(true);
          setLockError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          // Parse lock error from response
          try {
            const msg = err.message || "";
            if (msg.includes("blocat")) {
              // Fetch lock info
              const lockInfo = await apiGet<any>(`/api/projects/${projectId}/lock`);
              setLockError({ lockedByName: lockInfo.lockedByName || "Alt utilizator", lockedAt: lockInfo.lockedAt || "" });
            }
          } catch {
            setLockError({ lockedByName: "Alt utilizator", lockedAt: "" });
          }
          setLockOwned(false);
        }
      }
    }

    acquireLock();

    // Heartbeat every 5 minutes
    heartbeatRef.current = setInterval(async () => {
      if (!cancelled) {
        try {
          await apiPost(`/api/projects/${projectId}/lock/heartbeat`, {});
        } catch {
          // Lock lost
          setLockOwned(false);
        }
      }
    }, 5 * 60 * 1000);

    // Release lock on unmount / navigation
    const releaseLock = () => {
      const token = typeof window !== "undefined" ? localStorage.getItem("df-token") || "" : "";
      // Use sendBeacon with a Blob for beforeunload reliability (no auth header but server can identify via cookie)
      // Fall back to fetch with keepalive for normal unmount
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify({ token })], { type: "application/json" });
        navigator.sendBeacon(`${API_URL}/api/projects/${projectId}/lock/release`, blob);
      }
      // Also try fetch with keepalive as backup (works in normal unmount, may not in beforeunload)
      fetch(`${API_URL}/api/projects/${projectId}/lock`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        keepalive: true,
      }).catch(() => {});
    };

    window.addEventListener("beforeunload", releaseLock);

    return () => {
      cancelled = true;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      window.removeEventListener("beforeunload", releaseLock);
      releaseLock();
    };
  }, [projectId]);

  // Read-only mode when lock is not owned
  const readOnly = !lockOwned;

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);

        // Fetch project with retry (project may still be processing post-creation steps)
        let proj: any = null;
        console.log("[project-view] Loading project:", projectId);
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            proj = await apiGet<any>(`/api/projects/${projectId}`);
            break;
          } catch (err: any) {
            console.warn(`[project-view] Attempt ${attempt + 1} failed:`, err?.message);
            if (attempt < 2) {
              await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
            } else {
              throw err;
            }
          }
        }

        const [eligData, checkData, neemiaDocs] = await Promise.all([
          apiGet<any>(`/api/projects/${projectId}/eligibility`).catch(() => ({ flat: [], grouped: [], summary: {} })),
          apiGet<any>(`/api/projects/${projectId}/checklist`).catch(() => ({ items: [], grouped: {}, summary: {} })),
          apiGet<any[]>(`/api/neemia/projects/${projectId}/documents`).catch(() => []),
        ]);

        setProject(proj);
        setEligibilityRules(mapEligibilityRules(eligData.flat || []));
        setGuideRules(mapGuideRules(eligData.grouped || []));
        setElements(mapElements(proj.elements || []));
        setChecklistItems(mapChecklist(checkData.items || proj.checklist || []));

        // Load reference tables for the organization
        apiGet<any[]>("/api/reference/tables").then(tables => setReferenceTables(tables || [])).catch(() => {});

        // Enrich eligibility rules with reference data sources
        const eligRules = mapEligibilityRules(eligData.flat || []);
        Promise.all(
          eligRules.filter(r => r.ruleId).map(r =>
            apiGet<any[]>(`/api/reference/rules/${r.ruleId}/reference-links`).catch(() => [])
          )
        ).then(results => {
          const enriched = eligRules.map((r, i) => {
            const links = results[i] || [];
            return {
              ...r,
              hasReferenceData: links.length > 0,
              referenceTableNames: links.map((l: any) => l.referenceTable?.name).filter(Boolean),
            };
          });
          setEligibilityRules(enriched);
        }).catch(() => {});

        const neemiaMapped: NeemiaTemplate[] = (neemiaDocs || []).map((doc: any) => ({
          id: doc.id,
          name: doc.templateName || "Document",
          type: (doc.templateFileType || "DOCX").toUpperCase(),
          pages: [],
          totalFields: 0,
          filledFields: 0,
          templateDocumentId: doc.templateDocumentId,
          status: doc.status,
          downloadUrl: doc.downloadUrl || null,
          generationMode: doc.generationMode || "fill",
          composeSections: doc.composeContent?.sections || undefined,
        }));
        setNeemiaTemplates(neemiaMapped);

        // GAP 1+2+8: Load scores, budget validation, learnings, branding in parallel (non-blocking)
        apiGet<any>(`/api/projects/${projectId}/scores`).then(setProjectScores).catch(() => {});
        apiGet<any>(`/api/projects/${projectId}/budget-validation`).then(setBudgetValidation).catch(() => {});
        apiGet<any>(`/api/projects/${projectId}/learnings`).then(setLearnings).catch(() => {});
        // FIX 8: Load cabinet branding for document preview
        apiGet<any>(`/api/config/branding`).then(setCabinetBranding).catch(() => {});
      } catch (err: any) {
        console.error("Failed to load project:", err);
        setLoadError(err?.message || "Eroare la încărcarea proiectului");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [projectId]);

  // Lazy-load ghid-viewer data when "Ghid complet" tab is selected
  useEffect(() => {
    if (ghidTab !== "ghid" || ghidViewerData || ghidViewerLoading) return;
    setGhidViewerLoading(true);
    apiGet<any>(`/api/projects/${projectId}/ghid-viewer`)
      .then(data => { setGhidViewerData(data); setGhidViewerPage(1); })
      .catch(() => {})
      .finally(() => setGhidViewerLoading(false));
  }, [ghidTab, projectId, ghidViewerData, ghidViewerLoading]);

  useEffect(() => {
    if (solomonAutoScroll && chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [solomonMessages, solomonAutoScroll]);

  const handleChatScroll = () => {
    const el = chatRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    setSolomonAutoScroll(atBottom);
  };

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) setRefinePopup(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    if (activeLeaf === "solomon" && !solomonConvId) {
      initSolomonConversation();
    }
  }, [activeLeaf]);

  async function initSolomonConversation() {
    try {
      const convs = await apiGet<any[]>(`/api/solomon/projects/${projectId}/conversations`);
      if (convs && convs.length > 0) {
        const conv = convs[0];
        setSolomonConvId(conv.id);
        // Ensure conversation uses Sonnet by default
        apiPut(`/api/solomon/conversations/${conv.id}/model`, { model: "claude-sonnet-4-20250514" }).catch(() => {});
        const msgs = await apiGet<any[]>(`/api/solomon/conversations/${conv.id}/messages`);
        setSolomonMessages((msgs || []).map((m: any) => ({
          role: m.role as "user" | "assistant",
          text: m.content || "",
          extractions: m.extractions ? (typeof m.extractions === "string" ? JSON.parse(m.extractions) : m.extractions) : null,
        })));
        const elems: SolomonElement[] = [];
        for (const m of (msgs || [])) {
          if (m.extractions) {
            const exts = typeof m.extractions === "string" ? JSON.parse(m.extractions) : m.extractions;
            for (const ext of exts) {
              elems.push({ key: ext.key, label: ext.label, value: ext.value, source: "Solomon", status: "propus" });
            }
          }
        }
        setSolomonElements(elems);
      } else {
        const newConv = await apiPost<any>(`/api/solomon/projects/${projectId}/conversations`, {});
        setSolomonConvId(newConv.id);
        // Display auto-greeting from Solomon with program context
        if (newConv.greeting) {
          setSolomonMessages([{ role: "assistant", text: newConv.greeting, extractions: [] }]);
        }
      }
    } catch (err) {
      console.error("Failed to init Solomon conversation:", err);
    }
  }

  async function handleSolomonModelChange(model: "sonnet" | "opus") {
    setSolomonModel(model);
    if (solomonConvId) {
      const modelId = model === "opus" ? "claude-opus-4-6" : "claude-sonnet-4-20250514";
      try {
        await apiPut(`/api/solomon/conversations/${solomonConvId}/model`, { model: modelId });
      } catch {}
    }
  }

  // Detect if user is requesting Opus-level processing
  const needsOpus = (text: string): boolean => {
    const lower = text.toLowerCase();
    const opusPatterns = [
      /\bopus\b/, /\bnevoie de opus\b/, /\bfoloseste opus\b/, /\bfolosește opus\b/,
      /\bcu opus\b/, /\btreci pe opus\b/, /\bmodel opus\b/, /\banaliz[aă] complex[aă]\b/,
      /\banaliz[aă] detaliat[aă]\b/, /\banaliz[aă] aprofundat[aă]\b/,
      /\bgândește mai profund\b/, /\bgandeste mai profund\b/,
      /\bextended thinking\b/, /\bthinking extins\b/,
    ];
    return opusPatterns.some(p => p.test(lower));
  };

  const handleSolomonSend = async () => {
    if (readOnly || !solomonInput.trim() || !solomonConvId || solomonStreaming) return;
    const userText = solomonInput;
    setSolomonMessages(prev => [...prev, { role: "user", text: userText, extractions: null }]);
    setSolomonInput("");
    setTimeout(() => (document.querySelector("[data-solomon-input]") as HTMLTextAreaElement)?.focus(), 50);
    setSolomonAutoScroll(true);
    setSolomonStreaming(true);
    setSolomonTimedOut(false);

    // Auto-detect Opus requests — temporarily upgrade model for this message
    const requestedOpus = needsOpus(userText);
    let useET = solomonET;
    if (requestedOpus && solomonModel !== "opus") {
      await handleSolomonModelChange("opus");
      useET = true; // Opus benefits from ET
    }

    // F6.1: Start a 60s timeout — if no data arrives, show warning
    if (solomonTimeoutRef.current) clearTimeout(solomonTimeoutRef.current);
    solomonTimeoutRef.current = setTimeout(() => setSolomonTimedOut(true), requestedOpus ? 120000 : 60000);

    try {
      const abortCtrl = new AbortController();
      solomonAbortRef.current = abortCtrl;
      const token = typeof window !== "undefined" ? localStorage.getItem("df-token") : null;
      const res = await fetch(`${API_URL}/api/solomon/conversations/${solomonConvId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content: userText, useET }),
        signal: abortCtrl.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let assistantText = "";
      let assistantExtractions: Array<{ key: string; label: string; value: string; confidence: number }> | null = null;
      let buffer = "";

      setSolomonMessages(prev => [...prev, { role: "assistant", text: "", extractions: null }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // F6.1: Reset timeout on each data chunk
        if (solomonTimeoutRef.current) clearTimeout(solomonTimeoutRef.current);
        solomonTimeoutRef.current = setTimeout(() => setSolomonTimedOut(true), 60000);
        setSolomonTimedOut(false);

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === "[DONE]") continue;
          try {
            const evt = JSON.parse(jsonStr);
            if (evt.type === "text") {
              assistantText += evt.text;
              setSolomonMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", text: assistantText, extractions: assistantExtractions };
                return updated;
              });
            } else if (evt.type === "elements_extracted") {
              assistantExtractions = evt.elements || [];
              setSolomonMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", text: assistantText, extractions: assistantExtractions };
                return updated;
              });
              for (const ext of (evt.elements || [])) {
                setSolomonElements(prev => {
                  const exists = prev.some(e => e.key === ext.key);
                  if (exists) return prev.map(e => e.key === ext.key ? { ...e, value: ext.value, status: "propus" as const } : e);
                  return [{ key: ext.key, label: ext.label, value: ext.value, source: "Solomon", status: "propus" as const }, ...prev];
                });
              }
              // Refresh elements from DB — Solomon backend already saved these values
              apiGet<any>(`/api/projects/${projectId}`).then(proj => {
                setElements(mapElements(proj.elements || []));
              }).catch(() => {});
            } else if (evt.type === "metadata_updated" && evt.metadata) {
              // Solomon confirmed program metadata — update project state
              setProject(prev => prev ? {
                ...prev,
                programFinantare: evt.metadata.programFinantare || prev.programFinantare,
                codMasura: evt.metadata.codMasura || prev.codMasura,
                codSesiune: evt.metadata.codSesiune || prev.codSesiune,
                codNomenclator: evt.metadata.codNomenclator || prev.codNomenclator,
                prefixDocumente: evt.metadata.prefixDocumente || prev.prefixDocumente,
                codMysmis: evt.metadata.codMysmis || prev.codMysmis,
                structuraDosar: evt.metadata.structuraDosar || prev.structuraDosar,
              } : prev);
            }
          } catch {}
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        // User stopped streaming — keep partial text visible
      } else {
        console.error("Solomon SSE error:", err);
        toast("error", err.message || "Eroare la comunicarea cu Solomon.");
        setSolomonMessages(prev => {
          if (prev.length > 0 && prev[prev.length - 1].role === "assistant" && prev[prev.length - 1].text === "") {
            return prev.slice(0, -1);
          }
          return prev;
        });
      }
    } finally {
      solomonAbortRef.current = null;
      setSolomonStreaming(false);
      setSolomonTimedOut(false);
      if (solomonTimeoutRef.current) clearTimeout(solomonTimeoutRef.current);
      // Revert to Sonnet after Opus one-shot
      if (requestedOpus) {
        handleSolomonModelChange("sonnet");
      }
    }
  };

  const handleSolomonStop = () => {
    if (solomonAbortRef.current) {
      solomonAbortRef.current.abort();
    }
  };

  const handleSolomonUpload = async (file: File) => {
    if (readOnly || !solomonConvId || solomonStreaming) return;
    setSolomonMessages(prev => [...prev, { role: "user", text: `📎 ${file.name}`, extractions: null }]);
    setSolomonStreaming(true);

    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("df-token") : null;
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_URL}/api/solomon/conversations/${solomonConvId}/upload`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let assistantText = "";
      let assistantExtractions: Array<{ key: string; label: string; value: string; confidence: number }> | null = null;
      let buffer = "";

      setSolomonMessages(prev => [...prev, { role: "assistant", text: "", extractions: null }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === "[DONE]") continue;
          try {
            const evt = JSON.parse(jsonStr);
            if (evt.type === "text") {
              assistantText += evt.text;
              setSolomonMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", text: assistantText, extractions: assistantExtractions };
                return updated;
              });
            } else if (evt.type === "elements_extracted") {
              assistantExtractions = evt.elements || [];
              setSolomonMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", text: assistantText, extractions: assistantExtractions };
                return updated;
              });
              for (const ext of (evt.elements || [])) {
                setSolomonElements(prev => {
                  const exists = prev.some(e => e.key === ext.key);
                  if (exists) return prev.map(e => e.key === ext.key ? { ...e, value: ext.value, status: "propus" as const } : e);
                  return [{ key: ext.key, label: ext.label, value: ext.value, source: "Solomon", status: "propus" as const }, ...prev];
                });
              }
              apiGet<any>(`/api/projects/${projectId}`).then(proj => {
                setElements(mapElements(proj.elements || []));
              }).catch(() => {});
            } else if (evt.type === "metadata_updated" && evt.metadata) {
              setProject(prev => prev ? {
                ...prev,
                programFinantare: evt.metadata.programFinantare || prev.programFinantare,
                codMasura: evt.metadata.codMasura || prev.codMasura,
                codSesiune: evt.metadata.codSesiune || prev.codSesiune,
                codNomenclator: evt.metadata.codNomenclator || prev.codNomenclator,
                prefixDocumente: evt.metadata.prefixDocumente || prev.prefixDocumente,
                codMysmis: evt.metadata.codMysmis || prev.codMysmis,
                structuraDosar: evt.metadata.structuraDosar || prev.structuraDosar,
              } : prev);
            }
          } catch {}
        }
      }
    } catch (err: any) {
      console.error("Solomon upload error:", err);
      toast("error", err.message || "Eroare la upload-ul documentului în Solomon.");
      setSolomonMessages(prev => {
        if (prev.length > 0 && prev[prev.length - 1].role === "assistant" && prev[prev.length - 1].text === "") {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setSolomonStreaming(false);
    }
  };

  const handleConfirmExtraction = async (msgIdx: number, extIdx: number) => {
    const k = `${msgIdx}-${extIdx}`;
    setExtractionStates(prev => ({ ...prev, [k]: "confirmed" }));
    const msg = solomonMessages[msgIdx];
    if (msg?.extractions?.[extIdx]) {
      const ext = msg.extractions[extIdx];
      setSolomonElements(prev => [
        { key: ext.key, label: ext.label, value: ext.value, source: "Solomon", status: "confirmat" },
        ...prev.filter(e => e.key !== ext.key),
      ]);

      // Persist to API — find matching element by key and update value + confirm
      const matchingEl = elements.find(e => e.key === ext.key);
      if (matchingEl) {
        try {
          await apiPut(`/api/projects/${projectId}/elements/${matchingEl.id}`, {
            value: ext.value,
            source: "solomon",
            confirmed: true,
          });
          setElements(prev => prev.map(e => e.id === matchingEl.id
            ? { ...e, value: ext.value, source: "solomon", sourceLabel: "Solomon", status: "confirmat" as const, confidence: 100 }
            : e
          ));

          // Cross-validate against reference tables
          apiPost("/api/reference/validate-element", {
            elementId: matchingEl.id,
            value: ext.value,
            projectId,
          }).then(validation => {
            if (validation && validation.totalChecks > 0) {
              setExtractionValidations(prev => ({ ...prev, [k]: validation }));
            }
          }).catch(() => {}); // Silently fail validation
        } catch (err) {
          console.error("Failed to persist Solomon extraction:", err);
          toast("error", "Eroare la salvarea datelor extrase");
        }
      } else {
        toast("warning", `Elementul extras „${ext.label || ext.key}" nu corespunde niciunui câmp din template — valoarea nu a fost salvată.`);
      }
    }
  };

  const handleRejectExtraction = (msgIdx: number, extIdx: number) => {
    setExtractionStates(prev => ({ ...prev, [`${msgIdx}-${extIdx}`]: "rejected" }));
  };

  const handleConfirmElement = async (idx: number) => {
    if (readOnly) return;
    const el = solomonElements[idx];
    setSolomonElements(prev => prev.map((e, i) => i === idx ? { ...e, status: "confirmat" } : e));

    // Persist to API
    const matchingEl = elements.find(e => e.key === el.key);
    if (matchingEl) {
      try {
        await apiPut(`/api/projects/${projectId}/elements/${matchingEl.id}`, {
          value: el.value,
          source: "solomon",
          confirmed: true,
        });
        setElements(prev => prev.map(e => e.id === matchingEl.id
          ? { ...e, value: el.value, source: "solomon", sourceLabel: "Solomon", status: "confirmat" as const, confidence: 100 }
          : e
        ));
      } catch (err) {
        console.error("Failed to persist Solomon element confirmation:", err);
        toast("error", "Eroare la confirmarea elementului");
      }
    }
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

  const handleRefineSubmit = async () => {
    if (!refineInput.trim() || !refinePopup || !solomonConvId) return;
    setSolomonStreaming(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("df-token") : null;
      const res = await fetch(`${API_URL}/api/solomon/conversations/${solomonConvId}/refine`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ selectedText: refinePopup.text, instruction: refineInput }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let refinedText = "";
      let buffer = "";

      setSolomonMessages(prev => [...prev, { role: "assistant", text: "", extractions: null }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === "[DONE]") continue;
          try {
            const evt = JSON.parse(jsonStr);
            if (evt.type === "text") {
              refinedText += evt.text;
              setSolomonMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", text: refinedText, extractions: null };
                return updated;
              });
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error("Refine SSE error:", err);
    } finally {
      setSolomonStreaming(false);
      setRefinePopup(null);
      setRefineInput("");
    }
  };

  const escapeHtml = (str: string): string => {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const renderMsgText = (text: string) => {
    const escaped = escapeHtml(text);
    return escaped.split(/(\*\*.*?\*\*)/).map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <span key={i} className="msg-bold">{part.slice(2, -2)}</span>;
      }
      return part;
    });
  };

  const solomonConfirmedCount = solomonElements.filter(e => e.status === "confirmat").length;

  // ─── NEEMIA: Generate single template ───
  const handleNeemiaGenerate = async (templateDocumentId: string) => {
    if (readOnly || neemiaGenerating) return;
    setNeemiaGenerating(true);
    setNeemiaGenStatus("Se validează...");
    setNeemiaGenProgress(5);
    setNeemiaValidation(null);
    try {
      // Step 1: Validate
      const validation = await apiPost<any>(`/api/neemia/projects/${projectId}/validate`, { templateDocumentId });
      setNeemiaValidation({ warnings: validation.warnings || [], stats: validation.stats, sectionReadiness: validation.sectionReadiness || [] });
      setNeemiaGenProgress(15);

      if (!validation.canGenerate) {
        setNeemiaGenStatus("Generarea nu este posibilă — vezi erorile.");
        setNeemiaGenerating(false);
        setNeemiaGenProgress(0);
        return;
      }

      // Step 2: Generate via SSE
      setNeemiaGenStatus("Se generează documentul...");
      setNeemiaGenProgress(25);
      const neeToken = typeof window !== "undefined" ? localStorage.getItem("df-token") : null;
      const res = await fetch(`${API_URL}/api/neemia/projects/${projectId}/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(neeToken ? { Authorization: `Bearer ${neeToken}` } : {}),
        },
        body: JSON.stringify({ templateDocumentId }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No stream");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "status") {
              setNeemiaGenStatus(evt.message);
              setNeemiaGenProgress(prev => Math.min(prev + 15, 85));
            }
            else if (evt.type === "progress") {
              const total = (evt.filled || 0) + (evt.missing || 0);
              const pct = total > 0 ? Math.round((evt.filled / total) * 100) : 50;
              setNeemiaGenProgress(25 + Math.round(pct * 0.5));
              setNeemiaGenStatus(`Elemente: ${evt.filled} completate, ${evt.missing} lipsă`);
            }
            else if (evt.type === "warning") setNeemiaGenStatus(`⚠ ${evt.message}`);
            else if (evt.type === "complete") {
              setNeemiaGenProgress(100);
              setNeemiaGenStatus(`✓ Document generat (v${evt.version || "?"}) — ${evt.filledCount} câmpuri completate`);
              // Refresh Neemia documents list
              const docs = await apiGet<any[]>(`/api/neemia/projects/${projectId}/documents`).catch(() => []);
              setNeemiaTemplates((docs || []).map((doc: any) => ({
                id: doc.id, name: doc.templateName || "Document",
                type: (doc.templateFileType || "DOCX").toUpperCase(),
                pages: [], totalFields: doc.filledCount || 0, filledFields: doc.filledCount || 0,
                templateDocumentId: doc.templateDocumentId, status: doc.status, downloadUrl: doc.downloadUrl || null,
              })));
            }
            else if (evt.type === "error") { setNeemiaGenStatus(`Eroare: ${evt.message}`); setNeemiaGenProgress(0); }
          } catch {}
        }
      }
    } catch (err) {
      setNeemiaGenStatus(`Eroare: ${(err as Error).message}`);
      setNeemiaGenProgress(0);
    } finally {
      setNeemiaGenerating(false);
    }
  };

  // ─── NEEMIA: Bulk generate all templates ───
  const handleNeemiaBulkGenerate = async () => {
    if (readOnly || neemiaBulkGenerating) return;
    setNeemiaBulkGenerating(true);
    setNeemiaGenStatus("Se pregătește generarea dosarului complet...");
    try {
      const bulkToken = typeof window !== "undefined" ? localStorage.getItem("df-token") : null;
      const res = await fetch(`${API_URL}/api/neemia/projects/${projectId}/generate-all`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(bulkToken ? { Authorization: `Bearer ${bulkToken}` } : {}),
        },
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No stream");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "status") setNeemiaGenStatus(evt.message);
            else if (evt.type === "doc_progress") setNeemiaGenStatus(`Generare ${evt.current}/${evt.total}: ${evt.templateName}...`);
            else if (evt.type === "consistency_warning") setNeemiaGenStatus(`⚠ ${evt.message}`);
            else if (evt.type === "calculated_fields") setNeemiaGenStatus(`Câmpuri calculate: ${evt.fields.length}`);
            else if (evt.type === "bulk_complete") {
              setNeemiaGenStatus(`✓ Dosar complet: ${evt.totalGenerated} documente generate, ${evt.totalFailed} eșuate`);
              const docs = await apiGet<any[]>(`/api/neemia/projects/${projectId}/documents`).catch(() => []);
              setNeemiaTemplates((docs || []).map((doc: any) => ({
                id: doc.id, name: doc.templateName || "Document",
                type: (doc.templateFileType || "DOCX").toUpperCase(),
                pages: [], totalFields: doc.filledCount || 0, filledFields: doc.filledCount || 0,
                templateDocumentId: doc.templateDocumentId, status: doc.status, downloadUrl: doc.downloadUrl || null,
              })));
            }
            else if (evt.type === "error") setNeemiaGenStatus(`Eroare: ${evt.message}`);
          } catch {}
        }
      }
    } catch (err) {
      setNeemiaGenStatus(`Eroare: ${(err as Error).message}`);
    } finally {
      setNeemiaBulkGenerating(false);
    }
  };

  // ─── NEEMIA COMPOSE: Preview AI content ───
  const handleComposePreview = async (templateDocumentId: string) => {
    if (readOnly || composePreviewing) return;
    setComposePreviewing(true);
    setComposePreviewSections([]);
    setNeemiaGenStatus("Se validează...");
    setNeemiaValidation(null);
    try {
      // Validate compose readiness (including checklist completeness)
      const validation = await apiPost<any>(`/api/neemia/projects/${projectId}/compose/validate`, { templateDocumentId });
      setNeemiaValidation({ warnings: validation.warnings || [], stats: validation.stats, sectionReadiness: validation.sectionReadiness || [] });
      if (!validation.canCompose) {
        setNeemiaGenStatus("Compunerea nu este posibilă — vezi erorile.");
        setComposePreviewing(false);
        return;
      }
      setNeemiaGenStatus("Se generează previzualizare COMPOSE...");
      const token = typeof window !== "undefined" ? localStorage.getItem("df-token") : null;
      const res = await fetch(`${API_URL}/api/neemia/projects/${projectId}/compose/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ templateDocumentId }),
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No stream");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "status") setNeemiaGenStatus(evt.message);
            else if (evt.type === "context_ready") setNeemiaGenStatus(`Context: ${evt.elements} elemente, ${evt.referenceTables} tabele referință`);
            else if (evt.type === "preview_ready" || evt.type === "ai_complete") {
              setComposePreviewSections(evt.sections || []);
              setComposeModel(evt.model || "");
              setNeemiaGenStatus(`✓ Previzualizare COMPOSE gata — ${(evt.sections || []).length} secțiuni generate`);
            }
            else if (evt.type === "error") setNeemiaGenStatus(`Eroare: ${evt.message}`);
          } catch {}
        }
      }
    } catch (err) {
      setNeemiaGenStatus(`Eroare: ${(err as Error).message}`);
    } finally {
      setComposePreviewing(false);
    }
  };

  // ─── NEEMIA COMPOSE: Generate final DOCX with (optionally edited) sections ───
  const handleComposeGenerate = async (templateDocumentId: string) => {
    if (readOnly || neemiaGenerating) return;
    setNeemiaGenerating(true);
    setNeemiaGenStatus("Se generează documentul COMPOSE...");
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("df-token") : null;
      const res = await fetch(`${API_URL}/api/neemia/projects/${projectId}/compose/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          templateDocumentId,
          editedSections: composePreviewSections.length > 0 ? composePreviewSections : undefined,
        }),
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No stream");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "status") setNeemiaGenStatus(evt.message);
            else if (evt.type === "complete") {
              setNeemiaGenStatus(`✓ Document COMPOSE generat — ${evt.filledCount} secțiuni`);
              setComposePreviewSections([]);
              const docs = await apiGet<any[]>(`/api/neemia/projects/${projectId}/documents`).catch(() => []);
              setNeemiaTemplates((docs || []).map((doc: any) => ({
                id: doc.id, name: doc.templateName || "Document",
                type: (doc.templateFileType || "DOCX").toUpperCase(),
                pages: [], totalFields: doc.filledCount || 0, filledFields: doc.filledCount || 0,
                templateDocumentId: doc.templateDocumentId, status: doc.status, downloadUrl: doc.downloadUrl || null,
                generationMode: doc.generationMode || "fill",
                composeSections: doc.composeContent?.sections || undefined,
              })));
            }
            else if (evt.type === "error") setNeemiaGenStatus(`Eroare: ${evt.message}`);
          } catch {}
        }
      }
    } catch (err) {
      setNeemiaGenStatus(`Eroare: ${(err as Error).message}`);
    } finally {
      setNeemiaGenerating(false);
    }
  };

  // ─── COMPOSE: Edit section text ───
  const handleComposeEditSave = (sectionIdx: number) => {
    setComposePreviewSections(prev => prev.map((s, i) =>
      i === sectionIdx ? { ...s, content: composeEditText, approved: true } : s
    ));
    setComposeEditing(null);
    setComposeEditText("");
  };

  // ─── COMPOSE: Regenerate single section ───
  const [composeRegeneratingIdx, setComposeRegeneratingIdx] = useState<number | null>(null);
  const handleComposeRegenerateSection = async (sectionIdx: number) => {
    const section = composePreviewSections[sectionIdx];
    if (!section || composeRegeneratingIdx !== null) return;
    setComposeRegeneratingIdx(sectionIdx);
    try {
      // Find the active COMPOSE template
      const composeTmpl = neemiaTemplates.find(t => t.generationMode === "compose");
      if (!composeTmpl?.templateDocumentId) throw new Error("Template COMPOSE negăsit");
      const result = await apiPost<any>(`/api/neemia/projects/${projectId}/compose/preview`, {
        templateDocumentId: composeTmpl.templateDocumentId,
        regenerateSectionMarker: section.marker,
      });
      // Update only the regenerated section
      if (result?.sections) {
        const regenerated = result.sections.find((s: any) => s.marker === section.marker);
        if (regenerated) {
          setComposePreviewSections(prev => prev.map((s, i) =>
            i === sectionIdx ? { ...regenerated, approved: false } : s
          ));
        }
      }
    } catch (err) {
      toast("error", `Eroare regenerare secțiune: ${(err as Error).message}`);
    } finally {
      setComposeRegeneratingIdx(null);
    }
  };

  // ─── NEEMIA: Load version history for a template ───
  const handleLoadVersions = async (templateDocumentId: string) => {
    if (neemiaVersionsOpen === templateDocumentId) {
      setNeemiaVersionsOpen(null);
      setNeemiaVersions([]);
      return;
    }
    try {
      const versions = await apiGet<any[]>(`/api/neemia/projects/${projectId}/documents/${templateDocumentId}/versions`);
      setNeemiaVersions(versions || []);
      setNeemiaVersionsOpen(templateDocumentId);
    } catch (err) {
      console.error("Failed to load versions:", err);
      toast("error", "Eroare la încărcarea istoricului");
    }
  };

  const handleComposeApproveSection = (sectionIdx: number) => {
    setComposePreviewSections(prev => prev.map((s, i) =>
      i === sectionIdx ? { ...s, approved: !s.approved } : s
    ));
  };

  const handleRecheckEligibility = async () => {
    if (readOnly) return;
    setRecheckLoading(true);
    try {
      await apiPost(`/api/projects/${projectId}/check-eligibility`, {});
      const eligData = await apiGet<any>(`/api/projects/${projectId}/eligibility`);
      setEligibilityRules(mapEligibilityRules(eligData.flat || []));
      setGuideRules(mapGuideRules(eligData.grouped || []));
    } catch (err) {
      console.error("Re-check eligibility failed:", err);
      toast("error", "Eroare la re-verificarea eligibilității");
    } finally {
      setRecheckLoading(false);
    }
  };

  const handleChecklistToggle = async (itemId: string, currentDone: boolean) => {
    if (readOnly) return;
    setChecklistItems(items => items.map(i => i.id === itemId ? { ...i, done: !currentDone } : i));
    try {
      await apiPut(`/api/projects/${projectId}/checklist/${itemId}`, { done: !currentDone });
    } catch (err) {
      console.error("Checklist toggle failed:", err);
      toast("error", "Eroare la actualizarea checklistului");
      setChecklistItems(items => items.map(i => i.id === itemId ? { ...i, done: currentDone } : i));
    }
  };

  const handleChecklistAdd = async () => {
    if (readOnly || !checkNewName.trim() || !checkNewCat.trim()) return;
    try {
      const item = await apiPost<any>(`/api/projects/${projectId}/checklist`, { name: checkNewName.trim(), category: checkNewCat.trim() });
      setChecklistItems(prev => [...prev, mapChecklist([item])[0]]);
      setCheckNewName("");
      setCheckNewCat("");
      setCheckAddOpen(false);
    } catch (err) { console.error("Checklist add failed:", err); toast("error", "Eroare la adăugarea în checklist"); }
  };

  const handleChecklistDelete = async (itemId: string) => {
    if (readOnly) return;
    try {
      await apiDelete(`/api/projects/${projectId}/checklist/${itemId}`);
      setChecklistItems(prev => prev.filter(i => i.id !== itemId));
      setCheckActionId(null);
    } catch (err) { console.error("Checklist delete failed:", err); toast("error", "Eroare la ștergerea din checklist"); }
  };

  const handleChecklistMapTemplate = async (itemId: string, templateId: string | null) => {
    if (readOnly) return;
    try {
      await apiPut(`/api/projects/${projectId}/checklist/${itemId}`, { templateId });
      // Find template name from neemiaTemplates
      const tmpl = neemiaTemplates.find(t => t.id === templateId);
      setChecklistItems(prev => prev.map(i => i.id === itemId ? { ...i, templateId, templateName: tmpl?.name || null } : i));
      setCheckMapOpen(null);
    } catch (err) { console.error("Checklist map template failed:", err); toast("error", "Eroare la asocierea template-ului"); }
  };

  const handleChecklistMoveCategory = async (itemId: string, newCategory: string) => {
    if (readOnly) return;
    try {
      await apiPut(`/api/projects/${projectId}/checklist/${itemId}`, { category: newCategory });
      setChecklistItems(prev => prev.map(i => i.id === itemId ? { ...i, category: newCategory } : i));
      setCheckActionId(null);
    } catch (err) { console.error("Checklist move failed:", err); toast("error", "Eroare la mutarea în checklist"); }
  };

  // Close checklist actions menu on outside click
  useEffect(() => {
    if (!checkActionId) return;
    const handler = () => { setCheckActionId(null); setCheckMapOpen(null); };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [checkActionId]);

  const handleConfirmElementApi = async (elId: string) => {
    if (readOnly) return;
    const el = elements.find(e => e.id === elId);
    try {
      await apiPut(`/api/projects/${projectId}/elements/${elId}`, {
        value: el?.value || undefined,
        confirmed: true,
      });
      setElements(prev => prev.map(e => e.id === elId ? { ...e, status: "confirmat" as const, confidence: 100 } : e));
    } catch (err) {
      console.error("Confirm element failed:", err);
      toast("error", "Eroare la confirmarea elementului");
    }
  };

  const handleSaveElementEdit = async (elId: string) => {
    if (readOnly) return;
    try {
      await apiPut(`/api/projects/${projectId}/elements/${elId}`, {
        value: editingElementValue,
        source: "manual",
      });
      setElements(prev => prev.map(e =>
        e.id === elId ? { ...e, value: editingElementValue, source: "manual", sourceLabel: "Completare manuală", status: "propus_ai" as const } : e,
      ));
      setEditingElementId(null);
      setEditingElementValue("");
    } catch (err) {
      console.error("Save element edit failed:", err);
      toast("error", "Eroare la salvarea elementului");
    }
  };

  const [bulkConfirming, setBulkConfirming] = useState(false);

  // Fetch element constraints when an element is selected
  useEffect(() => {
    if (!selectedElement) { setElementConstraints([]); return; }
    apiGet<any[]>(`/api/reference/elements/${selectedElement}/rule-links`)
      .then(links => setElementConstraints(links || []))
      .catch(() => setElementConstraints([]));
  }, [selectedElement]);

  const handleNeemiaTemplateClick = async (idx: number) => {
    setNeemiaActiveTemplate(idx);
    setNeemiaActivePage(0);
    setNeemiaAnimKey(k => k + 1);

    // Load template pages with filled elements
    const tmpl = neemiaTemplates[idx];
    if (tmpl?.templateDocumentId && projectId) {
      try {
        const data = await apiGet<any>(`/api/neemia/projects/${projectId}/template-pages/${tmpl.templateDocumentId}`);
        if (data?.pages) {
          const sourceLabels: Record<string, string> = { onrc: "ONRC", solomon: "Solomon", manual: "Manual", calculated: "Calculat", ghid: "Ghid" };
          const mappedPages: TemplatePage[] = data.pages.map((p: any) => ({
            num: p.num,
            title: `Pagina ${p.num}`,
            status: p.status,
            totalFields: p.totalFields,
            filledFields: p.filledFields,
            confirmedFields: p.confirmedFields,
            fields: (p.fields || []).map((f: any) => ({
              key: f.key,
              name: f.label,
              value: f.value,
              source: f.source ? (sourceLabels[f.source] || f.source) : null,
              confirmed: f.confirmed,
              fieldType: f.fieldType,
              group: f.group,
            })),
          }));
          setNeemiaTemplates(prev => prev.map((t, i) => i === idx ? {
            ...t,
            pages: mappedPages,
            totalFields: data.totalFields,
            filledFields: data.filledFields,
          } : t));
        }
      } catch (err) {
        console.error("Failed to load template pages:", err);
      }
    }
  };

  const handleNeemiaPageClick = (idx: number) => {
    setNeemiaActivePage(idx);
    setNeemiaAnimKey(k => k + 1);
  };

  const neemiaProgressPct = (tmpl: NeemiaTemplate) => tmpl.totalFields > 0 ? Math.round(tmpl.filledFields / tmpl.totalFields * 100) : 0;
  const neemiaProgressColor = (p: number) => p === 100 ? "#059669" : p > 0 ? "#d97706" : "#dc2626";

  const toggleBranch = (key: string) => setBranches(b => ({ ...b, [key]: !b[key] }));

  const eligPassed = eligibilityRules.filter(r => r.status === "pass").length;
  const eligTotal = eligibilityRules.length;
  const elemFilled = elements.filter(e => e.value).length;
  const elemTotal = elements.length;
  const checkDone = checklistItems.filter(i => i.done).length;
  const checkTotal = checklistItems.length;

  const filteredElements = elements.filter(e => {
    if (elemFilter === "gol" && e.status !== "gol") return false;
    if (elemFilter === "propus_ai" && e.status !== "propus_ai") return false;
    if (elemFilter === "confirmat" && e.status !== "confirmat") return false;
    if (elemFilter === "de_confirmat" && (e.status !== "propus_ai")) return false;
    if (elemFilter === "src_solomon" && !(e.status === "propus_ai" && e.source === "solomon")) return false;
    if (elemFilter === "src_calculated" && !(e.status === "propus_ai" && e.source === "calculated")) return false;
    if (elemFilter === "src_manual" && !(e.status === "propus_ai" && e.source !== "solomon" && e.source !== "calculated")) return false;
    if (elemSearch) {
      const q = elemSearch.toLowerCase();
      return e.label.toLowerCase().includes(q) || e.key.toLowerCase().includes(q) || (e.value || "").toLowerCase().includes(q);
    }
    return true;
  });

  const handleBulkConfirm = async () => {
    if (readOnly || bulkConfirming) return;
    const toConfirm = filteredElements.filter(e => e.status === "propus_ai");
    if (toConfirm.length === 0) return;
    setBulkConfirming(true);
    try {
      await apiPut(`/api/projects/${projectId}/elements-bulk/confirm`, {
        elementIds: toConfirm.map(e => e.id),
      });
      setElements(prev => prev.map(e =>
        toConfirm.some(tc => tc.id === e.id)
          ? { ...e, status: "confirmat" as const, confidence: 100 }
          : e
      ));
    } catch (err) {
      console.error("Bulk confirm failed:", err);
    } finally {
      setBulkConfirming(false);
    }
  };

  const checkCategories = [...new Set(checklistItems.map(i => i.category))];
  const checkMappedTemplateIds = new Set(checklistItems.filter(i => i.templateId).map(i => i.templateId));
  const checkUnmappedTemplates = neemiaTemplates.filter(t => !checkMappedTemplateIds.has(t.id));

  const neemiaTemplate = neemiaTemplates[neemiaActiveTemplate] || null;
  const neemiaPage = neemiaTemplate?.pages?.[neemiaActivePage] || null;

  const projectName = project?.name || "Se incarcă...";
  const projectFirma = project?.company?.denumire || "-";
  const projectCui = project?.company?.cui || "-";
  const projectStatus = project?.status || "draft";
  const projectValoare = project?.valoare || "-";
  const projectPath = project?.programPath
    ? [
        { label: project.programPath.program || "Program", level: "program" },
        { label: project.programPath.masura || "Măsura", level: "masura" },
        { label: project.programPath.sesiune || "Sesiune", level: "sesiune" },
      ]
    : [];
  const companyData = project?.company;
  const { localitate, judet } = parseAdresa(companyData?.adresa);
  const capitalSocial = companyData?.capitalSocial || companyData?.onrcRawData?.capitalSocial || "-";
  const cifraAfaceri = companyData?.cifraAfaceri || companyData?.onrcRawData?.cifraAfaceri || "-";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-base font-sans bg-slate-50 text-slate-400">
        Se incarcă proiectul...
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-base font-sans bg-slate-50 gap-3">
        <div className="text-red-400">Proiectul nu a fost găsit.</div>
        {loadError && (
          <div className="text-[13px] text-slate-400 max-w-md text-center">
            Eroare: {loadError}
          </div>
        )}
        <button
          onClick={() => window.location.reload()}
          className="mt-2 text-[13px] text-blue-500 hover:text-blue-700 hover:underline"
        >
          Reîncearcă
        </button>
      </div>
    );
  }

  return (
    <div className="animate-[fadeIn_.2s_ease-out]">
      <style>{`
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        .skeleton-shimmer{background:linear-gradient(90deg,#f1f5f9 25%,rgba(226,232,240,.8) 50%,#f1f5f9 75%);background-size:200% 100%;animation:shimmer 1.5s ease-in-out infinite}
        .lock-banner{display:flex;align-items:center;gap:10px;padding:10px 24px;background:#fffbeb;border-bottom:1px solid #fde68a;font-size:13px;color:#d97706;font-family:'Inter',system-ui,sans-serif}
        .lock-banner .lb-icon{font-size:18px}
        .lock-banner .lb-name{font-weight:700;color:#d97706}
        .lock-banner .lb-time{font-size:11px;color:#94a3b8;margin-left:auto;font-family:'JetBrains Mono',monospace}
        .pv-container{display:flex;flex-direction:column;height:100%;overflow:hidden;background:#ffffff}

        .pv-project-header{padding:10px 24px;background:#ffffff;display:flex;align-items:center;gap:8px;border-bottom:1px solid rgba(226,232,240,.8);flex-shrink:0;min-height:44px}
        .pv-breadcrumb{font-size:13px;color:#64748b;display:flex;align-items:center;gap:6px}
        .pv-breadcrumb a{color:#64748b;text-decoration:none;cursor:pointer;font-weight:400;transition:color .15s}
        .pv-breadcrumb a:hover{color:#0f172a;text-decoration:underline}
        .pv-breadcrumb .pv-bc-sep{color:#cbd5e1;font-size:12px}
        .pv-title{font-size:13px;font-weight:500;color:#0f172a}
        .pv-status-pill{display:inline-flex;align-items:center;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;letter-spacing:.3px;border:1px solid transparent;margin-left:auto}

        .pv-tabs{display:flex;gap:0;border-bottom:1px solid rgba(226,232,240,.8);background:#ffffff;padding:0 32px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}
        .pv-tabs::-webkit-scrollbar{display:none}
        .pv-tab{padding:12px 18px;font-size:14px;font-weight:600;color:#64748b;cursor:pointer;border-bottom:2.5px solid transparent;transition:all .15s cubic-bezier(.4,0,.2,1);background:none;border-top:none;border-left:none;border-right:none;font-family:'Inter',system-ui,sans-serif;white-space:nowrap;display:flex;align-items:center;gap:6px;position:relative}
        .pv-tab:hover{color:#0f172a}
        .pv-tab.active{color:#2563eb;border-bottom-color:#2563eb}
        .pv-tab-badge{font-size:11px;font-weight:700;padding:1px 7px;border-radius:10px;font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums}
        .pv-tab-badge.neutral{background:#f1f5f9;color:#94a3b8}
        .pv-tab-badge.blue{background:rgba(37,99,235,.1);color:#2563eb}
        .pv-tab-badge.green{background:rgba(52,211,153,.12);color:#059669}
        .pv-tab-badge.red{background:rgba(248,113,113,.1);color:#dc2626}

        .main-content{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}
        .content-body{flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0}

        /* Sumar */
        .sumar-panel{padding:24px;overflow-y:auto;flex:1;min-height:0}
        .sumar-progress{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px}
        .sp-card{padding:16px 20px;border-radius:12px;border:1px solid rgba(226,232,240,.8);background:#ffffff}
        .sp-card .sp-val{font-size:24px;font-weight:600;margin-bottom:2px}
        .sp-card .sp-label{font-size:13px;color:#94a3b8}
        .sumar-activity{padding:0}
        .sumar-activity h3{font-size:16px;font-weight:600;margin-bottom:12px;color:#0f172a}
        .sa-item{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f8fafc;border-radius:8px;margin-bottom:8px}
        .sa-item-icon{font-size:16px;flex-shrink:0}
        .sa-item-text{font-size:14px;color:#0f172a;flex:1}
        .sa-item-time{font-size:12px;color:#94a3b8;white-space:nowrap;flex-shrink:0}
        .sumar-info{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
        .si-card{padding:18px;border-radius:12px;border:1px solid rgba(226,232,240,.8);background:#ffffff}
        .si-card h3{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #f0f2f5}
        .si-row{display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px}
        .si-row .si-label{color:#64748b}
        .si-row .si-value{color:#0f172a;font-weight:600;font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums}
        .sumar-actions{display:flex;gap:10px}
        .sa-btn{padding:10px 18px;border-radius:8px;border:1px solid #cbd5e1;background:#ffffff;color:#64748b;font-size:13px;font-weight:600;cursor:pointer;font-family:'Inter',system-ui,sans-serif;transition:all .15s cubic-bezier(.4,0,.2,1);display:flex;align-items:center;gap:6px;box-shadow:0 1px 2px rgba(0,0,0,.05)}
        .sa-btn:hover{border-color:#94a3b8;color:#0f172a;box-shadow:0 1px 3px rgba(0,0,0,.1)}
        .sa-btn.primary{border-color:#2563eb;background:#2563eb;color:#ffffff;box-shadow:0 1px 3px rgba(37,99,235,.3)}
        .sa-btn.primary:hover{background:#1d4ed8;box-shadow:0 2px 6px rgba(37,99,235,.4)}

        /* Eligibility */
        .elig-panel{padding:24px 32px;max-width:960px;overflow-y:auto;flex:1;min-height:0}
        .elig-summary{display:flex;gap:16px;margin-bottom:24px}
        .elig-stat{padding:16px 20px;border-radius:12px;border:1px solid rgba(226,232,240,.8);background:#ffffff;flex:1;text-align:center}
        .elig-stat .number{font-size:28px;font-weight:800;font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums}
        .elig-stat .label{font-size:12px;color:#64748b;margin-top:4px;font-weight:500}
        .elig-rule{display:flex;align-items:center;gap:12px;padding:14px 20px;border-radius:10px;margin-bottom:8px;transition:all .15s cubic-bezier(.4,0,.2,1);cursor:pointer;border:none}
        .elig-rule.pass-bg{background:rgba(52,211,153,.08)}
        .elig-rule.fail-bg{background:rgba(248,113,113,.08)}
        .elig-rule.pending-bg{background:rgba(251,191,36,.08)}
        .elig-rule:hover{box-shadow:0 1px 4px rgba(0,0,0,.06)}
        .elig-icon{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;font-weight:700}
        .elig-icon.pass{background:transparent;color:#059669}
        .elig-icon.fail{background:transparent;color:#dc2626}
        .elig-icon.pending{background:transparent;color:#d97706}
        .elig-name{font-size:14px;font-weight:500;flex:1}
        .elig-name.pass-text{color:#059669}
        .elig-name.fail-text{color:#dc2626}
        .elig-name.pending-text{color:#d97706}
        .elig-detail{font-size:12px;color:#64748b;font-family:'JetBrains Mono',monospace;max-width:300px;text-align:right}
        .elig-type-badge{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:2px 8px;border-radius:4px;border:1px solid transparent;flex-shrink:0}
        .elig-type-badge.fixed{background:rgba(52,211,153,.1);color:#059669;border-color:#a7f3d0}
        .elig-type-badge.interpreted{background:rgba(251,191,36,.1);color:#d97706;border-color:#fed7aa}

        /* Ghid */
        .ghid-layout{display:flex;flex-direction:column;flex:1;min-height:0}
        .ghid-sub-tabs{display:flex;gap:0;border-bottom:1px solid rgba(226,232,240,.8);background:#ffffff;padding:0 24px}
        .ghid-sub-tab{padding:12px 20px;font-size:13px;font-weight:600;color:#64748b;cursor:pointer;border-bottom:2px solid transparent;transition:all .15s cubic-bezier(.4,0,.2,1);background:none;border-top:none;border-left:none;border-right:none;font-family:'Inter',system-ui,sans-serif}
        .ghid-sub-tab:hover{color:#0f172a}
        .ghid-sub-tab.active{color:#2563eb;border-bottom-color:#2563eb}
        .ghid-split{display:flex;flex:1;overflow:hidden}
        .rules-panel{width:400px;min-width:400px;display:flex;flex-direction:column;border-right:1px solid rgba(226,232,240,.8)}
        .rule-category-filters{display:flex;flex-wrap:wrap;gap:6px;padding:12px 16px;border-bottom:1px solid rgba(226,232,240,.8);background:#ffffff}
        .rcf-chip{padding:4px 12px;border-radius:20px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid rgba(226,232,240,.8);background:#ffffff;color:#64748b;font-family:'Inter',system-ui,sans-serif;transition:all .15s cubic-bezier(.4,0,.2,1);display:inline-flex;align-items:center;gap:4px}
        .rcf-chip:hover{border-color:#cbd5e1;color:#0f172a;box-shadow:0 1px 2px rgba(0,0,0,.04)}
        .rcf-chip.active{border-color:#2563eb;background:#eff6ff;color:#2563eb}
        .rcf-count{font-size:10px;font-family:'JetBrains Mono',monospace;opacity:.7}
        .rules-scroll{flex:1;overflow-y:auto;padding:12px 16px}
        .rule-card{padding:12px 14px;border-radius:12px;border:1px solid rgba(226,232,240,.8);margin-bottom:8px;cursor:pointer;transition:all .15s cubic-bezier(.4,0,.2,1);background:#ffffff}
        .rule-card:hover{border-color:#cbd5e1;box-shadow:0 1px 3px rgba(0,0,0,.05)}
        .rule-card.active{border-color:#2563eb;background:rgba(37,99,235,.03);box-shadow:0 0 0 1px rgba(37,99,235,.15)}
        .rule-card-top{display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap}
        .rule-type-badge{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:4px 12px;border-radius:6px;display:inline-flex;flex-shrink:0;white-space:nowrap}
        .rule-type-badge.fixed{color:#059669;background:rgba(52,211,153,.15);border:1px solid #a7f3d0}
        .rule-type-badge.interpreted{color:#d97706;background:rgba(251,191,36,.15);border:1px solid #fed7aa}
        .rule-cat-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
        .rule-cat-label{font-size:10px;color:#94a3b8;font-weight:600}
        .rule-review-flag{font-size:10px;color:#d97706;font-weight:600;margin-left:auto}
        .rule-validated-flag{font-size:12px;color:#059669;margin-left:auto}
        .rule-text{font-size:13px;line-height:1.5;color:#0f172a}
        .rule-meta{font-size:11px;color:#94a3b8;margin-top:6px;font-family:'JetBrains Mono',monospace;display:flex;gap:12px;align-items:center}
        .rule-doc-ref{font-size:10px;color:#94a3b8;margin-left:auto;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .confidence-bar{width:48px;height:4px;background:#f0f2f5;border-radius:2px;overflow:hidden;display:inline-block;vertical-align:middle;margin-left:4px}
        .confidence-fill{height:100%;border-radius:2px}

        /* Rule detail panel */
        .rule-detail-panel{flex:1;overflow-y:auto;background:#f8fafc;min-width:0}
        .rd-content{padding:28px 32px}
        .rd-header{margin-bottom:24px}
        .rd-badges{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px}
        .rd-cat-pill{font-size:11px;font-weight:700;padding:3px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:.5px}
        .rd-validated{font-size:11px;color:#059669;font-weight:700;display:flex;align-items:center;gap:3px}
        .rd-needs-review{font-size:11px;color:#d97706;font-weight:700;display:flex;align-items:center;gap:3px}
        .rd-confidence-row{display:flex;align-items:center;gap:10px}
        .rd-conf-label{font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px}
        .rd-conf-value{font-size:20px;font-weight:800;font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums}
        .rd-conf-bar{flex:1;height:6px;background:#f8fafc;border-radius:3px;overflow:hidden;max-width:200px}
        .rd-conf-fill{height:100%;border-radius:3px;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .rd-section{margin-bottom:20px}
        .rd-section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;margin-bottom:10px;display:flex;align-items:center;gap:8px}
        .rd-page-ref{font-size:10px;font-weight:600;color:#2563eb;background:rgba(37,99,235,.1);padding:2px 8px;border-radius:10px;margin-left:auto}
        .rd-description{font-size:14px;line-height:1.7;color:#0f172a;padding:14px 18px;background:#ffffff;border:1px solid rgba(226,232,240,.8);border-radius:12px}
        .rd-source-text{background:#ffffff;border:1px solid rgba(226,232,240,.8);border-radius:12px;overflow:hidden}
        .rd-source-quote{font-size:13px;line-height:1.8;color:#0f172a;padding:16px 20px;border-left:3px solid #2563eb;font-style:italic;background:rgba(37,99,235,.03)}
        .rd-condition{background:#ffffff;border:1px solid rgba(226,232,240,.8);border-radius:12px;padding:14px 18px}
        .rd-cond-row{display:flex;align-items:center;gap:8px;font-family:'JetBrains Mono',monospace;font-size:13px}
        .rd-cond-field{color:#2563eb;font-weight:700}
        .rd-cond-op{color:#ea580c;font-weight:600;padding:2px 8px;background:rgba(251,146,60,.1);border-radius:4px;font-size:11px}
        .rd-cond-val{color:#059669;font-weight:600}
        .rd-logic-type{margin-bottom:10px}
        .rd-logic-badge{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:4px 12px;border-radius:4px;background:rgba(167,139,250,.12);color:#7c3aed;border:1px solid rgba(167,139,250,.25)}
        .rd-logic-desc{font-size:13px;line-height:1.7;color:#0f172a;margin-bottom:12px}
        .rd-factors{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:10px}
        .rd-factors-label{font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px}
        .rd-factor-chip{font-size:11px;padding:3px 10px;border-radius:12px;background:#f8fafc;border:1px solid rgba(226,232,240,.8);color:#64748b;font-family:'JetBrains Mono',monospace}
        .rd-outcomes{display:flex;flex-direction:column;gap:6px}
        .rd-outcome-row{display:flex;align-items:flex-start;gap:6px;font-size:12px;line-height:1.6;padding:6px 10px;background:#f8fafc;border-radius:6px}
        .rd-outcome-if{font-size:10px;font-weight:700;color:#2563eb;padding:1px 6px;border-radius:3px;background:rgba(37,99,235,.1);flex-shrink:0;margin-top:1px}
        .rd-outcome-cond{color:#0f172a;flex:1}
        .rd-outcome-then{color:#94a3b8;flex-shrink:0}
        .rd-outcome-result{color:#059669;font-weight:600;flex:1}
        .rd-doc-ref{display:flex;align-items:center;gap:8px;padding:10px 14px;background:#ffffff;border:1px solid rgba(226,232,240,.8);border-radius:12px}
        .rd-doc-icon{font-size:18px}
        .rd-doc-name{font-size:13px;font-weight:600;color:#0f172a;flex:1}
        .rd-doc-page{font-size:11px;font-family:'JetBrains Mono',monospace;color:#94a3b8;padding:2px 8px;background:#f8fafc;border-radius:4px}
        .rd-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#94a3b8;gap:12px;padding:40px}
        .rd-empty-icon{font-size:48px;opacity:.4}
        .rd-empty-title{font-size:16px;font-weight:700;color:#64748b}
        .rd-empty-desc{font-size:13px;text-align:center;max-width:280px;line-height:1.6}

        /* Anexe & Date panel */
        .anexe-panel{display:grid;grid-template-columns:320px 1fr;flex:1;min-height:0;overflow:hidden}
        .anexe-list{overflow-y:auto;border-right:1px solid rgba(226,232,240,.8);padding:16px}
        .anexe-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;text-align:center;color:#64748b}
        .anexe-card{padding:12px;border:1px solid rgba(226,232,240,.8);border-radius:12px;cursor:pointer;transition:all .15s cubic-bezier(.4,0,.2,1);margin-bottom:8px;background:#ffffff}
        .anexe-card:hover{border-color:#cbd5e1;box-shadow:0 1px 3px rgba(0,0,0,.05)}
        .anexe-card.active{border-color:#2563eb;background:rgba(37,99,235,.02);box-shadow:0 0 0 1px rgba(37,99,235,.12)}
        .anexe-card-top{display:flex;align-items:center;gap:8px;margin-bottom:6px}
        .anexe-type-badge{font-size:9px;font-weight:700;padding:2px 8px;border-radius:8px;text-transform:uppercase;letter-spacing:.5px}
        .anexe-type-badge.lookup{color:#2563eb;background:rgba(37,99,235,.12)}
        .anexe-type-badge.classification{color:#7c3aed;background:rgba(167,139,250,.12)}
        .anexe-type-badge.list{color:#059669;background:rgba(52,211,153,.12)}
        .anexe-type-badge.matrix{color:#ea580c;background:rgba(251,146,60,.12)}
        .anexe-validated{color:#059669;font-size:14px;font-weight:700}
        .anexe-card-name{font-size:13px;font-weight:600;color:#0f172a;margin-bottom:4px}
        .anexe-card-desc{font-size:11px;color:#94a3b8;line-height:1.4;margin-bottom:6px}
        .anexe-card-meta{display:flex;gap:12px;font-size:10px;color:#94a3b8}
        .anexe-detail{overflow-y:auto;padding:20px}
        .anexe-detail-content{display:flex;flex-direction:column;gap:16px}
        .anexe-detail-header{display:flex;justify-content:space-between;align-items:flex-start}
        .anexe-detail-title{font-size:18px;font-weight:700;color:#0f172a}
        .anexe-detail-badges{display:flex;align-items:center;gap:8px}
        .anexe-detail-desc{font-size:13px;color:#64748b;line-height:1.5}
        .anexe-detail-lookup{font-size:12px;color:#94a3b8}
        .anexe-detail-lookup code{font-family:'JetBrains Mono',monospace;color:#2563eb;background:rgba(37,99,235,.08);padding:1px 6px;border-radius:4px}
        .anexe-table-wrapper{overflow-x:auto;border:1px solid rgba(226,232,240,.8);border-radius:12px}
        .anexe-table{width:100%;border-collapse:collapse;font-size:12px}
        .anexe-table th{text-align:left;padding:8px 12px;background:#f8fafc;color:#64748b;font-weight:600;border-bottom:1px solid rgba(226,232,240,.8);white-space:nowrap}
        .anexe-table td{padding:6px 12px;border-bottom:1px solid rgba(226,232,240,.8);color:#0f172a}
        .anexe-table tr:hover td{background:#f1f5f9}
        .anexe-source-text{border-top:1px solid rgba(226,232,240,.8);padding-top:16px}
        .anexe-source-label{font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;margin-bottom:8px}
        .anexe-source-quote{font-size:12px;color:#64748b;line-height:1.5;padding:12px;background:#f8fafc;border-radius:8px;border-left:3px solid #2563eb;font-style:italic}

        /* Element constraints section */
        .ed-constraints{margin-top:16px;padding-top:12px;border-top:1px solid rgba(226,232,240,.8)}
        .ed-constraints-title{font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;display:flex;align-items:center;gap:6px}
        .ed-constraint-card{padding:10px;border:1px solid rgba(226,232,240,.8);border-radius:8px;margin-bottom:8px;background:#f8fafc}
        .ed-constraint-top{display:flex;align-items:center;gap:6px;margin-bottom:4px}
        .ed-constraint-role{font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;text-transform:uppercase;border:1px solid transparent}
        .ed-constraint-role.input{color:#2563eb;background:#eff6ff;border-color:#bfdbfe}
        .ed-constraint-role.output{color:#059669;background:#ecfdf5;border-color:#a7f3d0}
        .ed-constraint-role.constraint{color:#dc2626;background:#fef2f2;border-color:#fecaca}
        .ed-constraint-rule{font-size:12px;color:#0f172a;line-height:1.4}
        .ed-constraint-refs{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
        .ed-constraint-ref{font-size:10px;color:#7c3aed;background:#f5f3ff;padding:2px 8px;border-radius:6px;border:1px solid #ddd6fe}

        /* Solomon validation card */
        .solomon-validation-card{margin-top:8px;padding:10px 12px;border-radius:12px;border:1px solid rgba(226,232,240,.8);background:#f8fafc}
        .svc-header{display:flex;align-items:center;gap:6px;margin-bottom:8px;font-size:12px;font-weight:600;color:#64748b}
        .svc-results{display:flex;flex-direction:column;gap:4px}
        .svc-result{display:flex;align-items:flex-start;gap:8px;font-size:11px;padding:4px 0}
        .svc-status{flex-shrink:0;width:16px;height:16px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#ffffff}
        .svc-status.passed{background:#34d399}
        .svc-status.failed{background:#f87171}
        .svc-status.warning{background:#fbbf24}
        .svc-status.info{background:#2563eb}
        .svc-text{color:#0f172a;line-height:1.4}
        .svc-ref{font-size:10px;color:#7c3aed;margin-top:2px}

        .pdf-viewer{flex:1;background:#f0f2f5;display:flex;align-items:center;justify-content:center;position:relative}
        .pdf-page-mock{width:480px;background:#ffffff;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,.1);padding:48px 40px;min-height:620px;color:#0f172a;position:relative}
        .pdf-page-mock h3{font-size:16px;font-weight:700;margin-bottom:16px;color:#0f172a}
        .pdf-text-line{height:10px;background:#cbd5e1;border-radius:2px;margin:8px 0}
        .pdf-page-num{position:absolute;bottom:16px;right:24px;font-size:12px;color:#94a3b8;font-family:'JetBrains Mono',monospace}

        /* Elemente */
        .elemente-layout{display:flex;flex:1;min-height:0}
        .elemente-list{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}
        .completitudine-bar{padding:20px 24px;background:#ffffff;border-bottom:1px solid rgba(226,232,240,.8)}
        .completitudine-top{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px}
        .cl-label{font-size:15px;font-weight:700;color:#0f172a}
        .cl-pct{font-size:28px;font-weight:800;font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums}
        .progress-track{height:10px;background:#f0f2f5;border-radius:5px;overflow:hidden;display:flex;gap:2px;margin-bottom:10px}
        .progress-seg{height:100%;border-radius:4px;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .completitudine-legend{display:flex;gap:20px;font-size:12px;color:#64748b}
        .legend-item{display:flex;align-items:center;gap:6px}
        .legend-dot{width:8px;height:8px;border-radius:50%}
        .li-num{font-weight:700;font-family:'JetBrains Mono',monospace;color:#0f172a;font-variant-numeric:tabular-nums}
        .elemente-filter-bar{padding:12px 24px;display:flex;align-items:center;gap:8px;border-bottom:1px solid rgba(226,232,240,.8);background:#ffffff}
        .elem-search{padding:7px 14px;border-radius:8px;border:1px solid rgba(226,232,240,.8);background:#f0f2f5;color:#0f172a;font-size:13px;font-family:'Inter',system-ui,sans-serif;outline:none;width:180px;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .elem-search:focus{border-color:#2563eb}.elem-search::placeholder{color:#94a3b8}
        .fp-group{display:flex;background:#f0f2f5;border-radius:10px;padding:3px;gap:2px}
        .fp{padding:5px 14px;border-radius:8px;font-size:12px;font-weight:600;border:none;cursor:pointer;background:transparent;color:#64748b;font-family:'Inter',system-ui,sans-serif;transition:all .15s cubic-bezier(.4,0,.2,1);white-space:nowrap}
        .fp:hover{color:#0f172a}.fp.on{background:#2563eb;color:#ffffff;box-shadow:0 1px 3px rgba(37,99,235,.3)}
        .fp.on-green{background:#34d399;color:#ffffff}
        .fp.on-yellow{background:#fbbf24;color:#ffffff}
        .fp.on-red{background:#f87171;color:#ffffff}
        .fp.on-orange{background:#fb923c;color:#ffffff}
        .fp-count{font-size:10px;opacity:.7;margin-left:2px}
        .fp-sub-group{display:flex;align-items:center;gap:4px;margin-left:4px;padding-left:8px;border-left:1px solid rgba(226,232,240,.8)}
        .fp-sub-label{font-size:11px;color:#94a3b8;font-weight:600;white-space:nowrap}
        .fp-sub{padding:3px 10px;border-radius:8px;font-size:11px;font-weight:600;border:1px solid rgba(226,232,240,.8);cursor:pointer;background:transparent;color:#64748b;font-family:'Inter',system-ui,sans-serif;transition:all .15s cubic-bezier(.4,0,.2,1);white-space:nowrap}
        .fp-sub:hover{border-color:#ea580c;color:#ea580c}
        .fp-sub.active{background:rgba(251,146,60,.12);border-color:#ea580c;color:#ea580c}
        .elemente-filter-bar{flex-wrap:wrap}
        .bulk-confirm-bar{display:flex;align-items:center;justify-content:space-between;padding:8px 24px;background:rgba(251,146,60,.06);border-bottom:1px solid rgba(251,146,60,.2)}
        .bc-text{font-size:12px;color:#ea580c;font-weight:600}
        .bc-btn{padding:5px 16px;border-radius:8px;border:1px solid #34d399;background:rgba(52,211,153,.08);color:#059669;font-size:12px;font-weight:700;cursor:pointer;font-family:'Inter',system-ui,sans-serif;transition:all .15s}
        .bc-btn:hover:not(:disabled){background:rgba(52,211,153,.18)}
        .bc-btn:disabled{opacity:.5;cursor:not-allowed}
        .elemente-scroll{flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:10px}
        .elem-card{background:#ffffff;border:1px solid rgba(226,232,240,.8);border-radius:12px;padding:14px 18px;cursor:pointer;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .elem-card:hover{border-color:#cbd5e1;box-shadow:0 1px 3px rgba(0,0,0,.06)}
        .elem-card.active{border-color:#bfdbfe;background:rgba(37,99,235,.02);box-shadow:0 4px 12px rgba(37,99,235,.1)}
        .elem-card.warning{border-color:#fde68a;background:rgba(245,158,11,.03)}
        .elem-card.pending{border:1px dashed #cbd5e1;background:transparent}
        .ec-top{display:flex;align-items:center;gap:8px;margin-bottom:6px}
        .ec-key{font-size:11px;font-family:'JetBrains Mono',monospace;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em;font-weight:500}
        .ec-status{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px}
        .ec-status.confirmat{background:rgba(16,185,129,.12);color:#059669}
        .ec-status.propus_ai{background:rgba(245,158,11,.12);color:#d97706}
        .ec-status.gol{background:rgba(239,68,68,.08);color:#dc2626}
        .ec-label{font-size:15px;font-weight:600;color:#0f172a;margin-bottom:4px}
        .ec-value{font-size:13px;font-family:'JetBrains Mono',monospace;color:#2563eb}
        .ec-value.missing{color:#94a3b8;font-style:italic;font-family:'Inter',system-ui,sans-serif;font-size:13px}
        .ec-source{font-size:11px;color:#94a3b8;margin-top:6px;display:flex;align-items:center;gap:4px}
        .source-dot{width:6px;height:6px;border-radius:50%;display:inline-block}
        .source-dot.company_data{background:#34d399}
        .source-dot.onrc{background:#34d399}
        .source-dot.solomon_chat{background:#2563eb}
        .source-dot.solomon{background:#2563eb}
        .source-dot.manual{background:#a78bfa}
        .source-dot.calculated{background:#a78bfa;box-shadow:0 0 4px rgba(167,139,250,.4)}
        .source-dot.document{background:#fb923c}

        .elem-detail{width:350px;min-width:350px;border-left:1px solid rgba(226,232,240,.8);background:#f8fafc;overflow-y:auto;padding:20px}
        .ed-header{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;margin-bottom:16px}
        .ed-field{margin-bottom:16px}
        .ed-label{font-size:12px;color:#94a3b8;margin-bottom:4px}
        .ed-val{font-size:15px;font-weight:600;color:#0f172a;padding:10px 14px;border-radius:8px;border:1px solid rgba(226,232,240,.8);background:#f8fafc}
        .ed-btn{padding:8px 16px;border-radius:8px;border:1px solid #34d399;background:transparent;color:#059669;font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',system-ui,sans-serif;transition:all .15s cubic-bezier(.4,0,.2,1);display:flex;align-items:center;gap:4px}
        .ed-btn:hover{background:rgba(52,211,153,.1)}

        /* Checklist */
        .checklist-panel{padding:28px 32px;max-width:960px;overflow-y:auto;flex:1;min-height:0}
        .check-progress{display:flex;align-items:center;gap:20px;margin-bottom:24px;padding:22px;border-radius:12px;border:1px solid rgba(226,232,240,.8);background:#ffffff}
        .check-ring{width:80px;height:80px;position:relative;flex-shrink:0}
        .check-ring svg{transform:rotate(-90deg)}
        .check-ring-text{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;font-family:'JetBrains Mono',monospace;color:#0f172a;font-variant-numeric:tabular-nums}
        .check-info{flex:1}
        .check-info .ci-title{font-size:16px;font-weight:700;margin-bottom:4px;color:#0f172a}
        .check-info .ci-sub{font-size:13px;color:#64748b}
        .check-category{margin-bottom:16px}
        .check-cat-header{display:flex;align-items:center;gap:8px;padding:8px 0;cursor:pointer;font-size:14px;font-weight:700;color:#64748b}
        .check-cat-header:hover{color:#0f172a}
        .check-cat-count{font-size:11px;color:#94a3b8;font-family:'JetBrains Mono',monospace}
        .check-item{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;margin-bottom:4px;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .check-item:hover{background:#f1f5f9}
        .check-box{width:18px;height:18px;border-radius:5px;border:2px solid #cbd5e1;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .15s cubic-bezier(.4,0,.2,1);flex-shrink:0;font-size:11px}
        .check-box:hover{border-color:#94a3b8}
        .check-box.done{border-color:#059669;background:#34d399;color:#ffffff}
        .check-name{font-size:13px;font-weight:500;flex:1}
        .check-name.done-text{text-decoration:line-through;color:#94a3b8}
        .check-source-badge{font-size:9px;font-weight:700;text-transform:uppercase;padding:2px 6px;border-radius:3px;letter-spacing:.5px}
        .check-source-badge.ghid{background:rgba(37,99,235,.12);color:#2563eb}
        .check-source-badge.manual{background:rgba(167,139,250,.12);color:#7c3aed}
        .check-template{font-size:11px;color:#2563eb;cursor:pointer;white-space:nowrap}
        .check-template:hover{text-decoration:underline}

        /* Checklist Add Form */
        .check-add-bar{display:flex;gap:8px;margin-bottom:16px}
        .check-add-btn{padding:8px 16px;border-radius:8px;border:1px dashed rgba(226,232,240,.8);background:transparent;color:#94a3b8;font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',system-ui,sans-serif;transition:all .15s cubic-bezier(.4,0,.2,1);display:flex;align-items:center;gap:6px}
        .check-add-btn:hover{border-color:#7c3aed;color:#7c3aed}
        .check-add-form{padding:14px;background:#f8fafc;border-radius:12px;border:1px solid rgba(226,232,240,.8);margin-bottom:16px;display:flex;flex-direction:column;gap:8px}
        .check-add-form-row{display:flex;gap:8px}
        .check-add-input{flex:1;padding:7px 12px;border-radius:8px;border:1px solid rgba(226,232,240,.8);background:#f0f2f5;color:#0f172a;font-size:13px;font-family:'Inter',system-ui,sans-serif;outline:none;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .check-add-input:focus{border-color:#2563eb}
        .check-add-input::placeholder{color:#94a3b8}
        .check-add-submit{padding:7px 16px;border-radius:8px;border:none;background:#2563eb;color:#ffffff;font-size:12px;font-weight:700;cursor:pointer;font-family:'Inter',system-ui,sans-serif}
        .check-add-submit:disabled{opacity:.4;cursor:not-allowed}
        .check-add-cancel{padding:7px 12px;border-radius:8px;border:1px solid rgba(226,232,240,.8);background:transparent;color:#94a3b8;font-size:12px;cursor:pointer;font-family:'Inter',system-ui,sans-serif}

        /* Checklist Item Actions */
        .check-item-actions{position:relative}
        .check-actions-btn{background:none;border:none;color:#94a3b8;cursor:pointer;font-size:14px;padding:2px 6px;border-radius:8px;transition:all .15s cubic-bezier(.4,0,.2,1);line-height:1}
        .check-actions-btn:hover{background:#f1f5f9;color:#0f172a}
        .check-actions-menu{position:absolute;right:0;top:100%;z-index:20;background:#ffffff;border:1px solid rgba(226,232,240,.8);border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,.15);min-width:200px;padding:4px;animation:menuSlide .15s ease}
        @keyframes menuSlide{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
        .check-menu-item{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;font-size:12px;font-weight:500;cursor:pointer;transition:all .15s cubic-bezier(.4,0,.2,1);color:#64748b;border:none;background:none;width:100%;text-align:left;font-family:'Inter',system-ui,sans-serif}
        .check-menu-item:hover{background:#f1f5f9;color:#0f172a}
        .check-menu-item.danger{color:#dc2626}
        .check-menu-item.danger:hover{background:rgba(248,113,113,.08)}
        .check-menu-divider{height:1px;background:rgba(226,232,240,.8);margin:4px 0}
        .check-menu-sub{padding:4px 8px}
        .check-menu-sub-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;padding:4px 4px 6px;display:block}
        .check-menu-sub-item{display:block;padding:6px 8px;border-radius:8px;font-size:12px;cursor:pointer;color:#64748b;transition:all .15s cubic-bezier(.4,0,.2,1);border:none;background:none;width:100%;text-align:left;font-family:'Inter',system-ui,sans-serif}
        .check-menu-sub-item:hover{background:#f1f5f9;color:#0f172a}
        .check-menu-sub-item.active{color:#2563eb;font-weight:600}

        /* Template Mapper */
        .check-template-list{padding:4px 8px}
        .check-template-option{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;font-size:12px;cursor:pointer;color:#64748b;transition:all .15s cubic-bezier(.4,0,.2,1);border:none;background:none;width:100%;text-align:left;font-family:'Inter',system-ui,sans-serif}
        .check-template-option:hover{background:#f1f5f9;color:#0f172a}
        .check-template-option.mapped{color:#059669;font-weight:600}
        .check-template-badge{font-size:9px;font-weight:700;text-transform:uppercase;padding:2px 5px;border-radius:3px;background:rgba(37,99,235,.1);color:#2563eb}

        /* Unmapped Templates Warning */
        .check-unmapped{display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:10px;border:1px solid rgba(251,191,36,.2);background:rgba(251,191,36,.04);margin-bottom:16px;font-size:12px;color:#d97706}
        .check-unmapped-icon{font-size:16px;flex-shrink:0}
        .check-unmapped-text{flex:1;line-height:1.5}
        .check-unmapped strong{font-weight:700}

        /* Solomon Chat */
        .solomon-layout{display:flex;flex:1;overflow:hidden;background:#ffffff;min-height:0}
        .solomon-chat{flex:1;display:flex;flex-direction:column;min-width:0;overflow:hidden;position:relative;background:#ffffff}
        .solomon-chat.drag-active{outline:2px dashed #4d8bff;outline-offset:-4px;border-radius:8px}
        .solomon-drop-overlay{position:absolute;inset:0;background:rgba(77,139,255,.08);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:20;pointer-events:none;border-radius:8px}
        .solomon-drop-icon{font-size:40px;margin-bottom:8px}
        .solomon-drop-text{font-size:14px;font-weight:600;color:#4d8bff}
        .solomon-toolbar{padding:8px 20px;display:flex;align-items:center;gap:10px;background:#ffffff;border-bottom:none}
        .solomon-toolbar-inner{max-width:720px;margin:0 auto;width:100%;display:flex;align-items:center;gap:10px}
        .solomon-avatar{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#ea580c);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#ffffff;flex-shrink:0}
        .solomon-name-block{display:flex;flex-direction:column;gap:1px}
        .solomon-name-block .sn-name{font-size:15px;font-weight:700;color:#0f172a}
        .solomon-name-block .sn-status{font-size:11px;color:#059669;display:flex;align-items:center;gap:4px}
        .sn-status-dot{width:6px;height:6px;border-radius:50%;background:#34d399;animation:statusPulse 2s ease infinite}
        @keyframes statusPulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}
        .model-selector{display:flex;gap:3px;background:#f0f2f5;padding:3px;border-radius:8px;margin-left:auto}
        .model-btn{padding:5px 12px;font-size:12px;font-weight:600;border-radius:6px;border:none;cursor:pointer;background:transparent;color:#64748b;font-family:'JetBrains Mono',monospace;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .model-btn.active{background:#2563eb;color:#ffffff}
        .model-btn:hover:not(.active){color:#0f172a;background:#f1f5f9}
        .et-toggle{display:flex;align-items:center;gap:5px;font-size:11px;color:#64748b;cursor:pointer;padding:5px 10px;border-radius:8px;border:1px solid rgba(226,232,240,.8);background:transparent;font-family:'Inter',system-ui,sans-serif;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .et-toggle.on{border-color:#7c3aed;color:#7c3aed;background:rgba(167,139,250,.08)}
        .chat-messages{flex:1;overflow-y:auto;overflow-x:hidden;padding:24px 20px;min-height:0}
        .chat-messages-inner{max-width:720px;margin:0 auto;width:100%;display:flex;flex-direction:column;gap:24px}
        .solomon-msg{display:flex;gap:12px}
        .solomon-msg-avatar{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0}
        .solomon-msg-avatar.ai{background:linear-gradient(135deg,#f59e0b,#ea580c);color:#ffffff}
        .solomon-msg-avatar.user{background:#e2e8f0;color:#475569}
        .solomon-msg-body{flex:1;min-width:0}
        .solomon-msg-name{font-size:13px;font-weight:600;color:#0f172a;margin-bottom:4px}
        .solomon-msg-name span{font-weight:400;color:#94a3b8;margin-left:8px;font-size:12px}
        .solomon-msg-text{font-size:16px;line-height:1.65;color:#475569}
        .solomon-msg-text strong{color:#0f172a;font-weight:500}
        .chat-msg .msg-bold{font-weight:600;color:#0f172a}
        .extraction-cards{margin-top:12px;display:flex;flex-direction:column;gap:8px}
        .extraction-card{background:#f0f7ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 14px;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .extraction-card.confirmed{border-color:#a7f3d0;background:#ecfdf5}
        .extraction-card.rejected{border-color:#dc2626;opacity:.5;text-decoration:line-through}
        .exc-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
        .exc-label{font-size:12px;font-weight:500;color:#94a3b8}
        .exc-confidence{font-size:11px;color:#94a3b8}
        .exc-value{font-size:15px;font-weight:500;color:#0f172a;font-family:'SF Mono','Consolas','JetBrains Mono',monospace;margin-bottom:8px}
        .exc-actions{display:flex;gap:6px;margin-top:8px}
        .exc-btn{padding:5px 12px;border-radius:8px;border:none;font-size:13px;font-weight:500;cursor:pointer;font-family:'Inter',system-ui,sans-serif;display:flex;align-items:center;gap:4px;transition:all .15s cubic-bezier(.4,0,.2,1);background:transparent}
        .exc-btn.confirm-btn{background:#059669;color:#ffffff;border-radius:8px}
        .exc-btn.confirm-btn:hover{background:#047857}
        .exc-btn.edit-btn{color:#475569;background:transparent}
        .exc-btn.edit-btn:hover{background:#f1f5f9}
        .exc-btn.reject-btn{color:#dc2626;background:transparent}
        .exc-btn.reject-btn:hover{background:#fef2f2}
        .exc-confirmed-label{font-size:12px;font-weight:500;color:#059669;display:flex;align-items:center;gap:4px}
        .confirm-all-bar{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#eff6ff;border-radius:8px;margin-bottom:4px}
        .confirm-all-bar span{font-size:13px;color:#2563eb;font-weight:500}
        .chat-timestamp{font-size:10px;color:#94a3b8;margin-top:4px}
        .chat-input-area{padding:16px 20px;border-top:1px solid rgba(226,232,240,.8);background:#ffffff}
        .chat-input-inner{max-width:720px;margin:0 auto}
        .chat-input-row{display:flex;gap:8px;align-items:flex-end;background:#ffffff;border:1px solid rgba(226,232,240,.8);border-radius:20px;padding:10px 12px 10px 16px;transition:border-color .15s}
        .chat-input-row:focus-within{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.1)}
        .chat-input{flex:1;padding:8px 10px;border-radius:8px;border:none;background:transparent;color:#0f172a;font-size:14px;font-family:'Inter',system-ui,sans-serif;line-height:1.5;resize:none;outline:none;min-height:36px;max-height:160px;overflow-y:auto}
        .chat-input::placeholder{color:#94a3b8}
        .chat-btn{width:36px;height:36px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s cubic-bezier(.4,0,.2,1);flex-shrink:0}
        .chat-btn.send{background:#2563eb;color:#ffffff;font-size:16px}
        .chat-btn.send:hover{background:#1d4ed8}
        .chat-btn.upload-btn{background:transparent;color:#94a3b8;border:none;font-size:16px}
        .chat-btn.upload-btn:hover{color:#0f172a}
        .solomon-elements-panel{width:300px;min-width:260px;border-left:1px solid rgba(226,232,240,.8);background:#f8fafc;display:flex;flex-direction:column;overflow:hidden}
        .sep-header{padding:16px 16px 12px;border-bottom:1px solid rgba(226,232,240,.8);display:flex;flex-direction:column;gap:8px}
        .sep-header-top{display:flex;align-items:center;justify-content:space-between}
        .sep-header-title{font-size:14px;font-weight:700;color:#0f172a}
        .sep-count{font-size:13px;font-weight:700;color:#2563eb;font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums}
        .sep-progress-bar{height:4px;background:#f0f2f5;border-radius:2px;overflow:hidden}
        .sep-progress-fill{height:100%;background:#2563eb;border-radius:2px;transition:width .3s}
        .sep-scroll{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px}
        .sep-card{padding:12px 14px;border-radius:12px;border:1px solid rgba(226,232,240,.8);background:#f8fafc;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .sep-card:hover{border-color:#cbd5e1;box-shadow:0 1px 2px rgba(0,0,0,.04)}
        .sep-card.is-confirmed{border-left:3px solid #34d399}
        .sep-card.is-proposed{border-left:3px solid #fbbf24}
        .sep-card-label{font-size:13px;font-weight:700;color:#0f172a;margin-bottom:3px}
        .sep-card-value{font-size:14px;font-weight:600;color:#d97706;font-family:'JetBrains Mono',monospace;margin-bottom:6px;word-break:break-word}
        .sep-card.is-confirmed .sep-card-value{color:#059669}
        .sep-card-source{font-size:11px;color:#94a3b8;display:flex;align-items:center;gap:4px}
        .sep-confirm-row{margin-top:8px;display:flex;gap:6px}
        .sep-confirm-btn{padding:3px 10px;border-radius:8px;border:1px solid #34d399;background:transparent;color:#059669;font-size:11px;font-weight:600;cursor:pointer;font-family:'Inter',system-ui,sans-serif;display:flex;align-items:center;gap:3px;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .sep-confirm-btn:hover{background:rgba(52,211,153,.1)}
        .sep-reject-btn{padding:3px 10px;border-radius:8px;border:1px solid rgba(226,232,240,.8);background:transparent;color:#94a3b8;font-size:11px;font-weight:600;cursor:pointer;font-family:'Inter',system-ui,sans-serif;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .sep-reject-btn:hover{color:#dc2626;border-color:#dc2626}
        .sep-confirmed-badge{font-size:10px;color:#059669;font-weight:700;margin-top:6px;display:flex;align-items:center;gap:4px}
        .inline-refine-popup{position:fixed;z-index:1000;background:#ffffff;border:1px solid #2563eb;border-radius:12px;padding:12px;box-shadow:0 8px 32px rgba(0,0,0,.12),0 2px 8px rgba(0,0,0,.06);width:340px;animation:popIn .15s ease}
        @keyframes popIn{from{opacity:0;transform:translateY(4px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
        .refine-selected-text{font-size:12px;color:#64748b;background:#f0f2f5;padding:8px 10px;border-radius:8px;margin-bottom:8px;max-height:60px;overflow:hidden;border-left:3px solid #2563eb}
        .refine-input-row{display:flex;gap:6px}
        .refine-input{flex:1;padding:8px 12px;border-radius:8px;border:1px solid rgba(226,232,240,.8);background:#f0f2f5;color:#0f172a;font-size:13px;font-family:'Inter',system-ui,sans-serif;outline:none;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .refine-input:focus{border-color:#2563eb}
        .refine-submit{padding:8px 14px;border-radius:8px;border:none;background:#2563eb;color:#ffffff;font-size:13px;font-weight:600;cursor:pointer;font-family:'Inter',system-ui,sans-serif}

        /* Neemia */
        .neemia-layout{display:flex;flex:1;min-height:0}
        .neemia-templates{width:260px;min-width:260px;border-right:1px solid rgba(226,232,240,.8);padding:16px;overflow-y:auto}
        .neemia-templates h3{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;margin-bottom:12px}
        .template-card{padding:12px 14px;border-radius:12px;border:1px solid rgba(226,232,240,.8);margin-bottom:8px;cursor:pointer;transition:all .15s cubic-bezier(.4,0,.2,1);background:#ffffff}
        .template-card:hover{border-color:#cbd5e1;box-shadow:0 1px 3px rgba(0,0,0,.05)}
        .template-card.active{border-color:#2563eb;background:rgba(37,99,235,.03);box-shadow:0 0 0 1px rgba(37,99,235,.15)}
        .template-card .tc-name{font-size:14px;font-weight:600;display:flex;align-items:center;gap:6px;margin-bottom:4px}
        .tc-badge{font-size:10px;font-weight:700;padding:1px 5px;border-radius:3px;background:#f1f5f9;color:#94a3b8;font-family:'JetBrains Mono',monospace}
        .template-card .tc-info{font-size:12px;color:#64748b}
        .template-card .tc-progress{height:3px;background:#f0f2f5;border-radius:2px;margin-top:8px;overflow:hidden}
        .tc-progress-fill{height:100%;border-radius:2px;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .neemia-doc-view{flex:1;display:flex;flex-direction:column;min-width:0}
        .neemia-page-nav{padding:10px 20px;display:flex;align-items:center;gap:8px;border-bottom:1px solid rgba(226,232,240,.8);background:#ffffff}
        .neemia-page-nav .nav-label{font-size:13px;font-weight:600;color:#64748b;margin-right:4px;white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis}
        .nav-pages-scroll{display:flex;gap:4px;overflow-x:auto;flex:1;padding:2px 0}
        .page-thumb{min-width:32px;height:32px;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:12px;font-weight:700;cursor:pointer;border:2px solid transparent;transition:all .15s cubic-bezier(.4,0,.2,1);font-family:'JetBrains Mono',monospace;padding:2px 6px;font-variant-numeric:tabular-nums}
        .pt-num{font-size:12px;line-height:1}
        .pt-dot{width:4px;height:4px;border-radius:50%}
        .pt-dot.complete{background:#34d399}
        .pt-dot.partial{background:#fbbf24}
        .pt-dot.empty{background:#f87171}
        .page-thumb.complete{background:rgba(52,211,153,.12);color:#059669}
        .page-thumb.partial{background:rgba(251,191,36,.12);color:#d97706}
        .page-thumb.empty{background:rgba(248,113,113,.1);color:#dc2626}
        .page-thumb.active{border-color:#2563eb;box-shadow:0 0 0 2px rgba(37,99,235,.25)}
        .nav-stats{display:flex;align-items:center;gap:6px;margin-left:auto;white-space:nowrap}
        .nav-stat-filled{font-size:12px;font-weight:600;color:#64748b;font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums}
        .nav-stat-pct{font-size:14px;font-weight:800;font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums}
        .download-btn{display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:8px;border:none;background:#34d399;color:#ffffff;font-size:12px;font-weight:700;cursor:pointer;font-family:'Inter',system-ui,sans-serif;transition:all .15s cubic-bezier(.4,0,.2,1);white-space:nowrap;box-shadow:0 1px 3px rgba(5,150,105,.3)}
        .download-btn:hover{background:#059669;box-shadow:0 2px 6px rgba(5,150,105,.4)}
        .neemia-preview-area{flex:1;display:flex;overflow:hidden}

        /* Document page preview — pixel-perfect document */
        .neemia-doc-preview{flex:1;display:flex;align-items:flex-start;justify-content:center;background:#f0f2f5;padding:24px;overflow-y:auto}
        .ndp-page{width:520px;background:#ffffff;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,.15);padding:44px 40px 60px;color:#0f172a;position:relative;animation:pageSlide .4s ease}
        @keyframes pageSlide{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .ndp-header{margin-bottom:28px;padding-bottom:16px;border-bottom:2px solid #0f172a}
        .ndp-header-bar{height:4px;background:linear-gradient(90deg,#2563eb,#a78bfa,#34d399);border-radius:2px;margin-bottom:12px}
        .ndp-doc-type{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8;margin-bottom:4px}
        .ndp-doc-title{font-size:16px;font-weight:800;color:#0f172a;line-height:1.3}
        .ndp-group{margin-bottom:20px}
        .ndp-group-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:10px;padding:4px 0;border-bottom:1px solid rgba(226,232,240,.8)}
        .ndp-field{margin-bottom:12px}
        .ndp-field-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:#94a3b8;margin-bottom:3px}
        .ndp-field-line{display:flex;align-items:center;gap:6px;min-height:28px;padding:4px 0;border-bottom:1.5px solid rgba(226,232,240,.8)}
        .ndp-field.filled .ndp-field-line{border-bottom-color:#2563eb}
        .ndp-field.confirmed .ndp-field-line{border-bottom-color:#059669}
        .ndp-field-value{font-size:14px;font-weight:600;color:#0f172a;flex:1;word-break:break-word}
        .ndp-field.confirmed .ndp-field-value{color:#059669}
        .ndp-field-placeholder{font-size:13px;font-family:'JetBrains Mono',monospace;color:#cbd5e1;font-style:italic;flex:1}
        .ndp-field-indicator{width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0}
        .ndp-field-indicator.confirmed{background:rgba(52,211,153,.15);color:#059669;border:1.5px solid #34d399}
        .ndp-field-indicator.proposed{background:rgba(251,191,36,.15);color:#d97706;border:1.5px solid #fbbf24}
        .ndp-footer{position:absolute;bottom:16px;left:40px;right:40px;display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;font-family:'JetBrains Mono',monospace}
        .ndp-footer-stats{color:#94a3b8}

        /* Left fields panel */
        .neemia-fields-panel{width:380px;min-width:260px;max-width:600px;border-right:1px solid rgba(226,232,240,.8);display:flex;flex-direction:column;overflow:hidden;background:#ffffff;flex-shrink:0}
        /* Split drag handle */
        .neemia-split-handle{width:6px;cursor:col-resize;background:#ffffff;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s cubic-bezier(.4,0,.2,1);position:relative;z-index:2}
        .neemia-split-handle:hover,.neemia-split-handle:active{background:#cbd5e1}
        .nsh-dots{width:2px;height:32px;background:#94a3b8;border-radius:1px;opacity:.4;transition:opacity .15s}
        .neemia-split-handle:hover .nsh-dots{opacity:.8}
        .nfp-header{padding:14px 16px;border-bottom:1px solid rgba(226,232,240,.8)}
        .nfp-header h3{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;margin:0 0 8px}
        .nfp-stats{display:flex;gap:10px}
        .nfp-stat{font-size:10px;font-weight:600;display:flex;align-items:center;gap:3px}
        .nfp-stat::before{content:'';width:6px;height:6px;border-radius:50%}
        .nfp-stat.confirmed::before{background:#34d399}
        .nfp-stat.confirmed{color:#059669}
        .nfp-stat.filled::before{background:#fbbf24}
        .nfp-stat.filled{color:#d97706}
        .nfp-stat.empty::before{background:#f87171}
        .nfp-stat.empty{color:#dc2626}
        .nfp-scroll{flex:1;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:6px}
        .nfp-card{padding:10px 12px;border-radius:8px;border:1px solid rgba(226,232,240,.8);background:#f8fafc;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .nfp-card:hover{border-color:#cbd5e1}
        .nfp-card.is-confirmed{border-left:3px solid #34d399}
        .nfp-card.is-proposed{border-left:3px solid #fbbf24}
        .nfp-card.is-empty{border-left:3px solid #f87171;opacity:.7}
        .nfp-card-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}
        .nfp-card-label{font-size:12px;font-weight:600;color:#0f172a;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .nfp-card-status{font-size:10px;font-weight:700;flex-shrink:0}
        .nfp-card-status.confirmed{color:#059669}
        .nfp-card-status.proposed{color:#d97706}
        .nfp-card-status.empty{color:#dc2626}
        .nfp-card-value{font-size:13px;font-weight:500;color:#2563eb;font-family:'JetBrains Mono',monospace;word-break:break-word}
        .nfp-card-value.missing{color:#94a3b8;font-style:italic;font-size:11px}
        .nfp-card-source{font-size:10px;color:#94a3b8;margin-top:4px;display:flex;align-items:center;gap:4px}
        .nfp-card-type{font-size:9px;font-weight:600;color:#94a3b8;text-transform:uppercase;margin-top:3px;letter-spacing:.5px}
        .source-dot{width:6px;height:6px;border-radius:50%;display:inline-block}
        .source-dot.solomon{background:#2563eb}
        .source-dot.onrc{background:#34d399}
        .source-dot.manual{background:#a78bfa}
        .source-dot.calculat{background:#fb923c}
        .source-dot.ghid{background:#fbbf24}

        .neemia-bulk-btn{width:100%;padding:8px 16px;border-radius:8px;border:1px solid #34d399;background:rgba(52,211,153,.08);color:#059669;font-size:13px;font-weight:700;cursor:pointer;font-family:'Inter',system-ui,sans-serif;transition:all .15s cubic-bezier(.4,0,.2,1);margin-bottom:10px}
        .neemia-bulk-btn:hover:not(:disabled){background:rgba(52,211,153,.18)}
        .neemia-bulk-btn:disabled{opacity:.5;cursor:not-allowed}
        .neemia-gen-status{font-size:12px;color:#2563eb;background:rgba(37,99,235,.06);border:1px solid rgba(37,99,235,.15);border-radius:8px;padding:8px 12px;margin-bottom:10px;line-height:1.5}
        .neemia-warnings{font-size:11px;color:#d97706;background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.15);border-radius:8px;padding:8px 12px;margin-bottom:10px}
        .neemia-checklist-banner{border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:12px;line-height:1.5}
        .neemia-checklist-ok{background:rgba(52,211,153,.06);border:1px solid rgba(52,211,153,.2);color:#059669;font-weight:600}
        .neemia-checklist-critical{background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.25);color:#92400e}
        .neemia-checklist-critical .ncb-header{display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:12px;margin-bottom:4px}
        .neemia-checklist-critical .ncb-pct{font-size:11px;font-weight:600;color:#d97706;font-family:'JetBrains Mono',monospace}
        .neemia-checklist-critical .ncb-list{font-size:11px;color:#b45309;margin-bottom:4px}
        .neemia-checklist-critical .ncb-optional{font-size:10px;color:#92400e;opacity:.7;margin-bottom:6px}
        .neemia-checklist-critical .ncb-actions{display:flex;gap:6px}
        .ncb-btn{padding:4px 12px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid transparent;font-family:'Inter',system-ui,sans-serif;transition:all .15s}
        .ncb-btn-secondary{background:rgba(0,0,0,.04);border-color:rgba(0,0,0,.1);color:#475569}
        .ncb-btn-secondary:hover{background:rgba(0,0,0,.08)}
        .neemia-checklist-warn{background:rgba(0,0,0,.02);border:1px solid rgba(0,0,0,.06);padding:6px 12px}
        .nw-item{margin-bottom:4px;line-height:1.4}
        .nw-item:last-child{margin-bottom:0}
        .tc-action-btn{padding:3px 10px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;font-family:'Inter',system-ui,sans-serif;transition:all .15s cubic-bezier(.4,0,.2,1);border:1px solid rgba(226,232,240,.8);background:transparent}
        .tc-action-btn:hover:not(:disabled){border-color:#2563eb}
        .tc-action-btn:disabled{opacity:.4;cursor:not-allowed}
        .tc-download{color:#2563eb;border-color:#2563eb}
        .tc-generate{color:#059669;border-color:#059669}
        .tc-generate:hover:not(:disabled){background:rgba(52,211,153,.08);border-color:#059669}
        .tc-mode-badge{font-size:9px;font-weight:700;padding:1px 6px;border-radius:3px;text-transform:uppercase;letter-spacing:.5px;margin-left:4px}
        .tc-mode-badge.fill{background:rgba(37,99,235,.12);color:#2563eb}
        .tc-mode-badge.compose{background:rgba(167,139,250,.15);color:#7c3aed}
        .tc-preview{color:#7c3aed;border-color:#7c3aed}
        .tc-preview:hover:not(:disabled){background:rgba(167,139,250,.08);border-color:#7c3aed}
        .tc-versions{color:#64748b;border-color:rgba(226,232,240,.8)}
        .tc-versions:hover{background:#f1f5f9;color:#0f172a}
        .tc-versions-panel{margin-top:6px;padding:6px 0;border-top:1px solid rgba(226,232,240,.8)}
        .tc-version-row{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:11px}
        .tv-badge{background:#f1f5f9;color:#2563eb;font-weight:700;padding:1px 6px;border-radius:4px;font-family:'JetBrains Mono',monospace;font-size:10px}
        .tv-date{color:#64748b;font-size:11px}
        .tv-stats{color:#94a3b8;font-size:10px;margin-left:auto}
        .tv-mode{font-size:9px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:.5px}
        .tv-download{background:none;border:none;cursor:pointer;color:#2563eb;font-size:14px;padding:0 4px}
        .tv-download:hover{color:#059669}

        /* COMPOSE Preview Panel */
        .compose-preview-panel{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}
        .compose-preview-header{display:flex;align-items:center;gap:10px;padding:12px 20px;border-bottom:1px solid rgba(226,232,240,.8);background:#ffffff}
        .compose-preview-header h3{margin:0;font-size:13px;font-weight:700;color:#0f172a}
        .compose-model-badge{font-size:10px;font-family:'JetBrains Mono',monospace;padding:2px 8px;border-radius:4px;background:rgba(167,139,250,.1);color:#7c3aed;font-weight:600}
        .compose-stats{font-size:12px;color:#64748b;font-weight:600}
        .compose-generate-btn{padding:6px 16px;border-radius:8px;border:1px solid #34d399;background:rgba(52,211,153,.08);color:#059669;font-size:12px;font-weight:700;cursor:pointer;font-family:'Inter',system-ui,sans-serif;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .compose-generate-btn:hover:not(:disabled){background:rgba(52,211,153,.18)}
        .compose-generate-btn:disabled{opacity:.5;cursor:not-allowed}
        .compose-sections-list{flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:16px}
        .compose-section{border:1px solid rgba(226,232,240,.8);border-radius:12px;overflow:hidden;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .compose-section.approved{border-color:rgba(52,211,153,.4)}
        .cs-header{display:flex;align-items:center;gap:8px;padding:10px 14px;background:#f8fafc;border-bottom:1px solid rgba(226,232,240,.8)}
        .cs-type-badge{font-size:10px;font-weight:700;padding:2px 8px;border-radius:3px;text-transform:uppercase;letter-spacing:.5px}
        .cs-type-badge.narrative{background:rgba(37,99,235,.1);color:#2563eb}
        .cs-type-badge.table{background:rgba(167,139,250,.1);color:#7c3aed}
        .cs-type-badge.calculation{background:rgba(251,191,36,.1);color:#d97706}
        .cs-label{font-size:13px;font-weight:600;color:#0f172a}
        .cs-approve-btn{padding:3px 10px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid rgba(226,232,240,.8);background:transparent;color:#64748b;font-family:'Inter',system-ui,sans-serif;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .cs-approve-btn.active{border-color:#059669;color:#059669;background:rgba(52,211,153,.06)}
        .cs-edit-btn{padding:3px 10px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid rgba(226,232,240,.8);background:transparent;color:#2563eb;font-family:'Inter',system-ui,sans-serif;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .cs-edit-btn:hover{border-color:#2563eb;background:rgba(37,99,235,.06)}
        .cs-narrative{padding:14px;font-size:13px;line-height:1.7;color:#0f172a}
        .cs-narrative p{margin:0 0 10px}
        .cs-narrative p:last-child{margin-bottom:0}
        .cs-edit-area{padding:14px}
        .cs-textarea{width:100%;border:1px solid rgba(226,232,240,.8);border-radius:8px;background:#f0f2f5;color:#0f172a;font-family:'Inter',system-ui,sans-serif;font-size:13px;line-height:1.6;padding:10px;resize:vertical;min-height:120px;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .cs-textarea:focus{outline:none;border-color:#2563eb}
        .cs-edit-actions{display:flex;gap:8px;margin-top:8px;justify-content:flex-end}
        .cs-save-btn{padding:4px 14px;border-radius:8px;border:1px solid #34d399;background:rgba(52,211,153,.08);color:#059669;font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',system-ui,sans-serif}
        .cs-cancel-btn{padding:4px 14px;border-radius:8px;border:1px solid rgba(226,232,240,.8);background:transparent;color:#64748b;font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',system-ui,sans-serif}
        .cs-table-wrapper{padding:14px;overflow-x:auto}
        .cs-table-caption{font-size:12px;font-weight:700;color:#2563eb;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px}
        .cs-table{width:100%;border-collapse:collapse;font-size:12px;font-family:'Inter',system-ui,sans-serif}
        .cs-table th{padding:8px 10px;text-align:left;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.3px;border-bottom:2px solid rgba(226,232,240,.8)}
        .cs-table td{padding:6px 10px;border-bottom:1px solid rgba(226,232,240,.8);color:#0f172a}
        .cs-table .highlight-row{background:rgba(251,191,36,.1)}
        .cs-table .highlight-row td{font-weight:600;color:#d97706}
        .cs-table .alt-row{background:#f8fafc}
        .cs-table .footer-row{background:#f8fafc}
        .cs-table .footer-row td{color:#ffffff;font-weight:700;border-bottom:none}

        .neemia-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#94a3b8;gap:12px}
        .neemia-empty .ne-icon{font-size:40px;opacity:.5}
        .neemia-empty .ne-label{font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:1px}
        .neemia-empty .ne-desc{font-size:13px;color:#64748b;text-align:center;max-width:280px}

        .coming-soon{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;min-height:0;color:#94a3b8;gap:12px}
        .coming-soon .cs-icon{font-size:48px;opacity:.5}
        .coming-soon .cs-label{font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:1px}
        .coming-soon .cs-desc{font-size:13px;color:#64748b}

        /* ═══ RESPONSIVE ═══ */
        @media(max-width:1024px){
          .pv-project-header{padding:10px 16px}
          .pv-tabs{padding:0 16px}
          .neemia-layout{flex-direction:column}
          .neemia-templates{width:100%!important;min-width:100%!important;max-height:220px;border-right:none;border-bottom:1px solid rgba(226,232,240,.8);overflow-x:auto;display:flex;flex-wrap:nowrap;gap:8px;align-items:flex-start}
          .neemia-templates h3{white-space:nowrap}
          .template-card{min-width:220px;flex-shrink:0}
          .neemia-preview-area{flex-direction:column}
          .neemia-fields-panel{width:100%!important;max-height:300px}
          .neemia-split-handle{display:none}
          .solomon-elements-panel{width:260px;min-width:220px}
        }
        @media(max-width:768px){
          .pv-project-header{padding:8px 12px}
          .pv-tabs{padding:0 12px;gap:0}
          .pv-tab{padding:10px 12px;font-size:13px}
          .el-grid{grid-template-columns:1fr}
          .sg-stats{flex-direction:column;gap:8px}
          .neemia-templates{max-height:180px}
          .solomon-elements-panel{display:none}
          .sumar-panel{padding:20px 16px}
          .elig-panel{padding:16px}
        }
      `}</style>

      {lockError && (
        <div className="lock-banner">
          <span className="lb-icon">&#128274;</span>
          Proiectul este deschis de <span className="lb-name">{lockError.lockedByName}</span> — vizualizare doar în citire
          {lockError.lockedAt && <span className="lb-time">din {new Date(lockError.lockedAt).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" })}</span>}
        </div>
      )}

      <div className="pv-container" style={lockError ? { height: "calc(100% - 44px)" } : undefined}>
        {/* PROJECT HEADER — compact single line */}
        <div className="pv-project-header">
          <div className="pv-breadcrumb">
            <a onClick={() => router.push("/projects")}>Proiecte</a>
            <span className="pv-bc-sep">/</span>
          </div>
          <span className="pv-title">
            {projectFirma}{projectName && projectName !== projectFirma ? ` \u2014 ${projectName}` : ""}
          </span>
          <span className="pv-status-pill" style={{
            background: (STATUS_MAP[projectStatus] || STATUS_MAP.draft).bg,
            color: (STATUS_MAP[projectStatus] || STATUS_MAP.draft).color,
            borderColor: (STATUS_MAP[projectStatus] || STATUS_MAP.draft).color + "40",
          }}>
            {(STATUS_MAP[projectStatus] || STATUS_MAP.draft).label}
          </span>
        </div>
        <div className="pv-tabs">
          {([
            { key: "sumar" as LeafType, label: "Sumar" },
            { key: "eligibilitate" as LeafType, label: "Eligibilitate" },
            { key: "ghid" as LeafType, label: "Ghid" },
            { key: "solomon" as LeafType, label: "Solomon", badge: `${elemFilled}/${elemTotal}`, badgeClass: elemFilled === elemTotal && elemTotal > 0 ? "green" : elemFilled > 0 ? "blue" : "neutral" },
            { key: "elemente" as LeafType, label: "Elemente" },
            { key: "checklist" as LeafType, label: "Checklist doc" },
            { key: "neemia" as LeafType, label: "Neemia" },
          ]).map(tab => (
            <button
              key={tab.key}
              className={`pv-tab ${activeLeaf === tab.key ? "active" : ""}`}
              onClick={() => setActiveLeaf(tab.key)}
            >
              {tab.label}
              {tab.badge && <span className={`pv-tab-badge ${tab.badgeClass || "neutral"}`}>{tab.badge}</span>}
            </button>
          ))}
        </div>

        {/* MAIN CONTENT */}
        <div className="main-content">
          <div className="content-body">
            {/* SUMAR */}
            {activeLeaf === "sumar" && (() => {
              const progressPct = elemTotal > 0 ? pct(elemFilled, elemTotal) : 0;
              const generatedDocs = neemiaTemplates.filter(t => t.status === "generated" || t.status === "validated").length;

              // Build activity items from real data
              const activityItems: Array<{ icon: string; text: string; time: string; sortKey: number }> = [];

              // Solomon activity — count elements with source "solomon"
              const solomonElemCount = elements.filter(e => e.source === "solomon" || e.source === "solomon_chat").length;
              if (solomonElemCount > 0) {
                activityItems.push({ icon: "\uD83E\uDD16", text: `Solomon a completat ${solomonElemCount} elemente`, time: "recent", sortKey: 3 });
              }

              // Neemia activity — generated docs
              if (generatedDocs > 0) {
                activityItems.push({ icon: "\uD83D\uDCC4", text: `${generatedDocs} document${generatedDocs > 1 ? "e" : ""} generat${generatedDocs > 1 ? "e" : ""} de Neemia`, time: "recent", sortKey: 2 });
              }

              // Eligibility activity
              if (eligTotal > 0) {
                activityItems.push({
                  icon: "\u2705",
                  text: `Pre-eligibilitate verificată \u2014 ${eligPassed}/${eligTotal} criterii trecute`,
                  time: "recent",
                  sortKey: 1,
                });
              }

              // Checklist activity
              if (checkDone > 0) {
                activityItems.push({ icon: "\uD83D\uDCCB", text: `${checkDone}/${checkTotal} documente din checklist bifate`, time: "recent", sortKey: 0 });
              }

              return (
              <div className="sumar-panel">
                <div className="sumar-progress">
                  <div className="sp-card">
                    <div className="sp-val" style={{ color: "#2563eb" }}>{elemFilled}</div>
                    <div className="sp-label">Elemente completate</div>
                  </div>
                  <div className="sp-card">
                    <div className="sp-val" style={{ color: "#059669" }}>{progressPct}%</div>
                    <div className="sp-label">Progress total</div>
                  </div>
                  <div className="sp-card">
                    <div className="sp-val">{eligTotal}</div>
                    <div className="sp-label">Reguli verificate</div>
                  </div>
                  <div className="sp-card">
                    <div className="sp-val">{generatedDocs}</div>
                    <div className="sp-label">Documente generate</div>
                  </div>
                </div>

                {/* Activitate recentă */}
                {activityItems.length > 0 && (
                  <div className="sumar-activity" style={{ marginBottom: 24 }}>
                    <h3>Activitate recentă</h3>
                    {activityItems.map((item, i) => (
                      <div className="sa-item" key={i}>
                        <span className="sa-item-icon">{item.icon}</span>
                        <span className="sa-item-text">{item.text}</span>
                        <span className="sa-item-time">{item.time}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* GAP 1: Scor estimat proiect */}
                {projectScores && projectScores.maxTotalPoints > 0 && (
                  <div className="si-card" style={{ marginBottom: 12 }}>
                    <h3>Scor estimat</h3>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                      <span style={{
                        fontSize: 28, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace",
                        color: projectScores.percentage >= 80 ? "#059669" : projectScores.percentage >= 60 ? "#d97706" : "#dc2626",
                      }}>
                        {projectScores.totalPoints}/{projectScores.maxTotalPoints}
                      </span>
                      <span style={{
                        fontSize: 14, fontWeight: 700,
                        padding: "2px 8px", borderRadius: 6,
                        background: projectScores.percentage >= 80 ? "rgba(52,211,153,.15)" : projectScores.percentage >= 60 ? "rgba(251,191,36,.15)" : "rgba(248,113,113,.15)",
                        color: projectScores.percentage >= 80 ? "#059669" : projectScores.percentage >= 60 ? "#d97706" : "#dc2626",
                      }}>
                        {Math.round(projectScores.percentage)}%
                      </span>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: "rgba(0,0,0,.06)", overflow: "hidden", marginBottom: 10 }}>
                      <div style={{
                        height: "100%", borderRadius: 4, transition: "width .4s",
                        width: `${projectScores.percentage}%`,
                        background: projectScores.percentage >= 80 ? "#34d399" : projectScores.percentage >= 60 ? "#fbbf24" : "#f87171",
                      }} />
                    </div>
                    {projectScores.totalPoints < 56 && (
                      <div style={{
                        background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8,
                        padding: "10px 14px", marginBottom: 10, fontSize: 13, color: "#92400e",
                        display: "flex", alignItems: "center", gap: 8,
                      }}>
                        <span style={{ fontSize: 16 }}>⚠</span>
                        Punctajul estimat ({projectScores.totalPoints}p) este sub pragul de calitate de 56 puncte. Proiectul nu poate fi depus în luna curentă.
                      </div>
                    )}
                    {projectScores.scores.length > 0 && (
                      <div style={{ fontSize: 12 }}>
                        {projectScores.scores.map((s: any, i: number) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid rgba(0,0,0,.04)" }}>
                            <span style={{ color: "#64748b" }}>{s.code || s.name}</span>
                            <span style={{ fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
                              {s.points ?? "-"}/{s.maxPoints}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* GAP 2: Validare buget */}
                {budgetValidation?.summary && (
                  <div className="si-card" style={{ marginBottom: 12, borderColor: budgetValidation.summary.totalErrors > 0 ? "rgba(248,113,113,.4)" : undefined }}>
                    <h3 style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      Buget
                      {budgetValidation.summary.totalErrors > 0 && <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, background: "rgba(248,113,113,.15)", color: "#dc2626", fontWeight: 700 }}>{budgetValidation.summary.totalErrors} erori</span>}
                      {budgetValidation.summary.totalWarnings > 0 && <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, background: "rgba(251,191,36,.15)", color: "#d97706", fontWeight: 700 }}>{budgetValidation.summary.totalWarnings} atenționări</span>}
                    </h3>
                    <div className="si-row"><span className="si-label">Valoare totală</span><span className="si-value">{formatRON(budgetValidation.summary.totalBudget)}</span></div>
                    <div className="si-row"><span className="si-label">Valoare eligibilă</span><span className="si-value">{formatRON(budgetValidation.summary.eligibleAmount)}</span></div>
                    <div className="si-row"><span className="si-label">Grant ({budgetValidation.summary.grantPct}%)</span><span className="si-value">{formatRON(budgetValidation.summary.grantAmount)}</span></div>
                    <div className="si-row"><span className="si-label">Cofinanțare ({budgetValidation.summary.coFinancingPct}%)</span><span className="si-value">{formatRON(budgetValidation.summary.coFinancingAmount)}</span></div>
                    {budgetValidation.results.filter((r: any) => r.status !== "valid").map((r: any, i: number) => (
                      <div key={i} style={{ fontSize: 11, padding: "4px 6px", marginTop: 4, borderRadius: 4, background: r.status === "invalid" ? "rgba(248,113,113,.08)" : "rgba(251,191,36,.08)", color: r.status === "invalid" ? "#dc2626" : "#d97706" }}>
                        {r.label}: {r.validations?.filter((v: any) => !v.passed).map((v: any) => v.message).join("; ")}
                      </div>
                    ))}
                  </div>
                )}

                {/* GAP 8: Learnings din proiecte similare */}
                {learnings && learnings.totalApprovedSimilar > 0 && (
                  <div className="si-card" style={{ marginBottom: 12 }}>
                    <h3>Sfaturi din proiecte similare ({learnings.totalApprovedSimilar} aprobate)</h3>
                    {learnings.eligibilityInsights?.slice(0, 3).map((ins: any, i: number) => (
                      <div key={i} style={{ fontSize: 12, padding: "4px 0", borderBottom: "1px solid rgba(0,0,0,.04)" }}>
                        <span style={{ color: ins.commonOutcome === "passed" ? "#059669" : "#dc2626" }}>{ins.commonOutcome === "passed" ? "\u2713" : "\u2717"}</span>{" "}
                        <span style={{ color: "#64748b" }}>{ins.tip || ins.ruleDescription}</span>
                        <span style={{ float: "right", fontSize: 11, color: "#94a3b8" }}>{Math.round(ins.successRate * 100)}%</span>
                      </div>
                    ))}
                    {learnings.budgetPatterns?.avgBudget && (
                      <div style={{ fontSize: 12, marginTop: 6, color: "#64748b" }}>
                        Buget mediu similar: {formatRON(learnings.budgetPatterns.avgBudget)}
                      </div>
                    )}
                  </div>
                )}

                <div className="sumar-info">
                  <div className="si-card">
                    <h3>Date firmă</h3>
                    <div className="si-row"><span className="si-label">CUI</span><span className="si-value">{projectCui}</span></div>
                    <div className="si-row"><span className="si-label">Forma juridică</span><span className="si-value">{companyData?.formaJuridica || "-"}</span></div>
                    <div className="si-row"><span className="si-label">CAEN</span><span className="si-value" title={getCaenDescription(companyData?.caen) || undefined}>{companyData?.caen || "-"}{getCaenDescription(companyData?.caen) ? ` — ${getCaenDescription(companyData?.caen)!.slice(0, 35)}…` : ""}</span></div>
                    <div className="si-row"><span className="si-label">Localitate</span><span className="si-value">{localitate}, {judet}</span></div>
                  </div>
                  <div className="si-card">
                    <h3>Date financiare</h3>
                    <div className="si-row"><span className="si-label">Capital social</span><span className="si-value">{capitalSocial}</span></div>
                    <div className="si-row"><span className="si-label">Cifra afaceri</span><span className="si-value">{cifraAfaceri}</span></div>
                    <div className="si-row"><span className="si-label">Valoare proiect</span><span className="si-value">{projectValoare}</span></div>
                    {/* F3.2: Intensitate sprijin — computed from budget validation */}
                    {budgetValidation?.summary?.grantPct != null && (
                      <div className="si-row">
                        <span className="si-label">Intensitate sprijin</span>
                        <span className="si-value" style={{ color: "#2563eb" }}>{budgetValidation.summary.grantPct}%</span>
                      </div>
                    )}
                    {budgetValidation?.summary?.grantAmount != null && (
                      <div className="si-row">
                        <span className="si-label">Grant estimat</span>
                        <span className="si-value" style={{ color: "#059669" }}>{formatRON(budgetValidation.summary.grantAmount)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Program metadata (collected by Solomon) */}
                <div className="sumar-info">
                  <div className="si-card" style={{ gridColumn: "1 / -1" }}>
                    <h3>Program de finanțare</h3>
                    {project?.programFinantare ? (
                      <>
                        <div className="si-row"><span className="si-label">Program</span><span className="si-value">{project.programFinantare}</span></div>
                        {project.codMasura && <div className="si-row"><span className="si-label">Masura</span><span className="si-value">{project.codMasura}</span></div>}
                        {project.codSesiune && <div className="si-row"><span className="si-label">Sesiune</span><span className="si-value">{project.codSesiune}</span></div>}
                        {project.codNomenclator && <div className="si-row"><span className="si-label">Cod nomenclator</span><span className="si-value">{project.codNomenclator}</span></div>}
                        {project.prefixDocumente && <div className="si-row"><span className="si-label">Prefix documente</span><span className="si-value font-mono text-blue-600">{project.prefixDocumente}</span></div>}
                        {project.codMysmis && <div className="si-row"><span className="si-label">Cod MySMIS</span><span className="si-value">{project.codMysmis}</span></div>}
                        {project.structuraDosar && (
                          <div className="si-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                            <span className="si-label">Structura dosar</span>
                            <span className="si-value" style={{ fontSize: 12, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{project.structuraDosar}</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-xs text-[#94a3b8] py-2">
                        Nu a fost identificat inca. Deschide Solomon pentru a confirma programul de finantare.
                      </div>
                    )}
                  </div>
                </div>

                <div className="sumar-actions">
                  <button className="sa-btn primary" onClick={() => setActiveLeaf("eligibilitate")}>&#128737; Verifică eligibilitate</button>
                  <button className="sa-btn" onClick={() => setActiveLeaf("solomon")}>&#129302; Deschide Solomon</button>
                  <button className="sa-btn" onClick={() => setActiveLeaf("neemia")}>&#128196; Generează documente</button>
                </div>
              </div>
              );
            })()}

            {/* ELIGIBILITATE */}
            {activeLeaf === "eligibilitate" && (() => {
              const eligCategoryLabels: Record<string, string> = {
                eligibilitate: "Eligibilitate", financiar: "Financiar", tehnic: "Tehnic", administrativ: "Administrativ",
                achizitii: "Achiziții", documente: "Documente", selectie: "Selecție", intensitate: "Intensitate",
                eligibilitate_complexa: "Elig. complexă", documentare: "Documentare", ajutor_stat: "Ajutor stat",
              };
              const eligCategoryColors: Record<string, string> = {
                eligibilitate: "#2563eb", financiar: "#059669", tehnic: "#7c3aed", administrativ: "#64748b",
                achizitii: "#ea580c", documente: "#d97706", selectie: "#dc2626", intensitate: "#0891b2",
                eligibilitate_complexa: "#2563eb", documentare: "#d97706", ajutor_stat: "#7c3aed",
              };
              const eligStatusColors: Record<string, string> = { pass: "#059669", fail: "#dc2626", pending: "#d97706" };
              const eligStatusIcons: Record<string, string> = { pass: "✓", fail: "✕", pending: "?" };
              const eligStatusLabels: Record<string, string> = { pass: "ELIGIBIL", fail: "NEELIGIBIL", pending: "PENDING" };

              if (eligibilityRules.length === 0) {
                return (
                  <div className="elig-panel" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 200, color: "#8892a8" }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>&#128737;</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>Nicio regulă de eligibilitate</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>Procesează un ghid de finanțare pentru a vedea regulile de eligibilitate</div>
                  </div>
                );
              }
              return (
              <div className="elig-panel">
                <div className="elig-summary">
                  <div className="elig-stat">
                    <div className="number text-emerald-500">{eligibilityRules.filter(r => r.status === "pass").length}</div>
                    <div className="label">Trecute</div>
                  </div>
                  <div className="elig-stat">
                    <div className="number text-red-500">{eligibilityRules.filter(r => r.status === "fail").length}</div>
                    <div className="label">Eșuate</div>
                  </div>
                  <div className="elig-stat">
                    <div className="number text-amber-500">{eligibilityRules.filter(r => r.status === "pending").length}</div>
                    <div className="label">Pending</div>
                  </div>
                  <div className="elig-stat">
                    <div className="number">{eligibilityRules.length}</div>
                    <div className="label">Total</div>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {eligibilityRules.map(rule => (
                    <div className={`elig-rule ${rule.status}-bg`} key={rule.id}>
                      <div className={`elig-icon ${rule.status}`}>
                        {eligStatusIcons[rule.status]}
                      </div>
                      <span className={`elig-name ${rule.status}-text`}>
                        {rule.name}
                        {rule.status === "pending" && rule.detail && (
                          <span style={{ fontWeight: 400 }}> — {rule.detail}</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 16 }}>
                  <button className="sa-btn primary" style={{ display: "inline-flex" }} onClick={handleRecheckEligibility} disabled={recheckLoading}>
                    {recheckLoading ? "Se verifică..." : "🔄 Re-verifică eligibilitate"}
                  </button>
                </div>
              </div>
              );
            })()}

            {/* GHID FINANȚARE */}
            {activeLeaf === "ghid" && (() => {
              const categoryLabels: Record<string, string> = {
                eligibilitate: "Eligibilitate", financiar: "Financiar", tehnic: "Tehnic", administrativ: "Administrativ",
                achizitii: "Achiziții", documente: "Documente", selectie: "Selecție", intensitate: "Intensitate",
                eligibilitate_complexa: "Elig. complexă", documentare: "Documentare", ajutor_stat: "Ajutor stat",
              };
              const categoryColors: Record<string, string> = {
                eligibilitate: "#2563eb", financiar: "#059669", tehnic: "#7c3aed", administrativ: "#64748b",
                achizitii: "#ea580c", documente: "#d97706", selectie: "#dc2626", intensitate: "#0891b2",
                eligibilitate_complexa: "#2563eb", documentare: "#d97706", ajutor_stat: "#7c3aed",
              };
              const categories = [...new Set(guideRules.map(r => r.category))].filter(Boolean);
              const filteredRules = ghidCategoryFilter === "all" ? guideRules : guideRules.filter(r => r.category === ghidCategoryFilter);
              const sel = selectedRule ? guideRules.find(r => r.id === selectedRule) : null;

              const guideTrustScore = (project as any)?.guideTrustScore as number | null;

              if (guideRules.length === 0) {
                return (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 200, color: "#8892a8", padding: 24 }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>&#128214;</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>Nicio regulă extrasă încă</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>Uploadează un ghid de finanțare pentru a extrage regulile automat</div>
                  </div>
                );
              }

              return (
              <div className="ghid-layout">
                {guideTrustScore != null && guideTrustScore < 0.7 && (
                  <div style={{
                    padding: "10px 14px",
                    marginBottom: 10,
                    background: "rgba(251,191,36,.1)",
                    border: "1px solid rgba(251,191,36,.3)",
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13,
                    color: "#d97706",
                  }}>
                    <span style={{ fontSize: 16 }}>&#9888;</span>
                    <span>
                      Procesarea ghidului poate fi incomplet&#259; (trust score: {Math.round(guideTrustScore * 100)}%).
                      Verifica&#539;i regulile extrase.
                    </span>
                  </div>
                )}
                {guideTrustScore != null && (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 8,
                    fontSize: 12,
                  }}>
                    <span style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontWeight: 700,
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 11,
                      background: guideTrustScore >= 0.8 ? "rgba(52,211,153,.15)" : guideTrustScore >= 0.6 ? "rgba(251,191,36,.15)" : "rgba(248,113,113,.15)",
                      color: guideTrustScore >= 0.8 ? "#059669" : guideTrustScore >= 0.6 ? "#d97706" : "#dc2626",
                    }}>
                      Trust: {Math.round(guideTrustScore * 100)}%
                    </span>
                    <span style={{ color: "#94a3b8" }}>completitudine extragere ghid</span>
                  </div>
                )}
                <div className="ghid-sub-tabs">
                  <button className={`ghid-sub-tab ${ghidTab === "reguli" ? "active" : ""}`} onClick={() => setGhidTab("reguli")}>Reguli ({guideRules.length})</button>
                  <button className={`ghid-sub-tab ${ghidTab === "anexe" ? "active" : ""}`} onClick={() => setGhidTab("anexe")}>Anexe & Date ({referenceTables.length})</button>
                  <button className={`ghid-sub-tab ${ghidTab === "ghid" ? "active" : ""}`} onClick={() => setGhidTab("ghid")}>Ghid complet</button>
                </div>
                <div className="ghid-split">
                  {ghidTab === "anexe" ? (
                    <div className="anexe-panel">
                      <div className="anexe-list">
                        {referenceTables.length === 0 ? (
                          <div className="anexe-empty">
                            <div style={{ fontSize: 32, marginBottom: 8 }}>&#128202;</div>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>Nicio tabelă de referință</div>
                            <div className="text-xs text-[#94a3b8]">Uploadează anexe cu date structurate în folderul Ghiduri (tipul "Anexă cu date") pentru a extrage automat tabelele de referință.</div>
                          </div>
                        ) : referenceTables.map(rt => (
                          <div
                            key={rt.id}
                            className={`anexe-card ${selectedRefTable === rt.id ? "active" : ""}`}
                            onClick={() => setSelectedRefTable(rt.id)}
                          >
                            <div className="anexe-card-top">
                              <span className={`anexe-type-badge ${rt.tableType}`}>
                                {rt.tableType === "lookup" ? "LOOKUP" : rt.tableType === "classification" ? "CLASIFICARE" : rt.tableType === "list" ? "LISTĂ" : "MATRICE"}
                              </span>
                              {rt.validated && <span className="anexe-validated">&#10003;</span>}
                            </div>
                            <div className="anexe-card-name">{rt.name}</div>
                            {rt.description && <div className="anexe-card-desc">{rt.description}</div>}
                            <div className="anexe-card-meta">
                              <span>{(rt.data || []).length} rânduri</span>
                              {rt.sourcePage && <span>Pag. {rt.sourcePage}</span>}
                              <span>{rt.extractedBy === "ai" ? "AI" : "Manual"}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="anexe-detail">
                        {selectedRefTable && (() => {
                          const rt = referenceTables.find((t: any) => t.id === selectedRefTable);
                          if (!rt) return null;
                          const cols = rt.schema || [];
                          const rows = rt.data || [];
                          return (
                            <div className="anexe-detail-content">
                              <div className="anexe-detail-header">
                                <div className="anexe-detail-title">{rt.name}</div>
                                <div className="anexe-detail-badges">
                                  <span className={`anexe-type-badge ${rt.tableType}`}>
                                    {rt.tableType === "lookup" ? "LOOKUP" : rt.tableType === "classification" ? "CLASIFICARE" : rt.tableType === "list" ? "LISTĂ" : "MATRICE"}
                                  </span>
                                  {rt.validated ? (
                                    <span className="text-[11px] text-emerald-500">&#10003; Validat</span>
                                  ) : (
                                    <button className="sa-btn primary" style={{ fontSize: 11, padding: "3px 10px" }}
                                      onClick={async () => {
                                        await apiPut(`/api/reference/tables/${rt.id}`, { validated: true });
                                        setReferenceTables(prev => prev.map(t => t.id === rt.id ? { ...t, validated: true } : t));
                                      }}>
                                      &#10003; Validează
                                    </button>
                                  )}
                                </div>
                              </div>
                              {rt.description && <div className="anexe-detail-desc">{rt.description}</div>}
                              {rt.lookupKey && <div className="anexe-detail-lookup">Cheie lookup: <code>{rt.lookupKey}</code></div>}

                              {cols.length > 0 && rows.length > 0 && (
                                <div className="anexe-table-wrapper">
                                  <table className="anexe-table">
                                    <thead>
                                      <tr>
                                        {cols.map((col: any) => (
                                          <th key={col.key}>{col.label}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {rows.slice(0, 50).map((row: any, ri: number) => (
                                        <tr key={ri}>
                                          {cols.map((col: any) => (
                                            <td key={col.key}>{String(row[col.key] ?? "")}</td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                  {rows.length > 50 && (
                                    <div className="text-[11px] text-[#94a3b8] px-3 py-2">
                                      ... și încă {rows.length - 50} rânduri
                                    </div>
                                  )}
                                </div>
                              )}

                              {rt.sourceText && (
                                <div className="anexe-source-text">
                                  <div className="anexe-source-label">Text sursă (pag. {rt.sourcePage || "?"})</div>
                                  <div className="anexe-source-quote">{rt.sourceText}</div>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {!selectedRefTable && (
                          <div className="rd-empty">
                            <div className="rd-empty-icon">&#128202;</div>
                            <div className="rd-empty-title">Selectează o tabelă</div>
                            <div className="rd-empty-desc">Alege o tabelă de referință din lista din stânga pentru a vedea datele structurate, coloanele și rândurile extrase.</div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : ghidTab === "reguli" ? (
                    <>
                      <div className="rules-panel">
                        {/* Category filter chips */}
                        <div className="rule-category-filters">
                          <button className={`rcf-chip ${ghidCategoryFilter === "all" ? "active" : ""}`} onClick={() => setGhidCategoryFilter("all")}>
                            Toate <span className="rcf-count">{guideRules.length}</span>
                          </button>
                          {categories.map(cat => (
                            <button key={cat} className={`rcf-chip ${ghidCategoryFilter === cat ? "active" : ""}`} onClick={() => setGhidCategoryFilter(cat)}
                              style={{ "--chip-color": categoryColors[cat] || "#94a3b8" } as React.CSSProperties}>
                              {categoryLabels[cat] || cat} <span className="rcf-count">{guideRules.filter(r => r.category === cat).length}</span>
                            </button>
                          ))}
                        </div>

                        <div className="rules-scroll">
                          {filteredRules.map(r => (
                            <div className={`rule-card ${selectedRule === r.id ? "active" : ""}`} key={r.id} onClick={() => setSelectedRule(r.id)}>
                              <div className="rule-card-top">
                                <div className={`rule-type-badge ${r.type}`}>
                                  {r.type === "fixed" ? "FIXĂ" : "INTERPRETATĂ"}
                                </div>
                                <span className="rule-cat-dot" style={{ background: categoryColors[r.category] || "#94a3b8" }} />
                                <span className="rule-cat-label">{categoryLabels[r.category] || r.category}</span>
                                {r.needsReview && <span className="rule-review-flag">⚠ Review</span>}
                                {r.validated && <span className="rule-validated-flag">✓</span>}
                              </div>
                              <div className="rule-text">{r.text}</div>
                              <div className="rule-meta">
                                <span>Pag. {r.page}</span>
                                <span>
                                  {Math.round(r.confidence * 100)}%
                                  <span className="confidence-bar"><span className="confidence-fill" style={{ width: `${r.confidence * 100}%`, background: r.confidence > 0.9 ? "#34d399" : r.confidence > 0.8 ? "#2563eb" : "#fbbf24" }} /></span>
                                </span>
                                {r.sourceDocument && <span className="rule-doc-ref">{r.sourceDocument.name}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Rule detail panel */}
                      <div className="rule-detail-panel">
                        {sel ? (
                          <div className="rd-content">
                            {/* Header */}
                            <div className="rd-header">
                              <div className="rd-badges">
                                <div className={`rule-type-badge ${sel.type}`}>{sel.type === "fixed" ? "REGULĂ FIXĂ" : "REGULĂ INTERPRETATĂ"}</div>
                                <span className="rd-cat-pill" style={{ background: `color-mix(in srgb, ${categoryColors[sel.category] || "#64748b"} 12%, transparent)`, color: categoryColors[sel.category] || "#94a3b8", border: `1px solid color-mix(in srgb, ${categoryColors[sel.category] || "#64748b"} 25%, transparent)` }}>
                                  {categoryLabels[sel.category] || sel.category}
                                </span>
                                {sel.validated && <span className="rd-validated">✓ Validată</span>}
                                {sel.needsReview && <span className="rd-needs-review">⚠ Necesită review</span>}
                              </div>
                              <div className="rd-confidence-row">
                                <span className="rd-conf-label">Încredere</span>
                                <span className="rd-conf-value" style={{ color: sel.confidence > 0.9 ? "#059669" : sel.confidence > 0.8 ? "#2563eb" : "#d97706" }}>
                                  {Math.round(sel.confidence * 100)}%
                                </span>
                                <div className="rd-conf-bar">
                                  <div className="rd-conf-fill" style={{ width: `${sel.confidence * 100}%`, background: sel.confidence > 0.9 ? "#34d399" : sel.confidence > 0.8 ? "#2563eb" : "#fbbf24" }} />
                                </div>
                              </div>
                            </div>

                            {/* Description */}
                            <div className="rd-section">
                              <div className="rd-section-title">Descriere regulă</div>
                              <div className="rd-description">{sel.text}</div>
                            </div>

                            {/* Source text from guide */}
                            {sel.sourceText && (
                              <div className="rd-section">
                                <div className="rd-section-title">
                                  Text original din ghid
                                  <span className="rd-page-ref">Pag. {sel.page}</span>
                                </div>
                                <div className="rd-source-text">
                                  <div className="rd-source-quote">{sel.sourceText}</div>
                                </div>
                              </div>
                            )}

                            {/* Condition / logic */}
                            {sel.condition && (
                              <div className="rd-section">
                                <div className="rd-section-title">
                                  {sel.type === "fixed" ? "Condiție verificare" : "Logică decizională"}
                                </div>
                                <div className="rd-condition">
                                  {sel.type === "fixed" && sel.condition.field && (
                                    <div className="rd-cond-row">
                                      <span className="rd-cond-field">{sel.condition.field}</span>
                                      <span className="rd-cond-op">{sel.condition.operator}</span>
                                      <span className="rd-cond-val">
                                        {Array.isArray(sel.condition.value) ? sel.condition.value.join(", ") : String(sel.condition.value)}
                                        {sel.condition.value2 && ` — ${sel.condition.value2}`}
                                      </span>
                                    </div>
                                  )}
                                  {sel.type === "interpreted" && (
                                    <>
                                      {sel.condition.type && (
                                        <div className="rd-logic-type">
                                          <span className="rd-logic-badge">{sel.condition.type.replace(/_/g, " ")}</span>
                                        </div>
                                      )}
                                      {sel.condition.logic && (
                                        <div className="rd-logic-desc">{sel.condition.logic}</div>
                                      )}
                                      {sel.condition.factors && sel.condition.factors.length > 0 && (
                                        <div className="rd-factors">
                                          <span className="rd-factors-label">Factori:</span>
                                          {sel.condition.factors.map((f: string, i: number) => (
                                            <span key={i} className="rd-factor-chip">{f}</span>
                                          ))}
                                        </div>
                                      )}
                                      {sel.condition.outcomes && sel.condition.outcomes.length > 0 && (
                                        <div className="rd-outcomes">
                                          {sel.condition.outcomes.map((o: any, i: number) => (
                                            <div key={i} className="rd-outcome-row">
                                              <span className="rd-outcome-if">DACĂ</span>
                                              <span className="rd-outcome-cond">{o.if}</span>
                                              <span className="rd-outcome-then">→</span>
                                              <span className="rd-outcome-result">{o.then}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Source document */}
                            {sel.sourceDocument && (
                              <div className="rd-section">
                                <div className="rd-section-title">Sursă document</div>
                                <div className="rd-doc-ref">
                                  <span className="rd-doc-icon">{sel.sourceDocument.fileType === "pdf" ? "📕" : sel.sourceDocument.fileType === "docx" ? "📘" : "📗"}</span>
                                  <span className="rd-doc-name">{sel.sourceDocument.name}</span>
                                  <span className="rd-doc-page">Pag. {sel.page}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="rd-empty">
                            <div className="rd-empty-icon">📖</div>
                            <div className="rd-empty-title">Selectează o regulă</div>
                            <div className="rd-empty-desc">Alege o regulă din lista din stânga pentru a vedea detaliile complete, textul original din ghid și condiția de verificare.</div>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    /* ─── GHID COMPLET: PDF Viewer + Rules sidebar ─── */
                    ghidViewerLoading ? (
                      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 13, gap: 8 }}>
                        <span style={{ fontSize: 20 }}>{"\u2699"}</span> Se încarcă ghidul...
                      </div>
                    ) : !ghidViewerData || ghidViewerData.guides.length === 0 ? (
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "#94a3b8" }}>
                        <span style={{ fontSize: 40, opacity: 0.3 }}>{"\u{1F4D6}"}</span>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>Niciun ghid uploadat</span>
                        <span style={{ fontSize: 12 }}>Uploadă un ghid în folderul Ghiduri al sesiunii</span>
                      </div>
                    ) : (() => {
                      const guide = ghidViewerData.guides[0];
                      const pageRules = guide.rulesByPage[String(ghidViewerPage)] || [];
                      const totalPages = guide.pageCount || 1;
                      const CATEGORY_COLORS: Record<string, string> = {
                        eligibilitate: "#2563eb", financiar: "#059669", tehnic: "#7c3aed", administrativ: "#64748b",
                        achizitii: "#ea580c", documente: "#d97706", selectie: "#dc2626", intensitate: "#0891b2",
                      };
                      return (
                        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
                          {/* PDF iframe */}
                          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                            {/* Page navigation bar */}
                            <div style={{
                              display: "flex", alignItems: "center", gap: 10, padding: "8px 16px",
                              background: "#f8fafc", borderBottom: "1px solid rgba(226,232,240,.8)", flexShrink: 0,
                            }}>
                              <button
                                onClick={() => setGhidViewerPage(p => Math.max(1, p - 1))}
                                disabled={ghidViewerPage <= 1}
                                style={{
                                  background: "none", border: "1px solid rgba(226,232,240,.8)", borderRadius: 6,
                                  padding: "4px 10px", cursor: ghidViewerPage <= 1 ? "not-allowed" : "pointer",
                                  color: ghidViewerPage <= 1 ? "#cbd5e1" : "#0f172a", fontSize: 12, fontWeight: 600,
                                }}
                              >
                                {"\u25C0"} Anterior
                              </button>
                              <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: "#0f172a" }}>
                                Pag. {ghidViewerPage} / {totalPages}
                              </span>
                              <button
                                onClick={() => setGhidViewerPage(p => Math.min(totalPages, p + 1))}
                                disabled={ghidViewerPage >= totalPages}
                                style={{
                                  background: "none", border: "1px solid rgba(226,232,240,.8)", borderRadius: 6,
                                  padding: "4px 10px", cursor: ghidViewerPage >= totalPages ? "not-allowed" : "pointer",
                                  color: ghidViewerPage >= totalPages ? "#cbd5e1" : "#0f172a", fontSize: 12, fontWeight: 600,
                                }}
                              >
                                Următor {"\u25B6"}
                              </button>
                              <div style={{ flex: 1 }} />
                              <span style={{ fontSize: 11, color: "#64748b" }}>
                                {guide.name}
                              </span>
                              {guide.downloadUrl && (
                                <a
                                  href={guide.downloadUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    fontSize: 11, color: "#2563eb", fontWeight: 600, textDecoration: "none",
                                    padding: "3px 8px", borderRadius: 6, border: "1px solid rgba(37,99,235,.2)",
                                  }}
                                >
                                  {"\u{1F4E5}"} Descarcă
                                </a>
                              )}
                            </div>
                            {/* PDF embed */}
                            {guide.downloadUrl ? (
                              <iframe
                                src={`${guide.downloadUrl}#page=${ghidViewerPage}`}
                                style={{ flex: 1, border: "none", background: "#f0f2f5" }}
                                title="Ghid PDF"
                              />
                            ) : (
                              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 13 }}>
                                PDF-ul nu este disponibil pentru vizualizare
                              </div>
                            )}
                          </div>
                          {/* Rules sidebar for current page */}
                          <div style={{
                            width: 280, flexShrink: 0, borderLeft: "1px solid rgba(226,232,240,.8)",
                            display: "flex", flexDirection: "column", overflow: "hidden", background: "#ffffff",
                          }}>
                            <div style={{
                              padding: "10px 14px", borderBottom: "1px solid rgba(226,232,240,.8)",
                              fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".6px", color: "#94a3b8",
                              display: "flex", justifyContent: "space-between", alignItems: "center",
                            }}>
                              <span>Reguli pe pagina {ghidViewerPage}</span>
                              <span style={{ fontFamily: "'JetBrains Mono', monospace", color: pageRules.length > 0 ? "#2563eb" : "#cbd5e1" }}>
                                {pageRules.length}
                              </span>
                            </div>
                            <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
                              {pageRules.length === 0 ? (
                                <div style={{ padding: "24px 14px", textAlign: "center", color: "#cbd5e1", fontSize: 12 }}>
                                  Nicio regulă pe această pagină
                                </div>
                              ) : pageRules.map((rule: any) => (
                                <div
                                  key={rule.id}
                                  style={{
                                    padding: "8px 12px", margin: "2px 6px", borderRadius: 8,
                                    border: "1px solid rgba(226,232,240,.6)", cursor: "pointer",
                                    transition: "all .15s",
                                  }}
                                  onClick={() => { setGhidTab("reguli"); setSelectedRule(rule.id); }}
                                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#f8fafc"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(37,99,235,.3)"; }}
                                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(226,232,240,.6)"; }}
                                >
                                  <div style={{ display: "flex", gap: 5, marginBottom: 4, alignItems: "center" }}>
                                    <span style={{
                                      fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3,
                                      background: rule.type === "fixed" ? "rgba(52,211,153,.1)" : "rgba(251,191,36,.1)",
                                      color: rule.type === "fixed" ? "#059669" : "#d97706",
                                    }}>
                                      {rule.type === "fixed" ? "FIXĂ" : "INTER"}
                                    </span>
                                    {rule.category && (
                                      <span style={{
                                        fontSize: 9, padding: "1px 5px", borderRadius: 9999,
                                        background: (CATEGORY_COLORS[rule.category] || "#64748b") + "15",
                                        color: CATEGORY_COLORS[rule.category] || "#64748b", fontWeight: 600,
                                      }}>
                                        {rule.category}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{
                                    fontSize: 11, color: "#0f172a", lineHeight: 1.4,
                                    display: "-webkit-box", WebkitLineClamp: 3,
                                    WebkitBoxOrient: "vertical" as const, overflow: "hidden",
                                  }}>
                                    {rule.description}
                                  </div>
                                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                                    <span style={{
                                      fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                                      color: parseFloat(rule.confidence) >= 0.85 ? "#059669" : "#d97706", fontWeight: 600,
                                    }}>
                                      {Math.round(parseFloat(rule.confidence || "0") * 100)}%
                                    </span>
                                    {rule.validated && <span style={{ fontSize: 10, color: "#059669" }}>{"\u2713"}</span>}
                                    {!rule.validated && parseFloat(rule.confidence || "0") < 0.85 && (
                                      <span style={{ fontSize: 10, color: "#f59e0b" }}>{"\u26A0"} Review</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                            {/* Quick page jump: show pages that have rules */}
                            <div style={{
                              padding: "8px 12px", borderTop: "1px solid rgba(226,232,240,.8)",
                              fontSize: 10, color: "#94a3b8",
                            }}>
                              <div style={{ marginBottom: 4, fontWeight: 600 }}>Pagini cu reguli:</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                                {Object.keys(guide.rulesByPage).filter(p => p !== "0").sort((a, b) => Number(a) - Number(b)).map(pageNum => (
                                  <button
                                    key={pageNum}
                                    onClick={() => setGhidViewerPage(Number(pageNum))}
                                    style={{
                                      padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(226,232,240,.8)",
                                      background: Number(pageNum) === ghidViewerPage ? "rgba(37,99,235,.08)" : "transparent",
                                      color: Number(pageNum) === ghidViewerPage ? "#2563eb" : "#64748b",
                                      fontWeight: Number(pageNum) === ghidViewerPage ? 700 : 400,
                                      cursor: "pointer", fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                                    }}
                                  >
                                    {pageNum} ({(guide.rulesByPage[pageNum] || []).length})
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()
                  )}
                </div>
              </div>
              );
            })()}

            {/* ELEMENTE */}
            {activeLeaf === "elemente" && elements.length === 0 && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 200, color: "#8892a8", padding: 24 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>&#128202;</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Niciun element extras</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Uploadează documente client sau folosește Solomon pentru a extrage date</div>
              </div>
            )}
            {activeLeaf === "elemente" && elements.length > 0 && (
              <div className="elemente-layout">
                <div className="elemente-list">
                  <div className="completitudine-bar">
                    <div className="completitudine-top">
                      <span className="cl-label">Completitudine elemente</span>
                      <span className="cl-pct" style={{ color: pct(elemFilled, elemTotal) === 100 ? "#059669" : "#2563eb" }}>
                        {pct(elemFilled, elemTotal)}%
                      </span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-seg bg-emerald-500" style={{ width: `${pct(elements.filter(e => e.status === "confirmat").length, elemTotal) * 100 / 100}%` }} />
                      <div className="progress-seg bg-amber-500" style={{ width: `${pct(elements.filter(e => e.status === "propus_ai").length, elemTotal) * 100 / 100}%` }} />
                      <div className="progress-seg bg-red-500 opacity-40" style={{ width: `${pct(elements.filter(e => e.status === "gol").length, elemTotal) * 100 / 100}%` }} />
                    </div>
                    <div className="completitudine-legend">
                      <div className="legend-item"><span className="legend-dot bg-emerald-500" /><span className="li-num">{elements.filter(e => e.status === "confirmat").length}</span> Confirmate</div>
                      <div className="legend-item"><span className="legend-dot bg-amber-500" /><span className="li-num">{elements.filter(e => e.status === "propus_ai").length}</span> Propuse AI</div>
                      <div className="legend-item"><span className="legend-dot bg-red-500" /><span className="li-num">{elements.filter(e => e.status === "gol").length}</span> Goale</div>
                    </div>
                  </div>

                  {/* GAP 9: Validate-all + Bulk confirm */}
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    <button
                      style={{ flex: 1, padding: "6px 10px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: "1px solid rgba(0,0,0,.08)", background: "#fff", cursor: "pointer" }}
                      onClick={async () => {
                        if (!confirm("Validezi toate elementele cu AI? Poate dura câteva secunde.")) return;
                        try {
                          const res = await apiPost<any>(`/api/projects/${projectId}/validate-all`, {});
                          toast("success", `Validate: ${res.validatedCount} ok, ${res.failedCount} eșuate, ${res.pendingCount} pending`);
                          const proj = await apiGet<any>(`/api/projects/${projectId}`);
                          setElements(mapElements(proj.elements || []));
                        } catch { toast("error", "Eroare la validare"); }
                      }}
                      disabled={readOnly}
                    >
                      {"\u2713"} Validează toate
                    </button>
                    {elements.filter(e => e.status === "propus_ai").length > 0 && (
                      <button
                        style={{ flex: 1, padding: "6px 10px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: "1px solid rgba(52,211,153,.3)", background: "rgba(52,211,153,.06)", color: "#059669", cursor: "pointer" }}
                        onClick={async () => {
                          const proposed = elements.filter(e => e.status === "propus_ai");
                          if (!confirm(`Confirmi ${proposed.length} elemente propuse de AI?`)) return;
                          try {
                            await apiPut(`/api/projects/${projectId}/elements-bulk/confirm`, { elementIds: proposed.map(e => e.id) });
                            toast("success", `${proposed.length} elemente confirmate`);
                            const proj = await apiGet<any>(`/api/projects/${projectId}`);
                            setElements(mapElements(proj.elements || []));
                          } catch { toast("error", "Eroare la confirmare"); }
                        }}
                        disabled={readOnly}
                      >
                        {"\u2713\u2713"} Confirmă toate propuse ({elements.filter(e => e.status === "propus_ai").length})
                      </button>
                    )}
                  </div>

                  <div className="elemente-filter-bar">
                    <input className="elem-search" placeholder="Caută element..." value={elemSearch} onChange={e => setElemSearch(e.target.value)} />
                    <div className="fp-group">
                      <button className={`fp ${elemFilter === "all" ? "on" : ""}`} onClick={() => setElemFilter("all")}>
                        Toate <span className="fp-count">{elements.length}</span>
                      </button>
                      <button className={`fp ${elemFilter === "de_confirmat" ? "on-orange" : ""}`} onClick={() => setElemFilter("de_confirmat")}>
                        De confirmat <span className="fp-count">{elements.filter(e => e.status === "propus_ai").length}</span>
                      </button>
                      <button className={`fp ${elemFilter === "confirmat" ? "on-green" : ""}`} onClick={() => setElemFilter("confirmat")}>
                        Confirmate <span className="fp-count">{elements.filter(e => e.status === "confirmat").length}</span>
                      </button>
                      <button className={`fp ${elemFilter === "gol" ? "on-red" : ""}`} onClick={() => setElemFilter("gol")}>
                        Goale <span className="fp-count">{elements.filter(e => e.status === "gol").length}</span>
                      </button>
                    </div>
                    {(elemFilter === "de_confirmat" || elemFilter === "src_solomon" || elemFilter === "src_calculated" || elemFilter === "src_manual") && (
                      <div className="fp-sub-group">
                        <span className="fp-sub-label">Sursă:</span>
                        <button className={`fp-sub ${elemFilter === "de_confirmat" ? "active" : ""}`} onClick={() => setElemFilter("de_confirmat")}>
                          Toate ({elements.filter(e => e.status === "propus_ai").length})
                        </button>
                        {elements.some(e => e.status === "propus_ai" && e.source === "solomon") && (
                          <button className={`fp-sub ${elemFilter === "src_solomon" ? "active" : ""}`} onClick={() => setElemFilter("src_solomon")}>
                            Solomon ({elements.filter(e => e.status === "propus_ai" && e.source === "solomon").length})
                          </button>
                        )}
                        {elements.some(e => e.status === "propus_ai" && e.source === "calculated") && (
                          <button className={`fp-sub ${elemFilter === "src_calculated" ? "active" : ""}`} onClick={() => setElemFilter("src_calculated")}>
                            Calculate ({elements.filter(e => e.status === "propus_ai" && e.source === "calculated").length})
                          </button>
                        )}
                        {elements.some(e => e.status === "propus_ai" && e.source !== "solomon" && e.source !== "calculated") && (
                          <button className={`fp-sub ${elemFilter === "src_manual" ? "active" : ""}`} onClick={() => setElemFilter("src_manual")}>
                            Alte surse ({elements.filter(e => e.status === "propus_ai" && e.source !== "solomon" && e.source !== "calculated").length})
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {(elemFilter === "de_confirmat" || elemFilter === "src_solomon" || elemFilter === "src_calculated" || elemFilter === "src_manual") && filteredElements.some(e => e.status === "propus_ai") && (
                    <div className="bulk-confirm-bar">
                      <span className="bc-text">{filteredElements.filter(e => e.status === "propus_ai").length} elemente de confirmat</span>
                      <button className="bc-btn" onClick={handleBulkConfirm} disabled={bulkConfirming || readOnly}>
                        {bulkConfirming ? "Se confirmă..." : `✓ Confirmă toate (${filteredElements.filter(e => e.status === "propus_ai").length})`}
                      </button>
                    </div>
                  )}

                  <div className="elemente-scroll">
                    {filteredElements.map(el => (
                      <div className={`elem-card ${selectedElement === el.id ? "active" : el.status === "propus_ai" ? "warning" : el.status === "gol" ? "pending" : ""}`} key={el.id} onClick={() => setSelectedElement(el.id)}>
                        <div className="ec-top">
                          <span className="ec-key">{el.key}</span>
                          <span className={`ec-status ${el.status}`}>
                            {el.status === "confirmat" ? "✓ Confirmat" : el.status === "propus_ai" ? "AI Propus" : "Gol"}
                          </span>
                          {el.source === "calculated" && el.status !== "confirmat" && (
                            <span className="text-[9px] font-bold text-violet-500 bg-violet-500/10 px-1.5 py-px rounded-lg">CALC</span>
                          )}
                        </div>
                        <div className="ec-label">{el.label}</div>
                        <div className={`ec-value ${!el.value ? "missing" : ""}`}>
                          {el.value || "Necompletat \u2014 Solomon va solicita"}
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
                        <div className="font-mono text-[13px] text-[#94a3b8]">{el.key}</div>
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
                          <div className="text-xs text-[#64748b]">
                            {el.templates.join(", ")}
                          </div>
                        </div>
                      )}
                      {/* Constraints from rules & reference tables */}
                      {elementConstraints.length > 0 && (
                        <div className="ed-constraints">
                          <div className="ed-constraints-title">&#128279; Constrângeri ({elementConstraints.length})</div>
                          {elementConstraints.map((c: any, ci: number) => (
                            <div className="ed-constraint-card" key={ci}>
                              <div className="ed-constraint-top">
                                <span className={`ed-constraint-role ${c.role}`}>
                                  {c.role === "input" ? "INPUT" : c.role === "output" ? "OUTPUT" : "CONSTRÂNGERE"}
                                </span>
                              </div>
                              {c.rule && <div className="ed-constraint-rule">{c.rule.ruleText || c.rule.description}</div>}
                              {c.description && <div className="text-[11px] text-[#94a3b8] mt-1">{c.description}</div>}
                              {c.referenceTables && c.referenceTables.length > 0 && (
                                <div className="ed-constraint-refs">
                                  {c.referenceTables.map((rt: any, rti: number) => (
                                    <span key={rti} className="ed-constraint-ref">
                                      &#128202; {rt.table?.name || "Tabelă referință"}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {el.source === "calculated" && (
                        <div className="ed-field">
                          <div className="ed-label">Formula</div>
                          <div className="text-xs font-mono text-violet-500 bg-violet-500/[0.08] px-2.5 py-1.5 rounded-md border border-violet-500/20">
                            {el.key === "cofinantare_proprie" && "valoare_totala - ajutor_nerambursabil"}
                            {el.key === "intensitate_ajutor" && "(ajutor_nerambursabil / valoare_totala) × 100%"}
                            {el.key === "tva_total" && "valoare_cu_tva - valoare_fara_tva"}
                            {el.key === "durata_sustenabilitate_end" && "data_finalizare + 3 ani (IMM)"}
                          </div>
                          <div className="text-[11px] text-amber-500 mt-1.5 flex items-center gap-1">
                            ⚠ Verifică valoarea înainte de confirmare
                          </div>
                        </div>
                      )}
                      {el.status === "propus_ai" && editingElementId !== el.id && (
                        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                          <button className="ed-btn" onClick={() => handleConfirmElementApi(el.id)}>✓ Confirmă</button>
                          <button className="ed-btn border-amber-500 text-amber-500" onClick={() => {
                            setEditingElementId(el.id);
                            setEditingElementValue(el.value || "");
                          }}>&#9998; Editează</button>
                        </div>
                      )}
                      {editingElementId === el.id && (
                        <div style={{ marginTop: 12 }}>
                          <input
                            type="text"
                            value={editingElementValue}
                            onChange={(e) => setEditingElementValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveElementEdit(el.id);
                              if (e.key === "Escape") { setEditingElementId(null); setEditingElementValue(""); }
                            }}
                            autoFocus
                            className="w-full px-3 py-2 rounded-md border text-sm"
                            style={{ background: "var(--bg-elevated)", borderColor: "var(--border-active)", color: "var(--text-primary)" }}
                          />
                          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                            <button className="ed-btn" onClick={() => handleSaveElementEdit(el.id)}>✓ Salvează</button>
                            <button className="ed-btn border-red-500 text-red-500" onClick={() => { setEditingElementId(null); setEditingElementValue(""); }}>✕ Anulează</button>
                          </div>
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
                {/* Progress */}
                <div className="check-progress">
                  <div className="check-ring">
                    <svg width="80" height="80" viewBox="0 0 80 80">
                      <circle cx="40" cy="40" r="34" fill="none" stroke="#e2e8f0" strokeWidth="6" />
                      <circle cx="40" cy="40" r="34" fill="none" stroke="#34d399" strokeWidth="6"
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

                {/* Unmapped templates warning */}
                {checkUnmappedTemplates.length > 0 && (
                  <div className="check-unmapped">
                    <span className="check-unmapped-icon">&#9888;</span>
                    <div className="check-unmapped-text">
                      <strong>{checkUnmappedTemplates.length} template-uri nemapate:</strong>{" "}
                      {checkUnmappedTemplates.map(t => t.name).join(", ")}
                    </div>
                  </div>
                )}

                {/* Add document button / form */}
                {!readOnly && (
                  checkAddOpen ? (
                    <div className="check-add-form">
                      <div className="check-add-form-row">
                        <input className="check-add-input" placeholder="Nume document (ex: Certificat constatator)" value={checkNewName} onChange={e => setCheckNewName(e.target.value)} />
                      </div>
                      <div className="check-add-form-row">
                        <input className="check-add-input" placeholder="Categorie (ex: Documente juridice)" value={checkNewCat} onChange={e => setCheckNewCat(e.target.value)} list="check-cats" />
                        <datalist id="check-cats">
                          {checkCategories.map(c => <option key={c} value={c} />)}
                        </datalist>
                      </div>
                      <div className="check-add-form-row">
                        <button className="check-add-submit" disabled={!checkNewName.trim() || !checkNewCat.trim()} onClick={handleChecklistAdd}>Adauga</button>
                        <button className="check-add-cancel" onClick={() => { setCheckAddOpen(false); setCheckNewName(""); setCheckNewCat(""); }}>Anuleaza</button>
                      </div>
                    </div>
                  ) : (
                    <div className="check-add-bar">
                      <button className="check-add-btn" onClick={() => setCheckAddOpen(true)}>+ Adauga document</button>
                    </div>
                  )
                )}

                {/* Categories */}
                {checkCategories.map(cat => {
                  const catItems = checklistItems.filter(i => i.category === cat);
                  const catDone = catItems.filter(i => i.done).length;
                  const isCollapsed = collapsedCats[cat];

                  return (
                    <div className="check-category" key={cat}>
                      <div className="check-cat-header" onClick={() => setCollapsedCats(c => ({ ...c, [cat]: !c[cat] }))}>
                        <span style={{ fontSize: 10, transition: "transform .15s cubic-bezier(.4,0,.2,1)", transform: isCollapsed ? "none" : "rotate(90deg)" }}>&#9654;</span>
                        {cat}
                        <span className="check-cat-count">{catDone}/{catItems.length}</span>
                      </div>
                      {!isCollapsed && catItems.map(item => (
                        <div className="check-item" key={item.id}>
                          <div className={`check-box ${item.done ? "done" : ""}`}
                            onClick={() => handleChecklistToggle(item.id, item.done)}>
                            {item.done && "\u2713"}
                          </div>
                          <span className={`check-name ${item.done ? "done-text" : ""}`}>{item.name}</span>
                          <span className={`check-source-badge ${item.source}`}>{item.source}</span>
                          {item.templateName && (
                            <span className="check-template" onClick={() => setActiveLeaf("neemia")}>
                              &#128196; {item.templateName}
                            </span>
                          )}

                          {/* Actions menu */}
                          {!readOnly && (
                            <div className="check-item-actions">
                              <button className="check-actions-btn" onClick={(e) => { e.stopPropagation(); setCheckActionId(checkActionId === item.id ? null : item.id); setCheckMapOpen(null); }}>&#8943;</button>
                              {checkActionId === item.id && (
                                <div className="check-actions-menu" onClick={e => e.stopPropagation()}>
                                  {/* Map template */}
                                  <button className="check-menu-item" onClick={() => setCheckMapOpen(checkMapOpen === item.id ? null : item.id)}>
                                    &#128196; {item.templateId ? "Schimba template" : "Mapeaza template"}
                                  </button>
                                  {checkMapOpen === item.id && (
                                    <div className="check-template-list">
                                      {item.templateId && (
                                        <button className="check-template-option" onClick={() => handleChecklistMapTemplate(item.id, null)}>
                                          &#10005; Sterge mapare
                                        </button>
                                      )}
                                      {neemiaTemplates.map(t => (
                                        <button key={t.id} className={`check-template-option ${item.templateId === t.id ? "mapped" : ""}`} onClick={() => handleChecklistMapTemplate(item.id, t.id)}>
                                          <span className="check-template-badge">{t.type}</span>
                                          {t.name}
                                          {item.templateId === t.id && " \u2713"}
                                        </button>
                                      ))}
                                      {neemiaTemplates.length === 0 && (
                                        <div className="p-2 text-[11px] text-[#94a3b8]">Niciun template disponibil</div>
                                      )}
                                    </div>
                                  )}

                                  <div className="check-menu-divider" />

                                  {/* Move category */}
                                  <div className="check-menu-sub">
                                    <span className="check-menu-sub-label">Muta in categorie</span>
                                    {checkCategories.filter(c => c !== item.category).map(c => (
                                      <button key={c} className="check-menu-sub-item" onClick={() => handleChecklistMoveCategory(item.id, c)}>
                                        {c}
                                      </button>
                                    ))}
                                  </div>

                                  <div className="check-menu-divider" />

                                  {/* Delete */}
                                  <button className="check-menu-item danger" onClick={() => handleChecklistDelete(item.id)}>
                                    &#128465; Sterge document
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}

                {checklistItems.length === 0 && (
                  <div className="text-center p-10 text-[#94a3b8] text-[13px]">
                    Niciun document in checklist. Adauga manual sau proceseaza un ghid.
                  </div>
                )}
              </div>
            )}

            {/* SOLOMON CHAT */}
            {activeLeaf === "solomon" && (
              <div className="solomon-layout">
                {/* Chat area */}
                <div
                  className={`solomon-chat${solomonDragOver ? " drag-active" : ""}`}
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); setSolomonDragOver(true); }}
                  onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setSolomonDragOver(false); }}
                  onDrop={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSolomonDragOver(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleSolomonUpload(file);
                  }}
                >
                  {solomonDragOver && (
                    <div className="solomon-drop-overlay">
                      <div className="solomon-drop-icon">&#128206;</div>
                      <div className="solomon-drop-text">Elibereaza pentru upload document</div>
                    </div>
                  )}
                  {/* Messages */}
                  <div className="chat-messages" ref={chatRef} onScroll={handleChatScroll} onMouseUp={handleTextSelect}>
                    <div className="chat-messages-inner">
                    {solomonMessages.map((msg, msgIdx) => (
                      <div key={msgIdx} className="solomon-msg">
                        <div className={`solomon-msg-avatar ${msg.role === "assistant" ? "ai" : "user"}`}>
                          {msg.role === "assistant" ? "S" : (typeof window !== "undefined" && localStorage.getItem("df-user-initials")) || "U"}
                        </div>
                        <div className="solomon-msg-body">
                          <div className="solomon-msg-name">
                            {msg.role === "assistant" ? "Solomon" : "Tu"}
                            <span>{new Date().toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                          <div className="solomon-msg-text">
                          {renderMsgText(msg.text)}
                          {msg.extractions && (() => {
                            const pendingIndices = msg.extractions.map((_: any, i: number) => i).filter((i: number) => !extractionStates[`${msgIdx}-${i}`]);
                            return (
                            <div className="extraction-cards">
                              {pendingIndices.length > 1 && (
                                <div className="confirm-all-bar">
                                  <span>{pendingIndices.length} extracții de confirmat</span>
                                  <button
                                    className="exc-btn confirm-btn"
                                    onClick={(e) => { e.stopPropagation(); pendingIndices.forEach((i: number) => handleConfirmExtraction(msgIdx, i)); }}
                                  >
                                    &#10003; Confirmă toate
                                  </button>
                                </div>
                              )}
                              {msg.extractions.map((ext: any, extIdx: number) => {
                                const k = `${msgIdx}-${extIdx}`;
                                const state = extractionStates[k];
                                return (
                                  <div key={extIdx} className={`extraction-card ${state || ""}`}>
                                    <div className="exc-top">
                                      <span className="exc-label">{state === "confirmed" ? `\u2713 ${ext.label}` : ext.label}</span>
                                      <span className="exc-confidence">{ext.confidence >= 90 ? "confirmat" : `conf. ${ext.confidence}%`}</span>
                                    </div>
                                    {editingExtraction === k ? (
                                      <input
                                        className="exc-value"
                                        autoFocus
                                        value={editingExtractionValue}
                                        onChange={(e) => setEditingExtractionValue(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            setSolomonMessages(prev => {
                                              const updated = [...prev];
                                              const m = { ...updated[msgIdx] };
                                              const exts = [...(m.extractions || [])];
                                              exts[extIdx] = { ...exts[extIdx], value: editingExtractionValue };
                                              m.extractions = exts;
                                              updated[msgIdx] = m;
                                              return updated;
                                            });
                                            setEditingExtraction(null);
                                          } else if (e.key === "Escape") {
                                            setEditingExtraction(null);
                                          }
                                        }}
                                        onBlur={() => {
                                          setSolomonMessages(prev => {
                                            const updated = [...prev];
                                            const m = { ...updated[msgIdx] };
                                            const exts = [...(m.extractions || [])];
                                            exts[extIdx] = { ...exts[extIdx], value: editingExtractionValue };
                                            m.extractions = exts;
                                            updated[msgIdx] = m;
                                            return updated;
                                          });
                                          setEditingExtraction(null);
                                        }}
                                        style={{ width: "100%", background: "#fff", border: "1px solid #2563eb", borderRadius: 6, padding: "4px 8px", fontSize: 13, fontFamily: "var(--font-mono, monospace)" }}
                                      />
                                    ) : (
                                      <div className="exc-value">{ext.value}</div>
                                    )}
                                    {!state ? (
                                      <div className="exc-actions">
                                        <button className="exc-btn confirm-btn" onClick={(e) => { e.stopPropagation(); handleConfirmExtraction(msgIdx, extIdx); }}>
                                          &#10003; Confirmă
                                        </button>
                                        <button className="exc-btn edit-btn" title="Editează înainte de confirmare" onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingExtraction(k);
                                          setEditingExtractionValue(ext.value);
                                        }}>
                                          &#9998; Editează
                                        </button>
                                        <button className="exc-btn reject-btn" onClick={(e) => { e.stopPropagation(); handleRejectExtraction(msgIdx, extIdx); }}>
                                          &#10005; Respinge
                                        </button>
                                      </div>
                                    ) : state === "confirmed" ? (
                                      <>
                                        <div className="exc-confirmed-label">&#10003; Salvat în Elemente</div>
                                        {extractionValidations[k] && extractionValidations[k].totalChecks > 0 && (
                                          <div className="solomon-validation-card">
                                            <div className="svc-header">
                                              &#128269; Validare referință ({extractionValidations[k].passed}/{extractionValidations[k].totalChecks} trecute)
                                            </div>
                                            <div className="svc-results">
                                              {extractionValidations[k].validationResults.map((vr: any, vri: number) => (
                                                <div className="svc-result" key={vri}>
                                                  <span className={`svc-status ${vr.status}`}>
                                                    {vr.status === "passed" ? "&#10003;" : vr.status === "failed" ? "&#10005;" : vr.status === "warning" ? "!" : "i"}
                                                  </span>
                                                  <div>
                                                    <div className="svc-text">{vr.message}</div>
                                                    {vr.referenceTable && <div className="svc-ref">&#128202; {vr.referenceTable.name}</div>}
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <div className="text-[11px] text-red-500">Respins</div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            );
                          })()}
                          </div>
                        </div>
                      </div>
                    ))}
                    {solomonStreaming && solomonMessages.length > 0 && solomonMessages[solomonMessages.length - 1]?.role === "user" && (
                      <div className="solomon-msg">
                        <div className="solomon-msg-avatar ai">S</div>
                        <div className="solomon-msg-body">
                          <div style={{ display: "flex", gap: 4, padding: "8px 0" }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#94a3b8", animation: "bounce 1.4s infinite ease-in-out" }} />
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#94a3b8", animation: "bounce 1.4s infinite ease-in-out 0.16s" }} />
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#94a3b8", animation: "bounce 1.4s infinite ease-in-out 0.32s" }} />
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={chatBottomRef} />
                    </div>
                  </div>

                  {/* F6.1: Timeout warning */}
                  {solomonStreaming && solomonTimedOut && (
                    <div style={{ padding: "8px 16px", background: "#fef3c7", borderTop: "1px solid #fde68a", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14 }}>&#9888;</span>
                      <span style={{ fontSize: 12, color: "#92400e" }}>Răspunsul durează mai mult decât de obicei. Modelul Extended Thinking poate necesita până la 2 minute.</span>
                    </div>
                  )}

                  {/* Input area */}
                  <div className="chat-input-area">
                    <div className="chat-input-inner">
                      <div className="chat-input-row">
                        <input
                          ref={solomonFileRef}
                          type="file"
                          accept=".pdf,.docx,.xlsx,.doc,.png,.jpg,.jpeg"
                          style={{ display: "none" }}
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) handleSolomonUpload(file);
                            e.target.value = "";
                          }}
                        />
                        <button className="chat-btn upload-btn" title="Upload document" onClick={() => solomonFileRef.current?.click()} disabled={solomonStreaming || readOnly}>
                          &#128206;
                        </button>
                        <textarea
                          className="chat-input"
                          data-solomon-input
                          placeholder="Scrie detalii despre proiect, lipește date, sau întreabă..."
                          value={solomonInput}
                          rows={1}
                          onChange={e => {
                            setSolomonInput(e.target.value);
                            e.target.style.height = "auto";
                            e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                          }}
                          onKeyDown={e => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleSolomonSend();
                              (e.target as HTMLTextAreaElement).style.height = "auto";
                            }
                          }}
                        />
                        {solomonStreaming ? (
                          <button className="chat-btn send" onClick={handleSolomonStop} title="Oprește generarea" style={{ background: "#dc2626" }}>
                            &#9632;
                          </button>
                        ) : (
                          <button className="chat-btn send" onClick={handleSolomonSend}>
                            &#10148;
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Elements panel */}
                <div className="solomon-elements-panel">
                  <div className="sep-header">
                    <div className="sep-header-top">
                      <span className="sep-header-title">Elemente completate</span>
                      <span className="sep-count">{elemFilled} / {elemTotal}</span>
                    </div>
                    <div className="sep-progress-bar">
                      <div className="sep-progress-fill" style={{ width: `${pct(elemFilled, elemTotal)}%` }} />
                    </div>
                  </div>
                  <div className="sep-scroll">
                    {/* Show actual project elements (confirmed + proposed) */}
                    {elements.filter(e => e.value).map((el) => (
                      <div key={el.id} className={`sep-card ${el.status === "confirmat" ? "is-confirmed" : "is-proposed"}`}>
                        <div style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 2 }}>{el.sourceLabel || el.source || ""}</div>
                        <div className="sep-card-label">{el.label}</div>
                        <div className="sep-card-value">{el.value}</div>
                        {el.status === "confirmat" && (
                          <div className="sep-confirmed-badge">&#10003; Confirmat</div>
                        )}
                      </div>
                    ))}
                    {/* Solomon proposed elements not yet in DB */}
                    {solomonElements.filter(se => se.status !== "confirmat" && !elements.some(e => e.key === se.key && e.value)).map((el, i) => (
                      <div key={`sol-${el.key}-${i}`} className="sep-card is-proposed">
                        <div className="sep-card-label">{el.label}</div>
                        <div className="sep-card-value">{el.value}</div>
                        <div className="sep-card-source">
                          <span style={{ fontSize: 10 }}>&#128196;</span>
                          {el.source}
                        </div>
                        <div className="sep-confirm-row">
                          <button className="sep-confirm-btn" onClick={() => handleConfirmElement(solomonElements.indexOf(el))}>
                            &#10003; Confirmă
                          </button>
                          <button className="sep-reject-btn" onClick={() => handleRejectElement(solomonElements.indexOf(el))}>
                            &#10005;
                          </button>
                        </div>
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

            {/* NEEMIA — 3 PANE LAYOUT */}
            {activeLeaf === "neemia" && (
              <div className="neemia-layout">
                {/* Left: Templates list */}
                <div className="neemia-templates">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <h3 style={{ margin: 0 }}>Template-uri Proiect</h3>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 0 }}>
                    <button
                      className="neemia-bulk-btn"
                      style={{ flex: 1 }}
                      onClick={handleNeemiaBulkGenerate}
                      disabled={neemiaBulkGenerating || readOnly}
                    >
                      {neemiaBulkGenerating ? "Se generează..." : "Generează tot dosarul"}
                    </button>
                    {/* GAP 10: Recalculează câmpuri */}
                    <button
                      style={{ padding: "6px 10px", fontSize: 11, fontWeight: 600, borderRadius: 8, border: "1px solid rgba(0,0,0,.08)", background: "#fff", cursor: "pointer", whiteSpace: "nowrap" }}
                      onClick={async () => {
                        try {
                          const res = await apiPost<any[]>(`/api/neemia/projects/${projectId}/calculate`, {});
                          toast("success", `${(res || []).length} câmpuri recalculate`);
                          const proj = await apiGet<any>(`/api/projects/${projectId}`);
                          setElements(mapElements(proj.elements || []));
                        } catch { toast("error", "Eroare la recalculare"); }
                      }}
                      disabled={readOnly}
                    >
                      {"\u{1F4CA}"} Recalculează
                    </button>
                    {/* F7.5: ZIP download all generated documents */}
                    {neemiaTemplates.some(t => t.downloadUrl) && (
                      <button
                        style={{ padding: "6px 10px", fontSize: 11, fontWeight: 600, borderRadius: 8, border: "1px solid rgba(0,0,0,.08)", background: "#fff", cursor: "pointer", whiteSpace: "nowrap" }}
                        onClick={async () => {
                          try {
                            const result = await apiGet<{ documents: Array<{ id: string; url: string; name: string }> }>(`/api/neemia/projects/${projectId}/download-all`);
                            if (!result?.documents?.length) { toast("warning", "Nu există documente generate."); return; }
                            for (const doc of result.documents) {
                              const a = document.createElement("a");
                              a.href = doc.url;
                              a.download = doc.name;
                              a.target = "_blank";
                              a.click();
                            }
                            toast("success", `${result.documents.length} documente descărcate.`);
                          } catch { toast("error", "Eroare la descărcarea documentelor."); }
                        }}
                      >
                        &#128230; Descarcă tot (ZIP)
                      </button>
                    )}
                  </div>

                  {neemiaGenStatus && (
                    <div className="neemia-gen-status">
                      {neemiaGenStatus}
                      {neemiaGenerating && neemiaGenProgress > 0 && (
                        <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,.2)", marginTop: 8, overflow: "hidden" }}>
                          <div style={{
                            height: "100%", borderRadius: 2, transition: "width .4s ease",
                            width: `${neemiaGenProgress}%`,
                            background: neemiaGenProgress >= 100 ? "#34d399" : "#fff",
                          }} />
                        </div>
                      )}
                    </div>
                  )}

                  {neemiaValidation && neemiaValidation.warnings.length > 0 && (
                    <div className="neemia-warnings">
                      {neemiaValidation.warnings.map((w, i) => (
                        <div key={i} className="nw-item">&#9888; {w}</div>
                      ))}
                    </div>
                  )}

                  {/* GAP 2: Checklist completeness warning banner */}
                  {neemiaValidation?.stats && (() => {
                    const st = neemiaValidation.stats;
                    const hasCritical = st.missingCritical && st.missingCritical.length > 0;
                    const hasWarning = st.missingWarning && st.missingWarning.length > 0;
                    const allComplete = st.checklistTotal > 0 && st.checklistDone === st.checklistTotal;
                    if (allComplete) {
                      return (
                        <div className="neemia-checklist-banner neemia-checklist-ok">
                          <span>{"\u2705"} Toate documentele sursă disponibile ({st.checklistDone}/{st.checklistTotal})</span>
                        </div>
                      );
                    }
                    if (hasCritical) {
                      return (
                        <div className="neemia-checklist-banner neemia-checklist-critical">
                          <div className="ncb-header">
                            <span>{"\u26A0"} Lipsesc {st.missingCritical.length} documente critice</span>
                            <span className="ncb-pct">{st.checklistCompleteness}% complet</span>
                          </div>
                          <div className="ncb-list">{st.missingCritical.join(", ")}</div>
                          {hasWarning && <div className="ncb-optional">+ {st.missingWarning.length} documente opționale lipsă</div>}
                          <div className="ncb-actions">
                            <button className="ncb-btn ncb-btn-secondary" onClick={() => setActiveLeaf("checklist")}>Completează întâi</button>
                          </div>
                        </div>
                      );
                    }
                    if (hasWarning) {
                      return (
                        <div className="neemia-checklist-banner neemia-checklist-warn">
                          <span style={{ fontSize: 11, color: "#64748b" }}>Documente opționale lipsă: {st.missingWarning.join(", ")}</span>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* GAP 3: Blueprint section readiness */}
                  {neemiaValidation?.sectionReadiness && neemiaValidation.sectionReadiness.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".6px", color: "#8892a8", marginBottom: 6 }}>Completare date per secțiune</div>
                      {neemiaValidation.sectionReadiness.map(sr => (
                        <div key={sr.sectionId} style={{
                          padding: "8px 10px", border: "1px solid rgba(0,0,0,.06)", borderRadius: 8, marginBottom: 6,
                          background: sr.qualityLevel === "full" ? "rgba(52,211,153,0.04)" : sr.qualityLevel === "partial" ? "rgba(251,191,36,0.04)" : "rgba(248,113,113,0.04)"
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                            <span style={{ fontSize: 12, fontWeight: 600 }}>{sr.sectionTitle}</span>
                            <span style={{ fontSize: 10, fontWeight: 600, color: sr.qualityLevel === "full" ? "#34d399" : sr.qualityLevel === "partial" ? "#d97706" : "#f87171" }}>
                              {sr.qualityLevel === "full" ? "Complet" : sr.qualityLevel === "partial" ? "Parțial" : "Incomplet"}
                            </span>
                          </div>
                          <div style={{ height: 3, background: "rgba(0,0,0,.06)", borderRadius: 2, marginBottom: 3 }}>
                            <div style={{ height: 3, borderRadius: 2, width: `${sr.readiness * 100}%`, background: sr.qualityLevel === "full" ? "#34d399" : sr.qualityLevel === "partial" ? "#fbbf24" : "#f87171", transition: "width .3s" }} />
                          </div>
                          <div style={{ fontSize: 10, color: "#8892a8" }}>
                            {sr.requiredComplete}/{sr.requiredTotal} obligatorii{sr.optionalTotal > 0 ? ` · ${sr.optionalComplete}/${sr.optionalTotal} opționale` : ""}
                          </div>
                          {sr.requiredMissing.length > 0 && (
                            <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>Lipsă: {sr.requiredMissing.join(", ")}</div>
                          )}
                          {sr.requiredMissing.length > 0 && (
                            <button
                              onClick={() => {
                                const msg = `Solomon, am nevoie de următoarele date pentru secțiunea "${sr.sectionTitle}": ${sr.requiredMissing.join(", ")}. Te rog ajută-mă să le completez.`;
                                setSolomonInput(msg);
                                setActiveLeaf("solomon");
                                setTimeout(() => {
                                  const inp = document.querySelector("[data-solomon-input]") as HTMLTextAreaElement;
                                  if (inp) inp.focus();
                                }, 300);
                              }}
                              style={{ fontSize: 10, color: "#4d8bff", background: "none", border: "none", cursor: "pointer", padding: "3px 0", marginTop: 2 }}
                            >
                              Completează cu Solomon →
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Consistency check */}
                  {neemiaTemplates.filter(t => t.status === "generated" || t.status === "validated").length >= 2 && (
                    <button
                      style={{ width: "100%", padding: "6px 10px", fontSize: 12, fontWeight: 600, border: "1px solid rgba(0,0,0,.08)", borderRadius: 8, background: consistencyResult?.consistent === false ? "rgba(248,113,113,.08)" : "rgba(0,0,0,.02)", cursor: "pointer", marginBottom: 8 }}
                      onClick={async () => {
                        setConsistencyLoading(true);
                        try {
                          const res = await apiGet<any>(`/api/neemia/projects/${projectId}/consistency`);
                          setConsistencyResult(res);
                        } catch { toast("error", "Eroare verificare consistență"); }
                        setConsistencyLoading(false);
                      }}
                      disabled={consistencyLoading}
                    >
                      {consistencyLoading ? "Se verifică..." : consistencyResult ? (consistencyResult.consistent ? "\u2713 Documente consistente" : `\u26A0 ${consistencyResult.conflicts.length} inconsistențe`) : "Verifică consistența"}
                    </button>
                  )}
                  {consistencyResult && !consistencyResult.consistent && (
                    <div style={{ fontSize: 11, marginBottom: 8 }}>
                      {consistencyResult.conflicts.map((c: any, i: number) => (
                        <div key={i} style={{ padding: "4px 6px", marginBottom: 2, borderRadius: 4, background: "rgba(248,113,113,.06)", color: "#dc2626" }}>
                          <strong>{c.label || c.key}</strong>: {c.values?.map((v: any) => `${v.templateName}: "${v.value}"`).join(" vs ")}
                        </div>
                      ))}
                    </div>
                  )}

                  {neemiaTemplates.length === 0 && (
                    <div style={{ padding: "24px 12px", textAlign: "center", color: "#8892a8", fontSize: 13 }}>
                      <div style={{ fontSize: 28, marginBottom: 6 }}>&#128196;</div>
                      Niciun template asociat proiectului. Uploadează template-uri DOCX/PDF/XLSX.
                    </div>
                  )}
                  {neemiaTemplates.map((tmpl, i) => {
                    const p = neemiaProgressPct(tmpl);
                    return (
                      <div
                        key={tmpl.id || i}
                        className={`template-card ${neemiaActiveTemplate === i ? "active" : ""}`}
                        onClick={() => handleNeemiaTemplateClick(i)}
                      >
                        <div className="tc-name">
                          {tmpl.name}
                          <span className="tc-badge">{tmpl.type}</span>
                          <span className={`tc-mode-badge ${tmpl.generationMode === "compose" ? "compose" : "fill"}`}>
                            {tmpl.generationMode === "compose" ? "COMPOSE" : "FILL"}
                          </span>
                        </div>
                        <div className="tc-info">
                          {tmpl.generationMode === "compose"
                            ? `${tmpl.composeSections?.length || "?"} secțiuni AI`
                            : `${tmpl.pages.length || "?"} pagini · ${tmpl.totalFields} câmpuri`}
                        </div>
                        <div className="tc-progress">
                          <div className="tc-progress-fill" style={{ width: `${p}%`, background: neemiaProgressColor(p) }} />
                        </div>
                        {tmpl.filledFields > 0 && (
                          <div className="text-[11px] text-[#64748b] mt-1">
                            {tmpl.generationMode === "compose"
                              ? `${tmpl.composeSections?.filter(s => s.approved).length || 0}/${tmpl.composeSections?.length || 0} secțiuni aprobate`
                              : `${tmpl.filledFields}/${tmpl.totalFields} câmpuri completate`}
                          </div>
                        )}
                        {/* F7.1: Show missing keys warning pre-generation */}
                        {tmpl.generationMode !== "compose" && tmpl.totalFields > 0 && tmpl.filledFields < tmpl.totalFields && (
                          <div style={{ fontSize: 11, color: "#d97706", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                            <span>&#9888;</span>
                            <span>{tmpl.totalFields - tmpl.filledFields} câmpuri lipsă — documentul generat va avea valori goale</span>
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                          {tmpl.status === "generated" && tmpl.downloadUrl && (
                            <button className="tc-action-btn tc-download" onClick={(e) => { e.stopPropagation(); window.open(tmpl.downloadUrl!, "_blank"); }}>
                              &#8595; Descarcă
                            </button>
                          )}
                          {tmpl.templateDocumentId && tmpl.generationMode === "compose" && (
                            <>
                              <button
                                className="tc-action-btn tc-preview"
                                onClick={(e) => { e.stopPropagation(); handleComposePreview(tmpl.templateDocumentId); }}
                                disabled={composePreviewing || readOnly}
                              >
                                {composePreviewing ? "Se generează..." : "Previzualizare AI"}
                              </button>
                              {composePreviewSections.length > 0 && (
                                <button
                                  className="tc-action-btn tc-generate"
                                  onClick={(e) => { e.stopPropagation(); handleComposeGenerate(tmpl.templateDocumentId); }}
                                  disabled={neemiaGenerating || readOnly}
                                >
                                  Generează DOCX
                                </button>
                              )}
                            </>
                          )}
                          {tmpl.templateDocumentId && tmpl.generationMode !== "compose" && (
                            <button
                              className="tc-action-btn tc-generate"
                              onClick={(e) => { e.stopPropagation(); handleNeemiaGenerate(tmpl.templateDocumentId); }}
                              disabled={neemiaGenerating || readOnly}
                            >
                              {tmpl.status === "generated" ? "Regenerează" : "Generează"}
                            </button>
                          )}
                          {tmpl.templateDocumentId && (
                            <button
                              className="tc-action-btn tc-versions"
                              onClick={(e) => { e.stopPropagation(); handleLoadVersions(tmpl.templateDocumentId); }}
                            >
                              {neemiaVersionsOpen === tmpl.templateDocumentId ? "Ascunde istoric" : "Istoric versiuni"}
                            </button>
                          )}
                          {/* GAP 11: Validate consultant per document */}
                          {tmpl.status === "generated" && tmpl.id && (
                            <button
                              className="tc-action-btn"
                              style={{ background: "rgba(52,211,153,.08)", color: "#059669", borderColor: "rgba(52,211,153,.3)" }}
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  await apiPut(`/api/neemia/documents/${tmpl.id}/validate`, {});
                                  const docs = await apiGet<any[]>(`/api/neemia/projects/${projectId}/documents`);
                                  setNeemiaTemplates((docs || []).map((doc: any) => ({
                                    id: doc.id, name: doc.templateName || "Document", type: (doc.templateFileType || "DOCX").toUpperCase(),
                                    pages: [], totalFields: 0, filledFields: 0, templateDocumentId: doc.templateDocumentId,
                                    status: doc.status, downloadUrl: doc.downloadUrl || null, generationMode: doc.generationMode || "fill",
                                    composeSections: doc.composeContent?.sections || undefined,
                                  })));
                                  toast("success", "Document validat de consultant");
                                } catch { toast("error", "Eroare la validare"); }
                              }}
                              disabled={readOnly}
                            >
                              {"\u2713"} Validat consultant
                            </button>
                          )}
                          {tmpl.status === "validated" && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#059669", padding: "2px 6px", borderRadius: 4, background: "rgba(52,211,153,.1)" }}>
                              {"\u2713"} VALIDAT
                            </span>
                          )}
                        </div>
                        {/* Version history panel */}
                        {neemiaVersionsOpen === tmpl.templateDocumentId && neemiaVersions.length > 0 && (
                          <div className="tc-versions-panel">
                            {neemiaVersions.map((v, vi) => (
                              <div key={vi} className="tc-version-row">
                                <span className="tv-badge">v{v.version}</span>
                                <span className="tv-date">{new Date(v.createdAt || v.generatedAt).toLocaleDateString("ro-RO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                                <span className="tv-stats">{v.filledCount || 0} completate</span>
                                {v.generationMode === "compose" && <span className="tv-mode">COMPOSE</span>}
                                {v.downloadUrl && (
                                  <button className="tv-download" onClick={(e) => { e.stopPropagation(); window.open(v.downloadUrl, "_blank"); }}>
                                    &#8595;
                                  </button>
                                )}
                                {/* F7.4: Version rollback */}
                                {!readOnly && vi > 0 && (
                                  <button
                                    className="tv-download"
                                    title="Restaurează această versiune"
                                    style={{ color: "#d97706" }}
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        await apiPost(`/api/neemia/documents/${v.id}/rollback`, {});
                                        const docs = await apiGet<any[]>(`/api/neemia/projects/${projectId}/documents`);
                                        setNeemiaTemplates((docs || []).map((doc: any) => ({
                                          id: doc.id, name: doc.templateName || "Document", type: (doc.templateFileType || "DOCX").toUpperCase(),
                                          pages: [], totalFields: 0, filledFields: 0, templateDocumentId: doc.templateDocumentId,
                                          status: doc.status, downloadUrl: doc.downloadUrl || null, generationMode: doc.generationMode || "fill",
                                          composeSections: doc.composeContent?.sections || undefined,
                                        })));
                                        toast("success", `Versiunea v${v.version} a fost restaurată.`);
                                      } catch { toast("error", "Eroare la restaurarea versiunii."); }
                                    }}
                                  >
                                    &#8634;
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {neemiaVersionsOpen === tmpl.templateDocumentId && neemiaVersions.length === 0 && (
                          <div className="tc-versions-panel">
                            <div className="py-2 text-xs text-[#94a3b8]">Nicio versiune generată.</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Center + Right: Doc preview + Fields / COMPOSE preview */}
                <div className="neemia-doc-view">
                  {/* COMPOSE PREVIEW PANEL */}
                  {neemiaTemplate?.generationMode === "compose" && composePreviewSections.length > 0 ? (
                    <div className="compose-preview-panel">
                      <div className="compose-preview-header">
                        <h3>Previzualizare COMPOSE — {neemiaTemplate.name}</h3>
                        {composeModel && <span className="compose-model-badge">{composeModel}</span>}
                        <div style={{ flex: 1 }} />
                        <span className="compose-stats">
                          {composePreviewSections.filter(s => s.approved).length}/{composePreviewSections.length} aprobate
                        </span>
                        <button
                          className="compose-generate-btn"
                          onClick={() => handleComposeGenerate(neemiaTemplate.templateDocumentId)}
                          disabled={neemiaGenerating || readOnly}
                        >
                          {neemiaGenerating ? "Se generează..." : "Generează DOCX final"}
                        </button>
                      </div>
                      <div className="compose-sections-list">
                        {composePreviewSections.map((section, si) => (
                          <div key={si} className={`compose-section ${section.approved ? "approved" : ""}`}>
                            <div className="cs-header">
                              <span className={`cs-type-badge ${section.type}`}>
                                {section.type === "narrative" ? "Text" : section.type === "table" ? "Tabel" : "Calcul"}
                              </span>
                              <span className="cs-label">{section.label}</span>
                              <div style={{ flex: 1 }} />
                              <button
                                className={`cs-approve-btn ${section.approved ? "active" : ""}`}
                                onClick={() => handleComposeApproveSection(si)}
                              >
                                {section.approved ? "✓ Aprobat" : "Aprobă"}
                              </button>
                              {section.type === "narrative" && (
                                <>
                                  <button
                                    className="cs-edit-btn"
                                    onClick={() => {
                                      setComposeEditing(si);
                                      setComposeEditText(section.content || "");
                                    }}
                                  >
                                    Editează
                                  </button>
                                  <button
                                    className="cs-edit-btn"
                                    style={{ color: "#4d8bff" }}
                                    onClick={() => handleComposeRegenerateSection(si)}
                                    disabled={composeRegeneratingIdx !== null}
                                  >
                                    {composeRegeneratingIdx === si ? "Se regenerează..." : "Regenerează"}
                                  </button>
                                </>
                              )}
                            </div>

                            {/* Narrative content */}
                            {section.type === "narrative" && composeEditing === si ? (
                              <div className="cs-edit-area">
                                <textarea
                                  className="cs-textarea"
                                  value={composeEditText}
                                  onChange={e => setComposeEditText(e.target.value)}
                                  rows={8}
                                />
                                <div className="cs-edit-actions">
                                  <button className="cs-save-btn" onClick={() => handleComposeEditSave(si)}>Salvează</button>
                                  <button className="cs-cancel-btn" onClick={() => { setComposeEditing(null); setComposeEditText(""); }}>Anulează</button>
                                </div>
                              </div>
                            ) : section.type === "narrative" && section.content ? (
                              <div className="cs-narrative">
                                {section.content.split("\n\n").map((p, pi) => (
                                  <p key={pi}>{p}</p>
                                ))}
                              </div>
                            ) : null}

                            {/* Table preview */}
                            {(section.type === "table" || section.type === "calculation") && section.tableData ? (
                              <div className="cs-table-wrapper">
                                {section.tableData.caption && (
                                  <div className="cs-table-caption">{section.tableData.caption}</div>
                                )}
                                <table className="cs-table">
                                  <thead>
                                    <tr>
                                      {section.tableData.headers.map((h, hi) => (
                                        <th key={hi} style={{ background: `#${section.tableData?.headerColor || "1a3a5c"}`, color: "#fff" }}>
                                          {h.label}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {section.tableData.rows.map((row, ri) => {
                                      const isHighlight = section.tableData?.highlightRows?.includes(ri);
                                      return (
                                        <tr key={ri} className={isHighlight ? "highlight-row" : ri % 2 === 1 ? "alt-row" : ""}>
                                          {section.tableData!.headers.map((h, hi) => (
                                            <td key={hi}>{String(row[h.key] ?? "")}</td>
                                          ))}
                                        </tr>
                                      );
                                    })}
                                    {section.tableData.footerRow && (
                                      <tr className="footer-row">
                                        {section.tableData.headers.map((h, hi) => (
                                          <td key={hi}>{String(section.tableData!.footerRow![h.key] ?? "")}</td>
                                        ))}
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : neemiaTemplate && neemiaTemplate.pages.length > 0 ? (
                    <>
                      {/* Page navigation bar */}
                      <div className="neemia-page-nav">
                        <span className="nav-label">{neemiaTemplate.name}</span>
                        <div className="nav-pages-scroll">
                          {neemiaTemplate.pages.map((pg, i) => {
                            const pgFilled = pg.filledFields || pg.fields.filter(f => f.value).length;
                            const pgTotal = pg.totalFields || pg.fields.length;
                            const pgPct = pgTotal > 0 ? Math.round(pgFilled / pgTotal * 100) : 0;
                            return (
                              <div
                                key={i}
                                className={`page-thumb ${pg.status} ${neemiaActivePage === i ? "active" : ""}`}
                                onClick={() => handleNeemiaPageClick(i)}
                                title={`Pag. ${pg.num}: ${pgFilled}/${pgTotal} câmpuri (${pgPct}%)`}
                              >
                                <span className="pt-num">{pg.num}</span>
                                <span className={`pt-dot ${pg.status}`} />
                              </div>
                            );
                          })}
                        </div>
                        <div className="nav-stats">
                          <span className="nav-stat-filled">{neemiaTemplate.filledFields}/{neemiaTemplate.totalFields}</span>
                          <span className="nav-stat-pct" style={{ color: neemiaProgressColor(neemiaProgressPct(neemiaTemplate)) }}>
                            {neemiaProgressPct(neemiaTemplate)}%
                          </span>
                        </div>
                        <button className="download-btn" onClick={async () => {
                          if (neemiaTemplate.downloadUrl) {
                            window.open(neemiaTemplate.downloadUrl, "_blank");
                          } else if (neemiaTemplate.id) {
                            try {
                              const res = await apiGet<any>(`/api/neemia/documents/${neemiaTemplate.id}/download`);
                              if (res.downloadUrl) window.open(res.downloadUrl, "_blank");
                            } catch {}
                          }
                        }}>
                          &#8595; Descarcă
                        </button>
                      </div>

                      <div className="neemia-preview-area" ref={neemiaSplitRef}>
                        {/* Left panel: Fields for current page */}
                        <div className="neemia-fields-panel" style={{ width: neemiaSplitWidth }}>
                          <div className="nfp-header">
                            <h3>Câmpuri — Pag. {neemiaPage?.num}</h3>
                            {neemiaPage && (
                              <div className="nfp-stats">
                                <span className="nfp-stat confirmed">{neemiaPage.fields.filter(f => f.confirmed).length} confirmate</span>
                                <span className="nfp-stat filled">{neemiaPage.fields.filter(f => f.value && !f.confirmed).length} propuse</span>
                                <span className="nfp-stat empty">{neemiaPage.fields.filter(f => !f.value).length} goale</span>
                              </div>
                            )}
                          </div>
                          <div className="nfp-scroll">
                            {neemiaPage?.fields.map((f, fi) => (
                              <div className={`nfp-card ${f.value ? (f.confirmed ? "is-confirmed" : "is-proposed") : "is-empty"}`} key={fi}>
                                <div className="nfp-card-top">
                                  <span className="nfp-card-label">{f.name}</span>
                                  <span className={`nfp-card-status ${f.confirmed ? "confirmed" : f.value ? "proposed" : "empty"}`}>
                                    {f.confirmed ? "✓ Confirmat" : f.value ? "○ Propus" : "— Gol"}
                                  </span>
                                </div>
                                <div className={`nfp-card-value ${!f.value ? "missing" : ""}`}>
                                  {f.value || `{{${f.key}}}`}
                                </div>
                                {f.source && (
                                  <div className="nfp-card-source">
                                    <span className={`source-dot ${f.source.toLowerCase()}`} />
                                    {f.source}
                                  </div>
                                )}
                                {f.fieldType !== "text" && (
                                  <div className="nfp-card-type">{f.fieldType}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Drag handle */}
                        <div
                          className="neemia-split-handle"
                          onMouseDown={() => { neemiaSplitDragging.current = true; document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; }}
                        >
                          <div className="nsh-dots" />
                        </div>

                        {/* Right: Document page preview — pixel-perfect document look */}
                        <div className="neemia-doc-preview">
                          {neemiaPage && (
                            <div className="ndp-page" key={neemiaAnimKey} style={cabinetBranding?.fontFamily ? { fontFamily: cabinetBranding.fontFamily } : undefined}>
                              <div className="ndp-header">
                                <div className="ndp-header-bar" style={cabinetBranding?.primaryColor ? { background: cabinetBranding.primaryColor } : undefined} />
                                <div className="ndp-doc-type">{neemiaTemplate.type}</div>
                                <div className="ndp-doc-title">{neemiaTemplate.name}</div>
                              </div>

                              {/* Group fields by group name */}
                              {(() => {
                                const groups: Array<{ name: string | null; fields: typeof neemiaPage.fields }> = [];
                                let currentGroup: string | null = null;
                                let currentFields: typeof neemiaPage.fields = [];

                                for (const f of neemiaPage.fields) {
                                  if (f.group !== currentGroup) {
                                    if (currentFields.length > 0) groups.push({ name: currentGroup, fields: currentFields });
                                    currentGroup = f.group;
                                    currentFields = [f];
                                  } else {
                                    currentFields.push(f);
                                  }
                                }
                                if (currentFields.length > 0) groups.push({ name: currentGroup, fields: currentFields });

                                return groups.map((g, gi) => (
                                  <div className="ndp-group" key={gi}>
                                    {g.name && <div className="ndp-group-title">{g.name}</div>}
                                    {g.fields.map((f, fi) => (
                                      <div className={`ndp-field ${f.value ? "filled" : "empty"} ${f.confirmed ? "confirmed" : ""}`} key={fi}>
                                        <div className="ndp-field-label">{f.name}</div>
                                        <div className="ndp-field-line">
                                          {f.value ? (
                                            <span className="ndp-field-value">{f.value}</span>
                                          ) : (
                                            <span className="ndp-field-placeholder">{'{{' + f.key + '}}'}</span>
                                          )}
                                          {f.value && (
                                            <span className={`ndp-field-indicator ${f.confirmed ? "confirmed" : "proposed"}`}>
                                              {f.confirmed ? "✓" : "○"}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ));
                              })()}

                              <div className="ndp-footer">
                                <span>Pag. {neemiaPage.num} / {neemiaTemplate.pages.length}</span>
                                {cabinetBranding?.footerText && (
                                  <span className="ndp-footer-cabinet">{cabinetBranding.footerText}</span>
                                )}
                                <span className="ndp-footer-stats">
                                  {neemiaPage.fields.filter(f => f.value).length}/{neemiaPage.fields.length} completate
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="neemia-empty">
                      <div className="ne-icon">&#128196;</div>
                      <div className="ne-label">Selectează un template</div>
                      <div className="ne-desc">Alege un template din stânga pentru a vedea paginile, câmpurile completate și starea fiecărui element</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
