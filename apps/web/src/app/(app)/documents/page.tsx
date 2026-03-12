"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { SplitPane } from "@/components/layout/SplitPane";
import { apiGet, apiPost, apiPut, apiDelete, api } from "@/lib/api";

/* ══════════════════════════════════════════
   INTERFACES
   ══════════════════════════════════════════ */

interface TreeNode {
  id: string;
  label: string;
  type: "program" | "masura" | "sesiune" | "ghiduri" | "templateuri" | "clienti_prospecti" | "clienti_finali" | "folder";
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
  fileType: "pdf" | "docx" | "xlsx" | "doc";
  fileSize: number;
  status: "uploaded" | "processing" | "processed" | "failed";
  processingType: "ghid" | "template" | "reference" | "reference_data" | "client_doc";
  tags: string[];
  uploadedAt: string;
  uploadedBy: string;
}

interface DocItem {
  id: string;
  name: string;
  type: "PDF" | "DOCX" | "XLSX" | "DOC";
  size: string;
  uploaded: string;
  uploadedBy: string;
  status: "procesat" | "neprocesat" | "template" | "referință";
  reguliExtrase: number;
  campuri?: number;
  tags: string[];
}

/* ══════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════ */

const TYPE_ICONS: Record<string, string> = { PDF: "\u{1F4D5}", DOCX: "\u{1F4D8}", XLSX: "\u{1F4D7}", DOC: "\u{1F4D8}" };

const STATUS_MAP: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  procesat: { label: "Procesat AI", color: "var(--accent-green)", bg: "rgba(52,211,153,0.12)", icon: "\u2713" },
  neprocesat: { label: "Neprocesat", color: "var(--accent-yellow)", bg: "rgba(251,191,36,0.12)", icon: "\u23F3" },
  template: { label: "Template", color: "var(--accent-blue)", bg: "rgba(77,139,255,0.12)", icon: "\u{1F4DD}" },
  "referință": { label: "Referință", color: "var(--accent-purple)", bg: "rgba(167,139,250,0.12)", icon: "\u{1F4CC}" },
};

const NODE_ICONS: Record<string, string> = {
  ghiduri: "\u{1F4D6}",
  templateuri: "\u{1F4DD}",
  clienti_prospecti: "\u{1F50D}",
  clienti_finali: "\u2705",
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
  return {
    id: doc.id,
    name: doc.name,
    type: doc.fileType.toUpperCase() as DocItem["type"],
    size: formatFileSize(doc.fileSize),
    uploaded: doc.uploadedAt ? doc.uploadedAt.slice(0, 10) : "",
    uploadedBy: doc.uploadedBy || "",
    status: mapApiStatusToLocal(doc.status, doc.processingType),
    reguliExtrase: 0,
    campuri: doc.processingType === "template" ? 0 : undefined,
    tags: doc.tags || [],
  };
}

function mapApiFolderToTreeNode(folder: ApiFolderNode): TreeNode {
  return {
    id: folder.id,
    label: folder.name,
    type: (folder.type || "folder") as TreeNode["type"],
    children: folder.children?.length ? folder.children.map(mapApiFolderToTreeNode) : undefined,
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

/* Map folder type to processing type for uploads */
const FOLDER_TO_PROCESSING: Record<string, string> = {
  ghiduri: "ghid",
  templateuri: "template",
  clienti_prospecti: "client_doc",
  clienti_finali: "client_doc",
};

/** Files above this size use presigned URL (direct browser → R2) to avoid Node memory pressure */
const PRESIGNED_THRESHOLD = 10 * 1024 * 1024; // 10 MB

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
  const [showUpload, setShowUpload] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([]);
  const [ghidSubType, setGhidSubType] = useState<"ghid" | "reference_data">("ghid");
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

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
    } catch (err) {
      console.error("Failed to create folder:", err);
    }
    setCtxMenu(null);
  }, [tree]);

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
      } catch (err) {
        console.error("Failed to rename folder:", err);
      }
    }
    setRenaming(null);
    setRenameVal("");
  }, [renaming, renameVal]);

  const handleDelete = useCallback(async (nodeId: string) => {
    try {
      await apiDelete(`/api/documents/folders/${nodeId}`);
      if (selectedFolder === nodeId) setSelectedFolder(null);
      setTree(prev => removeNodeFromTree(prev, nodeId));
    } catch (err) {
      console.error("Failed to delete folder:", err);
    }
    setCtxMenu(null);
  }, [selectedFolder]);

  const handleContextMenu = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, nodeId });
  }, []);

  const handleDocDelete = useCallback(async (docId: string) => {
    if (!confirm("Sigur vrei sa stergi acest document?")) return;
    try {
      await apiDelete(`/api/documents/documents/${docId}`);
      setDocs(prev => prev.filter(d => d.id !== docId));
      if (selectedDoc === docId) setSelectedDoc(null);
    } catch (err) {
      console.error("Failed to delete document:", err);
    }
  }, [selectedDoc]);

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

  const handleDocProcess = useCallback(async (docId: string) => {
    try {
      await apiPost(`/api/documents/documents/${docId}/process`, {});
      setDocs(prev => prev.map(d => d.id === docId ? { ...d, status: "neprocesat" as const } : d));
      if (selectedFolder) {
        setTimeout(() => fetchDocs(selectedFolder), 1000);
      }
    } catch (err) {
      console.error("Failed to trigger AI processing:", err);
    }
  }, [selectedFolder, fetchDocs]);

  const handleUpload = useCallback(async () => {
    if (uploadFiles.length === 0 || !selectedFolder) return;
    setUploading(true);
    setUploadError(null);
    setUploadWarnings([]);
    setUploadProgress(0);

    const uploadNode = selectedFolder ? findNodeById(tree, selectedFolder) : null;
    const storedToken = typeof window !== "undefined" ? localStorage.getItem("df-token") : null;
    const authHeaders: Record<string, string> = {};
    if (storedToken) authHeaders["Authorization"] = `Bearer ${storedToken}`;

    const totalFiles = uploadFiles.length;
    let completed = 0;
    const allWarnings: string[] = [];
    const errors: string[] = [];

    for (const file of uploadFiles) {
      try {
        const usePresigned = file.size > PRESIGNED_THRESHOLD;

        if (usePresigned) {
          // --- Large file: presigned URL → direct browser upload to R2 ---
          const processingType = (uploadNode?.type === "ghiduri" && ghidSubType === "reference_data")
            ? "reference_data" : undefined;

          // Step 1: Get presigned URL from API
          const presignedRes = await fetch("/api/documents/presigned-url", {
            method: "POST",
            headers: { ...authHeaders, "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              filename: file.name,
              mime_type: file.type || "application/octet-stream",
              size_bytes: file.size,
              folder_id: selectedFolder,
              ...(processingType && { processing_type: processingType }),
            }),
          });

          if (!presignedRes.ok) {
            const body = await presignedRes.json().catch(() => ({ error: "Failed to get presigned URL" }));
            errors.push(`${file.name}: ${body.error || `HTTP ${presignedRes.status}`}`);
            completed++;
            setUploadProgress(Math.round((completed / totalFiles) * 100));
            continue;
          }

          const { presigned_url, document_id } = await presignedRes.json();

          // Step 2: Upload directly to R2 via presigned URL
          const uploadRes = await fetch(presigned_url, {
            method: "PUT",
            headers: { "Content-Type": file.type || "application/octet-stream" },
            body: file,
          });

          if (!uploadRes.ok) {
            errors.push(`${file.name}: Upload direct la storage a eșuat (HTTP ${uploadRes.status})`);
            completed++;
            setUploadProgress(Math.round((completed / totalFiles) * 100));
            continue;
          }

          // Step 3: Confirm upload to trigger processing
          const confirmRes = await fetch(`/api/documents/documents/${document_id}/confirm-upload`, {
            method: "POST",
            headers: { ...authHeaders, "Content-Type": "application/json" },
            credentials: "include",
          });

          if (!confirmRes.ok) {
            const body = await confirmRes.json().catch(() => ({ error: "Confirm failed" }));
            errors.push(`${file.name}: ${body.error || "Confirmare eșuată"}`);
          }
        } else {
          // --- Small file: classic FormData upload through Node ---
          const formData = new FormData();
          formData.append("file", file);
          formData.append("tags", JSON.stringify([]));

          if (uploadNode?.type === "ghiduri" && ghidSubType === "reference_data") {
            formData.append("processingType", "reference_data");
          }

          const res = await fetch(`/api/documents/folders/${selectedFolder}/documents`, {
            method: "POST",
            headers: authHeaders,
            credentials: "include",
            body: formData,
          });

          if (!res.ok) {
            const body = await res.json().catch(() => ({ error: "Upload failed" }));
            errors.push(`${file.name}: ${body.error || `HTTP ${res.status}`}`);
          } else {
            const result = await res.json();
            if (result.warnings) allWarnings.push(...result.warnings.map((w: string) => `${file.name}: ${w}`));
          }
        }
      } catch (err: any) {
        errors.push(`${file.name}: ${err.message || "Eroare la upload"}`);
      }

      completed++;
      setUploadProgress(Math.round((completed / totalFiles) * 100));
    }

    if (errors.length > 0) {
      setUploadError(errors.join("\n"));
    } else {
      await new Promise(r => setTimeout(r, 300));
      setShowUpload(false);
      setUploadFiles([]);
      setUploadError(null);
      setUploadProgress(0);
    }
    if (allWarnings.length > 0) setUploadWarnings(allWarnings);

    fetchDocs(selectedFolder);
    setUploading(false);
  }, [uploadFiles, selectedFolder, tree, ghidSubType, fetchDocs]);

  // Filtered documents
  const filteredDocs = docs.filter(d => {
    if (!search) return true;
    const q = search.toLowerCase();
    return d.name.toLowerCase().includes(q) || d.type.toLowerCase().includes(q) || d.tags.some(t => t.toLowerCase().includes(q));
  });

  const selDoc = filteredDocs.find(d => d.id === selectedDoc) || null;
  const breadcrumb = selectedFolder ? getBreadcrumb(tree, selectedFolder) || [] : [];
  const selectedNode = selectedFolder ? findNodeById(tree, selectedFolder) : null;
  const isLeafSelected = selectedNode ? LEAF_TYPES.has(selectedNode.type) : false;

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
            <span className="doc-tree-icon">{isExpanded ? "\u{1F4C2}" : "\u{1F4C1}"}</span>
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
        <span className="doc-tree-header-icon">{"\u{1F4C2}"}</span>
        <span className="doc-tree-header-label">Structura programe</span>
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
            <button className="doc-empty-cta" onClick={() => {
              apiPost<ApiFolderNode>("/api/documents/folders", {
                name: "Program nou",
                type: "program",
                parentId: null,
              }).then(result => {
                const newNode = mapApiFolderToTreeNode(result);
                setTree(prev => [...prev, newNode]);
                setRenaming(newNode.id);
                setRenameVal("Program nou");
              }).catch(err => console.error("Failed to create program:", err));
            }}>
              + Adauga program
            </button>
          </div>
        ) : (
          <>
            {renderTree(tree)}
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
              }).catch(err => console.error("Failed to create program:", err));
            }}>
              + Adauga program
            </button>
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
          <button className="doc-upload-btn" onClick={() => setShowUpload(true)} disabled={!isLeafSelected} title={!isLeafSelected ? "Selecteaza un folder de tip Ghiduri, Template-uri, Clienti Prospecti sau Clienti Finali" : "Upload document"}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Upload
          </button>
        </div>
      </div>
      <div className="doc-list-scroll">
        {!selectedFolder ? (
          /* Welcome state — no folder selected */
          <div className="doc-welcome">
            <div className="doc-welcome-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
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
                <span className="doc-welcome-tip-icon">{"\u{1F4C2}"}</span>
                <span>Click dreapta pe un nod pentru a adauga sub-nivele</span>
              </div>
              <div className="doc-welcome-tip">
                <span className="doc-welcome-tip-icon">{"\u{1F4D6}"}</span>
                <span>La crearea unei sesiuni se creeaza automat Ghiduri, Template-uri, Clienti</span>
              </div>
              <div className="doc-welcome-tip">
                <span className="doc-welcome-tip-icon">{"\u{1F4E4}"}</span>
                <span>Upload disponibil doar in folderele finale (Ghiduri, Template-uri, etc.)</span>
              </div>
            </div>
          </div>
        ) : !isLeafSelected ? (
          /* Non-leaf folder selected — show hierarchy info */
          <div className="doc-welcome">
            <div className="doc-welcome-icon">
              {selectedNode?.type === "program" ? (
                <span style={{ fontSize: 44, opacity: 0.5 }}>{"\u{1F3E2}"}</span>
              ) : selectedNode?.type === "masura" ? (
                <span style={{ fontSize: 44, opacity: 0.5 }}>{"\u{1F4CA}"}</span>
              ) : (
                <span style={{ fontSize: 44, opacity: 0.5 }}>{"\u{1F4C5}"}</span>
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
            <div className="doc-empty-illustration">
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
              </svg>
            </div>
            {search ? (
              <>
                <div className="doc-empty-title">Niciun rezultat pentru &ldquo;{search}&rdquo;</div>
                <div className="doc-empty-desc">Incearca cu alti termeni de cautare.</div>
                <button className="doc-empty-cta-secondary" onClick={() => setSearch("")}>
                  Sterge cautarea
                </button>
              </>
            ) : (
              <>
                <div className="doc-empty-title">{isLeafSelected ? "Folder gol" : "Navigheaza mai adanc"}</div>
                <div className="doc-empty-desc">
                  {isLeafSelected
                    ? <>Acest folder nu contine inca documente.<br />Adauga primul document cu butonul de upload.</>
                    : <>Documentele se adauga doar in folderele de tip<br /><strong>Ghiduri</strong>, <strong>Template-uri</strong>, <strong>Clienti Prospecti</strong> sau <strong>Clienti Finali</strong>.<br />Expandeaza arborele si selecteaza un folder final.</>
                  }
                </div>
                {isLeafSelected && (
                  <button className="doc-empty-cta" onClick={() => setShowUpload(true)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    Upload document
                  </button>
                )}
              </>
            )}
          </div>
        ) : filteredDocs.map(d => {
          const st = STATUS_MAP[d.status];
          return (
            <div
              key={d.id}
              className={`doc-card ${selectedDoc === d.id ? "active" : ""}`}
              onClick={() => setSelectedDoc(d.id)}
            >
              <div className="doc-card-icon">{TYPE_ICONS[d.type] || "\u{1F4C4}"}</div>
              <div className="doc-card-info">
                <div className="doc-card-name">{d.name}</div>
                <div className="doc-card-meta">
                  <span>{d.type} {"\u00B7"} {d.size}</span>
                  <span>{"\u{1F4C5}"} {d.uploaded}</span>
                  <span>{"\u{1F464}"} {d.uploadedBy}</span>
                </div>
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
                {d.campuri != null && d.campuri > 0 && <span className="doc-stat-num">{d.campuri} campuri</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  /* ─── Right panel: detail ─── */
  const detailPanel = selDoc ? (
    <div className="doc-detail" key={selDoc.id}>
      <div className="doc-detail-header">
        <button className="doc-detail-close" onClick={() => setSelectedDoc(null)} aria-label="Inchide">{"\u2715"}</button>
        <div className="doc-detail-icon">{TYPE_ICONS[selDoc.type] || "\u{1F4C4}"}</div>
        <div className="doc-detail-name">{selDoc.name}</div>
        <div className="doc-detail-type">{selDoc.type} {"\u00B7"} {selDoc.size}</div>
      </div>

      <div className="doc-detail-section">
        <div className="doc-detail-stitle">Status</div>
        {(() => {
          const st = STATUS_MAP[selDoc.status];
          return (
            <span
              className="doc-status-badge"
              style={{ background: st.bg, color: st.color, fontSize: 12, padding: "5px 14px" }}
            >
              {st.icon} {st.label}
            </span>
          );
        })()}
        {selDoc.status === "neprocesat" && (
          <div style={{ marginTop: 10 }}>
            <button
              className="doc-detail-btn primary"
              style={{ width: "auto", display: "inline-flex" }}
              onClick={() => handleDocProcess(selDoc.id)}
            >
              {"\u{1F916}"} Proceseaza cu AI
            </button>
          </div>
        )}
      </div>

      <div className="doc-detail-section">
        <div className="doc-detail-stitle">Detalii</div>
        <div className="doc-detail-grid">
          <div className="doc-detail-cell">
            <div className="doc-detail-cell-label">Uploadat</div>
            <div className="doc-detail-cell-value mono">{selDoc.uploaded}</div>
          </div>
          <div className="doc-detail-cell">
            <div className="doc-detail-cell-label">De catre</div>
            <div className="doc-detail-cell-value">{selDoc.uploadedBy}</div>
          </div>
          {selDoc.reguliExtrase > 0 && (
            <div className="doc-detail-cell">
              <div className="doc-detail-cell-label">Reguli extrase</div>
              <div className="doc-detail-cell-value mono" style={{ color: "var(--accent-green)" }}>
                {selDoc.reguliExtrase} reguli
              </div>
            </div>
          )}
          {selDoc.campuri != null && selDoc.campuri > 0 && (
            <div className="doc-detail-cell">
              <div className="doc-detail-cell-label">Campuri template</div>
              <div className="doc-detail-cell-value mono" style={{ color: "var(--accent-blue)" }}>
                {selDoc.campuri} campuri
              </div>
            </div>
          )}
        </div>
      </div>

      {selDoc.tags.length > 0 && (
        <div className="doc-detail-section">
          <div className="doc-detail-stitle">Tags</div>
          <div className="doc-detail-tags">
            {selDoc.tags.map((t, i) => <span key={i} className="doc-detail-tag">{t}</span>)}
          </div>
        </div>
      )}

      <div className="doc-detail-actions">
        <button className="doc-detail-btn primary" onClick={() => handleDocDownload(selDoc.id)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Descarca
        </button>
        <button className="doc-detail-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
          Previzualizare
        </button>
        <button className="doc-detail-btn danger" onClick={() => handleDocDelete(selDoc.id)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
          Sterge
        </button>
      </div>
    </div>
  ) : (
    <div className="doc-detail doc-detail-empty">
      <div className="doc-detail-empty-inner">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35 }}>
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
        </svg>
        <div className="doc-empty-title" style={{ fontSize: 14, marginTop: 12 }}>Niciun document selectat</div>
        <div className="doc-empty-desc" style={{ fontSize: 12 }}>
          Selecteaza un document din lista<br />pentru a vedea detaliile
        </div>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        /* ─── Animations ─── */
        @keyframes docPulse { 0%, 100% { opacity: .4 } 50% { opacity: .8 } }
        @keyframes docFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes docSlideUp { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes docSlideIn { from { opacity: 0; transform: translateX(-8px) } to { opacity: 1; transform: translateX(0) } }
        @keyframes docCtxIn { from { opacity: 0; transform: scale(.95) } to { opacity: 1; transform: scale(1) } }
        @keyframes docCheckIn { from { transform: scale(0) } to { transform: scale(1) } }
        @keyframes docProgressStripe { 0% { background-position: 0 0 } 100% { background-position: 40px 0 } }

        /* ─── Topbar ─── */
        .doc-topbar { padding: 18px 32px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 16px; background: var(--bg-surface); flex-shrink: 0; }
        .doc-topbar-title { font-size: 22px; font-weight: 800; flex: 1; letter-spacing: -.4px; display: flex; align-items: center; gap: 10px; }
        .doc-topbar-title-icon { width: 30px; height: 30px; border-radius: var(--r-sm); background: rgba(77,139,255,.1); display: flex; align-items: center; justify-content: center; font-size: 15px; }
        .doc-topbar-stats { display: flex; gap: 16px; }
        .doc-topbar-stat { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); }
        .doc-topbar-stat-num { font-family: var(--font-mono); font-weight: 700; color: var(--text-secondary); font-size: 13px; }

        /* ─── Tree panel ─── */
        .doc-tree-panel { display: flex; flex-direction: column; overflow: hidden; background: var(--bg-surface); height: 100%; }
        .doc-tree-header { padding: 12px 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .doc-tree-header-icon { font-size: 14px; opacity: .6; }
        .doc-tree-header-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .8px; color: var(--text-muted); flex: 1; }
        .doc-tree-scroll { flex: 1; overflow-y: auto; padding: 6px 0; }

        .doc-tree-item { display: flex; align-items: center; gap: 6px; padding: 5px 10px; cursor: pointer; font-size: 13px; color: var(--text-secondary); transition: all .15s; position: relative; }
        .doc-tree-item:hover { background: var(--bg-hover); color: var(--text-primary); }
        .doc-tree-item.active { background: rgba(77,139,255,.08); color: var(--accent-blue); font-weight: 600; }
        .doc-tree-item.active::before { content: ''; position: absolute; left: 0; top: 4px; bottom: 4px; width: 3px; background: var(--accent-blue); border-radius: 0 2px 2px 0; }
        .doc-tree-arrow { width: 14px; font-size: 10px; color: var(--text-muted); flex-shrink: 0; text-align: center; transition: transform .2s ease; display: inline-block; }
        .doc-tree-arrow.expanded { transform: rotate(90deg); }
        .doc-tree-icon { font-size: 14px; flex-shrink: 0; }
        .doc-tree-dot { border-radius: 50%; flex-shrink: 0; box-shadow: 0 0 0 2px rgba(255,255,255,.05); }
        .doc-tree-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .doc-tree-label-program { font-weight: 700; font-size: 14px; color: var(--text-primary); }
        .doc-tree-label-masura { font-weight: 600; font-size: 13px; color: #C9A84C; }
        .doc-tree-label-sesiune { font-weight: 500; font-size: 13px; color: var(--text-secondary); }
        .doc-tree-count { font-size: 10px; font-family: var(--font-mono); font-weight: 700; color: var(--text-muted); background: var(--bg-elevated); padding: 1px 6px; border-radius: 8px; }
        .doc-tree-rename { flex: 1; padding: 2px 6px; border-radius: 3px; border: 1px solid var(--accent-blue); background: var(--bg-deep); color: var(--text-primary); font-size: 13px; font-family: var(--font-sans); outline: none; min-width: 0; }
        .doc-tree-guide { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--border); opacity: .5; }
        .doc-tree-children { position: relative; }
        .doc-tree-add-btn { margin: 8px 12px; padding: 7px 12px; border-radius: var(--r-sm); border: 1px dashed var(--border); background: transparent; color: var(--text-muted); font-size: 12px; font-weight: 600; cursor: pointer; font-family: var(--font-sans); text-align: center; transition: all .2s; }
        .doc-tree-add-btn:hover { border-color: var(--accent-blue); color: var(--accent-blue); background: rgba(77,139,255,.04); }

        /* ─── Context menu ─── */
        .doc-ctx-menu { position: fixed; z-index: 200; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: var(--r-md); padding: 4px; min-width: 180px; box-shadow: 0 8px 32px rgba(0,0,0,.5); animation: docCtxIn .12s ease; }
        .doc-ctx-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: var(--r-sm); cursor: pointer; font-size: 13px; color: var(--text-secondary); transition: all .1s; border: none; background: none; width: 100%; text-align: left; font-family: var(--font-sans); }
        .doc-ctx-item:hover { background: var(--bg-hover); color: var(--text-primary); }
        .doc-ctx-item.danger { color: var(--accent-red); }
        .doc-ctx-item.danger:hover { background: rgba(248,113,113,.08); }
        .doc-ctx-sep { height: 1px; background: var(--border); margin: 4px 8px; }

        /* ─── Document list panel ─── */
        .doc-list-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; height: 100%; }
        .doc-list-bar { padding: 10px 20px; border-bottom: 1px solid var(--border); background: var(--bg-surface); flex-shrink: 0; }
        .doc-breadcrumb { display: flex; align-items: center; gap: 0; font-size: 12px; margin-bottom: 8px; min-height: 18px; }
        .doc-bc-seg { color: var(--text-muted); transition: color .15s; }
        .doc-bc-active { color: var(--accent-blue); font-weight: 600; }
        .doc-bc-sep { color: var(--border-active); margin: 0 6px; font-size: 10px; }
        .doc-toolbar { display: flex; align-items: center; gap: 10px; }

        /* Search with icon */
        .doc-search-wrap { position: relative; display: flex; align-items: center; flex: 1; max-width: 280px; }
        .doc-search-icon { position: absolute; left: 10px; color: var(--text-muted); pointer-events: none; transition: color .2s; }
        .doc-search-wrap:focus-within .doc-search-icon { color: var(--accent-blue); }
        .doc-search-input { width: 100%; padding: 7px 14px 7px 32px; border-radius: var(--r-md); border: 1px solid var(--border); background: var(--bg-deep); color: var(--text-primary); font-size: 13px; font-family: var(--font-sans); outline: none; transition: all .2s; }
        .doc-search-input:focus { border-color: var(--accent-blue); box-shadow: 0 0 0 3px rgba(77,139,255,.1); }
        .doc-search-input::placeholder { color: var(--text-muted); }
        .doc-search-kbd { position: absolute; right: 8px; font-size: 10px; font-family: var(--font-mono); color: var(--text-muted); background: var(--bg-elevated); padding: 1px 5px; border-radius: 3px; border: 1px solid var(--border); pointer-events: none; opacity: .7; }
        .doc-search-wrap:focus-within .doc-search-kbd { opacity: 0; }

        .doc-upload-btn { display: flex; align-items: center; gap: 6px; padding: 7px 16px; border-radius: var(--r-md); border: none; background: var(--accent-blue); color: #fff; font-size: 13px; font-weight: 700; cursor: pointer; font-family: var(--font-sans); margin-left: auto; box-shadow: 0 2px 12px rgba(77,139,255,.25); transition: all .15s; white-space: nowrap; }
        .doc-upload-btn:hover:not(:disabled) { background: #5d9bff; transform: translateY(-1px); box-shadow: 0 4px 16px rgba(77,139,255,.35); }
        .doc-upload-btn:active:not(:disabled) { transform: translateY(0); }
        .doc-upload-btn:disabled { opacity: .4; cursor: not-allowed; }
        .doc-list-scroll { flex: 1; overflow-y: auto; padding: 12px 20px; display: flex; flex-direction: column; gap: 6px; }

        /* ─── Document card ─── */
        .doc-card { display: flex; align-items: center; gap: 14px; padding: 12px 16px; border-radius: var(--r-md); border: 1px solid var(--border); background: var(--bg-surface); cursor: pointer; transition: all .18s; animation: docSlideIn .25s ease both; }
        .doc-card:hover { border-color: var(--border-active); background: var(--bg-elevated); transform: translateX(2px); }
        .doc-card.active { border-color: var(--accent-blue); background: rgba(77,139,255,.04); box-shadow: 0 0 0 1px rgba(77,139,255,.15); }
        .doc-card-icon { font-size: 26px; flex-shrink: 0; }
        .doc-card-info { flex: 1; min-width: 0; }
        .doc-card-name { font-size: 13px; font-weight: 700; margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .doc-card-meta { font-size: 11px; color: var(--text-muted); display: flex; gap: 8px; flex-wrap: wrap; }
        .doc-card-meta span { display: flex; align-items: center; gap: 3px; }
        .doc-card-tags { display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap; }
        .doc-card-tag { font-size: 10px; padding: 1px 6px; border-radius: 8px; background: var(--bg-elevated); color: var(--text-muted); border: 1px solid var(--border); }
        .doc-card-status { flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
        .doc-status-badge { font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 10px; display: flex; align-items: center; gap: 4px; white-space: nowrap; }
        .doc-stat-num { font-size: 11px; font-family: var(--font-mono); color: var(--text-muted); }

        /* ─── Detail panel ─── */
        .doc-detail { background: var(--bg-surface); display: flex; flex-direction: column; overflow-y: auto; height: 100%; }
        .doc-detail-empty { align-items: center; justify-content: center; }
        .doc-detail-empty-inner { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 40px 20px; text-align: center; }
        .doc-detail-header { padding: 20px; border-bottom: 1px solid var(--border); position: relative; animation: docFadeIn .3s ease; }
        .doc-detail-close { position: absolute; top: 14px; right: 14px; background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 16px; width: 28px; height: 28px; border-radius: var(--r-sm); display: flex; align-items: center; justify-content: center; transition: all .15s; }
        .doc-detail-close:hover { color: var(--text-primary); background: var(--bg-hover); }
        .doc-detail-icon { font-size: 36px; margin-bottom: 8px; }
        .doc-detail-name { font-size: 16px; font-weight: 800; margin-bottom: 4px; line-height: 1.3; }
        .doc-detail-type { font-size: 12px; font-family: var(--font-mono); color: var(--text-secondary); }
        .doc-detail-section { padding: 16px 20px; border-bottom: 1px solid var(--border); animation: docFadeIn .4s ease; }
        .doc-detail-stitle { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .8px; color: var(--text-muted); margin-bottom: 10px; }
        .doc-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .doc-detail-cell { padding: 8px 10px; background: var(--bg-deep); border-radius: var(--r-sm); border: 1px solid var(--border); transition: border-color .15s; }
        .doc-detail-cell:hover { border-color: var(--border-active); }
        .doc-detail-cell-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: var(--text-muted); margin-bottom: 2px; }
        .doc-detail-cell-value { font-size: 13px; font-weight: 600; color: var(--text-primary); }
        .doc-detail-cell-value.mono { font-family: var(--font-mono); }
        .doc-detail-tags { display: flex; gap: 5px; flex-wrap: wrap; }
        .doc-detail-tag { font-size: 11px; padding: 3px 10px; border-radius: var(--r-sm); background: var(--bg-deep); border: 1px solid var(--border); color: var(--text-secondary); transition: all .15s; cursor: default; }
        .doc-detail-tag:hover { border-color: var(--accent-blue); color: var(--accent-blue); }
        .doc-detail-actions { display: flex; gap: 8px; padding: 16px 20px; margin-top: auto; }
        .doc-detail-btn { flex: 1; padding: 9px; border-radius: var(--r-sm); border: 1px solid var(--border); background: transparent; color: var(--text-secondary); font-size: 12px; font-weight: 600; cursor: pointer; font-family: var(--font-sans); transition: all .15s; display: flex; align-items: center; justify-content: center; gap: 5px; }
        .doc-detail-btn:hover { border-color: var(--border-active); color: var(--text-primary); background: var(--bg-hover); }
        .doc-detail-btn.primary { border-color: var(--accent-blue); color: var(--accent-blue); }
        .doc-detail-btn.primary:hover { background: rgba(77,139,255,.08); }
        .doc-detail-btn.danger { color: var(--accent-red); border-color: rgba(248,113,113,.25); }
        .doc-detail-btn.danger:hover { background: rgba(248,113,113,.06); }

        /* ─── Rich empty states ─── */
        .doc-empty-rich { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 40px 24px; flex: 1; animation: docFadeIn .4s ease; }
        .doc-empty-illustration { margin-bottom: 16px; }
        .doc-empty-folder-stack { position: relative; width: 64px; height: 52px; }
        .doc-empty-folder { position: absolute; border-radius: 4px 4px 6px 6px; border: 1px solid var(--border); }
        .doc-empty-folder.f1 { width: 56px; height: 38px; bottom: 0; left: 4px; background: var(--bg-elevated); }
        .doc-empty-folder.f2 { width: 48px; height: 34px; bottom: 4px; left: 8px; background: var(--bg-hover); opacity: .7; }
        .doc-empty-folder.f3 { width: 40px; height: 30px; bottom: 8px; left: 12px; background: var(--bg-surface); opacity: .4; border-style: dashed; }
        .doc-empty-title { font-size: 15px; font-weight: 700; color: var(--text-primary); margin-bottom: 6px; }
        .doc-empty-desc { font-size: 12px; color: var(--text-muted); line-height: 1.6; max-width: 240px; margin-bottom: 16px; }
        .doc-empty-cta { display: inline-flex; align-items: center; gap: 6px; padding: 8px 18px; border-radius: var(--r-md); border: none; background: var(--accent-blue); color: #fff; font-size: 13px; font-weight: 700; cursor: pointer; font-family: var(--font-sans); transition: all .15s; box-shadow: 0 2px 12px rgba(77,139,255,.25); }
        .doc-empty-cta:hover { background: #5d9bff; transform: translateY(-1px); }
        .doc-empty-cta-secondary { display: inline-flex; align-items: center; gap: 6px; padding: 7px 16px; border-radius: var(--r-md); border: 1px solid var(--border); background: transparent; color: var(--text-secondary); font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font-sans); transition: all .15s; }
        .doc-empty-cta-secondary:hover { border-color: var(--border-active); color: var(--text-primary); }

        /* ─── Welcome state ─── */
        .doc-welcome { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; text-align: center; padding: 40px 24px; animation: docFadeIn .5s ease; }
        .doc-welcome-icon { margin-bottom: 12px; }
        .doc-welcome-title { font-size: 18px; font-weight: 800; color: var(--text-primary); margin-bottom: 6px; }
        .doc-welcome-desc { font-size: 13px; color: var(--text-muted); line-height: 1.5; max-width: 300px; margin-bottom: 24px; }
        .doc-welcome-tips { display: flex; flex-direction: column; gap: 8px; width: 100%; max-width: 280px; }
        .doc-welcome-tip { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: var(--r-sm); background: var(--bg-elevated); border: 1px solid var(--border); font-size: 12px; color: var(--text-secondary); text-align: left; transition: all .2s; }
        .doc-welcome-tip:hover { border-color: var(--border-active); background: var(--bg-hover); }
        .doc-welcome-tip-icon { font-size: 16px; flex-shrink: 0; }

        /* ─── Skeleton ─── */
        .doc-skeleton-wrap { display: flex; flex-direction: column; gap: 4px; padding: 8px 0; }
        .doc-skel-row { display: flex; align-items: center; gap: 8px; padding: 6px 10px; animation: docPulse 1.5s ease infinite; }
        .doc-skel-dot { height: 8px; border-radius: 50%; background: var(--border); flex-shrink: 0; }
        .doc-skel-bar { height: 12px; border-radius: 4px; background: var(--border); }
        .doc-skel-card { display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-radius: var(--r-md); border: 1px solid var(--border); animation: docPulse 1.5s ease infinite; }
        .doc-skel-icon { width: 32px; height: 32px; border-radius: var(--r-sm); background: var(--border); flex-shrink: 0; }

        /* ─── Upload modal ─── */
        .doc-overlay { position: fixed; inset: 0; background: var(--overlay-bg); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; z-index: 100; animation: docFadeIn .2s; }
        .doc-modal { background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--r-lg); width: 520px; max-width: calc(100vw - 40px); padding: 28px; animation: docSlideUp .3s ease; }
        .doc-modal-title { font-size: 20px; font-weight: 800; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center; }
        .doc-modal-close { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 18px; width: 32px; height: 32px; border-radius: var(--r-sm); display: flex; align-items: center; justify-content: center; transition: all .15s; }
        .doc-modal-close:hover { color: var(--text-primary); background: var(--bg-hover); }
        .doc-modal-sub { font-size: 14px; color: var(--text-secondary); margin-bottom: 20px; }
        .doc-upload-zone { border: 2px dashed var(--border); border-radius: var(--r-md); padding: 32px 20px; text-align: center; margin-bottom: 16px; cursor: pointer; transition: all .25s; position: relative; }
        .doc-upload-zone:hover { border-color: var(--accent-blue); background: rgba(77,139,255,.03); }
        .doc-upload-zone.drag-active { border-color: var(--accent-blue); background: rgba(77,139,255,.06); box-shadow: 0 0 0 4px rgba(77,139,255,.1); }
        .doc-upload-zone.has-file { border-color: var(--accent-green); border-style: solid; background: rgba(52,211,153,.04); }
        .doc-upload-zone-icon { font-size: 28px; margin-bottom: 6px; }
        .doc-upload-zone-title { font-size: 14px; font-weight: 600; margin-bottom: 3px; }
        .doc-upload-zone-sub { font-size: 12px; color: var(--text-muted); }
        .doc-upload-zone-remove { position: absolute; top: 8px; right: 8px; background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-muted); width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 12px; transition: all .15s; }
        .doc-upload-zone-remove:hover { color: var(--accent-red); border-color: var(--accent-red); }
        .doc-upload-type-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 16px; }
        .doc-upload-type { padding: 12px; border-radius: var(--r-sm); border: 1px solid var(--border); cursor: pointer; transition: all .15s; text-align: center; background: transparent; font-family: var(--font-sans); }
        .doc-upload-type:hover { border-color: var(--border-active); background: var(--bg-hover); }
        .doc-upload-type.on { border-color: var(--accent-blue); background: rgba(77,139,255,.06); }
        .doc-upload-type-icon { font-size: 20px; margin-bottom: 4px; }
        .doc-upload-type-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
        .doc-upload-type-desc { font-size: 10px; color: var(--text-muted); margin-top: 2px; }

        /* Upload type auto-detected info */
        .doc-upload-type-info { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; border-radius: var(--r-md); border: 1px solid rgba(77,139,255,.2); background: rgba(77,139,255,.04); margin-bottom: 16px; }
        .doc-upload-type-info-icon { font-size: 24px; flex-shrink: 0; margin-top: 2px; }
        .doc-upload-type-info-label { font-size: 13px; color: var(--text-primary); margin-bottom: 2px; }
        .doc-upload-type-info-label strong { color: var(--accent-blue); }
        .doc-upload-type-info-desc { font-size: 11px; color: var(--text-muted); line-height: 1.4; }

        .doc-upload-ghid-subtype { margin-bottom: 16px; }
        .doc-upload-ghid-subtype-label { font-size: 13px; color: var(--text-secondary); margin-bottom: 10px; font-weight: 500; }
        .doc-upload-ghid-subtype-options { display: flex; flex-direction: column; gap: 8px; }
        .doc-upload-ghid-option { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; border-radius: var(--r-md); border: 1px solid var(--border); background: var(--bg-elevated); cursor: pointer; text-align: left; transition: all .15s; }
        .doc-upload-ghid-option:hover { border-color: var(--border-active); background: var(--bg-hover); }
        .doc-upload-ghid-option.active { border-color: var(--accent-blue); background: rgba(77,139,255,.06); box-shadow: 0 0 0 1px rgba(77,139,255,.2); }
        .doc-upload-ghid-option-icon { font-size: 22px; flex-shrink: 0; margin-top: 2px; }
        .doc-upload-ghid-option-title { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 2px; }
        .doc-upload-ghid-option.active .doc-upload-ghid-option-title { color: var(--accent-blue); }
        .doc-upload-ghid-option-desc { font-size: 11px; color: var(--text-muted); line-height: 1.4; }

        /* Upload progress */
        .doc-upload-progress { height: 4px; border-radius: 2px; background: var(--bg-elevated); overflow: hidden; margin-bottom: 16px; }
        .doc-upload-progress-bar { height: 100%; border-radius: 2px; background: linear-gradient(90deg, var(--accent-blue), #7aa8ff); transition: width .3s ease; position: relative; }
        .doc-upload-progress-bar.active { background-image: linear-gradient(45deg, rgba(255,255,255,.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.15) 50%, rgba(255,255,255,.15) 75%, transparent 75%, transparent); background-size: 40px 40px; animation: docProgressStripe 1s linear infinite; }

        /* Error box */
        .doc-upload-error { padding: 10px 14px; margin-bottom: 12px; border-radius: var(--r-sm); background: rgba(248,113,113,.08); border: 1px solid rgba(248,113,113,.2); color: var(--accent-red); font-size: 13px; display: flex; align-items: center; gap: 8px; animation: docFadeIn .2s ease; }

        .doc-btn-primary { padding: 10px 20px; border-radius: var(--r-md); border: none; background: var(--accent-blue); color: #fff; font-size: 14px; font-weight: 700; font-family: var(--font-sans); cursor: pointer; transition: all .15s; }
        .doc-btn-primary:hover:not(:disabled) { background: #5d9bff; }
        .doc-btn-primary:disabled { opacity: .5; cursor: not-allowed; }
        .doc-btn-secondary { padding: 10px 20px; border-radius: var(--r-md); border: 1px solid var(--border); background: transparent; color: var(--text-secondary); font-size: 14px; font-weight: 600; font-family: var(--font-sans); cursor: pointer; transition: all .15s; }
        .doc-btn-secondary:hover { border-color: var(--border-active); color: var(--text-primary); }

        /* ─── Scrollbar ─── */
        .doc-tree-scroll::-webkit-scrollbar,
        .doc-list-scroll::-webkit-scrollbar,
        .doc-detail::-webkit-scrollbar { width: 5px; }
        .doc-tree-scroll::-webkit-scrollbar-track,
        .doc-list-scroll::-webkit-scrollbar-track,
        .doc-detail::-webkit-scrollbar-track { background: transparent; }
        .doc-tree-scroll::-webkit-scrollbar-thumb,
        .doc-list-scroll::-webkit-scrollbar-thumb,
        .doc-detail::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
        .doc-tree-scroll::-webkit-scrollbar-thumb:hover,
        .doc-list-scroll::-webkit-scrollbar-thumb:hover,
        .doc-detail::-webkit-scrollbar-thumb:hover { background: var(--border-active); }
      `}</style>

      {/* Hidden file input for upload (multiple) */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.xlsx,.xls,.doc"
        multiple
        style={{ display: "none" }}
        onChange={e => {
          const files = e.target.files;
          if (files && files.length > 0) setUploadFiles(prev => [...prev, ...Array.from(files)]);
          e.target.value = "";
        }}
      />

      {/* ─── TOPBAR ─── */}
      <div className="doc-topbar">
        <div className="doc-topbar-title">
          <div className="doc-topbar-title-icon">{"\u{1F4C3}"}</div>
          Documente
        </div>
        <div className="doc-topbar-stats">
          <div className="doc-topbar-stat">
            <span className="doc-topbar-stat-num">{totalDocs}</span> documente
          </div>
          <div className="doc-topbar-stat">
            <span className="doc-topbar-stat-num" style={{ color: "var(--accent-green)" }}>{procesate}</span> procesate
          </div>
          <div className="doc-topbar-stat">
            <span className="doc-topbar-stat-num" style={{ color: "var(--accent-blue)" }}>{templates}</span> template-uri
          </div>
        </div>
      </div>

      {/* ─── MAIN LAYOUT ─── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <SplitPane
          side="left"
          defaultWidth={300}
          minLeft={300}
          minRight={220}
          maxRight={450}
          left={treePanel}
          right={
            <SplitPane
              side="right"
              defaultWidth={380}
              minLeft={320}
              minRight={280}
              maxRight={520}
              left={listPanel}
              right={detailPanel}
            />
          }
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
                {ctxType === "program" ? "\u{1F4CA}" : "\u{1F4C5}"} {childInfo.label}
              </button>
            )}
            {/* Show "upload here" for leaf folders */}
            {isLeaf && (
              <button className="doc-ctx-item" onClick={() => {
                setSelectedFolder(ctxMenu.nodeId);
                setShowUpload(true);
                setCtxMenu(null);
              }}>
                {"\u{1F4E4}"} Upload document aici
              </button>
            )}
            {childInfo && <div className="doc-ctx-sep" />}
            {isLeaf && <div className="doc-ctx-sep" />}
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
                  {"\u{1F5D1}"} Sterge
                </button>
              </>
            )}
          </div>
        );
      })()}

      {/* ─── UPLOAD MODAL ─── */}
      {showUpload && (
        <div className="doc-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowUpload(false); setUploadError(null); setUploadFiles([]); setUploadProgress(0); setUploadWarnings([]); } }}>
          <div className="doc-modal">
            <div className="doc-modal-title">
              Upload documente
              <button className="doc-modal-close" onClick={() => { setShowUpload(false); setUploadFiles([]); setUploadError(null); setUploadProgress(0); setUploadWarnings([]); }}>{"\u2715"}</button>
            </div>
            <div className="doc-modal-sub">
              Destinatie: <strong style={{ color: "var(--text-primary)" }}>{breadcrumb.length > 0 ? breadcrumb.join(" \u203A ") : "Selecteaza un folder"}</strong>
            </div>

            {/* Auto-detected type from folder — shown as info pill, not a selector */}
            {selectedNode && LEAF_TYPES.has(selectedNode.type) && selectedNode.type !== "ghiduri" && (
              <div className="doc-upload-type-info">
                <span className="doc-upload-type-info-icon">
                  {selectedNode.type === "templateuri" ? "\u{1F4DD}" : selectedNode.type === "clienti_prospecti" ? "\u{1F50D}" : "\u2705"}
                </span>
                <div>
                  <div className="doc-upload-type-info-label">
                    Tip document: <strong>{selectedNode.type === "templateuri" ? "Template" : selectedNode.type === "clienti_prospecti" ? "Document client prospect" : "Document client final"}</strong>
                  </div>
                  <div className="doc-upload-type-info-desc">
                    {selectedNode.type === "templateuri"
                      ? "Template-ul va fi procesat automat pentru detectarea campurilor."
                      : "Documentul va fi adaugat in dosarul clientului."}
                  </div>
                </div>
              </div>
            )}

            {/* Ghiduri sub-classification: Ghid solicitant vs Anexa cu date */}
            {selectedNode?.type === "ghiduri" && (
              <div className="doc-upload-ghid-subtype">
                <div className="doc-upload-ghid-subtype-label">Tip continut in folderul Ghiduri:</div>
                <div className="doc-upload-ghid-subtype-options">
                  <button
                    className={`doc-upload-ghid-option ${ghidSubType === "ghid" ? "active" : ""}`}
                    onClick={() => setGhidSubType("ghid")}
                  >
                    <span className="doc-upload-ghid-option-icon">{"\u{1F4D6}"}</span>
                    <div>
                      <div className="doc-upload-ghid-option-title">Ghid solicitant</div>
                      <div className="doc-upload-ghid-option-desc">Ghidul va fi procesat cu AI pentru extragerea regulilor de eligibilitate.</div>
                    </div>
                  </button>
                  <button
                    className={`doc-upload-ghid-option ${ghidSubType === "reference_data" ? "active" : ""}`}
                    onClick={() => setGhidSubType("reference_data")}
                  >
                    <span className="doc-upload-ghid-option-icon">{"\u{1F4CA}"}</span>
                    <div>
                      <div className="doc-upload-ghid-option-title">Anexa cu date (tabele referinta)</div>
                      <div className="doc-upload-ghid-option-desc">Anexele cu tabele de clasificare, liste UAT, corelatii putere/suprafata etc. vor fi extrase ca date structurate.</div>
                    </div>
                  </button>
                </div>
              </div>
            )}

            <div
              className={`doc-upload-zone ${dragOver ? "drag-active" : ""} ${uploadFiles.length > 0 ? "has-file" : ""}`}
              onClick={() => uploadFiles.length === 0 && fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
              onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }}
              onDrop={e => {
                e.preventDefault();
                e.stopPropagation();
                setDragOver(false);
                const droppedFiles = e.dataTransfer.files;
                if (droppedFiles && droppedFiles.length > 0) setUploadFiles(prev => [...prev, ...Array.from(droppedFiles)]);
              }}
            >
              {uploadFiles.length > 0 ? (
                <>
                  <button className="doc-upload-zone-remove" onClick={e => { e.stopPropagation(); setUploadFiles([]); setUploadError(null); }}>{"\u2715"}</button>
                  <div className="doc-upload-zone-icon">{"\u2705"}</div>
                  <div className="doc-upload-zone-title">
                    {uploadFiles.length === 1 ? uploadFiles[0].name : `${uploadFiles.length} fisiere selectate`}
                  </div>
                  <div className="doc-upload-zone-sub">
                    {formatFileSize(uploadFiles.reduce((sum, f) => sum + f.size, 0))} total {"\u00B7"} Gata de upload
                  </div>
                  {uploadFiles.length > 1 && (
                    <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)", textAlign: "left", maxHeight: 80, overflow: "auto" }}>
                      {uploadFiles.map((f, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "1px 0" }}>
                          <span>{f.name}</span>
                          <span>{formatFileSize(f.size)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    style={{ marginTop: 8, fontSize: 12, color: "var(--accent-blue)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)" }}
                    onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
                  >
                    + Adauga mai multe
                  </button>
                </>
              ) : (
                <>
                  <div className="doc-upload-zone-icon">{dragOver ? "\u{1F4E5}" : "\u{1F4E4}"}</div>
                  <div className="doc-upload-zone-title">
                    {dragOver ? "Elibereaza pentru upload" : "Trage fisierele aici sau click pentru a alege"}
                  </div>
                  <div className="doc-upload-zone-sub">PDF, DOCX, XLSX, DOC — max 50 MB per fisier. Se pot selecta mai multe.</div>
                </>
              )}
            </div>

            {/* Upload progress bar */}
            {uploading && (
              <div className="doc-upload-progress">
                <div
                  className={`doc-upload-progress-bar ${uploadProgress < 100 ? "active" : ""}`}
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}

            {uploadError && (
              <div className="doc-upload-error" style={{ whiteSpace: "pre-line" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                {uploadError}
              </div>
            )}

            {uploadWarnings.length > 0 && (
              <div style={{ padding: "10px 14px", marginBottom: 12, borderRadius: "var(--r-sm)", background: "rgba(251,191,36,.08)", border: "1px solid rgba(251,191,36,.2)", color: "var(--accent-yellow)", fontSize: 12, lineHeight: 1.5 }}>
                {uploadWarnings.map((w, i) => <div key={i}>{w}</div>)}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="doc-btn-secondary" onClick={() => { setShowUpload(false); setUploadFiles([]); setUploadError(null); setUploadProgress(0); setUploadWarnings([]); }}>Anuleaza</button>
              <button
                className="doc-btn-primary"
                disabled={uploadFiles.length === 0 || !selectedFolder || uploading}
                onClick={handleUpload}
              >
                {uploading ? `Se uploadeaza... ${Math.round(uploadProgress)}%` : uploadFiles.length > 1 ? `Upload ${uploadFiles.length} fisiere` : "Upload & Proceseaza"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
