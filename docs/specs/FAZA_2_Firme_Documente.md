# FAZA 2 — Firme & Documente
## CRUD Firme, Integrare ONRC, Bilanțuri ANAF, Arbore Documente, Upload & Stocare

**Dependențe**: Faza 1 completă (DB, Auth, Layout)

---

## 2.1 STOCARE FIȘIERE (R2/S3)

### Service Storage

```typescript
// apps/api/src/services/storage.ts
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "../db";
import { files } from "../db/schema";
import { v4 as uuid } from "uuid";

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY!,
    secretAccessKey: process.env.R2_SECRET_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET || "dosarfonduri";

export async function uploadFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  organizationId: string,
  uploadedBy: string,
): Promise<string> {
  const ext = originalName.split(".").pop() || "bin";
  const key = `${organizationId}/${uuid()}.${ext}`;

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
  }));

  const [file] = await db.insert(files).values({
    storageKey: key,
    originalName,
    mimeType,
    size: buffer.length,
    organizationId,
    uploadedBy,
  }).returning();

  return file.id;
}

export async function getFileUrl(fileId: string): Promise<string> {
  const file = await db.query.files.findFirst({
    where: (f, { eq }) => eq(f.id, fileId),
  });
  if (!file) throw new Error("File not found");

  const url = await getSignedUrl(s3, new GetObjectCommand({
    Bucket: BUCKET,
    Key: file.storageKey,
  }), { expiresIn: 900 }); // 15 min

  return url;
}

export async function getFileBuffer(fileId: string): Promise<{ buffer: Buffer; name: string; mimeType: string }> {
  const file = await db.query.files.findFirst({
    where: (f, { eq }) => eq(f.id, fileId),
  });
  if (!file) throw new Error("File not found");

  const response = await s3.send(new GetObjectCommand({
    Bucket: BUCKET,
    Key: file.storageKey,
  }));

  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as any) chunks.push(chunk);
  return {
    buffer: Buffer.concat(chunks),
    name: file.originalName,
    mimeType: file.mimeType,
  };
}

export async function deleteFile(fileId: string): Promise<void> {
  const file = await db.query.files.findFirst({
    where: (f, { eq }) => eq(f.id, fileId),
  });
  if (!file) return;

  await s3.send(new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: file.storageKey,
  }));

  await db.delete(files).where((f, { eq }) => eq(f.id, fileId));
}
```

---

## 2.2 INTEGRARE ONRC (termene.ro)

### Service ONRC

```typescript
// apps/api/src/services/onrc.ts
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
  rawData: any; // date brute complete
}

// Mapare formă juridică din text ONRC → cod intern
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

// Fallback: deduce din nr. registrul comerțului
function deduceForma(regCom: string): string {
  if (regCom.startsWith("J")) return "SRL"; // default societate
  if (regCom.startsWith("F")) return "PFA"; // default PF
  return "SRL";
}

export async function lookupCUI(
  cui: string,
  organizationId: string,
): Promise<ONRCCompanyData | null> {
  const cleanCUI = cui.replace(/\D/g, "");

  // 1. Check Redis cache
  const cached = await redis.get(`onrc:${cleanCUI}`);
  if (cached) return JSON.parse(cached);

  // 2. Get API key from org integrations
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

  // 3. Call termene.ro API
  try {
    const response = await fetch(`${integration.url}/company/${cleanCUI}`, {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`ONRC API error: ${response.status}`);
    }

    const raw = await response.json();

    // 4. Transformare în structura noastră
    const data = transformONRCData(raw);

    // 5. Cache în Redis (TTL din config)
    const syncDays = integration.syncIntervalDays || 7;
    await redis.set(`onrc:${cleanCUI}`, JSON.stringify(data), "EX", syncDays * 86400);

    return data;
  } catch (error) {
    console.error("ONRC lookup error:", error);
    throw error;
  }
}

function transformONRCData(raw: any): ONRCCompanyData {
  // Adaptează structura la API-ul real termene.ro
  // Aceasta e structura generică — va fi ajustată la formatul exact al API-ului
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

// Test conexiune API
export async function testONRCConnection(integrationId: string): Promise<{ ok: boolean; message: string }> {
  const integration = await db.query.apiIntegrations.findFirst({
    where: eq(apiIntegrations.id, integrationId),
  });
  if (!integration) return { ok: false, message: "Integrare negăsită" };

  try {
    const apiKey = decrypt(integration.apiKeyEncrypted!);
    const response = await fetch(`${integration.url}/health`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
    if (response.ok) return { ok: true, message: "Conexiune OK" };
    return { ok: false, message: `HTTP ${response.status}` };
  } catch (err: any) {
    return { ok: false, message: err.message };
  }
}
```

### Crypto Utils

```typescript
// apps/api/src/lib/crypto.ts
import crypto from "crypto";

const ALGO = "aes-256-gcm";
const KEY = Buffer.from(process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex"), "hex");

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedText.split(":");
  const decipher = crypto.createDecipheriv(ALGO, KEY, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
```

---

## 2.3 PARSARE BILANȚURI ANAF

### Service Bilanț

```typescript
// apps/api/src/services/bilantParser.ts
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

// Structura formularelor ANAF
interface F10Data {
  activeImobilizate: {
    necorporale?: number;
    corporale?: number;
    financiare?: number;
    total: number;
  };
  activeCirculante: {
    stocuri?: number;
    creante?: number;
    investitiiTS?: number;
    casa?: number;
    total: number;
  };
  cheltuieliAvans?: number;
  datoriiSubAnul?: number;
  activeCurenteNete?: number;
  totalActiveMinusDatorii?: number;
  datoriiPesteAnul?: number;
  venituriAvans?: number;
  capital: {
    subscrisVarsat?: number;
    prime?: number;
    rezerveReevaluare?: number;
    rezerve?: number;
    profitReportat?: number;
    profitExercitiu?: number;
    repartizareProfit?: number;
  };
  capitaluriProprii: number;
}

interface F20Data {
  cifraAfaceriNeta: number;
  productiaVanduta?: number;
  venituriMarfuri?: number;
  venituriExploatare: number;
  cheltuieliMaterii?: number;
  cheltuieliUtilitati?: number;
  cheltuieliMarfuri?: number;
  cheltuieliPersonal?: number;
  salarii?: number;
  asigurari?: number;
  amortizare?: number;
  alteCheltuieliExploatare?: number;
  cheltuieliExploatare: number;
  profitExploatare: number;
  venituriFinanciare?: number;
  cheltuieliFinanciare?: number;
  cheltuieliDobandi?: number;
  pierdereFinanciara?: number;
  venituriTotale: number;
  cheltuieliTotale: number;
  profitBrut: number;
  impozitProfit?: number;
  profitNet: number;
}

interface F30Data {
  numarMediuSalariati: number;
  numarEfectivSalariati?: number;
  platiRestante?: number;
  furnizoriRestanti?: number;
  datoriiPersonal?: number;
  datoriiBuget?: number;
  creanteBuget?: number;
  creanteComerciale?: number;
  dividendeDistribuite?: number;
}

interface F40Data {
  terenuri?: { soldInitial: number; cresteri: number; reduceri: number; soldFinal: number };
  constructii?: { soldInitial: number; cresteri: number; reduceri: number; soldFinal: number };
  instalatii?: { soldInitial: number; cresteri: number; reduceri: number; soldFinal: number };
  altele?: { soldInitial: number; cresteri: number; reduceri: number; soldFinal: number };
  inCurs?: { soldInitial: number; cresteri: number; reduceri: number; soldFinal: number };
  totalCorporale: { soldInitial: number; cresteri: number; reduceri: number; soldFinal: number };
  amortizareTotal: number;
}

export interface ParsedBilant {
  year: number;
  f10: F10Data;
  f20: F20Data;
  f30: F30Data;
  f40?: F40Data;
}

export async function parseBilantPDF(pdfText: string, year: number): Promise<ParsedBilant> {
  // Folosim Claude Sonnet pentru parsare structurată
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    system: `Ești un expert în contabilitate românească. Extrage datele din bilanțul ANAF în format JSON strict.
    
    IMPORTANT:
    - Valorile sunt în LEI (numere întregi, fără decimale)
    - Pierderile sunt negative
    - Dacă un câmp nu există sau e gol, omite-l (nu pune 0)
    - Respectă EXACT structura cerută
    - F10 = Bilanț prescurtat
    - F20 = Cont de Profit și Pierdere  
    - F30 = Date informative
    - F40 = Situația activelor imobilizate`,
    messages: [{
      role: "user",
      content: `Extrage datele din acest bilanț ANAF pentru anul ${year}. Returnează DOAR JSON valid, fără backticks, fără explicații.

Structura cerută:
{
  "f10": {
    "activeImobilizate": { "necorporale": number, "corporale": number, "financiare": number, "total": number },
    "activeCirculante": { "stocuri": number, "creante": number, "investitiiTS": number, "casa": number, "total": number },
    "cheltuieliAvans": number,
    "datoriiSubAnul": number,
    "datoriiPesteAnul": number,
    "venituriAvans": number,
    "capital": { "subscrisVarsat": number, "rezerve": number, "profitReportat": number, "profitExercitiu": number },
    "capitaluriProprii": number
  },
  "f20": {
    "cifraAfaceriNeta": number,
    "productiaVanduta": number,
    "venituriMarfuri": number,
    "venituriExploatare": number,
    "cheltuieliMaterii": number,
    "cheltuieliUtilitati": number,
    "cheltuieliMarfuri": number,
    "cheltuieliPersonal": number,
    "salarii": number,
    "amortizare": number,
    "cheltuieliExploatare": number,
    "profitExploatare": number,
    "cheltuieliDobandi": number,
    "venituriTotale": number,
    "cheltuieliTotale": number,
    "profitBrut": number,
    "impozitProfit": number,
    "profitNet": number
  },
  "f30": {
    "numarMediuSalariati": number,
    "numarEfectivSalariati": number,
    "platiRestante": number,
    "creanteComerciale": number,
    "dividendeDistribuite": number
  },
  "f40": {
    "terenuri": { "soldInitial": number, "cresteri": number, "reduceri": number, "soldFinal": number },
    "constructii": { "soldInitial": number, "cresteri": number, "reduceri": number, "soldFinal": number },
    "instalatii": { "soldInitial": number, "cresteri": number, "reduceri": number, "soldFinal": number },
    "totalCorporale": { "soldInitial": number, "cresteri": number, "reduceri": number, "soldFinal": number },
    "amortizareTotal": number
  }
}

TEXT BILANȚ:
${pdfText}`
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(cleaned);

  return { year, ...parsed };
}
```

---

## 2.3b EXTRAGERE FIRMĂ DIN DOCUMENT COMBINAT

### Service extractCompanyFromDocument

Consultanții uploadează adesea un singur PDF cu toate documentele firmei: certificat de înregistrare, certificat TVA, act constitutiv, rezoluție, ȘI certificat constatator ONRC. Serviciul detectează automat secțiunea certificat constatator și extrage datele structurate.

```typescript
// apps/api/src/services/companyExtractor.ts
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

interface ExtractedCompanyData {
  denumire: string;
  cui: string;
  regCom: string;
  euid?: string;
  formaJuridica: string; // "SRL", "SA", "PFA", etc.
  adresa: string;
  localitate: string;
  judet: string;
  telefon?: string;
  email?: string;
  stare: string;
  durata: string;
  anInfiintare: number;
  capitalSocial?: number;
  moneda?: string;
  partiSociale?: number;
  naturaCapital?: { privatAutohton: number; privatStrain: number; stat: number };
  asociati: Array<{
    type: "pf" | "pj";
    name: string;
    role: string;
    citizenship?: string;
    contribution?: number;
    shares?: number;
    pctBenefits?: number;
    pctLosses?: number;
  }>;
  administratori: Array<{
    name: string;
    role: string;
    powers?: string;
    mandateDuration?: string;
  }>;
  financials: Array<{
    year: number;
    cifraAfaceri: number;
    profitBrut: number;
    profitNet: number;
    angajati: number;
    angajatiEfectiv?: number;
    capitaluriProprii: number;
    activeImobilizate?: number;
    activeCirculante?: number;
  }>;
  caenPrincipal?: string;
  caenSecundare?: string[];
}

export async function extractCompanyFromDocument(pdfText: string): Promise<ExtractedCompanyData | null> {
  // Claude detectează automat certificatul constatator într-un PDF combinat
  // și extrage TOATE datele structurate

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    system: `Ești expert în documente juridice românești. Primești textul unui PDF care poate conține MULTIPLE documente:
- Certificat de înregistrare
- Certificat de înregistrare în scopuri de TVA
- Certificat de mențiuni
- Rezoluție ORC
- Act constitutiv
- CERTIFICAT CONSTATATOR ONRC (cel mai important!)

SARCINA TA:
1. Identifică secțiunea "CERTIFICAT CONSTATATOR" din text (de obicei începe cu "OFICIUL NATIONAL AL REGISTRULUI COMERTULUI" și conține "certifică informațiile referitoare la")
2. Extrage TOATE datele structurate din certificatul constatator
3. Dacă nu găsești certificat constatator, extrage ce poți din celelalte documente (certificat înregistrare, act constitutiv)

RETURNEAZĂ DOAR JSON valid, fără backticks, fără explicații.

MAPARE FORME JURIDICE (text → cod):
- "Societate cu Raspundere Limitata" / "S.R.L." → "SRL"
- "Societate pe Actiuni" / "S.A." → "SA"  
- "Persoana Fizica Autorizata" / "P.F.A." → "PFA"
- "Intreprindere Individuala" / "I.I." → "II"
- "Intreprindere Familiala" / "I.F." → "IF"

STARE FIRMĂ:
- "funcțiune" → "functiune"
- "radiată" / "dizolvată" → "radiata"`,
    messages: [{
      role: "user",
      content: `Extrage datele firmei din acest document PDF.

Returnează JSON cu structura:
{
  "denumire": "NUMELE FIRMEI",
  "cui": "1234567",
  "regCom": "J20/333/1992",
  "euid": "ROONRC.J20/333/1992",
  "formaJuridica": "SRL",
  "adresa": "Str. X, Nr. Y",
  "localitate": "Orașul",
  "judet": "Județul",
  "telefon": "0123456789",
  "email": "email@firma.ro",
  "stare": "functiune",
  "durata": "nelimitată",
  "anInfiintare": 1992,
  "capitalSocial": 1500,
  "moneda": "LEI",
  "partiSociale": 150,
  "naturaCapital": { "privatAutohton": 100, "privatStrain": 0, "stat": 0 },
  "asociati": [
    { "type": "pf", "name": "NUME PRENUME", "role": "asociat unic", "citizenship": "română", "contribution": 1500, "shares": 150, "pctBenefits": 100, "pctLosses": 100 }
  ],
  "administratori": [
    { "name": "NUME PRENUME", "role": "administrator", "powers": "DEPLINE", "mandateDuration": "Nelimitat" }
  ],
  "financials": [
    { "year": 2023, "cifraAfaceri": 33883844, "profitBrut": 6567414, "profitNet": 5294485, "angajati": 124, "angajatiEfectiv": 150, "capitaluriProprii": 27376475, "activeImobilizate": 14884913, "activeCirculante": 19482044 }
  ],
  "caenPrincipal": "0220",
  "caenSecundare": ["0111", "0112", "1610"]
}

TEXT DOCUMENT (poate avea mai multe secțiuni — găsește certificatul constatator):
${pdfText.slice(0, 80000)}`
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    const data = JSON.parse(cleaned);
    // Validare minimă
    if (!data.cui || !data.denumire) return null;
    return data;
  } catch {
    console.error("Failed to parse company extraction JSON");
    return null;
  }
}
```

### Ce detectează din PDF-ul combinat (exemplu real)

Din PDF-ul de 32 pagini uploadat (COMEXIM R SRL):
- **p.1**: Certificat de Înregistrare → CUI, denumire, CAEN, Reg. Com
- **p.2**: Certificat TVA → CIF, data TVA
- **p.3**: Certificat de Mențiuni → ultimele modificări
- **p.4**: Rezoluție → detalii juridice
- **p.5-11**: Act Constitutiv → formă juridică, capital social, asociați, obiect activitate
- **p.12-32**: **Certificat Constatator ONRC** → TOATE datele complete (identificare, asociați, administratori, CAEN, sedii, financiare 2021-2023)

Claude identifică automat secțiunea certificat constatator (cel mai bogat în date) și extrage:
- Date identificare: CUI 2146135, J20/333/1992, ROONRC.J20/333/1992
- Asociat unic: PĂRĂU EMIL ILIE, 100% beneficii/pierderi, aport 1500 LEI
- Administrator: PĂRĂU EMIL ILIE, puteri DEPLINE, mandat nelimitat
- Capital: 1500 LEI, 150 părți sociale × 10 LEI, privat autohton 100%
- Financiare 3 ani: CA 30-34M, profit net 5-10M, 124-159 angajați
- CAEN principal: 0220 Exploatarea forestieră + 100+ coduri secundare

---

## 2.4 ROUTES FIRME

```typescript
// apps/api/src/routes/companies.ts
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import {
  companies, companyAssociates, companyAdministrators,
  companyFinancials, companyIfMembers, files,
} from "../db/schema";
import { eq, and } from "drizzle-orm";
import { lookupCUI } from "../services/onrc";
import { uploadFile, getFileBuffer } from "../services/storage";
import { parseBilantPDF } from "../services/bilantParser";
import { extractTextFromPDF } from "../services/ocr";
import { AuthContext } from "../middleware/auth";

export const companyRoutes = new Hono();

// ─── LISTA FIRME ───
companyRoutes.get("/", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);

  const result = await db.query.companies.findMany({
    where: eq(companies.organizationId, auth.organizationId),
    orderBy: (companies, { desc }) => [desc(companies.updatedAt)],
  });

  return c.json(result);
});

// ─── DETALII FIRMĂ ───
companyRoutes.get("/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, id), eq(companies.organizationId, auth.organizationId!)),
  });
  if (!company) return c.json({ error: "Not found" }, 404);

  const associates = await db.query.companyAssociates.findMany({
    where: eq(companyAssociates.companyId, id),
  });

  const admins = await db.query.companyAdministrators.findMany({
    where: eq(companyAdministrators.companyId, id),
  });

  const financials = await db.query.companyFinancials.findMany({
    where: eq(companyFinancials.companyId, id),
    orderBy: (f, { desc }) => [desc(f.year)],
  });

  let ifMembers = undefined;
  if (company.formaJuridica === "IF") {
    ifMembers = await db.query.companyIfMembers.findMany({
      where: eq(companyIfMembers.companyId, id),
    });
  }

  return c.json({
    ...company,
    asociatiPF: associates.filter(a => a.type === "pf"),
    asociatiPJ: associates.filter(a => a.type === "pj"),
    administratori: admins,
    financials,
    ifMembers,
  });
});

// ─── ADAUGĂ FIRMĂ (CUI automat) ───
const addByCUISchema = z.object({
  cui: z.string().min(4),
  mode: z.literal("auto"),
});

// ─── ADAUGĂ FIRMĂ (Manual upload ONRC) ───
const addManualSchema = z.object({
  mode: z.literal("manual"),
  formaJuridica: z.string(),
});

companyRoutes.post("/", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);

  const contentType = c.req.header("Content-Type") || "";

  if (contentType.includes("multipart/form-data")) {
    // Manual upload — poate fi certificat constatator singur sau PDF combinat
    // (certificat înregistrare + certificat TVA + act constitutiv + certificat constatator)
    const formData = await c.req.formData();
    const mode = formData.get("mode") as string;
    const file = formData.get("file") as File;

    if (!file) return c.json({ error: "Fișier lipsă" }, 400);

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileId = await uploadFile(buffer, file.name, file.type, auth.organizationId, auth.userId);

    // Extrage text din PDF
    const pdfText = await extractTextFromPDF(buffer);

    // Extrage date firmă cu Claude (detectează automat certificatul constatator)
    const companyData = await extractCompanyFromDocument(pdfText);

    if (!companyData) {
      return c.json({ error: "Nu s-au putut extrage date din document. Asigură-te că PDF-ul conține un certificat constatator ONRC." }, 400);
    }

    // Check duplicat
    const existing = await db.query.companies.findFirst({
      where: and(
        eq(companies.cui, companyData.cui),
        eq(companies.organizationId, auth.organizationId),
      ),
    });
    if (existing) return c.json({ error: "Firma cu CUI " + companyData.cui + " există deja" }, 400);

    // Creează firma cu date extrase
    const [company] = await db.insert(companies).values({
      organizationId: auth.organizationId,
      formaJuridica: companyData.formaJuridica as any,
      denumire: companyData.denumire,
      cui: companyData.cui,
      regCom: companyData.regCom,
      euid: companyData.euid,
      adresa: companyData.adresa,
      localitate: companyData.localitate,
      judet: companyData.judet,
      telefon: companyData.telefon,
      email: companyData.email,
      stare: companyData.stare as any,
      durata: companyData.durata,
      anInfiintare: companyData.anInfiintare,
      capitalSocial: companyData.capitalSocial?.toString(),
      moneda: companyData.moneda,
      partiSociale: companyData.partiSociale,
      naturaCapital: companyData.naturaCapital,
      certificatFileId: fileId,
      createdBy: auth.userId,
    }).returning();

    // Inserare asociați
    if (companyData.asociati?.length > 0) {
      await db.insert(companyAssociates).values(
        companyData.asociati.map((a: any) => ({
          companyId: company.id,
          type: a.type,
          name: a.name,
          role: a.role,
          citizenshipOrCountry: a.citizenship,
          contribution: a.contribution?.toString(),
          shares: a.shares,
          pctBenefits: a.pctBenefits?.toString(),
          pctLosses: a.pctLosses?.toString(),
        }))
      );
    }

    // Inserare administratori
    if (companyData.administratori?.length > 0) {
      await db.insert(companyAdministrators).values(
        companyData.administratori.map((a: any) => ({
          companyId: company.id,
          name: a.name,
          role: a.role,
          powers: a.powers,
          mandateDuration: a.mandateDuration,
        }))
      );
    }

    // Inserare situații financiare (din certificat constatator)
    if (companyData.financials?.length > 0) {
      await db.insert(companyFinancials).values(
        companyData.financials.map((f: any) => ({
          companyId: company.id,
          year: f.year,
          source: "onrc" as const,
          f10: { capitaluriProprii: f.capitaluriProprii, activeImobilizate: { total: f.activeImobilizate }, activeCirculante: { total: f.activeCirculante } },
          f20: { cifraAfaceriNeta: f.cifraAfaceri, profitBrut: f.profitBrut, profitNet: f.profitNet },
          f30: { numarMediuSalariati: f.angajati, numarEfectivSalariati: f.angajatiEfectiv },
        }))
      );
    }

    return c.json(company, 201);
  }

  // Auto mode (CUI lookup)
  const body = addByCUISchema.parse(await c.req.json());

  // Check duplicat
  const existing = await db.query.companies.findFirst({
    where: and(
      eq(companies.cui, body.cui.replace(/\D/g, "")),
      eq(companies.organizationId, auth.organizationId),
    ),
  });
  if (existing) return c.json({ error: "Firma cu acest CUI există deja" }, 400);

  // Lookup ONRC
  const onrcData = await lookupCUI(body.cui, auth.organizationId);
  if (!onrcData) return c.json({ error: "CUI-ul nu a fost găsit" }, 404);

  // Inserare firmă
  const [company] = await db.insert(companies).values({
    organizationId: auth.organizationId,
    formaJuridica: (onrcData.rawData.forma_organizare
      ? Object.entries(FORMA_MAP).find(([k]) => onrcData.rawData.forma_organizare.includes(k))?.[1]
      : "SRL") as any,
    denumire: onrcData.denumire,
    cui: onrcData.cui,
    regCom: onrcData.regCom,
    euid: onrcData.euid,
    adresa: onrcData.adresa,
    localitate: onrcData.localitate,
    judet: onrcData.judet,
    codPostal: onrcData.codPostal,
    telefon: onrcData.telefon,
    email: onrcData.email,
    website: onrcData.website,
    stare: onrcData.stare.includes("radia") ? "radiata" : "functiune" as any,
    durata: onrcData.durata,
    anInfiintare: onrcData.anInfiintare,
    capitalSocial: onrcData.capitalSocial?.toString(),
    moneda: onrcData.moneda,
    partiSociale: onrcData.partiSociale,
    actiuni: onrcData.actiuni,
    valoareParte: onrcData.valoareParte?.toString(),
    valoareActiune: onrcData.valoareActiune?.toString(),
    naturaCapital: onrcData.naturaCapital,
    onrcRawData: onrcData.rawData,
    lastSyncedAt: new Date(),
    createdBy: auth.userId,
  }).returning();

  // Inserare asociați PF
  if (onrcData.asociatiPF.length > 0) {
    await db.insert(companyAssociates).values(
      onrcData.asociatiPF.map(a => ({
        companyId: company.id,
        type: "pf" as const,
        name: a.nume,
        role: a.calitate,
        citizenshipOrCountry: a.cetatenie,
        contribution: a.aport?.toString(),
        shares: a.partiSociale || a.actiuni,
        pctBenefits: a.cotaBeneficii?.toString(),
        pctLosses: a.cotaPierderi?.toString(),
        tipAsociat: a.tipAsociat,
      }))
    );
  }

  // Inserare asociați PJ
  if (onrcData.asociatiPJ.length > 0) {
    await db.insert(companyAssociates).values(
      onrcData.asociatiPJ.map(a => ({
        companyId: company.id,
        type: "pj" as const,
        name: a.denumire,
        role: a.calitate,
        citizenshipOrCountry: a.tara,
        contribution: a.aport?.toString(),
        shares: a.partiSociale || a.actiuni,
        pctBenefits: a.cotaBeneficii?.toString(),
        pctLosses: a.cotaPierderi?.toString(),
      }))
    );
  }

  // Inserare administratori
  if (onrcData.administratori.length > 0) {
    await db.insert(companyAdministrators).values(
      onrcData.administratori.map(a => ({
        companyId: company.id,
        name: a.nume,
        role: a.functie,
        powers: a.puteri,
        mandateDuration: a.durataMandatLabel,
        appointmentDate: a.dataNumirii,
      }))
    );
  }

  // Inserare situații financiare ONRC
  if (onrcData.situatiiFinanciare.length > 0) {
    await db.insert(companyFinancials).values(
      onrcData.situatiiFinanciare.map(s => ({
        companyId: company.id,
        year: s.an,
        source: "onrc" as const,
        f20: { cifraAfaceriNeta: s.cifraAfaceri, profitNet: s.profitNet },
        f30: { numarMediuSalariati: s.angajati },
        f10: s.capitaluriProprii ? { capitaluriProprii: s.capitaluriProprii } : undefined,
      }))
    );
  }

  return c.json(company, 201);
});

// ─── SYNC ONRC ───
companyRoutes.post("/:id/sync-onrc", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, id), eq(companies.organizationId, auth.organizationId!)),
  });
  if (!company) return c.json({ error: "Not found" }, 404);

  const onrcData = await lookupCUI(company.cui, auth.organizationId!);
  if (!onrcData) return c.json({ error: "CUI negăsit la ONRC" }, 404);

  // Update firmă cu date noi
  await db.update(companies).set({
    denumire: onrcData.denumire,
    adresa: onrcData.adresa,
    localitate: onrcData.localitate,
    judet: onrcData.judet,
    telefon: onrcData.telefon,
    email: onrcData.email,
    stare: onrcData.stare.includes("radia") ? "radiata" : "functiune" as any,
    onrcRawData: onrcData.rawData,
    lastSyncedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(companies.id, id));

  return c.json({ ok: true, message: "Sincronizare completă" });
});

// ─── UPLOAD BILANȚ ANAF ───
companyRoutes.post("/:id/upload-bilant", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, id), eq(companies.organizationId, auth.organizationId!)),
  });
  if (!company) return c.json({ error: "Not found" }, 404);

  const formData = await c.req.formData();
  const file = formData.get("file") as File;
  const year = parseInt(formData.get("year") as string);
  if (!file || !year) return c.json({ error: "Fișier și an sunt obligatorii" }, 400);

  // Upload PDF
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileId = await uploadFile(buffer, file.name, file.type, auth.organizationId!, auth.userId);

  // Extrage text din PDF
  const pdfText = await extractTextFromPDF(buffer);

  // Parsează cu Claude
  const parsed = await parseBilantPDF(pdfText, year);

  // Salvare sau actualizare
  const existing = await db.query.companyFinancials.findFirst({
    where: and(eq(companyFinancials.companyId, id), eq(companyFinancials.year, year)),
  });

  if (existing) {
    await db.update(companyFinancials).set({
      source: "anaf_upload",
      fileId,
      f10: parsed.f10,
      f20: parsed.f20,
      f30: parsed.f30,
      f40: parsed.f40,
      processedAt: new Date(),
    }).where(eq(companyFinancials.id, existing.id));
  } else {
    await db.insert(companyFinancials).values({
      companyId: id,
      year,
      source: "anaf_upload",
      fileId,
      f10: parsed.f10,
      f20: parsed.f20,
      f30: parsed.f30,
      f40: parsed.f40,
      processedAt: new Date(),
    });
  }

  return c.json({ ok: true, year, parsed });
});

// ─── BILANȚURI PER AN ───
companyRoutes.get("/:id/financials", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const financials = await db.query.companyFinancials.findMany({
    where: and(eq(companyFinancials.companyId, id)),
    orderBy: (f, { desc }) => [desc(f.year)],
  });

  return c.json(financials);
});

// ─── EDITARE FIRMĂ ───
companyRoutes.put("/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");
  const body = await c.req.json();

  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, id), eq(companies.organizationId, auth.organizationId!)),
  });
  if (!company) return c.json({ error: "Not found" }, 404);

  const [updated] = await db.update(companies).set({
    ...body,
    updatedAt: new Date(),
  }).where(eq(companies.id, id)).returning();

  return c.json(updated);
});

// ─── ȘTERGERE FIRMĂ ───
companyRoutes.delete("/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  // Verificare: doar admin poate șterge
  if (auth.role !== "admin") return c.json({ error: "Doar administratorul poate șterge firme" }, 403);

  await db.delete(companies).where(
    and(eq(companies.id, id), eq(companies.organizationId, auth.organizationId!))
  );

  return c.json({ ok: true });
});
```

---

## 2.5 OCR SERVICE

```typescript
// apps/api/src/services/ocr.ts
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

// Extrage text din PDF folosind PyMuPDF (gratuit, rapid)
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  // Variantă 1: PyMuPDF via child_process (recomandat)
  const { execSync } = await import("child_process");
  const fs = await import("fs");
  const os = await import("os");
  const path = await import("path");

  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `pdf_${Date.now()}.pdf`);
  fs.writeFileSync(inputPath, buffer);

  try {
    // Script Python cu PyMuPDF
    const script = `
import fitz, sys, json
doc = fitz.open(sys.argv[1])
pages = []
for page in doc:
    text = page.get_text()
    pages.append({"page": page.number + 1, "text": text, "has_text": len(text.strip()) > 50})
doc.close()
print(json.dumps(pages))
`;
    const scriptPath = path.join(tmpDir, `extract_${Date.now()}.py`);
    fs.writeFileSync(scriptPath, script);

    const result = execSync(`python3 ${scriptPath} ${inputPath}`, {
      encoding: "utf-8",
      timeout: 30000,
    });

    const pages: Array<{ page: number; text: string; has_text: boolean }> = JSON.parse(result);

    // Pagini scanate (fără text nativ) → Claude Vision OCR
    const scannedPages = pages.filter(p => !p.has_text);
    if (scannedPages.length > 0) {
      // TODO: Claude Vision OCR pentru pagini scanate
      // Pentru MVP, raportăm paginile fără text
      console.warn(`${scannedPages.length} pagini scanate detectate - OCR Vision necesar`);
    }

    // Returnează textul complet
    return pages.map(p => `--- Pagina ${p.page} ---\n${p.text}`).join("\n\n");
  } finally {
    fs.unlinkSync(inputPath);
  }
}

// OCR cu Claude Vision pentru o pagină scanată (fallback)
export async function ocrPageWithVision(pageImageBase64: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: "image/png", data: pageImageBase64 },
        },
        {
          type: "text",
          text: "Extrage tot textul din această imagine de document. Păstrează structura originală (tabele, coloane, paragrafe). Returnează doar textul, fără explicații.",
        },
      ],
    }],
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}

// Extrage text din DOCX (python-docx)
export async function extractTextFromDOCX(buffer: Buffer, fileName: string): Promise<string> {
  const { execSync } = await import("child_process");
  const fs = await import("fs");
  const os = await import("os");
  const path = await import("path");

  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `docx_${Date.now()}_${fileName}`);
  fs.writeFileSync(inputPath, buffer);

  const script = `
import sys
from docx import Document

doc = Document(sys.argv[1])
pages = []
current_page = []
page_num = 1

for para in doc.paragraphs:
    text = para.text
    current_page.append(text)
    # Detectare page break
    for run in para.runs:
        if 'w:br' in run._element.xml and 'type="page"' in run._element.xml:
            pages.append(f"--- Pagina {page_num} ---\\n" + "\\n".join(current_page))
            page_num += 1
            current_page = []

# Ultima pagină
if current_page:
    pages.append(f"--- Pagina {page_num} ---\\n" + "\\n".join(current_page))

# Adaugă și tabelele
for table in doc.tables:
    rows = []
    for row in table.rows:
        cells = [cell.text.strip() for cell in row.cells]
        rows.append(" | ".join(cells))
    pages.append("\\n[TABEL]\\n" + "\\n".join(rows) + "\\n[/TABEL]")

print("\\n\\n".join(pages))
`;

  const scriptPath = path.join(tmpDir, `extract_docx_${Date.now()}.py`);
  fs.writeFileSync(scriptPath, script);

  try {
    return execSync(`python3 ${scriptPath} ${inputPath}`, {
      encoding: "utf-8",
      timeout: 30000,
    });
  } finally {
    fs.unlinkSync(inputPath);
    fs.unlinkSync(scriptPath);
  }
}

// Extrage text din XLSX (openpyxl)
export async function extractTextFromXLSX(buffer: Buffer, fileName: string): Promise<string> {
  const { execSync } = await import("child_process");
  const fs = await import("fs");
  const os = await import("os");
  const path = await import("path");

  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `xlsx_${Date.now()}_${fileName}`);
  fs.writeFileSync(inputPath, buffer);

  const script = `
import sys
import openpyxl

wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
output = []

for sheet_name in wb.sheetnames:
    ws = wb[sheet_name]
    output.append(f"--- Sheet: {sheet_name} ---")
    for row in ws.iter_rows(values_only=True):
        cells = [str(c) if c is not None else "" for c in row]
        if any(c.strip() for c in cells):  # skip empty rows
            output.append(" | ".join(cells))

print("\\n".join(output))
`;

  const scriptPath = path.join(tmpDir, `extract_xlsx_${Date.now()}.py`);
  fs.writeFileSync(scriptPath, script);

  try {
    return execSync(`python3 ${scriptPath} ${inputPath}`, {
      encoding: "utf-8",
      timeout: 30000,
    });
  } finally {
    fs.unlinkSync(inputPath);
    fs.unlinkSync(scriptPath);
  }
}
```

---

## 2.6 ROUTES DOCUMENTE & FOLDERE

```typescript
// apps/api/src/routes/documents.ts
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { documentFolders, documents } from "../db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { uploadFile, getFileUrl, deleteFile } from "../services/storage";
import { AuthContext } from "../middleware/auth";
import { processGuideQueue, processTemplateQueue } from "../lib/queue";

export const documentRoutes = new Hono();

// ─── ARBORE FOLDERE ───
documentRoutes.get("/folders", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);

  const folders = await db.query.documentFolders.findMany({
    where: eq(documentFolders.organizationId, auth.organizationId),
    orderBy: (f, { asc }) => [asc(f.position)],
  });

  // Construiește arbore recursiv
  const buildTree = (parentId: string | null): any[] => {
    return folders
      .filter(f => (parentId === null ? f.parentId === null : f.parentId === parentId))
      .map(f => ({
        ...f,
        children: buildTree(f.id),
      }));
  };

  return c.json(buildTree(null));
});

// ─── CREARE FOLDER ───
const folderSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["program", "masura", "sesiune", "ghiduri", "templateuri", "clienti_prospecti", "clienti_finali"]),
  parentId: z.string().uuid().nullable(),
});

documentRoutes.post("/folders", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const body = folderSchema.parse(await c.req.json());

  // Calculează poziția (ultimul din parent)
  const siblings = await db.query.documentFolders.findMany({
    where: and(
      eq(documentFolders.organizationId, auth.organizationId!),
      body.parentId ? eq(documentFolders.parentId, body.parentId) : isNull(documentFolders.parentId),
    ),
  });

  const [folder] = await db.insert(documentFolders).values({
    organizationId: auth.organizationId!,
    parentId: body.parentId,
    name: body.name,
    type: body.type,
    position: siblings.length,
    createdBy: auth.userId,
  }).returning();

  return c.json(folder, 201);
});

// ─── REDENUMIRE FOLDER ───
documentRoutes.put("/folders/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");
  const { name } = await c.req.json();

  const [updated] = await db.update(documentFolders).set({ name }).where(
    and(eq(documentFolders.id, id), eq(documentFolders.organizationId, auth.organizationId!))
  ).returning();

  return c.json(updated);
});

// ─── ȘTERGERE FOLDER (cu tot conținutul) ───
documentRoutes.delete("/folders/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  // Ștergere recursivă (cascade pe FK)
  await db.delete(documentFolders).where(
    and(eq(documentFolders.id, id), eq(documentFolders.organizationId, auth.organizationId!))
  );

  return c.json({ ok: true });
});

// ─── UPLOAD DOCUMENT ───
documentRoutes.post("/folders/:folderId/documents", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const folderId = c.req.param("folderId");

  // Verifică folder-ul
  const folder = await db.query.documentFolders.findFirst({
    where: and(eq(documentFolders.id, folderId), eq(documentFolders.organizationId, auth.organizationId!)),
  });
  if (!folder) return c.json({ error: "Folder not found" }, 404);

  const formData = await c.req.formData();
  const file = formData.get("file") as File;
  const tags = (formData.get("tags") as string || "").split(",").filter(Boolean);

  if (!file) return c.json({ error: "Fișier lipsă" }, 400);

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileId = await uploadFile(buffer, file.name, file.type, auth.organizationId!, auth.userId);

  // Detectare tip fișier
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const fileType = ext === "pdf" ? "pdf" : ext === "xlsx" || ext === "xls" ? "xlsx" : ext === "doc" ? "doc" : "docx";

  // Detectare processing type pe baza tipului folder-ului
  const processingType = folder.type === "ghiduri" ? "ghid"
    : folder.type === "templateuri" ? "template"
    : "reference";

  const [doc] = await db.insert(documents).values({
    folderId,
    organizationId: auth.organizationId!,
    name: file.name.replace(/\.[^.]+$/, ""), // fără extensie
    fileType: fileType as any,
    fileId,
    fileSize: buffer.length,
    status: "uploaded",
    processingType: processingType as any,
    tags,
    uploadedBy: auth.userId,
  }).returning();

  // Auto-procesare dacă e ghid sau template
  if (processingType === "ghid") {
    await processGuideQueue.add("process-guide", {
      documentId: doc.id,
      organizationId: auth.organizationId!,
    });
  } else if (processingType === "template") {
    await processTemplateQueue.add("process-template", {
      documentId: doc.id,
      organizationId: auth.organizationId!,
    });
  }

  return c.json(doc, 201);
});

// ─── DETALII DOCUMENT ───
documentRoutes.get("/documents/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, id), eq(documents.organizationId, auth.organizationId!)),
  });
  if (!doc) return c.json({ error: "Not found" }, 404);

  const downloadUrl = await getFileUrl(doc.fileId);

  return c.json({ ...doc, downloadUrl });
});

// ─── ȘTERGERE DOCUMENT ───
documentRoutes.delete("/documents/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, id), eq(documents.organizationId, auth.organizationId!)),
  });
  if (!doc) return c.json({ error: "Not found" }, 404);

  // Ștergere fișier din storage
  await deleteFile(doc.fileId);

  // Ștergere document din DB (cascade șterge reguli + elemente)
  await db.delete(documents).where(eq(documents.id, id));

  return c.json({ ok: true });
});

// ─── PROCESARE MANUALĂ ───
documentRoutes.post("/documents/:id/process", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, id), eq(documents.organizationId, auth.organizationId!)),
  });
  if (!doc) return c.json({ error: "Not found" }, 404);

  // Update status
  await db.update(documents).set({ status: "processing" }).where(eq(documents.id, id));

  // Adaugă în queue
  if (doc.processingType === "ghid") {
    await processGuideQueue.add("process-guide", {
      documentId: doc.id,
      organizationId: auth.organizationId!,
    });
  } else if (doc.processingType === "template") {
    await processTemplateQueue.add("process-template", {
      documentId: doc.id,
      organizationId: auth.organizationId!,
    });
  }

  return c.json({ ok: true, message: "Procesare pornită" });
});
```

---

## 2.7 BULLMQ QUEUE SETUP

```typescript
// apps/api/src/lib/queue.ts
import { Queue } from "bullmq";
import { redis } from "./redis";

const connection = { host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT || "6379") };

export const processGuideQueue = new Queue("process-guide", { connection });
export const processTemplateQueue = new Queue("process-template", { connection });
export const syncOnrcQueue = new Queue("sync-onrc", { connection });
```

```typescript
// apps/api/src/lib/redis.ts
import Redis from "ioredis";

export const redis = new Redis(process.env.REDIS_URL!);
```

---

## 2.8 AUDIT MIDDLEWARE

```typescript
// apps/api/src/middleware/audit.ts
import { Context, Next } from "hono";
import { db } from "../db";
import { auditLog } from "../db/schema";
import { AuthContext } from "./auth";

// Acțiuni care se loghează
const AUDIT_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

export const auditMiddleware = async (c: Context, next: Next) => {
  await next();

  if (!AUDIT_METHODS.includes(c.req.method)) return;
  
  const auth = c.get("auth") as AuthContext | undefined;
  if (!auth?.organizationId) return;

  const path = new URL(c.req.url).pathname;
  const status = c.res.status;
  if (status >= 400) return; // nu logăm erori

  // Extrage entity type din path
  const segments = path.split("/").filter(Boolean);
  const entityType = segments[1]; // companies, documents, projects, etc.

  try {
    await db.insert(auditLog).values({
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: `${c.req.method} ${path}`,
      entityType,
      details: { method: c.req.method, path, status },
    });
  } catch (err) {
    console.error("Audit log error:", err);
  }
};
```

---

## 2.9 VIZIBILITATE CONDIȚIONATĂ (Frontend)

### Hook pentru forme juridice

```typescript
// apps/web/src/hooks/useFormaJuridica.ts
import { isSOC, isPF } from "@dosarfonduri/shared/constants";

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

// Tab-uri adaptive
export function getCompanyTabs(forma: string): string[] {
  const tabs = ["General"];
  if (forma === "IF") tabs.push("Membri IF");
  else if (isPF(forma)) tabs.push("Titular");
  else tabs.push(forma === "SA" || forma === "SA_BVB" ? "Acționari" : "Asociați");
  if (isSOC(forma)) tabs.push("Administrare");
  tabs.push("Activități");
  if (isSOC(forma)) tabs.push("Sedii");
  tabs.push("Fin. ONRC", "Fin. ANAF", "Juridic");
  return tabs;
}

// Label-uri adaptive
export function getFieldLabel(field: string, forma: string): string {
  const labels: Record<string, Record<string, string>> = {
    parti_actiuni: { SA: "Acțiuni", SA_BVB: "Acțiuni", SCA: "Acțiuni", _default: "Părți sociale" },
    valoare_parte: { SA: "Val. nominală acțiune", SA_BVB: "Val. nominală acțiune", _default: "Val. parte socială" },
    asociati_label: { SA: "Acționari", SA_BVB: "Acționari", _default: "Asociați" },
    admin_label: { SA: "Consiliu de Administrație", SA_BVB: "Directorat", _default: "Administratori" },
    durata_label: { PFA: "Durată autorizare", II: "Durată autorizare", IF: "Durată IF", _default: "Durată societate" },
  };

  const fieldLabels = labels[field];
  if (!fieldLabels) return field;
  return fieldLabels[forma] || fieldLabels._default || field;
}
```

---

## 2.10 FORME JURIDICE DOCUMENT DE REFERINȚĂ

Fișierul `campuri_certificat_constatator.md` din project knowledge conține maparea completă:
- 11 forme de organizare cu detectare automată
- Vizibilitate per câmp și per secțiune
- Câmpuri care schimbă label pe formă
- Secțiuni ascunse complet per formă
- Logica de vizibilitate în cod

**Acest fișier trebuie consultat la implementarea detaliilor firmă.**

---

## 2.11 CHECKLIST FAZA 2

- [ ] Service stocare R2/S3 (upload, download presigned URL, delete)
- [ ] Service ONRC (lookupCUI cu termene.ro, cache Redis, transformare date)
- [ ] Crypto utils (encrypt/decrypt API keys)
- [ ] OCR service (PyMuPDF text extraction + Claude Vision fallback)
- [ ] Parsare bilanț ANAF (Claude Sonnet → F10/F20/F30/F40 structurat)
- [ ] Route firme: lista, detalii, adaugă (CUI auto + manual upload PDF), sync ONRC
- [ ] Service extractCompanyFromDocument: detectare certificat constatator în PDF combinat
- [ ] Extragere structurată cu Claude: identificare, asociați, admin, financiare, CAEN din cert. constatator
- [ ] Route firme: upload bilanț, financials per an, editare, ștergere
- [ ] Route documente: arbore foldere (CRUD recursiv), upload, detalii, ștergere
- [ ] Procesare automată la upload (ghid → queue, template → queue)
- [ ] BullMQ queue setup
- [ ] Audit middleware
- [ ] Frontend: pagina Firme cu tab-uri adaptive (03_Firme.jsx referință)
- [ ] Frontend: vizibilitate condiționată pe forma juridică
- [ ] Frontend: modal adaugă firmă (2 moduri: CUI auto / upload PDF combinat — detectare automată)
- [ ] Frontend: detalii firmă cu Fin. ONRC + Fin. ANAF (bilanțuri F10-F40)
- [ ] Frontend: pagina Documente cu arbore (04_Documente.jsx referință)
- [ ] Frontend: arbore cu buline progresive + iconițe nivel 4
- [ ] Frontend: context menu (click dreapta) pe foldere
- [ ] Frontend: upload documente cu auto-clasificare
