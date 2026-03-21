"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiGet, apiPut, apiPost, apiDelete } from "@/lib/api";

/* ═══ TYPES ═══ */
interface TemplateElement {
  id: string;
  documentId: string;
  key: string;
  label: string;
  fieldType: string;
  pageNum: number | null;
  lineNum: number | null;
  group: string | null;
  isRepeating: boolean;
  rowIndex: number | null;
  detected: boolean;
  validated: boolean;
}

interface MappingInfo {
  mapped: boolean;
  mappingId: string | null;
  mappingValidated: boolean;
  elementDefId: string | null;
  elementDefName: string | null;
  confidence: number | null;
  category: string | null;
  source: string;
}

interface TemplatePage {
  num: number;
  elements: TemplateElement[];
  totalElements: number;
  validatedElements: number;
}

interface TemplateData {
  documentId: string;
  documentName: string;
  fileType: string;
  pageCount: number;
  totalElements: number;
  validatedElements: number;
  pages: TemplatePage[];
}

const TYPE_OPTIONS = ["text", "number", "textarea", "date", "table", "signature", "select"];

export default function TemplateViewerPage() {
  const params = useParams();
  const router = useRouter();
  const docId = params.id as string;

  const [template, setTemplate] = useState<TemplateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedEl, setSelectedEl] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [currentPageNum, setCurrentPageNum] = useState(1);

  // Add element form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEl, setNewEl] = useState({ key: "", label: "", type: "text" });

  // COMPOSE config
  const [showComposeConfig, setShowComposeConfig] = useState(false);
  const [genMode, setGenMode] = useState<"fill" | "compose">("fill");
  const [composeSections, setComposeSections] = useState<Array<{
    marker: string; type: "narrative" | "table" | "calculation"; label: string;
    referenceTableIds?: string[]; elementKeys?: string[]; instructions?: string;
  }>>([]);
  const [composeAiModel, setComposeAiModel] = useState("");
  const [availableRefTables, setAvailableRefTables] = useState<Array<{ id: string; name: string; tableType: string; columnCount: number; rowCount: number }>>([]);
  const [composeSaving, setComposeSaving] = useState(false);
  const [composeDetecting, setComposeDetecting] = useState(false);

  // Mapping review data
  const [mappingData, setMappingData] = useState<Record<string, MappingInfo>>({});
  const [mappingSummary, setMappingSummary] = useState({ total: 0, mapped: 0, unmapped: 0, validated: 0 });

  // Rule links + scoring per element (GAP 20 & 21)
  interface RuleLinkFull {
    id: string;
    ruleId: string;
    role: string;
    description: string | null;
    rule?: {
      id: string;
      type: "fixed" | "interpreted";
      description: string;
      category: string;
      sourcePage: number | null;
      sourceText: string | null;
      confidence: string | null;
      condition: any;
      needsReview: boolean;
      validated: boolean;
      ruleKey: string | null;
    };
    referenceTables?: Array<{ table?: { id: string; name: string; tableType: string } }>;
  }
  const [elementRuleLinks, setElementRuleLinks] = useState<Record<string, RuleLinkFull[]>>({});
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);
  const [elementScoring, setElementScoring] = useState<Record<string, Array<{ criterionName: string; maxPoints: number }>>>({});

  // Split pane
  const [splitWidth, setSplitWidth] = useState(400);
  const splitDragging = useRef(false);
  const splitRef = useRef<HTMLDivElement>(null);

  // Scroll ref for document preview
  const elRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // ─── LOAD DATA ───
  const loadTemplate = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiGet<TemplateData>(`/api/documents/documents/${docId}/elements`);
      setTemplate(data);
      setCurrentPageNum(prev => {
        if (data.pages.length > 0 && prev > data.pages.length) {
          return data.pages[0].num;
        }
        return prev;
      });
      // Load mapping data (enriched template elements with confidence info)
      try {
        const mapData = await apiGet<{
          elements: Array<MappingInfo & { key: string }>;
          total: number; mapped: number; unmapped: number; validated: number;
        }>(`/api/documents/documents/${docId}/template-elements`);
        const mapByKey: Record<string, MappingInfo> = {};
        for (const el of mapData.elements) {
          mapByKey[el.key] = el;
        }
        setMappingData(mapByKey);
        setMappingSummary({ total: mapData.total, mapped: mapData.mapped, unmapped: mapData.unmapped, validated: mapData.validated });
      } catch {}

      // Load compose config
      try {
        const cfg = await apiGet<any>(`/api/neemia/templates/${docId}/compose-config`);
        setGenMode(cfg.generationMode || "fill");
        if (cfg.composeConfig?.sections) {
          setComposeSections(cfg.composeConfig.sections);
        }
        if (cfg.composeConfig?.aiModel) {
          setComposeAiModel(cfg.composeConfig.aiModel);
        }
      } catch {}
    } catch (err: any) {
      setError(err.message || "Eroare la încărcare");
    } finally {
      setLoading(false);
    }
  }, [docId]);

  useEffect(() => { loadTemplate(); }, [loadTemplate]);

  // Fetch rule links for selected element (GAP 20) — full rule data
  useEffect(() => {
    if (!selectedEl || elementRuleLinks[selectedEl]) return;
    apiGet<RuleLinkFull[]>(`/api/reference/elements/${selectedEl}/rule-links`)
      .then(data => {
        setElementRuleLinks(prev => ({ ...prev, [selectedEl]: data || [] }));
        setExpandedRuleId(null);
      })
      .catch(() => setElementRuleLinks(prev => ({ ...prev, [selectedEl]: [] })));
  }, [selectedEl, elementRuleLinks]);

  // Build scoring map by elementKey (GAP 21) — from scoring criteria with evaluationLogic.elementKey
  useEffect(() => {
    if (!template) return;
    apiGet<Array<{ name: string; maxPoints: string; evaluationLogic?: { elementKey?: string } }>>(`/api/documents/documents/${docId}/scoring-summary`)
      .then(criteria => {
        const map: Record<string, Array<{ criterionName: string; maxPoints: number }>> = {};
        for (const c of criteria) {
          const key = c.evaluationLogic?.elementKey;
          if (!key) continue;
          const el = allElements.find(e => e.key === key);
          if (!el) continue;
          if (!map[el.id]) map[el.id] = [];
          map[el.id].push({ criterionName: c.name, maxPoints: parseFloat(c.maxPoints) || 0 });
        }
        setElementScoring(map);
      })
      .catch(() => {});
  }, [template, docId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── SPLIT PANE DRAG ───
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!splitDragging.current || !splitRef.current) return;
      const rect = splitRef.current.getBoundingClientRect();
      const newWidth = Math.min(Math.max(e.clientX - rect.left, 280), 640);
      setSplitWidth(newWidth);
    };
    const onMouseUp = () => { splitDragging.current = false; document.body.style.cursor = ""; document.body.style.userSelect = ""; };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => { document.removeEventListener("mousemove", onMouseMove); document.removeEventListener("mouseup", onMouseUp); };
  }, []);

  // ─── DERIVED ───
  const allElements = template?.pages.flatMap(p => p.elements) || [];
  const totalEls = allElements.length;
  const validatedEls = allElements.filter(e => e.validated).length;
  const pct = totalEls > 0 ? Math.round((validatedEls / totalEls) * 100) : 0;

  const currentPage = template?.pages.find(p => p.num === currentPageNum) || null;

  const filteredEls = allElements.filter(e => {
    if (filter === "nevalidat") return !e.validated;
    if (filter === "validat") return e.validated;
    if (filter === "manual") return !e.detected;
    return true;
  });

  const groupedByPage: Record<number, TemplateElement[]> = {};
  filteredEls.forEach(e => {
    const pg = e.pageNum || 1;
    if (!groupedByPage[pg]) groupedByPage[pg] = [];
    groupedByPage[pg].push(e);
  });

  const selElement = allElements.find(e => e.id === selectedEl) || null;

  // ─── ACTIONS ───
  const handleValidate = async (id: string) => {
    const el = allElements.find(e => e.id === id);
    if (!el) return;
    try {
      await apiPut(`/api/documents/documents/${docId}/elements/${id}`, { validated: !el.validated });
      setTemplate(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          validatedElements: prev.validatedElements + (el.validated ? -1 : 1),
          pages: prev.pages.map(p => ({
            ...p,
            elements: p.elements.map(e => e.id === id ? { ...e, validated: !e.validated } : e),
            validatedElements: p.validatedElements + (p.elements.some(e => e.id === id) ? (el.validated ? -1 : 1) : 0),
          })),
        };
      });
    } catch {}
  };

  const handleValidatePage = async (pageNum: number) => {
    const pageEls = allElements.filter(e => (e.pageNum || 1) === pageNum);
    const allVal = pageEls.every(e => e.validated);
    try {
      await apiPut(`/api/documents/documents/${docId}/elements-validate-page`, { pageNum, validated: !allVal });
      await loadTemplate();
    } catch {}
  };

  const handleAddElement = async () => {
    if (!newEl.key || !newEl.label) return;
    // Validate key format: alphanumeric, underscores, hyphens only
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(newEl.key)) return;
    try {
      await apiPost(`/api/documents/documents/${docId}/elements`, {
        key: newEl.key,
        label: newEl.label,
        fieldType: newEl.type,
        pageNum: currentPageNum,
        lineNum: currentPage ? currentPage.elements.length : 0,
      });
      setNewEl({ key: "", label: "", type: "text" });
      setShowAddForm(false);
      await loadTemplate();
    } catch {}
  };

  const handleSelectElement = (id: string | null) => {
    setSelectedEl(id);
    setExpandedRuleId(null);
    if (id) {
      const el = allElements.find(e => e.id === id);
      if (el && (el.pageNum || 1) !== currentPageNum) {
        setCurrentPageNum(el.pageNum || 1);
      }
      // Scroll to element in document preview
      setTimeout(() => {
        elRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  };

  // ─── MAPPING REVIEW HANDLERS ───
  const handleValidateMapping = async (key: string) => {
    const info = mappingData[key];
    if (!info?.mappingId) return;
    try {
      await apiPut(`/api/documents/documents/${docId}/mappings/${info.mappingId}`, {
        validated: !info.mappingValidated,
      });
      setMappingData(prev => ({
        ...prev,
        [key]: { ...prev[key], mappingValidated: !info.mappingValidated },
      }));
      setMappingSummary(prev => ({
        ...prev,
        validated: prev.validated + (info.mappingValidated ? -1 : 1),
      }));
    } catch {}
  };

  // ─── COMPOSE CONFIG HANDLERS ───
  const handleDetectMarkers = async () => {
    setComposeDetecting(true);
    try {
      const result = await apiPost<any>(`/api/neemia/templates/${docId}/detect-compose-markers`, {});
      if (result.composeMarkers?.length > 0) {
        setComposeSections(result.composeMarkers);
      }
      setAvailableRefTables(result.availableReferenceTables || []);
      if (result.suggestion === "compose") {
        setGenMode("compose");
      }
    } catch {}
    setComposeDetecting(false);
  };

  const handleSaveComposeConfig = async () => {
    setComposeSaving(true);
    try {
      if (genMode === "compose" && composeSections.length > 0) {
        await apiPut(`/api/neemia/templates/${docId}/compose-config`, {
          sections: composeSections,
          aiModel: composeAiModel || undefined,
          language: "ro",
        });
      } else {
        await apiPut(`/api/neemia/templates/${docId}/generation-mode`, { mode: genMode });
      }
    } catch {}
    setComposeSaving(false);
  };

  const handleAddComposeSection = () => {
    setComposeSections(prev => [...prev, {
      marker: "COMPOSE:noua_sectiune",
      type: "narrative",
      label: "Secțiune nouă",
    }]);
  };

  const handleRemoveComposeSection = (idx: number) => {
    setComposeSections(prev => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateComposeSection = (idx: number, field: string, value: any) => {
    setComposeSections(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  // ─── PROGRESS COLORS ───
  const progressColor = pct >= 80 ? "text-emerald-500" : pct >= 40 ? "text-amber-500" : "text-red-500";
  const progressBg = pct >= 80 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        Se incarca template-ul...
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="flex items-center justify-center h-full text-red-500 text-sm flex-col gap-3">
        <span>{error || "Template negasit"}</span>
        <button onClick={() => router.back()} className="px-4 py-1.5 rounded-lg border border-slate-200 bg-transparent text-slate-500 cursor-pointer font-sans text-[13px]">Inapoi</button>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .tv{display:flex;flex-direction:column;height:100%}
        .tv-header{padding:12px 24px;border-bottom:1px solid rgb(226 232 240);background:white;display:flex;align-items:center;gap:16px;flex-shrink:0}
        .tv-back{background:none;border:1px solid rgb(226 232 240);border-radius:8px;padding:6px 12px;color:rgb(100 116 139);font-size:13px;font-weight:600;cursor:pointer;font-family:'Inter',system-ui,sans-serif;display:flex;align-items:center;gap:4px;transition:all .15s}
        .tv-back:hover{border-color:rgb(203 213 225);color:rgb(15 23 42)}
        .tv-title{font-size:16px;font-weight:800;flex:1}
        .tv-file-badge{font-size:10px;font-weight:700;text-transform:uppercase;padding:3px 8px;border-radius:4px;background:rgba(77,139,255,.1);color:rgb(37 99 235);letter-spacing:.5px}
        .tv-mode-badge{font-size:9px;font-weight:700;padding:2px 8px;border-radius:3px;text-transform:uppercase;letter-spacing:.5px}
        .tv-mode-badge.fill{background:rgba(77,139,255,.12);color:rgb(37 99 235)}
        .tv-mode-badge.compose{background:rgba(167,139,250,.15);color:rgb(139 92 246)}
        .tv-progress{display:flex;align-items:center;gap:10px}
        .tv-pbar{width:100px;height:6px;background:rgb(248 250 252);border-radius:3px;overflow:hidden}
        .tv-pfill{height:100%;border-radius:3px;transition:width .3s}
        .tv-ppct{font-size:13px;font-weight:700;font-family:'JetBrains Mono',monospace}
        .tv-body{flex:1;display:flex;overflow:hidden}

        /* Split handle */
        .tv-split-handle{width:6px;cursor:col-resize;background:white;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s;position:relative;z-index:2}
        .tv-split-handle:hover,.tv-split-handle:active{background:rgb(203 213 225)}
        .tv-sh-dots{width:2px;height:32px;background:rgb(148 163 184);border-radius:1px;opacity:.4;transition:opacity .15s}
        .tv-split-handle:hover .tv-sh-dots{opacity:.8}

        /* Left panel: elements checklist */
        .tv-left{min-width:280px;max-width:640px;border-right:1px solid rgb(226 232 240);display:flex;flex-direction:column;overflow:hidden;background:white;flex-shrink:0}
        .tv-left-bar{padding:10px 16px;border-bottom:1px solid rgb(226 232 240);display:flex;align-items:center;gap:8px;flex-shrink:0}
        .pill-group{display:flex;background:rgb(248 250 252);border-radius:10px;padding:2px;gap:1px}
        .pill{padding:4px 10px;border-radius:8px;font-size:11px;font-weight:600;border:none;cursor:pointer;background:transparent;color:rgb(148 163 184);font-family:'Inter',system-ui,sans-serif;transition:all .15s}
        .pill:hover{color:rgb(100 116 139)}.pill.on{background:rgb(37 99 235);color:#fff}
        .tv-left-scroll{flex:1;overflow-y:auto;padding:8px 12px}

        .tv-pg-header{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:rgb(148 163 184);padding:12px 6px 6px;display:flex;align-items:center;gap:6px}
        .tv-pg-header .pg-num{color:rgb(37 99 235)}
        .tv-pg-count{margin-left:auto;font-family:'JetBrains Mono',monospace;color:rgb(148 163 184);font-size:10px}

        /* Element cards — Neemia-aligned */
        .el-card{padding:10px 12px;border-radius:6px;border:1px solid rgb(226 232 240);background:rgb(248 250 252);cursor:pointer;transition:all .12s;margin-bottom:4px}
        .el-card:hover{border-color:rgb(203 213 225)}
        .el-card.active{background:rgba(77,139,255,.06);border-color:rgb(59 130 246)}
        .el-card.is-validated{border-left:3px solid rgb(16 185 129)}
        .el-card.is-detected{border-left:3px solid rgb(245 158 11)}
        .el-card.is-manual{border-left:3px solid rgb(139 92 246)}
        .el-card-top{display:flex;align-items:center;gap:8px;margin-bottom:4px}
        .el-label{font-size:12px;font-weight:600;color:rgb(15 23 42);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .el-type{font-size:10px;font-family:'JetBrains Mono',monospace;color:rgb(148 163 184);padding:1px 6px;background:rgb(248 250 252);border-radius:4px;flex-shrink:0}
        .el-card-bottom{display:flex;align-items:center;gap:8px}
        .el-key{font-size:11px;font-family:'JetBrains Mono',monospace;color:rgb(100 116 139)}
        .el-line{font-size:10px;color:rgb(148 163 184)}
        .el-validate{flex-shrink:0;padding:3px 10px;border-radius:8px;border:1px solid rgb(226 232 240);background:transparent;font-size:10px;font-weight:700;cursor:pointer;font-family:'Inter',system-ui,sans-serif;transition:all .12s;color:rgb(148 163 184);margin-left:auto}
        .el-validate:hover{border-color:rgb(16 185 129);color:rgb(16 185 129)}
        .el-validate.on{background:rgba(52,211,153,.1);border-color:rgb(16 185 129);color:rgb(16 185 129)}
        .el-status{font-size:10px;font-weight:700;flex-shrink:0}
        .el-status.validated{color:rgb(16 185 129)}
        .el-status.detected{color:rgb(245 158 11)}
        .el-status.manual{color:rgb(139 92 246)}

        /* ─── Rule links expanded panel ─── */
        .rl-panel{margin-top:8px;border-top:1px solid rgb(226 232 240);padding-top:8px}
        .rl-header{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:rgb(148 163 184);margin-bottom:6px;display:flex;align-items:center;gap:6px}
        .rl-count{color:rgb(37 99 235)}
        .rl-card{padding:8px 10px;border-radius:8px;border:1px solid rgba(226,232,240,.8);background:#fff;margin-bottom:6px;cursor:pointer;transition:all .15s}
        .rl-card:hover{border-color:rgb(203 213 225);box-shadow:0 1px 2px rgba(0,0,0,.04)}
        .rl-card.expanded{border-color:rgb(59 130 246);background:rgba(37,99,235,.02);box-shadow:0 0 0 1px rgba(37,99,235,.12)}
        .rl-card-top{display:flex;align-items:center;gap:5px;margin-bottom:4px;flex-wrap:wrap}
        .rl-type-badge{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;padding:2px 7px;border-radius:4px;flex-shrink:0}
        .rl-type-badge.fixed{color:#059669;background:rgba(52,211,153,.15);border:1px solid #a7f3d0}
        .rl-type-badge.interpreted{color:#d97706;background:rgba(251,191,36,.15);border:1px solid #fed7aa}
        .rl-cat-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0}
        .rl-cat-label{font-size:9px;color:#94a3b8;font-weight:600}
        .rl-review{font-size:10px;color:#d97706}
        .rl-valid{font-size:10px;color:#059669;font-weight:700}
        .rl-role{font-size:9px;font-weight:600;padding:1px 6px;border-radius:4px;background:rgba(100,116,139,.08);color:#64748b;text-transform:uppercase;letter-spacing:.3px}
        .rl-expand-icon{margin-left:auto;font-size:10px;color:#94a3b8;flex-shrink:0}
        .rl-desc-short{font-size:12px;line-height:1.5;color:#0f172a}
        .rl-tags-row{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}
        .rl-struct-tag{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;padding:2px 8px;border-radius:4px;background:rgba(167,139,250,.12);color:#7c3aed;border:1px solid rgba(167,139,250,.25)}
        .rl-sem-tag{font-size:9px;font-weight:700;letter-spacing:.3px;padding:2px 7px;border-radius:12px;display:inline-flex;align-items:center;gap:3px;text-transform:uppercase}
        .rl-sem-tag.threshold{color:#0369a1;background:rgba(14,165,233,.1);border:1px solid rgba(14,165,233,.25)}
        .rl-sem-tag.scoring{color:#7c3aed;background:rgba(167,139,250,.1);border:1px solid rgba(167,139,250,.25)}
        .rl-sem-tag.temporal{color:#0891b2;background:rgba(6,182,212,.1);border:1px solid rgba(6,182,212,.25)}
        .rl-sem-tag.document_based{color:#b45309;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.25)}
        .rl-sem-tag.dependency{color:#6d28d9;background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.25)}
        .rl-sem-tag.exclusion{color:#dc2626;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2)}
        .rl-sem-tag.exception{color:#ea580c;background:rgba(249,115,22,.1);border:1px solid rgba(249,115,22,.2)}
        .rl-sem-tag.proportional{color:#059669;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.25)}
        .rl-sem-tag.classification{color:#2563eb;background:rgba(37,99,235,.1);border:1px solid rgba(37,99,235,.2)}
        .rl-meta-row{display:flex;align-items:center;gap:10px;margin-top:4px;font-size:10px;color:#94a3b8;font-family:'JetBrains Mono',monospace}
        .rl-page{color:#94a3b8}
        .rl-conf{display:flex;align-items:center;gap:4px}
        .rl-conf-bar{width:40px;height:3px;background:#f0f2f5;border-radius:2px;overflow:hidden;display:inline-block;vertical-align:middle}
        .rl-conf-fill{height:100%;border-radius:2px}
        /* Expanded detail */
        .rl-detail{margin-top:10px;padding-top:10px;border-top:1px solid rgb(226 232 240);animation:rlSlideDown .2s ease}
        @keyframes rlSlideDown{from{opacity:0;max-height:0}to{opacity:1;max-height:600px}}
        .rl-section{margin-bottom:12px}
        .rl-section-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#94a3b8;margin-bottom:6px;display:flex;align-items:center;gap:6px}
        .rl-section-page{font-size:9px;font-weight:600;color:#2563eb;background:rgba(37,99,235,.1);padding:1px 6px;border-radius:8px;margin-left:auto}
        .rl-source-quote{font-size:12px;line-height:1.7;color:#0f172a;padding:10px 14px;border-left:3px solid #2563eb;font-style:italic;background:rgba(37,99,235,.03);border-radius:0 8px 8px 0}
        .rl-condition-box{background:#f8fafc;border:1px solid rgba(226,232,240,.8);border-radius:8px;padding:10px 12px}
        .rl-cond-row{display:flex;align-items:center;gap:6px;font-family:'JetBrains Mono',monospace;font-size:11px;flex-wrap:wrap}
        .rl-cond-field{color:#2563eb;font-weight:700}
        .rl-cond-op{color:#ea580c;font-weight:600;padding:1px 6px;background:rgba(251,146,60,.1);border-radius:3px;font-size:10px}
        .rl-cond-val{color:#059669;font-weight:600}
        .rl-logic-type{margin-bottom:8px}
        .rl-logic-badge{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;padding:3px 10px;border-radius:4px;background:rgba(167,139,250,.12);color:#7c3aed;border:1px solid rgba(167,139,250,.25)}
        .rl-logic-desc{font-size:12px;line-height:1.6;color:#0f172a;margin-bottom:8px}
        .rl-factors{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:8px}
        .rl-factors-label{font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px}
        .rl-factor-chip{font-size:10px;padding:2px 8px;border-radius:10px;background:#f8fafc;border:1px solid rgba(226,232,240,.8);color:#64748b;font-family:'JetBrains Mono',monospace}
        .rl-outcomes{display:flex;flex-direction:column;gap:4px}
        .rl-outcome-row{display:flex;align-items:flex-start;gap:5px;font-size:11px;line-height:1.5;padding:4px 8px;background:#f8fafc;border-radius:5px}
        .rl-outcome-if{font-size:9px;font-weight:700;color:#2563eb;padding:1px 5px;border-radius:3px;background:rgba(37,99,235,.1);flex-shrink:0;margin-top:1px}
        .rl-outcome-cond{color:#0f172a;flex:1}
        .rl-outcome-then{color:#94a3b8;flex-shrink:0}
        .rl-outcome-result{color:#059669;font-weight:600;flex:1}
        .rl-ref-tables{display:flex;flex-wrap:wrap;gap:4px}
        .rl-ref-chip{font-size:10px;padding:3px 8px;border-radius:6px;background:rgba(37,99,235,.06);color:#2563eb;border:1px solid rgba(37,99,235,.15);display:inline-flex;align-items:center;gap:4px}
        .rl-ref-type{font-size:8px;font-weight:700;text-transform:uppercase;color:#94a3b8;letter-spacing:.3px}

        .btn-add{width:calc(100% - 12px);margin:8px 6px;padding:8px;border-radius:8px;border:1px dashed rgb(226 232 240);background:transparent;color:rgb(148 163 184);font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',system-ui,sans-serif;transition:all .15s;text-align:center}
        .btn-add:hover{border-color:rgb(139 92 246);color:rgb(139 92 246)}

        .add-form{margin:8px 6px;padding:14px;background:rgb(248 250 252);border-radius:10px;border:1px solid rgb(226 232 240)}
        .add-form-title{font-size:12px;font-weight:700;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center}
        .add-form-close{background:none;border:none;color:rgb(148 163 184);cursor:pointer;font-size:14px}.add-form-close:hover{color:rgb(15 23 42)}
        .add-row{display:flex;gap:6px;margin-bottom:8px}
        .add-input{flex:1;padding:6px 10px;border-radius:6px;border:1px solid rgb(226 232 240);background:rgb(248 250 252);color:rgb(15 23 42);font-size:12px;font-family:'Inter',system-ui,sans-serif;outline:none}
        .add-input:focus{border-color:rgb(37 99 235)}.add-input::placeholder{color:rgb(148 163 184)}
        .add-select{padding:6px 10px;border-radius:6px;border:1px solid rgb(226 232 240);background:rgb(248 250 252);color:rgb(15 23 42);font-size:12px;font-family:'Inter',system-ui,sans-serif;outline:none}
        .add-btn{padding:6px 16px;border-radius:8px;border:none;background:rgb(37 99 235);color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:'Inter',system-ui,sans-serif}.add-btn:disabled{opacity:.4;cursor:not-allowed}

        .tv-legend{padding:8px 16px;border-top:1px solid rgb(226 232 240);display:flex;gap:14px;font-size:10px;color:rgb(148 163 184);flex-shrink:0}
        .tv-legend-item{display:flex;align-items:center;gap:4px}
        .tv-legend-dot{width:8px;height:8px;border-radius:50%}

        /* Right panel: Document preview — Neemia pixel-perfect style */
        .tv-right{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;background:rgb(248 250 252)}
        .tv-right-bar{padding:10px 24px;border-bottom:1px solid rgb(226 232 240);background:white;display:flex;align-items:center;gap:12px;flex-shrink:0}
        .tv-right-page{font-size:13px;font-family:'JetBrains Mono',monospace;color:rgb(100 116 139)}
        .tv-right-title{font-size:14px;font-weight:700;flex:1}
        .tv-val-all{padding:5px 12px;border-radius:8px;border:1px solid rgb(16 185 129);background:transparent;color:rgb(16 185 129);font-size:11px;font-weight:600;cursor:pointer;font-family:'Inter',system-ui,sans-serif;transition:all .15s}
        .tv-val-all:hover{background:rgba(52,211,153,.08)}

        /* Page navigation bar — like Neemia */
        .tv-page-nav{display:flex;align-items:center;gap:10px;padding:8px 16px;border-bottom:1px solid rgb(226 232 240);background:white;flex-shrink:0}
        .tv-pn-scroll{display:flex;gap:4px;flex:1;overflow-x:auto;padding:2px 0}
        .tv-pn-thumb{display:flex;align-items:center;gap:4px;padding:4px 10px;border-radius:8px;border:1px solid transparent;cursor:pointer;transition:all .15s;font-size:11px;font-weight:600;color:rgb(148 163 184);white-space:nowrap}
        .tv-pn-thumb:hover{background:rgb(241 245 249);border-color:rgb(226 232 240)}
        .tv-pn-thumb.active{background:rgba(77,139,255,.08);border-color:rgb(59 130 246);color:rgb(37 99 235)}
        .tv-pn-thumb.complete .tv-pn-dot{background:rgb(16 185 129)}
        .tv-pn-thumb.partial .tv-pn-dot{background:rgb(245 158 11)}
        .tv-pn-thumb.empty .tv-pn-dot{background:rgb(239 68 68)}
        .tv-pn-dot{width:6px;height:6px;border-radius:50%}

        .tv-right-scroll{flex:1;overflow:auto;padding:24px;display:flex;justify-content:center}

        /* Document page — pixel-perfect white page like Neemia */
        .tv-page{width:560px;background:#ffffff;border-radius:4px;box-shadow:0 4px 32px rgba(0,0,0,.45);padding:44px 40px 60px;color:#1a1e28;position:relative;animation:tvPageSlide .4s ease}
        @keyframes tvPageSlide{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .tv-page-header{margin-bottom:28px;padding-bottom:16px;border-bottom:2px solid #1a1e28}
        .tv-page-header-bar{height:4px;background:linear-gradient(90deg,#4d8bff,#a78bfa,#34d399);border-radius:2px;margin-bottom:12px}
        .tv-page-doc-type{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#8892a8;margin-bottom:4px}
        .tv-page-doc-title{font-size:16px;font-weight:800;color:#1a1e28;line-height:1.3}

        /* Groups within page */
        .tv-group{margin-bottom:20px}
        .tv-group-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#5a6478;margin-bottom:10px;padding:4px 0;border-bottom:1px solid #e0e4ea}

        /* Fields within page — pixel-perfect like Neemia */
        .tv-field{margin-bottom:12px;cursor:pointer;transition:all .15s;border-radius:4px;padding:4px 6px;margin-left:-6px;margin-right:-6px}
        .tv-field:hover{background:rgba(77,139,255,.04)}
        .tv-field.active{background:rgba(77,139,255,.08);outline:2px solid rgba(77,139,255,.3);outline-offset:1px}
        .tv-field-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:#8892a8;margin-bottom:3px}
        .tv-field-line{display:flex;align-items:center;gap:6px;min-height:28px;padding:4px 0;border-bottom:1.5px solid #e0e4ea}
        .tv-field.validated .tv-field-line{border-bottom-color:#34d399}
        .tv-field.detected .tv-field-line{border-bottom-color:#fbbf24}
        .tv-field.manual-el .tv-field-line{border-bottom-color:#a78bfa;border-bottom-style:dashed}
        .tv-field-placeholder{font-size:13px;font-family:'JetBrains Mono',monospace;color:#c8cdd6;font-style:italic;flex:1}
        .tv-field-indicator{width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0}
        .tv-field-indicator.val-indicator{background:#dcfce7;color:#059669;border:1.5px solid #34d399}
        .tv-field-indicator.det-indicator{background:#fef3c7;color:#d97706;border:1.5px solid #fbbf24}
        .tv-field-indicator.man-indicator{background:#ede9fe;color:#7c3aed;border:1.5px solid #a78bfa}

        .tv-page-footer{position:absolute;bottom:16px;left:40px;right:40px;display:flex;justify-content:space-between;font-size:11px;color:#8892a8;font-family:'JetBrains Mono',monospace}
        .tv-page-footer-stats{color:#5a6478}

        .tv-left-scroll::-webkit-scrollbar,.tv-right-scroll::-webkit-scrollbar{width:5px}
        .tv-left-scroll::-webkit-scrollbar-track,.tv-right-scroll::-webkit-scrollbar-track{background:transparent}
        .tv-left-scroll::-webkit-scrollbar-thumb,.tv-right-scroll::-webkit-scrollbar-thumb{background:rgb(226 232 240);border-radius:3px}

        .tv-empty-page{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:rgb(148 163 184);font-size:14px;gap:8px}
        .tv-empty-icon{font-size:48px;opacity:.3}
      `}</style>

      <div className="tv">
        {/* Header */}
        <div className="tv-header">
          <button className="tv-back" onClick={() => router.back()}>&larr; Inapoi</button>
          <div className="tv-title">{template.documentName}</div>
          <span className="tv-file-badge">{template.fileType}</span>
          <span className={`tv-mode-badge ${genMode}`}>{genMode === "compose" ? "COMPOSE" : "FILL"}</span>
          <button
            className="tv-compose-toggle px-2.5 py-1 rounded border border-slate-200 bg-transparent text-violet-500 text-[11px] font-bold cursor-pointer font-sans"
            onClick={() => setShowComposeConfig(v => !v)}
          >
            {showComposeConfig ? "Ascunde config" : "Config generare"}
          </button>
          {mappingSummary.total > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-slate-200 bg-slate-50">
              <span className="text-[10px] font-semibold text-slate-400">Mapping:</span>
              <span className="text-[11px] font-bold font-mono" style={{ color: mappingSummary.validated === mappingSummary.mapped ? "#059669" : "#d97706" }}>
                {mappingSummary.validated}/{mappingSummary.mapped}
              </span>
              {mappingSummary.unmapped > 0 && (
                <span className="text-[10px] text-red-400">({mappingSummary.unmapped} nemapate)</span>
              )}
            </div>
          )}
          <div className="tv-progress">
            <span className="text-xs text-slate-400">{validatedEls}/{totalEls} validate</span>
            <div className="tv-pbar"><div className={`tv-pfill ${progressBg}`} style={{ width: `${pct}%` }} /></div>
            <span className={`tv-ppct ${progressColor}`}>{pct}%</span>
          </div>
        </div>

        {/* COMPOSE CONFIG PANEL */}
        {showComposeConfig && (
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs font-bold text-slate-500">Mod generare:</span>
              <div className="flex bg-slate-50 rounded-lg p-0.5 gap-px">
                <button
                  onClick={() => setGenMode("fill")}
                  className={`px-3.5 py-1 rounded-lg text-xs font-semibold border-none cursor-pointer font-sans ${genMode === "fill" ? "bg-blue-600 text-white" : "bg-transparent text-slate-400"}`}
                >
                  FILL
                </button>
                <button
                  onClick={() => setGenMode("compose")}
                  className={`px-3.5 py-1 rounded-lg text-xs font-semibold border-none cursor-pointer font-sans ${genMode === "compose" ? "bg-violet-500 text-white" : "bg-transparent text-slate-400"}`}
                >
                  COMPOSE
                </button>
              </div>
              <span className="text-[11px] text-slate-400">
                {genMode === "fill" ? "Înlocuiește {{placeholder}} cu valori — fără AI" : "AI generează conținut narativ + tabele dinamice"}
              </span>
              <div className="flex-1" />
              <button
                onClick={handleSaveComposeConfig}
                disabled={composeSaving}
                className="px-4 py-1.5 rounded border border-emerald-500 bg-emerald-500/[.08] text-emerald-500 text-xs font-bold cursor-pointer font-sans"
                style={{ opacity: composeSaving ? 0.5 : 1 }}
              >
                {composeSaving ? "Se salvează..." : "Salvează config"}
              </button>
            </div>

            {genMode === "compose" && (
              <>
                <div className="flex items-center gap-2.5 mb-2.5">
                  <span className="text-[11px] font-semibold text-slate-500">Model AI:</span>
                  <input
                    value={composeAiModel}
                    onChange={e => setComposeAiModel(e.target.value)}
                    placeholder="claude-sonnet-4-20250514 (default din org)"
                    className="flex-1 max-w-[320px] px-2.5 py-1 rounded border border-slate-200 bg-slate-50 text-slate-900 text-xs font-mono"
                  />
                  <button
                    onClick={handleDetectMarkers}
                    disabled={composeDetecting}
                    className="px-3 py-1 rounded border border-blue-500 bg-blue-600/[.06] text-blue-600 text-[11px] font-semibold cursor-pointer font-sans"
                  >
                    {composeDetecting ? "Se detectează..." : "Auto-detectează markeri"}
                  </button>
                  <button
                    onClick={handleAddComposeSection}
                    className="px-3 py-1 rounded border border-violet-500 bg-violet-500/[.06] text-violet-500 text-[11px] font-semibold cursor-pointer font-sans"
                  >
                    + Secțiune
                  </button>
                </div>

                {composeSections.length === 0 && (
                  <div className="text-xs text-slate-400 py-2.5">
                    Nicio secțiune COMPOSE definită. Adăugați markeri {"{{COMPOSE:...}}"} sau {"{{TABLE:...}}"} în template, apoi folosiți &quot;Auto-detectează&quot;.
                  </div>
                )}

                {composeSections.map((sec, si) => (
                  <div key={si} className="flex items-center gap-2 mb-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 bg-white">
                    <select
                      value={sec.type}
                      onChange={e => handleUpdateComposeSection(si, "type", e.target.value)}
                      className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-900 text-[11px] font-sans"
                    >
                      <option value="narrative">Narativ</option>
                      <option value="table">Tabel</option>
                      <option value="calculation">Calcul</option>
                    </select>
                    <input
                      value={sec.marker}
                      onChange={e => handleUpdateComposeSection(si, "marker", e.target.value)}
                      placeholder="COMPOSE:secțiune"
                      className="w-[180px] px-2 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-900 text-[11px] font-mono"
                    />
                    <input
                      value={sec.label}
                      onChange={e => handleUpdateComposeSection(si, "label", e.target.value)}
                      placeholder="Etichetă secțiune"
                      className="flex-1 px-2 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-900 text-[11px] font-sans"
                    />
                    <input
                      value={sec.instructions || ""}
                      onChange={e => handleUpdateComposeSection(si, "instructions", e.target.value)}
                      placeholder="Instrucțiuni AI (opțional)"
                      className="flex-1 px-2 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-900 text-[11px] font-sans"
                    />
                    <button
                      onClick={() => handleRemoveComposeSection(si)}
                      className="px-2 py-0.5 rounded border border-red-500 bg-transparent text-red-500 text-[11px] cursor-pointer font-sans"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        <div className="tv-body" ref={splitRef}>
          {/* LEFT: ELEMENTS CHECKLIST */}
          <div className="tv-left" style={{ width: splitWidth }}>
            <div className="tv-left-bar">
              <div className="pill-group">
                <button className={`pill ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>Toate</button>
                <button className={`pill ${filter === "nevalidat" ? "on" : ""}`} onClick={() => setFilter("nevalidat")}>Nevalidate</button>
                <button className={`pill ${filter === "validat" ? "on" : ""}`} onClick={() => setFilter("validat")}>Validate</button>
                <button className={`pill ${filter === "manual" ? "on" : ""}`} onClick={() => setFilter("manual")}>Manual</button>
              </div>
            </div>

            <div className="tv-left-scroll">
              {Object.keys(groupedByPage).sort((a, b) => Number(a) - Number(b)).map(pNum => {
                const pgNum = parseInt(pNum);
                const pageData = template.pages.find(p => p.num === pgNum);
                const pgEls = groupedByPage[pgNum];
                const pgValidated = pgEls.filter(e => e.validated).length;
                return (
                  <div key={pNum}>
                    <div className="tv-pg-header">
                      <span className="pg-num">Pag. {pNum}</span>
                      {pageData?.elements[0]?.group && <>&mdash; {pageData.elements[0].group}</>}
                      <span className="tv-pg-count">{pgValidated}/{pgEls.length}</span>
                    </div>
                    {pgEls.map(el => {
                      const isActive = selectedEl === el.id;
                      const cardClass = el.validated ? "is-validated" : !el.detected ? "is-manual" : "is-detected";
                      return (
                        <div key={el.id} className={`el-card ${cardClass} ${isActive ? "active" : ""}`} onClick={() => handleSelectElement(isActive ? null : el.id)}>
                          <div className="el-card-top">
                            <span className="el-label">{el.label}</span>
                            <span className="el-type">{el.fieldType}</span>
                          </div>
                          <div className="el-card-bottom">
                            <span className="el-key">{`{{${el.key}}}`}</span>
                            {el.lineNum != null && <span className="el-line">L.{el.lineNum}</span>}
                            <span className={`el-status ${el.validated ? "validated" : !el.detected ? "manual" : "detected"}`}>
                              {el.validated ? "Validat" : !el.detected ? "+Manual" : "Extras"}
                            </span>
                            <button className={`el-validate ${el.validated ? "on" : ""}`} onClick={(ev) => { ev.stopPropagation(); handleValidate(el.id); }}>
                              {el.validated ? "Invalidare" : "Valideaza"}
                            </button>
                          </div>
                          {/* Mapping review indicator */}
                          {(() => {
                            const mInfo = mappingData[el.key];
                            if (!mInfo) return null;
                            const conf = mInfo.confidence;
                            const confColor = !mInfo.mapped ? "#ef4444" : mInfo.mappingValidated ? "#059669" : conf && conf >= 0.9 ? "#059669" : conf && conf >= 0.7 ? "#d97706" : "#ef4444";
                            const confBg = !mInfo.mapped ? "rgba(239,68,68,.08)" : mInfo.mappingValidated ? "rgba(5,150,105,.08)" : conf && conf >= 0.9 ? "rgba(5,150,105,.06)" : conf && conf >= 0.7 ? "rgba(217,119,6,.08)" : "rgba(239,68,68,.08)";
                            return (
                              <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                {mInfo.mapped ? (
                                  <>
                                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: confBg, color: confColor, fontWeight: 600 }}>
                                      {mInfo.mappingValidated ? "\u2713" : "\u25CB"} {mInfo.elementDefName || mInfo.elementDefId?.slice(0, 8)}
                                      {conf != null && <span style={{ fontFamily: "'JetBrains Mono', monospace", marginLeft: 4, opacity: 0.8 }}>{Math.round(conf * 100)}%</span>}
                                    </span>
                                    {mInfo.mapped && !mInfo.mappingValidated && (
                                      <button
                                        onClick={(ev) => { ev.stopPropagation(); handleValidateMapping(el.key); }}
                                        style={{
                                          fontSize: 10, fontWeight: 700, padding: "1px 8px", borderRadius: 6,
                                          border: "1px solid #059669", background: "transparent", color: "#059669",
                                          cursor: "pointer", fontFamily: "'Inter', system-ui, sans-serif",
                                        }}
                                      >
                                        Confirma
                                      </button>
                                    )}
                                    {mInfo.mappingValidated && (
                                      <button
                                        onClick={(ev) => { ev.stopPropagation(); handleValidateMapping(el.key); }}
                                        style={{
                                          fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 6,
                                          border: "1px solid #cbd5e1", background: "transparent", color: "#94a3b8",
                                          cursor: "pointer", fontFamily: "'Inter', system-ui, sans-serif",
                                        }}
                                      >
                                        Anuleaza
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: confBg, color: confColor, fontWeight: 600 }}>
                                    Nemapat
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                          {/* GAP 20: Rule links — expandable detail panels */}
                          {isActive && elementRuleLinks[el.id] && elementRuleLinks[el.id].length > 0 && (
                            <div className="rl-panel">
                              <div className="rl-header">
                                <span className="rl-count">{elementRuleLinks[el.id].filter(rl => rl.rule).length} reguli asociate</span>
                              </div>
                              {elementRuleLinks[el.id].map((rl) => {
                                if (!rl.rule) return null;
                                const r = rl.rule;
                                const conf = parseFloat(r.confidence || "0");
                                const cond = r.condition || null;
                                const semTags: string[] = Array.isArray(cond?.semantic_tags) ? cond.semantic_tags : [];
                                const isExpanded = expandedRuleId === rl.ruleId;
                                const structType = cond?.type || null;
                                return (
                                  <div key={rl.ruleId} className={`rl-card ${isExpanded ? "expanded" : ""}`} onClick={(ev) => { ev.stopPropagation(); setExpandedRuleId(isExpanded ? null : rl.ruleId); }}>
                                    {/* Card header — always visible */}
                                    <div className="rl-card-top">
                                      <span className={`rl-type-badge ${r.type}`}>{r.type === "fixed" ? "FIXĂ" : "INTER."}</span>
                                      <span className="rl-cat-dot" style={{ background: ({ eligibilitate: "#2563eb", financiar: "#059669", tehnic: "#7c3aed", administrativ: "#64748b", achizitii: "#ea580c", documente: "#d97706", selectie: "#dc2626", intensitate: "#0891b2", eligibilitate_complexa: "#2563eb", documentare: "#d97706", ajutor_stat: "#7c3aed" } as Record<string,string>)[r.category] || "#94a3b8" }} />
                                      <span className="rl-cat-label">{({ eligibilitate: "Eligibilitate", financiar: "Financiar", tehnic: "Tehnic", administrativ: "Administrativ", achizitii: "Achiziții", documente: "Documente", selectie: "Selecție", intensitate: "Intensitate", eligibilitate_complexa: "Elig. complexă", documentare: "Documentare", ajutor_stat: "Ajutor stat" } as Record<string,string>)[r.category] || r.category}</span>
                                      {r.needsReview && <span className="rl-review">⚠</span>}
                                      {r.validated && <span className="rl-valid">✓</span>}
                                      {rl.role && <span className="rl-role">{rl.role}</span>}
                                      <span className="rl-expand-icon">{isExpanded ? "▾" : "▸"}</span>
                                    </div>
                                    <div className="rl-desc-short">{r.description}</div>
                                    {/* Semantic tags + structural type — always visible */}
                                    {(semTags.length > 0 || structType) && (
                                      <div className="rl-tags-row">
                                        {structType && (
                                          <span className="rl-struct-tag">{structType.replace(/_/g, " ")}</span>
                                        )}
                                        {semTags.map((tag: string) => (
                                          <span key={tag} className={`rl-sem-tag ${tag.toLowerCase()}`}>
                                            {({ THRESHOLD: "⊞", SCORING: "★", TEMPORAL: "◷", DOCUMENT_BASED: "◩", DEPENDENCY: "⇄", EXCLUSION: "⊘", EXCEPTION: "⚑", PROPORTIONAL: "%", CLASSIFICATION: "◈" } as Record<string,string>)[tag] || "●"}{" "}
                                            {({ THRESHOLD: "Prag", SCORING: "Punctaj", TEMPORAL: "Temporal", DOCUMENT_BASED: "Document", DEPENDENCY: "Dependență", EXCLUSION: "Excludere", EXCEPTION: "Excepție", PROPORTIONAL: "Proporțional", CLASSIFICATION: "Clasificare" } as Record<string,string>)[tag] || tag}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                    {/* Confidence + page — always visible */}
                                    <div className="rl-meta-row">
                                      {r.sourcePage != null && <span className="rl-page">Pag. {r.sourcePage}</span>}
                                      <span className="rl-conf">
                                        {Math.round(conf * 100)}%
                                        <span className="rl-conf-bar"><span className="rl-conf-fill" style={{ width: `${conf * 100}%`, background: conf > 0.9 ? "#34d399" : conf > 0.8 ? "#2563eb" : "#fbbf24" }} /></span>
                                      </span>
                                    </div>

                                    {/* Expanded detail — shown on click */}
                                    {isExpanded && (
                                      <div className="rl-detail" onClick={(ev) => ev.stopPropagation()}>
                                        {/* Source text from guide */}
                                        {r.sourceText && (
                                          <div className="rl-section">
                                            <div className="rl-section-title">
                                              Text original din ghid
                                              {r.sourcePage != null && <span className="rl-section-page">Pag. {r.sourcePage}</span>}
                                            </div>
                                            <div className="rl-source-quote">{r.sourceText}</div>
                                          </div>
                                        )}

                                        {/* Condition / logic */}
                                        {cond && (
                                          <div className="rl-section">
                                            <div className="rl-section-title">
                                              {r.type === "fixed" ? "Condiție verificare" : "Logică decizională"}
                                            </div>
                                            <div className="rl-condition-box">
                                              {r.type === "fixed" && cond.field && (
                                                <div className="rl-cond-row">
                                                  <span className="rl-cond-field">{cond.field}</span>
                                                  <span className="rl-cond-op">{cond.operator}</span>
                                                  <span className="rl-cond-val">
                                                    {Array.isArray(cond.value) ? cond.value.join(", ") : String(cond.value ?? "")}
                                                    {cond.value2 && ` — ${cond.value2}`}
                                                  </span>
                                                </div>
                                              )}
                                              {r.type === "interpreted" && (
                                                <>
                                                  {cond.type && (
                                                    <div className="rl-logic-type">
                                                      <span className="rl-logic-badge">{cond.type.replace(/_/g, " ")}</span>
                                                    </div>
                                                  )}
                                                  {cond.logic && (
                                                    <div className="rl-logic-desc">{cond.logic}</div>
                                                  )}
                                                  {cond.factors && cond.factors.length > 0 && (
                                                    <div className="rl-factors">
                                                      <span className="rl-factors-label">Factori:</span>
                                                      {cond.factors.map((f: string, i: number) => (
                                                        <span key={i} className="rl-factor-chip">{f}</span>
                                                      ))}
                                                    </div>
                                                  )}
                                                  {cond.outcomes && cond.outcomes.length > 0 && (
                                                    <div className="rl-outcomes">
                                                      {cond.outcomes.map((o: any, i: number) => (
                                                        <div key={i} className="rl-outcome-row">
                                                          <span className="rl-outcome-if">DACĂ</span>
                                                          <span className="rl-outcome-cond">{o.if}</span>
                                                          <span className="rl-outcome-then">→</span>
                                                          <span className="rl-outcome-result">{o.then}</span>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  )}
                                                </>
                                              )}
                                            </div>
                                          </div>
                                        )}

                                        {/* Reference tables linked to this rule */}
                                        {rl.referenceTables && rl.referenceTables.filter(rt => rt.table).length > 0 && (
                                          <div className="rl-section">
                                            <div className="rl-section-title">Tabele referință</div>
                                            <div className="rl-ref-tables">
                                              {rl.referenceTables.filter(rt => rt.table).map((rt, ri) => (
                                                <span key={ri} className="rl-ref-chip">
                                                  {rt.table!.name} <span className="rl-ref-type">{rt.table!.tableType}</span>
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {/* GAP 21: Scoring contribution */}
                          {elementScoring[el.id] && elementScoring[el.id].length > 0 && (
                            <div style={{ marginTop: 3, display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {elementScoring[el.id].map((sc, si) => (
                                <span key={si} style={{
                                  fontSize: 10, padding: "1px 6px", borderRadius: 4,
                                  background: "rgba(251,191,36,.1)", color: "#d97706",
                                  display: "inline-flex", alignItems: "center", gap: 3,
                                }}>
                                  {"\u{1F3AF}"} {sc.criterionName} (max {sc.maxPoints}pt)
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {filteredEls.length === 0 && (
                <div className="text-center p-10 text-slate-400 text-[13px]">
                  Niciun element cu filtrul selectat
                </div>
              )}

              <button className="btn-add" onClick={() => { setShowAddForm(true); }}>
                + Adauga element manual
              </button>

              {showAddForm && (
                <div className="add-form">
                  <div className="add-form-title">Adauga element<button className="add-form-close" onClick={() => setShowAddForm(false)}>&times;</button></div>
                  <div className="add-row">
                    <input className="add-input" placeholder="key (ex: nr_telefon_2)" value={newEl.key} onChange={e => setNewEl(p => ({ ...p, key: e.target.value }))} />
                  </div>
                  <div className="add-row">
                    <input className="add-input" placeholder="Label (ex: Telefon secundar)" value={newEl.label} onChange={e => setNewEl(p => ({ ...p, label: e.target.value }))} />
                  </div>
                  <div className="add-row">
                    <select className="add-select" value={newEl.type} onChange={e => setNewEl(p => ({ ...p, type: e.target.value }))}>
                      {TYPE_OPTIONS.map(t => <option key={t}>{t}</option>)}
                    </select>
                    <span className="text-[11px] text-violet-500 self-center">Pag. {currentPageNum}</span>
                  </div>
                  <button className="add-btn" disabled={!newEl.key || !newEl.label} onClick={handleAddElement}>Adauga element</button>
                </div>
              )}
            </div>

            <div className="tv-legend">
              <div className="tv-legend-item"><div className="tv-legend-dot bg-emerald-500" /> Validat</div>
              <div className="tv-legend-item"><div className="tv-legend-dot bg-amber-500" /> Extras automat</div>
              <div className="tv-legend-item"><div className="tv-legend-dot bg-violet-500" /> Adaugat manual</div>
            </div>
          </div>

          {/* DRAG HANDLE */}
          <div
            className="tv-split-handle"
            onMouseDown={() => { splitDragging.current = true; document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; }}
          >
            <div className="tv-sh-dots" />
          </div>

          {/* RIGHT: DOCUMENT PREVIEW */}
          <div className="tv-right">
            {/* Page navigation bar */}
            <div className="tv-page-nav">
              <div className="tv-pn-scroll">
                {template.pages.map((pg) => {
                  const pgPct = pg.totalElements > 0 ? Math.round(pg.validatedElements / pg.totalElements * 100) : 0;
                  const status = pgPct === 100 ? "complete" : pgPct > 0 ? "partial" : "empty";
                  return (
                    <div
                      key={pg.num}
                      className={`tv-pn-thumb ${status} ${currentPageNum === pg.num ? "active" : ""}`}
                      onClick={() => setCurrentPageNum(pg.num)}
                      title={`Pag. ${pg.num}: ${pg.validatedElements}/${pg.totalElements} validate (${pgPct}%)`}
                    >
                      <span className="tv-pn-dot" />
                      <span>Pag. {pg.num}</span>
                      <span className="font-mono text-[10px]">{pg.validatedElements}/{pg.totalElements}</span>
                    </div>
                  );
                })}
              </div>
              {currentPage && (
                <button className="tv-val-all" onClick={() => handleValidatePage(currentPageNum)}>
                  {currentPage.elements.every(e => e.validated) ? "Invalideaza pagina" : "Valideaza pagina"}
                </button>
              )}
            </div>

            <div className="tv-right-scroll">
              {currentPage && currentPage.elements.length > 0 ? (
                <div className="tv-page" key={currentPageNum}>
                  <div className="tv-page-header">
                    <div className="tv-page-header-bar" />
                    <div className="tv-page-doc-type">{template.fileType}</div>
                    <div className="tv-page-doc-title">{template.documentName}</div>
                  </div>

                  {/* Group fields by group name */}
                  {(() => {
                    const groups: Array<{ name: string | null; fields: TemplateElement[] }> = [];
                    let currentGroup: string | null = "__init__";
                    let currentFields: TemplateElement[] = [];

                    for (const f of currentPage.elements) {
                      if (f.group !== currentGroup) {
                        if (currentFields.length > 0) groups.push({ name: currentGroup === "__init__" ? null : currentGroup, fields: currentFields });
                        currentGroup = f.group;
                        currentFields = [f];
                      } else {
                        currentFields.push(f);
                      }
                    }
                    if (currentFields.length > 0) groups.push({ name: currentGroup === "__init__" ? null : currentGroup, fields: currentFields });

                    return groups.map((g, gi) => (
                      <div className="tv-group" key={gi}>
                        {g.name && <div className="tv-group-title">{g.name}</div>}
                        {g.fields.map((f) => {
                          const isActive = selectedEl === f.id;
                          const statusClass = f.validated ? "validated" : !f.detected ? "manual-el" : "detected";
                          return (
                            <div
                              className={`tv-field ${statusClass} ${isActive ? "active" : ""}`}
                              key={f.id}
                              ref={el => { elRefs.current[f.id] = el; }}
                              onClick={() => handleSelectElement(isActive ? null : f.id)}
                            >
                              <div className="tv-field-label">{f.label}</div>
                              <div className="tv-field-line">
                                <span className="tv-field-placeholder">{`{{${f.key}}}`}</span>
                                <span className={`tv-field-indicator ${f.validated ? "val-indicator" : !f.detected ? "man-indicator" : "det-indicator"}`}>
                                  {f.validated ? "\u2713" : !f.detected ? "+" : "\u25CB"}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ));
                  })()}

                  <div className="tv-page-footer">
                    <span>Pag. {currentPage.num} / {template.pages.length}</span>
                    <span className="tv-page-footer-stats">
                      {currentPage.validatedElements}/{currentPage.totalElements} validate
                    </span>
                  </div>
                </div>
              ) : (
                <div className="tv-empty-page">
                  <div className="tv-empty-icon">&#128196;</div>
                  <span>Niciun element pe aceasta pagina</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
