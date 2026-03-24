export const FORME_JURIDICE = [
  { cod: "SRL", label: "Societate cu Raspundere Limitata", short: "S.R.L.", group: "SOC" },
  { cod: "SA", label: "Societate pe Actiuni", short: "S.A.", group: "SOC" },
  { cod: "SNC", label: "Societate in Nume Colectiv", short: "S.N.C.", group: "SOC" },
  { cod: "SCS", label: "Societate in Comandita Simpla", short: "S.C.S.", group: "SOC" },
  { cod: "SCA", label: "Societate in Comandita pe Actiuni", short: "S.C.A.", group: "SOC" },
  { cod: "PFA", label: "Persoana Fizica Autorizata", short: "P.F.A.", group: "PF" },
  { cod: "II", label: "Intreprindere Individuala", short: "I.I.", group: "PF" },
  { cod: "IF", label: "Intreprindere Familiala", short: "I.F.", group: "PF" },
  { cod: "SC", label: "Societate Cooperativa", short: "S.C.", group: "SOC" },
  { cod: "RA", label: "Regie Autonoma", short: "R.A.", group: "SOC" },
  { cod: "SA_BVB", label: "SA listata la bursa", short: "S.A. (BVB)", group: "SOC" },
] as const;

export const SOC_CODES = ["SRL", "SA", "SNC", "SCS", "SCA", "SC", "RA", "SA_BVB"] as const;
export const PF_CODES = ["PFA", "II", "IF"] as const;

export const isSOC = (f: string) => (SOC_CODES as readonly string[]).includes(f);
export const isPF = (f: string) => (PF_CODES as readonly string[]).includes(f);

export const PROJECT_STATUSES = {
  draft: { label: "Ciorna", color: "#5a6478" },
  in_progress: { label: "In lucru", color: "#4d8bff" },
  review: { label: "Verificare", color: "#fbbf24" },
  submitted: { label: "Depus", color: "#34d399" },
  approved: { label: "Aprobat", color: "#34d399" },
  rejected: { label: "Respins", color: "#f87171" },
} as const;

export const DOC_TREE_NODE_DOTS = {
  program: { size: 12, color: "#003399" },
  masura: { size: 8, color: "#C9A84C" },
  sesiune: { size: 6, color: "#888888" },
} as const;

export const DOC_TREE_LEAF_ICONS = {
  ghiduri: "📖",
  templateuri: "📝",
  clienti_prospecti: "🔍",
  clienti_finali: "✅",
} as const;

// ============================================================
// KNOWN COMPANY FIELDS — canonical field names for rule extraction & evaluation
// ============================================================

export type FieldCategory = "solicitant" | "financiar" | "exploatatie" | "locatie" | "documente" | "tehnic" | "persoane" | "custom";

export interface CompanyFieldDef {
  /** Canonical field key used in rule conditions and buildCompanyData() */
  key: string;
  /** Human-readable label (Romanian) */
  label: string;
  /** Category for grouping in UI */
  category: FieldCategory;
  /** Data type for display and validation */
  dataType: "text" | "number" | "enum" | "boolean" | "date" | "percent";
  /** Unit of measurement (if applicable) */
  unit?: string;
  /** Valid enum values (if dataType === "enum") */
  enumValues?: readonly string[];
  /** Whether this field is auto-populated from ONRC/ANAF */
  autoPopulated?: boolean;
  /** Whether this is a per-year field (e.g., cifra_afaceri_YYYY) */
  perYear?: boolean;
  /** Known aliases that should map to this canonical key */
  aliases?: readonly string[];
  /** Short description for tooltips */
  description?: string;
}

export const FIELD_CATEGORIES: Record<FieldCategory, { label: string; order: number }> = {
  solicitant: { label: "Solicitant", order: 1 },
  financiar: { label: "Financiar", order: 2 },
  exploatatie: { label: "Exploatatie", order: 3 },
  locatie: { label: "Locatie", order: 4 },
  documente: { label: "Documente", order: 5 },
  tehnic: { label: "Tehnic", order: 6 },
  persoane: { label: "Persoane", order: 7 },
  custom: { label: "Custom", order: 8 },
};

/**
 * Master list of known company fields.
 * AI extraction prompt references this list to ensure consistent field names.
 * buildCompanyData() and populateCompanyElements() produce these keys.
 */
export const KNOWN_COMPANY_FIELDS: readonly CompanyFieldDef[] = [
  // === SOLICITANT (company identity) ===
  { key: "forma_juridica", label: "Forma juridica", category: "solicitant", dataType: "enum", enumValues: ["SRL", "SA", "SNC", "SCS", "SCA", "PFA", "II", "IF", "SC", "RA", "SA_BVB"], autoPopulated: true, aliases: ["tip_firma", "forma_legala", "tip_societate"], description: "Forma juridica a solicitantului" },
  { key: "cui", label: "CUI", category: "solicitant", dataType: "text", autoPopulated: true, aliases: ["cod_unic_inregistrare", "cif", "cod_fiscal"], description: "Cod unic de inregistrare" },
  { key: "reg_com", label: "Nr. Registru Comert", category: "solicitant", dataType: "text", autoPopulated: true, aliases: ["numar_registru_comert", "j_nr"] },
  { key: "denumire", label: "Denumire firma", category: "solicitant", dataType: "text", autoPopulated: true },
  { key: "cod_caen", label: "CAEN principal", category: "solicitant", dataType: "text", autoPopulated: true, aliases: ["caen_principal", "caen", "cod_caen_principal", "activitate_principala"], description: "Codul CAEN al activitatii principale" },
  { key: "cod_caen_secundare", label: "CAEN secundare", category: "solicitant", dataType: "text", autoPopulated: true, aliases: ["caen_secundar", "activitati_secundare", "coduri_caen_secundare"], description: "Lista codurilor CAEN secundare (separate prin virgula)" },
  { key: "stare", label: "Stare firma", category: "solicitant", dataType: "enum", enumValues: ["functiune", "radiata", "dizolvata", "lichidare"], autoPopulated: true, aliases: ["stare_firma", "status_firma"] },
  { key: "an_infiintare", label: "An infiintare", category: "solicitant", dataType: "number", autoPopulated: true, aliases: ["data_infiintare", "anul_infiintarii", "an_inregistrare"] },
  { key: "vechime_ani", label: "Vechime (ani)", category: "solicitant", dataType: "number", unit: "ani", autoPopulated: true, aliases: ["vechime_firma", "ani_functionare", "ani_de_la_infiintare"], description: "Numar ani de la infiintare" },
  { key: "capital_social", label: "Capital social", category: "solicitant", dataType: "number", unit: "RON", autoPopulated: true, aliases: ["capital_subscris", "capital_varsat"] },
  { key: "clasificare_imm", label: "Clasificare IMM", category: "solicitant", dataType: "enum", enumValues: ["micro", "mica", "mijlocie", "mare"], autoPopulated: true, aliases: ["categorie_intreprindere", "tip_imm", "marime_firma", "categorie_firma"], description: "Clasificare conform definitiei UE (angajati + CA/active)" },
  { key: "tip_solicitant", label: "Tip solicitant", category: "solicitant", dataType: "enum", enumValues: ["startup", "existent", "spin-off", "nou-infiintat"], aliases: ["tip_beneficiar", "categorie_solicitant"], description: "Tipul solicitantului (startup, existent, etc.)" },
  { key: "insolventa", label: "In insolventa", category: "solicitant", dataType: "enum", enumValues: ["da", "nu"], autoPopulated: true, aliases: ["procedura_insolventa", "in_insolventa", "este_in_insolventa"], description: "Firma in procedura de insolventa" },
  { key: "dizolvare", label: "In dizolvare", category: "solicitant", dataType: "enum", enumValues: ["da", "nu"], autoPopulated: true },
  { key: "lichidare", label: "In lichidare", category: "solicitant", dataType: "enum", enumValues: ["da", "nu"], autoPopulated: true },
  { key: "restrictii", label: "Are restrictii", category: "solicitant", dataType: "enum", enumValues: ["da", "nu"], autoPopulated: true },
  { key: "este_intreprindere_in_dificultate", label: "Intreprindere in dificultate", category: "solicitant", dataType: "enum", enumValues: ["da", "nu"], aliases: ["firma_in_dificultate", "in_dificultate"], description: "Conform Reg. 651/2014 art.2 pct.18" },
  { key: "datorii_buget_stat", label: "Datorii buget stat", category: "solicitant", dataType: "enum", enumValues: ["da", "nu"], aliases: ["datorii_anaf", "datorii_fiscale", "obligatii_bugetare_restante"], description: "Are datorii restante la bugetul de stat" },
  { key: "apartine_grup", label: "Apartine unui grup", category: "solicitant", dataType: "enum", enumValues: ["da", "nu"], aliases: ["intreprinderi_legate", "intreprinderi_partenere", "face_parte_din_grup"], description: "Apartine unui grup de intreprinderi legate/partenere" },
  { key: "platitor_tva", label: "Platitor TVA", category: "solicitant", dataType: "enum", enumValues: ["da", "nu"], autoPopulated: true, aliases: ["inregistrat_tva", "este_platitor_tva", "tva_activ"], description: "Inregistrat in scopuri de TVA" },
  { key: "cod_tva", label: "Cod TVA", category: "solicitant", dataType: "text", autoPopulated: true, aliases: ["numar_tva", "vat_number"], description: "Codul de inregistrare in scopuri de TVA" },
  { key: "capital_privat_autohton_pct", label: "Capital privat autohton (%)", category: "solicitant", dataType: "percent", autoPopulated: true, aliases: ["pct_capital_roman", "capital_romanesc"], description: "Procentul capitalului privat autohton" },
  { key: "capital_privat_strain_pct", label: "Capital privat strain (%)", category: "solicitant", dataType: "percent", autoPopulated: true, aliases: ["pct_capital_strain", "capital_strain"], description: "Procentul capitalului privat strain" },
  { key: "capital_stat_pct", label: "Capital de stat (%)", category: "solicitant", dataType: "percent", autoPopulated: true, aliases: ["pct_capital_stat", "participare_stat"], description: "Procentul capitalului de stat" },
  { key: "numar_activitati_secundare", label: "Nr. activitati secundare", category: "solicitant", dataType: "number", autoPopulated: true, description: "Numarul codurilor CAEN secundare" },
  { key: "cifra_afaceri_eur", label: "Cifra de afaceri (EUR)", category: "solicitant", dataType: "number", unit: "EUR", autoPopulated: true, aliases: ["ca_eur", "turnover_eur"], description: "CA convertita in EUR (la cursul de referinta)" },
  { key: "active_totale_eur", label: "Active totale (EUR)", category: "solicitant", dataType: "number", unit: "EUR", autoPopulated: true, description: "Active totale convertite in EUR (pt clasificare IMM)" },

  // === FINANCIAR (financial data) ===
  { key: "cifra_afaceri", label: "Cifra de afaceri neta", category: "financiar", dataType: "number", unit: "RON", autoPopulated: true, perYear: true, aliases: ["cifra_afaceri_neta", "ca", "turnover", "venituri_nete"], description: "Cifra de afaceri neta (cel mai recent an)" },
  { key: "profit_net", label: "Profit net", category: "financiar", dataType: "number", unit: "RON", autoPopulated: true, perYear: true, aliases: ["rezultat_net", "profit"] },
  { key: "profit_brut", label: "Profit brut", category: "financiar", dataType: "number", unit: "RON", autoPopulated: true, aliases: ["rezultat_brut"] },
  { key: "angajati", label: "Numar mediu salariati", category: "financiar", dataType: "number", autoPopulated: true, perYear: true, aliases: ["numar_mediu_salariati", "numar_angajati", "nr_angajati", "salariati", "nr_salariati", "personal"], description: "Numar mediu de salariati" },
  { key: "capitaluri_proprii", label: "Capitaluri proprii", category: "financiar", dataType: "number", unit: "RON", autoPopulated: true, perYear: true, aliases: ["capital_propriu", "equity", "fonduri_proprii"] },
  { key: "active_totale", label: "Active totale", category: "financiar", dataType: "number", unit: "RON", autoPopulated: true, aliases: ["total_activ", "total_active", "bilant_total"], description: "Active imobilizate + active circulante" },
  { key: "active_imobilizate", label: "Active imobilizate", category: "financiar", dataType: "number", unit: "RON", autoPopulated: true, aliases: ["imobilizari", "active_fixe"] },
  { key: "active_circulante", label: "Active circulante", category: "financiar", dataType: "number", unit: "RON", autoPopulated: true, aliases: ["active_curente"] },
  { key: "datorii_totale", label: "Datorii totale", category: "financiar", dataType: "number", unit: "RON", autoPopulated: true, aliases: ["total_datorii", "obligatii_totale"] },
  { key: "datorii_sub_1an", label: "Datorii sub 1 an", category: "financiar", dataType: "number", unit: "RON", autoPopulated: true, aliases: ["datorii_curente", "datorii_termen_scurt"] },
  { key: "venituri_exploatare", label: "Venituri din exploatare", category: "financiar", dataType: "number", unit: "RON", autoPopulated: true },
  { key: "cheltuieli_exploatare", label: "Cheltuieli din exploatare", category: "financiar", dataType: "number", unit: "RON", autoPopulated: true },
  { key: "rezultat_exploatare", label: "Rezultat din exploatare", category: "financiar", dataType: "number", unit: "RON", autoPopulated: true, aliases: ["profit_exploatare"] },
  { key: "grad_indatorare", label: "Grad de indatorare", category: "financiar", dataType: "percent", aliases: ["indatorare", "leverage", "debt_ratio"], description: "Datorii totale / Capitaluri proprii" },
  { key: "lichiditate_curenta", label: "Lichiditate curenta", category: "financiar", dataType: "number", aliases: ["current_ratio", "rata_lichiditate"], description: "Active circulante / Datorii sub 1 an" },
  { key: "solvabilitate", label: "Solvabilitate", category: "financiar", dataType: "percent", aliases: ["rata_solvabilitate"], description: "Capitaluri proprii / Active totale" },
  { key: "rentabilitate", label: "Rentabilitate", category: "financiar", dataType: "percent", aliases: ["rata_rentabilitate", "profitabilitate", "marja_profit"], description: "Profit net / Cifra de afaceri" },
  { key: "cifra_afaceri_consolidata", label: "CA consolidata (grup)", category: "financiar", dataType: "number", unit: "RON", aliases: ["ca_consolidata", "cifra_afaceri_grup"], description: "Cifra de afaceri consolidata (intreprinderi legate)" },
  { key: "stocuri", label: "Stocuri", category: "financiar", dataType: "number", unit: "RON", autoPopulated: true, aliases: ["inventar", "marfuri"], description: "Valoare stocuri din bilant" },
  { key: "creante", label: "Creante", category: "financiar", dataType: "number", unit: "RON", autoPopulated: true, aliases: ["creante_comerciale", "debitori"], description: "Creante comerciale si alte creante" },
  { key: "casa_si_conturi", label: "Casa si conturi la banci", category: "financiar", dataType: "number", unit: "RON", autoPopulated: true, aliases: ["disponibilitati", "numerar", "cash"], description: "Disponibilitati banesti (capacitate cofinantare)" },
  { key: "cheltuieli_personal", label: "Cheltuieli cu personalul", category: "financiar", dataType: "number", unit: "RON", autoPopulated: true, aliases: ["cost_personal", "salarii_total"], description: "Total cheltuieli cu personalul" },
  { key: "datorii_peste_1an", label: "Datorii peste 1 an", category: "financiar", dataType: "number", unit: "RON", autoPopulated: true, aliases: ["datorii_termen_lung", "datorii_pe_termen_lung"] },

  // === LOCATIE ===
  { key: "judet", label: "Judet", category: "locatie", dataType: "text", autoPopulated: true, aliases: ["judet_sediu", "judet_social"], description: "Judetul sediului social" },
  { key: "localitate", label: "Localitate", category: "locatie", dataType: "text", autoPopulated: true, aliases: ["oras", "municipiu", "comuna", "sat", "localitate_sediu"] },
  { key: "adresa", label: "Adresa sediu", category: "locatie", dataType: "text", autoPopulated: true, aliases: ["adresa_sediu", "sediu_social"] },
  { key: "cod_postal", label: "Cod postal", category: "locatie", dataType: "text", autoPopulated: true },
  { key: "regiune_dezvoltare", label: "Regiune de dezvoltare", category: "locatie", dataType: "enum", enumValues: ["Nord-Est", "Sud-Est", "Sud-Muntenia", "Sud-Vest-Oltenia", "Vest", "Nord-Vest", "Centru", "Bucuresti-Ilfov"], aliases: ["regiune", "regiunea_dezvoltare", "macroregiune"], description: "Regiunea de dezvoltare (NE, SE, S, SV, V, NV, C, BI)" },
  { key: "tip_localitate", label: "Tip localitate", category: "locatie", dataType: "enum", enumValues: ["urban", "rural"], aliases: ["mediu", "mediu_urban_rural", "zona_urban_rural"], description: "Urban sau rural" },
  { key: "zona_defavorizata", label: "Zona defavorizata", category: "locatie", dataType: "enum", enumValues: ["da", "nu"], aliases: ["zona_montana", "iti_delta_dunarii", "zona_dezavantajata"], description: "Zona defavorizata (montana, ITI Delta Dunarii, etc.)" },
  { key: "numar_sedii_secundare", label: "Nr. sedii secundare", category: "locatie", dataType: "number", autoPopulated: true, aliases: ["puncte_lucru", "nr_puncte_lucru"], description: "Numarul de sedii secundare / puncte de lucru" },
  { key: "judete_sedii_secundare", label: "Judete sedii secundare", category: "locatie", dataType: "text", autoPopulated: true, description: "Lista judetelor unde firma are sedii secundare (separate prin virgula)" },

  // === PERSOANE (asociati / administratori) ===
  { key: "numar_asociati", label: "Numar asociati", category: "persoane", dataType: "number", autoPopulated: true, aliases: ["nr_asociati", "nr_actionari"] },
  { key: "numar_asociati_pf", label: "Asociati persoane fizice", category: "persoane", dataType: "number", autoPopulated: true },
  { key: "numar_asociati_pj", label: "Asociati persoane juridice", category: "persoane", dataType: "number", autoPopulated: true },
  { key: "asociat_majoritar_pct", label: "Cota asociat majoritar (%)", category: "persoane", dataType: "percent", autoPopulated: true, aliases: ["pct_majoritar", "cota_majoritar"], description: "Procentul celui mai mare asociat" },
  { key: "asociat_majoritar_nume", label: "Asociat majoritar (nume)", category: "persoane", dataType: "text", autoPopulated: true, description: "Numele asociatului cu cota cea mai mare" },
  { key: "are_asociat_strain", label: "Are asociat strain", category: "persoane", dataType: "enum", enumValues: ["da", "nu"], autoPopulated: true, aliases: ["asociat_strain", "actionariat_strain"], description: "Exista asociati non-romani" },
  { key: "numar_administratori", label: "Numar administratori", category: "persoane", dataType: "number", autoPopulated: true, aliases: ["nr_administratori"] },
  { key: "reprezentant_legal", label: "Reprezentant legal", category: "persoane", dataType: "text", autoPopulated: true, aliases: ["administrator", "director_general"] },
  { key: "data_numire_administrator", label: "Data numire administrator", category: "persoane", dataType: "text", autoPopulated: true, description: "Data numirii administratorului principal" },
  { key: "gen_administrator", label: "Gen administrator", category: "persoane", dataType: "enum", enumValues: ["M", "F"], aliases: ["sex_administrator", "gen_reprezentant"], description: "Genul reprezentantului legal (punctaj egalitate gen)" },
  { key: "varsta_administrator", label: "Varsta administrator", category: "persoane", dataType: "number", unit: "ani", aliases: ["varsta_reprezentant"], description: "Varsta reprezentantului legal (tineri antreprenori)" },
  { key: "experienta_domeniu_ani", label: "Experienta in domeniu", category: "persoane", dataType: "number", unit: "ani", aliases: ["experienta_ani", "ani_experienta", "experienta_profesionala"], description: "Ani de experienta in domeniul proiectului" },
  { key: "detine_alte_firme", label: "Detine alte firme", category: "persoane", dataType: "enum", enumValues: ["da", "nu"], aliases: ["alte_societati", "alte_firme"], description: "Asociatul/administratorul detine si alte firme" },

  // === EXPLOATATIE (agriculture / specific programs) ===
  { key: "suprafata_agricola_ha", label: "Suprafata agricola", category: "exploatatie", dataType: "number", unit: "ha", aliases: ["suprafata_exploatatiei", "suprafata_ha", "hectare", "suprafata_teren"], description: "Suprafata agricola in hectare" },
  { key: "dimensiune_economica_so", label: "Dimensiune economica (SO)", category: "exploatatie", dataType: "number", unit: "EUR", aliases: ["standard_output", "so", "productia_standard"], description: "Standard Output al fermei in EUR" },
  { key: "nr_unitati_vite_mari", label: "Unitati vite mari (UVM)", category: "exploatatie", dataType: "number", unit: "UVM", aliases: ["uvm", "unitati_vaci", "capete_animale"], description: "Numar unitati vite mari" },
  { key: "are_certificare_eco", label: "Certificare ecologica", category: "exploatatie", dataType: "enum", enumValues: ["da", "nu", "in_conversie"], aliases: ["certificat_eco", "agricultura_ecologica", "bio"], description: "Are certificare agricultura ecologica" },
  { key: "tip_exploatatie", label: "Tip exploatatie", category: "exploatatie", dataType: "enum", enumValues: ["vegetala", "animala", "mixta"], aliases: ["profil_ferma", "tip_ferma"], description: "Profilul exploatatiei agricole" },

  // === TEHNIC (project-related) ===
  { key: "valoare_investitie", label: "Valoare investitie", category: "tehnic", dataType: "number", unit: "RON", aliases: ["buget_proiect", "valoare_proiect", "cost_total"], description: "Valoarea totala a investitiei/proiectului" },
  { key: "numar_locuri_munca_noi", label: "Locuri munca noi", category: "tehnic", dataType: "number", aliases: ["locuri_munca_create", "angajari_noi", "nr_locuri_munca"], description: "Numar locuri de munca nou create" },
  { key: "durata_implementare_luni", label: "Durata implementare", category: "tehnic", dataType: "number", unit: "luni", aliases: ["durata_proiect", "luni_implementare"], description: "Durata de implementare a proiectului in luni" },
  { key: "cofinantare_pct", label: "Cofinantare proprie (%)", category: "tehnic", dataType: "percent", aliases: ["cofinantare", "contributie_proprie", "procent_cofinantare"], description: "Procentul de cofinantare proprie" },

  // === DOCUMENTE ===
  { key: "are_autorizatii_mediu", label: "Autorizatie de mediu", category: "documente", dataType: "enum", enumValues: ["da", "nu", "nu_este_cazul"], aliases: ["autorizatie_mediu", "acord_mediu"], description: "Detine autorizatie/acord de mediu" },
  { key: "are_certificat_urbanism", label: "Certificat urbanism", category: "documente", dataType: "enum", enumValues: ["da", "nu"], aliases: ["certificat_urbanism", "cu"], description: "Detine certificat de urbanism" },
  { key: "are_autorizatie_constructie", label: "Autorizatie constructie", category: "documente", dataType: "enum", enumValues: ["da", "nu", "nu_este_cazul"], aliases: ["autorizatie_construire", "ac"], description: "Detine autorizatie de construire" },
] as const;

/**
 * Build a map from alias → canonical key for field name normalization.
 * Used by AI extraction post-processing and rule evaluation.
 */
export function buildFieldAliasMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const field of KNOWN_COMPANY_FIELDS) {
    map.set(field.key, field.key); // canonical → canonical
    if (field.aliases) {
      for (const alias of field.aliases) {
        map.set(alias, field.key);
      }
    }
  }
  return map;
}

/**
 * Resolve a field name to its canonical key.
 * Returns the canonical key if found, or the original key if not (custom field).
 */
export function resolveFieldKey(fieldName: string): string {
  const aliasMap = buildFieldAliasMap();
  return aliasMap.get(fieldName) || fieldName;
}

/**
 * Get field definition by canonical key or alias.
 */
export function getFieldDef(keyOrAlias: string): CompanyFieldDef | undefined {
  const canonical = resolveFieldKey(keyOrAlias);
  return KNOWN_COMPANY_FIELDS.find(f => f.key === canonical);
}

/**
 * Generate the field list text for AI extraction prompts.
 * Groups fields by category with descriptions.
 */
export function generateFieldListForPrompt(): string {
  const lines: string[] = [];
  const byCategory = new Map<FieldCategory, CompanyFieldDef[]>();

  for (const field of KNOWN_COMPANY_FIELDS) {
    const cat = field.category;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(field);
  }

  const categoryOrder: FieldCategory[] = ["solicitant", "financiar", "locatie", "persoane", "exploatatie", "tehnic", "documente"];

  for (const cat of categoryOrder) {
    const fields = byCategory.get(cat);
    if (!fields) continue;
    const catLabel = FIELD_CATEGORIES[cat].label.toUpperCase();
    lines.push(`  [${catLabel}]`);
    for (const f of fields) {
      const extra: string[] = [];
      if (f.unit) extra.push(f.unit);
      if (f.enumValues) extra.push(`valori: ${f.enumValues.join(", ")}`);
      if (f.perYear) extra.push(`+ per-an: ${f.key}_YYYY`);
      if (f.aliases?.length) extra.push(`aliasuri: ${f.aliases.slice(0, 3).join(", ")}`);
      const suffix = extra.length > 0 ? ` (${extra.join("; ")})` : "";
      lines.push(`  - ${f.key}: ${f.label}${suffix}`);
    }
    lines.push("");
  }

  lines.push("  [CUSTOM]");
  lines.push("  - Orice alt camp specific programului (foloseste snake_case, ex: punctaj_tehnic, zona_iti)");

  return lines.join("\n");
}

// ============================================================
// REFERENCE VALUES — dynamic calculation parameters
// ============================================================

export interface ReferenceValueDef {
  /** Unique key for this reference value */
  key: string;
  /** Human-readable label */
  label: string;
  /** Grouping category */
  group: "fiscal" | "cursuri" | "praguri_imm" | "praguri_ajutor" | "salarii" | "contributii" | "custom";
  /** Data type */
  dataType: "number" | "percent" | "text";
  /** Unit */
  unit?: string;
  /** Default value (used when no org-level override exists) */
  defaultValue: string;
  /** Description */
  description?: string;
  /** Whether this is used in automatic calculations (IMM classification, etc.) */
  usedInCalculations?: boolean;
}

export const REFERENCE_VALUE_GROUPS: Record<string, { label: string; order: number }> = {
  fiscal: { label: "Fiscal", order: 1 },
  cursuri: { label: "Cursuri valutare", order: 2 },
  praguri_imm: { label: "Praguri IMM (UE)", order: 3 },
  praguri_ajutor: { label: "Praguri ajutor de stat", order: 4 },
  salarii: { label: "Salarii si contributii", order: 5 },
  contributii: { label: "Contributii sociale", order: 6 },
  custom: { label: "Altele", order: 7 },
};

/**
 * Default reference values used system-wide.
 * Organizations can override these in Settings → Baza de cunoștințe → Valori de referință.
 */
export const DEFAULT_REFERENCE_VALUES: readonly ReferenceValueDef[] = [
  // Fiscal
  { key: "tva_standard", label: "Cota TVA standard", group: "fiscal", dataType: "percent", defaultValue: "19", description: "Cota standard TVA in Romania", usedInCalculations: true },
  { key: "tva_redus_1", label: "Cota TVA redusa 1", group: "fiscal", dataType: "percent", defaultValue: "9", description: "Cota TVA redusa (alimente, medicamente, etc.)" },
  { key: "tva_redus_2", label: "Cota TVA redusa 2", group: "fiscal", dataType: "percent", defaultValue: "5", description: "Cota TVA redusa (carti, locuinte sociale, etc.)" },
  { key: "impozit_profit", label: "Impozit pe profit", group: "fiscal", dataType: "percent", defaultValue: "16", description: "Cota standard impozit pe profit" },
  { key: "impozit_micro", label: "Impozit microintreprindere", group: "fiscal", dataType: "percent", defaultValue: "1", description: "Cota impozit pe venitul microintreprinderilor" },

  // Cursuri valutare
  { key: "curs_eur_ron", label: "Curs EUR/RON", group: "cursuri", dataType: "number", unit: "RON/EUR", defaultValue: "4.97", description: "Cursul de schimb EUR/RON (folosit pt clasificare IMM)", usedInCalculations: true },
  { key: "curs_usd_ron", label: "Curs USD/RON", group: "cursuri", dataType: "number", unit: "RON/USD", defaultValue: "4.60", description: "Cursul de schimb USD/RON" },

  // Praguri IMM (Reg. 651/2014 Anexa I — in EUR)
  { key: "prag_micro_angajati", label: "Prag micro: angajati", group: "praguri_imm", dataType: "number", defaultValue: "10", description: "< 10 angajati", usedInCalculations: true },
  { key: "prag_micro_ca_eur", label: "Prag micro: CA (EUR)", group: "praguri_imm", dataType: "number", unit: "EUR", defaultValue: "2000000", description: "CA < 2M EUR sau active < 2M EUR", usedInCalculations: true },
  { key: "prag_micro_active_eur", label: "Prag micro: active (EUR)", group: "praguri_imm", dataType: "number", unit: "EUR", defaultValue: "2000000", usedInCalculations: true },
  { key: "prag_mica_angajati", label: "Prag mica: angajati", group: "praguri_imm", dataType: "number", defaultValue: "50", usedInCalculations: true },
  { key: "prag_mica_ca_eur", label: "Prag mica: CA (EUR)", group: "praguri_imm", dataType: "number", unit: "EUR", defaultValue: "10000000", usedInCalculations: true },
  { key: "prag_mica_active_eur", label: "Prag mica: active (EUR)", group: "praguri_imm", dataType: "number", unit: "EUR", defaultValue: "10000000", usedInCalculations: true },
  { key: "prag_mijlocie_angajati", label: "Prag mijlocie: angajati", group: "praguri_imm", dataType: "number", defaultValue: "250", usedInCalculations: true },
  { key: "prag_mijlocie_ca_eur", label: "Prag mijlocie: CA (EUR)", group: "praguri_imm", dataType: "number", unit: "EUR", defaultValue: "50000000", usedInCalculations: true },
  { key: "prag_mijlocie_active_eur", label: "Prag mijlocie: active (EUR)", group: "praguri_imm", dataType: "number", unit: "EUR", defaultValue: "43000000", usedInCalculations: true },

  // Praguri ajutor de stat
  { key: "plafon_minimis_eur", label: "Plafon de minimis", group: "praguri_ajutor", dataType: "number", unit: "EUR", defaultValue: "300000", description: "Plafon de minimis pe 3 ani (Reg. 2023/2831)" },
  { key: "plafon_minimis_transport_eur", label: "Plafon de minimis transport", group: "praguri_ajutor", dataType: "number", unit: "EUR", defaultValue: "100000", description: "Plafon de minimis transport rutier marfa" },

  // Salarii
  { key: "salariu_minim_brut", label: "Salariu minim brut", group: "salarii", dataType: "number", unit: "RON", defaultValue: "3700", description: "Salariul minim brut pe tara garantat in plata" },
  { key: "salariu_minim_constructii", label: "Salariu minim constructii", group: "salarii", dataType: "number", unit: "RON", defaultValue: "4582", description: "Salariul minim brut in constructii" },

  // Contributii sociale
  { key: "cas_angajat", label: "CAS angajat", group: "contributii", dataType: "percent", defaultValue: "25", description: "Contributia de asigurari sociale (pensie)" },
  { key: "cass_angajat", label: "CASS angajat", group: "contributii", dataType: "percent", defaultValue: "10", description: "Contributia de asigurari sociale de sanatate" },
  { key: "cam_angajator", label: "CAM angajator", group: "contributii", dataType: "percent", defaultValue: "2.25", description: "Contributia asiguratorie pentru munca" },
] as const;
