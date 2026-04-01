"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { api, apiGet, apiPost, apiPut } from "@/lib/api";
import type { SolomonMessage, SolomonElement, ElementItem, ProjectData } from "../types";

const API_URL = "";

interface SolomonTabProps {
  project: ProjectData;
  projectId: string;
  elements: ElementItem[];
  setElements: (v: ElementItem[] | ((prev: ElementItem[]) => ElementItem[])) => void;
  readOnly: boolean;
  isMountedRef: React.RefObject<boolean>;
  solomonAbortRef: React.MutableRefObject<AbortController | null>;
  solomonTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  toast: (type: string, msg: string) => void;
  orgLabels: { solomonLabel: string; neemiaLabel: string };
  mapElements: (raw: any[]) => ElementItem[];
}

/**
 * SolomonTab — AI chat with persistent conversation, tool use, file uploads.
 * Extracted from the monolithic project page.
 * 
 * NOTE: This is a direct extraction of the inline JSX. The state and handlers
 * that power this tab are still in page.tsx. To fully decouple, those would
 * need to be moved here. For now, this component receives all data via props.
 * 
 * TODO: Move Solomon-specific useState/useRef/handlers into this component.
 */
export default function SolomonTab(_props: SolomonTabProps) {
  // PLACEHOLDER: Full Solomon tab extraction requires moving ~25 useState hooks,
  // 6 useRefs, 15 handler functions, and 660 lines of JSX from page.tsx.
  // This is tracked for the next refactoring pass.
  return (
    <div style={{ padding: 24, color: "#64748b", textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>🤖</div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>Solomon Tab</div>
      <div style={{ fontSize: 12, marginTop: 4 }}>Component extraction în progres — Solomon funcționează inline în page.tsx</div>
    </div>
  );
}
