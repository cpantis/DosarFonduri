import { useState } from "react";

const AI_MODELS = [
  { id: "haiku", name: "Claude Haiku", speed: "Rapid", cost: "~$0.001/apel", use: "Clasificare, OCR text nativ", color: "#34d399" },
  { id: "sonnet", name: "Claude Sonnet", speed: "Mediu", cost: "~$0.04/apel", use: "Extragere date, reguli fixe, completare template", color: "#4d8bff" },
  { id: "opus", name: "Claude Opus", speed: "Lent", cost: "~$0.25/apel", use: "Eligibilitate complexă, reguli interpretate, chat Solomon", color: "#a78bfa" },
];

export default function ConfigurariPage() {
  const [activeSection, setActiveSection] = useState("solomon");
  const [solomonModel, setSolomonModel] = useState("opus");
  const [solomonET, setSolomonET] = useState(true);
  const [neemiaModel, setNeemiaModel] = useState("sonnet");
  const [reguliFixeModel, setReguliFixeModel] = useState("sonnet");
  const [reguliInterpModel, setReguliInterpModel] = useState("opus");
  const [reguliInterpET, setReguliInterpET] = useState(true);
  const [apis, setApis] = useState([
    { id: "a1", name: "termene.ro", type: "ONRC", url: "https://api.termene.ro/v1", apiKey: "sk-term-****-****-abc123", enabled: true, autoSync: true, syncDays: 7, status: "connected", lastTest: "Azi, 09:15 — OK" },
    { id: "a2", name: "ANAF — SPV", type: "ANAF", url: "https://webservicesp.anaf.ro", apiKey: "anaf-****-****-def456", enabled: true, autoSync: false, syncDays: 0, status: "connected", lastTest: "Ieri, 14:20 — OK" },
    { id: "a3", name: "Resend (Email)", type: "Email", url: "https://api.resend.com", apiKey: "re_****_abc", enabled: true, autoSync: false, syncDays: 0, status: "connected", lastTest: "3 mar — OK" },
  ]);
  const [testingApi, setTestingApi] = useState(null);
  const [showAddApi, setShowAddApi] = useState(false);
  const [newApi, setNewApi] = useState({ name: "", type: "ONRC", url: "", apiKey: "" });
  const [emailFrom, setEmailFrom] = useState("notificari@dosarfonduri.ro");
  const [notifNewElement, setNotifNewElement] = useState(true);
  const [notifEligFail, setNotifEligFail] = useState(true);
  const [notifTemplateReady, setNotifTemplateReady] = useState(true);
  const [notifDeadline, setNotifDeadline] = useState(true);
  const [saved, setSaved] = useState(false);
  const [theme, setTheme] = useState("dark"); // dark | light

  const handleSave = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  const handleTestApi = (id) => {
    setTestingApi(id);
    setTimeout(() => {
      setApis(prev => prev.map(a => a.id === id ? { ...a, status: "connected", lastTest: "Acum — OK ✓" } : a));
      setTestingApi(null);
    }, 1500);
  };

  const handleAddApi = () => {
    if (!newApi.name || !newApi.url) return;
    const id = "a_" + Date.now();
    setApis(prev => [...prev, { ...newApi, id, enabled: true, autoSync: false, syncDays: 0, status: "neconfigurat", lastTest: "—" }]);
    setNewApi({ name: "", type: "ONRC", url: "", apiKey: "" });
    setShowAddApi(false);
  };

  const handleToggleApi = (id) => {
    setApis(prev => prev.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a));
  };

  const handleDeleteApi = (id) => {
    setApis(prev => prev.filter(a => a.id !== id));
  };

  const SECTIONS = [
    { id: "solomon", icon: "🤖", label: "Solomon (Chat AI)" },
    { id: "neemia", icon: "📝", label: "Neemia (Template)" },
    { id: "ghid", icon: "📖", label: "Ghid Finanțare (Reguli)" },
    { id: "api", icon: "🔌", label: "Integrare API" },
    { id: "notificari", icon: "🔔", label: "Notificări" },
    { id: "export", icon: "📤", label: "Export & Backup" },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&family=JetBrains+Mono:wght@400;500&display=swap');
        *{margin:0;padding:0;box-sizing:border-box}
        ${theme === "dark" ? `
        :root{--bg-deep:#0a0c10;--bg-surface:#12151c;--bg-elevated:#1a1e28;--bg-hover:#222838;--border:#2a3040;--border-active:#3d4760;--text-primary:#e8ecf4;--text-secondary:#8892a8;--text-muted:#5a6478;--accent-blue:#4d8bff;--accent-green:#34d399;--accent-red:#f87171;--accent-yellow:#fbbf24;--accent-purple:#a78bfa;--accent-orange:#fb923c;--shadow:0 2px 8px rgba(0,0,0,.3)}
        ` : `
        :root{--bg-deep:#f0f2f5;--bg-surface:#ffffff;--bg-elevated:#f8f9fb;--bg-hover:#eef0f4;--border:#d8dce5;--border-active:#b0b8c8;--text-primary:#1a1e28;--text-secondary:#5a6478;--text-muted:#8892a8;--accent-blue:#2563eb;--accent-green:#059669;--accent-red:#dc2626;--accent-yellow:#d97706;--accent-purple:#7c3aed;--accent-orange:#ea580c;--shadow:0 2px 8px rgba(0,0,0,.08)}
        `}
        :root{--font-sans:'DM Sans',system-ui,sans-serif;--font-mono:'JetBrains Mono',monospace;--r-sm:6px;--r-md:10px;--r-lg:14px}
        body{font-family:var(--font-sans);background:var(--bg-deep);color:var(--text-primary);margin:0;padding:0;transition:background .3s,color .3s}
        .page{display:flex;height:100vh;overflow:hidden;background:var(--bg-deep);color:var(--text-primary);transition:background .3s,color .3s}

        .sidebar{width:240px;min-width:240px;background:var(--bg-surface);border-right:1px solid var(--border);display:flex;flex-direction:column;transition:background .3s,border-color .3s;color:var(--text-primary)}
        .sb-logo{padding:20px 16px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--border)}
        .sb-logo-icon{width:36px;height:36px;border-radius:10px;background:var(--accent-blue);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:#fff;flex-shrink:0}
        .sb-logo-text{font-size:17px;font-weight:800;letter-spacing:-.3px;color:var(--text-primary);transition:color .3s}
        .sb-nav{flex:1;padding:12px 8px}
        .sb-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:var(--r-sm);cursor:pointer;font-size:14px;font-weight:500;color:var(--text-secondary);transition:all .15s;margin-bottom:2px}
        .sb-item:hover{background:var(--bg-hover);color:var(--text-primary)}.sb-item.active{background:rgba(77,139,255,.1);color:var(--accent-blue);font-weight:600}
        .sb-icon{width:20px;text-align:center;font-size:16px;flex-shrink:0}
        .sb-section{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);padding:16px 12px 6px}
        .sb-footer{padding:12px;border-top:1px solid var(--border);display:flex;align-items:center;gap:10px;margin-top:auto}
        .sb-avatar{width:32px;height:32px;border-radius:50%;background:var(--accent-purple);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0}
        .sb-user-name{font-size:13px;font-weight:600;color:var(--text-primary)}.sb-user-role{font-size:11px;color:var(--text-muted)}
        .theme-toggle{width:32px;height:32px;border-radius:50%;border:1px solid var(--border);background:var(--bg-elevated);cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .2s;padding:0}
        .theme-toggle:hover{border-color:var(--accent-blue);background:var(--bg-hover);transform:scale(1.08)}

        .main{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;color:var(--text-primary)}
        .topbar{padding:14px 28px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:16px;background:var(--bg-surface);flex-shrink:0;transition:background .3s,border-color .3s;color:var(--text-primary)}
        .tb-title{font-size:20px;font-weight:800;flex:1;color:var(--text-primary)}
        .btn-save{padding:8px 20px;border-radius:var(--r-md);border:none;background:var(--accent-green);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font-sans);transition:all .15s;display:flex;align-items:center;gap:6px}
        .btn-save:hover{background:#45e0a8}
        .btn-save.saved{background:var(--accent-green)}

        .cfg-layout{flex:1;display:flex;overflow:hidden}

        /* Config nav */
        .cfg-nav{width:240px;min-width:240px;border-right:1px solid var(--border);background:var(--bg-surface);padding:16px 8px;overflow-y:auto;color:var(--text-secondary)}
        .cfg-nav-item{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:var(--r-sm);cursor:pointer;font-size:13px;font-weight:500;color:var(--text-secondary);transition:all .15s;margin-bottom:2px}
        .cfg-nav-item:hover{background:var(--bg-hover);color:var(--text-primary)}
        .cfg-nav-item.active{background:rgba(77,139,255,.08);color:var(--accent-blue);font-weight:600}
        .cfg-nav-icon{font-size:16px;width:20px;text-align:center}

        /* Config content */
        .cfg-content{flex:1;overflow-y:auto;padding:28px 36px;background:var(--bg-deep);color:var(--text-primary)}
        .cfg-title{font-size:22px;font-weight:800;margin-bottom:4px;color:var(--text-primary)}
        .cfg-desc{font-size:14px;color:var(--text-secondary);margin-bottom:28px;line-height:1.5}

        .cfg-section{margin-bottom:28px}
        .cfg-stitle{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin-bottom:12px;display:flex;align-items:center;gap:8px}

        /* Setting row */
        .setting{display:flex;align-items:flex-start;gap:16px;padding:16px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-surface);margin-bottom:10px;transition:all .15s}
        .setting:hover{border-color:var(--border-active)}
        .set-info{flex:1}
        .set-label{font-size:14px;font-weight:600;margin-bottom:2px;color:var(--text-primary)}
        .set-desc{font-size:12px;color:var(--text-muted);line-height:1.4}
        .set-control{flex-shrink:0;display:flex;align-items:center;gap:8px}

        /* Toggle */
        .toggle{width:44px;height:24px;border-radius:12px;background:var(--border);cursor:pointer;position:relative;transition:background .2s;flex-shrink:0}
        .toggle.on{background:var(--accent-blue)}
        .toggle-knob{width:20px;height:20px;border-radius:50%;background:#fff;position:absolute;top:2px;left:2px;transition:left .2s;box-shadow:0 1px 4px rgba(0,0,0,.3)}
        .toggle.on .toggle-knob{left:22px}

        /* Select */
        .cfg-select{padding:8px 12px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--bg-deep);color:var(--text-primary);font-size:13px;font-family:var(--font-sans);outline:none;cursor:pointer;min-width:160px}
        .cfg-select:focus{border-color:var(--accent-blue)}

        /* Input */
        .cfg-input{padding:8px 12px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--bg-deep);color:var(--text-primary);font-size:13px;font-family:var(--font-mono);outline:none;min-width:200px}
        .cfg-input:focus{border-color:var(--accent-blue)}.cfg-input::placeholder{color:var(--text-muted)}
        .cfg-input-sm{width:70px;text-align:center}

        /* Number with suffix */
        .num-group{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-secondary)}

        /* Model cards */
        .model-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}
        .model-card{padding:14px;border-radius:var(--r-md);border:2px solid var(--border);background:var(--bg-elevated);cursor:pointer;transition:all .15s;text-align:center}
        .model-card:hover{border-color:var(--border-active)}
        .model-card.on{border-color:var(--accent-blue);background:rgba(77,139,255,.04)}
        .mc-name{font-size:14px;font-weight:700;margin-bottom:4px;color:var(--text-primary)}
        .mc-speed{font-size:11px;color:var(--text-muted);margin-bottom:2px}
        .mc-cost{font-size:11px;font-family:var(--font-mono);color:var(--text-secondary);margin-bottom:6px}
        .mc-use{font-size:11px;color:var(--text-muted);line-height:1.3}
        .mc-dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:4px}

        /* Radio group */
        .radio-group{display:flex;gap:8px}
        .radio-opt{padding:8px 16px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--bg-elevated);cursor:pointer;font-size:13px;font-weight:600;color:var(--text-secondary);transition:all .15s;font-family:var(--font-sans)}
        .radio-opt:hover{border-color:var(--border-active);color:var(--text-primary)}
        .radio-opt.on{border-color:var(--accent-blue);background:rgba(77,139,255,.06);color:var(--accent-blue)}

        /* Cost estimate */
        .cost-box{padding:12px 16px;border-radius:var(--r-sm);background:var(--bg-elevated);border:1px solid var(--border);margin-top:12px;display:flex;align-items:center;gap:12px}
        .cost-label{font-size:12px;color:var(--text-muted);flex:1}
        .cost-val{font-size:14px;font-weight:700;font-family:var(--font-mono);color:var(--accent-yellow)}

        /* API key masked */
        .api-key-row{display:flex;align-items:center;gap:8px}
        .api-key-show{background:none;border:none;color:var(--accent-blue);font-size:12px;font-weight:600;cursor:pointer;font-family:var(--font-sans)}

        /* Export buttons */
        .export-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .export-btn{padding:20px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-elevated);cursor:pointer;transition:all .15s;text-align:center}
        .export-btn:hover{border-color:var(--border-active);background:var(--bg-hover)}
        .export-btn .eb-icon{font-size:24px;margin-bottom:6px}
        .export-btn .eb-label{font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:2px}
        .export-btn .eb-desc{font-size:11px;color:var(--text-muted)}

        /* API cards */
        .api-card{padding:16px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-surface);margin-bottom:10px;transition:all .15s}
        .api-card:hover{border-color:var(--border-active)}
        .api-card.disabled{opacity:.5}
        .api-top{display:flex;align-items:center;gap:12px;margin-bottom:10px}
        .api-icon{width:36px;height:36px;border-radius:var(--r-sm);background:var(--bg-elevated);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
        .api-info{flex:1;min-width:0}
        .api-name{font-size:14px;font-weight:700;display:flex;align-items:center;gap:8px;color:var(--text-primary)}
        .api-type{font-size:10px;font-weight:700;padding:2px 7px;border-radius:8px;background:var(--bg-elevated);color:var(--text-muted)}
        .api-url{font-size:11px;font-family:var(--font-mono);color:var(--text-muted)}
        .api-status{display:flex;align-items:center;gap:4px;font-size:11px;font-weight:600}
        .api-status-dot{width:8px;height:8px;border-radius:50%}
        .api-details{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
        .api-field{padding:8px 10px;background:var(--bg-deep);border-radius:var(--r-sm);border:1px solid var(--border)}
        .api-field-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:2px}
        .api-field-value{font-size:12px;font-family:var(--font-mono);color:var(--text-secondary)}
        .api-field.full{grid-column:1/-1}
        .api-actions{display:flex;gap:6px}
        .api-btn{padding:6px 14px;border-radius:var(--r-sm);border:1px solid var(--border);background:transparent;font-size:12px;font-weight:600;cursor:pointer;font-family:var(--font-sans);transition:all .12s;display:flex;align-items:center;gap:4px;color:var(--text-secondary)}
        .api-btn:hover{border-color:var(--border-active);background:var(--bg-hover);color:var(--text-primary)}
        .api-btn.test{color:var(--accent-blue);border-color:rgba(77,139,255,.3)}.api-btn.test:hover{background:rgba(77,139,255,.08)}
        .api-btn.test.testing{opacity:.6;cursor:wait}
        .api-btn.danger{color:var(--accent-red);border-color:rgba(248,113,113,.25)}.api-btn.danger:hover{background:rgba(248,113,113,.06)}
        .api-spinner{width:12px;height:12px;border:2px solid rgba(77,139,255,.3);border-top-color:var(--accent-blue);border-radius:50%;animation:spin .7s linear infinite;display:inline-block}
        @keyframes spin{to{transform:rotate(360deg)}}
        .add-api-form{padding:16px;border-radius:var(--r-md);border:1px dashed var(--border);background:var(--bg-elevated);margin-top:10px}
        .add-api-title{font-size:13px;font-weight:700;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;color:var(--text-primary)}
        .add-api-close{background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:14px}.add-api-close:hover{color:var(--text-primary)}
        .add-api-row{display:flex;gap:8px;margin-bottom:8px}
        .add-api-row .cfg-input{flex:1}
        .btn-add-api{width:100%;padding:10px;border-radius:var(--r-sm);border:1px dashed var(--border);background:transparent;color:var(--text-muted);font-size:12px;font-weight:600;cursor:pointer;font-family:var(--font-sans);transition:all .15s;margin-top:10px;text-align:center}
        .btn-add-api:hover{border-color:var(--accent-blue);color:var(--accent-blue)}

        ${theme === "light" ? `
        .setting{box-shadow:var(--shadow)}
        .model-card{box-shadow:var(--shadow)}
        .model-card.on{background:rgba(37,99,235,.06)}
        .api-card{box-shadow:var(--shadow)}
        .cfg-input{background:var(--bg-elevated)}
        .cfg-select{background:var(--bg-elevated)}
        .export-btn{box-shadow:var(--shadow)}
        .toggle-knob{background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.15),0 0 0 1px rgba(0,0,0,.05)}
        .sb-logo-icon{box-shadow:0 2px 12px rgba(37,99,235,.2)}
        .btn-save{box-shadow:0 2px 8px rgba(5,150,105,.2)}
        .btn-create{box-shadow:0 2px 8px rgba(37,99,235,.2)}
        .sb-item.active{background:rgba(37,99,235,.08)}
        .cfg-nav-item.active{background:rgba(37,99,235,.06)}
        .radio-opt.on{background:rgba(37,99,235,.06)}
        ` : ""}

        /* Theme preview cards */
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
            <div className="sb-item active"><span className="sb-icon">🛠</span><span>Configurări</span></div>
            <div className="sb-section">Sistem</div>
            <div className="sb-item"><span className="sb-icon">⚙️</span><span>Admin</span></div>
          </div>
          <div className="sb-footer">
            <div className="sb-avatar">IP</div>
            <div style={{flex:1}}><div className="sb-user-name">Ion Popescu</div><div className="sb-user-role">Administrator</div></div>
            <button className="theme-toggle" onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} title={theme === "dark" ? "Comută la Light Mode" : "Comută la Dark Mode"}>
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
          </div>
        </div>

        <div className="main">
          <div className="topbar">
            <div className="tb-title">Configurări</div>
            <button className={`btn-save ${saved ? "saved" : ""}`} onClick={handleSave}>
              {saved ? "✓ Salvat" : "💾 Salvează modificările"}
            </button>
          </div>

          <div className="cfg-layout">
            <div className="cfg-nav">
              {SECTIONS.map(s => (
                <div key={s.id} className={`cfg-nav-item ${activeSection === s.id ? "active" : ""}`} onClick={() => setActiveSection(s.id)}>
                  <span className="cfg-nav-icon">{s.icon}</span> {s.label}
                </div>
              ))}
            </div>

            <div className="cfg-content">
              {/* ═══ SOLOMON ═══ */}
              {activeSection === "solomon" && (<>
                <div className="cfg-title">🤖 Solomon — Agent Chat AI</div>
                <div className="cfg-desc">Configurează modelul AI pentru agentul Solomon care colectează date din conversație, documente uploadate și surse oficiale.</div>

                <div className="cfg-section">
                  <div className="cfg-stitle">Model implicit</div>
                  <div className="model-grid">
                    {AI_MODELS.map(m => (
                      <div key={m.id} className={`model-card ${solomonModel === m.id ? "on" : ""}`} onClick={() => setSolomonModel(m.id)}>
                        <div className="mc-name"><span className="mc-dot" style={{ background: m.color }} />{m.name}</div>
                        <div className="mc-speed">Viteză: {m.speed}</div>
                        <div className="mc-cost">Cost: {m.cost}</div>
                        <div className="mc-use">{m.use}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="setting">
                  <div className="set-info">
                    <div className="set-label">Extended Thinking (ET)</div>
                    <div className="set-desc">Activează raționament avansat pentru întrebări complexe de eligibilitate. Crește calitatea dar și costul și timpul de răspuns.</div>
                  </div>
                  <div className="set-control">
                    <div className={`toggle ${solomonET ? "on" : ""}`} onClick={() => setSolomonET(!solomonET)}><div className="toggle-knob" /></div>
                  </div>
                </div>

                <div className="setting">
                  <div className="set-info">
                    <div className="set-label">Consultantul poate schimba modelul din chat</div>
                    <div className="set-desc">Permite switch între Sonnet și Opus direct din interfața Solomon pe proiect.</div>
                  </div>
                  <div className="set-control">
                    <div className="toggle on"><div className="toggle-knob" /></div>
                  </div>
                </div>

                <div className="cost-box">
                  <span className="cost-label">Cost estimat per conversație medie (15 mesaje):</span>
                  <span className="cost-val">{solomonModel === "opus" ? "~$0.35" : solomonModel === "sonnet" ? "~$0.08" : "~$0.02"}</span>
                </div>
              </>)}

              {/* ═══ NEEMIA ═══ */}
              {activeSection === "neemia" && (<>
                <div className="cfg-title">📝 Neemia — Completare Template-uri</div>
                <div className="cfg-desc">Configurează cum Neemia completează automat template-urile DOCX/XLSX cu datele colectate din Elemente.</div>

                <div className="cfg-section">
                  <div className="cfg-stitle">Model completare</div>
                  <div className="model-grid">
                    {AI_MODELS.filter(m => m.id !== "haiku").map(m => (
                      <div key={m.id} className={`model-card ${neemiaModel === m.id ? "on" : ""}`} onClick={() => setNeemiaModel(m.id)}>
                        <div className="mc-name"><span className="mc-dot" style={{ background: m.color }} />{m.name}</div>
                        <div className="mc-cost">Cost: {m.cost}</div>
                        <div className="mc-use">{m.use}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="setting">
                  <div className="set-info">
                    <div className="set-label">Completare progresivă (SSE streaming)</div>
                    <div className="set-desc">Afișează completarea pagină cu pagină în timp real. Dezactivat = completare batch, rezultat la final.</div>
                  </div>
                  <div className="set-control"><div className="toggle on"><div className="toggle-knob" /></div></div>
                </div>

                <div className="setting">
                  <div className="set-info">
                    <div className="set-label">Validare automată elemente înainte de completare</div>
                    <div className="set-desc">Neemia verifică dacă toate elementele necesare sunt confirmate înainte de a completa un template.</div>
                  </div>
                  <div className="set-control"><div className="toggle on"><div className="toggle-knob" /></div></div>
                </div>
              </>)}

              {/* ═══ GHID FINANȚARE ═══ */}
              {activeSection === "ghid" && (<>
                <div className="cfg-title">📖 Ghid Finanțare — Extragere Reguli</div>
                <div className="cfg-desc">Configurează modelele AI pentru extragerea regulilor fixe și interpretate din ghidurile de finanțare.</div>

                <div className="cfg-section">
                  <div className="cfg-stitle">Reguli fixe (binar, verificabile)</div>
                  <div className="setting">
                    <div className="set-info">
                      <div className="set-label">Model extragere reguli fixe</div>
                      <div className="set-desc">Dimensiuni minime, plafoane, categorii eligibile. ~25-30 reguli/ghid, precizie 92-97%.</div>
                    </div>
                    <div className="set-control">
                      <select className="cfg-select" value={reguliFixeModel} onChange={e => setReguliFixeModel(e.target.value)}>
                        <option value="sonnet">Sonnet (~$0.04, ~12s)</option>
                        <option value="opus">Opus (~$0.25, ~35s)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="cfg-section">
                  <div className="cfg-stitle">Reguli interpretate (context, arbori decizionali)</div>
                  <div className="setting">
                    <div className="set-info">
                      <div className="set-label">Model extragere reguli interpretate</div>
                      <div className="set-desc">Intensitate sprijin, criterii selecție complexe. Precizie 75-85%, necesită validare umană.</div>
                    </div>
                    <div className="set-control">
                      <select className="cfg-select" value={reguliInterpModel} onChange={e => setReguliInterpModel(e.target.value)}>
                        <option value="opus">Opus + ET (~$0.25, ~35s)</option>
                        <option value="sonnet">Sonnet (~$0.04, ~12s)</option>
                      </select>
                    </div>
                  </div>
                  <div className="setting">
                    <div className="set-info">
                      <div className="set-label">Extended Thinking pentru reguli interpretate</div>
                      <div className="set-desc">Budget tokens: 8000-12000. Crește semnificativ calitatea pe arbori decizionali complexi.</div>
                    </div>
                    <div className="set-control">
                      <div className={`toggle ${reguliInterpET ? "on" : ""}`} onClick={() => setReguliInterpET(!reguliInterpET)}><div className="toggle-knob" /></div>
                    </div>
                  </div>
                </div>

                <div className="setting">
                  <div className="set-info">
                    <div className="set-label">Prag auto-review consultant</div>
                    <div className="set-desc">Regulile cu confidence sub acest prag sunt marcate automat pentru verificare umană.</div>
                  </div>
                  <div className="set-control">
                    <div className="num-group">
                      <input className="cfg-input cfg-input-sm" type="number" min={50} max={99} defaultValue={85} /> <span>%</span>
                    </div>
                  </div>
                </div>

                <div className="cost-box">
                  <span className="cost-label">Cost estimat procesare completă ghid (60 pag.):</span>
                  <span className="cost-val">~$0.30 (~50s)</span>
                </div>
              </>)}

              {/* ═══ INTEGRARE API ═══ */}
              {activeSection === "api" && (<>
                <div className="cfg-title">🔌 Integrare API</div>
                <div className="cfg-desc">Gestionează conexiunile cu servicii externe: date ONRC, ANAF, email, și altele. Fiecare API poate fi testat independent.</div>

                {apis.map(api => {
                  const isTesting = testingApi === api.id;
                  const statusColor = api.status === "connected" ? "var(--accent-green)" : api.status === "error" ? "var(--accent-red)" : "var(--accent-yellow)";
                  const typeIcons = { ONRC: "🏛", ANAF: "📊", Email: "📧", SMS: "📱", Storage: "☁️", Custom: "🔗" };
                  return (
                    <div key={api.id} className={`api-card ${!api.enabled ? "disabled" : ""}`}>
                      <div className="api-top">
                        <div className="api-icon">{typeIcons[api.type] || "🔗"}</div>
                        <div className="api-info">
                          <div className="api-name">
                            {api.name}
                            <span className="api-type">{api.type}</span>
                          </div>
                          <div className="api-url">{api.url}</div>
                        </div>
                        <div className="api-status" style={{ color: statusColor }}>
                          <span className="api-status-dot" style={{ background: statusColor }} />
                          {api.status}
                        </div>
                        <div className={`toggle ${api.enabled ? "on" : ""}`} onClick={() => handleToggleApi(api.id)}><div className="toggle-knob" /></div>
                      </div>

                      <div className="api-details">
                        <div className="api-field">
                          <div className="api-field-label">API Key</div>
                          <div className="api-field-value">{api.apiKey}</div>
                        </div>
                        <div className="api-field">
                          <div className="api-field-label">Ultimul test</div>
                          <div className="api-field-value" style={{ color: api.lastTest.includes("OK") ? "var(--accent-green)" : "var(--text-muted)" }}>{api.lastTest}</div>
                        </div>
                      </div>

                      <div className="api-actions">
                        <button className={`api-btn test ${isTesting ? "testing" : ""}`} onClick={() => !isTesting && handleTestApi(api.id)}>
                          {isTesting ? <><span className="api-spinner" /> Se testează...</> : "⚡ Test conexiune"}
                        </button>
                        <button className="api-btn">✏️ Editează</button>
                        <button className="api-btn danger" onClick={() => handleDeleteApi(api.id)}>🗑 Șterge</button>
                      </div>
                    </div>
                  );
                })}

                {!showAddApi ? (
                  <button className="btn-add-api" onClick={() => setShowAddApi(true)}>+ Adaugă integrare API</button>
                ) : (
                  <div className="add-api-form">
                    <div className="add-api-title">Adaugă API nou <button className="add-api-close" onClick={() => setShowAddApi(false)}>✕</button></div>
                    <div className="add-api-row">
                      <input className="cfg-input" placeholder="Nume (ex: termene.ro)" value={newApi.name} onChange={e => setNewApi(p => ({ ...p, name: e.target.value }))} />
                      <select className="cfg-select" value={newApi.type} onChange={e => setNewApi(p => ({ ...p, type: e.target.value }))}>
                        <option value="ONRC">ONRC</option>
                        <option value="ANAF">ANAF</option>
                        <option value="Email">Email</option>
                        <option value="SMS">SMS</option>
                        <option value="Storage">Storage</option>
                        <option value="Custom">Custom</option>
                      </select>
                    </div>
                    <div className="add-api-row">
                      <input className="cfg-input" placeholder="URL endpoint (ex: https://api.termene.ro/v1)" value={newApi.url} onChange={e => setNewApi(p => ({ ...p, url: e.target.value }))} />
                    </div>
                    <div className="add-api-row">
                      <input className="cfg-input" placeholder="API Key" type="password" value={newApi.apiKey} onChange={e => setNewApi(p => ({ ...p, apiKey: e.target.value }))} />
                    </div>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
                      <button className="api-btn" onClick={() => setShowAddApi(false)}>Anulează</button>
                      <button className="btn-save" style={{ padding: "6px 16px", fontSize: 12 }} disabled={!newApi.name || !newApi.url} onClick={handleAddApi}>Adaugă</button>
                    </div>
                  </div>
                )}
              </>)}

              {/* ═══ NOTIFICĂRI ═══ */}
              {activeSection === "notificari" && (<>
                <div className="cfg-title">🔔 Notificări</div>
                <div className="cfg-desc">Configurează când și cum primești notificări despre activitatea din proiecte.</div>

                <div className="cfg-section">
                  <div className="cfg-stitle">Email</div>
                  <div className="setting">
                    <div className="set-info">
                      <div className="set-label">Adresă expeditor</div>
                      <div className="set-desc">Adresa de email de la care se trimit notificările (via Resend).</div>
                    </div>
                    <div className="set-control">
                      <input className="cfg-input" value={emailFrom} onChange={e => setEmailFrom(e.target.value)} style={{ width: 260 }} />
                    </div>
                  </div>
                </div>

                <div className="cfg-section">
                  <div className="cfg-stitle">Evenimente</div>
                  {[
                    { label: "Element nou extras de Solomon", desc: "Când Solomon extrage un element din conversație sau document.", state: notifNewElement, set: setNotifNewElement },
                    { label: "Eligibilitate eșuată", desc: "Când o verificare de eligibilitate nu trece.", state: notifEligFail, set: setNotifEligFail },
                    { label: "Template completat", desc: "Când Neemia finalizează completarea unui template.", state: notifTemplateReady, set: setNotifTemplateReady },
                    { label: "Termen apropiat", desc: "Cu 7 zile înainte de deadline-ul sesiunii de depunere.", state: notifDeadline, set: setNotifDeadline },
                  ].map((n, i) => (
                    <div className="setting" key={i}>
                      <div className="set-info">
                        <div className="set-label">{n.label}</div>
                        <div className="set-desc">{n.desc}</div>
                      </div>
                      <div className="set-control">
                        <div className={`toggle ${n.state ? "on" : ""}`} onClick={() => n.set(!n.state)}><div className="toggle-knob" /></div>
                      </div>
                    </div>
                  ))}
                </div>
              </>)}

              {/* ═══ EXPORT ═══ */}
              {activeSection === "export" && (<>
                <div className="cfg-title">📤 Export & Backup</div>
                <div className="cfg-desc">Exportă datele proiectelor sau creează backup-uri ale configurărilor.</div>

                <div className="export-grid">
                  <div className="export-btn">
                    <div className="eb-icon">📦</div>
                    <div className="eb-label">Export toate proiectele</div>
                    <div className="eb-desc">ZIP cu elemente, documente, template-uri completate</div>
                  </div>
                  <div className="export-btn">
                    <div className="eb-icon">⚙️</div>
                    <div className="eb-label">Export configurări</div>
                    <div className="eb-desc">JSON cu toate setările curente</div>
                  </div>
                  <div className="export-btn">
                    <div className="eb-icon">🗄</div>
                    <div className="eb-label">Backup bază de date</div>
                    <div className="eb-desc">PostgreSQL dump complet</div>
                  </div>
                  <div className="export-btn">
                    <div className="eb-icon">📊</div>
                    <div className="eb-label">Raport activitate</div>
                    <div className="eb-desc">CSV cu toate acțiunile pe ultimele 30 zile</div>
                  </div>
                </div>
              </>)}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
