import { db } from "../db";
import {
  companies, companyElements, companyAssociates,
  companyAdministrators, companyFinancials, projects,
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
  add("reg_com", company.regCom);
  add("euid", company.euid);
  add("forma_juridica", company.formaJuridica);
  add("stare", company.stare);
  add("adresa", company.adresa);
  add("localitate", company.localitate);
  add("judet", company.judet);
  add("cod_postal", company.codPostal);
  add("telefon", company.telefon);
  add("email", company.email);
  add("website", company.website);
  add("cod_caen", company.caen);
  add("durata", company.durata);
  add("an_infiintare", company.anInfiintare);
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
    add("profit_net", f20.profitNet, finSource);
    add("profit_brut", f20.profitBrut, finSource);
    add("angajati", f30.numarMediuSalariati, finSource);
    if (f30.numarEfectivSalariati) add("angajati_efectiv", f30.numarEfectivSalariati, finSource);
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
    // Parser-ul returnează "profitExploatare" (= rezultat exploatare)
    if (f20.rezultatExploatare || f20.profitExploatare) {
      add("rezultat_exploatare", f20.rezultatExploatare || f20.profitExploatare, finSource);
    }
    if (f20.cheltuieliPersonal) add("cheltuieli_personal", f20.cheltuieliPersonal, finSource);
    if (f20.cheltuieliMatPrim) add("cheltuieli_materii_prime", f20.cheltuieliMatPrim, finSource);
    if (f20.impozitProfit) add("impozit_profit", f20.impozitProfit, finSource);
    if (f20.venituriTotale) add("venituri_totale", f20.venituriTotale, finSource);
    if (f20.cheltuieliTotale) add("cheltuieli_totale", f20.cheltuieliTotale, finSource);

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
      // Extended per-year fields for trend analysis
      const yrActiveImob = parseFloat(String(yf10.activeImobilizate?.total || 0));
      const yrActiveCirc = parseFloat(String(yf10.activeCirculante?.total || 0));
      if (yrActiveImob + yrActiveCirc > 0) add(`active_totale_${yr}`, yrActiveImob + yrActiveCirc, "calculated");
      if (yf20.profitBrut != null) add(`profit_brut_${yr}`, yf20.profitBrut, ySrc);
      const yrRezExpl = yf20.rezultatExploatare ?? yf20.profitExploatare;
      if (yrRezExpl != null) add(`rezultat_exploatare_${yr}`, yrRezExpl, ySrc);
    }

    // ─── DERIVED FINANCIAL FIELDS (specialist financiar) ───
    // ONLY calculate if we have actual data (not defaults)
    const hasCa = f20.cifraAfaceriNeta != null && f20.cifraAfaceriNeta !== "";
    const hasEmp = f30.numarMediuSalariati != null && f30.numarMediuSalariati !== "";
    const hasProfitNet = f20.profitNet != null && f20.profitNet !== "";
    const hasProfitBrut = f20.profitBrut != null && f20.profitBrut !== "";
    const hasCapProprii = f10.capitaluriProprii != null && f10.capitaluriProprii !== "";
    const hasActiveImob = f10.activeImobilizate?.total != null;
    const hasActiveCirc = f10.activeCirculante?.total != null;

    const ca = hasCa ? parseFloat(String(f20.cifraAfaceriNeta)) : 0;
    const emp = hasEmp ? parseInt(String(f30.numarMediuSalariati)) : 0;
    const profitNet = hasProfitNet ? parseFloat(String(f20.profitNet)) : 0;
    const profitBrut = hasProfitBrut ? parseFloat(String(f20.profitBrut)) : 0;
    const capitaluriProprii = hasCapProprii ? parseFloat(String(f10.capitaluriProprii)) : 0;
    const activeImob = hasActiveImob ? parseFloat(String(f10.activeImobilizate.total)) : 0;
    const activeCirc = hasActiveCirc ? parseFloat(String(f10.activeCirculante.total)) : 0;
    const activeTotale = activeImob + activeCirc;

    // Datorii — calculăm corect din sub-componente dacă totalul lipsește
    const datoriiSub1An = parseFloat(String(f10.datoriiSubAnul || f10.datoriiSub1An || f10.datoriiCurente || 0));
    const datoriiPeste1An = parseFloat(String(f10.datoriiPesteAnul || 0));
    const datoriiTotale = f10.datoriiTotal
      ? parseFloat(String(f10.datoriiTotal))
      : datoriiSub1An + datoriiPeste1An;

    if (activeTotale > 0) add("active_totale", activeTotale, "calculated");
    if (datoriiTotale > 0) add("datorii_totale", datoriiTotale, "calculated");
    if (datoriiSub1An > 0) add("datorii_sub_1an", datoriiSub1An, "calculated");

    // ─── Capital detaliat (din F10) ───
    if (f10.capital?.subscrisVarsat != null) add("capital_subscris_varsat", f10.capital.subscrisVarsat, finSource);
    if (f10.capital?.rezerve != null) add("rezerve", f10.capital.rezerve, finSource);
    if (f10.capital?.profitReportat != null) add("profit_reportat", f10.capital.profitReportat, finSource);
    if (f10.capital?.profitExercitiu != null) add("profit_exercitiu", f10.capital.profitExercitiu, finSource);
    if (f10.cheltuieliAvans != null) add("cheltuieli_in_avans", f10.cheltuieliAvans, finSource);
    if (f10.venituriAvans != null) add("venituri_in_avans", f10.venituriAvans, finSource);

    // ─── Rezultat exploatare — calculat dacă lipsește ───
    // Parser-ul returnează "profitExploatare" — same thing
    const venituriExpl = parseFloat(String(f20.venituriExploatare || 0));
    const cheltuieliExpl = parseFloat(String(f20.cheltuieliExploatare || 0));
    const rawRezExpl = f20.rezultatExploatare ?? f20.profitExploatare;
    const rezultatExploatare = rawRezExpl != null
      ? parseFloat(String(rawRezExpl))
      : (venituriExpl > 0 || cheltuieliExpl > 0 ? venituriExpl - cheltuieliExpl : 0);
    if (rezultatExploatare !== 0 || rawRezExpl != null) {
      add("rezultat_exploatare_calculat", rezultatExploatare, rawRezExpl != null ? finSource : "calculated");
    }

    // ─── EBITDA (Earnings Before Interest, Taxes, Depreciation, Amortization) ───
    // EBITDA = Profit exploatare + Amortizare
    const amortizare = f10.amortizare != null
      ? parseFloat(String(f10.amortizare))
      : (f20.cheltuieliAmortizare != null ? parseFloat(String(f20.cheltuieliAmortizare)) : 0);
    if (amortizare > 0) add("amortizare", amortizare, finSource);
    if (rezultatExploatare !== 0 || amortizare > 0) {
      add("ebitda", rezultatExploatare + amortizare, "calculated");
    }

    // ─── Cheltuieli financiare (dobânzi) ───
    if (f20.cheltuieliFinanciare != null) add("cheltuieli_financiare", f20.cheltuieliFinanciare, finSource);
    if (f20.venituriFinanciare != null) add("venituri_financiare", f20.venituriFinanciare, finSource);

    // ─── EUR conversion (pentru praguri IMM) ───
    // Curs BNR implicit 4.97 — suprascris din referenceValues dacă există
    const cursEur = 4.97; // default, poate fi suprascris la nivel de organizație
    if (hasCa) add("cifra_afaceri_eur", Math.round(ca / cursEur), "calculated");
    if (activeTotale > 0) add("active_totale_eur", Math.round(activeTotale / cursEur), "calculated");
    const caEur = hasCa ? ca / cursEur : 0;
    const activeTotaleEur = activeTotale / cursEur;

    // ─── Financial ratios — only if source data exists ───
    if (hasCapProprii && capitaluriProprii !== 0 && datoriiTotale > 0) {
      add("grad_indatorare", Math.round((datoriiTotale / capitaluriProprii) * 100) / 100, "calculated");
    } else if (hasCapProprii && capitaluriProprii === 0 && datoriiTotale > 0) {
      // Capital propriu zero cu datorii = grad îndatorare infinit (risc maxim)
      add("grad_indatorare", 999, "calculated");
      add("avertisment_grad_indatorare", "Capitaluri proprii zero cu datorii pozitive — risc maxim", "calculated");
    }
    if (datoriiSub1An > 0 && hasActiveCirc && activeCirc > 0) {
      add("lichiditate_curenta", Math.round((activeCirc / datoriiSub1An) * 100) / 100, "calculated");
    }
    if (activeTotale > 0 && hasCapProprii) {
      add("solvabilitate", Math.round((capitaluriProprii / activeTotale) * 100) / 100, "calculated");
    }
    if (hasCa && ca > 0 && hasProfitNet) {
      add("rentabilitate", Math.round((profitNet / ca) * 10000) / 10000, "calculated");
    }

    // ─── Productivitate muncii (element frecvent în grile de punctaj) ───
    if (hasCa && hasEmp && emp > 0) {
      add("productivitate_munca", Math.round(ca / emp), "calculated");
      add("productivitate_munca_eur", Math.round(caEur / emp), "calculated");
    }

    // ─── Cheltuieli personal per angajat ───
    const cheltuieliPersonal = parseFloat(String(f20.cheltuieliPersonal || 0));
    if (cheltuieliPersonal > 0 && hasEmp && emp > 0) {
      add("cost_mediu_salariat", Math.round(cheltuieliPersonal / emp), "calculated");
    }

    // ─── IMM classification (Reg. 651/2014 Anexa I) ───
    // Praguri: angajați < prag ȘI (CA < prag SAU active < prag) — valori în EUR
    if (hasEmp) {
      const hasFinancialData = hasCa || activeTotale > 0;
      if (hasFinancialData) {
        if (emp < 10 && (caEur < 2_000_000 || activeTotaleEur < 2_000_000)) {
          add("clasificare_imm", "micro", "calculated");
        } else if (emp < 50 && (caEur < 10_000_000 || activeTotaleEur < 10_000_000)) {
          add("clasificare_imm", "mica", "calculated");
        } else if (emp < 250 && (caEur < 50_000_000 || activeTotaleEur < 43_000_000)) {
          add("clasificare_imm", "mijlocie", "calculated");
        } else {
          add("clasificare_imm", "mare", "calculated");
        }
      } else {
        add("clasificare_imm_avertisment", "Date insuficiente — lipsesc cifra de afaceri și activele totale", "calculated");
      }
    } else {
      add("clasificare_imm_avertisment", "Date insuficiente pentru clasificare IMM — lipsește numărul de angajați", "calculated");
    }

    // Warnings for missing critical financial data
    if (!hasCa) add("avertisment_cifra_afaceri", "Cifra de afaceri nu a fost extrasă din bilanț", "calculated");
    if (!hasEmp) add("avertisment_angajati", "Numărul de angajați nu a fost extras din bilanț", "calculated");
    if (!hasCapProprii) add("avertisment_capitaluri_proprii", "Capitalurile proprii nu au fost extrase din bilanț", "calculated");

    // ─── G2: Întreprindere în dificultate (Reg. EU 651/2014, art. 2.18) ───
    const capitalSocial = parseFloat(String(company.capitalSocial || 0));

    // Test 1: Capitaluri proprii < 50% din capital social subscris (art. 2.18a)
    if (capitalSocial > 0 && hasCapProprii) {
      const ratioCapital = capitaluriProprii / capitalSocial;
      add("ratio_capitaluri_proprii_capital_social", Math.round(ratioCapital * 100) / 100, "calculated");

      const vechimeAni = company.anInfiintare ? new Date().getFullYear() - company.anInfiintare : 999;
      // Excepție: microîntreprinderi sub 3 ani (art. 2.18d)
      const isMicro = emp < 10 && (caEur < 2_000_000 || activeTotaleEur < 2_000_000);
      if (isMicro && vechimeAni < 3) {
        add("este_intreprindere_in_dificultate", "nu_se_aplica", "calculated");
        add("intreprindere_in_dificultate_motiv", "Microîntreprindere sub 3 ani — excepție art. 2.18(d)", "calculated");
      } else if (ratioCapital < 0.5) {
        add("este_intreprindere_in_dificultate", "da", "calculated");
        add("intreprindere_in_dificultate_motiv",
          `Capitaluri proprii (${capitaluriProprii.toLocaleString("ro-RO")} RON) < 50% din capital social (${capitalSocial.toLocaleString("ro-RO")} RON). Raport: ${Math.round(ratioCapital * 100)}%`,
          "calculated");
      } else {
        add("este_intreprindere_in_dificultate", "nu", "calculated");
      }
    }

    // Test 2: Pierderi acumulate > 50% capital social (indiferent de profitul curent)
    if (capitalSocial > 0) {
      const profitReportat = parseFloat(String(f10.capital?.profitReportat || f10.profitReportat || f10.rezultatReportat || 0));
      if (profitReportat < 0 && Math.abs(profitReportat) > capitalSocial * 0.5) {
        add("pierderi_acumulate_peste_50pct", "da", "calculated");
        add("pierderi_acumulate_valoare", profitReportat, "calculated");
        // Suprascrie rezultatul testului 1 dacă e "nu"
        if (capitaluriProprii >= capitalSocial * 0.5) {
          add("atentie_pierderi_acumulate",
            `Deși capitalurile proprii sunt > 50% din capital social, pierderile reportate acumulate (${Math.abs(profitReportat).toLocaleString("ro-RO")} RON) depășesc 50% din capitalul social`,
            "calculated");
        }
      } else {
        add("pierderi_acumulate_peste_50pct", "nu", "calculated");
      }
    }

    // Test 3: Grad îndatorare excesiv (datorii/active > 7.5)
    if (activeTotale > 0 && datoriiTotale > 0) {
      const gradIndatorareActiv = datoriiTotale / activeTotale;
      if (gradIndatorareActiv > 0.75) {
        add("avertisment_indatorare_activ", `Datorii/Active = ${Math.round(gradIndatorareActiv * 100)}% — grad de îndatorare ridicat`, "calculated");
      }
    }

    // ─── G8: Trend financiar 3 ani ───
    if (financials.length >= 2) {
      const sortedYears = financials.sort((a, b) => b.year - a.year);
      const latestYear = sortedYears[0];
      const prevYear = sortedYears[1];
      const prev2Year = sortedYears.length >= 3 ? sortedYears[2] : null;

      const getCA = (fin: any) => parseFloat(String((fin.f20 || {}).cifraAfaceriNeta || 0));
      const getPN = (fin: any) => parseFloat(String((fin.f20 || {}).profitNet || 0));
      const getEmp = (fin: any) => parseInt(String((fin.f30 || {}).numarMediuSalariati || 0));

      const caLatest = getCA(latestYear);
      const caPrev = getCA(prevYear);

      // CA trend
      if (caPrev > 0) {
        const caTrend = Math.round(((caLatest - caPrev) / caPrev) * 100);
        add("trend_cifra_afaceri_1an_pct", caTrend, "calculated");
        add("trend_cifra_afaceri_1an", caTrend > 0 ? "crestere" : caTrend < 0 ? "scadere" : "stabil", "calculated");
      }

      // Profit trend
      const pnLatest = getPN(latestYear);
      const pnPrev = getPN(prevYear);
      if (pnPrev !== 0) {
        const pnTrend = Math.round(((pnLatest - pnPrev) / Math.abs(pnPrev)) * 100);
        add("trend_profit_net_1an_pct", pnTrend, "calculated");
      }

      // Employees trend
      const empLatest = getEmp(latestYear);
      const empPrev = getEmp(prevYear);
      if (empPrev > 0) {
        const empTrend = Math.round(((empLatest - empPrev) / empPrev) * 100);
        add("trend_angajati_1an_pct", empTrend, "calculated");
      }

      // 3-year trend (if available)
      if (prev2Year) {
        const caPrev2 = getCA(prev2Year);
        if (caPrev2 > 0) {
          const caTrend3 = Math.round(((caLatest - caPrev2) / caPrev2) * 100);
          add("trend_cifra_afaceri_3ani_pct", caTrend3, "calculated");
          add("trend_cifra_afaceri_3ani",
            caTrend3 > 10 ? "crestere" : caTrend3 < -10 ? "scadere" : "stabil", "calculated");
        }
      }

      // Consecutiv profit/pierdere
      const yearsInProfit = sortedYears.filter(f => getPN(f) > 0).length;
      const yearsInLoss = sortedYears.filter(f => getPN(f) < 0).length;
      add("ani_consecutivi_profit", yearsInProfit, "calculated");
      add("ani_consecutivi_pierdere", yearsInLoss, "calculated");
      add("numar_ani_financiari", sortedYears.length, "calculated");
    }

    // ─── G7: Validare an bilanț (ultimul exercițiu fiscal încheiat) ───
    const currentYear = new Date().getFullYear();
    const expectedYear = new Date().getMonth() < 6 ? currentYear - 2 : currentYear - 1;
    // Dacă suntem înainte de iunie, bilanțul așteptat e cel de acum 2 ani
    add("an_bilant_asteptat", expectedYear, "calculated");
    const latestFinYear = financials[0]?.year;
    if (latestFinYear) {
      add("bilant_actualizat", latestFinYear >= expectedYear ? "da" : "nu", "calculated");
      if (latestFinYear < expectedYear) {
        add("bilant_actualizat_motiv",
          `Ultimul bilanț (${latestFinYear}) este mai vechi decât exercițiul fiscal așteptat (${expectedYear})`,
          "calculated");
      }
    } else {
      add("bilant_actualizat", "lipsa", "calculated");
      add("bilant_actualizat_motiv", "Nu există niciun bilanț încărcat", "calculated");
    }
  }

  // ─── G6: Stare fiscală din date disponibile ───
  // Consolidăm toate flag-urile de stare într-un singur element
  const stareCompanie = (company.stare || "").toLowerCase();
  const rawData = (company.onrcRawData || {}) as Record<string, any>;
  const probleme: string[] = [];
  if (rawData.insolventa) probleme.push("insolvență");
  if (rawData.dizolvare) probleme.push("dizolvare");
  if (rawData.lichidare) probleme.push("lichidare");
  if (rawData.restrictii) probleme.push("restricții");
  if (rawData.reorganizare) probleme.push("reorganizare");
  if (stareCompanie.includes("radiat")) probleme.push("radiat");
  if (stareCompanie.includes("inactiv")) probleme.push("inactiv fiscal");
  if (stareCompanie.includes("suspendat")) probleme.push("suspendat");

  add("stare_fiscala_ok", probleme.length === 0 ? "da" : "nu", "calculated");
  if (probleme.length > 0) {
    add("stare_fiscala_probleme", probleme.join(", "), "calculated");
  }
  add("numar_probleme_stare", probleme.length, "calculated");

  // ─── G4: Cross-check asociați cu alte firme din platformă ───
  if (associates.length > 0) {
    const associateNames = associates.map(a => a.name.toLowerCase().trim());
    // Find other companies in the same organization that share associates
    const otherCompanies = await db.query.companies.findMany({
      where: and(
        eq(companies.organizationId, organizationId),
      ),
    });

    const linkedCompanies: Array<{ cui: string; denumire: string; asociatComun: string }> = [];
    for (const otherComp of otherCompanies) {
      if (otherComp.id === companyId) continue;
      const otherAssociates = await db.query.companyAssociates.findMany({
        where: eq(companyAssociates.companyId, otherComp.id),
      });
      for (const oa of otherAssociates) {
        if (associateNames.includes(oa.name.toLowerCase().trim())) {
          linkedCompanies.push({
            cui: otherComp.cui || "",
            denumire: otherComp.denumire,
            asociatComun: oa.name,
          });
          break; // one match per company is enough
        }
      }
    }

    add("firme_legate_numar", linkedCompanies.length, "calculated");
    if (linkedCompanies.length > 0) {
      add("firme_legate_detalii",
        linkedCompanies.map(lc => `${lc.denumire} (CUI: ${lc.cui}) — asociat comun: ${lc.asociatComun}`).join("; "),
        "calculated");
      add("are_firme_legate", "da", "calculated");
      // Important pentru IMM real — dacă firmele legate depășesc pragurile IMM
      add("atentie_imm_legat",
        "Verificați dacă firmele legate nu depășesc pragurile IMM consolidat (Reg. 651/2014 Anexa I art. 3)",
        "calculated");
    } else {
      add("are_firme_legate", "nu", "calculated");
    }
  }

  // ─── G5: Istoric proiecte pe platformă ───
  const companyProjects = await db.query.projects.findMany({
    where: eq(projects.companyId, companyId),
  });
  add("numar_proiecte_platforma", companyProjects.length, "calculated");
  if (companyProjects.length > 0) {
    const projectNames = companyProjects.map(p => p.name).join("; ");
    add("proiecte_existente", projectNames, "calculated");
  }

  // ─── G3: Element de minimis (placeholder pentru declarație pe proprie răspundere) ───
  // Nu putem verifica automat registrul de minimis, dar creăm elementul
  // pe care consultantul îl poate completa manual sau din declarație
  add("de_minimis_verificat", "nu", "calculated");
  add("de_minimis_nota", "Completați valoarea ajutoarelor de minimis din ultimii 3 ani fiscali din declarația pe proprie răspundere", "calculated");
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
