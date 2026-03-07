import { useState } from "react";

/* ═══ MOCK DATA ═══ */
const PROJECTS = [
  { id: 1, name: "Modernizare fabrică CNC", firma: "SC CONSTRUCT NORD SRL", firmaId: 1, program: "Accesare finanțări", masura: "Măsura 1", sesiune: "Sesiunea 1", status: "in_progress", created: "2026-01-15", updated: "Acum 12 min", eligibility: { passed: 12, total: 13 }, elements: { filled: 14, total: 18 }, docs: { done: 5, total: 17 }, templates: { done: 1, total: 3 }, valoare: "200.000 EUR", consultant: "Ion Popescu" },
  { id: 2, name: "Extindere capacitate depozitare", firma: "AGRO INVEST SRL", firmaId: 2, program: "Accesare finanțări", masura: "Măsura 1", sesiune: "Sesiunea 1", status: "in_progress", created: "2026-01-20", updated: "Acum 2 ore", eligibility: { passed: 10, total: 10 }, elements: { filled: 8, total: 22 }, docs: { done: 3, total: 15 }, templates: { done: 0, total: 3 }, valoare: "150.000 EUR", consultant: "Ion Popescu" },
  { id: 3, name: "Digitalizare procese interne", firma: "TECH SOLUTIONS SA", firmaId: 3, program: "PNRR", masura: "Componenta 7", sesiune: "Apel 1", status: "review", created: "2025-11-10", updated: "Ieri, 16:30", eligibility: { passed: 9, total: 11 }, elements: { filled: 20, total: 20 }, docs: { done: 14, total: 14 }, templates: { done: 3, total: 3 }, valoare: "450.000 EUR", consultant: "Maria Ionescu" },
  { id: 4, name: "Panouri fotovoltaice 150kW", firma: "GREEN ENERGY SRL", firmaId: 4, program: "AFM", masura: "Fotovoltaice PJ", sesiune: "Sesiunea 2025", status: "draft", created: "2026-02-28", updated: "Ieri, 09:15", eligibility: { passed: 0, total: 8 }, elements: { filled: 3, total: 16 }, docs: { done: 0, total: 12 }, templates: { done: 0, total: 2 }, valoare: "95.000 EUR", consultant: "Ion Popescu" },
  { id: 5, name: "Echipamente brutărie artizanală", firma: "PÂINE & TRADIȚIE SRL", firmaId: 5, program: "Accesare finanțări", masura: "Măsura 1", sesiune: "Sesiunea 2", status: "submitted", created: "2025-09-01", updated: "3 mar 2026", eligibility: { passed: 11, total: 11 }, elements: { filled: 18, total: 18 }, docs: { done: 16, total: 16 }, templates: { done: 3, total: 3 }, valoare: "180.000 EUR", consultant: "Ion Popescu" },
  { id: 6, name: "Linie procesare legume", firma: "AGRO INVEST SRL", firmaId: 2, program: "Accesare finanțări", masura: "Măsura 2", sesiune: "Sesiunea 1", status: "draft", created: "2026-03-01", updated: "Azi, 08:00", eligibility: { passed: 0, total: 0 }, elements: { filled: 0, total: 0 }, docs: { done: 0, total: 0 }, templates: { done: 0, total: 0 }, valoare: "—", consultant: "Ion Popescu" },
];

const FIRME_LIST = [
  { id: 1, name: "SC CONSTRUCT NORD SRL" },
  { id: 2, name: "AGRO INVEST SRL" },
  { id: 3, name: "TECH SOLUTIONS SA" },
  { id: 4, name: "GREEN ENERGY SRL" },
  { id: 5, name: "PÂINE & TRADIȚIE SRL" },
];

const PROGRAMS_TREE = [
  { program: "Accesare finanțări", masuri: [
    { name: "Măsura 1 — Investiții productive", sesiuni: ["Sesiunea 1", "Sesiunea 2"] },
    { name: "Măsura 2 — Dezvoltare rurală", sesiuni: ["Sesiunea 1"] },
  ]},
  { program: "PNRR", masuri: [
    { name: "Componenta 7 — Digitalizare", sesiuni: ["Apel 1"] },
  ]},
  { program: "AFM", masuri: [
    { name: "Fotovoltaice persoane juridice", sesiuni: ["Sesiunea 2025"] },
  ]},
];

const STATUS_MAP = {
  draft: { label: "Ciornă", color: "#5a6478", bg: "rgba(90,100,120,0.12)" },
  in_progress: { label: "În lucru", color: "#4d8bff", bg: "rgba(77,139,255,0.12)" },
  review: { label: "Verificare", color: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
  submitted: { label: "Depus", color: "#34d399", bg: "rgba(52,211,153,0.12)" },
  rejected: { label: "Respins", color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  approved: { label: "Aprobat", color: "#34d399", bg: "rgba(52,211,153,0.2)" },
};

const pct = (a, b) => b > 0 ? Math.round((a / b) * 100) : 0;

export default function ProiectePage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [programFilter, setProgramFilter] = useState("all");
  const [viewMode, setViewMode] = useState("cards"); // cards | table
  const [showCreate, setShowCreate] = useState(false);
  const [createStep, setCreateStep] = useState(1);
  const [createData, setCreateData] = useState({ name: "", firmaId: null, program: null, masura: null, sesiune: null });

  const filtered = PROJECTS.filter(p => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (programFilter !== "all" && p.program !== programFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.firma.toLowerCase().includes(q) || p.program.toLowerCase().includes(q);
    }
    return true;
  });

  const stats = {
    total: PROJECTS.length,
    draft: PROJECTS.filter(p => p.status === "draft").length,
    inProgress: PROJECTS.filter(p => p.status === "in_progress").length,
    review: PROJECTS.filter(p => p.status === "review").length,
    submitted: PROJECTS.filter(p => p.status === "submitted").length,
  };

  const overallProgress = (p) => {
    const e = pct(p.elements.filled, p.elements.total);
    const d = pct(p.docs.done, p.docs.total);
    const t = pct(p.templates.done, p.templates.total);
    return p.elements.total > 0 ? Math.round((e + d + t) / 3) : 0;
  };

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
        .tb-title{font-size:20px;font-weight:800;flex:1}
        .btn-create{display:flex;align-items:center;gap:6px;padding:8px 18px;border-radius:var(--r-md);border:none;background:var(--accent-blue);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font-sans);box-shadow:0 2px 12px rgba(77,139,255,.25);transition:all .15s}
        .btn-create:hover{background:#5d9bff}

        /* Stats row */
        .stats-row{display:flex;gap:12px;padding:16px 28px;border-bottom:1px solid var(--border);background:var(--bg-surface);flex-shrink:0}
        .stat-pill{display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;border:1px solid transparent}
        .stat-pill:hover{background:var(--bg-hover)}
        .stat-pill.active{border-color:var(--accent-blue);background:rgba(77,139,255,.06)}
        .stat-pill .sp-dot{width:8px;height:8px;border-radius:50%}
        .stat-pill .sp-count{font-family:var(--font-mono);font-weight:700}

        /* Toolbar */
        .toolbar{padding:12px 28px;display:flex;align-items:center;gap:10px;flex-shrink:0}
        .fi{padding:8px 14px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-deep);color:var(--text-primary);font-size:13px;font-family:var(--font-sans);outline:none;transition:border-color .2s}
        .fi:focus{border-color:var(--accent-blue)}.fi::placeholder{color:var(--text-muted)}
        .pill-group{display:flex;background:var(--bg-deep);border-radius:var(--r-md);padding:2px;gap:1px}
        .pill{padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;border:none;cursor:pointer;background:transparent;color:var(--text-muted);font-family:var(--font-sans);transition:all .15s}
        .pill:hover{color:var(--text-secondary)}.pill.on{background:var(--accent-blue);color:#fff}
        .view-toggle{display:flex;margin-left:auto;background:var(--bg-deep);border-radius:var(--r-sm);padding:2px;gap:1px}
        .vt-btn{padding:5px 10px;border-radius:4px;border:none;cursor:pointer;font-size:14px;background:transparent;transition:all .12s}
        .vt-btn:hover{background:var(--bg-hover)}.vt-btn.on{background:var(--bg-elevated)}

        /* Content */
        .content{flex:1;overflow-y:auto;padding:20px 28px}

        /* ─── CARD VIEW ─── */
        .proj-grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(380px, 1fr));gap:16px}
        .proj-card{padding:20px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-surface);cursor:pointer;transition:all .18s;display:flex;flex-direction:column;gap:14px}
        .proj-card:hover{border-color:var(--border-active);background:var(--bg-elevated);transform:translateY(-1px)}
        .pc-top{display:flex;align-items:flex-start;gap:12px}
        .pc-info{flex:1;min-width:0}
        .pc-name{font-size:16px;font-weight:700;margin-bottom:3px}
        .pc-firma{font-size:12px;color:var(--text-secondary);margin-bottom:6px}
        .pc-path{font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:4px}
        .pc-path .pp-dot{width:8px;height:8px;border-radius:50%;background:#003399;flex-shrink:0}
        .pc-status{flex-shrink:0}
        .status-badge{display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border-radius:12px;font-size:11px;font-weight:700}
        .pc-valoare{font-size:11px;font-family:var(--font-mono);color:var(--text-muted);margin-top:6px}

        .pc-progress{display:flex;flex-direction:column;gap:8px}
        .pc-bar-row{display:flex;align-items:center;gap:10px}
        .pc-bar-label{font-size:11px;color:var(--text-muted);width:80px;flex-shrink:0}
        .pc-bar{flex:1;height:6px;background:var(--bg-deep);border-radius:3px;overflow:hidden}
        .pc-bar-fill{height:100%;border-radius:3px;transition:width .4s}
        .pc-bar-pct{font-size:11px;font-family:var(--font-mono);color:var(--text-secondary);width:36px;text-align:right;flex-shrink:0}

        .pc-footer{display:flex;align-items:center;gap:10px;padding-top:10px;border-top:1px solid var(--border)}
        .pc-consultant{font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:4px;flex:1}
        .pc-updated{font-size:11px;color:var(--text-muted);font-family:var(--font-mono)}

        /* ─── TABLE VIEW ─── */
        .proj-table{width:100%;border:1px solid var(--border);border-radius:var(--r-md);overflow:hidden;background:var(--bg-surface)}
        .pt-row{display:grid;grid-template-columns:1fr 140px 90px 100px 100px 100px 90px;align-items:center;padding:10px 16px;border-bottom:1px solid var(--border);transition:background .12s;cursor:pointer}
        .pt-row:last-child{border-bottom:none}
        .pt-row:hover{background:var(--bg-hover)}
        .pt-row.header{background:var(--bg-elevated);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--text-muted);cursor:default}
        .pt-row.header:hover{background:var(--bg-elevated)}
        .pt-name{font-size:13px;font-weight:600}
        .pt-firma{font-size:11px;color:var(--text-muted)}
        .pt-program{font-size:11px;color:var(--text-secondary);font-family:var(--font-mono)}
        .mini-bar{height:4px;border-radius:2px;background:var(--bg-deep);overflow:hidden;width:100%}
        .mini-fill{height:100%;border-radius:2px;transition:width .4s}
        .mini-pct{font-size:10px;font-family:var(--font-mono);color:var(--text-muted);margin-top:2px}
        .pt-time{font-size:11px;color:var(--text-muted)}

        .empty-state{text-align:center;padding:60px;color:var(--text-muted)}
        .empty-state .es-icon{font-size:40px;opacity:.5;margin-bottom:8px}
        .empty-state .es-text{font-size:14px}

        /* ─── CREATE MODAL ─── */
        .overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;animation:fadeIn .2s}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        .modal{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r-lg);width:540px;max-height:85vh;overflow-y:auto;padding:28px;animation:slideUp .3s ease}
        @keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        .modal-title{font-size:20px;font-weight:800;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center}
        .modal-close{background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:18px}.modal-close:hover{color:var(--text-primary)}
        .modal-sub{font-size:14px;color:var(--text-secondary);margin-bottom:24px}

        /* Wizard */
        .wz-bar{display:flex;align-items:center;margin-bottom:24px}
        .wz-step{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--text-muted)}
        .wz-step.on{color:var(--accent-blue)}.wz-step.done{color:var(--accent-green)}
        .wz-num{width:24px;height:24px;border-radius:50%;border:2px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;font-family:var(--font-mono)}
        .wz-step.on .wz-num{border-color:var(--accent-blue);background:var(--accent-blue);color:#fff}
        .wz-step.done .wz-num{border-color:var(--accent-green);background:var(--accent-green);color:#fff}
        .wz-line{flex:1;height:2px;background:var(--border);margin:0 10px}.wz-line.done{background:var(--accent-green)}

        .fg{margin-bottom:16px}
        .fl{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.7px;color:var(--text-muted);margin-bottom:6px}
        .fi-full{width:100%;padding:10px 14px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-deep);color:var(--text-primary);font-size:14px;font-family:var(--font-sans);outline:none}
        .fi-full:focus{border-color:var(--accent-blue)}.fi-full::placeholder{color:var(--text-muted)}

        .firma-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        .firma-option{padding:12px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--bg-elevated);cursor:pointer;transition:all .15s;font-size:13px;font-weight:600}
        .firma-option:hover{border-color:var(--border-active)}.firma-option.on{border-color:var(--accent-blue);background:rgba(77,139,255,.06);color:var(--accent-blue)}

        .prog-section{margin-bottom:12px}
        .prog-header{font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:6px;display:flex;align-items:center;gap:6px}
        .prog-header .ph-dot{width:10px;height:10px;border-radius:50%;background:#003399}
        .masura-row{padding:8px 12px 8px 28px;font-size:13px;color:var(--text-secondary);display:flex;align-items:center;gap:6px;cursor:pointer;border-radius:var(--r-sm);transition:all .12s}
        .masura-row:hover{background:var(--bg-hover);color:var(--text-primary)}
        .masura-row .mr-dot{width:6px;height:6px;border-radius:50%;background:#C9A84C}
        .sesiune-row{padding:6px 12px 6px 52px;font-size:12px;color:var(--text-muted);display:flex;align-items:center;gap:6px;cursor:pointer;border-radius:var(--r-sm);transition:all .12s}
        .sesiune-row:hover{background:var(--bg-hover);color:var(--text-secondary)}
        .sesiune-row.on{background:rgba(77,139,255,.06);color:var(--accent-blue);font-weight:600}
        .sesiune-row .sr-dot{width:4px;height:4px;border-radius:50%;background:#888}

        .btn-row{display:flex;gap:10px;justify-content:flex-end;margin-top:20px}
        .btn-p{padding:10px 20px;border-radius:var(--r-md);border:none;background:var(--accent-blue);color:#fff;font-size:14px;font-weight:700;font-family:var(--font-sans);cursor:pointer}.btn-p:hover{background:#5d9bff}.btn-p:disabled{opacity:.4;cursor:not-allowed}
        .btn-s{padding:10px 20px;border-radius:var(--r-md);border:1px solid var(--border);background:transparent;color:var(--text-secondary);font-size:14px;font-weight:600;font-family:var(--font-sans);cursor:pointer}.btn-s:hover{border-color:var(--border-active);color:var(--text-primary)}

        /* Summary card in step 3 */
        .summary-card{padding:16px;border-radius:var(--r-md);border:1px solid var(--accent-blue);background:rgba(77,139,255,.04);margin-bottom:16px}
        .summary-row{display:flex;gap:8px;font-size:13px;margin-bottom:4px}
        .summary-row .sr-label{color:var(--text-muted);min-width:80px}
        .summary-row .sr-value{color:var(--text-primary);font-weight:600}

        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
      `}</style>

      <div className="page">
        <div className="sidebar">
          <div className="sb-logo"><div className="sb-logo-icon">DF</div><div className="sb-logo-text">DosarFonduri</div></div>
          <div className="sb-nav">
            <div className="sb-section">Principal</div>
            <div className="sb-item"><span className="sb-icon">📊</span><span>Panou</span></div>
            <div className="sb-item"><span className="sb-icon">🏢</span><span>Firme</span></div>
            <div className="sb-item"><span className="sb-icon">📃</span><span>Documente</span></div>
            <div className="sb-item active"><span className="sb-icon">💼</span><span>Proiecte</span></div>
            <div className="sb-section">Configurare</div>
            <div className="sb-item"><span className="sb-icon">🛠</span><span>Configurări</span></div>
            <div className="sb-section">Sistem</div>
            <div className="sb-item"><span className="sb-icon">⚙️</span><span>Admin</span></div>
          </div>
          <div className="sb-footer"><div className="sb-avatar">IP</div><div><div className="sb-user-name">Ion Popescu</div><div className="sb-user-role">Administrator</div></div></div>
        </div>

        <div className="main">
          <div className="topbar">
            <div className="tb-title">Proiecte</div>
            <button className="btn-create" onClick={() => { setShowCreate(true); setCreateStep(1); setCreateData({ name: "", firmaId: null, program: null, masura: null, sesiune: null }); }}>+ Proiect nou</button>
          </div>

          {/* Stats pills */}
          <div className="stats-row">
            <div className={`stat-pill ${statusFilter === "all" ? "active" : ""}`} onClick={() => setStatusFilter("all")}>
              <span className="sp-count">{stats.total}</span> Total
            </div>
            <div className={`stat-pill ${statusFilter === "draft" ? "active" : ""}`} onClick={() => setStatusFilter("draft")}>
              <span className="sp-dot" style={{ background: "#5a6478" }} />
              <span className="sp-count">{stats.draft}</span> Ciornă
            </div>
            <div className={`stat-pill ${statusFilter === "in_progress" ? "active" : ""}`} onClick={() => setStatusFilter("in_progress")}>
              <span className="sp-dot" style={{ background: "#4d8bff" }} />
              <span className="sp-count">{stats.inProgress}</span> În lucru
            </div>
            <div className={`stat-pill ${statusFilter === "review" ? "active" : ""}`} onClick={() => setStatusFilter("review")}>
              <span className="sp-dot" style={{ background: "#fbbf24" }} />
              <span className="sp-count">{stats.review}</span> Verificare
            </div>
            <div className={`stat-pill ${statusFilter === "submitted" ? "active" : ""}`} onClick={() => setStatusFilter("submitted")}>
              <span className="sp-dot" style={{ background: "#34d399" }} />
              <span className="sp-count">{stats.submitted}</span> Depus
            </div>
          </div>

          {/* Toolbar */}
          <div className="toolbar">
            <input className="fi" placeholder="Caută proiect, firmă, program..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 280 }} />
            <div className="pill-group">
              <button className={`pill ${programFilter === "all" ? "on" : ""}`} onClick={() => setProgramFilter("all")}>Toate</button>
              {[...new Set(PROJECTS.map(p => p.program))].map(pr => (
                <button key={pr} className={`pill ${programFilter === pr ? "on" : ""}`} onClick={() => setProgramFilter(pr)}>{pr}</button>
              ))}
            </div>
            <div className="view-toggle">
              <button className={`vt-btn ${viewMode === "cards" ? "on" : ""}`} onClick={() => setViewMode("cards")} title="Carduri">▦</button>
              <button className={`vt-btn ${viewMode === "table" ? "on" : ""}`} onClick={() => setViewMode("table")} title="Tabel">☰</button>
            </div>
          </div>

          {/* Content */}
          <div className="content">
            {filtered.length === 0 ? (
              <div className="empty-state"><div className="es-icon">💼</div><div className="es-text">Niciun proiect găsit</div></div>
            ) : viewMode === "cards" ? (
              <div className="proj-grid">
                {filtered.map(p => {
                  const st = STATUS_MAP[p.status];
                  const op = overallProgress(p);
                  return (
                    <div className="proj-card" key={p.id}>
                      <div className="pc-top">
                        <div className="pc-info">
                          <div className="pc-name">{p.name}</div>
                          <div className="pc-firma">{p.firma}</div>
                          <div className="pc-path">
                            <span className="pp-dot" />
                            {p.program} › {p.masura} › {p.sesiune}
                          </div>
                          {p.valoare !== "—" && <div className="pc-valoare">{p.valoare}</div>}
                        </div>
                        <div className="pc-status">
                          <span className="status-badge" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                        </div>
                      </div>

                      <div className="pc-progress">
                        <div className="pc-bar-row">
                          <span className="pc-bar-label">Eligibilitate</span>
                          <div className="pc-bar"><div className="pc-bar-fill" style={{ width: `${pct(p.eligibility.passed, p.eligibility.total)}%`, background: pct(p.eligibility.passed, p.eligibility.total) === 100 ? "#34d399" : "#fbbf24" }} /></div>
                          <span className="pc-bar-pct">{p.eligibility.passed}/{p.eligibility.total}</span>
                        </div>
                        <div className="pc-bar-row">
                          <span className="pc-bar-label">Elemente</span>
                          <div className="pc-bar"><div className="pc-bar-fill" style={{ width: `${pct(p.elements.filled, p.elements.total)}%`, background: pct(p.elements.filled, p.elements.total) === 100 ? "#34d399" : "#4d8bff" }} /></div>
                          <span className="pc-bar-pct">{p.elements.filled}/{p.elements.total}</span>
                        </div>
                        <div className="pc-bar-row">
                          <span className="pc-bar-label">Documente</span>
                          <div className="pc-bar"><div className="pc-bar-fill" style={{ width: `${pct(p.docs.done, p.docs.total)}%`, background: pct(p.docs.done, p.docs.total) === 100 ? "#34d399" : "#fb923c" }} /></div>
                          <span className="pc-bar-pct">{p.docs.done}/{p.docs.total}</span>
                        </div>
                        <div className="pc-bar-row">
                          <span className="pc-bar-label">Template-uri</span>
                          <div className="pc-bar"><div className="pc-bar-fill" style={{ width: `${pct(p.templates.done, p.templates.total)}%`, background: pct(p.templates.done, p.templates.total) === 100 ? "#34d399" : "#a78bfa" }} /></div>
                          <span className="pc-bar-pct">{p.templates.done}/{p.templates.total}</span>
                        </div>
                      </div>

                      <div className="pc-footer">
                        <span className="pc-consultant">👤 {p.consultant}</span>
                        <span className="pc-updated">{p.updated}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="proj-table">
                <div className="pt-row header">
                  <div>Proiect / Firmă</div>
                  <div>Program</div>
                  <div>Status</div>
                  <div>Eligibilitate</div>
                  <div>Elemente</div>
                  <div>Documente</div>
                  <div>Actualizat</div>
                </div>
                {filtered.map(p => {
                  const st = STATUS_MAP[p.status];
                  return (
                    <div className="pt-row" key={p.id}>
                      <div><div className="pt-name">{p.name}</div><div className="pt-firma">{p.firma}</div></div>
                      <div className="pt-program">{p.masura}</div>
                      <div><span className="status-badge" style={{ background: st.bg, color: st.color }}>{st.label}</span></div>
                      <div>
                        <div className="mini-bar"><div className="mini-fill" style={{ width: `${pct(p.eligibility.passed, p.eligibility.total)}%`, background: pct(p.eligibility.passed, p.eligibility.total) === 100 ? "#34d399" : "#fbbf24" }} /></div>
                        <div className="mini-pct">{p.eligibility.passed}/{p.eligibility.total}</div>
                      </div>
                      <div>
                        <div className="mini-bar"><div className="mini-fill" style={{ width: `${pct(p.elements.filled, p.elements.total)}%`, background: "#4d8bff" }} /></div>
                        <div className="mini-pct">{p.elements.filled}/{p.elements.total}</div>
                      </div>
                      <div>
                        <div className="mini-bar"><div className="mini-fill" style={{ width: `${pct(p.docs.done, p.docs.total)}%`, background: "#fb923c" }} /></div>
                        <div className="mini-pct">{p.docs.done}/{p.docs.total}</div>
                      </div>
                      <div className="pt-time">{p.updated}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ═══ CREATE PROJECT MODAL ═══ */}
        {showCreate && (
          <div className="overlay" onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
            <div className="modal">
              <div className="modal-title">Proiect nou<button className="modal-close" onClick={() => setShowCreate(false)}>✕</button></div>

              <div className="wz-bar">
                {["Firmă", "Program", "Confirmare"].map((label, i) => {
                  const s = i + 1;
                  return <div key={s} style={{ display: "contents" }}>
                    <div className={`wz-step ${createStep === s ? "on" : ""} ${createStep > s ? "done" : ""}`}>
                      <div className="wz-num">{createStep > s ? "✓" : s}</div><span>{label}</span>
                    </div>
                    {s < 3 && <div className={`wz-line ${createStep > s ? "done" : ""}`} />}
                  </div>;
                })}
              </div>

              {/* Step 1: Select firma */}
              {createStep === 1 && (<>
                <div className="fg">
                  <label className="fl">Selectează firma</label>
                  <div className="firma-grid">
                    {FIRME_LIST.map(f => (
                      <div key={f.id} className={`firma-option ${createData.firmaId === f.id ? "on" : ""}`}
                        onClick={() => setCreateData(p => ({ ...p, firmaId: f.id }))}>
                        🏢 {f.name}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="btn-row">
                  <button className="btn-s" onClick={() => setShowCreate(false)}>Anulează</button>
                  <button className="btn-p" disabled={!createData.firmaId} onClick={() => setCreateStep(2)}>Continuă →</button>
                </div>
              </>)}

              {/* Step 2: Select program path */}
              {createStep === 2 && (<>
                <div className="fg">
                  <label className="fl">Selectează programul și sesiunea</label>
                  {PROGRAMS_TREE.map(prog => (
                    <div className="prog-section" key={prog.program}>
                      <div className="prog-header"><span className="ph-dot" /> {prog.program}</div>
                      {prog.masuri.map(m => (
                        <div key={m.name}>
                          <div className="masura-row"><span className="mr-dot" /> {m.name}</div>
                          {m.sesiuni.map(s => (
                            <div key={s}
                              className={`sesiune-row ${createData.program === prog.program && createData.masura === m.name && createData.sesiune === s ? "on" : ""}`}
                              onClick={() => setCreateData(p => ({ ...p, program: prog.program, masura: m.name, sesiune: s }))}>
                              <span className="sr-dot" /> {s}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="btn-row">
                  <button className="btn-s" onClick={() => setCreateStep(1)}>← Înapoi</button>
                  <button className="btn-p" disabled={!createData.sesiune} onClick={() => setCreateStep(3)}>Continuă →</button>
                </div>
              </>)}

              {/* Step 3: Name + confirm */}
              {createStep === 3 && (<>
                <div className="fg">
                  <label className="fl">Denumire proiect</label>
                  <input className="fi-full" placeholder="ex: Modernizare linie producție..." value={createData.name} onChange={e => setCreateData(p => ({ ...p, name: e.target.value }))} autoFocus />
                </div>

                <div className="summary-card">
                  <div className="summary-row"><span className="sr-label">Firmă:</span><span className="sr-value">{FIRME_LIST.find(f => f.id === createData.firmaId)?.name}</span></div>
                  <div className="summary-row"><span className="sr-label">Program:</span><span className="sr-value">{createData.program}</span></div>
                  <div className="summary-row"><span className="sr-label">Măsură:</span><span className="sr-value">{createData.masura}</span></div>
                  <div className="summary-row"><span className="sr-label">Sesiune:</span><span className="sr-value">{createData.sesiune}</span></div>
                </div>

                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.5 }}>
                  La creare, proiectul va prelua automat ghidurile, template-urile și regulile din sesiunea selectată. Solomon va fi disponibil pentru colectare date.
                </div>

                <div className="btn-row">
                  <button className="btn-s" onClick={() => setCreateStep(2)}>← Înapoi</button>
                  <button className="btn-p" disabled={!createData.name.trim()} onClick={() => { setShowCreate(false); alert("Proiect creat! Redirectare... (demo)"); }}>
                    Creează proiect
                  </button>
                </div>
              </>)}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
