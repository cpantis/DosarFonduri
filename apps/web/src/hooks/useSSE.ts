"use client";
import { useEffect, useRef, useCallback, useState } from "react";
import { useToast } from "@/components/shared/Toast";

interface SSEEvent {
  event: string;
  data: any;
}

interface ExtractionProgress {
  documentId: string;
  documentName: string;
  documentType: string;
  extractedFields: Array<{ key: string; value: any; confidence: number }>;
  totalFields: number;
  completed: boolean;
}

interface UseSSEOptions {
  projectId?: string;
  enabled?: boolean;
  onEvent?: (event: SSEEvent) => void;
}

/**
 * Hook that connects to the SSE event stream endpoint.
 * Automatically shows toast notifications for key events.
 */
export function useSSE({ projectId, enabled = true, onEvent }: UseSSEOptions = {}) {
  const { toast } = useToast();
  const eventSourceRef = useRef<EventSource | null>(null);
  const [connected, setConnected] = useState(false);
  const [jobProgress, setJobProgress] = useState<Map<string, { progress: number; message: string; status: string }>>(new Map());
  const [extractionProgress, setExtractionProgress] = useState<Map<string, ExtractionProgress>>(new Map());
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const connect = useCallback(() => {
    if (!enabled) return;

    const token = typeof window !== "undefined" ? localStorage.getItem("df-token") : null;
    if (!token) return;

    const url = `/api/events${projectId ? `?projectId=${projectId}` : ""}`;

    // EventSource doesn't support custom headers, so we use fetch-based SSE
    const controller = new AbortController();

    fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "text/event-stream",
      },
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok || !response.body) {
        throw new Error(`SSE connection failed: ${response.status}`);
      }

      setConnected(true);
      reconnectAttemptsRef.current = 0;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent = "";
        let currentData = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            currentData = line.slice(6).trim();
          } else if (line === "" && currentEvent && currentData) {
            try {
              const data = JSON.parse(currentData);
              handleEvent(currentEvent, data);
              onEvent?.({ event: currentEvent, data });
            } catch {}
            currentEvent = "";
            currentData = "";
          }
        }
      }
    }).catch((err) => {
      if (err.name === "AbortError") return;
      setConnected(false);
      scheduleReconnect();
    });

    eventSourceRef.current = { close: () => controller.abort() } as any;
  }, [enabled, projectId]);

  const handleEvent = useCallback((event: string, data: any) => {
    switch (event) {
      case "document_processed":
        toast("success", data.message || `Document procesat: ${data.documentName}`);
        break;
      case "document_failed":
        if (data.willRetry) {
          toast("warning", data.message || `Eroare la procesare (se reîncearcă)...`);
        } else {
          toast("error", data.message || `Eroare la procesarea documentului`);
        }
        break;
      case "document_uploaded":
        toast("info", data.message || `Document încărcat: ${data.documentName}`);
        break;
      case "eligibility_updated":
        toast("info", data.message || `Eligibilitate actualizată: ${data.passed}/${data.total}`);
        break;
      case "element_validated":
        // Don't toast for every element — too noisy
        break;
      case "score_updated":
        toast("info", data.message || `Punctaj actualizat: ${data.percentage}%`);
        break;
      case "extraction_started":
        setExtractionProgress(prev => {
          const next = new Map(prev);
          next.set(data.documentId, {
            documentId: data.documentId,
            documentName: data.documentName,
            documentType: data.documentType,
            extractedFields: [],
            totalFields: 0,
            completed: false,
          });
          return next;
        });
        break;
      case "field_extracted":
        setExtractionProgress(prev => {
          const next = new Map(prev);
          const existing = next.get(data.documentId);
          const fields = existing?.extractedFields || [];
          // Avoid duplicates
          if (!fields.some(f => f.key === data.fieldKey)) {
            fields.push({ key: data.fieldKey, value: data.fieldValue, confidence: data.confidence });
          }
          next.set(data.documentId, {
            documentId: data.documentId,
            documentName: data.documentName || existing?.documentName || "",
            documentType: data.documentType || existing?.documentType || "",
            extractedFields: fields,
            totalFields: data.totalFields || existing?.totalFields || 0,
            completed: fields.length >= (data.totalFields || 0),
          });
          return next;
        });
        break;
      case "extraction_complete":
        setExtractionProgress(prev => {
          const next = new Map(prev);
          const existing = next.get(data.documentId);
          if (existing) {
            next.set(data.documentId, { ...existing, completed: true });
            // Clean up after 8s
            setTimeout(() => {
              setExtractionProgress(p => {
                const n = new Map(p);
                n.delete(data.documentId);
                return n;
              });
            }, 8000);
          }
          return next;
        });
        toast("success", data.message || `Extracție completă: ${data.fields_count} câmpuri`);
        break;
      case "company_processed":
        toast("success", data.message || `Firmă procesată cu succes`);
        break;
      case "company_processing_failed":
        toast("error", data.message || `Eroare la procesarea firmei`);
        break;
      case "elements_updated":
        toast("info", data.message || `${data.updatedCount} elemente actualizate`);
        break;
      case "job_progress":
        setJobProgress(prev => {
          const next = new Map(prev);
          next.set(data.jobId || data.documentId, {
            progress: data.progress,
            message: data.message,
            status: data.status,
          });
          // Clean up completed/failed jobs after 5s
          if (data.status === "completed" || data.status === "failed") {
            setTimeout(() => {
              setJobProgress(p => {
                const n = new Map(p);
                n.delete(data.jobId || data.documentId);
                return n;
              });
            }, 5000);
          }
          return next;
        });
        break;
    }
  }, [toast]);

  const scheduleReconnect = useCallback(() => {
    const attempt = reconnectAttemptsRef.current;
    if (attempt >= 5) return; // max 5 reconnect attempts

    const delay = Math.min(1000 * Math.pow(2, attempt), 30000); // exponential backoff, max 30s
    reconnectTimerRef.current = setTimeout(() => {
      reconnectAttemptsRef.current++;
      connect();
    }, delay);
  }, [connect]);

  useEffect(() => {
    connect();
    return () => {
      if (eventSourceRef.current) {
        (eventSourceRef.current as any).close?.();
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, [connect]);

  return {
    connected,
    jobProgress: Array.from(jobProgress.entries()).map(([id, info]) => ({ id, ...info })),
    extractionProgress: Array.from(extractionProgress.values()),
  };
}
