import { useState } from "react";

/* ═══ MOCK DATA ═══ */
const CABINETS = [
  { id: 1, code: "AGROCONSULT-2024", name: "AgroConsult Partners", plan: "Professional", maxUsers: 5, activeUsers: 3, projects: 12, aiCost: 42.30, storage: "3.2 GB", status: "activ", trial: false, created: "2024-06-15", lastActive: "Acum 5 min", contact: "ion.popescu@agroconsult.ro", phone: "0740-111-222" },
  { id: 2, code: "FONDURI-PRO-2026", name: "Fonduri Pro Management", plan: "Enterprise", maxUsers: 20, activeUsers: 8, projects: 34, aiCost: 186.50, storage: "18.7 GB", status: "activ", trial: false, created: "2025-01-10", lastActive: "Acum 1 oră", contact: "admin@fonduripro.ro", phone: "0722-333-444" },
  { id: 3, code: "DEMO-2026", name: "Cabinet Demo", plan: "Starter", maxUsers: 1, activeUsers: 1, projects: 2, aiCost: 3.20, storage: "0.1 GB", status: "trial", trial: true, trialDays: 5, created: "2026-03-01", lastActive: "Ieri, 14:00", contact: "demo@test.ro", phone: "—" },
  { id: 4, code: "CONSUL-VEST-2025", name: "ConsulVest Group", plan: "Professional", maxUsers: 5, activeUsers: 0, projects: 0, aiCost: 0, storage: "0 GB", status: "inactiv", trial: false, created: "2025-08-20", lastActive: "15 nov 2025", contact: "office@consulvest.ro", phone: "0256-555-666" },
  { id: 5, code: "NORDCONSULT-2026", name: "Nord Consulting SRL", plan: "Professional", maxUsers: 5, activeUsers: 4, projects: 18, aiCost: 78.90, storage: "6.4 GB", status: "activ", trial: false, created: "2025-11-01", lastActive: "Acum 30 min", contact: "office@nordconsult.ro", phone: "0264-777-888" },
  { id: 6, code: "TRIAL-ABC-2026", name: "Test Cabinet ABC", plan: "Starter", maxUsers: 1, activeUsers: 1, projects: 1, aiCost: 1.10, storage: "0.05 GB", status: "trial", trial: true, trialDays: 2, created: "2026-03-04", lastActive: "Azi, 10:00", contact: "abc@trial.ro", phone: "—" },
];

const CODES_UNUSED = [
  { code: "INVEST-SUD-2026", plan: "Professional", maxUsers: 5, trial: 30, created: "2026-03-05", expires: "2026-06-05" },
  { code: "STARTER-DEMO-X", plan: "Starter", maxUsers: 1, trial: 7, created: "2026-03-06", expires: "2026-04-06" },
];

const STATUS_MAP = {
  activ: { label: "Activ", color: "#34d399", bg: "rgba(52,211,153,.12)" },
  trial: { label: "Trial", color: "#fbbf24", bg: "rgba(251,191,36,.12)" },
  inactiv: { label: "Inactiv", color: "#5a6478", bg: "rgba(90,100,120,.12)" },
  expirat: { label: "Expirat", color: "#f87171", bg: "rgba(248,113,113,.12)" },
};

const PLAN_COLORS = { Starter: "#fb923c", Professional: "#4d8bff", Enterprise: "#a78bfa" };

export default function ProviderDashboard() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [provEmail, setProvEmail] = useState("");
  const [provPw, setProvPw] = useState("");
  const [activeTab, setActiveTab] = useState("cabinets");
  const [selectedCabinet, setSelectedCabinet] = useState(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [genPlan, setGenPlan] = useState("Professional");
  const [genMaxUsers, setGenMaxUsers] = useState(5);
  const [genTrial, setGenTrial] = useState(30);
  const [genCode, setGenCode] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const sel = CABINETS.find(c => c.id === selectedCabinet);

  const filtered = CABINETS.filter(c => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (search) { const q = search.toLowerCase(); return c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || c.contact.toLowerCase().includes(q); }
    return true;
  });

  const totalMRR = CABINETS.filter(c => c.status === "activ").reduce((s, c) => s + ({ Starter: 49, Professional: 149, Enterprise: 399 }[c.plan] || 0), 0);
  const totalAI = CABINETS.reduce((s, c) => s + c.aiCost, 0);
  const totalUsers = CABINETS.reduce((s, c) => s + c.activeUsers, 0);
  const totalProjects = CABINETS.reduce((s, c) => s + c.projects, 0);

  const generateCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const rand = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    setGenCode(`CABINET-${rand}-2026`);
  };

  // LOGIN SCREEN
  if (!loggedIn) return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&family=JetBrains+Mono:wght@400;500&display=swap');
        *{margin:0;padding:0;box-sizing:border-box}
        :root{--bg-deep:#0a0c10;--bg-surface:#12151c;--bg-elevated:#1a1e28;--bg-hover:#222838;--border:#2a3040;--text-primary:#e8ecf4;--text-secondary:#8892a8;--text-muted:#5a6478;--accent-blue:#4d8bff;--accent-green:#34d399;--accent-red:#f87171;--accent-purple:#a78bfa;--font-sans:'DM Sans',system-ui,sans-serif;--font-mono:'JetBrains Mono',monospace;--r-sm:6px;--r-md:10px;--r-lg:14px}
        body{font-family:var(--font-sans);background:var(--bg-deep);color:var(--text-primary);display:flex;justify-content:center;align-items:center;min-height:100vh}
        .login-box{width:400px;padding:40px;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r-lg)}
        .lb-logo{display:flex;align-items:center;gap:12px;margin-bottom:32px}
        .lb-icon{width:40px;height:40px;border-radius:10px;background:var(--accent-purple);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#fff}
        .lb-text{font-size:18px;font-weight:800}.lb-sub{font-size:12px;color:var(--text-muted);font-weight:500}
        .fg{margin-bottom:16px}
        .fl{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.7px;color:var(--text-muted);margin-bottom:6px}
        .fi{width:100%;padding:10px 14px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-deep);color:var(--text-primary);font-size:14px;font-family:var(--font-sans);outline:none}
        .fi:focus{border-color:var(--accent-purple)}.fi::placeholder{color:var(--text-muted)}
        .btn{width:100%;padding:12px;border-radius:var(--r-md);border:none;background:var(--accent-purple);color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:var(--font-sans);margin-top:8px;transition:all .15s}
        .btn:hover{background:#b69dfc}
      `}</style>
      <div className="login-box">
        <div className="lb-logo">
          <div className="lb-icon">DF</div>
          <div><div className="lb-text">DosarFonduri</div><div className="lb-sub">Provider Dashboard</div></div>
        </div>
        <div className="fg"><label className="fl">Email</label><input className="fi" type="email" placeholder="admin@dosarfonduri.ro" value={provEmail} onChange={e => setProvEmail(e.target.value)} /></div>
        <div className="fg"><label className="fl">Parolă</label><input className="fi" type="password" placeholder="••••••••" value={provPw} onChange={e => setProvPw(e.target.value)} /></div>
        <button className="btn" onClick={() => setLoggedIn(true)}>Autentificare Provider</button>
      </div>
    </>
  );

  // DASHBOARD
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&family=JetBrains+Mono:wght@400;500&display=swap');
        *{margin:0;padding:0;box-sizing:border-box}
        :root{--bg-deep:#0a0c10;--bg-surface:#12151c;--bg-elevated:#1a1e28;--bg-hover:#222838;--border:#2a3040;--border-active:#3d4760;--text-primary:#e8ecf4;--text-secondary:#8892a8;--text-muted:#5a6478;--accent-blue:#4d8bff;--accent-green:#34d399;--accent-red:#f87171;--accent-yellow:#fbbf24;--accent-purple:#a78bfa;--accent-orange:#fb923c;--font-sans:'DM Sans',system-ui,sans-serif;--font-mono:'JetBrains Mono',monospace;--r-sm:6px;--r-md:10px;--r-lg:14px}
        body{font-family:var(--font-sans);background:var(--bg-deep);color:var(--text-primary)}
        .page{display:flex;height:100vh;overflow:hidden}
        .side{width:220px;min-width:220px;background:var(--bg-surface);border-right:1px solid var(--border);display:flex;flex-direction:column}
        .s-logo{padding:20px 16px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--border)}
        .s-icon{width:36px;height:36px;border-radius:10px;background:var(--accent-purple);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:#fff}
        .s-text{font-size:15px;font-weight:800}.s-sub{font-size:10px;color:var(--accent-purple);font-weight:600;text-transform:uppercase;letter-spacing:.5px}
        .s-nav{flex:1;padding:12px 8px}
        .s-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:var(--r-sm);cursor:pointer;font-size:14px;font-weight:500;color:var(--text-secondary);transition:all .15s;margin-bottom:2px}
        .s-item:hover{background:var(--bg-hover);color:var(--text-primary)}.s-item.active{background:rgba(167,139,250,.1);color:var(--accent-purple);font-weight:600}
        .s-footer{padding:12px;border-top:1px solid var(--border);font-size:12px;color:var(--text-muted)}

        .main{flex:1;display:flex;flex-direction:column;overflow:hidden}
        .topbar{padding:14px 24px;border-bottom:1px solid var(--border);background:var(--bg-surface);display:flex;align-items:center;gap:16px}
        .tb-title{font-size:20px;font-weight:800;flex:1}
        .btn-gen{padding:8px 18px;border-radius:var(--r-md);border:none;background:var(--accent-purple);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font-sans);display:flex;align-items:center;gap:6px;box-shadow:0 2px 12px rgba(167,139,250,.25)}
        .btn-gen:hover{background:#b69dfc}

        /* Stats */
        .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;padding:20px 24px;border-bottom:1px solid var(--border);background:var(--bg-surface)}
        .stat{padding:16px 18px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-elevated)}
        .stat-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--text-muted);margin-bottom:6px}
        .stat-val{font-size:28px;font-weight:800;font-family:var(--font-mono);letter-spacing:-1px}
        .stat-sub{font-size:12px;color:var(--text-muted);margin-top:2px}

        .content{flex:1;overflow-y:auto;padding:20px 24px}

        /* Toolbar */
        .toolbar{display:flex;align-items:center;gap:10px;margin-bottom:16px}
        .fi{padding:8px 14px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-deep);color:var(--text-primary);font-size:13px;font-family:var(--font-sans);outline:none}
        .fi:focus{border-color:var(--accent-purple)}.fi::placeholder{color:var(--text-muted)}
        .pill-group{display:flex;background:var(--bg-deep);border-radius:var(--r-md);padding:2px;gap:1px}
        .pill{padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;border:none;cursor:pointer;background:transparent;color:var(--text-muted);font-family:var(--font-sans);transition:all .15s}
        .pill:hover{color:var(--text-secondary)}.pill.on{background:var(--accent-purple);color:#fff}

        /* Cabinet card */
        .cab-card{display:flex;align-items:center;gap:16px;padding:16px 20px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-surface);margin-bottom:8px;cursor:pointer;transition:all .15s}
        .cab-card:hover{border-color:var(--border-active);background:var(--bg-elevated)}
        .cab-card.active{border-color:var(--accent-purple);background:rgba(167,139,250,.04)}
        .cab-plan{width:40px;height:40px;border-radius:var(--r-sm);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:#fff;flex-shrink:0;font-family:var(--font-mono)}
        .cab-info{flex:1;min-width:0}
        .cab-name{font-size:14px;font-weight:700;display:flex;align-items:center;gap:8px}
        .cab-code{font-size:12px;font-family:var(--font-mono);color:var(--text-muted)}
        .cab-meta{font-size:11px;color:var(--text-muted);display:flex;gap:10px;margin-top:3px}
        .cab-right{text-align:right;flex-shrink:0}
        .cab-ai{font-size:16px;font-weight:800;font-family:var(--font-mono);color:var(--accent-yellow)}
        .cab-ai-label{font-size:10px;color:var(--text-muted)}
        .cab-last{font-size:11px;color:var(--text-muted);font-family:var(--font-mono);margin-top:4px}
        .badge{font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px}

        /* Detail panel */
        .cab-detail{padding:20px;border-radius:var(--r-md);border:1px solid var(--accent-purple);background:rgba(167,139,250,.03);margin-top:12px}
        .cd-name{font-size:18px;font-weight:800;margin-bottom:2px}.cd-code{font-size:13px;font-family:var(--font-mono);color:var(--text-secondary);margin-bottom:12px}
        .cd-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
        .cd-cell{padding:10px 12px;background:var(--bg-deep);border-radius:var(--r-sm);border:1px solid var(--border)}
        .cd-cell.span2{grid-column:span 2}
        .cd-cell-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:2px}
        .cd-cell-value{font-size:13px;font-weight:600;font-family:var(--font-mono)}
        .cd-actions{display:flex;gap:8px}
        .cd-btn{padding:8px 16px;border-radius:var(--r-sm);border:1px solid var(--border);background:transparent;color:var(--text-secondary);font-size:12px;font-weight:600;cursor:pointer;font-family:var(--font-sans);transition:all .12s;display:flex;align-items:center;gap:4px}
        .cd-btn:hover{border-color:var(--border-active);color:var(--text-primary);background:var(--bg-hover)}
        .cd-btn.danger{color:var(--accent-red);border-color:rgba(248,113,113,.25)}.cd-btn.danger:hover{background:rgba(248,113,113,.06)}

        /* Codes tab */
        .code-card{display:flex;align-items:center;gap:16px;padding:14px 18px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-surface);margin-bottom:8px}
        .cc-code{font-size:16px;font-weight:800;font-family:var(--font-mono);color:var(--accent-purple);flex:1;letter-spacing:1px}
        .cc-meta{font-size:12px;color:var(--text-muted)}
        .cc-copy{padding:6px 12px;border-radius:var(--r-sm);border:1px solid var(--border);background:transparent;color:var(--text-secondary);font-size:12px;font-weight:600;cursor:pointer;font-family:var(--font-sans);transition:all .12s}
        .cc-copy:hover{border-color:var(--accent-purple);color:var(--accent-purple)}

        /* Generate modal */
        .overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;animation:fadeIn .2s}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        .modal{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r-lg);width:480px;padding:28px;animation:slideUp .3s ease}
        @keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        .modal-title{font-size:20px;font-weight:800;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center}
        .modal-close{background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:18px}.modal-close:hover{color:var(--text-primary)}
        .modal-sub{font-size:14px;color:var(--text-secondary);margin-bottom:20px}
        .fg{margin-bottom:16px}
        .fl{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.7px;color:var(--text-muted);margin-bottom:6px}
        .fi-full{width:100%;padding:10px 14px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-deep);color:var(--text-primary);font-size:14px;font-family:var(--font-sans);outline:none}
        .fi-full:focus{border-color:var(--accent-purple)}
        .plan-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
        .plan-opt{padding:12px;border-radius:var(--r-sm);border:2px solid var(--border);background:var(--bg-elevated);cursor:pointer;text-align:center;transition:all .15s}
        .plan-opt:hover{border-color:var(--border-active)}.plan-opt.on{border-color:var(--accent-purple);background:rgba(167,139,250,.06)}
        .plan-opt .po-name{font-size:13px;font-weight:700}.plan-opt .po-price{font-size:11px;color:var(--text-muted)}
        .num-row{display:flex;gap:12px}
        .num-field{flex:1}
        .num-field .fi-full{text-align:center;font-family:var(--font-mono)}
        .gen-result{padding:20px;border-radius:var(--r-md);border:1px solid var(--accent-green);background:rgba(52,211,153,.04);text-align:center;margin-bottom:16px}
        .gen-code{font-size:24px;font-weight:800;font-family:var(--font-mono);color:var(--accent-purple);letter-spacing:2px;margin-bottom:8px}
        .gen-hint{font-size:12px;color:var(--text-secondary)}
        .btn-row{display:flex;gap:10px;justify-content:flex-end}
        .btn-p{padding:10px 20px;border-radius:var(--r-md);border:none;background:var(--accent-purple);color:#fff;font-size:14px;font-weight:700;font-family:var(--font-sans);cursor:pointer}.btn-p:hover{background:#b69dfc}
        .btn-s{padding:10px 20px;border-radius:var(--r-md);border:1px solid var(--border);background:transparent;color:var(--text-secondary);font-size:14px;font-weight:600;font-family:var(--font-sans);cursor:pointer}

        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
      `}</style>

      <div className="page">
        <div className="side">
          <div className="s-logo"><div className="s-icon">DF</div><div><div className="s-text">DosarFonduri</div><div className="s-sub">Provider</div></div></div>
          <div className="s-nav">
            <div className={`s-item ${activeTab === "cabinets" ? "active" : ""}`} onClick={() => setActiveTab("cabinets")}>🏢 Cabinete</div>
            <div className={`s-item ${activeTab === "codes" ? "active" : ""}`} onClick={() => setActiveTab("codes")}>🔑 Coduri nefolosite</div>
            <div className={`s-item ${activeTab === "revenue" ? "active" : ""}`} onClick={() => setActiveTab("revenue")}>💰 Revenue</div>
          </div>
          <div className="s-footer">Logat ca: admin@dosarfonduri.ro<br /><span style={{ cursor: "pointer", color: "var(--accent-purple)" }} onClick={() => setLoggedIn(false)}>Deconectare</span></div>
        </div>

        <div className="main">
          <div className="topbar">
            <div className="tb-title">{activeTab === "cabinets" ? "Cabinete" : activeTab === "codes" ? "Coduri de acces" : "Revenue & Metrici"}</div>
            <button className="btn-gen" onClick={() => { setShowGenerate(true); setGenCode(null); }}>🔑 Generează cod nou</button>
          </div>

          <div className="stats">
            <div className="stat">
              <div className="stat-label">Cabinete active</div>
              <div className="stat-val" style={{ color: "var(--accent-green)" }}>{CABINETS.filter(c => c.status === "activ").length}</div>
              <div className="stat-sub">din {CABINETS.length} total</div>
            </div>
            <div className="stat">
              <div className="stat-label">MRR</div>
              <div className="stat-val" style={{ color: "var(--accent-blue)" }}>{totalMRR}€</div>
              <div className="stat-sub">venit lunar recurent</div>
            </div>
            <div className="stat">
              <div className="stat-label">Cost AI total</div>
              <div className="stat-val" style={{ color: "var(--accent-yellow)" }}>${totalAI.toFixed(0)}</div>
              <div className="stat-sub">luna curentă, toate cabinetele</div>
            </div>
            <div className="stat">
              <div className="stat-label">Utilizatori / Proiecte</div>
              <div className="stat-val">{totalUsers}</div>
              <div className="stat-sub">{totalProjects} proiecte active</div>
            </div>
          </div>

          <div className="content">
            {/* ═══ CABINETE ═══ */}
            {activeTab === "cabinets" && (<>
              <div className="toolbar">
                <input className="fi" placeholder="Caută cabinet, cod, contact..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 260 }} />
                <div className="pill-group">
                  <button className={`pill ${statusFilter === "all" ? "on" : ""}`} onClick={() => setStatusFilter("all")}>Toate</button>
                  <button className={`pill ${statusFilter === "activ" ? "on" : ""}`} onClick={() => setStatusFilter("activ")}>Active</button>
                  <button className={`pill ${statusFilter === "trial" ? "on" : ""}`} onClick={() => setStatusFilter("trial")}>Trial</button>
                  <button className={`pill ${statusFilter === "inactiv" ? "on" : ""}`} onClick={() => setStatusFilter("inactiv")}>Inactive</button>
                </div>
              </div>

              {filtered.map(c => {
                const st = STATUS_MAP[c.status];
                const isActive = selectedCabinet === c.id;
                return (
                  <div key={c.id}>
                    <div className={`cab-card ${isActive ? "active" : ""}`} onClick={() => setSelectedCabinet(isActive ? null : c.id)}>
                      <div className="cab-plan" style={{ background: PLAN_COLORS[c.plan] || "#5a6478" }}>{c.plan[0]}</div>
                      <div className="cab-info">
                        <div className="cab-name">
                          {c.name}
                          <span className="badge" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                          {c.trial && <span className="badge" style={{ background: "rgba(251,191,36,.12)", color: "#fbbf24" }}>{c.trialDays}z rămase</span>}
                        </div>
                        <div className="cab-code">{c.code}</div>
                        <div className="cab-meta">
                          <span>👥 {c.activeUsers}/{c.maxUsers}</span>
                          <span>💼 {c.projects} proiecte</span>
                          <span>📧 {c.contact}</span>
                        </div>
                      </div>
                      <div className="cab-right">
                        <div className="cab-ai">${c.aiCost.toFixed(2)}</div>
                        <div className="cab-ai-label">cost AI / lună</div>
                        <div className="cab-last">{c.lastActive}</div>
                      </div>
                    </div>

                    {isActive && (
                      <div className="cab-detail">
                        <div className="cd-name">{c.name}</div>
                        <div className="cd-code">{c.code}</div>
                        <div className="cd-grid">
                          <div className="cd-cell"><div className="cd-cell-label">Plan</div><div className="cd-cell-value" style={{ color: PLAN_COLORS[c.plan] }}>{c.plan}</div></div>
                          <div className="cd-cell"><div className="cd-cell-label">Utilizatori</div><div className="cd-cell-value">{c.activeUsers} / {c.maxUsers}</div></div>
                          <div className="cd-cell"><div className="cd-cell-label">Proiecte</div><div className="cd-cell-value">{c.projects}</div></div>
                          <div className="cd-cell"><div className="cd-cell-label">Stocare</div><div className="cd-cell-value">{c.storage}</div></div>
                          <div className="cd-cell"><div className="cd-cell-label">Cost AI luna curentă</div><div className="cd-cell-value" style={{ color: "var(--accent-yellow)" }}>${c.aiCost.toFixed(2)}</div></div>
                          <div className="cd-cell"><div className="cd-cell-label">Creat</div><div className="cd-cell-value">{c.created}</div></div>
                          <div className="cd-cell"><div className="cd-cell-label">Contact</div><div className="cd-cell-value" style={{ fontSize: 11 }}>{c.contact}</div></div>
                          <div className="cd-cell"><div className="cd-cell-label">Telefon</div><div className="cd-cell-value">{c.phone}</div></div>
                        </div>
                        <div className="cd-actions">
                          <button className="cd-btn">✏️ Editează plan</button>
                          <button className="cd-btn">📧 Trimite email</button>
                          <button className="cd-btn">🔄 Regenerează cod</button>
                          {c.status === "trial" && <button className="cd-btn" style={{ color: "var(--accent-green)", borderColor: "rgba(52,211,153,.3)" }}>✓ Activează complet</button>}
                          <button className="cd-btn danger">🚫 Dezactivează</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </>)}

            {/* ═══ CODURI NEFOLOSITE ═══ */}
            {activeTab === "codes" && (<>
              <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16 }}>Coduri generate dar neactivate încă de niciun cabinet.</div>
              {CODES_UNUSED.map((c, i) => (
                <div className="code-card" key={i}>
                  <div className="cc-code">{c.code}</div>
                  <div style={{ flex: 1 }}>
                    <div className="cc-meta">{c.plan} · {c.maxUsers} utilizatori · Trial {c.trial}z</div>
                    <div className="cc-meta">Creat: {c.created} · Expiră: {c.expires}</div>
                  </div>
                  <button className="cc-copy" onClick={() => { navigator.clipboard?.writeText(c.code); }}>📋 Copiază</button>
                  <button className="cc-copy" style={{ color: "var(--accent-red)" }}>🗑</button>
                </div>
              ))}
              {CODES_UNUSED.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Niciun cod nefolosit</div>}
            </>)}

            {/* ═══ REVENUE ═══ */}
            {activeTab === "revenue" && (<>
              <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 20 }}>Overview financiar pe toate cabinetele.</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
                <div className="stat"><div className="stat-label">MRR (Monthly Recurring Revenue)</div><div className="stat-val" style={{ color: "var(--accent-green)" }}>{totalMRR}€</div></div>
                <div className="stat"><div className="stat-label">Cost AI total (luna curentă)</div><div className="stat-val" style={{ color: "var(--accent-yellow)" }}>${totalAI.toFixed(2)}</div></div>
                <div className="stat"><div className="stat-label">Marjă netă estimată</div><div className="stat-val" style={{ color: totalMRR - totalAI > 0 ? "var(--accent-green)" : "var(--accent-red)" }}>{(totalMRR - totalAI).toFixed(0)}€</div><div className="stat-sub">{Math.round(((totalMRR - totalAI) / totalMRR) * 100)}% marjă</div></div>
              </div>

              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".8px", color: "var(--text-muted)", marginBottom: 10 }}>Revenue per cabinet</div>
              <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", overflow: "hidden", background: "var(--bg-surface)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 80px 80px 100px", padding: "10px 16px", borderBottom: "1px solid var(--border)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--text-muted)" }}>
                  <div>Cabinet</div><div>Plan</div><div>MRR</div><div>Cost AI</div><div>Marjă</div>
                </div>
                {CABINETS.filter(c => c.status === "activ").map(c => {
                  const mrr = { Starter: 49, Professional: 149, Enterprise: 399 }[c.plan] || 0;
                  const margin = mrr - c.aiCost;
                  return (
                    <div key={c.id} style={{ display: "grid", gridTemplateColumns: "1fr 100px 80px 80px 100px", padding: "10px 16px", borderBottom: "1px solid rgba(42,48,64,.5)", fontSize: 13, alignItems: "center" }}>
                      <div><div style={{ fontWeight: 600 }}>{c.name}</div><div style={{ fontSize: 11, color: "var(--text-muted)" }}>{c.code}</div></div>
                      <div style={{ color: PLAN_COLORS[c.plan], fontWeight: 600 }}>{c.plan}</div>
                      <div style={{ fontFamily: "var(--font-mono)" }}>{mrr}€</div>
                      <div style={{ fontFamily: "var(--font-mono)", color: "var(--accent-yellow)" }}>${c.aiCost.toFixed(0)}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: margin > 0 ? "var(--accent-green)" : "var(--accent-red)" }}>{margin.toFixed(0)}€ ({Math.round((margin / mrr) * 100)}%)</div>
                    </div>
                  );
                })}
              </div>
            </>)}
          </div>
        </div>

        {/* ═══ GENERATE CODE MODAL ═══ */}
        {showGenerate && (
          <div className="overlay" onClick={e => e.target === e.currentTarget && setShowGenerate(false)}>
            <div className="modal">
              <div className="modal-title">🔑 Generează cod cabinet<button className="modal-close" onClick={() => setShowGenerate(false)}>✕</button></div>
              <div className="modal-sub">Codul va fi unic și poate fi trimis consultantului pentru activare.</div>

              {!genCode ? (<>
                <div className="fg">
                  <label className="fl">Plan tarifar</label>
                  <div className="plan-grid">
                    {["Starter", "Professional", "Enterprise"].map(p => (
                      <div key={p} className={`plan-opt ${genPlan === p ? "on" : ""}`} onClick={() => setGenPlan(p)}>
                        <div className="po-name" style={{ color: PLAN_COLORS[p] }}>{p}</div>
                        <div className="po-price">{{ Starter: "49€", Professional: "149€", Enterprise: "399€" }[p]}/lună</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="num-row">
                  <div className="num-field fg">
                    <label className="fl">Max utilizatori</label>
                    <input className="fi-full" type="number" min={1} max={100} value={genMaxUsers} onChange={e => setGenMaxUsers(parseInt(e.target.value) || 1)} />
                  </div>
                  <div className="num-field fg">
                    <label className="fl">Perioadă trial (zile)</label>
                    <input className="fi-full" type="number" min={0} max={90} value={genTrial} onChange={e => setGenTrial(parseInt(e.target.value) || 0)} />
                  </div>
                </div>

                <div className="btn-row">
                  <button className="btn-s" onClick={() => setShowGenerate(false)}>Anulează</button>
                  <button className="btn-p" onClick={generateCode}>🔑 Generează cod</button>
                </div>
              </>) : (
                <>
                  <div className="gen-result">
                    <div className="gen-code">{genCode}</div>
                    <div className="gen-hint">Plan: {genPlan} · {genMaxUsers} utilizatori · Trial: {genTrial} zile</div>
                  </div>
                  <div className="btn-row">
                    <button className="btn-s" onClick={() => { navigator.clipboard?.writeText(genCode); }}>📋 Copiază cod</button>
                    <button className="btn-p" onClick={() => setShowGenerate(false)}>Gata</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
