/**
 * Regex-based parser for native ONRC Certificat Constatator PDFs.
 *
 * Romanian ONRC certificates follow a standardized format. When the PDF
 * contains searchable text (native, not scanned), we parse it directly
 * with regex — no AI call needed. This is faster, cheaper, and more reliable.
 *
 * Only scanned PDFs (where PyMuPDF can't extract text) need OCR + AI.
 */
import type { ExtractedCompanyData } from "./companyExtractor";

// ─── Helpers ────────────────────────────────────────────

/** Clean whitespace, normalize Romanian diacritics variants */
function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Extract first regex match group */
function extract(text: string, pattern: RegExp): string | undefined {
  const m = text.match(pattern);
  return m?.[1]?.trim() || undefined;
}

/** Extract a number from text */
function extractNum(text: string, pattern: RegExp): number | undefined {
  const s = extract(text, pattern);
  if (!s) return undefined;
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? undefined : n;
}

/** Map Romanian legal form text to code */
function mapFormaJuridica(text: string): string {
  const t = text.toUpperCase();
  if (/S\.?R\.?L\.?[\s-]?D?/.test(t)) return t.includes("DEBUTANT") ? "SRL-D" : "SRL";
  if (/S\.?A\.?\b/.test(t) && !t.includes("S.R.L")) return "SA";
  if (/P\.?F\.?A\.?/.test(t)) return "PFA";
  if (/I\.?I\.?\b/.test(t) && t.includes("INDIVIDUAL")) return "II";
  if (/I\.?F\.?\b/.test(t) && t.includes("FAMILIAL")) return "IF";
  if (/S\.?N\.?C\.?/.test(t)) return "SNC";
  if (/S\.?C\.?S\.?/.test(t)) return "SCS";
  if (/S\.?C\.?A\.?/.test(t)) return "SCA";
  if (/O\.?N\.?G|ASOCIA[TȚ]I[EA]|FUNDA[TȚ]I[EA]/.test(t)) return "ONG";
  if (/R\.?A\.?\b/.test(t)) return "RA";
  return "SRL"; // default
}

// ─── Main parser ────────────────────────────────────────

export function parseOnrcText(text: string): ExtractedCompanyData | null {
  // Verify this looks like an ONRC document
  const isOnrc = /certificat\s+constatator|oficiul\s+(na[tț]ional|registrului)/i.test(text);
  if (!isOnrc) return null;

  // ─── Company name ───
  const denumire = extract(text,
    /(?:Firma|Denumire(?:a)?|Societatea|Numele)\s*[:/.]?\s*(.+?)(?:\n|$)/i
  ) || extract(text,
    /(?:cu\s+denumirea|sub\s+denumirea)\s*[:/.]?\s*(.+?)(?:\n|$)/i
  );

  // ─── CUI ───
  const cuiRaw = extract(text,
    /(?:C\.?U\.?I\.?|Cod\s+unic|Cod\s+de\s+[iî]nregistrare|Cod\s+fiscal)\s*[:/.]?\s*(?:RO)?\s*(\d{2,10})/i
  );
  const cui = cuiRaw?.replace(/^RO/i, "");

  // ─── Reg Com ───
  const regCom = extract(text,
    /(?:Nr\.?\s*(?:de\s+)?(?:ordine\s+)?[îi]n\s+Registrul\s+Comer[tț]ului|(?:J|Reg\.?\s*Com\.?))\s*[:/.]?\s*(J\d{1,2}\/\d+\/\d{4})/i
  ) || extract(text,
    /(J\d{1,2}\/\d+\/\d{4})/
  );

  // ─── EUID ───
  const euid = extract(text, /EUID\s*[:/.]?\s*(ROONRC[.\s]*J\d{1,2}[./]\d+[./]\d{4})/i);

  // ─── Legal form ───
  const formaJuridicaText = extract(text,
    /(?:Forma\s+(?:juridic[aă]|de\s+organizare)|Forma\s+legal[aă])\s*[:/.]?\s*(.+?)(?:\n|$)/i
  );
  const formaJuridica = formaJuridicaText ? mapFormaJuridica(formaJuridicaText) : "SRL";

  // ─── Address ───
  const adresaBlock = extract(text,
    /(?:Sediul?\s+social|Adresa\s+sediu(?:lui)?)\s*[:/.]?\s*([\s\S]+?)(?=\n\s*(?:Durata|Capital|Forma|Telefon|Email|Nr\.?\s*de|Obiect|Cod\s+CAEN|Activitat))/i
  );
  let adresa = "", localitate = "", judet = "";
  if (adresaBlock) {
    const cleaned = clean(adresaBlock);
    adresa = cleaned;

    // Try to extract judet
    const judetMatch = cleaned.match(/(?:jud(?:e[tț]ul)?|jud\.)\s*([A-ZĂÂÎȘȚ][a-zăâîșț]+(?:\s+[A-ZĂÂÎȘȚ][a-zăâîșț]+)?)/i);
    if (judetMatch) judet = judetMatch[1].trim();

    // Try to extract localitate
    const locMatch = cleaned.match(/(?:mun(?:icipiul)?|ora[sș](?:ul)?|com(?:una)?|sat(?:ul)?|loc(?:alitatea)?)\s*\.?\s*([A-ZĂÂÎȘȚ][a-zăâîșț]+(?:[\s-][A-ZĂÂÎȘȚ]?[a-zăâîșț]+)*)/i);
    if (locMatch) localitate = locMatch[1].trim();
  }

  // ─── Phone / Email ───
  const telefon = extract(text, /(?:Telefon|Tel\.?)\s*[:/.]?\s*([\d\s+()-]{7,20})/i);
  const email = extract(text, /(?:Email|E-mail|Adresa?\s+e-?mail)\s*[:/.]?\s*([\w.+-]+@[\w.-]+\.\w{2,})/i);

  // ─── Status ───
  const stareText = extract(text,
    /(?:Stare(?:a)?\s+firm[aă]|Stare|Situa[tț]ia\s+firmei)\s*[:/.]?\s*(.+?)(?:\n|$)/i
  );
  const stare = stareText && /radia|dizolv/i.test(stareText) ? "radiata" : "functiune";

  // ─── Duration ───
  const durataText = extract(text,
    /(?:Durata\s+(?:de\s+)?(?:func[tț]ionare|societ[aă][tț]ii))\s*[:/.]?\s*(.+?)(?:\n|$)/i
  );
  const durata = durataText || "nelimitată";

  // ─── Year of establishment ───
  const anInfiintare = extractNum(text,
    /(?:Data\s+[îi]nfiin[tț][aă]rii|[ÎI]nfiin[tț]at[aă]?\s+[îi]n|Anul\s+[îi]nfiin[tț][aă]rii|[îi]nmatriculat[aă]?\s+la\s+data)\s*[:/.]?\s*(?:\d{1,2}[./-]\d{1,2}[./-])?(\d{4})/i
  ) || (() => {
    // Try from regCom (J20/333/1992 → 1992)
    const m = regCom?.match(/\/(\d{4})$/);
    return m ? parseInt(m[1]) : undefined;
  })();

  // ─── Capital social ───
  const capitalSocial = extractNum(text,
    /(?:Capital\s+social\s*(?:subscris\s*(?:[sș]i\s*)?v[aă]rsat)?)\s*[:/.]?\s*([\d.,]+)\s*(?:LEI|RON)?/i
  );
  const moneda = extract(text, /Capital\s+social[\s\S]{0,50}?(LEI|RON|EUR|USD)/i) || "LEI";
  const partiSociale = extractNum(text,
    /(?:p[aă]r[tț]i\s+sociale|nr\.?\s*(?:de\s+)?p[aă]r[tț]i)\s*[:/.]?\s*(\d+)/i
  );

  // ─── CAEN ───
  const caenMatch = text.match(
    /(?:Domeniu(?:l)?\s+(?:principal|de\s+activitate)|Activitate(?:a)?\s+principal[aă]|Obiect(?:ul)?\s+(?:principal|de\s+activitate)|Cod\s+CAEN\s*(?:principal)?)\s*[:/.]?\s*(\d{4})\s*[-–—]?\s*(.+?)(?:\n|$)/i
  );
  const caenPrincipal = caenMatch?.[1];
  const caenDesc = caenMatch?.[2]?.trim();

  // ─── Secondary activities ───
  const activitatiSecundare: Array<{ cod: string; den: string }> = [];
  const secBlock = text.match(
    /(?:Activit[aă][tț]i\s+secundare|Alte\s+activit[aă][tț]i|CAEN\s+secundar)[\s\S]*?(?=\n\s*(?:Capital|Asocia[tț]|Administrator|Sedii|Men[tț]iuni|$))/i
  );
  if (secBlock) {
    const re = /(\d{4})\s*[-–—]\s*(.+?)(?:\n|$)/g;
    let m;
    while ((m = re.exec(secBlock[0])) !== null) {
      activitatiSecundare.push({ cod: m[1], den: m[2].trim() });
    }
  }

  // ─── Associates ───
  const asociati: ExtractedCompanyData["asociati"] = [];
  const assocBlock = text.match(
    /(?:Asocia[tț]i|Ac[tț]ionar|Fondatori)[\s\S]*?(?=\n\s*(?:Administrator|Organ(?:ul)?|Capital|Men[tț]iuni|Obiect|$))/i
  );
  if (assocBlock) {
    // Pattern: Name + citizenship/nationality + contribution + shares + %
    const lines = assocBlock[0].split("\n");
    let current: any = null;
    for (const line of lines) {
      const nameMatch = line.match(/^[-–•]?\s*([A-ZĂÂÎȘȚ][A-ZĂÂÎȘȚ\s-]{3,}(?:\s+[A-ZĂÂÎȘȚ][A-ZĂÂÎȘȚ\s-]+)*)/);
      if (nameMatch && !/asocia[tț]|ac[tț]ionar|fondator/i.test(nameMatch[1])) {
        if (current) asociati.push(current);
        current = {
          type: "pf" as const,
          name: clean(nameMatch[1]),
          role: /unic/i.test(line) ? "asociat unic" : "asociat",
        };
        // Check if it's a legal entity (PJ)
        if (/S\.?R\.?L|S\.?A\.?|S\.?C\.?|persoana\s+juridic/i.test(line)) {
          current.type = "pj";
        }
      }
      if (current) {
        const contrib = line.match(/(?:aport|contribu[tț]ie)\s*[:/.]?\s*([\d.,]+)/i);
        if (contrib) current.contribution = parseFloat(contrib[1].replace(/\./g, "").replace(",", "."));
        const shares = line.match(/(\d+)\s*p[aă]r[tț]i/i);
        if (shares) current.shares = parseInt(shares[1]);
        const pct = line.match(/([\d.,]+)\s*%/);
        if (pct) {
          const val = parseFloat(pct[1].replace(",", "."));
          current.pctBenefits = val;
          current.pctLosses = val;
        }
        const citizen = line.match(/(?:cet[aă][tț]eni[ea]|na[tț]ionalitate)\s*[:/.]?\s*(\w+)/i);
        if (citizen) current.citizenship = citizen[1];
      }
    }
    if (current) asociati.push(current);
  }

  // ─── Administrators ───
  const administratori: ExtractedCompanyData["administratori"] = [];
  const adminBlock = text.match(
    /(?:Administrator|Organ(?:ul)?\s+de\s+administrare|Conducere)[\s\S]*?(?=\n\s*(?:Durata|Sedii|Men[tț]iuni|Asocia[tț]i|Capital|Activit|Obiect|$))/i
  );
  if (adminBlock) {
    const lines = adminBlock[0].split("\n");
    for (const line of lines) {
      const nameMatch = line.match(/^[-–•]?\s*([A-ZĂÂÎȘȚ][A-ZĂÂÎȘȚ\s-]{3,}(?:\s+[A-ZĂÂÎȘȚ][A-ZĂÂÎȘȚ\s-]+)*)/);
      if (nameMatch && !/administrator|organ|conducere/i.test(nameMatch[1])) {
        const admin: any = {
          name: clean(nameMatch[1]),
          role: "administrator",
        };
        if (/depline|nelimitat/i.test(line)) admin.powers = "DEPLINE";
        if (/limitat/i.test(line) && !/nelimitat/i.test(line)) admin.powers = "LIMITATE";
        const mandate = line.match(/(?:mandat|durat[aă])\s*[:/.]?\s*(.+?)(?:\n|$)/i);
        if (mandate) admin.mandateDuration = mandate[1].trim();
        administratori.push(admin);
      }
    }
  }

  // ─── Financials (from ONRC summary section) ───
  const financials: ExtractedCompanyData["financials"] = [];
  const finBlock = text.match(
    /(?:Date\s+financiare|Situa[tț]i[ea]\s+financiar|Bilan[tț])[\s\S]*?(?=\n\s*(?:Asocia[tț]|Administrator|Sedii|Men[tț]iuni|$))/i
  );
  if (finBlock) {
    // Look for year-based rows
    const yearPattern = /(\d{4})\s/g;
    let m;
    const years = new Set<number>();
    while ((m = yearPattern.exec(finBlock[0])) !== null) {
      const y = parseInt(m[1]);
      if (y >= 2000 && y <= 2030) years.add(y);
    }
    // Simplified: extract any financial figures we can find per year
    for (const year of years) {
      const yearSection = finBlock[0].match(new RegExp(`${year}[\\s\\S]{0,500}`, "i"));
      if (yearSection) {
        const numbers = yearSection[0].match(/[\d.,]{3,}/g);
        if (numbers && numbers.length >= 2) {
          financials.push({
            year,
            cifraAfaceri: parseFloat(numbers[0]?.replace(/\./g, "").replace(",", ".")) || 0,
            profitBrut: parseFloat(numbers[1]?.replace(/\./g, "").replace(",", ".")) || 0,
            profitNet: parseFloat(numbers[2]?.replace(/\./g, "").replace(",", ".")) || 0,
            angajati: parseInt(numbers[3] || "0") || 0,
            capitaluriProprii: parseFloat(numbers[4]?.replace(/\./g, "").replace(",", ".")) || 0,
          });
        }
      }
    }
  }

  // ─── Validate minimum data ───
  if (!cui && !denumire && !regCom) {
    return null; // Not enough data extracted
  }

  return {
    denumire: denumire || "",
    cui: cui || "",
    regCom: regCom || "",
    euid,
    formaJuridica,
    adresa,
    localitate,
    judet,
    telefon,
    email,
    stare,
    durata,
    anInfiintare: anInfiintare || 0,
    capitalSocial,
    moneda,
    partiSociale,
    asociati,
    administratori,
    financials,
    caenPrincipal,
    caenDesc,
    activitatiSecundare: activitatiSecundare.length > 0 ? activitatiSecundare : undefined,
  };
}
