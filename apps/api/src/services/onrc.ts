import { db } from "../db";
import { apiIntegrations } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { redis } from "../lib/redis";
import { decrypt } from "../lib/crypto";

interface ONRCCompanyData {
  denumire: string;
  cui: string;
  regCom: string;
  euid?: string;
  formaJuridica: string;
  adresa: string;
  localitate: string;
  judet: string;
  codPostal?: string;
  telefon?: string;
  email?: string;
  website?: string;
  stare: string;
  durata: string;
  anInfiintare: number;
  capitalSocial?: number;
  moneda?: string;
  partiSociale?: number;
  actiuni?: number;
  valoareParte?: number;
  valoareActiune?: number;
  naturaCapital?: { privatAutohton: number; privatStrain: number; stat: number };
  asociatiPF: Array<{
    nume: string;
    calitate: string;
    cetatenie: string;
    aport: number;
    partiSociale?: number;
    actiuni?: number;
    cotaBeneficii: number;
    cotaPierderi: number;
    tipAsociat?: string;
  }>;
  asociatiPJ: Array<{
    denumire: string;
    calitate: string;
    tara: string;
    cui: string;
    aport: number;
    partiSociale?: number;
    actiuni?: number;
    cotaBeneficii: number;
    cotaPierderi: number;
  }>;
  administratori: Array<{
    nume: string;
    functie: string;
    puteri: string;
    durataMandatLabel: string;
    dataNumirii: string;
  }>;
  situatiiFinanciare: Array<{
    an: number;
    cifraAfaceri: number;
    profitNet: number;
    angajati: number;
    capitaluriProprii?: number;
  }>;
  rawData: any;
}

const FORMA_MAP: Record<string, string> = {
  "Societate cu Raspundere Limitata": "SRL",
  "Societate cu Răspundere Limitată": "SRL",
  "Societate pe Actiuni": "SA",
  "Societate pe Acțiuni": "SA",
  "Societate in Nume Colectiv": "SNC",
  "Societate în Nume Colectiv": "SNC",
  "Societate in Comandita Simpla": "SCS",
  "Societate în Comandită Simplă": "SCS",
  "Societate in Comandita pe Actiuni": "SCA",
  "Societate în Comandită pe Acțiuni": "SCA",
  "Persoana Fizica Autorizata": "PFA",
  "Persoană Fizică Autorizată": "PFA",
  "Intreprindere Individuala": "II",
  "Întreprindere Individuală": "II",
  "Intreprindere Familiala": "IF",
  "Întreprindere Familială": "IF",
  "Societate Cooperativa": "SC",
  "Societate Cooperativă": "SC",
  "Regie Autonoma": "RA",
  "Regie Autonomă": "RA",
};

function deduceForma(regCom: string): string {
  if (regCom.startsWith("J")) return "SRL";
  if (regCom.startsWith("F")) return "PFA";
  return "SRL";
}

export { FORMA_MAP };

export async function lookupCUI(
  cui: string,
  organizationId: string,
): Promise<ONRCCompanyData | null> {
  const cleanCUI = cui.replace(/\D/g, "");

  const cached = await redis.get(`onrc:${organizationId}:${cleanCUI}`);
  if (cached) return JSON.parse(cached);

  const integration = await db.query.apiIntegrations.findFirst({
    where: and(
      eq(apiIntegrations.organizationId, organizationId),
      eq(apiIntegrations.type, "ONRC"),
      eq(apiIntegrations.enabled, true),
    ),
  });

  if (!integration || !integration.apiKeyEncrypted) {
    throw new Error("Integrare ONRC neconfigurată. Adaugă API key în Configurări → Integrare API.");
  }

  const apiKey = decrypt(integration.apiKeyEncrypted);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response: Response;
    try {
      response = await fetch(`${integration.url}/company/${cleanCUI}`, {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`ONRC API error: ${response.status}`);
    }

    const raw = await response.json();
    const data = transformONRCData(raw);

    const syncDays = integration.syncIntervalDays || 7;
    await redis.set(`onrc:${organizationId}:${cleanCUI}`, JSON.stringify(data), "EX", syncDays * 86400);

    return data;
  } catch (error) {
    console.error("ONRC lookup error:", error);
    throw error;
  }
}

function transformONRCData(raw: any): ONRCCompanyData {
  const formaText = raw.forma_organizare || raw.forma_juridica || "";
  const formaCode = FORMA_MAP[formaText] || deduceForma(raw.nr_registrul_comertului || "");

  return {
    denumire: raw.denumire || raw.name || "",
    cui: raw.cui || raw.cif || "",
    regCom: raw.nr_registrul_comertului || raw.reg_com || "",
    euid: raw.euid,
    formaJuridica: formaText,
    adresa: raw.sediu_social?.adresa_completa || raw.address || "",
    localitate: raw.sediu_social?.localitate || "",
    judet: raw.sediu_social?.judet || "",
    codPostal: raw.sediu_social?.cod_postal || "",
    telefon: raw.contacte_sediu?.telefoane?.[0] || "",
    email: raw.contacte_sediu?.email || "",
    website: raw.contacte_sediu?.website || "",
    stare: raw.stare_firma || "funcțiune",
    durata: raw.durata_societate || "nelimitată",
    anInfiintare: parseInt(raw.data_atribuire_rc?.slice(0, 4) || "0"),
    capitalSocial: raw.capital_social?.capital_subscris,
    moneda: raw.capital_social?.moneda || "RON",
    partiSociale: raw.capital_social?.numar_parti_sociale,
    actiuni: raw.capital_social?.numar_actiuni,
    valoareParte: raw.capital_social?.valoare_parte_sociala,
    valoareActiune: raw.capital_social?.valoare_nominala_actiune,
    naturaCapital: raw.capital_social?.natura_capital ? {
      privatAutohton: raw.capital_social.natura_capital.privat_autohton_pct || 0,
      privatStrain: raw.capital_social.natura_capital.privat_strain_pct || 0,
      stat: raw.capital_social.natura_capital.stat_pct || 0,
    } : undefined,
    asociatiPF: (raw.asociati_persoane_fizice || []).map((a: any) => ({
      nume: a.nume_prenume,
      calitate: a.calitate,
      cetatenie: a.cetatenie,
      aport: a.aport_capital,
      partiSociale: a.numar_parti_sociale,
      actiuni: a.numar_actiuni,
      cotaBeneficii: a.cota_beneficii_pct,
      cotaPierderi: a.cota_pierderi_pct,
      tipAsociat: a.tip_asociat,
    })),
    asociatiPJ: (raw.asociati_persoane_juridice || []).map((a: any) => ({
      denumire: a.denumire,
      calitate: a.calitate,
      tara: a.tara,
      cui: a.cui_cod_fiscal,
      aport: a.aport_capital,
      partiSociale: a.numar_parti_sociale,
      actiuni: a.numar_actiuni,
      cotaBeneficii: a.cota_beneficii_pct,
      cotaPierderi: a.cota_pierderi_pct,
    })),
    administratori: (raw.persoane_imputernicite_pf || []).map((a: any) => ({
      nume: a.nume_prenume,
      functie: a.functie || a.calitate,
      puteri: a.puteri,
      durataMandatLabel: a.durata_mandat || "nelimitată",
      dataNumirii: a.data_numirii,
    })),
    situatiiFinanciare: (raw.situatii_financiare || []).map((s: any) => ({
      an: s.an,
      cifraAfaceri: s.cifra_afaceri_neta,
      profitNet: s.profit_net || -(s.pierdere_neta || 0),
      angajati: s.numar_mediu_salariati,
      capitaluriProprii: s.capitaluri_proprii_total,
    })),
    rawData: raw,
  };
}

export async function testONRCConnection(integrationId: string): Promise<{ ok: boolean; message: string }> {
  const integration = await db.query.apiIntegrations.findFirst({
    where: eq(apiIntegrations.id, integrationId),
  });
  if (!integration) return { ok: false, message: "Integrare negăsită" };

  try {
    const apiKey = decrypt(integration.apiKeyEncrypted!);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response: Response;
    try {
      response = await fetch(`${integration.url}/health`, {
        headers: { "Authorization": `Bearer ${apiKey}` },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (response.ok) return { ok: true, message: "Conexiune OK" };
    return { ok: false, message: `HTTP ${response.status}` };
  } catch (err: any) {
    return { ok: false, message: err.message };
  }
}
