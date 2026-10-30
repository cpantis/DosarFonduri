"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { api, apiGet, apiPost, apiPut } from "@/lib/api";
import { useToast } from "@/components/shared/Toast";
import { useSSE } from "@/hooks/useSSE";
import { useProjectLock } from "@/hooks/useProjectLock";
import { SummaryTab, RulesTab, ElementsTab, ChecklistTab, ScoringTab, TablesTab } from "@/components/projects/tabs";

import type { SolomonMessage, SolomonElement, NeemiaTemplate, EligibilityRule, GuideRule, ElementItem, ChecklistItem, ProjectData, LeafType } from "@/components/projects/types";
import { STATUS_MAP } from "@/components/projects/types";
import { mapEligibilityRules, mapGuideRules, mapElements, mapChecklist } from "@/components/projects/mappers";
import { PROJECT_VIEW_CSS } from "@/components/projects/projectViewStyles";

const API_URL = "";

const pct = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0;

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
        apiGet<any>(`/api/projects/${projectId}`).then(proj => {
          setChecklistItems(mapChecklist(proj.checklist || []));
        }).catch(e => console.warn("[project]", e?.message || e));
      }
    }, [projectId]),
  });

  const [activeLeaf, setActiveLeaf] = useState<LeafType>("sumar");
  const [referenceTables, setReferenceTables] = useState<any[]>([]);

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

  // Track mounted state — async callbacks check this before setState
  const isMountedRef = useRef(true);

  // Cleanup all streaming resources on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (solomonAbortRef.current) {
        solomonAbortRef.current.abort();
        solomonAbortRef.current = null;
      }
      if (solomonTimeoutRef.current) {
        clearTimeout(solomonTimeoutRef.current);
        solomonTimeoutRef.current = null;
      }
    };
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
  const [solomonPhase, setSolomonPhase] = useState<{ phase: string; label: string; progress: number; nextAction: string; regression?: { from: string; reason: string; affectedConclusions?: string[] } } | null>(null);
  // FIX K: Active signals (risks, loops, client discussions)
  const [solomonSignals, setSolomonSignals] = useState<Array<{ signalType: string; message: string; severity: string; phase: string; target?: string; timestamp: string; dismissed?: boolean }>>([]);
  // Sprint 5: Solomon structured output
  const [solEligibility, setSolEligibility] = useState<any[]>([]);
  const [solScoring, setSolScoring] = useState<any[]>([]);
  const [solChecklist, setSolChecklist] = useState<any[]>([]);
  // RAG v2: Classified documents for the session
  const [classifiedDocs, setClassifiedDocs] = useState<any[]>([]);
  const [docUploading, setDocUploading] = useState(false);
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
  const [orgLabels, setOrgLabels] = useState<{ solomonLabel: string; neemiaLabel: string }>({ solomonLabel: "Solomon", neemiaLabel: "Neemia" });

  // ─── LOCK (read-only mode when lock is not owned) ───
  const { lockOwned, lockError, lockRetrying, handleRetryLock } = useProjectLock(projectId);
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
        apiPut(`/api/solomon/conversations/${conv.id}/model`, { model: "claude-sonnet-4-6" }).catch(e => console.warn("[project]", e?.message || e));
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
                }).catch(e => console.warn("[project]", e?.message || e));
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
              setTimeout(() => { if (isMountedRef.current) setSolomonToolUse(null); }, 5000);
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
            } else if (evt.type === "signal" && evt.signal) {
              // FIX K: Solomon signal (risk, loop, client discussion)
              setSolomonSignals(prev => [...prev, evt.signal]);
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
          } catch { /* SSE parse — incomplete chunk, expected */ }
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

      const uploadAbort = new AbortController();
      solomonAbortRef.current = uploadAbort;
      const res = await fetch(`${API_URL}/api/solomon/conversations/${convId}/upload`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
        signal: uploadAbort.signal,
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
              }).catch(e => console.warn("[project]", e?.message || e));
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
          } catch { /* SSE parse — incomplete chunk, expected */ }
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
      solomonAbortRef.current = null;
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
          }).catch(e => console.warn("[project]", e?.message || e));
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
    const abortCtrl = new AbortController();
    solomonAbortRef.current = abortCtrl;
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("df-token") : null;
      const res = await fetch(`${API_URL}/api/solomon/conversations/${solomonConvId}/refine`, {
        method: "POST",
        signal: abortCtrl.signal,
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
          } catch { /* SSE parse — incomplete chunk, expected */ }
        }
      }
    } catch (err) {
      console.error("Refine SSE error:", err);
    } finally {
      solomonAbortRef.current = null;
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
            {activeLeaf === "elemente" && <ElementsTab projectId={projectId} elements={elements} setElements={setElements} readOnly={readOnly} toast={toast} onAskSolomonAbout={(key) => { setActiveLeaf("solomon"); setSolomonInput(`Completează elementul ${key}`); }} />}

            {/* CHECKLIST */}
            {/* CHECKLIST — extracted to component */}
            {activeLeaf === "checklist" && <ChecklistTab projectId={projectId} checklistItems={checklistItems} setChecklistItems={setChecklistItems} neemiaTemplates={neemiaTemplates} solChecklist={solChecklist} classifiedDocs={classifiedDocs} readOnly={readOnly} toast={toast} onSwitchToNeemia={() => setActiveLeaf("solomon")} />}

            {/* SCOR (scoring criteria + points) */}
            {/* SCOR — extracted to component */}
            {activeLeaf === "scor" && <ScoringTab projectId={projectId} solScoring={solScoring} projectScores={projectScores} setProjectScores={setProjectScores} toast={toast} />}

            {/* TABELE (reference tables from guide) */}
            {/* TABELE — extracted to component */}
            {activeLeaf === "tabele" && <TablesTab referenceTables={referenceTables} />}

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
                      <span style={{ fontSize: 12, color: "#1e40af" }}>
                        {solomonPhase.regression ? "↺ " : ""}{solomonPhase.phase} {solomonPhase.label}
                      </span>
                    </div>
                  )}
                  {/* FIX L: Regression indicator */}
                  {solomonPhase?.regression && (
                    <div style={{ padding: "4px 20px", background: "#fffbeb", borderBottom: "1px solid #fde68a" }}>
                      <div style={{ maxWidth: 720, margin: "0 auto", fontSize: 11, color: "#92400e" }}>
                        ↺ Revenire din {solomonPhase.regression.from}: {solomonPhase.regression.reason}
                      </div>
                    </div>
                  )}
                  {/* FIX K: Active signals */}
                  {solomonSignals.filter(s => !s.dismissed).length > 0 && (
                    <div style={{ padding: "4px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
                      {solomonSignals.filter(s => !s.dismissed).map((sig, i) => {
                        const colors: Record<string, { border: string; bg: string; text: string }> = {
                          risc: { border: "#dc2626", bg: "#fef2f2", text: "#991b1b" },
                          bucla: { border: "#d97706", bg: "#fffbeb", text: "#92400e" },
                          discutie_client: { border: "#2563eb", bg: "#eff6ff", text: "#1e40af" },
                          baza_cunostinte: { border: "#7c3aed", bg: "#f5f3ff", text: "#5b21b6" },
                        };
                        const c = colors[sig.signalType] || colors.risc;
                        const icons: Record<string, string> = { risc: "!", bucla: "↺", discutie_client: "?", baza_cunostinte: "i" };
                        return (
                          <div key={i} style={{ borderLeft: `3px solid ${c.border}`, background: c.bg, padding: "6px 10px", borderRadius: "0 6px 6px 0", display: "flex", alignItems: "flex-start", gap: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: c.text, flexShrink: 0, width: 14, textAlign: "center" }}>{icons[sig.signalType] || "!"}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: c.text, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                {sig.signalType.replace("_", " ")} {sig.severity === "high" ? "· BLOCHANT" : ""}
                              </div>
                              <div style={{ fontSize: 12, color: c.text }}>{sig.message}</div>
                            </div>
                            {sig.severity !== "high" && (
                              <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: c.text, opacity: 0.5, padding: 0 }}
                                onClick={() => setSolomonSignals(prev => prev.map((s, j) => j === i ? { ...s, dismissed: true } : s))}
                              >✕</button>
                            )}
                          </div>
                        );
                      })}
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
                                // Navigate to Elemente tab
                                setActiveLeaf("elemente");
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
                          await api(`/api/documents/folders/${project?.folderId}/documents`, { method: "POST", body: fd, timeout: 120000 });
                        } catch (err: any) { toast("error", `Upload eșuat: ${file.name}`); }
                      }
                      setDocUploading(false);
                      apiGet<any[]>(`/api/documents/folders/${project?.folderId}/classified-documents`).then(docs => setClassifiedDocs(docs || [])).catch(e => console.warn("[project]", e?.message || e));
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
                            await api(`/api/documents/folders/${project?.folderId}/documents`, { method: "POST", body: fd, timeout: 120000 });
                          } catch (err: any) { toast("error", `Upload eșuat: ${file.name}`); }
                        }
                        setDocUploading(false);
                        apiGet<any[]>(`/api/documents/folders/${project?.folderId}/classified-documents`).then(docs => setClassifiedDocs(docs || [])).catch(e => console.warn("[project]", e?.message || e));
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
                                setTimeout(() => { if (isMountedRef.current) apiGet<any[]>(`/api/documents/folders/${project?.folderId}/classified-documents`).then(docs => { if (isMountedRef.current) setClassifiedDocs(docs || []); }).catch(e => console.warn("[project]", e?.message || e)); }, 2000);
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

          </div>
        </div>
      </div>
    </div>
  );
}
