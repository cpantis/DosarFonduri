"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";

// ─── Types ──────────────────────────────────────────────────

interface FieldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RenderField {
  fieldName: string;
  fieldType: string;
  currentValue: string;
  rect: FieldRect;
  label: string;
  value: string | null;
  source: string | null;
  confirmed: boolean;
  templateElementId: string | null;
  fontSize?: number;
  // Reconciliation
  matchQuality?: string;    // "exact" | "normalized" | "fuzzy" | "unmatched" | "db_only"
  matchConfidence?: number;
  detectedKey?: string;
  willFill?: boolean;        // true = Neemia will fill this field
  positionSource?: string;
  isFallbackRender?: boolean;
}

interface UnmatchedField {
  key: string;
  label: string;
  fieldType: string;
  value: string | null;
  source: string | null;
  confirmed: boolean;
  templateElementId: string | null;
  willFill: boolean;
}

interface ReconciliationStats {
  totalTemplateFields: number;
  positionedExact: number;
  positionedFuzzy: number;
  positionedUnmatched: number;
  notPositioned: number;
  coveragePercent: number;
}

interface RenderPage {
  pageNum: number;
  imageName: string;
  widthPt: number;
  heightPt: number;
  widthPx: number;
  heightPx: number;
  scale: number;
  fields: RenderField[];
  sheetName?: string;
  isFallbackRender?: boolean;
}

interface DocumentRenderData {
  format: string;
  totalPages: number;
  pages: RenderPage[];
  templateName: string;
  templateFileType: string;
  unmatchedKnownKeys?: UnmatchedField[];
  reconciliation?: ReconciliationStats;
}

interface FormOnDocumentProps {
  renderData: DocumentRenderData | null;
  loading: boolean;
  error: string | null;
  projectId: string;
  templateDocId: string;
  readOnly?: boolean;
  onFieldSave: (fieldName: string, value: string, templateElementId: string | null) => Promise<void>;
  onFieldConfirm?: (fieldName: string, templateElementId: string | null) => Promise<void>;
}

// ─── Component ──────────────────────────────────────────────

export default function FormOnDocument({
  renderData,
  loading,
  error,
  projectId,
  templateDocId,
  readOnly = false,
  onFieldSave,
  onFieldConfirm,
}: FormOnDocumentProps) {
  const [activePage, setActivePage] = useState(0);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingField, setSavingField] = useState(false);
  const [hoveredField, setHoveredField] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [showUnmatched, setShowUnmatched] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const page = renderData?.pages[activePage] || null;
  const reconciliation = renderData?.reconciliation;
  const unmatchedKeys = renderData?.unmatchedKnownKeys || [];

  useEffect(() => {
    setActivePage(0);
    setEditingField(null);
    setZoom(1);
    setShowUnmatched(false);
  }, [templateDocId]);

  const handleFieldClick = useCallback((field: RenderField) => {
    if (readOnly) return;
    if (field.matchQuality === "unmatched" && !field.willFill) return; // Can't edit unmatched fields
    setEditingField(field.fieldName);
    setEditValue(field.value || "");
  }, [readOnly]);

  const handleSave = useCallback(async (field: RenderField) => {
    if (savingField) return;
    setSavingField(true);
    try {
      await onFieldSave(field.fieldName, editValue, field.templateElementId);
      setEditingField(null);
      setEditValue("");
    } finally {
      setSavingField(false);
    }
  }, [editValue, onFieldSave, savingField]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, field: RenderField) => {
    if (e.key === "Enter" && field.fieldType !== "textarea") {
      e.preventDefault();
      handleSave(field);
    }
    if (e.key === "Escape") {
      setEditingField(null);
      setEditValue("");
    }
  }, [handleSave]);

  if (loading) {
    return (
      <div className="fod-loading">
        <div className="fod-spinner" />
        <div className="fod-loading-text">Se renderizează documentul...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fod-error">
        <div className="fod-error-icon">&#9888;</div>
        <div className="fod-error-text">{error}</div>
      </div>
    );
  }

  if (!renderData || !page) {
    return (
      <div className="fod-empty">
        <div style={{ fontSize: 28, marginBottom: 8 }}>&#128196;</div>
        <div>Selectează un template pentru vizualizare</div>
      </div>
    );
  }

  const positionedFields = page.fields.filter(f => f.willFill);
  const filledCount = positionedFields.filter(f => f.value).length;
  const totalCount = positionedFields.length;
  const confirmedCount = positionedFields.filter(f => f.confirmed).length;
  const fuzzyFields = page.fields.filter(f => f.matchQuality === "fuzzy");
  const unmatchedOnPage = page.fields.filter(f => f.matchQuality === "unmatched");

  // Match quality color indicator
  const matchColor = (quality: string | undefined) => {
    switch (quality) {
      case "exact": return "transparent";
      case "normalized": return "transparent";
      case "fuzzy": return "rgba(251,191,36,.15)";
      case "unmatched": return "rgba(248,113,113,.12)";
      default: return "transparent";
    }
  };

  const matchBorder = (quality: string | undefined, isHovered: boolean) => {
    switch (quality) {
      case "fuzzy": return isHovered ? "2px solid #d97706" : "1.5px dashed #d97706";
      case "unmatched": return isHovered ? "2px solid #dc2626" : "1.5px dashed #dc2626";
      default: return undefined; // use CSS class default
    }
  };

  return (
    <div className="fod-container" ref={containerRef}>
      {/* Top bar */}
      <div className="fod-topbar">
        <div className="fod-page-nav">
          {renderData.pages.map((p, i) => {
            const pFilled = p.fields.filter(f => f.willFill && f.value).length;
            const pTotal = p.fields.filter(f => f.willFill).length;
            const status = pTotal === 0 ? "empty" : pFilled === pTotal ? "complete" : pFilled > 0 ? "partial" : "empty";
            return (
              <button
                key={i}
                className={`fod-page-btn ${activePage === i ? "active" : ""} ${status}`}
                onClick={() => { setActivePage(i); setEditingField(null); }}
                title={p.sheetName || `Pagina ${p.pageNum}`}
              >
                {p.sheetName || p.pageNum}
              </button>
            );
          })}
        </div>
        <div className="fod-stats">
          <span className="fod-stat confirmed">{confirmedCount} confirmate</span>
          <span className="fod-stat filled">{filledCount - confirmedCount} propuse</span>
          <span className="fod-stat empty">{totalCount - filledCount} goale</span>
        </div>
        <div className="fod-zoom">
          <button className="fod-zoom-btn" onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} title="Zoom out">-</button>
          <span className="fod-zoom-label">{Math.round(zoom * 100)}%</span>
          <button className="fod-zoom-btn" onClick={() => setZoom(z => Math.min(2, z + 0.1))} title="Zoom in">+</button>
          <button className="fod-zoom-btn" onClick={() => setZoom(1)} title="Reset zoom">&#8634;</button>
        </div>
      </div>

      {/* Reconciliation quality banner */}
      {reconciliation && reconciliation.coveragePercent < 100 && (
        <div className="fod-reconciliation-banner">
          <div className="fod-recon-stats">
            <span className="fod-recon-coverage" style={{
              color: reconciliation.coveragePercent >= 80 ? "#059669" : reconciliation.coveragePercent >= 50 ? "#d97706" : "#dc2626"
            }}>
              {reconciliation.coveragePercent}% câmpuri poziționate pe document
            </span>
            {reconciliation.positionedFuzzy > 0 && (
              <span className="fod-recon-fuzzy">{reconciliation.positionedFuzzy} potriviri aproximative</span>
            )}
            {reconciliation.notPositioned > 0 && (
              <span className="fod-recon-missing">{reconciliation.notPositioned} fără poziție</span>
            )}
          </div>
          {unmatchedKeys.length > 0 && (
            <button
              className="fod-recon-toggle"
              onClick={() => setShowUnmatched(!showUnmatched)}
            >
              {showUnmatched ? "Ascunde" : "Arată"} câmpuri fără poziție ({unmatchedKeys.length})
            </button>
          )}
        </div>
      )}

      {/* Fuzzy match warning */}
      {fuzzyFields.length > 0 && (
        <div className="fod-fuzzy-banner">
          <span style={{ fontSize: 12 }}>&#9888;</span>
          <span>{fuzzyFields.length} câmpuri au potrivire aproximativă (evidențiate portocaliu). Verifică poziționarea.</span>
        </div>
      )}

      {/* Unmatched fields sidebar */}
      {showUnmatched && unmatchedKeys.length > 0 && (
        <div className="fod-unmatched-panel">
          <div className="fod-unmatched-header">
            Câmpuri fără poziție pe document ({unmatchedKeys.length})
            <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 400 }}>
              Aceste câmpuri există în template dar nu au fost găsite vizual
            </span>
          </div>
          {unmatchedKeys.map((uk, i) => (
            <div key={i} className={`fod-unmatched-item ${uk.value ? "has-value" : ""}`}>
              <div className="fod-unmatched-label">{uk.label || uk.key}</div>
              <div className="fod-unmatched-value">
                {uk.value || <span style={{ color: "#94a3b8", fontStyle: "italic" }}>Necompletat</span>}
              </div>
              {uk.source && <div className="fod-unmatched-source">{uk.source}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Document view with overlay inputs */}
      <div className="fod-scroll">
        <div
          className="fod-page-wrapper"
          style={{
            width: page.widthPx * zoom / page.scale,
            height: page.heightPx * zoom / page.scale,
          }}
        >
          {/* Fallback render warning */}
          {page.isFallbackRender && (
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0, padding: "4px 8px",
              background: "rgba(251,191,36,.1)", borderBottom: "1px solid rgba(251,191,36,.3)",
              fontSize: 10, color: "#92400e", zIndex: 5, textAlign: "center",
            }}>
              Previzualizare aproximativă (LibreOffice indisponibil). Pozițiile pot fi imprecise.
            </div>
          )}

          {/* Page image background */}
          <img
            className="fod-page-image"
            src={`/api/neemia/projects/${projectId}/template-render/${templateDocId}/page/${page.pageNum}`}
            alt={`Pagina ${page.pageNum}`}
            style={{ width: "100%", height: "100%" }}
            draggable={false}
          />

          {/* Overlay inputs */}
          {page.fields.map((field, fi) => {
            const isEditing = editingField === field.fieldName;
            const isHovered = hoveredField === field.fieldName;
            const hasValue = !!field.value;
            const isConfirmed = field.confirmed;
            const isUnmatched = field.matchQuality === "unmatched";
            const isFuzzy = field.matchQuality === "fuzzy";
            const canEdit = field.willFill && !readOnly;

            const customBorder = matchBorder(field.matchQuality, isHovered);

            return (
              <div
                key={fi}
                className={`fod-field ${isEditing ? "editing" : ""} ${hasValue ? (isConfirmed ? "confirmed" : "filled") : "empty"} ${isHovered ? "hovered" : ""}`}
                style={{
                  position: "absolute",
                  left: `${field.rect.x}%`,
                  top: `${field.rect.y}%`,
                  width: `${field.rect.width}%`,
                  height: `${field.rect.height}%`,
                  minHeight: 18 * zoom,
                  ...(customBorder ? { border: customBorder, background: matchColor(field.matchQuality) } : {}),
                  ...(isUnmatched ? { cursor: "not-allowed", opacity: 0.7 } : {}),
                }}
                onMouseEnter={() => setHoveredField(field.fieldName)}
                onMouseLeave={() => setHoveredField(null)}
                onClick={() => !isEditing && canEdit && handleFieldClick(field)}
              >
                {isEditing ? (
                  <div className="fod-field-editor" onClick={e => e.stopPropagation()}>
                    {field.fieldType === "textarea" ? (
                      <textarea
                        className="fod-input"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        autoFocus
                        rows={3}
                        onKeyDown={e => {
                          if (e.key === "Escape") { setEditingField(null); setEditValue(""); }
                        }}
                        style={{ fontSize: field.fontSize ? field.fontSize * zoom * 0.8 : undefined }}
                      />
                    ) : (
                      <input
                        className="fod-input"
                        type={field.fieldType === "number" ? "number" : "text"}
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        autoFocus
                        onKeyDown={e => handleKeyDown(e, field)}
                        style={{ fontSize: field.fontSize ? field.fontSize * zoom * 0.8 : undefined }}
                      />
                    )}
                    <div className="fod-field-actions">
                      <button className="fod-save-btn" onClick={() => handleSave(field)} disabled={savingField}>
                        {savingField ? "..." : "\u2713"}
                      </button>
                      <button className="fod-cancel-btn" onClick={() => { setEditingField(null); setEditValue(""); }}>
                        \u2715
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {hasValue && (
                      <span
                        className="fod-field-value"
                        style={{ fontSize: field.fontSize ? field.fontSize * zoom * 0.75 : undefined }}
                      >
                        {field.value}
                      </span>
                    )}

                    {/* Tooltip */}
                    {isHovered && !isEditing && (
                      <div className="fod-tooltip">
                        <div className="fod-tooltip-label">{field.label}</div>
                        {field.source && <div className="fod-tooltip-source">Sursă: {field.source}</div>}
                        {/* Reconciliation info */}
                        {isFuzzy && (
                          <div style={{ color: "#d97706", fontSize: 10, marginTop: 2 }}>
                            Potrivire aproximativă ({Math.round((field.matchConfidence || 0) * 100)}%)
                            {field.detectedKey && field.detectedKey !== field.fieldName && (
                              <div>Detectat ca: {field.detectedKey}</div>
                            )}
                          </div>
                        )}
                        {isUnmatched && (
                          <div style={{ color: "#dc2626", fontSize: 10, marginTop: 2 }}>
                            Câmp detectat vizual dar fără corespondent în template.
                            Nu va fi completat de Neemia.
                          </div>
                        )}
                        {field.willFill && !isUnmatched && (
                          <div style={{ color: "#059669", fontSize: 10, marginTop: 2 }}>
                            {"\u2713"} Va fi completat de Neemia
                          </div>
                        )}
                        {hasValue && !isConfirmed && onFieldConfirm && canEdit && (
                          <button
                            className="fod-tooltip-confirm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onFieldConfirm(field.fieldName, field.templateElementId);
                            }}
                          >
                            Confirmă valoarea
                          </button>
                        )}
                        {isConfirmed && <div className="fod-tooltip-confirmed">{"\u2713"} Confirmat</div>}
                        {!hasValue && canEdit && <div className="fod-tooltip-empty">Click pentru a completa</div>}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
