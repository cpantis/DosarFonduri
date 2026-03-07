import { useState } from "react";

/* ═══ FORME JURIDICE ═══ */
const FORME = [
  { cod: "SRL", label: "Societate cu Răspundere Limitată", short: "S.R.L.", group: "SOC" },
  { cod: "SA", label: "Societate pe Acțiuni", short: "S.A.", group: "SOC" },
  { cod: "SNC", label: "Societate în Nume Colectiv", short: "S.N.C.", group: "SOC" },
  { cod: "SCS", label: "Societate în Comandită Simplă", short: "S.C.S.", group: "SOC" },
  { cod: "SCA", label: "Societate în Comandită pe Acțiuni", short: "S.C.A.", group: "SOC" },
  { cod: "PFA", label: "Persoană Fizică Autorizată", short: "P.F.A.", group: "PF" },
  { cod: "II", label: "Întreprindere Individuală", short: "I.I.", group: "PF" },
  { cod: "IF", label: "Întreprindere Familială", short: "I.F.", group: "PF" },
  { cod: "SC", label: "Societate Cooperativă", short: "S.C.", group: "SOC" },
  { cod: "RA", label: "Regie Autonomă", short: "R.A.", group: "SOC" },
  { cod: "SA_BVB", label: "SA listată la bursă", short: "S.A. (BVB)", group: "SOC" },
];

const SOC = ["SRL","SA","SNC","SCS","SCA","SC","RA","SA_BVB"];
const PF = ["PFA","II","IF"];
const isSOC = (f) => SOC.includes(f);
const isPF = (f) => PF.includes(f);

/* ═══ MOCK DATA ═══ */
const FIRME = [
  {
    id: 1, forma: "SRL", denumire: "SC CONSTRUCT NORD SRL", cui: "RO44123456", regCom: "J12/441/2018", formaJuridica: "Societate cu Răspundere Limitată",
    caen: "2562", caenDesc: "Mecanică generală", activitatiSecundare: [{ cod: "2511", den: "Fabricarea de construcții metalice" }, { cod: "2529", den: "Producție de rezervoare" }],
    adresa: "Str. Industriei 14, Cluj-Napoca", localitate: "Cluj-Napoca", judet: "Cluj", codPostal: "400000", telefon: "0264-555-123", email: "office@constructnord.ro", website: "www.constructnord.ro",
    stare: "funcțiune", angajati: 47, cifraAfaceri: "4.250.000", profitNet: "380.000",
    capitalSocial: "10.000", moneda: "RON", integralVarsat: true, partiSociale: 100, valoareParte: "100", natura: { privatAutohton: 100, privatStrain: 0, stat: 0 },
    anInfiintare: 2018, durata: "nelimitată", actConstitutiv: "Act constitutiv actualizat la 15.03.2024",
    ultimaMentiune: "Depunere act constitutiv actualizat (art.204 din Legea nr.31/1990) Nr. 45032 din 15.03.2024", ultimulSync: "Azi, 09:12",
    asociatiPF: [{ nume: "Popescu Ion", calitate: "asociat", cetatenie: "română", aport: "6.000 RON", partiSociale: 60, cotaBeneficii: 60, cotaPierderi: 60 }, { nume: "Popescu Maria", calitate: "asociat", cetatenie: "română", aport: "4.000 RON", partiSociale: 40, cotaBeneficii: 40, cotaPierderi: 40 }],
    asociatiPJ: [],
    administratori: [{ nume: "Popescu Ion", functie: "administrator", puteri: "depline", durataMandatLabel: "nelimitată", dataNumirii: "2018-05-10" }],
    sediiSecundare: [{ denumire: "Punct de lucru Dej", adresa: "Str. Fabricii 22, Dej, Cluj" }],
    insolventa: false, dizolvare: false, lichidare: false, restrictii: false,
    situatiiFinanciare: [
      { an: 2024, cifraAfaceri: 4250000, profitNet: 380000, angajati: 47, capitaluriProprii: 890000 },
      { an: 2023, cifraAfaceri: 3800000, profitNet: 310000, angajati: 42, capitaluriProprii: 510000 },
      { an: 2022, cifraAfaceri: 3200000, profitNet: 250000, angajati: 38, capitaluriProprii: 200000 },
    ],
  },
  {
    id: 2, forma: "PFA", denumire: "MARIN GHEORGHE PFA", cui: "31987654", regCom: "F02/987/2015", formaJuridica: "Persoană Fizică Autorizată",
    caen: "0111", caenDesc: "Cultivarea cerealelor", activitatiSecundare: [{ cod: "0113", den: "Cultivarea legumelor" }],
    adresa: "Sat Luminița, Com. Florești", localitate: "Florești", judet: "Arad", codPostal: "317130", telefon: "0257-333-456", email: "marin.g@gmail.com", website: "",
    stare: "funcțiune", angajati: 2, cifraAfaceri: "890.000", profitNet: "210.000",
    capitalSocial: null, moneda: null, integralVarsat: null, partiSociale: null, valoareParte: null, natura: null,
    anInfiintare: 2015, durata: "nelimitată",
    ultimaMentiune: "Depunere declarație pe propria răspundere nr. 5044 din 10.01.2025", ultimulSync: "Ieri, 14:30",
    titular: { nume: "Marin Gheorghe", cetatenie: "română", sex: "M", dataNasterii: "1978-04-12", stare_civila: "căsătorit" },
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
    id: 3, forma: "SA", denumire: "TECH SOLUTIONS SA", cui: "RO28456789", regCom: "J40/1234/2012", formaJuridica: "Societate pe Acțiuni",
    caen: "6201", caenDesc: "Activități de programare", activitatiSecundare: [{ cod: "6202", den: "Consultanță IT" }, { cod: "6311", den: "Prelucrare date" }],
    adresa: "Bd. Unirii 45, Etaj 3, Sector 3", localitate: "București", judet: "București", codPostal: "030167", telefon: "021-444-7890", email: "info@techsolutions.ro", website: "www.techsolutions.ro",
    stare: "funcțiune", angajati: 85, cifraAfaceri: "12.400.000", profitNet: "1.850.000",
    capitalSocial: "100.000", moneda: "RON", integralVarsat: true, actiuni: 10000, valoareActiune: "10", tipActiuni: "nominative", natura: { privatAutohton: 100, privatStrain: 0, stat: 0 },
    anInfiintare: 2012, durata: "nelimitată", actConstitutiv: "Act constitutiv actualizat la 10.01.2025",
    ultimaMentiune: "Majorare capital social, Nr. 78901 din 10.01.2025", ultimulSync: "Azi, 11:05",
    asociatiPF: [{ nume: "Radu Elena", calitate: "acționar", cetatenie: "română", aport: "55.000 RON", actiuni: 5500, cotaBeneficii: 55, cotaPierderi: 55 }],
    asociatiPJ: [{ denumire: "Innovation Partners SRL", calitate: "acționar", tara: "România", cui: "RO33445566", aport: "45.000 RON", actiuni: 4500, cotaBeneficii: 45, cotaPierderi: 45 }],
    administratori: [{ nume: "Radu Elena", functie: "Președinte CA", puteri: "conform statut", durataMandatLabel: "4 ani", dataNumirii: "2023-03-15" }, { nume: "Ionescu Dan", functie: "Director General", puteri: "conform delegare", durataMandatLabel: "4 ani", dataNumirii: "2023-03-15" }],
    cenzori: [{ nume: "AUDIT EXPERT SRL", calitate: "auditor financiar", nrAutorizare: "AF-2345" }],
    sediiSecundare: [{ denumire: "Birou Cluj", adresa: "Str. Memorandumului 10, Cluj-Napoca" }],
    insolventa: false, dizolvare: false, lichidare: false, restrictii: false,
    situatiiFinanciare: [
      { an: 2024, cifraAfaceri: 12400000, profitNet: 1850000, angajati: 85, capitaluriProprii: 4200000 },
      { an: 2023, cifraAfaceri: 10800000, profitNet: 1500000, angajati: 72, capitaluriProprii: 2350000 },
    ],
  },
  {
    id: 4, forma: "IF", denumire: "VOICU ÎNTREPRINDERE FAMILIALĂ", cui: "39876543", regCom: "F35/567/2020", formaJuridica: "Întreprindere Familială",
    caen: "3511", caenDesc: "Producția de energie electrică", activitatiSecundare: [],
    adresa: "Str. Soarelui 8", localitate: "Timișoara", judet: "Timiș", codPostal: "300001", telefon: "0256-222-890", email: "", website: "",
    stare: "funcțiune", angajati: 4, cifraAfaceri: "920.000", profitNet: "85.000",
    capitalSocial: null, moneda: null, integralVarsat: null, partiSociale: null, valoareParte: null, natura: null,
    anInfiintare: 2020, durata: "nelimitată",
    ultimaMentiune: "Înregistrare mențiuni, Nr. 33201 din 20.09.2024", ultimulSync: "3 mar, 16:20",
    reprezentantIF: "Voicu Andrei",
    membriIF: [{ nume: "Voicu Andrei", calitate: "reprezentant", gradRudenie: "-", cetatenie: "română" }, { nume: "Voicu Daniela", calitate: "membru", gradRudenie: "soție", cetatenie: "română" }, { nume: "Voicu Alex", calitate: "membru", gradRudenie: "fiu", cetatenie: "română" }],
    asociatiPF: [], asociatiPJ: [], administratori: [],
    sediiSecundare: [],
    insolventa: false, restrictii: false,
    situatiiFinanciare: [
      { an: 2024, cifraAfaceri: 920000, profitNet: 85000, angajati: 4, venituriTotale: 980000, cheltuieliTotale: 895000 },
    ],
  },
  {
    id: 5, forma: "SRL", denumire: "PÂINE & TRADIȚIE SRL", cui: "RO42111222", regCom: "J32/890/2019", formaJuridica: "Societate cu Răspundere Limitată",
    caen: "1071", caenDesc: "Fabricarea pâinii", activitatiSecundare: [{ cod: "1072", den: "Fabricarea biscuiților" }],
    adresa: "Str. Morii 22", localitate: "Sibiu", judet: "Sibiu", codPostal: "550003", telefon: "0269-111-234", email: "contact@painetrad.ro", website: "",
    stare: "funcțiune", angajati: 18, cifraAfaceri: "2.100.000", profitNet: "190.000",
    capitalSocial: "1.000", moneda: "RON", integralVarsat: true, partiSociale: 100, valoareParte: "10", natura: { privatAutohton: 100, privatStrain: 0, stat: 0 },
    anInfiintare: 2019, durata: "nelimitată", actConstitutiv: "Act constitutiv din 2019",
    ultimaMentiune: "Depunere situații financiare 2023, Nr. 8901 din 15.05.2024", ultimulSync: "28 feb, 10:00",
    asociatiPF: [{ nume: "Lungu Maria", calitate: "asociat", cetatenie: "română", aport: "700 RON", partiSociale: 70, cotaBeneficii: 70, cotaPierderi: 70 }, { nume: "Lungu Vasile", calitate: "asociat", cetatenie: "română", aport: "300 RON", partiSociale: 30, cotaBeneficii: 30, cotaPierderi: 30 }],
    asociatiPJ: [],
    administratori: [{ nume: "Lungu Maria", functie: "administrator", puteri: "depline", durataMandatLabel: "nelimitată", dataNumirii: "2019-07-01" }],
    sediiSecundare: [],
    insolventa: false, dizolvare: false, lichidare: false, restrictii: false,
    situatiiFinanciare: [{ an: 2024, cifraAfaceri: 2100000, profitNet: 190000, angajati: 18, capitaluriProprii: 420000 }],
  },
  {
    id: 6, forma: "SRL", denumire: "TRANSPORT RAPID SRL", cui: "RO15333444", regCom: "J08/234/2010", formaJuridica: "Societate cu Răspundere Limitată",
    caen: "4941", caenDesc: "Transporturi rutiere de mărfuri", activitatiSecundare: [],
    adresa: "Str. Gării 5", localitate: "Brașov", judet: "Brașov", codPostal: "500001", telefon: "-", email: "", website: "",
    stare: "radiată", angajati: 0, cifraAfaceri: "0", profitNet: "-45.000",
    capitalSocial: "200", moneda: "RON", integralVarsat: true, partiSociale: 20, valoareParte: "10", natura: { privatAutohton: 100, privatStrain: 0, stat: 0 },
    anInfiintare: 2010, durata: "nelimitată",
    ultimaMentiune: "Radiere, Nr. 11023 din 01.02.2025", ultimulSync: "15 feb, 08:30",
    asociatiPF: [{ nume: "Barbu Cristian", calitate: "asociat", cetatenie: "română", aport: "200 RON", partiSociale: 20, cotaBeneficii: 100, cotaPierderi: 100 }],
    asociatiPJ: [],
    administratori: [{ nume: "Barbu Cristian", functie: "administrator", puteri: "depline", durataMandatLabel: "nelimitată", dataNumirii: "2010-03-01" }],
    sediiSecundare: [],
    insolventa: false, dizolvare: true, lichidare: true, restrictii: false,
    situatiiFinanciare: [{ an: 2024, cifraAfaceri: 0, profitNet: -45000, angajati: 0, capitaluriProprii: -45000 }],
  },
];

const BILANTE = {
  1: [ // SC CONSTRUCT NORD SRL
    {
      an: 2024, fisier: "Bilant_2024.pdf", dataUpload: "2025-06-10", status: "procesat",
      f10: {
        activeImobilizate: { necorporale: 18933, corporale: 16922724, financiare: 6571, total: 16941657 },
        activeCirculante: { stocuri: 4343059, creante: 1866161, investitiiTS: 0, casa: -237392, total: 5971828 },
        cheltuieliAvans: 3450,
        datoriiSubAnul: 9053928,
        activeCurenteNete: -7387749,
        totalActiveMinusDatorii: 9553908,
        datoriiPesteAnul: 5648035,
        venituriAvans: 4305649,
        capital: { subscrisVarsat: 200, prime: 0, rezerveReevaluare: 0, rezerve: 2365085, profitReportat: 114915, profitExercitiu: 1425673, repartizareProfit: 1595212 },
        capitaluriProprii: 3905873,
      },
      f20: {
        cifraAfaceriNeta: 28310380, productiaVanduta: 25413358, venituriMarfuri: 2897022,
        venituriExploatare: 31961631,
        cheltuieliMaterii: 21014236, cheltuieliUtilitati: 1390051, cheltuieliMarfuri: 1879399,
        cheltuieliPersonal: 2005513, salarii: 1966173, asigurari: 39340,
        amortizare: 1919544,
        alteCheltuieliExploatare: 948943,
        cheltuieliExploatare: 29330112,
        profitExploatare: 2631519,
        venituriFinanciare: -7392, cheltuieliFinanciare: 920246, cheltuieliDobandi: 912011,
        pierdereFinanciara: 927638,
        venituriTotale: 31954239, cheltuieliTotale: 30250358,
        profitBrut: 1703881, impozitProfit: 278208, profitNet: 1425673,
      },
      f30: {
        numarMediuSalariati: 25, numarEfectivSalariati: 31,
        platiRestante: 0, furnizoriRestanti: 0,
        datoriiPersonal: 64107, datoriiBuget: 1185459,
        creanteBuget: 132352, creanteComerciale: 1729728,
        dividendeDistribuite: 580193,
      },
      f40: {
        terenuri: { soldInitial: 720761, cresteri: 516472, reduceri: 0, soldFinal: 1237233 },
        constructii: { soldInitial: 5852621, cresteri: 584811, reduceri: 75, soldFinal: 6437357 },
        instalatii: { soldInitial: 11458616, cresteri: 616349, reduceri: 17998, soldFinal: 12056967 },
        altele: { soldInitial: 1154207, cresteri: 30356, reduceri: 5179, soldFinal: 1179384 },
        inCurs: { soldInitial: 641158, cresteri: 313583, reduceri: 0, soldFinal: 954741 },
        totalCorporale: { soldInitial: 19888469, cresteri: 2039442, reduceri: 23252, soldFinal: 21904659 },
        amortizareTotal: 5046540,
      },
    },
    {
      an: 2023, fisier: "Bilant_2023.pdf", dataUpload: "2024-05-28", status: "procesat",
      f10: { activeImobilizate: { total: 16821833 }, activeCirculante: { total: 3302618 }, capitaluriProprii: 2480199 },
      f20: { cifraAfaceriNeta: 27223334, profitExploatare: 2636392, profitBrut: 1595212, profitNet: 1595212, venituriTotale: 31132899, cheltuieliTotale: 29537687 },
      f30: { numarMediuSalariati: 20, numarEfectivSalariati: 27 },
    },
  ],
  3: [ // TECH SOLUTIONS SA
    {
      an: 2024, fisier: "Bilant_TS_2024.pdf", dataUpload: "2025-05-15", status: "procesat",
      f10: { activeImobilizate: { total: 2800000 }, activeCirculante: { total: 8500000 }, capitaluriProprii: 4200000 },
      f20: { cifraAfaceriNeta: 12400000, profitExploatare: 2100000, profitBrut: 1900000, profitNet: 1850000, venituriTotale: 12600000, cheltuieliTotale: 10700000 },
      f30: { numarMediuSalariati: 85, numarEfectivSalariati: 92 },
    },
  ],
};

const MOCK_CUI_DATA = { "55667788": { denumire: "INOVAȚIE DIGITALĂ SRL", adresa: "Str. Progresului 10, Iași", caen: "6311", stare: "ACTIV" } };
const lookupCUI = (cui) => new Promise((res) => setTimeout(() => { res(MOCK_CUI_DATA[cui.replace(/\D/g, "")] || null); }, 1200));

/* ═══ HELPERS ═══ */
const fmt = (v) => { if (v == null) return "—"; const n = parseInt(String(v).replace(/[^0-9-]/g, "")); return isNaN(n) ? String(v) : n.toLocaleString("ro-RO") + " RON"; };
const fmtNum = (v) => { if (v == null) return "—"; const n = typeof v === "number" ? v : parseInt(String(v).replace(/[^0-9-]/g, "")); return isNaN(n) ? String(v) : n.toLocaleString("ro-RO"); };
const formaColor = (cod) => { if (PF.includes(cod)) return { bg: "rgba(251,146,60,0.12)", color: "var(--accent-orange)" }; return { bg: "rgba(77,139,255,0.12)", color: "var(--accent-blue)" }; };

function getDetailTabs(forma) {
  const tabs = ["General"];
  if (forma === "IF") tabs.push("Membri IF");
  else if (isPF(forma)) tabs.push("Titular");
  else tabs.push(forma === "SA" || forma === "SA_BVB" ? "Acționari" : "Asociați");
  if (isSOC(forma)) tabs.push("Administrare");
  tabs.push("Activități");
  if (isSOC(forma)) tabs.push("Sedii");
  tabs.push("Fin. ONRC");
  tabs.push("Fin. ANAF");
  tabs.push("Juridic");
  return tabs;
}

/* ═══ COMPONENT ═══ */
export default function FirmePage() {
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState("auto");
  const [addForma, setAddForma] = useState("SRL");
  const [cui, setCui] = useState("");
  const [cuiLoad, setCuiLoad] = useState(false);
  const [cuiRes, setCuiRes] = useState(null);
  const [detailTab, setDetailTab] = useState("General");
  const [bilantYear, setBilantYear] = useState(null);
  const [bilantSection, setBilantSection] = useState("f10");

  const filtered = FIRME.filter(f => {
    if (filter === "activ" && f.stare === "radiată") return false;
    if (filter === "radiat" && f.stare !== "radiată") return false;
    if (filter === "soc" && !isSOC(f.forma)) return false;
    if (filter === "pf" && !isPF(f.forma)) return false;
    if (search) { const q = search.toLowerCase(); return f.denumire.toLowerCase().includes(q) || f.cui.toLowerCase().includes(q) || f.caen.includes(q) || f.judet.toLowerCase().includes(q) || f.forma.toLowerCase().includes(q); }
    return true;
  });

  const sel = FIRME.find(f => f.id === selected);
  const tabs = sel ? getDetailTabs(sel.forma) : [];

  const checkCui = async () => { if (cui.replace(/\D/g, "").length < 6) return; setCuiLoad(true); setCuiRes(null); const r = await lookupCUI(cui); setCuiLoad(false); setCuiRes(r || "error"); };

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
        .tb-title{font-size:20px;font-weight:800;flex:1}.tb-count{font-size:14px;color:var(--text-muted)}
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

        /* Detail */
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

        /* Modal */
        .overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;animation:fadeIn .2s}
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

        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
      `}</style>

      <div className="page">
        <div className="sidebar">
          <div className="sb-logo"><div className="sb-logo-icon">DF</div><div className="sb-logo-text">DosarFonduri</div></div>
          <div className="sb-nav">
            <div className="sb-section">Principal</div>
            <div className="sb-item"><span className="sb-icon">📊</span><span>Panou</span></div>
            <div className="sb-item active"><span className="sb-icon">🏢</span><span>Firme</span></div>
            <div className="sb-item"><span className="sb-icon">📃</span><span>Documente</span></div>
            <div className="sb-item"><span className="sb-icon">💼</span><span>Proiecte</span></div>
            <div className="sb-section">Configurare</div>
            <div className="sb-item"><span className="sb-icon">🛠</span><span>Configurări</span></div>
            <div className="sb-section">Sistem</div>
            <div className="sb-item"><span className="sb-icon">⚙️</span><span>Admin</span></div>
          </div>
          <div className="sb-footer"><div className="sb-avatar">IP</div><div><div className="sb-user-name">Ion Popescu</div><div className="sb-user-role">Administrator</div></div></div>
        </div>

        <div className="main">
          <div className="topbar">
            <div className="tb-title">Firme</div>
            <span className="tb-count">{filtered.length} firme</span>
            <button className="btn-add" onClick={() => { setShowAdd(true); setCui(""); setCuiRes(null); setAddMode("auto"); setAddForma("SRL"); }}>+ Adaugă firmă</button>
          </div>

          <div className="firme-layout">
            <div className="firme-list">
              <div className="firme-toolbar">
                <input className="fi" placeholder="Caută firmă, CUI, CAEN, județ, formă..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 280 }} />
                <div className="pill-group">
                  <button className={`pill ${filter==="all"?"on":""}`} onClick={() => setFilter("all")}>Toate</button>
                  <button className={`pill ${filter==="activ"?"on":""}`} onClick={() => setFilter("activ")}>Active</button>
                  <button className={`pill ${filter==="radiat"?"on":""}`} onClick={() => setFilter("radiat")}>Radiate</button>
                  <button className={`pill ${filter==="soc"?"on":""}`} onClick={() => setFilter("soc")}>Societăți</button>
                  <button className={`pill ${filter==="pf"?"on":""}`} onClick={() => setFilter("pf")}>PFA/II/IF</button>
                </div>
              </div>
              <div className="firme-scroll">
                {filtered.map(f => {
                  const fc = formaColor(f.forma);
                  return (
                    <div key={f.id} className={`firma-card ${selected===f.id?"active":""}`} onClick={() => { setSelected(f.id); setDetailTab("General"); setBilantYear(null); setBilantSection("f10"); }}>
                      <div className="fc-icon" style={{ background: fc.bg, color: fc.color }}>{f.forma}</div>
                      <div className="fc-info">
                        <div className="fc-name">
                          {f.denumire}
                          <span className="fc-badge" style={{ background: f.stare === "radiată" ? "rgba(248,113,113,.12)" : "rgba(52,211,153,.12)", color: f.stare === "radiată" ? "var(--accent-red)" : "var(--accent-green)" }}>{f.stare}</span>
                        </div>
                        <div className="fc-meta">
                          <span>CUI: {f.cui}</span>
                          <span>CAEN: {f.caen}</span>
                          <span>📍 {f.judet}</span>
                          <span>👥 {f.angajati}</span>
                        </div>
                      </div>
                      <div className="fc-right"><div className="fc-sync">Sync: {f.ultimulSync}</div></div>
                    </div>
                  );
                })}
                {filtered.length === 0 && <div className="empty-panel" style={{ padding: 60 }}><div className="ep-icon">🔍</div><div className="ep-text">Nicio firmă găsită</div></div>}
              </div>
            </div>

            {/* ═══ DETAIL ═══ */}
            {sel ? (
              <div className="firma-detail" key={sel.id}>
                <div className="fd-top">
                  <div className="fd-top-info">
                    <div className="fd-name">{sel.denumire}</div>
                    <div className="fd-cui">CUI: {sel.cui} · {sel.regCom}</div>
                    <div className="fd-badges">
                      <span className="fc-badge" style={sel.stare==="radiată"?{background:"rgba(248,113,113,.12)",color:"var(--accent-red)"}:{background:"rgba(52,211,153,.12)",color:"var(--accent-green)"}}>{sel.stare}</span>
                      <span className="fc-badge" style={formaColor(sel.forma)}>{sel.forma}</span>
                      <span className="fc-badge" style={{background:"var(--bg-elevated)",color:"var(--text-muted)"}}>CAEN {sel.caen}</span>
                      <span className="fc-badge" style={{background:"var(--bg-elevated)",color:"var(--text-muted)"}}>Din {sel.anInfiintare}</span>
                    </div>
                  </div>
                  <div className="fd-act-row">
                    <button className="fd-act">🔄 Actualizare CUI</button>
                    <button className="fd-act">📤 Reîncarcă certificat</button>
                    <button className="fd-act danger">🗑 Șterge</button>
                  </div>
                </div>

                <div className="fd-tabs">
                  {tabs.map(t => <button key={t} className={`fd-tab ${detailTab===t?"on":""}`} onClick={() => setDetailTab(t)}>{t}</button>)}
                </div>

                <div className="fd-body">
                  {/* ─── GENERAL ─── */}
                  {detailTab === "General" && (<>
                    <div className="fd-grid">
                      <div className="c span2"><div className="c-label">Formă juridică</div><div className="c-val">{sel.formaJuridica}</div></div>
                      <div className="c"><div className="c-label">Stare</div><div className="c-val"><span className="fc-badge" style={sel.stare==="radiată"?{background:"rgba(248,113,113,.12)",color:"var(--accent-red)"}:{background:"rgba(52,211,153,.12)",color:"var(--accent-green)"}}>{sel.stare}</span></div></div>
                      <div className="c span2"><div className="c-label">Adresă</div><div className="c-val">{sel.adresa}</div><div className="c-val sub">{sel.localitate}, {sel.judet} {sel.codPostal}</div></div>
                      <div className="c"><div className="c-label">Telefon</div><div className="c-val mono">{sel.telefon}</div></div>
                      {sel.email && <div className="c"><div className="c-label">Email</div><div className="c-val mono" style={{fontSize:12}}>{sel.email}</div></div>}
                      <div className="c"><div className="c-label">{isPF(sel.forma)?"Durată autorizare":"Durată societate"}</div><div className="c-val">{sel.durata}</div></div>
                      <div className="c"><div className="c-label">An înființare</div><div className="c-val mono">{sel.anInfiintare}</div></div>
                    </div>
                    {isPF(sel.forma) && sel.patrimoniu_afectat && (
                      <div className="mention"><div className="mention-label">Patrimoniu de afectațiune</div><div className="mention-text">{sel.patrimoniu_afectat}</div></div>
                    )}
                    <div className="mention"><div className="mention-label">Ultima mențiune</div><div className="mention-text">{sel.ultimaMentiune}</div></div>
                    {isSOC(sel.forma) && sel.capitalSocial && (<>
                      <div className="fd-stitle">Capital social</div>
                      <div className="fd-grid c4">
                        <div className="c"><div className="c-label">Subscris</div><div className="c-val mono">{fmt(sel.capitalSocial)}</div></div>
                        <div className="c"><div className="c-label">{sel.forma==="SA"||sel.forma==="SA_BVB"||sel.forma==="SCA"?"Acțiuni":"Părți sociale"}</div><div className="c-val mono">{sel.partiSociale||sel.actiuni||"—"}</div></div>
                        <div className="c"><div className="c-label">{sel.forma==="SA"||sel.forma==="SA_BVB"||sel.forma==="SCA"?"Val. nominală":"Val. parte"}</div><div className="c-val mono">{fmt(sel.valoareParte||sel.valoareActiune)}</div></div>
                        <div className="c"><div className="c-label">Natură capital</div><div className="c-val" style={{fontSize:11}}>privat autohton {sel.natura?.privatAutohton || 0}%{sel.natura?.privatStrain>0?`, străin ${sel.natura.privatStrain}%`:""}{sel.natura?.stat>0?`, stat ${sel.natura.stat}%`:""}</div></div>
                      </div>
                    </>)}
                  </>)}

                  {/* ─── ASOCIAȚI / ACȚIONARI ─── */}
                  {(detailTab === "Asociați" || detailTab === "Acționari") && (<>
                    {sel.asociatiPJ.length > 0 && (<>
                      <div className="fd-stitle">Asociați — Persoane Juridice ({sel.asociatiPJ.length})</div>
                      {sel.asociatiPJ.map((a, i) => (
                        <div className="assoc-row" key={i}>
                          <span style={{fontSize:16}}>🏢</span>
                          <div className="assoc-name">{a.denumire}<div style={{fontSize:11,color:"var(--text-muted)"}}>{a.calitate} · {a.tara}</div></div>
                          <div className="assoc-detail">{a.cotaBeneficii}%</div>
                          <div className="assoc-detail">{a.aport}</div>
                        </div>
                      ))}
                    </>)}
                    <div className="fd-stitle">Asociați — Persoane Fizice ({sel.asociatiPF.length})</div>
                    {sel.asociatiPF.map((a, i) => (
                      <div className="assoc-row" key={i}>
                        <span style={{fontSize:16}}>👤</span>
                        <div className="assoc-name">{a.nume}<div style={{fontSize:11,color:"var(--text-muted)"}}>{a.calitate} · {a.cetatenie}</div></div>
                        <div className="assoc-detail">{a.cotaBeneficii}%</div>
                        <div className="assoc-detail">{a.partiSociale || a.actiuni} {sel.forma==="SA"?"acțiuni":"p.s."}</div>
                        <div className="assoc-detail">{a.aport}</div>
                      </div>
                    ))}
                  </>)}

                  {/* ─── TITULAR (PFA/II) ─── */}
                  {detailTab === "Titular" && sel.titular && (<>
                    <div className="fd-stitle">Titular</div>
                    <div className="fd-grid c2">
                      <div className="c"><div className="c-label">Nume</div><div className="c-val">{sel.titular.nume}</div></div>
                      <div className="c"><div className="c-label">Cetățenie</div><div className="c-val">{sel.titular.cetatenie}</div></div>
                      <div className="c"><div className="c-label">Data nașterii</div><div className="c-val mono">{sel.titular.dataNasterii}</div></div>
                      <div className="c"><div className="c-label">Stare civilă</div><div className="c-val">{sel.titular.stare_civila}</div></div>
                    </div>
                  </>)}

                  {/* ─── MEMBRI IF ─── */}
                  {detailTab === "Membri IF" && sel.membriIF && (<>
                    <div className="fd-stitle">Reprezentant</div>
                    <div className="assoc-row"><span style={{fontSize:16}}>👔</span><div className="assoc-name">{sel.reprezentantIF}</div><div className="assoc-detail">Reprezentant IF</div></div>
                    <div className="fd-stitle">Membri ({sel.membriIF.length})</div>
                    {sel.membriIF.map((m, i) => (
                      <div className="assoc-row" key={i}>
                        <span style={{fontSize:16}}>👤</span>
                        <div className="assoc-name">{m.nume}<div style={{fontSize:11,color:"var(--text-muted)"}}>{m.calitate}</div></div>
                        <div className="assoc-detail">{m.gradRudenie}</div>
                        <div className="assoc-detail">{m.cetatenie}</div>
                      </div>
                    ))}
                  </>)}

                  {/* ─── ADMINISTRARE ─── */}
                  {detailTab === "Administrare" && (<>
                    <div className="fd-stitle">{sel.forma==="SA"||sel.forma==="SA_BVB"?"Consiliu de Administrație / Directorat":"Administratori"} ({sel.administratori.length})</div>
                    {sel.administratori.map((a, i) => (
                      <div className="assoc-row" key={i}>
                        <span style={{fontSize:16}}>👔</span>
                        <div className="assoc-name">{a.nume}<div style={{fontSize:11,color:"var(--text-muted)"}}>{a.functie}</div></div>
                        <div className="assoc-detail">Puteri: {a.puteri}</div>
                        <div className="assoc-detail">Mandat: {a.durataMandatLabel}</div>
                      </div>
                    ))}
                    {sel.cenzori && sel.cenzori.length > 0 && (<>
                      <div className="fd-stitle">Cenzori / Auditori</div>
                      {sel.cenzori.map((c, i) => (
                        <div className="assoc-row" key={i}><span style={{fontSize:16}}>🔍</span><div className="assoc-name">{c.nume}<div style={{fontSize:11,color:"var(--text-muted)"}}>{c.calitate}</div></div><div className="assoc-detail">{c.nrAutorizare}</div></div>
                      ))}
                    </>)}
                  </>)}

                  {/* ─── ACTIVITĂȚI ─── */}
                  {detailTab === "Activități" && (<>
                    <div className="fd-stitle">Activitate principală</div>
                    <div className="c full" style={{marginBottom:12}}><div className="c-label">CAEN {sel.caen}</div><div className="c-val">{sel.caenDesc}</div></div>
                    {sel.activitatiSecundare.length > 0 && (<>
                      <div className="fd-stitle">Activități secundare ({sel.activitatiSecundare.length})</div>
                      {sel.activitatiSecundare.map((a, i) => (
                        <div className="assoc-row" key={i} style={{padding:"7px 12px"}}><div className="assoc-detail" style={{minWidth:50}}>{a.cod}</div><div className="assoc-name" style={{fontSize:13}}>{a.den}</div></div>
                      ))}
                    </>)}
                    {sel.sediiSecundare && sel.sediiSecundare.length > 0 && isSOC(sel.forma) && (<>
                      <div className="fd-stitle">Sedii secundare ({sel.sediiSecundare.length})</div>
                      {sel.sediiSecundare.map((s, i) => (
                        <div className="assoc-row" key={i}><span style={{fontSize:16}}>📍</span><div className="assoc-name">{s.denumire}<div style={{fontSize:11,color:"var(--text-muted)"}}>{s.adresa}</div></div></div>
                      ))}
                    </>)}
                  </>)}

                  {/* ─── SEDII ─── */}
                  {detailTab === "Sedii" && (<>
                    <div className="fd-stitle">Sediu social</div>
                    <div className="c full" style={{marginBottom:12}}><div className="c-label">Adresă completă</div><div className="c-val">{sel.adresa}, {sel.localitate}, {sel.judet} {sel.codPostal}</div></div>
                    {sel.sediiSecundare && sel.sediiSecundare.length > 0 && (<>
                      <div className="fd-stitle">Sedii secundare / Puncte de lucru ({sel.sediiSecundare.length})</div>
                      {sel.sediiSecundare.map((s, i) => (
                        <div className="assoc-row" key={i}><span style={{fontSize:16}}>📍</span><div className="assoc-name">{s.denumire}<div style={{fontSize:11,color:"var(--text-muted)"}}>{s.adresa}</div></div></div>
                      ))}
                    </>)}
                  </>)}

                  {/* ─── FINANCIAR ONRC ─── */}
                  {detailTab === "Fin. ONRC" && (<>
                    <div className="fd-stitle">Situații financiare (din date ONRC)</div>
                    <table className="fin-table">
                      <thead><tr>
                        <th>An</th><th>Cifră afaceri</th><th>Profit net</th><th>Angajați</th>
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
                    <div style={{ marginTop: 12, fontSize: 11, color: "var(--text-muted)" }}>Sursă: Date publice ONRC / termene.ro</div>
                  </>)}

                  {/* ─── FINANCIAR ANAF (Bilanțuri) ─── */}
                  {detailTab === "Fin. ANAF" && (() => {
                    const firmaBilante = BILANTE[sel.id] || [];
                    const activeBilant = firmaBilante.find(b => b.an === bilantYear);

                    return (<>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                        <div className="fd-stitle" style={{ margin: 0 }}>Bilanțuri depuse ANAF</div>
                        <div style={{ marginLeft: "auto" }}>
                          <div className="upload-zone" style={{ padding: "10px 20px", display: "inline-flex", alignItems: "center", gap: 8, margin: 0 }}>
                            <span style={{ fontSize: 14 }}>📤</span>
                            <span style={{ fontSize: 12, fontWeight: 600 }}>Upload bilanț PDF</span>
                          </div>
                        </div>
                      </div>

                      {firmaBilante.length === 0 ? (
                        <div className="empty-panel" style={{ padding: 40 }}>
                          <div className="ep-icon">📊</div>
                          <div className="ep-text">Niciun bilanț încărcat.<br />Uploadează un bilanț PDF pentru a extrage datele automat.</div>
                        </div>
                      ) : (<>
                        {/* Year pills */}
                        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                          {firmaBilante.map(b => (
                            <button key={b.an} className={`pill ${bilantYear === b.an ? "on" : ""}`}
                              style={{ padding: "6px 16px" }}
                              onClick={() => { setBilantYear(b.an); setBilantSection("f10"); }}>
                              {b.an}
                              <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.6 }}>✓</span>
                            </button>
                          ))}
                        </div>

                        {!activeBilant ? (
                          <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: 20 }}>Selectează un an pentru a vedea bilanțul</div>
                        ) : (<>
                          {/* Section pills */}
                          <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
                            {[
                              { key: "f10", label: "F10 — Bilanț" },
                              { key: "f20", label: "F20 — Profit & Pierdere" },
                              { key: "f30", label: "F30 — Date informative" },
                              ...(activeBilant.f40 ? [{ key: "f40", label: "F40 — Active imobilizate" }] : []),
                            ].map(s => (
                              <button key={s.key} className={`pill ${bilantSection === s.key ? "on" : ""}`}
                                style={{ padding: "5px 12px", fontSize: 11 }}
                                onClick={() => setBilantSection(s.key)}>
                                {s.label}
                              </button>
                            ))}
                          </div>

                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>
                            📄 {activeBilant.fisier} · Uploadat: {activeBilant.dataUpload} · Status: <span style={{ color: "var(--accent-green)" }}>{activeBilant.status}</span>
                          </div>

                          {/* F10 BILANȚ */}
                          {bilantSection === "f10" && activeBilant.f10 && (<>
                            <div className="fd-stitle">A. Active imobilizate</div>
                            <div className="fd-grid c2">
                              {activeBilant.f10.activeImobilizate.necorporale != null && <div className="c"><div className="c-label">I. Imobilizări necorporale</div><div className="c-val mono">{fmtNum(activeBilant.f10.activeImobilizate.necorporale)}</div></div>}
                              {activeBilant.f10.activeImobilizate.corporale != null && <div className="c"><div className="c-label">II. Imobilizări corporale</div><div className="c-val mono">{fmtNum(activeBilant.f10.activeImobilizate.corporale)}</div></div>}
                              {activeBilant.f10.activeImobilizate.financiare != null && <div className="c"><div className="c-label">III. Imobilizări financiare</div><div className="c-val mono">{fmtNum(activeBilant.f10.activeImobilizate.financiare)}</div></div>}
                              <div className="c" style={{ borderColor: "var(--accent-blue)" }}><div className="c-label">TOTAL Active imobilizate</div><div className="c-val mono" style={{ fontSize: 15 }}>{fmtNum(activeBilant.f10.activeImobilizate.total)}</div></div>
                            </div>

                            {activeBilant.f10.activeCirculante && (<>
                              <div className="fd-stitle">B. Active circulante</div>
                              <div className="fd-grid c2">
                                {activeBilant.f10.activeCirculante.stocuri != null && <div className="c"><div className="c-label">I. Stocuri</div><div className="c-val mono">{fmtNum(activeBilant.f10.activeCirculante.stocuri)}</div></div>}
                                {activeBilant.f10.activeCirculante.creante != null && <div className="c"><div className="c-label">II. Creanțe</div><div className="c-val mono">{fmtNum(activeBilant.f10.activeCirculante.creante)}</div></div>}
                                <div className="c"><div className="c-label">IV. Casa și conturi la bănci</div><div className="c-val mono">{fmtNum(activeBilant.f10.activeCirculante.casa)}</div></div>
                                <div className="c" style={{ borderColor: "var(--accent-blue)" }}><div className="c-label">TOTAL Active circulante</div><div className="c-val mono" style={{ fontSize: 15 }}>{fmtNum(activeBilant.f10.activeCirculante.total)}</div></div>
                              </div>
                            </>)}

                            {activeBilant.f10.datoriiSubAnul != null && (<>
                              <div className="fd-stitle">D–G. Datorii</div>
                              <div className="fd-grid c2">
                                <div className="c"><div className="c-label">Datorii sub 1 an</div><div className="c-val mono red">{fmtNum(activeBilant.f10.datoriiSubAnul)}</div></div>
                                {activeBilant.f10.datoriiPesteAnul != null && <div className="c"><div className="c-label">Datorii peste 1 an</div><div className="c-val mono red">{fmtNum(activeBilant.f10.datoriiPesteAnul)}</div></div>}
                              </div>
                            </>)}

                            {activeBilant.f10.capital && (<>
                              <div className="fd-stitle">J. Capital și rezerve</div>
                              <div className="fd-grid c2">
                                <div className="c"><div className="c-label">Capital subscris vărsat</div><div className="c-val mono">{fmtNum(activeBilant.f10.capital.subscrisVarsat)}</div></div>
                                <div className="c"><div className="c-label">Rezerve</div><div className="c-val mono">{fmtNum(activeBilant.f10.capital.rezerve)}</div></div>
                                <div className="c"><div className="c-label">Profit reportat</div><div className="c-val mono green">{fmtNum(activeBilant.f10.capital.profitReportat)}</div></div>
                                <div className="c"><div className="c-label">Profit exercițiu</div><div className="c-val mono green">{fmtNum(activeBilant.f10.capital.profitExercitiu)}</div></div>
                              </div>
                              <div className="c full" style={{ marginTop: 8, borderColor: "var(--accent-green)" }}><div className="c-label">CAPITALURI PROPRII — TOTAL</div><div className="c-val mono green" style={{ fontSize: 18 }}>{fmtNum(activeBilant.f10.capitaluriProprii)}</div></div>
                            </>)}
                          </>)}

                          {/* F20 PROFIT & PIERDERE */}
                          {bilantSection === "f20" && activeBilant.f20 && (<>
                            <div className="fd-stitle">Venituri</div>
                            <div className="fd-grid c2">
                              <div className="c" style={{ borderColor: "var(--accent-blue)" }}><div className="c-label">Cifra de afaceri netă</div><div className="c-val mono" style={{ fontSize: 16 }}>{fmtNum(activeBilant.f20.cifraAfaceriNeta)}</div></div>
                              {activeBilant.f20.productiaVanduta != null && <div className="c"><div className="c-label">Producția vândută</div><div className="c-val mono">{fmtNum(activeBilant.f20.productiaVanduta)}</div></div>}
                              {activeBilant.f20.venituriMarfuri != null && <div className="c"><div className="c-label">Venituri din mărfuri</div><div className="c-val mono">{fmtNum(activeBilant.f20.venituriMarfuri)}</div></div>}
                              <div className="c"><div className="c-label">VENITURI EXPLOATARE TOTAL</div><div className="c-val mono">{fmtNum(activeBilant.f20.venituriExploatare)}</div></div>
                            </div>

                            <div className="fd-stitle">Cheltuieli exploatare</div>
                            <div className="fd-grid c2">
                              {activeBilant.f20.cheltuieliMaterii != null && <div className="c"><div className="c-label">Materii prime & materiale</div><div className="c-val mono">{fmtNum(activeBilant.f20.cheltuieliMaterii)}</div></div>}
                              {activeBilant.f20.cheltuieliMarfuri != null && <div className="c"><div className="c-label">Cheltuieli mărfuri</div><div className="c-val mono">{fmtNum(activeBilant.f20.cheltuieliMarfuri)}</div></div>}
                              {activeBilant.f20.cheltuieliPersonal != null && <div className="c"><div className="c-label">Cheltuieli personal</div><div className="c-val mono">{fmtNum(activeBilant.f20.cheltuieliPersonal)}</div></div>}
                              {activeBilant.f20.amortizare != null && <div className="c"><div className="c-label">Amortizare</div><div className="c-val mono">{fmtNum(activeBilant.f20.amortizare)}</div></div>}
                              <div className="c" style={{ borderColor: "var(--accent-red)" }}><div className="c-label">CHELTUIELI EXPLOATARE TOTAL</div><div className="c-val mono">{fmtNum(activeBilant.f20.cheltuieliExploatare)}</div></div>
                            </div>

                            <div className="fd-stitle">Rezultat</div>
                            <div className="fd-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                              <div className="c"><div className="c-label">Profit exploatare</div><div className="c-val mono green">{fmtNum(activeBilant.f20.profitExploatare)}</div></div>
                              {activeBilant.f20.pierdereFinanciara != null && <div className="c"><div className="c-label">Pierdere financiară</div><div className="c-val mono red">{fmtNum(activeBilant.f20.pierdereFinanciara)}</div></div>}
                              <div className="c"><div className="c-label">Profit brut</div><div className="c-val mono green">{fmtNum(activeBilant.f20.profitBrut)}</div></div>
                            </div>
                            {activeBilant.f20.impozitProfit != null && <div className="c" style={{ marginTop: 8 }}><div className="c-label">Impozit pe profit</div><div className="c-val mono">{fmtNum(activeBilant.f20.impozitProfit)}</div></div>}
                            <div className="c full" style={{ marginTop: 8, borderColor: activeBilant.f20.profitNet >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                              <div className="c-label">PROFIT NET EXERCIȚIU</div>
                              <div className={`c-val mono ${activeBilant.f20.profitNet >= 0 ? "green" : "red"}`} style={{ fontSize: 18 }}>{fmtNum(activeBilant.f20.profitNet)}</div>
                            </div>
                          </>)}

                          {/* F30 DATE INFORMATIVE */}
                          {bilantSection === "f30" && activeBilant.f30 && (<>
                            <div className="fd-stitle">Personal</div>
                            <div className="fd-grid c2">
                              <div className="c"><div className="c-label">Nr. mediu salariați</div><div className="c-val mono">{activeBilant.f30.numarMediuSalariati}</div></div>
                              {activeBilant.f30.numarEfectivSalariati != null && <div className="c"><div className="c-label">Nr. efectiv salariați (31 dec)</div><div className="c-val mono">{activeBilant.f30.numarEfectivSalariati}</div></div>}
                            </div>
                            <div className="fd-stitle">Plăți restante</div>
                            <div className="fd-grid c2">
                              <div className="c"><div className="c-label">Plăți restante total</div><div className={`c-val mono ${activeBilant.f30.platiRestante > 0 ? "red" : "green"}`}>{activeBilant.f30.platiRestante > 0 ? fmtNum(activeBilant.f30.platiRestante) : "0 — fără restanțe"}</div></div>
                              <div className="c"><div className="c-label">Furnizori restanți</div><div className={`c-val mono ${activeBilant.f30.furnizoriRestanti > 0 ? "red" : "green"}`}>{activeBilant.f30.furnizoriRestanti > 0 ? fmtNum(activeBilant.f30.furnizoriRestanti) : "0"}</div></div>
                            </div>
                            {activeBilant.f30.dividendeDistribuite > 0 && (<>
                              <div className="fd-stitle">Dividende</div>
                              <div className="c"><div className="c-label">Dividende distribuite din profit reportat</div><div className="c-val mono">{fmtNum(activeBilant.f30.dividendeDistribuite)}</div></div>
                            </>)}
                          </>)}

                          {/* F40 ACTIVE IMOBILIZATE */}
                          {bilantSection === "f40" && activeBilant.f40 && (<>
                            <div className="fd-stitle">Situația activelor imobilizate</div>
                            <table className="fin-table">
                              <thead><tr><th>Element</th><th>Sold inițial</th><th>Creșteri</th><th>Reduceri</th><th>Sold final</th></tr></thead>
                              <tbody>
                                {[
                                  { label: "Terenuri & amenajări", d: activeBilant.f40.terenuri },
                                  { label: "Construcții", d: activeBilant.f40.constructii },
                                  { label: "Instalații tehnice & mașini", d: activeBilant.f40.instalatii },
                                  { label: "Alte instalații & mobilier", d: activeBilant.f40.altele },
                                  { label: "Imobilizări în curs", d: activeBilant.f40.inCurs },
                                ].filter(r => r.d).map((r, i) => (
                                  <tr key={i}>
                                    <td style={{ fontFamily: "var(--font-sans)", fontWeight: 500 }}>{r.label}</td>
                                    <td>{fmtNum(r.d.soldInitial)}</td>
                                    <td className="green">{fmtNum(r.d.cresteri)}</td>
                                    <td className="red">{r.d.reduceri > 0 ? fmtNum(r.d.reduceri) : "—"}</td>
                                    <td style={{ fontWeight: 700 }}>{fmtNum(r.d.soldFinal)}</td>
                                  </tr>
                                ))}
                                <tr style={{ borderTop: "2px solid var(--accent-blue)" }}>
                                  <td style={{ fontFamily: "var(--font-sans)", fontWeight: 700 }}>TOTAL CORPORALE</td>
                                  <td style={{ fontWeight: 700 }}>{fmtNum(activeBilant.f40.totalCorporale.soldInitial)}</td>
                                  <td className="green" style={{ fontWeight: 700 }}>{fmtNum(activeBilant.f40.totalCorporale.cresteri)}</td>
                                  <td className="red">{fmtNum(activeBilant.f40.totalCorporale.reduceri)}</td>
                                  <td style={{ fontWeight: 700 }}>{fmtNum(activeBilant.f40.totalCorporale.soldFinal)}</td>
                                </tr>
                              </tbody>
                            </table>
                            <div className="c" style={{ marginTop: 12 }}><div className="c-label">Amortizare cumulată</div><div className="c-val mono">{fmtNum(activeBilant.f40.amortizareTotal)}</div></div>
                          </>)}
                        </>)}
                      </>)}
                    </>);
                  })()}

                  {/* ─── JURIDIC ─── */}
                  {detailTab === "Juridic" && (<>
                    <div className="fd-stitle">Stare juridică</div>
                    {sel.insolventa && <div className="warn-box">⚠️ Firmă în insolvență</div>}
                    {sel.dizolvare && <div className="warn-box">⚠️ Firmă dizolvată</div>}
                    {sel.lichidare && <div className="warn-box">⚠️ Firmă în lichidare</div>}
                    {sel.restrictii && <div className="warn-box">⚠️ Restricții active</div>}
                    {!sel.insolventa && !sel.dizolvare && !sel.lichidare && !sel.restrictii && <div className="ok-box">✓ Fără restricții, insolvență, dizolvare sau lichidare</div>}
                    <div className="fd-grid c2" style={{marginTop:12}}>
                      <div className="c"><div className="c-label">Nr. Reg. Comerțului</div><div className="c-val mono">{sel.regCom}</div></div>
                      <div className="c"><div className="c-label">Formă juridică</div><div className="c-val">{sel.formaJuridica}</div></div>
                    </div>
                    <div className="mention" style={{marginTop:12}}><div className="mention-label">Ultima mențiune</div><div className="mention-text">{sel.ultimaMentiune}</div></div>
                  </>)}
                </div>
              </div>
            ) : (
              <div className="firma-detail" style={{alignItems:"center",justifyContent:"center"}}><div className="empty-panel"><div className="ep-icon">🏢</div><div className="ep-text">Selectează o firmă pentru detalii</div></div></div>
            )}
          </div>
        </div>

        {/* ═══ ADD MODAL ═══ */}
        {showAdd && (
          <div className="overlay" onClick={e => e.target===e.currentTarget && setShowAdd(false)}>
            <div className="modal">
              <div className="modal-title">Adaugă firmă<button className="modal-close" onClick={() => setShowAdd(false)}>✕</button></div>
              <div className="mode-toggle">
                <button className={`mode-btn ${addMode==="auto"?"on":""}`} onClick={() => setAddMode("auto")}>🔍 Automat (CUI)</button>
                <button className={`mode-btn ${addMode==="manual"?"on":""}`} onClick={() => setAddMode("manual")}>📤 Manual (Upload ONRC)</button>
              </div>

              {addMode === "auto" ? (<>
                <div className="add-row">
                  <input className={`fi mono ${cuiRes&&cuiRes!=="error"?"ok":cuiRes==="error"?"err":""}`} placeholder="CUI firmă (ex: 55667788)" value={cui} onChange={e => {setCui(e.target.value);setCuiRes(null);}} onKeyDown={e => e.key==="Enter"&&checkCui()} />
                  <button className="btn-p" onClick={checkCui} disabled={cuiLoad||cui.replace(/\D/g,"").length<6}>{cuiLoad?<span className="spinner"/>:"Verifică"}</button>
                </div>
                <div className="f-hint">Demo — încearcă: 55667788</div>
                {cuiLoad && <div className="cui-load"><span className="spinner"/> Se verifică la termene.ro...</div>}
                {cuiRes && cuiRes!=="error" && (<div className="cui-ok"><div className="cn">{cuiRes.denumire}</div><div className="cr"><strong>Adresă:</strong>{cuiRes.adresa}</div><div className="cr"><strong>CAEN:</strong>{cuiRes.caen}</div><div className="cr"><strong>Stare:</strong><span style={{color:"var(--accent-green)"}}>{cuiRes.stare}</span></div></div>)}
                {cuiRes === "error" && <div className="cui-err">CUI-ul nu a fost găsit.</div>}
                <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><button className="btn-s" onClick={() => setShowAdd(false)}>Anulează</button><button className="btn-p" disabled={!cuiRes||cuiRes==="error"} onClick={() => {setShowAdd(false);alert("Firmă adăugată! (demo)")}}>Adaugă firma</button></div>
              </>) : (<>
                <div className="modal-sub">Încarcă documentul ONRC și agenții vor face restul:</div>
                <div className="upload-flow">Upload → OCR automat → Extragere date → Validare → Stocare</div>

                <div className="forma-group-title">Societăți comerciale</div>
                <div className="forma-grid">
                  {FORME.filter(f => f.group === "SOC").map(f => (
                    <div key={f.cod} className={`forma-radio ${addForma===f.cod?"on":""}`} onClick={() => setAddForma(f.cod)}>
                      <div className="fr-cod">{f.short}</div>
                      <div className="fr-label">{f.label}</div>
                    </div>
                  ))}
                </div>

                <div className="forma-group-title">Persoane fizice / Întreprinderi</div>
                <div className="forma-grid">
                  {FORME.filter(f => f.group === "PF").map(f => (
                    <div key={f.cod} className={`forma-radio ${addForma===f.cod?"on":""}`} onClick={() => setAddForma(f.cod)}>
                      <div className="fr-cod">{f.short}</div>
                      <div className="fr-label">{f.label}</div>
                    </div>
                  ))}
                </div>

                <div className="upload-zone">
                  <div className="uz-icon">📄</div>
                  <div className="uz-title">Certificat constatator / Document ONRC</div>
                  <div className="uz-sub">Click sau trage fișierul aici (PDF, max 10MB)</div>
                </div>

                <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><button className="btn-s" onClick={() => setShowAdd(false)}>Anulează</button><button className="btn-p" disabled>📤 Procesează și creează firma</button></div>
              </>)}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
