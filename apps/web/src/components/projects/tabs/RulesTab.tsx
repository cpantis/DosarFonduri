"use client";
import { useState, useEffect } from "react";
import { apiGet, apiPut, apiPost } from "@/lib/api";
import { RuleCard, RuleCardList, type RuleCardData } from "@/components/shared/RuleCard";
import type { EligibilityRule, GuideRule } from "../types";

interface RulesTabProps {
  projectId: string;
  project: any;
  eligibilityRules: EligibilityRule[];
  setEligibilityRules: (v: EligibilityRule[] | ((prev: EligibilityRule[]) => EligibilityRule[])) => void;
  guideRules: GuideRule[];
  setGuideRules: (v: GuideRule[] | ((prev: GuideRule[]) => GuideRule[])) => void;
  referenceTables: any[];
  setReferenceTables: (fn: (prev: any[]) => any[]) => void;
  solEligibility: any[];
  recheckLoading: boolean;
  setRecheckLoading: (v: boolean) => void;
  readOnly: boolean;
  toast: (type: string, msg: string) => void;
  onSwitchToElements: (search: string) => void;
  mapEligibilityRules: (flat: any[]) => EligibilityRule[];
  mapGuideRules: (grouped: any[]) => GuideRule[];
}

export default function RulesTab({
  projectId, project, eligibilityRules, setEligibilityRules,
  guideRules, setGuideRules, referenceTables, setReferenceTables,
  solEligibility, recheckLoading, setRecheckLoading,
  readOnly, toast, onSwitchToElements, mapEligibilityRules, mapGuideRules,
}: RulesTabProps) {
  const [ghidTab, setGhidTab] = useState<"reguli" | "ghid" | "anexe">("reguli");
  const [ghidCategoryFilter, setGhidCategoryFilter] = useState("all");
  const [ghidTypeFilter, setGhidTypeFilter] = useState("all");
  const [ghidStatusFilter, setGhidStatusFilter] = useState("all");
  const [expandedRuleIds, setExpandedRuleIds] = useState<Set<string>>(new Set());
  const [ghidViewerData, setGhidViewerData] = useState<any>(null);
  const [ghidViewerLoading, setGhidViewerLoading] = useState(false);
  const [ghidViewerPage, setGhidViewerPage] = useState(1);
  const [selectedRefTable, setSelectedRefTable] = useState<string | null>(null);

  // Lazy-load guide viewer data
  useEffect(() => {
    if (ghidTab === "ghid" && !ghidViewerData && project?.folderId) {
      setGhidViewerLoading(true);
      apiGet<any>(`/api/documents/folders/${project.folderId}/guide-viewer`)
        .then(data => setGhidViewerData(data))
        .catch(e => console.warn("[rules] guide viewer load failed:", e?.message))
        .finally(() => setGhidViewerLoading(false));
    }
  }, [ghidTab, ghidViewerData, project?.folderId]);

  const handleRecheckEligibility = async () => {
    setRecheckLoading(true);
    try {
      await apiPost(`/api/projects/${projectId}/check-eligibility`, {});
      const eligData = await apiGet<any>(`/api/projects/${projectId}/eligibility`);
      setEligibilityRules(() => mapEligibilityRules(eligData.flat || []));
      setGuideRules(() => mapGuideRules(eligData.grouped || []));
      toast("success", "Eligibilitatea a fost re-verificată");
    } catch (e: any) {
      toast("error", e.message || "Eroare la verificare");
    } finally {
      setRecheckLoading(false);
    }
  };

  const setActiveLeaf = onSwitchToElements; // alias for navigation
  const setElemSearch = (s: string) => onSwitchToElements(s);

  // Inline JSX from original page.tsx (lines 3749-4341)
  // This is the full rules tab content extracted directly

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

}
