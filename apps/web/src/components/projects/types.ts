/** Shared types for the project view and its tab components. */

export type SolomonMessage = {
  role: "user" | "assistant";
  text: string;
  extractions: Array<{ key: string; label: string; value: string; confidence: number }> | null;
};

export type SolomonElement = {
  key: string; label: string; value: string; source: string; status: "confirmat" | "propus";
};

export type TemplateField = {
  key: string; name: string; value: string | null; source: string | null;
  confirmed: boolean; fieldType: string; group: string | null; templateElementId?: string;
};

export type TemplatePage = {
  num: number; title: string; status: "complete" | "partial" | "empty";
  fields: TemplateField[]; totalFields: number; filledFields: number; confirmedFields: number;
};

export type ComposeSection = {
  marker: string;
  type: "narrative" | "table" | "calculation";
  label: string;
  content?: string;
  tableData?: {
    headers: Array<{ key: string; label: string }>;
    rows: Array<Record<string, any>>;
    highlightRows?: number[];
    footerRow?: Record<string, any>;
    caption?: string;
    headerColor?: string;
  };
  approved: boolean;
};

export type NeemiaTemplate = {
  id: string;
  name: string;
  type: string;
  pages: TemplatePage[];
  totalFields: number;
  filledFields: number;
  templateDocumentId: string;
  status: string;
  downloadUrl: string | null;
  generationMode?: "fill" | "compose";
  composeSections?: ComposeSection[];
};

export type EligibilityRule = {
  id: string;
  ruleId?: string;
  name: string;
  status: "pass" | "fail" | "pending";
  detail: string;
  type: "fixed" | "interpreted";
  confidence?: number;
  page?: number;
  section?: string;
  category?: string;
  condition?: any;
  needsReview?: boolean;
  sourceDocument?: { id: string; name: string; fileType: string } | null;
  hasReferenceData?: boolean;
  referenceTableNames?: string[];
  isPreEligibility?: boolean;
};

export type LinkedElementWithValue = {
  elementKey: string;
  displayName: string;
  category: string | null;
  role: string;
  value: any;
  isMissing: boolean;
};

export type GuideRule = {
  id: string;
  ruleId?: string;
  type: "fixed" | "interpreted";
  text: string;
  confidence: number;
  page: number;
  section: string;
  category: string;
  sourceText: string | null;
  condition: any;
  semanticTags: string[];
  validated: boolean;
  needsReview: boolean;
  sourceDocument: { id: string; name: string; fileType: string } | null;
  linkedElements?: LinkedElementWithValue[];
};

export type ElementItem = {
  id: string;
  key: string;
  label: string;
  value: string | null;
  status: "confirmat" | "propus_ai" | "gol" | "conflict";
  confidence: number;
  source: string | null;
  sourceLabel: string | null;
  sourceDocName: string | null;
  templates: string[];
  category: string;
  required: boolean;
  validationStatus: string | null;
  validationDetails: any;
};

export type ChecklistItem = {
  id: string;
  name: string;
  category: string;
  source: string;
  templateId: string | null;
  templateName: string | null;
  done: boolean;
  notes: string | null;
};

export type ProjectData = {
  id: string;
  name: string;
  status: string;
  valoare: string | null;
  company: {
    id: string;
    cui: string;
    denumire: string;
    formaJuridica: string;
    caen: string;
    adresa: string;
    capitalSocial?: string;
    cifraAfaceri?: string;
    onrcRawData?: any;
  } | null;
  programPath: { program: string; masura: string; sesiune: string };
  elements: any[];
  eligibility: any[];
  generatedDocs: any[];
  checklist: any[];
  programFinantare: string | null;
  codMasura: string | null;
  codSesiune: string | null;
  codNomenclator: string | null;
  prefixDocumente: string | null;
  codMysmis: string | null;
  structuraDosar: string | null;
  tipProiect: string | null;
  folderId?: string;
  solomonPhase?: { phase: string; label: string; progress: number; nextAction: string } | null;
  composeBrief?: any;
};

export type LeafType = "sumar" | "solomon" | "elemente" | "reguli" | "scor" | "tabele" | "checklist" | "neemia";

export const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "Ciornă", color: "#64748b", bg: "#f0f2f5" },
  in_progress: { label: "În lucru", color: "#2563eb", bg: "#eff6ff" },
  review: { label: "Verificare", color: "#d97706", bg: "#fffbeb" },
  submitted: { label: "Depus", color: "#059669", bg: "#ecfdf5" },
};

export const SOURCE_LABELS: Record<string, string> = {
  onrc: "ONRC",
  onrc_auto: "ONRC Auto",
  anaf_auto: "ANAF",
  solomon: "Solomon",
  solomon_chat: "Solomon Chat",
  manual: "Manual",
  consultant_manual: "Consultant",
  calculated: "Calculat",
  derived: "Derivat",
  document_extracted: "Document",
  ghid: "Ghid",
};

export const CATEGORY_LABELS: Record<string, string> = {
  beneficiary: "Beneficiar",
  farm: "Exploatație",
  investment: "Investiție",
  location: "Locație",
  financial: "Financiar",
  legal: "Juridic",
  technical: "Tehnic",
  other: "Altele",
};

export const CATEGORY_ICONS: Record<string, string> = {
  beneficiary: "👤",
  farm: "🌾",
  investment: "📦",
  location: "📍",
  financial: "💰",
  legal: "⚖️",
  technical: "⚙️",
  other: "📎",
};

/** Helper: format RON currency */
export function formatRON(v: number | string | null | undefined): string {
  if (!v) return "-";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "-";
  return new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON", maximumFractionDigits: 0 }).format(n);
}

/** Helper: calculate percentage */
export function pct(a: number, b: number): string {
  if (b === 0) return "0%";
  return `${Math.round((a / b) * 100)}%`;
}
