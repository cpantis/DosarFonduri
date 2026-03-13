import { useState } from "react";

const projectData = {
  company: "ANDA OANA AGRO FERMA S.R.L.",
  cui: "38480585",
  guide: "sM 4.1 — Componenta 4.1.1",
  session: "Sesiunea 2024",
  status: "În lucru",
  elements: { populated: 18, total: 25 },
  score: { current: 72, threshold: 56 },
};

const sidebarSections = [
  {
    key: "preeligibilitate",
    icon: "📋",
    label: "Pre-eligibilitate",
    badge: "8/10",
    badgeColor: "emerald",
  },
  {
    key: "elemente",
    icon: "📊",
    label: "Elemente din Ghid",
    badge: "18/25",
    badgeColor: "amber",
    children: [
      { key: "beneficiar", icon: "👤", label: "Beneficiar", badge: "6/6", done: true },
      { key: "exploatatie", icon: "🌾", label: "Exploatație", badge: "4/5", done: false },
      { key: "investitie", icon: "🚜", label: "Investiție", badge: "3/7", done: false },
      { key: "localizare", icon: "📍", label: "Localizare", badge: "2/2", done: true },
      { key: "financiar", icon: "💰", label: "Financiar", badge: "2/5", done: false },
    ],
  },
  { key: "documente", icon: "📄", label: "Documente", badge: "5/12", badgeColor: "red" },
  { key: "scriere", icon: "✏️", label: "Scriere proiect", badge: null },
  { key: "punctaj", icon: "🧮", label: "Punctaj estimat", badge: "72p", badgeColor: "emerald" },
  { key: "solomon", icon: "💬", label: "Solomon", badge: null },
];

const elements = [
  { key: "denumire_solicitant", label: "Denumire solicitant", value: "ANDA OANA AGRO FERMA S.R.L.", source: "ONRC", category: "beneficiar", status: "valid", rules: ["EG1"] },
  { key: "cui", label: "Cod unic de înregistrare", value: "38480585", source: "ONRC", category: "beneficiar", status: "valid", rules: ["EG1"] },
  { key: "caen_principal", label: "CAEN principal", value: "0111 — Cultivarea cerealelor", source: "ONRC", category: "beneficiar", status: "valid", rules: ["EG1", "EG2"] },
  { key: "forma_juridica", label: "Formă juridică", value: "SRL", source: "ONRC", category: "beneficiar", status: "valid", rules: ["EG1"] },
  { key: "data_inregistrare", label: "Data înregistrare", value: "13.11.2017", source: "ONRC", category: "beneficiar", status: "valid", rules: ["CS3"] },
  { key: "stare_firma", label: "Stare firmă", value: "funcțiune", source: "ONRC", category: "beneficiar", status: "valid", rules: ["EG1"] },
  { key: "suprafata_exploatatie", label: "Suprafață exploatație", value: "270,70 ha", source: "Solomon", category: "exploatatie", status: "valid", rules: ["EG3", "CS1", "Anexa3"], lookup: { table: "Anexa 3, Tabel 1", interval: "201–500 ha", putere_max: "400 CP", coeficient: "2.0" } },
  { key: "tip_cultura", label: "Tip cultură", value: "Cultură mare", source: "Solomon", category: "exploatatie", status: "valid", rules: ["Anexa3"] },
  { key: "uat_implementare", label: "UAT implementare", value: "Mun. Arad, Zădăreni", source: "Document", category: "localizare", status: "valid", rules: ["CS4", "Anexa4"], lookup: { table: "Anexa 4 — Lista UAT ANC", result: "ANC Semnificativ", majorare: "+20pp" } },
  { key: "zona_anc", label: "Zonă ANC", value: "ANC Semnificativ", source: "Calculat", category: "localizare", status: "valid", rules: ["CS4"] },
  { key: "putere_tractor", label: "Putere tractor propus", value: "340 CP", source: "Document", category: "investitie", status: "valid", rules: ["Anexa3"], lookup: { table: "Anexa 3, Tabel 1", limit: "400 CP max", result: "CONFORM (340 < 400)" } },
  { key: "tehnologie", label: "Tehnologie utilaje", value: "No-till", source: "Solomon", category: "investitie", status: "valid", rules: ["CS2"] },
  { key: "valoare_investitie", label: "Valoare totală investiție", value: "455.090 EUR", source: "Document", category: "investitie", status: "valid", rules: ["CS5"] },
  { key: "cifra_afaceri_2023", label: "Cifra de afaceri 2023", value: "1.913.806 LEI", source: "ONRC", category: "financiar", status: "valid", rules: ["EG5"] },
  { key: "profit_net_2023", label: "Profit net 2023", value: "54.340 LEI", source: "ONRC", category: "financiar", status: "warning", rules: ["EG5", "EG6"], warning: "Profit scăzut vs. anii anteriori" },
  { key: "intensitate_sprijin", label: "Intensitate sprijin", value: "70%", source: "Calculat", category: "financiar", status: "valid", rules: ["CS6"], lookup: { baza: "50%", majorare_anc: "+20pp", total: "70%" } },
  { key: "utilaje_propuse", label: "Utilaje propuse", value: null, source: null, category: "investitie", status: "pending", rules: ["CS2", "Anexa3"] },
  { key: "plan_cultura", label: "Plan de cultură 5 ani", value: null, source: null, category: "exploatatie", status: "pending", rules: ["EG3"] },
  { key: "cofinantare", label: "Sursă cofinanțare", value: null, source: null, category: "financiar", status: "pending", rules: ["EG4"] },
  { key: "procedura_mediu", label: "Procedură evaluare mediu", value: null, source: null, category: "investitie", status: "pending", rules: ["EG7"] },
  { key: "expert_contabil", label: "Declarație expert contabil", value: null, source: null, category: "financiar", status: "pending", rules: ["CS3"] },
];

const scoring = [
  { code: "CS1", name: "Dimensiune exploatație (SO)", max: 30, awarded: 25, status: "evaluated", detail: "SO estimat: 85.000 EUR → interval 50.001–100.000" },
  { code: "CS2", name: "Tehnologie no-till/min-till", max: 15, awarded: 15, status: "evaluated", detail: "Utilaje no-till confirmate în oferta de preț" },
  { code: "CS3", name: "Vechime întreprindere", max: 20, awarded: 20, status: "evaluated", detail: "Înregistrare 2017 → > 3 ani activitate" },
  { code: "CS4", name: "Zona ANC", max: 10, awarded: 10, status: "evaluated", detail: "UAT Arad → ANC Semnificativ (Anexa 4)" },
  { code: "CS5", name: "Valoare sprijin solicitat", max: 15, awarded: 0, status: "pending", detail: "Necesită calcul final valoare eligibilă" },
  { code: "CS6", name: "Intensitate sprijin", max: 5, awarded: 2, status: "evaluated", detail: "Intensitate 70% > 50% bază → 2p" },
  { code: "CS7", name: "Formă asociativă", max: 5, awarded: 0, status: "not_applicable", detail: "Solicitantul nu e membru formă asociativă" },
];

const sourceBadge = (source) => {
  const styles = {
    ONRC: "bg-blue-50 text-blue-700 border-blue-200",
    ANAF: "bg-indigo-50 text-indigo-700 border-indigo-200",
    Solomon: "bg-violet-50 text-violet-700 border-violet-200",
    Document: "bg-amber-50 text-amber-700 border-amber-200",
    Calculat: "bg-slate-100 text-slate-600 border-slate-200",
  };
  if (!source) return null;
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${styles[source] || styles.Calculat}`}>
      {source}
    </span>
  );
};

const statusDot = (status) => {
  const colors = { valid: "bg-emerald-400", warning: "bg-amber-400", invalid: "bg-red-400", pending: "bg-slate-300" };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status] || colors.pending}`} />;
};

const ProjectSidebar = ({ activeSection, setActiveSection, activeCategory, setActiveCategory }) => (
  <div className="w-64 min-h-screen bg-slate-900 text-slate-300 flex flex-col">
    <div className="p-5 border-b border-slate-800">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs font-bold">DF</div>
        <span className="text-white font-semibold text-[15px] tracking-tight">DosarFonduri</span>
      </div>
      <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50">
        <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-1">Firmă activă</div>
        <div className="text-white text-[13px] font-medium leading-tight">COMEXIM R SRL</div>
        <div className="text-slate-500 text-[11px] mt-0.5">CUI: 2146135</div>
      </div>
    </div>

    <div className="p-3 flex-1 overflow-y-auto">
      <div className="text-[10px] uppercase tracking-[0.12em] text-slate-600 font-medium px-3 mb-2 mt-2">Proiect</div>
      <div className="bg-slate-800/40 rounded-lg p-3 mx-1 mb-4 border border-slate-700/30">
        <div className="text-white text-[13px] font-medium leading-tight">Modernizare fermă</div>
        <div className="text-slate-500 text-[11px] mt-1">ANDA OANA AGRO FERMA</div>
        <div className="text-slate-600 text-[10px] mt-1">sM 4.1 · Sesiunea 2024</div>
      </div>

      <div className="text-[10px] uppercase tracking-[0.12em] text-slate-600 font-medium px-3 mb-2">Secțiuni</div>
      <nav className="space-y-0.5">
        {sidebarSections.map((section) => (
          <div key={section.key}>
            <button
              onClick={() => { setActiveSection(section.key); if (section.children) setActiveCategory(section.children[0].key); }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] transition-all ${
                activeSection === section.key
                  ? "bg-slate-800 text-white border-l-2 border-blue-500 pl-[10px]"
                  : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <span className="text-[14px]">{section.icon}</span>
                <span>{section.label}</span>
              </span>
              {section.badge && (
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${
                  section.badgeColor === "emerald" ? "bg-emerald-500/20 text-emerald-400" :
                  section.badgeColor === "amber" ? "bg-amber-500/20 text-amber-400" :
                  section.badgeColor === "red" ? "bg-red-500/20 text-red-400" :
                  "bg-slate-700 text-slate-400"
                }`}>
                  {section.badge}
                </span>
              )}
            </button>
            {section.children && activeSection === section.key && (
              <div className="ml-6 mt-1 space-y-0.5 border-l border-slate-700/50 pl-3">
                {section.children.map((child) => (
                  <button
                    key={child.key}
                    onClick={() => setActiveCategory(child.key)}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-[12px] transition-all ${
                      activeCategory === child.key
                        ? "text-white bg-slate-800/60"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-[12px]">{child.icon}</span>
                      <span>{child.label}</span>
                    </span>
                    <span className={`text-[10px] ${child.done ? "text-emerald-500" : "text-slate-600"}`}>
                      {child.badge}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
    </div>

    <div className="p-3 border-t border-slate-800">
      <div className="text-[10px] uppercase tracking-[0.12em] text-slate-600 font-medium px-3 mb-2">Navigare</div>
      {["Panou", "Firme", "Documente"].map((item) => (
        <button key={item} className="w-full text-left px-3 py-1.5 text-slate-500 hover:text-slate-300 text-[12px] rounded hover:bg-slate-800/30 transition-colors">
          ← {item}
        </button>
      ))}
    </div>
  </div>
);

const ElementCard = ({ el, expanded, setExpanded }) => {
  const isExpanded = expanded === el.key;
  return (
    <div
      className={`bg-white rounded-xl border transition-all ${
        el.status === "pending" ? "border-dashed border-slate-300" :
        el.status === "warning" ? "border-amber-200 bg-amber-50/30" :
        isExpanded ? "border-blue-300 shadow-md shadow-blue-100/50" :
        "border-slate-200 hover:border-slate-300 hover:shadow-sm"
      }`}
    >
      <button
        onClick={() => setExpanded(isExpanded ? null : el.key)}
        className="w-full p-4 text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {statusDot(el.status)}
              <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{el.label}</span>
            </div>
            {el.value ? (
              <div className="text-[15px] font-semibold text-slate-900 mt-1">{el.value}</div>
            ) : (
              <div className="text-[13px] text-slate-400 italic mt-1">Necompletat — Solomon va solicita</div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {sourceBadge(el.source)}
            <svg className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </div>
        </div>
        {el.warning && (
          <div className="mt-2 flex items-center gap-1.5 text-amber-600 text-[12px]">
            <span>⚠</span> {el.warning}
          </div>
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-3">
          {el.lookup && (
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium mb-2">Referință: {el.lookup.table}</div>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(el.lookup).filter(([k]) => k !== "table").map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[10px] text-slate-500">{k.replace(/_/g, " ")}</div>
                    <div className="text-[13px] font-medium text-slate-800">{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide mr-1">Reguli:</span>
            {el.rules.map((r) => (
              <span key={r} className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                r.startsWith("EG") ? "bg-red-50 text-red-600 border-red-200" :
                r.startsWith("CS") ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
                "bg-blue-50 text-blue-600 border-blue-200"
              }`}>{r}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const ScoringPanel = () => {
  const totalAwarded = scoring.reduce((s, c) => s + c.awarded, 0);
  const totalMax = scoring.reduce((s, c) => s + c.max, 0);
  const threshold = 56;
  const pct = Math.round((totalAwarded / totalMax) * 100);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">Punctaj estimat</div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-3xl font-bold text-slate-900">{totalAwarded}</span>
              <span className="text-lg text-slate-400">/ {totalMax}p</span>
            </div>
          </div>
          <div className={`w-14 h-14 rounded-full flex items-center justify-center text-sm font-bold ${
            totalAwarded >= threshold ? "bg-emerald-50 text-emerald-600 ring-2 ring-emerald-200" : "bg-red-50 text-red-600 ring-2 ring-red-200"
          }`}>
            {pct}%
          </div>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-[11px] text-slate-500">Prag calitate: {threshold}p</span>
          <span className={`text-[11px] font-semibold ${totalAwarded >= threshold ? "text-emerald-600" : "text-red-500"}`}>
            {totalAwarded >= threshold ? "✓ Peste prag" : "✗ Sub prag"}
          </span>
        </div>
      </div>

      <div className="divide-y divide-slate-50">
        {scoring.map((cs) => (
          <div key={cs.code} className="px-5 py-3 hover:bg-slate-50/50 transition-colors">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{cs.code}</span>
                <span className="text-[13px] text-slate-800">{cs.name}</span>
              </div>
              <span className="text-[13px] font-bold text-slate-900">
                {cs.status === "not_applicable" ? "—" : cs.awarded}<span className="text-slate-400 font-normal">/{cs.max}</span>
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    cs.status === "not_applicable" ? "bg-slate-300" :
                    cs.awarded === cs.max ? "bg-emerald-400" :
                    cs.awarded > 0 ? "bg-blue-400" : "bg-slate-200"
                  }`}
                  style={{ width: `${cs.status === "not_applicable" ? 0 : (cs.awarded / cs.max) * 100}%` }}
                />
              </div>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">{cs.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function ProjectView() {
  const [activeSection, setActiveSection] = useState("elemente");
  const [activeCategory, setActiveCategory] = useState("beneficiar");
  const [expandedElement, setExpandedElement] = useState("suprafata_exploatatie");

  const filteredElements = activeSection === "elemente"
    ? elements.filter((el) => activeCategory === "all" || el.category === activeCategory)
    : elements;

  const populatedCount = filteredElements.filter((e) => e.value).length;

  return (
    <div className="flex min-h-screen bg-slate-50" style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
      <ProjectSidebar
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        activeCategory={activeCategory}
        setActiveCategory={setActiveCategory}
      />

      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-8 py-5">
          <div className="flex items-start justify-between max-w-7xl">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-900">Modernizare fermă</h1>
                <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">În lucru</span>
              </div>
              <div className="flex items-center gap-2 mt-1.5 text-[13px] text-slate-500">
                <span>{projectData.company}</span>
                <span className="text-slate-300">·</span>
                <span>CUI: {projectData.cui}</span>
                <span className="text-slate-300">·</span>
                <span>{projectData.guide}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="px-4 py-2 text-[13px] font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
                Export PDF
              </button>
              <button className="px-4 py-2 text-[13px] font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                Deschide Solomon
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl px-8 py-6">
          <div className="flex gap-6">
            {/* Elements List */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Elemente din Ghid</h2>
                  <p className="text-[13px] text-slate-500 mt-0.5">
                    {populatedCount} din {filteredElements.length} completate
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex bg-slate-100 rounded-lg p-0.5">
                    {["Toate", "Completate", "Lipsă"].map((f, i) => (
                      <button key={f} className={`px-3 py-1.5 text-[12px] rounded-md font-medium transition-colors ${
                        i === 0 ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
                      }`}>{f}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mb-6 bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-medium text-slate-700">Progres colectare</span>
                  <span className="text-[12px] font-semibold text-blue-600">{Math.round((populatedCount / filteredElements.length) * 100)}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500" style={{ width: `${(populatedCount / filteredElements.length) * 100}%` }} />
                </div>
                <div className="flex gap-4 mt-3">
                  {[
                    { label: "ONRC", count: elements.filter(e => e.source === "ONRC").length, color: "bg-blue-400" },
                    { label: "Solomon", count: elements.filter(e => e.source === "Solomon").length, color: "bg-violet-400" },
                    { label: "Document", count: elements.filter(e => e.source === "Document").length, color: "bg-amber-400" },
                    { label: "Calculat", count: elements.filter(e => e.source === "Calculat").length, color: "bg-slate-400" },
                    { label: "Lipsă", count: elements.filter(e => !e.value).length, color: "bg-slate-200" },
                  ].map(s => (
                    <div key={s.label} className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${s.color}`} />
                      <span className="text-[11px] text-slate-500">{s.label}: {s.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Element cards */}
              <div className="space-y-2">
                {filteredElements.map((el) => (
                  <ElementCard key={el.key} el={el} expanded={expandedElement} setExpanded={setExpandedElement} />
                ))}
              </div>
            </div>

            {/* Scoring Panel — sticky right */}
            <div className="w-80 shrink-0">
              <div className="sticky top-6">
                <ScoringPanel />

                {/* Quick stats */}
                <div className="mt-4 bg-white rounded-xl border border-slate-200 p-5">
                  <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-3">Intensitate sprijin</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-emerald-600">70%</span>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <div className="flex justify-between text-[12px]">
                      <span className="text-slate-500">Rată bază</span>
                      <span className="text-slate-800 font-medium">50%</span>
                    </div>
                    <div className="flex justify-between text-[12px]">
                      <span className="text-slate-500">Majorare ANC Semnificativ</span>
                      <span className="text-emerald-600 font-medium">+20pp</span>
                    </div>
                    <div className="border-t border-slate-100 pt-1.5 flex justify-between text-[12px]">
                      <span className="text-slate-700 font-medium">Total</span>
                      <span className="text-slate-900 font-semibold">70%</span>
                    </div>
                  </div>
                </div>

                {/* Eligibility quick check */}
                <div className="mt-4 bg-white rounded-xl border border-slate-200 p-5">
                  <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-3">Eligibilitate</div>
                  <div className="space-y-2">
                    {[
                      { rule: "EG1", label: "Beneficiar eligibil", status: "pass" },
                      { rule: "EG2", label: "Investiție eligibilă", status: "pass" },
                      { rule: "EG3", label: "Suprafață minimă", status: "pass" },
                      { rule: "EG4", label: "Cofinanțare", status: "pending" },
                      { rule: "EG5", label: "Viabilitate economică", status: "warning" },
                    ].map(r => (
                      <div key={r.rule} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            r.status === "pass" ? "bg-emerald-100 text-emerald-600" :
                            r.status === "warning" ? "bg-amber-100 text-amber-600" :
                            "bg-slate-100 text-slate-400"
                          }`}>
                            {r.status === "pass" ? "✓" : r.status === "warning" ? "!" : "?"}
                          </span>
                          <span className="text-[12px] text-slate-700">{r.label}</span>
                        </div>
                        <span className="text-[10px] font-medium text-slate-400">{r.rule}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
