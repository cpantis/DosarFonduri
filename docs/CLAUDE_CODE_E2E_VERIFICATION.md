# CLAUDE CODE — Verificare End-to-End Completă
# Backend procesare corectă + Frontend afișare corectă
# Folosește documentele REALE din docs_exemple/

## Core Rules
- Read the file before answering. Never speculate about code you have not opened.
- Do not hard-code values. Implement the actual logic.
- Write high-quality, general-purpose solutions.
- Do not stop early due to token budget concerns.
- Context will be compacted automatically, continue working.

## REGULĂ FUNDAMENTALĂ
Această verificare e în 2 pași per flow:
1. BACKEND: Procesează documentul real → verifică datele în DB → raportează ce e greșit
2. FRONTEND: Verifică că datele din DB ajung corect în UI → raportează ce lipsește/e greșit

NU presupune că datele sunt corecte. VERIFICĂ fiecare câmp.
Folosește documentele din docs_exemple/ — sunt documente REALE ale firmei 
ANDA OANA AGRO FERMA SRL, CUI 38480585, jud. Arad.

## AI PROVIDER
EXCLUSIV Anthropic (Claude). Haiku/Sonnet/Opus — nu există OpenAI în platformă.

---

═══════════════════════════════════════════════════════════════
TEST 1: ÎNREGISTRARE FIRMĂ
Document: Certificatul constatator ANDA OANA AGRO FERMA
═══════════════════════════════════════════════════════════════

### 1A — BACKEND: Verifică parsarea ONRC

Citește services/onrcParser.ts complet. Apoi verifică:

FIRMA: ANDA OANA AGRO FERMA SRL
CUI: 38480585
J2/1981/2017

Câmpuri de verificat în output-ul parser-ului (scrie un script 
de test sau verifică direct în DB):

```
CÂMP                  VALOARE AȘTEPTATĂ              VERIFICĂ
─────────────────────────────────────────────────────────────
denumire              ANDA OANA AGRO FERMA SRL       Exact?
cui                   38480585                        Numeric, fără RO prefix?
nrRegCom              J2/1981/2017                    Format corect?
euid                  ROONRC.J2/1981/2017             Format corect?
formaJuridica         SRL                             Cod scurt, nu text complet?
formaJuridicaFull     Societate cu Răspundere Limitată  CU diacritice?
stare                 ACTIVĂ sau În funcțiune         NU "functiune"!
adresa                Sat Călugăreni, Comuna Felnac,  CU diacritice?
                      Nr. 87, Judet Arad
judet                 Arad                            Nu "Judet Arad"
localitate            Călugăreni                      CU diacritice?
comuna                Felnac                          Corect?
anInfiintare          2017                            Numeric?
durataSocietate       nedeterminată                   Text?
caenPrincipal         0111                            4 cifre?
caenDescriere         Cultivarea cerealelor...        Corect din nomenclator?
telefon               0722226110                      AL FIRMEI, nu al ONRC?
email                 ???                             NU onrc@onrc.ro!
                                                      Dacă firma nu are email 
                                                      declarat → null
website               ???                             AL FIRMEI, nu onrc.ro?
activitatiSecundare   5-30 coduri CAEN                NU 474!
capitalSocial         ???                             Verifică valoare reală
asociati              Lista cu nume, cote, aport      Completă?
administratori        Lista cu nume, funcție           Completă?
```

EXCLUDERI OBLIGATORII la parsare email/telefon/website:
- onrc@onrc.ro, registrul.comertului@onrc.ro, info@onrc.ro
- www.onrc.ro, onrc.ro
- 021-XXXXXXX (telefoane ONRC București)
- Orice date din header/footer certificat

VERIFICARE ACTIVITĂȚI SECUNDARE:
- Număr rezonabil: 5-30 (un SRL agricol tipic)
- Dacă > 100 → parser-ul a extras tot nomenclatorul CAEN
- Verifică: extracția se limitează la secțiunea "Activități 
  secundare" din certificat, nu la tot documentul
- Fiecare activitate: cod 4 cifre + descriere

VERIFICARE ASOCIAȚI:
- Numele CORECT (cu diacritice dacă sunt în certificat)
- Cote (%) trebuie să totalizeze 100%
- Capital subscris + vărsat per asociat

RAPORTEAZĂ: 
- Tabel cu fiecare câmp: AȘTEPTAT vs EXTRAS vs ✅/❌
- Fix necesar pentru fiecare ❌

### 1B — FRONTEND: Verifică afișarea pe pagina firmei

Citește componenta de detalii firmă. Pentru FIECARE câmp afișat:

```
CÂMP UI            SURSA DB               AFIȘAT CORECT?
──────────────────────────────────────────────────────────
Denumire header    companies.name          Cu SRL la final?
Badge SRL          companies.formaJuridica Cod scurt?
Badge stare        companies.stare         "Activă" nu "functiune"?
CUI header         companies.cui           Formatat cu spații? (38 480 585)
Forma juridică     companies.formaJuridica Text complet CU diacritice?
Stare card         companies.stare         Mapare la text lizibil?
Adresa             companies.adresa        Completă cu diacritice?
Localitate sub     companies.judet +       Format: "Localitate, Județ"?
                   companies.localitate
Telefon            companies.telefon       AL FIRMEI?
Email              companies.email         NU onrc@onrc.ro?
                                           Null → afișează "-" sau "Nedeclarat"
Durată             companies.durata        Prima literă mare?
An înființare      companies.anInfiintare  Numeric?
CAEN               companies.caen          Cod + descriere?
Nr. Reg. Com.      companies.nrRegCom      Format J2/1981/2017?
EUID               companies.euid          Format ROONRC.xxx?
Activități sec.    companies.activitati    Număr rezonabil (nu 474)?
Label-uri UI       Hardcoded               CU diacritice? (FORMĂ JURIDICĂ
                                           nu FORMA JURIDICA)
```

RAPORTEAZĂ: Tabel cu ✅/❌ per câmp + screenshot mental al problemei.

═══════════════════════════════════════════════════════════════
TEST 2: PROCESARE GHID
Document: docs_exemple/ghidulsolicitantuluism41componenta411final.pdf
═══════════════════════════════════════════════════════════════

### 2A — BACKEND: Verifică extracția din ghid

Citește jobs/processGuide.ts complet. Simulează procesarea ghidului
(sau verifică datele din DB dacă a fost deja procesat).

FAZA 1 — TEXT EXTRACTION:
```
VERIFICARE                           AȘTEPTAT        
─────────────────────────────────────────────────────
PyMuPDF extrage text?                DA (PDF 1.7MB are text nativ)
Număr pagini detectate               62
Total caractere extrase              >100.000
Pagini fără text (scanate)           0
Se apelează OCR?                     NU (text nativ complet)
```

FAZA 2 — SECȚIUNI:
```
SECȚIUNE                             PAGINA    DETECTATĂ?
─────────────────────────────────────────────────────────
1. Prevederi generale                4         ?
2.1 Cine poate beneficia             6         ?
2.2 Condiții obligatorii             8         ?
2.3 Cheltuieli eligibile             13        ?
2.4 Cheltuieli neeligibile           15        ?
2.5 Criterii de selecție             17        ?
2.6 Intensitatea sprijinului         26        ?
3.1 Completare depunere              33        ?
4.1 Documente necesare               52        ?
```

FAZA 3a — REGULI FIXE (verifică contra ghidului real):
```
REGULĂ                               ÎN DB?   CORECT?
────────────────────────────────────────────────────────
Beneficiar: PFA/II/IF/SRL/SA/SCS     ?        Lista completă?
  /SNC/SCA/Soc.agricolă/Cooperativă
  /Grup producători/Institut cercetare
Dimensiune economică min 8.000 SO    ?        operator: "min", value: 8000?
Ferma vegetală sau mixtă (P 4.1.1)   ?        ?
Cofinanțare privată obligatorie      ?        ?
Viabilitate economică demonstrată    ?        ?
Rezultat exploatare pozitiv (N-1)    ?        Cu excepții calamități?
Profit mediu <4x valoare sprijin     ?        ?
Procedura evaluare mediu demarată    ?        ?
Nu are proiecte active pe 4.1.1/     ?        ?
  4.1.4/4.1.7/4.1a
Cheltuieli neeligibile: clădiri,     ?        Lista completă (15+ itemi)?
  cap tractor, transport persoane,
  second hand, construcții-montaj,
  irigații, drenaj, desecare
Costuri generale max 5% eligibil     ?        operator: "max", value: 5?
```

FAZA 3b — REGULI INTERPRETATE:
```
REGULĂ                               ÎN DB?   ARBORE CORECT?
───────────────────────────────────────────────────────────────
Intensitate sprijin:
  Vegetale 8K-250K SO → 50% max 350K  ?       ?
  Vegetale 250K-500K SO → 50% max 400K ?      ?
  Vegetale >500K SO → 30% max 400K    ?       ?
  Cooperative/GP/OP → 50% max 1.5M    ?       ?
  +20pp tânăr fermier (<41 ani)       ?       Cu condiții instalare?
  +20pp agricultură ecologică         ?       Exclusiv sistem ecologic?
  +20pp agromediu (>50% suprafață)    ?       Cu pachete M.10/DR-02?
  +20pp zona ANC                      ?       Cu ref. Anexa 4?
  +20pp investiții colective          ?       Forme asociative?
  Max combinat: 70% cat I, 90% asoc.  ?       ?
```

FAZA 3c — SCORING (3 componente):
```
COMPONENTĂ I — Toate culturile (prag 56p):
  P1 Dimensiune: 8K-100K=17p, 12K-250K=13p     ?
  P2 Asociere: membru GP/OP/Coop=10p            ?
  P3 Mediu: no-till/min-till exclusiv=10p        ?
  P4 Vechime: ≥3 ani=20p, 1-2 ani=15p          ?
  P5 Fără finanțare anterioară=35p               ?
  P6 Agricultură ecologică=5p                    ?
  P7 Calificare: sup=3p, an term=2p, liceu=1p   ?
  TOTAL MAX: 100p                                ?

COMPONENTĂ II — Sfeclă zahăr (prag 32p):
  P1 Asociere=25p                                ?
  P2 Precizie/digitalizare: combine=40p,         ?
     semănători=20p
  P3 Vechime sfeclă: 2 ani/5=32p                ?
  P4 Calificare: 3p/2p/1p                       ?
  TOTAL MAX: 100p                                ?

COMPONENTĂ III — Forme asociative (prag 44p):
  P1 Dimensiune: proporțional membri              ?
  P2 Mediu: no-till=10p                           ?
  P3 Vechime: ≥3 ani=20p, 1-2=15p               ?
  P4 Fără finanțare=25p                           ?
  P5 Ecologic=5p                                  ?
  P6 Calificare manager=5p                        ?
  P7 Nr. membri: >20=20p, 16-20=18p,             ?
     10-15=16p, 6-9=14p
  TOTAL MAX: 100p                                 ?
```

Verifică FIECARE valoare de punctaj contra ghidului real (paginile 17-26).

FAZA 5 — ELEMENT DEFINITIONS:
```
ELEMENT KEY               CATEGORY      DATA TYPE   ÎN DB?
───────────────────────────────────────────────────────────
forma_juridica            beneficiary    enum        ?
cui                       beneficiary    text        ?
dimensiune_economica_so   farm           number      ?
suprafata_totala          farm           number      ?
suprafata_apia            farm           number      ?
caen_principal            beneficiary    text        ?
nr_angajati               financial      number      ?
cifra_afaceri             financial      number      ?
rezultat_exploatare       financial      number      ?
profit_mediu_3_ani        financial      number      ?
valoare_investitie        investment     number      ?
valoare_eligibila         investment     number      ?
intensitate_sprijin       investment     number      ?
componenta                investment     enum        ?
an_infiintare             beneficiary    number      ?
vechime_agroalimentar     beneficiary    number      ?
tip_utilaje               investment     text        ?
tehnologie_till           investment     enum        ?
membru_forma_asociativa   beneficiary    boolean     ?
calificare_manager        beneficiary    enum        ?
zona_anc                  location       enum        ?
agricultura_ecologica     farm           boolean     ?
angajament_agromediu      farm           boolean     ?
tanar_fermier             beneficiary    boolean     ?
```

Trebuie cel puțin 20-25 element definitions pentru sM 4.1.
Dacă sunt mai puțin de 15 → extracția e incompletă.

RAPORTEAZĂ: Tabel mare cu TOATE verificările + ✅/❌ per fiecare.

### 2B — FRONTEND: Verifică afișarea ghidului procesat

În pagina Documente, la ghidul procesat:
```
ELEMENT UI                    AFIȘAT?   CORECT?
──────────────────────────────────────────────
Status: "Procesat AI"         ?         Badge verde?
Nr. reguli extrase            ?         Count corect vs DB?
Nr. criterii scoring          ?         Count corect?
Nr. element definitions       ?         Count corect?
Trust score (dacă implementat) ?        ?
Expand → lista reguli         ?         Descrieri complete?
Expand → scoring criteria     ?         Per componentă?
Buton "Reprocesează"          ?         Vizibil?
Progress bar în timpul proc.  ?         SSE funcțional?
```

═══════════════════════════════════════════════════════════════
TEST 3: PROCESARE TEMPLATE
Document: docs_exemple/Template_Memoriu.docx
═══════════════════════════════════════════════════════════════

### 3A — BACKEND: Verifică extracția placeholders

Citește Template_Memoriu.docx (cu python-docx sau cat).
Identifică TOATE {{placeholder}}-urile din document.

```
PLACEHOLDER DIN DOCX          EXTRAS?   templateElement CREAT?
──────────────────────────────────────────────────────────────
(listează fiecare {{...}} real din document)
```

Verifică:
- Niciun placeholder ratat (inclusiv din tabele, headers, footers)
- Niciun false positive (text care arată ca {{}} dar nu e)
- fieldType clasificat corect (number/text/date/enum)
- pageNum și lineNum corecte

MAPPING verificare:
```
PLACEHOLDER KEY        MAPPED TO elementDef?   CONFIDENCE   CORECT?
──────────────────────────────────────────────────────────────────
(fiecare placeholder → elementDefinition match)
```

Dacă mapping e gol → ghidul nu era procesat înainte de template.
Verifică: există backfill la procesare ghid? (bug F3.2)

### 3B — FRONTEND: Template Viewer

```
ELEMENT UI                          AFIȘAT?   CORECT?
─────────────────────────────────────────────────────
Lista placeholders per pagină       ?         ?
Status per placeholder              ?         ?
(validat/detectat/manual)
Mapping → elementDefinition         ?         Link vizibil?
Config generare: FILL vs COMPOSE    ?         ?
Preview document                    ?         PDF real sau mock?
Adăugare manuală element            ?         Funcțional?
```

═══════════════════════════════════════════════════════════════
TEST 4: PROCESARE ANEXE (tabele referință)
Documente: Anexa_3 (DOCX) + Anexa_4 (XLSX)
═══════════════════════════════════════════════════════════════

### 4A — BACKEND: Verifică extracția tabelelor

ANEXA 3 — Corelarea puterii mașinii cu suprafața:
```
VERIFICARE                        AȘTEPTAT
──────────────────────────────────────────────
guideReferenceTable creat?        DA
Tip: "correlation"                ?
Headers extrase corect?           Suprafață, Putere min, Putere max
Rânduri extrase?                  Toate intervalele din tabel
Valori numerice corecte?          Nu string-uri
```

Testează un lookup concret:
- Suprafață 127.5 ha → Ce putere recomandă Anexa 3?
- Verifică că răspunsul e corect vs documentul original.

ANEXA 4 — Lista UAT ANC (XLSX, 4MB):
```
VERIFICARE                        AȘTEPTAT
──────────────────────────────────────────────
guideReferenceTable creat?        DA
Sheet-uri procesate?              Toate
Nr. UAT-uri extrase?             Sute/mii
Coloane: UAT, Județ, ANC ZM,     Toate prezente?
  ANC SPEC, ANC SEMN
```

Testează: 
- UAT "Felnac" (comuna firmei ANDA OANA) — în ce zonă ANC e?
- Verifică răspunsul vs fișierul XLSX original.

### 4B — FRONTEND: Vizibilitate tabele referință

```
ELEMENT UI                    AFIȘAT?
──────────────────────────────────────
Tabel referință vizibil       ?     În documentul ghid sau separat?
Căutare în Anexa 4            ?     Poți căuta un UAT?
Solomon vede tabelele?        ?     Verifică system prompt
```

═══════════════════════════════════════════════════════════════
TEST 5: SOLOMON CHAT
Context: Proiect ANDA OANA pe sM 4.1, Componenta I
═══════════════════════════════════════════════════════════════

### 5A — BACKEND: Verifică system prompt-ul Solomon

Citește services/solomon.ts — funcția care construiește system prompt.

```
SECȚIUNE SYSTEM PROMPT         PREZENTĂ?   DATE CORECTE?
────────────────────────────────────────────────────────────
Câmpuri lipsă (de colectat)    ?           Din elementDefinitions?
Câmpuri completate              ?           Din projectElements?
  - Denumire firmă: ANDA OANA  ?           Cu sursă (onrc_auto)?
  - CUI: 38480585              ?           ?
Reguli din ghid                 ?           Fixe + interpretate?
Tabele de referință             ?           Anexa 3 + 4 incluse?
  - Nu trunchiate la 50 rows?  ?           (warning W4.1)
Bază de cunoștințe              ?           solomonKnowledge?
```

### 5B — BACKEND: Verifică extracția ELEMENTS_JSON

Simulează mesajul: "Firma are 127.5 hectare de teren arabil 
și 3 angajați. Suprafața e înregistrată la APIA."

Solomon ar trebui să extragă:
```
ELEMENT EXTRAS          VALUE      CONFIDENCE   SALVAT?
──────────────────────────────────────────────────────────
suprafata_totala        127.5      >0.9         projectElements?
nr_angajati             3          >0.9         projectElements?
suprafata_apia          127.5      >0.85        projectElements?
```

Verifică CASCADA:
```
PAS                           EXECUTAT?   REZULTAT?
──────────────────────────────────────────────────
validateElement()             ?           valid/warning/error?
checkEligibility()            ?           Dimensiunea SO OK?
computeProjectScores()        ?           Scor actualizat?
SSE notification              ?           Frontend primit?
```

### 5C — FRONTEND: Solomon Chat UI

```
ELEMENT UI                       FUNCȚIONAL?
──────────────────────────────────────────────
Chat input + send                ?
Streaming răspuns SSE            ?
Upload fișier în chat            ?
Model selector (Sonnet/Opus)     ?
ET toggle                        ?
Inline refine (selectare text)   ?
Elemente extrase → notificare    ?
Update live sidebar elements     ?
Update live eligibilitate        ?
```

═══════════════════════════════════════════════════════════════
TEST 6: NEEMIA GENERARE DOCUMENTE
Template: Template_Memoriu.docx (COMPOSE mode)
═══════════════════════════════════════════════════════════════

### 6A — BACKEND: Verifică buildElementsMap()

```
PLACEHOLDER        VALOARE DIN projectElements    REZOLVAT?
──────────────────────────────────────────────────────────────
(fiecare placeholder din template → valoare din DB)
```

PATH 1 (mapping → elementDef → projectElements):
- Câte placeholders rezolvate?
- Câte lipsă?

PATH 2 (fallback templateElements):
- Se activează doar pentru nerezolvate?
- Dead code `&& false` eliminat? (warning W5.3)

### 6B — BACKEND: Verifică COMPOSE mode

Template_Memoriu.docx e document narativ → COMPOSE mode.

```
SECȚIUNE COMPOSE              GENERATĂ?   CALITATE?
──────────────────────────────────────────────────────
Prezentarea solicitantului    ?           Date reale ANDA OANA?
Descrierea investiției        ?           Utilaje concrete?
Necesitate și oportunitate    ?           Context Arad?
Contribuția la obiective      ?           Ref. DI 2A?
Impact mediu                  ?           Tehnologie till?
Sustenabilitate               ?           Indicatori financiari?
```

Per secțiune verifică:
- Folosește terminologie profesională (Writing Kit)?
- Date concrete din projectElements (nu inventate)?
- Referințe la ghid (secțiunea 2.X)?
- Keywords evaluator relevante?
- Placeholder-uri {{...}} pentru date lipsă (nu inventate)?
- Format RO numere (1.234,56 nu 1,234.56)?

### 6C — BACKEND: Verifică output DOCX

```
PROPRIETATE DOCX          CORECT?
──────────────────────────────────
Font: Times New Roman 12pt  ?
Spațiere: 1.15 sau 1.5     ?
Margini: 2.5cm              ?
Titluri: Bold 14pt          ?
Paginare subsol             ?
Tabele: borders + header    ?
Logo cabinet ABSENT         ?  (IMPORTANT: nu pe documente AFIR)
```

### 6D — FRONTEND: Neemia UI

```
ELEMENT UI                      FUNCȚIONAL?
──────────────────────────────────────────────
Lista template-uri cu fill %    ?
Câmpuri lipsă vizibile          ?
Buton generare                  ?
Progress streaming SSE          ?
Preview per secțiune (COMPOSE)  ?
Edit text generat               ?
Regenerare per secțiune         ?
Download DOCX final             ?
Versiuni document               ?
Validare consultant             ?
Consistență cross-document      ?
```

═══════════════════════════════════════════════════════════════
TEST 7: VERIFICARE CROSS-CUTTING
═══════════════════════════════════════════════════════════════

### 7A — Consistență date prin tot flow-ul

Urmărește valoarea "suprafata_totala = 127.5" prin TOT sistemul:

```
LOCAȚIE                              VALOARE    CORECT?
──────────────────────────────────────────────────────────
1. Solomon extrage din chat          127.5      ?
2. projectElements.value             "127.5"    String sau number?
3. validateElement() validează       valid?     min/max respectat?
4. Eligibilitate: SO calculat        ???        Corelat cu suprafață?
5. Scoring: P1 dimensiune            ???        Interval corect?
6. Neemia elementsMap                "127.5"    ?
7. Template DOCX: {{suprafata}}      127,5      Format RO?
8. Solomon system prompt next call   127.5      Afișat ca completat?
9. UI: secțiunea Elemente            127.5      Cu unitate (ha)?
10. Corelație Anexa 3                ???        Putere tractor OK?
```

### 7B — Multi-tenancy check

```
VERIFICARE                               CORECT?
──────────────────────────────────────────────────
Cache Redis include orgId?               ? (bug F1.2)
Rules filtrate pe organizationId?        ?
elementDefinitions filtrate pe orgId?    ?
projectElements filtrate pe projectId?   ?
Templates vizibile doar în cabinet?      ?
Solomon knowledge filtrat pe orgId?      ?
API routes: organizationId pe toate?     ?
```

═══════════════════════════════════════════════════════════════
FORMAT RAPORT FINAL
═══════════════════════════════════════════════════════════════

Generează raport structurat:

## E2E VERIFICATION REPORT — [data]

### SUMAR
- Total verificări: X
- ✅ PASS: Y
- ❌ FAIL: Z (cu detalii)
- ⚠️ WARN: W

### PER TEST
Test 1 (Firmă):     X/Y pass  — probleme: [lista]
Test 2 (Ghid):      X/Y pass  — probleme: [lista]
Test 3 (Template):  X/Y pass  — probleme: [lista]
Test 4 (Anexe):     X/Y pass  — probleme: [lista]
Test 5 (Solomon):   X/Y pass  — probleme: [lista]
Test 6 (Neemia):    X/Y pass  — probleme: [lista]
Test 7 (Cross):     X/Y pass  — probleme: [lista]

### PROBLEME CRITICE (fixează imediat)
Per problemă: fișier, linie, ce e greșit, fix sugerat

### DATE VERIFICATE CONCRET
Tabel cu FIECARE valoare verificată: așteptat vs actual vs status

După raport: FIXEAZĂ toate ❌ găsite, apoi re-rulează verificarea.
Commit: "fix: e2e verification — [nr] issues fixed"
