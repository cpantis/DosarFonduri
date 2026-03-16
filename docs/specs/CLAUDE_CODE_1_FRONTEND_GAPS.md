# CLAUDE CODE — Document 1/3
# Frontend Gaps: Afișare date + Polish UI
# DosarFonduri v2

## Core Rules
- Read the file before answering. Never speculate about code you have not opened.
- Do not hard-code values. Implement the actual logic.
- Write high-quality, general-purpose solutions.
- Do not stop early due to token budget concerns.
- Context will be compacted automatically, continue working.

## REGULĂ FUNDAMENTALĂ
NU strică ce funcționează deja. Doar ADAUGĂ și ÎMBUNĂTĂȚEȘTE.
Înainte de a edita orice componentă, citește-o complet și înțelege ce face.
După fiecare modificare, verifică că pagina încă se renderizează corect.
Build check: `bun run build` trebuie să treacă fără erori noi.

## AI PROVIDER
Platforma folosește EXCLUSIV Anthropic (Claude) pentru AI.
- Solomon: Opus + Extended Thinking
- Neemia: Sonnet
- Clasificare: Haiku
- OCR fallback: Claude Vision (Haiku)
NU există OpenAI, GPT-4o, sau alt provider în codebase.

---

## PARTEA A — GAPS CRITICE (3 probleme)

### GAP 1: Scor proiect neafișat nicăieri (🔴 CRITIC)

PROBLEMA: GET /api/projects/:id/scores returnează punctaj total, max, 
procent per criteriu. Datele există în backend dar NU se afișează în UI.
Consultantul trebuie să vadă scorul estimat IMEDIAT — e primul lucru 
pe care îl verifică înainte de depunere.

CE TREBUIE FĂCUT:

1. Citește routes/projects.ts — găsește endpoint-ul /scores și înțelege 
   structura răspunsului (totalPoints, maxPoints, percentage, perCriterion[])

2. În ProjectView, secțiunea SUMAR (primul tab din sidebar), adaugă:
   
   Card "Scor estimat" vizibil prominent:
   - Punctaj total: {totalPoints} / {maxPoints} ({percentage}%)
   - Progress bar colorat: verde >80%, galben 60-80%, roșu <60%
   - Prag calitate lunar afișat cu linie pe progress bar
   - Sub card: tabel per criteriu cu punctaj obținut/max
   
   Componenta trebuie:
   - Să facă fetch la /api/projects/:id/scores 
   - Să se actualizeze via SSE când cascada recalculează scorul
   - Să afișeze componentă per componentă (I, II, III) dacă proiectul 
     are componentă selectată

3. În lista de proiecte (/projects), pe fiecare card proiect:
   - Adaugă badge scor: "72/100" cu culoare

4. NU modifica logica de calcul din backend — doar afișează ce returnează.

---

### GAP 2: Validare buget lipsă din UI (🔴 CRITIC)

PROBLEMA: GET /api/projects/:id/budget-validation și 
POST /api/projects/:id/validate-budget există dar nu sunt integrate.

CE TREBUIE FĂCUT:

1. Citește endpoint-urile de buget din routes/projects.ts

2. În ProjectView Sumar, adaugă secțiune "Buget":
   - Valoare totală proiect
   - Valoare eligibilă
   - Valoare nerambursabilă (intensitate %)
   - Contribuție proprie
   - Erori/warnings de la validate-budget afișate cu iconițe
   
3. Dacă bugetul are erori → badge roșu pe "Sumar" în sidebar

---

### GAP 3: Consistență cross-document Neemia (🔴 CRITIC)

PROBLEMA: GET /api/neemia/projects/:id/consistency returnează 
inconsistențe între documente generate. UI LIPSEȘTE complet.

CE TREBUIE FĂCUT:

1. Citește endpoint-ul consistency din routes/neemia.ts

2. În secțiunea Neemia din ProjectView, adaugă buton:
   "Verifică consistența documentelor"
   
3. La click → afișează modal/panel cu:
   - Lista inconsistențelor: câmp X are valoare Y în Doc A 
     dar valoare Z în Doc B
   - Per inconsistență: buton "Corectează" (setează valoarea corectă)
   - Scor consistență: 95% consistent (verde) / 70% (galben) / <70% (roșu)

---

## PARTEA B — GAPS IMPORTANTE (4 probleme)

### GAP 4: Knowledge Base UI lipsă din Configurări

PROBLEMA: CRUD /api/config/knowledge complet în backend, zero UI.
Consultantul nu poate adăuga legislație, corecții, bune practici.

CE TREBUIE FĂCUT:

1. Citește routes/config.ts — endpoints knowledge

2. În pagina Settings (/settings), adaugă secțiune nouă "Bază de cunoștințe":
   - Lista entries existente cu: titlu, categorie, validFrom, validUntil
   - Buton "Adaugă cunoștință" → form cu:
     - Titlu (text)
     - Categorie: dropdown (legislatie, bune_practici, corecturi, praguri)
     - Conținut (textarea, markdown)
     - Valid de la / până la (date pickers)
   - Edit inline per entry
   - Delete cu confirmare
   - Badge pe entries expirate

3. Solomon folosește deja aceste knowledge entries — verifică în solomon.ts 
   că query-ul filtrează corect pe validFrom/validUntil.

---

### GAP 5: Branding Cabinet UI lipsă

PROBLEMA: GET/PUT /api/config/branding există, UI lipsește.

CE TREBUIE FĂCUT:

1. Citește endpoint branding din config routes

2. În Settings, adaugă secțiune "Branding Cabinet":
   - Upload logo (imagine)
   - Font family: dropdown (Times New Roman, Arial, Calibri)
   - Culoare primară: color picker
   - Text footer documente: textarea
   - Preview pe document sample (mock)

3. IMPORTANT: Logo-ul cabinetului apare DOAR pe documente de lucru/draft,
   NICIODATĂ pe documente trimise la AFIR (submissions sunt în numele 
   solicitantului, nu al cabinetului).

---

### GAP 6: Date financiare pe carduri firme

PROBLEMA: Backend returnează capitalSocial, cifraAfaceri, nrAngajati 
dar cardurile din lista de firme NU le afișează.

CE TREBUIE FĂCUT:

1. Citește componenta card firmă din pagina companies

2. Adaugă pe fiecare card:
   - Capital social: formatat RON (ex: 200 RON, 50.000 RON)
   - Cifra de afaceri: formatat (ex: 1.234.567 RON)
   - Nr. angajați: număr simplu
   - Badge IMM automat: 
     Micro (<10 angajați, <2M EUR CA)
     Mică (<50 angajați, <10M EUR CA)
     Mijlocie (<250 angajați, <50M EUR CA)
     Mare (rest)
   - Logica IMM se calculează în frontend din datele existente
   
3. NU adăuga endpoint nou — datele sunt deja în response-ul GET /companies

---

### GAP 7: Alertă insolvență/restricții pe firme

PROBLEMA: ONRC raw data conține restricții, insolvență, dizolvare, 
lichidare — neafișate pe carduri sau detalii firmă.

CE TREBUIE FĂCUT:

1. Citește structura ONRC raw din companies table (JSONB)

2. Pe cardul firmei din listă:
   - Banner roșu subtil dacă: insolventa || dizolvare || lichidare
   - Text: "⚠ Insolvență" / "⚠ Dizolvare" / "⚠ Lichidare"

3. Pe pagina detalii firmă:
   - Banner roșu mare la top dacă are restricții active
   - Secțiune "Restricții" cu detalii din ONRC raw
   - Data ultimei mențiuni ONRC vizibilă

4. La creare proiect: warning dacă firma selectată are restricții

---

## PARTEA C — GAPS UTILE (14 probleme)

### GAP 8: Learnings proiecte similare
Endpoint: GET /api/projects/:id/learnings
Adaugă în ProjectView Sumar: card "Sfaturi din proiecte similare" 
cu lista de learnings returnate de endpoint.

### GAP 9: Validate-all + Bulk confirm elemente
Endpoints: POST validate-all, PUT bulk/confirm
În secțiunea Elemente din ProjectView:
- Buton "Validează toate" → apelează validate-all
- Buton "Confirmă toate validate" → apelează bulk/confirm
- Ambele cu confirmare dialog + progress indicator

### GAP 10: Câmpuri calculate Neemia
Endpoint: POST /api/neemia/projects/:id/calculate
În secțiunea Neemia: buton "Recalculează câmpuri" vizibil,
cu indicator freshness ("Ultima recalculare: acum 5 min").

### GAP 11: Validare consultant per document
Endpoint: PUT /api/neemia/documents/:docId/validate
Pe fiecare document generat în Neemia: buton vizibil 
"✅ Validat de consultant" cu toggle on/off + timestamp.

### GAP 12: Compose preview
Endpoint: POST /api/neemia/projects/:id/compose/preview
Înainte de generare compose: buton "Preview" care arată 
textul AI fără a salva/genera DOCX-ul final.

### GAP 13: Export JSON/CSV din Admin
Endpoints: GET /api/export/projects, /projects-csv, /config, /activity
În pagina Admin: buton dropdown "Export" cu opțiuni:
- Export proiecte JSON
- Export proiecte CSV
- Export configurație
- Export activitate

### GAP 14: Costuri AI per proiect
Date disponibile în AI costs response.
În Admin → AI Costs: adaugă breakdown per proiect (nu doar per agent/model).

### GAP 15: Alerte urgente pe Dashboard
Date disponibile: certificate fiscale, extrase cont, documente eroare.
Pe Dashboard: secțiune "⚠ Atenție" cu:
- Certificate fiscale expirate
- Extras cont > 5 zile
- Documente cu eroare de procesare
- Proiecte cu elemente lipsă critice

### GAP 16: Rata de succes Dashboard
Backend returnează approvalRate.
Adaugă card stat: "Rata de succes: X%" cu trend arrow.

### GAP 17: Filtre lista proiecte
Adaugă deasupra listei de proiecte:
- Filtru status: All / Draft / În progres / Review / Aprobat / Respins
- Filtru program/măsură: dropdown
- Filtru firmă: dropdown
- Sortare: dată, valoare, progres
- Toggle view: carduri / tabel

### GAP 18: Progres checklist + Neemia pe lista proiecte
Pe cardul de proiect din listă, adaugă bare progres pentru:
- Checklist documente: X/Y documente
- Documente generate: X/Y template-uri

### GAP 19: Preview PDF inline documente
Presigned URL disponibil.
La click pe document: deschide preview PDF în modal (iframe sau PDF.js),
nu doar download. Buton "Descarcă" separat.

### GAP 20: Link element → regulă în Template Viewer
Endpoint: GET /api/reference/elements/:elementId/rule-links
Pe fiecare element din template viewer: tooltip/link cu 
"Impus de regula: [descriere regulă] (pag. X din ghid)".

### GAP 21: Scoring per element în Template Viewer
scoringCriteria în DB legat de elemente.
Pe fiecare element relevant: indicator 
"Contribuie la criteriul X (max Y puncte)".

---

## PARTEA D — NICE TO HAVE (3 probleme)

### GAP 22: Grafic trend financiar pe detalii firmă
Date multi-an disponibile în financials.
Adaugă chart (recharts sau chart.js) cu evoluție 
venituri/profit pe ultimii 3-5 ani.

### GAP 23: Decodificare CAEN
Adaugă un fișier static caen_codes.json cu maparea cod → descriere.
Afișează descrierea lângă codul CAEN peste tot în aplicație.
Sursa: lista CAEN rev.2 disponibilă public.

### GAP 24: SSE reconectare automată
Adaugă reconnect logic pe EventSource:
- La pierdere conexiune: retry automat cu exponential backoff
- Indicator vizual: "Reconectare..." subtle în UI
- Max 5 retry-uri, apoi mesaj "Conexiune pierdută. Reîncarcă pagina."

---

## PARTEA E — POLISH UI BUTOANE

PROBLEMA: Butoanele au padding fix care nu se adaptează la text.
"Creează cont" arată umflat, selector roluri neproporțional.

CE TREBUIE FĂCUT:

1. Citește components/ui/button.tsx (componenta shadcn Button)

2. Verifică și actualizează size variants:
   ```
   size: {
     sm:      "h-8  px-3  text-xs   gap-1.5 rounded-md",
     default: "h-9  px-4  text-sm   gap-2   rounded-lg", 
     lg:      "h-10 px-5  text-sm   gap-2   rounded-lg",
     xl:      "h-11 px-6  text-base gap-2.5 rounded-lg",
     icon:    "h-9  w-9   rounded-lg",
   }
   ```
   Regula: padding-x crește PROPORȚIONAL cu height.

3. Grep prin TOATĂ aplicația pentru butoane cu padding hardcoded:
   - className=".*px-8.*" pe butoane
   - className=".*px-10.*" pe butoane
   - className=".*px-12.*" pe butoane
   Înlocuiește cu size prop din componenta Button.

4. Butoane în grup (selector rol Admin/Consultant/Vizualizare):
   Container: grid grid-cols-3 gap-2
   Fiecare: flex flex-col items-center p-3 rounded-lg border-2
   Grid-ul asigură lățime egală, padding-ul interior e consistent.

5. Buton "Creează cont" pe pagina auth:
   Corect: <Button size="lg" className="w-full">Creează cont</Button>
   Greșit: <Button className="px-16 py-4">Creează cont</Button>

6. Verifică TOATE modalele/dialogurile din aplicație:
   - Butoane acțiune: size="default" (nu px-8)
   - "Anulează": variant="ghost" size="default"
   - CTA: size="default" sau "lg", nu mai mare
   - Spațiu între butoane: gap-2

---

## VERIFICARE FINALĂ DOCUMENT 1

După implementare:
1. `bun run build` — zero erori noi
2. Navigheaza manual FIECARE pagină:
   - /dashboard — card scor, alerte, rată succes
   - /companies — date financiare pe carduri, badge IMM, alertă insolvență
   - /companies/[id] — restricții vizibile, grafic trend
   - /projects — filtre, progres checklist/neemia, sortare
   - /projects/[id] — SCOR vizibil în Sumar, buget, consistență Neemia
   - /documents — preview PDF, reprocesare vizibilă
   - /settings — Knowledge Base, Branding
   - /admin — export, costuri per proiect
3. Verifică că NICIUN element existent nu s-a stricat
4. Commit: "feat: implement all 24 frontend gaps from audit + UI polish"
