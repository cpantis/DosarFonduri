"use client";

import { useState } from "react";
import { isSOC, isPF, FORME_JURIDICE, getCompanyTabs, getFieldLabel } from "@/hooks/useFormaJuridica";

/* ═══ MOCK DATA ═══ */
interface Company {
  id: number;
  forma: string;
  denumire: string;
  cui: string;
  regCom: string;
  formaJuridica: string;
  caen: string;
  caenDesc: string;
  activitatiSecundare: { cod: string; den: string }[];
  adresa: string;
  localitate: string;
  judet: string;
  codPostal: string;
  telefon: string;
  email: string;
  website: string;
  stare: string;
  angajati: number;
  cifraAfaceri: string;
  profitNet: string;
  capitalSocial: string | null;
  moneda: string | null;
  integralVarsat: boolean | null;
  partiSociale: number | null;
  valoareParte: string | null;
  actiuni?: number;
  valoareActiune?: string;
  tipActiuni?: string;
  natura: { privatAutohton: number; privatStrain: number; stat: number } | null;
  anInfiintare: number;
  durata: string;
  actConstitutiv?: string;
  ultimaMentiune: string;
  ultimulSync: string;
  asociatiPF: { nume: string; calitate: string; cetatenie: string; aport: string; partiSociale?: number; actiuni?: number; cotaBeneficii: number; cotaPierderi: number }[];
  asociatiPJ: { denumire: string; calitate: string; tara: string; cui: string; aport: string; actiuni?: number; cotaBeneficii: number; cotaPierderi: number }[];
  administratori: { nume: string; functie: string; puteri: string; durataMandatLabel: string; dataNumirii: string }[];
  cenzori?: { nume: string; calitate: string; nrAutorizare: string }[];
  sediiSecundare: { denumire: string; adresa: string }[];
  insolventa: boolean;
  dizolvare?: boolean;
  lichidare?: boolean;
  restrictii: boolean;
  titular?: { nume: string; cetatenie: string; sex: string; dataNasterii: string; stare_civila: string };
  patrimoniu_afectat?: string;
  reprezentantIF?: string;
  membriIF?: { nume: string; calitate: string; gradRudenie: string; cetatenie: string }[];
  situatiiFinanciare: { an: number; cifraAfaceri: number; profitNet: number; angajati: number; capitaluriProprii?: number; venituriTotale?: number; cheltuieliTotale?: number }[];
}

const FIRME: Company[] = [
  {
    id: 1, forma: "SRL", denumire: "SC CONSTRUCT NORD SRL", cui: "RO44123456", regCom: "J12/441/2018", formaJuridica: "Societate cu Raspundere Limitata",
    caen: "2562", caenDesc: "Mecanica generala", activitatiSecundare: [{ cod: "2511", den: "Fabricarea de constructii metalice" }, { cod: "2529", den: "Productie de rezervoare" }],
    adresa: "Str. Industriei 14, Cluj-Napoca", localitate: "Cluj-Napoca", judet: "Cluj", codPostal: "400000", telefon: "0264-555-123", email: "office@constructnord.ro", website: "www.constructnord.ro",
    stare: "functiune", angajati: 47, cifraAfaceri: "4.250.000", profitNet: "380.000",
    capitalSocial: "10.000", moneda: "RON", integralVarsat: true, partiSociale: 100, valoareParte: "100", natura: { privatAutohton: 100, privatStrain: 0, stat: 0 },
    anInfiintare: 2018, durata: "nelimitata", actConstitutiv: "Act constitutiv actualizat la 15.03.2024",
    ultimaMentiune: "Depunere act constitutiv actualizat (art.204 din Legea nr.31/1990) Nr. 45032 din 15.03.2024", ultimulSync: "Azi, 09:12",
    asociatiPF: [{ nume: "Popescu Ion", calitate: "asociat", cetatenie: "romana", aport: "6.000 RON", partiSociale: 60, cotaBeneficii: 60, cotaPierderi: 60 }, { nume: "Popescu Maria", calitate: "asociat", cetatenie: "romana", aport: "4.000 RON", partiSociale: 40, cotaBeneficii: 40, cotaPierderi: 40 }],
    asociatiPJ: [],
    administratori: [{ nume: "Popescu Ion", functie: "administrator", puteri: "depline", durataMandatLabel: "nelimitata", dataNumirii: "2018-05-10" }],
    sediiSecundare: [{ denumire: "Punct de lucru Dej", adresa: "Str. Fabricii 22, Dej, Cluj" }],
    insolventa: false, dizolvare: false, lichidare: false, restrictii: false,
    situatiiFinanciare: [
      { an: 2024, cifraAfaceri: 4250000, profitNet: 380000, angajati: 47, capitaluriProprii: 890000 },
      { an: 2023, cifraAfaceri: 3800000, profitNet: 310000, angajati: 42, capitaluriProprii: 510000 },
      { an: 2022, cifraAfaceri: 3200000, profitNet: 250000, angajati: 38, capitaluriProprii: 200000 },
    ],
  },
  {
    id: 2, forma: "PFA", denumire: "MARIN GHEORGHE PFA", cui: "31987654", regCom: "F02/987/2015", formaJuridica: "Persoana Fizica Autorizata",
    caen: "0111", caenDesc: "Cultivarea cerealelor", activitatiSecundare: [{ cod: "0113", den: "Cultivarea legumelor" }],
    adresa: "Sat Luminita, Com. Floresti", localitate: "Floresti", judet: "Arad", codPostal: "317130", telefon: "0257-333-456", email: "marin.g@gmail.com", website: "",
    stare: "functiune", angajati: 2, cifraAfaceri: "890.000", profitNet: "210.000",
    capitalSocial: null, moneda: null, integralVarsat: null, partiSociale: null, valoareParte: null, natura: null,
    anInfiintare: 2015, durata: "nelimitata",
    ultimaMentiune: "Depunere declaratie pe propria raspundere nr. 5044 din 10.01.2025", ultimulSync: "Ieri, 14:30",
    titular: { nume: "Marin Gheorghe", cetatenie: "romana", sex: "M", dataNasterii: "1978-04-12", stare_civila: "casatorit" },
    patrimoniu_afectat: "Teren arabil 15 ha, tractor John Deere, combine, utilaje agricole",
    asociatiPF: [], asociatiPJ: [], administratori: [],
    sediiSecundare: [],
    insolventa: false, restrictii: false,
    situatiiFinanciare: [
      { an: 2024, cifraAfaceri: 890000, profitNet: 210000, angajati: 2, venituriTotale: 920000, cheltuieliTotale: 710000 },
      { an: 2023, cifraAfaceri: 750000, profitNet: 180000, angajati: 2, venituriTotale: 790000, cheltuieliTotale: 610000 },
    ],
  },
  {
    id: 3, forma: "SA", denumire: "TECH SOLUTIONS SA", cui: "RO28456789", regCom: "J40/1234/2012", formaJuridica: "Societate pe Actiuni",
    caen: "6201", caenDesc: "Activitati de programare", activitatiSecundare: [{ cod: "6202", den: "Consultanta IT" }, { cod: "6311", den: "Prelucrare date" }],
    adresa: "Bd. Unirii 45, Etaj 3, Sector 3", localitate: "Bucuresti", judet: "Bucuresti", codPostal: "030167", telefon: "021-444-7890", email: "info@techsolutions.ro", website: "www.techsolutions.ro",
    stare: "functiune", angajati: 85, cifraAfaceri: "12.400.000", profitNet: "1.850.000",
    capitalSocial: "100.000", moneda: "RON", integralVarsat: true, actiuni: 10000, valoareActiune: "10", tipActiuni: "nominative", natura: { privatAutohton: 100, privatStrain: 0, stat: 0 },
    anInfiintare: 2012, durata: "nelimitata", actConstitutiv: "Act constitutiv actualizat la 10.01.2025",
    ultimaMentiune: "Majorare capital social, Nr. 78901 din 10.01.2025", ultimulSync: "Azi, 11:05",
    asociatiPF: [{ nume: "Radu Elena", calitate: "actionar", cetatenie: "romana", aport: "55.000 RON", actiuni: 5500, cotaBeneficii: 55, cotaPierderi: 55 }],
    asociatiPJ: [{ denumire: "Innovation Partners SRL", calitate: "actionar", tara: "Romania", cui: "RO33445566", aport: "45.000 RON", actiuni: 4500, cotaBeneficii: 45, cotaPierderi: 45 }],
    administratori: [{ nume: "Radu Elena", functie: "Presedinte CA", puteri: "conform statut", durataMandatLabel: "4 ani", dataNumirii: "2023-03-15" }, { nume: "Ionescu Dan", functie: "Director General", puteri: "conform delegare", durataMandatLabel: "4 ani", dataNumirii: "2023-03-15" }],
    cenzori: [{ nume: "AUDIT EXPERT SRL", calitate: "auditor financiar", nrAutorizare: "AF-2345" }],
    sediiSecundare: [{ denumire: "Birou Cluj", adresa: "Str. Memorandumului 10, Cluj-Napoca" }],
    insolventa: false, dizolvare: false, lichidare: false, restrictii: false,
    situatiiFinanciare: [
      { an: 2024, cifraAfaceri: 12400000, profitNet: 1850000, angajati: 85, capitaluriProprii: 4200000 },
      { an: 2023, cifraAfaceri: 10800000, profitNet: 1500000, angajati: 72, capitaluriProprii: 2350000 },
    ],
  },
  {
    id: 4, forma: "IF", denumire: "VOICU INTREPRINDERE FAMILIALA", cui: "39876543", regCom: "F35/567/2020", formaJuridica: "Intreprindere Familiala",
    caen: "3511", caenDesc: "Productia de energie electrica", activitatiSecundare: [],
    adresa: "Str. Soarelui 8", localitate: "Timisoara", judet: "Timis", codPostal: "300001", telefon: "0256-222-890", email: "", website: "",
    stare: "functiune", angajati: 4, cifraAfaceri: "920.000", profitNet: "85.000",
    capitalSocial: null, moneda: null, integralVarsat: null, partiSociale: null, valoareParte: null, natura: null,
    anInfiintare: 2020, durata: "nelimitata",
    ultimaMentiune: "Inregistrare mentiuni, Nr. 33201 din 20.09.2024", ultimulSync: "3 mar, 16:20",
    reprezentantIF: "Voicu Andrei",
    membriIF: [{ nume: "Voicu Andrei", calitate: "reprezentant", gradRudenie: "-", cetatenie: "romana" }, { nume: "Voicu Daniela", calitate: "membru", gradRudenie: "sotie", cetatenie: "romana" }, { nume: "Voicu Alex", calitate: "membru", gradRudenie: "fiu", cetatenie: "romana" }],
    asociatiPF: [], asociatiPJ: [], administratori: [],
    sediiSecundare: [],
    insolventa: false, restrictii: false,
    situatiiFinanciare: [{ an: 2024, cifraAfaceri: 920000, profitNet: 85000, angajati: 4, venituriTotale: 980000, cheltuieliTotale: 895000 }],
  },
  {
    id: 5, forma: "SRL", denumire: "PAINE & TRADITIE SRL", cui: "RO42111222", regCom: "J32/890/2019", formaJuridica: "Societate cu Raspundere Limitata",
    caen: "1071", caenDesc: "Fabricarea painii", activitatiSecundare: [{ cod: "1072", den: "Fabricarea biscuitilor" }],
    adresa: "Str. Morii 22", localitate: "Sibiu", judet: "Sibiu", codPostal: "550003", telefon: "0269-111-234", email: "contact@painetrad.ro", website: "",
    stare: "functiune", angajati: 18, cifraAfaceri: "2.100.000", profitNet: "190.000",
    capitalSocial: "1.000", moneda: "RON", integralVarsat: true, partiSociale: 100, valoareParte: "10", natura: { privatAutohton: 100, privatStrain: 0, stat: 0 },
    anInfiintare: 2019, durata: "nelimitata", actConstitutiv: "Act constitutiv din 2019",
    ultimaMentiune: "Depunere situatii financiare 2023, Nr. 8901 din 15.05.2024", ultimulSync: "28 feb, 10:00",
    asociatiPF: [{ nume: "Lungu Maria", calitate: "asociat", cetatenie: "romana", aport: "700 RON", partiSociale: 70, cotaBeneficii: 70, cotaPierderi: 70 }, { nume: "Lungu Vasile", calitate: "asociat", cetatenie: "romana", aport: "300 RON", partiSociale: 30, cotaBeneficii: 30, cotaPierderi: 30 }],
    asociatiPJ: [],
    administratori: [{ nume: "Lungu Maria", functie: "administrator", puteri: "depline", durataMandatLabel: "nelimitata", dataNumirii: "2019-07-01" }],
    sediiSecundare: [],
    insolventa: false, dizolvare: false, lichidare: false, restrictii: false,
    situatiiFinanciare: [{ an: 2024, cifraAfaceri: 2100000, profitNet: 190000, angajati: 18, capitaluriProprii: 420000 }],
  },
  {
    id: 6, forma: "SRL", denumire: "TRANSPORT RAPID SRL", cui: "RO15333444", regCom: "J08/234/2010", formaJuridica: "Societate cu Raspundere Limitata",
    caen: "4941", caenDesc: "Transporturi rutiere de marfuri", activitatiSecundare: [],
    adresa: "Str. Garii 5", localitate: "Brasov", judet: "Brasov", codPostal: "500001", telefon: "-", email: "", website: "",
    stare: "radiata", angajati: 0, cifraAfaceri: "0", profitNet: "-45.000",
    capitalSocial: "200", moneda: "RON", integralVarsat: true, partiSociale: 20, valoareParte: "10", natura: { privatAutohton: 100, privatStrain: 0, stat: 0 },
    anInfiintare: 2010, durata: "nelimitata",
    ultimaMentiune: "Radiere, Nr. 11023 din 01.02.2025", ultimulSync: "15 feb, 08:30",
    asociatiPF: [{ nume: "Barbu Cristian", calitate: "asociat", cetatenie: "romana", aport: "200 RON", partiSociale: 20, cotaBeneficii: 100, cotaPierderi: 100 }],
    asociatiPJ: [],
    administratori: [{ nume: "Barbu Cristian", functie: "administrator", puteri: "depline", durataMandatLabel: "nelimitata", dataNumirii: "2010-03-01" }],
    sediiSecundare: [],
    insolventa: false, dizolvare: true, lichidare: true, restrictii: false,
    situatiiFinanciare: [{ an: 2024, cifraAfaceri: 0, profitNet: -45000, angajati: 0, capitaluriProprii: -45000 }],
  },
];

/* ═══ HELPERS ═══ */
const fmt = (v: string | number | null | undefined) => {
  if (v == null) return "\u2014";
  const n = parseInt(String(v).replace(/[^0-9-]/g, ""));
  return isNaN(n) ? String(v) : n.toLocaleString("ro-RO") + " RON";
};
const fmtNum = (v: number | string | null | undefined) => {
  if (v == null) return "\u2014";
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/[^0-9-]/g, ""));
  return isNaN(n) ? String(v) : n.toLocaleString("ro-RO");
};
const formaColor = (cod: string) => {
  if (isPF(cod)) return { bg: "rgba(251,146,60,0.12)", color: "var(--accent-orange)" };
  return { bg: "rgba(77,139,255,0.12)", color: "var(--accent-blue)" };
};

/* ═══ COMPONENT ═══ */
export default function CompaniesPage() {
  const [selected, setSelected] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState("auto");
  const [addForma, setAddForma] = useState("SRL");
  const [cui, setCui] = useState("");
  const [cuiLoad, setCuiLoad] = useState(false);
  const [cuiRes, setCuiRes] = useState<{ denumire: string; adresa: string; caen: string; stare: string } | "error" | null>(null);
  const [detailTab, setDetailTab] = useState("General");

  const filtered = FIRME.filter(f => {
    if (filter === "activ" && f.stare === "radiata") return false;
    if (filter === "radiat" && f.stare !== "radiata") return false;
    if (filter === "soc" && !isSOC(f.forma)) return false;
    if (filter === "pf" && !isPF(f.forma)) return false;
    if (search) {
      const q = search.toLowerCase();
      return f.denumire.toLowerCase().includes(q) || f.cui.toLowerCase().includes(q) || f.caen.includes(q) || f.judet.toLowerCase().includes(q) || f.forma.toLowerCase().includes(q);
    }
    return true;
  });

  const sel = FIRME.find(f => f.id === selected) || null;
  const tabs = sel ? getCompanyTabs(sel.forma) : [];

  const checkCui = async () => {
    if (cui.replace(/\D/g, "").length < 6) return;
    setCuiLoad(true);
    setCuiRes(null);
    // Simulate API call
    await new Promise(r => setTimeout(r, 1200));
    const mockData: Record<string, { denumire: string; adresa: string; caen: string; stare: string }> = {
      "55667788": { denumire: "INOVATIE DIGITALA SRL", adresa: "Str. Progresului 10, Iasi", caen: "6311", stare: "ACTIV" },
    };
    const clean = cui.replace(/\D/g, "");
    setCuiLoad(false);
    setCuiRes(mockData[clean] || "error");
  };

  return (
    <>
      <style>{`
        .topbar{padding:14px 28px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:16px;background:var(--bg-surface);flex-shrink:0}
        .tb-title{font-size:20px;font-weight:800;flex:1;letter-spacing:-.3px}.tb-count{font-size:14px;color:var(--text-muted)}
        .btn-add{display:flex;align-items:center;gap:6px;padding:8px 18px;border-radius:var(--r-md);border:none;background:var(--accent-blue);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font-sans);transition:all .15s;box-shadow:0 2px 12px rgba(77,139,255,.25)}
        .btn-add:hover{background:#5d9bff}
        .firme-layout{flex:1;display:flex;overflow:hidden}
        .firme-list{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}
        .firme-toolbar{padding:12px 24px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--border);background:var(--bg-surface);flex-shrink:0;flex-wrap:wrap}
        .fi{padding:8px 14px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-deep);color:var(--text-primary);font-size:13px;font-family:var(--font-sans);outline:none;transition:border-color .2s}
        .fi:focus{border-color:var(--accent-blue)}.fi::placeholder{color:var(--text-muted)}.fi.mono{font-family:var(--font-mono);font-size:13px}
        .fi.ok{border-color:var(--accent-green)}.fi.err{border-color:var(--accent-red)}
        .pill-group{display:flex;background:var(--bg-deep);border-radius:var(--r-md);padding:3px;gap:2px}
        .pill{padding:5px 12px;border-radius:7px;font-size:12px;font-weight:600;border:none;cursor:pointer;background:transparent;color:var(--text-secondary);font-family:var(--font-sans);transition:all .15s;white-space:nowrap}
        .pill:hover{color:var(--text-primary)}.pill.on{background:var(--accent-blue);color:#fff}
        .firme-scroll{flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:10px}
        .firma-card{display:flex;align-items:center;gap:16px;padding:14px 18px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-surface);cursor:pointer;transition:all .18s}
        .firma-card:hover{border-color:var(--border-active);background:var(--bg-elevated)}
        .firma-card.active{border-color:var(--accent-blue);background:rgba(77,139,255,.04)}
        .fc-icon{width:42px;height:42px;border-radius:var(--r-md);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;flex-shrink:0;font-family:var(--font-mono)}
        .fc-info{flex:1;min-width:0}
        .fc-name{font-size:14px;font-weight:700;margin-bottom:2px;display:flex;align-items:center;gap:8px}
        .fc-badge{font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;white-space:nowrap}
        .fc-meta{font-size:12px;color:var(--text-muted);display:flex;gap:10px;flex-wrap:wrap}
        .fc-right{text-align:right;flex-shrink:0}
        .fc-sync{font-size:11px;color:var(--text-muted);font-family:var(--font-mono)}

        .firma-detail{width:540px;min-width:540px;border-left:1px solid var(--border);background:var(--bg-surface);display:flex;flex-direction:column;overflow:hidden}
        .fd-top{padding:18px 22px;border-bottom:1px solid var(--border);display:flex;gap:12px}
        .fd-top-info{flex:1;min-width:0}
        .fd-name{font-size:18px;font-weight:800;margin-bottom:2px}.fd-cui{font-size:12px;font-family:var(--font-mono);color:var(--text-secondary)}
        .fd-badges{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}
        .fd-act-row{display:flex;gap:5px;flex-shrink:0;flex-wrap:wrap}
        .fd-act{padding:5px 10px;border-radius:var(--r-sm);border:1px solid var(--border);background:transparent;color:var(--text-secondary);font-size:11px;font-weight:600;cursor:pointer;font-family:var(--font-sans);transition:all .15s;display:flex;align-items:center;gap:4px;white-space:nowrap}
        .fd-act:hover{border-color:var(--border-active);color:var(--text-primary);background:var(--bg-hover)}
        .fd-act.danger{color:var(--accent-red);border-color:rgba(248,113,113,.25)}.fd-act.danger:hover{background:rgba(248,113,113,.06)}
        .fd-tabs{display:flex;border-bottom:1px solid var(--border);padding:0 22px;background:var(--bg-surface);flex-shrink:0;overflow-x:auto}
        .fd-tab{padding:9px 14px;font-size:12px;font-weight:600;color:var(--text-secondary);cursor:pointer;border-bottom:2px solid transparent;transition:all .15s;font-family:var(--font-sans);background:none;border-top:none;border-left:none;border-right:none;white-space:nowrap}
        .fd-tab:hover{color:var(--text-primary)}.fd-tab.on{color:var(--accent-blue);border-bottom-color:var(--accent-blue)}
        .fd-body{flex:1;overflow-y:auto;padding:18px 22px}
        .fd-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px}
        .fd-grid.c2{grid-template-columns:1fr 1fr}.fd-grid.c4{grid-template-columns:repeat(4,1fr)}
        .c{padding:10px 12px;background:var(--bg-deep);border-radius:var(--r-sm);border:1px solid var(--border)}
        .c.full{grid-column:1/-1}.c.span2{grid-column:span 2}
        .c-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:3px}
        .c-val{font-size:13px;font-weight:600;color:var(--text-primary)}.c-val.mono{font-family:var(--font-mono)}
        .c-val.green{color:var(--accent-green)}.c-val.red{color:var(--accent-red)}.c-val.sub{font-size:11px;color:var(--text-muted);font-weight:400;margin-top:2px}
        .mention{padding:12px;background:var(--bg-deep);border-radius:var(--r-sm);border-left:3px solid var(--accent-blue);margin-bottom:14px}
        .mention-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:3px}
        .mention-text{font-size:12px;color:var(--text-secondary);line-height:1.5}
        .fd-stitle{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin:14px 0 8px}
        .assoc-row{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--bg-elevated);margin-bottom:5px}
        .assoc-name{font-size:13px;font-weight:600;flex:1}.assoc-detail{font-size:12px;color:var(--text-secondary);font-family:var(--font-mono)}
        .warn-box{padding:10px 14px;border-radius:var(--r-sm);border:1px solid var(--accent-red);background:rgba(248,113,113,.04);margin-bottom:8px;font-size:13px;color:var(--accent-red);display:flex;align-items:center;gap:8px}
        .ok-box{padding:10px 14px;border-radius:var(--r-sm);border:1px solid var(--accent-green);background:rgba(52,211,153,.04);margin-bottom:8px;font-size:13px;color:var(--accent-green);display:flex;align-items:center;gap:8px}
        .fin-table{width:100%;border-collapse:collapse;font-size:12px}
        .fin-table th{text-align:left;padding:6px 10px;font-weight:600;color:var(--text-muted);border-bottom:1px solid var(--border);font-size:11px;text-transform:uppercase;letter-spacing:.5px}
        .fin-table td{padding:6px 10px;border-bottom:1px solid rgba(42,48,64,.5);font-family:var(--font-mono);color:var(--text-secondary)}
        .fin-table td.green{color:var(--accent-green)}.fin-table td.red{color:var(--accent-red)}

        .empty-panel{flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;color:var(--text-muted)}
        .empty-panel .ep-icon{font-size:40px;opacity:.5}.empty-panel .ep-text{font-size:13px}

        .overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:100;animation:fadeIn .2s}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        .modal{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r-lg);width:540px;max-height:85vh;overflow-y:auto;padding:28px;animation:slideUp .3s ease}
        @keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        .modal-title{font-size:20px;font-weight:800;margin-bottom:4px;display:flex;align-items:center;justify-content:space-between}
        .modal-close{background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;padding:4px}.modal-close:hover{color:var(--text-primary)}
        .modal-sub{font-size:14px;color:var(--text-secondary);margin-bottom:20px}
        .mode-toggle{display:flex;border-radius:var(--r-md);border:1px solid var(--border);overflow:hidden;margin-bottom:20px}
        .mode-btn{flex:1;padding:10px;font-size:13px;font-weight:600;cursor:pointer;background:transparent;border:none;color:var(--text-secondary);font-family:var(--font-sans);transition:all .15s;display:flex;align-items:center;justify-content:center;gap:6px}
        .mode-btn:first-child{border-right:1px solid var(--border)}
        .mode-btn:hover{color:var(--text-primary);background:var(--bg-hover)}.mode-btn.on{background:var(--accent-blue);color:#fff}
        .add-row{display:flex;gap:8px;margin-bottom:12px}.add-row .fi{flex:1}
        .btn-p{padding:10px 20px;border-radius:var(--r-md);border:none;background:var(--accent-blue);color:#fff;font-size:14px;font-weight:700;font-family:var(--font-sans);cursor:pointer;transition:all .15s}
        .btn-p:hover{background:#5d9bff}.btn-p:disabled{opacity:.5;cursor:not-allowed}
        .btn-s{padding:10px 20px;border-radius:var(--r-md);border:1px solid var(--border);background:transparent;color:var(--text-secondary);font-size:14px;font-weight:600;font-family:var(--font-sans);cursor:pointer}
        .btn-s:hover{border-color:var(--border-active);color:var(--text-primary)}
        .spinner{width:16px;height:16px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;display:inline-block}
        @keyframes spin{to{transform:rotate(360deg)}}
        .cui-ok{padding:14px;border-radius:var(--r-md);border:1px solid var(--accent-green);background:rgba(52,211,153,.04);margin-bottom:14px}
        .cui-ok .cn{font-size:15px;font-weight:700;color:var(--accent-green);margin-bottom:4px}
        .cui-ok .cr{font-size:12px;color:var(--text-secondary);margin-bottom:2px}
        .cui-ok .cr strong{color:var(--text-primary);font-weight:600;margin-right:6px}
        .cui-err{padding:12px;border-radius:var(--r-md);border:1px solid var(--accent-red);background:rgba(248,113,113,.04);margin-bottom:14px;font-size:13px;color:var(--accent-red)}
        .cui-load{display:flex;align-items:center;gap:10px;padding:12px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg-elevated);margin-bottom:14px;font-size:13px;color:var(--text-secondary)}
        .f-hint{font-size:12px;color:var(--accent-purple);margin-bottom:14px}
        .upload-zone{border:2px dashed var(--border);border-radius:var(--r-md);padding:28px 20px;text-align:center;margin-bottom:14px;transition:all .2s;cursor:pointer}
        .upload-zone:hover{border-color:var(--accent-blue);background:rgba(77,139,255,.03)}
        .upload-zone .uz-icon{font-size:24px;margin-bottom:6px}.upload-zone .uz-title{font-size:14px;font-weight:600;margin-bottom:3px}.upload-zone .uz-sub{font-size:12px;color:var(--text-muted)}
        .upload-flow{font-size:12px;color:var(--text-secondary);margin-bottom:14px;padding:8px 12px;background:var(--bg-elevated);border-radius:var(--r-sm);text-align:center}
        .forma-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:18px}
        .forma-radio{padding:8px 10px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--bg-elevated);cursor:pointer;text-align:center;transition:all .15s;font-size:12px}
        .forma-radio:hover{border-color:var(--border-active)}.forma-radio.on{border-color:var(--accent-blue);background:rgba(77,139,255,.06)}
        .forma-radio .fr-cod{font-weight:700;font-family:var(--font-mono);font-size:13px;color:var(--text-primary);margin-bottom:1px}
        .forma-radio .fr-label{font-size:10px;color:var(--text-muted);line-height:1.3}
        .forma-group-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin:12px 0 6px}

        .firme-scroll::-webkit-scrollbar,.fd-body::-webkit-scrollbar,.modal::-webkit-scrollbar{width:5px}
        .firme-scroll::-webkit-scrollbar-track,.fd-body::-webkit-scrollbar-track,.modal::-webkit-scrollbar-track{background:transparent}
        .firme-scroll::-webkit-scrollbar-thumb,.fd-body::-webkit-scrollbar-thumb,.modal::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
      `}</style>

      {/* TOPBAR */}
      <div className="topbar">
        <div className="tb-title">Firme</div>
        <span className="tb-count">{filtered.length} firme</span>
        <button className="btn-add" onClick={() => { setShowAdd(true); setCui(""); setCuiRes(null); setAddMode("auto"); setAddForma("SRL"); }}>+ Adauga firma</button>
      </div>

      <div className="firme-layout">
        {/* LIST */}
        <div className="firme-list">
          <div className="firme-toolbar">
            <input className="fi" placeholder="Cauta firma, CUI, CAEN, judet, forma..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 280 }} />
            <div className="pill-group">
              <button className={`pill ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>Toate</button>
              <button className={`pill ${filter === "activ" ? "on" : ""}`} onClick={() => setFilter("activ")}>Active</button>
              <button className={`pill ${filter === "radiat" ? "on" : ""}`} onClick={() => setFilter("radiat")}>Radiate</button>
              <button className={`pill ${filter === "soc" ? "on" : ""}`} onClick={() => setFilter("soc")}>Societati</button>
              <button className={`pill ${filter === "pf" ? "on" : ""}`} onClick={() => setFilter("pf")}>PFA/II/IF</button>
            </div>
          </div>
          <div className="firme-scroll">
            {filtered.map(f => {
              const fc = formaColor(f.forma);
              return (
                <div key={f.id} className={`firma-card ${selected === f.id ? "active" : ""}`} onClick={() => { setSelected(f.id); setDetailTab("General"); }}>
                  <div className="fc-icon" style={{ background: fc.bg, color: fc.color }}>{f.forma}</div>
                  <div className="fc-info">
                    <div className="fc-name">
                      {f.denumire}
                      <span className="fc-badge" style={{ background: f.stare === "radiata" ? "rgba(248,113,113,.12)" : "rgba(52,211,153,.12)", color: f.stare === "radiata" ? "var(--accent-red)" : "var(--accent-green)" }}>{f.stare}</span>
                    </div>
                    <div className="fc-meta">
                      <span>CUI: {f.cui}</span>
                      <span>CAEN: {f.caen}</span>
                      <span>{f.judet}</span>
                      <span>{f.angajati} ang.</span>
                    </div>
                  </div>
                  <div className="fc-right"><div className="fc-sync">Sync: {f.ultimulSync}</div></div>
                </div>
              );
            })}
            {filtered.length === 0 && <div className="empty-panel" style={{ padding: 60 }}><div className="ep-icon">&#128269;</div><div className="ep-text">Nicio firma gasita</div></div>}
          </div>
        </div>

        {/* DETAIL PANEL */}
        {sel ? (
          <div className="firma-detail" key={sel.id}>
            <div className="fd-top">
              <div className="fd-top-info">
                <div className="fd-name">{sel.denumire}</div>
                <div className="fd-cui">CUI: {sel.cui} &middot; {sel.regCom}</div>
                <div className="fd-badges">
                  <span className="fc-badge" style={sel.stare === "radiata" ? { background: "rgba(248,113,113,.12)", color: "var(--accent-red)" } : { background: "rgba(52,211,153,.12)", color: "var(--accent-green)" }}>{sel.stare}</span>
                  <span className="fc-badge" style={formaColor(sel.forma)}>{sel.forma}</span>
                  <span className="fc-badge" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>CAEN {sel.caen}</span>
                  <span className="fc-badge" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>Din {sel.anInfiintare}</span>
                </div>
              </div>
              <div className="fd-act-row">
                <button className="fd-act">Actualizare CUI</button>
                <button className="fd-act">Reincarca certificat</button>
                <button className="fd-act danger">Sterge</button>
              </div>
            </div>

            <div className="fd-tabs">
              {tabs.map(t => <button key={t} className={`fd-tab ${detailTab === t ? "on" : ""}`} onClick={() => setDetailTab(t)}>{t}</button>)}
            </div>

            <div className="fd-body">
              {/* GENERAL */}
              {detailTab === "General" && (<>
                <div className="fd-grid">
                  <div className="c span2"><div className="c-label">Forma juridica</div><div className="c-val">{sel.formaJuridica}</div></div>
                  <div className="c"><div className="c-label">Stare</div><div className="c-val"><span className="fc-badge" style={sel.stare === "radiata" ? { background: "rgba(248,113,113,.12)", color: "var(--accent-red)" } : { background: "rgba(52,211,153,.12)", color: "var(--accent-green)" }}>{sel.stare}</span></div></div>
                  <div className="c span2"><div className="c-label">Adresa</div><div className="c-val">{sel.adresa}</div><div className="c-val sub">{sel.localitate}, {sel.judet} {sel.codPostal}</div></div>
                  <div className="c"><div className="c-label">Telefon</div><div className="c-val mono">{sel.telefon}</div></div>
                  {sel.email && <div className="c"><div className="c-label">Email</div><div className="c-val mono" style={{ fontSize: 12 }}>{sel.email}</div></div>}
                  <div className="c"><div className="c-label">{getFieldLabel("durata_label", sel.forma)}</div><div className="c-val">{sel.durata}</div></div>
                  <div className="c"><div className="c-label">An infiintare</div><div className="c-val mono">{sel.anInfiintare}</div></div>
                </div>
                {isPF(sel.forma) && sel.patrimoniu_afectat && (
                  <div className="mention"><div className="mention-label">Patrimoniu de afectatiune</div><div className="mention-text">{sel.patrimoniu_afectat}</div></div>
                )}
                <div className="mention"><div className="mention-label">Ultima mentiune</div><div className="mention-text">{sel.ultimaMentiune}</div></div>
                {isSOC(sel.forma) && sel.capitalSocial && (<>
                  <div className="fd-stitle">Capital social</div>
                  <div className="fd-grid c4">
                    <div className="c"><div className="c-label">Subscris</div><div className="c-val mono">{fmt(sel.capitalSocial)}</div></div>
                    <div className="c"><div className="c-label">{getFieldLabel("parti_actiuni", sel.forma)}</div><div className="c-val mono">{sel.partiSociale || sel.actiuni || "\u2014"}</div></div>
                    <div className="c"><div className="c-label">{getFieldLabel("valoare_parte", sel.forma)}</div><div className="c-val mono">{fmt(sel.valoareParte || sel.valoareActiune)}</div></div>
                    <div className="c"><div className="c-label">Natura capital</div><div className="c-val" style={{ fontSize: 11 }}>privat autohton {sel.natura?.privatAutohton || 0}%{(sel.natura?.privatStrain ?? 0) > 0 ? `, strain ${sel.natura!.privatStrain}%` : ""}{(sel.natura?.stat ?? 0) > 0 ? `, stat ${sel.natura!.stat}%` : ""}</div></div>
                  </div>
                </>)}
              </>)}

              {/* ASOCIATI / ACTIONARI */}
              {(detailTab === "Asociati" || detailTab === "Actionari") && (<>
                {sel.asociatiPJ.length > 0 && (<>
                  <div className="fd-stitle">{getFieldLabel("asociati_label", sel.forma)} &mdash; Persoane Juridice ({sel.asociatiPJ.length})</div>
                  {sel.asociatiPJ.map((a, i) => (
                    <div className="assoc-row" key={i}>
                      <span style={{ fontSize: 16 }}>&#127970;</span>
                      <div className="assoc-name">{a.denumire}<div style={{ fontSize: 11, color: "var(--text-muted)" }}>{a.calitate} &middot; {a.tara}</div></div>
                      <div className="assoc-detail">{a.cotaBeneficii}%</div>
                      <div className="assoc-detail">{a.aport}</div>
                    </div>
                  ))}
                </>)}
                <div className="fd-stitle">{getFieldLabel("asociati_label", sel.forma)} &mdash; Persoane Fizice ({sel.asociatiPF.length})</div>
                {sel.asociatiPF.map((a, i) => (
                  <div className="assoc-row" key={i}>
                    <span style={{ fontSize: 16 }}>&#128100;</span>
                    <div className="assoc-name">{a.nume}<div style={{ fontSize: 11, color: "var(--text-muted)" }}>{a.calitate} &middot; {a.cetatenie}</div></div>
                    <div className="assoc-detail">{a.cotaBeneficii}%</div>
                    <div className="assoc-detail">{a.partiSociale || a.actiuni} {sel.forma === "SA" ? "actiuni" : "p.s."}</div>
                    <div className="assoc-detail">{a.aport}</div>
                  </div>
                ))}
              </>)}

              {/* TITULAR (PFA/II) */}
              {detailTab === "Titular" && sel.titular && (<>
                <div className="fd-stitle">Titular</div>
                <div className="fd-grid c2">
                  <div className="c"><div className="c-label">Nume</div><div className="c-val">{sel.titular.nume}</div></div>
                  <div className="c"><div className="c-label">Cetatenie</div><div className="c-val">{sel.titular.cetatenie}</div></div>
                  <div className="c"><div className="c-label">Data nasterii</div><div className="c-val mono">{sel.titular.dataNasterii}</div></div>
                  <div className="c"><div className="c-label">Stare civila</div><div className="c-val">{sel.titular.stare_civila}</div></div>
                </div>
              </>)}

              {/* MEMBRI IF */}
              {detailTab === "Membri IF" && sel.membriIF && (<>
                <div className="fd-stitle">Reprezentant</div>
                <div className="assoc-row"><span style={{ fontSize: 16 }}>&#128084;</span><div className="assoc-name">{sel.reprezentantIF}</div><div className="assoc-detail">Reprezentant IF</div></div>
                <div className="fd-stitle">Membri ({sel.membriIF.length})</div>
                {sel.membriIF.map((m, i) => (
                  <div className="assoc-row" key={i}>
                    <span style={{ fontSize: 16 }}>&#128100;</span>
                    <div className="assoc-name">{m.nume}<div style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.calitate}</div></div>
                    <div className="assoc-detail">{m.gradRudenie}</div>
                    <div className="assoc-detail">{m.cetatenie}</div>
                  </div>
                ))}
              </>)}

              {/* ADMINISTRARE */}
              {detailTab === "Administrare" && (<>
                <div className="fd-stitle">{getFieldLabel("admin_label", sel.forma)} ({sel.administratori.length})</div>
                {sel.administratori.map((a, i) => (
                  <div className="assoc-row" key={i}>
                    <span style={{ fontSize: 16 }}>&#128084;</span>
                    <div className="assoc-name">{a.nume}<div style={{ fontSize: 11, color: "var(--text-muted)" }}>{a.functie}</div></div>
                    <div className="assoc-detail">Puteri: {a.puteri}</div>
                    <div className="assoc-detail">Mandat: {a.durataMandatLabel}</div>
                  </div>
                ))}
                {sel.cenzori && sel.cenzori.length > 0 && (<>
                  <div className="fd-stitle">Cenzori / Auditori</div>
                  {sel.cenzori.map((c, i) => (
                    <div className="assoc-row" key={i}><span style={{ fontSize: 16 }}>&#128269;</span><div className="assoc-name">{c.nume}<div style={{ fontSize: 11, color: "var(--text-muted)" }}>{c.calitate}</div></div><div className="assoc-detail">{c.nrAutorizare}</div></div>
                  ))}
                </>)}
              </>)}

              {/* ACTIVITATI */}
              {detailTab === "Activitati" && (<>
                <div className="fd-stitle">Activitate principala</div>
                <div className="c full" style={{ marginBottom: 12 }}><div className="c-label">CAEN {sel.caen}</div><div className="c-val">{sel.caenDesc}</div></div>
                {sel.activitatiSecundare.length > 0 && (<>
                  <div className="fd-stitle">Activitati secundare ({sel.activitatiSecundare.length})</div>
                  {sel.activitatiSecundare.map((a, i) => (
                    <div className="assoc-row" key={i} style={{ padding: "7px 12px" }}><div className="assoc-detail" style={{ minWidth: 50 }}>{a.cod}</div><div className="assoc-name" style={{ fontSize: 13 }}>{a.den}</div></div>
                  ))}
                </>)}
              </>)}

              {/* SEDII */}
              {detailTab === "Sedii" && (<>
                <div className="fd-stitle">Sediu social</div>
                <div className="c full" style={{ marginBottom: 12 }}><div className="c-label">Adresa completa</div><div className="c-val">{sel.adresa}, {sel.localitate}, {sel.judet} {sel.codPostal}</div></div>
                {sel.sediiSecundare && sel.sediiSecundare.length > 0 && (<>
                  <div className="fd-stitle">Sedii secundare / Puncte de lucru ({sel.sediiSecundare.length})</div>
                  {sel.sediiSecundare.map((s, i) => (
                    <div className="assoc-row" key={i}><span style={{ fontSize: 16 }}>&#128205;</span><div className="assoc-name">{s.denumire}<div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.adresa}</div></div></div>
                  ))}
                </>)}
              </>)}

              {/* FIN. ONRC */}
              {detailTab === "Fin. ONRC" && (<>
                <div className="fd-stitle">Situatii financiare (din date ONRC)</div>
                <table className="fin-table">
                  <thead><tr>
                    <th>An</th><th>Cifra afaceri</th><th>Profit net</th><th>Angajati</th>
                    {isSOC(sel.forma) && <th>Capitaluri proprii</th>}
                    {isPF(sel.forma) && <><th>Venituri</th><th>Cheltuieli</th></>}
                  </tr></thead>
                  <tbody>{sel.situatiiFinanciare.map((s, i) => (
                    <tr key={i}>
                      <td>{s.an}</td>
                      <td>{fmtNum(s.cifraAfaceri)}</td>
                      <td className={s.profitNet >= 0 ? "green" : "red"}>{fmtNum(s.profitNet)}</td>
                      <td>{s.angajati}</td>
                      {isSOC(sel.forma) && <td>{fmtNum(s.capitaluriProprii)}</td>}
                      {isPF(sel.forma) && <><td>{fmtNum(s.venituriTotale)}</td><td>{fmtNum(s.cheltuieliTotale)}</td></>}
                    </tr>
                  ))}</tbody>
                </table>
                <div style={{ marginTop: 12, fontSize: 11, color: "var(--text-muted)" }}>Sursa: Date publice ONRC / termene.ro</div>
              </>)}

              {/* FIN. ANAF */}
              {detailTab === "Fin. ANAF" && (
                <div className="empty-panel" style={{ padding: 40 }}>
                  <div className="ep-icon">&#128202;</div>
                  <div className="ep-text">Niciun bilant incarcat.<br />Uploadeaza un bilant PDF pentru a extrage datele automat.</div>
                </div>
              )}

              {/* JURIDIC */}
              {detailTab === "Juridic" && (<>
                <div className="fd-stitle">Stare juridica</div>
                {sel.insolventa && <div className="warn-box">Firma in insolventa</div>}
                {sel.dizolvare && <div className="warn-box">Firma dizolvata</div>}
                {sel.lichidare && <div className="warn-box">Firma in lichidare</div>}
                {sel.restrictii && <div className="warn-box">Restrictii active</div>}
                {!sel.insolventa && !sel.dizolvare && !sel.lichidare && !sel.restrictii && <div className="ok-box">Fara restrictii, insolventa, dizolvare sau lichidare</div>}
                <div className="fd-grid c2" style={{ marginTop: 12 }}>
                  <div className="c"><div className="c-label">Nr. Reg. Comertului</div><div className="c-val mono">{sel.regCom}</div></div>
                  <div className="c"><div className="c-label">Forma juridica</div><div className="c-val">{sel.formaJuridica}</div></div>
                </div>
                <div className="mention" style={{ marginTop: 12 }}><div className="mention-label">Ultima mentiune</div><div className="mention-text">{sel.ultimaMentiune}</div></div>
              </>)}
            </div>
          </div>
        ) : (
          <div className="firma-detail" style={{ alignItems: "center", justifyContent: "center" }}>
            <div className="empty-panel"><div className="ep-icon">&#127970;</div><div className="ep-text">Selecteaza o firma pentru detalii</div></div>
          </div>
        )}
      </div>

      {/* ADD MODAL */}
      {showAdd && (
        <div className="overlay" onClick={e => { if (e.target === e.currentTarget) setShowAdd(false); }}>
          <div className="modal">
            <div className="modal-title">Adauga firma<button className="modal-close" onClick={() => setShowAdd(false)}>&times;</button></div>
            <div className="mode-toggle">
              <button className={`mode-btn ${addMode === "auto" ? "on" : ""}`} onClick={() => setAddMode("auto")}>Automat (CUI)</button>
              <button className={`mode-btn ${addMode === "manual" ? "on" : ""}`} onClick={() => setAddMode("manual")}>Manual (Upload ONRC)</button>
            </div>

            {addMode === "auto" ? (<>
              <div className="add-row">
                <input className={`fi mono ${cuiRes && cuiRes !== "error" ? "ok" : cuiRes === "error" ? "err" : ""}`} placeholder="CUI firma (ex: 55667788)" value={cui} onChange={e => { setCui(e.target.value); setCuiRes(null); }} onKeyDown={e => e.key === "Enter" && checkCui()} />
                <button className="btn-p" onClick={checkCui} disabled={cuiLoad || cui.replace(/\D/g, "").length < 6}>{cuiLoad ? <span className="spinner" /> : "Verifica"}</button>
              </div>
              <div className="f-hint">Demo &mdash; incearca: 55667788</div>
              {cuiLoad && <div className="cui-load"><span className="spinner" /> Se verifica la termene.ro...</div>}
              {cuiRes && cuiRes !== "error" && (
                <div className="cui-ok">
                  <div className="cn">{cuiRes.denumire}</div>
                  <div className="cr"><strong>Adresa:</strong>{cuiRes.adresa}</div>
                  <div className="cr"><strong>CAEN:</strong>{cuiRes.caen}</div>
                  <div className="cr"><strong>Stare:</strong><span style={{ color: "var(--accent-green)" }}>{cuiRes.stare}</span></div>
                </div>
              )}
              {cuiRes === "error" && <div className="cui-err">CUI-ul nu a fost gasit.</div>}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button className="btn-s" onClick={() => setShowAdd(false)}>Anuleaza</button>
                <button className="btn-p" disabled={!cuiRes || cuiRes === "error"}>Adauga firma</button>
              </div>
            </>) : (<>
              <div className="modal-sub">Incarca documentul ONRC si agentii vor face restul:</div>
              <div className="upload-flow">Upload &rarr; OCR automat &rarr; Extragere date &rarr; Validare &rarr; Stocare</div>

              <div className="forma-group-title">Societati comerciale</div>
              <div className="forma-grid">
                {FORME_JURIDICE.filter(f => f.group === "SOC").map(f => (
                  <div key={f.cod} className={`forma-radio ${addForma === f.cod ? "on" : ""}`} onClick={() => setAddForma(f.cod)}>
                    <div className="fr-cod">{f.short}</div>
                    <div className="fr-label">{f.label}</div>
                  </div>
                ))}
              </div>

              <div className="forma-group-title">Persoane fizice / Intreprinderi</div>
              <div className="forma-grid">
                {FORME_JURIDICE.filter(f => f.group === "PF").map(f => (
                  <div key={f.cod} className={`forma-radio ${addForma === f.cod ? "on" : ""}`} onClick={() => setAddForma(f.cod)}>
                    <div className="fr-cod">{f.short}</div>
                    <div className="fr-label">{f.label}</div>
                  </div>
                ))}
              </div>

              <div className="upload-zone">
                <div className="uz-icon">&#128196;</div>
                <div className="uz-title">Certificat constatator / Document ONRC</div>
                <div className="uz-sub">Click sau trage fisierul aici (PDF, max 10MB)</div>
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button className="btn-s" onClick={() => setShowAdd(false)}>Anuleaza</button>
                <button className="btn-p" disabled>Proceseaza si creeaza firma</button>
              </div>
            </>)}
          </div>
        </div>
      )}
    </>
  );
}
