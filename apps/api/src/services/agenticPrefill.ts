/**
 * Agentic Element Prefill — uses Claude Sonnet to semantically map
 * company data (ONRC, financials, associates, administrators) to
 * element definitions extracted from guides/annexes.
 *
 * Replaces the old hardcoded alias approach with AI-powered mapping
 * that understands semantic equivalence (e.g. "CUI" = "cod_fiscal" = "cod_unic").
 */
import { db } from "../db";
import {
  projectElements, elementDefinitions, companyAssociates,
  companyAdministrators, companyFinancials,
} from "../db/schema";
import { eq, inArray } from "drizzle-orm";
import { anthropic, withAILimit } from "../lib/anthropic";
import { logAIUsage } from "./aiUsage";

const SONNET_MODEL = "claude-sonnet-4-6";

// ─── SYSTEM PROMPT ───

const MAPPING_SYSTEM = `Ești expert în fonduri europene și date de companii din România.

Primești:
1. DATELE FIRMEI — un JSON structurat cu toate informațiile cunoscute despre o firmă (din ONRC, bilanțuri ANAF, asociați, administratori)
2. ELEMENTELE NECESARE — lista de elemente (câmpuri) definite în ghidul de finanțare, fiecare cu key, displayName, category, dataType, unit

SARCINA TA: Mapează fiecare element la valoarea corespunzătoare din datele firmei.

REGULI:
- Mapează SEMANTIC, nu doar pe nume identice. Exemple:
  - "cod_unic_inregistrare" din ghid = "cui" din firmă
  - "cifra_de_afaceri_neta" din ghid = "cifraAfaceriNeta" din financiare
  - "numar_mediu_salariati" din ghid = "numarMediuSalariati" din F30
  - "reprezentant_legal" din ghid = primul administrator
  - "vechime_societate" = calculat din anInfiintare
- Dacă un element are date din mai mulți ani (ex: cifra afaceri 2022, 2023, 2024), mapează-l pe anul corespunzător dacă elementul specifică anul, sau pe cel mai recent dacă nu specifică
- Pentru elemente calculate (ex: "vechime_firma"), calculează valoarea din datele disponibile
- Pentru elemente de tip enum, verifică dacă valoarea se potrivește cu enumValues
- NU inventa date. Dacă nu există o corespondență clară, NU mapa elementul
- Fii conservator: e mai bine să lași un element gol decât să-l completezi greșit

RĂSPUNDE cu un JSON array (fără backticks, fără explicații):
[
  {
    "elementDefId": "uuid-ul elementului din lista primită",
    "value": "valoarea extrasă/calculată ca string",
    "source": "onrc|onrc_auto|anaf_auto|calculated",
    "confidence": 0.95
  }
]

source poate fi:
- "onrc" — dat direct din câmpurile ONRC (denumire, CUI, adresa, etc.)
- "onrc_auto" — derivat din datele ONRC (nr asociați, asociat majoritar, etc.)
- "anaf_auto" — din bilanțuri/declarații financiare
- "calculated" — calculat din datele disponibile (vechime, rate, medii)

Returnează DOAR elementele pentru care ai găsit o corespondență clară (confidence ≥ 0.8).`;

// ─── BUILD COMPANY PROFILE ───

interface CompanyProfile {
  company: Record<string, any>;
  associates: Record<string, any>[];
  administrators: Record<string, any>[];
  financials: Record<string, any>[];
}

async function buildCompanyProfile(company: any): Promise<CompanyProfile> {
  const associates = await db.query.companyAssociates.findMany({
    where: eq(companyAssociates.companyId, company.id),
  });

  const admins = await db.query.companyAdministrators.findMany({
    where: eq(companyAdministrators.companyId, company.id),
  });

  const fins = await db.query.companyFinancials.findMany({
    where: eq(companyFinancials.companyId, company.id),
    orderBy: (f, { desc: d }) => [d(f.year)],
    limit: 3,
  });

  return {
    company: {
      denumire: company.denumire,
      cui: company.cui,
      regCom: company.regCom,
      adresa: company.adresa,
      localitate: company.localitate,
      judet: company.judet,
      codPostal: company.codPostal,
      telefon: company.telefon,
      email: company.email,
      website: company.website,
      formaJuridica: company.formaJuridica,
      anInfiintare: company.anInfiintare,
      capitalSocial: company.capitalSocial,
      moneda: company.moneda,
      partiSociale: company.partiSociale,
      actiuni: company.actiuni,
      valoareParte: company.valoareParte,
      valoareActiune: company.valoareActiune,
      stare: company.stare,
      durata: company.durata,
      caen: company.caen,
      euid: company.euid,
      reprezentantIF: company.reprezentantIF,
      anCurent: new Date().getFullYear(),
    },
    associates: associates.map(a => ({
      name: a.name,
      type: a.type,
      citizenshipOrCountry: a.citizenshipOrCountry,
      contribution: a.contribution,
      shares: a.shares,
      pctBenefits: a.pctBenefits,
      pctLosses: a.pctLosses,
    })),
    administrators: admins.map(a => ({
      name: a.name,
      role: a.role,
      powers: a.powers,
      mandateDuration: a.mandateDuration,
    })),
    financials: fins.map(f => ({
      year: f.year,
      source: f.source,
      f10: f.f10,
      f20: f.f20,
      f30: f.f30,
      f40: f.f40,
    })),
  };
}

// ─── BUILD ELEMENT LIST ───

interface ElementForMapping {
  id: string;
  elementKey: string;
  displayName: string;
  category: string;
  dataType: string;
  unit: string | null;
  enumValues: string[] | null;
  required: boolean;
}

async function getProjectElementDefs(projectId: string): Promise<{
  elements: ElementForMapping[];
  projectElementMap: Map<string, string>; // elementDefId → projectElementId
}> {
  const projElements = await db.query.projectElements.findMany({
    where: eq(projectElements.projectId, projectId),
  });

  const elemDefIds = projElements.map(e => e.elementDefId).filter(Boolean) as string[];
  if (elemDefIds.length === 0) return { elements: [], projectElementMap: new Map() };

  const elemDefs = await db.query.elementDefinitions.findMany({
    where: inArray(elementDefinitions.id, elemDefIds),
  });

  const projectElementMap = new Map<string, string>();
  for (const pe of projElements) {
    if (pe.elementDefId) {
      projectElementMap.set(pe.elementDefId, pe.id);
    }
  }

  // Also track which already have values (to skip)
  const hasValue = new Set<string>();
  for (const pe of projElements) {
    if (pe.elementDefId && pe.value && pe.value.trim()) {
      hasValue.add(pe.elementDefId);
    }
  }

  const elements: ElementForMapping[] = elemDefs
    .filter(ed => !hasValue.has(ed.id)) // skip elements that already have values
    .map(ed => ({
      id: ed.id,
      elementKey: ed.elementKey,
      displayName: ed.displayName,
      category: ed.category,
      dataType: ed.dataType,
      unit: ed.unit,
      enumValues: ed.enumValues,
      required: ed.required,
    }));

  return { elements, projectElementMap };
}

// ─── AGENTIC PREFILL ───

interface MappingResult {
  elementDefId: string;
  value: string;
  source: "onrc" | "onrc_auto" | "anaf_auto" | "calculated";
  confidence: number;
}

export async function agenticPrefillFromCompany(
  projectId: string,
  company: any,
  organizationId: string,
): Promise<{ updated: number; total: number }> {
  // 1. Build company profile
  const profile = await buildCompanyProfile(company);

  // 2. Get element definitions that need values
  const { elements, projectElementMap } = await getProjectElementDefs(projectId);

  if (elements.length === 0) {
    console.log(`[agenticPrefill] Proiect ${projectId}: 0 elemente goale, skip`);
    return { updated: 0, total: 0 };
  }

  // 3. Call Sonnet for semantic mapping
  const userPrompt = `DATELE FIRMEI:
${JSON.stringify(profile, null, 2)}

ELEMENTELE NECESARE (${elements.length} elemente fără valoare):
${JSON.stringify(elements, null, 2)}

Mapează datele firmei la elementele de mai sus. Returnează DOAR un JSON array.`;

  let mappings: MappingResult[] = [];

  try {
    const response = await withAILimit(() => anthropic.messages.create({
      model: SONNET_MODEL,
      max_tokens: 4096,
      system: MAPPING_SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
    }));

    const content = response.content?.[0]?.type === "text" ? response.content[0].text : "[]";
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    await logAIUsage({
      organizationId,
      projectId,
      agent: "ghid_rules",
      model: SONNET_MODEL,
      tokensInput: response.usage.input_tokens,
      tokensOutput: response.usage.output_tokens,
      action: "agentic_prefill_company",
    });

    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        mappings = parsed.filter(m =>
          m.elementDefId && m.value && typeof m.confidence === "number" && m.confidence >= 0.8
        );
      }
    } catch {
      console.error("[agenticPrefill] Failed to parse AI response");
    }
  } catch (err: any) {
    console.error("[agenticPrefill] AI call failed:", err.message);
    // Fallback to hardcoded mapping
    return fallbackPrefillFromCompany(projectId, company, profile);
  }

  // 4. Apply mappings
  const validElementDefIds = new Set(elements.map(e => e.id));
  let updatedCount = 0;

  for (const mapping of mappings) {
    if (!validElementDefIds.has(mapping.elementDefId)) continue;

    const projectElementId = projectElementMap.get(mapping.elementDefId);
    if (!projectElementId) continue;

    const source = (["onrc", "onrc_auto", "anaf_auto", "calculated"] as const).includes(mapping.source as any)
      ? mapping.source
      : "onrc";

    // Official sources (ONRC, ANAF) are auto-confirmed — no need for manual review
    const isOfficialSource = source === "onrc" || source === "onrc_auto" || source === "anaf_auto";

    await db.update(projectElements).set({
      value: String(mapping.value),
      source: source as any,
      confirmed: isOfficialSource,
      validationStatus: isOfficialSource ? "valid" as const : "pending" as const,
    }).where(eq(projectElements.id, projectElementId));

    updatedCount++;
  }

  console.log(`[agenticPrefill] Proiect ${projectId}: ${updatedCount}/${elements.length} elemente pre-completate din ${mappings.length} mapări AI (${mappings.length - updatedCount} ignorate)`);
  return { updated: updatedCount, total: elements.length };
}

// ─── FALLBACK: Hardcoded mapping (used when AI fails) ───

async function fallbackPrefillFromCompany(
  projectId: string,
  company: any,
  profile: CompanyProfile,
): Promise<{ updated: number; total: number }> {
  console.log(`[agenticPrefill] Fallback to hardcoded mapping for project ${projectId}`);

  const projElements = await db.query.projectElements.findMany({
    where: eq(projectElements.projectId, projectId),
  });

  const elemDefIds = projElements.map(e => e.elementDefId).filter(Boolean) as string[];
  const tmplElIds = projElements.map(e => e.templateElementId).filter(Boolean) as string[];

  const elemDefs = elemDefIds.length > 0
    ? await db.query.elementDefinitions.findMany({ where: inArray(elementDefinitions.id, elemDefIds) })
    : [];
  const elemDefMap = new Map(elemDefs.map(ed => [ed.id, ed]));

  // Import templateElements only for fallback
  const { templateElements: tmplElTable } = await import("../db/schema");
  const tmplEls = tmplElIds.length > 0
    ? await db.query.templateElements.findMany({ where: inArray(tmplElTable.id, tmplElIds) })
    : [];
  const tmplElMap = new Map(tmplEls.map(te => [te.id, te]));

  const keyToElement = new Map<string, typeof projElements[number]>();
  for (const el of projElements) {
    const elemDef = el.elementDefId ? elemDefMap.get(el.elementDefId) : null;
    const tmplEl = el.templateElementId ? tmplElMap.get(el.templateElementId) : null;
    const key = elemDef?.elementKey || tmplEl?.key;
    if (key) keyToElement.set(key.toLowerCase(), el);
  }

  // Build hardcoded values (same as old prefillFromCompany)
  const values: Record<string, { value: string; source: "onrc" | "onrc_auto" | "anaf_auto" | "calculated" }> = {};

  const companyFields: Array<[string[], string | undefined | null]> = [
    [["denumire_firma", "denumire", "nume_firma", "nume_solicitant", "beneficiar"], company.denumire],
    [["cui", "cod_unic", "cod_fiscal", "cif"], company.cui],
    [["nr_reg_comert", "nr_inregistrare", "reg_com", "j_nr"], company.regCom],
    [["adresa_sediu", "adresa", "sediu_social", "adresa_sediu_social"], company.adresa],
    [["localitate", "localitate_sediu", "oras"], company.localitate],
    [["judet", "judet_sediu"], company.judet],
    [["cod_postal"], company.codPostal],
    [["telefon", "telefon_firma", "nr_telefon"], company.telefon],
    [["email", "email_firma", "adresa_email"], company.email],
    [["website", "site_web", "pagina_web"], company.website],
    [["forma_juridica", "tip_firma", "tip_entitate"], company.formaJuridica],
    [["an_infiintare", "an_constituire", "data_infiintare"], company.anInfiintare?.toString()],
    [["capital_social", "capital_social_subscris"], company.capitalSocial?.toString()],
    [["cod_caen", "caen", "caen_principal", "cod_caen_principal"], company.caen],
  ];

  for (const [keys, val] of companyFields) {
    if (!val) continue;
    for (const key of keys) {
      values[key] = { value: String(val), source: "onrc" };
    }
  }

  if (company.anInfiintare) {
    const vechime = new Date().getFullYear() - company.anInfiintare;
    values["vechime_firma"] = { value: String(vechime), source: "calculated" };
  }

  if (profile.associates.length > 0) {
    values["numar_asociati"] = { value: String(profile.associates.length), source: "onrc_auto" };
  }

  if (profile.administrators.length > 0) {
    values["numar_administratori"] = { value: String(profile.administrators.length), source: "onrc_auto" };
    if (profile.administrators[0]) {
      values["reprezentant_legal"] = { value: profile.administrators[0].name, source: "onrc_auto" };
    }
  }

  for (const fin of profile.financials) {
    const y = fin.year;
    const f20 = (fin.f20 || {}) as Record<string, any>;
    const f10 = (fin.f10 || {}) as Record<string, any>;
    const f30 = (fin.f30 || {}) as Record<string, any>;

    if (f20.cifraAfaceriNeta) values[`cifra_afaceri_${y}`] = { value: String(f20.cifraAfaceriNeta), source: "anaf_auto" };
    if (f20.profitNet) values[`profit_net_${y}`] = { value: String(f20.profitNet), source: "anaf_auto" };
    if (f30.numarMediuSalariati) values[`numar_salariati_${y}`] = { value: String(f30.numarMediuSalariati), source: "anaf_auto" };
    if (f10.capitaluriProprii) values[`capitaluri_proprii_${y}`] = { value: String(f10.capitaluriProprii), source: "anaf_auto" };
  }

  let updatedCount = 0;
  for (const [key, { value, source }] of Object.entries(values)) {
    const el = keyToElement.get(key.toLowerCase());
    if (!el) continue;
    if (el.value && el.value.trim()) continue;

    const isOfficialSource = source === "onrc" || source === "onrc_auto" || source === "anaf_auto";
    await db.update(projectElements).set({
      value,
      source,
      confirmed: isOfficialSource,
      validationStatus: isOfficialSource ? "valid" as const : "pending" as const,
    }).where(eq(projectElements.id, el.id));
    updatedCount++;
  }

  console.log(`[agenticPrefill/fallback] Proiect ${projectId}: ${updatedCount} elemente pre-completate (hardcoded)`);
  return { updated: updatedCount, total: projElements.length };
}
