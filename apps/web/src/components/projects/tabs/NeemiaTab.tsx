"use client";
import { useState, useRef, useEffect } from "react";
import { api, apiGet, apiPost, apiPut } from "@/lib/api";
import FormOnDocument from "@/components/documents/FormOnDocument";
import type { ProjectData, ElementItem, NeemiaTemplate, ComposeSection } from "../types";

const API_URL = "";

interface NeemiaTabProps {
  project: ProjectData;
  projectId: string;
  elements: ElementItem[];
  neemiaTemplates: NeemiaTemplate[];
  setNeemiaTemplates: (v: NeemiaTemplate[] | ((prev: NeemiaTemplate[]) => NeemiaTemplate[])) => void;
  readOnly: boolean;
  isMountedRef: React.RefObject<boolean>;
  solomonAbortRef: React.MutableRefObject<AbortController | null>;
  toast: (type: string, msg: string) => void;
  cabinetBranding: any;
  orgLabels: { solomonLabel: string; neemiaLabel: string };
}

/**
 * NeemiaTab — Document generation (fill + compose modes).
 * Extracted from the monolithic project page.
 * 
 * NOTE: This is a placeholder. The full tab requires moving ~30 useState hooks,
 * 2 useRefs, 20 handler functions, and 785 lines of JSX from page.tsx.
 * This is tracked for the next refactoring pass.
 * 
 * TODO: Move Neemia-specific state/handlers into this component.
 */
export default function NeemiaTab(_props: NeemiaTabProps) {
  return (
    <div style={{ padding: 24, color: "#64748b", textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>Neemia Tab</div>
      <div style={{ fontSize: 12, marginTop: 4 }}>Component extraction în progres — Neemia funcționează inline în page.tsx</div>
    </div>
  );
}
