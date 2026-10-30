"use client";
import { useState, useRef, useEffect, useCallback, type Dispatch, type SetStateAction } from "react";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { mapElements } from "@/components/projects/mappers";
import type { SolomonMessage, SolomonElement, ElementItem, ProjectData, LeafType, SolomonPhase } from "@/components/projects/types";
import type { useToast } from "@/components/shared/Toast";

type ToastFn = ReturnType<typeof useToast>["toast"];

const API_URL = "";

/**
 * Solomon chat state + handlers for the project view. Lives in the page (not the panel)
 * so a streaming answer survives switching tabs.
 */
export function useSolomonChat(deps: UseSolomonChatDeps) {
  const {
    projectId, activeLeaf, elements, setElements, setProject, setSolomonPhase, setSolEligibility, setSolScoring, setSolChecklist, readOnly, toast,
  } = deps;

  const [solomonModel, setSolomonModel] = useState<"sonnet" | "opus">("sonnet");
  const [solomonET, setSolomonET] = useState(false);
  const [solomonMessages, setSolomonMessages] = useState<SolomonMessage[]>([]);
  const [solomonInput, setSolomonInput] = useState("");
  const [solomonElements, setSolomonElements] = useState<SolomonElement[]>([]);
  const [solomonConvId, setSolomonConvId] = useState<string | null>(null);
  const [solomonStreaming, setSolomonStreaming] = useState(false);
  const [extractionStates, setExtractionStates] = useState<Record<string, "confirmed" | "rejected">>({});
  const [extractionValidations, setExtractionValidations] = useState<Record<string, any>>({});
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
  const solomonAbortRef = useRef<AbortController | null>(null);
  const [solomonTimedOut, setSolomonTimedOut] = useState(false);
  const solomonTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // RAG v2: Tool use + phase tracking
  const [solomonToolUse, setSolomonToolUse] = useState<{ toolName: string; query?: string } | null>(null);
  // FIX I: Source trail — accumulated per streaming turn
  const [solomonSourceTrail, setSolomonSourceTrail] = useState<Array<{ query: string; sources: Array<{ section?: string; page?: string; docType?: string; layer?: string }> }>>([]);
  // FIX K: Active signals (risks, loops, client discussions)
  const [solomonSignals, setSolomonSignals] = useState<Array<{ signalType: string; message: string; severity: string; phase: string; target?: string; timestamp: string; dismissed?: boolean }>>([]);
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


  return {
    chatBottomRef, chatRef, extractionStates, extractionValidations,
    handleChatScroll, handleConfirmElement, handleConfirmExtraction, handleRefineSubmit,
    handleRejectElement, handleRejectExtraction, handleSolomonModelChange, handleSolomonSend,
    handleSolomonStop, handleSolomonUpload, handleTextSelect, popupRef,
    refineInput, refinePopup, setRefineInput, setSolomonET,
    setSolomonInput, setSolomonMessages, setSolomonSignals, solomonET,
    solomonElements, solomonInput, solomonMessages, solomonModel,
    solomonSignals, solomonSourceTrail, solomonStreaming, solomonTimedOut,
    solomonToolUse,
  };
}

export type SolomonChat = ReturnType<typeof useSolomonChat>;

export interface UseSolomonChatDeps {
  projectId: string;
  activeLeaf: LeafType;
  elements: ElementItem[];
  setElements: Dispatch<SetStateAction<ElementItem[]>>;
  setProject: Dispatch<SetStateAction<ProjectData | null>>;
  setSolomonPhase: Dispatch<SetStateAction<SolomonPhase | null>>;
  setSolEligibility: Dispatch<SetStateAction<any[]>>;
  setSolScoring: Dispatch<SetStateAction<any[]>>;
  setSolChecklist: Dispatch<SetStateAction<any[]>>;
  readOnly: boolean;
  toast: ToastFn;
}
