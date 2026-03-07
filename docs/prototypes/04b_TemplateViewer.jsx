import { useState, useRef, useEffect, useCallback } from "react";

/* ═══ MOCK TEMPLATE ═══ */
const TEMPLATE = {
  name: "Cerere de Finanțare — model AFIR",
  totalPages: 5,
  pages: [
    { num: 1, title: "Date identificare solicitant", content: [
      "CERERE DE FINANȚARE",
      "Submăsura 4.1 — Investiții în exploatații agricole",
      "",
      "SECȚIUNEA 1 — DATE DE IDENTIFICARE ALE SOLICITANTULUI",
      "",
      "Denumirea completă: {{denumire_firma}}",
      "",
      "Cod Unic de Înregistrare (CUI): {{cui}}       Nr. Reg. Comerțului: {{nr_reg_comert}}",
      "",
      "Adresa sediu social: {{adresa_sediu}}",
      "",
      "Cod CAEN principal: {{cod_caen}}        Telefon: {{telefon}}",
      "",
      "Email: {{email}}                Website: {{website}}",
      "",
      "Forma juridică: {{forma_juridica}}",
      "",
      "Anul înființării: {{an_infiintare}}",
    ]},
    { num: 2, title: "Reprezentant legal", content: [
      "SECȚIUNEA 2 — REPREZENTANT LEGAL",
      "",
      "Nume și prenume: {{reprezentant_nume}}",
      "",
      "Funcția: {{reprezentant_functie}}       CNP: {{reprezentant_cnp}}",
      "",
      "Act de identitate: {{act_identitate}}",
      "",
      "Adresă domiciliu: {{reprezentant_adresa}}",
      "",
      "",
      "SECȚIUNEA 2.1 — PERSOANA DE CONTACT",
      "",
      "Nume: {{contact_nume}}       Telefon: {{contact_telefon}}",
      "",
      "Email: {{contact_email}}",
    ]},
    { num: 3, title: "Descriere proiect", content: [
      "SECȚIUNEA 3 — DESCRIEREA PROIECTULUI",
      "",
      "Titlul proiectului: {{titlu_proiect}}",
      "",
      "Descriere scurtă:",
      "{{descriere_proiect}}",
      "",
      "",
      "Obiectivul general: {{obiectiv_general}}",
      "",
      "Valoarea totală a proiectului (EUR): {{valoare_totala}}",
      "",
      "Contribuție proprie (%): {{contributie_proprie_pct}}",
      "",
      "Finanțare nerambursabilă solicitată: {{finantare_nerambursabila}}",
      "",
      "Durata de implementare (luni): {{durata_implementare}}",
    ]},
    { num: 4, title: "Plan de investiție", content: [
      "SECȚIUNEA 4 — PLAN DE INVESTIȚIE",
      "",
      "Obiective specifice:",
      "{{obiective_specifice}}",
      "",
      "",
      "Rezultate așteptate:",
      "{{rezultate_asteptate}}",
      "",
      "",
      "Locația investiției: {{locatie_investitie}}",
      "",
      "Categorie de beneficiar: {{categorie_beneficiar}}",
      "",
      "Dimensiune economică (SO): {{dimensiune_so}}",
      "",
      "Calendar de implementare: {{calendar_implementare}}",
    ]},
    { num: 5, title: "Declarații și semnături", content: [
      "SECȚIUNEA 5 — DECLARAȚII",
      "",
      "Subsemnatul(a) {{reprezentant_nume}}, în calitate de {{reprezentant_functie}}",
      "al {{denumire_firma}}, declar pe propria răspundere că:",
      "",
      "☐ Informațiile prezentate sunt complete și corecte",
      "☐ Nu mă aflu în niciuna din situațiile de excludere",
      "☐ Am luat cunoștință de condițiile de eligibilitate",
      "",
      "",
      "",
      "",
      "Data: {{data_semnare}}",
      "",
      "",
      "Semnătura: {{semnatura}}          Ștampila: {{stampila}}",
    ]},
  ],
};

const INITIAL_ELEMENTS = [
  { id: "e1", pageNum: 1, key: "denumire_firma", label: "Denumirea completă", type: "text", line: 5, detected: true, validated: true },
  { id: "e2", pageNum: 1, key: "cui", label: "Cod Unic de Înregistrare", type: "text", line: 7, detected: true, validated: true },
  { id: "e3", pageNum: 1, key: "nr_reg_comert", label: "Nr. Registrul Comerțului", type: "text", line: 7, detected: true, validated: false },
  { id: "e4", pageNum: 1, key: "adresa_sediu", label: "Adresa sediu social", type: "text", line: 9, detected: true, validated: true },
  { id: "e5", pageNum: 1, key: "cod_caen", label: "Cod CAEN principal", type: "text", line: 11, detected: true, validated: true },
  { id: "e6", pageNum: 1, key: "telefon", label: "Telefon", type: "text", line: 11, detected: true, validated: false },
  { id: "e7", pageNum: 1, key: "email", label: "Email", type: "text", line: 13, detected: true, validated: false },
  { id: "e8", pageNum: 1, key: "website", label: "Website", type: "text", line: 13, detected: true, validated: false },
  { id: "e9", pageNum: 1, key: "forma_juridica", label: "Forma juridică", type: "text", line: 15, detected: true, validated: false },
  { id: "e10", pageNum: 1, key: "an_infiintare", label: "Anul înființării", type: "number", line: 17, detected: true, validated: false },
  { id: "e11", pageNum: 2, key: "reprezentant_nume", label: "Nume și prenume repr.", type: "text", line: 2, detected: true, validated: true },
  { id: "e12", pageNum: 2, key: "reprezentant_functie", label: "Funcția", type: "text", line: 4, detected: true, validated: false },
  { id: "e13", pageNum: 2, key: "reprezentant_cnp", label: "CNP", type: "text", line: 4, detected: true, validated: false },
  { id: "e14", pageNum: 2, key: "act_identitate", label: "Act de identitate", type: "text", line: 6, detected: true, validated: false },
  { id: "e15", pageNum: 2, key: "reprezentant_adresa", label: "Adresă domiciliu", type: "text", line: 8, detected: true, validated: false },
  { id: "e16", pageNum: 2, key: "contact_nume", label: "Persoana de contact", type: "text", line: 13, detected: true, validated: false },
  { id: "e17", pageNum: 2, key: "contact_telefon", label: "Telefon contact", type: "text", line: 13, detected: true, validated: false },
  { id: "e18", pageNum: 2, key: "contact_email", label: "Email contact", type: "text", line: 15, detected: true, validated: false },
  { id: "e19", pageNum: 3, key: "titlu_proiect", label: "Titlul proiectului", type: "text", line: 2, detected: true, validated: false },
  { id: "e20", pageNum: 3, key: "descriere_proiect", label: "Descriere scurtă proiect", type: "textarea", line: 5, detected: true, validated: false },
  { id: "e21", pageNum: 3, key: "obiectiv_general", label: "Obiectivul general", type: "textarea", line: 8, detected: true, validated: false },
  { id: "e22", pageNum: 3, key: "valoare_totala", label: "Valoare totală (EUR)", type: "number", line: 10, detected: true, validated: false },
  { id: "e23", pageNum: 3, key: "contributie_proprie_pct", label: "Contribuție proprie %", type: "number", line: 12, detected: true, validated: false },
  { id: "e24", pageNum: 3, key: "finantare_nerambursabila", label: "Finanțare nerambursabilă", type: "number", line: 14, detected: true, validated: false },
  { id: "e25", pageNum: 3, key: "durata_implementare", label: "Durata implementare (luni)", type: "number", line: 16, detected: true, validated: false },
  { id: "e26", pageNum: 4, key: "obiective_specifice", label: "Obiective specifice", type: "textarea", line: 3, detected: true, validated: false },
  { id: "e27", pageNum: 4, key: "rezultate_asteptate", label: "Rezultate așteptate", type: "textarea", line: 7, detected: true, validated: false },
  { id: "e28", pageNum: 4, key: "locatie_investitie", label: "Locația investiției", type: "text", line: 10, detected: true, validated: false },
  { id: "e29", pageNum: 4, key: "categorie_beneficiar", label: "Categorie beneficiar", type: "text", line: 12, detected: true, validated: false },
  { id: "e30", pageNum: 4, key: "dimensiune_so", label: "Dimensiune economică (SO)", type: "number", line: 14, detected: true, validated: false },
  { id: "e31", pageNum: 4, key: "calendar_implementare", label: "Calendar implementare", type: "table", line: 16, detected: true, validated: false },
  { id: "e32", pageNum: 5, key: "data_semnare", label: "Data semnării", type: "date", line: 12, detected: true, validated: false },
  { id: "e33", pageNum: 5, key: "semnatura", label: "Semnătura", type: "signature", line: 15, detected: true, validated: false },
  { id: "e34", pageNum: 5, key: "stampila", label: "Ștampila", type: "signature", line: 15, detected: true, validated: false },
];

const TYPE_OPTIONS = ["text", "number", "textarea", "date", "table", "signature", "select"];

export default function TemplateViewer() {
  const [elements, setElements] = useState(INITIAL_ELEMENTS);
  const [selectedEl, setSelectedEl] = useState(null);
  const [filter, setFilter] = useState("all"); // all | nevalidat | validat | manual
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEl, setNewEl] = useState({ key: "", label: "", type: "text" });
  const [addLine, setAddLine] = useState(null);
  const [addPage, setAddPage] = useState(null);
  const lineRefs = useRef({});

  const selElement = elements.find(e => e.id === selectedEl);
  const totalEls = elements.length;
  const validatedEls = elements.filter(e => e.validated).length;
  const pct = Math.round((validatedEls / totalEls) * 100);

  // Current page is driven by selected element
  const currentPage = selElement ? selElement.pageNum : (addPage || 1);
  const page = TEMPLATE.pages.find(p => p.num === currentPage);

  // Filter elements
  const filteredEls = elements.filter(e => {
    if (filter === "nevalidat") return !e.validated;
    if (filter === "validat") return e.validated;
    if (filter === "manual") return !e.detected;
    return true;
  });

  // Group by page
  const groupedByPage = {};
  filteredEls.forEach(e => {
    if (!groupedByPage[e.pageNum]) groupedByPage[e.pageNum] = [];
    groupedByPage[e.pageNum].push(e);
  });

  // Scroll document to element's line when selected
  useEffect(() => {
    if (selElement && lineRefs.current[`${selElement.pageNum}-${selElement.line}`]) {
      lineRefs.current[`${selElement.pageNum}-${selElement.line}`].scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedEl]);

  const handleValidate = (id) => {
    setElements(prev => prev.map(e => e.id === id ? { ...e, validated: !e.validated } : e));
  };

  const handleDelete = (id) => {
    setElements(prev => prev.filter(e => e.id !== id));
    if (selectedEl === id) setSelectedEl(null);
  };

  const handleAddElement = () => {
    if (!newEl.key || !newEl.label || addLine == null || addPage == null) return;
    const id = "e_" + Date.now();
    setElements(prev => [...prev, { ...newEl, id, line: addLine, pageNum: addPage, detected: false, validated: false, source: "manual" }]);
    setNewEl({ key: "", label: "", type: "text" });
    setAddLine(null);
    setShowAddForm(false);
    setSelectedEl(id);
  };

  const getLineElements = (pageNum, lineIdx) => elements.filter(e => e.pageNum === pageNum && e.line === lineIdx);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&family=JetBrains+Mono:wght@400;500&display=swap');
        *{margin:0;padding:0;box-sizing:border-box}
        :root{--bg-deep:#0a0c10;--bg-surface:#12151c;--bg-elevated:#1a1e28;--bg-hover:#222838;--border:#2a3040;--border-active:#3d4760;--text-primary:#e8ecf4;--text-secondary:#8892a8;--text-muted:#5a6478;--accent-blue:#4d8bff;--accent-green:#34d399;--accent-red:#f87171;--accent-yellow:#fbbf24;--accent-purple:#a78bfa;--font-sans:'DM Sans',system-ui,sans-serif;--font-mono:'JetBrains Mono',monospace;--r-sm:6px;--r-md:10px;--r-lg:14px}
        body{font-family:var(--font-sans);background:var(--bg-deep);color:var(--text-primary)}

        .tv{display:flex;flex-direction:column;height:100vh}

        /* Header */
        .tv-header{padding:12px 24px;border-bottom:1px solid var(--border);background:var(--bg-surface);display:flex;align-items:center;gap:16px;flex-shrink:0}
        .tv-back{background:none;border:1px solid var(--border);border-radius:var(--r-sm);padding:6px 12px;color:var(--text-secondary);font-size:13px;font-weight:600;cursor:pointer;font-family:var(--font-sans);display:flex;align-items:center;gap:4px;transition:all .15s}
        .tv-back:hover{border-color:var(--border-active);color:var(--text-primary)}
        .tv-title{font-size:16px;font-weight:800;flex:1}
        .tv-progress{display:flex;align-items:center;gap:10px}
        .tv-pbar{width:100px;height:6px;background:var(--bg-deep);border-radius:3px;overflow:hidden}
        .tv-pfill{height:100%;border-radius:3px;transition:width .3s}
        .tv-ppct{font-size:13px;font-weight:700;font-family:var(--font-mono)}

        /* Layout */
        .tv-body{flex:1;display:flex;overflow:hidden}

        /* ─── LEFT: ELEMENTS CHECKLIST ─── */
        .tv-left{width:400px;min-width:400px;border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;background:var(--bg-surface)}
        .tv-left-bar{padding:10px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;flex-shrink:0}
        .tv-left-count{font-size:12px;color:var(--text-muted);flex:1}
        .tv-left-count strong{color:var(--text-primary);font-family:var(--font-mono)}
        .pill-group{display:flex;background:var(--bg-deep);border-radius:var(--r-md);padding:2px;gap:1px}
        .pill{padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;border:none;cursor:pointer;background:transparent;color:var(--text-muted);font-family:var(--font-sans);transition:all .15s}
        .pill:hover{color:var(--text-secondary)}.pill.on{background:var(--accent-blue);color:#fff}
        .tv-left-scroll{flex:1;overflow-y:auto;padding:8px 12px}

        /* Page group header in list */
        .tv-pg-header{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);padding:12px 6px 6px;display:flex;align-items:center;gap:6px}
        .tv-pg-header .pg-num{color:var(--accent-blue)}

        /* Element card — compact 2 lines */
        .el-card{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:var(--r-sm);border:1px solid transparent;cursor:pointer;transition:all .12s;margin-bottom:2px}
        .el-card:hover{background:var(--bg-hover);border-color:var(--border)}
        .el-card.active{background:rgba(77,139,255,.06);border-color:var(--accent-blue)}
        .el-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
        .el-body{flex:1;min-width:0}
        .el-row1{display:flex;align-items:center;gap:8px}
        .el-label{font-size:13px;font-weight:600;color:var(--text-primary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .el-type{font-size:10px;font-family:var(--font-mono);color:var(--text-muted);padding:1px 6px;background:var(--bg-deep);border-radius:4px;flex-shrink:0}
        .el-row2{display:flex;align-items:center;gap:8px;margin-top:2px}
        .el-key{font-size:11px;font-family:var(--font-mono);color:var(--text-secondary)}
        .el-line{font-size:11px;color:var(--text-muted)}
        .el-validate{flex-shrink:0;padding:3px 10px;border-radius:4px;border:1px solid var(--border);background:transparent;font-size:11px;font-weight:600;cursor:pointer;font-family:var(--font-sans);transition:all .12s;color:var(--text-muted);margin-left:auto}
        .el-validate:hover{border-color:var(--accent-green);color:var(--accent-green)}
        .el-validate.on{background:rgba(52,211,153,.1);border-color:var(--accent-green);color:var(--accent-green)}

        .btn-add{width:calc(100% - 12px);margin:8px 6px;padding:8px;border-radius:var(--r-sm);border:1px dashed var(--border);background:transparent;color:var(--text-muted);font-size:12px;font-weight:600;cursor:pointer;font-family:var(--font-sans);transition:all .15s;text-align:center}
        .btn-add:hover{border-color:var(--accent-purple);color:var(--accent-purple)}

        /* Add form */
        .add-form{margin:8px 6px;padding:14px;background:var(--bg-elevated);border-radius:var(--r-md);border:1px solid var(--border)}
        .add-form-title{font-size:12px;font-weight:700;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center}
        .add-form-close{background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:14px}.add-form-close:hover{color:var(--text-primary)}
        .add-row{display:flex;gap:6px;margin-bottom:8px}
        .add-input{flex:1;padding:6px 10px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--bg-deep);color:var(--text-primary);font-size:12px;font-family:var(--font-sans);outline:none}
        .add-input:focus{border-color:var(--accent-blue)}.add-input::placeholder{color:var(--text-muted)}
        .add-select{padding:6px 10px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--bg-deep);color:var(--text-primary);font-size:12px;font-family:var(--font-sans);outline:none}
        .add-line-pick{display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg-deep);border-radius:var(--r-sm);border:1px solid var(--border);margin-bottom:8px;font-size:11px}
        .add-line-val{font-weight:700;font-family:var(--font-mono);color:var(--accent-purple)}
        .add-line-hint{color:var(--accent-purple);font-style:italic}
        .add-line-clear{background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:11px;margin-left:4px}.add-line-clear:hover{color:var(--accent-red)}
        .add-btn{padding:6px 16px;border-radius:var(--r-sm);border:none;background:var(--accent-blue);color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font-sans)}.add-btn:disabled{opacity:.4;cursor:not-allowed}

        /* Legend */
        .tv-legend{padding:8px 16px;border-top:1px solid var(--border);display:flex;gap:14px;font-size:10px;color:var(--text-muted);flex-shrink:0}
        .tv-legend-item{display:flex;align-items:center;gap:4px}
        .tv-legend-dot{width:8px;height:8px;border-radius:50%}

        /* ─── RIGHT: DOCUMENT PREVIEW ─── */
        .tv-right{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;background:var(--bg-deep)}
        .tv-right-bar{padding:10px 24px;border-bottom:1px solid var(--border);background:var(--bg-surface);display:flex;align-items:center;gap:12px;flex-shrink:0}
        .tv-right-page{font-size:13px;font-family:var(--font-mono);color:var(--text-secondary)}
        .tv-right-title{font-size:14px;font-weight:700;flex:1}
        .tv-val-all{padding:5px 12px;border-radius:var(--r-sm);border:1px solid var(--accent-green);background:transparent;color:var(--accent-green);font-size:11px;font-weight:600;cursor:pointer;font-family:var(--font-sans);transition:all .15s}
        .tv-val-all:hover{background:rgba(52,211,153,.08)}
        .tv-right-scroll{flex:1;overflow:auto;padding:24px;display:flex;justify-content:center}
        .tv-page{background:#fff;border-radius:4px;box-shadow:0 4px 32px rgba(0,0,0,.4);width:660px;min-height:800px;padding:48px 48px 48px 16px}
        .tv-line-wrap{display:flex;align-items:flex-start}
        .tv-line-num{width:32px;min-width:32px;text-align:right;padding:3px 8px 3px 0;font-size:11px;font-family:var(--font-mono);color:rgba(150,150,170,.25);user-select:none;line-height:1.8;border-right:1px solid rgba(150,150,170,.08);margin-right:12px;flex-shrink:0}
        .tv-line-num.clickable{cursor:pointer;transition:all .12s}
        .tv-line-num.clickable:hover{color:var(--accent-purple);background:rgba(167,139,250,.08);border-radius:2px}
        .tv-line-num.selected{color:#7c3aed;background:rgba(167,139,250,.15);font-weight:700;border-radius:2px}
        .tv-line{padding:3px 0;font-size:13px;color:#333;line-height:1.8;font-family:'DM Sans',sans-serif;flex:1;min-width:0;border-radius:3px;transition:background .15s}
        .tv-line.hl{background:rgba(77,139,255,.1)}
        .tv-line .section-title{font-size:15px;font-weight:700;color:#111;text-transform:uppercase;letter-spacing:.5px}
        .tv-empty{height:20px;flex:1}
        .tv-ph{display:inline;background:rgba(77,139,255,.1);border:1px solid rgba(77,139,255,.25);border-radius:3px;padding:1px 4px;font-family:var(--font-mono);font-size:12px;color:#1a56cc;cursor:pointer;transition:all .15s}
        .tv-ph:hover{background:rgba(77,139,255,.18)}
        .tv-ph.validated{background:rgba(52,211,153,.1);border-color:rgba(52,211,153,.25);color:#0e7a50}
        .tv-ph.manual{background:rgba(167,139,250,.1);border-color:rgba(167,139,250,.25);color:#6d5eac;border-style:dashed}
        .tv-ph.active{outline:2px solid #4d8bff;outline-offset:1px}
        .tv-line-wrap.add-target{background:rgba(167,139,250,.06);border-radius:3px}

        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
      `}</style>

      <div className="tv">
        <div className="tv-header">
          <button className="tv-back">← Înapoi</button>
          <div className="tv-title">📝 {TEMPLATE.name}</div>
          <div className="tv-progress">
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{validatedEls}/{totalEls} validate</span>
            <div className="tv-pbar"><div className="tv-pfill" style={{ width: `${pct}%`, background: pct === 100 ? "var(--accent-green)" : "var(--accent-blue)" }} /></div>
            <span className="tv-ppct" style={{ color: pct === 100 ? "var(--accent-green)" : "var(--text-secondary)" }}>{pct}%</span>
          </div>
        </div>

        <div className="tv-body">
          {/* ═══ LEFT: ELEMENTS CHECKLIST ═══ */}
          <div className="tv-left">
            <div className="tv-left-bar">
              <div className="pill-group">
                <button className={`pill ${filter==="all"?"on":""}`} onClick={() => setFilter("all")}>Toate</button>
                <button className={`pill ${filter==="nevalidat"?"on":""}`} onClick={() => setFilter("nevalidat")}>Nevalidate</button>
                <button className={`pill ${filter==="validat"?"on":""}`} onClick={() => setFilter("validat")}>Validate</button>
                <button className={`pill ${filter==="manual"?"on":""}`} onClick={() => setFilter("manual")}>Manual</button>
              </div>
            </div>

            <div className="tv-left-scroll">
              {Object.keys(groupedByPage).sort((a, b) => a - b).map(pNum => {
                const pgTitle = TEMPLATE.pages.find(p => p.num === parseInt(pNum))?.title || "";
                return (
                  <div key={pNum}>
                    <div className="tv-pg-header">
                      <span className="pg-num">Pag. {pNum}</span> — {pgTitle}
                    </div>
                    {groupedByPage[pNum].map(el => {
                      const isActive = selectedEl === el.id;
                      const dotColor = el.validated ? "var(--accent-green)" : !el.detected ? "var(--accent-purple)" : "var(--accent-yellow)";
                      return (
                        <div key={el.id} className={`el-card ${isActive ? "active" : ""}`} onClick={() => setSelectedEl(isActive ? null : el.id)}>
                          <div className="el-dot" style={{ background: dotColor }} />
                          <div className="el-body">
                            <div className="el-row1">
                              <span className="el-label">{el.label}</span>
                              <span className="el-type">{el.type}</span>
                            </div>
                            <div className="el-row2">
                              <span className="el-key">{el.key}</span>
                              <span className="el-line">· Linia {el.line + 1}</span>
                            </div>
                          </div>
                          <button className={`el-validate ${el.validated ? "on" : ""}`} onClick={(ev) => { ev.stopPropagation(); handleValidate(el.id); }}>
                            {el.validated ? "✓ Validat" : "Validează"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {filteredEls.length === 0 && (
                <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 13 }}>
                  Niciun element cu filtrul selectat
                </div>
              )}

              <button className="btn-add" onClick={() => { setShowAddForm(true); setAddLine(null); setAddPage(currentPage); }}>
                + Adaugă element manual
              </button>

              {showAddForm && (
                <div className="add-form">
                  <div className="add-form-title">Adaugă element<button className="add-form-close" onClick={() => setShowAddForm(false)}>✕</button></div>
                  <div className="add-row">
                    <input className="add-input" placeholder="key (ex: nr_telefon_2)" value={newEl.key} onChange={e => setNewEl(p => ({ ...p, key: e.target.value }))} />
                  </div>
                  <div className="add-row">
                    <input className="add-input" placeholder="Label (ex: Telefon secundar)" value={newEl.label} onChange={e => setNewEl(p => ({ ...p, label: e.target.value }))} />
                  </div>
                  <div className="add-row">
                    <select className="add-select" value={newEl.type} onChange={e => setNewEl(p => ({ ...p, type: e.target.value }))}>
                      {TYPE_OPTIONS.map(t => <option key={t}>{t}</option>)}
                    </select>
                    <span style={{ fontSize: 11, color: "var(--accent-purple)", alignSelf: "center" }}>● Adăugat manual</span>
                  </div>
                  <div className="add-line-pick">
                    <span style={{ color: "var(--text-muted)" }}>Linia:</span>
                    {addLine != null ? (
                      <><span className="add-line-val">Pag. {addPage}, Linia {addLine + 1}</span><button className="add-line-clear" onClick={() => setAddLine(null)}>✕</button></>
                    ) : (
                      <span className="add-line-hint">← Click pe un nr. de linie din document</span>
                    )}
                  </div>
                  <button className="add-btn" disabled={!newEl.key || !newEl.label || addLine == null} onClick={handleAddElement}>Adaugă element</button>
                </div>
              )}
            </div>

            <div className="tv-legend">
              <div className="tv-legend-item"><div className="tv-legend-dot" style={{ background: "var(--accent-green)" }} /> Validat</div>
              <div className="tv-legend-item"><div className="tv-legend-dot" style={{ background: "var(--accent-yellow)" }} /> Extras automat</div>
              <div className="tv-legend-item"><div className="tv-legend-dot" style={{ background: "var(--accent-purple)" }} /> Adăugat manual</div>
            </div>
          </div>

          {/* ═══ RIGHT: DOCUMENT PREVIEW ═══ */}
          <div className="tv-right">
            <div className="tv-right-bar">
              <span className="tv-right-page">Pag. {currentPage}/{TEMPLATE.totalPages}</span>
              <span className="tv-right-title">{page?.title}</span>
              <button className="tv-val-all" onClick={() => {
                const pels = elements.filter(e => e.pageNum === currentPage);
                const allVal = pels.every(e => e.validated);
                setElements(prev => prev.map(e => e.pageNum === currentPage ? { ...e, validated: !allVal } : e));
              }}>
                {elements.filter(e => e.pageNum === currentPage).every(e => e.validated) ? "✕ Invalidează pagina" : "✓ Validează pagina"}
              </button>
            </div>

            <div className="tv-right-scroll">
              <div className="tv-page">
                {page?.content.map((line, lineIdx) => {
                  const lineEls = getLineElements(currentPage, lineIdx);
                  const isSection = line.startsWith("SECȚIUNEA") || line.startsWith("CERERE");
                  const isEmpty = line === "";
                  const isHighlighted = selElement && selElement.pageNum === currentPage && selElement.line === lineIdx;
                  const isAddTarget = showAddForm && addLine === lineIdx && addPage === currentPage;
                  const refKey = `${currentPage}-${lineIdx}`;

                  return (
                    <div key={lineIdx} className={`tv-line-wrap ${isAddTarget ? "add-target" : ""}`} ref={el => { lineRefs.current[refKey] = el; }}>
                      <span
                        className={`tv-line-num ${showAddForm ? "clickable" : ""} ${isAddTarget ? "selected" : ""}`}
                        onClick={() => { if (showAddForm) { setAddLine(lineIdx); setAddPage(currentPage); } }}
                      >
                        {lineIdx + 1}
                      </span>
                      {isEmpty ? (
                        <div className={`tv-line ${isHighlighted ? "hl" : ""}`} style={{ minHeight: 20 }}>
                          {lineEls.filter(e => !e.detected).map(me => (
                            <span key={me.id}
                              className={`tv-ph manual ${selectedEl === me.id ? "active" : ""}`}
                              onClick={() => setSelectedEl(me.id)}
                            >{`{{${me.key}}}`} <span style={{ fontSize: 9, opacity: 0.7 }}>+manual</span></span>
                          ))}
                        </div>
                      ) : (
                        <div className={`tv-line ${isHighlighted ? "hl" : ""}`}>
                          {isSection ? (
                            <span className="section-title">{line}</span>
                          ) : (
                            line.split(/(\{\{[^}]+\}\})/g).map((part, pi) => {
                              const match = part.match(/^\{\{(.+)\}\}$/);
                              if (match) {
                                const key = match[1];
                                const el = elements.find(e => e.key === key && e.pageNum === currentPage);
                                if (el) {
                                  return (
                                    <span key={pi}
                                      className={`tv-ph ${el.validated ? "validated" : ""} ${!el.detected ? "manual" : ""} ${selectedEl === el.id ? "active" : ""}`}
                                      onClick={() => setSelectedEl(el.id)}
                                    >{`{{${key}}}`}</span>
                                  );
                                }
                                return <span key={pi} className="tv-ph" style={{ borderColor: "rgba(248,113,113,.4)", color: "#c0392b", background: "rgba(248,113,113,.08)" }}>{`{{${key}}}`}</span>;
                              }
                              return <span key={pi}>{part}</span>;
                            })
                          )}
                          {/* Manual elements pinned to this line (not in original content) */}
                          {lineEls.filter(e => !e.detected).map(me => (
                            <span key={me.id}
                              className={`tv-ph manual ${selectedEl === me.id ? "active" : ""}`}
                              onClick={() => setSelectedEl(me.id)}
                              style={{ marginLeft: 6 }}
                            >{`{{${me.key}}}`} <span style={{ fontSize: 9, opacity: 0.7 }}>+manual</span></span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
