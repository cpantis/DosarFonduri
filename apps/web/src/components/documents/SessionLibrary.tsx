"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { Tabs } from "@/components/ui/Tabs";
import { RuleCard, RuleCardList, RuleCardData, CATEGORY_COLORS as RC_COLORS, CATEGORY_LABELS as RC_LABELS } from "@/components/shared/RuleCard";

/* ══════════════════════════════════════════
   TYPES (matching GET /api/documents/session/:folderId/library)
   ══════════════════════════════════════════ */

interface SourceDoc {
  name: string;
  fileType: string;
}

interface LibRule {
  id: string;
  type: "fixed" | "interpreted";
  ruleKey: string | null;
  category: string | null;
  description: string;
  condition: any;
  sourcePage: number | null;
  sourceText: string | null;
  confidence: string | null;
  needsReview: boolean;
  validated: boolean;
  sourceDocument: SourceDoc | null;
}

interface LibScoring {
  id: string;
  code: string;
  name: string;
  description: string | null;
  maxPoints: string;
  evaluationLogic: {
    type: "lookup" | "range" | "boolean" | "formula";
    elementKey?: string;
    referenceTableId?: string;
    lookupColumn?: string;
    ranges?: Array<{ min?: number; max?: number; points: number }>;
    formula?: string;
  } | null;
  category: string | null;
  sortOrder: number | null;
  sourceDocument: SourceDoc | null;
}

interface LibElement {
  id: string;
  elementKey: string;
  displayName: string;
  category: string;
  dataType: string;
  unit: string | null;
  required: boolean;
  minCount: number;
  maxCount: number | null;
  helpText: string | null;
  mappingCount: number;
  mappedTemplates: string[];
  sourceDocument: SourceDoc | null;
}

interface LibTable {
  id: string;
  name: string;
  description: string | null;
  tableType: string;
  schema: Array<{ key: string; label: string; type: string }> | null;
  data: Array<Record<string, any>> | null;
  rowCount: number;
  columnCount: number;
  sourcePage: number | null;
  validated: boolean;
  sourceDocument: SourceDoc | null;
}

interface LibChecklist {
  id: string;
  name: string;
  category: string;
  source: string;
  sourceRuleId: string | null;
  templateId: string | null;
  templateName: string | null;
  notes: string | null;
  sortOrder: number | null;
}

interface LibraryData {
  sessionName: string;
  rules: { items: LibRule[]; total: number; fixed: number; interpreted: number; categories: Record<string, number> };
  scoring: { items: LibScoring[]; total: number };
  elements: { items: LibElement[]; total: number; mapped: number; unmapped: number };
  tables: { items: LibTable[]; total: number };
  checklist: { items: LibChecklist[]; total: number; categories: Record<string, number> };
}

/* ══════════════════════════════════════════
   COMPONENT
   ══════════════════════════════════════════ */

export function SessionLibrary({ folderId }: { folderId: string }) {
  const [data, setData] = useState<LibraryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("rules");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiGet<LibraryData>(`/api/documents/session/${folderId}/library`);
      setData(result);
    } catch (e: any) {
      setError(e.message || "Eroare la incarcarea bibliotecii");
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <LibrarySkeleton />;
  if (error) return (
    <div className="flex flex-col items-center justify-center flex-1 gap-3 p-8 text-center">
      <span style={{ fontSize: 36, opacity: 0.4 }}>{"\u26A0\uFE0F"}</span>
      <div className="text-sm font-semibold text-slate-900">{error}</div>
      <button onClick={fetchData} className="text-xs font-semibold text-blue-600 hover:text-blue-700">Reincearca</button>
    </div>
  );
  if (!data) return null;

  const tabs = [
    { key: "rules", label: "Reguli", icon: "\u{1F6E1}", count: data.rules.total },
    { key: "scoring", label: "Scoring", icon: "\u{1F3AF}", count: data.scoring.total },
    { key: "elements", label: "Elemente", icon: "\u{1F9E9}", count: data.elements.total },
    { key: "tables", label: "Tabele", icon: "\u{1F4CA}", count: data.tables.total },
    { key: "checklist", label: "Checklist", icon: "\u2705", count: data.checklist.total },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "#f8fafc" }}>
      {/* Header */}
      <div className="px-5 pt-4 pb-2 flex-shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <span style={{ fontSize: 18 }}>{"\u{1F4DA}"}</span>
          <h2 className="text-[15px] font-extrabold text-slate-900">Biblioteca Sesiune</h2>
        </div>
        <p className="text-[11px] text-slate-500">{data.sessionName} — date agregate din toate ghidurile si template-urile</p>
      </div>

      {/* Tabs */}
      <div className="px-5 flex-shrink-0">
        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-3" style={{ scrollbarWidth: "thin" }}>
        {activeTab === "rules" && <RulesTab rules={data.rules} />}
        {activeTab === "scoring" && <ScoringTab scoring={data.scoring} />}
        {activeTab === "elements" && <ElementsTab elements={data.elements} />}
        {activeTab === "tables" && <TablesTab tables={data.tables} />}
        {activeTab === "checklist" && <ChecklistTab checklist={data.checklist} folderId={folderId} onRefresh={fetchData} />}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   TAB: REGULI
   ══════════════════════════════════════════ */

function RulesTab({ rules }: { rules: LibraryData["rules"] }) {
  const [filter, setFilter] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const categories = Object.entries(rules.categories).sort((a, b) => b[1] - a[1]);
  const filtered = filter ? rules.items.filter(r => (r.category || "other") === filter) : rules.items;

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const displayRules = filter === "_fixed" ? rules.items.filter(r => r.type === "fixed")
    : filter === "_interpreted" ? rules.items.filter(r => r.type === "interpreted")
    : filtered;

  // Normalize LibRule → RuleCardData
  const normalizedRules: RuleCardData[] = useMemo(() => displayRules.map(rule => {
    const rc = typeof rule.condition === "string" ? (() => { try { return JSON.parse(rule.condition); } catch { return rule.condition; } })() : rule.condition;
    return {
      id: rule.id,
      type: rule.type,
      text: rule.description,
      confidence: parseFloat(rule.confidence || "0"),
      page: rule.sourcePage,
      category: rule.category,
      sourceText: rule.sourceText,
      condition: rc,
      semanticTags: (rc && typeof rc === "object" && rc.semantic_tags) ? rc.semantic_tags : [],
      validated: rule.validated,
      needsReview: rule.needsReview,
      sourceDocument: rule.sourceDocument,
    };
  }), [displayRules]);

  return (
    <div className="flex flex-col gap-3">
      {/* Summary pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <Pill active={!filter} onClick={() => setFilter(null)} label="Toate" count={rules.total} />
        <Pill active={filter === "_fixed"} onClick={() => setFilter(filter === "_fixed" ? null : "_fixed")} label="Fixe" count={rules.fixed} color="#34d399" />
        <Pill active={filter === "_interpreted"} onClick={() => setFilter(filter === "_interpreted" ? null : "_interpreted")} label="Interpretate" count={rules.interpreted} color="#fbbf24" />
        <span className="w-px h-4 bg-slate-200 mx-1" />
        {categories.map(([cat, count]) => (
          <Pill key={cat} active={filter === cat} onClick={() => setFilter(filter === cat ? null : cat)} label={cat} count={count} />
        ))}
      </div>

      {/* Rule cards */}
      <RuleCardList>
        {normalizedRules.map(rule => (
          <RuleCard
            key={rule.id}
            rule={rule}
            isOpen={expanded.has(rule.id)}
            onToggle={() => toggle(rule.id)}
            categoryColor={RC_COLORS[rule.category || ""] || "#94a3b8"}
            categoryLabel={RC_LABELS[rule.category || ""] || (rule.category || "").replace(/_/g, ". ").toUpperCase()}
          />
        ))}
      </RuleCardList>

      {displayRules.length === 0 && <EmptyTab icon="\u{1F6E1}" message="Nicio regulă extrasă încă" />}
    </div>
  );
}

/* ══════════════════════════════════════════
   TAB: SCORING
   ══════════════════════════════════════════ */

function ScoringTab({ scoring }: { scoring: LibraryData["scoring"] }) {
  if (scoring.items.length === 0) return <EmptyTab icon="\u{1F3AF}" message="Niciun criteriu de scoring extras" />;

  const totalMax = scoring.items.reduce((s, c) => s + parseFloat(c.maxPoints), 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 px-1">
        <span className="text-[11px] text-slate-500">Total punctaj maxim:</span>
        <span className="text-sm font-bold font-mono text-blue-600">{totalMax}</span>
      </div>

      {scoring.items.map(cr => (
        <div key={cr.id} style={{ borderRadius: 12, border: "1px solid rgba(226,232,240,.7)", background: "#fff", padding: "14px 20px", transition: "all .2s" }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "#cbd5e1"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(226,232,240,.7)"}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span style={{ fontSize: 11, fontWeight: 700, color: "#2563eb", background: "rgba(37,99,235,.08)", padding: "2px 8px", borderRadius: 4, fontFamily: "'JetBrains Mono', monospace" }}>{cr.code}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{cr.name}</span>
              </div>
              {cr.description && <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>{cr.description}</p>}
            </div>
            <div className="flex flex-col items-end flex-shrink-0">
              <span style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", fontFamily: "'JetBrains Mono', monospace" }}>{cr.maxPoints}</span>
              <span style={{ fontSize: 10, color: "#94a3b8" }}>puncte max</span>
            </div>
          </div>

          {cr.evaluationLogic && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Logica evaluare</span>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <span className="text-[10px] font-medium bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">{cr.evaluationLogic.type}</span>
                {cr.evaluationLogic.elementKey && <span className="text-[10px] font-mono text-slate-500 bg-slate-50 px-2 py-0.5 rounded">{cr.evaluationLogic.elementKey}</span>}
                {cr.evaluationLogic.ranges?.map((r, i) => (
                  <span key={i} className="text-[10px] font-mono text-slate-500 bg-slate-50 px-2 py-0.5 rounded">
                    {r.min != null ? r.min : "..."}-{r.max != null ? r.max : "..."} = {r.points}p
                  </span>
                ))}
              </div>
            </div>
          )}

          {cr.sourceDocument && (
            <div className="text-[10px] text-slate-400 mt-2">Din: {cr.sourceDocument.name}</div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════
   TAB: ELEMENTE
   ══════════════════════════════════════════ */

function ElementsTab({ elements }: { elements: LibraryData["elements"] }) {
  const [catFilter, setCatFilter] = useState<string | null>(null);

  const grouped = new Map<string, LibElement[]>();
  for (const el of elements.items) {
    const cat = el.category || "other";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(el);
  }

  const categories = [...grouped.keys()].sort();
  const displayItems = catFilter ? (grouped.get(catFilter) || []) : elements.items;

  if (elements.items.length === 0) return <EmptyTab icon="\u{1F9E9}" message="Nicio definitie de element inca" />;

  return (
    <div className="flex flex-col gap-3">
      {/* Stats row */}
      <div className="flex items-center gap-4 px-1 flex-wrap">
        <StatChip label="Total" value={elements.total} />
        <StatChip label="Mapate" value={elements.mapped} color="#34d399" />
        <StatChip label="Nemapate" value={elements.unmapped} color="#f87171" />
        {elements.items.filter(e => e.minCount > 1).length > 0 && (
          <StatChip label="Multi-instanta" value={elements.items.filter(e => e.minCount > 1).length} color="#fb923c" />
        )}
      </div>

      {/* Category pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <Pill active={!catFilter} onClick={() => setCatFilter(null)} label="Toate" count={elements.total} />
        {categories.map(cat => (
          <Pill key={cat} active={catFilter === cat} onClick={() => setCatFilter(catFilter === cat ? null : cat)} label={cat} count={grouped.get(cat)?.length || 0} />
        ))}
      </div>

      {/* Element rows */}
      {displayItems.map(el => (
        <div key={el.id} style={{ borderRadius: 12, border: "1px solid rgba(226,232,240,.7)", background: "#fff", padding: "14px 20px", transition: "all .2s" }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "#cbd5e1"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(226,232,240,.7)"}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[13px] font-semibold text-slate-900">{el.displayName}</span>
                {el.required && <span className="text-[9px] font-bold text-red-500">OBLIGATORIU</span>}
                {el.minCount > 1 && (
                  <span className="text-[10px] font-semibold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full">
                    min {el.minCount}{el.maxCount ? ` / max ${el.maxCount}` : ""}
                  </span>
                )}
                {el.minCount === 1 && el.maxCount && el.maxCount > 1 && (
                  <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">
                    max {el.maxCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono text-slate-400">{el.elementKey}</span>
                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">{el.dataType}</span>
                {el.unit && <span className="text-[10px] text-slate-400">({el.unit})</span>}
                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">{el.category}</span>
              </div>
            </div>
            <div className="flex-shrink-0">
              {el.mappingCount > 0 ? (
                <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full flex items-center gap-1">
                  {"\u2713"} {el.mappingCount} template{el.mappingCount > 1 ? "-uri" : ""}
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-slate-400 bg-slate-50 px-2 py-1 rounded-full">Nemapat</span>
              )}
            </div>
          </div>
          {el.mappedTemplates.length > 0 && (
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {el.mappedTemplates.map(t => (
                <span key={t} className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{t}</span>
              ))}
            </div>
          )}
          {el.helpText && <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">{el.helpText}</p>}
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════
   TAB: TABELE
   ══════════════════════════════════════════ */

function TablesTab({ tables }: { tables: LibraryData["tables"] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (tables.items.length === 0) return <EmptyTab icon="\u{1F4CA}" message="Niciun tabel de referinta extras" />;

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {tables.items.map(tbl => (
        <div key={tbl.id} style={{ borderRadius: 12, border: "1px solid rgba(226,232,240,.7)", background: "#fff", transition: "all .2s", overflow: "hidden" }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "#cbd5e1"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(226,232,240,.7)"}>
          <button className="w-full text-left" style={{ padding: "14px 20px", display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", border: "none", font: "inherit", background: "transparent" }} onClick={() => toggle(tbl.id)}>
            <span className="text-[10px] text-slate-400 mt-1 flex-shrink-0 transition-transform" style={{ transform: expanded.has(tbl.id) ? "rotate(90deg)" : "none" }}>{"\u25B6"}</span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-slate-900">{tbl.name}</div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full font-medium">{tbl.tableType}</span>
                <span className="text-[10px] font-mono text-slate-400">{tbl.rowCount} randuri</span>
                <span className="text-[10px] font-mono text-slate-400">{tbl.columnCount} coloane</span>
                {tbl.validated && <span className="text-[10px] text-emerald-600">{"\u2713"} Validat</span>}
              </div>
            </div>
          </button>

          {expanded.has(tbl.id) && (
            <div className="px-4 pb-3 border-t border-slate-100">
              {tbl.description && <p className="text-[11px] text-slate-500 mt-2 mb-2">{tbl.description}</p>}

              {tbl.schema && tbl.data && tbl.data.length > 0 && (
                <div className="overflow-x-auto mt-2 rounded-lg border border-slate-200">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-slate-50">
                        {tbl.schema.map(col => (
                          <th key={col.key} className="px-3 py-2 text-left font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap">{col.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tbl.data.slice(0, 10).map((row, ri) => (
                        <tr key={ri} className="hover:bg-slate-50 transition-colors">
                          {tbl.schema!.map(col => (
                            <td key={col.key} className="px-3 py-1.5 border-b border-slate-100 text-slate-700 whitespace-nowrap">{String(row[col.key] ?? "")}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {tbl.data.length > 10 && (
                    <div className="text-center py-2 text-[10px] text-slate-400 bg-slate-50">...si inca {tbl.data.length - 10} randuri</div>
                  )}
                </div>
              )}

              {tbl.sourceDocument && (
                <div className="text-[10px] text-slate-400 mt-2">Din: {tbl.sourceDocument.name}{tbl.sourcePage != null ? `, p.${tbl.sourcePage}` : ""}</div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════
   TAB: CHECKLIST
   ══════════════════════════════════════════ */

function ChecklistTab({ checklist, folderId, onRefresh }: { checklist: LibraryData["checklist"]; folderId: string; onRefresh: () => void }) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("General");
  const [populating, setPopulating] = useState(false);

  const categories = Object.entries(checklist.categories).sort((a, b) => a[0].localeCompare(b[0]));

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      await apiPost(`/api/documents/session/${folderId}/checklist`, { name: newName.trim(), category: newCategory });
      setNewName("");
      setAdding(false);
      onRefresh();
    } catch { /* ignore */ }
  };

  const handleDelete = async (itemId: string) => {
    try {
      await apiDelete(`/api/documents/session/${folderId}/checklist/${itemId}`);
      onRefresh();
    } catch { /* ignore */ }
  };

  const handleAutoPopulate = async () => {
    setPopulating(true);
    try {
      await apiPost(`/api/documents/session/${folderId}/checklist/auto-populate`, {});
      onRefresh();
    } catch { /* ignore */ }
    setPopulating(false);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setAdding(!adding)}
          className="text-[12px] font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1"
        >
          + Adauga manual
        </button>
        <button
          onClick={handleAutoPopulate}
          disabled={populating}
          className="text-[12px] font-semibold text-purple-600 hover:text-purple-700 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 disabled:opacity-50"
        >
          {populating ? "\u23F3" : "\u{1F916}"} Auto-populate din ghid
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div style={{ borderRadius: 12, border: "1px solid rgba(147,197,253,.5)", background: "rgba(239,246,255,.5)", padding: "14px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-[13px] text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            placeholder="Nume document necesar..."
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <select
              className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-[12px] text-slate-700 outline-none"
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
            >
              <option>General</option>
              <option>Documente juridice</option>
              <option>Documente financiare</option>
              <option>Documente tehnice</option>
              <option>Declaratii & Angajamente</option>
            </select>
            <button onClick={handleAdd} className="text-[12px] font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-all">Adauga</button>
            <button onClick={() => { setAdding(false); setNewName(""); }} className="text-[12px] text-slate-500 hover:text-slate-700 px-2 py-1.5">Anuleaza</button>
          </div>
        </div>
      )}

      {/* Grouped items */}
      {categories.length === 0 && !adding && <EmptyTab icon="\u2705" message="Niciun item in checklist" sub="Adauga manual sau auto-populeaza din regulile ghidului" />}

      {categories.map(([cat, count]) => (
        <div key={cat}>
          <div className="flex items-center gap-2 mb-2 mt-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{cat}</span>
            <span className="text-[10px] font-mono text-slate-400">{count}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {checklist.items.filter(i => i.category === cat).map(item => (
              <div key={item.id} className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-all group">
                <span className="text-[12px] mt-0.5 flex-shrink-0">{item.source === "ghid" ? "\u{1F4D6}" : "\u270D\uFE0F"}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-slate-800 leading-snug">{item.name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {item.templateName && <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{item.templateName}</span>}
                    {item.notes && <span className="text-[10px] text-slate-400 italic">{item.notes}</span>}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="text-[12px] text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                  title="Sterge"
                >
                  {"\u2715"}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════
   SEMANTIC TAG HELPERS
   ══════════════════════════════════════════ */

const OPERATOR_LABELS: Record<string, string> = {
  eq: "=",
  neq: "\u2260",
  gt: ">",
  gte: "\u2265",
  lt: "<",
  lte: "\u2264",
  in: "\u2208",
  not_in: "\u2209",
  between: "\u2194",
  contains: "conține",
  not_contains: "nu conține",
  exists: "există",
  not_exists: "nu există",
  matches: "corespunde",
  is_true: "= DA",
  is_false: "= NU",
};

function formatFieldName(field: string): string {
  return field
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function formatConditionValue(val: any): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "DA" : "NU";
  if (typeof val === "number") return val.toLocaleString("ro-RO");
  if (Array.isArray(val)) return val.join(", ");
  return String(val);
}

/** Convert a condition JSONB object into a human-readable description */
function formatCondition(condition: any): { text: string; field?: string; operator?: string; value?: string; value2?: string } | null {
  if (!condition || typeof condition !== "object") return null;

  const { field, operator, value, value2, semantic_tags, ...rest } = condition;
  if (!field && !operator) return null;

  const fieldLabel = field ? formatFieldName(field) : "";
  const opLabel = operator ? (OPERATOR_LABELS[operator] || operator) : "";
  const valLabel = formatConditionValue(value);
  const val2Label = value2 !== undefined ? formatConditionValue(value2) : "";

  let text: string;
  if (operator === "between" && value !== undefined && value2 !== undefined) {
    text = `${fieldLabel} între ${valLabel} și ${val2Label}`;
  } else if (operator === "in" || operator === "not_in") {
    const listStr = Array.isArray(value) ? value.join(", ") : valLabel;
    text = operator === "in"
      ? `${fieldLabel} este unul din: ${listStr}`
      : `${fieldLabel} nu este în: ${listStr}`;
  } else if (operator === "exists" || operator === "not_exists") {
    text = operator === "exists" ? `${fieldLabel} trebuie să existe` : `${fieldLabel} nu trebuie să existe`;
  } else if (operator === "is_true" || operator === "is_false") {
    text = `${fieldLabel} = ${operator === "is_true" ? "DA" : "NU"}`;
  } else if (field && operator && value !== undefined) {
    text = `${fieldLabel} ${opLabel} ${valLabel}`;
  } else if (field && value !== undefined) {
    text = `${fieldLabel}: ${valLabel}`;
  } else {
    return null;
  }

  return { text, field: fieldLabel, operator: opLabel, value: valLabel, value2: val2Label || undefined };
}

const SEM_TAG_MAP: Record<string, { label: string; color: string; bg: string; border: string }> = {
  THRESHOLD:      { label: "Prag",         color: "#0369a1", bg: "rgba(14,165,233,.1)",  border: "rgba(14,165,233,.25)" },
  SCORING:        { label: "Punctaj",      color: "#7c3aed", bg: "rgba(167,139,250,.1)", border: "rgba(167,139,250,.25)" },
  TEMPORAL:       { label: "Temporal",     color: "#0891b2", bg: "rgba(6,182,212,.1)",   border: "rgba(6,182,212,.25)" },
  DOCUMENT_BASED: { label: "Document",     color: "#b45309", bg: "rgba(245,158,11,.1)",  border: "rgba(245,158,11,.25)" },
  DEPENDENCY:     { label: "Dependență",   color: "#6d28d9", bg: "rgba(139,92,246,.1)",  border: "rgba(139,92,246,.25)" },
  EXCLUSION:      { label: "Excludere",    color: "#dc2626", bg: "rgba(239,68,68,.1)",   border: "rgba(239,68,68,.2)" },
  EXCEPTION:      { label: "Excepție",     color: "#ea580c", bg: "rgba(249,115,22,.1)",  border: "rgba(249,115,22,.2)" },
  PROPORTIONAL:   { label: "Proporțional", color: "#059669", bg: "rgba(16,185,129,.1)",  border: "rgba(16,185,129,.25)" },
  CLASSIFICATION: { label: "Clasificare",  color: "#2563eb", bg: "rgba(37,99,235,.1)",   border: "rgba(37,99,235,.2)" },
};

function semanticTagLabel(tag: string): string {
  return SEM_TAG_MAP[tag]?.label || tag;
}

function semanticTagStyle(tag: string): React.CSSProperties {
  const m = SEM_TAG_MAP[tag];
  if (!m) return { color: "#64748b", background: "#f1f5f9", border: "1px solid #e2e8f0" };
  return { color: m.color, background: m.bg, border: `1px solid ${m.border}` };
}

const SEM_TAG_ICONS: Record<string, string> = {
  THRESHOLD: "●", SCORING: "★", TEMPORAL: "◷",
  DOCUMENT_BASED: "◩", DEPENDENCY: "⇄", EXCLUSION: "⊘",
  EXCEPTION: "⚑", PROPORTIONAL: "%", CLASSIFICATION: "◈",
};

function semanticTagIcon(tag: string): string {
  return SEM_TAG_ICONS[tag] || "●";
}

/* ══════════════════════════════════════════
   SHARED SMALL COMPONENTS
   ══════════════════════════════════════════ */

function Pill({ active, onClick, label, count, color }: { active: boolean; onClick: () => void; label: string; count: number; color?: string }) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all flex items-center gap-1.5 ${
        active
          ? "border-blue-300 bg-blue-50 text-blue-700"
          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"
      }`}
    >
      {label}
      <span className="font-mono font-semibold text-[10px]" style={color ? { color } : undefined}>{count}</span>
    </button>
  );
}

function TypeBadge({ type }: { type: "fixed" | "interpreted" }) {
  const isFixed = type === "fixed";
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px",
      padding: "2px 10px", borderRadius: 4, display: "inline-flex", flexShrink: 0, whiteSpace: "nowrap",
      color: isFixed ? "#059669" : "#d97706",
      background: isFixed ? "rgba(52,211,153,.15)" : "rgba(251,191,36,.15)",
      border: isFixed ? "1px solid #a7f3d0" : "1px solid #fed7aa",
    }}>
      {isFixed ? "FIXĂ" : "INTERPRETATĂ"}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "#34d399" : pct >= 50 ? "#fbbf24" : "#f87171";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[10px] font-mono text-slate-400">{pct}%</span>
    </div>
  );
}

function StatChip({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
      {label}: <span className="font-mono font-bold" style={color ? { color } : undefined}>{value}</span>
    </div>
  );
}

function DetailCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">{label}</div>
      <div className={`text-[12px] text-slate-700 leading-relaxed ${mono ? "font-mono text-[11px] whitespace-pre-wrap break-all" : ""}`}>{value}</div>
    </div>
  );
}

function EmptyTab({ icon, message, sub }: { icon: string; message: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span style={{ fontSize: 36, opacity: 0.25 }}>{icon}</span>
      <div className="text-[13px] font-semibold text-slate-400 mt-3">{message}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

function LibrarySkeleton() {
  return (
    <div className="flex flex-col gap-4 p-5" style={{ animation: "docFadeIn .4s ease" }}>
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded bg-slate-200" style={{ animation: "shimmer 1.5s ease-in-out infinite", backgroundSize: "200% 100%", backgroundImage: "linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)" }} />
        <div className="w-40 h-5 rounded bg-slate-200" style={{ animation: "shimmer 1.5s ease-in-out infinite", backgroundSize: "200% 100%", backgroundImage: "linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)" }} />
      </div>
      <div className="w-64 h-3 rounded bg-slate-100" />
      <div className="flex gap-2">
        {[80, 60, 70, 55, 65].map((w, i) => (
          <div key={i} className="h-8 rounded-full bg-slate-100" style={{ width: w }} />
        ))}
      </div>
      {[1, 2, 3].map(i => (
        <div key={i} className="h-20 rounded-xl border border-slate-200 bg-white" style={{ animation: "shimmer 1.5s ease-in-out infinite", backgroundSize: "200% 100%", backgroundImage: "linear-gradient(90deg, #fff 25%, #f8fafc 50%, #fff 75%)" }} />
      ))}
    </div>
  );
}
