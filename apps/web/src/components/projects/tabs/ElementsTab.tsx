"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import type { ElementItem } from "../types";
import { SOURCE_LABELS } from "../types";

/* ── Local constants ── */

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

const pct = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0;

function mapElements(elements: any[]): ElementItem[] {
  return elements.map(el => {
    const confirmed = el.confirmed;
    const hasValue = !!el.value;
    const isConflict = el.validationStatus === "invalid" && el.validationDetails?.conflict;
    let status: "confirmat" | "propus_ai" | "gol" | "conflict" = "gol";
    if (isConflict) status = "conflict";
    else if (confirmed) status = "confirmat";
    else if (hasValue) status = "propus_ai";

    const elemDef = el.elementDefinition;
    const tmplEl = el.templateElement;
    const key = elemDef?.elementKey || tmplEl?.key || el.elementDefId || el.templateElementId || el.id;
    const label = elemDef?.displayName || tmplEl?.label || key;

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
            .join(" \u00B7 ");
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

function getSourceLabel(source: string | null | undefined): string {
  if (!source) return "";
  return SOURCE_MAP[source] || source;
}

/* ── Props ── */

interface ElementsTabProps {
  projectId: string;
  elements: ElementItem[];
  setElements: (fn: (prev: ElementItem[]) => ElementItem[]) => void;
  readOnly: boolean;
  toast: (type: any, msg: string) => void;
  onAskSolomonAbout: (key: string) => void;
}

/* ── Component ── */

export default function ElementsTab({ projectId, elements, setElements, readOnly, toast, onAskSolomonAbout }: ElementsTabProps) {
  /* ── State ── */
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
  const [elementConstraints, setElementConstraints] = useState<any[]>([]);
  const [bulkConfirming, setBulkConfirming] = useState(false);

  /* ── Fetch constraints when detail panel opens ── */
  useEffect(() => {
    if (!detailPanelId) { setElementConstraints([]); return; }
    apiGet<any[]>(`/api/reference/elements/${detailPanelId}/rule-links`)
      .then(links => setElementConstraints(links || []))
      .catch(() => setElementConstraints([]));
  }, [detailPanelId]);

  /* ── Filtered & grouped elements ── */
  const filteredElements = elements.filter(e => {
    if (elemCatFilter !== "all" && e.category !== elemCatFilter) return false;
    if (elemStatusFilter === "empty" && e.status !== "gol") return false;
    if (elemStatusFilter === "proposed" && e.status !== "propus_ai") return false;
    if (elemStatusFilter === "conflict" && e.status !== "conflict") return false;
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

  const groupedElements = useMemo(() => {
    const groups: Record<string, ElementItem[]> = {};
    for (const el of filteredElements) {
      const cat = el.category || "other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(el);
    }
    const catOrder = ["beneficiary", "financial", "farm", "investment", "location", "legal", "technical", "other"];
    const sorted: [string, ElementItem[]][] = [];
    for (const cat of catOrder) {
      if (groups[cat]) sorted.push([cat, groups[cat]]);
    }
    for (const cat of Object.keys(groups)) {
      if (!catOrder.includes(cat)) sorted.push([cat, groups[cat]]);
    }
    return sorted;
  }, [filteredElements]);

  const elemStats = useMemo(() => {
    const confirmed = elements.filter(e => e.status === "confirmat").length;
    const proposed = elements.filter(e => e.status === "propus_ai").length;
    const manual = elements.filter(e => e.source === "consultant_manual" || e.source === "manual").length;
    const empty = elements.filter(e => e.status === "gol").length;
    const conflict = elements.filter(e => e.status === "conflict").length;
    return { confirmed, proposed, manual, empty, conflict, total: elements.length };
  }, [elements]);

  const catCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of elements) {
      const cat = e.category || "other";
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [elements]);

  /* ── Handlers ── */

  const handleConfirmElementApi = async (elId: string) => {
    if (readOnly) return;
    const el = elements.find(e => e.id === elId);
    try {
      await apiPut(`/api/projects/${projectId}/elements/${elId}`, {
        value: el?.value || undefined,
        confirmed: true,
      });
      const proj = await apiGet<any>(`/api/projects/${projectId}`);
      setElements(() => mapElements(proj.elements || []));
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
      const proj = await apiGet<any>(`/api/projects/${projectId}`);
      setElements(() => mapElements(proj.elements || []));
      setEditingElementId(null);
      setEditingElementValue("");
    } catch (err) {
      console.error("Save element edit failed:", err);
      toast("error", "Eroare la salvarea elementului");
    }
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
      const proj = await apiGet<any>(`/api/projects/${projectId}`);
      setElements(() => mapElements(proj.elements || []));
      setAddingElement(false);
      setNewElementKey("");
      setNewElementLabel("");
      setNewElementValue("");
      toast("success", `Element \u201E${newElementLabel.trim()}\u201D ad\u0103ugat`);
    } catch (err: any) {
      const msg = err?.message || err?.error || "Eroare la ad\u0103ugare";
      toast("error", typeof msg === "string" ? msg : "Eroare la ad\u0103ugare");
    }
  };

  const handleExportCSV = useCallback(() => {
    const header = "Cheie,Etichet\u0103,Categorie,Valoare,Status,Surs\u0103,Obligatoriu";
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
      const proj = await apiGet<any>(`/api/projects/${projectId}`);
      setElements(() => mapElements(proj.elements || []));
    } catch (err) {
      console.error("Bulk confirm failed:", err);
    } finally {
      setBulkConfirming(false);
    }
  };

  const askSolomonAbout = (el: { key: string; label: string; value?: string | null; status: string }) => {
    onAskSolomonAbout(el.key);
  };

  /* ── Render ── */

  // Empty state, no adding
  if (elements.length === 0 && !addingElement) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 200, color: "#8892a8", padding: 24 }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>&#128202;</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Niciun element extras</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>Upload\u0103 documente client sau folose\u0219te Solomon pentru a extrage date</div>
        {!readOnly && (
          <button onClick={() => setAddingElement(true)} className="el-btn el-btn-pri" style={{ marginTop: 12 }}>+ Adaug\u0103 element manual</button>
        )}
      </div>
    );
  }

  // Empty state, adding form
  if (elements.length === 0 && addingElement) {
    return (
      <div style={{ padding: 24 }}>
        <div className="el-add-form">
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "#0f172a" }}>Element nou</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <input placeholder="Cheie (ex: nr_angajati)" value={newElementKey} onChange={e => setNewElementKey(e.target.value)} className="el-input" />
            <input placeholder="Etichet\u0103 (ex: Num\u0103r angaja\u021Bi)" value={newElementLabel} onChange={e => setNewElementLabel(e.target.value)} className="el-input" />
          </div>
          <input placeholder="Valoare (op\u021Bional)" value={newElementValue} onChange={e => setNewElementValue(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleAddElement(); if (e.key === "Escape") setAddingElement(false); }} className="el-input" style={{ width: "100%", marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={handleAddElement} className="el-btn el-btn-pri">Salveaz\u0103</button>
            <button onClick={() => { setAddingElement(false); setNewElementKey(""); setNewElementLabel(""); setNewElementValue(""); }} className="el-btn el-btn-sec">Anuleaz\u0103</button>
          </div>
        </div>
      </div>
    );
  }

  // Populated state
  return (
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
                  setElements(() => mapElements(proj.elements || []));
                } catch { toast("error", "Eroare la confirmare"); }
              }} disabled={readOnly}>
                {"\u2713"} Confirm\u0103 toate propuse ({elemStats.proposed})
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
            <span>{elemStats.empty} r\u0103mase</span>
          </div>
        </div>
      </div>

      {/* TOOLBAR: search + category pills + status filters */}
      <div className="el-toolbar">
        <div className="el-search-box">
          <span className="el-search-icon">{"\uD83D\uDD0D"}</span>
          <input type="text" placeholder="Caut\u0103 element..." value={elemSearch} onChange={e => setElemSearch(e.target.value)} />
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
            <button className="el-btn el-btn-pri el-btn-sm" onClick={() => setAddingElement(true)}>+ Adaug\u0103</button>
          </>
        )}
      </div>

      {/* ADD ELEMENT FORM */}
      {addingElement && (
        <div className="el-add-form" style={{ margin: "0 24px 0" }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "#0f172a" }}>Element nou</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <input placeholder="Cheie (ex: nr_angajati)" value={newElementKey} onChange={e => setNewElementKey(e.target.value)} className="el-input" />
            <input placeholder="Etichet\u0103 (ex: Num\u0103r angaja\u021Bi)" value={newElementLabel} onChange={e => setNewElementLabel(e.target.value)} className="el-input" />
          </div>
          <input placeholder="Valoare (op\u021Bional)" value={newElementValue} onChange={e => setNewElementValue(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleAddElement(); if (e.key === "Escape") setAddingElement(false); }} className="el-input" style={{ width: "100%", marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={handleAddElement} className="el-btn el-btn-pri">Salveaz\u0103</button>
            <button onClick={() => { setAddingElement(false); setNewElementKey(""); setNewElementLabel(""); setNewElementValue(""); }} className="el-btn el-btn-sec">Anuleaz\u0103</button>
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
                        <button className="el-btn el-btn-ghost el-btn-sm" title="\u00CEntreab\u0103 Solomon" onClick={(ev) => { ev.stopPropagation(); askSolomonAbout(el); }}>{"\uD83D\uDCAC"}</button>
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
                <div className="dp-field"><div className="dp-field-label">Cheie tehnic\u0103</div><div className="dp-field-value dp-mono">{el.key}</div></div>
                <div className="dp-field"><div className="dp-field-label">Valoare curent\u0103</div><div className="dp-field-value dp-mono">{el.value || "\u2014 necompletat \u2014"}</div></div>
                <div className="dp-field"><div className="dp-field-label">Status</div><div className="dp-field-value">
                  <span className={`el-status-badge ${el.status}`}>
                    {el.status === "confirmat" ? "Confirmat" : el.status === "propus_ai" ? "Propus AI" : el.status === "conflict" ? "Conflict" : "Gol"}
                  </span>
                </div></div>
                <div className="dp-field"><div className="dp-field-label">Surs\u0103</div><div className="dp-field-value">
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
                      {el.validationStatus === "valid" ? "Valid" : el.validationStatus === "invalid" ? "Invalid" : el.validationStatus === "warning" ? "Aten\u021Bie" : "Pending"}
                    </span>
                  </div></div>
                )}
                {el.status === "conflict" && el.validationDetails?.conflict && (
                  <div className="dp-field"><div className="dp-field-label" style={{ color: "#dc2626" }}>{"\u26A0"} Conflict</div><div className="dp-field-value" style={{ color: "#dc2626", fontSize: 14 }}>{el.validationDetails.conflict}</div></div>
                )}
                {/* Constraints from rules & reference tables */}
                {elementConstraints.length > 0 && (
                  <div className="dp-field">
                    <div className="dp-field-label">Constr\u00E2ngeri ({elementConstraints.length})</div>
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
                    <button className="el-btn el-btn-ok" onClick={() => handleConfirmElementApi(el.id)}>{"\u2713"} Confirm\u0103</button>
                    <button className="el-btn el-btn-sec" onClick={() => { setEditingElementId(el.id); setEditingElementValue(el.value || ""); }}>{"\u270E"} Editeaz\u0103</button>
                  </div>
                )}
                {editingElementId === el.id && (
                  <div style={{ marginTop: 16 }}>
                    <input className="el-edit-input" value={editingElementValue} onChange={e => setEditingElementValue(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleSaveElementEdit(el.id); if (e.key === "Escape") { setEditingElementId(null); setEditingElementValue(""); } }}
                      autoFocus style={{ width: "100%" }} />
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button className="el-btn el-btn-pri" onClick={() => handleSaveElementEdit(el.id)}>{"\u2713"} Salveaz\u0103</button>
                      <button className="el-btn el-btn-sec" onClick={() => { setEditingElementId(null); setEditingElementValue(""); }}>{"\u2715"} Anuleaz\u0103</button>
                    </div>
                  </div>
                )}
                {/* Ask Solomon */}
                <div style={{ marginTop: 12 }}>
                  <button className="el-btn el-btn-sec" onClick={() => { setDetailPanelId(null); askSolomonAbout(el); }}>{"\uD83D\uDCAC"} \u00CEntreab\u0103 Solomon</button>
                </div>
                {/* History */}
                <div className="dp-history">
                  <div className="dp-history-title">Istoric modific\u0103ri</div>
                  {detailHistory.length > 0 ? detailHistory.map((h: any, hi: number) => (
                    <div className="dp-history-item" key={hi}>
                      <span className="dp-history-time">{h.changedAt ? new Date(h.changedAt).toLocaleString("ro-RO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}</span>
                      <span>
                        {h.oldValue && h.newValue ? `${h.oldValue.slice(0, 40)} \u2192 ${h.newValue.slice(0, 40)}` : h.newValue ? `Setat: "${h.newValue.slice(0, 60)}"` : "Modificare"}
                        {h.changeSource && <em> \u2014 {getSourceLabel(h.changeSource)}</em>}
                      </span>
                    </div>
                  )) : (
                    <div style={{ fontSize: 13, color: "#94a3b8" }}>Nicio modificare \u00EEnregistrat\u0103</div>
                  )}
                </div>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
