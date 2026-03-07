"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/* ═══ MOCK DATA ═══ */
const PROJECT = {
  id: "1", name: "Modernizare fabrică CNC", firma: "COMEXIM R SRL", cui: "2146135", status: "in_progress",
  valoare: "200.000 EUR",
  path: [
    { label: "Accesare finanțări", level: "program" },
    { label: "Măsura 1", level: "masura" },
    { label: "Sesiunea 1", level: "sesiune" },
  ],
  company: { formaJuridica: "SRL", caen: "2562", localitate: "Arad", judet: "Arad", capitalSocial: "5.000 RON", cifraAfaceri: "187.000 EUR" },
};

const ELIGIBILITY_RULES = [
  { id: "1", name: "Firmă înregistrată în România", status: "pass", detail: "CUI 2146135 — COMEXIM R SRL", type: "fixed" },
  { id: "2", name: "Minim 1 an vechime", status: "pass", detail: "Înregistrată din 1991", type: "fixed" },
  { id: "3", name: "Cod CAEN eligibil", status: "pass", detail: "2562 — Operațiuni de mecanică generală", type: "fixed" },
  { id: "4", name: "Nu e în insolvență/faliment", status: "pass", detail: "Verificare ONRC OK", type: "fixed" },
  { id: "5", name: "Nu are datorii la ANAF", status: "fail", detail: "Datorii restante: 2,340 RON", type: "fixed" },
  { id: "6", name: "Minim 2 angajați", status: "pass", detail: "12 angajați declarați", type: "fixed" },
  { id: "7", name: "Cifra afaceri > 50,000 EUR", status: "pass", detail: "CA 2024: 187,000 EUR", type: "fixed" },
  { id: "8", name: "Capital social minim 200 RON", status: "pass", detail: "Capital social: 5,000 RON", type: "fixed" },
  { id: "9", name: "Proiect în zona eligibilă", status: "pass", detail: "Județ Arad — eligibil", type: "fixed" },
  { id: "10", name: "Dimensiune IMM eligibilă", status: "pass", detail: "Microîntreprindere", type: "fixed" },
  { id: "11", name: "Intensitatea sprijinului: 50-70%", status: "pass", detail: "[AI 92%] Firma îndeplinește criteriul — zonă normală, intensitate 50%", type: "interpreted", confidence: 0.92 },
  { id: "12", name: "Cofinanțare minim 30%", status: "pass", detail: "Confirmat de beneficiar", type: "fixed" },
  { id: "13", name: "Criteriu selecție S3: CAEN + experiență", status: "pending", detail: "[AI 72%] Date insuficiente — necesită confirmare vechime activitate CAEN", type: "interpreted", confidence: 0.72 },
];

const GUIDE_RULES = [
  { id: "1", type: "fixed", text: "Beneficiarii eligibili sunt IMM-uri din mediul rural", confidence: 0.96, page: 8, section: "3.1" },
  { id: "2", type: "fixed", text: "Valoarea minimă a proiectului: 30,000 EUR", confidence: 0.98, page: 12, section: "4.2" },
  { id: "3", type: "fixed", text: "Valoarea maximă a proiectului: 200,000 EUR", confidence: 0.97, page: 12, section: "4.2" },
  { id: "4", type: "fixed", text: "Durata maximă de implementare: 24 luni", confidence: 0.95, page: 15, section: "5.1" },
  { id: "5", type: "interpreted", text: "Intensitatea sprijinului: 50% zonă normală, 70% zonă montană/defavorizată", confidence: 0.78, page: 18, section: "5.3" },
  { id: "6", type: "interpreted", text: "Criteriul de selecție S3: punctaj suplimentar dacă activitatea CAEN corespunde", confidence: 0.72, page: 24, section: "7.2" },
  { id: "7", type: "fixed", text: "Cheltuieli neeligibile: TVA recuperabil, achiziții second-hand, leasing", confidence: 0.94, page: 30, section: "8.1" },
  { id: "8", type: "interpreted", text: "Calculul SO: diferențiat pe tip exploatație", confidence: 0.68, page: 35, section: "9" },
];

const ELEMENTS = [
  { id: "e1", key: "denumire_firma", label: "Denumirea firmei", value: "COMEXIM R SRL", status: "confirmat", confidence: 99, source: "company_data", sourceLabel: "Date ONRC", templates: ["Cerere Finanțare", "Plan Afaceri"] },
  { id: "e2", key: "cui", label: "Cod Unic de Înregistrare", value: "RO44123456", status: "confirmat", confidence: 100, source: "company_data", sourceLabel: "Date ONRC", templates: ["Cerere Finanțare"] },
  { id: "e3", key: "nr_reg_comert", label: "Nr. Registrul Comerțului", value: "J12/441/2018", status: "confirmat", confidence: 100, source: "company_data", sourceLabel: "Date ONRC", templates: ["Cerere Finanțare"] },
  { id: "e4", key: "adresa_sediu", label: "Adresă sediu social", value: "Str. Industriei 45, Arad", status: "confirmat", confidence: 98, source: "company_data", sourceLabel: "Date ONRC", templates: ["Cerere Finanțare", "Plan Afaceri"] },
  { id: "e5", key: "cod_caen", label: "Cod CAEN principal", value: "2562", status: "confirmat", confidence: 100, source: "company_data", sourceLabel: "Date ONRC", templates: ["Cerere Finanțare"] },
  { id: "e6", key: "nr_angajati", label: "Număr mediu angajați", value: "12", status: "confirmat", confidence: 95, source: "company_data", sourceLabel: "Date ONRC", templates: ["Plan Afaceri"] },
  { id: "e7", key: "reprezentant_nume", label: "Reprezentant legal — Nume", value: "Popescu Ion", status: "propus_ai", confidence: 88, source: "solomon_chat", sourceLabel: "Chat Solomon", templates: ["Cerere Finanțare"] },
  { id: "e8", key: "reprezentant_functie", label: "Funcția Reprezentant", value: "Administrator", status: "propus_ai", confidence: 92, source: "company_data", sourceLabel: "Date ONRC", templates: ["Cerere Finanțare"] },
  { id: "e9", key: "descriere_proiect", label: "Descriere scurtă proiect", value: "Extindere capacitate producție prin achiziție echipamente CNC", status: "propus_ai", confidence: 85, source: "solomon_chat", sourceLabel: "Chat Solomon", templates: ["Cerere Finanțare", "Plan Afaceri"] },
  { id: "e10", key: "echipamente_descr", label: "Descriere echipamente", value: "2x Centre de prelucrare CNC 5 axe", status: "propus_ai", confidence: 90, source: "solomon_chat", sourceLabel: "Chat Solomon", templates: ["Plan Afaceri", "Buget Estimativ"] },
  { id: "e11", key: "valoare_estimata_eur", label: "Valoare estimată (EUR)", value: "150,000 EUR", status: "propus_ai", confidence: 82, source: "solomon_chat", sourceLabel: "Chat Solomon", templates: ["Plan Afaceri"] },
  { id: "e12", key: "valoare_totala", label: "Valoarea totală proiect", value: null, status: "gol", confidence: 0, source: null, sourceLabel: null, templates: ["Cerere Finanțare", "Buget Estimativ"] },
  { id: "e13", key: "contributie_proprie", label: "Contribuție proprie", value: null, status: "gol", confidence: 0, source: null, sourceLabel: null, templates: ["Cerere Finanțare"] },
  { id: "e14", key: "obiective_specifice", label: "Obiective specifice", value: null, status: "gol", confidence: 0, source: null, sourceLabel: null, templates: ["Cerere Finanțare", "Plan Afaceri"] },
  { id: "e15", key: "rezultate_asteptate", label: "Rezultate așteptate", value: null, status: "gol", confidence: 0, source: null, sourceLabel: null, templates: ["Cerere Finanțare"] },
  { id: "e16", key: "calendar_implementare", label: "Calendar implementare", value: null, status: "gol", confidence: 0, source: null, sourceLabel: null, templates: ["Cerere Finanțare"] },
  { id: "e17", key: "reprezentant_cnp", label: "CNP Reprezentant", value: "178********", status: "propus_ai", confidence: 75, source: "solomon_chat", sourceLabel: "Chat Solomon", templates: ["Cerere Finanțare"] },
  { id: "e18", key: "act_identitate", label: "Act identitate Reprezentant", value: "CI seria AR nr. 456789", status: "confirmat", confidence: 100, source: "manual", sourceLabel: "Completare manuală", templates: ["Cerere Finanțare"] },
];

const CHECKLIST = [
  { id: "d1", name: "Cerere de finanțare", category: "Documente juridice", source: "ghid", templateName: "Cerere Finanțare", done: true },
  { id: "d2", name: "Certificat constatator ORC", category: "Documente juridice", source: "ghid", templateName: null, done: true },
  { id: "d3", name: "Copie act constitutiv actualizat", category: "Documente juridice", source: "ghid", templateName: null, done: false },
  { id: "d4", name: "Copie CI administrator", category: "Documente juridice", source: "ghid", templateName: null, done: true },
  { id: "d5", name: "Certificat de atestare fiscală ANAF", category: "Documente juridice", source: "ghid", templateName: null, done: false },
  { id: "d6", name: "Plan de afaceri", category: "Documente financiare", source: "ghid", templateName: "Plan Afaceri", done: false },
  { id: "d7", name: "Buget estimativ detaliat", category: "Documente financiare", source: "ghid", templateName: "Buget Estimativ", done: false },
  { id: "d8", name: "Bilanț contabil ultimii 3 ani", category: "Documente financiare", source: "ghid", templateName: null, done: false },
  { id: "d9", name: "Oferte de preț (min. 2 furnizori)", category: "Documente financiare", source: "ghid", templateName: null, done: false },
  { id: "d10", name: "Extras de cont bancar", category: "Documente financiare", source: "manual", templateName: null, done: false },
  { id: "d11", name: "Studiu de fezabilitate", category: "Documente tehnice", source: "ghid", templateName: "Studiu de fezabilitate", done: false },
  { id: "d12", name: "Memoriu justificativ investiție", category: "Documente tehnice", source: "ghid", templateName: null, done: false },
  { id: "d13", name: "Specificații tehnice echipamente CNC", category: "Documente tehnice", source: "manual", templateName: null, done: false },
  { id: "d14", name: "Declarație pe propria răspundere", category: "Declarații & Angajamente", source: "ghid", templateName: "Declarație pe propria răspundere", done: false },
  { id: "d15", name: "Declarație ajutoare de minimis", category: "Declarații & Angajamente", source: "ghid", templateName: null, done: false },
  { id: "d16", name: "Angajament privind cofinanțarea", category: "Declarații & Angajamente", source: "ghid", templateName: null, done: false },
  { id: "d17", name: "Declarație GDPR", category: "Declarații & Angajamente", source: "manual", templateName: null, done: false },
];

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "Ciornă", color: "#5a6478", bg: "rgba(90,100,120,0.12)" },
  in_progress: { label: "În lucru", color: "#4d8bff", bg: "rgba(77,139,255,0.12)" },
  review: { label: "Verificare", color: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
  submitted: { label: "Depus", color: "#34d399", bg: "rgba(52,211,153,0.12)" },
};

const pct = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0;

type LeafType = "sumar" | "eligibilitate" | "ghid" | "solomon" | "elemente" | "checklist" | "neemia";

export default function ProjectViewPage() {
  const router = useRouter();
  const [activeLeaf, setActiveLeaf] = useState<LeafType>("sumar");
  const [branches, setBranches] = useState<Record<string, boolean>>({ scriere: true, implementare: false, monitorizare: false });
  const [selectedRule, setSelectedRule] = useState<string | null>(null);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [elemFilter, setElemFilter] = useState("all");
  const [elemSearch, setElemSearch] = useState("");
  const [ghidTab, setGhidTab] = useState<"reguli" | "ghid">("reguli");
  const [checklistItems, setChecklistItems] = useState(CHECKLIST);
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});

  const toggleBranch = (key: string) => setBranches(b => ({ ...b, [key]: !b[key] }));

  const eligPassed = ELIGIBILITY_RULES.filter(r => r.status === "pass").length;
  const eligTotal = ELIGIBILITY_RULES.length;
  const elemFilled = ELEMENTS.filter(e => e.value).length;
  const elemTotal = ELEMENTS.length;
  const checkDone = checklistItems.filter(i => i.done).length;
  const checkTotal = checklistItems.length;

  const filteredElements = ELEMENTS.filter(e => {
    if (elemFilter === "gol" && e.status !== "gol") return false;
    if (elemFilter === "propus_ai" && e.status !== "propus_ai") return false;
    if (elemFilter === "confirmat" && e.status !== "confirmat") return false;
    if (elemSearch) {
      const q = elemSearch.toLowerCase();
      return e.label.toLowerCase().includes(q) || e.key.toLowerCase().includes(q) || (e.value || "").toLowerCase().includes(q);
    }
    return true;
  });

  const checkCategories = [...new Set(checklistItems.map(i => i.category))];

  return (
    <>
      <style>{`
        .pv-container{display:flex;height:100%;overflow:hidden;background:var(--bg-deep)}

        .tree-sidebar{width:260px;min-width:260px;background:var(--bg-surface);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow-y:auto}
        .tree-header{padding:20px 16px 12px;border-bottom:1px solid var(--border)}
        .tree-header h2{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin-bottom:8px}
        .project-name{font-size:17px;font-weight:700;color:var(--text-primary);margin-bottom:2px}
        .project-meta{font-size:12px;color:var(--text-secondary);font-family:var(--font-mono)}
        .project-path{display:flex;flex-wrap:wrap;gap:0;margin-top:8px;font-size:11px;line-height:1.6}
        .project-path .pp-seg{color:var(--text-muted);white-space:nowrap}
        .project-path .pp-seg:last-child{color:var(--accent-blue);font-weight:600}
        .project-path .pp-sep{color:var(--border-active);margin:0 4px;font-size:9px}

        .tree-nav{padding:12px 8px;flex:1}
        .tree-branch{margin-bottom:2px}
        .tree-branch-header{display:flex;align-items:center;gap:6px;padding:8px 10px;border-radius:var(--r-sm);cursor:pointer;font-size:14px;font-weight:600;color:var(--text-secondary);transition:all .15s;user-select:none}
        .tree-branch-header:hover{background:var(--bg-hover);color:var(--text-primary)}
        .tree-leaf{display:flex;align-items:center;gap:8px;padding:7px 10px 7px 34px;border-radius:var(--r-sm);cursor:pointer;font-size:13px;font-weight:500;color:var(--text-secondary);transition:all .15s;position:relative}
        .tree-leaf:hover{background:var(--bg-hover);color:var(--text-primary)}
        .tree-leaf.active{background:rgba(77,139,255,.1);color:var(--accent-blue)}
        .tree-leaf.active::before{content:'';position:absolute;left:12px;top:50%;transform:translateY(-50%);width:3px;height:16px;background:var(--accent-blue);border-radius:2px}
        .leaf-badge{margin-left:auto;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;font-family:var(--font-mono)}
        .leaf-badge.red{background:rgba(248,113,113,.15);color:var(--accent-red)}
        .leaf-badge.green{background:rgba(52,211,153,.15);color:var(--accent-green)}
        .leaf-badge.blue{background:rgba(77,139,255,.15);color:var(--accent-blue)}
        .leaf-badge.muted{background:var(--bg-hover);color:var(--text-muted)}

        .tree-back{padding:12px 16px;border-top:1px solid var(--border);margin-top:auto}
        .tree-back-btn{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-muted);cursor:pointer;padding:8px 10px;border-radius:var(--r-sm);transition:all .15s;border:none;background:none;font-family:var(--font-sans);width:100%}
        .tree-back-btn:hover{background:var(--bg-hover);color:var(--text-primary)}

        .main-content{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}
        .content-header{padding:16px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;background:var(--bg-surface);min-height:56px}
        .content-header h1{font-size:18px;font-weight:700;display:flex;align-items:center;gap:10px}
        .content-body{flex:1;overflow:hidden;min-height:0}

        /* Sumar */
        .sumar-panel{padding:24px;max-width:900px;overflow-y:auto;height:100%}
        .sumar-status{display:flex;align-items:center;gap:12px;margin-bottom:24px}
        .status-badge{display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border-radius:12px;font-size:11px;font-weight:700}
        .sumar-progress{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
        .sp-card{padding:16px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-surface);text-align:center;cursor:pointer;transition:all .15s}
        .sp-card:hover{border-color:var(--border-active)}
        .sp-card .sp-val{font-size:24px;font-weight:800;font-family:var(--font-mono)}
        .sp-card .sp-label{font-size:12px;color:var(--text-secondary);margin-top:4px}
        .sp-card .sp-bar{height:4px;background:var(--bg-deep);border-radius:2px;margin-top:8px;overflow:hidden}
        .sp-card .sp-fill{height:100%;border-radius:2px;transition:width .4s}
        .sumar-info{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
        .si-card{padding:16px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-surface)}
        .si-card h3{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--text-muted);margin-bottom:10px}
        .si-row{display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px}
        .si-row .si-label{color:var(--text-secondary)}
        .si-row .si-value{color:var(--text-primary);font-weight:600;font-family:var(--font-mono)}
        .sumar-actions{display:flex;gap:10px}
        .sa-btn{padding:10px 18px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-surface);color:var(--text-secondary);font-size:13px;font-weight:600;cursor:pointer;font-family:var(--font-sans);transition:all .15s;display:flex;align-items:center;gap:6px}
        .sa-btn:hover{border-color:var(--accent-blue);color:var(--accent-blue)}
        .sa-btn.primary{border-color:var(--accent-blue);background:var(--accent-blue);color:#fff}
        .sa-btn.primary:hover{background:#5d9bff}

        /* Eligibility */
        .elig-panel{padding:24px;max-width:900px;overflow-y:auto;height:100%}
        .elig-summary{display:flex;gap:16px;margin-bottom:24px}
        .elig-stat{padding:16px 20px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-surface);flex:1;text-align:center}
        .elig-stat .number{font-size:28px;font-weight:700;font-family:var(--font-mono)}
        .elig-stat .label{font-size:12px;color:var(--text-secondary);margin-top:4px}
        .elig-rule{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:var(--r-sm);border:1px solid var(--border);margin-bottom:6px;background:var(--bg-surface);transition:all .15s;cursor:pointer}
        .elig-rule:hover{border-color:var(--border-active);background:var(--bg-elevated)}
        .elig-icon{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px}
        .elig-icon.pass{background:rgba(52,211,153,.15);color:var(--accent-green)}
        .elig-icon.fail{background:rgba(248,113,113,.15);color:var(--accent-red)}
        .elig-icon.pending{background:rgba(251,191,36,.15);color:var(--accent-yellow)}
        .elig-name{font-size:14px;font-weight:500;flex:1}
        .elig-detail{font-size:12px;color:var(--text-secondary);font-family:var(--font-mono);max-width:300px;text-align:right}
        .elig-type-badge{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:2px 6px;border-radius:3px;margin-left:8px}
        .elig-type-badge.fixed{background:rgba(52,211,153,.12);color:var(--accent-green)}
        .elig-type-badge.interpreted{background:rgba(251,146,60,.12);color:var(--accent-orange)}

        /* Ghid */
        .ghid-layout{display:flex;flex-direction:column;height:100%}
        .ghid-sub-tabs{display:flex;gap:0;border-bottom:1px solid var(--border);background:var(--bg-surface);padding:0 20px}
        .ghid-sub-tab{padding:12px 20px;font-size:13px;font-weight:600;color:var(--text-secondary);cursor:pointer;border-bottom:2px solid transparent;transition:all .15s;background:none;border-top:none;border-left:none;border-right:none;font-family:var(--font-sans)}
        .ghid-sub-tab:hover{color:var(--text-primary)}
        .ghid-sub-tab.active{color:var(--accent-blue);border-bottom-color:var(--accent-blue)}
        .ghid-split{display:flex;flex:1;overflow:hidden}
        .rules-panel{width:400px;min-width:400px;overflow-y:auto;padding:16px;border-right:1px solid var(--border)}
        .rule-card{padding:12px 14px;border-radius:var(--r-sm);border:1px solid var(--border);margin-bottom:8px;cursor:pointer;transition:all .2s;background:var(--bg-surface)}
        .rule-card:hover,.rule-card.active{border-color:var(--accent-blue);background:rgba(77,139,255,.05)}
        .rule-type-badge{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:3px 10px;border-radius:4px;display:inline-block;margin-bottom:8px}
        .rule-type-badge.fixed{color:var(--accent-green);background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.25)}
        .rule-type-badge.interpreted{color:var(--accent-orange);background:rgba(251,146,60,.12);border:1px solid rgba(251,146,60,.25)}
        .rule-text{font-size:13px;line-height:1.5;color:var(--text-primary)}
        .rule-meta{font-size:11px;color:var(--text-muted);margin-top:6px;font-family:var(--font-mono);display:flex;gap:12px}
        .confidence-bar{width:48px;height:4px;background:var(--bg-deep);border-radius:2px;overflow:hidden;display:inline-block;vertical-align:middle;margin-left:4px}
        .confidence-fill{height:100%;border-radius:2px}
        .pdf-viewer{flex:1;background:var(--bg-deep);display:flex;align-items:center;justify-content:center;position:relative}
        .pdf-page-mock{width:480px;background:#fff;border-radius:4px;box-shadow:0 4px 24px rgba(0,0,0,.4);padding:48px 40px;min-height:620px;color:#1a1a2e;position:relative}
        .pdf-page-mock h3{font-size:16px;font-weight:700;margin-bottom:16px;color:#1a1a2e}
        .pdf-highlight{background:rgba(77,139,255,.2);border-left:3px solid var(--accent-blue);padding:8px 12px;margin:8px 0;border-radius:0 4px 4px 0;animation:highlightPulse 1.5s ease infinite}
        @keyframes highlightPulse{0%,100%{background:rgba(77,139,255,.15)}50%{background:rgba(77,139,255,.3)}}
        .pdf-text-line{height:10px;background:#d4d8e0;border-radius:2px;margin:8px 0}
        .pdf-page-num{position:absolute;bottom:16px;right:24px;font-size:12px;color:#888;font-family:var(--font-mono)}

        /* Elemente */
        .elemente-layout{display:flex;height:100%}
        .elemente-list{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}
        .completitudine-bar{padding:20px 24px;background:var(--bg-surface);border-bottom:1px solid var(--border)}
        .completitudine-top{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px}
        .cl-label{font-size:15px;font-weight:700;color:var(--text-primary)}
        .cl-pct{font-size:28px;font-weight:800;font-family:var(--font-mono)}
        .progress-track{height:8px;background:var(--bg-deep);border-radius:4px;overflow:hidden;display:flex;gap:2px;margin-bottom:10px}
        .progress-seg{height:100%;border-radius:3px;transition:width .5s}
        .completitudine-legend{display:flex;gap:20px;font-size:12px;color:var(--text-secondary)}
        .legend-item{display:flex;align-items:center;gap:6px}
        .legend-dot{width:8px;height:8px;border-radius:50%}
        .li-num{font-weight:700;font-family:var(--font-mono);color:var(--text-primary)}
        .elemente-filter-bar{padding:12px 24px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border);background:var(--bg-surface)}
        .elem-search{padding:7px 14px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-deep);color:var(--text-primary);font-size:13px;font-family:var(--font-sans);outline:none;width:180px}
        .elem-search:focus{border-color:var(--accent-blue)}.elem-search::placeholder{color:var(--text-muted)}
        .fp-group{display:flex;background:var(--bg-deep);border-radius:var(--r-md);padding:3px;gap:2px}
        .fp{padding:5px 14px;border-radius:7px;font-size:12px;font-weight:600;border:none;cursor:pointer;background:transparent;color:var(--text-secondary);font-family:var(--font-sans);transition:all .15s;white-space:nowrap}
        .fp:hover{color:var(--text-primary)}.fp.on{background:var(--accent-blue);color:#fff}
        .fp.on-green{background:var(--accent-green);color:var(--bg-deep)}
        .fp.on-yellow{background:var(--accent-yellow);color:var(--bg-deep)}
        .fp.on-red{background:var(--accent-red);color:#fff}
        .elemente-scroll{flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:10px}
        .elem-card{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r-md);padding:14px 18px;cursor:pointer;transition:all .18s}
        .elem-card:hover{border-color:var(--border-active);background:var(--bg-elevated)}
        .elem-card.active{border-color:var(--accent-blue);background:rgba(77,139,255,.04)}
        .ec-top{display:flex;align-items:center;gap:8px;margin-bottom:4px}
        .ec-key{font-size:12px;font-family:var(--font-mono);color:var(--text-muted)}
        .ec-status{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px}
        .ec-status.confirmat{background:rgba(52,211,153,.15);color:var(--accent-green)}
        .ec-status.propus_ai{background:rgba(251,191,36,.15);color:var(--accent-yellow)}
        .ec-status.gol{background:rgba(248,113,113,.12);color:var(--accent-red)}
        .ec-label{font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:4px}
        .ec-value{font-size:13px;font-family:var(--font-mono);color:var(--accent-blue)}
        .ec-value.missing{color:var(--accent-red);font-style:italic}
        .ec-source{font-size:11px;color:var(--text-muted);margin-top:4px;display:flex;align-items:center;gap:4px}
        .source-dot{width:6px;height:6px;border-radius:50%;display:inline-block}
        .source-dot.company_data{background:var(--accent-green)}
        .source-dot.solomon_chat{background:var(--accent-blue)}
        .source-dot.manual{background:var(--accent-purple)}

        .elem-detail{width:350px;min-width:350px;border-left:1px solid var(--border);background:var(--bg-surface);overflow-y:auto;padding:20px}
        .ed-header{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin-bottom:16px}
        .ed-field{margin-bottom:16px}
        .ed-label{font-size:12px;color:var(--text-muted);margin-bottom:4px}
        .ed-val{font-size:15px;font-weight:600;color:var(--text-primary);padding:10px 14px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--bg-elevated)}
        .ed-btn{padding:8px 16px;border-radius:var(--r-sm);border:1px solid var(--accent-green);background:transparent;color:var(--accent-green);font-size:12px;font-weight:600;cursor:pointer;font-family:var(--font-sans);transition:all .15s;display:flex;align-items:center;gap:4px}
        .ed-btn:hover{background:rgba(52,211,153,.1)}

        /* Checklist */
        .checklist-panel{padding:24px;max-width:900px;overflow-y:auto;height:100%}
        .check-progress{display:flex;align-items:center;gap:16px;margin-bottom:24px;padding:20px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-surface)}
        .check-ring{width:80px;height:80px;position:relative;flex-shrink:0}
        .check-ring svg{transform:rotate(-90deg)}
        .check-ring-text{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;font-family:var(--font-mono)}
        .check-info{flex:1}
        .check-info .ci-title{font-size:16px;font-weight:700;margin-bottom:4px}
        .check-info .ci-sub{font-size:13px;color:var(--text-secondary)}
        .check-category{margin-bottom:16px}
        .check-cat-header{display:flex;align-items:center;gap:8px;padding:8px 0;cursor:pointer;font-size:14px;font-weight:700;color:var(--text-secondary)}
        .check-cat-header:hover{color:var(--text-primary)}
        .check-cat-count{font-size:11px;color:var(--text-muted);font-family:var(--font-mono)}
        .check-item{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:var(--r-sm);margin-bottom:4px;transition:background .12s}
        .check-item:hover{background:var(--bg-hover)}
        .check-box{width:18px;height:18px;border-radius:4px;border:2px solid var(--border);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .15s;flex-shrink:0;font-size:11px}
        .check-box.done{border-color:var(--accent-green);background:var(--accent-green);color:#fff}
        .check-name{font-size:13px;font-weight:500;flex:1}
        .check-name.done-text{text-decoration:line-through;color:var(--text-muted)}
        .check-source-badge{font-size:9px;font-weight:700;text-transform:uppercase;padding:2px 6px;border-radius:3px;letter-spacing:.5px}
        .check-source-badge.ghid{background:rgba(77,139,255,.12);color:var(--accent-blue)}
        .check-source-badge.manual{background:rgba(167,139,250,.12);color:var(--accent-purple)}
        .check-template{font-size:11px;color:var(--accent-blue);cursor:pointer;white-space:nowrap}
        .check-template:hover{text-decoration:underline}

        .coming-soon{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--text-muted);gap:12px}
        .coming-soon .cs-icon{font-size:48px;opacity:.5}
        .coming-soon .cs-label{font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:1px}
        .coming-soon .cs-desc{font-size:13px;color:var(--text-secondary)}
      `}</style>

      <div className="pv-container">
        {/* ─── SIDEBAR TREE ─── */}
        <div className="tree-sidebar">
          <div className="tree-header">
            <h2>Proiect</h2>
            <div className="project-name">{PROJECT.name}</div>
            <div className="project-meta">{PROJECT.firma} &middot; {PROJECT.cui}</div>
            <div className="project-path">
              {PROJECT.path.map((seg, i) => (
                <span key={i}>
                  {i > 0 && <span className="pp-sep">&rsaquo;</span>}
                  <span className="pp-seg">{seg.label}</span>
                </span>
              ))}
            </div>
            <div style={{ marginTop: 8 }}>
              <span className="status-badge" style={{ background: STATUS_MAP[PROJECT.status].bg, color: STATUS_MAP[PROJECT.status].color }}>
                {STATUS_MAP[PROJECT.status].label}
              </span>
            </div>
          </div>

          <div className="tree-nav">
            {/* Sumar leaf */}
            <div className={`tree-leaf ${activeLeaf === "sumar" ? "active" : ""}`} onClick={() => setActiveLeaf("sumar")}>
              <span>&#128203;</span> Sumar
            </div>

            {/* Scriere proiect branch */}
            <div className="tree-branch">
              <div className="tree-branch-header" onClick={() => toggleBranch("scriere")}>
                <span style={{ fontSize: 10, transition: "transform .15s", transform: branches.scriere ? "rotate(90deg)" : "none" }}>&#9654;</span>
                Scriere proiect
              </div>
              {branches.scriere && (
                <div>
                  <div className={`tree-leaf ${activeLeaf === "eligibilitate" ? "active" : ""}`} onClick={() => setActiveLeaf("eligibilitate")}>
                    <span>&#128737;</span> Eligibilitate
                    <span className={`leaf-badge ${eligPassed === eligTotal ? "green" : eligPassed > 0 ? "blue" : "red"}`}>{eligPassed}/{eligTotal}</span>
                  </div>
                  <div className={`tree-leaf ${activeLeaf === "ghid" ? "active" : ""}`} onClick={() => setActiveLeaf("ghid")}>
                    <span>&#128214;</span> Ghid Finanțare
                    <span className="leaf-badge blue">{GUIDE_RULES.length}</span>
                  </div>
                  <div className={`tree-leaf ${activeLeaf === "solomon" ? "active" : ""}`} onClick={() => setActiveLeaf("solomon")}>
                    <span>&#129302;</span> Solomon
                    <span className="leaf-badge muted">Opus</span>
                  </div>
                  <div className={`tree-leaf ${activeLeaf === "elemente" ? "active" : ""}`} onClick={() => setActiveLeaf("elemente")}>
                    <span>&#128202;</span> Elemente
                    <span className={`leaf-badge ${elemFilled === elemTotal ? "green" : "blue"}`}>{elemFilled}/{elemTotal}</span>
                  </div>
                  <div className={`tree-leaf ${activeLeaf === "checklist" ? "active" : ""}`} onClick={() => setActiveLeaf("checklist")}>
                    <span>&#128203;</span> Checklist doc
                    <span className={`leaf-badge ${checkDone === checkTotal ? "green" : checkDone > 0 ? "blue" : "red"}`}>{checkDone}/{checkTotal}</span>
                  </div>
                  <div className={`tree-leaf ${activeLeaf === "neemia" ? "active" : ""}`} onClick={() => setActiveLeaf("neemia")}>
                    <span>&#128196;</span> Neemia
                    <span className="leaf-badge muted">0/3</span>
                  </div>
                </div>
              )}
            </div>

            {/* Implementare branch */}
            <div className="tree-branch">
              <div className="tree-branch-header" onClick={() => toggleBranch("implementare")}>
                <span style={{ fontSize: 10, transition: "transform .15s", transform: branches.implementare ? "rotate(90deg)" : "none" }}>&#9654;</span>
                Implementare
                <span className="leaf-badge muted" style={{ marginLeft: "auto" }}>TBD</span>
              </div>
            </div>

            {/* Monitorizare branch */}
            <div className="tree-branch">
              <div className="tree-branch-header" onClick={() => toggleBranch("monitorizare")}>
                <span style={{ fontSize: 10, transition: "transform .15s", transform: branches.monitorizare ? "rotate(90deg)" : "none" }}>&#9654;</span>
                Monitorizare
                <span className="leaf-badge muted" style={{ marginLeft: "auto" }}>TBD</span>
              </div>
            </div>
          </div>

          <div className="tree-back">
            <button className="tree-back-btn" onClick={() => router.push("/projects")}>
              &larr; Toate proiectele
            </button>
          </div>
        </div>

        {/* ─── MAIN CONTENT ─── */}
        <div className="main-content">
          <div className="content-header">
            <h1>
              {activeLeaf === "sumar" && <><span>&#128203;</span> Sumar proiect</>}
              {activeLeaf === "eligibilitate" && <><span>&#128737;</span> Eligibilitate</>}
              {activeLeaf === "ghid" && <><span>&#128214;</span> Ghid Finanțare</>}
              {activeLeaf === "solomon" && <><span>&#129302;</span> Solomon</>}
              {activeLeaf === "elemente" && <><span>&#128202;</span> Elemente proiect</>}
              {activeLeaf === "checklist" && <><span>&#128203;</span> Checklist documente</>}
              {activeLeaf === "neemia" && <><span>&#128196;</span> Neemia</>}
            </h1>
          </div>

          <div className="content-body">
            {/* ═══ SUMAR ═══ */}
            {activeLeaf === "sumar" && (
              <div className="sumar-panel">
                <div className="sumar-status">
                  <span style={{ fontSize: 20, fontWeight: 800 }}>{PROJECT.name}</span>
                </div>

                <div className="sumar-progress">
                  {[
                    { label: "Eligibilitate", val: `${eligPassed}/${eligTotal}`, p: pct(eligPassed, eligTotal), color: eligPassed === eligTotal ? "#34d399" : "#fbbf24", leaf: "eligibilitate" as LeafType },
                    { label: "Elemente", val: `${elemFilled}/${elemTotal}`, p: pct(elemFilled, elemTotal), color: elemFilled === elemTotal ? "#34d399" : "#4d8bff", leaf: "elemente" as LeafType },
                    { label: "Checklist doc", val: `${checkDone}/${checkTotal}`, p: pct(checkDone, checkTotal), color: checkDone === checkTotal ? "#34d399" : "#fb923c", leaf: "checklist" as LeafType },
                    { label: "Neemia", val: "0/3", p: 0, color: "#a78bfa", leaf: "neemia" as LeafType },
                  ].map(item => (
                    <div className="sp-card" key={item.label} onClick={() => setActiveLeaf(item.leaf)}>
                      <div className="sp-val" style={{ color: item.color }}>{item.val}</div>
                      <div className="sp-label">{item.label}</div>
                      <div className="sp-bar"><div className="sp-fill" style={{ width: `${item.p}%`, background: item.color }} /></div>
                    </div>
                  ))}
                </div>

                <div className="sumar-info">
                  <div className="si-card">
                    <h3>Date firmă</h3>
                    <div className="si-row"><span className="si-label">CUI</span><span className="si-value">{PROJECT.cui}</span></div>
                    <div className="si-row"><span className="si-label">Forma juridică</span><span className="si-value">{PROJECT.company.formaJuridica}</span></div>
                    <div className="si-row"><span className="si-label">CAEN</span><span className="si-value">{PROJECT.company.caen}</span></div>
                    <div className="si-row"><span className="si-label">Localitate</span><span className="si-value">{PROJECT.company.localitate}, {PROJECT.company.judet}</span></div>
                  </div>
                  <div className="si-card">
                    <h3>Date financiare</h3>
                    <div className="si-row"><span className="si-label">Capital social</span><span className="si-value">{PROJECT.company.capitalSocial}</span></div>
                    <div className="si-row"><span className="si-label">Cifra afaceri</span><span className="si-value">{PROJECT.company.cifraAfaceri}</span></div>
                    <div className="si-row"><span className="si-label">Valoare proiect</span><span className="si-value">{PROJECT.valoare}</span></div>
                  </div>
                </div>

                <div className="sumar-actions">
                  <button className="sa-btn primary" onClick={() => setActiveLeaf("eligibilitate")}>&#128737; Verifică eligibilitate</button>
                  <button className="sa-btn" onClick={() => setActiveLeaf("solomon")}>&#129302; Deschide Solomon</button>
                  <button className="sa-btn" onClick={() => setActiveLeaf("neemia")}>&#128196; Generează documente</button>
                </div>
              </div>
            )}

            {/* ═══ ELIGIBILITATE ═══ */}
            {activeLeaf === "eligibilitate" && (
              <div className="elig-panel">
                <div className="elig-summary">
                  <div className="elig-stat">
                    <div className="number" style={{ color: "var(--accent-green)" }}>{ELIGIBILITY_RULES.filter(r => r.status === "pass").length}</div>
                    <div className="label">Trecute</div>
                  </div>
                  <div className="elig-stat">
                    <div className="number" style={{ color: "var(--accent-red)" }}>{ELIGIBILITY_RULES.filter(r => r.status === "fail").length}</div>
                    <div className="label">Eșuate</div>
                  </div>
                  <div className="elig-stat">
                    <div className="number" style={{ color: "var(--accent-yellow)" }}>{ELIGIBILITY_RULES.filter(r => r.status === "pending").length}</div>
                    <div className="label">Pending</div>
                  </div>
                  <div className="elig-stat">
                    <div className="number">{ELIGIBILITY_RULES.length}</div>
                    <div className="label">Total</div>
                  </div>
                </div>

                {ELIGIBILITY_RULES.map(rule => (
                  <div className="elig-rule" key={rule.id}>
                    <div className={`elig-icon ${rule.status}`}>
                      {rule.status === "pass" ? "✓" : rule.status === "fail" ? "✕" : "?"}
                    </div>
                    <div className="elig-name">
                      {rule.name}
                      <span className={`elig-type-badge ${rule.type}`}>
                        {rule.type === "fixed" ? "⚡ FIXĂ" : "🧠 INTERPRETATĂ"}
                      </span>
                      {rule.type === "interpreted" && (rule as any).confidence < 0.85 && (
                        <span style={{ fontSize: 10, color: "var(--accent-yellow)", marginLeft: 6 }}>⚠️ Review</span>
                      )}
                    </div>
                    <div className="elig-detail">{rule.detail}</div>
                  </div>
                ))}

                <div style={{ marginTop: 16 }}>
                  <button className="sa-btn primary" style={{ display: "inline-flex" }}>&#128260; Re-verifică eligibilitate</button>
                </div>
              </div>
            )}

            {/* ═══ GHID FINANȚARE ═══ */}
            {activeLeaf === "ghid" && (
              <div className="ghid-layout">
                <div className="ghid-sub-tabs">
                  <button className={`ghid-sub-tab ${ghidTab === "reguli" ? "active" : ""}`} onClick={() => setGhidTab("reguli")}>Reguli ({GUIDE_RULES.length})</button>
                  <button className={`ghid-sub-tab ${ghidTab === "ghid" ? "active" : ""}`} onClick={() => setGhidTab("ghid")}>Ghid complet</button>
                </div>
                <div className="ghid-split">
                  {ghidTab === "reguli" ? (
                    <>
                      <div className="rules-panel">
                        {GUIDE_RULES.map(r => (
                          <div className={`rule-card ${selectedRule === r.id ? "active" : ""}`} key={r.id} onClick={() => setSelectedRule(r.id)}>
                            <div className={`rule-type-badge ${r.type}`}>
                              {r.type === "fixed" ? "FIXĂ" : "INTERPRETATĂ"}
                              {r.type === "interpreted" && r.confidence < 0.85 && <span style={{ marginLeft: 6, color: "var(--accent-yellow)", fontSize: 10 }}>⚠️ Review</span>}
                            </div>
                            <div className="rule-text">{r.text}</div>
                            <div className="rule-meta">
                              <span>Pag. {r.page}</span>
                              <span>§{r.section}</span>
                              <span>
                                {Math.round(r.confidence * 100)}%
                                <span className="confidence-bar"><span className="confidence-fill" style={{ width: `${r.confidence * 100}%`, background: r.confidence > 0.9 ? "var(--accent-green)" : r.confidence > 0.8 ? "var(--accent-blue)" : "var(--accent-yellow)" }} /></span>
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="pdf-viewer">
                        <div className="pdf-page-mock">
                          <h3>Secțiunea {selectedRule ? GUIDE_RULES.find(r => r.id === selectedRule)?.section || "3.1" : "3.1"} — Eligibilitate</h3>
                          <div className="pdf-text-line" style={{ width: "90%" }} />
                          <div className="pdf-text-line" style={{ width: "80%" }} />
                          <div className="pdf-text-line" style={{ width: "85%" }} />
                          {selectedRule && (
                            <div className="pdf-highlight">
                              <span style={{ fontSize: 13, lineHeight: 1.6 }}>
                                {GUIDE_RULES.find(r => r.id === selectedRule)?.text}
                              </span>
                            </div>
                          )}
                          <div className="pdf-text-line" style={{ width: "75%" }} />
                          <div className="pdf-text-line" style={{ width: "88%" }} />
                          <div className="pdf-text-line" style={{ width: "60%" }} />
                          <div className="pdf-text-line" style={{ width: "92%" }} />
                          <div className="pdf-text-line" style={{ width: "70%" }} />
                          <div className="pdf-page-num">Pag. {selectedRule ? GUIDE_RULES.find(r => r.id === selectedRule)?.page || 8 : 8}</div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="pdf-viewer" style={{ width: "100%" }}>
                      <div className="pdf-page-mock">
                        <h3>Ghid de Finanțare — Măsura 1</h3>
                        {Array.from({ length: 15 }).map((_, i) => (
                          <div className="pdf-text-line" key={i} style={{ width: `${60 + Math.random() * 35}%` }} />
                        ))}
                        <div className="pdf-page-num">Pag. 1 / 42</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ═══ ELEMENTE ═══ */}
            {activeLeaf === "elemente" && (
              <div className="elemente-layout">
                <div className="elemente-list">
                  <div className="completitudine-bar">
                    <div className="completitudine-top">
                      <span className="cl-label">Completitudine elemente</span>
                      <span className="cl-pct" style={{ color: pct(elemFilled, elemTotal) === 100 ? "var(--accent-green)" : "var(--accent-blue)" }}>
                        {pct(elemFilled, elemTotal)}%
                      </span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-seg" style={{ width: `${pct(ELEMENTS.filter(e => e.status === "confirmat").length, elemTotal) * 100 / 100}%`, background: "var(--accent-green)" }} />
                      <div className="progress-seg" style={{ width: `${pct(ELEMENTS.filter(e => e.status === "propus_ai").length, elemTotal) * 100 / 100}%`, background: "var(--accent-yellow)" }} />
                      <div className="progress-seg" style={{ width: `${pct(ELEMENTS.filter(e => e.status === "gol").length, elemTotal) * 100 / 100}%`, background: "var(--accent-red)", opacity: 0.4 }} />
                    </div>
                    <div className="completitudine-legend">
                      <div className="legend-item"><span className="legend-dot" style={{ background: "var(--accent-green)" }} /><span className="li-num">{ELEMENTS.filter(e => e.status === "confirmat").length}</span> Confirmate</div>
                      <div className="legend-item"><span className="legend-dot" style={{ background: "var(--accent-yellow)" }} /><span className="li-num">{ELEMENTS.filter(e => e.status === "propus_ai").length}</span> Propuse AI</div>
                      <div className="legend-item"><span className="legend-dot" style={{ background: "var(--accent-red)" }} /><span className="li-num">{ELEMENTS.filter(e => e.status === "gol").length}</span> Goale</div>
                    </div>
                  </div>

                  <div className="elemente-filter-bar">
                    <input className="elem-search" placeholder="Caută element..." value={elemSearch} onChange={e => setElemSearch(e.target.value)} />
                    <div className="fp-group">
                      <button className={`fp ${elemFilter === "all" ? "on" : ""}`} onClick={() => setElemFilter("all")}>Toate</button>
                      <button className={`fp ${elemFilter === "confirmat" ? "on-green" : ""}`} onClick={() => setElemFilter("confirmat")}>Confirmate</button>
                      <button className={`fp ${elemFilter === "propus_ai" ? "on-yellow" : ""}`} onClick={() => setElemFilter("propus_ai")}>Propuse AI</button>
                      <button className={`fp ${elemFilter === "gol" ? "on-red" : ""}`} onClick={() => setElemFilter("gol")}>Goale</button>
                    </div>
                  </div>

                  <div className="elemente-scroll">
                    {filteredElements.map(el => (
                      <div className={`elem-card ${selectedElement === el.id ? "active" : ""}`} key={el.id} onClick={() => setSelectedElement(el.id)}>
                        <div className="ec-top">
                          <span className="ec-key">{el.key}</span>
                          <span className={`ec-status ${el.status}`}>
                            {el.status === "confirmat" ? "✓ Confirmat" : el.status === "propus_ai" ? "AI Propus" : "Gol"}
                          </span>
                        </div>
                        <div className="ec-label">{el.label}</div>
                        <div className={`ec-value ${!el.value ? "missing" : ""}`}>
                          {el.value || "— necompletat —"}
                        </div>
                        {el.sourceLabel && (
                          <div className="ec-source">
                            <span className={`source-dot ${el.source}`} />
                            {el.sourceLabel}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {selectedElement && (() => {
                  const el = ELEMENTS.find(e => e.id === selectedElement);
                  if (!el) return null;
                  return (
                    <div className="elem-detail">
                      <div className="ed-header">Detalii element</div>
                      <div className="ed-field">
                        <div className="ed-label">Key</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-muted)" }}>{el.key}</div>
                      </div>
                      <div className="ed-field">
                        <div className="ed-label">Label</div>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>{el.label}</div>
                      </div>
                      <div className="ed-field">
                        <div className="ed-label">Status</div>
                        <span className={`ec-status ${el.status}`}>
                          {el.status === "confirmat" ? "✓ Confirmat" : el.status === "propus_ai" ? "AI Propus" : "Gol"}
                        </span>
                      </div>
                      <div className="ed-field">
                        <div className="ed-label">Valoare curentă</div>
                        <div className="ed-val">{el.value || "—"}</div>
                      </div>
                      {el.sourceLabel && (
                        <div className="ed-field">
                          <div className="ed-label">Sursă</div>
                          <div className="ec-source" style={{ fontSize: 13 }}>
                            <span className={`source-dot ${el.source}`} />
                            {el.sourceLabel}
                          </div>
                        </div>
                      )}
                      {el.templates.length > 0 && (
                        <div className="ed-field">
                          <div className="ed-label">Folosit în template-uri</div>
                          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                            {el.templates.join(", ")}
                          </div>
                        </div>
                      )}
                      {el.status === "propus_ai" && (
                        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                          <button className="ed-btn">✓ Confirmă</button>
                          <button className="ed-btn" style={{ borderColor: "var(--accent-yellow)", color: "var(--accent-yellow)" }}>&#9998; Editează</button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ═══ CHECKLIST ═══ */}
            {activeLeaf === "checklist" && (
              <div className="checklist-panel">
                <div className="check-progress">
                  <div className="check-ring">
                    <svg width="80" height="80" viewBox="0 0 80 80">
                      <circle cx="40" cy="40" r="34" fill="none" stroke="var(--bg-deep)" strokeWidth="6" />
                      <circle cx="40" cy="40" r="34" fill="none" stroke="var(--accent-green)" strokeWidth="6"
                        strokeDasharray={`${2 * Math.PI * 34}`}
                        strokeDashoffset={`${2 * Math.PI * 34 * (1 - checkDone / checkTotal)}`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="check-ring-text">{pct(checkDone, checkTotal)}%</div>
                  </div>
                  <div className="check-info">
                    <div className="ci-title">{checkDone} din {checkTotal} documente bifate</div>
                    <div className="ci-sub">Documente necesare pentru dosarul de finanțare</div>
                  </div>
                </div>

                {checkCategories.map(cat => {
                  const catItems = checklistItems.filter(i => i.category === cat);
                  const catDone = catItems.filter(i => i.done).length;
                  const isCollapsed = collapsedCats[cat];

                  return (
                    <div className="check-category" key={cat}>
                      <div className="check-cat-header" onClick={() => setCollapsedCats(c => ({ ...c, [cat]: !c[cat] }))}>
                        <span style={{ fontSize: 10, transition: "transform .15s", transform: isCollapsed ? "none" : "rotate(90deg)" }}>&#9654;</span>
                        {cat}
                        <span className="check-cat-count">{catDone}/{catItems.length}</span>
                      </div>
                      {!isCollapsed && catItems.map(item => (
                        <div className="check-item" key={item.id}>
                          <div className={`check-box ${item.done ? "done" : ""}`}
                            onClick={() => setChecklistItems(items => items.map(i => i.id === item.id ? { ...i, done: !i.done } : i))}>
                            {item.done && "✓"}
                          </div>
                          <span className={`check-name ${item.done ? "done-text" : ""}`}>{item.name}</span>
                          <span className={`check-source-badge ${item.source}`}>{item.source}</span>
                          {item.templateName && (
                            <span className="check-template" onClick={() => setActiveLeaf("neemia")}>
                              &#128196; {item.templateName}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ═══ SOLOMON (placeholder for Phase 5) ═══ */}
            {activeLeaf === "solomon" && (
              <div className="coming-soon">
                <div className="cs-icon">&#129302;</div>
                <div className="cs-label">Solomon</div>
                <div className="cs-desc">Asistentul AI de colectare date — va fi implementat în Faza 5</div>
              </div>
            )}

            {/* ═══ NEEMIA (placeholder for Phase 6) ═══ */}
            {activeLeaf === "neemia" && (
              <div className="coming-soon">
                <div className="cs-icon">&#128196;</div>
                <div className="cs-label">Neemia</div>
                <div className="cs-desc">Generare automată documente DOCX/XLSX/PDF — va fi implementat în Faza 6</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
