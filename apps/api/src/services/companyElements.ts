import { db } from "../db";
import {
  companies, companyElements, companyAssociates,
  companyAdministrators, companyFinancials,
} from "../db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Populate (upsert) company_elements from ONRC data + financials.
 * Called after every company creation, ONRC sync, ONRC upload, or bilanț upload.
 * Each element is a simple key/value pair with source tracking.
 */
export async function populateCompanyElements(
  companyId: string,
  organizationId: string,
): Promise<void> {
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
  });
  if (!company) return;

  const associates = await db.query.companyAssociates.findMany({
    where: eq(companyAssociates.companyId, companyId),
  });

  const admins = await db.query.companyAdministrators.findMany({
    where: eq(companyAdministrators.companyId, companyId),
  });

  const financials = await db.query.companyFinancials.findMany({
    where: eq(companyFinancials.companyId, companyId),
    orderBy: (f, { desc }) => [desc(f.year)],
  });

  // Build elements map: key → { value, source }
  const elements: Array<{ key: string; value: string; source: "onrc" | "onrc_auto" | "anaf_auto" | "calculated" }> = [];

  const add = (key: string, value: any, source: "onrc" | "onrc_auto" | "anaf_auto" | "calculated" = "onrc") => {
    if (value === null || value === undefined || String(value).trim() === "") return;
    elements.push({ key, value: String(value), source });
  };

  // === ONRC / company direct fields ===
  add("denumire", company.denumire);
  add("cui", company.cui);
  add("cod_unic_inregistrare", company.cui); // alias
  add("reg_com", company.regCom);
  add("numar_registru_comert", company.regCom); // alias
  add("euid", company.euid);
  add("forma_juridica", company.formaJuridica);
  add("stare", company.stare);
  add("adresa", company.adresa);
  add("adresa_sediu", company.adresa); // alias
  add("localitate", company.localitate);
  add("judet", company.judet);
  add("cod_postal", company.codPostal);
  add("telefon", company.telefon);
  add("email", company.email);
  add("website", company.website);
  add("cod_caen", company.caen);
  add("caen_principal", company.caen); // alias
  add("durata", company.durata);
  add("an_infiintare", company.anInfiintare);
  add("data_infiintare", company.anInfiintare); // alias (year only)
  add("capital_social", company.capitalSocial);
  add("moneda", company.moneda);
  add("parti_sociale", company.partiSociale);
  add("actiuni", company.actiuni);
  add("valoare_parte", company.valoareParte);
  add("valoare_actiune", company.valoareActiune);

  // === Calculated fields ===
  if (company.anInfiintare) {
    const vechime = new Date().getFullYear() - company.anInfiintare;
    add("vechime_ani", vechime, "calculated");
    add("vechime_firma", vechime, "calculated"); // alias
  }

  // === Associates ===
  const asociatiPF = associates.filter(a => a.type === "pf");
  const asociatiPJ = associates.filter(a => a.type === "pj");
  add("numar_asociati", associates.length, "calculated");
  add("numar_asociati_pf", asociatiPF.length, "calculated");
  add("numar_asociati_pj", asociatiPJ.length, "calculated");

  // First PF associate as "asociat_unic" if only one
  if (asociatiPF.length === 1) {
    add("asociat_unic", asociatiPF[0].name, "onrc");
  }

  // === Administrators ===
  if (admins.length > 0) {
    add("reprezentant_legal", admins[0].name, "onrc");
    add("administrator", admins[0].name, "onrc"); // alias
    add("functie_administrator", admins[0].role, "onrc");
    add("numar_administratori", admins.length, "calculated");
  }

  // === Associates detailed ===
  if (associates.length > 0) {
    // Find majority shareholder (highest pctBenefits or shares)
    let maxPct = 0;
    let maxName = "";
    let hasStranger = false;
    for (const a of associates) {
      const pct = parseFloat(String(a.pctBenefits || 0));
      if (pct > maxPct) { maxPct = pct; maxName = a.name; }
      const country = (a.citizenshipOrCountry || "").toLowerCase();
      if (country && country !== "romania" && country !== "română" && country !== "ro" && country !== "roman") {
        hasStranger = true;
      }
    }
    if (maxPct > 0) {
      add("asociat_majoritar_pct", maxPct, "calculated");
      add("asociat_majoritar_nume", maxName, "onrc");
    }
    add("are_asociat_strain", hasStranger ? "da" : "nu", "calculated");
  }

  // === Administrators detailed ===
  if (admins.length > 0 && admins[0].appointmentDate) {
    add("data_numire_administrator", admins[0].appointmentDate, "onrc");
  }

  // === ONRC raw data extras ===
  const raw = (company.onrcRawData || {}) as Record<string, any>;
  if (raw.caenDesc) add("caen_descriere", raw.caenDesc, "onrc");

  // CAEN secundare — expose as comma-separated list of codes
  if (raw.activitatiSecundare?.length > 0) {
    add("numar_activitati_secundare", raw.activitatiSecundare.length, "calculated");
    const caenCodes = raw.activitatiSecundare
      .map((a: any) => typeof a === "string" ? a : a.cod || a.code || "")
      .filter(Boolean);
    if (caenCodes.length > 0) {
      add("cod_caen_secundare", caenCodes.join(","), "onrc");
    }
  }

  // TVA status
  if (raw.vat || raw.VAT) {
    const vatStr = String(raw.vat || raw.VAT || "");
    add("cod_tva", vatStr, "onrc");
    add("platitor_tva", vatStr && vatStr !== "false" && vatStr !== "0" ? "da" : "nu", "onrc");
  } else {
    add("platitor_tva", "nu", "calculated");
  }

  // Natura capital (ownership structure)
  const natura = (company.naturaCapital || {}) as Record<string, any>;
  if (natura.privatAutohton != null) add("capital_privat_autohton_pct", natura.privatAutohton, "onrc");
  if (natura.privatStrain != null) add("capital_privat_strain_pct", natura.privatStrain, "onrc");
  if (natura.stat != null) add("capital_stat_pct", natura.stat, "onrc");

  // Sedii secundare
  if (raw.sediiSecundare?.length > 0) {
    add("numar_sedii_secundare", raw.sediiSecundare.length, "calculated");
    // Extract unique judete from addresses
    const judete = new Set<string>();
    for (const sediu of raw.sediiSecundare) {
      const addr = typeof sediu === "string" ? sediu : sediu.adresa || sediu.denumire || "";
      // Try to extract judet from address (common patterns: "jud. Cluj", "Jud.CLUJ", etc.)
      const judetMatch = addr.match(/jud[.eț]*\s*([A-ZĂÂÎȘȚa-zăâîșț\s-]+)/i);
      if (judetMatch) judete.add(judetMatch[1].trim());
    }
    if (judete.size > 0) add("judete_sedii_secundare", Array.from(judete).join(","), "calculated");
  } else {
    add("numar_sedii_secundare", 0, "calculated");
  }

  // Status flags
  add("insolventa", raw.insolventa ? "da" : "nu", "onrc");
  add("dizolvare", raw.dizolvare ? "da" : "nu", "onrc");
  add("lichidare", raw.lichidare ? "da" : "nu", "onrc");
  add("restrictii", raw.restrictii ? "da" : "nu", "onrc");

  // === Financial data (latest year + all years for trend) ===
  if (financials.length > 0) {
    const latest = financials[0]; // most recent year (desc order)
    const f20 = (latest.f20 || {}) as Record<string, any>;
    const f10 = (latest.f10 || {}) as Record<string, any>;
    const f30 = (latest.f30 || {}) as Record<string, any>;
    const finSource = latest.source === "anaf_upload" ? "anaf_auto" as const : "onrc" as const;

    add("an_financiar", latest.year, finSource);
    add("cifra_afaceri", f20.cifraAfaceriNeta, finSource);
    add("cifra_afaceri_neta", f20.cifraAfaceriNeta, finSource); // alias
    add("profit_net", f20.profitNet, finSource);
    add("profit_brut", f20.profitBrut, finSource);
    add("angajati", f30.numarMediuSalariati, finSource);
    add("numar_mediu_salariati", f30.numarMediuSalariati, finSource); // alias
    add("capitaluri_proprii", f10.capitaluriProprii, finSource);
    add("active_imobilizate", f10.activeImobilizate?.total, finSource);
    add("active_circulante", f10.activeCirculante?.total, finSource);

    // Extended balance sheet fields
    if (f10.activeCirculante?.stocuri) add("stocuri", f10.activeCirculante.stocuri, finSource);
    if (f10.activeCirculante?.creante) add("creante", f10.activeCirculante.creante, finSource);
    if (f10.activeCirculante?.casa != null) add("casa_si_conturi", f10.activeCirculante.casa, finSource);
    if (f10.datoriiPesteAnul) add("datorii_peste_1an", f10.datoriiPesteAnul, finSource);

    // P&L extended fields
    if (f20.venituriExploatare) add("venituri_exploatare", f20.venituriExploatare, finSource);
    if (f20.cheltuieliExploatare) add("cheltuieli_exploatare", f20.cheltuieliExploatare, finSource);
    if (f20.rezultatExploatare) add("rezultat_exploatare", f20.rezultatExploatare, finSource);
    if (f20.cheltuieliPersonal) add("cheltuieli_personal", f20.cheltuieliPersonal, finSource);

    // Per-year financials (for multi-year rules)
    for (const fin of financials) {
      const yr = fin.year;
      const yf20 = (fin.f20 || {}) as Record<string, any>;
      const yf10 = (fin.f10 || {}) as Record<string, any>;
      const yf30 = (fin.f30 || {}) as Record<string, any>;
      const ySrc = fin.source === "anaf_upload" ? "anaf_auto" as const : "onrc" as const;

      add(`cifra_afaceri_${yr}`, yf20.cifraAfaceriNeta, ySrc);
      add(`profit_net_${yr}`, yf20.profitNet, ySrc);
      add(`angajati_${yr}`, yf30.numarMediuSalariati, ySrc);
      add(`capitaluri_proprii_${yr}`, yf10.capitaluriProprii, ySrc);
    }

    // Derived financial fields
    const ca = parseFloat(String(f20.cifraAfaceriNeta || 0));
    const emp = parseInt(String(f30.numarMediuSalariati || 0));
    const profitNet = parseFloat(String(f20.profitNet || 0));
    const capitaluriProprii = parseFloat(String(f10.capitaluriProprii || 0));
    const activeImob = parseFloat(String(f10.activeImobilizate?.total || 0));
    const activeCirc = parseFloat(String(f10.activeCirculante?.total || 0));
    const activeTotale = activeImob + activeCirc;
    const datoriiTotale = parseFloat(String(f10.datoriiTotal || 0));
    const datoriiSub1An = parseFloat(String(f10.datoriiSub1An || f10.datoriiCurente || 0));

    add("active_totale", activeTotale > 0 ? activeTotale : null, "calculated");
    add("datorii_totale", datoriiTotale > 0 ? datoriiTotale : null, "calculated");
    add("datorii_sub_1an", datoriiSub1An > 0 ? datoriiSub1An : null, "calculated");

    // Financial ratios
    if (capitaluriProprii > 0 && datoriiTotale > 0) {
      add("grad_indatorare", Math.round((datoriiTotale / capitaluriProprii) * 100) / 100, "calculated");
    }
    if (datoriiSub1An > 0 && activeCirc > 0) {
      add("lichiditate_curenta", Math.round((activeCirc / datoriiSub1An) * 100) / 100, "calculated");
    }
    if (activeTotale > 0 && capitaluriProprii > 0) {
      add("solvabilitate", Math.round((capitaluriProprii / activeTotale) * 100) / 100, "calculated");
    }
    if (ca > 0 && profitNet !== 0) {
      add("rentabilitate", Math.round((profitNet / ca) * 100) / 100, "calculated");
    }

    // IMM classification (EU definition)
    if (emp < 10 && ca < 2000000) {
      add("clasificare_imm", "micro", "calculated");
    } else if (emp < 50 && ca < 10000000) {
      add("clasificare_imm", "mica", "calculated");
    } else if (emp < 250 && ca < 50000000) {
      add("clasificare_imm", "mijlocie", "calculated");
    } else {
      add("clasificare_imm", "mare", "calculated");
    }
  }

  // === Upsert all elements ===
  if (elements.length === 0) return;

  // Delete existing and re-insert (atomic)
  await db.transaction(async (tx) => {
    await tx.delete(companyElements).where(eq(companyElements.companyId, companyId));
    await tx.insert(companyElements).values(
      elements.map(e => ({
        companyId,
        organizationId,
        elementKey: e.key,
        value: e.value,
        source: e.source,
      }))
    );
  });
}

/**
 * Build a flat companyData record from company_elements.
 * Returns a simple key→value map, ready for rule evaluation.
 */
export async function getCompanyDataFromElements(
  companyId: string,
): Promise<Record<string, any>> {
  const elements = await db.query.companyElements.findMany({
    where: eq(companyElements.companyId, companyId),
  });

  const data: Record<string, any> = {};
  for (const el of elements) {
    // Auto-coerce numbers
    const num = parseFloat(el.value || "");
    data[el.elementKey] = !isNaN(num) && el.value === String(num) ? num : el.value;
  }
  return data;
}
