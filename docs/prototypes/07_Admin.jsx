import { useState } from "react";

const USERS = [
  { id: 1, name: "Ion Popescu", email: "ion.popescu@expertconsulting.ro", role: "admin", status: "activ", avatar: "IP", lastActive: "Acum 5 min", projects: 4, created: "2026-01-10" },
  { id: 2, name: "Maria Ionescu", email: "maria.ionescu@expertconsulting.ro", role: "consultant", status: "activ", avatar: "MI", lastActive: "Acum 2 ore", projects: 2, created: "2026-01-15" },
  { id: 3, name: "Andrei Vasile", email: "andrei.v@expertconsulting.ro", role: "consultant", status: "activ", avatar: "AV", lastActive: "Ieri, 18:30", projects: 1, created: "2026-02-01" },
  { id: 4, name: "Elena Dumitrescu", email: "elena.d@expertconsulting.ro", role: "viewer", status: "activ", avatar: "ED", lastActive: "3 mar, 10:00", projects: 0, created: "2026-02-20" },
  { id: 5, name: "Cristian Barbu", email: "cristian.b@expertconsulting.ro", role: "consultant", status: "invitat", avatar: "CB", lastActive: "—", projects: 0, created: "2026-03-05" },
];

const ROLES = {
  admin: { label: "Administrator", color: "#a78bfa", bg: "rgba(167,139,250,0.12)", perms: ["Toate permisiunile", "Gestionare utilizatori", "Configurări", "Ștergere proiecte", "Export date", "Facturare"] },
  consultant: { label: "Consultant", color: "#4d8bff", bg: "rgba(77,139,255,0.12)", perms: ["Creare/editare proiecte", "Chat Solomon & Neemia", "Upload documente", "Validare elemente", "Export proiecte proprii"] },
  viewer: { label: "Vizualizare", color: "#34d399", bg: "rgba(52,211,153,0.12)", perms: ["Vizualizare proiecte", "Vizualizare documente", "Fără editare", "Fără upload"] },
};

const AUDIT_LOG = [
  { time: "Azi, 12:45", user: "Ion Popescu", action: "Proiect creat", detail: "Linie procesare legume — AGRO INVEST SRL", type: "create" },
  { time: "Azi, 11:20", user: "Maria Ionescu", action: "Document uploadat", detail: "Ghid PNRR C7 — Sesiunea 2 (draft)", type: "upload" },
  { time: "Azi, 09:15", user: "Ion Popescu", action: "Sincronizare ONRC", detail: "SC CONSTRUCT NORD SRL — date actualizate", type: "sync" },
  { time: "Ieri, 18:30", user: "Andrei Vasile", action: "Template completat", detail: "Cerere Finanțare — Panouri fotovoltaice", type: "template" },
  { time: "Ieri, 16:00", user: "Ion Popescu", action: "Utilizator invitat", detail: "cristian.b@expertconsulting.ro — rol Consultant", type: "user" },
  { time: "Ieri, 14:20", user: "Maria Ionescu", action: "Eligibilitate verificată", detail: "Digitalizare procese — 9/11 trecute", type: "check" },
  { time: "3 mar", user: "Ion Popescu", action: "Plan actualizat", detail: "Starter → Professional", type: "billing" },
  { time: "3 mar", user: "Ion Popescu", action: "Configurare salvată", detail: "Solomon model schimbat: Sonnet → Opus", type: "config" },
  { time: "28 feb", user: "Andrei Vasile", action: "Firmă adăugată", detail: "GREEN ENERGY SRL — CUI RO39876543", type: "create" },
  { time: "28 feb", user: "Ion Popescu", action: "Proiect depus", detail: "Echipamente brutărie — PÂINE & TRADIȚIE SRL", type: "submit" },
];

const AI_COSTS = {
  totalMonth: 42.30,
  totalPrevMonth: 35.80,
  byProject: [
    { id: 1, name: "Modernizare fabrică CNC", firma: "SC CONSTRUCT NORD SRL", solomon: { calls: 48, tokens: 285000, cost: 12.40 }, neemia: { pages: 14, cost: 3.20 }, ocr: { pages: 62, cost: 0.62 }, ghid: { fixed: 0.04, interpreted: 0.25, cost: 0.29 }, total: 16.51 },
    { id: 2, name: "Extindere capacitate depozitare", firma: "AGRO INVEST SRL", solomon: { calls: 32, tokens: 190000, cost: 8.50 }, neemia: { pages: 8, cost: 1.80 }, ocr: { pages: 45, cost: 0.45 }, ghid: { fixed: 0.04, interpreted: 0.25, cost: 0.29 }, total: 11.04 },
    { id: 3, name: "Digitalizare procese interne", firma: "TECH SOLUTIONS SA", solomon: { calls: 22, tokens: 140000, cost: 6.20 }, neemia: { pages: 18, cost: 4.10 }, ocr: { pages: 48, cost: 0.48 }, ghid: { fixed: 0.04, interpreted: 0.25, cost: 0.29 }, total: 11.07 },
    { id: 4, name: "Panouri fotovoltaice 150kW", firma: "GREEN ENERGY SRL", solomon: { calls: 8, tokens: 45000, cost: 1.90 }, neemia: { pages: 0, cost: 0 }, ocr: { pages: 30, cost: 0.30 }, ghid: { fixed: 0.04, interpreted: 0, cost: 0.04 }, total: 2.24 },
    { id: 5, name: "Echipamente brutărie artizanală", firma: "PÂINE & TRADIȚIE SRL", solomon: { calls: 5, tokens: 22000, cost: 0.80 }, neemia: { pages: 3, cost: 0.44 }, ocr: { pages: 18, cost: 0.18 }, ghid: { fixed: 0.02, interpreted: 0, cost: 0.02 }, total: 1.44 },
  ],
  daily: [
    { date: "1 mar", cost: 2.10 }, { date: "2 mar", cost: 3.40 }, { date: "3 mar", cost: 1.80 },
    { date: "4 mar", cost: 5.20 }, { date: "5 mar", cost: 4.60 }, { date: "6 mar", cost: 8.90 },
  ],
  byAgent: { solomon: 29.80, neemia: 9.54, ocr: 2.03, ghid: 0.93 },
};

const AUDIT_ICONS = { create: "➕", upload: "📤", sync: "🔄", template: "📝", user: "👤", check: "✓", billing: "💳", config: "⚙️", submit: "🚀" };

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState("users");
  const [selectedUser, setSelectedUser] = useState(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("consultant");
  const [auditFilter, setAuditFilter] = useState("all");

  const selUser = USERS.find(u => u.id === selectedUser);

  const TABS = [
    { id: "users", icon: "👥", label: "Utilizatori", count: USERS.length },
    { id: "costs", icon: "💰", label: "Audit AI / Costuri" },
    { id: "audit", icon: "📋", label: "Jurnal activitate", count: AUDIT_LOG.length },
  ];

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

        /* Tabs */
        .admin-tabs{display:flex;border-bottom:1px solid var(--border);padding:0 28px;background:var(--bg-surface);flex-shrink:0}
        .admin-tab{padding:12px 20px;font-size:13px;font-weight:600;color:var(--text-secondary);cursor:pointer;border-bottom:2px solid transparent;transition:all .15s;font-family:var(--font-sans);background:none;border-top:none;border-left:none;border-right:none;display:flex;align-items:center;gap:8px}
        .admin-tab:hover{color:var(--text-primary)}.admin-tab.on{color:var(--accent-blue);border-bottom-color:var(--accent-blue)}
        .admin-tab .tab-count{font-size:11px;font-family:var(--font-mono);background:var(--bg-elevated);padding:1px 7px;border-radius:8px;color:var(--text-muted)}

        .admin-content{flex:1;overflow-y:auto;padding:28px}

        /* ─── USERS ─── */
        .users-header{display:flex;align-items:center;gap:12px;margin-bottom:20px}
        .users-title{font-size:16px;font-weight:700;flex:1}
        .btn-invite{padding:8px 18px;border-radius:var(--r-md);border:none;background:var(--accent-blue);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font-sans);display:flex;align-items:center;gap:6px;box-shadow:0 2px 12px rgba(77,139,255,.25);transition:all .15s}
        .btn-invite:hover{background:#5d9bff}

        .user-card{display:flex;align-items:center;gap:16px;padding:16px 20px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-surface);margin-bottom:8px;cursor:pointer;transition:all .15s}
        .user-card:hover{border-color:var(--border-active);background:var(--bg-elevated)}
        .user-card.active{border-color:var(--accent-blue);background:rgba(77,139,255,.04)}
        .u-avatar{width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:#fff;flex-shrink:0}
        .u-info{flex:1;min-width:0}
        .u-name{font-size:14px;font-weight:700;display:flex;align-items:center;gap:8px}
        .u-email{font-size:12px;color:var(--text-muted);font-family:var(--font-mono)}
        .u-meta{display:flex;gap:12px;margin-top:3px;font-size:11px;color:var(--text-muted)}
        .u-right{text-align:right;flex-shrink:0}
        .u-projects{font-size:18px;font-weight:800;font-family:var(--font-mono)}
        .u-projects-label{font-size:10px;color:var(--text-muted)}
        .u-last{font-size:11px;color:var(--text-muted);font-family:var(--font-mono);margin-top:4px}

        .badge{font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px}
        .badge-status{font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px}
        .badge-status.activ{background:rgba(52,211,153,.12);color:var(--accent-green)}
        .badge-status.invitat{background:rgba(251,191,36,.12);color:var(--accent-yellow)}

        /* User detail */
        .u-detail{padding:20px;border-radius:var(--r-md);border:1px solid var(--accent-blue);background:rgba(77,139,255,.03);margin-top:16px}
        .ud-name{font-size:18px;font-weight:800;margin-bottom:4px}
        .ud-email{font-size:13px;font-family:var(--font-mono);color:var(--text-secondary);margin-bottom:12px}
        .ud-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px}
        .ud-cell{padding:10px 12px;background:var(--bg-deep);border-radius:var(--r-sm);border:1px solid var(--border)}
        .ud-cell-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:2px}
        .ud-cell-value{font-size:13px;font-weight:600}
        .ud-perms-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin-bottom:8px}
        .ud-perms{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}
        .ud-perm{font-size:11px;padding:4px 10px;border-radius:var(--r-sm);background:var(--bg-elevated);border:1px solid var(--border);color:var(--text-secondary)}
        .ud-actions{display:flex;gap:8px}
        .ud-btn{padding:8px 16px;border-radius:var(--r-sm);border:1px solid var(--border);background:transparent;color:var(--text-secondary);font-size:12px;font-weight:600;cursor:pointer;font-family:var(--font-sans);transition:all .15s;display:flex;align-items:center;gap:4px}
        .ud-btn:hover{border-color:var(--border-active);color:var(--text-primary);background:var(--bg-hover)}
        .ud-btn.danger{color:var(--accent-red);border-color:rgba(248,113,113,.25)}.ud-btn.danger:hover{background:rgba(248,113,113,.06)}

        /* ─── COST AUDIT ─── */
        .cost-card{padding:16px 18px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-surface)}
        .cc-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--text-muted);margin-bottom:6px}
        .cc-value{font-size:28px;font-weight:800;font-family:var(--font-mono);color:var(--text-primary);letter-spacing:-1px}
        .cc-change{font-size:12px;font-weight:600;margin-top:4px}
        .cc-change.up{color:var(--accent-red)}
        .cc-change.down{color:var(--accent-green)}
        .cc-pct{font-size:12px;color:var(--text-muted);margin-top:4px}

        .cost-table-wrap{border:1px solid var(--border);border-radius:var(--r-md);overflow:hidden;background:var(--bg-surface)}
        .cost-table{width:100%;border-collapse:collapse;font-size:12px}
        .cost-table th{padding:10px 14px;font-weight:700;color:var(--text-muted);border-bottom:1px solid var(--border);font-size:10px;text-transform:uppercase;letter-spacing:.5px;text-align:center}
        .cost-table td{padding:10px 14px;border-bottom:1px solid rgba(42,48,64,.5);font-family:var(--font-mono);color:var(--text-secondary);text-align:center}
        .cost-table tbody tr{transition:background .12s;cursor:pointer}
        .cost-table tbody tr:hover{background:var(--bg-hover)}
        .cost-table tfoot td{border-top:2px solid var(--accent-blue);border-bottom:none;color:var(--text-primary)}
        .cost-total{font-weight:800;color:var(--accent-yellow);font-size:14px}

        /* ─── AUDIT LOG ─── */
        .audit-toolbar{display:flex;align-items:center;gap:10px;margin-bottom:16px}
        .audit-title{font-size:16px;font-weight:700;flex:1}
        .pill-group{display:flex;background:var(--bg-deep);border-radius:var(--r-md);padding:2px;gap:1px}
        .pill{padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;border:none;cursor:pointer;background:transparent;color:var(--text-muted);font-family:var(--font-sans);transition:all .15s}
        .pill:hover{color:var(--text-secondary)}.pill.on{background:var(--accent-blue);color:#fff}

        .audit-list{display:flex;flex-direction:column;gap:2px}
        .audit-item{display:flex;align-items:flex-start;gap:12px;padding:12px 16px;border-radius:var(--r-sm);transition:background .12s}
        .audit-item:hover{background:var(--bg-surface)}
        .audit-icon{width:32px;height:32px;border-radius:var(--r-sm);background:var(--bg-elevated);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0}
        .audit-body{flex:1;min-width:0}
        .audit-action{font-size:13px;font-weight:600;margin-bottom:1px}
        .audit-detail{font-size:12px;color:var(--text-secondary)}
        .audit-meta{display:flex;gap:8px;font-size:11px;color:var(--text-muted);margin-top:2px}

        /* Invite modal */
        .overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;animation:fadeIn .2s}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        .modal{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r-lg);width:460px;padding:28px;animation:slideUp .3s ease}
        @keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        .modal-title{font-size:20px;font-weight:800;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center}
        .modal-close{background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:18px}.modal-close:hover{color:var(--text-primary)}
        .modal-sub{font-size:14px;color:var(--text-secondary);margin-bottom:20px}
        .fg{margin-bottom:16px}
        .fl{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.7px;color:var(--text-muted);margin-bottom:6px}
        .fi{width:100%;padding:10px 14px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-deep);color:var(--text-primary);font-size:14px;font-family:var(--font-sans);outline:none}
        .fi:focus{border-color:var(--accent-blue)}.fi::placeholder{color:var(--text-muted)}
        .role-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
        .role-option{padding:12px 10px;border-radius:var(--r-sm);border:2px solid var(--border);background:var(--bg-elevated);cursor:pointer;text-align:center;transition:all .15s}
        .role-option:hover{border-color:var(--border-active)}.role-option.on{border-color:var(--accent-blue);background:rgba(77,139,255,.04)}
        .role-option .ro-label{font-size:13px;font-weight:700;margin-bottom:2px}
        .role-option .ro-desc{font-size:10px;color:var(--text-muted);line-height:1.3}
        .btn-row{display:flex;gap:10px;justify-content:flex-end;margin-top:16px}
        .btn-p{padding:10px 20px;border-radius:var(--r-md);border:none;background:var(--accent-blue);color:#fff;font-size:14px;font-weight:700;font-family:var(--font-sans);cursor:pointer}.btn-p:hover{background:#5d9bff}.btn-p:disabled{opacity:.4;cursor:not-allowed}
        .btn-s{padding:10px 20px;border-radius:var(--r-md);border:1px solid var(--border);background:transparent;color:var(--text-secondary);font-size:14px;font-weight:600;font-family:var(--font-sans);cursor:pointer}.btn-s:hover{border-color:var(--border-active);color:var(--text-primary)}

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
            <div className="sb-item"><span className="sb-icon">💼</span><span>Proiecte</span></div>
            <div className="sb-section">Configurare</div>
            <div className="sb-item"><span className="sb-icon">🛠</span><span>Configurări</span></div>
            <div className="sb-section">Sistem</div>
            <div className="sb-item active"><span className="sb-icon">⚙️</span><span>Admin</span></div>
          </div>
          <div className="sb-footer"><div className="sb-avatar">IP</div><div><div className="sb-user-name">Ion Popescu</div><div className="sb-user-role">Administrator</div></div></div>
        </div>

        <div className="main">
          <div className="topbar"><div className="tb-title">Administrare</div></div>

          <div className="admin-tabs">
            {TABS.map(t => (
              <button key={t.id} className={`admin-tab ${activeTab === t.id ? "on" : ""}`} onClick={() => setActiveTab(t.id)}>
                {t.icon} {t.label}
                {t.count && <span className="tab-count">{t.count}</span>}
              </button>
            ))}
          </div>

          <div className="admin-content">
            {/* ═══ UTILIZATORI ═══ */}
            {activeTab === "users" && (<>
              <div className="users-header">
                <div className="users-title">Echipă — {USERS.length} utilizatori</div>
                <button className="btn-invite" onClick={() => { setShowInvite(true); setInviteEmail(""); setInviteRole("consultant"); }}>
                  + Invită consultant
                </button>
              </div>

              {USERS.map(u => {
                const role = ROLES[u.role];
                const isActive = selectedUser === u.id;
                const avatarColors = { admin: "#a78bfa", consultant: "#4d8bff", viewer: "#34d399" };
                return (
                  <div key={u.id}>
                    <div className={`user-card ${isActive ? "active" : ""}`} onClick={() => setSelectedUser(isActive ? null : u.id)}>
                      <div className="u-avatar" style={{ background: avatarColors[u.role] }}>{u.avatar}</div>
                      <div className="u-info">
                        <div className="u-name">
                          {u.name}
                          <span className="badge" style={{ background: role.bg, color: role.color }}>{role.label}</span>
                          <span className={`badge-status ${u.status}`}>{u.status}</span>
                        </div>
                        <div className="u-email">{u.email}</div>
                        <div className="u-meta">
                          <span>Adăugat: {u.created}</span>
                        </div>
                      </div>
                      <div className="u-right">
                        <div className="u-projects">{u.projects}</div>
                        <div className="u-projects-label">proiecte</div>
                        <div className="u-last">{u.lastActive}</div>
                      </div>
                    </div>

                    {isActive && (
                      <div className="u-detail">
                        <div className="ud-name">{u.name}</div>
                        <div className="ud-email">{u.email}</div>
                        <div className="ud-grid">
                          <div className="ud-cell">
                            <div className="ud-cell-label">Rol</div>
                            <div className="ud-cell-value" style={{ color: role.color }}>{role.label}</div>
                          </div>
                          <div className="ud-cell">
                            <div className="ud-cell-label">Proiecte active</div>
                            <div className="ud-cell-value">{u.projects}</div>
                          </div>
                          <div className="ud-cell">
                            <div className="ud-cell-label">Ultima activitate</div>
                            <div className="ud-cell-value" style={{ fontSize: 12 }}>{u.lastActive}</div>
                          </div>
                        </div>
                        <div className="ud-perms-title">Permisiuni ({role.label})</div>
                        <div className="ud-perms">
                          {role.perms.map((p, i) => <span key={i} className="ud-perm">{p}</span>)}
                        </div>
                        <div className="ud-actions">
                          <button className="ud-btn">✏️ Schimbă rol</button>
                          <button className="ud-btn">📧 Retrimite invitație</button>
                          {u.role !== "admin" && <button className="ud-btn danger">🚫 Dezactivează</button>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </>)}

            {/* ═══ AUDIT AI / COSTURI ═══ */}
            {activeTab === "costs" && (<>
              {/* Summary cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
                <div className="cost-card">
                  <div className="cc-label">Total luna curentă</div>
                  <div className="cc-value">${AI_COSTS.totalMonth.toFixed(2)}</div>
                  <div className="cc-change up">↑ ${(AI_COSTS.totalMonth - AI_COSTS.totalPrevMonth).toFixed(2)} vs. luna trecută</div>
                </div>
                <div className="cost-card">
                  <div className="cc-label">Solomon (Chat AI)</div>
                  <div className="cc-value">${AI_COSTS.byAgent.solomon.toFixed(2)}</div>
                  <div className="cc-pct">{Math.round((AI_COSTS.byAgent.solomon / AI_COSTS.totalMonth) * 100)}% din total</div>
                </div>
                <div className="cost-card">
                  <div className="cc-label">Neemia (Template)</div>
                  <div className="cc-value">${AI_COSTS.byAgent.neemia.toFixed(2)}</div>
                  <div className="cc-pct">{Math.round((AI_COSTS.byAgent.neemia / AI_COSTS.totalMonth) * 100)}% din total</div>
                </div>
                <div className="cost-card">
                  <div className="cc-label">OCR + Ghid Reguli</div>
                  <div className="cc-value">${(AI_COSTS.byAgent.ocr + AI_COSTS.byAgent.ghid).toFixed(2)}</div>
                  <div className="cc-pct">{Math.round(((AI_COSTS.byAgent.ocr + AI_COSTS.byAgent.ghid) / AI_COSTS.totalMonth) * 100)}% din total</div>
                </div>
              </div>

              {/* Distribution bar */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".8px", color: "var(--text-muted)", marginBottom: 8 }}>Distribuție cost per agent</div>
                <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", background: "var(--bg-deep)" }}>
                  <div style={{ width: `${(AI_COSTS.byAgent.solomon / AI_COSTS.totalMonth) * 100}%`, background: "#4d8bff", transition: "width .4s" }} title="Solomon" />
                  <div style={{ width: `${(AI_COSTS.byAgent.neemia / AI_COSTS.totalMonth) * 100}%`, background: "#a78bfa", transition: "width .4s" }} title="Neemia" />
                  <div style={{ width: `${(AI_COSTS.byAgent.ocr / AI_COSTS.totalMonth) * 100}%`, background: "#fb923c", transition: "width .4s" }} title="OCR" />
                  <div style={{ width: `${(AI_COSTS.byAgent.ghid / AI_COSTS.totalMonth) * 100}%`, background: "#fbbf24", transition: "width .4s" }} title="Ghid" />
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 11, color: "var(--text-muted)" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4d8bff", display: "inline-block" }} /> Solomon</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#a78bfa", display: "inline-block" }} /> Neemia</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#fb923c", display: "inline-block" }} /> OCR</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#fbbf24", display: "inline-block" }} /> Ghid Reguli</span>
                </div>
              </div>

              {/* Daily chart (simplified) */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".8px", color: "var(--text-muted)", marginBottom: 10 }}>Evoluție zilnică (Martie 2026)</div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80, padding: "0 4px" }}>
                  {AI_COSTS.daily.map((d, i) => {
                    const maxCost = Math.max(...AI_COSTS.daily.map(x => x.cost));
                    const h = (d.cost / maxCost) * 100;
                    return (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                        <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>${d.cost}</span>
                        <div style={{ width: "100%", height: `${h}%`, minHeight: 4, background: "var(--accent-blue)", borderRadius: "4px 4px 0 0", transition: "height .3s" }} />
                        <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{d.date}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Per project table */}
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".8px", color: "var(--text-muted)", marginBottom: 10 }}>Cost detaliat per proiect</div>
              <div className="cost-table-wrap">
                <table className="cost-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Proiect / Firmă</th>
                      <th>🤖 Solomon</th>
                      <th>📝 Neemia</th>
                      <th>👁 OCR</th>
                      <th>📖 Ghid</th>
                      <th>TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {AI_COSTS.byProject.sort((a, b) => b.total - a.total).map(p => (
                      <tr key={p.id}>
                        <td style={{ textAlign: "left" }}>
                          <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{p.firma}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>${p.solomon.cost.toFixed(2)}</div>
                          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{p.solomon.calls} apeluri</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>${p.neemia.cost.toFixed(2)}</div>
                          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{p.neemia.pages} pag.</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>${p.ocr.cost.toFixed(2)}</div>
                          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{p.ocr.pages} pag.</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>${p.ghid.cost.toFixed(2)}</div>
                        </td>
                        <td className="cost-total">${p.total.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ textAlign: "left", fontWeight: 700 }}>TOTAL</td>
                      <td style={{ fontWeight: 700 }}>${AI_COSTS.byAgent.solomon.toFixed(2)}</td>
                      <td style={{ fontWeight: 700 }}>${AI_COSTS.byAgent.neemia.toFixed(2)}</td>
                      <td style={{ fontWeight: 700 }}>${AI_COSTS.byAgent.ocr.toFixed(2)}</td>
                      <td style={{ fontWeight: 700 }}>${AI_COSTS.byAgent.ghid.toFixed(2)}</td>
                      <td className="cost-total" style={{ fontSize: 16 }}>${AI_COSTS.totalMonth.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>)}

            {/* ═══ JURNAL ACTIVITATE ═══ */}
            {activeTab === "audit" && (<>
              <div className="audit-toolbar">
                <div className="audit-title">Jurnal activitate</div>
                <div className="pill-group">
                  <button className={`pill ${auditFilter === "all" ? "on" : ""}`} onClick={() => setAuditFilter("all")}>Toate</button>
                  <button className={`pill ${auditFilter === "create" ? "on" : ""}`} onClick={() => setAuditFilter("create")}>Creare</button>
                  <button className={`pill ${auditFilter === "upload" ? "on" : ""}`} onClick={() => setAuditFilter("upload")}>Upload</button>
                  <button className={`pill ${auditFilter === "user" ? "on" : ""}`} onClick={() => setAuditFilter("user")}>Utilizatori</button>
                  <button className={`pill ${auditFilter === "config" ? "on" : ""}`} onClick={() => setAuditFilter("config")}>Config</button>
                </div>
              </div>

              <div className="audit-list">
                {AUDIT_LOG.filter(a => auditFilter === "all" || a.type === auditFilter).map((a, i) => (
                  <div className="audit-item" key={i}>
                    <div className="audit-icon">{AUDIT_ICONS[a.type] || "📋"}</div>
                    <div className="audit-body">
                      <div className="audit-action">{a.action}</div>
                      <div className="audit-detail">{a.detail}</div>
                      <div className="audit-meta">
                        <span>👤 {a.user}</span>
                        <span>🕐 {a.time}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>)}
          </div>
        </div>

        {/* ═══ INVITE MODAL ═══ */}
        {showInvite && (
          <div className="overlay" onClick={e => e.target === e.currentTarget && setShowInvite(false)}>
            <div className="modal">
              <div className="modal-title">Invită consultant <button className="modal-close" onClick={() => setShowInvite(false)}>✕</button></div>
              <div className="modal-sub">Trimite o invitație pe email. Consultantul va primi un link de activare cont.</div>

              <div className="fg">
                <label className="fl">Email</label>
                <input className="fi" type="email" placeholder="consultant.nou@firma.ro" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
              </div>

              <div className="fg">
                <label className="fl">Rol</label>
                <div className="role-grid">
                  {Object.entries(ROLES).map(([key, role]) => (
                    <div key={key} className={`role-option ${inviteRole === key ? "on" : ""}`} onClick={() => setInviteRole(key)}>
                      <div className="ro-label" style={{ color: role.color }}>{role.label}</div>
                      <div className="ro-desc">{role.perms.slice(0, 2).join(", ")}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="btn-row">
                <button className="btn-s" onClick={() => setShowInvite(false)}>Anulează</button>
                <button className="btn-p" disabled={!inviteEmail.includes("@")} onClick={() => { setShowInvite(false); alert("Invitație trimisă! (demo)"); }}>
                  📧 Trimite invitație
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
