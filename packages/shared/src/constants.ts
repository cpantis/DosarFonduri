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
