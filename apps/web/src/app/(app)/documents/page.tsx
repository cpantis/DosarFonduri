"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { SplitPane } from "@/components/layout/SplitPane";
import { PageHeader } from "@/components/ui/PageHeader";
import { FolderUploadButton } from "@/components/shared/FolderUploadButton";
import { apiGet, apiPost, apiPut, apiDelete, api } from "@/lib/api";
import { useSSE } from "@/hooks/useSSE";
import { useToast } from "@/components/shared/Toast";
import { useAuth } from "@/hooks/useAuth";
import { SessionLibrary } from "@/components/documents/SessionLibrary";

/* ══════════════════════════════════════════
   INTERFACES
   ══════════════════════════════════════════ */

interface TreeNode {
  id: string;
  label: string;
  type: "program" | "masura" | "sesiune" | "ghiduri" | "templateuri" | "clienti_prospecti" | "clienti_finali" | "folder" | "biblioteca";
  children?: TreeNode[];
}

interface ApiFolderNode {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
  position: number;
  children: ApiFolderNode[];
}

interface ApiDocument {
  id: string;
  name: string;
  fileType: "pdf" | "docx" | "xlsx" | "doc" | "png" | "jpg";
  fileSize: number;
  status: "uploaded" | "processing" | "processed" | "error" | "failed";
  processingType: "ghid" | "template" | "reference" | "reference_data" | "client_doc";
  documentTypeClass: string | null;
  classificationConfidence: string | null;
  pageCount: number | null;
  processingResult: {
    document_type: string;
    extracted_fields: Array<{
      field_key: string;
      field_value: any;
      confidence: number;
      source_page: number | null;
      extraction_method: string;
    }>;
    raw_text: string;
    processing_time_ms: number;
  } | null;
  generationMode: "fill" | "compose" | null;
  tags: string[];
  uploadedAt: string;
  uploadedBy: string;
  _uploadedByName?: string | null;
  processingError: string | null;
  _summary?: {
    rulesCount?: number;
    scoringCount?: number;
    elementsCount?: number;
    fieldsCount?: number;
    trustScore?: number | null;
    completenessReport?: any;
  };
}

interface DocItem {
  id: string;
  name: string;
  type: "PDF" | "DOCX" | "XLSX" | "DOC" | "PNG" | "JPG";
  size: string;
  uploaded: string;
  uploadedBy: string;
  status: "procesat" | "neprocesat" | "procesare" | "template" | "referință" | "eroare";
  processingType: string | null;
  reguliExtrase: number;
  campuri?: number;
  tags: string[];
  documentTypeClass: string | null;
  classificationConfidence: number | null;
  pageCount: number | null;
  extractedFields: Array<{ field_key: string; field_value: any; confidence: number }>;
  processingError: string | null;
  generationMode: "fill" | "compose" | null;
  processingTimeMs: number | null;
  summary?: {
    rulesCount?: number;
    scoringCount?: number;
    elementsCount?: number;
    fieldsCount?: number;
    trustScore?: number | null;
    completenessReport?: any;
  };
}

/* ══════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════ */

const TYPE_ICONS: Record<string, string> = { PDF: "📕", DOCX: "📘", XLSX: "📗", DOC: "📘", PNG: "🖼", JPG: "🖼" };

const STATUS_MAP: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  procesat: { label: "Procesat AI", color: "#34d399", bg: "rgba(52,211,153,.1)", icon: "\u2713" },
  neprocesat: { label: "Neprocesat", color: "#64748b", bg: "#f8fafc", icon: "\u23F3" },
  procesare: { label: "Procesare AI...", color: "#fbbf24", bg: "rgba(251,191,36,.1)", icon: "\u2699" },
  template: { label: "Template", color: "#4d8bff", bg: "rgba(77,139,255,.1)", icon: "📝" },
  "referință": { label: "Referință", color: "#a78bfa", bg: "rgba(167,139,250,.1)", icon: "📌" },
  eroare: { label: "Eroare", color: "#f87171", bg: "rgba(248,113,113,.1)", icon: "\u26A0" },
};

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  guide: "Ghid solicitant",
  guide_annex_table: "Anexa ghid (tabele)",
  guide_annex_form: "Anexa ghid (formular)",
  certificat_constatator: "Certificat constatator",
  bilant_anaf: "Bilant ANAF",
  contract_arenda: "Contract arenda",
  oferta_pret: "Oferta de pret",
  registru_imobilizari: "Registru imobilizari",
  declaratie_expert_contabil: "Declaratie expert contabil",
  document_mediu: "Document de mediu",
  extras_cont: "Extras de cont",
  certificat_fiscal: "Certificat fiscal",
  memoriu_template: "Template memoriu",
  cerere_finantare_template: "Template cerere finantare",
  anexa_b_template: "Template Anexa B",
  anexa_c_template: "Template Anexa C",
  carte_identitate: "Carte de identitate",
  diploma_studii: "Diploma studii",
  act_constitutiv: "Act constitutiv",
  statut: "Statut societate",
  descriere_proiect: "Descriere proiect",
  adeverinta: "Adeverinta",
  foto_echipament: "Foto echipament",
  other: "Alt document",
};

const NODE_ICONS: Record<string, string> = {
  ghiduri: "📖",
  templateuri: "📝",
  clienti_prospecti: "🔍",
  clienti_finali: "\u2705",
  biblioteca: "📚",
};

const NODE_DOTS: Record<string, { size: number; color: string }> = {
  program: { size: 12, color: "#003399" },
  masura: { size: 8, color: "#C9A84C" },
  sesiune: { size: 6, color: "#888888" },
};

/* ══════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════ */

function mapApiStatusToLocal(status: ApiDocument["status"], processingType: ApiDocument["processingType"]): DocItem["status"] {
  if (status === "error" || status === "failed") return "eroare";
  if (status === "processing") return "procesare";
  if (processingType === "template") return "template";
  if (processingType === "reference" || processingType === "reference_data") return "referință";
  if (status === "processed") return "procesat";
  return "neprocesat";
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1_000_000) return (bytes / 1_000_000).toFixed(1) + " MB";
  if (bytes >= 1_000) return (bytes / 1_000).toFixed(0) + " KB";
  return bytes + " B";
}

function mapApiDocToLocal(doc: ApiDocument): DocItem {
  const visibleFields = doc.processingResult?.extracted_fields?.filter(f => !f.field_key.startsWith("_")) || [];
  const summary = doc._summary;
  return {
    id: doc.id,
    name: doc.name,
    type: doc.fileType.toUpperCase() as DocItem["type"],
    size: formatFileSize(doc.fileSize),
    uploaded: doc.uploadedAt ? doc.uploadedAt.slice(0, 10) : "",
    uploadedBy: doc._uploadedByName || doc.uploadedBy || "",
    status: mapApiStatusToLocal(doc.status, doc.processingType),
    processingType: doc.processingType || null,
    reguliExtrase: summary?.rulesCount || 0,
    campuri: summary?.fieldsCount ?? (doc.processingType === "template" ? 0 : undefined),
    tags: doc.tags || [],
    documentTypeClass: doc.documentTypeClass || null,
    classificationConfidence: doc.classificationConfidence ? parseFloat(doc.classificationConfidence) : null,
    pageCount: doc.pageCount || null,
    extractedFields: visibleFields,
    processingError: doc.processingError || null,
    generationMode: doc.generationMode || null,
    processingTimeMs: doc.processingResult?.processing_time_ms ?? null,
    summary,
  };
}

function mapApiFolderToTreeNode(folder: ApiFolderNode): TreeNode {
  const children = folder.children?.length ? folder.children.map(mapApiFolderToTreeNode) : undefined;

  // Inject "Biblioteca Sesiune" virtual node as first child of sesiune folders
  if (folder.type === "sesiune" && children) {
    const bibliotecaNode: TreeNode = {
      id: `biblioteca_${folder.id}`,
      label: "Biblioteca Sesiune",
      type: "biblioteca",
    };
    return {
      id: folder.id,
      label: folder.name,
      type: "sesiune",
      children: [bibliotecaNode, ...children],
    };
  }

  return {
    id: folder.id,
    label: folder.name,
    type: (folder.type || "folder") as TreeNode["type"],
    children,
  };
}

/* ══════════════════════════════════════════
   TREE HELPERS
   ══════════════════════════════════════════ */

function updateNodeInTree(nodes: TreeNode[], targetId: string, updater: (n: TreeNode) => TreeNode): TreeNode[] {
  return nodes.map(n => {
    if (n.id === targetId) return updater(n);
    if (n.children) return { ...n, children: updateNodeInTree(n.children, targetId, updater) };
    return n;
  });
}

function removeNodeFromTree(nodes: TreeNode[], targetId: string): TreeNode[] {
  return nodes.filter(n => n.id !== targetId).map(n =>
    n.children ? { ...n, children: removeNodeFromTree(n.children, targetId) } : n
  );
}

function addChildToNode(nodes: TreeNode[], parentId: string, child: TreeNode): TreeNode[] {
  return nodes.map(n => {
    if (n.id === parentId) return { ...n, children: [...(n.children || []), child] };
    if (n.children) return { ...n, children: addChildToNode(n.children, parentId, child) };
    return n;
  });
}

function getBreadcrumb(nodes: TreeNode[], targetId: string, path: string[] = []): string[] | null {
  for (const node of nodes) {
    const newPath = [...path, node.label];
    if (node.id === targetId) return newPath;
    if (node.children) {
      const r = getBreadcrumb(node.children, targetId, newPath);
      if (r) return r;
    }
  }
  return null;
}

function findNodeById(nodes: TreeNode[], id: string): TreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const found = findNodeById(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

/* Leaf folder types — only these accept document uploads */
const LEAF_TYPES = new Set<string>(["ghiduri", "templateuri", "clienti_prospecti", "clienti_finali"]);

/* What child type can be created under each parent type */
const CHILD_TYPE_MAP: Record<string, { type: TreeNode["type"]; label: string; defaultName: string }> = {
  program: { type: "masura", label: "Adauga masura", defaultName: "Masura noua" },
  masura: { type: "sesiune", label: "Adauga sesiune", defaultName: "Sesiune noua" },
};

/* The 4 leaf folders auto-created inside each sesiune */
const SESIUNE_LEAVES: Array<{ type: TreeNode["type"]; name: string }> = [
  { type: "ghiduri", name: "Ghiduri" },
  { type: "templateuri", name: "Template-uri" },
  { type: "clienti_prospecti", name: "Clienti Prospecti" },
  { type: "clienti_finali", name: "Clienti Finali" },
];

/* Folder types that are leaf nodes but can't have manual uploads */
const CLIENT_FOLDER_TYPES = new Set(["clienti_prospecti", "clienti_finali"]);

/* ══════════════════════════════════════════
   SKELETON COMPONENTS
   ══════════════════════════════════════════ */

function TreeSkeleton() {
  return (
    <div className="doc-skeleton-wrap">
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} className="doc-skel-row" style={{ paddingLeft: 12 + (i > 0 ? (i > 2 ? 36 : 18) : 0), animationDelay: `${i * 80}ms` }}>
          <div className="doc-skel-dot" style={{ width: i === 0 ? 12 : i <= 2 ? 8 : 6 }} />
          <div className="doc-skel-bar" style={{ width: `${60 + Math.random() * 30}%` }} />
        </div>
      ))}
    </div>
  );
}

function DocListSkeleton() {
  return (
    <div className="doc-skeleton-wrap" style={{ padding: "12px 24px", gap: 8 }}>
      {[0, 1, 2].map(i => (
        <div key={i} className="doc-skel-card" style={{ animationDelay: `${i * 100}ms` }}>
          <div className="doc-skel-icon" />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="doc-skel-bar" style={{ width: "70%", height: 14 }} />
            <div className="doc-skel-bar" style={{ width: "45%", height: 10 }} />
          </div>
          <div className="doc-skel-bar" style={{ width: 70, height: 20, borderRadius: 10 }} />
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════
   PAGE COMPONENT
   ══════════════════════════════════════════ */

export default function DocumentsPage() {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [docRules, setDocRules] = useState<Record<string, any[]>>({});
  const [docRulesLoading, setDocRulesLoading] = useState<Record<string, boolean>>({});
  const [docCriteria, setDocCriteria] = useState<Record<string, any[]>>({});
  const [docElements, setDocElements] = useState<Record<string, any[]>>({});
  const [tplElements, setTplElements] = useState<Record<string, { elements: any[]; total: number; mapped: number; unmapped: number } | null>>({});
  const [expandedTab, setExpandedTab] = useState<Record<string, string>>({});
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewName, setPdfPreviewName] = useState<string>("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ doc: DocItem } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const replaceFileRef = useRef<HTMLInputElement>(null);
  const [replaceDocId, setReplaceDocId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  // ─── Folder structure lock ───
  const [folderLock, setFolderLock] = useState<{
    locked: boolean;
    lockedBy: string | null;
    lockedByName: string | null;
    isMe: boolean;
  }>({ locked: false, lockedBy: null, lockedByName: null, isMe: false });
  const [lockFeatureAvailable, setLockFeatureAvailable] = useState(true);
  const [lockLoading, setLockLoading] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Whether the current user can edit folder structure
  // If lock feature is not available (migration not run), allow all edits
  const canEditStructure = !lockFeatureAvailable || (folderLock.locked && folderLock.isMe);

  // Fetch lock status on mount
  useEffect(() => {
    apiGet<{ locked: boolean; lockedBy: string | null; lockedByName: string | null; isMe: boolean }>("/api/documents/structure-lock")
      .then(data => {
        setFolderLock(data);
        setLockFeatureAvailable(true);
      })
      .catch(() => {
        // Endpoint not deployed or migration not run — disable lock feature
        setLockFeatureAvailable(false);
      });
  }, []);

  // Heartbeat while we hold the lock
  useEffect(() => {
    if (!canEditStructure) {
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
      return;
    }
    heartbeatRef.current = setInterval(() => {
      apiPost("/api/documents/structure-lock/heartbeat", {}).catch(() => {
        // Lock lost — refresh status
        apiGet<{ locked: boolean; lockedBy: string | null; lockedByName: string | null; isMe: boolean }>("/api/documents/structure-lock")
          .then(setFolderLock).catch(() => {});
      });
    }, 5 * 60 * 1000); // every 5 minutes
    return () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current); };
  }, [canEditStructure]);

  // Release lock on page unload
  useEffect(() => {
    if (!canEditStructure) return;
    const release = () => {
      navigator.sendBeacon("/api/documents/structure-lock/release",
        new Blob([JSON.stringify({})], { type: "application/json" }));
    };
    window.addEventListener("beforeunload", release);
    return () => window.removeEventListener("beforeunload", release);
  }, [canEditStructure]);

  const toggleFolderLock = useCallback(async () => {
    setLockLoading(true);
    try {
      if (canEditStructure) {
        // Release
        await apiDelete("/api/documents/structure-lock");
        setFolderLock({ locked: false, lockedBy: null, lockedByName: null, isMe: false });
      } else {
        // Acquire
        await apiPost("/api/documents/structure-lock", {});
        setFolderLock({ locked: true, lockedBy: user?.id || null, lockedByName: user?.name || null, isMe: true });
      }
    } catch (err: any) {
      toast("error", err.message || "Nu s-a putut modifica lock-ul");
      // Refresh actual status
      apiGet<{ locked: boolean; lockedBy: string | null; lockedByName: string | null; isMe: boolean }>("/api/documents/structure-lock")
        .then(setFolderLock).catch(() => {});
    } finally {
      setLockLoading(false);
    }
  }, [canEditStructure, user, toast]);

  // Fetch folder tree on mount
  const fetchTree = useCallback(async () => {
    try {
      setTreeLoading(true);
      const data = await apiGet<ApiFolderNode[]>("/api/documents/folders");
      const mapped = data.map(mapApiFolderToTreeNode);
      setTree(mapped);
      const expanded: Record<string, boolean> = {};
      mapped.forEach(n => { expanded[n.id] = true; });
      setExpandedNodes(prev => ({ ...expanded, ...prev }));
    } catch (err) {
      console.error("Failed to fetch folder tree:", err);
    } finally {
      setTreeLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  // Fetch documents when selectedFolder changes
  const fetchDocs = useCallback(async (folderId: string) => {
    try {
      setDocsLoading(true);
      const data = await apiGet<ApiDocument[]>(`/api/documents/folders/${folderId}/documents`);
      setDocs(data.map(mapApiDocToLocal));
    } catch (err) {
      console.error("Failed to fetch documents:", err);
      setDocs([]);
    } finally {
      setDocsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedFolder) {
      const node = findNodeById(tree, selectedFolder);
      if (node && LEAF_TYPES.has(node.type)) {
        fetchDocs(selectedFolder);
      } else {
        setDocs([]);
      }
    } else {
      setDocs([]);
    }
  }, [selectedFolder, fetchDocs, tree]);

  // Close context menu on click outside
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [ctxMenu]);

  // Poll for status updates when documents are processing
  useEffect(() => {
    const hasProcessing = docs.some(d => d.status === "procesare");
    if (!hasProcessing || !selectedFolder) return;
    const interval = setInterval(() => fetchDocs(selectedFolder), 5000);
    return () => clearInterval(interval);
  }, [docs, selectedFolder, fetchDocs]);

  // SSE: instant refetch when a document finishes processing + real-time progress
  const selectedFolderRef = useRef(selectedFolder);
  selectedFolderRef.current = selectedFolder;
  const { jobProgress: sseJobProgress } = useSSE({
    enabled: true,
    onEvent: useCallback((ev: { event: string; data: any }) => {
      if (
        (ev.event === "document_processed" || ev.event === "document_failed") &&
        selectedFolderRef.current
      ) {
        fetchDocs(selectedFolderRef.current);
      }
      // Folder structure lock/unlock events from other users
      if (ev.event === "folder_structure_lock") {
        const d = ev.data as { locked: boolean; lockedBy: string | null; lockedByName: string | null };
        setFolderLock({
          locked: d.locked,
          lockedBy: d.lockedBy,
          lockedByName: d.lockedByName,
          isMe: d.lockedBy === user?.id,
        });
      }
    }, [fetchDocs, user?.id]),
  });

  // Build a lookup: documentId → { progress, message, status }
  // SSE stores by jobId (e.g. "doc-abc123") — we also index by raw documentId
  const jobProgressMap = new Map<string, { progress: number; message: string; status: string }>();
  for (const jp of sseJobProgress) {
    const entry = { progress: jp.progress, message: jp.message, status: jp.status };
    jobProgressMap.set(jp.id, entry);
    // Also index by documentId extracted from jobId format "doc-{uuid}"
    if (jp.id.startsWith("doc-")) {
      jobProgressMap.set(jp.id.slice(4), entry);
    }
  }

  // Keyboard shortcut: Ctrl+K to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const toggleNode = useCallback((id: string) => {
    setExpandedNodes(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleCreateChild = useCallback(async (parentId: string) => {
    const parentNode = findNodeById(tree, parentId);
    if (!parentNode) return;

    const childInfo = CHILD_TYPE_MAP[parentNode.type];
    if (!childInfo) return;

    try {
      const result = await apiPost<ApiFolderNode>("/api/documents/folders", {
        name: childInfo.defaultName,
        type: childInfo.type,
        parentId,
      });
      let newNode = mapApiFolderToTreeNode(result);

      // If we just created a sesiune, auto-create the 4 leaf folders inside it
      if (childInfo.type === "sesiune") {
        const leafChildren: TreeNode[] = [];
        for (const leaf of SESIUNE_LEAVES) {
          try {
            const leafResult = await apiPost<ApiFolderNode>("/api/documents/folders", {
              name: leaf.name,
              type: leaf.type,
              parentId: result.id,
            });
            leafChildren.push(mapApiFolderToTreeNode(leafResult));
          } catch (err) {
            console.error(`Failed to create leaf folder ${leaf.name}:`, err);
          }
        }
        newNode = { ...newNode, children: leafChildren };
      }

      setTree(prev => addChildToNode(prev, parentId, newNode));
      setExpandedNodes(prev => ({ ...prev, [parentId]: true, [newNode.id]: true }));
      setRenaming(newNode.id);
      setRenameVal(childInfo.defaultName);
    } catch (err: any) {
      toast("error", `Eroare la crearea folderului: ${err.message || "necunoscută"}`);
    }
    setCtxMenu(null);
  }, [tree, toast]);

  const handleRename = useCallback((nodeId: string) => {
    const findLabel = (nodes: TreeNode[]): string | null => {
      for (const n of nodes) {
        if (n.id === nodeId) return n.label;
        if (n.children) { const r = findLabel(n.children); if (r) return r; }
      }
      return null;
    };
    setRenameVal(findLabel(tree) || "");
    setRenaming(nodeId);
    setCtxMenu(null);
  }, [tree]);

  const commitRename = useCallback(async () => {
    if (renaming && renameVal.trim()) {
      try {
        await apiPut(`/api/documents/folders/${renaming}`, { name: renameVal.trim() });
        setTree(prev => updateNodeInTree(prev, renaming, n => ({ ...n, label: renameVal.trim() })));
      } catch (err: any) {
        toast("error", `Eroare la redenumire: ${err.message || "necunoscută"}`);
      }
    }
    setRenaming(null);
    setRenameVal("");
  }, [renaming, renameVal, toast]);

  const handleDelete = useCallback(async (nodeId: string) => {
    try {
      await apiDelete(`/api/documents/folders/${nodeId}`);
      if (selectedFolder === nodeId) setSelectedFolder(null);
      setTree(prev => removeNodeFromTree(prev, nodeId));
    } catch (err: any) {
      toast("error", `Eroare la ștergerea folderului: ${err.message || "necunoscută"}`);
    }
    setCtxMenu(null);
  }, [selectedFolder, toast]);

  const handleContextMenu = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canEditStructure) return; // Structure is locked — no context menu
    setCtxMenu({ x: e.clientX, y: e.clientY, nodeId });
  }, [canEditStructure]);

  const handleDocDeleteRequest = useCallback((doc: DocItem) => {
    setDeleteConfirm({ doc });
  }, []);

  const handleDocDeleteConfirm = useCallback(async () => {
    if (!deleteConfirm) return;
    const docId = deleteConfirm.doc.id;
    setDeleteLoading(true);
    try {
      await apiDelete(`/api/documents/documents/${docId}`);
      setDocs(prev => prev.filter(d => d.id !== docId));
      if (selectedDoc === docId) setSelectedDoc(null);
      toast("success", "Document șters cu succes.");
    } catch (err: any) {
      console.error("Failed to delete document:", err);
      const msg = err?.response?.error || err?.message || "Eroare necunoscută";
      toast("error", `Nu s-a putut șterge documentul: ${msg}`);
    } finally {
      setDeleteLoading(false);
      setDeleteConfirm(null);
    }
  }, [deleteConfirm, selectedDoc, toast]);

  const handleDocReplace = useCallback((docId: string) => {
    setReplaceDocId(docId);
    setTimeout(() => replaceFileRef.current?.click(), 0);
  }, []);

  const handleReplaceFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !replaceDocId) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      setDocs(prev => prev.map(d => d.id === replaceDocId ? { ...d, status: "procesare" as const } : d));
      await api(`/api/documents/documents/${replaceDocId}/replace`, {
        method: "POST",
        body: formData,
      });
      toast("success", "Fișier înlocuit — procesare pornită.");
      if (selectedFolder) {
        setTimeout(() => fetchDocs(selectedFolder), 2000);
      }
    } catch (err: any) {
      console.error("Failed to replace document:", err);
      toast("error", err.message || "Înlocuirea fișierului a eșuat.");
      setDocs(prev => prev.map(d => d.id === replaceDocId ? { ...d, status: "eroare" as const } : d));
    } finally {
      setReplaceDocId(null);
      e.target.value = "";
    }
  }, [replaceDocId, selectedFolder, fetchDocs, toast]);

  const handleDocDownload = useCallback(async (docId: string) => {
    try {
      const detail = await apiGet<{ downloadUrl: string }>(`/api/documents/documents/${docId}`);
      if (detail.downloadUrl) {
        window.open(detail.downloadUrl, "_blank");
      }
    } catch (err) {
      console.error("Failed to get download URL:", err);
    }
  }, []);

  const handleDocPreview = useCallback(async (docId: string) => {
    try {
      const detail = await apiGet<{ downloadUrl: string; name: string }>(`/api/documents/documents/${docId}`);
      if (detail.downloadUrl) {
        setPdfPreviewUrl(detail.downloadUrl);
        setPdfPreviewName(detail.name || "Document");
      }
    } catch (err) {
      console.error("Failed to get preview URL:", err);
    }
  }, []);

  const toggleExpandCard = useCallback(async (docId: string) => {
    const wasExpanded = expandedCards[docId];
    setExpandedCards(prev => ({ ...prev, [docId]: !prev[docId] }));
    // Fetch rules, criteria, elements on first expand
    if (!wasExpanded && !docRules[docId] && !docRulesLoading[docId]) {
      setDocRulesLoading(prev => ({ ...prev, [docId]: true }));
      const doc = docs.find(d => d.id === docId);
      try {
        const [rules, criteria, elements] = await Promise.all([
          apiGet<any[]>(`/api/rules/documents/${docId}/rules`).catch(() => []),
          apiGet<any[]>(`/api/documents/documents/${docId}/scoring-summary`).catch(() => []),
          apiGet<any[]>(`/api/documents/documents/${docId}/elements-summary`).catch(() => []),
        ]);
        setDocRules(prev => ({ ...prev, [docId]: rules }));
        setDocCriteria(prev => ({ ...prev, [docId]: criteria }));
        setDocElements(prev => ({ ...prev, [docId]: elements }));
        // Fetch template elements for template docs
        if (doc?.processingType === "template") {
          apiGet<{ elements: any[]; total: number; mapped: number; unmapped: number }>(`/api/documents/documents/${docId}/template-elements`)
            .then(data => setTplElements(prev => ({ ...prev, [docId]: data })))
            .catch(() => setTplElements(prev => ({ ...prev, [docId]: { elements: [], total: 0, mapped: 0, unmapped: 0 } })));
        }
      } catch (err) {
        console.error("Failed to fetch document details:", err);
        setDocRules(prev => ({ ...prev, [docId]: [] }));
        setDocCriteria(prev => ({ ...prev, [docId]: [] }));
        setDocElements(prev => ({ ...prev, [docId]: [] }));
      } finally {
        setDocRulesLoading(prev => ({ ...prev, [docId]: false }));
      }
    }
  }, [expandedCards, docRules, docRulesLoading, docs]);

  const handleDocProcess = useCallback(async (docId: string) => {
    try {
      // Optimistic update — show processing status immediately
      setDocs(prev => prev.map(d => d.id === docId ? { ...d, status: "procesare" as const } : d));
      await apiPost(`/api/documents/documents/${docId}/process`, {});
      if (selectedFolder) {
        setTimeout(() => fetchDocs(selectedFolder), 2000);
      }
    } catch (err: any) {
      console.error("Failed to trigger AI processing:", err);
      setDocs(prev => prev.map(d => d.id === docId ? { ...d, status: "eroare" as const } : d));
      toast("error", err.message || "Procesarea documentului nu a putut fi pornită. Încearcă din nou.");
    }
  }, [selectedFolder, fetchDocs, toast]);

  const handleDocSmartReprocess = useCallback(async (docId: string) => {
    if (!confirm("Reactualizezi documentul? Regulile validate rămân, se adaugă doar cele noi sau modificate.")) return;
    try {
      setDocs(prev => prev.map(d => d.id === docId ? { ...d, status: "procesare" as const } : d));
      await apiPost(`/api/documents/documents/${docId}/process`, { mode: "smart" });
      toast("success", "Reactualizare pornită (mod inteligent)");
      if (selectedFolder) {
        setTimeout(() => fetchDocs(selectedFolder), 2000);
      }
    } catch (err: any) {
      console.error("Failed to trigger smart reprocess:", err);
      setDocs(prev => prev.map(d => d.id === docId ? { ...d, status: "eroare" as const } : d));
      toast("error", err.message || "Reactualizarea nu a putut fi pornită.");
    }
  }, [selectedFolder, fetchDocs, toast]);

  // Filtered documents
  const filteredDocs = docs.filter(d => {
    if (!search) return true;
    const q = search.toLowerCase();
    return d.name.toLowerCase().includes(q) || d.type.toLowerCase().includes(q) || d.tags.some(t => t.toLowerCase().includes(q));
  });

  // Detail info is now inline in card — no separate panel needed
  const breadcrumb = selectedFolder ? getBreadcrumb(tree, selectedFolder) || [] : [];
  const selectedNode = selectedFolder ? findNodeById(tree, selectedFolder) : null;
  const isLeafSelected = selectedNode ? LEAF_TYPES.has(selectedNode.type) : false;
  const isClientFolder = selectedNode ? CLIENT_FOLDER_TYPES.has(selectedNode.type) : false;
  const isBiblioteca = selectedNode?.type === "biblioteca";
  const canUpload = isLeafSelected && !isClientFolder;

  // Stats
  const totalDocs = docs.length;
  const procesate = docs.filter(d => d.status === "procesat").length;
  const templates = docs.filter(d => d.status === "template").length;

  /* ─── Tree renderer ─── */
  const renderTree = (nodes: TreeNode[], depth = 0) => nodes.map(node => {
    const hasKids = node.children && node.children.length > 0;
    const isExpanded = expandedNodes[node.id];
    const isSelected = node.id === selectedFolder;
    const isRenaming = renaming === node.id;
    const dot = NODE_DOTS[node.type];
    const icon = NODE_ICONS[node.type];

    return (
      <div key={node.id}>
        <div
          className={`doc-tree-item ${isSelected ? "active" : ""}`}
          style={{ paddingLeft: 12 + depth * 18 }}
          onClick={() => {
            if (hasKids) toggleNode(node.id);
            setSelectedFolder(node.id);
            setSelectedDoc(null);
          }}
          onContextMenu={(e) => handleContextMenu(e, node.id)}
          title={node.label}
        >
          {/* Indentation guide lines */}
          {depth > 0 && (
            <span className="doc-tree-guide" style={{ left: 12 + (depth - 1) * 18 + 7 }} />
          )}

          {hasKids ? (
            <span className={`doc-tree-arrow ${isExpanded ? "expanded" : ""}`}>{"\u25B8"}</span>
          ) : (
            <span className="doc-tree-arrow" style={{ opacity: 0 }}>{"\u25B8"}</span>
          )}

          {dot ? (
            <span className="doc-tree-dot" style={{ width: dot.size, height: dot.size, background: dot.color }} />
          ) : icon ? (
            <span className="doc-tree-icon">{icon}</span>
          ) : (
            <span className="doc-tree-icon">{isExpanded ? "📂" : "📁"}</span>
          )}

          {isRenaming ? (
            <input
              className="doc-tree-rename"
              value={renameVal}
              onChange={e => setRenameVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") { setRenaming(null); setRenameVal(""); }
              }}
              onBlur={commitRename}
              onClick={e => e.stopPropagation()}
              autoFocus
            />
          ) : (
            <span className={`doc-tree-label ${dot ? "doc-tree-label-" + node.type : ""}`}>
              {node.label}
            </span>
          )}
        </div>
        {hasKids && isExpanded && (
          <div className="doc-tree-children">
            {renderTree(node.children!, depth + 1)}
          </div>
        )}
      </div>
    );
  });

  /* ─── Left panel: tree ─── */
  const treePanel = (
    <div className="doc-tree-panel">
      <div className="doc-tree-header">
        <span className="doc-tree-header-icon">{"📂"}</span>
        <span className="doc-tree-header-label">Structura programe</span>
        {lockFeatureAvailable && (
          <>
            <button
              className={`doc-lock-btn ${folderLock.locked && folderLock.isMe ? "doc-lock-btn--unlocked" : ""} ${folderLock.locked && !folderLock.isMe ? "doc-lock-btn--other" : ""}`}
              onClick={folderLock.locked && !folderLock.isMe ? undefined : toggleFolderLock}
              disabled={lockLoading || (folderLock.locked && !folderLock.isMe)}
              title={
                folderLock.locked && folderLock.isMe
                  ? "Click pentru a bloca structura"
                  : folderLock.locked && !folderLock.isMe
                    ? `Structura este editată de ${folderLock.lockedByName || "alt utilizator"}`
                    : "Click pentru a debloca editarea structurii"
              }
            >
              {lockLoading ? (
                <svg width="16" height="16" viewBox="0 0 16 16" className="doc-lock-spinner"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="28" strokeDashoffset="10"><animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="0.8s" repeatCount="indefinite" /></circle></svg>
              ) : folderLock.locked && folderLock.isMe ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              )}
            </button>
            {folderLock.locked && !folderLock.isMe && (
              <span className="doc-lock-info">
                {folderLock.lockedByName || "Alt utilizator"} editează
              </span>
            )}
          </>
        )}
      </div>
      <div className="doc-tree-scroll">
        {treeLoading ? (
          <TreeSkeleton />
        ) : tree.length === 0 ? (
          <div className="doc-empty-rich">
            <div className="doc-empty-illustration">
              <div className="doc-empty-folder-stack">
                <div className="doc-empty-folder f1" />
                <div className="doc-empty-folder f2" />
                <div className="doc-empty-folder f3" />
              </div>
            </div>
            <div className="doc-empty-title">Nicio structura inca</div>
            <div className="doc-empty-desc">
              Structura ta de programe va aparea aici.
              Creeaza primul program pentru a incepe
              sa organizezi documentele.
            </div>
            <button className="doc-empty-cta" disabled={!canEditStructure} onClick={() => {
              apiPost<ApiFolderNode>("/api/documents/folders", {
                name: "Program nou",
                type: "program",
                parentId: null,
              }).then(result => {
                const newNode = mapApiFolderToTreeNode(result);
                setTree(prev => [...prev, newNode]);
                setRenaming(newNode.id);
                setRenameVal("Program nou");
              }).catch((err: any) => toast("error", `Eroare la crearea programului: ${err.message || "necunoscută"}`));
            }}>
              {canEditStructure ? "+ Adauga program" : "🔒 Deblocheaza pentru a edita"}
            </button>
          </div>
        ) : (
          <>
            {renderTree(tree)}
            {canEditStructure && (
              <button className="doc-tree-add-btn" onClick={() => {
                apiPost<ApiFolderNode>("/api/documents/folders", {
                  name: "Program nou",
                  type: "program",
                  parentId: null,
                }).then(result => {
                  const newNode = mapApiFolderToTreeNode(result);
                  setTree(prev => [...prev, newNode]);
                  setRenaming(newNode.id);
                  setRenameVal("Program nou");
                }).catch((err: any) => toast("error", `Eroare la crearea programului: ${err.message || "necunoscută"}`));
              }}>
                + Adauga program
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );

  /* ─── Middle panel: document list ─── */
  const listPanel = (
    <div className="doc-list-panel">
      <div className="doc-list-bar">
        <div className="doc-breadcrumb">
          {breadcrumb.length > 0 ? breadcrumb.map((seg, i) => (
            <span key={i}>
              <span className={`doc-bc-seg ${i === breadcrumb.length - 1 ? "doc-bc-active" : ""}`}>{seg}</span>
              {i < breadcrumb.length - 1 && <span className="doc-bc-sep">{"\u203A"}</span>}
            </span>
          )) : (
            <span className="doc-bc-seg">Selecteaza un folder din stanga</span>
          )}
        </div>
        {!isBiblioteca && (
          <div className="doc-toolbar">
            <div className="doc-search-wrap">
              <svg className="doc-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                ref={searchRef}
                className="doc-search-input"
                placeholder="Cauta document..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <kbd className="doc-search-kbd">Ctrl+K</kbd>
            </div>
            {canUpload && selectedFolder && selectedNode && (
              <FolderUploadButton
                folderId={selectedFolder}
                folderType={selectedNode.type as "ghiduri" | "templateuri"}
                onSuccess={() => { if (selectedFolder) fetchDocs(selectedFolder); }}
                onWarnings={(warnings) => warnings.forEach(w => toast("warning", w))}
              />
            )}
            {selectedFolder && filteredDocs.some(d => d.status === "procesare") && (
              <button
                style={{ marginLeft: 8, padding: "6px 14px", borderRadius: 6, border: "1px solid #fca5a5", background: "transparent", color: "#dc2626", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                onClick={async () => {
                  // Find session folder from tree (walk up)
                  let sessionId = selectedFolder;
                  const findSessionInTree = (nodes: TreeNode[], targetId: string, parentId?: string): string | null => {
                    for (const n of nodes) {
                      if (n.id === targetId) return n.type === "sesiune" ? n.id : parentId || n.id;
                      if (n.children) {
                        const found = findSessionInTree(n.children, targetId, n.type === "sesiune" ? n.id : parentId);
                        if (found) return found;
                      }
                    }
                    return null;
                  };
                  sessionId = findSessionInTree(tree, selectedFolder) || selectedFolder;

                  if (!confirm("Anulezi procesarea tuturor documentelor din aceasta sesiune?")) return;
                  try {
                    const result = await apiPost(`/api/documents/cancel-processing/${sessionId}`, {});
                    toast("success", `${(result as any).cancelledCount} documente anulate`);
                    if (selectedFolder) fetchDocs(selectedFolder);
                  } catch (err: any) {
                    toast("error", err.message || "Eroare la anulare");
                  }
                }}
              >
                Anuleaza procesarea
              </button>
            )}
          </div>
        )}
      </div>
      <div className="doc-list-scroll">
        {!selectedFolder ? (
          /* Welcome state — no folder selected */
          <div className="doc-welcome">
            <div className="doc-welcome-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="stroke-blue-600 opacity-60">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
              </svg>
            </div>
            <div className="doc-welcome-title">Bine ai venit in Documente</div>
            <div className="doc-welcome-desc">
              Creeaza structura: Program {"\u2192"} Masura {"\u2192"} Sesiune.<br />
              Documentele se adauga in folderele finale din sesiune.
            </div>
            <div className="doc-welcome-tips">
              <div className="doc-welcome-tip">
                <span className="doc-welcome-tip-icon">{"📂"}</span>
                <span>Click dreapta pe un nod pentru a adauga sub-nivele</span>
              </div>
              <div className="doc-welcome-tip">
                <span className="doc-welcome-tip-icon">{"📖"}</span>
                <span>La crearea unei sesiuni se creeaza automat Ghiduri, Template-uri, Clienti</span>
              </div>
              <div className="doc-welcome-tip">
                <span className="doc-welcome-tip-icon">{"📤"}</span>
                <span>Upload disponibil doar in folderele finale (Ghiduri, Template-uri, etc.)</span>
              </div>
            </div>
          </div>
        ) : isBiblioteca ? (
          /* Biblioteca Sesiune — aggregated session data */
          <SessionLibrary folderId={selectedFolder!.replace("biblioteca_", "")} />
        ) : !isLeafSelected ? (
          /* Non-leaf folder selected — show hierarchy info */
          <div className="doc-welcome">
            <div className="doc-welcome-icon">
              {selectedNode?.type === "program" ? (
                <span style={{ fontSize: 44, opacity: 0.5 }}>{"🏢"}</span>
              ) : selectedNode?.type === "masura" ? (
                <span style={{ fontSize: 44, opacity: 0.5 }}>{"📊"}</span>
              ) : (
                <span style={{ fontSize: 44, opacity: 0.5 }}>{"📅"}</span>
              )}
            </div>
            <div className="doc-welcome-title">{selectedNode?.label}</div>
            <div className="doc-welcome-desc">
              {selectedNode?.type === "program"
                ? "Click dreapta pentru a adauga o masura in acest program."
                : selectedNode?.type === "masura"
                ? "Click dreapta pentru a adauga o sesiune in aceasta masura."
                : selectedNode?.type === "sesiune"
                ? "Selecteaza unul din folderele de mai jos pentru a vedea si adauga documente."
                : "Expandeaza arborele si selecteaza un folder final."}
            </div>
            {CHILD_TYPE_MAP[selectedNode?.type || ""] && (
              <button className="doc-empty-cta" onClick={() => {
                if (selectedFolder) handleCreateChild(selectedFolder);
              }}>
                + {CHILD_TYPE_MAP[selectedNode?.type || ""]?.label}
              </button>
            )}
          </div>
        ) : docsLoading ? (
          <DocListSkeleton />
        ) : filteredDocs.length === 0 ? (
          /* Empty folder state */
          <div className="doc-empty-rich">
            {search ? (
              <>
                <div className="doc-empty-illustration">
                  <svg width="56" height="56" viewBox="0 0 24 24" fill="none" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "#64748b", opacity: 0.4 }}>
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
                  </svg>
                </div>
                <div className="doc-empty-title">Niciun rezultat pentru &ldquo;{search}&rdquo;</div>
                <div className="doc-empty-desc">Incearca cu alti termeni de cautare.</div>
                <button className="doc-empty-cta-secondary" onClick={() => setSearch("")}>
                  Sterge cautarea
                </button>
              </>
            ) : isClientFolder ? (
              <>
                <div style={{ fontSize: 48, opacity: 0.2, marginBottom: 16 }}>{"💬"}</div>
                <div className="doc-empty-title">Documentele client vin prin Solomon</div>
                <div className="doc-empty-desc" style={{ maxWidth: 320, textAlign: "center" }}>
                  Deschide Solomon pe un proiect pentru a uploada
                  {"\u00A0"}si procesa documente client conversational
                </div>
              </>
            ) : selectedNode?.type === "ghiduri" ? (
              <>
                <div style={{ fontSize: 48, opacity: 0.2, marginBottom: 16 }}>{"📖"}</div>
                <div className="doc-empty-title">Niciun ghid uploadat</div>
                <div className="doc-empty-desc" style={{ maxWidth: 320, textAlign: "center" }}>
                  Apasa butonul <span style={{ fontWeight: 600, color: "#2563eb" }}>+</span> pentru a uploada
                  {" "}ghidul solicitantului sau anexele cu date de referinta
                </div>
              </>
            ) : selectedNode?.type === "templateuri" ? (
              <>
                <div style={{ fontSize: 48, opacity: 0.2, marginBottom: 16 }}>{"📝"}</div>
                <div className="doc-empty-title">Niciun template uploadat</div>
                <div className="doc-empty-desc" style={{ maxWidth: 320, textAlign: "center" }}>
                  Apasa butonul <span style={{ fontWeight: 600, color: "#2563eb" }}>+</span> pentru a uploada
                  {" "}formulare de completat sau documente consultant (Memoriu, Plan afaceri)
                </div>
              </>
            ) : (
              <>
                <div className="doc-empty-illustration">
                  <svg width="56" height="56" viewBox="0 0 24 24" fill="none" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "#64748b", opacity: 0.4 }}>
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
                  </svg>
                </div>
                <div className="doc-empty-title">Folder gol</div>
                <div className="doc-empty-desc">Acest folder nu contine inca documente.</div>
              </>
            )}
          </div>
        ) : filteredDocs.map(d => {
          const st = STATUS_MAP[d.status];
          const jp = jobProgressMap.get(d.id);
          const isProcessing = d.status === "procesare";
          const isProcessed = d.status === "procesat";
          const isExpanded = expandedCards[d.id] || false;
          const hasSummary = isProcessed && d.summary && (
            (d.summary.rulesCount || 0) > 0 ||
            (d.summary.scoringCount || 0) > 0 ||
            (d.summary.elementsCount || 0) > 0 ||
            (d.summary.fieldsCount || 0) > 0
          );
          const isSelected = selectedDoc === d.id;
          return (
            <div key={d.id} style={{ display: "flex", flexDirection: "column" }}>
              <div
                className={`doc-card ${isSelected ? "active" : ""}`}
                onClick={() => setSelectedDoc(isSelected ? null : d.id)}
              >
                <div className="doc-card-icon">{TYPE_ICONS[d.type] || "📄"}</div>
                <div className="doc-card-info">
                  <div className="doc-card-name">{d.name}</div>
                  <div className="doc-card-meta">
                    <span>{d.type} {"\u00B7"} {d.size}</span>
                    <span>{"📅"} {d.uploaded}</span>
                    {d.pageCount ? <span>{d.pageCount} pag.</span> : null}
                    {d.uploadedBy && <span>de {d.uploadedBy}</span>}
                  </div>
                  {/* Real-time progress bar during processing */}
                  {isProcessing && jp && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#fbbf24", marginBottom: 3 }}>
                        <span style={{ maxWidth: "80%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{jp.message}</span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{jp.progress}%</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: "rgba(251,191,36,.15)", overflow: "hidden" }}>
                        <div style={{
                          height: "100%",
                          width: `${jp.progress}%`,
                          borderRadius: 2,
                          background: "linear-gradient(90deg, #fbbf24, #f59e0b)",
                          transition: "width 0.5s ease-out",
                        }} />
                      </div>
                    </div>
                  )}
                  {isProcessing && !jp && (
                    <div style={{ marginTop: 6, fontSize: 11, color: "#fbbf24" }}>
                      {"\u2699"} Procesare în curs...
                    </div>
                  )}
                  {d.tags.length > 0 && (
                    <div className="doc-card-tags">
                      {d.tags.map((t, i) => <span key={i} className="doc-card-tag">{t}</span>)}
                    </div>
                  )}
                </div>
                <div className="doc-card-status">
                  <span
                    className="doc-status-badge"
                    style={{ background: st.bg, color: st.color }}
                  >
                    {st.icon} {st.label}
                  </span>
                  {d.reguliExtrase > 0 && <span className="doc-stat-num">{d.reguliExtrase} reguli</span>}
                  {d.campuri != null && d.campuri > 0 && <span className="doc-stat-num">{d.campuri} elemente</span>}
                  {d.generationMode && d.processingType === "template" && (
                    <span className="doc-stat-num" style={{
                      background: d.generationMode === "fill" ? "rgba(52,211,153,.1)" : "rgba(167,139,250,.1)",
                      color: d.generationMode === "fill" ? "#059669" : "#7c3aed",
                      fontWeight: 700, fontSize: 10, padding: "1px 6px", borderRadius: 4, letterSpacing: ".3px",
                    }}>
                      {d.generationMode === "fill" ? "FILL" : "COMPOSE"}
                    </span>
                  )}
                  {hasSummary && (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleExpandCard(d.id); if (!isSelected) setSelectedDoc(d.id); }}
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: "#4d8bff", fontSize: 11, fontWeight: 600, padding: "2px 6px",
                        marginTop: 2, display: "flex", alignItems: "center", gap: 3,
                      }}
                    >
                      {isExpanded ? "\u25B2 Ascunde" : "\u25BC Detalii"}
                    </button>
                  )}
                </div>
              </div>
              {/* ─── Inline detail section (replaces right panel) ─── */}
              {isSelected && (
                <div className="doc-card-detail" style={{
                  margin: "0 4px 6px 4px",
                  borderRadius: "0 0 10px 10px",
                  border: "1px solid rgba(37,99,235,.2)",
                  borderTop: "none",
                  background: "#ffffff",
                  padding: "12px 16px",
                  animation: "docFadeIn .2s ease",
                }}>
                  {/* Info grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                    {d.documentTypeClass && (
                      <div className="doc-detail-cell">
                        <div className="doc-detail-cell-label">Tip document</div>
                        <div className="doc-detail-cell-value" style={{ fontSize: 12 }}>{DOCUMENT_TYPE_LABELS[d.documentTypeClass] || d.documentTypeClass}</div>
                      </div>
                    )}
                    {d.classificationConfidence != null && (
                      <div className="doc-detail-cell">
                        <div className="doc-detail-cell-label">Încredere</div>
                        <div className={`doc-detail-cell-value mono ${d.classificationConfidence >= 0.8 ? "text-emerald-500" : d.classificationConfidence >= 0.5 ? "text-amber-500" : "text-red-500"}`} style={{ fontSize: 12 }}>
                          {Math.round(d.classificationConfidence * 100)}%
                        </div>
                      </div>
                    )}
                    {d.reguliExtrase > 0 && (
                      <div className="doc-detail-cell">
                        <div className="doc-detail-cell-label">Reguli extrase</div>
                        <div className="doc-detail-cell-value mono text-emerald-500" style={{ fontSize: 12 }}>{d.reguliExtrase}</div>
                      </div>
                    )}
                    {d.campuri != null && d.campuri > 0 && (
                      <div className="doc-detail-cell">
                        <div className="doc-detail-cell-label">Elemente extrase</div>
                        <div className="doc-detail-cell-value mono text-blue-600" style={{ fontSize: 12 }}>{d.campuri}</div>
                      </div>
                    )}
                  </div>
                  {/* Status actions */}
                  {d.status === "neprocesat" && (
                    <div style={{ marginBottom: 10 }}>
                      <button className="doc-detail-btn primary" style={{ width: "auto", display: "inline-flex" }} onClick={(e) => { e.stopPropagation(); handleDocProcess(d.id); }}>
                        {"🤖"} Procesează cu AI
                      </button>
                    </div>
                  )}
                  {d.status === "eroare" && (
                    <div style={{ marginBottom: 10 }}>
                      {d.processingError && (
                        <div style={{ padding: "8px 12px", marginBottom: 8, borderRadius: 8, background: "rgba(220,38,38,.05)", border: "1px solid rgba(220,38,38,.15)", color: "#dc2626", fontSize: 11, lineHeight: 1.5, fontFamily: "'JetBrains Mono', monospace", wordBreak: "break-word" }}>
                          {d.processingError}
                        </div>
                      )}
                      <button className="doc-detail-btn primary" style={{ width: "auto", display: "inline-flex" }} onClick={(e) => { e.stopPropagation(); handleDocProcess(d.id); }}>
                        {"🔄"} Reîncearcă procesarea
                      </button>
                    </div>
                  )}
                  {/* Extracted fields preview */}
                  {d.extractedFields.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "#94a3b8", marginBottom: 6 }}>Date extrase ({d.extractedFields.length})</div>
                      <div className="flex flex-col gap-1 max-h-[120px] overflow-y-auto">
                        {d.extractedFields.slice(0, 8).map((f, i) => (
                          <div key={i} className="flex justify-between items-center px-2.5 py-1 rounded-md text-xs bg-slate-50 border border-slate-200">
                            <span className="font-semibold max-w-[45%] overflow-hidden text-ellipsis whitespace-nowrap text-slate-400">{f.field_key.replace(/_/g, " ")}</span>
                            <span className="font-mono text-[11px] max-w-[50%] overflow-hidden text-ellipsis whitespace-nowrap text-right text-slate-900">
                              {typeof f.field_value === "object" ? JSON.stringify(f.field_value).slice(0, 40) : String(f.field_value).slice(0, 40)}
                            </span>
                          </div>
                        ))}
                        {d.extractedFields.length > 8 && (
                          <div style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", padding: 2 }}>+{d.extractedFields.length - 8} câmpuri</div>
                        )}
                      </div>
                    </div>
                  )}
                  {/* Processing time */}
                  {d.processingTimeMs != null && d.processingTimeMs > 0 && (
                    <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>
                      Procesat în {d.processingTimeMs >= 1000 ? `${(d.processingTimeMs / 1000).toFixed(1)}s` : `${d.processingTimeMs}ms`}
                    </div>
                  )}
                  {/* Action buttons */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(d.status === "procesat" || d.status === "template" || d.status === "referință") && d.processingType && ["ghid", "template", "reference_data", "client_doc"].includes(d.processingType) && (
                      <button className="doc-detail-btn" style={{ color: "#fbbf24", borderColor: "rgba(251,191,36,.25)" }} onClick={(e) => { e.stopPropagation(); handleDocSmartReprocess(d.id); }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                        </svg>
                        Reactualizează
                      </button>
                    )}
                    {d.processingType === "template" && d.status === "template" && (
                      <a
                        href={`/documents/template/${d.id}`}
                        className="doc-detail-btn primary"
                        onClick={(e) => e.stopPropagation()}
                        style={{ textDecoration: "none" }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                        </svg>
                        Deschide Template Viewer
                      </a>
                    )}
                    <button className="doc-detail-btn primary" onClick={(e) => { e.stopPropagation(); handleDocDownload(d.id); }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                      Descarcă
                    </button>
                    <button className="doc-detail-btn" onClick={(e) => { e.stopPropagation(); handleDocPreview(d.id); }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                      </svg>
                      Previzualizare
                    </button>
                    {d.processingType && ["ghid", "template", "reference_data"].includes(d.processingType) && (d.status === "procesat" || d.status === "template" || d.status === "referință") && (
                      <button className="doc-detail-btn" style={{ color: "#a78bfa", borderColor: "rgba(167,139,250,.25)" }} onClick={(e) => { e.stopPropagation(); handleDocReplace(d.id); }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                        </svg>
                        Actualizează
                      </button>
                    )}
                    <button className="doc-detail-btn danger" onClick={(e) => { e.stopPropagation(); handleDocDeleteRequest(d); }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                      </svg>
                      Șterge
                    </button>
                  </div>
                </div>
              )}
              {/* Expandable results section */}
              {hasSummary && isExpanded && (() => {
                const rulesCount = d.summary?.rulesCount || 0;
                const scoringCount = d.summary?.scoringCount || 0;
                const elementsCount = d.summary?.elementsCount || 0;
                const trustScore = d.summary?.trustScore;
                const cr = d.summary?.completenessReport;
                const found: string[] = cr?.categoriesFound || [];
                const missing: string[] = cr?.categoriesMissing || [];
                const warnings: string[] = cr?.warnings || [];

                // For ghid: show processing pipeline summary instead of full rules list
                if (d.processingType === "ghid") {
                  const fixedCount = (d.summary as any)?.fixedRules || 0;
                  const interpCount = (d.summary as any)?.interpretedRules || 0;
                  // Pipeline stages
                  const stages = [
                    { icon: "📄", label: "Extragere text", detail: d.pageCount ? `${d.pageCount} pagini` : null, done: true },
                    { icon: "🛡", label: "Reguli eligibilitate", detail: rulesCount > 0 ? `${fixedCount || "?"} fixe + ${interpCount || "?"} interpretate = ${rulesCount}` : null, done: rulesCount > 0 },
                    { icon: "⭐", label: "Criterii selecție", detail: scoringCount > 0 ? `${scoringCount} criterii` : null, done: scoringCount > 0 },
                    { icon: "📋", label: "Elemente (câmpuri)", detail: elementsCount > 0 ? `${elementsCount} definiții` : null, done: elementsCount > 0 },
                    { icon: "🔗", label: "Linkuri reguli ↔ elemente", detail: null, done: rulesCount > 0 && elementsCount > 0 },
                    { icon: "\u2705", label: "Verificare completitudine", detail: trustScore != null ? `Trust: ${Math.round(trustScore * 100)}%` : null, done: trustScore != null },
                  ];
                  return (
                    <div style={{
                      margin: "0 4px 8px 4px",
                      borderRadius: "0 0 10px 10px",
                      border: "1px solid rgba(226,232,240,.8)",
                      borderTop: "none",
                      background: "#ffffff",
                      fontSize: 12,
                      animation: "docFadeIn .2s ease-out",
                      overflow: "hidden",
                    }}>
                      {/* Compact summary bar */}
                      <div style={{ display: "flex", gap: 0, background: "#f8fafc", borderBottom: "1px solid rgba(226,232,240,.6)", padding: "0" }}>
                        {[
                          { label: "Reguli", count: rulesCount, color: "#059669", icon: "🛡" },
                          { label: "Criterii", count: scoringCount, color: "#7c3aed", icon: "📊" },
                          { label: "Elemente", count: elementsCount, color: "#2563eb", icon: "📋" },
                        ].map(s => (
                          <div key={s.label} style={{
                            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                            padding: "8px 12px", fontSize: 12, color: "#64748b",
                          }}>
                            <span style={{ fontSize: 13 }}>{s.icon}</span>
                            {s.label}:
                            <span style={{ fontWeight: 700, color: s.count > 0 ? s.color : "#cbd5e1", fontFamily: "'JetBrains Mono', monospace" }}>{s.count}</span>
                          </div>
                        ))}
                        {trustScore != null && (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", marginLeft: "auto" }}>
                            <span style={{
                              fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                              background: trustScore >= 0.8 ? "rgba(52,211,153,.15)" : trustScore >= 0.6 ? "rgba(251,191,36,.15)" : "rgba(248,113,113,.15)",
                              color: trustScore >= 0.8 ? "#059669" : trustScore >= 0.6 ? "#d97706" : "#dc2626",
                              fontFamily: "'JetBrains Mono', monospace",
                            }}>
                              Trust: {Math.round(trustScore * 100)}%
                            </span>
                          </div>
                        )}
                      </div>
                      {/* Pipeline stages */}
                      <div style={{ padding: "12px 16px" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "#94a3b8", marginBottom: 10 }}>
                          Pipeline procesare
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          {stages.map((stage, i) => (
                            <div key={i} style={{
                              display: "flex", alignItems: "center", gap: 10, padding: "5px 8px",
                              borderRadius: 6, background: stage.done ? "rgba(52,211,153,.04)" : "rgba(148,163,184,.04)",
                            }}>
                              <span style={{ fontSize: 14, width: 20, textAlign: "center", flexShrink: 0 }}>{stage.icon}</span>
                              <span style={{
                                fontSize: 12, fontWeight: 500, flex: 1,
                                color: stage.done ? "#0f172a" : "#94a3b8",
                              }}>
                                {stage.label}
                              </span>
                              {stage.detail && (
                                <span style={{
                                  fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
                                  color: stage.done ? "#059669" : "#94a3b8",
                                }}>
                                  {stage.detail}
                                </span>
                              )}
                              <span style={{ fontSize: 12, flexShrink: 0, width: 16, textAlign: "center" }}>
                                {stage.done ? "\u2713" : "\u2014"}
                              </span>
                            </div>
                          ))}
                        </div>
                        {/* Processing time */}
                        {d.processingTimeMs != null && d.processingTimeMs > 0 && (
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8, display: "flex", alignItems: "center", gap: 4 }}>
                            {"\u23F1"} Procesat în {d.processingTimeMs >= 1000 ? `${(d.processingTimeMs / 1000).toFixed(1)}s` : `${d.processingTimeMs}ms`}
                          </div>
                        )}
                      </div>
                      {/* Completeness report footer */}
                      {(found.length > 0 || missing.length > 0 || warnings.length > 0) && (
                        <div style={{ padding: "10px 14px", borderTop: "1px solid rgba(226,232,240,.6)", background: "#f8fafc" }}>
                          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "#94a3b8", marginBottom: 6 }}>
                            Acoperire ghid
                          </div>
                          {found.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: missing.length > 0 || warnings.length > 0 ? 6 : 0 }}>
                              {found.map((cat, i) => (
                                <span key={i} style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(52,211,153,.1)", color: "#059669", fontWeight: 600 }}>
                                  {"\u2713"} {cat}
                                </span>
                              ))}
                            </div>
                          )}
                          {missing.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: warnings.length > 0 ? 6 : 0 }}>
                              {missing.map((cat, i) => (
                                <span key={i} style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(248,113,113,.1)", color: "#dc2626", fontWeight: 600 }}>
                                  {"\u2717"} {cat}
                                </span>
                              ))}
                            </div>
                          )}
                          {warnings.length > 0 && (
                            <div style={{ marginTop: 2 }}>
                              {warnings.map((w, i) => (
                                <div key={i} style={{ fontSize: 10, color: "#d97706", lineHeight: 1.4 }}>{"\u26A0"} {w}</div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                }

                // For templates: show element details (existing behavior)
                return (
                  <div style={{
                    margin: "0 4px 8px 4px",
                    borderRadius: "0 0 10px 10px",
                    border: "1px solid rgba(226,232,240,.8)",
                    borderTop: "none",
                    background: "#ffffff",
                    fontSize: 12,
                    animation: "docFadeIn .2s ease-out",
                    overflow: "hidden",
                  }}>
                    {/* Template header bar */}
                    <div style={{ display: "flex", gap: 0, background: "#f8fafc", borderBottom: "1px solid rgba(226,232,240,.6)" }}>
                      {d.processingType === "template" && (d.summary?.fieldsCount || 0) > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px" }}>
                          <span style={{ fontSize: 13 }}>{"📝"}</span>
                          <span style={{ color: "#64748b" }}>Elemente extrase:</span>
                          <span style={{ fontWeight: 700, color: "#4d8bff", fontFamily: "'JetBrains Mono', monospace" }}>{tplElements[d.id]?.total ?? d.summary?.fieldsCount}</span>
                          {d.generationMode && (
                            <span style={{
                              fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, letterSpacing: ".3px",
                              background: d.generationMode === "fill" ? "rgba(52,211,153,.12)" : "rgba(167,139,250,.12)",
                              color: d.generationMode === "fill" ? "#059669" : "#7c3aed",
                            }}>
                              {d.generationMode === "fill" ? "FILL" : "COMPOSE"}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Template elements expandable section */}
                    {d.processingType === "template" && (() => {
                      const tpl = tplElements[d.id];
                      if (!tpl) return (
                        <div style={{ padding: "16px", textAlign: "center", color: "#94a3b8", fontSize: 12 }}>
                          Se încarcă elementele...
                        </div>
                      );
                      if (tpl.total === 0) return (
                        <div style={{ padding: "16px", textAlign: "center", color: "#94a3b8", fontSize: 12 }}>
                          Niciun element detectat în template
                        </div>
                      );
                      const SOURCE_BADGES: Record<string, { label: string; color: string; bg: string }> = {
                        onrc: { label: "ONRC", color: "#059669", bg: "rgba(52,211,153,.12)" },
                        anaf: { label: "ANAF", color: "#d97706", bg: "rgba(251,191,36,.12)" },
                        ci: { label: "CI", color: "#7c3aed", bg: "rgba(167,139,250,.12)" },
                        solomon: { label: "Solomon", color: "#2563eb", bg: "rgba(37,99,235,.12)" },
                      };
                      return (
                        <div>
                          {/* Metric cards */}
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, padding: "12px 14px 8px" }}>
                            <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", textAlign: "center", border: "1px solid rgba(226,232,240,.6)" }}>
                              <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", fontFamily: "'JetBrains Mono', monospace" }}>{tpl.total}</div>
                              <div style={{ fontSize: 10, color: "#64748b", marginTop: 2, fontWeight: 600 }}>Total elemente</div>
                            </div>
                            <div style={{ background: "rgba(52,211,153,.05)", borderRadius: 8, padding: "10px 12px", textAlign: "center", border: "1px solid rgba(52,211,153,.2)" }}>
                              <div style={{ fontSize: 18, fontWeight: 700, color: "#059669", fontFamily: "'JetBrains Mono', monospace" }}>{tpl.mapped}</div>
                              <div style={{ fontSize: 10, color: "#059669", marginTop: 2, fontWeight: 600 }}>Mapate automat</div>
                            </div>
                            <div style={{ background: "rgba(251,191,36,.05)", borderRadius: 8, padding: "10px 12px", textAlign: "center", border: "1px solid rgba(251,191,36,.2)" }}>
                              <div style={{ fontSize: 18, fontWeight: 700, color: "#d97706", fontFamily: "'JetBrains Mono', monospace" }}>{tpl.unmapped}</div>
                              <div style={{ fontSize: 10, color: "#d97706", marginTop: 2, fontWeight: 600 }}>Necesită Solomon</div>
                            </div>
                          </div>
                          {/* Element list */}
                          <div style={{ maxHeight: 240, overflowY: "auto" }}>
                            {tpl.elements.map((el: any) => {
                              const badge = SOURCE_BADGES[el.source] || SOURCE_BADGES.solomon;
                              return (
                                <div key={el.id} style={{
                                  padding: "7px 14px", borderBottom: "1px solid rgba(226,232,240,.4)",
                                  display: "flex", gap: 8, alignItems: "center", transition: "background .15s",
                                }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#f8fafc"; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                                >
                                  {/* Mapped status icon */}
                                  <span style={{ fontSize: 13, flexShrink: 0 }}>
                                    {el.mapped ? "\u2705" : "🟠"}
                                  </span>
                                  {/* Element info */}
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12, color: "#0f172a", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {el.label}
                                    </div>
                                    <div style={{ display: "flex", gap: 6, marginTop: 2, alignItems: "center" }}>
                                      <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}>{el.key}</span>
                                      {el.category && (
                                        <span style={{ fontSize: 9, padding: "0 5px", borderRadius: 9999, background: "rgba(100,116,139,.08)", color: "#64748b", fontWeight: 600 }}>
                                          {el.category}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {/* Source badge */}
                                  <span style={{
                                    fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                                    background: badge.bg, color: badge.color, letterSpacing: ".3px",
                                    flexShrink: 0, fontFamily: "'JetBrains Mono', monospace",
                                  }}>
                                    {badge.label}
                                  </span>
                                  {/* Confidence */}
                                  {el.confidence != null && (
                                    <span style={{ fontSize: 10, color: el.confidence >= 0.85 ? "#059669" : "#d97706", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, flexShrink: 0 }}>
                                      {Math.round(el.confidence * 100)}%
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );

  /* Detail panel removed — info is now inline in card */

  return (
    <div className="animate-[fadeIn_.2s_ease-out]" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <style>{`
        /* ─── Animations ─── */
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes docFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes docSlideUp { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes docSlideIn { from { opacity: 0; transform: translateX(-8px) } to { opacity: 1; transform: translateX(0) } }
        @keyframes docCtxIn { from { opacity: 0; transform: scale(.95) } to { opacity: 1; transform: scale(1) } }
        @keyframes docCheckIn { from { transform: scale(0) } to { transform: scale(1) } }
        @keyframes docProgressStripe { 0% { background-position: 0 0 } 100% { background-position: 40px 0 } }
        @keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }

        /* ─── Tree panel ─── */
        .doc-tree-panel { display: flex; flex-direction: column; overflow: hidden; background: #ffffff; height: 100%; border-right: 1px solid #e2e8f0; }
        .doc-tree-header { padding: 16px 20px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; gap: 10px; flex-shrink: 0; background: #fff; }
        .doc-tree-header-icon { font-size: 16px; }
        .doc-tree-header-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .8px; color: #475569; flex: 1; }

        .doc-lock-btn { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 6px; border: 1px solid #e2e8f0; background: #f8fafc; color: #94a3b8; cursor: pointer; transition: all .15s ease; flex-shrink: 0; }
        .doc-lock-btn:hover:not(:disabled) { background: #f1f5f9; color: #64748b; border-color: #cbd5e1; }
        .doc-lock-btn--unlocked { background: rgba(37,99,235,.08); border-color: rgba(37,99,235,.2); color: #2563eb; }
        .doc-lock-btn--unlocked:hover:not(:disabled) { background: rgba(37,99,235,.14); }
        .doc-lock-btn--other { opacity: .6; cursor: not-allowed; }
        .doc-lock-btn:disabled { cursor: not-allowed; }
        .doc-lock-info { font-size: 10px; color: #f59e0b; font-weight: 500; white-space: nowrap; }
        .doc-lock-spinner { animation: spin .8s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }

        .doc-tree-scroll { flex: 1; overflow-y: auto; padding: 8px 0; }

        .doc-tree-item { display: flex; align-items: center; gap: 7px; padding: 7px 12px; cursor: pointer; font-size: 13px; color: #0f172a; transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1); position: relative; border-radius: 6px; margin: 1px 6px; }
        .doc-tree-item:hover { background: #f1f5f9; color: #0f172a; }
        .doc-tree-item.active { background: rgba(37,99,235,.07); color: #2563eb; font-weight: 500; }
        .doc-tree-item.active::before { content: ''; position: absolute; left: 0; top: 4px; bottom: 4px; width: 3px; background: #2563eb; border-radius: 0 2px 2px 0; }
        .doc-tree-arrow { width: 14px; font-size: 10px; color: #94a3b8; flex-shrink: 0; text-align: center; transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1); display: inline-block; }
        .doc-tree-arrow.expanded { transform: rotate(90deg); }
        .doc-tree-icon { font-size: 14px; flex-shrink: 0; }
        .doc-tree-dot { border-radius: 50%; flex-shrink: 0; box-shadow: 0 0 0 2px rgba(255,255,255,.8); }
        .doc-tree-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
        .doc-tree-label-program { font-weight: 700; font-size: 13px; color: #0f172a; }
        .doc-tree-label-masura { font-weight: 600; font-size: 13px; color: #C9A84C; }
        .doc-tree-label-sesiune { font-weight: 500; font-size: 13px; color: #94a3b8; }
        .doc-tree-count { font-size: 11px; font-family: 'JetBrains Mono', monospace; font-weight: 600; color: #64748b; background: #f1f5f9; padding: 1px 6px; border-radius: 9999px; }
        .doc-tree-rename { flex: 1; padding: 3px 8px; border-radius: 8px; border: 1px solid rgba(37,99,235,.4); background: #f8fafc; color: #0f172a; font-size: 13px; font-family: 'Inter', system-ui, sans-serif; outline: none; min-width: 0; box-shadow: 0 0 0 3px rgba(37,99,235,.08); }
        .doc-tree-guide { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(226,232,240,.5); }
        .doc-tree-children { position: relative; }
        .doc-tree-add-btn { margin: 8px 12px; padding: 8px 12px; border-radius: 8px; border: 1px dashed rgba(226,232,240,.8); background: transparent; color: #64748b; font-size: 11px; font-weight: 600; cursor: pointer; font-family: 'Inter', system-ui, sans-serif; text-align: center; transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1); }
        .doc-tree-add-btn:hover { border-color: rgba(37,99,235,.4); color: #2563eb; background: rgba(37,99,235,.03); }

        /* ─── Context menu ─── */
        .doc-ctx-menu { position: fixed; z-index: 200; background: #ffffff; border: 1px solid rgba(226,232,240,.8); border-radius: 12px; padding: 4px; min-width: 180px; box-shadow: 0 4px 24px rgba(0,0,0,.1), 0 1px 3px rgba(0,0,0,.08); animation: docCtxIn .12s cubic-bezier(0.4, 0, 0.2, 1); }
        .doc-ctx-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 8px; cursor: pointer; font-size: 13px; color: #64748b; transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1); border: none; background: none; width: 100%; text-align: left; font-family: 'Inter', system-ui, sans-serif; }
        .doc-ctx-item:hover { background: #f1f5f9; color: #0f172a; }
        .doc-ctx-item.danger { color: #dc2626; }
        .doc-ctx-item.danger:hover { background: rgba(220,38,38,.05); }
        .doc-ctx-sep { height: 1px; background: #f1f5f9; margin: 4px 8px; }

        /* ─── Document list panel ─── */
        .doc-list-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; height: 100%; }
        .doc-list-bar { padding: 12px 20px; border-bottom: 1px solid rgba(226,232,240,.8); background: #ffffff; flex-shrink: 0; }
        .doc-breadcrumb { display: flex; align-items: center; gap: 0; font-size: 11px; margin-bottom: 8px; min-height: 18px; }
        .doc-bc-seg { color: #64748b; transition: color 0.15s cubic-bezier(0.4, 0, 0.2, 1); }
        .doc-bc-active { color: #2563eb; font-weight: 600; }
        .doc-bc-sep { color: #94a3b8; margin: 0 6px; font-size: 10px; }
        .doc-toolbar { display: flex; align-items: center; gap: 10px; }

        /* Search with icon */
        .doc-search-wrap { position: relative; display: flex; align-items: center; flex: 1; max-width: 280px; }
        .doc-search-icon { position: absolute; left: 10px; color: #94a3b8; pointer-events: none; transition: color 0.15s cubic-bezier(0.4, 0, 0.2, 1); }
        .doc-search-wrap:focus-within .doc-search-icon { color: #2563eb; }
        .doc-search-input { width: 100%; padding: 7px 14px 7px 32px; border-radius: 8px; border: 1px solid rgba(226,232,240,.8); background: #f8fafc; color: #0f172a; font-size: 13px; font-family: 'Inter', system-ui, sans-serif; outline: none; transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1); }
        .doc-search-input:focus { border-color: rgba(37,99,235,.4); box-shadow: 0 0 0 3px rgba(37,99,235,.08); background: #ffffff; }
        .doc-search-input::placeholder { color: #94a3b8; }
        .doc-search-kbd { position: absolute; right: 8px; font-size: 10px; font-family: 'JetBrains Mono', monospace; color: #94a3b8; background: #f1f5f9; padding: 1px 5px; border-radius: 4px; border: 1px solid rgba(226,232,240,.8); pointer-events: none; opacity: .7; }
        .doc-search-wrap:focus-within .doc-search-kbd { opacity: 0; }

        .doc-list-scroll { flex: 1; overflow-y: auto; padding: 12px 20px; display: flex; flex-direction: column; gap: 6px; background: #f8fafc; }

        /* ─── Document card ─── */
        .doc-card { display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-radius: 14px; border: 1px solid #e2e8f0; background: #ffffff; cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); animation: docSlideIn .25s ease both; }
        .doc-card:hover { border-color: #cbd5e1; box-shadow: 0 4px 20px rgba(0,0,0,.04); transform: translateY(-1px); }
        .doc-card.active { border-color: rgba(37,99,235,.3); background: rgba(37,99,235,.04); box-shadow: 0 0 0 1px rgba(37,99,235,.1); }
        .doc-card-icon { font-size: 26px; flex-shrink: 0; }
        .doc-card-info { flex: 1; min-width: 0; }
        .doc-card-name { font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .doc-card-meta { font-size: 11px; color: #64748b; display: flex; gap: 8px; flex-wrap: wrap; }
        .doc-card-meta span { display: flex; align-items: center; gap: 3px; }
        .doc-card-tags { display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap; }
        .doc-card-tag { font-size: 11px; padding: 1px 8px; border-radius: 9999px; background: #f1f5f9; color: #64748b; border: 1px solid rgba(226,232,240,.8); }
        .doc-card-status { flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
        .doc-status-badge { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 9999px; display: flex; align-items: center; gap: 4px; white-space: nowrap; }
        .doc-stat-num { font-size: 11px; font-family: 'JetBrains Mono', monospace; color: #64748b; }

        /* ─── Detail panel ─── */
        .doc-detail { background: #ffffff; display: flex; flex-direction: column; overflow-y: auto; height: 100%; border-left: 1px solid rgba(226,232,240,.8); }
        .doc-detail-empty { align-items: center; justify-content: center; }
        .doc-detail-empty-inner { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 40px 20px; text-align: center; }
        .doc-detail-header { padding: 20px; border-bottom: 1px solid rgba(226,232,240,.8); position: relative; animation: docFadeIn .3s ease; }
        .doc-detail-close { position: absolute; top: 14px; right: 14px; background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 16px; width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1); }
        .doc-detail-close:hover { color: #0f172a; background: #f1f5f9; }
        .doc-detail-icon { font-size: 36px; margin-bottom: 8px; }
        .doc-detail-name { font-size: 15px; font-weight: 800; color: #0f172a; margin-bottom: 4px; line-height: 1.3; }
        .doc-detail-type { font-size: 11px; font-family: 'JetBrains Mono', monospace; color: #94a3b8; }
        .doc-detail-section { padding: 16px 20px; border-bottom: 1px solid rgba(226,232,240,.8); animation: docFadeIn .4s ease; }
        .doc-detail-stitle { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .8px; color: #94a3b8; margin-bottom: 10px; }
        .doc-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .doc-detail-cell { padding: 8px 10px; background: #f8fafc; border-radius: 8px; border: 1px solid rgba(226,232,240,.8); transition: border-color 0.15s cubic-bezier(0.4, 0, 0.2, 1); }
        .doc-detail-cell:hover { border-color: rgba(226,232,240,1); }
        .doc-detail-cell-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: #94a3b8; margin-bottom: 2px; }
        .doc-detail-cell-value { font-size: 13px; font-weight: 600; color: #0f172a; }
        .doc-detail-cell-value.mono { font-family: 'JetBrains Mono', monospace; }
        .doc-detail-tags { display: flex; gap: 5px; flex-wrap: wrap; }
        .doc-detail-tag { font-size: 11px; padding: 3px 10px; border-radius: 9999px; background: #f1f5f9; border: 1px solid rgba(226,232,240,.8); color: #64748b; transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1); cursor: default; }
        .doc-detail-tag:hover { border-color: rgba(37,99,235,.3); color: #2563eb; }
        .doc-detail-actions { display: flex; gap: 8px; padding: 16px 20px; margin-top: auto; }
        .doc-detail-btn { flex: 1; padding: 9px; border-radius: 8px; border: 1px solid rgba(226,232,240,.8); background: transparent; color: #64748b; font-size: 11px; font-weight: 600; cursor: pointer; font-family: 'Inter', system-ui, sans-serif; transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1); display: flex; align-items: center; justify-content: center; gap: 5px; }
        .doc-detail-btn:hover { border-color: rgba(226,232,240,1); color: #0f172a; background: #f1f5f9; }
        .doc-detail-btn.primary { border-color: rgba(37,99,235,.3); color: #2563eb; }
        .doc-detail-btn.primary:hover { background: rgba(37,99,235,.05); }
        .doc-detail-btn.danger { color: #dc2626; border-color: rgba(220,38,38,.2); }
        .doc-detail-btn.danger:hover { background: rgba(220,38,38,.04); }

        /* ─── Rich empty states ─── */
        .doc-empty-rich { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 40px 24px; flex: 1; animation: docFadeIn .4s ease; }
        .doc-empty-illustration { margin-bottom: 16px; }
        .doc-empty-folder-stack { position: relative; width: 64px; height: 52px; }
        .doc-empty-folder { position: absolute; border-radius: 6px 6px 8px 8px; border: 1px solid rgba(226,232,240,.8); }
        .doc-empty-folder.f1 { width: 56px; height: 38px; bottom: 0; left: 4px; background: #f8fafc; }
        .doc-empty-folder.f2 { width: 48px; height: 34px; bottom: 4px; left: 8px; background: #f1f5f9; opacity: .7; }
        .doc-empty-folder.f3 { width: 40px; height: 30px; bottom: 8px; left: 12px; background: #ffffff; opacity: .4; border-style: dashed; }
        .doc-empty-title { font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 6px; }
        .doc-empty-desc { font-size: 13px; color: #64748b; line-height: 1.6; max-width: 240px; margin-bottom: 16px; }
        .doc-empty-cta { display: inline-flex; align-items: center; gap: 6px; padding: 8px 18px; border-radius: 8px; border: none; background: #2563eb; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; font-family: 'Inter', system-ui, sans-serif; transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 1px 2px rgba(0,0,0,.05); }
        .doc-empty-cta:hover { background: #1d4ed8; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
        .doc-empty-cta-secondary { display: inline-flex; align-items: center; gap: 6px; padding: 7px 16px; border-radius: 8px; border: 1px solid rgba(226,232,240,.8); background: transparent; color: #64748b; font-size: 13px; font-weight: 600; cursor: pointer; font-family: 'Inter', system-ui, sans-serif; transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1); }
        .doc-empty-cta-secondary:hover { border-color: rgba(226,232,240,1); color: #0f172a; background: #f1f5f9; }

        /* ─── Welcome state ─── */
        .doc-welcome { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; text-align: center; padding: 40px 24px; animation: docFadeIn .5s ease; }
        .doc-welcome-icon { margin-bottom: 12px; }
        .doc-welcome-title { font-size: 15px; font-weight: 800; color: #0f172a; margin-bottom: 6px; }
        .doc-welcome-desc { font-size: 13px; color: #64748b; line-height: 1.5; max-width: 300px; margin-bottom: 24px; }
        .doc-welcome-tips { display: flex; flex-direction: column; gap: 8px; width: 100%; max-width: 280px; }
        .doc-welcome-tip { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 8px; background: #f8fafc; border: 1px solid rgba(226,232,240,.8); font-size: 11px; color: #64748b; text-align: left; transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1); }
        .doc-welcome-tip:hover { border-color: rgba(226,232,240,1); background: #f1f5f9; }
        .doc-welcome-tip-icon { font-size: 16px; flex-shrink: 0; }

        /* ─── Skeleton ─── */
        .doc-skeleton-wrap { display: flex; flex-direction: column; gap: 4px; padding: 8px 0; }
        .doc-skel-row { display: flex; align-items: center; gap: 8px; padding: 6px 10px; }
        .doc-skel-dot { height: 8px; border-radius: 50%; background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%); background-size: 200% 100%; animation: shimmer 1.5s ease-in-out infinite; flex-shrink: 0; }
        .doc-skel-bar { height: 12px; border-radius: 4px; background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%); background-size: 200% 100%; animation: shimmer 1.5s ease-in-out infinite; }
        .doc-skel-card { display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-radius: 12px; border: 1px solid rgba(226,232,240,.8); }
        .doc-skel-icon { width: 32px; height: 32px; border-radius: 8px; background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%); background-size: 200% 100%; animation: shimmer 1.5s ease-in-out infinite; flex-shrink: 0; }

        /* ─── Upload modal ─── */
        .doc-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; z-index: 100; animation: docFadeIn .2s; }
        .doc-modal { background: #ffffff; border: 1px solid rgba(226,232,240,.8); border-radius: 18px; width: 520px; max-width: calc(100vw - 40px); padding: 36px; animation: docSlideUp .3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 24px 64px rgba(0,0,0,.10), 0 1px 3px rgba(0,0,0,.08); }
        .doc-modal-title { font-size: 17px; font-weight: 800; color: #0f172a; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center; letter-spacing: -0.01em; }
        .doc-modal-close { background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 18px; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1); }
        .doc-modal-close:hover { color: #0f172a; background: #f1f5f9; }
        .doc-modal-sub { font-size: 13px; color: #94a3b8; margin-bottom: 20px; }
        .doc-upload-zone { border: 2px dashed rgba(226,232,240,.8); border-radius: 12px; padding: 32px 20px; text-align: center; margin-bottom: 16px; cursor: pointer; transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1); position: relative; }
        .doc-upload-zone:hover { border-color: rgba(37,99,235,.3); background: rgba(37,99,235,.02); }
        .doc-upload-zone.drag-active { border-color: #2563eb; background: rgba(37,99,235,.04); box-shadow: 0 0 0 4px rgba(37,99,235,.08); }
        .doc-upload-zone.has-file { border-color: #059669; border-style: solid; background: rgba(5,150,105,.03); }
        .doc-upload-zone-icon { font-size: 28px; margin-bottom: 6px; }
        .doc-upload-zone-title { font-size: 13px; font-weight: 600; color: #0f172a; margin-bottom: 3px; }
        .doc-upload-zone-sub { font-size: 11px; color: #64748b; }
        .doc-upload-zone-remove { position: absolute; top: 8px; right: 8px; background: #f8fafc; border: 1px solid rgba(226,232,240,.8); color: #94a3b8; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 12px; transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1); }
        .doc-upload-zone-remove:hover { color: #dc2626; border-color: rgba(220,38,38,.3); }
        .doc-upload-type-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 16px; }
        .doc-upload-type { padding: 12px; border-radius: 8px; border: 1px solid rgba(226,232,240,.8); cursor: pointer; transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1); text-align: center; background: transparent; font-family: 'Inter', system-ui, sans-serif; }
        .doc-upload-type:hover { border-color: rgba(226,232,240,1); background: #f8fafc; }
        .doc-upload-type.on { border-width: 2px; border-color: #2563eb; background: rgba(37,99,235,.04); }
        .doc-upload-type-icon { font-size: 20px; margin-bottom: 4px; }
        .doc-upload-type-label { font-size: 11px; font-weight: 600; color: #64748b; }
        .doc-upload-type-desc { font-size: 11px; color: #94a3b8; margin-top: 2px; }

        /* Upload type auto-detected info */
        .doc-upload-type-info { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; border-radius: 12px; border: 1px solid rgba(37,99,235,.15); background: rgba(37,99,235,.03); margin-bottom: 16px; }
        .doc-upload-type-info-icon { font-size: 24px; flex-shrink: 0; margin-top: 2px; }
        .doc-upload-type-info-label { font-size: 13px; color: #0f172a; margin-bottom: 2px; }
        .doc-upload-type-info-label strong { color: #2563eb; }
        .doc-upload-type-info-desc { font-size: 11px; color: #64748b; line-height: 1.4; }

        .doc-upload-ghid-subtype { margin-bottom: 16px; }
        .doc-upload-ghid-subtype-label { font-size: 13px; color: #64748b; margin-bottom: 10px; font-weight: 500; }
        .doc-upload-ghid-subtype-options { display: flex; flex-direction: column; gap: 8px; }
        .doc-upload-ghid-option { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(226,232,240,.8); background: #f8fafc; cursor: pointer; text-align: left; transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1); }
        .doc-upload-ghid-option:hover { border-color: rgba(226,232,240,1); background: #f1f5f9; }
        .doc-upload-ghid-option.active { border-width: 2px; border-color: #2563eb; background: rgba(37,99,235,.04); box-shadow: none; }
        .doc-upload-ghid-option-icon { font-size: 22px; flex-shrink: 0; margin-top: 2px; }
        .doc-upload-ghid-option-title { font-size: 13px; font-weight: 600; color: #0f172a; margin-bottom: 2px; }
        .doc-upload-ghid-option.active .doc-upload-ghid-option-title { color: #2563eb; }
        .doc-upload-ghid-option-desc { font-size: 11px; color: #64748b; line-height: 1.4; }

        /* Upload progress */
        .doc-upload-progress { height: 4px; border-radius: 2px; background: #f1f5f9; overflow: hidden; margin-bottom: 16px; }
        .doc-upload-progress-bar { height: 100%; border-radius: 2px; background: linear-gradient(90deg, #2563eb, rgba(37,99,235,.7)); transition: width .3s ease; position: relative; }
        .doc-upload-progress-bar.active { background-image: linear-gradient(45deg, rgba(255,255,255,.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.15) 50%, rgba(255,255,255,.15) 75%, transparent 75%, transparent); background-size: 40px 40px; animation: docProgressStripe 1s linear infinite; }

        /* Error box */
        .doc-upload-error { padding: 10px 14px; margin-bottom: 12px; border-radius: 8px; background: rgba(220,38,38,.05); border: 1px solid rgba(220,38,38,.15); color: #dc2626; font-size: 13px; display: flex; align-items: center; gap: 8px; animation: docFadeIn .2s ease; }

        .doc-btn-primary { padding: 11px 24px; border-radius: 10px; border: none; background: #2563eb; color: #fff; font-size: 14px; font-weight: 600; font-family: 'Inter', system-ui, sans-serif; cursor: pointer; transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 1px 3px rgba(37,99,235,.2); min-width: 100px; }
        .doc-btn-primary:hover:not(:disabled) { background: #1d4ed8; box-shadow: 0 2px 6px rgba(37,99,235,.25); }
        .doc-btn-primary:disabled { opacity: .5; cursor: not-allowed; }
        .doc-btn-secondary { padding: 11px 24px; border-radius: 10px; border: 1px solid rgba(226,232,240,.6); background: transparent; color: #64748b; font-size: 14px; font-weight: 500; font-family: 'Inter', system-ui, sans-serif; cursor: pointer; transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1); min-width: 100px; }
        .doc-btn-secondary:hover { border-color: rgba(226,232,240,1); color: #0f172a; background: #f1f5f9; }

        /* ─── Scrollbar ─── */
        .doc-tree-scroll::-webkit-scrollbar,
        .doc-list-scroll::-webkit-scrollbar,
        .doc-detail::-webkit-scrollbar { width: 5px; }
        .doc-tree-scroll::-webkit-scrollbar-track,
        .doc-list-scroll::-webkit-scrollbar-track,
        .doc-detail::-webkit-scrollbar-track { background: transparent; }
        .doc-tree-scroll::-webkit-scrollbar-thumb,
        .doc-list-scroll::-webkit-scrollbar-thumb,
        .doc-detail::-webkit-scrollbar-thumb { background: rgba(226,232,240,.8); border-radius: 3px; }
        .doc-tree-scroll::-webkit-scrollbar-thumb:hover,
        .doc-list-scroll::-webkit-scrollbar-thumb:hover,
        .doc-detail::-webkit-scrollbar-thumb:hover { background: rgba(226,232,240,1); }
      `}</style>

      {/* ─── TOPBAR ─── */}
      <PageHeader title="Documente">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {[
            { value: totalDocs, label: "documente", color: "#0f172a" },
            { value: procesate, label: "procesate", color: "#059669" },
            { value: templates, label: "template-uri", color: "#4d8bff" },
          ].map(s => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 16, fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, color: s.color }}>{s.value}</span>
              <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>{s.label}</span>
            </div>
          ))}
        </div>
      </PageHeader>

      {/* ─── MAIN LAYOUT ─── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", background: "#f0f2f5" }}>
        <SplitPane
          side="left"
          defaultWidth={300}
          minLeft={240}
          minRight={400}
          left={treePanel}
          right={listPanel}
        />
      </div>

      {/* ─── CONTEXT MENU ─── */}
      {ctxMenu && (() => {
        const ctxNode = findNodeById(tree, ctxMenu.nodeId);
        const ctxType = ctxNode?.type;
        const childInfo = ctxType ? CHILD_TYPE_MAP[ctxType] : null;
        const isLeaf = ctxType ? LEAF_TYPES.has(ctxType) : false;

        return (
          <div
            className="doc-ctx-menu"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
            onClick={e => e.stopPropagation()}
          >
            {/* Show "add child" only for program/masura (sesiune auto-creates leaves) */}
            {childInfo && (
              <button className="doc-ctx-item" onClick={() => handleCreateChild(ctxMenu.nodeId)}>
                {ctxType === "program" ? "📊" : "📅"} {childInfo.label}
              </button>
            )}
            {childInfo && <div className="doc-ctx-sep" />}
            <button className="doc-ctx-item" onClick={() => handleRename(ctxMenu.nodeId)}>
              {"\u270F\uFE0F"} Redenumeste
            </button>
            {/* Don't allow deleting leaf folders individually — they come with sesiune */}
            {!isLeaf && (
              <>
                <div className="doc-ctx-sep" />
                <button
                  className="doc-ctx-item danger"
                  onClick={() => {
                    if (confirm("Sigur vrei sa stergi acest folder si tot continutul?")) handleDelete(ctxMenu.nodeId);
                  }}
                >
                  {"🗑"} Sterge
                </button>
              </>
            )}
          </div>
        );
      })()}

      {/* PDF Preview Modal */}
      {pdfPreviewUrl && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,.6)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            animation: "docFadeIn .2s ease-out",
          }}
          onClick={() => setPdfPreviewUrl(null)}
        >
          <div
            style={{
              width: "85vw", height: "88vh", maxWidth: 1100,
              background: "#fff", borderRadius: 16,
              boxShadow: "0 24px 80px rgba(0,0,0,.3)",
              display: "flex", flexDirection: "column", overflow: "hidden",
              animation: "docSlideUp .25s ease both",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{
              padding: "14px 20px", borderBottom: "1px solid rgba(226,232,240,.8)",
              display: "flex", alignItems: "center", gap: 12,
            }}>
              <span style={{ fontSize: 15, fontWeight: 700, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {pdfPreviewName}
              </span>
              <button
                onClick={() => window.open(pdfPreviewUrl, "_blank")}
                style={{
                  padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(226,232,240,.8)",
                  background: "#fff", color: "#2563eb", fontSize: 12, fontWeight: 600,
                  cursor: "pointer", fontFamily: "'Inter', system-ui, sans-serif",
                }}
              >
                Descarcă
              </button>
              <button
                onClick={() => setPdfPreviewUrl(null)}
                style={{
                  width: 32, height: 32, borderRadius: 8, border: "none",
                  background: "rgba(226,232,240,.5)", color: "#64748b",
                  fontSize: 16, cursor: "pointer", display: "flex",
                  alignItems: "center", justifyContent: "center",
                }}
              >
                {"\u2715"}
              </button>
            </div>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <iframe
                src={pdfPreviewUrl}
                style={{ width: "100%", height: "100%", border: "none" }}
                title="Preview document"
              />
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input for document replace */}
      <input
        ref={replaceFileRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx"
        style={{ display: "none" }}
        onChange={handleReplaceFileSelected}
      />

      {/* Delete confirmation modal */}
      {deleteConfirm && (() => {
        const d = deleteConfirm.doc;
        const isGuide = d.processingType === "ghid";
        const rulesCount = d.summary?.rulesCount || 0;
        const scoringCount = d.summary?.scoringCount || 0;
        const elementsCount = d.summary?.elementsCount || 0;
        return (
          <div
            style={{
              position: "fixed", inset: 0, zIndex: 9999,
              background: "rgba(0,0,0,.5)", backdropFilter: "blur(4px)",
              display: "flex", alignItems: "center", justifyContent: "center",
              animation: "docFadeIn .15s ease-out",
            }}
            onClick={() => !deleteLoading && setDeleteConfirm(null)}
          >
            <div
              style={{
                width: 440, background: "#fff", borderRadius: 14,
                boxShadow: "0 24px 80px rgba(0,0,0,.25)",
                animation: "docSlideUp .2s ease both",
                overflow: "hidden",
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ padding: "20px 24px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: "rgba(248,113,113,.1)", display: "flex",
                    alignItems: "center", justifyContent: "center", fontSize: 18,
                  }}>
                    ⚠️
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#1a1e28" }}>Șterge document</div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>{d.name}</div>
                  </div>
                </div>

                <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6, margin: "0 0 14px" }}>
                  Documentul va fi șters permanent din storage.
                  {isGuide && (rulesCount > 0 || scoringCount > 0 || elementsCount > 0) && (
                    <> Toate datele extrase din acest ghid vor fi de asemenea șterse:</>
                  )}
                </p>

                {isGuide && (rulesCount > 0 || scoringCount > 0 || elementsCount > 0) && (
                  <div style={{
                    display: "flex", gap: 8, marginBottom: 16,
                    flexWrap: "wrap",
                  }}>
                    {rulesCount > 0 && (
                      <div style={{
                        padding: "6px 12px", borderRadius: 8,
                        background: "rgba(5,150,105,.06)", border: "1px solid rgba(5,150,105,.15)",
                        fontSize: 12, color: "#059669", fontWeight: 600,
                      }}>
                        🛡 {rulesCount} reguli
                      </div>
                    )}
                    {scoringCount > 0 && (
                      <div style={{
                        padding: "6px 12px", borderRadius: 8,
                        background: "rgba(124,58,237,.06)", border: "1px solid rgba(124,58,237,.15)",
                        fontSize: 12, color: "#7c3aed", fontWeight: 600,
                      }}>
                        📊 {scoringCount} criterii
                      </div>
                    )}
                    {elementsCount > 0 && (
                      <div style={{
                        padding: "6px 12px", borderRadius: 8,
                        background: "rgba(37,99,235,.06)", border: "1px solid rgba(37,99,235,.15)",
                        fontSize: 12, color: "#2563eb", fontWeight: 600,
                      }}>
                        📋 {elementsCount} elemente
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{
                padding: "14px 24px", borderTop: "1px solid rgba(226,232,240,.8)",
                display: "flex", justifyContent: "flex-end", gap: 8, background: "#fafbfc",
              }}>
                <button
                  disabled={deleteLoading}
                  onClick={() => setDeleteConfirm(null)}
                  style={{
                    padding: "8px 18px", borderRadius: 8,
                    border: "1px solid rgba(226,232,240,.8)", background: "#fff",
                    fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#64748b",
                  }}
                >
                  Anulează
                </button>
                <button
                  disabled={deleteLoading}
                  onClick={handleDocDeleteConfirm}
                  style={{
                    padding: "8px 18px", borderRadius: 8, border: "none",
                    background: deleteLoading ? "#fca5a5" : "#ef4444", color: "#fff",
                    fontSize: 13, fontWeight: 700, cursor: deleteLoading ? "wait" : "pointer",
                  }}
                >
                  {deleteLoading ? "Se șterge..." : "Șterge definitiv"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
