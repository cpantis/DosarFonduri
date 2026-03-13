/**
 * ═══════════════════════════════════════════════════════════════
 * DOSARFONDURI — DESIGN SYSTEM COMPLET
 * ═══════════════════════════════════════════════════════════════
 * 
 * Acest fișier conține TOATE componentele și TOATE paginile.
 * Claude Code trebuie să implementeze EXACT aceste stiluri.
 * 
 * INSTRUCȚIUNI PENTRU CLAUDE CODE:
 * 1. Extrage componentele din secțiunea COMPONENTS în components/ui/
 * 2. Extrage layout-ul din LAYOUT în components/layout/
 * 3. Aplică stilurile din fiecare PAGE pe pagina corespunzătoare
 * 4. NU modifica clasele Tailwind. NU improviza.
 * 5. Adaptează doar datele (props) la cele reale din API.
 */

import { useState } from "react";

// ═══════════════════════════════════════════════════════════════
// TOKENS — Constante de design (referință, nu cod executabil)
// ═══════════════════════════════════════════════════════════════
//
// Font:          Inter (latin + latin-ext) via next/font/google
// Background:    bg-slate-50 (toate paginile)
// Card:          bg-white rounded-xl border border-slate-200
// Card padding:  p-5 (standard) sau p-6 (stat cards)
// Card hover:    hover:shadow-sm hover:border-slate-300
// Gap carduri:   gap-4
// Gap secțiuni:  gap-6 sau mt-6
// Max width:     max-w-6xl mx-auto
// Page padding:  px-8 py-6
//
// Label:         text-[11px] uppercase tracking-wide text-slate-400 font-medium
// Value:         text-[15px] font-semibold text-slate-900
// Heading:       text-2xl font-bold text-slate-900 tracking-tight
// Subtext:       text-[13px] text-slate-500
// Body:          text-[14px] text-slate-700
// Mono:          font-mono (pentru CUI, numere, coduri CAEN)
//
// Primary btn:   bg-blue-600 hover:bg-blue-700 text-white
// Secondary btn: bg-white border border-slate-300 hover:bg-slate-50
// Danger btn:    text-red-600 border border-red-200 hover:bg-red-50
// All buttons:   px-4 py-2 text-[13px] font-medium rounded-lg transition-all

// ═══════════════════════════════════════════════════════════════
// SECTION 1: COMPONENTS — Fiecare devine un fișier în components/ui/
// ═══════════════════════════════════════════════════════════════

// --- components/ui/InfoCard.tsx ---
function InfoCard({ label, value, span = 1, accent = false, muted = false, children }) {
  const spanClass = span === 2 ? "col-span-2" : span === 3 ? "col-span-3" : span === 4 ? "col-span-4" : "";
  return (
    <div className={`${spanClass} bg-white rounded-xl border ${accent ? "border-l-4 border-l-blue-500" : ""} border-slate-200 p-5`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-400 font-medium mb-1.5">{label}</div>
      {children || (
        <div className={`text-[15px] font-semibold ${value ? (muted ? "text-slate-500" : "text-slate-900") : "text-slate-300 italic"}`}>
          {value || "—"}
        </div>
      )}
    </div>
  );
}

// --- components/ui/StatusBadge.tsx ---
function StatusBadge({ status }) {
  const map = {
    "funcțiune": "bg-emerald-50 text-emerald-700 border-emerald-200",
    "functiune": "bg-emerald-50 text-emerald-700 border-emerald-200",
    "radiată": "bg-red-50 text-red-700 border-red-200",
    "suspendată": "bg-amber-50 text-amber-700 border-amber-200",
    "în lucru": "bg-blue-50 text-blue-700 border-blue-200",
    "complet": "bg-emerald-50 text-emerald-700 border-emerald-200",
    "blocat": "bg-red-50 text-red-700 border-red-200",
    "ciornă": "bg-slate-50 text-slate-600 border-slate-200",
  };
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-3 py-1 rounded-full border ${map[status?.toLowerCase()] || "bg-slate-50 text-slate-600 border-slate-200"}`}>
      {status}
    </span>
  );
}

// --- components/ui/TypeBadge.tsx ---
function TypeBadge({ type }) {
  const map = {
    SRL: "bg-blue-50 text-blue-700 border-blue-200",
    SA: "bg-indigo-50 text-indigo-700 border-indigo-200",
    PFA: "bg-purple-50 text-purple-700 border-purple-200",
    II: "bg-teal-50 text-teal-700 border-teal-200",
    IF: "bg-cyan-50 text-cyan-700 border-cyan-200",
  };
  return (
    <span className={`inline-flex items-center text-[11px] font-bold px-2.5 py-0.5 rounded-md border ${map[type] || "bg-slate-50 text-slate-600 border-slate-200"}`}>
      {type}
    </span>
  );
}

// --- components/ui/SourceBadge.tsx ---
function SourceBadge({ source }) {
  const map = {
    ONRC: "bg-blue-50 text-blue-700 border-blue-200",
    onrc_auto: "bg-blue-50 text-blue-700 border-blue-200",
    ANAF: "bg-indigo-50 text-indigo-700 border-indigo-200",
    anaf_auto: "bg-indigo-50 text-indigo-700 border-indigo-200",
    Solomon: "bg-violet-50 text-violet-700 border-violet-200",
    solomon_chat: "bg-violet-50 text-violet-700 border-violet-200",
    Document: "bg-amber-50 text-amber-700 border-amber-200",
    document_extracted: "bg-amber-50 text-amber-700 border-amber-200",
    Calculat: "bg-slate-100 text-slate-600 border-slate-200",
    derived: "bg-slate-100 text-slate-600 border-slate-200",
    Manual: "bg-slate-100 text-slate-600 border-slate-200",
    consultant_manual: "bg-slate-100 text-slate-600 border-slate-200",
  };
  const labels = { onrc_auto: "ONRC", anaf_auto: "ANAF", solomon_chat: "Solomon", document_extracted: "Document", derived: "Calculat", consultant_manual: "Manual" };
  if (!source) return null;
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${map[source] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
      {labels[source] || source}
    </span>
  );
}

// --- components/ui/RuleBadge.tsx ---
function RuleBadge({ code }) {
  const color = code.startsWith("EG") ? "bg-red-50 text-red-600 border-red-200" : code.startsWith("CS") ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-blue-50 text-blue-600 border-blue-200";
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${color}`}>{code}</span>;
}

// --- components/ui/StatusDot.tsx ---
function StatusDot({ status }) {
  const map = { valid: "bg-emerald-400", warning: "bg-amber-400", invalid: "bg-red-400", pending: "bg-slate-300", pass: "bg-emerald-400", fail: "bg-red-400" };
  return <span className={`inline-block w-2 h-2 rounded-full ${map[status] || "bg-slate-300"}`} />;
}

// --- components/ui/StatCard.tsx ---
function StatCard({ icon, label, value, color = "blue" }) {
  const colors = {
    blue: { bg: "bg-blue-100", text: "text-blue-600" },
    amber: { bg: "bg-amber-100", text: "text-amber-600" },
    emerald: { bg: "bg-emerald-100", text: "text-emerald-600" },
    red: { bg: "bg-red-100", text: "text-red-600" },
  };
  const c = colors[color] || colors.blue;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-sm transition-shadow">
      <div className={`w-12 h-12 rounded-xl ${c.bg} ${c.text} flex items-center justify-center text-xl`}>{icon}</div>
      <div className="text-4xl font-bold text-slate-900 mt-3 tracking-tight">{value}</div>
      <div className="text-sm text-slate-500 mt-1">{label}</div>
    </div>
  );
}

// --- components/ui/EmptyState.tsx ---
function EmptyState({ icon = "📁", title, description, actionLabel, onAction }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 py-16 flex flex-col items-center justify-center">
      <div className="text-5xl mb-4 opacity-30">{icon}</div>
      <div className="text-lg font-medium text-slate-500">{title}</div>
      {description && <div className="text-sm text-slate-400 mt-1 max-w-md text-center">{description}</div>}
      {actionLabel && (
        <button onClick={onAction} className="mt-5 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium px-5 py-2.5 rounded-lg transition-colors">
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// --- components/ui/PageHeader.tsx ---
function PageHeader({ title, subtitle, badge, children }) {
  return (
    <div className="bg-white border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-8 py-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
              {badge}
            </div>
            {subtitle && <p className="text-[13px] text-slate-500 mt-1.5">{subtitle}</p>}
          </div>
          {children && <div className="flex items-center gap-2">{children}</div>}
        </div>
      </div>
    </div>
  );
}

// --- components/ui/SectionTitle.tsx ---
function SectionTitle({ children }) {
  return <h3 className="text-[13px] font-semibold text-slate-700 uppercase tracking-wide mb-3 mt-8 first:mt-0">{children}</h3>;
}

// --- components/ui/DataTable.tsx ---
function DataTable({ columns, rows, emptyText = "Nicio înregistrare" }) {
  if (!rows?.length) {
    return <EmptyState icon="📋" title={emptyText} />;
  }
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {columns.map((col) => (
              <th key={col.key} className="text-left px-5 py-3 text-[11px] uppercase tracking-wide text-slate-500 font-medium">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-slate-50/50 transition-colors">
              {columns.map((col) => (
                <td key={col.key} className={`px-5 py-4 text-[13px] ${col.className || "text-slate-700"}`}>
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- components/ui/Tabs.tsx ---
function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex items-center gap-1 border-b border-slate-200">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`px-4 py-3 text-[13px] font-medium transition-all whitespace-nowrap ${
            active === tab.key
              ? "text-blue-600 border-b-2 border-blue-600 -mb-[1px]"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// --- components/ui/BtnPrimary.tsx ---
function BtnPrimary({ children, onClick, icon }) {
  return (
    <button onClick={onClick} className="bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition-all flex items-center gap-2">
      {icon && <span>{icon}</span>}{children}
    </button>
  );
}
function BtnSecondary({ children, onClick, icon }) {
  return (
    <button onClick={onClick} className="bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 text-slate-700 text-[13px] font-medium px-4 py-2 rounded-lg transition-all flex items-center gap-2">
      {icon && <span>{icon}</span>}{children}
    </button>
  );
}
function BtnDanger({ children, onClick }) {
  return (
    <button onClick={onClick} className="text-red-600 border border-red-200 hover:bg-red-50 text-[13px] font-medium px-4 py-2 rounded-lg transition-all">
      {children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════
// SECTION 2: LAYOUT — components/layout/AppLayout.tsx
// ═══════════════════════════════════════════════════════════════

const navItems = [
  { key: "dashboard", label: "Panou", icon: "📊", href: "/dashboard" },
  { key: "companies", label: "Firme", icon: "🏢", href: "/companies" },
  { key: "projects", label: "Proiecte", icon: "📁", href: "/projects" },
  { key: "documents", label: "Documente", icon: "📄", href: "/documents" },
];
const configItems = [
  { key: "settings", label: "Configurări", icon: "⚙️", href: "/settings" },
];
const systemItems = [
  { key: "admin", label: "Admin", icon: "🔧", href: "/admin" },
];

function Sidebar({ activePage = "dashboard", cabinetName = "BUSINESS DEVELOPING GROUP SRL", cabinetCui = "19893984" }) {
  const NavItem = ({ item, active }) => (
    <a
      href={item.href}
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] transition-all ${
        active
          ? "bg-slate-800 text-white font-medium border-l-2 border-blue-400 pl-[10px]"
          : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
      }`}
    >
      <span className="text-[15px] w-5 text-center">{item.icon}</span>
      <span>{item.label}</span>
    </a>
  );

  const SectionLabel = ({ children }) => (
    <div className="text-[10px] uppercase tracking-[0.12em] text-slate-600 font-medium px-3 mt-6 mb-2">{children}</div>
  );

  return (
    <div className="w-[248px] min-h-screen bg-slate-900 flex flex-col shrink-0">
      {/* Logo */}
      <div className="p-5 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white text-[11px] font-bold">DF</div>
          <span className="text-white font-semibold text-[15px] tracking-tight">DosarFonduri</span>
        </div>
      </div>

      {/* Cabinet */}
      <div className="px-4 pb-4">
        <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50">
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500 mb-1">Cabinet activ</div>
          <div className="text-white text-[13px] font-medium leading-snug truncate">{cabinetName}</div>
          <div className="text-slate-500 text-[11px] mt-0.5 font-mono">CUI: {cabinetCui}</div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3">
        <SectionLabel>Principal</SectionLabel>
        <div className="space-y-0.5">
          {navItems.map((item) => (
            <NavItem key={item.key} item={item} active={activePage === item.key} />
          ))}
        </div>

        <SectionLabel>Configurare</SectionLabel>
        <div className="space-y-0.5">
          {configItems.map((item) => (
            <NavItem key={item.key} item={item} active={activePage === item.key} />
          ))}
        </div>

        <SectionLabel>Sistem</SectionLabel>
        <div className="space-y-0.5">
          {systemItems.map((item) => (
            <NavItem key={item.key} item={item} active={activePage === item.key} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SECTION 3: ALL PAGES
// ═══════════════════════════════════════════════════════════════

// --- PAGE: Dashboard ---
function DashboardPage() {
  return (
    <>
      <PageHeader title="Bun venit, Pantis" subtitle="BUSINESS DEVELOPING GROUP SRL · Panou de control" />
      <div className="max-w-6xl mx-auto px-8 py-6">
        <div className="grid grid-cols-4 gap-4">
          <StatCard icon="🏢" label="Firme" value={2} color="blue" />
          <StatCard icon="📁" label="Proiecte active" value={0} color="amber" />
          <StatCard icon="✅" label="Conforme" value={0} color="emerald" />
          <StatCard icon="⚠️" label="Blocate" value={0} color="red" />
        </div>

        <div className="grid grid-cols-3 gap-6 mt-6">
          <div className="col-span-2">
            <SectionTitle>Proiecte recente</SectionTitle>
            <EmptyState icon="📁" title="Niciun proiect încă" description="Creează primul proiect pentru a începe pregătirea dosarului de finanțare." actionLabel="Creează primul proiect" />
          </div>
          <div>
            <SectionTitle>Termene apropiate</SectionTitle>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="text-sm text-slate-400 italic text-center py-4">Niciun termen apropiat</div>
            </div>
            <SectionTitle>Activitate recentă</SectionTitle>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="text-sm text-slate-400 italic text-center py-4">Nicio activitate</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// --- PAGE: Companies List ---
function CompaniesListPage() {
  const companies = [
    { id: "1", denumire: "ANDA OANA AGRO FERMA S.R.L.", cui: "38480585", tip: "SRL", stare: "funcțiune", caen: "0111", judet: "Arad" },
    { id: "2", denumire: "COMEXIM R SRL", cui: "2146135", tip: "SRL", stare: "funcțiune", caen: "0220", judet: "Hunedoara" },
  ];
  return (
    <>
      <PageHeader title="Firme" subtitle={`${companies.length} firme gestionate`}>
        <BtnPrimary icon="+">Adaugă firmă</BtnPrimary>
      </PageHeader>
      <div className="max-w-6xl mx-auto px-8 py-6 space-y-3">
        {companies.map((c) => (
          <a key={c.id} href={`/companies/${c.id}`} className="block bg-white rounded-xl border border-slate-200 p-5 hover:shadow-sm hover:border-slate-300 transition-all cursor-pointer">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="text-[15px] font-semibold text-slate-900">{c.denumire}</span>
                  <TypeBadge type={c.tip} />
                  <StatusBadge status={c.stare} />
                </div>
                <div className="text-[13px] text-slate-500 mt-1 flex items-center gap-2">
                  <span className="font-mono">CUI: {c.cui}</span>
                  <span className="text-slate-300">·</span>
                  <span>CAEN: {c.caen}</span>
                  <span className="text-slate-300">·</span>
                  <span>{c.judet}</span>
                </div>
              </div>
              <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </div>
          </a>
        ))}
      </div>
    </>
  );
}

// --- PAGE: Company Detail ---
function CompanyDetailPage() {
  const [tab, setTab] = useState("general");
  const c = {
    denumire: "ANDA OANA AGRO FERMA S.R.L.", cui: "38480585", nrRegCom: "J2/1981/2017", tip: "SRL", stare: "funcțiune",
    formaJuridica: "Societate cu Răspundere Limitată", adresa: "Sat Călugăreni, Comuna Felnac, Nr. 87", localitate: "Comuna Felnac, Arad",
    telefon: "0722226110", durata: "nedeterminată", anInfiintare: "2017",
    caenCod: "0111", caenDesc: "Cultivarea cerealelor (exclusiv orez), plantelor leguminoase și a plantelor producătoare de semințe oleaginoase",
    ultimaMentiune: "Declarație pe propria răspundere · Nr. 25585 din 12.06.2024",
    capital: { subscris: "300 LEI", parti: "30", valParte: "10 LEI", natura: "privat autohton 100%" },
    asociati: [
      { nume: "HODOȘAN DEIANA-ADINA", calitate: "asociat", dataNastere: "02.11.1999", aport: "100 LEI", parti: 10, cota: "33,33%" },
      { nume: "CHIȘ-POPOVICI OANA-ANDA", calitate: "asociat", dataNastere: "25.01.1997", aport: "200 LEI", parti: 20, cota: "66,67%" },
    ],
    financiar: [
      { an: 2023, ca: "1.913.806", pb: "69.223", pn: "54.340", sal: 1, ai: "813.083", imp: 0 },
      { an: 2022, ca: "1.461.655", pb: "864.116", pn: "855.647", sal: 1, ai: "281.649", imp: 0 },
      { an: 2021, ca: "1.036.522", pb: "630.444", pn: "624.987", sal: 1, ai: "4.218", imp: 0 },
    ],
  };

  const companyTabs = [
    { key: "general", label: "General" }, { key: "asociati", label: "Asociați" },
    { key: "administrare", label: "Administrare" }, { key: "activitati", label: "Activități" },
    { key: "sedii", label: "Sedii" }, { key: "financiar", label: "Financiar" }, { key: "juridic", label: "Juridic" },
  ];

  return (
    <>
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-8 py-6">
          <div className="flex items-start justify-between">
            <div>
              <button className="text-[13px] text-slate-400 hover:text-slate-600 mb-3 flex items-center gap-1 transition-colors">← Firme</button>
              <div className="flex items-center gap-3">
                <h1 className="text-[26px] font-bold text-slate-900 tracking-tight">{c.denumire}</h1>
                <TypeBadge type={c.tip} />
                <StatusBadge status={c.stare} />
              </div>
              <p className="text-[13px] text-slate-500 mt-1.5"><span className="font-mono">CUI: {c.cui}</span> · {c.nrRegCom}</p>
            </div>
            <div className="flex items-center gap-2 pt-4">
              <BtnSecondary icon="↻">Actualizare CUI</BtnSecondary>
              <BtnSecondary icon="↑">Upload ONRC</BtnSecondary>
              <BtnDanger>Șterge firma</BtnDanger>
            </div>
          </div>
          <div className="mt-6"><Tabs tabs={companyTabs} active={tab} onChange={setTab} /></div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-8 py-6">
        {tab === "general" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <InfoCard label="Formă juridică" value={c.formaJuridica} span={2} />
              <InfoCard label="Stare"><StatusBadge status={c.stare} /></InfoCard>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <InfoCard label="Adresă" span={2}>
                <div className="text-[15px] font-semibold text-slate-900">{c.adresa}</div>
                <div className="text-[12px] text-slate-400 mt-0.5">{c.localitate}</div>
              </InfoCard>
              <InfoCard label="Telefon" value={c.telefon} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <InfoCard label="Durată societate" value={c.durata} />
              <InfoCard label="An înființare" value={c.anInfiintare} />
              <InfoCard label="Nr. Reg. Com." value={c.nrRegCom} />
            </div>
            <InfoCard label="CAEN principal" accent>
              <div className="flex items-start gap-3">
                <span className="inline-flex bg-blue-100 text-blue-700 text-[13px] font-bold px-2.5 py-1 rounded-lg">{c.caenCod}</span>
                <span className="text-[14px] font-medium text-slate-800 leading-snug">{c.caenDesc}</span>
              </div>
            </InfoCard>
            <InfoCard label="Ultima mențiune" accent><div className="text-[14px] text-slate-700">{c.ultimaMentiune}</div></InfoCard>
            <SectionTitle>Capital social</SectionTitle>
            <div className="grid grid-cols-4 gap-4">
              <InfoCard label="Subscris" value={c.capital.subscris} />
              <InfoCard label="Părți sociale" value={c.capital.parti} />
              <InfoCard label="Valoare parte" value={c.capital.valParte} />
              <InfoCard label="Natură" value={c.capital.natura} />
            </div>
          </div>
        )}

        {tab === "asociati" && (
          <DataTable
            columns={[
              { key: "nume", label: "Nume", className: "text-[14px] font-semibold text-slate-900" },
              { key: "calitate", label: "Calitate" },
              { key: "dataNastere", label: "Data nașterii" },
              { key: "aport", label: "Aport", className: "font-medium text-slate-800" },
              { key: "parti", label: "Părți" },
              { key: "cota", label: "Cotă", render: (r) => <span className="text-[12px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">{r.cota}</span> },
            ]}
            rows={c.asociati}
          />
        )}

        {tab === "financiar" && (
          <DataTable
            columns={[
              { key: "an", label: "An", className: "text-[14px] font-bold text-slate-900" },
              { key: "ca", label: "Cifra de afaceri", className: "font-mono font-semibold text-slate-800", render: (r) => `${r.ca} LEI` },
              { key: "pb", label: "Profit brut", className: "font-mono text-slate-700", render: (r) => `${r.pb} LEI` },
              { key: "pn", label: "Profit net", render: (r) => <span className="font-mono font-medium text-emerald-700">{r.pn} LEI</span> },
              { key: "sal", label: "Salariați" },
              { key: "ai", label: "Active imob.", className: "font-mono text-slate-600", render: (r) => `${r.ai} LEI` },
              { key: "imp", label: "Impozite nepl.", render: (r) => (
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${r.imp === 0 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                  {r.imp === 0 ? "0 — conform" : `${r.imp} LEI`}
                </span>
              )},
            ]}
            rows={c.financiar}
          />
        )}

        {tab === "juridic" && (
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {[
              { label: "Insolvență", ok: true }, { label: "Dizolvare", ok: true }, { label: "Lichidare", ok: true },
              { label: "Urmărire penală", ok: true }, { label: "Condamnare penală", ok: true }, { label: "Concordat preventiv", ok: true },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-4 hover:bg-slate-50/50 transition-colors">
                <span className="text-[14px] text-slate-700">{item.label}</span>
                <span className={`inline-flex items-center gap-1.5 text-[13px] font-semibold ${item.ok ? "text-emerald-600" : "text-red-600"}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${item.ok ? "bg-emerald-100" : "bg-red-100"}`}>
                    {item.ok ? "✓" : "✗"}
                  </span>
                  {item.ok ? "NU" : "DA"}
                </span>
              </div>
            ))}
          </div>
        )}

        {(tab === "administrare" || tab === "activitati" || tab === "sedii") && (
          <EmptyState icon={tab === "sedii" ? "📍" : "📋"} title={`Secțiunea ${companyTabs.find(t=>t.key===tab)?.label}`} description="Datele vor apărea după procesarea certificatului constatator." />
        )}
      </div>

      <div className="max-w-6xl mx-auto px-8 pb-8">
        <div className="text-[11px] text-slate-400">Sursă: Upload ONRC · Actualizat: 21.06.2024</div>
      </div>
    </>
  );
}

// --- PAGE: Projects List ---
function ProjectsListPage() {
  return (
    <>
      <PageHeader title="Proiecte" subtitle="Dosare de finanțare în lucru">
        <BtnPrimary icon="+">Proiect nou</BtnPrimary>
      </PageHeader>
      <div className="max-w-6xl mx-auto px-8 py-6">
        <EmptyState icon="📁" title="Niciun proiect încă" description="Creează un proiect nou pentru a începe pregătirea dosarului." actionLabel="Creează primul proiect" />
      </div>
    </>
  );
}

// --- PAGE: Documents ---
function DocumentsPage() {
  return (
    <>
      <PageHeader title="Documente" subtitle="Ghiduri, anexe, template-uri și documente client">
        <BtnPrimary icon="↑">Upload document</BtnPrimary>
      </PageHeader>
      <div className="max-w-6xl mx-auto px-8 py-6">
        <div className="grid grid-cols-3 gap-4">
          {[
            { icon: "📖", label: "Ghiduri", desc: "Ghiduri solicitant și anexe", count: 0 },
            { icon: "📝", label: "Template-uri", desc: "Cereri, memorii, planuri", count: 0 },
            { icon: "📂", label: "Documente client", desc: "Certificate, contracte, bilanțuri", count: 0 },
          ].map((folder, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-sm hover:border-slate-300 transition-all cursor-pointer">
              <div className="text-3xl mb-3">{folder.icon}</div>
              <div className="text-[15px] font-semibold text-slate-900">{folder.label}</div>
              <div className="text-[13px] text-slate-500 mt-0.5">{folder.desc}</div>
              <div className="text-[12px] text-slate-400 mt-2">{folder.count} documente</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN EXPORT — Demo cu toate paginile navigabile
// ═══════════════════════════════════════════════════════════════

export default function DesignSystem() {
  const [page, setPage] = useState("company-detail");

  const pages = {
    "dashboard": <DashboardPage />,
    "companies": <CompaniesListPage />,
    "company-detail": <CompanyDetailPage />,
    "projects": <ProjectsListPage />,
    "documents": <DocumentsPage />,
  };

  const sidebarPage = page === "company-detail" ? "companies" : page === "projects-detail" ? "projects" : page;

  return (
    <div className="flex min-h-screen bg-slate-50" style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
      <Sidebar activePage={sidebarPage} />
      <div className="flex-1 min-w-0 overflow-y-auto">
        {/* Page selector for demo */}
        <div className="bg-slate-900 text-white px-4 py-2 flex items-center gap-2 text-[12px]">
          <span className="text-slate-400">Demo pagini:</span>
          {[
            { key: "dashboard", label: "Dashboard" },
            { key: "companies", label: "Lista firme" },
            { key: "company-detail", label: "Firmă detaliu" },
            { key: "projects", label: "Proiecte" },
            { key: "documents", label: "Documente" },
          ].map((p) => (
            <button key={p.key} onClick={() => setPage(p.key)}
              className={`px-3 py-1 rounded ${page === p.key ? "bg-blue-600" : "bg-slate-800 hover:bg-slate-700"}`}>
              {p.label}
            </button>
          ))}
        </div>
        {pages[page]}
      </div>
    </div>
  );
}
