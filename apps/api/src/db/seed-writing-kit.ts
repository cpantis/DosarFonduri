/**
 * Seed script — inserts Neemia Writing Kit entries into solomonKnowledge.
 *
 * Usage:
 *   npx tsx src/db/seed-writing-kit.ts
 *
 * These are global entries (organizationId = null) used by Neemia COMPOSE
 * to generate professional EU-funding documents.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "./schema";

const WRITING_KIT_ENTRIES = [
  {
    category: "wk_terminology",
    title: "Vocabular profesional fonduri europene",
    content: JSON.stringify({
      translations: [
        { bad: "vrem să cumpărăm un tractor",
          good: "Investiția vizează achiziția de utilaje agricole moderne în vederea modernizării exploatației și creșterii competitivității" },
        { bad: "avem nevoie",
          good: "Necesitatea investiției este fundamentată de..." },
        { bad: "vom face mai mulți bani",
          good: "Implementarea proiectului va conduce la creșterea valorii adăugate brute a exploatației cu X%, contribuind la îmbunătățirea performanței economice" },
        { bad: "e bine pentru fermă",
          good: "Proiectul contribuie la realizarea obiectivelor submăsurii 4.1, respectiv restructurarea și modernizarea exploatațiilor agricole" },
        { bad: "va merge bine",
          good: "Sustenabilitatea investiției este asigurată prin prognoza economico-financiară care demonstrează viabilitatea pe termen mediu și lung" },
        { bad: "nu poluăm",
          good: "Investiția respectă principiile dezvoltării durabile și contribuie la reducerea amprentei de carbon prin utilizarea tehnologiilor de ultimă generație" },
        { bad: "fermă mică",
          good: "Exploatație agricolă cu dimensiunea economică de X.XXX SO, încadrată în categoria fermelor de familie conform PNDR 2014-2020" },
      ],
    }),
    priority: 10,
  },
  {
    category: "wk_keywords_eligibility",
    title: "Keywords evaluator — eligibilitate",
    content: JSON.stringify({
      phrases: [
        "Solicitantul se încadrează în categoria beneficiarilor eligibili conform...",
        "Investiția se realizează în cadrul unei exploatații cu dimensiunea economică de...",
        "Activitățile agricole sunt desfășurate pe teritoriul României...",
        "Solicitantul demonstrează capacitatea de cofinanțare a investiției...",
      ],
    }),
    priority: 9,
  },
  {
    category: "wk_keywords_necessity",
    title: "Keywords evaluator — necesitate și oportunitate",
    content: JSON.stringify({
      phrases: [
        "Necesitatea investiției este fundamentată de analiza situației existente...",
        "Exploatația se confruntă cu un deficit de mecanizare care...",
        "Lipsa echipamentelor moderne conduce la costuri operaționale ridicate...",
        "Investiția răspunde direct nevoilor identificate în strategia de dezvoltare...",
      ],
    }),
    priority: 9,
  },
  {
    category: "wk_keywords_objectives",
    title: "Keywords evaluator — contribuția la obiectivele programului",
    content: JSON.stringify({
      phrases: [
        "Proiectul contribuie la Domeniul de Intervenție 2A...",
        "...îmbunătățirea performanțelor generale ale exploatației agricole...",
        "...creșterea competitivității activității agricole...",
        "...restructurarea exploatațiilor de dimensiuni mici și medii...",
        "...respectarea standardelor comunitare aplicabile...",
      ],
    }),
    priority: 9,
  },
  {
    category: "wk_keywords_impact",
    title: "Keywords evaluator — impact și rezultate",
    content: JSON.stringify({
      phrases: [
        "Implementarea proiectului va genera următoarele rezultate măsurabile...",
        "Valoarea adăugată brută a exploatației va crește de la X la Y...",
        "Productivitatea muncii va înregistra o creștere de X%...",
        "Costurile de producție se vor reduce cu aproximativ X%...",
        "Capacitatea de producție va crește de la X la Y tone/hectare...",
      ],
    }),
    priority: 9,
  },
  {
    category: "wk_keywords_sustainability",
    title: "Keywords evaluator — sustenabilitate",
    content: JSON.stringify({
      phrases: [
        "Viabilitatea economică a investiției este demonstrată prin indicatorii economico-financiari...",
        "Proiectul este sustenabil pe termen lung, beneficiarul dispunând de...",
        "Prognoza economico-financiară confirmă capacitatea de menținere a investiției pe durata de monitorizare...",
      ],
    }),
    priority: 9,
  },
  {
    category: "wk_keywords_environment",
    title: "Keywords evaluator — mediu și climă",
    content: JSON.stringify({
      phrases: [
        "Investiția contribuie la îndeplinirea condiționalităților de mediu și climă...",
        "Utilajele propuse implementează tehnologia no tillage/minimum tillage...",
        "Reducerea lucrărilor solului contribuie la conservarea structurii și biodiversității...",
        "...conforme cu normele Euro Stage V privind emisiile...",
      ],
    }),
    priority: 9,
  },
  {
    category: "wk_scoring_keywords",
    title: "Keywords per criteriu de selecție",
    content: JSON.stringify({
      P1_dimensiune: ["fermă de familie", "dimensiune economică", "SO",
        "exploatație de dimensiuni mici/medii", "restructurare"],
      P2_asociere: ["formă asociativă", "cooperativă", "grup de producători",
        "organizație de producători", "membru acționar"],
      P3_mediu: ["no tillage", "minimum tillage", "strip tillage",
        "agricultură conservativă", "condiționalități de mediu și climă",
        "PS PAC 2023-2027", "conservarea structurii solului"],
      P4_vechime: ["experiență în domeniul agroalimentar",
        "activitate continuă", "stabilitate economică",
        "cifra de afaceri netă", "venituri din sectorul agroalimentar"],
      P5_acces: ["nu a beneficiat de finanțare anterioară",
        "acces echitabil la fonduri", "prima accesare FEADR"],
      P6_ecologic: ["agricultură ecologică", "conversie", "certificare bio",
        "organism de inspecție și certificare"],
      P7_calificare: ["studii superioare în domeniul agricol",
        "pregătire profesională", "competențe managementul exploatației"],
      intensity_tanar: ["instalat ca șef de exploatație", "control efectiv",
        "asociat unic/majoritar", "administrator unic", "sub 41 ani"],
      intensity_eco: ["angajament M.10", "DR-02", "DR-01",
        "suprafață sub angajament > 50%"],
      intensity_anc: ["zone cu constrângeri naturale", "ANC ZM",
        "ANC SEMN", "ANC SPEC", "art. 32 R(UE) 1305/2013"],
    }),
    priority: 8,
  },
  {
    category: "wk_section_structures",
    title: "Structuri secțiuni documente",
    content: JSON.stringify({
      memoriu_justificativ: {
        sections: [
          { id: "prezentare", title: "Prezentarea solicitantului",
            elements_needed: ["denumire_firma", "forma_juridica", "cui",
              "adresa_sediu", "caen_principal", "dimensiune_so", "suprafata_totala"] },
          { id: "descriere_investitie", title: "Descrierea investiției",
            elements_needed: ["lista_utilaje", "valoare_totala", "valoare_eligibila",
              "valoare_nerambursabila", "intensitate", "cofinantare_privata"] },
          { id: "necesitate", title: "Necesitatea și oportunitatea investiției",
            elements_needed: ["context_local", "probleme_identificate",
              "solutia_propusa", "impact_lipsa_investitie"] },
          { id: "contributie_obiective", title: "Contribuția la obiectivele programului",
            elements_needed: ["di_2a", "modernizare", "competitivitate"] },
          { id: "impact_mediu", title: "Impactul asupra mediului",
            elements_needed: ["tehnologie_till", "norme_euro", "eficienta_energetica"] },
          { id: "sustenabilitate", title: "Sustenabilitatea proiectului",
            elements_needed: ["indicatori_financiari", "prognoza_5_ani",
              "capacitate_mentinere"] },
        ],
      },
      descriere_succinta: {
        pattern: "5 paragrafe: CINE+CE → DE CE → CUM → IMPACT → SUSTENABILITATE",
      },
    }),
    priority: 8,
  },
  {
    category: "wk_writing_rules",
    title: "Reguli de redactare Neemia",
    content: JSON.stringify({
      tone: "Formal dar accesibil — nu birocratic excesiv",
      rules: [
        "Fiecare afirmație susținută de date concrete (cifre, referințe)",
        "Evită repetiția — nu repeta aceeași idee în paragrafe diferite",
        "Paragrafele au 3-5 propoziții, nu mai mult",
        "NU folosi superlative nejustificate (cel mai modern, extraordinar)",
        "Numere formatate RO: 1.234.567,89 RON",
        "Referințe la ghid: conform secțiunii X.Y din Ghidul Solicitantului",
        "Dacă o dată lipsește → {{PLACEHOLDER_DESCRIERE}} + notificare",
      ],
      formatting: {
        font: "Times New Roman 12pt (standard AFIR)",
        spacing: "1.15 sau 1.5",
        margins: "2.5cm toate",
        titles: "Bold 14pt",
        subtitles: "Bold 12pt",
        tables: "borders 0.5pt, header bold, aliniere dreapta cifre",
        pagination: "subsol, Pagina X din Y",
        cabinet_logo: "DOAR pe draft/lucru, NICIODATĂ pe documente AFIR",
      },
    }),
    priority: 10,
  },
];

async function seedWritingKit() {
  const client = postgres(process.env.DATABASE_URL!);
  const db = drizzle(client, { schema });

  console.log("📝 Seeding Neemia Writing Kit...");

  let inserted = 0;
  let skipped = 0;

  for (const entry of WRITING_KIT_ENTRIES) {
    // Check if this category already exists (global)
    const existing = await db.query.solomonKnowledge.findFirst({
      where: (sk, { eq, isNull, and }) => and(
        eq(sk.category, entry.category),
        isNull(sk.organizationId),
      ),
    });

    if (existing) {
      console.log(`  ⏭  "${entry.title}" already exists — skipping.`);
      skipped++;
      continue;
    }

    await db.insert(schema.solomonKnowledge).values({
      organizationId: null,
      category: entry.category,
      title: entry.title,
      content: entry.content,
      priority: entry.priority,
      enabled: true,
    });
    console.log(`  ✅ "${entry.title}" inserted.`);
    inserted++;
  }

  console.log(`\n📝 Writing Kit seed complete: ${inserted} inserted, ${skipped} skipped.`);

  await client.end();
}

seedWritingKit().catch((err) => {
  console.error("❌ Writing Kit seed failed:", err);
  process.exit(1);
});
