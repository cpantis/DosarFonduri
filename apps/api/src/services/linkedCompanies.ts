/**
 * Linked Companies Analysis Service
 *
 * Discovers and analyzes companies connected through shared associates/administrators.
 * Uses ListaFirme API v2 for company data and search.
 * Zero AI — pure algorithmic risk scoring.
 */
import { db } from "../db";
import {
  companies, companyAssociates, companyAdministrators, companyLinkedCompanies,
} from "../db/schema";
import { eq, and } from "drizzle-orm";
import { lookupCUI_ListaFirme, searchCompany_ListaFirme } from "./listafirme";

// ─── RISK SCORING ───

interface RiskResult {
  score: number;
  flags: string[];
}

function calculateRisk(
  person: { name: string; role?: string; shares?: string },
  mainCompany: { county?: string; nace?: string },
  linkedCompany: {
    status?: string;
    nace?: string;
    county?: string;
    turnover?: number | null;
    shareholders?: Array<{ name: string; shares: string }>;
  },
): RiskResult {
  let score = 0;
  const flags: string[] = [];

  // Same person in both companies
  score += 30;
  flags.push("Aceeași persoană în ambele firme");

  // Linked company has agricultural NACE (01xx)
  const nace = linkedCompany.nace || "";
  if (nace.startsWith("01")) {
    score += 20;
    flags.push(`Firmă legată cu activitate agricolă (CAEN ${nace})`);
  }

  // Linked company has active turnover (not dormant)
  if (linkedCompany.turnover && linkedCompany.turnover > 0) {
    score += 10;
    flags.push("Firmă legată activă cu cifră de afaceri");
  }

  // Same county (risk of shared land)
  if (mainCompany.county && linkedCompany.county && mainCompany.county === linkedCompany.county) {
    score += 15;
    flags.push("Același județ — posibil terenuri adiacente");
  }

  // Person is sole shareholder in linked company (full control)
  if (linkedCompany.shareholders) {
    for (const sh of linkedCompany.shareholders) {
      if (sh.name.toLowerCase() === person.name.toLowerCase() && (sh.shares === "100" || sh.shares === "100.00")) {
        score += 20;
        flags.push("Asociat unic în firma legată — control total");
        break;
      }
    }
  }

  // Same NACE as main company (same sector)
  if (mainCompany.nace && nace && mainCompany.nace === nace) {
    score += 15;
    flags.push("Același cod CAEN — concurență directă sau potențial condiții artificiale");
  }

  // Linked company inactive/dissolved
  const status = (linkedCompany.status || "").toLowerCase();
  if (status.includes("radiat") || status.includes("dizolv") || status.includes("lichid")) {
    score -= 10; // lower risk if company is dead
    flags.push("Firmă legată inactivă/radiată");
  }

  return { score: Math.max(0, score), flags };
}

// ─── MAIN ANALYSIS ───

export interface LinkedCompanyResult {
  personName: string;
  personRoleMain: string | null;
  personSharesMain: string | null;
  linkedCui: string;
  linkedName: string;
  linkedStatus: string | null;
  linkedNace: string | null;
  linkedNaceDescription: string | null;
  linkedCounty: string | null;
  linkedTurnover: number | null;
  linkedProfit: number | null;
  linkedEmployees: number | null;
  personRoleLinked: string | null;
  personSharesLinked: string | null;
  riskScore: number;
  riskFlags: string[];
}

export interface AnalysisResult {
  links: LinkedCompanyResult[];
  totalRisk: number;
  personsChecked: number;
  companiesFound: number;
  creditsUsed: number;
}

export async function analyzeLinkedCompanies(
  companyId: string,
  organizationId: string,
): Promise<AnalysisResult> {
  // 1. Load main company
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
  });
  if (!company) throw new Error("Firma nu a fost găsită");

  // 2. Load associates + administrators
  const associates = await db.query.companyAssociates.findMany({
    where: eq(companyAssociates.companyId, companyId),
  });
  const admins = await db.query.companyAdministrators.findMany({
    where: eq(companyAdministrators.companyId, companyId),
  });

  // Build unique persons list
  const personsMap = new Map<string, { name: string; role: string; shares: string | undefined }>();
  for (const a of associates) {
    const key = a.name.toLowerCase().trim();
    if (!personsMap.has(key)) {
      personsMap.set(key, { name: a.name, role: a.role || "asociat", shares: a.pctBenefits ? String(a.pctBenefits) : undefined });
    }
  }
  for (const a of admins) {
    const key = a.name.toLowerCase().trim();
    if (!personsMap.has(key)) {
      personsMap.set(key, { name: a.name, role: a.role || "administrator", shares: undefined });
    }
  }

  const persons = Array.from(personsMap.values());
  if (persons.length === 0) {
    return { links: [], totalRisk: 0, personsChecked: 0, companiesFound: 0, creditsUsed: 0 };
  }

  // 3. Search for each person's other companies
  const links: LinkedCompanyResult[] = [];
  const seenCuis = new Set<string>();
  seenCuis.add(company.cui || ""); // exclude main company
  let creditsUsed = 0;

  for (const person of persons) {
    try {
      // Search ListaFirme by person name (as admin/shareholder)
      const searchResults = await searchCompany_ListaFirme(person.name, organizationId);
      creditsUsed++; // 1 credit per search

      for (const result of searchResults) {
        if (!result.fiscalCode || seenCuis.has(result.fiscalCode)) continue;
        seenCuis.add(result.fiscalCode);

        try {
          // Get full company info
          const linkedInfo = await lookupCUI_ListaFirme(result.fiscalCode, organizationId);
          creditsUsed++; // 1 credit per info lookup

          if (!linkedInfo) continue;

          // Find person's role in linked company
          let roleInLinked: string | null = null;
          let sharesInLinked: string | null = null;

          for (const admin of linkedInfo.administrators || []) {
            if (admin.name.toLowerCase().trim() === person.name.toLowerCase().trim()) {
              roleInLinked = admin.role || "administrator";
              break;
            }
          }
          for (const sh of linkedInfo.shareholders || []) {
            if (sh.name.toLowerCase().trim() === person.name.toLowerCase().trim()) {
              sharesInLinked = sh.shares || null;
              if (!roleInLinked) roleInLinked = "asociat";
              break;
            }
          }

          // Only include if person is actually connected
          if (!roleInLinked && !sharesInLinked) continue;

          // Calculate risk
          const risk = calculateRisk(
            person,
            { county: company.judet || undefined, nace: company.caen || undefined },
            {
              status: linkedInfo.status,
              nace: linkedInfo.nace,
              county: linkedInfo.county,
              turnover: linkedInfo.turnover,
              shareholders: linkedInfo.shareholders?.map(s => ({ name: s.name, shares: s.shares })),
            },
          );

          links.push({
            personName: person.name,
            personRoleMain: person.role,
            personSharesMain: person.shares,
            linkedCui: linkedInfo.taxCode,
            linkedName: linkedInfo.name,
            linkedStatus: linkedInfo.status,
            linkedNace: linkedInfo.nace,
            linkedNaceDescription: linkedInfo.naceDescription,
            linkedCounty: linkedInfo.county,
            linkedTurnover: linkedInfo.turnover,
            linkedProfit: linkedInfo.profit,
            linkedEmployees: linkedInfo.employees,
            personRoleLinked: roleInLinked,
            personSharesLinked: sharesInLinked,
            riskScore: risk.score,
            riskFlags: risk.flags,
          });
        } catch (err: any) {
          console.warn(`[linkedCompanies] Failed to lookup ${result.fiscalCode}:`, err.message);
        }
      }
    } catch (err: any) {
      console.warn(`[linkedCompanies] Failed to search for "${person.name}":`, err.message);
    }
  }

  // 4. Save results to DB
  // Delete previous results (for re-check)
  await db.delete(companyLinkedCompanies).where(
    and(
      eq(companyLinkedCompanies.companyId, companyId),
      eq(companyLinkedCompanies.source, "listafirme"),
    ),
  );

  if (links.length > 0) {
    await db.insert(companyLinkedCompanies).values(
      links.map(l => ({
        companyId,
        organizationId,
        linkedCui: l.linkedCui,
        linkedName: l.linkedName,
        linkedStatus: l.linkedStatus,
        linkedNace: l.linkedNace,
        linkedNaceDescription: l.linkedNaceDescription,
        linkedCounty: l.linkedCounty,
        linkedTurnover: l.linkedTurnover ? String(l.linkedTurnover) : null,
        linkedProfit: l.linkedProfit ? String(l.linkedProfit) : null,
        linkedEmployees: l.linkedEmployees,
        personName: l.personName,
        personRoleMain: l.personRoleMain,
        personSharesMain: l.personSharesMain,
        personRoleLinked: l.personRoleLinked,
        personSharesLinked: l.personSharesLinked,
        riskScore: l.riskScore,
        riskFlags: l.riskFlags,
        source: "listafirme",
      })),
    );
  }

  // 5. Update companyElements summary
  const { populateCompanyElements } = await import("./companyElements");
  await populateCompanyElements(companyId, organizationId);

  const totalRisk = links.length > 0 ? Math.max(...links.map(l => l.riskScore)) : 0;

  console.log(`[linkedCompanies] ${company.denumire}: ${links.length} firme legate, ${persons.length} persoane verificate, ${creditsUsed} credite, risk=${totalRisk}`);

  return {
    links,
    totalRisk,
    personsChecked: persons.length,
    companiesFound: links.length,
    creditsUsed,
  };
}
