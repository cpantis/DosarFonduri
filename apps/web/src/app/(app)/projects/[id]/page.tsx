"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { apiGet } from "@/lib/api";
import { useToast } from "@/components/shared/Toast";
import { useSSE } from "@/hooks/useSSE";
import { useProjectLock } from "@/hooks/useProjectLock";
import { useSolomonChat } from "@/hooks/useSolomonChat";
import SolomonPanel from "@/components/projects/SolomonPanel";
import { SummaryTab, RulesTab, ElementsTab, ChecklistTab, ScoringTab, TablesTab } from "@/components/projects/tabs";

import type { NeemiaTemplate, EligibilityRule, GuideRule, ElementItem, ChecklistItem, ProjectData, LeafType, SolomonPhase } from "@/components/projects/types";
import { STATUS_MAP } from "@/components/projects/types";
import { mapEligibilityRules, mapGuideRules, mapElements, mapChecklist } from "@/components/projects/mappers";
import { PROJECT_VIEW_CSS } from "@/components/projects/projectViewStyles";

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
        }).catch(e => console.warn("[project]", e?.message || e));
      }
      if (evt.event === "eligibility_updated") {
        apiGet<any>(`/api/projects/${projectId}/eligibility`).then(eligData => {
          setEligibilityRules(mapEligibilityRules(eligData.flat || []));
        }).catch(e => console.warn("[project]", e?.message || e));
      }
      if (evt.event === "score_updated") {
        apiGet<any>(`/api/projects/${projectId}/scores`)
          .then(setProjectScores)
          .catch(console.error);
      }
      if (evt.event === "checklist_updated") {
        // Re-fetch checklist when backend auto-matches an item
        // /checklist (not /:id) includes the mapped template names
        apiGet<any>(`/api/projects/${projectId}/checklist`).then(data => {
          setChecklistItems(mapChecklist(data.items || []));
        }).catch(e => console.warn("[project]", e?.message || e));
      }
    }, [projectId]),
  });

  const [activeLeaf, setActiveLeaf] = useState<LeafType>("sumar");
  const [pendingElementId, setPendingElementId] = useState<string | null>(null);
  const clearPendingElement = useCallback(() => setPendingElementId(null), []);
  const [referenceTables, setReferenceTables] = useState<any[]>([]);

  const [solomonPhase, setSolomonPhase] = useState<SolomonPhase | null>(null);
  // Sprint 5: Solomon structured output
  const [solEligibility, setSolEligibility] = useState<any[]>([]);
  const [solScoring, setSolScoring] = useState<any[]>([]);
  const [solChecklist, setSolChecklist] = useState<any[]>([]);
  // RAG v2: Classified documents for the session
  const [classifiedDocs, setClassifiedDocs] = useState<any[]>([]);
  // FIX 7: Version upgrade impact banner
  const [versionImpact, setVersionImpact] = useState<{ docName: string; oldVersion: number; newVersion: number; summary: string; changes: any[]; dismissedAt?: string } | null>(null);

  const [recheckLoading, setRecheckLoading] = useState(false);

  // GAP 1: Project scores
  const [projectScores, setProjectScores] = useState<{ scores: any[]; totalPoints: number; maxTotalPoints: number; percentage: number } | null>(null);
  // GAP 2: Budget validation
  const [budgetValidation, setBudgetValidation] = useState<{ results: any[]; summary: any } | null>(null);
  // GAP 8: Learnings
  const [learnings, setLearnings] = useState<any | null>(null);
  const [orgLabels, setOrgLabels] = useState<{ solomonLabel: string; neemiaLabel: string }>({ solomonLabel: "Solomon", neemiaLabel: "Neemia" });

  // ─── LOCK (read-only mode when lock is not owned) ───
  const { lockOwned, lockError, lockRetrying, handleRetryLock } = useProjectLock(projectId);
  const readOnly = !lockOwned;

  // ─── SOLOMON CHAT (state lives here so a streaming answer survives tab switches) ───
  const chat = useSolomonChat({
    projectId, activeLeaf, elements, setElements, setProject, setSolomonPhase,
    setSolEligibility, setSolScoring, setSolChecklist, readOnly, toast,
  });
  const { setSolomonInput, refinePopup, popupRef, refineInput, setRefineInput, handleRefineSubmit } = chat;

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
        apiGet<any[]>(`/api/documents/folders/${proj.folderId}/classified-documents`).then(docs => {
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
        }).catch(e => console.warn("[project]", e?.message || e));
        // Sprint 5: Load Solomon structured output
        apiGet<any>(`/api/solomon/projects/${projectId}/eligibility`).then(r => setSolEligibility(r?.entries || [])).catch(e => console.warn("[project]", e?.message || e));
        apiGet<any>(`/api/solomon/projects/${projectId}/scoring`).then(r => setSolScoring(r?.criteria || [])).catch(e => console.warn("[project]", e?.message || e));
        apiGet<any>(`/api/solomon/projects/${projectId}/document-checklist`).then(r => setSolChecklist(r?.items || [])).catch(e => console.warn("[project]", e?.message || e));
        setEligibilityRules(mapEligibilityRules(eligData.flat || []));
        setGuideRules(mapGuideRules(eligData.grouped || []));
        setElements(mapElements(proj.elements || []));
        setChecklistItems(mapChecklist(checkData.items || proj.checklist || []));

        // Load reference tables for the organization
        apiGet<any[]>("/api/reference/tables").then(tables => setReferenceTables(tables || [])).catch(e => console.warn("[project]", e?.message || e));

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
        }).catch(e => console.warn("[project]", e?.message || e));

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
        apiGet<any>(`/api/projects/${projectId}/scores`).then(setProjectScores).catch(e => console.warn("[project]", e?.message || e));
        apiGet<any>(`/api/projects/${projectId}/budget-validation`).then(setBudgetValidation).catch(e => console.warn("[project]", e?.message || e));
        apiGet<any>(`/api/projects/${projectId}/learnings`).then(setLearnings).catch(e => console.warn("[project]", e?.message || e));
        // Load org config for custom labels
        apiGet<any>(`/api/config`).then(cfg => {
          if (cfg) setOrgLabels({ solomonLabel: cfg.solomonLabel || "Solomon", neemiaLabel: cfg.neemiaLabel || "Neemia" });
        }).catch(e => console.warn("[project]", e?.message || e));
      } catch (err: any) {
        console.error("Failed to load project:", err);
        setLoadError(err?.message || "Eroare la încărcarea proiectului");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [projectId]);

  const eligPassed = eligibilityRules.filter(r => r.status === "pass").length;
  const eligTotal = eligibilityRules.length;
  const elemFilled = elements.filter(e => e.value).length;
  const elemTotal = elements.length;

  const projectName = project?.name || "Se incarcă...";
  const projectFirma = project?.company?.denumire || "-";
  const projectStatus = project?.status || "draft";

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
      <style>{PROJECT_VIEW_CSS}</style>

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
            {/* SUMAR — extracted to component */}
            {activeLeaf === "sumar" && project && <SummaryTab project={project} elements={elements} neemiaTemplates={neemiaTemplates} eligibilityRules={eligibilityRules} checklistItems={checklistItems} projectScores={projectScores} budgetValidation={budgetValidation} learnings={learnings} orgLabels={orgLabels} onSwitchTab={setActiveLeaf} />}

            {/* REGULI (combined ghid rules + eligibility status) */}
            {/* REGULI — extracted to component */}
            {activeLeaf === "reguli" && <RulesTab projectId={projectId} project={project} eligibilityRules={eligibilityRules} setEligibilityRules={setEligibilityRules} guideRules={guideRules} setGuideRules={setGuideRules} referenceTables={referenceTables} setReferenceTables={setReferenceTables} solEligibility={solEligibility} recheckLoading={recheckLoading} setRecheckLoading={setRecheckLoading} readOnly={readOnly} toast={toast} onSwitchToElements={(search) => { setActiveLeaf("elemente"); }} mapEligibilityRules={mapEligibilityRules} mapGuideRules={mapGuideRules} />}

            {/* ELEMENTE */}
            {/* ELEMENTE — extracted to component */}
            {activeLeaf === "elemente" && <ElementsTab projectId={projectId} elements={elements} setElements={setElements} readOnly={readOnly} toast={toast} openElementId={pendingElementId} onElementOpened={clearPendingElement} onAskSolomonAbout={(key) => { setActiveLeaf("solomon"); setSolomonInput(`Completează elementul ${key}`); }} />}

            {/* CHECKLIST */}
            {/* CHECKLIST — extracted to component */}
            {activeLeaf === "checklist" && <ChecklistTab projectId={projectId} checklistItems={checklistItems} setChecklistItems={setChecklistItems} neemiaTemplates={neemiaTemplates} solChecklist={solChecklist} classifiedDocs={classifiedDocs} readOnly={readOnly} toast={toast} onSwitchToNeemia={() => setActiveLeaf("solomon")} />}

            {/* SCOR (scoring criteria + points) */}
            {/* SCOR — extracted to component */}
            {activeLeaf === "scor" && <ScoringTab projectId={projectId} solScoring={solScoring} projectScores={projectScores} setProjectScores={setProjectScores} toast={toast} />}

            {/* TABELE (reference tables from guide) */}
            {/* TABELE — extracted to component */}
            {activeLeaf === "tabele" && <TablesTab referenceTables={referenceTables} />}

            {activeLeaf === "solomon" && (
              <SolomonPanel
                chat={chat}
                elements={elements}
                solomonPhase={solomonPhase}
                solEligibility={solEligibility}
                solScoring={solScoring}
                readOnly={readOnly}
                onOpenElement={(id) => { setPendingElementId(id); setActiveLeaf("elemente"); }}
              />
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

          </div>
        </div>
      </div>
    </div>
  );
}
