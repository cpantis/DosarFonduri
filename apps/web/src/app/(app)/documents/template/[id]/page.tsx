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
