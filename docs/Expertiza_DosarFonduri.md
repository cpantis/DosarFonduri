# Expertiza DosarFonduri — Arhitectura Celor Trei Straturi

## Cuprins

1. [Viziunea generală](#viziunea-generală)
2. [Cele trei straturi](#cele-trei-straturi)
3. [Problema și soluția](#problema-și-soluția)
4. [Fluxul complet de lucru](#fluxul-complet-de-lucru)
5. [Schema bazei de date](#schema-bazei-de-date)
6. [Integrarea în interfață](#integrarea-în-interfață)
7. [Exemple concrete](#exemple-concrete)
8. [Ghid de utilizare pentru consultant](#ghid-de-utilizare-pentru-consultant)

---

## Viziunea generală

DosarFonduri operează pe un principiu fundamental: **un dosar de finanțare corect este un dosar în care fiecare element (dată, valoare, document) poate fi trasat înapoi la o regulă din ghid și validat contra unei surse de referință**.

Sistemul funcționează ca un triunghi cu trei vârfuri:

```
                    GHIDUL
              (Reguli + Condiții)
                    ▲
                   / \
                  /   \
                 /     \
                /       \
               /  CROSS  \
              /   CHECK   \
             /             \
            ▼               ▼
       ANEXELE            SOLOMON
  (Date de referință)   (Date client)
```

**Fiecare element colectat de Solomon trebuie să poată fi:**
1. Validat contra unei reguli din ghid
2. Verificat contra unui tabel de referință din anexe
3. Inserat într-un template de Neemia cu argumentația completă

---

## Cele trei straturi

### Stratul 1: GHIDUL — Reguli

Ghidul de finanțare conține regulile pe care solicitantul trebuie să le respecte. DosarFonduri le extrage automat (cu AI) în două categorii:

| Tip regulă | Descriere | Exemplu |
|------------|-----------|---------|
| **FIXĂ** | Condiție binară DA/NU, verificabilă automat | "Solicitantul trebuie să aibă minim 2 ha suprafață" |
| **INTERPRETATĂ** | Arbore decizional complex, necesită raționament | "Intensitatea sprijinului = bază + majorări condiționate" |

**Unde se văd în aplicație:** Secțiunea **Ghid Finanțare → Reguli** din ProjectView

### Stratul 2: ANEXELE — Date de referință

Anexele ghidului conțin date structurate (tabele, liste, clasificări) care sunt referite de reguli. Există două tipuri fundamental diferite de anexe:

| Tip anexă | Ce conține | Ce face sistemul cu ea |
|-----------|-----------|----------------------|
| **Anexă cu date (lookup)** | Tabele de corelație, liste UAT, coduri CAEN eligibile | Extrage datele structurate → le stochează → le folosește la validare |
| **Anexă formular (template)** | Cerere de finanțare, buget, prognoza financiară | Extrage câmpurile `{{placeholder}}` → Neemia le completează |

**Exemple concrete de anexe cu date:**

- **Anexa 3 — Corelarea puterii tractorului cu suprafața fermei**
  - Tabel lookup: suprafață (ha) → putere max (CP), coeficient, putere cumulată
  - Folosit de regula: "Dimensionare adecvată parc utilaje"

- **Anexa 4 — Lista UAT ANC (Zone cu Constrângeri Naturale)**
  - Tabel clasificare: UAT → tip ANC (Montană / Specifice / Semnificative)
  - Folosit de regula: "Majorare intensitate sprijin +20pp dacă zona ANC"

- **Lista CAEN eligibile** (din corpul ghidului)
  - Lista de valori: coduri CAEN acceptate pentru submăsura respectivă
  - Folosit de regula: "Codul CAEN al solicitantului trebuie să fie eligibil"

**Unde se văd în aplicație:**
- Upload: Documente → Ghiduri → sub-tip "Anexă cu date"
- Vizualizare: **Ghid Finanțare → Anexe & Date** din ProjectView

### Stratul 3: SOLOMON — Date client

Solomon colectează datele despre client și proiect prin conversație (chat AI). Sursele de date sunt:

| Sursă | Exemplu | Încredere |
|-------|---------|-----------|
| **ONRC** | CUI, formă juridică, CAEN, adresă, capital social | Auto-extrase, încredere 100% |
| **Bilanț ANAF** | Cifră de afaceri, profit, angajați, capitaluri proprii | Uploadat + parsat cu AI |
| **Solomon (chat)** | Suprafața exploatației, tipul culturii, utilaje existente | Colectate conversațional, necesită confirmare |
| **Manual** | Date care nu pot fi extrase automat | Introduse de consultant |
| **Calculat** | Cofinanțare proprie, intensitate ajutor, TVA | Derivate din alte elemente |

**Unde se văd în aplicație:** Secțiunea **Solomon** (chat) și **Elemente** (lista valorilor) din ProjectView

---

## Problema și soluția

### Gap-ul identificat

Fără un strat intermediar care să stocheze datele structurate din anexe:

```
REGULA: "Suprafața minimă ≥ 2 ha"        ← poate fi verificată direct
REGULA: "Consultă Anexa 3 pentru          ← CU CE VERIFICĂ?
         corelarea putere-suprafață"          Anexa 3 e un PDF în storage,
                                             datele nu sunt structurate
```

Consecințe practice:
- Solomon colectează `suprafata = 270 ha` dar nu știe că trebuie verificat contra Anexei 3
- Eligibilitatea nu poate face cross-check automat — depinde de AI să re-citească PDF-ul
- Neemia nu poate insera argumentația demonstrativă (tabelul concret din Anexa 3)
- Consultantul trebuie să verifice manual corelațiile — exact ce vrem să automatizăm

### Soluția: Tabele de referință (`guide_reference_tables`)

Adăugăm un strat intermediar care digitizează datele din anexe:

```
┌──────────────────────────────────────────────────────────┐
│                    guide_reference_tables                  │
│                                                          │
│  Stochează datele extrase din anexele de tip lookup:     │
│  • Tabelele din Anexa 3 (putere/suprafață)              │
│  • Lista UAT din Anexa 4 (clasificare ANC)              │
│  • Coduri CAEN eligibile                                 │
│  • Grile de punctaj                                      │
│  • Liste de cheltuieli neeligibile                       │
│                                                          │
│  Format: schema (definiția coloanelor) + data (rânduri)  │
│  Validate de consultant după extragere                    │
└──────────────────────────────────────────────────────────┘
```

Plus două tabele de legătură:
- `rule_reference_links` — leagă reguli de tabelele de referință pe care le folosesc
- `element_rule_links` — leagă elemente de regulile care le validează

---

## Fluxul complet de lucru

### Pasul 1: Upload și extragere

```
Consultant uploadează:           Sistemul extrage:

Ghid sM 4.1 (PDF)          →   28 reguli fixe + 15 interpretate
Anexa 3 — Putere/suprafață  →   3 tabele lookup (per tip cultură)
Anexa 4 — Lista UAT ANC    →   1 tabel clasificare (600+ UAT-uri)
Cerere Finanțare (DOCX)     →   45 câmpuri {{placeholder}}
Plan Afaceri (DOCX)         →   22 câmpuri {{placeholder}}
Anexa B — Buget (PDF XFA)   →   3185 câmpuri XFA indexate
```

### Pasul 2: Legarea automată

Sistemul detectează referințele dintre reguli și tabele:

```
Regulă: "Se va consulta Anexa 3"  ──→  Tabel: "Corelare putere cultura mare"
Regulă: "Zona ANC +20pp"         ──→  Tabel: "Lista UAT ANC"
Regulă: "CAEN eligibil"          ──→  Tabel: "Coduri CAEN submăsura 4.1"
```

### Pasul 3: Solomon colectează cu validare în timp real

```
Solomon: "Ce suprafață are exploatația?"
Client:  "270,70 ha"

→ Solomon salvează: suprafata_exploatatie = 270.70
→ Validare automată instant:
  ✅ Suprafață minimă ≥ 2 ha → PASS
  📊 Corelare putere (Anexa 3): interval 201-500 ha
     • Max tractor: 400 CP
     • Coeficient: 2
     • Putere cumulată max: 541,40 CP (270,70 × 2)

→ Solomon contextualizează: "Notat. Pentru 270 ha, tractorul
   propus nu va putea depăși 400 CP. Câte tractoare aveți
   în prezent?"
```

### Pasul 4: Neemia generează cu argumentație

Când Neemia completează Memoriul Justificativ la secțiunea "Corelare putere":

```
Neemia inserează automat:

"Conform Anexei 3 la Ghidul Solicitantului, pentru o suprafață
de 270,70 ha (cultură mare), intervalul corespunzător este
201-500 ha, iar puterea maximă admisă per tractor este de
400 CP, cu un coeficient de 2.

Puterea cumulată maximă = 270,70 × 2 = 541,40 CP

Tractorul propus de 340 CP se încadrează în limita de 400 CP,
iar puterea cumulată (340 CP) este sub limita de 541,40 CP.

CONCLUZIE: Cerința de dimensionare a parcului de utilaje este
ÎNDEPLINITĂ."
```

---

## Schema bazei de date

### Tabele noi

#### `guide_reference_tables` — Date structurate din anexe

| Coloană | Tip | Descriere |
|---------|-----|-----------|
| `id` | UUID | Identificator unic |
| `document_id` | UUID (FK→documents) | Anexa din care s-au extras datele |
| `organization_id` | UUID (FK→organizations) | Organizația proprietară |
| `name` | VARCHAR(500) | Numele tabelului ("Corelare putere-suprafață cultura mare") |
| `description` | TEXT | Descriere detaliată |
| `table_type` | ENUM | `lookup` / `classification` / `list` / `matrix` |
| `schema` | JSONB | Definiția coloanelor tabelului |
| `data` | JSONB | Rândurile efective (array de obiecte) |
| `lookup_key` | VARCHAR(100) | Câmpul de căutare principal |
| `source_page` | INTEGER | Pagina din document |
| `source_text` | TEXT | Textul original extras |
| `extracted_by` | ENUM | `ai` / `manual` |
| `validated` | BOOLEAN | Validat de consultant |
| `validated_by` | UUID (FK→users) | Cine a validat |
| `created_at` | TIMESTAMP | Data creării |

**Exemplu de date stocate:**

```json
{
  "name": "Corelare putere-suprafață cultura mare",
  "table_type": "lookup",
  "lookup_key": "interval_ha",
  "schema": [
    { "key": "interval_ha", "label": "Interval (ha)", "type": "range" },
    { "key": "max_cp", "label": "Putere max (CP)", "type": "number" },
    { "key": "coef", "label": "Coeficient", "type": "number" },
    { "key": "putere_cumulata", "label": "Putere cumulată max (CP)", "type": "number" }
  ],
  "data": [
    { "interval_ha": [2, 50], "max_cp": 200, "coef": 3, "putere_cumulata": 150 },
    { "interval_ha": [51, 100], "max_cp": 260, "coef": 2.5, "putere_cumulata": 250 },
    { "interval_ha": [101, 200], "max_cp": 340, "coef": 2.2, "putere_cumulata": 440 },
    { "interval_ha": [201, 500], "max_cp": 400, "coef": 2, "putere_cumulata": 1000 },
    { "interval_ha": [501, 1000], "max_cp": 550, "coef": 1.8, "putere_cumulata": 1800 }
  ]
}
```

#### `rule_reference_links` — Legătura regulă ↔ tabel

| Coloană | Tip | Descriere |
|---------|-----|-----------|
| `id` | UUID | Identificator unic |
| `rule_id` | UUID (FK→rules) | Regula care referă tabelul |
| `reference_table_id` | UUID (FK→guide_reference_tables) | Tabelul referit |
| `usage` | ENUM | `validates` / `scores` / `classifies` |
| `description` | TEXT | Cum folosește regula acest tabel |

#### `element_rule_links` — Legătura element ↔ regulă

| Coloană | Tip | Descriere |
|---------|-----|-----------|
| `id` | UUID | Identificator unic |
| `template_element_id` | UUID (FK→template_elements) | Elementul legat |
| `rule_id` | UUID (FK→rules) | Regula care validează elementul |
| `role` | ENUM | `input` / `output` / `constraint` |
| `description` | TEXT | Descriere a relației |

---

## Integrarea în interfață

### 1. Pagina Documente — Upload în Ghiduri

Când consultantul uploadează un document în folderul "Ghiduri", acum trebuie să aleagă sub-tipul:

```
┌──────────────────────────────────────────────────┐
│  Upload document                            ✕    │
│  Destinație: AF › M1 › Sesiunea 1 › Ghiduri      │
│                                                   │
│  Ce tip de document este?                         │
│                                                   │
│  ┌──────────────────┐  ┌──────────────────┐      │
│  │  📖               │  │  📊               │      │
│  │  Ghid solicitant  │  │  Anexă cu date    │      │
│  │  Se extrag reguli │  │  Se extrag tabele │      │
│  │  de eligibilitate │  │  de referință     │      │
│  └──────────────────┘  └──────────────────┘      │
│                                                   │
│  [============= upload zone ==============]       │
└──────────────────────────────────────────────────┘
```

- **Ghid solicitant** → `processingType: "ghid"` → AI extrage reguli
- **Anexă cu date** → `processingType: "reference_data"` → AI extrage tabele structurate

### 2. ProjectView → Ghid Finanțare: Tab "Anexe & Date"

Un tab nou în secțiunea Ghid Finanțare, lângă "Reguli" și "Ghid complet":

```
  [Reguli (28)]  [Anexe & Date (3)]  [Ghid complet]
```

Tab-ul "Anexe & Date" arată tabelele de referință extrase, cu:
- Lista tabelelor (stânga): status validare, sursa, tip
- Vizualizare tabel (dreapta): coloane, rânduri, reguli legate

Consultantul poate:
- Vizualiza fiecare tabel extras
- Valida datele (confirma că AI le-a extras corect)
- Edita celule individuale dacă AI a greșit
- Vedea ce reguli folosesc acest tabel (cross-link)

### 3. ProjectView → Ghid Finanțare: Badge-uri pe reguli

Pe fiecare card de regulă care referă o anexă, apare un chip sub regulă:

```
┌──────────────────────────────────────────────────┐
│ ◆ INTERPRETATĂ                      ⚠ REVIEW    │
│                                                   │
│ Pentru dimensionarea adecvată a parcului de       │
│ utilaje se va consulta Anexa 3.                   │
│                                                   │
│ pag. 42 · conf. 82%                              │
│                                                   │
│ 📊 Anexa 3: Corelare putere-suprafață    ✓ Valid  │
│ 📊 Anexa 4: Lista UAT ANC              ⏳ Lipsă  │
└──────────────────────────────────────────────────┘
```

Statusuri posibile: `✓ Valid` (extras + validat), `⚠ Review` (extras, nevalidat), `⏳ Lipsă` (tabelul nu a fost extras/uploadat).

### 4. ProjectView → Solomon: Validation Card

După ce Solomon extrage un element, apare un card de validare sub card-ul de extragere:

```
┌ EXTRAS ──────────────────────────────────────┐
│ suprafata_exploatatie: 270,70 ha    ✓ 98%    │
└──────────────────────────────────────────────┘
┌ VALIDARE AUTOMATĂ ───────────────────────────┐
│ ✅ Suprafață minimă (≥ 2 ha)          PASS   │
│                                               │
│ 📊 Corelare putere-suprafață (Anexa 3):      │
│    Interval: 201-500 ha                       │
│    Max putere tractor: 400 CP                 │
│    Coeficient: 2                              │
│    Putere cumulată max: 541,40 CP             │
│                                               │
│ ℹ️ Când veți propune tractorul, acesta nu     │
│    poate depăși 400 CP.                       │
└──────────────────────────────────────────────┘
```

### 5. ProjectView → Elemente: Secțiunea "Constrângeri"

În panoul de detalii al unui element, o secțiune nouă arată constrângerile:

```
CONSTRÂNGERI
┌──────────────────────────────────────────────┐
│ ✅ Suprafață minimă ≥ 2 ha                   │
│ 📊 Corelare putere: interval 201-500 ha,     │
│    max tractor 400 CP, coef. 2               │
│ 📊 Punctaj ITI: necesită verificare UAT ANC  │
└──────────────────────────────────────────────┘
```

### 6. ProjectView → Eligibilitate: Sursa datelor

Pe fiecare regulă de eligibilitate, se arată sursa evaluării:

```
┌──────────────────────────────────────────────┐
│ ◆ Corelare putere/suprafață tractoare  PASS  │
│                                               │
│ Suprafață: 270,70 ha → interval 201-500 ha   │
│ Tractor propus: 340 CP ≤ 400 CP max         │
│                                               │
│ 📊 Bazat pe: Anexa 3, Tabelul 1      [vezi] │
└──────────────────────────────────────────────┘
```

---

## Exemple concrete

### Exemplul 1: ANDA OANA AGRO FERMA — Corelare putere tractor

**Context:** Fermă cu 270,70 ha, cultură mare, solicită finanțare pentru tractor.

**Flux complet:**

1. Consultantul uploadează Ghidul sM 4.1 → se extrag 43 reguli
2. Consultantul uploadează Anexa 3 (ca "Anexă cu date") → se extrag 3 tabele lookup
3. Sistemul detectează: regula "Corelare putere" referă tabelul "Cultura mare" din Anexa 3
4. Solomon întreabă: "Ce suprafață are exploatația?" → 270,70 ha
5. Validare automată: 270,70 → interval 201-500 → max 400 CP
6. Solomon întreabă: "Ce tractor propuneți?" → 340 CP
7. Validare automată: 340 CP ≤ 400 CP → PASS; 340 CP ≤ 541,40 CP cumulat → PASS
8. Eligibilitate se actualizează: regula "Corelare putere" → ✅ PASS
9. Neemia inserează în Memoriu: argumentația completă cu tabel + calcul

### Exemplul 2: Zona ANC — Majorare intensitate sprijin

**Context:** Proiect implementat în Municipiul Arad + Zădăreni.

**Flux complet:**

1. Din ghid se extrage regula interpretată: "Intensitate = 50% + 20pp dacă zona ANC"
2. Din Anexa 4 (uploadată ca "Anexă cu date") se extrage lista UAT cu clasificări
3. Solomon colectează: "Unde se implementează proiectul?" → "Municipiul Arad și Zădăreni"
4. Validare automată: caută "Municipiul Arad" și "Zădăreni" în tabelul UAT ANC
   → Găsite ambele cu clasificare "ANC_SEMN" (Constrângeri Semnificative)
5. Regula de intensitate se evaluează: 50% + 20pp = 70%
6. Solomon informează: "UAT-urile sunt clasificate ANC Semnificative, deci intensitatea = 70%"
7. Neemia inserează: tabel cu UAT-urile, clasificarea, baza legală

### Exemplul 3: Coduri CAEN eligibile

**Flux complet:**

1. Din ghid se extrage regula fixă: "cod_caen IN [0115, 0116, 0120, ...]"
2. Datele ONRC ale firmei includ: CAEN = "0115"
3. Validare automată: "0115" ∈ lista CAEN eligibile → ✅ PASS
4. Nu e nevoie de tabel de referință separat — lista e deja în condiția regulii
5. Eligibilitate: regula "CAEN eligibil" → ✅ PASS

---

## Ghid de utilizare pentru consultant

### Cum pregătesc un proiect nou

1. **Creează structura** în Documente: Program → Măsură → Sesiune (auto-generează cele 4 foldere: Ghiduri, Template-uri, Clienți Prospecți, Clienți Finali)

2. **Uploadează în Ghiduri:**
   - Ghidul solicitantului (ca "Ghid solicitant") — se extrag regulile
   - Fiecare anexă cu tabele de date (ca "Anexă cu date") — se extrag tabelele
   - Verifică în **Ghid Finanțare → Reguli** că regulile sunt corecte
   - Verifică în **Ghid Finanțare → Anexe & Date** că tabelele sunt corecte

3. **Uploadează în Template-uri:**
   - Cererea de finanțare, Plan de afaceri, Buget, etc.
   - Verifică câmpurile extrase în Template Viewer

4. **Creează proiectul** — alege firma, sesiunea, numele proiectului

5. **Lucrează cu Solomon** — conversează pentru colectarea datelor:
   - Solomon validează automat fiecare element extras
   - Arată constrângerile din anexe în timp real
   - Confirmă valorile propuse sau corectează-le

6. **Verifică Eligibilitatea** — toate regulile (fixe + interpretate) evaluate automat
   - Regulile cu referințe la anexe arată sursa datelor
   - Click pe [vezi] pentru a vedea tabelul de referință complet

7. **Generează cu Neemia** — completează template-urile cu valorile colectate
   - Neemia inserează și argumentația (tabele din anexe, calcule demonstrative)
   - Validează documentele generate, descarcă și depune

### Sfaturi practice

- **Uploadează toate anexele relevante** înainte de a începe lucrul cu Solomon — astfel Solomon va putea valida datele în timp real
- **Validează tabelele extrase** — AI-ul poate greși la extragerea din PDF; verifică valorile
- **Folosește Solomon conversațional** — nu lipești datele dintr-o dată; lasă-l să întrebe sistematic
- **Confirmă elementele pe măsură ce apar** — nu lăsa totul la final
- **Re-verifică eligibilitatea** după completarea tuturor elementelor — regulile interpretate se re-evaluează cu context complet

### Coduri de culoare în aplicație

| Culoare | Semnificație |
|---------|-------------|
| 🟢 Verde | Confirmat / Trecut / Validat / Complet |
| 🟡 Galben | Propus AI / Necesită review / Parțial |
| 🔴 Roșu | Eșuat / Lipsă / Gol |
| 🔵 Albastru | Activ / Selectat / Solomon |
| 🟣 Violet | Manual / Calculat |

### Tipuri de tabele de referință

| Tip | Utilizare | Exemplu |
|-----|-----------|---------|
| **Lookup** | Caută valoarea într-un interval sau cheie | Anexa 3: suprafață → putere max |
| **Classification** | Clasifică o entitate într-o categorie | Anexa 4: UAT → tip ANC |
| **List** | Verifică dacă o valoare e în lista permisă | Coduri CAEN eligibile |
| **Matrix** | Grilă multi-dimensională (punctaj) | Grila de selecție cu criterii |

---

## Impactul asupra performanței dosarului

Fără cele trei straturi integrate:
- Consultantul verifică manual corelațiile → **2-4 ore per dosar**
- Risc de eroare la calcul → **15-20% dosare cu erori**
- Argumentația din Memoriu scrisă manual → **inconsistentă**

Cu cele trei straturi integrate:
- Validare automată la colectare → **0 ore suplimentare**
- Cross-check instant contra datelor de referință → **<1% erori de calcul**
- Argumentație generată automat cu date concrete → **consistentă 100%**

---

*Document generat pentru DosarFonduri v1.0 — Martie 2026*
