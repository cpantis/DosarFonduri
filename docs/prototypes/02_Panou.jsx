import { useState } from "react";

/* ─── MOCK DATA ─── */
const STATS = [
  { label: "Proiecte active", value: "12", change: "+3", trend: "up", icon: "📁" },
  { label: "Firme gestionate", value: "8", change: "+1", trend: "up", icon: "🏢" },
  { label: "Documente generate", value: "47", change: "+12", trend: "up", icon: "📄" },
  { label: "Rată de aprobare", value: "92%", change: "+3%", trend: "up", icon: "🏆" },
];

const RECENT_PROJECTS = [
  { id: 1, name: "Modernizare fabrică CNC", firma: "SC CONSTRUCT NORD SRL", program: "AFIR sM 4.1", status: "in_progress", eligibility: 12, eligTotal: 13, elements: 14, elemTotal: 18, docs: 5, docsTotal: 17, updated: "Acum 12 min" },
  { id: 2, name: "Extindere capacitate depozitare", firma: "AGRO INVEST SRL", program: "PNDR 6.1", status: "in_progress", eligibility: 10, eligTotal: 10, elements: 8, elemTotal: 22, docs: 3, docsTotal: 15, updated: "Acum 2 ore" },
  { id: 3, name: "Digitalizare procese interne", firma: "TECH SOLUTIONS SA", program: "PNRR C7", status: "review", eligibility: 9, eligTotal: 11, elements: 20, elemTotal: 20, docs: 14, docsTotal: 14, updated: "Ieri, 16:30" },
  { id: 4, name: "Panouri fotovoltaice 150kW", firma: "GREEN ENERGY SRL", program: "AFM Fotovoltaice", status: "draft", eligibility: 0, eligTotal: 8, elements: 3, elemTotal: 16, docs: 0, docsTotal: 12, updated: "Ieri, 09:15" },
  { id: 5, name: "Echipamente brutărie artizanală", firma: "PÂINE & TRADIȚIE SRL", program: "AFIR sM 4.2", status: "submitted", eligibility: 11, eligTotal: 11, elements: 18, elemTotal: 18, docs: 16, docsTotal: 16, updated: "3 mar 2026" },
];

const ACTIVITY_FEED = [
  { time: "12:45", text: "Solomon a extras 3 elemente noi din documentul uploadat", project: "Modernizare fabrică CNC", type: "ai" },
  { time: "12:30", text: "Neemia a completat Cererea de Finanțare (pag. 1-3)", project: "Modernizare fabrică CNC", type: "ai" },
  { time: "11:15", text: "Verificare eligibilitate finalizată — 12/13 trecute", project: "Modernizare fabrică CNC", type: "check" },
  { time: "10:02", text: "Date ONRC actualizate automat pentru AGRO INVEST SRL", project: "Extindere capacitate depozitare", type: "sync" },
  { time: "09:40", text: "Proiect marcat ca finalizat și trimis la verificare", project: "Digitalizare procese interne", type: "done" },
  { time: "Ieri", text: "Proiect nou creat: Panouri fotovoltaice 150kW", project: "Panouri fotovoltaice 150kW", type: "new" },
  { time: "Ieri", text: "Ghid finanțare procesat — 24 reguli extrase (18 fixe, 6 interpretate)", project: "Extindere capacitate depozitare", type: "ai" },
];

const DEADLINES = [
  { date: "12 Mar", project: "Modernizare fabrică CNC", event: "Termen depunere sesiune 1", urgent: true },
  { date: "28 Mar", project: "Extindere capacitate depozitare", event: "Termen clarificări AFIR", urgent: false },
  { date: "15 Apr", project: "Panouri fotovoltaice 150kW", event: "Deschidere sesiune AFM", urgent: false },
];

const STATUS_MAP = {
  draft: { label: "Ciornă", color: "var(--text-muted)", bg: "rgba(90,100,120,0.12)" },
  in_progress: { label: "În lucru", color: "var(--accent-blue)", bg: "rgba(77,139,255,0.12)" },
  review: { label: "Verificare", color: "var(--accent-yellow)", bg: "rgba(251,191,36,0.12)" },
  submitted: { label: "Depus", color: "var(--accent-green)", bg: "rgba(52,211,153,0.12)" },
};

export default function PanouDashboard() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const pct = (a, b) => b > 0 ? Math.round((a / b) * 100) : 0;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&family=JetBrains+Mono:wght@400;500&display=swap');
        *{margin:0;padding:0;box-sizing:border-box}
        :root{--bg-deep:#0a0c10;--bg-surface:#12151c;--bg-elevated:#1a1e28;--bg-hover:#222838;--border:#2a3040;--border-active:#3d4760;--text-primary:#e8ecf4;--text-secondary:#8892a8;--text-muted:#5a6478;--accent-blue:#4d8bff;--accent-green:#34d399;--accent-green-dim:rgba(52,211,153,0.12);--accent-red:#f87171;--accent-red-dim:rgba(248,113,113,0.12);--accent-yellow:#fbbf24;--accent-yellow-dim:rgba(251,191,36,0.12);--accent-purple:#a78bfa;--accent-orange:#fb923c;--font-sans:'DM Sans',system-ui,sans-serif;--font-mono:'JetBrains Mono',monospace;--r-sm:6px;--r-md:10px;--r-lg:14px}
        body{font-family:var(--font-sans);background:var(--bg-deep);color:var(--text-primary)}

        /* ─── APP SHELL ─── */
        .app{display:flex;height:100vh;overflow:hidden}
        .sidebar{width:240px;min-width:240px;background:var(--bg-surface);border-right:1px solid var(--border);display:flex;flex-direction:column;transition:width .2s,min-width .2s}
        .sidebar.collapsed{width:64px;min-width:64px}
        .sb-logo{padding:20px 16px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--border)}
        .sb-logo-icon{width:36px;height:36px;border-radius:10px;background:var(--accent-blue);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:#fff;flex-shrink:0;box-shadow:0 2px 12px rgba(77,139,255,.25)}
        .sb-logo-text{font-size:17px;font-weight:800;letter-spacing:-.3px;white-space:nowrap;overflow:hidden}
        .sidebar.collapsed .sb-logo-text{display:none}
        .sb-nav{flex:1;padding:12px 8px;overflow-y:auto}
        .sb-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:var(--r-sm);cursor:pointer;font-size:14px;font-weight:500;color:var(--text-secondary);transition:all .15s;margin-bottom:2px;white-space:nowrap;overflow:hidden}
        .sb-item:hover{background:var(--bg-hover);color:var(--text-primary)}
        .sb-item.active{background:rgba(77,139,255,.1);color:var(--accent-blue);font-weight:600}
        .sb-item .sb-icon{width:20px;text-align:center;font-size:16px;flex-shrink:0}
        .sidebar.collapsed .sb-item span:not(.sb-icon){display:none}
        .sb-section{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);padding:16px 12px 6px;white-space:nowrap;overflow:hidden}
        .sidebar.collapsed .sb-section{display:none}
        .sb-footer{padding:12px;border-top:1px solid var(--border);display:flex;align-items:center;gap:10px}
        .sb-avatar{width:32px;height:32px;border-radius:50%;background:var(--accent-purple);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0}
        .sb-user{overflow:hidden;white-space:nowrap}
        .sb-user-name{font-size:13px;font-weight:600;color:var(--text-primary)}
        .sb-user-role{font-size:11px;color:var(--text-muted)}
        .sidebar.collapsed .sb-user{display:none}

        /* ─── MAIN ─── */
        .main{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}
        .topbar{padding:14px 28px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:16px;background:var(--bg-surface);flex-shrink:0}
        .tb-toggle{background:none;border:1px solid var(--border);border-radius:var(--r-sm);width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text-muted);transition:all .15s;font-size:14px}
        .tb-toggle:hover{border-color:var(--border-active);color:var(--text-primary)}
        .tb-title{font-size:20px;font-weight:800;letter-spacing:-.3px;flex:1}
        .tb-firma{display:flex;align-items:center;gap:8px;padding:6px 14px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-elevated);font-size:13px;color:var(--text-secondary);cursor:pointer;transition:all .15s}
        .tb-firma:hover{border-color:var(--border-active);color:var(--text-primary)}
        .tb-firma .firma-name{font-weight:600;color:var(--text-primary)}
        .tb-notif{width:36px;height:36px;border-radius:50%;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;cursor:pointer;position:relative;font-size:15px;transition:all .15s}
        .tb-notif:hover{border-color:var(--border-active);background:var(--bg-hover)}
        .notif-dot{position:absolute;top:6px;right:6px;width:8px;height:8px;border-radius:50%;background:var(--accent-red);border:2px solid var(--bg-surface)}

        .dash{flex:1;overflow-y:auto;padding:28px}

        /* ─── STAT CARDS ─── */
        .stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:28px}
        .stat-card{padding:20px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-surface);transition:all .2s}
        .stat-card:hover{border-color:var(--border-active);transform:translateY(-1px)}
        .stat-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
        .stat-icon{width:36px;height:36px;border-radius:var(--r-sm);background:var(--bg-elevated);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:17px}
        .stat-change{font-size:12px;font-weight:600;font-family:var(--font-mono);color:var(--accent-green);display:flex;align-items:center;gap:3px}
        .stat-val{font-size:32px;font-weight:800;font-family:var(--font-mono);letter-spacing:-1px;line-height:1}
        .stat-label{font-size:13px;color:var(--text-secondary);margin-top:4px}

        /* ─── CONTENT GRID ─── */
        .dash-grid{display:grid;grid-template-columns:1fr 360px;gap:24px}
        .dash-left{min-width:0}

        /* ─── PROJECTS TABLE ─── */
        .section-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
        .section-title{font-size:16px;font-weight:700;display:flex;align-items:center;gap:8px}
        .section-action{font-size:13px;color:var(--accent-blue);font-weight:600;cursor:pointer}
        .section-action:hover{color:#6da3ff}
        .proj-table{width:100%;border:1px solid var(--border);border-radius:var(--r-md);overflow:hidden;background:var(--bg-surface)}
        .proj-row{display:grid;grid-template-columns:1fr 140px 100px 100px 100px 90px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--border);transition:background .12s;cursor:pointer}
        .proj-row:last-child{border-bottom:none}
        .proj-row:hover{background:var(--bg-hover)}
        .proj-row.header{background:var(--bg-elevated);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--text-muted);cursor:default}
        .proj-row.header:hover{background:var(--bg-elevated)}
        .proj-name{font-size:14px;font-weight:600;margin-bottom:2px}
        .proj-firma{font-size:12px;color:var(--text-muted)}
        .proj-program{font-size:12px;color:var(--text-secondary);font-family:var(--font-mono)}
        .status-badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700}
        .mini-bar{height:4px;border-radius:2px;background:var(--bg-deep);overflow:hidden;width:100%}
        .mini-bar-fill{height:100%;border-radius:2px;transition:width .4s}
        .mini-pct{font-size:11px;font-family:var(--font-mono);font-weight:600;color:var(--text-secondary);margin-top:2px}
        .proj-time{font-size:12px;color:var(--text-muted)}

        /* ─── RIGHT SIDEBAR ─── */
        .dash-right{display:flex;flex-direction:column;gap:20px}

        /* Activity Feed */
        .feed-card{border:1px solid var(--border);border-radius:var(--r-md);background:var(--bg-surface);overflow:hidden}
        .feed-header{padding:14px 16px;border-bottom:1px solid var(--border);font-size:14px;font-weight:700;display:flex;align-items:center;gap:8px}
        .feed-scroll{max-height:340px;overflow-y:auto}
        .feed-item{padding:10px 16px;border-bottom:1px solid rgba(42,48,64,.5);transition:background .12s}
        .feed-item:hover{background:var(--bg-hover)}
        .feed-item:last-child{border-bottom:none}
        .feed-time{font-size:11px;font-family:var(--font-mono);color:var(--text-muted);margin-bottom:2px;display:flex;align-items:center;gap:6px}
        .feed-type{width:6px;height:6px;border-radius:50%;flex-shrink:0}
        .feed-type.ai{background:var(--accent-blue)}
        .feed-type.check{background:var(--accent-green)}
        .feed-type.sync{background:var(--accent-purple)}
        .feed-type.done{background:var(--accent-green)}
        .feed-type.new{background:var(--accent-yellow)}
        .feed-text{font-size:13px;color:var(--text-secondary);line-height:1.4}
        .feed-proj{font-size:11px;color:var(--text-muted);margin-top:2px}

        /* Deadlines */
        .deadline-item{display:flex;gap:12px;padding:10px 16px;border-bottom:1px solid rgba(42,48,64,.5)}
        .deadline-item:last-child{border-bottom:none}
        .dl-date{min-width:56px;font-size:13px;font-weight:700;font-family:var(--font-mono);color:var(--text-secondary)}
        .dl-date.urgent{color:var(--accent-red)}
        .dl-info{flex:1}
        .dl-event{font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:2px}
        .dl-proj{font-size:12px;color:var(--text-muted)}

        /* Quick Actions */
        .quick-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px 16px}
        .quick-btn{padding:12px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--bg-elevated);cursor:pointer;transition:all .15s;text-align:center;font-family:var(--font-sans)}
        .quick-btn:hover{border-color:var(--accent-blue);background:rgba(77,139,255,.04)}
        .quick-btn .qb-icon{font-size:20px;margin-bottom:4px}
        .quick-btn .qb-label{font-size:12px;font-weight:600;color:var(--text-secondary)}

        /* ─── SCROLLBAR ─── */
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}

        @media(max-width:1200px){.dash-grid{grid-template-columns:1fr}.dash-right{display:none}.stats-row{grid-template-columns:repeat(2,1fr)}}
        @media(max-width:768px){.stats-row{grid-template-columns:1fr}.proj-row{grid-template-columns:1fr;gap:6px}.proj-row.header{display:none}}
      `}</style>

      <div className="app">
        {/* ─── SIDEBAR ─── */}
        <div className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
          <div className="sb-logo">
            <div className="sb-logo-icon">DF</div>
            <div className="sb-logo-text">DosarFonduri</div>
          </div>
          <div className="sb-nav">
            <div className="sb-section">Principal</div>
            <div className="sb-item active"><span className="sb-icon">📊</span><span>Panou</span></div>
            <div className="sb-item"><span className="sb-icon">🏢</span><span>Firme</span></div>
            <div className="sb-item"><span className="sb-icon">📃</span><span>Documente</span></div>
            <div className="sb-item"><span className="sb-icon">💼</span><span>Proiecte</span></div>
            <div className="sb-section">Configurare</div>
            <div className="sb-item"><span className="sb-icon">🛠</span><span>Configurări</span></div>
            <div className="sb-section">Sistem</div>
            <div className="sb-item"><span className="sb-icon">⚙️</span><span>Admin</span></div>
          </div>
          <div className="sb-footer">
            <div className="sb-avatar">IP</div>
            <div className="sb-user">
              <div className="sb-user-name">Ion Popescu</div>
              <div className="sb-user-role">Administrator</div>
            </div>
          </div>
        </div>

        {/* ─── MAIN ─── */}
        <div className="main">
          <div className="topbar">
            <button className="tb-toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
              {sidebarCollapsed ? "→" : "←"}
            </button>
            <div className="tb-title">Panou</div>
            <div className="tb-firma">
              <span>🏢</span>
              <span className="firma-name">EXPERT CONSULTING SRL</span>
              <span style={{ color: "var(--text-muted)" }}>▾</span>
            </div>
            <div className="tb-notif">
              🔔
              <div className="notif-dot" />
            </div>
          </div>

          <div className="dash">
            {/* ─── STATS ─── */}
            <div className="stats-row">
              {STATS.map((s, i) => (
                <div className="stat-card" key={i}>
                  <div className="stat-top">
                    <div className="stat-icon">{s.icon}</div>
                    <div className="stat-change">↑ {s.change}</div>
                  </div>
                  <div className="stat-val">{s.value}</div>
                  <div className="stat-label">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="dash-grid">
              {/* ─── LEFT: PROJECTS ─── */}
              <div className="dash-left">
                <div className="section-header">
                  <div className="section-title">📁 Proiecte recente</div>
                  <div className="section-action">Vezi toate →</div>
                </div>
                <div className="proj-table">
                  <div className="proj-row header">
                    <div>Proiect / Firmă</div>
                    <div>Program</div>
                    <div>Status</div>
                    <div>Eligibilitate</div>
                    <div>Elemente</div>
                    <div>Actualizat</div>
                  </div>
                  {RECENT_PROJECTS.map(p => {
                    const st = STATUS_MAP[p.status];
                    return (
                      <div className="proj-row" key={p.id}>
                        <div>
                          <div className="proj-name">{p.name}</div>
                          <div className="proj-firma">{p.firma}</div>
                        </div>
                        <div className="proj-program">{p.program}</div>
                        <div>
                          <span className="status-badge" style={{ background: st.bg, color: st.color }}>
                            {st.label}
                          </span>
                        </div>
                        <div>
                          <div className="mini-bar">
                            <div className="mini-bar-fill" style={{
                              width: `${pct(p.eligibility, p.eligTotal)}%`,
                              background: pct(p.eligibility, p.eligTotal) === 100 ? "var(--accent-green)" : pct(p.eligibility, p.eligTotal) > 0 ? "var(--accent-yellow)" : "var(--accent-red)"
                            }} />
                          </div>
                          <div className="mini-pct">{p.eligibility}/{p.eligTotal}</div>
                        </div>
                        <div>
                          <div className="mini-bar">
                            <div className="mini-bar-fill" style={{
                              width: `${pct(p.elements, p.elemTotal)}%`,
                              background: pct(p.elements, p.elemTotal) === 100 ? "var(--accent-green)" : pct(p.elements, p.elemTotal) > 50 ? "var(--accent-blue)" : "var(--accent-orange)"
                            }} />
                          </div>
                          <div className="mini-pct">{p.elements}/{p.elemTotal}</div>
                        </div>
                        <div className="proj-time">{p.updated}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ─── RIGHT: FEED + DEADLINES ─── */}
              <div className="dash-right">
                {/* Quick Actions */}
                <div className="feed-card">
                  <div className="feed-header">⚡ Acțiuni rapide</div>
                  <div className="quick-grid">
                    <div className="quick-btn"><div className="qb-icon">➕</div><div className="qb-label">Proiect nou</div></div>
                    <div className="quick-btn"><div className="qb-icon">🏢</div><div className="qb-label">Firmă nouă</div></div>
                    <div className="quick-btn"><div className="qb-icon">📤</div><div className="qb-label">Upload doc</div></div>
                    <div className="quick-btn"><div className="qb-icon">🤖</div><div className="qb-label">Chat Solomon</div></div>
                  </div>
                </div>

                {/* Deadlines */}
                <div className="feed-card">
                  <div className="feed-header">🗓 Termene apropiate</div>
                  {DEADLINES.map((d, i) => (
                    <div className="deadline-item" key={i}>
                      <div className={`dl-date ${d.urgent ? "urgent" : ""}`}>{d.date}</div>
                      <div className="dl-info">
                        <div className="dl-event">{d.event}</div>
                        <div className="dl-proj">{d.project}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Activity Feed */}
                <div className="feed-card">
                  <div className="feed-header">📡 Activitate recentă</div>
                  <div className="feed-scroll">
                    {ACTIVITY_FEED.map((a, i) => (
                      <div className="feed-item" key={i}>
                        <div className="feed-time">
                          <span className={`feed-type ${a.type}`} />
                          {a.time}
                        </div>
                        <div className="feed-text">{a.text}</div>
                        <div className="feed-proj">{a.project}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
