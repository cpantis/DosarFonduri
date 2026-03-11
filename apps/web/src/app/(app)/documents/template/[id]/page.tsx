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
  const progressColor = pct >= 80 ? "var(--accent-green)" : pct >= 40 ? "var(--accent-yellow)" : "var(--accent-red)";

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", fontSize: 14 }}>
        Se incarca template-ul...
      </div>
    );
  }

  if (error || !template) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--accent-red)", fontSize: 14, flexDirection: "column", gap: 12 }}>
        <span>{error || "Template negasit"}</span>
        <button onClick={() => router.back()} style={{ padding: "6px 16px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 13 }}>Inapoi</button>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .tv{display:flex;flex-direction:column;height:100%}
        .tv-header{padding:12px 24px;border-bottom:1px solid var(--border);background:var(--bg-surface);display:flex;align-items:center;gap:16px;flex-shrink:0}
        .tv-back{background:none;border:1px solid var(--border);border-radius:var(--r-sm);padding:6px 12px;color:var(--text-secondary);font-size:13px;font-weight:600;cursor:pointer;font-family:var(--font-sans);display:flex;align-items:center;gap:4px;transition:all .15s}
        .tv-back:hover{border-color:var(--border-active);color:var(--text-primary)}
        .tv-title{font-size:16px;font-weight:800;flex:1}
        .tv-file-badge{font-size:10px;font-weight:700;text-transform:uppercase;padding:3px 8px;border-radius:4px;background:rgba(77,139,255,.1);color:var(--accent-blue);letter-spacing:.5px}
        .tv-mode-badge{font-size:9px;font-weight:700;padding:2px 8px;border-radius:3px;text-transform:uppercase;letter-spacing:.5px}
        .tv-mode-badge.fill{background:rgba(77,139,255,.12);color:var(--accent-blue)}
        .tv-mode-badge.compose{background:rgba(167,139,250,.15);color:var(--accent-purple)}
        .tv-progress{display:flex;align-items:center;gap:10px}
        .tv-pbar{width:100px;height:6px;background:var(--bg-deep);border-radius:3px;overflow:hidden}
        .tv-pfill{height:100%;border-radius:3px;transition:width .3s}
        .tv-ppct{font-size:13px;font-weight:700;font-family:var(--font-mono)}
        .tv-body{flex:1;display:flex;overflow:hidden}

        /* Split handle */
        .tv-split-handle{width:6px;cursor:col-resize;background:var(--bg-surface);display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s;position:relative;z-index:2}
        .tv-split-handle:hover,.tv-split-handle:active{background:var(--border-active)}
        .tv-sh-dots{width:2px;height:32px;background:var(--text-muted);border-radius:1px;opacity:.4;transition:opacity .15s}
        .tv-split-handle:hover .tv-sh-dots{opacity:.8}

        /* Left panel: elements checklist */
        .tv-left{min-width:280px;max-width:640px;border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;background:var(--bg-surface);flex-shrink:0}
        .tv-left-bar{padding:10px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;flex-shrink:0}
        .pill-group{display:flex;background:var(--bg-deep);border-radius:var(--r-md);padding:2px;gap:1px}
        .pill{padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;border:none;cursor:pointer;background:transparent;color:var(--text-muted);font-family:var(--font-sans);transition:all .15s}
        .pill:hover{color:var(--text-secondary)}.pill.on{background:var(--accent-blue);color:#fff}
        .tv-left-scroll{flex:1;overflow-y:auto;padding:8px 12px}

        .tv-pg-header{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);padding:12px 6px 6px;display:flex;align-items:center;gap:6px}
        .tv-pg-header .pg-num{color:var(--accent-blue)}
        .tv-pg-count{margin-left:auto;font-family:var(--font-mono);color:var(--text-muted);font-size:10px}

        /* Element cards — Neemia-aligned */
        .el-card{padding:10px 12px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--bg-elevated);cursor:pointer;transition:all .12s;margin-bottom:4px}
        .el-card:hover{border-color:var(--border-active)}
        .el-card.active{background:rgba(77,139,255,.06);border-color:var(--accent-blue)}
        .el-card.is-validated{border-left:3px solid var(--accent-green)}
        .el-card.is-detected{border-left:3px solid var(--accent-yellow)}
        .el-card.is-manual{border-left:3px solid var(--accent-purple)}
        .el-card-top{display:flex;align-items:center;gap:8px;margin-bottom:4px}
        .el-label{font-size:12px;font-weight:600;color:var(--text-primary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .el-type{font-size:10px;font-family:var(--font-mono);color:var(--text-muted);padding:1px 6px;background:var(--bg-deep);border-radius:4px;flex-shrink:0}
        .el-card-bottom{display:flex;align-items:center;gap:8px}
        .el-key{font-size:11px;font-family:var(--font-mono);color:var(--text-secondary)}
        .el-line{font-size:10px;color:var(--text-muted)}
        .el-validate{flex-shrink:0;padding:3px 10px;border-radius:4px;border:1px solid var(--border);background:transparent;font-size:10px;font-weight:700;cursor:pointer;font-family:var(--font-sans);transition:all .12s;color:var(--text-muted);margin-left:auto}
        .el-validate:hover{border-color:var(--accent-green);color:var(--accent-green)}
        .el-validate.on{background:rgba(52,211,153,.1);border-color:var(--accent-green);color:var(--accent-green)}
        .el-status{font-size:10px;font-weight:700;flex-shrink:0}
        .el-status.validated{color:var(--accent-green)}
        .el-status.detected{color:var(--accent-yellow)}
        .el-status.manual{color:var(--accent-purple)}

        .btn-add{width:calc(100% - 12px);margin:8px 6px;padding:8px;border-radius:var(--r-sm);border:1px dashed var(--border);background:transparent;color:var(--text-muted);font-size:12px;font-weight:600;cursor:pointer;font-family:var(--font-sans);transition:all .15s;text-align:center}
        .btn-add:hover{border-color:var(--accent-purple);color:var(--accent-purple)}

        .add-form{margin:8px 6px;padding:14px;background:var(--bg-elevated);border-radius:var(--r-md);border:1px solid var(--border)}
        .add-form-title{font-size:12px;font-weight:700;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center}
        .add-form-close{background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:14px}.add-form-close:hover{color:var(--text-primary)}
        .add-row{display:flex;gap:6px;margin-bottom:8px}
        .add-input{flex:1;padding:6px 10px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--bg-deep);color:var(--text-primary);font-size:12px;font-family:var(--font-sans);outline:none}
        .add-input:focus{border-color:var(--accent-blue)}.add-input::placeholder{color:var(--text-muted)}
        .add-select{padding:6px 10px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--bg-deep);color:var(--text-primary);font-size:12px;font-family:var(--font-sans);outline:none}
        .add-btn{padding:6px 16px;border-radius:var(--r-sm);border:none;background:var(--accent-blue);color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font-sans)}.add-btn:disabled{opacity:.4;cursor:not-allowed}

        .tv-legend{padding:8px 16px;border-top:1px solid var(--border);display:flex;gap:14px;font-size:10px;color:var(--text-muted);flex-shrink:0}
        .tv-legend-item{display:flex;align-items:center;gap:4px}
        .tv-legend-dot{width:8px;height:8px;border-radius:50%}

        /* Right panel: Document preview — Neemia pixel-perfect style */
        .tv-right{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;background:var(--bg-deep)}
        .tv-right-bar{padding:10px 24px;border-bottom:1px solid var(--border);background:var(--bg-surface);display:flex;align-items:center;gap:12px;flex-shrink:0}
        .tv-right-page{font-size:13px;font-family:var(--font-mono);color:var(--text-secondary)}
        .tv-right-title{font-size:14px;font-weight:700;flex:1}
        .tv-val-all{padding:5px 12px;border-radius:var(--r-sm);border:1px solid var(--accent-green);background:transparent;color:var(--accent-green);font-size:11px;font-weight:600;cursor:pointer;font-family:var(--font-sans);transition:all .15s}
        .tv-val-all:hover{background:rgba(52,211,153,.08)}

        /* Page navigation bar — like Neemia */
        .tv-page-nav{display:flex;align-items:center;gap:10px;padding:8px 16px;border-bottom:1px solid var(--border);background:var(--bg-surface);flex-shrink:0}
        .tv-pn-scroll{display:flex;gap:4px;flex:1;overflow-x:auto;padding:2px 0}
        .tv-pn-thumb{display:flex;align-items:center;gap:4px;padding:4px 10px;border-radius:var(--r-sm);border:1px solid transparent;cursor:pointer;transition:all .15s;font-size:11px;font-weight:600;color:var(--text-muted);white-space:nowrap}
        .tv-pn-thumb:hover{background:var(--bg-hover);border-color:var(--border)}
        .tv-pn-thumb.active{background:rgba(77,139,255,.08);border-color:var(--accent-blue);color:var(--accent-blue)}
        .tv-pn-thumb.complete .tv-pn-dot{background:var(--accent-green)}
        .tv-pn-thumb.partial .tv-pn-dot{background:var(--accent-yellow)}
        .tv-pn-thumb.empty .tv-pn-dot{background:var(--accent-red)}
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
        .tv-left-scroll::-webkit-scrollbar-thumb,.tv-right-scroll::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}

        .tv-empty-page{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:14px;gap:8px}
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
            className="tv-compose-toggle"
            onClick={() => setShowComposeConfig(v => !v)}
            style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid var(--border)", background: "transparent", color: "var(--accent-purple)", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-sans)" }}
          >
            {showComposeConfig ? "Ascunde config" : "Config generare"}
          </button>
          <div className="tv-progress">
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{validatedEls}/{totalEls} validate</span>
            <div className="tv-pbar"><div className="tv-pfill" style={{ width: `${pct}%`, background: progressColor }} /></div>
            <span className="tv-ppct" style={{ color: progressColor }}>{pct}%</span>
          </div>
        </div>

        {/* COMPOSE CONFIG PANEL */}
        {showComposeConfig && (
          <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>Mod generare:</span>
              <div style={{ display: "flex", background: "var(--bg-deep)", borderRadius: 8, padding: 2, gap: 1 }}>
                <button
                  onClick={() => setGenMode("fill")}
                  style={{ padding: "4px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "var(--font-sans)", background: genMode === "fill" ? "var(--accent-blue)" : "transparent", color: genMode === "fill" ? "#fff" : "var(--text-muted)" }}
                >
                  FILL
                </button>
                <button
                  onClick={() => setGenMode("compose")}
                  style={{ padding: "4px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "var(--font-sans)", background: genMode === "compose" ? "var(--accent-purple)" : "transparent", color: genMode === "compose" ? "#fff" : "var(--text-muted)" }}
                >
                  COMPOSE
                </button>
              </div>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {genMode === "fill" ? "Înlocuiește {{placeholder}} cu valori — fără AI" : "AI generează conținut narativ + tabele dinamice"}
              </span>
              <div style={{ flex: 1 }} />
              <button
                onClick={handleSaveComposeConfig}
                disabled={composeSaving}
                style={{ padding: "5px 16px", borderRadius: 4, border: "1px solid var(--accent-green)", background: "rgba(52,211,153,.08)", color: "var(--accent-green)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-sans)", opacity: composeSaving ? 0.5 : 1 }}
              >
                {composeSaving ? "Se salvează..." : "Salvează config"}
              </button>
            </div>

            {genMode === "compose" && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>Model AI:</span>
                  <input
                    value={composeAiModel}
                    onChange={e => setComposeAiModel(e.target.value)}
                    placeholder="claude-sonnet-4-20250514 (default din org)"
                    style={{ flex: 1, maxWidth: 320, padding: "4px 10px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg-deep)", color: "var(--text-primary)", fontSize: 12, fontFamily: "var(--font-mono)" }}
                  />
                  <button
                    onClick={handleDetectMarkers}
                    disabled={composeDetecting}
                    style={{ padding: "4px 12px", borderRadius: 4, border: "1px solid var(--accent-blue)", background: "rgba(77,139,255,.06)", color: "var(--accent-blue)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)" }}
                  >
                    {composeDetecting ? "Se detectează..." : "Auto-detectează markeri"}
                  </button>
                  <button
                    onClick={handleAddComposeSection}
                    style={{ padding: "4px 12px", borderRadius: 4, border: "1px solid var(--accent-purple)", background: "rgba(167,139,250,.06)", color: "var(--accent-purple)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)" }}
                  >
                    + Secțiune
                  </button>
                </div>

                {composeSections.length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "10px 0" }}>
                    Nicio secțiune COMPOSE definită. Adăugați markeri {"{{COMPOSE:...}}"} sau {"{{TABLE:...}}"} în template, apoi folosiți &quot;Auto-detectează&quot;.
                  </div>
                )}

                {composeSections.map((sec, si) => (
                  <div key={si} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
                    <select
                      value={sec.type}
                      onChange={e => handleUpdateComposeSection(si, "type", e.target.value)}
                      style={{ padding: "3px 6px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg-deep)", color: "var(--text-primary)", fontSize: 11, fontFamily: "var(--font-sans)" }}
                    >
                      <option value="narrative">Narativ</option>
                      <option value="table">Tabel</option>
                      <option value="calculation">Calcul</option>
                    </select>
                    <input
                      value={sec.marker}
                      onChange={e => handleUpdateComposeSection(si, "marker", e.target.value)}
                      placeholder="COMPOSE:secțiune"
                      style={{ width: 180, padding: "3px 8px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg-deep)", color: "var(--text-primary)", fontSize: 11, fontFamily: "var(--font-mono)" }}
                    />
                    <input
                      value={sec.label}
                      onChange={e => handleUpdateComposeSection(si, "label", e.target.value)}
                      placeholder="Etichetă secțiune"
                      style={{ flex: 1, padding: "3px 8px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg-deep)", color: "var(--text-primary)", fontSize: 11, fontFamily: "var(--font-sans)" }}
                    />
                    <input
                      value={sec.instructions || ""}
                      onChange={e => handleUpdateComposeSection(si, "instructions", e.target.value)}
                      placeholder="Instrucțiuni AI (opțional)"
                      style={{ flex: 1, padding: "3px 8px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg-deep)", color: "var(--text-primary)", fontSize: 11, fontFamily: "var(--font-sans)" }}
                    />
                    <button
                      onClick={() => handleRemoveComposeSection(si)}
                      style={{ padding: "2px 8px", borderRadius: 4, border: "1px solid var(--accent-red)", background: "transparent", color: "var(--accent-red)", fontSize: 11, cursor: "pointer", fontFamily: "var(--font-sans)" }}
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
                <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 13 }}>
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
                    <span style={{ fontSize: 11, color: "var(--accent-purple)", alignSelf: "center" }}>Pag. {currentPageNum}</span>
                  </div>
                  <button className="add-btn" disabled={!newEl.key || !newEl.label} onClick={handleAddElement}>Adauga element</button>
                </div>
              )}
            </div>

            <div className="tv-legend">
              <div className="tv-legend-item"><div className="tv-legend-dot" style={{ background: "var(--accent-green)" }} /> Validat</div>
              <div className="tv-legend-item"><div className="tv-legend-dot" style={{ background: "var(--accent-yellow)" }} /> Extras automat</div>
              <div className="tv-legend-item"><div className="tv-legend-dot" style={{ background: "var(--accent-purple)" }} /> Adaugat manual</div>
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
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>{pg.validatedElements}/{pg.totalElements}</span>
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
