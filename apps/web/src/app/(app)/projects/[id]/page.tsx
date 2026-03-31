"use client";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { api, apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { getCaenDescription } from "@/lib/caen";
import { RuleCard, RuleCardList, RuleCardData, CATEGORY_COLORS as RC_CAT_COLORS, CATEGORY_LABELS as RC_CAT_LABELS, OPERATOR_LABELS as RC_OP_LABELS, formatFieldName as rcFormatFieldName, formatConditionValue as rcFormatConditionValue, formatConditionText as rcFormatConditionText } from "@/components/shared/RuleCard";
import { useToast } from "@/components/shared/Toast";
import { useSSE } from "@/hooks/useSSE";
import FormOnDocument from "@/components/documents/FormOnDocument";

const API_URL = "";

type SolomonMessage = {
  role: "user" | "assistant";
  text: string;
  extractions: Array<{ key: string; label: string; value: string; confidence: number }> | null;
};

type SolomonElement = {
  key: string; label: string; value: string; source: string; status: "confirmat" | "propus";
};

type TemplateField = { key: string; name: string; value: string | null; source: string | null; confirmed: boolean; fieldType: string; group: string | null; templateElementId?: string };
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
  condition?: any;
  needsReview?: boolean;
  sourceDocument?: { id: string; name: string; fileType: string } | null;
  hasReferenceData?: boolean;
  referenceTableNames?: string[];
  isPreEligibility?: boolean;
};

type LinkedElementWithValue = {
  elementKey: string;
  displayName: string;
  category: string | null;
  role: string;
  value: any;
  isMissing: boolean;
};

type GuideRule = {
  id: string;
  ruleId?: string;
  type: "fixed" | "interpreted";
  text: string;
  confidence: number;
  page: number;
  section: string;
  category: string;
  sourceText: string | null;
  condition: any;
  semanticTags: string[];
  validated: boolean;
  needsReview: boolean;
  sourceDocument: { id: string; name: string; fileType: string } | null;
  linkedElements?: LinkedElementWithValue[];
};

type ElementItem = {
  id: string;
  key: string;
  label: string;
  value: string | null;
  status: "confirmat" | "propus_ai" | "gol" | "conflict";
  confidence: number;
  source: string | null;
  sourceLabel: string | null;
  sourceDocName: string | null;
  templates: string[];
  category: string;
  required: boolean;
  validationStatus: string | null;
  validationDetails: any;
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
  tipProiect: string | null;
  folderId?: string;
  solomonPhase?: { phase: string; label: string; progress: number; nextAction: string } | null;
  composeBrief?: any;
};

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "Ciornă", color: "#64748b", bg: "#f0f2f5" },
  in_progress: { label: "În lucru", color: "#2563eb", bg: "#eff6ff" },
  review: { label: "Verificare", color: "#d97706", bg: "#fffbeb" },
  submitted: { label: "Depus", color: "#059669", bg: "#ecfdf5" },
};

const pct = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0;
const formatRON = (v: number | null | undefined) => v != null ? `${Number(v).toLocaleString("ro-RO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} RON` : "-";

type LeafType = "sumar" | "solomon" | "elemente" | "reguli" | "scor" | "tabele" | "checklist" | "neemia";

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
    const notes = item.notes || item.detail || "";
    return {
      id: item.id,
      ruleId: item.ruleId || item.rule?.id,
      name: item.rule?.description || "Regulă necunoscută",
      status: item.status === "passed" ? "pass" : item.status === "failed" ? "fail" : "pending",
      detail: notes,
      type: item.rule?.type || "fixed",
      confidence: conf,
      page: item.rule?.sourcePage ?? item.rule?.page,
      section: item.rule?.section,
      category: item.rule?.category || "",
      condition: item.rule?.condition || null,
      needsReview: item.rule?.needsReview ?? (conf != null && conf < 0.85),
      sourceDocument: item.rule?.sourceDocument || null,
      isPreEligibility: typeof notes === "string" && notes.startsWith("[Pre-elig]"),
    };
  });
}

function mapGuideRules(grouped: any[]): GuideRule[] {
  const rules: GuideRule[] = [];
  for (const group of grouped) {
    for (const item of group.rules || []) {
      const cond = item.rule?.condition || null;
      // Extract semantic_tags from condition JSONB (stored there by processGuide)
      const tags: string[] = Array.isArray(cond?.semantic_tags) ? cond.semantic_tags : [];
      rules.push({
        id: item.id,
        ruleId: item.ruleId || item.rule?.id || undefined,
        type: item.rule?.type || "fixed",
        text: item.rule?.description || "",
        confidence: parseFloat(item.rule?.confidence) || 0.5,
        page: item.rule?.sourcePage ?? item.rule?.page ?? 0,
        section: item.rule?.category || "",
        category: item.rule?.category || "",
        sourceText: item.rule?.sourceText || null,
        condition: cond,
        semanticTags: tags,
        validated: item.rule?.validated ?? false,
        needsReview: item.rule?.needsReview ?? (parseFloat(item.rule?.confidence) < 0.85),
        sourceDocument: item.rule?.sourceDocument || group.document || null,
        linkedElements: item.rule?.linkedElements || [],
      });
    }
  }
  return rules;
}

// ─── Use shared formatting from RuleCard ───
const OPERATOR_LABELS = RC_OP_LABELS;
const formatFieldName = rcFormatFieldName;
const formatConditionValue = rcFormatConditionValue;
const formatConditionText = rcFormatConditionText;

const SOURCE_MAP: Record<string, string> = {
  onrc: "ONRC",
  onrc_auto: "ONRC",
  anaf_auto: "ANAF",
  manual: "Manual",
  consultant_manual: "Manual",
  solomon: "Solomon",
  solomon_chat: "Solomon",
  document: "OCR",
  document_extracted: "OCR",
  calculated: "Sistem",
  derived: "Sistem",
  ghid: "Ghid",
};

const CAT_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  beneficiary: { label: "Solicitant", icon: "\uD83D\uDC64", color: "#2563eb" },
  financial: { label: "Financiar", icon: "\uD83D\uDCB0", color: "#059669" },
  farm: { label: "Exploatație", icon: "\uD83C\uDF3E", color: "#d97706" },
  investment: { label: "Investiție", icon: "\uD83D\uDD27", color: "#7c3aed" },
  location: { label: "Locație", icon: "\uD83D\uDCCD", color: "#dc2626" },
  legal: { label: "Documente", icon: "\uD83D\uDCCB", color: "#475569" },
  technical: { label: "Tehnic", icon: "\u2699\uFE0F", color: "#0891b2" },
  other: { label: "Alte", icon: "\uD83D\uDCCE", color: "#94a3b8" },
};

function mapElements(elements: any[]): ElementItem[] {
  return elements.map(el => {
    const confirmed = el.confirmed;
    const hasValue = !!el.value;
    // Detect conflict: validationStatus=invalid with validationDetails containing conflict info
    const isConflict = el.validationStatus === "invalid" && el.validationDetails?.conflict;
    let status: "confirmat" | "propus_ai" | "gol" | "conflict" = "gol";
    if (isConflict) status = "conflict";
    else if (confirmed) status = "confirmat";
    else if (hasValue) status = "propus_ai";

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
            .map(([k, v]) => `${k}: ${typeof v === "number" ? new Intl.NumberFormat("ro-RO").format(v) : v}`)
            .join(" · ");
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
      sourceLabel: SOURCE_MAP[el.source] || el.source || null,
      sourceDocName: el.sourceDocument?.name || null,
      templates: [],
      category: elemDef?.category || tmplEl?.category || "other",
      required: elemDef?.required ?? false,
      validationStatus: el.validationStatus || null,
      validationDetails: el.validationDetails || null,
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
  const [addingElement, setAddingElement] = useState(false);
  const [newElementKey, setNewElementKey] = useState("");
  const [newElementLabel, setNewElementLabel] = useState("");
  const [newElementValue, setNewElementValue] = useState("");
  const [elemCatFilter, setElemCatFilter] = useState("all");
  const [elemStatusFilter, setElemStatusFilter] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [detailPanelId, setDetailPanelId] = useState<string | null>(null);
  const [detailHistory, setDetailHistory] = useState<any[]>([]);
  const [ghidTab, setGhidTab] = useState<"reguli" | "ghid" | "anexe">("reguli");
  const [referenceTables, setReferenceTables] = useState<any[]>([]);
  const [selectedRefTable, setSelectedRefTable] = useState<string | null>(null);
  const [refTablesLoading, setRefTablesLoading] = useState(false);
  const [ghidCategoryFilter, setGhidCategoryFilter] = useState<string>("all");
  const [ghidTypeFilter, setGhidTypeFilter] = useState<string>("all");
  const [ghidStatusFilter, setGhidStatusFilter] = useState<string>("all");
  const [expandedRuleIds, setExpandedRuleIds] = useState<Set<string>>(new Set());
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
  const [expandedExtractions, setExpandedExtractions] = useState<Record<number, boolean>>({});
  const [editingExtraction, setEditingExtraction] = useState<string | null>(null);
  const [editingExtractionValue, setEditingExtractionValue] = useState("");
  const [refinePopup, setRefinePopup] = useState<{ text: string; x: number; y: number } | null>(null);
  const [refineInput, setRefineInput] = useState("");
  const [refineEnabled, setRefineEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("df-refine-enabled") !== "false";
  });

  // Listen for toggle from Sidebar
  useEffect(() => {
    const handler = (e: Event) => setRefineEnabled((e as CustomEvent).detail);
    window.addEventListener("df-refine-toggle", handler);
    return () => window.removeEventListener("df-refine-toggle", handler);
  }, []);
  const chatRef = useRef<HTMLDivElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const [solomonAutoScroll, setSolomonAutoScroll] = useState(true);
  const popupRef = useRef<HTMLDivElement>(null);
  const solomonFileRef = useRef<HTMLInputElement>(null);
  const solomonAbortRef = useRef<AbortController | null>(null);
  const [solomonDragOver, setSolomonDragOver] = useState(false);
  const [solomonTimedOut, setSolomonTimedOut] = useState(false);
  const solomonTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // RAG v2: Tool use + phase tracking
  const [solomonToolUse, setSolomonToolUse] = useState<{ toolName: string; query?: string } | null>(null);
  // FIX I: Source trail — accumulated per streaming turn
  const [solomonSourceTrail, setSolomonSourceTrail] = useState<Array<{ query: string; sources: Array<{ section?: string; page?: string; docType?: string; layer?: string }> }>>([]);
  const [solomonPhase, setSolomonPhase] = useState<{ phase: string; label: string; progress: number; nextAction: string } | null>(null);
  // Sprint 5: Solomon structured output
  const [solEligibility, setSolEligibility] = useState<any[]>([]);
  const [solScoring, setSolScoring] = useState<any[]>([]);
  const [solChecklist, setSolChecklist] = useState<any[]>([]);
  // RAG v2: Classified documents for the session
  const [classifiedDocs, setClassifiedDocs] = useState<any[]>([]);
  const [classifiedDocsLoading, setClassifiedDocsLoading] = useState(false);
  const [docUploadFiles, setDocUploadFiles] = useState<File[]>([]);
  const [docUploading, setDocUploading] = useState(false);
  // RAG v2: Compose editor
  const [composeSections, setComposeSections] = useState<Array<{ id: string; title: string; content: string; status: "pending" | "generating" | "generated" | "approved"; wordCount: number }>>([]);
  const [composeGenerating, setComposeGenerating] = useState<string | null>(null);
  // FIX 7: Version upgrade impact banner
  const [versionImpact, setVersionImpact] = useState<{ docName: string; oldVersion: number; newVersion: number; summary: string; changes: any[]; dismissedAt?: string } | null>(null);
  // RAG v2: Reclassify dialog
  const [reclassifyDoc, setReclassifyDoc] = useState<any | null>(null);
  const [reclassifyType, setReclassifyType] = useState("");
  const [reclassifyRoute, setReclassifyRoute] = useState("");

  const [recheckLoading, setRecheckLoading] = useState(false);

  // GAP 1: Project scores
  const [projectScores, setProjectScores] = useState<{ scores: any[]; totalPoints: number; maxTotalPoints: number; percentage: number } | null>(null);
  // GAP 2: Budget validation
  const [budgetValidation, setBudgetValidation] = useState<{ results: any[]; summary: any } | null>(null);
  // GAP 8: Learnings
  const [learnings, setLearnings] = useState<any | null>(null);
  const [cabinetBranding, setCabinetBranding] = useState<{ fontFamily?: string; primaryColor?: string; footerText?: string } | null>(null);
  const [orgLabels, setOrgLabels] = useState<{ solomonLabel: string; neemiaLabel: string }>({ solomonLabel: "Solomon", neemiaLabel: "Neemia" });

  // Helper: resolve source label using custom org labels for Solomon/Neemia
  const getSourceLabel = useCallback((source: string | null | undefined): string => {
    if (!source) return "";
    if (source === "solomon" || source === "solomon_chat") return orgLabels.solomonLabel;
    return SOURCE_MAP[source] || source;
  }, [orgLabels.solomonLabel]);

  const [neemiaActiveTemplate, setNeemiaActiveTemplate] = useState(0);
  const [neemiaActivePage, setNeemiaActivePage] = useState(0);
  const [neemiaAnimKey, setNeemiaAnimKey] = useState(0);
  const [neemiaGenerating, setNeemiaGenerating] = useState(false);
  const [neemiaSplitWidth, setNeemiaSplitWidth] = useState(380);
  const neemiaSplitDragging = useRef(false);
  const neemiaSplitRef = useRef<HTMLDivElement>(null);

  // Form-on-document state
  const [fodRenderData, setFodRenderData] = useState<any>(null);
  const [fodLoading, setFodLoading] = useState(false);
  const [fodError, setFodError] = useState<string | null>(null);
  const [fodEnabled, setFodEnabled] = useState(true); // toggle between form-on-doc and classic view

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
  const [neemiaEditingField, setNeemiaEditingField] = useState<string | null>(null); // field key being edited
  const [neemiaEditValue, setNeemiaEditValue] = useState("");
  const [neemiaSavingField, setNeemiaSavingField] = useState(false);
  const [neemiaTogglingMode, setNeemiaTogglingMode] = useState(false);

  // ─── LOCK STATE ───
  const [lockOwned, setLockOwned] = useState(false);
  const [lockError, setLockError] = useState<{ lockedByName: string; lockedAt: string } | null>(null);
  const [lockRetrying, setLockRetrying] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lockPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  // Shared lock acquire function (used on mount + retry)
  const tryAcquireLock = async () => {
    try {
      await apiPost<any>(`/api/projects/${projectId}/lock`, {});
      if (!cancelledRef.current) {
        setLockOwned(true);
        setLockError(null);
        // Stop polling — we own the lock now
        if (lockPollRef.current) { clearInterval(lockPollRef.current); lockPollRef.current = null; }
        // Start heartbeat
        if (!heartbeatRef.current) {
          heartbeatRef.current = setInterval(async () => {
            try {
              await apiPost(`/api/projects/${projectId}/lock/heartbeat`, {});
            } catch {
              setLockOwned(false);
            }
          }, 5 * 60 * 1000);
        }
      }
      return true;
    } catch (err: any) {
      if (!cancelledRef.current) {
        try {
          const msg = err.message || "";
          if (msg.includes("blocat")) {
            const lockInfo = await apiGet<any>(`/api/projects/${projectId}/lock`);
            setLockError({ lockedByName: lockInfo.lockedByName || "Alt utilizator", lockedAt: lockInfo.lockedAt || "" });
          }
        } catch {
          setLockError({ lockedByName: "Alt utilizator", lockedAt: "" });
        }
        setLockOwned(false);
      }
      return false;
    }
  };

  // Manual retry from banner button
  const handleRetryLock = async () => {
    setLockRetrying(true);
    await tryAcquireLock();
    setLockRetrying(false);
  };

  // Acquire lock on mount, release on unmount
  useEffect(() => {
    cancelledRef.current = false;

    tryAcquireLock().then((acquired) => {
      // If lock not acquired, start polling every 30s to auto-acquire when freed
      if (!acquired && !cancelledRef.current) {
        lockPollRef.current = setInterval(async () => {
          if (cancelledRef.current) return;
          try {
            const lockInfo = await apiGet<any>(`/api/projects/${projectId}/lock`);
            if (!lockInfo.locked) {
              // Lock is free — try to acquire
              await tryAcquireLock();
            } else if (!cancelledRef.current) {
              // Update banner with fresh info
              setLockError({ lockedByName: lockInfo.lockedByName || "Alt utilizator", lockedAt: lockInfo.lockedAt || "" });
            }
          } catch {
            // Ignore poll errors
          }
        }, 30_000);
      }
    });

    // Release lock on unmount / navigation
    const releaseLock = () => {
      const token = typeof window !== "undefined" ? localStorage.getItem("df-token") || "" : "";
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify({ token })], { type: "application/json" });
        navigator.sendBeacon(`${API_URL}/api/projects/${projectId}/lock/release`, blob);
      }
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
      cancelledRef.current = true;
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
      if (lockPollRef.current) { clearInterval(lockPollRef.current); lockPollRef.current = null; }
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
        // RAG v2: Load initial phase from project
        if (proj.solomonPhase) setSolomonPhase(proj.solomonPhase);
        // RAG v2: Load classified documents + FIX 7: check version impacts
        apiGet<any[]>(`/api/folders/${proj.folderId}/classified-documents`).then(docs => {
          setClassifiedDocs(docs || []);
          const upgraded = (docs || []).find((d: any) => d.versionDiff && d.documentVersion > 1);
          if (upgraded?.versionDiff) {
            setVersionImpact({
              docName: upgraded.fileName || upgraded.name,
              oldVersion: (upgraded.documentVersion || 2) - 1,
              newVersion: upgraded.documentVersion || 2,
              summary: upgraded.versionDiff.summary || "Modificări detectate",
              changes: upgraded.versionDiff.changes || [],
            });
          }
        }).catch(() => {});
        // Sprint 5: Load Solomon structured output
        apiGet<any>(`/api/solomon/projects/${projectId}/eligibility`).then(r => setSolEligibility(r?.entries || [])).catch(() => {});
        apiGet<any>(`/api/solomon/projects/${projectId}/scoring`).then(r => setSolScoring(r?.criteria || [])).catch(() => {});
        apiGet<any>(`/api/solomon/projects/${projectId}/document-checklist`).then(r => setSolChecklist(r?.items || [])).catch(() => {});
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
        // Load org config for custom labels
        apiGet<any>(`/api/config`).then(cfg => {
          if (cfg) setOrgLabels({ solomonLabel: cfg.solomonLabel || "Solomon", neemiaLabel: cfg.neemiaLabel || "Neemia" });
        }).catch(() => {});
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

  async function initSolomonConversation(): Promise<string | null> {
    try {
      const convs = await apiGet<any[]>(`/api/solomon/projects/${projectId}/conversations`);
      if (convs && convs.length > 0) {
        // Pick the most recent conversation (API returns desc by createdAt, but sort client-side to be safe)
        const sorted = [...convs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const conv = sorted[0];
        setSolomonConvId(conv.id);
        // Ensure conversation uses Sonnet by default
        apiPut(`/api/solomon/conversations/${conv.id}/model`, { model: "claude-sonnet-4-6" }).catch(() => {});
        const msgs = await apiGet<any[]>(`/api/solomon/conversations/${conv.id}/messages`);
        setSolomonMessages((msgs || []).map((m: any) => ({
          role: m.role as "user" | "assistant",
          text: m.content || "",
          extractions: m.elementsExtracted ? (typeof m.elementsExtracted === "string" ? JSON.parse(m.elementsExtracted) : m.elementsExtracted) : null,
        })));
        const elems: SolomonElement[] = [];
        for (const m of (msgs || [])) {
          if (m.elementsExtracted) {
            const exts = typeof m.elementsExtracted === "string" ? JSON.parse(m.elementsExtracted) : m.elementsExtracted;
            for (const ext of exts) {
              elems.push({ key: ext.key, label: ext.label, value: ext.value, source: "Solomon", status: "propus" });
            }
          }
        }
        setSolomonElements(elems);
        return conv.id;
      } else {
        const newConv = await apiPost<any>(`/api/solomon/projects/${projectId}/conversations`, {});
        setSolomonConvId(newConv.id);
        // Display auto-greeting from Solomon with program context
        if (newConv.greeting) {
          setSolomonMessages([{ role: "assistant", text: newConv.greeting, extractions: [] }]);
        }
        return newConv.id;
      }
    } catch (err) {
      console.error("Failed to init Solomon conversation:", err);
      toast("error", "Conversația Solomon nu a putut fi inițializată. Reîncearcă.");
      return null;
    }
  }

  async function handleSolomonModelChange(model: "sonnet" | "opus") {
    const prevModel = solomonModel;
    setSolomonModel(model);
    if (solomonConvId) {
      const modelId = model === "opus" ? "claude-opus-4-6" : "claude-sonnet-4-6";
      try {
        await apiPut(`/api/solomon/conversations/${solomonConvId}/model`, { model: modelId });
      } catch {
        setSolomonModel(prevModel);
        toast("error", "Nu s-a putut schimba modelul. Încearcă din nou.");
      }
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
      /\bgândire aprofundat[aă]\b/, /\bgandire aprofundata\b/,
      /\bextended thinking\b/, /\bthinking extins\b/,
    ];
    return opusPatterns.some(p => p.test(lower));
  };

  // Ask Solomon about a specific element — prefill chat input and switch to Solomon tab
  const askSolomonAbout = async (el: { key: string; label: string; value?: string | null; status: string }) => {
    setActiveLeaf("solomon");
    const valueInfo = el.value ? `Valoarea curentă: "${el.value}"` : "Nu are valoare completată";
    const statusHint = el.status === "conflict" ? " (are conflict)" : el.status === "propus_ai" ? " (propus de AI, neconfirmat)" : "";
    const prompt = `Ajută-mă cu elementul "${el.label}" (${el.key})${statusHint}. ${valueInfo}. Ce valoare ar trebui completată și de unde o obțin?`;
    // Ensure conversation is initialized before setting input
    if (!solomonConvId) {
      await initSolomonConversation();
    }
    setSolomonInput(prompt);
    setTimeout(() => {
      (document.querySelector("[data-solomon-input]") as HTMLTextAreaElement)?.focus();
    }, 200);
  };

  const handleSolomonSend = async () => {
    if (readOnly || !solomonInput.trim() || solomonStreaming) return;
    let convId = solomonConvId;
    if (!convId) {
      // Conversation not initialized yet — init now and get ID directly
      convId = await initSolomonConversation();
      if (!convId) {
        toast("error", "Conversația Solomon nu este pregătită. Reîncearcă.");
        return;
      }
    }
    const userText = solomonInput;
    setSolomonMessages(prev => [...prev, { role: "user", text: userText, extractions: null }]);
    setSolomonInput("");
    setTimeout(() => (document.querySelector("[data-solomon-input]") as HTMLTextAreaElement)?.focus(), 50);
    setSolomonAutoScroll(true);
    setSolomonStreaming(true);
    setSolomonTimedOut(false);
    setSolomonSourceTrail([]); // FIX I: clear source trail for new turn

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
      const res = await fetch(`${API_URL}/api/solomon/conversations/${convId}/messages`, {
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
              // Small delay to let backend finish DB writes before re-fetching
              setTimeout(() => {
                apiGet<any>(`/api/projects/${projectId}`).then(proj => {
                  setElements(mapElements(proj.elements || []));
                }).catch(() => {});
              }, 800);
            } else if (evt.type === "error") {
              // Backend sent an error event (preflight failure, AI timeout, etc.)
              toast("error", evt.message || "Eroare Solomon.");
              setSolomonMessages(prev => {
                if (prev.length > 0 && prev[prev.length - 1].role === "assistant" && prev[prev.length - 1].text === "") {
                  return prev.slice(0, -1);
                }
                return prev;
              });
            } else if (evt.type === "tool_use") {
              // FIX I: Accumulate source trail instead of 3s flash
              setSolomonToolUse({ toolName: evt.toolName, query: evt.query });
              if (evt.sources && evt.sources.length > 0) {
                setSolomonSourceTrail(prev => [...prev, { query: evt.query || "", sources: evt.sources }]);
              }
              setTimeout(() => setSolomonToolUse(null), 5000);
            } else if (evt.type === "phase_update" && evt.phase) {
              // RAG v2: Solomon phase update
              setSolomonPhase(evt.phase);
            } else if (evt.type === "eligibility_update" && evt.entries) {
              // Sprint 5: Eligibility update
              setSolEligibility(prev => {
                const updated = [...prev];
                for (const entry of evt.entries) {
                  const idx = updated.findIndex(e => e.rule === entry.rule);
                  if (idx >= 0) updated[idx] = entry;
                  else updated.push(entry);
                }
                return updated;
              });
            } else if (evt.type === "scoring_update" && evt.entries) {
              // Sprint 5: Scoring update
              setSolScoring(prev => {
                const updated = [...prev];
                for (const entry of evt.entries) {
                  const idx = updated.findIndex(e => e.criterion === entry.criterion);
                  if (idx >= 0) updated[idx] = entry;
                  else updated.push(entry);
                }
                return updated;
              });
            } else if (evt.type === "checklist_update" && evt.entries) {
              // Sprint 5: Checklist update
              setSolChecklist(prev => {
                const updated = [...prev];
                for (const entry of evt.entries) {
                  const idx = updated.findIndex(e => e.document === entry.document);
                  if (idx >= 0) updated[idx] = entry;
                  else updated.push(entry);
                }
                return updated;
              });
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
                tipProiect: evt.metadata.tipProiect || prev.tipProiect,
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

  const handleSolomonUpload = async (filesOrFile: File | File[]) => {
    if (readOnly || solomonStreaming) return;
    let convId = solomonConvId;
    if (!convId) {
      convId = await initSolomonConversation();
      if (!convId) {
        toast("error", "Conversația Solomon nu este pregătită. Reîncearcă.");
        return;
      }
    }
    const files = Array.isArray(filesOrFile) ? filesOrFile : [filesOrFile];
    if (files.length === 0) return;

    const fileNames = files.map(f => f.name).join(", ");
    setSolomonMessages(prev => [...prev, { role: "user", text: files.length > 1 ? `${files.length} documente: ${fileNames}` : fileNames, extractions: null }]);
    setSolomonStreaming(true);

    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("df-token") : null;
      const formData = new FormData();
      for (const f of files) {
        formData.append("files", f);
      }

      const res = await fetch(`${API_URL}/api/solomon/conversations/${convId}/upload`, {
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
            } else if (evt.type === "error") {
              toast("error", evt.message || "Eroare Solomon.");
              setSolomonMessages(prev => {
                if (prev.length > 0 && prev[prev.length - 1].role === "assistant" && prev[prev.length - 1].text === "") {
                  return prev.slice(0, -1);
                }
                return prev;
              });
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
                tipProiect: evt.metadata.tipProiect || prev.tipProiect,
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
    // Guard against double-click
    if (extractionStates[k]) return;
    setExtractionStates(prev => ({ ...prev, [k]: "confirmed" }));
    const msg = solomonMessages[msgIdx];
    if (msg?.extractions?.[extIdx]) {
      const ext = msg.extractions[extIdx];
      setSolomonElements(prev => [
        { key: ext.key, label: ext.label, value: ext.value, source: "Solomon", status: "confirmat" },
        ...prev.filter(e => e.key !== ext.key),
      ]);

      // Persist to API — find matching element by key and update value + confirm
      // Try local match first; if not found, re-fetch from API (backend may have auto-created it during stream)
      let matchingEl = elements.find(e => e.key === ext.key);
      if (!matchingEl) {
        try {
          const proj = await apiGet<any>(`/api/projects/${projectId}`);
          const freshElements = mapElements(proj.elements || []);
          setElements(freshElements);
          matchingEl = freshElements.find(e => e.key === ext.key);
        } catch { /* re-fetch failed, continue */ }
      }
      if (matchingEl) {
        try {
          await apiPut(`/api/projects/${projectId}/elements/${matchingEl.id}`, {
            value: ext.value,
            source: "solomon",
            confirmed: true,
          });
          // Re-fetch full project to get updated validation, status, etc.
          const proj = await apiGet<any>(`/api/projects/${projectId}`);
          setElements(mapElements(proj.elements || []));

          // Cross-validate against reference tables
          apiPost("/api/reference/validate-element", {
            elementId: matchingEl.id,
            value: ext.value,
            projectId,
          }).then(validation => {
            if (validation && (validation as any).totalChecks > 0) {
              setExtractionValidations(prev => ({ ...prev, [k]: validation }));
            }
          }).catch(() => {});
        } catch (err) {
          console.error("Failed to persist Solomon extraction:", err);
          toast("error", "Eroare la salvarea datelor extrase");
          // Revert UI state so user can retry
          setExtractionStates(prev => { const next = { ...prev }; delete next[k]; return next; });
        }
      } else {
        // Element not found in DB — revert confirmed state and inform user
        toast("warning", `Elementul "${ext.label || ext.key}" nu a fost încă creat în proiect. Reîncearcă în câteva secunde.`);
        setExtractionStates(prev => { const next = { ...prev }; delete next[k]; return next; });
        setSolomonElements(prev => prev.map(e => e.key === ext.key ? { ...e, status: "propus" as const } : e));
      }
    }
  };

  const handleRejectExtraction = (msgIdx: number, extIdx: number) => {
    const k = `${msgIdx}-${extIdx}`;
    if (extractionStates[k]) return; // Guard against double-click
    setExtractionStates(prev => ({ ...prev, [k]: "rejected" }));
  };

  const handleConfirmElement = async (idx: number) => {
    if (readOnly) return;
    const el = solomonElements[idx];
    setSolomonElements(prev => prev.map((e, i) => i === idx ? { ...e, status: "confirmat" } : e));

    // Persist to API — re-fetch if not found locally (backend may have auto-created)
    let matchingEl = elements.find(e => e.key === el.key);
    if (!matchingEl) {
      try {
        const proj = await apiGet<any>(`/api/projects/${projectId}`);
        const freshElements = mapElements(proj.elements || []);
        setElements(freshElements);
        matchingEl = freshElements.find(e => e.key === el.key);
      } catch { /* re-fetch failed */ }
    }
    if (matchingEl) {
      try {
        await apiPut(`/api/projects/${projectId}/elements/${matchingEl.id}`, {
          value: el.value,
          source: "solomon",
          confirmed: true,
        });
        // Re-fetch to get full updated state (validation, etc.)
        const proj = await apiGet<any>(`/api/projects/${projectId}`);
        setElements(mapElements(proj.elements || []));
      } catch (err) {
        console.error("Failed to persist Solomon element confirmation:", err);
        toast("error", "Eroare la confirmarea elementului");
      }
    }
  };

  const handleRejectElement = (idx: number) => {
    setSolomonElements(prev => prev.filter((_, i) => i !== idx));
  };

  const handleAddElement = async () => {
    if (!newElementKey.trim() || !newElementLabel.trim()) {
      toast("error", "Cheia și eticheta sunt obligatorii");
      return;
    }
    try {
      await apiPost(`/api/projects/${projectId}/elements`, {
        key: newElementKey.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""),
        label: newElementLabel.trim(),
        value: newElementValue.trim() || null,
      });
      // Refresh elements from API
      const proj = await apiGet<any>(`/api/projects/${projectId}`);
      setElements(mapElements(proj.elements || []));
      setAddingElement(false);
      setNewElementKey("");
      setNewElementLabel("");
      setNewElementValue("");
      toast("success", `Element „${newElementLabel.trim()}" adăugat`);
    } catch (err: any) {
      const msg = err?.message || err?.error || "Eroare la adăugare";
      toast("error", typeof msg === "string" ? msg : "Eroare la adăugare");
    }
  };

  const handleTextSelect = useCallback(() => {
    if (!refineEnabled) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString().trim();
    if (text.length < 5) return;
    const msgEl = (sel.anchorNode?.parentElement as HTMLElement)?.closest?.(".solomon-msg-left");
    if (!msgEl) return;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setRefinePopup({ text, x: rect.left, y: rect.bottom + 8 });
    setRefineInput("");
  }, [refineEnabled]);

  const handleRefineSubmit = async () => {
    if (readOnly || !refineInput.trim() || !refinePopup || !solomonConvId) return;
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

  const cleanSolomonText = (text: string): string => {
    // Strip internal markup that backend embeds (ELEMENTS_JSON, METADATA_JSON blocks)
    // Backend format: <!--ELEMENTS_JSON[...]ELEMENTS_JSON--> and <!--METADATA_JSON{...}METADATA_JSON-->
    let cleaned = text
      // Primary format: <!--ELEMENTS_JSON[...]ELEMENTS_JSON-->
      .replace(/<!--ELEMENTS_JSON[\s\S]*?ELEMENTS_JSON-->/g, "")
      .replace(/<!--METADATA_JSON[\s\S]*?METADATA_JSON-->/g, "")
      // Alternative format: <!--ELEMENTS_JSON-->...<!--/ELEMENTS_JSON-->
      .replace(/<!--ELEMENTS_JSON-->[\s\S]*?<!--\/ELEMENTS_JSON-->/g, "")
      .replace(/<!--METADATA_JSON-->[\s\S]*?<!--\/METADATA_JSON-->/g, "")
      // Handle incomplete/streaming markers (no closing tag yet)
      .replace(/<!--ELEMENTS_JSON[\s\S]*$/g, "")
      .replace(/<!--METADATA_JSON[\s\S]*$/g, "")
      // Strip any remaining HTML comment blocks
      .replace(/<!--[\s\S]*?-->/g, "")
      // Clean up JSON artifacts that may leak
      .replace(/ELEMENTS_JSON\{[\s\S]*?\}/g, "")
      .replace(/METADATA_JSON\{[\s\S]*?\}/g, "")
      .replace(/ELEMENTS_JSON\[[\s\S]*?\]/g, "")
      .replace(/METADATA_JSON\[[\s\S]*?\]/g, "")
      // Strip standalone HTML entities
      .replace(/&lt;!--[\s\S]*?--&gt;/g, "")
      .replace(/&lt;!--[\s\S]*/g, "")
      .trim();
    // Remove trailing whitespace / newlines from cleanup
    cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
    return cleaned;
  };

  const renderMsgText = (text: string) => {
    const cleaned = cleanSolomonText(text);
    // Parse markdown into structured blocks for rich display
    const lines = cleaned.split("\n");
    const blocks: React.ReactNode[] = [];
    let currentList: string[] = [];
    let blockKey = 0;

    const flushList = () => {
      if (currentList.length === 0) return;
      blocks.push(
        <ul key={blockKey++} className="solomon-md-list">
          {currentList.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      currentList = [];
    };

    const renderInline = (line: string): React.ReactNode => {
      // Handle **bold**, *italic*, `code`, [links](url), and plain text
      const parts = line.split(/(\*\*.*?\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/).filter(Boolean);
      return parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="solomon-md-bold">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("*") && part.endsWith("*") && !part.startsWith("**")) {
          return <em key={i} className="solomon-md-italic">{part.slice(1, -1)}</em>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return <code key={i} className="solomon-md-code">{part.slice(1, -1)}</code>;
        }
        // Markdown links: [text](url)
        const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (linkMatch) {
          return <a key={i} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="solomon-md-link">{linkMatch[1]}</a>;
        }
        return part;
      });
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Empty line — flush list and add spacer
      if (!trimmed) {
        flushList();
        continue;
      }

      // Headings
      if (trimmed.startsWith("### ")) {
        flushList();
        blocks.push(<h4 key={blockKey++} className="solomon-md-h3">{renderInline(trimmed.slice(4))}</h4>);
        continue;
      }
      if (trimmed.startsWith("## ")) {
        flushList();
        blocks.push(<h3 key={blockKey++} className="solomon-md-h2">{renderInline(trimmed.slice(3))}</h3>);
        continue;
      }
      if (trimmed.startsWith("# ")) {
        flushList();
        blocks.push(<h3 key={blockKey++} className="solomon-md-h2">{renderInline(trimmed.slice(2))}</h3>);
        continue;
      }

      // Blockquote (> text) — used for guide citations
      if (trimmed.startsWith("> ")) {
        flushList();
        // Collect consecutive blockquote lines
        const quoteLines: string[] = [trimmed.slice(2)];
        while (i + 1 < lines.length && lines[i + 1].trim().startsWith("> ")) {
          i++;
          quoteLines.push(lines[i].trim().slice(2));
        }
        blocks.push(
          <blockquote key={blockKey++} className="solomon-md-quote">
            {quoteLines.map((ql, qi) => <p key={qi}>{renderInline(ql)}</p>)}
          </blockquote>
        );
        continue;
      }

      // Code block (```)
      if (trimmed.startsWith("```")) {
        flushList();
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith("```")) {
          codeLines.push(lines[i]);
          i++;
        }
        blocks.push(
          <pre key={blockKey++} className="solomon-md-codeblock">{codeLines.join("\n")}</pre>
        );
        continue;
      }

      // Numbered list (1. 2. 3.) — keep numbers
      const numberedMatch = trimmed.match(/^(\d+)[.)]\s+(.+)/);
      if (numberedMatch) {
        currentList.push(numberedMatch[1] + ". " + numberedMatch[2]);
        continue;
      }

      // Bullet points (-, •, *)
      const bulletMatch = trimmed.match(/^[-•*]\s+(.+)/);
      if (bulletMatch) {
        currentList.push(bulletMatch[1]);
        continue;
      }

      // Horizontal rule
      if (/^[-=_]{3,}$/.test(trimmed) || /^═+$/.test(trimmed)) {
        flushList();
        blocks.push(<hr key={blockKey++} className="solomon-md-hr" />);
        continue;
      }

      // Markdown table detection: line starts with |
      if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
        flushList();
        // Collect all table rows
        const tableRows: string[] = [trimmed];
        while (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          if (nextLine.startsWith("|") && nextLine.endsWith("|")) {
            tableRows.push(nextLine);
            i++;
          } else {
            break;
          }
        }
        // Parse: first row = header, second row = separator (skip), rest = data
        const parseRow = (row: string) =>
          row.split("|").slice(1, -1).map(cell => cell.trim());
        const headers = parseRow(tableRows[0]);
        const dataRows = tableRows
          .slice(1)
          .filter(r => !/^[\s|:-]+$/.test(r)) // skip separator rows like |---|---|
          .map(parseRow);

        blocks.push(
          <div key={blockKey++} className="solomon-md-table-wrap">
            <table className="solomon-md-table">
              <thead>
                <tr>
                  {headers.map((h, hi) => (
                    <th key={hi}>{renderInline(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci}>{renderInline(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }

      // Regular paragraph
      flushList();
      blocks.push(<p key={blockKey++} className="solomon-md-p">{renderInline(trimmed)}</p>);
    }

    flushList();

    return <div className="solomon-md-content">{blocks}</div>;
  };

  const solomonConfirmedCount = solomonElements.filter(e => e.status === "confirmat").length;

  // ─── NEEMIA: Refresh documents list helper ───
  const refreshNeemiaDocs = async () => {
    const docs = await apiGet<any[]>(`/api/neemia/projects/${projectId}/documents`).catch(() => []);
    setNeemiaTemplates(prev => (docs || []).map((doc: any) => {
      // Preserve loaded pages from previous state if same template
      const existing = prev.find(t => t.templateDocumentId === doc.templateDocumentId);
      return {
        id: doc.id,
        name: doc.templateName || "Document",
        type: (doc.templateFileType || "DOCX").toUpperCase(),
        pages: existing?.pages || [],
        totalFields: existing?.totalFields || doc.filledCount || 0,
        filledFields: existing?.filledFields || doc.filledCount || 0,
        templateDocumentId: doc.templateDocumentId,
        status: doc.status,
        downloadUrl: doc.downloadUrl || null,
        generationMode: doc.generationMode || "fill",
        composeSections: doc.composeContent?.sections || undefined,
      };
    }));
  };

  // ─── NEEMIA: Inline field edit (Fill mode) ───
  const handleNeemiaFieldEdit = async (field: TemplateField, newValue: string) => {
    if (readOnly || neemiaSavingField) return;
    if (!projectId) return;

    setNeemiaSavingField(true);
    try {
      // Find projectElement by templateElementId or by key
      const projEls = elements;
      let peId: string | null = null;

      if (field.templateElementId) {
        const pe = projEls.find(e => (e as any).templateElementId === field.templateElementId);
        peId = pe?.id || null;
      }
      if (!peId) {
        const pe = projEls.find(e => e.key === field.key);
        peId = pe?.id || null;
      }

      if (!peId) {
        // Fetch from API as fallback
        const allProjEls = await apiGet<any[]>(`/api/projects/${projectId}/elements`);
        const pe = (allProjEls || []).find((e: any) =>
          e.templateElementId === field.templateElementId || e.key === field.key
        );
        peId = pe?.id || null;
      }

      if (!peId) {
        toast("error", "Element negăsit în proiect");
        return;
      }

      await apiPut(`/api/projects/${projectId}/elements/${peId}`, {
        value: newValue,
        source: "manual",
        confirmed: true,
      });

      // Update local Neemia state for immediate feedback
      setNeemiaTemplates(prev => prev.map((t, i) => {
        if (i !== neemiaActiveTemplate) return t;
        return {
          ...t,
          pages: t.pages.map(pg => ({
            ...pg,
            fields: pg.fields.map(f =>
              f.key === field.key ? { ...f, value: newValue, source: "Manual", confirmed: true } : f
            ),
            filledFields: pg.fields.filter(f => f.key === field.key ? !!newValue : !!f.value).length,
          })),
          filledFields: t.pages.reduce((sum, pg) =>
            sum + pg.fields.filter(f => f.key === field.key ? !!newValue : !!f.value).length, 0),
        };
      }));

      // Also update global elements state
      setElements(prev => prev.map(e => e.key === field.key ? { ...e, value: newValue, source: "manual", confirmed: true } : e));
      toast("success", `Câmp "${field.name}" actualizat`);
    } catch (err) {
      toast("error", `Eroare: ${(err as Error).message}`);
    } finally {
      setNeemiaSavingField(false);
      setNeemiaEditingField(null);
      setNeemiaEditValue("");
    }
  };

  // ─── FORM-ON-DOCUMENT: Field save handler ───
  const handleFodFieldSave = useCallback(async (fieldName: string, value: string, templateElementId: string | null) => {
    if (readOnly || !projectId) return;

    // Find projectElement by templateElementId or by key
    let peId: string | null = null;
    if (templateElementId) {
      const pe = elements.find(e => (e as any).templateElementId === templateElementId);
      peId = pe?.id || null;
    }
    if (!peId) {
      const pe = elements.find(e => e.key === fieldName);
      peId = pe?.id || null;
    }
    if (!peId) {
      const allProjEls = await apiGet<any[]>(`/api/projects/${projectId}/elements`);
      const pe = (allProjEls || []).find((e: any) =>
        e.templateElementId === templateElementId || e.key === fieldName
      );
      peId = pe?.id || null;
    }
    if (!peId) {
      toast("error", "Element negăsit în proiect");
      return;
    }

    await apiPut(`/api/projects/${projectId}/elements/${peId}`, {
      value,
      source: "manual",
      confirmed: true,
    });

    // Update FOD render data
    setFodRenderData((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        pages: prev.pages.map((p: any) => ({
          ...p,
          fields: p.fields.map((f: any) =>
            f.fieldName === fieldName ? { ...f, value, source: "manual", confirmed: true } : f
          ),
        })),
      };
    });

    // Update global elements state
    setElements(prev => prev.map(e => e.key === fieldName ? { ...e, value, source: "manual", confirmed: true } : e));

    // Update neemia templates state
    setNeemiaTemplates(prev => prev.map((t, i) => {
      if (i !== neemiaActiveTemplate) return t;
      return {
        ...t,
        pages: t.pages.map(pg => ({
          ...pg,
          fields: pg.fields.map(f =>
            f.key === fieldName ? { ...f, value, source: "Manual", confirmed: true } : f
          ),
          filledFields: pg.fields.filter(f => f.key === fieldName ? !!value : !!f.value).length,
        })),
        filledFields: t.pages.reduce((sum, pg) =>
          sum + pg.fields.filter(f => f.key === fieldName ? !!value : !!f.value).length, 0),
      };
    }));

    toast("success", `Câmp "${fieldName}" actualizat`);
  }, [readOnly, projectId, elements, neemiaActiveTemplate, toast]);

  const handleFodFieldConfirm = useCallback(async (fieldName: string, templateElementId: string | null) => {
    if (readOnly || !projectId) return;

    let peId: string | null = null;
    if (templateElementId) {
      const pe = elements.find(e => (e as any).templateElementId === templateElementId);
      peId = pe?.id || null;
    }
    if (!peId) {
      const pe = elements.find(e => e.key === fieldName);
      peId = pe?.id || null;
    }
    if (!peId) return;

    await apiPut(`/api/projects/${projectId}/elements/${peId}`, { confirmed: true });

    setFodRenderData((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        pages: prev.pages.map((p: any) => ({
          ...p,
          fields: p.fields.map((f: any) =>
            f.fieldName === fieldName ? { ...f, confirmed: true } : f
          ),
        })),
      };
    });

    toast("success", `Câmp "${fieldName}" confirmat`);
  }, [readOnly, projectId, elements, toast]);

  // ─── NEEMIA: Toggle generation mode (fill ↔ compose) ───
  const handleToggleGenerationMode = async (templateDocId: string, currentMode: "fill" | "compose") => {
    if (readOnly || neemiaTogglingMode) return;
    const newMode = currentMode === "fill" ? "compose" : "fill";
    setNeemiaTogglingMode(true);
    try {
      await apiPut(`/api/neemia/templates/${templateDocId}/generation-mode`, { mode: newMode });
      setNeemiaTemplates(prev => prev.map(t =>
        t.templateDocumentId === templateDocId ? { ...t, generationMode: newMode } : t
      ));
      toast("success", `Mod schimbat: ${newMode.toUpperCase()}`);
    } catch (err) {
      toast("error", `Eroare: ${(err as Error).message}`);
    } finally {
      setNeemiaTogglingMode(false);
    }
  };

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
              await refreshNeemiaDocs();
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
              await refreshNeemiaDocs();
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
              await refreshNeemiaDocs();
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

  // ─── COMPOSE: Edit section text (persist to API if document exists) ───
  const handleComposeEditSave = async (sectionIdx: number) => {
    const section = composePreviewSections[sectionIdx];
    setComposePreviewSections(prev => prev.map((s, i) =>
      i === sectionIdx ? { ...s, content: composeEditText, approved: true } : s
    ));
    setComposeEditing(null);
    setComposeEditText("");

    // Persist to API if a generated document exists
    const composeTmpl = neemiaTemplates.find(t => t.generationMode === "compose" && t.id);
    if (composeTmpl?.id && section?.marker) {
      try {
        await apiPut(`/api/neemia/documents/${composeTmpl.id}/sections/${encodeURIComponent(section.marker)}`, {
          content: composeEditText,
        });
      } catch (err) {
        toast("warning", "Editarea s-a salvat local dar nu s-a putut persista pe server");
      }
    }
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

  const handleChecklistRefresh = async () => {
    if (readOnly) return;
    try {
      const result = await apiPost<{ refreshed: number }>(`/api/projects/${projectId}/checklist/refresh`, {});
      toast("success", `Checklist reîmprospătat: ${result.refreshed} documente din ghid`);
      // Re-fetch checklist
      const data = await apiGet<any>(`/api/projects/${projectId}/checklist`);
      setChecklistItems(mapChecklist(data.items || []));
    } catch (err) { console.error("Checklist refresh failed:", err); toast("error", "Eroare la reîmprospătarea checklistului"); }
  };

  const handleChecklistNotes = async (itemId: string, notes: string) => {
    if (readOnly) return;
    try {
      await apiPut(`/api/projects/${projectId}/checklist/${itemId}`, { notes: notes || null });
      setChecklistItems(prev => prev.map(i => i.id === itemId ? { ...i, notes } : i));
    } catch (err) { console.error("Checklist notes failed:", err); toast("error", "Eroare la salvarea notelor"); }
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
      // Re-fetch to get full updated state (validation cascade, etc.)
      const proj = await apiGet<any>(`/api/projects/${projectId}`);
      setElements(mapElements(proj.elements || []));
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
        source: "consultant_manual",
      });
      // Re-fetch to get full updated state (validation cascade updates status correctly)
      const proj = await apiGet<any>(`/api/projects/${projectId}`);
      setElements(mapElements(proj.elements || []));
      setEditingElementId(null);
      setEditingElementValue("");
    } catch (err) {
      console.error("Save element edit failed:", err);
      toast("error", "Eroare la salvarea elementului");
    }
  };

  const [bulkConfirming, setBulkConfirming] = useState(false);

  // Fetch element constraints when an element is selected (via detail panel)
  useEffect(() => {
    const activeId = detailPanelId || selectedElement;
    if (!activeId) { setElementConstraints([]); return; }
    apiGet<any[]>(`/api/reference/elements/${activeId}/rule-links`)
      .then(links => setElementConstraints(links || []))
      .catch(() => setElementConstraints([]));
  }, [detailPanelId, selectedElement]);

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
          const sourceLabels: Record<string, string> = { onrc: "ONRC", solomon: orgLabels.solomonLabel, solomon_chat: orgLabels.solomonLabel, manual: "Manual", calculated: "Calculat", ghid: "Ghid" };
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
              templateElementId: f.templateElementId,
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

      // Load form-on-document render data for FILL mode
      if (tmpl.generationMode !== "compose" && fodEnabled) {
        setFodLoading(true);
        setFodError(null);
        setFodRenderData(null);
        try {
          const renderData = await apiGet<any>(`/api/neemia/projects/${projectId}/template-render/${tmpl.templateDocumentId}`);
          setFodRenderData(renderData);
        } catch (err) {
          console.warn("Form-on-document render failed, using classic view:", err);
          setFodError("Nu s-a putut renderiza documentul. Se afișează vizualizarea clasică.");
        } finally {
          setFodLoading(false);
        }
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
    // Category filter
    if (elemCatFilter !== "all" && e.category !== elemCatFilter) return false;
    // Status filter
    if (elemStatusFilter === "empty" && e.status !== "gol") return false;
    if (elemStatusFilter === "proposed" && e.status !== "propus_ai") return false;
    if (elemStatusFilter === "conflict" && e.status !== "conflict") return false;
    // Legacy status filters (kept for backward compat with old filter bar)
    if (elemFilter === "gol" && e.status !== "gol") return false;
    if (elemFilter === "propus_ai" && e.status !== "propus_ai") return false;
    if (elemFilter === "confirmat" && e.status !== "confirmat") return false;
    if (elemFilter === "de_confirmat" && (e.status !== "propus_ai")) return false;
    if (elemFilter === "src_solomon" && !(e.status === "propus_ai" && (e.source === "solomon" || e.source === "solomon_chat"))) return false;
    if (elemFilter === "src_calculated" && !(e.status === "propus_ai" && e.source === "calculated")) return false;
    if (elemFilter === "src_manual" && !(e.status === "propus_ai" && e.source !== "solomon" && e.source !== "solomon_chat" && e.source !== "calculated")) return false;
    if (elemSearch) {
      const q = elemSearch.toLowerCase();
      return e.label.toLowerCase().includes(q) || e.key.toLowerCase().includes(q) || (e.value || "").toLowerCase().includes(q);
    }
    return true;
  });

  // Group elements by category for grouped display
  const groupedElements = useMemo(() => {
    const groups: Record<string, ElementItem[]> = {};
    for (const el of filteredElements) {
      const cat = el.category || "other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(el);
    }
    // Sort categories in a logical order
    const catOrder = ["beneficiary", "financial", "farm", "investment", "location", "legal", "technical", "other"];
    const sorted: [string, ElementItem[]][] = [];
    for (const cat of catOrder) {
      if (groups[cat]) sorted.push([cat, groups[cat]]);
    }
    // Add any unknown categories at the end
    for (const cat of Object.keys(groups)) {
      if (!catOrder.includes(cat)) sorted.push([cat, groups[cat]]);
    }
    return sorted;
  }, [filteredElements]);

  // Element stats
  const elemStats = useMemo(() => {
    const confirmed = elements.filter(e => e.status === "confirmat").length;
    const proposed = elements.filter(e => e.status === "propus_ai").length;
    const manual = elements.filter(e => e.source === "consultant_manual" || e.source === "manual").length;
    const empty = elements.filter(e => e.status === "gol").length;
    const conflict = elements.filter(e => e.status === "conflict").length;
    return { confirmed, proposed, manual, empty, conflict, total: elements.length };
  }, [elements]);

  // Category counts for filter pills
  const catCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of elements) {
      const cat = e.category || "other";
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [elements]);

  // Export CSV
  const handleExportCSV = useCallback(() => {
    const header = "Cheie,Etichetă,Categorie,Valoare,Status,Sursă,Obligatoriu";
    const rows = elements.map(e =>
      [e.key, e.label, CAT_CONFIG[e.category]?.label || e.category, (e.value || "").replace(/,/g, ";"), e.status, e.sourceLabel || "", e.required ? "Da" : "Nu"].map(v => `"${v}"`).join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `elemente_proiect_${projectId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [elements, projectId]);

  // Open detail panel + load history
  const openDetailPanel = useCallback(async (elementId: string) => {
    setDetailPanelId(elementId);
    setDetailHistory([]);
    try {
      const logs = await apiGet<any[]>(`/api/projects/${projectId}/elements/${elementId}/history`);
      setDetailHistory(logs || []);
    } catch { /* ignore */ }
  }, [projectId]);

  const handleBulkConfirm = async () => {
    if (readOnly || bulkConfirming) return;
    const toConfirm = filteredElements.filter(e => e.status === "propus_ai");
    if (toConfirm.length === 0) return;
    setBulkConfirming(true);
    try {
      await apiPut(`/api/projects/${projectId}/elements-bulk/confirm`, {
        elementIds: toConfirm.map(e => e.id),
      });
      // Re-fetch full state
      const proj = await apiGet<any>(`/api/projects/${projectId}`);
      setElements(mapElements(proj.elements || []));
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
        .lock-banner .lb-retry{margin-left:auto;padding:4px 12px;border-radius:6px;border:1px solid #fbbf24;background:#fef3c7;color:#92400e;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s}
        .lock-banner .lb-retry:hover{background:#fde68a;border-color:#f59e0b}
        .lock-banner .lb-retry:disabled{opacity:.5;cursor:not-allowed}
        .lock-banner .lb-time{font-size:11px;color:#94a3b8;font-weight:600}
        .pv-container{display:flex;flex-direction:column;height:100vh;overflow:hidden;background:#f8fafc}

        .pv-project-header{padding:14px 28px;background:#ffffff;display:flex;align-items:center;gap:10px;border-bottom:1px solid #e2e8f0;flex-shrink:0;min-height:52px}
        .pv-breadcrumb{font-size:12px;color:#94a3b8;display:flex;align-items:center;gap:6px}
        .pv-breadcrumb a{color:#94a3b8;text-decoration:none;cursor:pointer;font-weight:500;transition:color .15s}
        .pv-breadcrumb a:hover{color:#4d8bff}
        .pv-breadcrumb .pv-bc-sep{color:#cbd5e1;font-size:11px}
        .pv-title{font-size:16px;font-weight:800;color:#0f172a;letter-spacing:-.3px}
        .pv-status-pill{display:inline-flex;align-items:center;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:600;letter-spacing:.3px;border:1px solid transparent;margin-left:auto}

        .pv-tabs{display:flex;gap:2px;background:#ffffff;padding:0 24px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;border-bottom:1px solid #e2e8f0;flex-shrink:0}
        .pv-tabs::-webkit-scrollbar{display:none}
        .pv-tab{padding:0 16px;height:44px;font-size:13px;font-weight:600;color:#94a3b8;cursor:pointer;border-bottom:2px solid transparent;transition:all .15s cubic-bezier(.4,0,.2,1);background:none;border-top:none;border-left:none;border-right:none;font-family:'Inter',system-ui,sans-serif;white-space:nowrap;display:flex;align-items:center;gap:6px;position:relative}
        .pv-tab:hover{color:#475569;background:rgba(248,250,252,.8)}
        .pv-tab.active{color:#0f172a;border-bottom-color:#4d8bff;background:transparent}
        .pv-tab-badge{font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;font-variant-numeric:tabular-nums;font-family:'JetBrains Mono',monospace;letter-spacing:-.3px}
        .pv-tab-badge.neutral{background:#f1f5f9;color:#cbd5e1}
        .pv-tab-badge.blue{background:rgba(77,139,255,.1);color:#4d8bff}
        .pv-tab-badge.green{background:rgba(52,211,153,.12);color:#059669}
        .pv-tab-badge.red{background:rgba(248,113,113,.1);color:#dc2626}

        .main-content{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;min-height:0}
        .content-body{flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0}

        /* Sumar */
        .sumar-panel{padding:24px;overflow-y:auto;flex:1;min-height:0}
        .sumar-progress{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px}
        .sp-card{padding:14px 20px;border-radius:12px;border:1px solid rgba(226,232,240,.7);background:#ffffff;transition:all .2s}
        .sp-card .sp-val{font-size:24px;font-weight:600;margin-bottom:2px}
        .sp-card .sp-label{font-size:13px;color:#94a3b8}
        .sumar-activity{padding:0}
        .sumar-activity h3{font-size:16px;font-weight:600;margin-bottom:12px;color:#0f172a}
        .sa-item{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f8fafc;border-radius:8px;margin-bottom:8px}
        .sa-item-icon{font-size:16px;flex-shrink:0}
        .sa-item-text{font-size:14px;color:#0f172a;flex:1}
        .sa-item-time{font-size:12px;color:#94a3b8;white-space:nowrap;flex-shrink:0}
        .sumar-info{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
        .si-card{padding:14px 20px;border-radius:12px;border:1px solid rgba(226,232,240,.7);background:#ffffff;transition:all .2s}
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
        .elig-stat .number{font-size:28px;font-weight:800;font-variant-numeric:tabular-nums}
        .elig-stat .label{font-size:12px;color:#64748b;margin-top:4px;font-weight:500}
        .elig-rule{display:flex;align-items:flex-start;gap:12px;padding:14px 20px;border-radius:10px;margin-bottom:8px;transition:all .15s cubic-bezier(.4,0,.2,1);cursor:pointer;border:none}
        .elig-rule.pass-bg{background:rgba(52,211,153,.08)}
        .elig-rule.fail-bg{background:rgba(248,113,113,.08)}
        .elig-rule.pending-bg{background:rgba(251,191,36,.08)}
        .elig-rule:hover{box-shadow:0 1px 4px rgba(0,0,0,.06)}
        .elig-icon{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;font-weight:700;margin-top:2px}
        .elig-icon.pass{background:transparent;color:#059669}
        .elig-icon.fail{background:transparent;color:#dc2626}
        .elig-icon.pending{background:transparent;color:#d97706}
        .elig-name{font-size:14px;font-weight:500;flex:1}
        .elig-name.pass-text{color:#059669}
        .elig-name.fail-text{color:#dc2626}
        .elig-name.pending-text{color:#d97706}
        .elig-detail{font-size:12px;color:#64748b;max-width:300px;text-align:right}
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
        .rcf-count{font-size:10px;font-weight:600;opacity:.7}
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
        .elig-status-badge{font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;margin-left:auto;flex-shrink:0;letter-spacing:.3px}
        .elig-status-badge.pass{color:#059669;background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.3)}
        .elig-status-badge.fail{color:#dc2626;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2)}
        .elig-status-badge.pending{color:#d97706;background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.25)}
        .rule-text{font-size:13px;line-height:1.5;color:#0f172a}
        .rule-meta{font-size:11px;color:#94a3b8;margin-top:6px;display:flex;gap:12px;align-items:center}
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
        .rd-conf-value{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums}
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
        .rd-doc-page{font-size:11px;font-weight:600;color:#94a3b8;padding:2px 8px;background:#f8fafc;border-radius:4px}
        .rd-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#94a3b8;gap:12px;padding:40px}
        .rd-empty-icon{font-size:48px;opacity:.4}
        .rd-empty-title{font-size:16px;font-weight:700;color:#64748b}
        .rd-empty-desc{font-size:13px;text-align:center;max-width:280px;line-height:1.6}

        /* Semantic tags */
        .rd-semantic-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px}
        .rd-sem-tag{font-size:10px;font-weight:700;letter-spacing:.4px;padding:3px 10px;border-radius:20px;display:inline-flex;align-items:center;gap:4px;text-transform:uppercase;font-family:'Inter',system-ui,sans-serif}
        .rd-sem-tag.threshold{color:#0369a1;background:rgba(14,165,233,.1);border:1px solid rgba(14,165,233,.25)}
        .rd-sem-tag.scoring{color:#7c3aed;background:rgba(167,139,250,.1);border:1px solid rgba(167,139,250,.25)}
        .rd-sem-tag.temporal{color:#0891b2;background:rgba(6,182,212,.1);border:1px solid rgba(6,182,212,.25)}
        .rd-sem-tag.document_based{color:#b45309;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.25)}
        .rd-sem-tag.dependency{color:#6d28d9;background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.25)}
        .rd-sem-tag.exclusion{color:#dc2626;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2)}
        .rd-sem-tag.exception{color:#ea580c;background:rgba(249,115,22,.1);border:1px solid rgba(249,115,22,.2)}
        .rd-sem-tag.proportional{color:#059669;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.25)}
        .rd-sem-tag.classification{color:#2563eb;background:rgba(37,99,235,.1);border:1px solid rgba(37,99,235,.2)}
        .rule-card-tags{display:flex;flex-wrap:wrap;gap:3px;margin-top:6px}
        .rule-card-tag{font-size:9px;font-weight:700;letter-spacing:.3px;padding:1px 7px;border-radius:10px;text-transform:uppercase;opacity:.85}

        /* Anexe & Date panel */
        .anexe-panel{display:grid;grid-template-columns:320px 1fr;flex:1;min-height:0;overflow:hidden}
        .anexe-list{overflow-y:auto;border-right:1px solid rgba(226,232,240,.8);padding:16px}
        .anexe-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;text-align:center;color:#64748b}
        .anexe-card{padding:14px 20px;border:1px solid rgba(226,232,240,.7);border-radius:12px;cursor:pointer;transition:all .2s;margin-bottom:8px;background:#ffffff}
        .anexe-card:hover{border-color:#cbd5e1}
        .anexe-card.active{border-color:#2563eb;background:rgba(37,99,235,.02)}
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
        .pdf-page-num{position:absolute;bottom:16px;right:24px;font-size:12px;color:#94a3b8;font-weight:600}

        /* Elemente — redesigned to match prototype */
        .el-shell{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}
        .el-header{padding:16px 24px;border-bottom:1px solid #e2e8f0;display:flex;flex-direction:column;gap:12px;background:#f8fafc}
        .el-header-top{display:flex;align-items:center;justify-content:space-between}
        .el-stats{display:flex;gap:20px}
        .el-stat{text-align:center}
        .el-stat-val{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums}
        .el-stat-lbl{font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em}
        .el-progress-wrap{}
        .el-progress{height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden}
        .el-progress-fill{height:100%;border-radius:3px;transition:width 600ms ease}
        .el-progress-labels{display:flex;justify-content:space-between;font-size:12px;color:#94a3b8;margin-top:4px}
        .el-toolbar{display:flex;align-items:center;gap:8px;padding:10px 24px;border-bottom:1px solid #e2e8f0;flex-wrap:wrap}
        .el-search-box{display:flex;align-items:center;gap:6px;border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px;background:#fff;min-width:200px;transition:all 150ms ease}
        .el-search-box:focus-within{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.1)}
        .el-search-box input{border:none;outline:none;font-size:13px;font-family:inherit;flex:1;background:transparent;color:#0f172a}
        .el-search-box input::placeholder{color:#94a3b8}
        .el-search-icon{color:#94a3b8;font-size:14px}
        .el-pill{padding:5px 12px;border-radius:9999px;font-size:12px;font-weight:500;border:1px solid #e2e8f0;background:#fff;color:#475569;cursor:pointer;transition:all 150ms ease;white-space:nowrap;user-select:none}
        .el-pill:hover{background:#f1f5f9}
        .el-pill.active{background:#2563eb;color:#fff;border-color:#2563eb}
        .el-pill-count{opacity:.7;margin-left:2px}
        .el-pill-status{}.el-pill-status.active{background:transparent;color:#0f172a;font-weight:600;border-width:2px}
        .el-sep{width:1px;height:20px;background:#e2e8f0}
        .el-scroll{flex:1;overflow-y:auto}
        .el-scroll::-webkit-scrollbar{width:6px}.el-scroll::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:3px}
        .el-group{margin-bottom:0}
        .el-group-header{display:flex;align-items:center;gap:8px;padding:10px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;cursor:pointer;position:sticky;top:0;z-index:2;transition:background 150ms}
        .el-group-header:hover{background:#f1f5f9}
        .el-group-icon{font-size:16px}
        .el-group-name{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#475569}
        .el-group-count{font-size:12px;color:#94a3b8}
        .el-group-progress{flex:1;display:flex;align-items:center;gap:8px;justify-content:flex-end}
        .el-group-bar{width:80px;height:3px;background:#e2e8f0;border-radius:2px;overflow:hidden}
        .el-group-bar-fill{height:100%;border-radius:2px;transition:width 400ms ease}
        .el-group-pct{font-size:11px;font-weight:600;color:#94a3b8;min-width:30px;text-align:right}
        .el-group-chevron{color:#94a3b8;transition:transform 150ms ease;font-size:12px}
        .el-group-items{}
        .el-row{display:flex;align-items:center;padding:10px 24px 10px 48px;border-bottom:1px solid #f1f5f9;transition:background 150ms ease;gap:12px;min-height:52px}
        .el-row:hover{background:#f8fafc}
        .el-row:last-child{border-bottom:none}
        .el-row.editing{background:#eff6ff}
        .el-status-icon{width:22px;height:22px;border-radius:9999px;display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0}
        .el-status-icon.confirmat{background:#ecfdf5;color:#059669}
        .el-status-icon.propus_ai{background:#fffbeb;color:#d97706}
        .el-status-icon.gol{background:#f1f5f9;color:#94a3b8}
        .el-status-icon.conflict{background:#fef2f2;color:#dc2626}
        .el-info{flex:1;min-width:0}
        .el-label{font-size:14px;font-weight:500;display:flex;align-items:center;gap:4px;color:#0f172a}
        .el-req{color:#dc2626;font-size:11px}
        .el-key-text{font-size:11px;color:#94a3b8;font-family:'JetBrains Mono',monospace}
        .el-value-area{flex:0 0 300px;min-width:0}
        .el-val{font-size:14px;font-weight:500;font-family:'JetBrains Mono',monospace;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;max-width:290px}
        .el-val.empty{color:#94a3b8;font-style:italic;font-family:inherit;font-weight:400}
        .el-val.conflict{color:#dc2626;text-decoration:line-through;opacity:.6}
        .el-source-area{flex:0 0 140px;min-width:0}
        .el-src-badge{display:inline-flex;align-items:center;gap:3px;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:500;white-space:nowrap}
        .el-src-badge.ocr{background:#dbeafe;color:#1e40af}
        .el-src-badge.solomon{background:#fffbeb;color:#d97706}
        .el-src-badge.manual{background:#f5f3ff;color:#7c3aed}
        .el-src-badge.system{background:#f1f5f9;color:#94a3b8}
        .el-src-badge.anaf{background:#d1fae5;color:#065f46}
        .el-actions{flex:0 0 auto;display:flex;gap:4px;opacity:0;transition:opacity 150ms ease}
        .el-row:hover .el-actions{opacity:1}
        .el-edit-input{width:100%;border:1px solid #2563eb;border-radius:6px;padding:4px 8px;font-size:14px;font-family:'JetBrains Mono',monospace;outline:none;background:#eff6ff;color:#0f172a}
        .el-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:500;border:none;cursor:pointer;transition:all 150ms ease;white-space:nowrap;font-family:inherit}
        .el-btn-pri{background:#0f172a;color:#fff}.el-btn-pri:hover{background:#1e293b}
        .el-btn-sec{background:#fff;border:1px solid #e2e8f0;color:#475569}.el-btn-sec:hover{background:#f1f5f9}
        .el-btn-ok{background:#059669;color:#fff}.el-btn-ok:hover{background:#047857}
        .el-btn-ghost{background:transparent;color:#475569;padding:5px 8px}.el-btn-ghost:hover{background:#f1f5f9}
        .el-btn-sm{padding:4px 10px;font-size:12px}
        .el-btn:disabled{opacity:.5;cursor:not-allowed}
        .el-input{padding:6px 10px;font-size:12px;border-radius:6px;border:1px solid #e2e8f0;background:#fff;color:#0f172a;outline:none;font-family:inherit}
        .el-input:focus{border-color:#2563eb;box-shadow:0 0 0 2px rgba(37,99,235,.1)}
        .el-add-form{padding:12px 16px;background:rgba(37,99,235,.03);border:1px solid rgba(37,99,235,.12);border-radius:8px;margin-bottom:8px}
        .el-status-badge{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:500;padding:2px 10px;border-radius:9999px;border:1px solid}
        .el-status-badge.confirmat{background:#ecfdf5;color:#059669;border-color:#a7f3d0}
        .el-status-badge.propus_ai{background:#fffbeb;color:#d97706;border-color:#fde68a}
        .el-status-badge.gol{background:#f1f5f9;color:#94a3b8;border-color:#e2e8f0}
        .el-status-badge.conflict{background:#fef2f2;color:#dc2626;border-color:#fecaca}
        /* Detail slide-out panel */
        .el-overlay{position:fixed;inset:0;background:rgba(0,0,0,.25);z-index:45}
        .el-detail-panel{position:fixed;right:0;top:0;bottom:0;width:400px;background:#fff;box-shadow:-4px 0 24px rgba(0,0,0,.12);z-index:50;display:flex;flex-direction:column;transform:translateX(100%);transition:transform 250ms ease}
        .el-detail-panel.open{transform:translateX(0)}
        .dp-header{padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between}
        .dp-title{font-size:15px;font-weight:600;color:#0f172a}
        .dp-close{width:32px;height:32px;border:none;background:none;border-radius:8px;cursor:pointer;color:#94a3b8;display:flex;align-items:center;justify-content:center;font-size:18px;transition:all 150ms}
        .dp-close:hover{background:#f1f5f9;color:#0f172a}
        .dp-body{flex:1;overflow-y:auto;padding:20px}
        .dp-field{margin-bottom:16px}
        .dp-field-label{font-size:12px;font-weight:500;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px}
        .dp-field-value{font-size:15px;font-weight:500;color:#0f172a}
        .dp-mono{font-family:'JetBrains Mono',monospace;font-size:13px}
        .dp-history{border-top:1px solid #e2e8f0;padding-top:12px;margin-top:12px}
        .dp-history-title{font-size:13px;font-weight:600;margin-bottom:8px;color:#0f172a}
        .dp-history-item{display:flex;gap:8px;font-size:12px;color:#475569;margin-bottom:8px;padding-left:12px;border-left:2px solid #e2e8f0}
        .dp-history-time{color:#94a3b8;white-space:nowrap;min-width:70px}

        /* Checklist */
        .checklist-panel{padding:28px 32px;max-width:960px;overflow-y:auto;flex:1;min-height:0}
        .check-progress{display:flex;align-items:center;gap:20px;margin-bottom:24px;padding:22px;border-radius:12px;border:1px solid rgba(226,232,240,.8);background:#ffffff}
        .check-ring{width:80px;height:80px;position:relative;flex-shrink:0}
        .check-ring svg{transform:rotate(-90deg)}
        .check-ring-text{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#0f172a;font-variant-numeric:tabular-nums}
        .check-info{flex:1}
        .check-info .ci-title{font-size:16px;font-weight:700;margin-bottom:4px;color:#0f172a}
        .check-info .ci-sub{font-size:13px;color:#64748b}
        .check-category{margin-bottom:16px}
        .check-cat-header{display:flex;align-items:center;gap:8px;padding:8px 0;cursor:pointer;font-size:14px;font-weight:700;color:#64748b}
        .check-cat-header:hover{color:#0f172a}
        .check-cat-count{font-size:11px;color:#94a3b8;font-weight:600}
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
        .check-refresh-btn{padding:8px 12px;border-radius:8px;border:1px solid rgba(226,232,240,.8);background:transparent;color:#94a3b8;font-size:12px;font-weight:500;cursor:pointer;font-family:'Inter',system-ui,sans-serif;transition:all .15s;white-space:nowrap}
        .check-refresh-btn:hover{border-color:#2563eb;color:#2563eb}
        .check-notes-badge{font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(251,191,36,.1);color:#b45309;cursor:pointer;white-space:nowrap;flex-shrink:0}
        .check-notes-textarea{width:100%;padding:6px 8px;border-radius:6px;border:1px solid #e2e8f0;background:#f8fafc;color:#0f172a;font-size:11px;font-family:'Inter',system-ui,sans-serif;resize:vertical;outline:none}
        .check-notes-textarea:focus{border-color:#2563eb}
        .check-menu-notes{padding:4px 8px}
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
        .solomon-flux-panel{width:240px;min-width:200px;border-right:1px solid rgba(226,232,240,.8);background:#f8fafc;display:flex;flex-direction:column;overflow:hidden}
        .sfp-header{padding:12px 14px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8}
        .sfp-scroll{flex:1;overflow-y:auto;padding:0 8px 12px}
        .sfp-stage{margin-bottom:12px}
        .sfp-stage-header{display:flex;align-items:center;gap:8px;padding:4px 8px;cursor:default}
        .sfp-stage-num{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0}
        .sfp-stage-num.done{background:#059669}
        .sfp-stage-num.active{background:#2563eb}
        .sfp-stage-num.pending{background:#cbd5e1}
        .sfp-stage-info{flex:1;min-width:0}
        .sfp-stage-name{font-size:13px;font-weight:600;color:#0f172a;line-height:1.3}
        .sfp-stage-desc{font-size:11px;color:#94a3b8;line-height:1.3}
        .sfp-stage-check{color:#059669;font-size:14px;flex-shrink:0}
        .sfp-items{padding-left:18px;margin-top:2px}
        .sfp-item{display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:6px;cursor:pointer;transition:background .1s;font-size:12px;color:#475569}
        .sfp-item:hover{background:rgba(37,99,235,.05)}
        .sfp-item.active{background:rgba(37,99,235,.08);color:#2563eb;font-weight:600}
        .sfp-item-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
        .sfp-item-dot.done{background:#059669}
        .sfp-item-dot.active{background:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.2)}
        .sfp-item-dot.pending{background:#cbd5e1}
        .sfp-item-badge{margin-left:auto;font-size:10px;font-weight:600;padding:1px 6px;border-radius:4px;font-family:'JetBrains Mono',monospace}
        .sfp-item-badge.done{background:#ecfdf5;color:#059669}
        .sfp-item-badge.active{background:#eff6ff;color:#2563eb}
        .sfp-item-badge.pending{color:#94a3b8}
        .solomon-chat{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden;position:relative;background:#ffffff}
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
        .model-btn{padding:5px 12px;font-size:12px;font-weight:600;border-radius:6px;border:none;cursor:pointer;background:transparent;color:#64748b;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .model-btn.active{background:#2563eb;color:#ffffff}
        .model-btn:hover:not(.active){color:#0f172a;background:#f1f5f9}
        .et-toggle{display:flex;align-items:center;gap:5px;font-size:11px;color:#64748b;cursor:pointer;padding:5px 10px;border-radius:8px;border:1px solid rgba(226,232,240,.8);background:transparent;font-family:'Inter',system-ui,sans-serif;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .et-toggle.on{border-color:#7c3aed;color:#7c3aed;background:rgba(167,139,250,.08)}
        .chat-messages{flex:1;overflow-y:auto;overflow-x:hidden;padding:24px 20px;min-height:0}
        .chat-messages-inner{max-width:720px;margin:0 auto;width:100%;display:flex;flex-direction:column;gap:24px}
        .solomon-msg{display:flex;max-width:85%}
        .solomon-msg.solomon-msg-left{align-self:flex-start}
        .solomon-msg.solomon-msg-right{align-self:flex-end}
        .solomon-msg-body{flex:1;min-width:0}
        .solomon-msg-right .solomon-msg-body{text-align:right}
        .solomon-msg-right .solomon-msg-text{background:rgba(77,139,255,0.06);border-radius:14px 14px 2px 14px;padding:10px 14px;display:inline-block;text-align:left}
        .solomon-msg-left .solomon-msg-text{padding:10px 0}
        .solomon-msg-text{font-size:14.5px;line-height:1.7;color:#475569;font-family:'Inter',system-ui,sans-serif}
        .solomon-msg-text strong{color:#0f172a;font-weight:600}
        .chat-msg .msg-bold{font-weight:600;color:#0f172a}

        /* Solomon Markdown Rich Content */
        .solomon-md-content{display:flex;flex-direction:column;gap:4px}
        .solomon-md-p{margin:0;padding:0;font-size:14.5px;line-height:1.7;color:#475569;max-width:640px}
        .solomon-md-h2{margin:16px 0 6px;padding:0;font-size:16px;font-weight:700;color:#0f172a;line-height:1.4;display:flex;align-items:center;gap:6px;letter-spacing:-0.01em}
        .solomon-md-h3{margin:12px 0 4px;padding:0;font-size:15px;font-weight:600;color:#1e293b;line-height:1.4;display:flex;align-items:center;gap:6px}
        .solomon-md-bold{color:#0f172a;font-weight:600}
        .solomon-md-italic{font-style:italic;color:#64748b}
        .solomon-md-code{background:#f1f5f9;color:#7c3aed;padding:1px 5px;border-radius:4px;font-size:13px;font-family:'JetBrains Mono','SF Mono',monospace}
        .solomon-md-list{margin:4px 0;padding-left:20px;display:flex;flex-direction:column;gap:3px;list-style:none}
        .solomon-md-list li{position:relative;font-size:14.5px;line-height:1.7;color:#475569;padding-left:12px}
        .solomon-md-list li::before{content:'';position:absolute;left:0;top:9px;width:5px;height:5px;border-radius:50%;background:#94a3b8}
        .solomon-md-hr{border:none;height:1px;background:linear-gradient(90deg,transparent,#e2e8f0 20%,#e2e8f0 80%,transparent);margin:12px 0}
        .solomon-md-table-wrap{overflow-x:auto;margin:8px 0;max-width:640px}
        .solomon-md-table{width:100%;border-collapse:collapse;font-size:13px;line-height:1.5}
        .solomon-md-table th{text-align:left;padding:8px 12px;background:#f1f5f9;border:1px solid #e2e8f0;font-weight:700;color:#0f172a;font-size:12px;text-transform:uppercase;letter-spacing:.3px;white-space:nowrap}
        .solomon-md-table td{padding:6px 12px;border:1px solid #e2e8f0;color:#475569;font-variant-numeric:tabular-nums}
        .solomon-md-table tbody tr:hover{background:#f8fafc}
        .solomon-md-table tbody tr:nth-child(even){background:#fafbfc}
        .solomon-md-quote{margin:8px 0;padding:10px 16px;border-left:3px solid #4d8bff;background:#f0f7ff;border-radius:0 8px 8px 0;color:#334155;font-size:13.5px;line-height:1.6;font-style:italic}
        .solomon-md-quote p{margin:0 0 4px}
        .solomon-md-quote p:last-child{margin:0}
        .solomon-md-codeblock{margin:8px 0;padding:12px 16px;background:#1e293b;color:#e2e8f0;border-radius:8px;font-size:12.5px;font-family:'JetBrains Mono','SF Mono',monospace;line-height:1.6;overflow-x:auto;white-space:pre;max-width:640px}
        .solomon-md-link{color:#2563eb;text-decoration:none;font-weight:500;border-bottom:1px solid rgba(37,99,235,.2)}
        .solomon-md-link:hover{border-bottom-color:#2563eb}
        .extraction-cards{margin-top:12px;display:flex;flex-direction:column;gap:8px}
        .extraction-card{background:#f0f7ff;border:1px solid #bfdbfe;border-radius:12px;padding:14px 20px;transition:all .2s}
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
        .exc-rejected-label{font-size:11px;font-weight:500;color:#dc2626;display:flex;align-items:center;gap:4px}
        .exc-collapsed-summary{display:flex;align-items:center;gap:8px;padding:8px 14px;margin-top:8px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;cursor:pointer;transition:all .15s;user-select:none}
        .exc-collapsed-summary:hover{background:#dcfce7;border-color:#86efac}
        .exc-collapsed-icon{font-size:13px;color:#059669;font-weight:600}
        .exc-collapsed-text{font-size:12px;font-weight:500;color:#059669;flex:1}
        .exc-collapsed-toggle{font-size:10px;color:#94a3b8}
        .confirm-all-bar{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#eff6ff;border-radius:8px;margin-bottom:4px}
        .confirm-all-bar span{font-size:13px;color:#2563eb;font-weight:500}
        .chat-timestamp{font-size:10px;color:#94a3b8;margin-top:4px}
        .chat-input-area{padding:16px 20px;border-top:1px solid rgba(226,232,240,.8);background:#ffffff}
        .chat-input-inner{max-width:760px;margin:0 auto}
        .chat-input-wrapper{display:flex;gap:8px;align-items:flex-end;max-width:720px;margin:0 auto;width:100%}
        .chat-hint{text-align:center;font-size:11px;color:#94a3b8;margin-top:8px;font-family:'Inter',system-ui,sans-serif}
        .chat-attach-btn{width:32px;height:32px;border-radius:8px;border:none;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#94a3b8;transition:all .15s cubic-bezier(.4,0,.2,1);flex-shrink:0;padding:0}
        .chat-attach-btn:hover{color:#2563eb;background:rgba(37,99,235,.06)}
        .chat-attach-btn:disabled{opacity:.4;cursor:not-allowed}
        .chat-input-row{display:flex;flex-direction:column;background:#ffffff;border:1px solid rgba(226,232,240,.8);border-radius:16px;padding:4px 12px 4px 4px;transition:border-color .15s;flex:1;min-width:0}
        .chat-input-row:focus-within{border-color:rgba(226,232,240,.8)}
        .chat-input-toolbar{display:flex;align-items:center;gap:4px;padding:0 4px 4px 8px}
        .chat-input{flex:1;padding:10px 12px 4px 12px;border-radius:8px;border:none;background:transparent;color:#0f172a;font-size:14px;font-family:'Inter',system-ui,sans-serif;line-height:1.5;resize:none;outline:none;min-height:68px;max-height:200px;overflow-y:auto}
        .chat-input::placeholder{color:#94a3b8}
        .chat-btn{width:36px;height:36px;border-radius:12px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s cubic-bezier(.4,0,.2,1);flex-shrink:0}
        .chat-btn.send{background:linear-gradient(135deg,#4d8bff 0%,#2563eb 100%);color:#ffffff;font-size:16px;box-shadow:0 2px 8px rgba(37,99,235,.25)}
        .chat-btn.send:hover{background:linear-gradient(135deg,#3b7aed 0%,#1d4ed8 100%);box-shadow:0 4px 16px rgba(37,99,235,.35);transform:scale(1.05)}
        .solomon-elements-panel{width:300px;min-width:260px;border-left:1px solid rgba(226,232,240,.8);background:#f8fafc;display:flex;flex-direction:column;overflow:hidden}
        .sep-header{padding:16px 16px 12px;border-bottom:1px solid rgba(226,232,240,.8);display:flex;flex-direction:column;gap:8px}
        .sep-header-top{display:flex;align-items:center;justify-content:space-between}
        .sep-header-title{font-size:14px;font-weight:700;color:#0f172a}
        .sep-count{font-size:13px;font-weight:700;color:#2563eb;font-variant-numeric:tabular-nums}
        .sep-progress-bar{height:4px;background:#f0f2f5;border-radius:2px;overflow:hidden}
        .sep-progress-fill{height:100%;background:#2563eb;border-radius:2px;transition:width .3s}
        .sep-scroll{flex:1;overflow-y:auto;padding:8px 10px;display:flex;flex-direction:column;gap:4px}
        .sep-category-group{margin-bottom:8px}
        .sep-category-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;padding:10px 8px 4px;font-family:'Inter',system-ui,sans-serif}
        .sep-row{display:flex;align-items:flex-start;justify-content:space-between;padding:8px 8px;border-radius:8px;transition:background .1s}
        .sep-row.clickable{cursor:pointer}
        .sep-row:hover{background:rgba(0,0,0,.03)}
        .sep-row.clickable:hover{background:rgba(37,99,235,.04)}
        .sep-row-arrow{color:#94a3b8;font-size:18px;line-height:1;flex-shrink:0;margin-top:2px;transition:color .1s}
        .sep-row.clickable:hover .sep-row-arrow{color:#2563eb}
        .sep-row-left{display:flex;align-items:flex-start;gap:8px;flex:1;min-width:0}
        .sep-row-icon{font-size:12px;flex-shrink:0;width:16px;text-align:center;margin-top:1px}
        .sep-row-icon.confirmat{color:#059669}
        .sep-row-icon.propus_ai,.sep-row-icon.proposed{color:#d97706}
        .sep-row-icon.conflict{color:#dc2626}
        .sep-row-icon.gol{color:#cbd5e1;font-size:10px}
        .sep-row-info{flex:1;min-width:0}
        .sep-row-label{font-size:12.5px;color:#64748b;line-height:1.4}
        .sep-row-key{font-size:10px;font-family:'JetBrains Mono',monospace;color:#94a3b8;line-height:1.3;opacity:.7}
        .sep-row-value{font-size:13px;font-weight:600;color:#0f172a;line-height:1.4;word-break:break-word}
        .sep-row-value.confirmat{color:#059669}
        .sep-row-value.propus_ai{color:#d97706}
        .sep-row-value.proposed{color:#d97706}
        .sep-row-value.empty{color:#f97316;font-weight:500;font-style:italic;font-size:12px}
        .sep-row-actions{display:flex;gap:2px;flex-shrink:0;margin-top:1px}
        .sep-mini-btn{width:22px;height:22px;border-radius:6px;border:1px solid rgba(226,232,240,.8);background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:11px;transition:all .12s}
        .sep-mini-btn.confirm{color:#059669}
        .sep-mini-btn.confirm:hover{background:rgba(52,211,153,.12);border-color:#34d399}
        .sep-mini-btn.reject{color:#94a3b8}
        .sep-mini-btn.reject:hover{color:#dc2626;border-color:#dc2626;background:rgba(248,113,113,.08)}
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
        .tc-badge{font-size:10px;font-weight:700;padding:1px 5px;border-radius:3px;background:#f1f5f9;color:#94a3b8}
        .template-card .tc-info{font-size:12px;color:#64748b}
        .template-card .tc-progress{height:3px;background:#f0f2f5;border-radius:2px;margin-top:8px;overflow:hidden}
        .tc-progress-fill{height:100%;border-radius:2px;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .neemia-doc-view{flex:1;display:flex;flex-direction:column;min-width:0}
        .neemia-page-nav{padding:10px 20px;display:flex;align-items:center;gap:8px;border-bottom:1px solid rgba(226,232,240,.8);background:#ffffff}
        .neemia-page-nav .nav-label{font-size:13px;font-weight:600;color:#64748b;margin-right:4px;white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis}
        .nav-pages-scroll{display:flex;gap:4px;overflow-x:auto;flex:1;padding:2px 0}
        .page-thumb{min-width:32px;height:32px;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:12px;font-weight:700;cursor:pointer;border:2px solid transparent;transition:all .15s cubic-bezier(.4,0,.2,1);padding:2px 6px;font-variant-numeric:tabular-nums}
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
        .nav-stat-filled{font-size:12px;font-weight:600;color:#64748b;font-variant-numeric:tabular-nums}
        .nav-stat-pct{font-size:14px;font-weight:800;font-variant-numeric:tabular-nums}
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
        .neemia-checklist-critical .ncb-pct{font-size:11px;font-weight:600;color:#d97706}
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
          .pv-project-header{padding:12px 16px}
          .pv-tabs{padding:0 14px}
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
          .pv-tabs{padding:0 10px;gap:0}
          .pv-tab{padding:0 10px;height:40px;font-size:12px}
          .el-grid{grid-template-columns:1fr}
          .sg-stats{flex-direction:column;gap:8px}
          .neemia-templates{max-height:180px}
          .solomon-elements-panel{display:none}
          .solomon-flux-panel{display:none}
          .sumar-panel{padding:20px 16px}
          .elig-panel{padding:16px}
        }

        /* ═══ FORM-ON-DOCUMENT ═══ */
        .fod-container{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}
        .fod-topbar{display:flex;align-items:center;gap:12px;padding:8px 12px;border-bottom:1px solid rgba(226,232,240,.8);background:#ffffff;flex-shrink:0}
        .fod-page-nav{display:flex;gap:3px;flex:1;overflow-x:auto}
        .fod-page-btn{padding:4px 10px;font-size:11px;font-weight:600;border-radius:6px;border:1px solid rgba(226,232,240,.8);background:#ffffff;cursor:pointer;transition:all .15s;white-space:nowrap}
        .fod-page-btn.active{background:#4d8bff;color:#fff;border-color:#4d8bff}
        .fod-page-btn.complete{border-color:rgba(52,211,153,.4);color:#059669}
        .fod-page-btn.partial{border-color:rgba(251,191,36,.4);color:#d97706}
        .fod-page-btn:hover:not(.active){background:#f1f5f9}
        .fod-stats{display:flex;gap:8px;font-size:10px;font-weight:600;flex-shrink:0}
        .fod-stat{padding:2px 6px;border-radius:4px}
        .fod-stat.confirmed{background:rgba(52,211,153,.1);color:#059669}
        .fod-stat.filled{background:rgba(77,139,255,.1);color:#4d8bff}
        .fod-stat.empty{background:rgba(148,163,184,.1);color:#94a3b8}
        .fod-zoom{display:flex;align-items:center;gap:4px;flex-shrink:0}
        .fod-zoom-btn{width:26px;height:26px;border-radius:6px;border:1px solid rgba(226,232,240,.8);background:#fff;cursor:pointer;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;transition:background .15s}
        .fod-zoom-btn:hover{background:#f1f5f9}
        .fod-zoom-label{font-size:11px;font-weight:600;min-width:36px;text-align:center;color:#64748b}
        .fod-scroll{flex:1;overflow:auto;display:flex;justify-content:center;padding:24px;background:#e2e8f0}
        .fod-page-wrapper{position:relative;background:#ffffff;box-shadow:0 4px 24px rgba(0,0,0,.12);flex-shrink:0}
        .fod-page-image{display:block;width:100%;height:100%;object-fit:contain;pointer-events:none;user-select:none}
        .fod-field{position:absolute;cursor:pointer;border-radius:2px;transition:all .15s;box-sizing:border-box;display:flex;align-items:center;overflow:visible}
        .fod-field.empty{background:rgba(77,139,255,.06);border:1.5px dashed rgba(77,139,255,.3)}
        .fod-field.empty.hovered{background:rgba(77,139,255,.12);border-color:#4d8bff;box-shadow:0 0 0 2px rgba(77,139,255,.15)}
        .fod-field.filled{background:rgba(77,139,255,.08);border:1px solid rgba(77,139,255,.25)}
        .fod-field.filled.hovered{background:rgba(77,139,255,.14);border-color:#4d8bff}
        .fod-field.confirmed{background:rgba(52,211,153,.08);border:1px solid rgba(52,211,153,.3)}
        .fod-field.confirmed.hovered{background:rgba(52,211,153,.14);border-color:#34d399}
        .fod-field.editing{border:2px solid #4d8bff;background:rgba(255,255,255,.95);z-index:10;overflow:visible;box-shadow:0 2px 12px rgba(77,139,255,.25)}
        .fod-field-value{font-size:10px;font-family:'Inter',system-ui,sans-serif;color:#1a1e28;padding:1px 3px;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%}
        .fod-field-editor{display:flex;flex-direction:column;gap:4px;min-width:200px;position:relative}
        .fod-input{width:100%;padding:4px 6px;font-size:12px;font-family:'Inter',system-ui,sans-serif;border:1px solid #4d8bff;border-radius:3px;background:#ffffff;outline:none;color:#1a1e28;line-height:1.3}
        .fod-input:focus{box-shadow:0 0 0 2px rgba(77,139,255,.2)}
        .fod-field-actions{display:flex;gap:3px;position:absolute;right:0;top:100%;margin-top:2px;z-index:20}
        .fod-save-btn,.fod-cancel-btn{width:24px;height:24px;border-radius:4px;border:none;cursor:pointer;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;transition:background .15s}
        .fod-save-btn{background:#4d8bff;color:#fff}
        .fod-save-btn:hover{background:#3b7aee}
        .fod-save-btn:disabled{opacity:.5;cursor:default}
        .fod-cancel-btn{background:#f1f5f9;color:#64748b}
        .fod-cancel-btn:hover{background:#e2e8f0}
        .fod-tooltip{position:absolute;left:0;bottom:100%;margin-bottom:4px;background:#1a1e28;color:#e8ecf4;padding:8px 10px;border-radius:6px;font-size:11px;white-space:nowrap;z-index:30;box-shadow:0 4px 12px rgba(0,0,0,.3);pointer-events:auto}
        .fod-tooltip::after{content:'';position:absolute;top:100%;left:12px;border:5px solid transparent;border-top-color:#1a1e28}
        .fod-tooltip-label{font-weight:600;margin-bottom:2px}
        .fod-tooltip-source{color:#8892a8;font-size:10px}
        .fod-tooltip-confirm{margin-top:4px;padding:2px 8px;font-size:10px;font-weight:600;border-radius:4px;border:1px solid rgba(77,139,255,.3);background:rgba(77,139,255,.1);color:#4d8bff;cursor:pointer}
        .fod-tooltip-confirm:hover{background:rgba(77,139,255,.2)}
        .fod-tooltip-confirmed{color:#34d399;font-weight:600;margin-top:2px}
        .fod-tooltip-empty{color:#8892a8;font-style:italic}
        .fod-reconciliation-banner{display:flex;align-items:center;justify-content:space-between;padding:6px 12px;background:rgba(251,191,36,.06);border-bottom:1px solid rgba(251,191,36,.2);flex-shrink:0}
        .fod-recon-stats{display:flex;gap:12px;font-size:11px;font-weight:500}
        .fod-recon-coverage{font-weight:700}
        .fod-recon-fuzzy{color:#d97706}
        .fod-recon-missing{color:#dc2626}
        .fod-recon-toggle{font-size:11px;padding:3px 10px;border-radius:5px;border:1px solid rgba(226,232,240,.8);background:#fff;cursor:pointer;font-weight:600;color:#4d8bff}
        .fod-fuzzy-banner{display:flex;align-items:center;gap:6px;padding:4px 12px;background:rgba(251,191,36,.06);border-bottom:1px solid rgba(251,191,36,.15);font-size:11px;color:#92400e;flex-shrink:0}
        .fod-unmatched-panel{max-height:200px;overflow-y:auto;border-bottom:1px solid rgba(226,232,240,.8);background:#fefce8;flex-shrink:0}
        .fod-unmatched-header{padding:8px 12px;font-size:12px;font-weight:600;border-bottom:1px solid rgba(251,191,36,.15);display:flex;flex-direction:column;gap:2px}
        .fod-unmatched-item{padding:6px 12px;border-bottom:1px solid rgba(251,191,36,.1);display:flex;align-items:center;gap:8px}
        .fod-unmatched-item.has-value{background:rgba(52,211,153,.04)}
        .fod-unmatched-label{font-size:11px;font-weight:600;min-width:120px;color:#1a1e28}
        .fod-unmatched-value{font-size:11px;color:#334155;flex:1}
        .fod-unmatched-source{font-size:10px;color:#94a3b8;padding:1px 5px;background:rgba(148,163,184,.1);border-radius:3px}
        .fod-loading{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#64748b}
        .fod-spinner{width:32px;height:32px;border:3px solid rgba(77,139,255,.2);border-top-color:#4d8bff;border-radius:50%;animation:spin 1s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        .fod-loading-text{font-size:13px;font-weight:500}
        .fod-error{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#dc2626}
        .fod-error-icon{font-size:28px}
        .fod-error-text{font-size:13px}
        .fod-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:#94a3b8;font-size:13px}
      `}</style>

      {lockError && (
        <div className="lock-banner">
          <span className="lb-icon">&#128274;</span>
          Proiectul este deschis de <span className="lb-name">{lockError.lockedByName}</span> — vizualizare doar în citire
          <button className="lb-retry" onClick={handleRetryLock} disabled={lockRetrying}>
            {lockRetrying ? "Se încearcă..." : "Reîncearcă blocarea"}
          </button>
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
        {/* FIX 7: Version Impact Banner */}
        {versionImpact && !versionImpact.dismissedAt && (
          <div style={{ padding: "10px 24px", background: "#fffbeb", borderBottom: "1px solid #fde68a", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#92400e" }}>
                {versionImpact.docName} actualizat: v{versionImpact.oldVersion} → v{versionImpact.newVersion}
              </div>
              <div style={{ fontSize: 12, color: "#a16207" }}>
                {versionImpact.summary}
                {versionImpact.changes.length > 0 && ` · ${versionImpact.changes.filter((c: any) => c.severity === "critical").length} critice, ${versionImpact.changes.filter((c: any) => c.severity === "important").length} importante`}
              </div>
            </div>
            <button
              style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #fde68a", background: "#fef3c7", color: "#92400e", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
              onClick={() => { setActiveLeaf("solomon"); setSolomonInput("Ghidul a fost actualizat. Reverificați eligibilitatea și punctajul."); }}
            >Reverificați cu Solomon</button>
            <button
              style={{ padding: "5px 8px", borderRadius: 6, border: "none", background: "transparent", color: "#a16207", fontSize: 14, cursor: "pointer" }}
              onClick={() => setVersionImpact(prev => prev ? { ...prev, dismissedAt: new Date().toISOString() } : null)}
              title="Ascunde"
            >✕</button>
          </div>
        )}
        <div className="pv-tabs">
          {([
            { key: "sumar" as LeafType, label: "Sumar" },
            { key: "solomon" as LeafType, label: orgLabels.solomonLabel, badge: `${elemFilled}/${elemTotal}`, badgeClass: elemFilled === elemTotal && elemTotal > 0 ? "green" : elemFilled > 0 ? "blue" : "neutral" },
            { key: "elemente" as LeafType, label: "Elemente" },
            { key: "reguli" as LeafType, label: "Reguli", badge: eligTotal > 0 ? `${eligPassed}/${eligTotal}` : undefined, badgeClass: eligTotal > 0 ? (eligPassed === eligTotal ? "green" : eligPassed > 0 ? "blue" : "neutral") : undefined },
            { key: "scor" as LeafType, label: "Scor" },
            { key: "tabele" as LeafType, label: "Tabele" },
            { key: "checklist" as LeafType, label: "Checklist doc" },
            { key: "neemia" as LeafType, label: orgLabels.neemiaLabel },
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
                        fontSize: 28, fontWeight: 800,
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
                    {(budgetValidation.results || []).filter((r: any) => r.status !== "valid").map((r: any, i: number) => (
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
                        {project.tipProiect && <div className="si-row"><span className="si-label">Tip proiect</span><span className="si-value" style={{ textTransform: "capitalize" }}>{project.tipProiect.replace(/_/g, " ")}</span></div>}
                        {project.structuraDosar && (
                          <div className="si-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                            <span className="si-label">Structura dosar</span>
                            <span className="si-value" style={{ fontSize: 12, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{project.structuraDosar}</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-xs text-[#94a3b8] py-2">
                        Nu a fost identificat inca. Deschide {orgLabels.solomonLabel} pentru a confirma programul de finantare.
                      </div>
                    )}
                  </div>
                </div>

                <div className="sumar-actions">
                  <button className="sa-btn primary" onClick={() => setActiveLeaf("reguli")}>&#128737; Verifică eligibilitate</button>
                  <button className="sa-btn" onClick={() => setActiveLeaf("solomon")}>&#129302; Deschide {orgLabels.solomonLabel}</button>
                  <button className="sa-btn" onClick={() => setActiveLeaf("neemia")}>&#128196; Generează documente</button>
                </div>
              </div>
              );
            })()}

            {/* REGULI (combined ghid rules + eligibility status) */}
            {activeLeaf === "reguli" && (() => {
              // Sprint 5: Solomon Eligibility Panel
              const solEligSection = solEligibility.length > 0 ? (
                <div style={{ marginBottom: 24, padding: 16, background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
                    <span>Eligibilitate (Solomon)</span>
                    <span style={{ fontSize: 12, fontWeight: 400, color: "#64748b" }}>
                      {solEligibility.filter(e => e.status === "pass").length}/{solEligibility.length} ✅
                    </span>
                  </div>
                  {solEligibility.map((entry: any, i: number) => {
                    const icon = entry.status === "pass" ? "✅" : entry.status === "fail" ? "❌" : entry.status === "pending" ? "⏳" : "░░";
                    const color = entry.status === "pass" ? "#059669" : entry.status === "fail" ? "#dc2626" : "#d97706";
                    return (
                      <div key={i} style={{ padding: "6px 0", borderBottom: i < solEligibility.length - 1 ? "1px solid #f0f2f5" : "none" }}>
                        <div style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "flex-start" }}>
                          <span>{icon}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 500, color }}>{entry.ruleName || entry.rule}</div>
                            {entry.evidence && <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{entry.evidence}</div>}
                          </div>
                          {entry.sourcePhase && <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}>{entry.sourcePhase}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null;

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
              const semanticTagLabels: Record<string, string> = {
                THRESHOLD: "Prag", SCORING: "Punctaj", TEMPORAL: "Temporal",
                DOCUMENT_BASED: "Document", DEPENDENCY: "Dependență", EXCLUSION: "Excludere",
                EXCEPTION: "Excepție", PROPORTIONAL: "Proporțional", CLASSIFICATION: "Clasificare",
              };
              const semanticTagIcons: Record<string, string> = {
                THRESHOLD: "●", SCORING: "★", TEMPORAL: "◷",
                DOCUMENT_BASED: "◩", DEPENDENCY: "⇄", EXCLUSION: "⊘",
                EXCEPTION: "⚑", PROPORTIONAL: "%", CLASSIFICATION: "◈",
              };
              const categories = [...new Set(guideRules.map(r => r.category))].filter(Boolean);
              const catFiltered = ghidCategoryFilter === "all" ? guideRules : guideRules.filter(r => r.category === ghidCategoryFilter);
              const typeFiltered = ghidTypeFilter === "fixed" ? catFiltered.filter(r => r.type === "fixed")
                : ghidTypeFilter === "interpreted" ? catFiltered.filter(r => r.type === "interpreted")
                : catFiltered;
              // Apply status filter
              const filteredRules = ghidStatusFilter === "all" ? typeFiltered
                : typeFiltered.filter(r => {
                    const es = eligStatusById[r.id];
                    if (ghidStatusFilter === "pass") return es?.status === "pass";
                    if (ghidStatusFilter === "fail") return es?.status === "fail";
                    if (ghidStatusFilter === "pending") return !es || es.status === "pending";
                    return true;
                  });
              const fixedCount = guideRules.filter(r => r.type === "fixed").length;
              const interpCount = guideRules.filter(r => r.type === "interpreted").length;
              const toggleRuleExpand = (id: string) => {
                setExpandedRuleIds(prev => {
                  const next = new Set(prev);
                  next.has(id) ? next.delete(id) : next.add(id);
                  return next;
                });
              };

              const guideTrustScore = (project as any)?.guideTrustScore as number | null;
              // Build eligibility status map: projectEligibility.id → status
              const eligStatusById: Record<string, { status: string; overrideResult: boolean | null; notes: string | null }> = {};
              for (const er of eligibilityRules) {
                eligStatusById[er.id] = { status: er.status, overrideResult: (er as any).overrideResult ?? null, notes: (er as any).notes ?? null };
              }
              const preEligRules = eligibilityRules.filter(r => r.isPreEligibility);
              const eligPassCount = eligibilityRules.filter(r => r.status === "pass").length;
              const eligFailCount = eligibilityRules.filter(r => r.status === "fail").length;
              const eligPendingCount = eligibilityRules.filter(r => r.status === "pending").length;
              const eligStatusIcons: Record<string, string> = { pass: "\u2713", fail: "\u2715", pending: "?" };

              if (guideRules.length === 0 && eligibilityRules.length === 0 && solEligibility.length === 0) {
                return (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 200, color: "#8892a8", padding: 24 }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>&#128214;</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>Nicio regulă extrasă încă</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>Discutați eligibilitatea cu Solomon pentru a genera checklist-ul automat</div>
                  </div>
                );
              }

              return (
              <div className="ghid-layout">
                {/* Sprint 5: Solomon Eligibility Panel */}
                {solEligSection}
                {/* Eligibility summary stats */}
                {eligibilityRules.length > 0 && (
                  <div className="elig-summary" style={{ marginBottom: 10 }}>
                    <div className="elig-stat">
                      <div className="number text-emerald-500">{eligPassCount}</div>
                      <div className="label">Trecute</div>
                    </div>
                    <div className="elig-stat">
                      <div className="number text-red-500">{eligFailCount}</div>
                      <div className="label">Eșuate</div>
                    </div>
                    <div className="elig-stat">
                      <div className="number text-amber-500">{eligPendingCount}</div>
                      <div className="label">Pending</div>
                    </div>
                    <div className="elig-stat">
                      <div className="number">{eligibilityRules.length}</div>
                      <div className="label">Total</div>
                    </div>
                    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                      <button className="sa-btn primary" style={{ display: "inline-flex", fontSize: 12, padding: "5px 14px" }} onClick={handleRecheckEligibility} disabled={recheckLoading}>
                        {recheckLoading ? "Se verifică..." : "\u{1F504} Re-verifică"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Pre-eligibility rules are now shown inline with all rules below — no separate section */}

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
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                      {/* Filter bar */}
                      <div style={{ padding: "14px 24px", borderBottom: "1px solid rgba(226,232,240,.6)", flexShrink: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "#94a3b8", marginBottom: 10 }}>
                          Reguli extrase ({guideRules.length})
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                          {[
                            { key: "all", label: `Toate (${guideRules.length})` },
                            ...(fixedCount > 0 ? [{ key: "fixed", label: `Fixe (${fixedCount})` }] : []),
                            ...(interpCount > 0 ? [{ key: "interpreted", label: `Interpretate (${interpCount})` }] : []),
                          ].map(tab => (
                            <button key={tab.key} onClick={() => setGhidTypeFilter(tab.key)} style={{
                              fontSize: 12, fontWeight: 600, padding: "4px 14px", borderRadius: 20,
                              border: ghidTypeFilter === tab.key ? "1.5px solid #2563eb" : "1px solid rgba(226,232,240,.8)",
                              background: ghidTypeFilter === tab.key ? "rgba(37,99,235,.06)" : "#fff",
                              color: ghidTypeFilter === tab.key ? "#2563eb" : "#64748b",
                              cursor: "pointer", transition: "all .15s",
                            }}>
                              {tab.label}
                            </button>
                          ))}
                          <span style={{ width: 1, height: 16, background: "rgba(226,232,240,.8)", margin: "0 4px" }} />
                          {categories.map(cat => (
                            <button key={cat} onClick={() => setGhidCategoryFilter(ghidCategoryFilter === cat ? "all" : cat)} style={{
                              fontSize: 12, fontWeight: 600, padding: "4px 14px", borderRadius: 20,
                              border: ghidCategoryFilter === cat ? `1.5px solid ${categoryColors[cat] || "#94a3b8"}` : "1px solid rgba(226,232,240,.8)",
                              background: ghidCategoryFilter === cat ? `color-mix(in srgb, ${categoryColors[cat] || "#94a3b8"} 8%, transparent)` : "#fff",
                              color: ghidCategoryFilter === cat ? (categoryColors[cat] || "#94a3b8") : "#64748b",
                              cursor: "pointer", transition: "all .15s",
                            }}>
                              {categoryLabels[cat] || cat} {guideRules.filter(r => r.category === cat).length}
                            </button>
                          ))}
                          {eligibilityRules.length > 0 && (<>
                            <span style={{ width: 1, height: 16, background: "rgba(226,232,240,.8)", margin: "0 4px" }} />
                            {[
                              { key: "all", label: "Toate", color: "#64748b" },
                              { key: "pass", label: `Trecute (${eligPassCount})`, color: "#059669" },
                              { key: "fail", label: `Eșuate (${eligFailCount})`, color: "#dc2626" },
                              { key: "pending", label: `Pending (${eligPendingCount})`, color: "#d97706" },
                            ].map(s => (
                              <button key={s.key} onClick={() => setGhidStatusFilter(s.key)} style={{
                                fontSize: 12, fontWeight: 600, padding: "4px 14px", borderRadius: 20,
                                border: ghidStatusFilter === s.key ? `1.5px solid ${s.color}` : "1px solid rgba(226,232,240,.8)",
                                background: ghidStatusFilter === s.key ? `color-mix(in srgb, ${s.color} 8%, transparent)` : "#fff",
                                color: ghidStatusFilter === s.key ? s.color : "#64748b",
                                cursor: "pointer", transition: "all .15s",
                              }}>
                                {s.label}
                              </button>
                            ))}
                          </>)}
                        </div>
                      </div>
                      {/* Scrollable rule cards */}
                      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
                        <RuleCardList>
                          {filteredRules.map(r => {
                            const eStatus = eligStatusById[r.id];
                            const cardData: RuleCardData = {
                              id: r.id,
                              type: r.type,
                              text: r.text,
                              confidence: r.confidence,
                              page: r.page,
                              category: r.category,
                              sourceText: r.sourceText,
                              condition: r.condition,
                              semanticTags: r.semanticTags,
                              validated: r.validated,
                              needsReview: r.needsReview,
                              sourceDocument: r.sourceDocument,
                              linkedElements: (r.linkedElements || []).map(el => ({
                                elementKey: el.elementKey,
                                displayName: el.displayName,
                                category: el.category,
                                role: el.role,
                                value: el.value,
                                isMissing: el.isMissing,
                              })),
                              eligStatus: eStatus ? { status: eStatus.status as "pass" | "fail" | "pending", notes: eStatus.notes ?? undefined } : null,
                            };
                            return (
                              <RuleCard
                                key={r.id}
                                rule={cardData}
                                isOpen={expandedRuleIds.has(r.id)}
                                onToggle={() => toggleRuleExpand(r.id)}
                                categoryColor={categoryColors[r.category] || "#94a3b8"}
                                categoryLabel={categoryLabels[r.category] || r.category}
                                readOnly={readOnly}
                                onOverride={async (ruleId, status, notes) => {
                                  try {
                                    await apiPut(`/api/projects/${projectId}/eligibility/${ruleId}`, { overrideResult: status === "passed" ? "passed" : status === "failed" ? "failed" : "not_applicable", notes });
                                    const eligData = await apiGet<any>(`/api/projects/${projectId}/eligibility`);
                                    setEligibilityRules(mapEligibilityRules(eligData.flat || []));
                                    setGuideRules(mapGuideRules(eligData.grouped || []));
                                    toast("success", `Status regulă actualizat: ${status === "passed" ? "Trecut" : status === "failed" ? "Respins" : "N/A"}`);
                                  } catch (err: any) { toast("error", err.message || "Eroare la override"); }
                                }}
                                onNavigateToElement={(elementKey) => {
                                  setActiveLeaf("elemente");
                                  setElemSearch(elementKey);
                                }}
                              />
                            );
                          })}
                        </RuleCardList>
                        {filteredRules.length === 0 && (
                          <div style={{ textAlign: "center", padding: "48px 0", color: "#94a3b8" }}>
                            <div style={{ fontSize: 32, opacity: 0.3, marginBottom: 8 }}>🛡</div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>Nicio regulă găsită</div>
                          </div>
                        )}
                      </div>
                    </div>
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
                                  onClick={() => { setGhidTab("reguli"); setExpandedRuleIds(prev => new Set(prev).add(rule.id)); }}
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
            {activeLeaf === "elemente" && elements.length === 0 && !addingElement && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 200, color: "#8892a8", padding: 24 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>&#128202;</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Niciun element extras</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Uploadează documente client sau folosește Solomon pentru a extrage date</div>
                {!readOnly && (
                  <button onClick={() => setAddingElement(true)} className="el-btn el-btn-pri" style={{ marginTop: 12 }}>+ Adaugă element manual</button>
                )}
              </div>
            )}
            {activeLeaf === "elemente" && elements.length === 0 && addingElement && (
              <div style={{ padding: 24 }}>
                <div className="el-add-form">
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "#0f172a" }}>Element nou</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <input placeholder="Cheie (ex: nr_angajati)" value={newElementKey} onChange={e => setNewElementKey(e.target.value)} className="el-input" />
                    <input placeholder="Etichetă (ex: Număr angajați)" value={newElementLabel} onChange={e => setNewElementLabel(e.target.value)} className="el-input" />
                  </div>
                  <input placeholder="Valoare (opțional)" value={newElementValue} onChange={e => setNewElementValue(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleAddElement(); if (e.key === "Escape") setAddingElement(false); }} className="el-input" style={{ width: "100%", marginBottom: 8 }} />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={handleAddElement} className="el-btn el-btn-pri">Salvează</button>
                    <button onClick={() => { setAddingElement(false); setNewElementKey(""); setNewElementLabel(""); setNewElementValue(""); }} className="el-btn el-btn-sec">Anulează</button>
                  </div>
                </div>
              </div>
            )}
            {activeLeaf === "elemente" && elements.length > 0 && (
              <div className="el-shell">
                {/* STATS HEADER */}
                <div className="el-header">
                  <div className="el-header-top">
                    <div className="el-stats">
                      <div className="el-stat"><div className="el-stat-val" style={{ color: "#059669" }}>{elemStats.confirmed}</div><div className="el-stat-lbl">Confirmate</div></div>
                      <div className="el-stat"><div className="el-stat-val" style={{ color: "#d97706" }}>{elemStats.proposed}</div><div className="el-stat-lbl">Propuse</div></div>
                      <div className="el-stat"><div className="el-stat-val" style={{ color: "#2563eb" }}>{elemStats.manual}</div><div className="el-stat-lbl">Manual</div></div>
                      <div className="el-stat"><div className="el-stat-val" style={{ color: "#94a3b8" }}>{elemStats.empty}</div><div className="el-stat-lbl">Goale</div></div>
                      {elemStats.conflict > 0 && (
                        <div className="el-stat"><div className="el-stat-val" style={{ color: "#dc2626" }}>{elemStats.conflict}</div><div className="el-stat-lbl">Conflict</div></div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="el-btn el-btn-sec" onClick={handleExportCSV}>{"\u2193"} Export CSV</button>
                      {elemStats.proposed > 0 && (
                        <button className="el-btn el-btn-ok" onClick={async () => {
                          const proposed = elements.filter(e => e.status === "propus_ai");
                          if (!confirm(`Confirmi ${proposed.length} elemente propuse de AI?`)) return;
                          try {
                            await apiPut(`/api/projects/${projectId}/elements-bulk/confirm`, { elementIds: proposed.map(e => e.id) });
                            toast("success", `${proposed.length} elemente confirmate`);
                            const proj = await apiGet<any>(`/api/projects/${projectId}`);
                            setElements(mapElements(proj.elements || []));
                          } catch { toast("error", "Eroare la confirmare"); }
                        }} disabled={readOnly}>
                          {"\u2713"} Confirmă toate propuse ({elemStats.proposed})
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="el-progress-wrap">
                    <div className="el-progress">
                      <div className="el-progress-fill" style={{
                        width: `${pct(elemStats.confirmed + elemStats.proposed + elemStats.manual, elemStats.total)}%`,
                        background: `linear-gradient(90deg, #059669 ${pct(elemStats.confirmed, elemStats.total)}%, #d97706 ${pct(elemStats.confirmed, elemStats.total)}%, #d97706 ${pct(elemStats.confirmed + elemStats.proposed, elemStats.total)}%, #2563eb ${pct(elemStats.confirmed + elemStats.proposed, elemStats.total)}%)`,
                      }} />
                    </div>
                    <div className="el-progress-labels">
                      <span>{elemStats.confirmed + elemStats.proposed + elemStats.manual} / {elemStats.total} completate ({pct(elemStats.confirmed + elemStats.proposed + elemStats.manual, elemStats.total)}%)</span>
                      <span>{elemStats.empty} rămase</span>
                    </div>
                  </div>
                </div>

                {/* TOOLBAR: search + category pills + status filters */}
                <div className="el-toolbar">
                  <div className="el-search-box">
                    <span className="el-search-icon">{"\uD83D\uDD0D"}</span>
                    <input type="text" placeholder="Caută element..." value={elemSearch} onChange={e => setElemSearch(e.target.value)} />
                  </div>
                  <div className="el-sep" />
                  <div className={`el-pill ${elemCatFilter === "all" ? "active" : ""}`} onClick={() => setElemCatFilter("all")}>Toate <span className="el-pill-count">{elements.length}</span></div>
                  {Object.entries(CAT_CONFIG).map(([catKey, cfg]) => catCounts[catKey] ? (
                    <div key={catKey} className={`el-pill ${elemCatFilter === catKey ? "active" : ""}`} onClick={() => setElemCatFilter(elemCatFilter === catKey ? "all" : catKey)}>
                      {cfg.label} <span className="el-pill-count">{catCounts[catKey]}</span>
                    </div>
                  ) : null)}
                  <div className="el-sep" />
                  <div className={`el-pill el-pill-status ${elemStatusFilter === "empty" ? "active" : ""}`} onClick={() => setElemStatusFilter(elemStatusFilter === "empty" ? null : "empty")} style={{ borderColor: "#94a3b8" }}>
                    {"\u25CB"} Goale
                  </div>
                  <div className={`el-pill el-pill-status ${elemStatusFilter === "proposed" ? "active" : ""}`} onClick={() => setElemStatusFilter(elemStatusFilter === "proposed" ? null : "proposed")} style={{ borderColor: "#d97706" }}>
                    {"\u26A0"} Propuse
                  </div>
                  {elemStats.conflict > 0 && (
                    <div className={`el-pill el-pill-status ${elemStatusFilter === "conflict" ? "active" : ""}`} onClick={() => setElemStatusFilter(elemStatusFilter === "conflict" ? null : "conflict")} style={{ borderColor: "#dc2626" }}>
                      {"\u26A1"} Conflicte
                    </div>
                  )}
                  {!readOnly && (
                    <>
                      <div className="el-sep" />
                      <button className="el-btn el-btn-pri el-btn-sm" onClick={() => setAddingElement(true)}>+ Adaugă</button>
                    </>
                  )}
                </div>

                {/* ADD ELEMENT FORM */}
                {addingElement && (
                  <div className="el-add-form" style={{ margin: "0 24px 0" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "#0f172a" }}>Element nou</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                      <input placeholder="Cheie (ex: nr_angajati)" value={newElementKey} onChange={e => setNewElementKey(e.target.value)} className="el-input" />
                      <input placeholder="Etichetă (ex: Număr angajați)" value={newElementLabel} onChange={e => setNewElementLabel(e.target.value)} className="el-input" />
                    </div>
                    <input placeholder="Valoare (opțional)" value={newElementValue} onChange={e => setNewElementValue(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleAddElement(); if (e.key === "Escape") setAddingElement(false); }} className="el-input" style={{ width: "100%", marginBottom: 8 }} />
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={handleAddElement} className="el-btn el-btn-pri">Salvează</button>
                      <button onClick={() => { setAddingElement(false); setNewElementKey(""); setNewElementLabel(""); setNewElementValue(""); }} className="el-btn el-btn-sec">Anulează</button>
                    </div>
                  </div>
                )}

                {/* GROUPED ELEMENT ROWS */}
                <div className="el-scroll">
                  {groupedElements.map(([cat, items]) => {
                    const cfg = CAT_CONFIG[cat] || CAT_CONFIG.other;
                    const filled = items.filter(e => e.status !== "gol").length;
                    const groupPct = items.length > 0 ? Math.round(filled / items.length * 100) : 0;
                    const isCollapsed = collapsedGroups[cat];
                    return (
                      <div className="el-group" key={cat}>
                        <div className="el-group-header" onClick={() => setCollapsedGroups(prev => ({ ...prev, [cat]: !prev[cat] }))}>
                          <span className="el-group-icon">{cfg.icon}</span>
                          <span className="el-group-name">{cfg.label}</span>
                          <span className="el-group-count">{filled}/{items.length}</span>
                          <div className="el-group-progress">
                            <div className="el-group-bar"><div className="el-group-bar-fill" style={{ width: `${groupPct}%`, background: cfg.color }} /></div>
                            <span className="el-group-pct">{groupPct}%</span>
                          </div>
                          <span className="el-group-chevron" style={{ transform: isCollapsed ? "rotate(-90deg)" : undefined }}>{"\u25BE"}</span>
                        </div>
                        {!isCollapsed && (
                          <div className="el-group-items">
                            {items.map(el => (
                              <div className={`el-row ${editingElementId === el.id ? "editing" : ""}`} key={el.id}>
                                <div className={`el-status-icon ${el.status}`}>
                                  {el.status === "confirmat" ? "\u2713" : el.status === "propus_ai" ? "\u26A0" : el.status === "conflict" ? "\u26A1" : "\u25CB"}
                                </div>
                                <div className="el-info">
                                  <div className="el-label">{el.label}{el.required && <span className="el-req">*</span>}</div>
                                  <div className="el-key-text">{el.key}</div>
                                </div>
                                <div className="el-value-area">
                                  {editingElementId === el.id ? (
                                    <input className="el-edit-input" value={editingElementValue} onChange={e => setEditingElementValue(e.target.value)}
                                      onBlur={() => handleSaveElementEdit(el.id)}
                                      onKeyDown={e => { if (e.key === "Enter") handleSaveElementEdit(el.id); if (e.key === "Escape") { setEditingElementId(null); setEditingElementValue(""); } }}
                                      autoFocus />
                                  ) : el.status === "conflict" ? (
                                    <div>
                                      <span className="el-val conflict">{el.value}</span>
                                      {el.validationDetails?.conflict && <div style={{ fontSize: 11, color: "#dc2626", marginTop: 2 }}>{"\u26A0"} {el.validationDetails.conflict}</div>}
                                    </div>
                                  ) : el.value ? (
                                    <span className="el-val">{el.value}</span>
                                  ) : (
                                    <span className="el-val empty">{"\u2014"} necompletat {"\u2014"}</span>
                                  )}
                                </div>
                                <div className="el-source-area">
                                  {el.sourceLabel && (
                                    <span className={`el-src-badge ${el.source === "document_extracted" ? "ocr" : el.source === "solomon" || el.source === "solomon_chat" ? "solomon" : el.source === "manual" || el.source === "consultant_manual" ? "manual" : el.source === "anaf_auto" ? "anaf" : "system"}`}>
                                      {el.source === "document_extracted" ? "\uD83D\uDCC4" : el.source === "solomon" || el.source === "solomon_chat" ? "\uD83E\uDD16" : el.source === "manual" || el.source === "consultant_manual" ? "\u270F\uFE0F" : el.source === "anaf_auto" ? "\uD83C\uDFDB" : "\u2699"}{" "}{getSourceLabel(el.source)}
                                    </span>
                                  )}
                                </div>
                                <div className="el-actions">
                                  {el.status === "propus_ai" && !readOnly && (
                                    <button className="el-btn el-btn-ok el-btn-sm" onClick={(ev) => { ev.stopPropagation(); handleConfirmElementApi(el.id); }}>{"\u2713"}</button>
                                  )}
                                  {!readOnly && (
                                    <button className="el-btn el-btn-ghost el-btn-sm" onClick={(ev) => { ev.stopPropagation(); setEditingElementId(el.id); setEditingElementValue(el.value || ""); }}>{"\u270E"}</button>
                                  )}
                                  <button className="el-btn el-btn-ghost el-btn-sm" onClick={(ev) => { ev.stopPropagation(); openDetailPanel(el.id); }}>{"\u22EF"}</button>
                                  <button className="el-btn el-btn-ghost el-btn-sm" title="Întreabă Solomon" onClick={(ev) => { ev.stopPropagation(); askSolomonAbout(el); }}>{"\uD83D\uDCAC"}</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* DETAIL SLIDE-OUT PANEL */}
                {detailPanelId && <div className="el-overlay" onClick={() => setDetailPanelId(null)} />}
                <div className={`el-detail-panel ${detailPanelId ? "open" : ""}`}>
                  {(() => {
                    const el = elements.find(e => e.id === detailPanelId);
                    if (!el) return null;
                    return (
                      <>
                        <div className="dp-header">
                          <div className="dp-title">{el.label}</div>
                          <button className="dp-close" onClick={() => setDetailPanelId(null)}>{"\u2715"}</button>
                        </div>
                        <div className="dp-body">
                          <div className="dp-field"><div className="dp-field-label">Cheie tehnică</div><div className="dp-field-value dp-mono">{el.key}</div></div>
                          <div className="dp-field"><div className="dp-field-label">Valoare curentă</div><div className="dp-field-value dp-mono">{el.value || "\u2014 necompletat \u2014"}</div></div>
                          <div className="dp-field"><div className="dp-field-label">Status</div><div className="dp-field-value">
                            <span className={`el-status-badge ${el.status}`}>
                              {el.status === "confirmat" ? "Confirmat" : el.status === "propus_ai" ? "Propus AI" : el.status === "conflict" ? "Conflict" : "Gol"}
                            </span>
                          </div></div>
                          <div className="dp-field"><div className="dp-field-label">Sursă</div><div className="dp-field-value">
                            {el.sourceLabel ? (
                              <span className={`el-src-badge ${el.source === "document_extracted" ? "ocr" : el.source === "solomon" || el.source === "solomon_chat" ? "solomon" : el.source === "manual" || el.source === "consultant_manual" ? "manual" : el.source === "anaf_auto" ? "anaf" : "system"}`}>
                                {getSourceLabel(el.source)}
                              </span>
                            ) : "\u2014"}
                            {el.sourceDocName && <span style={{ marginLeft: 6, fontSize: 12, color: "#64748b" }}>{el.sourceDocName}</span>}
                          </div></div>
                          <div className="dp-field"><div className="dp-field-label">Obligatoriu</div><div className="dp-field-value">{el.required ? "Da \u2731" : "Nu"}</div></div>
                          <div className="dp-field"><div className="dp-field-label">Categorie</div><div className="dp-field-value">{CAT_CONFIG[el.category]?.icon} {CAT_CONFIG[el.category]?.label || el.category}</div></div>
                          {el.validationStatus && (
                            <div className="dp-field"><div className="dp-field-label">Validare</div><div className="dp-field-value">
                              <span className={`el-status-badge ${el.validationStatus === "valid" ? "confirmat" : el.validationStatus === "invalid" ? "conflict" : "propus_ai"}`}>
                                {el.validationStatus === "valid" ? "Valid" : el.validationStatus === "invalid" ? "Invalid" : el.validationStatus === "warning" ? "Atenție" : "Pending"}
                              </span>
                            </div></div>
                          )}
                          {el.status === "conflict" && el.validationDetails?.conflict && (
                            <div className="dp-field"><div className="dp-field-label" style={{ color: "#dc2626" }}>{"\u26A0"} Conflict</div><div className="dp-field-value" style={{ color: "#dc2626", fontSize: 14 }}>{el.validationDetails.conflict}</div></div>
                          )}
                          {/* Constraints from rules & reference tables */}
                          {elementConstraints.length > 0 && (
                            <div className="dp-field">
                              <div className="dp-field-label">Constrângeri ({elementConstraints.length})</div>
                              {elementConstraints.map((c: any, ci: number) => (
                                <div key={ci} style={{ fontSize: 12, color: "#475569", padding: "4px 0", borderBottom: ci < elementConstraints.length - 1 ? "1px solid #f1f5f9" : undefined }}>
                                  <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 5px", borderRadius: 3, background: c.role === "input" ? "#dbeafe" : c.role === "output" ? "#d1fae5" : "#f1f5f9", color: c.role === "input" ? "#1e40af" : c.role === "output" ? "#065f46" : "#475569", marginRight: 6 }}>
                                    {c.role === "input" ? "INPUT" : c.role === "output" ? "OUTPUT" : "REF"}
                                  </span>
                                  {c.rule?.ruleText || c.rule?.description || c.description || ""}
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Edit actions */}
                          {!readOnly && el.status === "propus_ai" && editingElementId !== el.id && (
                            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                              <button className="el-btn el-btn-ok" onClick={() => handleConfirmElementApi(el.id)}>{"\u2713"} Confirmă</button>
                              <button className="el-btn el-btn-sec" onClick={() => { setEditingElementId(el.id); setEditingElementValue(el.value || ""); }}>{"\u270E"} Editează</button>
                            </div>
                          )}
                          {editingElementId === el.id && (
                            <div style={{ marginTop: 16 }}>
                              <input className="el-edit-input" value={editingElementValue} onChange={e => setEditingElementValue(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") handleSaveElementEdit(el.id); if (e.key === "Escape") { setEditingElementId(null); setEditingElementValue(""); } }}
                                autoFocus style={{ width: "100%" }} />
                              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                <button className="el-btn el-btn-pri" onClick={() => handleSaveElementEdit(el.id)}>{"\u2713"} Salvează</button>
                                <button className="el-btn el-btn-sec" onClick={() => { setEditingElementId(null); setEditingElementValue(""); }}>{"\u2715"} Anulează</button>
                              </div>
                            </div>
                          )}
                          {/* Ask Solomon */}
                          <div style={{ marginTop: 12 }}>
                            <button className="el-btn el-btn-sec" onClick={() => { setDetailPanelId(null); askSolomonAbout(el); }}>{"\uD83D\uDCAC"} Întreabă Solomon</button>
                          </div>
                          {/* History */}
                          <div className="dp-history">
                            <div className="dp-history-title">Istoric modificări</div>
                            {detailHistory.length > 0 ? detailHistory.map((h: any, hi: number) => (
                              <div className="dp-history-item" key={hi}>
                                <span className="dp-history-time">{h.changedAt ? new Date(h.changedAt).toLocaleString("ro-RO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}</span>
                                <span>
                                  {h.oldValue && h.newValue ? `${h.oldValue.slice(0, 40)} → ${h.newValue.slice(0, 40)}` : h.newValue ? `Setat: "${h.newValue.slice(0, 60)}"` : "Modificare"}
                                  {h.changeSource && <em> — {getSourceLabel(h.changeSource)}</em>}
                                </span>
                              </div>
                            )) : (
                              <div style={{ fontSize: 13, color: "#94a3b8" }}>Nicio modificare înregistrată</div>
                            )}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
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

                {/* FIX G: Solomon-detected document checklist */}
                {solChecklist.length > 0 && (
                  <div style={{ margin: "12px 16px", padding: 14, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#1e293b", marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
                      <span>Documente necesare (Solomon)</span>
                      <span style={{ fontWeight: 400, color: "#64748b" }}>
                        {solChecklist.filter((i: any) => {
                          const name = (i.document || i.name || "").toLowerCase();
                          return classifiedDocs.some((d: any) => {
                            const dName = (d.fileName || d.name || "").toLowerCase();
                            const dDesc = ((d.classification as any)?.description || "").toLowerCase();
                            return dName.includes(name.slice(0, 15)) || dDesc.includes(name.slice(0, 15));
                          });
                        }).length}/{solChecklist.length}
                      </span>
                    </div>
                    {solChecklist.map((item: any, i: number) => {
                      const docName = item.document || item.name || "";
                      const matched = classifiedDocs.some((d: any) => {
                        const dName = (d.fileName || d.name || "").toLowerCase();
                        const dDesc = ((d.classification as any)?.description || "").toLowerCase();
                        const searchKey = docName.toLowerCase().slice(0, 15);
                        return dName.includes(searchKey) || dDesc.includes(searchKey);
                      });
                      const catColor = item.category === "obligatoriu_depunere" ? "#dc2626" : item.category === "obligatoriu_contractare" ? "#d97706" : "#64748b";
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0", borderBottom: i < solChecklist.length - 1 ? "1px solid #f0f2f5" : "none" }}>
                          <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>{matched ? "✅" : "❌"}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, color: "#1e293b", fontWeight: matched ? 400 : 500 }}>{docName}</div>
                            {item.notes && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>{item.notes}</div>}
                          </div>
                          <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: `${catColor}10`, color: catColor, fontWeight: 600, flexShrink: 0 }}>
                            {item.category === "obligatoriu_depunere" ? "depunere" : item.category === "obligatoriu_contractare" ? "contractare" : "opțional"}
                          </span>
                        </div>
                      );
                    })}
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
                      <button className="check-refresh-btn" onClick={handleChecklistRefresh} title="Reîmprospătează din ghid (păstrează itemele manuale)">&#8635; Refresh din ghid</button>
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

                          {/* Notes indicator + inline edit */}
                          {item.notes ? (
                            <span className="check-notes-badge" title={item.notes}>&#128221; Notă</span>
                          ) : null}

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

                                  {/* Notes */}
                                  <div className="check-menu-notes">
                                    <textarea
                                      className="check-notes-textarea"
                                      placeholder="Adaugă notă..."
                                      defaultValue={item.notes || ""}
                                      onBlur={(e) => handleChecklistNotes(item.id, e.target.value)}
                                      rows={2}
                                    />
                                  </div>

                                  <div className="check-menu-divider" />

                                  {/* Delete */}
                                  <button className="check-menu-item danger" onClick={() => { if (confirm(`Sigur vrei să ștergi "${item.name}" din checklist?`)) handleChecklistDelete(item.id); }}>
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

            {/* SCOR (scoring criteria + points) */}
            {activeLeaf === "scor" && (() => {
              // Sprint 5: Solomon scoring panel
              const solScoringSection = solScoring.length > 0 ? (
                <div style={{ marginBottom: 24, padding: 16, background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
                    <span>Punctaj estimat (Solomon)</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#2563eb" }}>
                      {solScoring.reduce((s: number, e: any) => s + (e.pointsEstimated || e.points || 0), 0)} / {solScoring.reduce((s: number, e: any) => s + (e.maxPoints || 0), 0)}
                    </span>
                  </div>
                  <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                        <th style={{ textAlign: "left", padding: "4px 0", color: "#64748b", fontWeight: 600 }}>Criteriu</th>
                        <th style={{ textAlign: "right", padding: "4px 8px", color: "#64748b", fontWeight: 600 }}>Est.</th>
                        <th style={{ textAlign: "right", padding: "4px 8px", color: "#64748b", fontWeight: 600 }}>Max</th>
                        <th style={{ textAlign: "right", padding: "4px 0", color: "#64748b", fontWeight: 600 }}>Conf.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {solScoring.map((entry: any, i: number) => (
                        <tr key={i} style={{ borderBottom: "1px solid #f0f2f5" }}>
                          <td style={{ padding: "6px 0", color: "#1e293b" }}>
                            {entry.criterionName || entry.criterion}
                            {entry.evidence && <div style={{ fontSize: 10, color: "#94a3b8" }}>{entry.evidence}</div>}
                          </td>
                          <td style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600, color: "#2563eb" }}>{entry.pointsEstimated ?? entry.points ?? "—"}</td>
                          <td style={{ textAlign: "right", padding: "6px 8px", color: "#64748b" }}>{entry.maxPoints ?? "—"}</td>
                          <td style={{ textAlign: "right", padding: "6px 0", color: "#94a3b8" }}>{entry.confidence ? `${Math.round(entry.confidence * 100)}%` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null;

              if ((!projectScores || projectScores.scores.length === 0) && solScoring.length === 0) {
                return (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 200, color: "#8892a8", padding: 24 }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>Niciun criteriu de scor disponibil</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>Discutați punctajul cu Solomon pentru estimări automate</div>
                    <button
                      onClick={async () => {
                        try {
                          const data = await apiPost<any>(`/api/projects/${projectId}/recompute-scores`, {});
                          setProjectScores(data);
                          toast("success", "Scorurile au fost recalculate");
                        } catch { toast("error", "Eroare la recalculare"); }
                      }}
                      className="pv-tab" style={{ marginTop: 12, padding: "6px 16px", background: "#2563eb", color: "#fff", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
                    >
                      Recalculează scoruri
                    </button>
                  </div>
                );
              }
              if (!projectScores || projectScores.scores.length === 0) {
                return (<div style={{ padding: 24 }}>{solScoringSection}</div>);
              }
              const { scores, totalPoints, maxTotalPoints, percentage } = projectScores;
              return (
                <div style={{ padding: 24 }}>
                  {/* Sprint 5: Solomon Scoring Panel */}
                  {solScoringSection}
                  {/* Summary header */}
                  <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 160, padding: "16px 20px", background: "#fff", border: "1px solid rgba(226,232,240,.8)", borderRadius: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".6px", color: "#94a3b8", marginBottom: 6 }}>Total punctaj</div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", fontFamily: "'JetBrains Mono', monospace" }}>
                        {totalPoints}<span style={{ fontSize: 14, color: "#94a3b8", fontWeight: 600 }}>/{maxTotalPoints}</span>
                      </div>
                      <div style={{ marginTop: 8, height: 6, background: "#f0f2f5", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 3, width: `${percentage}%`, background: percentage >= 80 ? "#34d399" : percentage >= 50 ? "#2563eb" : "#fbbf24", transition: "width .3s" }} />
                      </div>
                      <div style={{ marginTop: 4, fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>{Math.round(percentage)}%</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 160, padding: "16px 20px", background: "#fff", border: "1px solid rgba(226,232,240,.8)", borderRadius: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".6px", color: "#94a3b8", marginBottom: 6 }}>Criterii evaluate</div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a" }}>{scores.filter(s => s.points != null).length}<span style={{ fontSize: 14, color: "#94a3b8", fontWeight: 600 }}>/{scores.length}</span></div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <button
                        onClick={async () => {
                          try {
                            const data = await apiPost<any>(`/api/projects/${projectId}/recompute-scores`, {});
                            setProjectScores(data);
                            toast("success", "Scorurile au fost recalculate");
                          } catch { toast("error", "Eroare la recalculare"); }
                        }}
                        style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #2563eb", background: "rgba(37,99,235,.06)", color: "#2563eb", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                      >
                        Recalculează
                      </button>
                    </div>
                  </div>

                  {/* Criteria list */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {scores.map((s: any) => {
                      const scored = s.points != null;
                      const pct2 = scored && s.maxPoints > 0 ? Math.round((s.points / s.maxPoints) * 100) : 0;
                      return (
                        <div key={s.criteriaId} style={{
                          padding: "14px 18px", borderRadius: 12, border: "1px solid rgba(226,232,240,.8)",
                          background: "#fff", transition: "all .15s",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            {s.code && <span style={{ fontSize: 10, fontWeight: 700, color: "#2563eb", background: "rgba(37,99,235,.08)", padding: "2px 8px", borderRadius: 4, fontFamily: "'JetBrains Mono', monospace" }}>{s.code}</span>}
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", flex: 1 }}>{s.name}</span>
                            <span style={{
                              fontSize: 14, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace",
                              color: !scored ? "#94a3b8" : pct2 >= 80 ? "#059669" : pct2 >= 50 ? "#2563eb" : "#d97706",
                            }}>
                              {scored ? s.points : "—"}<span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>/{s.maxPoints}</span>
                            </span>
                          </div>
                          {scored && (
                            <div style={{ height: 4, background: "#f0f2f5", borderRadius: 2, overflow: "hidden", marginBottom: 6 }}>
                              <div style={{ height: "100%", borderRadius: 2, width: `${pct2}%`, background: pct2 >= 80 ? "#34d399" : pct2 >= 50 ? "#2563eb" : "#fbbf24" }} />
                            </div>
                          )}
                          {s.reasoning && (
                            <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{s.reasoning}</div>
                          )}
                          {s.inputElements && Object.keys(s.inputElements).length > 0 && (
                            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {Object.entries(s.inputElements).map(([k, v]) => (
                                <span key={k} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: "#f8fafc", border: "1px solid rgba(226,232,240,.8)", color: "#64748b", fontFamily: "'JetBrains Mono', monospace" }}>
                                  {k}: {String(v)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* TABELE (reference tables from guide) */}
            {activeLeaf === "tabele" && (() => {
              if (referenceTables.length === 0) {
                return (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 200, color: "#8892a8", padding: 24 }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>Niciun tabel de referință</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>Tabelele sunt extrase automat din ghidurile de finanțare procesate</div>
                  </div>
                );
              }
              const selTable = selectedRefTable ? referenceTables.find((t: any) => t.id === selectedRefTable) : null;
              return (
                <div style={{ display: "flex", height: "100%", minHeight: 400 }}>
                  {/* Left: table list */}
                  <div style={{ width: 280, borderRight: "1px solid rgba(226,232,240,.8)", overflow: "auto", padding: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".6px", color: "#94a3b8", marginBottom: 10, padding: "0 4px" }}>
                      {referenceTables.length} tabele
                    </div>
                    {referenceTables.map((t: any) => (
                      <div key={t.id}
                        onClick={() => setSelectedRefTable(t.id === selectedRefTable ? null : t.id)}
                        style={{
                          padding: "10px 12px", borderRadius: 10, border: `1px solid ${selectedRefTable === t.id ? "#2563eb" : "rgba(226,232,240,.8)"}`,
                          background: selectedRefTable === t.id ? "rgba(37,99,235,.03)" : "#fff",
                          marginBottom: 6, cursor: "pointer", transition: "all .15s",
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>{t.name}</div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", padding: "2px 7px", borderRadius: 4, background: "rgba(37,99,235,.08)", color: "#2563eb" }}>{t.tableType}</span>
                          {t.validated && <span style={{ fontSize: 10, color: "#059669", fontWeight: 700 }}>✓</span>}
                          {t.sourcePage != null && <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}>p.{t.sourcePage}</span>}
                        </div>
                        {t.description && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, lineHeight: 1.4 }}>{t.description.slice(0, 80)}{t.description.length > 80 ? "…" : ""}</div>}
                      </div>
                    ))}
                  </div>

                  {/* Right: table detail */}
                  <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
                    {selTable ? (
                      <>
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>{selTable.name}</div>
                          {selTable.description && <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5, marginBottom: 8 }}>{selTable.description}</div>}
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", padding: "3px 10px", borderRadius: 6, background: "rgba(37,99,235,.08)", color: "#2563eb" }}>{selTable.tableType}</span>
                            {selTable.extractedBy && <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: "#f8fafc", color: "#64748b", border: "1px solid rgba(226,232,240,.8)" }}>{selTable.extractedBy === "ai" ? "Extras AI" : "Manual"}</span>}
                            {selTable.validated && <span style={{ fontSize: 10, fontWeight: 700, color: "#059669", padding: "3px 10px", borderRadius: 6, background: "rgba(52,211,153,.08)" }}>✓ Validat</span>}
                          </div>
                        </div>
                        {/* Data table */}
                        {selTable.data && selTable.data.length > 0 && selTable.schema && (
                          <div style={{ overflowX: "auto", border: "1px solid rgba(226,232,240,.8)", borderRadius: 10 }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                              <thead>
                                <tr style={{ background: "#f8fafc" }}>
                                  {selTable.schema.map((col: any) => (
                                    <th key={col.key} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: ".5px", color: "#94a3b8", borderBottom: "1px solid rgba(226,232,240,.8)" }}>
                                      {col.label || col.key}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {selTable.data.map((row: any, ri: number) => (
                                  <tr key={ri} style={{ borderBottom: ri < selTable.data.length - 1 ? "1px solid rgba(226,232,240,.5)" : "none" }}>
                                    {selTable.schema.map((col: any) => (
                                      <td key={col.key} style={{ padding: "8px 12px", color: "#0f172a", fontFamily: col.type === "number" ? "'JetBrains Mono', monospace" : "inherit" }}>
                                        {row[col.key] ?? "—"}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {/* Source text */}
                        {selTable.sourceText && (
                          <div style={{ marginTop: 16 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".6px", color: "#94a3b8", marginBottom: 6 }}>Text sursă din ghid</div>
                            <div style={{ fontSize: 12, lineHeight: 1.7, color: "#0f172a", padding: "10px 14px", borderLeft: "3px solid #2563eb", fontStyle: "italic", background: "rgba(37,99,235,.03)", borderRadius: "0 8px 8px 0" }}>
                              {selTable.sourceText}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "#94a3b8", gap: 8 }}>
                        <div style={{ fontSize: 36, opacity: 0.4 }}>📋</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#64748b" }}>Selectează un tabel</div>
                        <div style={{ fontSize: 12, textAlign: "center", maxWidth: 240 }}>Alege un tabel din lista din stânga pentru a vedea datele și structura</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* SOLOMON CHAT */}
            {activeLeaf === "solomon" && (
              <div className="solomon-layout">
                {/* Left panel — Flux Dosar */}
                {(() => {
                  // Phase tree structure — derived from solomonPhase + eligibility + scoring data
                  // Phase structure: stages group Q items. Status is derived from solomonPhase (from Solomon AI).
                  // Solomon emits the current phase via PHASE_JSON at each response.
                  // The structure below maps Q phases to UI stages and element categories.
                  // It mirrors the Q0-Q11 phases defined in Solomon's system prompt.
                  const PHASE_STAGES = [
                    { num: 1, name: "Analiză", desc: "Despre ce e vorba?", phases: [
                      { q: "Q0", defaultLabel: "De ce?", categories: ["beneficiary"] },
                      { q: "Q1", defaultLabel: "Identificare", categories: ["beneficiary", "legal"] },
                    ]},
                    { num: 2, name: "Eligibilitate", desc: "Poate aplica?", phases: [
                      { q: "Q2", defaultLabel: "Eligibilitate", categories: ["farm", "technical"] },
                      { q: "Q3", defaultLabel: "Firme legate", categories: ["legal"] },
                    ]},
                    { num: 3, name: "Evaluare șanse", desc: "Merită să scriem?", phases: [
                      { q: "Q4", defaultLabel: "Dimensionare", categories: ["investment", "financial"] },
                      { q: "Q5", defaultLabel: "Punctaj", categories: ["farm", "investment", "location"] },
                      { q: "Q6", defaultLabel: "Constrângeri", categories: ["legal", "technical"] },
                    ]},
                    { num: 4, name: "Scriere proiect", desc: "E gata dosarul?", phases: [
                      { q: "Q7", defaultLabel: "Colectare date", categories: ["beneficiary", "financial", "farm", "investment"] },
                      { q: "Q8", defaultLabel: "Documente", categories: ["legal"] },
                      { q: "Q9", defaultLabel: "Generare", categories: ["other"] },
                    ]},
                  ];

                  const currentQ = solomonPhase?.phase || "";
                  const currentQNum = parseInt(currentQ.replace("Q", "")) || -1;

                  // Use Solomon's label for the active phase, default labels for others
                  const getPhaseLabel = (phase: { q: string; defaultLabel: string }) => {
                    if (phase.q === currentQ && solomonPhase?.label) return solomonPhase.label;
                    return phase.defaultLabel;
                  };

                  // Determine which Q is "active" for filtering elements
                  const getQStatus = (q: string) => {
                    const qNum = parseInt(q.replace("Q", ""));
                    if (qNum < currentQNum) return "done";
                    if (qNum === currentQNum) return "active";
                    return "pending";
                  };

                  const getStageStatus = (stage: typeof PHASE_STAGES[0]) => {
                    const statuses = stage.phases.map(p => getQStatus(p.q));
                    if (statuses.every(s => s === "done")) return "done";
                    if (statuses.some(s => s === "active")) return "active";
                    return "pending";
                  };

                  // Badge for Q items — element counts, scoring, eligibility info
                  const getQBadge = (q: string, categories: string[]) => {
                    const catElements = elements.filter(e => categories.includes(e.category));
                    const filled = catElements.filter(e => e.value).length;
                    const total = catElements.length;
                    if (total === 0) return null;
                    return `${filled}/${total}`;
                  };

                  // Get Q-specific badges (eligibility count, scoring estimate)
                  const getQSpecialBadge = (q: string) => {
                    if (q === "Q2" || q === "Q3") {
                      const passed = solEligibility.filter((e: any) => e.status === "pass").length;
                      const total = solEligibility.length;
                      if (total > 0) return `${passed}/${total}`;
                    }
                    if (q === "Q5") {
                      const totalPts = solScoring.reduce((s: number, e: any) => s + (e.pointsEstimated || e.points || 0), 0);
                      if (totalPts > 0) return `~${totalPts}p`;
                    }
                    return null;
                  };

                  return (
                    <div className="solomon-flux-panel">
                      <div className="sfp-header">Flux Dosar</div>
                      <div className="sfp-scroll">
                        {PHASE_STAGES.map(stage => {
                          const stageStatus = getStageStatus(stage);
                          return (
                            <div key={stage.num} className="sfp-stage">
                              <div className="sfp-stage-header">
                                <div className={`sfp-stage-num ${stageStatus}`}>{stage.num}</div>
                                <div className="sfp-stage-info">
                                  <div className="sfp-stage-name">{stage.name}</div>
                                  <div className="sfp-stage-desc">{stage.desc}</div>
                                </div>
                                {stageStatus === "done" && <span className="sfp-stage-check">✓</span>}
                              </div>
                              <div className="sfp-items">
                                {stage.phases.map(phase => {
                                  const status = getQStatus(phase.q);
                                  const badge = getQSpecialBadge(phase.q) || getQBadge(phase.q, phase.categories);
                                  return (
                                    <div
                                      key={phase.q}
                                      className={`sfp-item ${status === "active" ? "active" : ""}`}
                                      onClick={() => {
                                        // Clicking a Q sends a prompt to Solomon to focus on that phase
                                        if (status !== "pending") return;
                                        const prompt = `Hai să trecem la ${phase.q} — ${getPhaseLabel(phase)}.`;
                                        setSolomonInput(prompt);
                                      }}
                                    >
                                      <span className={`sfp-item-dot ${status}`} />
                                      <span>{phase.q} {getPhaseLabel(phase)}</span>
                                      {badge && <span className={`sfp-item-badge ${status}`}>{badge}</span>}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
                {/* Chat area */}
                <div
                  className={`solomon-chat${solomonDragOver ? " drag-active" : ""}`}
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); setSolomonDragOver(true); }}
                  onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setSolomonDragOver(false); }}
                  onDrop={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSolomonDragOver(false);
                    const fileList = e.dataTransfer.files;
                    if (fileList && fileList.length > 0) {
                      const files = Array.from(fileList);
                      handleSolomonUpload(files.length === 1 ? files[0] : files);
                    }
                  }}
                >
                  {solomonDragOver && (
                    <div className="solomon-drop-overlay">
                      <div className="solomon-drop-icon">&#128206;</div>
                      <div className="solomon-drop-text">Eliberează pentru upload documente</div>
                    </div>
                  )}
                  {/* Toolbar: avatar + model selector + ET toggle */}
                  <div className="solomon-toolbar">
                    <div className="solomon-toolbar-inner">
                      <div className="solomon-avatar">S</div>
                      <div className="solomon-name-block">
                        <span className="sn-name">Solomon</span>
                        <span className="sn-status"><span className="sn-status-dot" /> Online</span>
                      </div>
                      <div className="model-selector">
                        <button className={`model-btn${solomonModel === "sonnet" ? " active" : ""}`} onClick={() => handleSolomonModelChange("sonnet")} disabled={solomonStreaming}>Sonnet</button>
                        <button className={`model-btn${solomonModel === "opus" ? " active" : ""}`} onClick={() => handleSolomonModelChange("opus")} disabled={solomonStreaming}>Opus</button>
                      </div>
                      <button className={`et-toggle${solomonET ? " on" : ""}`} onClick={() => setSolomonET(prev => !prev)} disabled={solomonStreaming}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L9.19 8.63L2 9.24L7.46 13.97L5.82 21L12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.63L12 2Z"/></svg>
                        ET
                      </button>
                    </div>
                  </div>
                  {/* Phase badge (top-right of toolbar) */}
                  {solomonPhase && (
                    <div style={{ position: "absolute", top: 8, right: 16, display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", background: "#eff6ff", borderRadius: 8, border: "1px solid #bfdbfe", zIndex: 5 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#2563eb", fontFamily: "'JetBrains Mono', monospace" }}>
                        Faza {(() => {
                          const qNum = parseInt(solomonPhase.phase.replace("Q", "")) || 0;
                          if (qNum <= 1) return "1";
                          if (qNum <= 3) return "2";
                          if (qNum <= 6) return "3";
                          return "4";
                        })()}
                      </span>
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>·</span>
                      <span style={{ fontSize: 12, color: "#1e40af" }}>{solomonPhase.phase} {solomonPhase.label}</span>
                    </div>
                  )}
                  {/* FIX I: Source trail — persistent per turn */}
                  {solomonSourceTrail.length > 0 && (
                    <div style={{ padding: "6px 20px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                      <div style={{ maxWidth: 720, margin: "0 auto" }}>
                        {solomonSourceTrail.map((trail, ti) => (
                          <div key={ti} style={{ borderLeft: "2px solid #2563eb", paddingLeft: 12, marginBottom: ti < solomonSourceTrail.length - 1 ? 8 : 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 500, color: "#64748b", marginBottom: 4 }}>
                              {trail.query}
                            </div>
                            {trail.sources.map((src, si) => (
                              <div key={si} style={{ display: "flex", alignItems: "flex-start", gap: 8, paddingLeft: 2, marginBottom: 2 }}>
                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#2563eb", flexShrink: 0, marginTop: 5 }} />
                                <div>
                                  <span style={{ fontSize: 12, color: "#1e293b" }}>
                                    {[src.docType, src.section && `§ ${src.section}`, src.page && `pag. ${src.page}`].filter(Boolean).join(" · ")}
                                  </span>
                                  {src.layer && <span style={{ fontSize: 10, color: "#64748b", fontFamily: "'JetBrains Mono', monospace", marginLeft: 6 }}>{src.layer}</span>}
                                </div>
                              </div>
                            ))}
                            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{trail.sources.length} surse</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Tool use loading indicator (while searching) */}
                  {solomonToolUse && (
                    <div style={{ padding: "4px 20px", background: "#eff6ff" }}>
                      <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#2563eb" }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#2563eb", animation: "statusPulse 1s ease infinite" }} />
                        <span>Se caută: {solomonToolUse.query || "..."}</span>
                      </div>
                    </div>
                  )}
                  {/* Messages */}
                  <div className="chat-messages" ref={chatRef} onScroll={handleChatScroll} onMouseUp={handleTextSelect}>
                    <div className="chat-messages-inner">
                    {solomonMessages.map((msg, msgIdx) => (
                      <div key={msgIdx} className={`solomon-msg ${msg.role === "assistant" ? "solomon-msg-left" : "solomon-msg-right"}`}>
                        <div className="solomon-msg-body">
                          <div className="solomon-msg-text">
                          {renderMsgText(msg.text)}
                          {msg.extractions && (() => {
                            const allExtractions = msg.extractions;
                            const pendingIndices = allExtractions.map((_: any, i: number) => i).filter((i: number) => !extractionStates[`${msgIdx}-${i}`]);
                            const confirmedCount = allExtractions.filter((_: any, i: number) => extractionStates[`${msgIdx}-${i}`] === "confirmed").length;
                            const rejectedCount = allExtractions.filter((_: any, i: number) => extractionStates[`${msgIdx}-${i}`] === "rejected").length;
                            const allResolved = pendingIndices.length === 0 && allExtractions.length > 0;

                            // All extractions resolved — show collapsed summary
                            if (allResolved) {
                              return (
                                <div
                                  className="exc-collapsed-summary"
                                  onClick={() => setExpandedExtractions(prev => ({ ...prev, [msgIdx]: !prev[msgIdx] }))}
                                >
                                  <span className="exc-collapsed-icon">{confirmedCount > 0 ? "\u2713" : "\u2715"}</span>
                                  <span className="exc-collapsed-text">
                                    {confirmedCount > 0 && `${confirmedCount} salvate`}
                                    {confirmedCount > 0 && rejectedCount > 0 && ", "}
                                    {rejectedCount > 0 && `${rejectedCount} respinse`}
                                  </span>
                                  <span className="exc-collapsed-toggle">{expandedExtractions[msgIdx] ? "\u25B2" : "\u25BC"}</span>
                                </div>
                              );
                            }

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
                              {allExtractions.map((ext: any, extIdx: number) => {
                                const k = `${msgIdx}-${extIdx}`;
                                const state = extractionStates[k];
                                // Hide confirmed/rejected cards (collapsed by default)
                                if (state && !expandedExtractions[msgIdx]) return null;
                                return (
                                  <div key={extIdx} className={`extraction-card ${state || ""}`}>
                                    <div className="exc-top">
                                      <span className="exc-label">{state === "confirmed" ? "\u2713 " : ""}{ext.label || ext.key || "Element"}</span>
                                      <span className="exc-confidence">{ext.source || (ext.confidence >= 0.9 ? "confirmat automat" : ext.confidence > 0 ? `conf. ${Math.round(ext.confidence * 100)}%` : "")}</span>
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
                                      <div className="exc-value">{(() => {
                                        const v = ext.value;
                                        if (!v) return "-";
                                        if (typeof v === "string" && v.startsWith("[")) {
                                          try {
                                            const arr = JSON.parse(v);
                                            if (Array.isArray(arr)) {
                                              return arr.map((item: any) =>
                                                typeof item === "object"
                                                  ? Object.entries(item).map(([k2, v2]) => `${k2}: ${v2}`).join(", ")
                                                  : String(item)
                                              ).join(" | ");
                                            }
                                          } catch { /* not JSON */ }
                                        }
                                        if (typeof v === "string" && v.startsWith("{")) {
                                          try {
                                            const obj = JSON.parse(v);
                                            return Object.entries(obj).map(([k2, v2]) => `${k2}: ${v2}`).join(", ");
                                          } catch { /* not JSON */ }
                                        }
                                        return v;
                                      })()}</div>
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
                                      <div className="exc-rejected-label">&#10005; Respins</div>
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
                      <input
                        ref={solomonFileRef}
                        type="file"
                        multiple
                        accept=".pdf,.docx,.xlsx,.doc,.png,.jpg,.jpeg"
                        style={{ display: "none" }}
                        onChange={e => {
                          const fileList = e.target.files;
                          if (fileList && fileList.length > 0) {
                            const files = Array.from(fileList);
                            handleSolomonUpload(files.length === 1 ? files[0] : files);
                          }
                          e.target.value = "";
                        }}
                      />
                      <div className="chat-input-wrapper">
                        <div className="chat-input-row">
                          <textarea
                            className="chat-input"
                            data-solomon-input
                            placeholder="Scrie detalii despre proiect, lipește date sau poze, sau întreabă..."
                            value={solomonInput}
                            rows={3}
                            onChange={e => {
                              setSolomonInput(e.target.value);
                              e.target.style.height = "auto";
                              e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
                            }}
                            onKeyDown={e => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleSolomonSend();
                                (e.target as HTMLTextAreaElement).style.height = "auto";
                              }
                            }}
                            onPaste={e => {
                              const items = e.clipboardData?.items;
                              if (!items) return;
                              for (let i = 0; i < items.length; i++) {
                                if (items[i].type.startsWith("image/")) {
                                  e.preventDefault();
                                  const blob = items[i].getAsFile();
                                  if (blob) {
                                    const ext = blob.type === "image/png" ? "png" : "jpg";
                                    const file = new File([blob], `clipboard_${Date.now()}.${ext}`, { type: blob.type });
                                    handleSolomonUpload(file);
                                  }
                                  return;
                                }
                              }
                            }}
                          />
                          <div className="chat-input-toolbar">
                            <button className="chat-attach-btn" title="Atașează document sau imagine" onClick={() => solomonFileRef.current?.click()} disabled={solomonStreaming || readOnly}>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            </button>
                            <div style={{ flex: 1 }} />
                            {solomonStreaming ? (
                              <button className="chat-btn send" onClick={handleSolomonStop} title="Oprește generarea" style={{ background: "linear-gradient(135deg, #94a3b8 0%, #64748b 100%)", boxShadow: "0 2px 8px rgba(100,116,139,.25)" }}>
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="1" y="1" width="12" height="12" rx="2.5"/></svg>
                              </button>
                            ) : (
                              <button className="chat-btn send" onClick={handleSolomonSend}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="chat-hint">Scrie „analiză detaliată" sau „opus" pentru gândire aprofundată</div>
                    </div>
                  </div>
                </div>

                {/* Elements panel — grouped by category, filtered by current phase */}
                <div className="solomon-elements-panel">
                  <div className="sep-header">
                    <div className="sep-header-top">
                      <span className="sep-header-title">Elemente proiect</span>
                      <span className="sep-count">{elemFilled} / {elemTotal}</span>
                    </div>
                    <div className="sep-progress-bar">
                      <div className="sep-progress-fill" style={{ width: `${pct(elemFilled, elemTotal)}%` }} />
                    </div>
                    {solomonPhase && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#2563eb", background: "#eff6ff", padding: "2px 8px", borderRadius: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                          {solomonPhase.phase}
                        </span>
                        <span style={{ fontSize: 11, color: "#64748b" }}>{solomonPhase.label}</span>
                      </div>
                    )}
                  </div>
                  <div className="sep-scroll">
                    {/* Solomon proposed elements not yet in DB — show first */}
                    {solomonElements.filter(se => se.status !== "confirmat" && !elements.some(e => e.key === se.key && e.value)).length > 0 && (
                      <div className="sep-category-group">
                        <div className="sep-category-title">DE CONFIRMAT</div>
                        {solomonElements.filter(se => se.status !== "confirmat" && !elements.some(e => e.key === se.key && e.value)).map((el, i) => (
                          <div key={`sol-${el.key}-${i}`} className="sep-row is-proposed">
                            <div className="sep-row-left">
                              <span className="sep-row-icon proposed">&#9888;</span>
                              <div className="sep-row-info">
                                <div className="sep-row-label">{el.label}</div>
                                <div className="sep-row-value proposed">{el.value}</div>
                              </div>
                            </div>
                            {!readOnly && (
                              <div className="sep-row-actions">
                                <button className="sep-mini-btn confirm" onClick={() => handleConfirmElement(solomonElements.indexOf(el))} title="Confirmă">&#10003;</button>
                                <button className="sep-mini-btn reject" onClick={() => handleRejectElement(solomonElements.indexOf(el))} title="Respinge">&#10005;</button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* All project elements grouped by category — filtered by current phase */}
                    {(() => {
                      const CATEGORY_LABELS: Record<string, string> = {
                        beneficiary: "REPREZENTANT",
                        financial: "DATE FINANCIARE",
                        farm: "EXPLOATAȚIE",
                        investment: "INVESTIȚIE",
                        location: "LOCAȚIE",
                        legal: "DATE JURIDICE",
                        technical: "DATE TEHNICE",
                        other: "ALTE DATE",
                      };
                      const CATEGORY_ORDER = ["beneficiary", "financial", "farm", "investment", "location", "legal", "technical", "other"];

                      // Phase → category mapping — derived from the same structure as Flux Dosar panel
                      // These map Solomon's Q phases to element categories for filtering
                      const PHASE_CATEGORIES: Record<string, string[]> = {};
                      for (const stage of [
                        { phases: [{ q: "Q0", cats: ["beneficiary"] }, { q: "Q1", cats: ["beneficiary", "legal"] }] },
                        { phases: [{ q: "Q2", cats: ["farm", "technical"] }, { q: "Q3", cats: ["legal"] }] },
                        { phases: [{ q: "Q4", cats: ["investment", "financial"] }, { q: "Q5", cats: ["farm", "investment", "location"] }, { q: "Q6", cats: ["legal", "technical"] }] },
                        { phases: [{ q: "Q7", cats: ["beneficiary", "financial", "farm", "investment"] }, { q: "Q8", cats: ["legal"] }, { q: "Q9", cats: ["other"] }] },
                      ]) { for (const p of stage.phases) PHASE_CATEGORIES[p.q] = p.cats; }

                      const currentQ = solomonPhase?.phase || "";
                      const activeCategories = PHASE_CATEGORIES[currentQ];

                      // If we have an active phase with mapped categories, show those first
                      // Then show remaining categories collapsed
                      let filteredOrder: string[];
                      if (activeCategories && activeCategories.length > 0) {
                        // Active categories first, then the rest
                        const remaining = CATEGORY_ORDER.filter(c => !activeCategories.includes(c));
                        filteredOrder = [...activeCategories, ...remaining];
                      } else {
                        filteredOrder = CATEGORY_ORDER;
                      }

                      const grouped = filteredOrder
                        .map(cat => ({
                          cat,
                          label: CATEGORY_LABELS[cat],
                          items: elements.filter(e => e.category === cat),
                          isPhaseRelevant: activeCategories ? activeCategories.includes(cat) : true,
                        }))
                        .filter(g => g.items.length > 0);

                      return grouped.map(group => (
                        <div key={group.cat} className="sep-category-group" style={!group.isPhaseRelevant ? { opacity: 0.45 } : undefined}>
                          <div className="sep-category-title" style={group.isPhaseRelevant && activeCategories?.length ? { color: "#2563eb" } : undefined}>{group.label}</div>
                          {group.items.map(el => (
                            <div key={el.id} className={`sep-row ${el.status} clickable`} onClick={() => {
                              if (el.value) {
                                // Navigate to Elemente tab and open detail panel
                                setActiveLeaf("elemente");
                                setTimeout(() => openDetailPanel(el.id), 100);
                              } else {
                                // Send directly — include key so Solomon can emit ELEMENTS_JSON
                                const prompt = `Completează elementul "${el.label}" (cheie: ${el.key}). Propune o valoare bazată pe datele firmei, ghidul de finanțare și conversația anterioară. Salvează valoarea în ELEMENTS_JSON.`;
                                setSolomonInput(prompt);
                                // Auto-send after state update
                                setTimeout(() => {
                                  const sendBtn = document.querySelector(".chat-btn.send") as HTMLButtonElement;
                                  if (sendBtn) sendBtn.click();
                                }, 50);
                              }
                            }}>
                              <div className="sep-row-left">
                                <span className={`sep-row-icon ${el.status}`}>
                                  {el.status === "confirmat" ? "\u2713" : el.status === "propus_ai" ? "\u26A0" : el.status === "conflict" ? "\u26A1" : "\u25CB"}
                                </span>
                                <div className="sep-row-info">
                                  <div className="sep-row-label">{el.label}</div>
                                  <div className="sep-row-key">{el.key}</div>
                                  {el.value ? (
                                    <div className={`sep-row-value ${el.status}`}>{el.value}</div>
                                  ) : (
                                    <div className="sep-row-value empty">De completat</div>
                                  )}
                                </div>
                              </div>
                              {el.value && <span className="sep-row-arrow">&rsaquo;</span>}
                            </div>
                          ))}
                        </div>
                      ));
                    })()}
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

            {/* RAG v2: Documente tab removed — moved to Documents (session) page */}
            {false && (
              <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
                <div style={{ maxWidth: 860, margin: "0 auto" }}>
                  {/* Upload zone */}
                  <div
                    style={{
                      border: "2px dashed #cbd5e1", borderRadius: 12, padding: "28px 24px",
                      textAlign: "center", marginBottom: 24, cursor: "pointer",
                      background: docUploading ? "#f0f9ff" : "#fafbfc",
                      transition: "border-color 0.2s, background 0.2s",
                    }}
                    onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = "#2563eb"; e.currentTarget.style.background = "#eff6ff"; }}
                    onDragLeave={e => { e.currentTarget.style.borderColor = "#cbd5e1"; e.currentTarget.style.background = "#fafbfc"; }}
                    onDrop={async e => {
                      e.preventDefault();
                      e.currentTarget.style.borderColor = "#cbd5e1";
                      e.currentTarget.style.background = "#fafbfc";
                      const files = Array.from(e.dataTransfer.files);
                      if (files.length === 0) return;
                      setDocUploading(true);
                      for (const file of files) {
                        try {
                          const fd = new FormData();
                          fd.append("file", file);
                          await api(`/api/folders/${project?.folderId}/documents`, { method: "POST", body: fd, timeout: 120000 });
                        } catch (err: any) { toast("error", `Upload eșuat: ${file.name}`); }
                      }
                      setDocUploading(false);
                      apiGet<any[]>(`/api/folders/${project?.folderId}/classified-documents`).then(docs => setClassifiedDocs(docs || [])).catch(() => {});
                    }}
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.multiple = true;
                      input.accept = ".pdf,.docx,.xlsx,.doc,.png,.jpg";
                      input.onchange = async () => {
                        const files = Array.from(input.files || []);
                        if (files.length === 0) return;
                        setDocUploading(true);
                        for (const file of files) {
                          try {
                            const fd = new FormData();
                            fd.append("file", file);
                            await api(`/api/folders/${project?.folderId}/documents`, { method: "POST", body: fd, timeout: 120000 });
                          } catch (err: any) { toast("error", `Upload eșuat: ${file.name}`); }
                        }
                        setDocUploading(false);
                        apiGet<any[]>(`/api/folders/${project?.folderId}/classified-documents`).then(docs => setClassifiedDocs(docs || [])).catch(() => {});
                      };
                      input.click();
                    }}
                  >
                    <div style={{ fontSize: 32, marginBottom: 8 }}>{docUploading ? "⏳" : "📎"}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>{docUploading ? "Se încarcă..." : "Trage documentele aici sau click pentru a selecta"}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>Ghiduri, template-uri, anexe, CI-uri, bilanțuri, oferte — AI-ul clasifică automat.</div>
                  </div>

                  {/* Grouped document sections */}
                  {(() => {
                    const groups = {
                      guide: classifiedDocs.filter(d => d.classification?.routingAction === "vectorize" && d.status === "processed"),
                      templates: classifiedDocs.filter(d => ["template_fill", "template_compose"].includes(d.classification?.routingAction) && d.status === "processed"),
                      client: classifiedDocs.filter(d => ["extract_data", "vectorize_and_extract"].includes(d.classification?.routingAction) && d.status === "processed"),
                      processing: classifiedDocs.filter(d => d.status === "processing" || d.status === "uploaded"),
                      errors: classifiedDocs.filter(d => d.status === "error" || d.status === "failed"),
                    };

                    const renderDocCard = (doc: any) => {
                      const c = doc.classification;
                      const icon = c?.routingAction === "vectorize" ? "📗" : ["template_fill", "template_compose"].includes(c?.routingAction) ? "📝" : "📄";
                      const statusIcon = doc.status === "processed" ? "✅" : doc.status === "processing" ? "⏳" : doc.status === "error" ? "⚠️" : "📄";
                      const details = [
                        c?.docType,
                        c?.chunksCount && `${c.chunksCount} chunks`,
                        c?.extractedFields && `${c.extractedFields} câmpuri`,
                        doc.documentVersion && doc.documentVersion > 1 && `v${doc.documentVersion}`,
                      ].filter(Boolean).join(" · ");
                      const lowConf = c?.confidence && c.confidence < 0.7;

                      return (
                        <div key={doc.id} style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10,
                          marginBottom: 6, transition: "border-color 0.15s",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = "#94a3b8")}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = "#e2e8f0")}
                        >
                          <span style={{ fontSize: 18 }}>{icon}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {doc.fileName || doc.name} <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>{statusIcon}</span>
                            </div>
                            <div style={{ fontSize: 11, color: "#64748b" }}>
                              {c?.description || details}
                              {lowConf && <span style={{ color: "#f59e0b", marginLeft: 6 }}>⚠ Clasificare incertă</span>}
                            </div>
                          </div>
                          <button
                            style={{ fontSize: 11, color: "#64748b", background: "none", border: "1px solid #e2e8f0", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}
                            onClick={e => { e.stopPropagation(); setReclassifyDoc(doc); }}
                          >✏️</button>
                        </div>
                      );
                    };

                    const renderSection = (title: string, docs: any[]) => {
                      if (docs.length === 0) return null;
                      return (
                        <div key={title} style={{ marginBottom: 20 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                            <span>{title}</span>
                            <span style={{ fontWeight: 400, color: "#94a3b8" }}>{docs.length} documente</span>
                          </div>
                          {docs.map(renderDocCard)}
                        </div>
                      );
                    };

                    if (classifiedDocs.length === 0) {
                      return (
                        <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>
                          <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
                          <div style={{ fontSize: 14 }}>Niciun document încă. Începe prin a adăuga ghidul sesiunii.</div>
                        </div>
                      );
                    }

                    return (
                      <>
                        {renderSection("Ghid și referință", groups.guide)}
                        {renderSection("Template-uri", groups.templates)}
                        {renderSection("Documente client", groups.client)}
                        {renderSection("În procesare", groups.processing)}
                        {renderSection("Erori", groups.errors)}
                      </>
                    );
                  })()}

                  {/* Reclassify Dialog */}
                  {reclassifyDoc && (
                    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setReclassifyDoc(null)}>
                      <div style={{ background: "#fff", borderRadius: 14, padding: 24, width: 420, maxWidth: "90vw" }} onClick={e => e.stopPropagation()}>
                        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Corectează clasificarea</div>
                        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>Document: {reclassifyDoc.fileName || reclassifyDoc.name}</div>
                        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>Clasificare AI: {reclassifyDoc.classification?.docType} ({Math.round((reclassifyDoc.classification?.confidence || 0) * 100)}%)</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                          {[
                            { label: "Ghid / Fișă evaluare (se indexează)", type: "ghid", route: "vectorize" },
                            { label: "Template de completat (câmpuri)", type: "template_fill", route: "template_fill" },
                            { label: "Template narativ (memoriu, SF)", type: "template_compose", route: "template_compose" },
                            { label: "Document client (CI, bilanț, certificat)", type: "document_client", route: "extract_data" },
                            { label: "Ofertă furnizor", type: "oferta", route: "extract_data" },
                            { label: "Studiu fezabilitate completat", type: "studiu_fezabilitate", route: "vectorize_and_extract" },
                          ].map(opt => (
                            <label key={opt.type} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, border: `1px solid ${reclassifyType === opt.type ? "#2563eb" : "#e2e8f0"}`, cursor: "pointer", fontSize: 13, background: reclassifyType === opt.type ? "#eff6ff" : "transparent" }}>
                              <input type="radio" name="reclassify" checked={reclassifyType === opt.type} onChange={() => { setReclassifyType(opt.type); setReclassifyRoute(opt.route); }} />
                              {opt.label}
                            </label>
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <button style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: 13, cursor: "pointer" }} onClick={() => setReclassifyDoc(null)}>Anulează</button>
                          <button style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: reclassifyType ? 1 : 0.5 }}
                            disabled={!reclassifyType}
                            onClick={async () => {
                              try {
                                await apiPut(`/api/documents/${reclassifyDoc.id}/reclassify`, { docType: reclassifyType, routingAction: reclassifyRoute });
                                toast("success", "Reclasificare trimisă. Documentul se reprocesează.");
                                setReclassifyDoc(null);
                                setReclassifyType("");
                                setReclassifyRoute("");
                                setTimeout(() => apiGet<any[]>(`/api/folders/${project?.folderId}/classified-documents`).then(docs => setClassifiedDocs(docs || [])).catch(() => {}), 2000);
                              } catch { toast("error", "Eroare la reclasificare."); }
                            }}
                          >Reclasifică</button>
                        </div>
                      </div>
                    </div>
                  )}
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

                  {/* FIX H: Compose Brief status + generate button */}
                  <div style={{ margin: "8px 0", padding: "10px 12px", background: project?.composeBrief && !(project.composeBrief as any)?._outdated ? "#ecfdf5" : "#f8fafc", borderRadius: 8, border: `1px solid ${project?.composeBrief && !(project.composeBrief as any)?._outdated ? "#a7f3d0" : "#e2e8f0"}`, display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#1e293b" }}>
                        {project?.composeBrief
                          ? (project.composeBrief as any)?._outdated
                            ? "Brief outdated — regenerează"
                            : `Brief generat ${(project.composeBrief as any)?.generatedAt ? new Date((project.composeBrief as any).generatedAt).toLocaleDateString("ro-RO") : ""}`
                          : "Brief negenereat"}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>
                        {project?.composeBrief
                          ? "Solomon a sintetizat contextul narativ pentru Neemia."
                          : "Generează brief-ul ca Solomon să furnizeze context narativ pentru documente."}
                      </div>
                    </div>
                    <button
                      style={{ padding: "6px 14px", fontSize: 11, fontWeight: 700, borderRadius: 7, border: "none", background: project?.composeBrief && !(project.composeBrief as any)?._outdated ? "#e2e8f0" : "#2563eb", color: project?.composeBrief && !(project.composeBrief as any)?._outdated ? "#475569" : "#fff", cursor: "pointer", whiteSpace: "nowrap" }}
                      disabled={readOnly}
                      onClick={async () => {
                        try {
                          toast("info", "Se generează brief-ul...");
                          const result = await apiPost<any>(`/api/solomon/projects/${projectId}/compose-brief`, {});
                          setProject(prev => prev ? { ...prev, composeBrief: result.brief } : prev);
                          toast("success", "Brief generat cu succes.");
                        } catch (err: any) { toast("error", err.message || "Eroare la generare brief"); }
                      }}
                    >{project?.composeBrief && !(project.composeBrief as any)?._outdated ? "Regenerează brief" : "Generează brief"}</button>
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
                              onClick={async () => {
                                const msg = `Solomon, am nevoie de următoarele date pentru secțiunea "${sr.sectionTitle}": ${sr.requiredMissing.join(", ")}. Te rog ajută-mă să le completez.`;
                                setActiveLeaf("solomon");
                                if (!solomonConvId) await initSolomonConversation();
                                setSolomonInput(msg);
                                setTimeout(() => {
                                  const inp = document.querySelector("[data-solomon-input]") as HTMLTextAreaElement;
                                  if (inp) inp.focus();
                                }, 200);
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
                          <button
                            className={`tc-mode-badge ${tmpl.generationMode === "compose" ? "compose" : "fill"}`}
                            title={`Click pentru a comuta la ${tmpl.generationMode === "compose" ? "FILL" : "COMPOSE"}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleGenerationMode(tmpl.templateDocumentId, tmpl.generationMode || "fill");
                            }}
                            disabled={readOnly || neemiaTogglingMode}
                          >
                            {tmpl.generationMode === "compose" ? "COMPOSE" : "FILL"}
                          </button>
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
                                  await refreshNeemiaDocs();
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
                                      if (!confirm(`Restaurezi versiunea v${v.version}? Versiunea curentă va fi înlocuită.`)) return;
                                      try {
                                        await apiPost(`/api/neemia/documents/${v.id}/rollback`, {});
                                        await refreshNeemiaDocs();
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
                  ) : neemiaTemplate && neemiaTemplate.generationMode !== "compose" && fodEnabled && (fodRenderData || fodLoading) ? (
                    /* FORM-ON-DOCUMENT VIEW */
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderBottom: "1px solid rgba(226,232,240,.8)", background: "#ffffff", flexShrink: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{neemiaTemplate.name}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "rgba(77,139,255,.1)", color: "#4d8bff" }}>FORM-ON-DOC</span>
                        <div style={{ flex: 1 }} />
                        <button
                          style={{ fontSize: 11, padding: "3px 10px", borderRadius: 5, border: "1px solid rgba(226,232,240,.8)", background: "#fff", cursor: "pointer", fontWeight: 500 }}
                          onClick={() => { setFodEnabled(false); setFodRenderData(null); }}
                        >
                          Vizualizare clasică
                        </button>
                      </div>
                      <FormOnDocument
                        renderData={fodRenderData}
                        loading={fodLoading}
                        error={fodError}
                        projectId={projectId || ""}
                        templateDocId={neemiaTemplate.templateDocumentId}
                        readOnly={readOnly}
                        onFieldSave={handleFodFieldSave}
                        onFieldConfirm={handleFodFieldConfirm}
                      />
                    </>
                  ) : neemiaTemplate && neemiaTemplate.pages.length > 0 ? (
                    <>
                      {/* Classic view toggle */}
                      {!fodEnabled && neemiaTemplate.generationMode !== "compose" && (
                        <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 12px", borderBottom: "1px solid rgba(226,232,240,.8)" }}>
                          <button
                            style={{ fontSize: 11, padding: "3px 10px", borderRadius: 5, border: "1px solid rgba(77,139,255,.3)", background: "rgba(77,139,255,.06)", color: "#4d8bff", cursor: "pointer", fontWeight: 600 }}
                            onClick={() => {
                              setFodEnabled(true);
                              // Trigger render load
                              if (neemiaTemplate.templateDocumentId && projectId) {
                                setFodLoading(true);
                                setFodError(null);
                                apiGet<any>(`/api/neemia/projects/${projectId}/template-render/${neemiaTemplate.templateDocumentId}`)
                                  .then(data => setFodRenderData(data))
                                  .catch(() => setFodError("Nu s-a putut renderiza documentul."))
                                  .finally(() => setFodLoading(false));
                              }
                            }}
                          >
                            Completare pe document
                          </button>
                        </div>
                      )}
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
                              <div
                                className={`nfp-card ${f.value ? (f.confirmed ? "is-confirmed" : "is-proposed") : "is-empty"} ${neemiaEditingField === f.key ? "is-editing" : ""}`}
                                key={fi}
                                onClick={() => {
                                  if (readOnly || neemiaEditingField === f.key) return;
                                  setNeemiaEditingField(f.key);
                                  setNeemiaEditValue(f.value || "");
                                }}
                                style={{ cursor: readOnly ? "default" : "pointer" }}
                              >
                                <div className="nfp-card-top">
                                  <span className="nfp-card-label">{f.name}</span>
                                  <span className={`nfp-card-status ${f.confirmed ? "confirmed" : f.value ? "proposed" : "empty"}`}>
                                    {f.confirmed ? "✓ Confirmat" : f.value ? "○ Propus" : "— Gol"}
                                  </span>
                                </div>
                                {neemiaEditingField === f.key ? (
                                  <div style={{ padding: "6px 0" }} onClick={e => e.stopPropagation()}>
                                    {f.fieldType === "textarea" || (f.value && f.value.length > 80) ? (
                                      <textarea
                                        style={{
                                          width: "100%", padding: "8px 10px", fontSize: 13, fontFamily: "inherit",
                                          border: "1.5px solid #4d8bff", borderRadius: 6, background: "#f8fafc",
                                          resize: "vertical", outline: "none", lineHeight: 1.5,
                                        }}
                                        value={neemiaEditValue}
                                        onChange={e => setNeemiaEditValue(e.target.value)}
                                        rows={3}
                                        autoFocus
                                        onKeyDown={e => {
                                          if (e.key === "Escape") { setNeemiaEditingField(null); setNeemiaEditValue(""); }
                                        }}
                                      />
                                    ) : (
                                      <input
                                        style={{
                                          width: "100%", padding: "8px 10px", fontSize: 13, fontFamily: "inherit",
                                          border: "1.5px solid #4d8bff", borderRadius: 6, background: "#f8fafc",
                                          outline: "none",
                                        }}
                                        type={f.fieldType === "number" ? "number" : "text"}
                                        value={neemiaEditValue}
                                        onChange={e => setNeemiaEditValue(e.target.value)}
                                        autoFocus
                                        onKeyDown={e => {
                                          if (e.key === "Enter") handleNeemiaFieldEdit(f, neemiaEditValue);
                                          if (e.key === "Escape") { setNeemiaEditingField(null); setNeemiaEditValue(""); }
                                        }}
                                      />
                                    )}
                                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                                      <button
                                        style={{
                                          padding: "4px 12px", fontSize: 11, fontWeight: 600, borderRadius: 5,
                                          border: "none", background: "#4d8bff", color: "#fff", cursor: "pointer",
                                          opacity: neemiaSavingField ? 0.6 : 1,
                                        }}
                                        onClick={() => handleNeemiaFieldEdit(f, neemiaEditValue)}
                                        disabled={neemiaSavingField}
                                      >
                                        {neemiaSavingField ? "..." : "Salvează"}
                                      </button>
                                      <button
                                        style={{
                                          padding: "4px 12px", fontSize: 11, fontWeight: 600, borderRadius: 5,
                                          border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", cursor: "pointer",
                                        }}
                                        onClick={() => { setNeemiaEditingField(null); setNeemiaEditValue(""); }}
                                      >
                                        Anulează
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className={`nfp-card-value ${!f.value ? "missing" : ""}`}>
                                    {f.value || `{{${f.key}}}`}
                                  </div>
                                )}
                                {f.source && neemiaEditingField !== f.key && (
                                  <div className="nfp-card-source">
                                    <span className={`source-dot ${f.source.toLowerCase()}`} />
                                    {f.source}
                                  </div>
                                )}
                                {f.fieldType !== "text" && neemiaEditingField !== f.key && (
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
