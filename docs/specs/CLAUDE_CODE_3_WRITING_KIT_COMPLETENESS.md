# CLAUDE CODE — Document 3/3
# Neemia Writing Kit + Verificare Completitudine Ghid
# DosarFonduri v2

## Core Rules
- Read the file before answering. Never speculate about code you have not opened.
- Do not hard-code values. Implement the actual logic.
- Write high-quality, general-purpose solutions.
- Do not stop early due to token budget concerns.
- Context will be compacted automatically, continue working.

## REGULĂ FUNDAMENTALĂ
NU strică ce funcționează deja. Citește complet fișierul înainte de editare.
Build check: `bun run build` după fiecare modificare.

## AI PROVIDER
EXCLUSIV Anthropic. Neemia folosește Claude Sonnet pentru generare documente.
Solomon folosește Claude Opus + Extended Thinking.

---

## PARTEA A — NEEMIA WRITING KIT

### Ce este
Un set de terminologie profesională, structuri narative, și keywords 
pe care Neemia le folosește în system prompt când compune documente 
în mod COMPOSE (Memoriu Justificativ, Descriere Succintă, Plan Afaceri).

Scopul: documentele generate să sune ca un consultant senior cu 10+ ani 
experiență, nu ca un AI generic.

### Unde se stochează
În tabelul `solomonKnowledge` cu:
- type: "writing_kit"
- scope: "global" (se aplică tuturor programelor) 
- category: "neemia_writing"
- content: JSON cu tot writing kit-ul de mai jos

### Pas 1: Seed-uiește Writing Kit-ul în DB

Creează un script de seed (sau adaugă la seed existent) care inserează 
următoarele entries în solomonKnowledge:

```typescript
const writingKitEntries = [
  {
    type: "writing_kit",
    category: "terminology",
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
          good: "Exploatație agricolă cu dimensiunea economică de X.XXX SO, încadrată în categoria fermelor de familie conform PNDR 2014-2020" }
      ]
    }),
    scope: "global",
    organizationId: null // global, nu per org
  },
  {
    type: "writing_kit",
    category: "keywords_eligibility",
    title: "Keywords evaluator — eligibilitate",
    content: JSON.stringify({
      phrases: [
        "Solicitantul se încadrează în categoria beneficiarilor eligibili conform...",
        "Investiția se realizează în cadrul unei exploatații cu dimensiunea economică de...",
        "Activitățile agricole sunt desfășurate pe teritoriul României...",
        "Solicitantul demonstrează capacitatea de cofinanțare a investiției..."
      ]
    }),
    scope: "global",
    organizationId: null
  },
  {
    type: "writing_kit",
    category: "keywords_necessity",
    title: "Keywords evaluator — necesitate și oportunitate",
    content: JSON.stringify({
      phrases: [
        "Necesitatea investiției este fundamentată de analiza situației existente...",
        "Exploatația se confruntă cu un deficit de mecanizare care...",
        "Lipsa echipamentelor moderne conduce la costuri operaționale ridicate...",
        "Investiția răspunde direct nevoilor identificate în strategia de dezvoltare..."
      ]
    }),
    scope: "global",
    organizationId: null
  },
  {
    type: "writing_kit",
    category: "keywords_objectives",
    title: "Keywords evaluator — contribuția la obiectivele programului",
    content: JSON.stringify({
      phrases: [
        "Proiectul contribuie la Domeniul de Intervenție 2A...",
        "...îmbunătățirea performanțelor generale ale exploatației agricole...",
        "...creșterea competitivității activității agricole...",
        "...restructurarea exploatațiilor de dimensiuni mici și medii...",
        "...respectarea standardelor comunitare aplicabile..."
      ]
    }),
    scope: "global",
    organizationId: null
  },
  {
    type: "writing_kit",
    category: "keywords_impact",
    title: "Keywords evaluator — impact și rezultate",
    content: JSON.stringify({
      phrases: [
        "Implementarea proiectului va genera următoarele rezultate măsurabile...",
        "Valoarea adăugată brută a exploatației va crește de la X la Y...",
        "Productivitatea muncii va înregistra o creștere de X%...",
        "Costurile de producție se vor reduce cu aproximativ X%...",
        "Capacitatea de producție va crește de la X la Y tone/hectare..."
      ]
    }),
    scope: "global",
    organizationId: null
  },
  {
    type: "writing_kit",
    category: "keywords_sustainability",
    title: "Keywords evaluator — sustenabilitate",
    content: JSON.stringify({
      phrases: [
        "Viabilitatea economică a investiției este demonstrată prin indicatorii economico-financiari...",
        "Proiectul este sustenabil pe termen lung, beneficiarul dispunând de...",
        "Prognoza economico-financiară confirmă capacitatea de menținere a investiției pe durata de monitorizare..."
      ]
    }),
    scope: "global",
    organizationId: null
  },
  {
    type: "writing_kit",
    category: "keywords_environment",
    title: "Keywords evaluator — mediu și climă",
    content: JSON.stringify({
      phrases: [
        "Investiția contribuie la îndeplinirea condiționalităților de mediu și climă...",
        "Utilajele propuse implementează tehnologia no tillage/minimum tillage...",
        "Reducerea lucrărilor solului contribuie la conservarea structurii și biodiversității...",
        "...conforme cu normele Euro Stage V privind emisiile..."
      ]
    }),
    scope: "global",
    organizationId: null
  },
  {
    type: "writing_kit",
    category: "scoring_keywords",
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
        "ANC SEMN", "ANC SPEC", "art. 32 R(UE) 1305/2013"]
    }),
    scope: "global",
    organizationId: null
  },
  {
    type: "writing_kit",
    category: "section_structures",
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
              "capacitate_mentinere"] }
        ]
      },
      descriere_succinta: {
        pattern: "5 paragrafe: CINE+CE → DE CE → CUM → IMPACT → SUSTENABILITATE"
      }
    }),
    scope: "global",
    organizationId: null
  },
  {
    type: "writing_kit",
    category: "writing_rules",
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
        "Dacă o dată lipsește → {{PLACEHOLDER_DESCRIERE}} + notificare"
      ],
      formatting: {
        font: "Times New Roman 12pt (standard AFIR)",
        spacing: "1.15 sau 1.5",
        margins: "2.5cm toate",
        titles: "Bold 14pt",
        subtitles: "Bold 12pt",
        tables: "borders 0.5pt, header bold, aliniere dreapta cifre",
        pagination: "subsol, Pagina X din Y",
        cabinet_logo: "DOAR pe draft/lucru, NICIODATĂ pe documente AFIR"
      }
    }),
    scope: "global",
    organizationId: null
  }
];
```

### Pas 2: Integrează Writing Kit-ul în Neemia COMPOSE

Citește services/neemia.ts — funcția care gestionează COMPOSE mode.
Găsește locul unde se construiește system prompt-ul pentru AI (Sonnet).

Adaugă încărcarea Writing Kit-ului din solomonKnowledge:

```typescript
// În funcția compose/generate din neemia.ts

// Încarcă writing kit
const writingKit = await db.select().from(solomonKnowledge)
  .where(and(
    eq(solomonKnowledge.type, "writing_kit"),
    or(
      isNull(solomonKnowledge.organizationId), // global
      eq(solomonKnowledge.organizationId, orgId) // per cabinet
    )
  ));

// Construiește system prompt cu writing kit
const writingKitContext = writingKit
  .map(wk => {
    const content = JSON.parse(wk.content);
    return `## ${wk.title}\n${JSON.stringify(content, null, 2)}`;
  })
  .join("\n\n");

const systemPrompt = `
Ești Neemia, expert senior în redactarea documentelor pentru proiecte 
de finanțare europeană. Scrii documente profesionale care respectă 
standardele AFIR/PNRR.

REGULI ABSOLUTE:
1. Folosești DOAR datele din contextul furnizat — NU inventezi cifre
2. Fiecare secțiune face referire la obiectivele programului
3. Terminologia e conformă cu ghidul oficial
4. Dacă o dată lipsește, marchezi cu {{PLACEHOLDER_DESCRIERE}}
5. Tonul e formal-profesional, nu birocratic excesiv

WRITING KIT — Terminologie și keywords profesionale:
${writingKitContext}

BRAND KIT CABINET:
Font: ${brandKit?.fontFamily || 'Times New Roman'}
Footer: ${brandKit?.footerText || ''}
`;
```

### Pas 3: Actualizează compose prompt-ul per secțiune

Când Neemia compune o secțiune, user prompt-ul trebuie să includă:

```typescript
const userPrompt = `
Compune secțiunea: ${section.label}
Tip: ${section.type} // narrative sau table

DATE PROIECT DISPONIBILE:
${JSON.stringify(relevantProjectElements, null, 2)}

REGULI DIN GHID RELEVANTE:
${JSON.stringify(relevantRules, null, 2)}

CRITERII DE SELECȚIE ÎNDEPLINITE:
${JSON.stringify(scoringResults, null, 2)}

TABELE REFERINȚĂ:
${JSON.stringify(referenceTables, null, 2)}

INSTRUCȚIUNI SPECIFICE SECȚIUNE:
${section.instructions || 'Redactează profesional conform writing kit.'}

Scrie în română, cu date concrete din contextul de mai sus.
Folosește keywords-urile din writing kit relevante pentru 
criteriile de selecție ale acestui proiect.
`;
```

### Pas 4: Adaugă detecție placeholder-uri necompletate

După ce Neemia generează textul, scanează pentru {{...}}:

```typescript
const generatedText = response.content[0].text;

// Detectează placeholder-uri rămase
const placeholderRegex = /\{\{([^}]+)\}\}/g;
const missingPlaceholders = [];
let match;
while ((match = placeholderRegex.exec(generatedText)) !== null) {
  missingPlaceholders.push(match[1]);
}

if (missingPlaceholders.length > 0) {
  // Trimite SSE warning
  await sendSSE(projectId, {
    type: "compose_warning",
    message: `Secțiunea "${section.label}" conține ${missingPlaceholders.length} câmpuri necompletate`,
    missing: missingPlaceholders
  });
}
```

### Pas 5: Formatare DOCX profesională

Verifică că output-ul COMPOSE respectă:
- Font: Times New Roman 12pt (din brandKit sau default)
- Titluri secțiuni: Bold 14pt
- Spațiere: 1.15
- Margini: 2.5cm
- Paginare subsol: "Pagina X din Y"
- Tabele: borders 0.5pt, header bold cu fundal gri deschis
- Numere: format RO (1.234,56 nu 1,234.56)

Citește codul Python care generează DOCX-ul (python-docx) și verifică 
că aceste setări sunt aplicate. Dacă nu, adaugă-le.

---

## PARTEA B — VERIFICARE COMPLETITUDINE GHID (Faza 3.5)

### Ce este
După ce processGuide extrage regulile (Faza 3), și ÎNAINTE de 
auto-linking (Faza 4), adaugă o verificare automată că AI-ul a extras 
TOATE categoriile obligatorii de reguli.

### Unde se implementează
Fișier: jobs/processGuide.ts — adaugă funcție nouă între Faza 3 și Faza 4.

### Implementare

```typescript
// jobs/processGuide.ts — adaugă după Faza 3c (scoring)

interface CompletenessReport {
  trustScore: number;          // 0.0 - 1.0
  categoriesFound: string[];
  categoriesMissing: string[];
  rulesNeedingReview: number;
  sectionsWithoutRules: string[];
  warnings: string[];
}

async function verifyExtractionCompleteness(
  rules: Rule[],
  scoringCriteria: ScoringCriterion[],
  sections: Section[],
  guideDocId: string
): Promise<CompletenessReport> {
  
  // 1. Category coverage — ORICE program de finanțare trebuie să aibă:
  const REQUIRED_CATEGORIES = [
    "beneficiary_eligible",    // Cine poate aplica
    "beneficiary_excluded",    // Cine NU poate aplica
    "expenses_eligible",       // Ce se finanțează
    "expenses_excluded",       // Ce NU se finanțează
    "intensity",               // Cât se finanțează (procent, plafon)
    "scoring",                 // Criterii de selecție
    "documents"                // Documente necesare
  ];
  
  const categoriesFound = [...new Set(
    rules.map(r => r.category).filter(Boolean)
  )];
  const categoriesMissing = REQUIRED_CATEGORIES.filter(
    cat => !categoriesFound.includes(cat)
  );
  
  // 2. Section coverage — secțiuni cu text dar fără reguli extrase
  const sectionsWithRules = new Set(
    rules.map(r => r.sourceSection).filter(Boolean)
  );
  const relevantSections = sections.filter(s => 
    ["eligibility", "scoring", "financial", "documents"].includes(s.contentType)
  );
  const sectionsWithoutRules = relevantSections
    .filter(s => !sectionsWithRules.has(s.id))
    .map(s => s.title);
  
  // 3. Rules needing review (confidence < 0.85)
  const rulesNeedingReview = rules.filter(
    r => (r.confidence || 0) < 0.85
  ).length;
  
  // 4. Scoring completeness — verifică componente
  const warnings: string[] = [];
  if (scoringCriteria.length === 0) {
    warnings.push("Zero criterii de selecție extrase");
  }
  if (categoriesMissing.length > 0) {
    warnings.push(`Categorii lipsă: ${categoriesMissing.join(", ")}`);
  }
  if (sectionsWithoutRules.length > 0) {
    warnings.push(`${sectionsWithoutRules.length} secțiuni relevante fără reguli`);
  }
  
  // 5. Trust score = weighted average
  const categoryScore = categoriesFound.length / REQUIRED_CATEGORIES.length;
  const confidenceScore = rules.length > 0
    ? rules.reduce((sum, r) => sum + (r.confidence || 0.5), 0) / rules.length
    : 0;
  const sectionScore = relevantSections.length > 0
    ? 1 - (sectionsWithoutRules.length / relevantSections.length)
    : 0;
  
  const trustScore = Math.round(
    (categoryScore * 0.4 + confidenceScore * 0.3 + sectionScore * 0.3) * 100
  ) / 100;
  
  return {
    trustScore,
    categoriesFound,
    categoriesMissing,
    rulesNeedingReview,
    sectionsWithoutRules,
    warnings
  };
}
```

### Salvare rezultat

Salvează completeness report în DB. Două opțiuni:

Opțiunea A: Pe tabelul documents (ghidul), adaugă coloane:
```
trustScore: decimal
completenessReport: jsonb
```

Opțiunea B: Tabel nou guide_processing_results:
```
id, documentId, trustScore, categoriesFound, categoriesMissing,
rulesNeedingReview, sectionsWithoutRules, warnings, createdAt
```

Alege ce e mai simplu. Verifică schema existentă.

### SSE Event

Trimite trust score ca parte din progresul procesării:
```typescript
await sendSSE(orgId, {
  type: "guide_processing_progress",
  phase: "verification",
  trustScore: report.trustScore,
  totalRules: rules.length,
  needsReview: report.rulesNeedingReview,
  warnings: report.warnings
});
```

### Afișare în Frontend

În pagina Documente, la expand card ghid procesat:
- Trust score: badge colorat (verde >0.8, galben 0.6-0.8, roșu <0.6)
- Categorii lipsă: lista cu warning icons
- Reguli de review: counter cu link la lista
- Warnings: expandabil

În ProjectView → Ghid Finanțare:
- Trust score vizibil în header
- Dacă trustScore < 0.7: banner warning 
  "Procesarea ghidului poate fi incompletă. Verificați regulile."

---

## PARTEA C — FEEDBACK LOOP (Consultant corectează → Neemia învață)

### Concept
Când consultantul editează un document generat de Neemia, platforma 
compară originalul cu editarea și salvează preferințele.

### Implementare minimală

1. La generare document COMPOSE, salvează textul original per secțiune:
```typescript
await db.insert(documentVersions).values({
  documentId: docId,
  sectionId: section.id,
  version: 1,
  content: generatedText,
  source: "neemia_ai",
  createdAt: new Date()
});
```

2. Când consultantul editează și salvează:
```typescript
await db.insert(documentVersions).values({
  documentId: docId,
  sectionId: section.id,
  version: latestVersion + 1,
  content: editedText,
  source: "consultant_edit",
  createdAt: new Date()
});
```

3. La următoarea generare COMPOSE pentru un proiect similar din 
ACELAȘI cabinet, include în prompt:
```
PREFERINȚE CABINET (din editări anterioare):
- Secțiunea "Necesitate": consultantul a preferat stil direct, 
  fără introduceri lungi (bazat pe 3 editări anterioare)
```

Asta e v1 simplificat. Nu e machine learning — e doar 
"uită-te la ce a editat consultantul și menționează în prompt".

---

## VERIFICARE FINALĂ DOCUMENT 3

1. Writing Kit seed-uit în DB (solomonKnowledge)
2. Neemia COMPOSE system prompt include Writing Kit
3. Placeholder detection funcționează post-generare
4. DOCX output respectă formatarea profesională
5. Faza 3.5 (completeness) rulează și salvează trust score
6. Trust score vizibil în frontend (documente + ghid)
7. `bun run build` — zero erori
8. Testează: generează un Memoriu Justificativ cu COMPOSE mode.
   Verifică că textul folosește terminologie profesională,
   nu limbaj generic AI.
9. Commit: "feat: neemia writing kit + guide completeness verification"
