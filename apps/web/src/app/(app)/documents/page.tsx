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
  processingType: "ghid" | "template" | "reference";
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
  if (processingType === "reference") return "referință";
  if (status === "processed") return "procesat";
  return "neprocesat"; // uploaded, processing, failed all show as neprocesat
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
  const [uploadType, setUploadType] = useState<string>("ghid");
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch folder tree on mount
  const fetchTree = useCallback(async () => {
    try {
      setTreeLoading(true);
      const data = await apiGet<ApiFolderNode[]>("/api/documents/folders");
      const mapped = data.map(mapApiFolderToTreeNode);
      setTree(mapped);
      // Auto-expand top-level nodes
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
      fetchDocs(selectedFolder);
    } else {
      setDocs([]);
    }
  }, [selectedFolder, fetchDocs]);

  // Close context menu on click outside
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [ctxMenu]);

  const toggleNode = useCallback((id: string) => {
    setExpandedNodes(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleNewFolder = useCallback(async (parentId: string) => {
    try {
      const result = await apiPost<ApiFolderNode>("/api/documents/folders", {
        name: "Folder nou",
        type: "folder",
        parentId,
      });
      const newNode = mapApiFolderToTreeNode(result);
      setTree(prev => addChildToNode(prev, parentId, newNode));
      setExpandedNodes(prev => ({ ...prev, [parentId]: true }));
      setRenaming(newNode.id);
      setRenameVal("Folder nou");
    } catch (err) {
      console.error("Failed to create folder:", err);
    }
    setCtxMenu(null);
  }, []);

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
      // Update local status to reflect processing
      setDocs(prev => prev.map(d => d.id === docId ? { ...d, status: "neprocesat" as const } : d));
      // Refetch docs after a moment to get updated status
      if (selectedFolder) {
        setTimeout(() => fetchDocs(selectedFolder), 1000);
      }
    } catch (err) {
      console.error("Failed to trigger AI processing:", err);
    }
  }, [selectedFolder, fetchDocs]);

  const handleUpload = useCallback(async () => {
    if (!uploadFile || !selectedFolder) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("tags", JSON.stringify([]));

      const storedToken = typeof window !== "undefined" ? localStorage.getItem("df-token") : null;
      const headers: Record<string, string> = {};
      if (storedToken) {
        headers["Authorization"] = `Bearer ${storedToken}`;
      }

      const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
      const res = await fetch(`${API_URL}/api/documents/folders/${selectedFolder}/documents`, {
        method: "POST",
        headers,
        credentials: "include",
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      setShowUpload(false);
      setUploadFile(null);
      fetchDocs(selectedFolder);
    } catch (err) {
      console.error("Failed to upload document:", err);
    } finally {
      setUploading(false);
    }
  }, [uploadFile, selectedFolder, fetchDocs]);

  // Filtered documents
  const filteredDocs = docs.filter(d => {
    if (!search) return true;
    const q = search.toLowerCase();
    return d.name.toLowerCase().includes(q) || d.type.toLowerCase().includes(q) || d.tags.some(t => t.toLowerCase().includes(q));
  });

  const selDoc = filteredDocs.find(d => d.id === selectedDoc) || null;

  const breadcrumb = selectedFolder ? getBreadcrumb(tree, selectedFolder) || [] : [];

  // Stats from currently loaded docs
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
        >
          {hasKids ? (
            <span className="doc-tree-arrow">{isExpanded ? "\u25BE" : "\u25B8"}</span>
          ) : (
            <span className="doc-tree-arrow" style={{ opacity: 0 }}>{"\u25B8"}</span>
          )}

          {dot ? (
            <span
              className="doc-tree-dot"
              style={{ width: dot.size, height: dot.size, background: dot.color }}
            />
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
        {hasKids && isExpanded && renderTree(node.children!, depth + 1)}
      </div>
    );
  });

  /* ─── Left panel: tree ─── */
  const treePanel = (
    <div className="doc-tree-panel">
      <div className="doc-tree-header">
        <span className="doc-tree-header-label">Structura programe</span>
      </div>
      <div className="doc-tree-scroll">
        {treeLoading ? (
          <div className="doc-empty">
            <div className="doc-empty-text">Se incarca...</div>
          </div>
        ) : tree.length === 0 ? (
          <div className="doc-empty">
            <div className="doc-empty-icon">{"\u{1F4C1}"}</div>
            <div className="doc-empty-text">Niciun folder</div>
          </div>
        ) : (
          renderTree(tree)
        )}
      </div>
    </div>
  );

  /* ─── Middle panel: document list ─── */
  const listPanel = (
    <div className="doc-list-panel">
      <div className="doc-list-bar">
        <div className="doc-breadcrumb">
          {breadcrumb.map((seg, i) => (
            <span key={i}>
              <span className={`doc-bc-seg ${i === breadcrumb.length - 1 ? "doc-bc-active" : ""}`}>{seg}</span>
              {i < breadcrumb.length - 1 && <span className="doc-bc-sep">{"\u203A"}</span>}
            </span>
          ))}
        </div>
        <div className="doc-toolbar">
          <input
            className="doc-search-input"
            placeholder="Cauta document..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button className="doc-upload-btn" onClick={() => setShowUpload(true)}>
            {"\u{1F4E4}"} Upload document
          </button>
        </div>
      </div>
      <div className="doc-list-scroll">
        {docsLoading ? (
          <div className="doc-empty">
            <div className="doc-empty-text">Se incarca documentele...</div>
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="doc-empty">
            <div className="doc-empty-icon">{"\u{1F4C4}"}</div>
            <div className="doc-empty-text">{search ? "Niciun document gasit" : "Niciun document in acest folder"}</div>
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
                <div className="doc-card-tags">
                  {d.tags.map((t, i) => <span key={i} className="doc-card-tag">{t}</span>)}
                </div>
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
        <button className="doc-detail-close" onClick={() => setSelectedDoc(null)}>{"\u2715"}</button>
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

      <div className="doc-detail-section">
        <div className="doc-detail-stitle">Tags</div>
        <div className="doc-detail-tags">
          {selDoc.tags.map((t, i) => <span key={i} className="doc-detail-tag">{t}</span>)}
        </div>
      </div>

      <div className="doc-detail-actions">
        <button className="doc-detail-btn primary" onClick={() => handleDocDownload(selDoc.id)}>{"\u{1F4E5}"} Descarca</button>
        <button className="doc-detail-btn">{"\u{1F441}"} Previzualizare</button>
        <button className="doc-detail-btn danger" onClick={() => handleDocDelete(selDoc.id)}>{"\u{1F5D1}"} Sterge</button>
      </div>
    </div>
  ) : (
    <div className="doc-detail" style={{ alignItems: "center", justifyContent: "center" }}>
      <div className="doc-empty">
        <div className="doc-empty-icon">{"\u{1F4C4}"}</div>
        <div className="doc-empty-text">Selecteaza un document<br />pentru detalii</div>
      </div>
    </div>
  );

  const uploadTypes = [
    { key: "ghid", icon: "\u{1F4D6}", label: "Ghid finantare" },
    { key: "template", icon: "\u{1F4DD}", label: "Template" },
    { key: "model", icon: "\u{1F4C4}", label: "Document model" },
    { key: "alt", icon: "\u{1F4CE}", label: "Alt document" },
  ];

  return (
    <>
      <style>{`
        /* ─── Topbar ─── */
        .doc-topbar { padding: 14px 28px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 16px; background: var(--bg-surface); flex-shrink: 0; }
        .doc-topbar-title { font-size: 20px; font-weight: 800; flex: 1; letter-spacing: -.3px; }
        .doc-topbar-count { font-size: 14px; color: var(--text-muted); }

        /* ─── Tree panel ─── */
        .doc-tree-panel { display: flex; flex-direction: column; overflow: hidden; background: var(--bg-surface); height: 100%; }
        .doc-tree-header { padding: 14px 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .doc-tree-header-label { font-size: 13px; font-weight: 700; color: var(--text-secondary); flex: 1; }
        .doc-tree-scroll { flex: 1; overflow-y: auto; padding: 8px 0; }

        .doc-tree-item { display: flex; align-items: center; gap: 6px; padding: 6px 10px; cursor: pointer; font-size: 13px; color: var(--text-secondary); transition: all .12s; }
        .doc-tree-item:hover { background: var(--bg-hover); color: var(--text-primary); }
        .doc-tree-item.active { background: rgba(77,139,255,.08); color: var(--accent-blue); font-weight: 600; }
        .doc-tree-arrow { width: 14px; font-size: 10px; color: var(--text-muted); flex-shrink: 0; text-align: center; }
        .doc-tree-icon { font-size: 14px; flex-shrink: 0; }
        .doc-tree-dot { border-radius: 50%; flex-shrink: 0; }
        .doc-tree-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .doc-tree-label-program { font-weight: 700; font-size: 14px; color: var(--text-primary); }
        .doc-tree-label-masura { font-weight: 600; font-size: 13px; color: #C9A84C; }
        .doc-tree-label-sesiune { font-weight: 500; font-size: 13px; color: var(--text-secondary); }
        .doc-tree-count { font-size: 10px; font-family: var(--font-mono); font-weight: 700; color: var(--text-muted); background: var(--bg-elevated); padding: 1px 6px; border-radius: 8px; }
        .doc-tree-rename { flex: 1; padding: 2px 6px; border-radius: 3px; border: 1px solid var(--accent-blue); background: var(--bg-deep); color: var(--text-primary); font-size: 13px; font-family: var(--font-sans); outline: none; min-width: 0; }

        /* ─── Context menu ─── */
        .doc-ctx-menu { position: fixed; z-index: 200; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: var(--r-md); padding: 4px; min-width: 180px; box-shadow: 0 8px 32px rgba(0,0,0,.5); animation: docCtxIn .12s ease; }
        @keyframes docCtxIn { from { opacity: 0; transform: scale(.95); } to { opacity: 1; transform: scale(1); } }
        .doc-ctx-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: var(--r-sm); cursor: pointer; font-size: 13px; color: var(--text-secondary); transition: all .1s; border: none; background: none; width: 100%; text-align: left; font-family: var(--font-sans); }
        .doc-ctx-item:hover { background: var(--bg-hover); color: var(--text-primary); }
        .doc-ctx-item.danger { color: var(--accent-red); }
        .doc-ctx-item.danger:hover { background: rgba(248,113,113,.08); }
        .doc-ctx-sep { height: 1px; background: var(--border); margin: 4px 8px; }

        /* ─── Document list panel ─── */
        .doc-list-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; height: 100%; }
        .doc-list-bar { padding: 12px 24px; border-bottom: 1px solid var(--border); background: var(--bg-surface); flex-shrink: 0; }
        .doc-breadcrumb { display: flex; align-items: center; gap: 0; font-size: 12px; margin-bottom: 8px; }
        .doc-bc-seg { color: var(--text-muted); }
        .doc-bc-active { color: var(--accent-blue); font-weight: 600; }
        .doc-bc-sep { color: var(--border-active); margin: 0 6px; font-size: 10px; }
        .doc-toolbar { display: flex; align-items: center; gap: 10px; }
        .doc-search-input { padding: 7px 14px; border-radius: var(--r-md); border: 1px solid var(--border); background: var(--bg-deep); color: var(--text-primary); font-size: 13px; font-family: var(--font-sans); outline: none; transition: border-color .2s; width: 220px; }
        .doc-search-input:focus { border-color: var(--accent-blue); }
        .doc-search-input::placeholder { color: var(--text-muted); }
        .doc-upload-btn { display: flex; align-items: center; gap: 6px; padding: 7px 16px; border-radius: var(--r-md); border: none; background: var(--accent-blue); color: #fff; font-size: 13px; font-weight: 700; cursor: pointer; font-family: var(--font-sans); margin-left: auto; box-shadow: 0 2px 12px rgba(77,139,255,.25); transition: all .15s; }
        .doc-upload-btn:hover { background: #5d9bff; }
        .doc-list-scroll { flex: 1; overflow-y: auto; padding: 12px 24px; display: flex; flex-direction: column; gap: 8px; }

        /* ─── Document card ─── */
        .doc-card { display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-radius: var(--r-md); border: 1px solid var(--border); background: var(--bg-surface); cursor: pointer; transition: all .18s; }
        .doc-card:hover { border-color: var(--border-active); background: var(--bg-elevated); }
        .doc-card.active { border-color: var(--accent-blue); background: rgba(77,139,255,.04); }
        .doc-card-icon { font-size: 28px; flex-shrink: 0; }
        .doc-card-info { flex: 1; min-width: 0; }
        .doc-card-name { font-size: 14px; font-weight: 700; margin-bottom: 3px; display: flex; align-items: center; gap: 8px; }
        .doc-card-meta { font-size: 12px; color: var(--text-muted); display: flex; gap: 10px; flex-wrap: wrap; }
        .doc-card-meta span { display: flex; align-items: center; gap: 3px; }
        .doc-card-tags { display: flex; gap: 4px; margin-top: 5px; flex-wrap: wrap; }
        .doc-card-tag { font-size: 10px; padding: 2px 7px; border-radius: 10px; background: var(--bg-elevated); color: var(--text-muted); border: 1px solid var(--border); }
        .doc-card-status { flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
        .doc-status-badge { font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 10px; display: flex; align-items: center; gap: 4px; }
        .doc-stat-num { font-size: 11px; font-family: var(--font-mono); color: var(--text-muted); }

        /* ─── Detail panel ─── */
        .doc-detail { background: var(--bg-surface); display: flex; flex-direction: column; overflow-y: auto; height: 100%; }
        .doc-detail-header { padding: 20px; border-bottom: 1px solid var(--border); position: relative; }
        .doc-detail-close { position: absolute; top: 14px; right: 14px; background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 16px; }
        .doc-detail-close:hover { color: var(--text-primary); }
        .doc-detail-icon { font-size: 36px; margin-bottom: 8px; }
        .doc-detail-name { font-size: 16px; font-weight: 800; margin-bottom: 4px; }
        .doc-detail-type { font-size: 12px; font-family: var(--font-mono); color: var(--text-secondary); }
        .doc-detail-section { padding: 16px 20px; border-bottom: 1px solid var(--border); }
        .doc-detail-stitle { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .8px; color: var(--text-muted); margin-bottom: 10px; }
        .doc-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .doc-detail-cell { padding: 8px 10px; background: var(--bg-deep); border-radius: var(--r-sm); border: 1px solid var(--border); }
        .doc-detail-cell-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: var(--text-muted); margin-bottom: 2px; }
        .doc-detail-cell-value { font-size: 13px; font-weight: 600; color: var(--text-primary); }
        .doc-detail-cell-value.mono { font-family: var(--font-mono); }
        .doc-detail-tags { display: flex; gap: 5px; flex-wrap: wrap; }
        .doc-detail-tag { font-size: 11px; padding: 3px 10px; border-radius: var(--r-sm); background: var(--bg-deep); border: 1px solid var(--border); color: var(--text-secondary); }
        .doc-detail-actions { display: flex; gap: 8px; padding: 16px 20px; }
        .doc-detail-btn { flex: 1; padding: 10px; border-radius: var(--r-sm); border: 1px solid var(--border); background: transparent; color: var(--text-secondary); font-size: 12px; font-weight: 600; cursor: pointer; font-family: var(--font-sans); transition: all .15s; display: flex; align-items: center; justify-content: center; gap: 5px; }
        .doc-detail-btn:hover { border-color: var(--border-active); color: var(--text-primary); background: var(--bg-hover); }
        .doc-detail-btn.primary { border-color: var(--accent-blue); color: var(--accent-blue); }
        .doc-detail-btn.primary:hover { background: rgba(77,139,255,.08); }
        .doc-detail-btn.danger { color: var(--accent-red); border-color: rgba(248,113,113,.25); }
        .doc-detail-btn.danger:hover { background: rgba(248,113,113,.06); }

        /* ─── Empty state ─── */
        .doc-empty { display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 8px; color: var(--text-muted); padding: 40px; }
        .doc-empty-icon { font-size: 36px; opacity: .5; }
        .doc-empty-text { font-size: 13px; text-align: center; }

        /* ─── Upload modal ─── */
        .doc-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 100; animation: docFadeIn .2s; }
        @keyframes docFadeIn { from { opacity: 0; } to { opacity: 1; } }
        .doc-modal { background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--r-lg); width: 500px; max-width: calc(100vw - 40px); padding: 28px; animation: docSlideUp .3s ease; }
        @keyframes docSlideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .doc-modal-title { font-size: 20px; font-weight: 800; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center; }
        .doc-modal-close { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 18px; }
        .doc-modal-close:hover { color: var(--text-primary); }
        .doc-modal-sub { font-size: 14px; color: var(--text-secondary); margin-bottom: 20px; }
        .doc-upload-zone { border: 2px dashed var(--border); border-radius: var(--r-md); padding: 32px 20px; text-align: center; margin-bottom: 16px; cursor: pointer; transition: all .2s; }
        .doc-upload-zone:hover { border-color: var(--accent-blue); background: rgba(77,139,255,.03); }
        .doc-upload-zone-icon { font-size: 28px; margin-bottom: 6px; }
        .doc-upload-zone-title { font-size: 14px; font-weight: 600; margin-bottom: 3px; }
        .doc-upload-zone-sub { font-size: 12px; color: var(--text-muted); }
        .doc-upload-type-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 16px; }
        .doc-upload-type { padding: 12px; border-radius: var(--r-sm); border: 1px solid var(--border); cursor: pointer; transition: all .15s; text-align: center; background: transparent; font-family: var(--font-sans); }
        .doc-upload-type:hover { border-color: var(--border-active); }
        .doc-upload-type.on { border-color: var(--accent-blue); background: rgba(77,139,255,.06); }
        .doc-upload-type-icon { font-size: 20px; margin-bottom: 4px; }
        .doc-upload-type-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
        .doc-btn-primary { padding: 10px 20px; border-radius: var(--r-md); border: none; background: var(--accent-blue); color: #fff; font-size: 14px; font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .doc-btn-primary:disabled { opacity: .5; cursor: not-allowed; }
        .doc-btn-secondary { padding: 10px 20px; border-radius: var(--r-md); border: 1px solid var(--border); background: transparent; color: var(--text-secondary); font-size: 14px; font-weight: 600; font-family: var(--font-sans); cursor: pointer; }

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
      `}</style>

      {/* Hidden file input for upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.xlsx,.doc"
        style={{ display: "none" }}
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) setUploadFile(file);
          e.target.value = "";
        }}
      />

      {/* ─── TOPBAR ─── */}
      <div className="doc-topbar">
        <div className="doc-topbar-title">Documente</div>
        <span className="doc-topbar-count">
          {totalDocs} documente {"\u00B7"} {procesate} procesate {"\u00B7"} {templates} template-uri
        </span>
      </div>

      {/* ─── MAIN LAYOUT: nested split panes ─── */}
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
      {ctxMenu && (
        <div
          className="doc-ctx-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <button className="doc-ctx-item" onClick={() => handleNewFolder(ctxMenu.nodeId)}>
            {"\u{1F4C1}"} Folder nou
          </button>
          <button className="doc-ctx-item" onClick={() => handleRename(ctxMenu.nodeId)}>
            {"\u270F\uFE0F"} Redenumeste
          </button>
          <div className="doc-ctx-sep" />
          <button
            className="doc-ctx-item danger"
            onClick={() => {
              if (confirm("Sigur vrei sa stergi acest folder?")) handleDelete(ctxMenu.nodeId);
            }}
          >
            {"\u{1F5D1}"} Sterge
          </button>
        </div>
      )}

      {/* ─── UPLOAD MODAL ─── */}
      {showUpload && (
        <div className="doc-overlay" onClick={e => { if (e.target === e.currentTarget) setShowUpload(false); }}>
          <div className="doc-modal">
            <div className="doc-modal-title">
              Upload document
              <button className="doc-modal-close" onClick={() => { setShowUpload(false); setUploadFile(null); }}>{"\u2715"}</button>
            </div>
            <div className="doc-modal-sub">
              Destinatie: <strong style={{ color: "var(--text-primary)" }}>{breadcrumb.join(" \u203A ")}</strong>
            </div>

            <div className="doc-upload-type-grid">
              {uploadTypes.map(ut => (
                <button
                  key={ut.key}
                  className={`doc-upload-type ${uploadType === ut.key ? "on" : ""}`}
                  onClick={() => setUploadType(ut.key)}
                >
                  <div className="doc-upload-type-icon">{ut.icon}</div>
                  <div className="doc-upload-type-label">{ut.label}</div>
                </button>
              ))}
            </div>

            <div
              className="doc-upload-zone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={e => {
                e.preventDefault();
                e.stopPropagation();
                const file = e.dataTransfer.files?.[0];
                if (file) setUploadFile(file);
              }}
            >
              {uploadFile ? (
                <>
                  <div className="doc-upload-zone-icon">{"\u{1F4C4}"}</div>
                  <div className="doc-upload-zone-title">{uploadFile.name}</div>
                  <div className="doc-upload-zone-sub">{formatFileSize(uploadFile.size)}</div>
                </>
              ) : (
                <>
                  <div className="doc-upload-zone-icon">{"\u{1F4E4}"}</div>
                  <div className="doc-upload-zone-title">Trage fisierele aici sau click pentru a alege</div>
                  <div className="doc-upload-zone-sub">PDF, DOCX, XLSX — max 50 MB per fisier</div>
                </>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="doc-btn-secondary" onClick={() => { setShowUpload(false); setUploadFile(null); }}>Anuleaza</button>
              <button
                className="doc-btn-primary"
                disabled={!uploadFile || !selectedFolder || uploading}
                onClick={handleUpload}
              >
                {uploading ? "Se uploadeaza..." : "Upload & Proceseaza"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
