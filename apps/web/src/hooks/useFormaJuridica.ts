const SOC_CODES = ["SRL", "SA", "SNC", "SCS", "SCA", "SC", "RA", "SA_BVB"];
const PF_CODES = ["PFA", "II", "IF"];

export const isSOC = (f: string) => SOC_CODES.includes(f);
export const isPF = (f: string) => PF_CODES.includes(f);

type VisibilityRule = "ALL" | "SOC" | "PF" | string[];

const SECTION_VISIBILITY: Record<string, VisibilityRule> = {
  capital_social: "SOC",
  asociati: "SOC",
  titular: ["PFA", "II"],
  membri_if: ["IF"],
  administrare: "SOC",
  cenzori: ["SA", "SCA", "SA_BVB"],
  sedii: "SOC",
  patrimoniu_afectat: ["PFA", "II"],
};

export function isSectionVisible(section: string, forma: string): boolean {
  const rule = SECTION_VISIBILITY[section];
  if (!rule || rule === "ALL") return true;
  if (rule === "SOC") return isSOC(forma);
  if (rule === "PF") return isPF(forma);
  if (Array.isArray(rule)) return rule.includes(forma);
  return false;
}

export function getCompanyTabs(forma: string): string[] {
  const tabs = ["General"];
  if (forma === "IF") tabs.push("Membri IF");
  else if (isPF(forma)) tabs.push("Titular");
  else tabs.push(forma === "SA" || forma === "SA_BVB" ? "Actionari" : "Asociati");
  if (isSOC(forma)) tabs.push("Administrare");
  tabs.push("Activitati");
  if (isSOC(forma)) tabs.push("Sedii");
  tabs.push("Fin. ONRC", "Fin. ANAF", "Juridic");
  return tabs;
}

export function getFieldLabel(field: string, forma: string): string {
  const labels: Record<string, Record<string, string>> = {
    parti_actiuni: { SA: "Actiuni", SA_BVB: "Actiuni", SCA: "Actiuni", _default: "Parti sociale" },
    valoare_parte: { SA: "Val. nominala actiune", SA_BVB: "Val. nominala actiune", _default: "Val. parte sociala" },
    asociati_label: { SA: "Actionari", SA_BVB: "Actionari", _default: "Asociati" },
    admin_label: { SA: "Consiliu de Administratie", SA_BVB: "Directorat", _default: "Administratori" },
    durata_label: { PFA: "Durata autorizare", II: "Durata autorizare", IF: "Durata IF", _default: "Durata societate" },
  };

  const fieldLabels = labels[field];
  if (!fieldLabels) return field;
  return fieldLabels[forma] || fieldLabels._default || field;
}

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
