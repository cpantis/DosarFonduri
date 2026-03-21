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
}

interface DocumentRenderData {
  format: string;
  totalPages: number;
  pages: RenderPage[];
  templateName: string;
  templateFileType: string;
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
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  const page = renderData?.pages[activePage] || null;

  // Reset page when template changes
  useEffect(() => {
    setActivePage(0);
    setEditingField(null);
    setZoom(1);
  }, [templateDocId]);

  const handleFieldClick = useCallback((field: RenderField) => {
    if (readOnly) return;
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

  const filledCount = page.fields.filter(f => f.value).length;
  const totalCount = page.fields.length;
  const confirmedCount = page.fields.filter(f => f.confirmed).length;

  return (
    <div className="fod-container" ref={containerRef}>
      {/* Top bar: page navigation + zoom */}
      <div className="fod-topbar">
        <div className="fod-page-nav">
          {renderData.pages.map((p, i) => {
            const pFilled = p.fields.filter(f => f.value).length;
            const pTotal = p.fields.length;
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

      {/* Document view with overlay inputs */}
      <div className="fod-scroll">
        <div
          className="fod-page-wrapper"
          ref={pageRef}
          style={{
            width: page.widthPx * zoom / page.scale,
            height: page.heightPx * zoom / page.scale,
          }}
        >
          {/* Page image background */}
          <img
            className="fod-page-image"
            src={`/api/neemia/projects/${projectId}/template-render/${templateDocId}/page/${page.pageNum}`}
            alt={`Pagina ${page.pageNum}`}
            style={{
              width: "100%",
              height: "100%",
            }}
            draggable={false}
          />

          {/* Overlay inputs on top of the page image */}
          {page.fields.map((field, fi) => {
            const isEditing = editingField === field.fieldName;
            const isHovered = hoveredField === field.fieldName;
            const hasValue = !!field.value;
            const isConfirmed = field.confirmed;

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
                }}
                onMouseEnter={() => setHoveredField(field.fieldName)}
                onMouseLeave={() => setHoveredField(null)}
                onClick={() => !isEditing && handleFieldClick(field)}
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
                      <button
                        className="fod-save-btn"
                        onClick={() => handleSave(field)}
                        disabled={savingField}
                      >
                        {savingField ? "..." : "\u2713"}
                      </button>
                      <button
                        className="fod-cancel-btn"
                        onClick={() => { setEditingField(null); setEditValue(""); }}
                      >
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
                    {/* Tooltip on hover */}
                    {isHovered && !isEditing && (
                      <div className="fod-tooltip">
                        <div className="fod-tooltip-label">{field.label}</div>
                        {field.source && <div className="fod-tooltip-source">Sursă: {field.source}</div>}
                        {hasValue && !isConfirmed && onFieldConfirm && !readOnly && (
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
                        {!hasValue && <div className="fod-tooltip-empty">Click pentru a completa</div>}
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
