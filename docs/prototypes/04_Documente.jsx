import { useState, useRef, useEffect, useCallback } from "react";

/* ═══ DOCUMENT TREE ═══ */
const DOC_TREE = [
  {
    id: "af", label: "Accesare finanțări", type: "program", children: [
      {
        id: "m1", label: "Măsura 1 — Investiții productive", type: "masura", children: [
          { id: "m1s1", label: "Sesiunea 1", type: "sesiune", children: [
            { id: "m1s1g", label: "Ghiduri", type: "ghiduri" },
            { id: "m1s1t", label: "Template-uri", type: "templateuri" },
            { id: "m1s1cp", label: "Clienți Prospecți", type: "clienti_prospecti" },
            { id: "m1s1cf", label: "Clienți Finali", type: "clienti_finali" },
          ]},
          { id: "m1s2", label: "Sesiunea 2", type: "sesiune", children: [
            { id: "m1s2g", label: "Ghiduri", type: "ghiduri" },
            { id: "m1s2t", label: "Template-uri", type: "templateuri" },
            { id: "m1s2cp", label: "Clienți Prospecți", type: "clienti_prospecti" },
            { id: "m1s2cf", label: "Clienți Finali", type: "clienti_finali" },
          ]},
        ]
      },
      {
        id: "m2", label: "Măsura 2 — Dezvoltare rurală", type: "masura", children: [
          { id: "m2s1", label: "Sesiunea 1", type: "sesiune", children: [
            { id: "m2s1g", label: "Ghiduri", type: "ghiduri" },
            { id: "m2s1t", label: "Template-uri", type: "templateuri" },
            { id: "m2s1cp", label: "Clienți Prospecți", type: "clienti_prospecti" },
            { id: "m2s1cf", label: "Clienți Finali", type: "clienti_finali" },
          ]},
        ]
      },
    ]
  },
  {
    id: "pnrr", label: "PNRR", type: "program", children: [
      {
        id: "c7", label: "Componenta 7 — Digitalizare", type: "masura", children: [
          { id: "c7s1", label: "Apel 1", type: "sesiune", children: [
            { id: "c7s1g", label: "Ghiduri", type: "ghiduri" },
            { id: "c7s1t", label: "Template-uri", type: "templateuri" },
            { id: "c7s1cp", label: "Clienți Prospecți", type: "clienti_prospecti" },
            { id: "c7s1cf", label: "Clienți Finali", type: "clienti_finali" },
          ]},
        ]
      },
    ]
  },
  {
    id: "afm", label: "AFM", type: "program", children: [
      {
        id: "foto", label: "Fotovoltaice persoane juridice", type: "masura", children: [
          { id: "fotos1", label: "Sesiunea 2025", type: "sesiune", children: [
            { id: "fotos1g", label: "Ghiduri", type: "ghiduri" },
            { id: "fotos1t", label: "Template-uri", type: "templateuri" },
            { id: "fotos1cp", label: "Clienți Prospecți", type: "clienti_prospecti" },
            { id: "fotos1cf", label: "Clienți Finali", type: "clienti_finali" },
          ]},
        ]
      },
    ]
  },
];

/* ═══ DOCUMENTS PER FOLDER ═══ */
const DOCUMENTS = {
  "m1s1g": [
    { id: "d1", name: "Ghid Solicitant sM 4.1 — v3.2", type: "PDF", size: "4.8 MB", pages: 62, uploaded: "2026-01-15", uploadedBy: "Ion Popescu", status: "procesat", reguliExtrase: 28, tags: ["AFIR", "sM 4.1", "investiții"] },
    { id: "d2", name: "Anexa 1 — Criterii de selecție", type: "PDF", size: "1.2 MB", pages: 18, uploaded: "2026-01-15", uploadedBy: "Ion Popescu", status: "procesat", reguliExtrase: 12, tags: ["AFIR", "criterii"] },
    { id: "d3", name: "Instrucțiuni completare cerere", type: "PDF", size: "820 KB", pages: 8, uploaded: "2026-02-01", uploadedBy: "Ion Popescu", status: "neprocesat", reguliExtrase: 0, tags: ["instrucțiuni"] },
  ],
  "m1s1t": [
    { id: "d4", name: "Cerere de Finanțare — model AFIR", type: "DOCX", size: "245 KB", pages: 5, uploaded: "2026-01-20", uploadedBy: "Ion Popescu", status: "template", campuri: 10, tags: ["cerere", "template"] },
    { id: "d5", name: "Plan de Afaceri — model", type: "DOCX", size: "380 KB", pages: 8, uploaded: "2026-01-20", uploadedBy: "Ion Popescu", status: "template", campuri: 14, tags: ["plan afaceri", "template"] },
    { id: "d6", name: "Buget Estimativ — model", type: "XLSX", size: "95 KB", pages: 3, uploaded: "2026-01-20", uploadedBy: "Ion Popescu", status: "template", campuri: 8, tags: ["buget", "template"] },
    { id: "d7", name: "Declarație pe propria răspundere", type: "DOCX", size: "120 KB", pages: 2, uploaded: "2026-01-20", uploadedBy: "Ion Popescu", status: "template", campuri: 4, tags: ["declarație", "template"] },
    { id: "d8", name: "Studiu de fezabilitate — model", type: "DOCX", size: "520 KB", pages: 12, uploaded: "2026-02-05", uploadedBy: "Maria Ionescu", status: "template", campuri: 22, tags: ["SF", "template"] },
  ],
  "m1s1d": [],
  "m1s1cp": [
    { id: "d9", name: "SC CONSTRUCT NORD SRL — Dosar prospect", type: "PDF", size: "2.1 MB", pages: 12, uploaded: "2026-02-10", uploadedBy: "Ion Popescu", status: "procesat", reguliExtrase: 0, tags: ["prospect", "CONSTRUCT NORD"] },
    { id: "d10", name: "GREEN ENERGY SRL — Evaluare inițială", type: "PDF", size: "890 KB", pages: 6, uploaded: "2026-02-15", uploadedBy: "Ion Popescu", status: "neprocesat", reguliExtrase: 0, tags: ["prospect", "GREEN ENERGY"] },
    { id: "d10b", name: "PÂINE & TRADIȚIE SRL — Dosar analiză", type: "PDF", size: "1.5 MB", pages: 8, uploaded: "2026-02-20", uploadedBy: "Maria Ionescu", status: "procesat", reguliExtrase: 0, tags: ["prospect", "PÂINE & TRADIȚIE"] },
  ],
  "m1s1cf": [
    { id: "d10c", name: "SC CONSTRUCT NORD SRL — Dosar complet depus", type: "PDF", size: "8.2 MB", pages: 45, uploaded: "2026-03-01", uploadedBy: "Ion Popescu", status: "procesat", reguliExtrase: 0, tags: ["final", "CONSTRUCT NORD", "depus"] },
  ],
  "m1s2g": [
    { id: "d11", name: "Ghid Solicitant sM 4.1 — Sesiunea 2 (draft)", type: "PDF", size: "5.1 MB", pages: 65, uploaded: "2026-03-01", uploadedBy: "Ion Popescu", status: "neprocesat", reguliExtrase: 0, tags: ["AFIR", "sM 4.1", "draft"] },
  ],
  "c7s1g": [
    { id: "d12", name: "Ghid PNRR C7 — Digitalizare IMM-uri", type: "PDF", size: "3.5 MB", pages: 48, uploaded: "2025-11-20", uploadedBy: "Maria Ionescu", status: "procesat", reguliExtrase: 18, tags: ["PNRR", "C7", "digitalizare"] },
  ],
  "c7s1t": [
    { id: "d13", name: "Cerere Finanțare — PNRR C7", type: "DOCX", size: "290 KB", pages: 6, uploaded: "2025-11-22", uploadedBy: "Maria Ionescu", status: "template", campuri: 12, tags: ["PNRR", "template"] },
  ],
};

const TYPE_ICONS = { PDF: "📕", DOCX: "📘", XLSX: "📗", DOC: "📘" };
const STATUS_MAP = {
  procesat: { label: "Procesat AI", color: "var(--accent-green)", bg: "rgba(52,211,153,0.12)", icon: "✓" },
  neprocesat: { label: "Neprocesat", color: "var(--accent-yellow)", bg: "rgba(251,191,36,0.12)", icon: "⏳" },
  template: { label: "Template", color: "var(--accent-blue)", bg: "rgba(77,139,255,0.12)", icon: "📝" },
  "referință": { label: "Referință", color: "var(--accent-purple)", bg: "rgba(167,139,250,0.12)", icon: "📌" },
};

/* ═══ SPLIT PANE ═══ */
function SplitPane({ left, right, defaultWidth = 320, minA = 200, minB = 200, maxB = 600, side = "right" }) {
  const [panelW, setPanelW] = useState(defaultWidth);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef(null);
  const onDown = useCallback((e) => { e.preventDefault(); setDragging(true); }, []);
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const nw = side === "right" ? rect.right - e.clientX : e.clientX - rect.left;
      const cl = Math.max(minB, Math.min(maxB, nw));
      if (rect.width - cl >= minA) setPanelW(cl);
    };
    const onUp = () => setDragging(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
  }, [dragging, minA, minB, maxB, side]);
  const handle = <div className={`sp-handle ${dragging ? "on" : ""}`} onMouseDown={onDown}><div className="sp-dots"><span/><span/><span/></div></div>;
  const sty = { userSelect: dragging ? "none" : "auto" };
  if (side === "left") return (
    <div ref={containerRef} className="sp" style={sty}>
      <div className="sp-b" style={{ width: panelW, minWidth: minB, maxWidth: maxB }}>{left}</div>
      {handle}
      <div className="sp-a" style={{ flex: 1, minWidth: minA }}>{right}</div>
    </div>
  );
  return (
    <div ref={containerRef} className="sp" style={sty}>
      <div className="sp-a" style={{ flex: 1, minWidth: minA }}>{left}</div>
      {handle}
      <div className="sp-b" style={{ width: panelW, minWidth: minB, maxWidth: maxB }}>{right}</div>
    </div>
  );
}

export default function DocumentePage() {
  const [tree, setTree] = useState(DOC_TREE);
  const [expandedNodes, setExpandedNodes] = useState({"af": true, "m1": true, "m1s1": true});
  const [selectedFolder, setSelectedFolder] = useState("m1s1g");
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [search, setSearch] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [ctxMenu, setCtxMenu] = useState(null); // { x, y, nodeId, parentId }
  const [renaming, setRenaming] = useState(null); // nodeId
  const [renameVal, setRenameVal] = useState("");

  // Close context menu on click outside
  useEffect(() => {
    const close = () => setCtxMenu(null);
    if (ctxMenu) { document.addEventListener("click", close); return () => document.removeEventListener("click", close); }
  }, [ctxMenu]);

  const toggleNode = (id) => setExpandedNodes(prev => ({...prev, [id]: !prev[id]}));

  // Tree CRUD helpers
  const updateNodeInTree = (nodes, targetId, updater) => nodes.map(n => {
    if (n.id === targetId) return updater(n);
    if (n.children) return { ...n, children: updateNodeInTree(n.children, targetId, updater) };
    return n;
  });

  const removeNodeFromTree = (nodes, targetId) => nodes.filter(n => n.id !== targetId).map(n =>
    n.children ? { ...n, children: removeNodeFromTree(n.children, targetId) } : n
  );

  const addChildToNode = (nodes, parentId, child) => nodes.map(n => {
    if (n.id === parentId) return { ...n, children: [...(n.children || []), child] };
    if (n.children) return { ...n, children: addChildToNode(n.children, parentId, child) };
    return n;
  });

  const handleNewFolder = (parentId) => {
    const newId = "f_" + Date.now();
    const child = { id: newId, label: "Folder nou", type: "folder", children: [] };
    setTree(prev => addChildToNode(prev, parentId, child));
    setExpandedNodes(prev => ({ ...prev, [parentId]: true }));
    setRenaming(newId);
    setRenameVal("Folder nou");
    setCtxMenu(null);
  };

  const handleRename = (nodeId) => {
    const findLabel = (nodes) => { for (const n of nodes) { if (n.id === nodeId) return n.label; if (n.children) { const r = findLabel(n.children); if (r) return r; } } return null; };
    setRenameVal(findLabel(tree) || "");
    setRenaming(nodeId);
    setCtxMenu(null);
  };

  const commitRename = () => {
    if (renaming && renameVal.trim()) {
      setTree(prev => updateNodeInTree(prev, renaming, n => ({ ...n, label: renameVal.trim() })));
    }
    setRenaming(null);
    setRenameVal("");
  };

  const handleDelete = (nodeId) => {
    if (selectedFolder === nodeId) setSelectedFolder(null);
    setTree(prev => removeNodeFromTree(prev, nodeId));
    setCtxMenu(null);
  };

  const handleContextMenu = (e, nodeId) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, nodeId });
  };

  const docs = (DOCUMENTS[selectedFolder] || []).filter(d => {
    if (!search) return true;
    const q = search.toLowerCase();
    return d.name.toLowerCase().includes(q) || d.type.toLowerCase().includes(q) || d.tags.some(t => t.toLowerCase().includes(q));
  });

  const selDoc = docs.find(d => d.id === selectedDoc);

  // Build breadcrumb from tree
  const getBreadcrumb = (tree, targetId, path = []) => {
    for (const node of tree) {
      const newPath = [...path, node.label];
      if (node.id === targetId) return newPath;
      if (node.children) {
        const r = getBreadcrumb(node.children, targetId, newPath);
        if (r) return r;
      }
    }
    return null;
  };
  const breadcrumb = getBreadcrumb(tree, selectedFolder) || [];

  const NODE_ICONS = {
    ghiduri: "📖",
    templateuri: "📝",
    clienti_prospecti: "🔍",
    clienti_finali: "✅",
  };

  const NODE_DOTS = {
    program:  { size: 12, color: "#003399" },
    masura:   { size: 8,  color: "#C9A84C" },
    sesiune:  { size: 6,  color: "#888888" },
  };

  const renderTree = (nodes, depth = 0) => nodes.map(node => {
    const hasKids = node.children && node.children.length > 0;
    const isExpanded = expandedNodes[node.id];
    const isSelected = node.id === selectedFolder;
    const docCount = DOCUMENTS[node.id]?.length;
    const isRenaming = renaming === node.id;
    const dot = NODE_DOTS[node.type];
    const icon = NODE_ICONS[node.type];
    const isLeafType = !!icon;

    return (
      <div key={node.id}>
        <div
          className={`tree-item ${isSelected ? "active" : ""} ${dot ? "tree-dot-row" : ""}`}
          style={{ paddingLeft: 12 + depth * 18 }}
          onClick={() => { if (hasKids) toggleNode(node.id); setSelectedFolder(node.id); setSelectedDoc(null); }}
          onContextMenu={(e) => handleContextMenu(e, node.id)}
        >
          {hasKids ? (
            <span className="tree-arrow">{isExpanded ? "▾" : "▸"}</span>
          ) : <span className="tree-arrow" style={{opacity:0}}>▸</span>}

          {dot ? (
            <span className="tree-dot" style={{ width: dot.size, height: dot.size, background: dot.color }} />
          ) : icon ? (
            <span className="tree-icon">{icon}</span>
          ) : (
            <span className="tree-icon">{isExpanded ? "📂" : "📁"}</span>
          )}

          {isRenaming ? (
            <input
              className="tree-rename-input"
              value={renameVal}
              onChange={e => setRenameVal(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setRenaming(null); setRenameVal(""); } }}
              onBlur={commitRename}
              onClick={e => e.stopPropagation()}
              autoFocus
            />
          ) : (
            <span className={`tree-label ${dot ? "tree-label-" + node.type : ""}`}>{node.label}</span>
          )}
          {docCount > 0 && !isRenaming && <span className="tree-count">{docCount}</span>}
        </div>
        {hasKids && isExpanded && renderTree(node.children, depth + 1)}
      </div>
    );
  });

  const allDocsFlat = Object.values(DOCUMENTS).flat();
  const totalDocs = allDocsFlat.length;
  const procesate = allDocsFlat.filter(d => d.status === "procesat").length;
  const templates = allDocsFlat.filter(d => d.status === "template").length;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&family=JetBrains+Mono:wght@400;500&display=swap');
        *{margin:0;padding:0;box-sizing:border-box}
        :root{--bg-deep:#0a0c10;--bg-surface:#12151c;--bg-elevated:#1a1e28;--bg-hover:#222838;--border:#2a3040;--border-active:#3d4760;--text-primary:#e8ecf4;--text-secondary:#8892a8;--text-muted:#5a6478;--accent-blue:#4d8bff;--accent-green:#34d399;--accent-red:#f87171;--accent-yellow:#fbbf24;--accent-purple:#a78bfa;--accent-orange:#fb923c;--font-sans:'DM Sans',system-ui,sans-serif;--font-mono:'JetBrains Mono',monospace;--r-sm:6px;--r-md:10px;--r-lg:14px}
        body{font-family:var(--font-sans);background:var(--bg-deep);color:var(--text-primary)}
        .page{display:flex;height:100vh;overflow:hidden}
        .sidebar{width:240px;min-width:240px;background:var(--bg-surface);border-right:1px solid var(--border);display:flex;flex-direction:column}
        .sb-logo{padding:20px 16px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--border)}
        .sb-logo-icon{width:36px;height:36px;border-radius:10px;background:var(--accent-blue);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:#fff;flex-shrink:0}
        .sb-logo-text{font-size:17px;font-weight:800;letter-spacing:-.3px}
        .sb-nav{flex:1;padding:12px 8px}
        .sb-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:var(--r-sm);cursor:pointer;font-size:14px;font-weight:500;color:var(--text-secondary);transition:all .15s;margin-bottom:2px}
        .sb-item:hover{background:var(--bg-hover);color:var(--text-primary)}.sb-item.active{background:rgba(77,139,255,.1);color:var(--accent-blue);font-weight:600}
        .sb-icon{width:20px;text-align:center;font-size:16px;flex-shrink:0}
        .sb-section{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);padding:16px 12px 6px}
        .sb-footer{padding:12px;border-top:1px solid var(--border);display:flex;align-items:center;gap:10px;margin-top:auto}
        .sb-avatar{width:32px;height:32px;border-radius:50%;background:var(--accent-purple);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0}
        .sb-user-name{font-size:13px;font-weight:600}.sb-user-role{font-size:11px;color:var(--text-muted)}
        .main{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}
        .topbar{padding:14px 28px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:16px;background:var(--bg-surface);flex-shrink:0}
        .tb-title{font-size:20px;font-weight:800;flex:1}.tb-count{font-size:14px;color:var(--text-muted)}

        /* ─── LAYOUT ─── */
        .doc-layout{flex:1;display:flex;overflow:hidden}

        /* Tree panel */
        .doc-tree{border-right:none;display:flex;flex-direction:column;overflow:hidden;background:var(--bg-surface);height:100%}
        .doc-tree-header{padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;flex-shrink:0}
        .doc-tree-header .dth-label{font-size:13px;font-weight:700;color:var(--text-secondary);flex:1}
        .doc-tree-stats{display:flex;gap:10px;font-size:11px;color:var(--text-muted);font-family:var(--font-mono)}
        .doc-tree-stats strong{color:var(--text-secondary)}
        .doc-tree-scroll{flex:1;overflow-y:auto;padding:8px 0}
        .tree-item{display:flex;align-items:center;gap:6px;padding:6px 10px;cursor:pointer;font-size:13px;color:var(--text-secondary);transition:all .12s;border-radius:0}
        .tree-item:hover{background:var(--bg-hover);color:var(--text-primary)}
        .tree-item.active{background:rgba(77,139,255,.08);color:var(--accent-blue);font-weight:600}
        .tree-arrow{width:14px;font-size:10px;color:var(--text-muted);flex-shrink:0;text-align:center}
        .tree-icon{font-size:14px;flex-shrink:0}
        .tree-dot{border-radius:50%;flex-shrink:0}
        .tree-label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .tree-label-program{font-weight:700;font-size:14px;color:var(--text-primary)}
        .tree-label-masura{font-weight:600;font-size:13px;color:#C9A84C}
        .tree-label-sesiune{font-weight:500;font-size:13px;color:var(--text-secondary)}
        .tree-count{font-size:10px;font-family:var(--font-mono);font-weight:700;color:var(--text-muted);background:var(--bg-elevated);padding:1px 6px;border-radius:8px}
        .tree-add-btn{margin:8px 16px;padding:8px;border-radius:var(--r-sm);border:1px dashed var(--border);background:transparent;color:var(--text-muted);font-size:12px;font-weight:600;cursor:pointer;font-family:var(--font-sans);text-align:center;transition:all .15s}
        .tree-add-btn:hover{border-color:var(--accent-blue);color:var(--accent-blue)}
        .tree-rename-input{flex:1;padding:2px 6px;border-radius:3px;border:1px solid var(--accent-blue);background:var(--bg-deep);color:var(--text-primary);font-size:13px;font-family:var(--font-sans);outline:none;min-width:0}
        .ctx-menu{position:fixed;z-index:200;background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--r-md);padding:4px;min-width:180px;box-shadow:0 8px 32px rgba(0,0,0,.5);animation:ctxIn .12s ease}
        @keyframes ctxIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}
        .ctx-item{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:var(--r-sm);cursor:pointer;font-size:13px;color:var(--text-secondary);transition:all .1s;border:none;background:none;width:100%;text-align:left;font-family:var(--font-sans)}
        .ctx-item:hover{background:var(--bg-hover);color:var(--text-primary)}
        .ctx-item.danger{color:var(--accent-red)}.ctx-item.danger:hover{background:rgba(248,113,113,.08)}
        .ctx-sep{height:1px;background:var(--border);margin:4px 8px}

        /* File list */
        .doc-list{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;height:100%}
        .doc-list-bar{padding:12px 24px;border-bottom:1px solid var(--border);background:var(--bg-surface);flex-shrink:0}
        .doc-breadcrumb{display:flex;align-items:center;gap:0;font-size:12px;margin-bottom:8px}
        .doc-breadcrumb .bc-seg{color:var(--text-muted)}.doc-breadcrumb .bc-seg:last-child{color:var(--accent-blue);font-weight:600}
        .doc-breadcrumb .bc-sep{color:var(--border-active);margin:0 6px;font-size:10px}
        .doc-toolbar{display:flex;align-items:center;gap:10px}
        .fi{padding:7px 14px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-deep);color:var(--text-primary);font-size:13px;font-family:var(--font-sans);outline:none;transition:border-color .2s}
        .fi:focus{border-color:var(--accent-blue)}.fi::placeholder{color:var(--text-muted)}
        .btn-upload{display:flex;align-items:center;gap:6px;padding:7px 16px;border-radius:var(--r-md);border:none;background:var(--accent-blue);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font-sans);margin-left:auto;box-shadow:0 2px 12px rgba(77,139,255,.25);transition:all .15s}
        .btn-upload:hover{background:#5d9bff}
        .doc-list-scroll{flex:1;overflow-y:auto;padding:12px 24px;display:flex;flex-direction:column;gap:8px}

        .doc-card{display:flex;align-items:center;gap:14px;padding:14px 18px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-surface);cursor:pointer;transition:all .18s}
        .doc-card:hover{border-color:var(--border-active);background:var(--bg-elevated)}
        .doc-card.active{border-color:var(--accent-blue);background:rgba(77,139,255,.04)}
        .dc-icon{font-size:28px;flex-shrink:0}
        .dc-info{flex:1;min-width:0}
        .dc-name{font-size:14px;font-weight:700;margin-bottom:3px;display:flex;align-items:center;gap:8px}
        .dc-meta{font-size:12px;color:var(--text-muted);display:flex;gap:10px;flex-wrap:wrap}
        .dc-meta span{display:flex;align-items:center;gap:3px}
        .dc-tags{display:flex;gap:4px;margin-top:5px;flex-wrap:wrap}
        .dc-tag{font-size:10px;padding:2px 7px;border-radius:10px;background:var(--bg-elevated);color:var(--text-muted);border:1px solid var(--border)}
        .dc-status{flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:4px}
        .dc-status-badge{font-size:10px;font-weight:700;padding:3px 10px;border-radius:10px;display:flex;align-items:center;gap:4px}
        .dc-stat{font-size:11px;font-family:var(--font-mono);color:var(--text-muted)}

        /* Detail panel */
        .doc-detail{border-left:none;background:var(--bg-surface);display:flex;flex-direction:column;overflow-y:auto;height:100%}
        .dd-header{padding:20px;border-bottom:1px solid var(--border);position:relative}
        .dd-close{position:absolute;top:14px;right:14px;background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:16px}.dd-close:hover{color:var(--text-primary)}
        .dd-icon{font-size:36px;margin-bottom:8px}
        .dd-name{font-size:16px;font-weight:800;margin-bottom:4px}
        .dd-type{font-size:12px;font-family:var(--font-mono);color:var(--text-secondary)}
        .dd-section{padding:16px 20px;border-bottom:1px solid var(--border)}
        .dd-stitle{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin-bottom:10px}
        .dd-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        .dd-cell{padding:8px 10px;background:var(--bg-deep);border-radius:var(--r-sm);border:1px solid var(--border)}
        .dd-cell.full{grid-column:1/-1}
        .dd-cell-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:2px}
        .dd-cell-value{font-size:13px;font-weight:600;color:var(--text-primary)}
        .dd-cell-value.mono{font-family:var(--font-mono)}
        .dd-tags{display:flex;gap:5px;flex-wrap:wrap}
        .dd-tag{font-size:11px;padding:3px 10px;border-radius:var(--r-sm);background:var(--bg-deep);border:1px solid var(--border);color:var(--text-secondary)}
        .dd-actions{display:flex;gap:8px;padding:16px 20px}
        .dd-btn{flex:1;padding:10px;border-radius:var(--r-sm);border:1px solid var(--border);background:transparent;color:var(--text-secondary);font-size:12px;font-weight:600;cursor:pointer;font-family:var(--font-sans);transition:all .15s;display:flex;align-items:center;justify-content:center;gap:5px}
        .dd-btn:hover{border-color:var(--border-active);color:var(--text-primary);background:var(--bg-hover)}
        .dd-btn.primary{border-color:var(--accent-blue);color:var(--accent-blue)}.dd-btn.primary:hover{background:rgba(77,139,255,.08)}
        .dd-btn.danger{color:var(--accent-red);border-color:rgba(248,113,113,.25)}.dd-btn.danger:hover{background:rgba(248,113,113,.06)}

        .empty-panel{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;color:var(--text-muted);padding:40px}
        .empty-panel .ep-icon{font-size:36px;opacity:.5}.empty-panel .ep-text{font-size:13px;text-align:center}

        /* Upload modal */
        .overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;animation:fadeIn .2s}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        .modal{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r-lg);width:500px;padding:28px;animation:slideUp .3s ease}
        @keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        .modal-title{font-size:20px;font-weight:800;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center}
        .modal-close{background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:18px}.modal-close:hover{color:var(--text-primary)}
        .modal-sub{font-size:14px;color:var(--text-secondary);margin-bottom:20px}
        .upload-zone{border:2px dashed var(--border);border-radius:var(--r-md);padding:32px 20px;text-align:center;margin-bottom:16px;cursor:pointer;transition:all .2s}
        .upload-zone:hover{border-color:var(--accent-blue);background:rgba(77,139,255,.03)}
        .upload-zone .uz-icon{font-size:28px;margin-bottom:6px}.upload-zone .uz-title{font-size:14px;font-weight:600;margin-bottom:3px}.upload-zone .uz-sub{font-size:12px;color:var(--text-muted)}
        .upload-type-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:16px}
        .upload-type{padding:12px;border-radius:var(--r-sm);border:1px solid var(--border);cursor:pointer;transition:all .15s;text-align:center}
        .upload-type:hover{border-color:var(--border-active)}.upload-type.on{border-color:var(--accent-blue);background:rgba(77,139,255,.06)}
        .upload-type .ut-icon{font-size:20px;margin-bottom:4px}.upload-type .ut-label{font-size:12px;font-weight:600;color:var(--text-secondary)}
        .btn-p{padding:10px 20px;border-radius:var(--r-md);border:none;background:var(--accent-blue);color:#fff;font-size:14px;font-weight:700;font-family:var(--font-sans);cursor:pointer}.btn-p:disabled{opacity:.5;cursor:not-allowed}
        .btn-s{padding:10px 20px;border-radius:var(--r-md);border:1px solid var(--border);background:transparent;color:var(--text-secondary);font-size:14px;font-weight:600;font-family:var(--font-sans);cursor:pointer}

        /* Split Pane */
        .sp{display:flex;height:100%;flex:1;min-height:0;overflow:hidden}
        .sp-a{overflow:hidden;display:flex;flex-direction:column;min-height:0;height:100%}
        .sp-b{overflow:hidden;display:flex;flex-direction:column;min-height:0;height:100%;flex-shrink:0}
        .sp-handle{width:8px;cursor:col-resize;display:flex;align-items:center;justify-content:center;position:relative;z-index:5;flex-shrink:0;transition:background .15s}
        .sp-handle::before{content:'';position:absolute;top:0;bottom:0;left:3px;width:1px;background:var(--border);transition:all .15s}
        .sp-handle:hover::before,.sp-handle.on::before{left:2px;width:3px;background:var(--accent-blue);border-radius:2px;box-shadow:0 0 8px rgba(77,139,255,.3)}
        .sp-dots{display:flex;flex-direction:column;gap:3px;opacity:0;transition:opacity .15s}
        .sp-handle:hover .sp-dots,.sp-handle.on .sp-dots{opacity:1}
        .sp-dots span{width:3px;height:3px;border-radius:50%;background:var(--accent-blue)}

        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
      `}</style>

      <div className="page">
        <div className="sidebar">
          <div className="sb-logo"><div className="sb-logo-icon">DF</div><div className="sb-logo-text">DosarFonduri</div></div>
          <div className="sb-nav">
            <div className="sb-section">Principal</div>
            <div className="sb-item"><span className="sb-icon">📊</span><span>Panou</span></div>
            <div className="sb-item"><span className="sb-icon">🏢</span><span>Firme</span></div>
            <div className="sb-item active"><span className="sb-icon">📃</span><span>Documente</span></div>
            <div className="sb-item"><span className="sb-icon">💼</span><span>Proiecte</span></div>
            <div className="sb-section">Configurare</div>
            <div className="sb-item"><span className="sb-icon">🛠</span><span>Configurări</span></div>
            <div className="sb-section">Sistem</div>
            <div className="sb-item"><span className="sb-icon">⚙️</span><span>Admin</span></div>
          </div>
          <div className="sb-footer"><div className="sb-avatar">IP</div><div><div className="sb-user-name">Ion Popescu</div><div className="sb-user-role">Administrator</div></div></div>
        </div>

        <div className="main">
          <div className="topbar">
            <div className="tb-title">Documente</div>
            <span className="tb-count">{totalDocs} documente · {procesate} procesate · {templates} template-uri</span>
          </div>

          <div className="doc-layout">
            <SplitPane
              side="left"
              defaultWidth={300}
              minA={300}
              minB={220}
              maxB={450}
              left={
                <div className="doc-tree">
                  <div className="doc-tree-header">
                    <span className="dth-label">Structură programe</span>
                  </div>
                  <div className="doc-tree-scroll">
                    {renderTree(tree)}
                  </div>
                </div>
              }
              right={
                <SplitPane
                  side="right"
                  defaultWidth={380}
                  minA={320}
                  minB={280}
                  maxB={520}
                  left={
                    <div className="doc-list">
                      <div className="doc-list-bar">
                        <div className="doc-breadcrumb">
                          {breadcrumb.map((seg, i) => (
                            <span key={i}>
                              <span className="bc-seg">{seg}</span>
                              {i < breadcrumb.length - 1 && <span className="bc-sep">›</span>}
                            </span>
                          ))}
                        </div>
                        <div className="doc-toolbar">
                          <input className="fi" placeholder="Caută document..." value={search} onChange={e => setSearch(e.target.value)} style={{width: 220}} />
                          <button className="btn-upload" onClick={() => setShowUpload(true)}>📤 Upload document</button>
                        </div>
                      </div>

                      <div className="doc-list-scroll">
                        {docs.length === 0 ? (
                          <div className="empty-panel">
                            <div className="ep-icon">📄</div>
                            <div className="ep-text">{search ? "Niciun document găsit" : "Niciun document în acest folder"}</div>
                          </div>
                        ) : docs.map(d => {
                          const st = STATUS_MAP[d.status];
                          return (
                            <div key={d.id} className={`doc-card ${selectedDoc === d.id ? "active" : ""}`} onClick={() => setSelectedDoc(d.id)}>
                              <div className="dc-icon">{TYPE_ICONS[d.type] || "📄"}</div>
                              <div className="dc-info">
                                <div className="dc-name">{d.name}</div>
                                <div className="dc-meta">
                                  <span>{d.type} · {d.size}</span>
                                  <span>{d.pages} pag.</span>
                                  <span>📅 {d.uploaded}</span>
                                  <span>👤 {d.uploadedBy}</span>
                                </div>
                                <div className="dc-tags">
                                  {d.tags.map((t, i) => <span key={i} className="dc-tag">{t}</span>)}
                                </div>
                              </div>
                              <div className="dc-status">
                                <span className="dc-status-badge" style={{background: st.bg, color: st.color}}>{st.icon} {st.label}</span>
                                {d.reguliExtrase > 0 && <span className="dc-stat">{d.reguliExtrase} reguli</span>}
                                {d.campuri > 0 && <span className="dc-stat">{d.campuri} câmpuri</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  }
                  right={
                    selDoc ? (
                      <div className="doc-detail" key={selDoc.id}>
                        <div className="dd-header">
                          <button className="dd-close" onClick={() => setSelectedDoc(null)}>✕</button>
                          <div className="dd-icon">{TYPE_ICONS[selDoc.type] || "📄"}</div>
                          <div className="dd-name">{selDoc.name}</div>
                          <div className="dd-type">{selDoc.type} · {selDoc.size} · {selDoc.pages} pagini</div>
                        </div>
                        <div className="dd-section">
                          <div className="dd-stitle">Status</div>
                          {(() => { const st = STATUS_MAP[selDoc.status]; return (
                            <span className="dc-status-badge" style={{background: st.bg, color: st.color, fontSize: 12, padding: "5px 14px"}}>{st.icon} {st.label}</span>
                          );})()}
                          {selDoc.status === "neprocesat" && (
                            <div style={{marginTop: 10}}>
                              <button className="dd-btn primary" style={{width: "auto", display: "inline-flex"}}>🤖 Procesează cu AI</button>
                            </div>
                          )}
                        </div>
                        <div className="dd-section">
                          <div className="dd-stitle">Detalii</div>
                          <div className="dd-grid">
                            <div className="dd-cell"><div className="dd-cell-label">Uploadat</div><div className="dd-cell-value mono">{selDoc.uploaded}</div></div>
                            <div className="dd-cell"><div className="dd-cell-label">De către</div><div className="dd-cell-value">{selDoc.uploadedBy}</div></div>
                            {selDoc.reguliExtrase > 0 && <div className="dd-cell"><div className="dd-cell-label">Reguli extrase</div><div className="dd-cell-value mono" style={{color: "var(--accent-green)"}}>{selDoc.reguliExtrase} reguli</div></div>}
                            {selDoc.campuri > 0 && <div className="dd-cell"><div className="dd-cell-label">Câmpuri template</div><div className="dd-cell-value mono" style={{color: "var(--accent-blue)"}}>{selDoc.campuri} câmpuri</div></div>}
                          </div>
                        </div>
                        <div className="dd-section">
                          <div className="dd-stitle">Tags</div>
                          <div className="dd-tags">
                            {selDoc.tags.map((t, i) => <span key={i} className="dd-tag">{t}</span>)}
                          </div>
                        </div>
                        <div className="dd-actions">
                          <button className="dd-btn primary">📥 Descarcă</button>
                          <button className="dd-btn">👁 Previzualizare</button>
                          <button className="dd-btn danger">🗑 Șterge</button>
                        </div>
                      </div>
                    ) : (
                      <div className="doc-detail" style={{alignItems:"center",justifyContent:"center"}}>
                        <div className="empty-panel"><div className="ep-icon">📄</div><div className="ep-text">Selectează un document<br/>pentru detalii</div></div>
                      </div>
                    )
                  }
                />
              }
            />
          </div>
        </div>

        {/* ═══ CONTEXT MENU ═══ */}
        {ctxMenu && (
          <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }} onClick={e => e.stopPropagation()}>
            <button className="ctx-item" onClick={() => handleNewFolder(ctxMenu.nodeId)}>📁 Folder nou</button>
            <button className="ctx-item" onClick={() => handleRename(ctxMenu.nodeId)}>✏️ Redenumește</button>
            <div className="ctx-sep" />
            <button className="ctx-item danger" onClick={() => { if (confirm("Sigur vrei să ștergi acest folder?")) handleDelete(ctxMenu.nodeId); }}>🗑 Șterge</button>
          </div>
        )}

        {/* ═══ UPLOAD MODAL ═══ */}
        {showUpload && (
          <div className="overlay" onClick={e => e.target === e.currentTarget && setShowUpload(false)}>
            <div className="modal">
              <div className="modal-title">Upload document <button className="modal-close" onClick={() => setShowUpload(false)}>✕</button></div>
              <div className="modal-sub">Destinație: <strong style={{color:"var(--text-primary)"}}>{breadcrumb.join(" › ")}</strong></div>

              <div className="upload-type-grid">
                <div className="upload-type on"><div className="ut-icon">📖</div><div className="ut-label">Ghid finanțare</div></div>
                <div className="upload-type"><div className="ut-icon">📝</div><div className="ut-label">Template</div></div>
                <div className="upload-type"><div className="ut-icon">📄</div><div className="ut-label">Document model</div></div>
                <div className="upload-type"><div className="ut-icon">📎</div><div className="ut-label">Alt document</div></div>
              </div>

              <div className="upload-zone">
                <div className="uz-icon">📤</div>
                <div className="uz-title">Trage fișierele aici sau click pentru a alege</div>
                <div className="uz-sub">PDF, DOCX, XLSX — max 50 MB per fișier</div>
              </div>

              <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
                <button className="btn-s" onClick={() => setShowUpload(false)}>Anulează</button>
                <button className="btn-p" disabled>Upload & Procesează</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
