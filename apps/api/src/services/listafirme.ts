/**
 * ListaFirme.ro API v2 — interogare date companie după CUI.
 *
 * Docs: https://listafirme.ro/specificatii/api-info-v2.asp
 *
 * Folosit de provider pentru a adăuga cabinete de consultanță.
 * NU depinde de organizationId (e la nivel de platformă).
 */
import { redis } from "../lib/redis";

const INFO_URL = "https://listafirme.ro/api/info-v2.asp";
const CACHE_TTL = 7 * 86400; // 7 zile

// ─── Tipuri răspuns ──────────────────────────────────────

export interface ListaFirmeCompany {
  // Identificare
  taxCode: string;
  name: string;
  regNo: string;
  status: string;
  legalForm: string;
  vat: string;

  // Activitate
  nace: string;
  naceDescription: string;
  naceSecondary: Array<{ cod: string; den: string }>;
  foundedDate: string;

  // Locație
  county: string;
  city: string;
  address: string;
  townCode: string;

  // Contact
  phone: string;
  email: string;
  web: string;

  // Financiar (ultimul an disponibil)
  turnover: number | null;
  profit: number | null;
  employees: number | null;

  // Stakeholders
  administrators: Array<{
    name: string;
    role: string;
    since: string;
  }>;
  shareholders: Array<{
    name: string;
    shares: string;
    value: string;
  }>;

  // Bilanț (ultimul an)
  balance: Record<string, any> | null;

  // Raw response complet
  raw: Record<string, any>;
}

// ─── Request builder ─────────────────────────────────────

/**
 * Construiește payload-ul `data` pentru info-v2.asp.
 * Fiecare câmp cu "" înseamnă "returnează valoarea".
 * Câmpurile omise nu se returnează (nu consumă credite).
 */
function buildInfoPayload(cui: string): Record<string, string> {
  return {
    TaxCode: cui,
    Name: "",
    RegNo: "",
    Status: "",
    LegalForm: "",
    VAT: "",
    NACE: "",
    NACEDescription: "",
    NACESecondary: "",
    Date: "",
    County: "",
    City: "",
    TownCode: "",
    Address: "",
    Phone: "",
    Email: "",
    Web: "",
    Turnover: "",
    Profit: "",
    Employees: "",
    Administrators: "",
    Shareholders: "",
    Balance: "latest",
  };
}

// ─── API call ────────────────────────────────────────────

export async function lookupCUI_ListaFirme(
  cui: string,
  apiKey?: string,
): Promise<ListaFirmeCompany | null> {
  const cleanCUI = cui.replace(/\D/g, "");
  if (!cleanCUI || cleanCUI.length < 2 || cleanCUI.length > 12) {
    throw new Error("CUI invalid — trebuie să fie între 2 și 12 cifre.");
  }

  const key = apiKey || process.env.LISTAFIRME_API_KEY;
  if (!key) {
    throw new Error("LISTAFIRME_API_KEY nu este configurat.");
  }

  // Check cache
  const cacheKey = `listafirme:${cleanCUI}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Build request
  const data = buildInfoPayload(cleanCUI);
  const body = `key=${encodeURIComponent(key)}&data=${encodeURIComponent(JSON.stringify(data))}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  let response: Response;
  try {
    response = await fetch(INFO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeout);
    const msg = err.name === "AbortError"
      ? "ListaFirme API timeout (15s)"
      : `ListaFirme API indisponibil: ${err.message}`;
    console.warn(`[listafirme] ${msg}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    console.warn(`[listafirme] HTTP ${response.status} for CUI ${cleanCUI}`);
    return null;
  }

  const raw = await response.json();

  // Error handling (API returnează tot 200)
  if (raw.error) {
    if (raw.error.includes("not found") || raw.error.includes("Invalid tax code")) {
      return null;
    }
    throw new Error(`ListaFirme API: ${raw.error}`);
  }

  const result = transformResponse(raw, cleanCUI);

  // Cache result
  await redis.set(cacheKey, JSON.stringify(result), "EX", CACHE_TTL);

  return result;
}

// ─── Transform ───────────────────────────────────────────

function transformResponse(raw: any, cui: string): ListaFirmeCompany {
  return {
    taxCode: raw.TaxCode || cui,
    name: raw.Name || "",
    regNo: raw.RegNo || "",
    status: raw.Status || "",
    legalForm: raw.LegalForm || "",
    vat: raw.VAT || "",

    nace: raw.NACE || "",
    naceDescription: raw.NACEDescription || raw.NACEDesc || "",
    naceSecondary: parseNACESecondary(raw.NACESecondary),
    foundedDate: raw.Date || "",

    county: raw.County || "",
    city: raw.City || "",
    address: raw.Address || "",
    townCode: raw.TownCode || "",

    phone: raw.Phone || "",
    email: raw.Email || "",
    web: raw.Web || "",

    turnover: parseFinancial(raw.Turnover) ?? 0,
    profit: parseFinancial(raw.Profit) ?? 0,
    employees: parseFinancial(raw.Employees) ?? 0,

    administrators: parseAdministrators(raw.Administrators),
    shareholders: parseShareholders(raw.Shareholders),

    balance: raw.Balance || null,

    raw,
  };
}

function parseFinancial(val: any): number | null {
  if (val === undefined || val === null || val === "") return null;
  const n = typeof val === "string" ? parseFloat(val.replace(/[^\d.-]/g, "")) : Number(val);
  return isNaN(n) ? null : n;
}

function parseNACESecondary(data: any): Array<{ cod: string; den: string }> {
  if (!data) return [];
  if (typeof data === "string") {
    // Format: "0111 - Description; 0112 - Description" or just "0111; 0112"
    return data.split(";").filter(Boolean).map(s => {
      const parts = s.trim().split(/\s*[-–]\s*/);
      return { cod: parts[0]?.trim() || "", den: parts.slice(1).join(" - ").trim() || "" };
    });
  }
  if (Array.isArray(data)) {
    return data.map((item: any) => {
      if (typeof item === "string") return { cod: item, den: "" };
      return { cod: item.Code || item.NACE || item.cod || "", den: item.Description || item.Name || item.den || "" };
    });
  }
  return [];
}

function parseAdministrators(data: any): Array<{ name: string; role: string; since: string }> {
  if (!data) return [];
  if (typeof data === "string") {
    // Unele răspunsuri vin ca string delimitat
    return data.split(";").filter(Boolean).map(s => ({
      name: s.trim(),
      role: "",
      since: "",
    }));
  }
  if (Array.isArray(data)) {
    return data.map((a: any) => ({
      name: a.Name || a.name || "",
      role: a.Role || a.role || a.Function || "",
      since: a.Since || a.since || a.Date || "",
    }));
  }
  return [];
}

function parseShareholders(data: any): Array<{ name: string; shares: string; value: string }> {
  if (!data) return [];
  if (typeof data === "string") {
    return data.split(";").filter(Boolean).map(s => ({
      name: s.trim(),
      shares: "",
      value: "",
    }));
  }
  if (Array.isArray(data)) {
    return data.map((s: any) => ({
      name: s.Name || s.name || "",
      shares: s.Shares || s.shares || s.Parts || "",
      value: s.Value || s.value || "",
    }));
  }
  return [];
}

// ─── Search (bonus) ──────────────────────────────────────

const SEARCH_URL = "https://listafirme.ro/api/search-v2.asp";

export interface ListaFirmeSearchResult {
  name: string;
  fiscalCode: string;
  county: string;
  url: string;
}

export async function searchCompany_ListaFirme(
  query: string,
  apiKey?: string,
): Promise<ListaFirmeSearchResult[]> {
  const key = apiKey || process.env.LISTAFIRME_API_KEY;
  if (!key) throw new Error("LISTAFIRME_API_KEY nu este configurat.");

  const body = `key=${encodeURIComponent(key)}&src=${encodeURIComponent(query)}`;

  const response = await fetch(SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) throw new Error(`ListaFirme Search HTTP ${response.status}`);

  const raw = await response.json();
  if (raw.error) throw new Error(`ListaFirme Search: ${raw.error}`);

  return (raw.Results || []).map((r: any) => ({
    name: r.Name || "",
    fiscalCode: r.FiscalCode || "",
    county: r.County || "",
    url: r.URL || "",
  }));
}
