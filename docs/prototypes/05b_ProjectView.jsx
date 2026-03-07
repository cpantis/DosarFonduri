import { useState, useRef, useEffect, useCallback } from "react";

// ─── ICONS ───
const Icons = {
  ChevronRight: ({ size = 16, className = "" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M9 18l6-6-6-6"/></svg>
  ),
  ChevronDown: ({ size = 16, className = "" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M6 9l6 6 6-6"/></svg>
  ),
  Folder: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
  ),
  FileText: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
  ),
  Shield: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
  ),
  Bot: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>
  ),
  Book: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
  ),
  Layers: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12,2 2,7 12,12 22,7"/><polyline points="2,17 12,22 22,17"/><polyline points="2,12 12,17 22,12"/></svg>
  ),
  Send: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9"/></svg>
  ),
  Upload: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16,16 12,12 8,16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/></svg>
  ),
  Check: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20,6 9,17 4,12"/></svg>
  ),
  X: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
  ),
  AlertTriangle: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
  ),
  Settings: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
  ),
  Clipboard: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
  ),
  BarChart: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>
  ),
  Download: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
  ),
  Sparkle: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L14.4 8.2L21 9.6L16 14.2L17.2 21L12 17.8L6.8 21L8 14.2L3 9.6L9.6 8.2L12 2Z"/></svg>
  ),
  Database: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
  ),
  Clock: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
  ),
  ClipboardList: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>
  ),
  Plus: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
  ),
  Trash: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
  ),
  Link: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
  ),
  Move: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="5,9 2,12 5,15"/><polyline points="9,5 12,2 15,5"/><polyline points="15,19 12,22 9,19"/><polyline points="19,9 22,12 19,15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>
  ),
};

// ─── MOCK DATA ───
const PROJECT_META = {
  name: "test",
  firma: "COMEXIM R SRL",
  cui: "2146135",
  path: [
    { label: "Accesare finanțări", level: "program" },
    { label: "Perioada 2021 – 2028", level: "perioada" },
    { label: "Măsura 1", level: "masura" },
    { label: "Sesiunea 1", level: "sesiune" },
  ],
};
const ELIGIBILITY_RULES = [
  { id: 1, name: "Firmă înregistrată în România", status: "pass", detail: "CUI 2146135 — COMEXIM R SRL" },
  { id: 2, name: "Minim 1 an vechime", status: "pass", detail: "Înregistrată din 1991" },
  { id: 3, name: "Cod CAEN eligibil", status: "pass", detail: "2562 — Operațiuni de mecanică generală" },
  { id: 4, name: "Nu e în insolvență/faliment", status: "pass", detail: "Verificare ONRC OK" },
  { id: 5, name: "Nu are datorii la ANAF", status: "fail", detail: "Datorii restante: 2,340 RON" },
  { id: 6, name: "Minim 2 angajați", status: "pass", detail: "12 angajați declarați" },
  { id: 7, name: "Cifra afaceri > 50,000 EUR", status: "pass", detail: "CA 2024: 187,000 EUR" },
  { id: 8, name: "Capital social minim 200 RON", status: "pass", detail: "Capital social: 5,000 RON" },
  { id: 9, name: "Proiect în zona eligibilă", status: "pass", detail: "Județ Arad — eligibil" },
  { id: 10, name: "Dimensiune IMM eligibilă", status: "pass", detail: "Microîntreprindere" },
  { id: 11, name: "Cofinanțare minim 30%", status: "pass", detail: "Confirmat de beneficiar" },
  { id: 12, name: "Investiție nouă (nu second-hand)", status: "pass", detail: "Echipamente noi CNC" },
  { id: 13, name: "Nu depășește plafonul de minimis", status: "pass", detail: "0 EUR utilizat din 300,000 EUR" },
];

const GUIDE_RULES = [
  { id: 1, type: "fixed", text: "Beneficiarii eligibili sunt IMM-uri din mediul rural", confidence: 0.96, page: 8, highlight: "secțiunea 3.1" },
  { id: 2, type: "fixed", text: "Valoarea minimă a proiectului: 30,000 EUR", confidence: 0.98, page: 12, highlight: "secțiunea 4.2" },
  { id: 3, type: "fixed", text: "Valoarea maximă a proiectului: 200,000 EUR", confidence: 0.97, page: 12, highlight: "secțiunea 4.2" },
  { id: 4, type: "fixed", text: "Durata maximă de implementare: 24 luni", confidence: 0.95, page: 15, highlight: "secțiunea 5.1" },
  { id: 5, type: "interpreted", text: "Intensitatea sprijinului: 50% zonă normală, 70% zonă montană/defavorizată — condiționat de tipul beneficiarului și locația investiției", confidence: 0.78, page: 18, highlight: "secțiunea 5.3" },
  { id: 6, type: "interpreted", text: "Criteriul de selecție S3: punctaj suplimentar dacă activitatea principală CAEN corespunde cu investiția ȘI beneficiarul are experiență minim 3 ani", confidence: 0.72, page: 24, highlight: "secțiunea 7.2" },
  { id: 7, type: "fixed", text: "Cheltuieli neeligibile: TVA recuperabil, achiziții second-hand, leasing", confidence: 0.94, page: 30, highlight: "secțiunea 8.1" },
  { id: 8, type: "interpreted", text: "Calculul SO: diferențiat pe tip exploatație — vegetal vs. animal vs. mixt, cu praguri specifice per cultură/efectiv", confidence: 0.68, page: 35, highlight: "secțiunea 9" },
];

const SOLOMON_MESSAGES = [
  { role: "assistant", text: "Bună! Sunt **Solomon**, asistentul tău de colectare date.\n\nAm preluat deja datele firmei din ONRC — **9 din 12 câmpuri** completate automat ✓\n\nMai am nevoie de:\n• Valoarea totală a proiectului\n• Durata proiectului (luni)\n• IBAN cont dedicat proiect\n\nCare e bugetul estimat?",
    extractions: null },
  { role: "user", text: "Proiectul vizează achiziția a 2 centre de prelucrare CNC cu 5 axe. Valoarea estimată e 150,000 EUR, durata 18 luni.",
    extractions: null },
  { role: "assistant", text: "Am extras datele din mesajul tău:",
    extractions: [
      { key: "echipamente_descr", label: "Descriere echipamente", value: "2× Centre de prelucrare CNC 5 axe", confidence: 90 },
      { key: "valoare_estimata_eur", label: "Valoare estimată (EUR)", value: "150,000 EUR", confidence: 95 },
      { key: "durata_proiect", label: "Durata proiectului", value: "18 luni", confidence: 92 },
    ]
  },
];

const SOLOMON_ELEMENTS = [
  { key: "denumire_firma", label: "Denumirea firmei", value: "SC CONSTRUCT NORD SRL", source: "Date ONRC", status: "confirmat" },
  { key: "cui", label: "Cod Unic de Înregistrare", value: "RO44123456", source: "Date ONRC", status: "confirmat" },
  { key: "nr_angajati", label: "Număr angajați", value: "47", source: "Document uploadat", status: "propus" },
  { key: "cifra_afaceri", label: "Cifra de afaceri (2024)", value: "4.250.000 lei", source: "Document uploadat", status: "propus" },
  { key: "profit_net", label: "Profit net (2024)", value: "380.000 lei", source: "Document uploadat", status: "propus" },
  { key: "adresa_sediu", label: "Adresa sediu social", value: "Str. Industriei 14, Cluj", source: "Date ONRC", status: "confirmat" },
  { key: "cod_caen", label: "Cod CAEN principal", value: "2562", source: "Date ONRC", status: "confirmat" },
  { key: "reprezentant_nume", label: "Reprezentant legal", value: "Popescu Ion", source: "Chat Solomon", status: "propus" },
];

const TEMPLATE_PAGES = [
  { num: 1, title: "Date identificare", status: "complete", fields: [
    { name: "Denumire solicitant", value: "COMEXIM R SRL", source: "ONRC" },
    { name: "CUI", value: "2146135", source: "ONRC" },
    { name: "Nr. Reg. Comerț", value: "J02/123/1991", source: "ONRC" },
    { name: "Adresă sediu social", value: "Str. Industriei 45, Arad", source: "ONRC" },
  ]},
  { num: 2, title: "Reprezentant legal", status: "complete", fields: [
    { name: "Nume și prenume", value: "Popescu Ion", source: "Solomon" },
    { name: "Funcția", value: "Administrator", source: "ONRC" },
    { name: "CNP", value: "178********", source: "Solomon" },
    { name: "Act identitate", value: "CI seria AR nr. 456789", source: "Solomon" },
  ]},
  { num: 3, title: "Descriere proiect", status: "partial", fields: [
    { name: "Descriere scurtă proiect", value: "Extindere capacitate producție prin achiziție echipamente industriale CNC", source: "Solomon" },
    { name: "Valoarea totală proiect", value: null, source: null },
    { name: "Contribuție proprie", value: null, source: null },
  ]},
  { num: 4, title: "Plan investiție", status: "empty", fields: [
    { name: "Obiective specifice", value: null, source: null },
    { name: "Rezultate așteptate", value: null, source: null },
    { name: "Calendar implementare", value: null, source: null },
  ]},
  { num: 5, title: "Declarații", status: "empty", fields: [
    { name: "Declarație ajutor de stat", value: null, source: null },
    { name: "Declarație angajament", value: null, source: null },
  ]},
];

const AVAILABLE_TEMPLATES = [
  { id: "t1", name: "Cerere Finanțare", type: "DOCX" },
  { id: "t2", name: "Plan Afaceri", type: "DOCX" },
  { id: "t3", name: "Buget Estimativ", type: "XLSX" },
  { id: "t4", name: "Declarație pe propria răspundere", type: "DOCX" },
  { id: "t5", name: "Studiu de fezabilitate", type: "DOCX" },
];

const CHECKLIST_CATEGORIES = ["Documente juridice", "Documente financiare", "Documente tehnice", "Declarații & Angajamente"];

const INITIAL_CHECKLIST = [
  // Documente juridice
  { id: "d1", name: "Cerere de finanțare", category: "Documente juridice", source: "ghid", templateId: "t1", templateName: "Cerere Finanțare", done: true },
  { id: "d2", name: "Certificat constatator ORC", category: "Documente juridice", source: "ghid", templateId: null, templateName: null, done: true },
  { id: "d3", name: "Copie act constitutiv actualizat", category: "Documente juridice", source: "ghid", templateId: null, templateName: null, done: false },
  { id: "d4", name: "Copie CI administrator", category: "Documente juridice", source: "ghid", templateId: null, templateName: null, done: true },
  { id: "d5", name: "Certificat de atestare fiscală ANAF", category: "Documente juridice", source: "ghid", templateId: null, templateName: null, done: false },
  // Documente financiare
  { id: "d6", name: "Plan de afaceri", category: "Documente financiare", source: "ghid", templateId: "t2", templateName: "Plan Afaceri", done: false },
  { id: "d7", name: "Buget estimativ detaliat", category: "Documente financiare", source: "ghid", templateId: "t3", templateName: "Buget Estimativ", done: false },
  { id: "d8", name: "Bilanț contabil ultimii 3 ani", category: "Documente financiare", source: "ghid", templateId: null, templateName: null, done: false },
  { id: "d9", name: "Oferte de preț (min. 2 furnizori)", category: "Documente financiare", source: "ghid", templateId: null, templateName: null, done: false },
  { id: "d10", name: "Extras de cont bancar", category: "Documente financiare", source: "manual", templateId: null, templateName: null, done: false },
  // Documente tehnice
  { id: "d11", name: "Studiu de fezabilitate", category: "Documente tehnice", source: "ghid", templateId: "t5", templateName: "Studiu de fezabilitate", done: false },
  { id: "d12", name: "Memoriu justificativ investiție", category: "Documente tehnice", source: "ghid", templateId: null, templateName: null, done: false },
  { id: "d13", name: "Specificații tehnice echipamente CNC", category: "Documente tehnice", source: "manual", templateId: null, templateName: null, done: false },
  // Declarații
  { id: "d14", name: "Declarație pe propria răspundere", category: "Declarații & Angajamente", source: "ghid", templateId: "t4", templateName: "Declarație pe propria răspundere", done: false },
  { id: "d15", name: "Declarație ajutoare de minimis", category: "Declarații & Angajamente", source: "ghid", templateId: null, templateName: null, done: false },
  { id: "d16", name: "Angajament privind cofinanțarea", category: "Declarații & Angajamente", source: "ghid", templateId: null, templateName: null, done: false },
  { id: "d17", name: "Declarație GDPR", category: "Declarații & Angajamente", source: "manual", templateId: null, templateName: null, done: false },
];

const PROJECT_ELEMENTS = [
  {
    id: "e1", key: "denumire_firma", label: "Denumirea firmei", category: "Identificare",
    value: "COMEXIM R SRL", status: "confirmat", confidence: 99,
    source: "company_data", source_label: "Date ONRC",
    source_excerpt: "Societatea cu răspundere limitată COMEXIM R SRL, înregistrată la Registrul Comerțului sub nr. J02/123/1991",
    templates: ["Cerere Finanțare", "Plan Afaceri"],    updated_at: "2026-03-05 09:12", modif_count: 2,
    audit_log: [
      { action: "created", source: "company_data", value: "COMEXIM R SRL", ts: "2026-03-05 09:12", user: "System (ONRC)" },
      { action: "confirmed", source: "manual", value: "COMEXIM R SRL", ts: "2026-03-05 09:45", user: "Consultant" },
    ],
  },
  {
    id: "e2", key: "cui", label: "Cod Unic de Înregistrare", category: "Identificare",
    value: "RO44123456", status: "confirmat", confidence: 100,
    source: "company_data", source_label: "Date ONRC",
    source_excerpt: "Cod unic de identificare: RO44123456",
    templates: ["Cerere Finanțare"],
    updated_at: "2026-03-05 09:12", modif_count: 1,
    audit_log: [
      { action: "created", source: "company_data", value: "RO44123456", ts: "2026-03-05 09:12", user: "System (ONRC)" },
    ],
  },
  {
    id: "e3", key: "nr_reg_comert", label: "Nr. Registrul Comerțului", category: "Identificare",
    value: "J12/441/2018", status: "confirmat", confidence: 100,
    source: "company_data", source_label: "Date ONRC",
    source_excerpt: "Număr de ordine în registrul comerțului: J12/441/2018",
    templates: ["Cerere Finanțare"],
    updated_at: "2026-03-05 09:12", modif_count: 1,
    audit_log: [
      { action: "created", source: "company_data", value: "J12/441/2018", ts: "2026-03-05 09:12", user: "System (ONRC)" },
    ],
  },
  {
    id: "e4", key: "adresa_sediu", label: "Adresă sediu social", category: "Identificare",
    value: "Str. Industriei 45, Arad, jud. Arad", status: "confirmat", confidence: 98,
    source: "company_data", source_label: "Date ONRC",
    source_excerpt: "Sediul social: Str. Industriei nr. 45, Arad, jud. Arad, cod poștal 310100",
    templates: ["Cerere Finanțare", "Plan Afaceri"],
    updated_at: "2026-03-05 09:12", modif_count: 1,
    audit_log: [
      { action: "created", source: "company_data", value: "Str. Industriei 45, Arad, jud. Arad", ts: "2026-03-05 09:12", user: "System (ONRC)" },
    ],
  },
  {
    id: "e5", key: "cod_caen", label: "Cod CAEN principal", category: "Identificare",
    value: "2562", status: "confirmat", confidence: 100,
    source: "company_data", source_label: "Date ONRC",
    source_excerpt: "Activitate principală: 2562 — Operațiuni de mecanică generală",
    templates: ["Cerere Finanțare", "Plan Afaceri"],
    updated_at: "2026-03-05 09:12", modif_count: 1,
    audit_log: [
      { action: "created", source: "company_data", value: "2562", ts: "2026-03-05 09:12", user: "System (ONRC)" },
    ],
  },
  {
    id: "e6", key: "nr_angajati", label: "Număr mediu angajați", category: "Identificare",
    value: "12", status: "confirmat", confidence: 95,
    source: "company_data", source_label: "Date ONRC",
    source_excerpt: "Număr mediu de salariați în anul fiscal 2024: 12",
    templates: ["Plan Afaceri"],
    updated_at: "2026-03-05 09:12", modif_count: 1,
    audit_log: [
      { action: "created", source: "company_data", value: "12", ts: "2026-03-05 09:12", user: "System (ONRC)" },
    ],
  },
  {
    id: "e7", key: "reprezentant_nume", label: "Reprezentant legal — Nume", category: "Reprezentant",
    value: "Popescu Ion", status: "propus_ai", confidence: 88,
    source: "solomon_chat", source_label: "Chat Solomon",
    source_excerpt: "Administratorul firmei este dl. Popescu Ion, conform actului constitutiv actualizat.",
    templates: ["Cerere Finanțare"],
    updated_at: "2026-03-05 10:34", modif_count: 1,
    audit_log: [
      { action: "created", source: "solomon_chat", value: "Popescu Ion", ts: "2026-03-05 10:34", user: "Solomon Agent" },
    ],
  },
  {
    id: "e8", key: "reprezentant_functie", label: "Funcția Reprezentant", category: "Reprezentant",
    value: "Administrator", status: "propus_ai", confidence: 92,
    source: "company_data", source_label: "Date ONRC",
    source_excerpt: "Persoane împuternicite: Popescu Ion — Administrator",
    templates: ["Cerere Finanțare"],
    updated_at: "2026-03-05 09:12", modif_count: 1,
    audit_log: [
      { action: "created", source: "company_data", value: "Administrator", ts: "2026-03-05 09:12", user: "System (ONRC)" },
    ],
  },
  {
    id: "e9", key: "descriere_proiect", label: "Descriere scurtă proiect", category: "Proiect",
    value: "Extindere capacitate producție prin achiziție echipamente industriale CNC", status: "propus_ai", confidence: 85,
    source: "solomon_chat", source_label: "Chat Solomon",
    source_excerpt: "Proiectul vizează achiziția a 2 centre de prelucrare CNC cu 5 axe pentru extinderea capacității de producție.",
    templates: ["Cerere Finanțare", "Plan Afaceri"],
    updated_at: "2026-03-05 10:45", modif_count: 2,
    audit_log: [
      { action: "created", source: "solomon_chat", value: "Achiziție CNC pentru extindere producție", ts: "2026-03-05 10:40", user: "Solomon Agent" },
      { action: "updated", source: "solomon_chat", value: "Extindere capacitate producție prin achiziție echipamente industriale CNC", ts: "2026-03-05 10:45", user: "Solomon Agent" },
    ],
  },
  {
    id: "e10", key: "echipamente_descr", label: "Descriere echipamente", category: "Investiție",
    value: "2× Centre de prelucrare CNC 5 axe", status: "propus_ai", confidence: 90,
    source: "solomon_chat", source_label: "Chat Solomon",
    source_excerpt: "achiziția a 2 centre de prelucrare CNC cu 5 axe",
    templates: ["Plan Afaceri", "Buget Estimativ"],
    updated_at: "2026-03-05 10:45", modif_count: 1,
    audit_log: [
      { action: "created", source: "solomon_chat", value: "2× Centre de prelucrare CNC 5 axe", ts: "2026-03-05 10:45", user: "Solomon Agent" },
    ],
  },
  {
    id: "e11", key: "valoare_estimata_eur", label: "Valoare estimată investiție (EUR)", category: "Financiar",
    value: "150,000 EUR", status: "propus_ai", confidence: 82,
    source: "solomon_chat", source_label: "Chat Solomon",
    source_excerpt: "Valoarea estimată: 150,000 EUR.",
    templates: ["Plan Afaceri", "Buget Estimativ"],
    updated_at: "2026-03-05 10:45", modif_count: 1,
    audit_log: [
      { action: "created", source: "solomon_chat", value: "150,000 EUR", ts: "2026-03-05 10:45", user: "Solomon Agent" },
    ],
  },
  {
    id: "e12", key: "valoare_totala", label: "Valoarea totală proiect", category: "Financiar",
    value: null, status: "gol", confidence: 0,
    source: null, source_label: null, source_excerpt: null,
    templates: ["Cerere Finanțare", "Buget Estimativ"],
    updated_at: null, modif_count: 0, audit_log: [],
  },
  {
    id: "e13", key: "contributie_proprie", label: "Contribuție proprie", category: "Financiar",
    value: null, status: "gol", confidence: 0,
    source: null, source_label: null, source_excerpt: null,
    templates: ["Cerere Finanțare", "Buget Estimativ"],
    updated_at: null, modif_count: 0, audit_log: [],
  },
  {
    id: "e14", key: "obiective_specifice", label: "Obiective specifice", category: "Proiect",
    value: null, status: "gol", confidence: 0,
    source: null, source_label: null, source_excerpt: null,
    templates: ["Cerere Finanțare", "Plan Afaceri"],
    updated_at: null, modif_count: 0, audit_log: [],
  },
  {
    id: "e15", key: "rezultate_asteptate", label: "Rezultate așteptate", category: "Proiect",
    value: null, status: "gol", confidence: 0,
    source: null, source_label: null, source_excerpt: null,
    templates: ["Cerere Finanțare", "Plan Afaceri"],
    updated_at: null, modif_count: 0, audit_log: [],
  },
  {
    id: "e16", key: "calendar_implementare", label: "Calendar implementare", category: "Proiect",
    value: null, status: "gol", confidence: 0,
    source: null, source_label: null, source_excerpt: null,
    templates: ["Cerere Finanțare"],
    updated_at: null, modif_count: 0, audit_log: [],
  },
  {
    id: "e17", key: "reprezentant_cnp", label: "CNP Reprezentant", category: "Reprezentant",
    value: "178********", status: "propus_ai", confidence: 75,
    source: "solomon_chat", source_label: "Chat Solomon",
    source_excerpt: "CNP-ul administratorului: 178...",
    templates: ["Cerere Finanțare"],
    updated_at: "2026-03-05 10:34", modif_count: 1,
    audit_log: [
      { action: "created", source: "solomon_chat", value: "178********", ts: "2026-03-05 10:34", user: "Solomon Agent" },
    ],
  },
  {
    id: "e18", key: "act_identitate", label: "Act identitate Reprezentant", category: "Reprezentant",
    value: "CI seria AR nr. 456789", status: "confirmat", confidence: 100,
    source: "manual", source_label: "Completare manuală",
    source_excerpt: null,
    templates: ["Cerere Finanțare"],
    updated_at: "2026-03-05 11:02", modif_count: 2,
    audit_log: [
      { action: "created", source: "solomon_chat", value: "CI seria AR nr. 456789", ts: "2026-03-05 10:50", user: "Solomon Agent" },
      { action: "confirmed", source: "manual", value: "CI seria AR nr. 456789", ts: "2026-03-05 11:02", user: "Consultant (manual)" },
    ],
  },
];

const SOURCE_COLORS = {
  company_data: { color: "#34d399", bg: "rgba(52,211,153,0.12)", icon: "🏛", label: "DATE ONRC" },
  solomon_chat: { color: "#4d8bff", bg: "rgba(77,139,255,0.12)", icon: "🤖", label: "CHAT SOLOMON" },
  manual: { color: "#a78bfa", bg: "rgba(167,139,250,0.12)", icon: "✏️", label: "MANUAL" },
  document_upload: { color: "#fb923c", bg: "rgba(251,146,60,0.12)", icon: "📄", label: "DOCUMENT" },
};

// ─── STYLES ───
const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  :root {
    --bg-deep: #0a0c10;
    --bg-surface: #12151c;
    --bg-elevated: #1a1e28;
    --bg-hover: #222838;
    --border: #2a3040;
    --border-active: #3d4760;
    --text-primary: #e8ecf4;
    --text-secondary: #8892a8;
    --text-muted: #5a6478;
    --accent-blue: #4d8bff;
    --accent-blue-dim: #2a4a8a;
    --accent-green: #34d399;
    --accent-green-dim: #1a4a38;
    --accent-red: #f87171;
    --accent-red-dim: #4a1a1a;
    --accent-yellow: #fbbf24;
    --accent-yellow-dim: #4a3a1a;
    --accent-purple: #a78bfa;
    --accent-orange: #fb923c;
    --font-sans: 'DM Sans', system-ui, sans-serif;
    --font-mono: 'JetBrains Mono', monospace;
    --radius-sm: 6px;
    --radius-md: 10px;
    --radius-lg: 14px;
  }

  body { font-family: var(--font-sans); background: var(--bg-deep); color: var(--text-primary); }

  .app-container {
    display: flex;
    height: 100vh;
    overflow: hidden;
    background: var(--bg-deep);
  }

  /* ─── LEFT: TREE NAV ─── */
  .tree-sidebar {
    width: 260px;
    min-width: 260px;
    background: var(--bg-surface);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  .tree-header {
    padding: 20px 16px 12px;
    border-bottom: 1px solid var(--border);
  }

  .tree-header h2 {
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--text-muted);
    margin-bottom: 8px;
  }

  .project-name {
    font-size: 17px;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 2px;
  }

  .project-meta {
    font-size: 12px;
    color: var(--text-secondary);
    font-family: var(--font-mono);
  }

  .project-path {
    display: flex;
    flex-wrap: wrap;
    gap: 0;
    margin-top: 8px;
    font-size: 11px;
    line-height: 1.6;
  }

  .project-path .pp-segment {
    color: var(--text-muted);
    white-space: nowrap;
  }

  .project-path .pp-segment:last-child {
    color: var(--accent-blue);
    font-weight: 600;
  }

  .project-path .pp-sep {
    color: var(--border-active);
    margin: 0 4px;
    font-size: 9px;
  }

  .header-breadcrumb {
    display: flex;
    align-items: center;
    gap: 0;
    font-size: 12px;
    font-family: var(--font-mono);
  }

  .header-breadcrumb .hb-seg {
    color: var(--text-muted);
    white-space: nowrap;
  }

  .header-breadcrumb .hb-seg:last-child {
    color: var(--text-secondary);
  }

  .header-breadcrumb .hb-sep {
    color: var(--border);
    margin: 0 6px;
    font-size: 10px;
  }

  .tree-nav { padding: 12px 8px; flex: 1; }

  .tree-branch {
    margin-bottom: 2px;
  }

  .tree-branch-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-secondary);
    transition: all 0.15s;
    user-select: none;
  }

  .tree-branch-header:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .tree-branch-header.active {
    color: var(--accent-blue);
  }

  .tree-leaf {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px 7px 34px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
    transition: all 0.15s;
    position: relative;
  }

  .tree-leaf:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .tree-leaf.active {
    background: rgba(77, 139, 255, 0.1);
    color: var(--accent-blue);
  }

  .tree-leaf.active::before {
    content: '';
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 16px;
    background: var(--accent-blue);
    border-radius: 2px;
  }

  .leaf-badge {
    margin-left: auto;
    font-size: 10px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 10px;
    font-family: var(--font-mono);
  }

  .leaf-badge.red { background: var(--accent-red-dim); color: var(--accent-red); }
  .leaf-badge.green { background: var(--accent-green-dim); color: var(--accent-green); }
  .leaf-badge.blue { background: var(--accent-blue-dim); color: var(--accent-blue); }
  .leaf-badge.muted { background: var(--bg-hover); color: var(--text-muted); }

  .tree-children {
    overflow: hidden;
    transition: max-height 0.25s ease;
  }

  /* ─── MAIN CONTENT ─── */
  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }

  .content-header {
    padding: 16px 24px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg-surface);
    min-height: 56px;
  }

  .content-header h1 {
    font-size: 18px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .content-body {
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }

  /* ─── ELIGIBILITY ─── */
  .eligibility-panel {
    padding: 24px;
    max-width: 900px;
    overflow-y: auto;
    height: 100%;
  }

  .elig-summary {
    display: flex;
    gap: 16px;
    margin-bottom: 24px;
  }

  .elig-stat {
    padding: 16px 20px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--bg-surface);
    flex: 1;
    text-align: center;
  }

  .elig-stat .number {
    font-size: 28px;
    font-weight: 700;
    font-family: var(--font-mono);
  }

  .elig-stat .label {
    font-size: 12px;
    color: var(--text-secondary);
    margin-top: 4px;
  }

  .elig-rule {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    margin-bottom: 6px;
    background: var(--bg-surface);
    transition: all 0.15s;
  }

  .elig-rule:hover {
    border-color: var(--border-active);
    background: var(--bg-elevated);
  }

  .elig-icon {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .elig-icon.pass { background: var(--accent-green-dim); color: var(--accent-green); }
  .elig-icon.fail { background: var(--accent-red-dim); color: var(--accent-red); }

  .elig-name { font-size: 14px; font-weight: 500; flex: 1; }
  .elig-detail { font-size: 12px; color: var(--text-secondary); font-family: var(--font-mono); }

  /* ─── SOLOMON CHAT ─── */
  .solomon-layout {
    display: flex;
    height: 100%;
    overflow: hidden;
  }

  .solomon-chat {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    height: 100%;
    overflow: hidden;
  }

  .solomon-toolbar {
    padding: 10px 20px;
    display: flex;
    align-items: center;
    gap: 10px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-surface);
  }

  .solomon-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--accent-blue);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    font-weight: 800;
    color: white;
    flex-shrink: 0;
  }

  .solomon-name-block {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .solomon-name-block .sn-name {
    font-size: 14px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .solomon-name-block .sn-status {
    font-size: 11px;
    color: var(--accent-green);
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .sn-status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent-green);
    animation: statusPulse 2s ease infinite;
  }

  @keyframes statusPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .model-selector {
    display: flex;
    gap: 3px;
    background: var(--bg-deep);
    padding: 3px;
    border-radius: var(--radius-sm);
    margin-left: auto;
  }

  .model-btn {
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 600;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    background: transparent;
    color: var(--text-secondary);
    font-family: var(--font-mono);
    transition: all 0.15s;
  }

  .model-btn.active {
    background: var(--accent-blue);
    color: white;
  }

  .model-btn:hover:not(.active) {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .et-toggle {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 4px 9px;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: transparent;
    font-family: var(--font-sans);
    transition: all 0.15s;
  }

  .et-toggle.on {
    border-color: var(--accent-purple);
    color: var(--accent-purple);
    background: rgba(167, 139, 250, 0.08);
  }

  .chat-messages {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: 0;
  }

  .chat-msg {
    max-width: 85%;
    padding: 14px 18px;
    border-radius: var(--radius-lg);
    font-size: 14px;
    line-height: 1.6;
    white-space: pre-wrap;
    position: relative;
  }

  .chat-msg.assistant {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    align-self: flex-start;
    border-bottom-left-radius: 4px;
  }

  .chat-msg.user {
    background: var(--accent-blue-dim);
    border: 1px solid rgba(77, 139, 255, 0.2);
    align-self: flex-end;
    border-bottom-right-radius: 4px;
  }

  .chat-msg .msg-bold {
    font-weight: 600;
    color: var(--text-primary);
  }

  /* Extraction cards inside chat */
  .extraction-cards {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .extraction-card {
    background: var(--bg-deep);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 10px 14px;
    transition: all 0.2s;
  }

  .extraction-card.confirmed {
    border-color: var(--accent-green);
    background: rgba(52,211,153,0.05);
  }

  .extraction-card.rejected {
    border-color: var(--accent-red);
    opacity: 0.5;
    text-decoration: line-through;
  }

  .exc-top {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }

  .exc-label {
    font-size: 12px;
    color: var(--text-muted);
    flex: 1;
  }

  .exc-confidence {
    font-size: 11px;
    font-family: var(--font-mono);
    font-weight: 600;
    color: var(--text-secondary);
  }

  .exc-value {
    font-size: 14px;
    font-weight: 600;
    color: var(--accent-blue);
    font-family: var(--font-mono);
    margin-bottom: 8px;
  }

  .exc-actions {
    display: flex;
    gap: 6px;
  }

  .exc-btn {
    padding: 4px 12px;
    border-radius: 4px;
    border: 1px solid var(--border);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    font-family: var(--font-sans);
    display: flex;
    align-items: center;
    gap: 4px;
    transition: all 0.15s;
    background: transparent;
  }

  .exc-btn.confirm-btn {
    border-color: var(--accent-green);
    color: var(--accent-green);
  }

  .exc-btn.confirm-btn:hover {
    background: rgba(52,211,153,0.1);
  }

  .exc-btn.reject-btn {
    color: var(--text-muted);
  }

  .exc-btn.reject-btn:hover {
    color: var(--accent-red);
    border-color: var(--accent-red);
  }

  .exc-btn.edit-btn {
    color: var(--text-secondary);
  }

  .exc-btn.edit-btn:hover {
    color: var(--accent-yellow);
    border-color: var(--accent-yellow);
  }

  .exc-confirmed-label {
    font-size: 11px;
    font-weight: 700;
    color: var(--accent-green);
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .chat-timestamp {
    font-size: 10px;
    color: var(--text-muted);
    margin-top: 4px;
  }

  .chat-input-area {
    padding: 14px 20px;
    border-top: 1px solid var(--border);
    background: var(--bg-surface);
  }

  .chat-input-row {
    display: flex;
    gap: 8px;
    align-items: flex-end;
  }

  .chat-input {
    flex: 1;
    padding: 12px 16px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--bg-deep);
    color: var(--text-primary);
    font-size: 14px;
    font-family: var(--font-sans);
    line-height: 1.5;
    resize: none;
    outline: none;
    min-height: 44px;
    max-height: 160px;
    overflow-y: auto;
    transition: border-color 0.15s;
    field-sizing: content;
  }

  .chat-input:focus { border-color: var(--accent-blue); }
  .chat-input::placeholder { color: var(--text-muted); }

  .chat-btn {
    width: 44px;
    height: 44px;
    border-radius: var(--radius-md);
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    flex-shrink: 0;
  }

  .chat-btn.send {
    background: var(--accent-blue);
    color: white;
  }

  .chat-btn.send:hover { background: #5d9bff; }

  .chat-btn.upload-btn {
    background: var(--bg-elevated);
    color: var(--text-secondary);
    border: 1px solid var(--border);
  }

  .chat-btn.upload-btn:hover {
    border-color: var(--border-active);
    color: var(--text-primary);
  }

  /* Right panel: Elements */
  .solomon-elements-panel {
    background: var(--bg-surface);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    height: 100%;
  }

  .sep-header {
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .sep-count {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 8px;
    background: var(--accent-blue-dim);
    color: var(--accent-blue);
    font-family: var(--font-mono);
  }

  .sep-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .sep-card {
    padding: 12px 14px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    transition: all 0.15s;
  }

  .sep-card:hover {
    border-color: var(--border-active);
  }

  .sep-card.is-confirmed {
    border-left: 3px solid var(--accent-green);
  }

  .sep-card.is-proposed {
    border-left: 3px solid var(--accent-yellow);
  }

  .sep-card-label {
    font-size: 13px;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 3px;
  }

  .sep-card-value {
    font-size: 14px;
    font-weight: 600;
    color: var(--accent-yellow);
    font-family: var(--font-mono);
    margin-bottom: 6px;
    word-break: break-word;
  }

  .sep-card.is-confirmed .sep-card-value {
    color: var(--accent-green);
  }

  .sep-card-source {
    font-size: 11px;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .sep-card-source .src-icon {
    width: 12px;
    height: 12px;
    background: var(--bg-hover);
    border-radius: 2px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 8px;
  }

  .sep-confirm-row {
    margin-top: 8px;
    display: flex;
    gap: 6px;
  }

  .sep-confirm-btn {
    padding: 3px 10px;
    border-radius: 4px;
    border: 1px solid var(--accent-green);
    background: transparent;
    color: var(--accent-green);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    font-family: var(--font-sans);
    display: flex;
    align-items: center;
    gap: 3px;
    transition: all 0.15s;
  }

  .sep-confirm-btn:hover {
    background: rgba(52,211,153,0.1);
  }

  .sep-reject-btn {
    padding: 3px 10px;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    font-family: var(--font-sans);
    transition: all 0.15s;
  }

  .sep-reject-btn:hover {
    color: var(--accent-red);
    border-color: var(--accent-red);
  }

  .sep-confirmed-badge {
    font-size: 10px;
    color: var(--accent-green);
    font-weight: 700;
    margin-top: 6px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  /* Inline Refine Popup */
  .inline-refine-popup {
    position: fixed;
    z-index: 1000;
    background: var(--bg-elevated);
    border: 1px solid var(--accent-blue);
    border-radius: var(--radius-md);
    padding: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    width: 340px;
    animation: popIn 0.15s ease;
  }

  @keyframes popIn {
    from { opacity: 0; transform: translateY(4px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  .refine-selected-text {
    font-size: 12px;
    color: var(--text-secondary);
    background: var(--bg-deep);
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    margin-bottom: 8px;
    max-height: 60px;
    overflow: hidden;
    border-left: 3px solid var(--accent-blue);
  }

  .refine-input-row {
    display: flex;
    gap: 6px;
  }

  .refine-input {
    flex: 1;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--bg-deep);
    color: var(--text-primary);
    font-size: 13px;
    font-family: var(--font-sans);
    outline: none;
  }

  .refine-input:focus { border-color: var(--accent-blue); }

  .refine-submit {
    padding: 8px 14px;
    border-radius: var(--radius-sm);
    border: none;
    background: var(--accent-blue);
    color: white;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: var(--font-sans);
  }

  /* ─── GHID FINANTARE ─── */
  .ghid-layout {
    display: flex;
    height: 100%;
  }

  .ghid-sub-tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--border);
    background: var(--bg-surface);
    padding: 0 20px;
  }

  .ghid-sub-tab {
    padding: 12px 20px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.15s;
    background: none;
    border-top: none;
    border-left: none;
    border-right: none;
    font-family: var(--font-sans);
  }

  .ghid-sub-tab:hover { color: var(--text-primary); }
  .ghid-sub-tab.active {
    color: var(--accent-blue);
    border-bottom-color: var(--accent-blue);
  }

  .rules-panel {
    overflow-y: auto;
    padding: 16px;
    height: 100%;
  }

  .rule-card {
    padding: 12px 14px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    margin-bottom: 8px;
    cursor: pointer;
    transition: all 0.2s;
    background: var(--bg-surface);
  }

  .rule-card:hover, .rule-card.active {
    border-color: var(--accent-blue);
    background: rgba(77, 139, 255, 0.05);
  }

  .rule-card .rule-type {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
    display: block;
  }

  .rule-card .rule-type span.rt-badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 4px;
    line-height: 1;
  }

  .rule-card .rule-type.fixed span.rt-badge {
    color: var(--accent-green);
    background: rgba(52,211,153,0.12);
    border: 1px solid rgba(52,211,153,0.25);
  }

  .rule-card .rule-type.interpreted span.rt-badge {
    color: var(--accent-orange);
    background: rgba(251,146,60,0.12);
    border: 1px solid rgba(251,146,60,0.25);
  }

  .rule-card .rule-type .rt-review {
    display: inline-block;
    margin-left: 6px;
    color: var(--accent-yellow);
    font-size: 10px;
    vertical-align: middle;
  }

  .rule-card .rule-text {
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-primary);
  }

  .rule-card .rule-meta {
    font-size: 11px;
    color: var(--text-muted);
    margin-top: 6px;
    font-family: var(--font-mono);
    display: flex;
    gap: 12px;
  }

  .confidence-bar {
    width: 48px;
    height: 4px;
    background: var(--bg-deep);
    border-radius: 2px;
    overflow: hidden;
    display: inline-block;
    vertical-align: middle;
    margin-left: 4px;
  }

  .confidence-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.3s;
  }

  .pdf-viewer {
    flex: 1;
    background: var(--bg-deep);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
  }

  .pdf-page-mock {
    width: 480px;
    background: #fff;
    border-radius: 4px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.4);
    padding: 48px 40px;
    min-height: 620px;
    color: #1a1a2e;
    position: relative;
  }

  .pdf-page-mock h3 {
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 16px;
    color: #1a1a2e;
  }

  .pdf-highlight {
    background: rgba(77, 139, 255, 0.2);
    border-left: 3px solid var(--accent-blue);
    padding: 8px 12px;
    margin: 8px 0;
    border-radius: 0 4px 4px 0;
    animation: highlightPulse 1.5s ease infinite;
  }

  @keyframes highlightPulse {
    0%, 100% { background: rgba(77, 139, 255, 0.15); }
    50% { background: rgba(77, 139, 255, 0.3); }
  }

  .pdf-text-line {
    height: 10px;
    background: #d4d8e0;
    border-radius: 2px;
    margin: 8px 0;
  }

  .pdf-page-num {
    position: absolute;
    bottom: 16px;
    right: 24px;
    font-size: 12px;
    color: #888;
    font-family: var(--font-mono);
  }

  /* ─── NEEMIA ─── */
  .neemia-layout {
    display: flex;
    height: 100%;
  }

  .neemia-templates {
    width: 240px;
    min-width: 240px;
    border-right: 1px solid var(--border);
    padding: 16px;
    overflow-y: auto;
  }

  .neemia-templates h3 {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--text-muted);
    margin-bottom: 12px;
  }

  .template-card {
    padding: 12px 14px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    margin-bottom: 8px;
    cursor: pointer;
    transition: all 0.15s;
    background: var(--bg-surface);
  }

  .template-card:hover { border-color: var(--border-active); }
  .template-card.active { border-color: var(--accent-blue); background: rgba(77, 139, 255, 0.05); }

  .template-card .tc-name {
    font-size: 14px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .tc-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 3px;
    background: var(--bg-hover);
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .template-card .tc-info {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .template-card .tc-progress {
    height: 3px;
    background: var(--bg-deep);
    border-radius: 2px;
    margin-top: 8px;
    overflow: hidden;
  }

  .tc-progress-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.5s ease;
  }

  .neemia-doc-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .neemia-page-nav {
    padding: 12px 20px;
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-surface);
  }

  .neemia-page-nav .nav-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
    margin-right: 8px;
  }

  .page-thumb {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    border: 2px solid transparent;
    transition: all 0.15s;
    font-family: var(--font-mono);
  }

  .page-thumb.complete { background: var(--accent-green-dim); color: var(--accent-green); }
  .page-thumb.partial { background: var(--accent-yellow-dim); color: var(--accent-yellow); }
  .page-thumb.empty { background: var(--accent-red-dim); color: var(--accent-red); }
  .page-thumb.active { border-color: var(--accent-blue); box-shadow: 0 0 0 2px rgba(77,139,255,0.3); }

  .download-btn {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius: var(--radius-sm);
    border: none;
    background: var(--accent-green);
    color: #0a0c10;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    font-family: var(--font-sans);
    transition: all 0.15s;
  }

  .download-btn:hover { background: #4ae3a9; }

  .neemia-preview-area {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .neemia-doc-preview {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-deep);
    padding: 24px;
  }

  .doc-page {
    width: 460px;
    min-height: 580px;
    background: #fff;
    border-radius: 4px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.4);
    padding: 40px 36px;
    color: #1a1a2e;
    position: relative;
    animation: pageSlide 0.55s ease;
  }

  @keyframes pageSlide {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .doc-page .doc-header-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    color: #888;
    margin-bottom: 4px;
  }

  .doc-page .doc-page-title {
    font-size: 20px;
    font-weight: 700;
    margin-bottom: 24px;
    color: #1a1a2e;
  }

  .doc-field-group {
    margin-bottom: 18px;
  }

  .doc-field-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: #888;
    margin-bottom: 4px;
  }

  .doc-field-value {
    font-size: 15px;
    font-weight: 600;
    color: #1a1a2e;
    padding-bottom: 4px;
    border-bottom: 2px solid #4d8bff;
  }

  .doc-field-missing {
    font-size: 15px;
    font-style: italic;
    color: #e74c3c;
    padding-bottom: 4px;
    border-bottom: 2px dashed #e74c3c;
  }

  .doc-page-number {
    position: absolute;
    bottom: 16px;
    right: 24px;
    font-size: 12px;
    color: #aaa;
    font-family: var(--font-mono);
  }

  .neemia-fields-panel {
    width: 300px;
    min-width: 300px;
    border-left: 1px solid var(--border);
    overflow-y: auto;
    padding: 16px;
    background: var(--bg-surface);
  }

  .neemia-fields-panel h3 {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--text-muted);
    margin-bottom: 12px;
  }

  .field-card {
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    margin-bottom: 6px;
    background: var(--bg-elevated);
  }

  .field-card .field-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 3px;
  }

  .field-card .field-val {
    font-size: 13px;
    color: var(--accent-blue);
    font-weight: 500;
  }

  .field-card .field-val.missing {
    color: var(--accent-red);
    font-style: italic;
  }

  .field-source {
    font-size: 10px;
    color: var(--text-muted);
    margin-top: 3px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .source-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    display: inline-block;
  }

  .source-dot.solomon { background: var(--accent-blue); }
  .source-dot.onrc { background: var(--accent-green); }

  /* ─── SCROLLBAR ─── */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--border-active); }

  /* ─── ANIMATIONS ─── */
  .fade-in {
    animation: fadeIn 0.3s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .coming-soon-panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-muted);
    gap: 12px;
  }

  .coming-soon-panel .cs-label {
    font-size: 14px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .coming-soon-panel .cs-desc {
    font-size: 13px;
    color: var(--text-secondary);
  }

  /* ─── ELEMENTE ─── */
  .elemente-layout {
    display: flex;
    height: 100%;
  }

  .elemente-list-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
    height: 100%;
  }

  /* Completitudine bar */
  .completitudine-bar {
    padding: 20px 24px;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border);
  }

  .completitudine-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .completitudine-top .cl-label {
    font-size: 15px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .completitudine-top .cl-pct {
    font-size: 28px;
    font-weight: 800;
    font-family: var(--font-mono);
  }

  .progress-track {
    height: 8px;
    background: var(--bg-deep);
    border-radius: 4px;
    overflow: hidden;
    display: flex;
    gap: 2px;
    margin-bottom: 10px;
  }

  .progress-seg {
    height: 100%;
    border-radius: 3px;
    transition: width 0.5s ease;
  }

  .completitudine-legend {
    display: flex;
    gap: 20px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .legend-item .li-num {
    font-weight: 700;
    font-family: var(--font-mono);
    color: var(--text-primary);
  }

  /* Filter bar */
  .elemente-filter-bar {
    padding: 12px 24px;
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-surface);
  }

  .elemente-search {
    padding: 7px 14px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--bg-deep);
    color: var(--text-primary);
    font-size: 13px;
    font-family: var(--font-sans);
    outline: none;
    width: 180px;
    transition: border-color 0.15s;
  }

  .elemente-search:focus { border-color: var(--accent-blue); }
  .elemente-search::placeholder { color: var(--text-muted); }

  .filter-pill-group {
    display: flex;
    background: var(--bg-deep);
    border-radius: var(--radius-md);
    padding: 3px;
    gap: 2px;
  }

  .filter-pill {
    padding: 5px 14px;
    border-radius: 7px;
    font-size: 12px;
    font-weight: 600;
    border: none;
    cursor: pointer;
    background: transparent;
    color: var(--text-secondary);
    font-family: var(--font-sans);
    transition: all 0.15s;
    white-space: nowrap;
  }

  .filter-pill:hover { color: var(--text-primary); }

  .filter-pill.active {
    background: var(--accent-blue);
    color: white;
  }

  .filter-pill.active-green {
    background: var(--accent-green);
    color: var(--bg-deep);
  }

  .filter-pill.active-yellow {
    background: var(--accent-yellow);
    color: var(--bg-deep);
  }

  .filter-pill.active-red {
    background: var(--accent-red);
    color: white;
  }

  /* Element cards */
  .elemente-cards-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 16px 24px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .elem-card {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 14px 18px;
    cursor: pointer;
    transition: all 0.18s;
    position: relative;
  }

  .elem-card:hover {
    border-color: var(--border-active);
    background: var(--bg-elevated);
  }

  .elem-card.active {
    border-color: var(--accent-blue);
    background: rgba(77,139,255,0.04);
    box-shadow: 0 0 0 1px rgba(77,139,255,0.15);
  }

  .elem-card-top {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .ec-key {
    font-size: 12px;
    font-family: var(--font-mono);
    color: var(--text-muted);
  }

  .ec-status {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 10px;
  }

  .ec-status.confirmat {
    background: rgba(52,211,153,0.15);
    color: var(--accent-green);
  }

  .ec-status.propus_ai {
    background: rgba(251,191,36,0.15);
    color: var(--accent-yellow);
  }

  .ec-status.gol {
    background: rgba(248,113,113,0.12);
    color: var(--accent-red);
    opacity: 0.7;
  }

  .ec-status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }

  .ec-modif {
    font-size: 11px;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .ec-copy-icon {
    margin-left: auto;
    color: var(--text-muted);
    cursor: pointer;
    opacity: 0.4;
    transition: opacity 0.15s;
  }

  .ec-copy-icon:hover { opacity: 1; }

  .ec-confidence {
    margin-left: auto;
    font-size: 14px;
    font-weight: 700;
    font-family: var(--font-mono);
    color: var(--text-secondary);
  }

  .elem-card-label {
    font-size: 15px;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 4px;
  }

  .elem-card-value {
    font-size: 14px;
    color: var(--text-secondary);
    margin-bottom: 8px;
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .elem-card-value.empty {
    color: var(--text-muted);
    font-style: italic;
    opacity: 0.6;
  }

  .ec-templates-row {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  }

  .ec-tmpl-chip {
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 4px;
    background: var(--bg-hover);
    color: var(--text-secondary);
    font-family: var(--font-mono);
    border: 1px solid var(--border);
  }

  /* ─── DETAIL PANEL ─── */
  .elem-detail-panel {
    background: var(--bg-surface);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .edp-header {
    padding: 24px 20px 16px;
    border-bottom: 1px solid var(--border);
    position: relative;
  }

  .edp-close {
    position: absolute;
    top: 16px;
    right: 16px;
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 4px;
    transition: color 0.15s;
  }

  .edp-close:hover { color: var(--text-primary); }

  .edp-header .edp-key {
    font-size: 12px;
    font-family: var(--font-mono);
    color: var(--text-muted);
    margin-bottom: 6px;
  }

  .edp-header .edp-label {
    font-size: 20px;
    font-weight: 800;
    color: var(--text-primary);
    margin-bottom: 10px;
  }

  .edp-section {
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
  }

  .edp-section-title {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--text-muted);
    margin-bottom: 10px;
  }

  .edp-value-box {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    padding: 14px 16px;
    background: var(--bg-deep);
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    word-break: break-word;
    font-family: var(--font-mono);
    line-height: 1.5;
  }

  .edp-value-box.empty {
    color: var(--accent-red);
    font-style: italic;
    font-weight: 500;
    opacity: 0.7;
    font-family: var(--font-sans);
  }

  .edp-source-block {
    margin-top: 14px;
    padding: 14px 16px;
    background: var(--bg-deep);
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
  }

  .edp-source-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 10px;
  }

  .edp-excerpt-quote {
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.6;
    font-style: italic;
    border-left: 3px solid var(--accent-blue);
    padding-left: 12px;
    margin-bottom: 10px;
  }

  .edp-confidence-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .edp-confidence-row .conf-val {
    font-weight: 800;
    font-family: var(--font-mono);
  }

  .edp-edit-btn {
    margin-top: 14px;
    width: 100%;
    padding: 12px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    font-family: var(--font-sans);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: all 0.15s;
  }

  .edp-edit-btn:hover {
    border-color: var(--accent-blue);
    background: rgba(77,139,255,0.06);
  }

  .edp-templates-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .edp-tmpl-tag {
    padding: 5px 12px;
    border-radius: var(--radius-sm);
    background: var(--bg-deep);
    border: 1px solid var(--accent-blue);
    font-size: 12px;
    color: var(--accent-blue);
    font-weight: 600;
  }

  /* ─── AUDIT LOG ─── */
  .audit-timeline {
    position: relative;
    padding-left: 22px;
  }

  .audit-timeline::before {
    content: '';
    position: absolute;
    left: 6px;
    top: 4px;
    bottom: 4px;
    width: 2px;
    background: var(--border);
    border-radius: 1px;
  }

  .audit-entry {
    position: relative;
    margin-bottom: 18px;
    padding-left: 4px;
  }

  .audit-entry:last-child { margin-bottom: 0; }

  .audit-dot {
    position: absolute;
    left: -20px;
    top: 4px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 2px solid var(--bg-surface);
  }

  .audit-dot.created { background: var(--accent-green); }
  .audit-dot.updated { background: var(--accent-blue); }
  .audit-dot.confirmed { background: var(--accent-purple); }
  .audit-dot.deleted { background: var(--accent-red); }

  .audit-entry .ae-time {
    font-size: 11px;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .audit-entry .ae-action {
    font-size: 12px;
    color: var(--text-secondary);
    margin-top: 2px;
    line-height: 1.4;
  }

  .audit-entry .ae-action strong {
    color: var(--text-primary);
    font-weight: 600;
  }

  .audit-entry .ae-value {
    font-size: 12px;
    color: var(--accent-blue);
    margin-top: 3px;
    font-family: var(--font-mono);
    word-break: break-all;
  }

  .audit-empty {
    font-size: 13px;
    color: var(--text-muted);
    font-style: italic;
    text-align: center;
    padding: 20px;
  }

  /* ─── CHECKLIST DOCUMENTE ─── */
  .checklist-layout {
    display: flex;
    height: 100%;
    flex-direction: column;
    overflow: hidden;
  }

  .checklist-header-bar {
    padding: 16px 24px;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .checklist-progress-ring {
    width: 52px;
    height: 52px;
    position: relative;
    flex-shrink: 0;
  }

  .checklist-progress-ring svg {
    transform: rotate(-90deg);
  }

  .cpr-center {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 800;
    font-family: var(--font-mono);
  }

  .checklist-header-stats {
    flex: 1;
  }

  .chs-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 4px;
  }

  .chs-counts {
    display: flex;
    gap: 16px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .chs-counts .cc-num {
    font-weight: 700;
    font-family: var(--font-mono);
    color: var(--text-primary);
  }

  .checklist-actions-row {
    display: flex;
    gap: 8px;
  }

  .cl-action-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 7px 14px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    font-family: var(--font-sans);
    transition: all 0.15s;
  }

  .cl-action-btn:hover {
    border-color: var(--border-active);
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .cl-action-btn.primary {
    border-color: var(--accent-blue);
    color: var(--accent-blue);
  }

  .cl-action-btn.primary:hover {
    background: rgba(77,139,255,0.08);
  }

  .checklist-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 0;
  }

  /* Category group */
  .cl-category {
    border-bottom: 1px solid var(--border);
  }

  .cl-cat-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 24px;
    background: var(--bg-surface);
    cursor: pointer;
    transition: background 0.15s;
    position: sticky;
    top: 0;
    z-index: 2;
  }

  .cl-cat-header:hover {
    background: var(--bg-elevated);
  }

  .cl-cat-name {
    font-size: 13px;
    font-weight: 700;
    color: var(--text-primary);
    flex: 1;
  }

  .cl-cat-progress {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .cl-cat-bar {
    width: 80px;
    height: 4px;
    background: var(--bg-deep);
    border-radius: 2px;
    overflow: hidden;
  }

  .cl-cat-bar-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.4s ease;
  }

  .cl-cat-count {
    font-size: 11px;
    font-family: var(--font-mono);
    font-weight: 600;
    color: var(--text-secondary);
    min-width: 36px;
    text-align: right;
  }

  /* Document row */
  .cl-doc-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 24px 10px 44px;
    border-bottom: 1px solid rgba(42,48,64,0.5);
    transition: background 0.12s;
    min-height: 52px;
  }

  .cl-doc-row:hover {
    background: var(--bg-hover);
  }

  .cl-doc-row:last-child {
    border-bottom: none;
  }

  .cl-checkbox {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    border: 2px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s;
  }

  .cl-checkbox:hover {
    border-color: var(--accent-green);
  }

  .cl-checkbox.checked {
    background: var(--accent-green);
    border-color: var(--accent-green);
  }

  .cl-doc-info {
    flex: 1;
    min-width: 0;
  }

  .cl-doc-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .cl-doc-name.done-text {
    color: var(--text-secondary);
  }

  .cl-doc-source-tag {
    font-size: 9px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .cl-doc-source-tag.ghid {
    background: rgba(77,139,255,0.12);
    color: var(--accent-blue);
  }

  .cl-doc-source-tag.manual {
    background: rgba(167,139,250,0.12);
    color: var(--accent-purple);
  }

  .cl-template-area {
    width: 220px;
    min-width: 220px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .cl-template-mapped {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    background: rgba(52,211,153,0.08);
    border: 1px solid rgba(52,211,153,0.2);
    font-size: 12px;
    font-weight: 600;
    color: var(--accent-green);
    transition: all 0.15s;
  }

  .cl-template-mapped:hover {
    border-color: var(--accent-yellow);
    color: var(--accent-yellow);
    background: rgba(251,191,36,0.06);
  }

  .cl-template-select {
    padding: 5px 10px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--bg-deep);
    color: var(--text-secondary);
    font-size: 12px;
    font-family: var(--font-sans);
    cursor: pointer;
    outline: none;
    width: 100%;
    transition: border-color 0.15s;
    appearance: auto;
  }

  .cl-template-select:hover,
  .cl-template-select:focus {
    border-color: var(--accent-blue);
  }

  .cl-no-template {
    font-size: 11px;
    color: var(--text-muted);
    font-style: italic;
    padding: 4px 0;
  }

  .cl-doc-actions {
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .cl-doc-row:hover .cl-doc-actions {
    opacity: 1;
  }

  .cl-doc-action-btn {
    width: 28px;
    height: 28px;
    border-radius: 4px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }

  .cl-doc-action-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .cl-doc-action-btn.delete:hover {
    color: var(--accent-red);
  }

  /* Unmapped templates banner */
  .cl-unmapped-banner {
    margin: 12px 24px;
    padding: 12px 16px;
    border-radius: var(--radius-md);
    border: 1px dashed var(--accent-yellow);
    background: rgba(251,191,36,0.04);
  }

  .cl-unmapped-title {
    font-size: 12px;
    font-weight: 700;
    color: var(--accent-yellow);
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .cl-unmapped-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .cl-unmapped-chip {
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    font-size: 12px;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 4px;
    font-family: var(--font-mono);
  }

  /* Add document modal inline */
  .cl-add-inline {
    display: flex;
    gap: 8px;
    padding: 10px 24px 10px 44px;
    border-bottom: 1px solid var(--border);
    background: rgba(77,139,255,0.03);
    align-items: center;
  }

  .cl-add-input {
    flex: 1;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--accent-blue);
    background: var(--bg-deep);
    color: var(--text-primary);
    font-size: 13px;
    font-family: var(--font-sans);
    outline: none;
  }

  .cl-add-cat-select {
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--bg-deep);
    color: var(--text-secondary);
    font-size: 12px;
    font-family: var(--font-sans);
    outline: none;
    appearance: auto;
  }

  .cl-add-save {
    padding: 8px 14px;
    border-radius: var(--radius-sm);
    border: none;
    background: var(--accent-blue);
    color: white;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    font-family: var(--font-sans);
  }

  .cl-add-cancel {
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    font-family: var(--font-sans);
  }

  /* ─── SPLIT PANE ─── */
  .split-pane {
    display: flex;
    height: 100%;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .split-left {
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
  }

  .split-right {
    overflow: hidden;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    min-height: 0;
    height: 100%;
  }

  .split-handle {
    width: 8px;
    cursor: col-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    z-index: 5;
    flex-shrink: 0;
    transition: background 0.15s;
  }

  .split-handle::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 3px;
    width: 1px;
    background: var(--border);
    transition: all 0.15s;
  }

  .split-handle:hover::before,
  .split-handle.active::before {
    left: 2px;
    width: 3px;
    background: var(--accent-blue);
    border-radius: 2px;
    box-shadow: 0 0 8px rgba(77,139,255,0.3);
  }

  .split-handle-dots {
    display: flex;
    flex-direction: column;
    gap: 3px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .split-handle:hover .split-handle-dots,
  .split-handle.active .split-handle-dots {
    opacity: 1;
  }

  .split-handle-dots span {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--accent-blue);
  }
`;

// ─── COMPONENTS ───

function TreeBranch({ icon, label, badge, children, defaultOpen = false, active }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="tree-branch">
      <div
        className={`tree-branch-header ${active ? "active" : ""}`}
        onClick={() => setOpen(!open)}
      >
        {open ? <Icons.ChevronDown size={14} /> : <Icons.ChevronRight size={14} />}
        {icon}
        <span style={{ flex: 1 }}>{label}</span>
        {badge}
      </div>
      <div className="tree-children" style={{ maxHeight: open ? "500px" : "0px" }}>
        {children}
      </div>
    </div>
  );
}

function TreeLeaf({ icon, label, badge, active, onClick }) {
  return (
    <div className={`tree-leaf ${active ? "active" : ""}`} onClick={onClick}>
      {icon}
      <span style={{ flex: 1 }}>{label}</span>
      {badge}
    </div>
  );
}

// ─── SPLIT PANE ───
function SplitPane({ left, right, defaultWidth = 320, minA = 280, minB = 200, maxB = 600, side = "right" }) {
  const [panelW, setPanelW] = useState(defaultWidth);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef(null);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      let newW;
      if (side === "right") {
        newW = rect.right - e.clientX;
      } else {
        newW = e.clientX - rect.left;
      }
      const clamped = Math.max(minB, Math.min(maxB, newW));
      if (rect.width - clamped >= minA) {
        setPanelW(clamped);
      }
    };
    const handleMouseUp = () => setDragging(false);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, minA, minB, maxB, side]);

  const handle = (
    <div
      className={`split-handle ${dragging ? "active" : ""}`}
      onMouseDown={handleMouseDown}
    >
      <div className="split-handle-dots">
        <span /><span /><span />
      </div>
    </div>
  );

  if (side === "left") {
    return (
      <div ref={containerRef} className="split-pane" style={{ userSelect: dragging ? "none" : "auto" }}>
        <div className="split-right" style={{ width: panelW, minWidth: minB, maxWidth: maxB, flexShrink: 0 }}>
          {left}
        </div>
        {handle}
        <div className="split-left" style={{ flex: 1, minWidth: minA }}>
          {right}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="split-pane" style={{ userSelect: dragging ? "none" : "auto" }}>
      <div className="split-left" style={{ flex: 1, minWidth: minA }}>
        {left}
      </div>
      {handle}
      <div className="split-right" style={{ width: panelW, minWidth: minB, maxWidth: maxB, flexShrink: 0 }}>
        {right}
      </div>
    </div>
  );
}

// ─── ELIGIBILITY VIEW ───
function EligibilityView() {
  const passed = ELIGIBILITY_RULES.filter(r => r.status === "pass").length;
  const failed = ELIGIBILITY_RULES.filter(r => r.status === "fail").length;
  return (
    <div className="eligibility-panel fade-in">
      <div className="elig-summary">
        <div className="elig-stat">
          <div className="number" style={{ color: "var(--accent-green)" }}>{passed}</div>
          <div className="label">Trecute</div>
        </div>
        <div className="elig-stat">
          <div className="number" style={{ color: "var(--accent-red)" }}>{failed}</div>
          <div className="label">Eșuate</div>
        </div>
        <div className="elig-stat">
          <div className="number" style={{ color: "var(--text-primary)" }}>{ELIGIBILITY_RULES.length}</div>
          <div className="label">Total reguli</div>
        </div>
      </div>
      {ELIGIBILITY_RULES.map(rule => (
        <div className="elig-rule" key={rule.id}>
          <div className={`elig-icon ${rule.status}`}>
            {rule.status === "pass" ? <Icons.Check size={14} /> : <Icons.X size={14} />}
          </div>
          <div className="elig-name">{rule.name}</div>
          <div className="elig-detail">{rule.detail}</div>
        </div>
      ))}
    </div>
  );
}

// ─── SOLOMON VIEW ───
function SolomonView() {
  const [model, setModel] = useState("opus");
  const [et, setET] = useState(true);
  const [messages, setMessages] = useState(SOLOMON_MESSAGES);
  const [input, setInput] = useState("");
  const [refinePopup, setRefinePopup] = useState(null);
  const [refineInput, setRefineInput] = useState("");
  const [elements, setElements] = useState(SOLOMON_ELEMENTS);
  const [extractionStates, setExtractionStates] = useState({});
  const chatRef = useRef(null);
  const popupRef = useRef(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const close = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) setRefinePopup(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages(prev => [...prev, { role: "user", text: input, extractions: null }]);
    setInput("");
    setTimeout(() => {
      setMessages(prev => [...prev, {
        role: "assistant",
        text: "Am procesat informația. Iată ce am extras:",
        extractions: [
          { key: "nou_element", label: "Element nou", value: input.substring(0, 40) + "...", confidence: 78 },
        ]
      }]);
    }, 800);
  };

  const handleConfirmExtraction = (msgIdx, extIdx) => {
    const k = `${msgIdx}-${extIdx}`;
    setExtractionStates(prev => ({ ...prev, [k]: "confirmed" }));
    const msg = messages[msgIdx];
    if (msg?.extractions?.[extIdx]) {
      const ext = msg.extractions[extIdx];
      setElements(prev => [
        { key: ext.key, label: ext.label, value: ext.value, source: "Chat Solomon", status: "confirmat" },
        ...prev,
      ]);
    }
  };

  const handleRejectExtraction = (msgIdx, extIdx) => {
    const k = `${msgIdx}-${extIdx}`;
    setExtractionStates(prev => ({ ...prev, [k]: "rejected" }));
  };

  const handleConfirmElement = (idx) => {
    setElements(prev => prev.map((el, i) => i === idx ? { ...el, status: "confirmat" } : el));
  };

  const handleRejectElement = (idx) => {
    setElements(prev => prev.filter((_, i) => i !== idx));
  };

  const handleTextSelect = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString().trim();
    if (text.length < 5) return;
    const msgEl = sel.anchorNode?.parentElement?.closest?.(".chat-msg.assistant");
    if (!msgEl) return;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setRefinePopup({ text, x: rect.left, y: rect.bottom + 8 });
    setRefineInput("");
  }, []);

  const handleRefineSubmit = () => {
    if (!refineInput.trim() || !refinePopup) return;
    setMessages(prev => [...prev, {
      role: "assistant",
      text: `✨ Fragment regenerat: "${refineInput}":\n\n${refinePopup.text.substring(0, 60)}... [actualizat]`,
      extractions: null,
    }]);
    setRefinePopup(null);
    setRefineInput("");
  };

  const renderMsgText = (text) => {
    return text.split(/(\*\*.*?\*\*)/).map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <span key={i} className="msg-bold">{part.slice(2, -2)}</span>;
      }
      return part;
    });
  };

  const confirmedCount = elements.filter(e => e.status === "confirmat").length;

  return (
    <div className="solomon-layout">
      <SplitPane
        defaultWidth={320}
        minA={400}
        minB={240}
        maxB={500}
        side="right"
        left={
          <div className="solomon-chat">
            <div className="solomon-toolbar">
              <div className="solomon-avatar">S</div>
              <div className="solomon-name-block">
                <div className="sn-name">Solomon</div>
                <div className="sn-status"><span className="sn-status-dot" /> Activ · Agent colectare date</div>
              </div>
              <div className="model-selector">
                <button className={`model-btn ${model === "sonnet" ? "active" : ""}`} onClick={() => setModel("sonnet")}>Sonnet</button>
                <button className={`model-btn ${model === "opus" ? "active" : ""}`} onClick={() => setModel("opus")}>Opus</button>
              </div>
              <button className={`et-toggle ${et ? "on" : ""}`} onClick={() => setET(!et)}>
                <Icons.Sparkle size={11} />
                ET
              </button>
            </div>

            <div className="chat-messages" ref={chatRef} onMouseUp={handleTextSelect}>
              {messages.map((msg, msgIdx) => (
                <div key={msgIdx}>
                  <div className={`chat-msg ${msg.role}`}>
                    {renderMsgText(msg.text)}
                    {msg.extractions && (
                      <div className="extraction-cards">
                        {msg.extractions.map((ext, extIdx) => {
                          const k = `${msgIdx}-${extIdx}`;
                          const state = extractionStates[k];
                          return (
                            <div key={extIdx} className={`extraction-card ${state || ""}`}>
                              <div className="exc-top">
                                <span className="exc-label">{ext.label}</span>
                                <span className="exc-confidence">{ext.confidence}%</span>
                              </div>
                              <div className="exc-value">{ext.value}</div>
                              {!state ? (
                                <div className="exc-actions">
                                  <button className="exc-btn confirm-btn" onClick={(e) => { e.stopPropagation(); handleConfirmExtraction(msgIdx, extIdx); }}>
                                    <Icons.Check size={12} /> Confirmă
                                  </button>
                                  <button className="exc-btn edit-btn" title="Editează înainte de confirmare">
                                    ✏️ Editează
                                  </button>
                                  <button className="exc-btn reject-btn" onClick={(e) => { e.stopPropagation(); handleRejectExtraction(msgIdx, extIdx); }}>
                                    <Icons.X size={12} /> Respinge
                                  </button>
                                </div>
                              ) : state === "confirmed" ? (
                                <div className="exc-confirmed-label"><Icons.Check size={12} /> Salvat în Elemente</div>
                              ) : (
                                <div style={{ fontSize: 11, color: "var(--accent-red)" }}>Respins</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {msg.role === "assistant" && (
                    <div className="chat-timestamp">
                      <div className="solomon-avatar" style={{ width: 20, height: 20, fontSize: 10, display: "inline-flex", verticalAlign: "middle", marginRight: 6 }}>S</div>
                      {new Date().toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="chat-input-area">
              <div className="chat-input-row">
                <button className="chat-btn upload-btn" title="Upload document">
                  <Icons.Upload size={18} />
                </button>
                <button className="chat-btn upload-btn" title="Paste snippet" style={{ fontSize: 12, fontWeight: 600, width: "auto", padding: "0 12px" }}>
                  <Icons.Clipboard size={16} />
                </button>
                <textarea
                  className="chat-input"
                  placeholder="Scrie detalii despre proiect, lipește date, sau întreabă..."
                  value={input}
                  rows={1}
                  onChange={e => {
                    setInput(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                      e.target.style.height = "auto";
                    }
                  }}
                />
                <button className="chat-btn send" onClick={handleSend}>
                  <Icons.Send size={18} />
                </button>
              </div>
            </div>
          </div>
        }
        right={
          <div className="solomon-elements-panel">
            <div className="sep-header">
              Elemente completate
              <span className="sep-count">{confirmedCount}/{elements.length}</span>
            </div>
            <div className="sep-scroll">
              {elements.map((el, i) => (
                <div key={`${el.key}-${i}`} className={`sep-card ${el.status === "confirmat" ? "is-confirmed" : "is-proposed"}`}>
                  <div className="sep-card-label">{el.label}</div>
                  <div className="sep-card-value">{el.value}</div>
                  <div className="sep-card-source">
                    <span className="src-icon">📄</span>
                    {el.source}
                  </div>
                  {el.status === "confirmat" ? (
                    <div className="sep-confirmed-badge"><Icons.Check size={10} /> Confirmat</div>
                  ) : (
                    <div className="sep-confirm-row">
                      <button className="sep-confirm-btn" onClick={() => handleConfirmElement(i)}>
                        <Icons.Check size={10} /> Confirmă
                      </button>
                      <button className="sep-reject-btn" onClick={() => handleRejectElement(i)}>
                        <Icons.X size={10} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        }
      />

      {refinePopup && (
        <div
          ref={popupRef}
          className="inline-refine-popup"
          style={{ left: Math.min(refinePopup.x, window.innerWidth - 360), top: refinePopup.y }}
        >
          <div className="refine-selected-text">{refinePopup.text}</div>
          <div className="refine-input-row">
            <input
              className="refine-input"
              placeholder="Ex: fă-l mai formal, adaugă detalii..."
              value={refineInput}
              onChange={e => setRefineInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleRefineSubmit()}
              autoFocus
            />
            <button className="refine-submit" onClick={handleRefineSubmit}>Rescrie</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── GHID FINANTARE VIEW ───
function GhidFinantareView() {
  const [subTab, setSubTab] = useState("reguli");
  const [activeRule, setActiveRule] = useState(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="ghid-sub-tabs">
        <button className={`ghid-sub-tab ${subTab === "reguli" ? "active" : ""}`} onClick={() => setSubTab("reguli")}>
          Reguli
        </button>
        <button className={`ghid-sub-tab ${subTab === "ghid" ? "active" : ""}`} onClick={() => setSubTab("ghid")}>
          Ghid complet
        </button>
      </div>

      {subTab === "reguli" ? (
        <SplitPane
          side="left"
          defaultWidth={400}
          minA={300}
          minB={280}
          maxB={550}
          left={
            <div className="rules-panel">
              <div style={{ marginBottom: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
                  {GUIDE_RULES.length} reguli extrase · AFIR sM 4.1
                </span>
              </div>
              {GUIDE_RULES.map(rule => (
                <div
                  key={rule.id}
                  className={`rule-card ${activeRule === rule.id ? "active" : ""}`}
                  onClick={() => setActiveRule(rule.id)}
                  onMouseEnter={() => setActiveRule(rule.id)}
                >
                  <div className={`rule-type ${rule.type}`}>
                    <span className="rt-badge">
                      {rule.type === "fixed" ? "● FIXĂ" : "◆ INTERPRETATĂ"}
                    </span>
                    {rule.type === "interpreted" && rule.confidence < 0.85 && (
                      <span className="rt-review">
                        ⚠ REVIEW
                      </span>
                    )}
                  </div>
                  <div className="rule-text">{rule.text}</div>
                  <div className="rule-meta">
                    <span>pag. {rule.page}</span>
                    <span>
                      conf.
                      <span className="confidence-bar">
                        <span
                          className="confidence-fill"
                          style={{
                            width: `${rule.confidence * 100}%`,
                            background: rule.confidence >= 0.9 ? "var(--accent-green)" : rule.confidence >= 0.8 ? "var(--accent-yellow)" : "var(--accent-orange)"
                          }}
                        />
                      </span>
                      {Math.round(rule.confidence * 100)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          }
          right={
            <div className="pdf-viewer" style={{ flex: 1, height: "100%" }}>
              <div className="pdf-page-mock">
                {activeRule ? (() => {
                  const rule = GUIDE_RULES.find(r => r.id === activeRule);
                  return (
                    <>
                      <h3 style={{ fontSize: 14, color: "#555", fontWeight: 600 }}>
                        GHID SOLICITANT — AFIR sM 4.1
                      </h3>
                      <div className="pdf-text-line" style={{ width: "90%" }} />
                      <div className="pdf-text-line" style={{ width: "75%" }} />
                      <div className="pdf-text-line" style={{ width: "85%" }} />
                      <div style={{ margin: "16px 0", fontSize: 13, fontWeight: 700, color: "#333" }}>
                        {rule.highlight.toUpperCase()}
                      </div>
                      <div className="pdf-text-line" style={{ width: "70%" }} />
                      <div className="pdf-highlight">
                        <span style={{ fontSize: 13, color: "#1a1a2e", lineHeight: 1.6 }}>{rule.text}</span>
                      </div>
                      <div className="pdf-text-line" style={{ width: "80%" }} />
                      <div className="pdf-text-line" style={{ width: "60%" }} />
                      <div className="pdf-text-line" style={{ width: "88%" }} />
                      <div className="pdf-text-line" style={{ width: "72%" }} />
                      <div className="pdf-text-line" style={{ width: "45%" }} />
                      <div className="pdf-page-num">Pag. {rule.page}</div>
                    </>
                  );
                })() : (
                  <div style={{ textAlign: "center", padding: "80px 0", color: "#aaa" }}>
                    <Icons.Book size={40} />
                    <p style={{ marginTop: 12, fontSize: 14 }}>Selectează o regulă din stânga<br/>pentru a vedea contextul în ghid</p>
                  </div>
                )}
              </div>
            </div>
          }
        />
      ) : (
        <div className="pdf-viewer fade-in" style={{ flex: 1 }}>
          <div className="pdf-page-mock" style={{ minHeight: 640 }}>
            <h3 style={{ fontSize: 18, color: "#1a1a2e", marginBottom: 8 }}>
              GHID SOLICITANT
            </h3>
            <p style={{ fontSize: 14, color: "#555", marginBottom: 24 }}>
              Submăsura 4.1 — Investiții în exploatații agricole
            </p>
            <p style={{ fontSize: 13, color: "#333", lineHeight: 1.7 }}>
              Prezentul Ghid conține informațiile necesare pentru accesarea fondurilor
              nerambursabile prin Programul Național de Dezvoltare Rurală (PNDR)
              2021-2028, Măsura 1, Sesiunea 1.
            </p>
            <div className="pdf-text-line" style={{ width: "95%", marginTop: 20 }} />
            <div className="pdf-text-line" style={{ width: "88%" }} />
            <div className="pdf-text-line" style={{ width: "92%" }} />
            <div className="pdf-text-line" style={{ width: "70%" }} />
            <div style={{ margin: "24px 0 12px", fontSize: 15, fontWeight: 700, color: "#1a1a2e" }}>
              1. OBIECTIVELE SUBMĂSURII
            </div>
            <div className="pdf-text-line" style={{ width: "90%" }} />
            <div className="pdf-text-line" style={{ width: "85%" }} />
            <div className="pdf-text-line" style={{ width: "78%" }} />
            <div className="pdf-text-line" style={{ width: "92%" }} />
            <div className="pdf-text-line" style={{ width: "65%" }} />
            <div className="pdf-page-num">Pag. 1</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── NEEMIA VIEW ───
function NeemiaView() {
  const [activeTemplate, setActiveTemplate] = useState(0);
  const [activePage, setActivePage] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [animKey, setAnimKey] = useState(0);

  const templates = [
    { name: "Cerere Finanțare", type: "DOCX", pages: TEMPLATE_PAGES, totalFields: 10, filledFields: 7 },
    { name: "Plan Afaceri", type: "DOCX", pages: [], totalFields: 14, filledFields: 0 },
    { name: "Buget Estimativ", type: "XLSX", pages: [], totalFields: 8, filledFields: 0 },
  ];

  const t = templates[activeTemplate];
  const page = t.pages[activePage];

  const handleTemplateClick = (idx) => {
    setActiveTemplate(idx);
    setActivePage(0);
    if (idx === 0) {
      setAnimating(true);
      setAnimKey(k => k + 1);
      let p = 0;
      const iv = setInterval(() => {
        p++;
        if (p >= templates[0].pages.length) { clearInterval(iv); setAnimating(false); }
        else setActivePage(p);
      }, 550);
    }
  };

  const handlePageClick = (idx) => {
    setActivePage(idx);
    setAnimKey(k => k + 1);
  };

  const progressPct = (tmpl) => tmpl.totalFields > 0 ? (tmpl.filledFields / tmpl.totalFields * 100) : 0;
  const progressColor = (pct) => pct === 100 ? "var(--accent-green)" : pct > 0 ? "var(--accent-yellow)" : "var(--accent-red)";

  return (
    <div className="neemia-layout">
      <div className="neemia-templates">
        <h3>Template-uri Proiect</h3>
        {templates.map((tmpl, i) => (
          <div
            key={i}
            className={`template-card ${activeTemplate === i ? "active" : ""}`}
            onClick={() => handleTemplateClick(i)}
          >
            <div className="tc-name">
              {tmpl.name}
              <span className="tc-badge">{tmpl.type}</span>
            </div>
            <div className="tc-info">
              {tmpl.pages.length || "?"} pagini · {tmpl.totalFields} câmpuri
            </div>
            <div className="tc-progress">
              <div
                className="tc-progress-fill"
                style={{ width: `${progressPct(tmpl)}%`, background: progressColor(progressPct(tmpl)) }}
              />
            </div>
            {tmpl.filledFields > 0 && (
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                {tmpl.filledFields}/{tmpl.totalFields} câmpuri completate
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="neemia-doc-view">
        {t.pages.length > 0 ? (
          <>
            <div className="neemia-page-nav">
              <span className="nav-label">{t.name}</span>
              {t.pages.map((pg, i) => (
                <div
                  key={i}
                  className={`page-thumb ${pg.status} ${activePage === i ? "active" : ""}`}
                  onClick={() => handlePageClick(i)}
                >
                  {pg.num}
                </div>
              ))}
              <button className="download-btn">
                <Icons.Download size={14} />
                Descarcă
              </button>
            </div>

            <div className="neemia-preview-area">
              <div className="neemia-doc-preview">
                {page && (
                  <div className="doc-page" key={animKey}>
                    <div className="doc-header-label">DOCUMENT OFICIAL · GENERARE AUTOMATĂ</div>
                    <div className="doc-page-title">Pag. {page.num}: {page.title}</div>
                    {page.fields.map((f, fi) => (
                      <div className="doc-field-group" key={fi}>
                        <div className="doc-field-label">{f.name}</div>
                        {f.value ? (
                          <div className="doc-field-value">{f.value}</div>
                        ) : (
                          <div className="doc-field-missing">(lipsă)</div>
                        )}
                      </div>
                    ))}
                    <div className="doc-page-number">Pag. {page.num}</div>
                  </div>
                )}
              </div>

              <div className="neemia-fields-panel">
                <h3>Câmpuri Pag. {page?.num}</h3>
                {page?.fields.map((f, fi) => (
                  <div className="field-card" key={fi}>
                    <div className="field-name">{f.name}</div>
                    <div className={`field-val ${!f.value ? "missing" : ""}`}>
                      {f.value || "Lipsă ⚠"}
                    </div>
                    {f.source && (
                      <div className="field-source">
                        <span className={`source-dot ${f.source.toLowerCase()}`} />
                        {f.source === "Solomon" ? "Chat Solomon" : f.source}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="coming-soon-panel">
            <Icons.FileText size={40} />
            <div className="cs-label">Niciun template procesat</div>
            <div className="cs-desc">Selectează „Cerere Finanțare" pentru a vedea completarea automată</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ELEMENTE VIEW ───
function ElementeView() {
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const confirmate = PROJECT_ELEMENTS.filter(e => e.status === "confirmat").length;
  const propuse = PROJECT_ELEMENTS.filter(e => e.status === "propus_ai").length;
  const goale = PROJECT_ELEMENTS.filter(e => e.status === "gol").length;
  const total = PROJECT_ELEMENTS.length;
  const pct = Math.round(((confirmate + propuse * 0.5) / total) * 100);

  const filtered = PROJECT_ELEMENTS.filter(e => {
    if (filter === "gol" && e.status !== "gol") return false;
    if (filter === "propus_ai" && e.status !== "propus_ai") return false;
    if (filter === "confirmat" && e.status !== "confirmat") return false;
    if (search) {
      const q = search.toLowerCase();
      return e.label.toLowerCase().includes(q) || e.key.toLowerCase().includes(q) || (e.value && e.value.toLowerCase().includes(q));
    }
    return true;
  });

  const selected = PROJECT_ELEMENTS.find(e => e.id === selectedId);

  const statusLabel = (s) => {
    if (s === "confirmat") return "Confirmat";
    if (s === "propus_ai") return "Propus AI";
    return "Gol";
  };

  const actionLabel = (a) => {
    if (a === "created") return "Creat";
    if (a === "updated") return "Actualizat";
    if (a === "confirmed") return "Confirmat";
    return "Șters";
  };

  const rightPanel = selected ? (
    <div className="elem-detail-panel fade-in" key={selected.id}>
      <div className="edp-header">
        <button className="edp-close" onClick={() => setSelectedId(null)}>
          <Icons.X size={18} />
        </button>
        <div className="edp-key">{selected.key}</div>
        <div className="edp-label">{selected.label}</div>
        <span className={`ec-status ${selected.status}`}>
          <span className="ec-status-dot" />
          {statusLabel(selected.status)}
        </span>
      </div>
      <div className="edp-section">
        <div className="edp-section-title">Valoare curentă</div>
        <div className={`edp-value-box ${!selected.value ? "empty" : ""}`}>
          {selected.value || "— necompletat —"}
        </div>
      </div>
      {selected.source && (
        <div className="edp-section">
          <div className="edp-source-block">
            <div className="edp-source-header" style={{ color: SOURCE_COLORS[selected.source]?.color }}>
              {SOURCE_COLORS[selected.source]?.icon} {SOURCE_COLORS[selected.source]?.label}
            </div>
            {selected.source_excerpt && (
              <div className="edp-excerpt-quote">
                „{selected.source_excerpt}"
              </div>
            )}
            <div className="edp-confidence-row">
              Încredere: <span className="conf-val" style={{
                color: selected.confidence >= 90 ? "var(--accent-green)" : selected.confidence >= 75 ? "var(--accent-yellow)" : "var(--accent-orange)"
              }}>{selected.confidence}%</span>
            </div>
          </div>
          <button className="edp-edit-btn">✏️ Editează</button>
        </div>
      )}
      {!selected.source && (
        <div className="edp-section">
          <button className="edp-edit-btn" style={{ borderColor: "var(--accent-yellow)", color: "var(--accent-yellow)" }}>
            ✏️ Completează manual
          </button>
        </div>
      )}
      <div className="edp-section">
        <div className="edp-section-title">Apare în template-uri</div>
        <div className="edp-templates-list">
          {selected.templates.map((t, i) => <span key={i} className="edp-tmpl-tag">{t}</span>)}
        </div>
      </div>
      <div className="edp-section" style={{ flex: 1, borderBottom: "none" }}>
        <div className="edp-section-title">Audit Trail</div>
        {selected.audit_log.length > 0 ? (
          <div className="audit-timeline">
            {selected.audit_log.slice().reverse().map((entry, i) => (
              <div className="audit-entry" key={i}>
                <div className={`audit-dot ${entry.action}`} />
                <div className="ae-time">{entry.ts}</div>
                <div className="ae-action">
                  <strong>{actionLabel(entry.action)}</strong>
                  {" "}de {entry.user}
                  {" "}via {SOURCE_COLORS[entry.source]?.label || entry.source}
                </div>
                <div className="ae-value">→ {entry.value}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="audit-empty">Nicio modificare înregistrată</div>
        )}
      </div>
    </div>
  ) : (
    <div className="elem-detail-panel" style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", color: "var(--text-muted)" }}>
        <Icons.Database size={36} />
        <p style={{ marginTop: 10, fontSize: 13, lineHeight: 1.5 }}>Selectează un element<br/>pentru detalii și audit trail</p>
      </div>
    </div>
  );

  return (
    <SplitPane
      defaultWidth={400}
      minA={400}
      minB={280}
      maxB={550}
      side="right"
      left={
        <div className="elemente-list-area">
          <div className="completitudine-bar">
            <div className="completitudine-top">
              <span className="cl-label">Completitudine proiect</span>
              <span className="cl-pct" style={{
                color: pct >= 80 ? "var(--accent-green)" : pct >= 40 ? "var(--accent-yellow)" : "var(--accent-red)"
              }}>{pct}%</span>
            </div>
            <div className="progress-track">
              <div className="progress-seg" style={{ width: `${(confirmate/total)*100}%`, background: "var(--accent-green)" }} />
              <div className="progress-seg" style={{ width: `${(propuse/total)*100}%`, background: "var(--accent-yellow)" }} />
              <div className="progress-seg" style={{ width: `${(goale/total)*100}%`, background: "var(--accent-red)", opacity: 0.4 }} />
            </div>
            <div className="completitudine-legend">
              <div className="legend-item"><div className="legend-dot" style={{ background: "var(--accent-green)" }} /> Confirmate: <span className="li-num">{confirmate}</span></div>
              <div className="legend-item"><div className="legend-dot" style={{ background: "var(--accent-yellow)" }} /> Propuse: <span className="li-num">{propuse}</span></div>
              <div className="legend-item"><div className="legend-dot" style={{ background: "var(--accent-red)" }} /> Goale: <span className="li-num">{goale}</span></div>
            </div>
          </div>
          <div className="elemente-filter-bar">
            <input className="elemente-search" placeholder="Caută element..." value={search} onChange={e => setSearch(e.target.value)} />
            <div className="filter-pill-group">
              <button className={`filter-pill ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>Toate</button>
              <button className={`filter-pill ${filter === "gol" ? "active-red" : ""}`} onClick={() => setFilter("gol")}>Gol</button>
              <button className={`filter-pill ${filter === "propus_ai" ? "active-yellow" : ""}`} onClick={() => setFilter("propus_ai")}>Propus AI</button>
              <button className={`filter-pill ${filter === "confirmat" ? "active-green" : ""}`} onClick={() => setFilter("confirmat")}>Confirmat</button>
            </div>
          </div>
          <div className="elemente-cards-scroll">
            {filtered.map(el => (
              <div key={el.id} className={`elem-card ${selectedId === el.id ? "active" : ""}`} onClick={() => setSelectedId(el.id)}>
                <div className="elem-card-top">
                  <span className="ec-key">{el.key}</span>
                  <span className={`ec-status ${el.status}`}><span className="ec-status-dot" />{statusLabel(el.status)}</span>
                  {el.modif_count > 0 && <span className="ec-modif">{el.modif_count} modif.</span>}
                  <span className="ec-copy-icon"><Icons.Clipboard size={14} /></span>
                  {el.confidence > 0 && <span className="ec-confidence">{el.confidence}%</span>}
                </div>
                <div className="elem-card-label">{el.label}</div>
                <div className={`elem-card-value ${!el.value ? "empty" : ""}`}>{el.value || "— necompletat —"}</div>
                <div className="ec-templates-row">
                  {el.templates.map((t, i) => <span key={i} className="ec-tmpl-chip">{t}</span>)}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Niciun element găsit</div>
            )}
          </div>
        </div>
      }
      right={rightPanel}
    />
  );
}

// ─── CHECKLIST DOCUMENTE VIEW ───
function ChecklistView() {
  const [docs, setDocs] = useState(INITIAL_CHECKLIST);
  const [openCats, setOpenCats] = useState(CHECKLIST_CATEGORIES.reduce((a, c) => ({ ...a, [c]: true }), {}));
  const [addingDoc, setAddingDoc] = useState(false);
  const [newDocName, setNewDocName] = useState("");
  const [newDocCat, setNewDocCat] = useState(CHECKLIST_CATEGORIES[0]);
  const [editingTemplateDocId, setEditingTemplateDocId] = useState(null);

  const toggleCat = (cat) => setOpenCats(prev => ({ ...prev, [cat]: !prev[cat] }));

  const toggleDone = (id) => {
    setDocs(prev => prev.map(d => d.id === id ? { ...d, done: !d.done } : d));
  };

  const deleteDoc = (id) => {
    setDocs(prev => prev.filter(d => d.id !== id));
  };

  const mapTemplate = (docId, templateId) => {
    if (templateId === "__unmap__") {
      setDocs(prev => prev.map(d => d.id === docId ? { ...d, templateId: null, templateName: null } : d));
    } else {
      const tmpl = AVAILABLE_TEMPLATES.find(t => t.id === templateId);
      setDocs(prev => prev.map(d => d.id === docId ? { ...d, templateId, templateName: tmpl ? tmpl.name : null } : d));
    }
    setEditingTemplateDocId(null);
  };

  const moveCategory = (docId, newCat) => {
    setDocs(prev => prev.map(d => d.id === docId ? { ...d, category: newCat } : d));
  };

  const addDoc = () => {
    if (!newDocName.trim()) return;
    const id = "d" + Date.now();
    setDocs(prev => [...prev, {
      id, name: newDocName.trim(), category: newDocCat, source: "manual",
      templateId: null, templateName: null, done: false,
    }]);
    setNewDocName("");
    setAddingDoc(false);
  };

  const totalDone = docs.filter(d => d.done).length;
  const totalDocs = docs.length;
  const pct = totalDocs > 0 ? Math.round((totalDone / totalDocs) * 100) : 0;

  // Find unmapped templates (templates with no document pointing to them)
  const mappedTemplateIds = new Set(docs.filter(d => d.templateId).map(d => d.templateId));
  const unmappedTemplates = AVAILABLE_TEMPLATES.filter(t => !mappedTemplateIds.has(t.id));

  const catProgress = (cat) => {
    const catDocs = docs.filter(d => d.category === cat);
    const catDone = catDocs.filter(d => d.done).length;
    return { total: catDocs.length, done: catDone, pct: catDocs.length > 0 ? (catDone / catDocs.length * 100) : 0 };
  };

  const ringR = 20;
  const ringC = 2 * Math.PI * ringR;
  const ringOffset = ringC - (pct / 100) * ringC;
  const ringColor = pct >= 80 ? "var(--accent-green)" : pct >= 40 ? "var(--accent-yellow)" : "var(--accent-red)";

  return (
    <div className="checklist-layout">
      {/* Header with progress */}
      <div className="checklist-header-bar">
        <div className="checklist-progress-ring">
          <svg width="52" height="52" viewBox="0 0 52 52">
            <circle cx="26" cy="26" r={ringR} fill="none" stroke="var(--bg-deep)" strokeWidth="4" />
            <circle cx="26" cy="26" r={ringR} fill="none" stroke={ringColor} strokeWidth="4"
              strokeDasharray={ringC} strokeDashoffset={ringOffset} strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 0.5s ease" }} />
          </svg>
          <div className="cpr-center" style={{ color: ringColor }}>{pct}%</div>
        </div>
        <div className="checklist-header-stats">
          <div className="chs-title">Checklist Documente</div>
          <div className="chs-counts">
            <span><span className="cc-num">{totalDone}</span> finalizate</span>
            <span><span className="cc-num">{totalDocs - totalDone}</span> rămase</span>
            <span><span className="cc-num">{docs.filter(d => d.templateId).length}</span> cu template</span>
            <span><span className="cc-num">{docs.filter(d => !d.templateId).length}</span> fără template</span>
          </div>
        </div>
        <div className="checklist-actions-row">
          <button className="cl-action-btn primary" onClick={() => setAddingDoc(true)}>
            <Icons.Plus size={14} /> Adaugă document
          </button>
        </div>
      </div>

      {/* Unmapped templates banner */}
      {unmappedTemplates.length > 0 && (
        <div className="cl-unmapped-banner">
          <div className="cl-unmapped-title">
            <Icons.AlertTriangle size={13} />
            Template-uri nemapate ({unmappedTemplates.length})
          </div>
          <div className="cl-unmapped-list">
            {unmappedTemplates.map(t => (
              <span key={t.id} className="cl-unmapped-chip">
                <Icons.FileText size={11} /> {t.name} <span style={{ opacity: 0.5 }}>{t.type}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="checklist-scroll">
        {/* Add doc inline */}
        {addingDoc && (
          <div className="cl-add-inline">
            <input
              className="cl-add-input"
              placeholder="Numele documentului..."
              value={newDocName}
              onChange={e => setNewDocName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addDoc()}
              autoFocus
            />
            <select className="cl-add-cat-select" value={newDocCat} onChange={e => setNewDocCat(e.target.value)}>
              {CHECKLIST_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button className="cl-add-save" onClick={addDoc}>Adaugă</button>
            <button className="cl-add-cancel" onClick={() => { setAddingDoc(false); setNewDocName(""); }}>Anulează</button>
          </div>
        )}

        {/* Categories */}
        {CHECKLIST_CATEGORIES.map(cat => {
          const cp = catProgress(cat);
          const catDocs = docs.filter(d => d.category === cat);
          const isOpen = openCats[cat];
          return (
            <div key={cat} className="cl-category">
              <div className="cl-cat-header" onClick={() => toggleCat(cat)}>
                {isOpen ? <Icons.ChevronDown size={14} /> : <Icons.ChevronRight size={14} />}
                <span className="cl-cat-name">{cat}</span>
                <div className="cl-cat-progress">
                  <div className="cl-cat-bar">
                    <div className="cl-cat-bar-fill" style={{
                      width: `${cp.pct}%`,
                      background: cp.pct === 100 ? "var(--accent-green)" : cp.pct > 0 ? "var(--accent-yellow)" : "var(--accent-red)"
                    }} />
                  </div>
                  <span className="cl-cat-count">{cp.done}/{cp.total}</span>
                </div>
              </div>
              {isOpen && catDocs.map(doc => (
                <div key={doc.id} className="cl-doc-row">
                  <div
                    className={`cl-checkbox ${doc.done ? "checked" : ""}`}
                    onClick={() => toggleDone(doc.id)}
                  >
                    {doc.done && <Icons.Check size={12} />}
                  </div>

                  <div className="cl-doc-info">
                    <div className={`cl-doc-name ${doc.done ? "done-text" : ""}`}>
                      {doc.name}
                      <span className={`cl-doc-source-tag ${doc.source}`}>{doc.source === "ghid" ? "GHID" : "MANUAL"}</span>
                    </div>
                  </div>

                  <div className="cl-template-area">
                    {doc.templateId && editingTemplateDocId !== doc.id ? (
                      <div className="cl-template-mapped" onClick={() => setEditingTemplateDocId(doc.id)}
                        style={{ cursor: "pointer" }} title="Click pentru a remapa">
                        <Icons.Link size={11} />
                        {doc.templateName}
                        <span style={{ marginLeft: 4, opacity: 0.5, fontSize: 10 }}>✎</span>
                      </div>
                    ) : (
                      <select
                        className="cl-template-select"
                        value={doc.templateId || ""}
                        onChange={e => {
                          if (e.target.value) mapTemplate(doc.id, e.target.value);
                          else { mapTemplate(doc.id, "__unmap__"); }
                        }}
                        onBlur={() => setEditingTemplateDocId(null)}
                        autoFocus={editingTemplateDocId === doc.id}
                      >
                        <option value="">— Fără template —</option>
                        {AVAILABLE_TEMPLATES.map(t => (
                          <option key={t.id} value={t.id}>{t.name} ({t.type})</option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="cl-doc-actions">
                    <div className="cl-doc-action-btn" title="Mută în altă categorie" style={{ position: "relative", overflow: "hidden" }}>
                      <select
                        style={{
                          position: "absolute", opacity: 0, top: 0, left: 0, width: "100%", height: "100%", cursor: "pointer"
                        }}
                        value={doc.category}
                        onChange={e => moveCategory(doc.id, e.target.value)}
                      >
                        {CHECKLIST_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <Icons.Move size={14} />
                    </div>
                    <button className="cl-doc-action-btn delete" onClick={() => deleteDoc(doc.id)} title="Șterge">
                      <Icons.Trash size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── MAIN APP ───
export default function DosarFonduriProjectView() {
  const [activeLeaf, setActiveLeaf] = useState("eligibilitate");

  const renderContent = () => {
    switch (activeLeaf) {
      case "eligibilitate": return <EligibilityView />;
      case "solomon": return <SolomonView />;
      case "ghid": return <GhidFinantareView />;
      case "neemia": return <NeemiaView />;
      case "elemente": return <ElementeView />;
      case "checklist": return <ChecklistView />;
      case "implementare": case "monitorizare":
        return (
          <div className="coming-soon-panel">
            <Icons.Settings size={40} />
            <div className="cs-label">În dezvoltare</div>
            <div className="cs-desc">Această secțiune urmează să fie definită</div>
          </div>
        );
      default: return null;
    }
  };

  const contentTitles = {
    eligibilitate: "Eligibilitate",
    solomon: "Solomon",
    ghid: "Ghid Finanțare",
    neemia: "Neemia — Completare Template-uri",
    elemente: "Elemente Proiect",
    checklist: "Checklist Documente",
    implementare: "Implementare",
    monitorizare: "Monitorizare",
  };

  const contentIcons = {
    eligibilitate: <Icons.Shield size={18} />,
    solomon: <Icons.Bot size={18} />,
    ghid: <Icons.Book size={18} />,
    neemia: <Icons.Layers size={18} />,
    elemente: <Icons.Database size={18} />,
    checklist: <Icons.ClipboardList size={18} />,
    implementare: <Icons.Settings size={18} />,
    monitorizare: <Icons.BarChart size={18} />,
  };

  return (
    <>
      <style>{css}</style>
      <div className="app-container">
        {/* ─── TREE SIDEBAR ─── */}
        <div className="tree-sidebar">
          <div className="tree-header">
            <h2>Proiect</h2>
            <div className="project-name">{PROJECT_META.name}</div>
            <div className="project-meta">{PROJECT_META.firma} · CUI {PROJECT_META.cui}</div>
            <div className="project-path">
              {PROJECT_META.path.map((seg, i) => (
                <span key={i}>
                  <span className="pp-segment">{seg.label}</span>
                  {i < PROJECT_META.path.length - 1 && <span className="pp-sep">›</span>}
                </span>
              ))}
            </div>
          </div>

          <div className="tree-nav">
            <TreeBranch
              icon={<Icons.FileText size={15} />}
              label="Scriere proiect"
              defaultOpen={true}
              active={["eligibilitate", "solomon", "ghid", "neemia", "elemente", "checklist"].includes(activeLeaf)}
            >
              <TreeLeaf
                icon={<Icons.Shield size={14} />}
                label="Eligibilitate"
                badge={<span className="leaf-badge red">12/13</span>}
                active={activeLeaf === "eligibilitate"}
                onClick={() => setActiveLeaf("eligibilitate")}
              />
              <TreeLeaf
                icon={<Icons.Bot size={14} />}
                label="Solomon"
                badge={<span className="leaf-badge blue">Opus</span>}
                active={activeLeaf === "solomon"}
                onClick={() => setActiveLeaf("solomon")}
              />
              <TreeLeaf
                icon={<Icons.Book size={14} />}
                label="Ghid Finanțare"
                badge={<span className="leaf-badge green">8 reguli</span>}
                active={activeLeaf === "ghid"}
                onClick={() => setActiveLeaf("ghid")}
              />
              <TreeLeaf
                icon={<Icons.Database size={14} />}
                label="Elemente"
                badge={<span className="leaf-badge green">{PROJECT_ELEMENTS.filter(e => e.status === "confirmat").length}/{PROJECT_ELEMENTS.length}</span>}
                active={activeLeaf === "elemente"}
                onClick={() => setActiveLeaf("elemente")}
              />
              <TreeLeaf
                icon={<Icons.ClipboardList size={14} />}
                label="Checklist doc."
                badge={<span className="leaf-badge muted">{INITIAL_CHECKLIST.filter(d => d.done).length}/{INITIAL_CHECKLIST.length}</span>}
                active={activeLeaf === "checklist"}
                onClick={() => setActiveLeaf("checklist")}
              />
              <TreeLeaf
                icon={<Icons.Layers size={14} />}
                label="Neemia"
                badge={<span className="leaf-badge muted">0/31</span>}
                active={activeLeaf === "neemia"}
                onClick={() => setActiveLeaf("neemia")}
              />
            </TreeBranch>

            <TreeBranch
              icon={<Icons.Settings size={15} />}
              label="Implementare"
              active={activeLeaf === "implementare"}
            >
              <TreeLeaf
                icon={<Icons.FileText size={14} />}
                label="Urmează..."
                badge={<span className="leaf-badge muted">TBD</span>}
                active={activeLeaf === "implementare"}
                onClick={() => setActiveLeaf("implementare")}
              />
            </TreeBranch>

            <TreeBranch
              icon={<Icons.BarChart size={15} />}
              label="Monitorizare"
              active={activeLeaf === "monitorizare"}
            >
              <TreeLeaf
                icon={<Icons.FileText size={14} />}
                label="Urmează..."
                badge={<span className="leaf-badge muted">TBD</span>}
                active={activeLeaf === "monitorizare"}
                onClick={() => setActiveLeaf("monitorizare")}
              />
            </TreeBranch>
          </div>
        </div>

        {/* ─── MAIN ─── */}
        <div className="main-content">
          <div className="content-header">
            <h1>
              {contentIcons[activeLeaf]}
              {contentTitles[activeLeaf]}
            </h1>
            <div className="header-breadcrumb">
              {PROJECT_META.path.map((seg, i) => (
                <span key={i}>
                  <span className="hb-seg">{seg.label}</span>
                  {i < PROJECT_META.path.length - 1 && <span className="hb-sep">→</span>}
                </span>
              ))}
            </div>
          </div>
          <div className="content-body">
            {renderContent()}
          </div>
        </div>
      </div>
    </>
  );
}
