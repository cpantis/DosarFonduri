"use client";
import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import type { SolomonMessage, SolomonElement, ElementItem, ProjectData, EligibilityRule } from "../types";

const API_URL = "";

interface SolomonTabProps {
  project: ProjectData;
  projectId: string;
  elements: ElementItem[];
  setElements: (v: ElementItem[] | ((prev: ElementItem[]) => ElementItem[])) => void;
  eligibilityRules: EligibilityRule[];
  readOnly: boolean;
  toast: (type: any, msg: string) => void;
  orgLabels: { solomonLabel: string; neemiaLabel: string };
  mapElements: (raw: any[]) => ElementItem[];
  classifiedDocs: any[];
  setClassifiedDocs: (v: any) => void;
  solEligibility: any[];
  setSolEligibility: (v: any) => void;
  solScoring: any[];
  setSolScoring: (v: any) => void;
  solChecklist: any[];
  setSolChecklist: (v: any) => void;
  solomonPhase: any;
  setSolomonPhase: (v: any) => void;
}

export default function SolomonTab({
  project, projectId, elements, setElements, eligibilityRules,
  readOnly, toast, orgLabels, mapElements,
  classifiedDocs, setClassifiedDocs,
  solEligibility, setSolEligibility,
  solScoring, setSolScoring,
  solChecklist, setSolChecklist,
  solomonPhase, setSolomonPhase,
}: SolomonTabProps) {
  // ─── SOLOMON STATE ───
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
  const [solomonAutoScroll, setSolomonAutoScroll] = useState(true);
  const [solomonDragOver, setSolomonDragOver] = useState(false);
  const [solomonTimedOut, setSolomonTimedOut] = useState(false);
  const [solomonToolUse, setSolomonToolUse] = useState<{ toolName: string; query?: string } | null>(null);
  const [solomonSourceTrail, setSolomonSourceTrail] = useState<any[]>([]);
  const [solomonSignals, setSolomonSignals] = useState<any[]>([]);
  const [docUploadFiles, setDocUploadFiles] = useState<File[]>([]);
  const [docUploading, setDocUploading] = useState(false);

  // ─── REFS ───
  const isMountedRef = useRef(true);
  const chatRef = useRef<HTMLDivElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const solomonFileRef = useRef<HTMLInputElement>(null);
  const solomonAbortRef = useRef<AbortController | null>(null);
  const solomonTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── CLEANUP ───
  useEffect(() => {
    isMountedRef.current = true;
    const handler = (e: Event) => setRefineEnabled((e as CustomEvent).detail);
    window.addEventListener("df-refine-toggle", handler);
    return () => {
      isMountedRef.current = false;
      window.removeEventListener("df-refine-toggle", handler);
      if (solomonAbortRef.current) { solomonAbortRef.current.abort(); solomonAbortRef.current = null; }
      if (solomonTimeoutRef.current) { clearTimeout(solomonTimeoutRef.current); solomonTimeoutRef.current = null; }
    };
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    if (solomonAutoScroll && chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [solomonMessages, solomonAutoScroll]);

  // Init conversation on mount
  useEffect(() => {
    if (!solomonConvId) {
      initSolomonConversation();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Solomon chat inline JSX + handlers follow.
  // Due to the massive size (~1500 lines), the handlers and JSX remain inline
  // in page.tsx during this migration phase. The component structure is ready
  // for a full extraction in a dedicated session.

  return (
    <div style={{ padding: 16, textAlign: "center", color: "#64748b" }}>
      <div style={{ fontSize: 13 }}>Solomon tab migration in progress — funcționează inline în page.tsx</div>
    </div>
  );

  // ─── PLACEHOLDER: handler stubs ───
  async function initSolomonConversation(): Promise<string | null> {
    return null; // TODO: migrate from page.tsx
  }
}
