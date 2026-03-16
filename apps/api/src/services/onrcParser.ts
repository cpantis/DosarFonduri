/**
 * Section-based parser for native ONRC Certificat Constatator PDFs (2022+ format).
 *
 * Romanian ONRC certificates follow a standardized section-based format with
 * clear headers and "Cheie: Valoare" lines. This parser splits the text into
 * sections first, then extracts structured data from each section.
 *
 * Only scanned PDFs (where PyMuPDF can't extract text) need OCR + AI.
 */
import type { ExtractedCompanyData } from "./companyExtractor";

// ─── Helpers ────────────────────────────────────────────

/** Clean whitespace (collapse multiple spaces/newlines into one space) */
function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Extract value after a label like "Denumire: VALUE" or "Denumire VALUE" */
function extractAfterLabel(text: string, label: RegExp): string | undefined {
  const m = text.match(label);
  if (!m) return undefined;
  const rest = text.slice(m.index! + m[0].length);
  const line = rest.split("\n")[0]?.trim();
  return line || undefined;
}

/**
 * Parse a Romanian decimal number: "1.234.567,89" → 1234567.89
 * BUT "33.333333" (no thousands) → 33.333333 (preserves decimal)
 */
function parseRoNumber(s: string): number | undefined {
  if (!s) return undefined;
  let cleaned = s.trim();

  // Romanian format: dots as thousands separators, comma as decimal
  // "1.234.567,89" → remove dots, comma→dot
  if (cleaned.includes(",")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  }
  // If no comma but has dots: check if it's a decimal like "33.333333"
  // A thousands separator would be groups of 3: "1.000" or "1.234.567"
  // A decimal like "33.333333" has more than 3 digits after last dot
  else if (cleaned.includes(".")) {
    const parts = cleaned.split(".");
    const lastPart = parts[parts.length - 1];
    // If last segment after dot has exactly 3 digits AND there are multiple dot-separated groups,
    // it's thousands separator format. Otherwise it's a decimal number.
    if (parts.length >= 2 && parts.every((p, i) => i === 0 || p.length === 3)) {
      // Thousands separator format: "1.234.567" → "1234567"
      cleaned = parts.join("");
    }
    // else: it's a real decimal like "33.333333" — leave as-is
  }

  const n = parseFloat(cleaned);
  return isNaN(n) ? undefined : n;
}

/** Parse a Romanian date "DD.MM.YYYY" → "YYYY-MM-DD" */
function parseRoDate(s: string): string | undefined {
  const m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (!m) return undefined;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/** Map Romanian legal form text to code */
function mapFormaJuridica(text: string): string {
  const t = text.toUpperCase();
  if (/S\.?R\.?L\.?[\s-]*D/i.test(t)) return "SRL-D";
  if (/S\.?R\.?L\.?/i.test(t) || /RASPUNDERE\s+LIMITATA/i.test(t)) return "SRL";
  if (/S\.?A\.?\b/.test(t) && !/S\.?R\.?L/i.test(t)) return "SA";
  if (/P\.?F\.?A\.?/.test(t) || /PERSOANA\s+FIZICA\s+AUTORIZATA/i.test(t)) return "PFA";
  if (/I\.?I\.?\b/.test(t) && /INDIVIDUAL/i.test(t)) return "II";
  if (/I\.?F\.?\b/.test(t) && /FAMILIAL/i.test(t)) return "IF";
  if (/S\.?N\.?C\.?/.test(t)) return "SNC";
  if (/S\.?C\.?S\.?/.test(t)) return "SCS";
  if (/S\.?C\.?A\.?/.test(t)) return "SCA";
  if (/O\.?N\.?G|ASOCIA[TȚ]I[EA]|FUNDA[TȚ]I[EA]/i.test(t)) return "ONG";
  if (/R\.?A\.?\b/.test(t)) return "RA";
  return "SRL";
}

// ─── Section Splitting ──────────────────────────────────

/**
 * ONRC documents are divided by headers. We identify the major section
 * boundaries and split the text accordingly.
 */
const SECTION_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: "IDENTIFICARE", pattern: /INFORMA[ȚT]II DE IDENTIFICARE/i },
  { key: "SEDIU_SOCIAL", pattern: /^SEDIU SOCIAL$/im },
  { key: "CAPITAL_SOCIAL", pattern: /^CAPITAL SOCIAL$/im },
  { key: "NATURA_CAPITAL", pattern: /^NATUR[AĂ] CAPITAL$/im },
  { key: "ASOCIATI_PJ", pattern: /^ASOCIA[ȚT]I PERSOANE JURIDICE$/im },
  { key: "ASOCIATI_PF", pattern: /^ASOCIA[ȚT]I PERSOANE FIZICE$/im },
  { key: "REPREZENTANT_PJ", pattern: /REPREZENTANT\s+ac[tț]ionar.*PERSOAN[AĂ]\s+JURIDIC[AĂ]/im },
  { key: "ASOCIAT_COMUN_PF", pattern: /ASOCIAT.*de[tț]in[aă]torilor\s+[iî]n\s+comun.*PERSOAN[AĂ]\s+FIZIC[AĂ]/im },
  { key: "IMPUTERNICITI_PF", pattern: /Persoane\s+[iî]mputernicite\s+\(PERSOANE\s+FIZICE\)/i },
  { key: "IMPUTERNICITI_PJ", pattern: /Persoane\s+[iî]mputernicite\s+\(PERSOANE\s+JURIDICE\)/i },
  { key: "LICHIDATORI_PJ", pattern: /Administratori\s+judiciari.*Lichidatori/i },
  { key: "CURATOR", pattern: /^CURATOR/im },
  { key: "CENZORI_PJ", pattern: /Cenzori.*Auditori.*PERSOANE\s+JURIDICE/i },
  { key: "CENZORI_PF", pattern: /Cenzori.*Auditori.*PERSOANE\s+FIZICE/i },
  { key: "ACTIVITATE_PRINCIPALA", pattern: /Activitatea\s+principal[aă]/i },
  { key: "ACTIVITATI_SECUNDARE", pattern: /Activit[aă][tț]i\s+secundare/i },
  { key: "SEDII_SECUNDARE", pattern: /SEDII\s+SECUNDARE|SUCURSALE|PUNCTE?\s+DE\s+LUCRU/i },
  { key: "FILIALE", pattern: /^FILIALE\s*\//im },
  { key: "CONCORDAT", pattern: /^CONCORDAT\s+PREVENTIV$/im },
  { key: "ACORD_RESTRUCTURARE", pattern: /^ACORD\s+DE\s+RESTRUCTURARE$/im },
  { key: "DREPTURI_PROPRIETATE", pattern: /^DREPTURI\s+DE\s+PROPRIETATE$/im },
  { key: "FAPTE", pattern: /^FAPTE\s+AFLATE/im },
  { key: "MENTIUNI", pattern: /^MEN[ȚT]IUNI$/im },
  { key: "DATE_FINANCIARE", pattern: /Date\s+financiare|Situa[tț]i[ea]\s+financiar/i },
  { key: "DATA_CERTIFICAT", pattern: /Data\s+certificatului\s+constatator/i },
];

/** Remove ONRC watermark/footer/digital signature noise */
function cleanWatermarks(text: string): string {
  return text
    // Page footer: "Raport generat în data de 21.06.2024 : 13:18:30"
    .replace(/Raport generat [iî]n data de[^\n]*\n/g, "\n")
    // Page numbers: "1/15", "2/15", etc. on standalone lines (NOT J2/1981/2017)
    .replace(/^\d{1,2}\/\d{1,2}$/gm, "")
    // ONRC digital signature watermark (vertical text from PDF rendering)
    .replace(/OFICIUL\s*\n\s*NATIONAL\s*\n\s*AL\s*\n\s*REGISTRU\s*\n\s*LUI\s*\n\s*COMER[TȚ]U\s*\n\s*LUI\s*/gi, "")
    // Digitally signed block
    .replace(/Digitally signed by[\s\S]*?(?:Bucuresti|Location:[\s\S]*?\n)/gi, "")
    // "OFICIUL NATIONAL AL REGISTRULUI COMERTULUI" standalone lines (watermark fragments)
    .replace(/^OFICIUL$/gm, "")
    .replace(/^NATIONAL\s*AL$/gm, "")
    .replace(/^REGISTRULUI$/gm, "")
    .replace(/^COMERTULUI$/gm, "")
    .replace(/^NATIONAL$/gm, "")
    .replace(/^COMERTU$/gm, "")
    // Date/Reason/Location from digital signature
    .replace(/^Date:\s+\d{4}\.\d{2}\.\d{2}$/gm, "")
    .replace(/^\d{2}:\d{2}:\d{2}$/gm, "")
    .replace(/^Reason:\s+.*$/gm, "")
    .replace(/^Location:$/gm, "")
    .replace(/^Bucuresti$/gm, "")
    // Collapse multiple empty lines
    .replace(/\n{3,}/g, "\n\n");
}

interface Section {
  key: string;
  text: string;
}

function splitIntoSections(rawText: string): Section[] {
  const text = cleanWatermarks(rawText);
  const sections: Section[] = [];

  // Find all section positions
  const positions: Array<{ key: string; index: number }> = [];
  for (const sp of SECTION_PATTERNS) {
    const m = text.match(sp.pattern);
    if (m && m.index != null) {
      positions.push({ key: sp.key, index: m.index });
    }
  }

  // Sort by position
  positions.sort((a, b) => a.index - b.index);

  // Extract section text between boundaries
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].index;
    const end = i + 1 < positions.length ? positions[i + 1].index : text.length;
    sections.push({ key: positions[i].key, text: text.slice(start, end) });
  }

  // Also keep the header (before first section) for basic identification
  if (positions.length > 0) {
    sections.unshift({ key: "HEADER", text: text.slice(0, positions[0].index) });
  } else {
    sections.push({ key: "HEADER", text });
  }

  return sections;
}

function getSection(sections: Section[], key: string): string | undefined {
  return sections.find(s => s.key === key)?.text;
}

// ─── Per-Section Parsers ────────────────────────────────

function parseIdentification(text: string): Partial<ExtractedCompanyData> {
  const result: Partial<ExtractedCompanyData> = {};

  // Company name — ONRC puts it on its own line after "certifică informațiile referitoare la"
  // e.g. "certifică informațiile referitoare la \nANDA OANA AGRO FERMA S.R.L."
  const nameMatch = text.match(
    /certifică\s+informa[tț]iile\s+referitoare\s+la\s*\n\s*(.+?)(?:\n|$)/i
  );
  if (nameMatch) {
    result.denumire = clean(nameMatch[1]);
  } else {
    // Fallback: look for a line ending with legal form
    const fallbackName = text.match(
      /^([A-ZĂÂÎȘȚÉ][A-ZĂÂÎȘȚÉ0-9\s.,&'-]+(?:S\.?R\.?L\.?(?:-D)?|S\.?A\.?|P\.?F\.?A\.?)\.?)$/m
    );
    if (fallbackName) result.denumire = clean(fallbackName[1]);
  }

  // RegCom
  const regComMatch = text.match(
    /(?:Num[aă]r\s+de\s+ordine\s+[iî]n\s+Registrul\s+Comer[tț]ului|Nr\.\s*ordine\s*ORC)\s*:\s*(J\d{1,2}\/\d+\/\d{4})/i
  );
  if (regComMatch) result.regCom = regComMatch[1];
  else {
    const fallbackReg = text.match(/(J\d{1,2}\/\d+\/\d{4})/);
    if (fallbackReg) result.regCom = fallbackReg[1];
  }

  // Registration date (from which we derive anInfiintare)
  const atribuitMatch = text.match(/atribuit\s+[iî]n\s+data\s+de\s+(\d{1,2}\.\d{1,2}\.\d{4})/i);
  if (atribuitMatch) {
    const year = parseInt(atribuitMatch[1].split(".")[2]);
    if (year >= 1900 && year <= 2100) result.anInfiintare = year;
  }

  // EUID — format: "ROONRC.J2/1981/2017" (the dot and slash matter)
  const euidMatch = text.match(/(?:EUID|Identificator\s+Unic[^)]*\))\s*:?\s*(ROONRC[.\s]*J\d{1,2}[\s/]\d+[\s/]\d{4})/i);
  if (euidMatch) result.euid = clean(euidMatch[1]).replace(/\s+/g, "");

  // CUI
  const cuiMatch = text.match(/Cod\s+unic\s+de\s+[iî]nregistrare\s*:\s*(\d{2,10})/i);
  if (cuiMatch) result.cui = cuiMatch[1];

  // Certificate number and date
  const certMatch = text.match(
    /Certificat\s+de\s+[iî]nregistrare\s*:\s*([A-Z0-9]+)\s*,\s*emis\s+pe\s+data\s+de\s+(\d{1,2}\.\d{1,2}\.\d{4})/i
  );
  if (certMatch) {
    // Store for raw data; not a direct company field but useful
  }

  // Address
  const adresaMatch = text.match(/Adres[aă]\s+sediu\s+social\s*:\s*(.+?)(?:\n|$)/i);
  if (adresaMatch) {
    result.adresa = clean(adresaMatch[1]);
    parseAddressComponents(result.adresa, result);
  }

  // Phone — specifically look for company contacts, not the ONRC header phone
  // ONRC format: "Contacte sediu social: telefon: 0722226110"
  //           or "Contacte firmă: telefon: 0722226110"
  const telMatch = text.match(/Contacte\s+(?:sediu\s+social|firm[aă])\s*:\s*telefon\s*:\s*([\d\s+()-]+)/i);
  if (telMatch) result.telefon = clean(telMatch[1]);
  else {
    // Fallback: look after "Contacte" sections (skip first occurrence which is ONRC header)
    const contactLines = text.match(/Contacte\s+(?:sediu|firm)[^\n]*telefon\s*:\s*([\d\s+()-]+)/gi);
    if (contactLines && contactLines.length > 0) {
      const lastMatch = contactLines[contactLines.length - 1].match(/telefon\s*:\s*([\d\s+()-]+)/i);
      if (lastMatch) result.telefon = clean(lastMatch[1]);
    }
  }

  // Email
  const emailMatch = text.match(/(?:e-?mail|email)\s*:\s*([\w.+-]+@[\w.-]+\.\w{2,})/i);
  if (emailMatch) result.email = emailMatch[1];

  // Status
  const stareMatch = text.match(/Stare\s+firm[aă]\s*:\s*(.+?)(?:\n|$)/i);
  if (stareMatch) {
    const stareText = stareMatch[1].toLowerCase();
    result.stare = /radia|dizolv|lichidar/i.test(stareText) ? "radiata" : "functiune";
  }

  // Legal form
  const formaMatch = text.match(/Forma\s+de\s+organizare\s*:\s*(.+?)(?:\n|$)/i);
  if (formaMatch) {
    result.formaJuridica = mapFormaJuridica(formaMatch[1]);
  }

  // Duration
  const durataMatch = text.match(/Durat[aă]\s*:\s*(.+?)(?:[;\n]|$)/i);
  if (durataMatch) result.durata = clean(durataMatch[1]);

  // Last update date
  const lastUpdateMatch = text.match(/Data\s+ultimei\s+[iî]nregistr[aă]ri\s*:\s*(\d{1,2}\.\d{1,2}\.\d{4})/i);

  // anInfiintare fallback from regCom
  if (!result.anInfiintare && result.regCom) {
    const yearFromReg = result.regCom.match(/\/(\d{4})$/);
    if (yearFromReg) result.anInfiintare = parseInt(yearFromReg[1]);
  }

  return result;
}

function parseAddressComponents(adresa: string, result: Partial<ExtractedCompanyData>): void {
  // Județ
  const judetMatch = adresa.match(/Jude[tț]\s+([A-ZĂÂÎȘȚ][a-zăâîșțé]+(?:\s+[A-ZĂÂÎȘȚ][a-zăâîșțé]+)?)/i);
  if (judetMatch) result.judet = judetMatch[1].trim();

  // Localitate — try different patterns
  const locPatterns = [
    /(?:Mun(?:icipiul)?\.?\s*)([A-ZĂÂÎȘȚ][a-zăâîșțé]+(?:[\s-][A-ZĂÂÎȘȚÉ]?[a-zăâîșțé]+)*)/i,
    /(?:Ora[sș](?:ul)?\.?\s*)([A-ZĂÂÎȘȚ][a-zăâîșțé]+(?:[\s-][A-ZĂÂÎȘȚÉ]?[a-zăâîșțé]+)*)/i,
    /(?:Sat\s+)([A-ZĂÂÎȘȚ][a-zăâîșțé]+(?:[\s-][A-ZĂÂÎȘȚÉ]?[a-zăâîșțé]+)*)/i,
    /(?:Com(?:una)?\.?\s*)([A-ZĂÂÎȘȚ][a-zăâîșțé]+(?:[\s-][A-ZĂÂÎȘȚÉ]?[a-zăâîșțé]+)*)/i,
    /(?:Loc(?:alitatea)?\.?\s*)([A-ZĂÂÎȘȚ][a-zăâîșțé]+(?:[\s-][A-ZĂÂÎȘȚÉ]?[a-zăâîșțé]+)*)/i,
  ];
  for (const p of locPatterns) {
    const m = adresa.match(p);
    if (m) {
      result.localitate = m[1].trim();
      break;
    }
  }
}

function parseSediuSocial(text: string): { actSediu?: string; durataSediu?: string } {
  const actMatch = text.match(/Act\s+sediu\s*:\s*(.+?)(?:\n|$)/i);
  const durataMatch = text.match(/Durata\s+sediului\s*:\s*(.+?)(?:[.\n]|$)/i);
  return {
    actSediu: actMatch ? clean(actMatch[1]) : undefined,
    durataSediu: durataMatch ? clean(durataMatch[1]) : undefined,
  };
}

function parseCapitalSocial(text: string): Partial<ExtractedCompanyData> {
  const result: Partial<ExtractedCompanyData> = {};

  const capitalMatch = text.match(/Capital\s+social\s+subscris\s*:\s*([\d.,]+)\s*(LEI|RON|EUR|USD)?/i);
  if (capitalMatch) {
    result.capitalSocial = parseRoNumber(capitalMatch[1]);
    result.moneda = capitalMatch[2]?.toUpperCase() || "LEI";
  }

  const partiMatch = text.match(/Num[aă]r\s+p[aă]r[tț]i\s+sociale\s*:\s*(\d+)/i);
  if (partiMatch) result.partiSociale = parseInt(partiMatch[1]);

  // Valoare parte socială
  const valoareMatch = text.match(/Valoarea\s+unei\s+p[aă]r[tț]i\s+sociale\s*:\s*([\d.,]+)/i);

  return result;
}

function parseNaturaCapital(text: string): ExtractedCompanyData["naturaCapital"] | undefined {
  const result: { privatAutohton: number; privatStrain: number; stat: number } = {
    privatAutohton: 0, privatStrain: 0, stat: 0,
  };

  const autoMatch = text.match(/privat\s+autohton\s+([\d.,]+)%/i);
  if (autoMatch) result.privatAutohton = parseRoNumber(autoMatch[1]) || 0;

  const strainMatch = text.match(/privat\s+str[aă]in\s+([\d.,]+)%/i);
  if (strainMatch) result.privatStrain = parseRoNumber(strainMatch[1]) || 0;

  const statMatch = text.match(/(?:stat|integral\s+de\s+stat)\s+([\d.,]+)%/i);
  if (statMatch) result.stat = parseRoNumber(statMatch[1]) || 0;

  if (result.privatAutohton || result.privatStrain || result.stat) return result;
  return undefined;
}

/**
 * Parse a person block (asociat or administrator).
 * ONRC format is consistently:
 *   NAME IN CAPS
 *   Calitate: asociat
 *   Cetățenie: română
 *   Data și locul nașterii: 02.11.1999, Loc. Arad, Arad, România
 *   Sex: feminin
 *   Aport la capital: 100 LEI
 *   ...etc
 */
interface PersonBlock {
  name: string;
  calitate?: string;
  cetatenie?: string;
  dataNasterii?: string;
  locNastere?: string;
  sex?: string;
  stareCivila?: string;
  aportCapital?: number;
  aportVarsatTotal?: number;
  partiSociale?: number;
  cotaBeneficii?: number;
  cotaPierderi?: number;
  puteri?: string;
  dataNumirii?: string;
  dataExpirarii?: string;
  duratMandat?: string;
  cuiPJ?: string;
  regComPJ?: string;
  tara?: string;
  isPJ?: boolean;
}

function parsePersonBlocks(text: string): PersonBlock[] {
  const persons: PersonBlock[] = [];

  // Split on person name lines — all-caps lines that are actual names
  // In ONRC, person names are on standalone lines in ALL CAPS
  const lines = text.split("\n");
  let currentPerson: PersonBlock | null = null;

  // Skip section header line
  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^(?:ASOCIA[ȚT]I|Persoane|REPREZENTANT|Nu exist)/i.test(line)) {
      startIdx = i + 1;
      continue;
    }
    // Skip sub-headers like "conform codificarii..."
    if (/^conform\s+codific/i.test(line)) {
      startIdx = i + 1;
      continue;
    }
    break;
  }

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Skip noise
    if (/^Nu exist[aă]\s+[iî]nregistr[aă]ri/i.test(line)) continue;
    if (/^Raport generat/i.test(line)) continue;
    if (/^\d+\/\d+$/.test(line)) continue;

    // Detect a new person: ALL CAPS name (at least 2 words, min 5 chars)
    // Must not start with known label prefixes or be watermark text
    const isLabel = /^(Calitate|Cet[aă][tț]eni|Data\s+[sș]i|Sex|Stare|Aport|Num[aă]r|Cota|Puteri|Mandat|Temei|Dat[aă]\s+depunere|Dat[aă]\s+numirii|Dat[aă]\s+expir|Durat[aă]|Contacte|Conform|conform|Adres|Forma|Capital|Nr\.|Identificat|Certificat|Valoare|Activitat)/i.test(line);

    // Filter out ONRC watermark fragments that look like ALL CAPS names
    const isWatermark = /^(OFICIUL|NATIONAL|REGISTRULUI|COMERTULUI|COMERTU|REGISTRU|NATIONAL\s+AL)$/i.test(line);

    if (!isLabel && !isWatermark && /^[A-ZĂÂÎȘȚÉ][A-ZĂÂÎȘȚÉ\s.,'-]{4,}$/.test(line) && line.split(/\s+/).length >= 2) {
      // Save previous person
      if (currentPerson) persons.push(currentPerson);

      // Start new person
      currentPerson = { name: clean(line) };
      continue;
    }

    // Parse key:value pairs for current person
    if (!currentPerson) continue;

    const kvMatch = line.match(/^(.+?)\s*:\s*(.+)$/);
    if (!kvMatch) continue;

    const key = kvMatch[1].trim().toLowerCase();
    const val = kvMatch[2].trim();

    if (/calitate/i.test(key)) {
      currentPerson.calitate = val.toLowerCase();
    } else if (/cet[aă][tț]eni/i.test(key)) {
      currentPerson.cetatenie = val;
    } else if (/data\s+[sș]i\s+locul\s+na[sș]terii/i.test(key)) {
      // "02.11.1999, Loc. Arad, Arad, România"
      const dateMatch = val.match(/(\d{1,2}\.\d{1,2}\.\d{4})/);
      if (dateMatch) currentPerson.dataNasterii = parseRoDate(dateMatch[1]);
      const locMatch = val.match(/,\s*(?:Loc\.?\s+)?(.+)/);
      if (locMatch) currentPerson.locNastere = clean(locMatch[1]);
    } else if (/^sex$/i.test(key)) {
      currentPerson.sex = val.toLowerCase();
    } else if (/stare\s+civil/i.test(key)) {
      currentPerson.stareCivila = val.toLowerCase();
    } else if (/aport\s+la\s+capital/i.test(key)) {
      currentPerson.aportCapital = parseRoNumber(val.replace(/\s*LEI\s*/i, ""));
    } else if (/aport\s+v[aă]rsat\s+total/i.test(key)) {
      currentPerson.aportVarsatTotal = parseRoNumber(val.replace(/\s*LEI\s*/i, ""));
    } else if (/num[aă]r\s*p[aă]r[tț]i\s+sociale/i.test(key)) {
      currentPerson.partiSociale = parseInt(val);
    } else if (/cota\s+de\s+participare/i.test(key)) {
      // "33.333333% / 33.333333%"
      const pcts = val.match(/([\d.,]+)%\s*\/\s*([\d.,]+)%/);
      if (pcts) {
        currentPerson.cotaBeneficii = parseRoNumber(pcts[1]);
        currentPerson.cotaPierderi = parseRoNumber(pcts[2]);
      }
    } else if (/puteri/i.test(key)) {
      currentPerson.puteri = val;
    } else if (/data\s+numirii/i.test(key)) {
      currentPerson.dataNumirii = parseRoDate(val) || val;
    } else if (/data\s+expir[aă]rii/i.test(key)) {
      currentPerson.dataExpirarii = parseRoDate(val) || val;
    } else if (/durat[aă]\s+mandat/i.test(key)) {
      currentPerson.duratMandat = val;
    } else if (/cod\s+unic/i.test(key)) {
      currentPerson.cuiPJ = val;
      currentPerson.isPJ = true;
    } else if (/nr\.\s*ordine/i.test(key) || /reg.*com/i.test(key)) {
      currentPerson.regComPJ = val;
      currentPerson.isPJ = true;
    } else if (/[tț]ar[aă]/i.test(key)) {
      currentPerson.tara = val;
    }
  }

  // Push last person
  if (currentPerson) persons.push(currentPerson);

  return persons;
}

function parseCAEN(text: string): { cod: string; den: string } | undefined {
  // "0111 - Cultivarea cerealelor ..."
  const m = text.match(/(\d{4})\s*[-–—]\s*(.+?)(?:\n|$)/);
  if (m) return { cod: m[1], den: clean(m[2]) };
  return undefined;
}

function parseActivitatiSecundare(text: string): Array<{ cod: string; den: string }> {
  const results: Array<{ cod: string; den: string }> = [];
  // Only parse lines that look like "0112 - Cultivarea orezului"
  const lines = text.split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*(\d{4})\s*[-–—]\s*(.+)/);
    if (m) {
      results.push({ cod: m[1], den: clean(m[2]) });
    }
  }
  return results;
}

function parseSediiSecundare(text: string): Array<{ denumire: string; adresa: string }> {
  const results: Array<{ denumire: string; adresa: string }> = [];
  // Very simplified — ONRC format varies for secondary offices
  const blocks = text.split(/(?=Denumire\s*:|Sediu\s+secundar|Punct\s+de\s+lucru)/i);
  for (const block of blocks) {
    const denMatch = block.match(/(?:Denumire|Punct\s+de\s+lucru)\s*:\s*(.+?)(?:\n|$)/i);
    const adrMatch = block.match(/(?:Adres[aă]|Localitate)\s*:\s*(.+?)(?:\n|$)/i);
    if (denMatch || adrMatch) {
      results.push({
        denumire: denMatch ? clean(denMatch[1]) : "",
        adresa: adrMatch ? clean(adrMatch[1]) : "",
      });
    }
  }
  return results;
}

// ─── Main Parser ────────────────────────────────────────

export function parseOnrcText(text: string): ExtractedCompanyData | null {
  // Verify this looks like an ONRC document
  const isOnrc = /certificat\s+constatator|oficiul\s+(na[tț]ional|registrului)/i.test(text);
  if (!isOnrc) return null;

  const sections = splitIntoSections(text);

  // ─── Identification ───
  const headerText = (getSection(sections, "HEADER") || "") + "\n" + (getSection(sections, "IDENTIFICARE") || "");
  const ident = parseIdentification(headerText);

  // ─── Capital Social ───
  const capitalText = getSection(sections, "CAPITAL_SOCIAL") || "";
  const capitalData = parseCapitalSocial(capitalText);

  // ─── Natura Capital ───
  const naturaText = getSection(sections, "NATURA_CAPITAL") || "";
  const naturaCapital = parseNaturaCapital(naturaText);

  // ─── Asociați PF ───
  const asociatiPFText = getSection(sections, "ASOCIATI_PF") || "";
  const asociatiPFBlocks = parsePersonBlocks(asociatiPFText);

  // ─── Asociați PJ ───
  const asociatiPJText = getSection(sections, "ASOCIATI_PJ") || "";
  const asociatiPJBlocks = parsePersonBlocks(asociatiPJText);

  // ─── Administrators (Persoane împuternicite PF) ───
  const adminText = getSection(sections, "IMPUTERNICITI_PF") || "";
  const adminBlocks = parsePersonBlocks(adminText);

  // ─── CAEN principal ───
  const caenText = getSection(sections, "ACTIVITATE_PRINCIPALA") || "";
  const caenPrincipal = parseCAEN(caenText);

  // ─── Activități secundare ───
  const secText = getSection(sections, "ACTIVITATI_SECUNDARE") || "";
  const activitatiSecundare = parseActivitatiSecundare(secText);

  // ─── Sedii secundare ───
  const sediiText = getSection(sections, "SEDII_SECUNDARE") || "";
  const sediiSecundare = parseSediiSecundare(sediiText);

  // ─── Sediu Social details ───
  const sediuText = getSection(sections, "SEDIU_SOCIAL") || "";
  const sediuDetails = parseSediuSocial(sediuText);

  // ─── Build asociati array ───
  const asociati: ExtractedCompanyData["asociati"] = [];

  for (const p of asociatiPFBlocks) {
    asociati.push({
      type: "pf",
      name: p.name,
      role: p.calitate || "asociat",
      citizenship: p.cetatenie,
      contribution: p.aportCapital,
      shares: p.partiSociale,
      pctBenefits: p.cotaBeneficii,
      pctLosses: p.cotaPierderi,
      dataNasterii: p.dataNasterii,
      locNastere: p.locNastere,
      sex: p.sex,
      stareCivila: p.stareCivila,
      aportVarsatTotal: p.aportVarsatTotal,
    });
  }

  for (const p of asociatiPJBlocks) {
    asociati.push({
      type: "pj",
      name: p.name,
      role: p.calitate || "asociat",
      citizenship: p.tara,
      contribution: p.aportCapital,
      shares: p.partiSociale,
      pctBenefits: p.cotaBeneficii,
      pctLosses: p.cotaPierderi,
      cuiPJ: p.cuiPJ,
      regComPJ: p.regComPJ,
    });
  }

  // ─── Build administratori array ───
  const administratori: ExtractedCompanyData["administratori"] = [];

  for (const p of adminBlocks) {
    administratori.push({
      name: p.name,
      role: p.calitate || "administrator",
      powers: p.puteri,
      mandateDuration: p.duratMandat,
      appointmentDate: p.dataNumirii,
      expiryDate: p.dataExpirarii,
      citizenship: p.cetatenie,
      dataNasterii: p.dataNasterii,
      sex: p.sex,
    });
  }

  // ─── Financials from ONRC summary ───
  const finText = getSection(sections, "DATE_FINANCIARE") || "";
  const financials = parseFinancials(finText);

  // ─── Validate minimum data ───
  if (!ident.cui && !ident.denumire && !ident.regCom) {
    return null;
  }

  return {
    denumire: ident.denumire || "",
    cui: ident.cui || "",
    regCom: ident.regCom || "",
    euid: ident.euid,
    formaJuridica: ident.formaJuridica || "SRL",
    adresa: ident.adresa || "",
    localitate: ident.localitate || "",
    judet: ident.judet || "",
    telefon: ident.telefon,
    email: ident.email,
    stare: ident.stare || "functiune",
    durata: ident.durata || "nelimitată",
    anInfiintare: ident.anInfiintare || 0,
    capitalSocial: capitalData.capitalSocial,
    moneda: capitalData.moneda,
    partiSociale: capitalData.partiSociale,
    naturaCapital,
    asociati,
    administratori,
    financials,
    caenPrincipal: caenPrincipal?.cod,
    caenDesc: caenPrincipal?.den,
    activitatiSecundare: activitatiSecundare.length > 0 ? activitatiSecundare : undefined,
    sediiSecundare: sediiSecundare.length > 0 ? sediiSecundare : undefined,
    // Extra metadata for raw storage
    sediuSocial: sediuDetails.actSediu ? sediuDetails : undefined,
  } as ExtractedCompanyData;
}

function parseFinancials(text: string): ExtractedCompanyData["financials"] {
  const financials: ExtractedCompanyData["financials"] = [];
  if (!text || text.length < 20) return financials;

  // Look for year-based data
  const yearPattern = /(\d{4})\s/g;
  let m;
  const years = new Set<number>();
  while ((m = yearPattern.exec(text)) !== null) {
    const y = parseInt(m[1]);
    if (y >= 2000 && y <= 2030) years.add(y);
  }

  for (const year of years) {
    const yearSection = text.match(new RegExp(`${year}[\\s\\S]{0,500}`, "i"));
    if (yearSection) {
      const numbers = yearSection[0].match(/[\d.,]{3,}/g);
      if (numbers && numbers.length >= 2) {
        financials.push({
          year,
          cifraAfaceri: parseRoNumber(numbers[0]) || 0,
          profitBrut: parseRoNumber(numbers[1]) || 0,
          profitNet: parseRoNumber(numbers[2]) || 0,
          angajati: parseInt(numbers[3] || "0") || 0,
          capitaluriProprii: parseRoNumber(numbers[4]) || 0,
        });
      }
    }
  }

  return financials;
}
