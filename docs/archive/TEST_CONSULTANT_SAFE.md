# TEST APLICAȚIE — Firme → Documente → Proiecte
## Consultantul testează + observă vizualul la fiecare pas

---

## ⛔ REGULI ABSOLUTE

> **NU MODIFICA NICIUN FIȘIER. NU REPARA NIMIC.**
> **Comenzi permise: cat, grep, find, ls, wc, head, tail, git log/diff/status**
> **La final generezi: RAPORT_TESTARE.md**

---

## CINE EȘTI

### 🧑‍💼 ANDREI — Consultant senior fonduri europene
- Folosește aplicația ca un utilizator real, pe ecran
- La FIECARE pas verifică:
  - **Funcționează?** (butonul merge, datele apar, navigarea duce unde trebuie)
  - **Se vede?** (elementele sunt vizibile fără scroll inutil, nu sunt tăiate, nu dispar)
  - **Arată bine?** (spacing, aliniere, text citibil, butoane echidistante, culori consistente)
  - **Scroll corect?** (pagina scrollează pe conținut, NU pe sidebar/topbar, fără double scroll)
- Raportează EXACT ce vede: „butonul e tăiat pe jumătate", „trebuie să dau scroll ca să văd butoanele de acțiune", „textul iese din card"

### 👩‍💻 ELENA — Expert software
- Când Andrei raportează o problemă, Elena citește codul și găsește cauza
- Elena DOAR citește (cat, grep) — nu modifică nimic
- Elena raportează: fișier, linie, ce clasă CSS sau ce condiție cauzează problema

---

## CE VERIFICĂ ANDREI LA FIECARE ECRAN (checklist vizual)

La FIECARE pagină sau componentă pe care o testează, Andrei verifică:

```
SCROLL:
□ Sidebar-ul rămâne fix când dau scroll pe conținut?
□ Topbar-ul rămâne fix?
□ Scroll-ul e DOAR pe zona de conținut, nu pe toată pagina?
□ Există double scrollbar? (unul pe pagină + unul pe conținut)
□ Pe split pane: fiecare panou scrollează independent?

VIZIBILITATE:
□ Toate butoanele de acțiune sunt vizibile FĂRĂ scroll?
□ Titlul paginii și butonul principal sunt pe același rând?
□ Modalele/wizard-urile se văd complet? Nu sunt tăiate de ecran?
□ Text-ul lung: are truncation (...) sau iese din container?
□ Pe ecran 1366×768 (laptop): totul e vizibil?

ASPECT:
□ Butoanele au padding egal? (text centrat, nu lipit de margine)
□ Spacing uniform între elemente? (nu un gap mare sus și mic jos)
□ Fontul e consistent? (nu un text mare într-un loc și mic în altul)
□ Culorile sunt consistente? (nu badge verde într-un loc și albastru în altul pt. același lucru)
□ Iconițele au aceeași dimensiune?
□ Border-radius e același pe toate card-urile?
□ Hover pe butoane: feedback vizual? (culoare se schimbă?)
□ Focus pe input-uri: ring vizibil?

FUNCȚIONAL:
□ Click pe buton → face ce trebuie?
□ Click pe link/card → navighează corect?
□ Tab-urile funcționează? Click pe alt tab → conținut se schimbă?
□ Back button / breadcrumb → mă întoarce unde trebuie?
□ După salvare/creare → redirect corect?
```

---

# FLOW 1: FIRME

## 1.1 Pagina Firme — Prima vedere

```
Andrei navighează la Firme din sidebar.

ELENA citește:
□ cat apps/web/src/app/(app)/companies/page.tsx | head -80
□ wc -l apps/web/src/app/(app)/companies/page.tsx
□ grep -n "className\|style=" apps/web/src/app/(app)/companies/page.tsx | head -30

ANDREI verifică:
□ Pagina se încarcă? Ce layout: split pane (listă + detaliu) sau listă simplă?
□ Lista de firme: vizibilă fără scroll?
□ Butonul "+ Firmă nouă": unde e? Vizibil imediat sau trebuie scroll?
□ Search/filter: există pe lista de firme?
□ Dacă 0 firme: empty state? Ce mesaj? Buton de acțiune?
□ Sidebar-ul rămâne fix dacă lista de firme e lungă?
□ Split pane: lista scrollează independent de detaliu?
```

## 1.2 Adăugare firmă nouă

```
Andrei apasă "+ Firmă nouă".

ELENA citește:
□ grep -n "modal\|wizard\|dialog\|Firmă nouă\|adaug" apps/web/src/app/(app)/companies/page.tsx | head -15
□ Citește componenta modală/wizard

ANDREI verifică:
□ Ce se deschide? Modal? Wizard? Pagină nouă?
□ Modal-ul e centrat pe ecran? Nu e tăiat?
□ Ce pași are? (1 pas? 2? 3?)
□ Upload Certificat Constatator: există zona de upload? 
□ Zona de upload: drag & drop sau doar click?
□ Dacă upload: progress vizibil?
□ După upload CC: datele se extrag automat?
  → CUI, Denumire, Sediu, Administrator — apar pre-completate?
□ Input-urile au label vizibil? (nu doar placeholder)
□ Input-urile au dimensiune uniformă? 
□ Câmpuri obligatorii marcate cu * ?
□ Butonul "Salvează" / "Continuă": vizibil fără scroll?
□ Butoane "Înapoi" + "Salvează": echidistante, aliniate dreapta?
□ Butonul "Salvează" disabled cât se procesează?
□ După salvare: unde mă duce? Firma apare în listă?
```

## 1.3 Detaliu firmă

```
Andrei selectează firma ANDA OANA din listă.

ELENA citește:
□ grep -n "tab\|Tab\|activeTab\|selectedTab" apps/web/src/app/(app)/companies/page.tsx | head -15
□ Citește secțiunea de detaliu din componentă

ANDREI verifică:
□ Detaliul apare: în panoul din dreapta sau pe pagină nouă?
□ Firma selectată e evidențiată vizual în listă? (background diferit?)
□ Ce tabs are detaliul? Listează-le.
□ Tab-urile sunt vizibile toate pe un rând? Sau overflow?
□ Tab activ: indicator vizual clar? (border-bottom, culoare)
□ Tab "General": ce date arată? CUI, Denumire, Sediu, CAEN?
□ Datele sunt citibile? Font size OK? Spacing între câmpuri?
□ Tab "Financiar" / "ANAF": ce date? Bilanț? Cifră afaceri?
□ Tab "Documente": ce documente sunt atașate firmei?
□ Scroll pe detaliu: independent de lista din stânga?
□ Detaliu lung: butonul "Editează" rămâne vizibil sau trebuie scroll?
```

## 1.4 Editare firmă

```
ELENA citește:
□ grep -n "edit\|Editează\|update\|handleEdit" apps/web/src/app/(app)/companies/page.tsx | head -10

ANDREI verifică:
□ Buton "Editează": unde e? Funcționează?
□ Formular de editare: câmpurile au valori pre-completate?
□ Pot modifica CUI? Denumire? Sediu?
□ Salvare: buton vizibil? Loading state? Feedback după salvare?
```

---

# FLOW 2: DOCUMENTE

## 2.1 Pagina Documente — Prima vedere

```
Andrei navighează la Documente din sidebar.

ELENA citește:
□ cat apps/web/src/app/(app)/documents/page.tsx | head -80
□ wc -l apps/web/src/app/(app)/documents/page.tsx
□ grep -n "tree\|Tree\|folder\|Folder\|split\|Split" apps/web/src/app/(app)/documents/page.tsx | head -15

ANDREI verifică:
□ Layout: tree view stânga + preview dreapta? Sau altceva?
□ Arborele de foldere: se vede? Are expand/collapse?
□ Buton "+"/upload: unde e? Vizibil?
□ Dacă 0 foldere: empty state?
□ Tree view scrollează independent de preview?
□ Tree view: textul folderelor e citibil? Nu se suprapune?
□ Iconițe pe foldere: diferite per tip? (program, măsură, sesiune)
```

## 2.2 Creez structura de foldere

```
Andrei creează:
  Program 1 (PNDR)
    └─ Măsura 4.1
        └─ Sesiunea 1 (2024)

ELENA citește:
□ grep -n "createFolder\|newFolder\|addFolder\|folder.*create" apps/web/src --include="*.tsx" -r | head -10
□ grep -n "POST.*folder\|folder.*post" apps/api/src --include="*.ts" -r | head -10

ANDREI verifică:
□ Cum creez un folder? Click dreapta? Buton? Modal?
□ Pot da nume folderului? Input clar?
□ Pot seta tipul? (program, măsură, sesiune) Sau e automat pe nivel?
□ Ierarhia se construiește corect vizual? Indentare clară?
□ Bulinele/iconițele diferă per nivel? (design spec: 12px albastru, 8px auriu, 6px gri)
□ Folderul nou apare imediat sau trebuie refresh?
□ Pot redenumi/șterge un folder? Click dreapta funcționează?
```

## 2.3 Uploadez ghidul pe sesiune

```
Andrei selectează Sesiunea 1 și uploadează ghidulsolicitantuluism41componenta411final.pdf.

ELENA citește:
□ grep -n "upload\|Upload\|dropzone\|handleFile\|onDrop" apps/web/src/app/(app)/documents/page.tsx | head -15
□ grep -n "processGuide\|guideProcessing" apps/api/src --include="*.ts" -r | head -10

ANDREI verifică:
□ Zona de upload: vizibilă când selectez sesiunea?
□ Drag & drop: funcționează pe zona de conținut?
□ Progress upload: bară vizibilă per fișier?
□ În timpul procesării: ce văd? Spinner? "Procesare pagina X/62"?
□ Badge status pe document: "Pending" → "Processing" → "Procesat"?
□ După procesare: văd "33 reguli, 45 elemente" pe card?
□ Expand detalii: tab-uri Reguli/Criterii/Elemente funcționează?
□ Tab Reguli: lista e citibilă? Font size OK? Scroll pe listă?
□ Tab Reguli: sunt toate regulile vizibile sau unele tăiate?
□ Tab Criterii scoring: tabel cu maxPoints? Total 100?
□ Tab Elemente: lista element_definitions? Categorii vizibile?
□ Dacă procesarea eșuează: ce văd? Mesaj de eroare? Buton retry?
```

## 2.4 Uploadez template-uri

```
Andrei uploadează Template_Memoriu.docx, Cerere Finanțare, Anexe.

ELENA citește:
□ grep -n "template\|Template\|processTemplate" apps/api/src --include="*.ts" -r | head -10

ANDREI verifică:
□ Template recunoscut automat? Badge "Template" vizibil?
□ FILL vs COMPOSE detectat corect?
□ Placeholders extrași vizibili pe card?
□ Click pe template → Template Viewer se deschide?
□ Template Viewer: split pane (elemente stânga, preview dreapta)?
□ Scroll pe lista de elemente: independent de preview?
□ Preview document: se vede? PDF renderizat sau just text?
□ Elemente clickabile cu highlight pe preview?
```

---

# FLOW 3: PROIECTE

## 3.1 Pagina Proiecte — Prima vedere

```
Andrei navighează la Proiecte din sidebar.

ELENA citește:
□ cat apps/web/src/app/(app)/projects/page.tsx | head -60
□ wc -l apps/web/src/app/(app)/projects/page.tsx

ANDREI verifică:
□ Ce layout: carduri? Tabel? Toggle între cele două?
□ Toggle Cards/Tabel: vizibil? Funcționează?
□ Buton "+ Proiect Nou": unde e? Vizibil fără scroll?
□ Dacă 0 proiecte: empty state? CTA „Creează primul proiect"?
□ Card proiect (dacă există): ce info arată?
  → Nume, firmă, program, progress bar, status, ultima activitate?
□ Progress bar pe card: vizibil? Procent clar?
□ Card hover: feedback vizual? (shadow, border change?)
□ Click pe card: navighează la detaliu? URL se schimbă?
□ Grid cards: responsive? (1 col, 2 col, 3 col pe lățimi diferite?)
```

## 3.2 Wizard creare proiect — ⚠️ BUG CUNOSCUT

```
Andrei apasă "+ Proiect Nou".

ELENA citește — ATENȚIE MAXIMĂ:
□ grep -rn "Proiect nou\|wizard.*project\|modal.*project\|create.*project" apps/web/src --include="*.tsx" | head -10
□ Citește COMPLET componenta wizard
□ grep -rn "ghid\|guide\|processed\|hasGuide" [fișierul wizard] 
□ Citește condiția de validare EXACTĂ — copiază linia de cod

ANDREI verifică:

PASUL 1 — Selectare firmă:
□ Lista firmelor: se încarcă? Andrei vede ANDA OANA?
□ Firmă selectată: feedback vizual? (highlight, checkmark)
□ Buton "Continuă": activ doar după selecție?
□ Layout: totul vizibil în modal? Fără scroll necesar?

PASUL 2 — Selectare program/sesiune:
□ Arborele program → măsură → sesiune: se vede complet?
□ Fiecare nivel expandabil? Click funcționează?
□ Selecția e pe SESIUNE (ultimul nivel)?
□ ⚠️ WARNING "măsura nu are ghid procesat": APARE?
  → Dacă DA: mesajul e corect? Verifică pe CE nivel se face check.
  → Dacă DA: butonul "Continuă" e disabled sau doar warning?
  → Elena: CITEȘTE condiția din cod. E pe folder.parentId (măsură) sau folder.id (sesiune)?
□ Info afișat: "X reguli, Y elemente" — pe ce nivel? Corect?
□ Scroll pe arbore: dacă sunt multe sesiuni, scrollează fără să miște modalul?

PASUL 3 — Confirmare:
□ Recap: firmă + program + sesiune vizibile?
□ Buton "Creează proiect": vizibil, centrat, activ?
□ Loading state pe buton: spinner cât se creează?
□ După creare: redirect la /projects/[id]?
□ Ce tab se deschide default?

ELENA RAPORTEAZĂ OBLIGATORIU:
```
VALIDARE GHID:
- Fișier: [path:linie]
- Condiția din cod: [copiază linia exactă]  
- Verifică pe: [MASURA / SESIUNE]
- AR TREBUI pe: SESIUNE
- Butonul Continuă: [disabled / doar warning / blocat complet]
```
```

## 3.3 Detaliu proiect — Header și tabs

```
Andrei e pe pagina proiectului.

ELENA citește:
□ wc -l apps/web/src/app/(app)/projects/\[id\]/page.tsx
□ grep -n "tab\|Tab\|leaf\|Leaf\|activeTab\|activeLeaf" apps/web/src/app/(app)/projects/\[id\]/page.tsx | head -20

ANDREI verifică:
□ Header proiect: nume, firmă, status badge — vizibil fără scroll?
□ Breadcrumb: „Proiecte / ANDA OANA" — click pe „Proiecte" mă întoarce?
□ Tab bar: câte tab-uri? Listează-le TOATE.
□ Tab-urile se văd TOATE pe un rând? Sau overflow?
□ Tab activ: indicator vizual clar? (border-bottom colorat)
□ Click pe fiecare tab: conținutul se schimbă?
□ Tab bar rămâne FIX când conținutul scrollează?
□ Switch între tabs: instant sau delay vizibil?
□ Badge-uri pe tabs (ex: "94/120"): vizibile? Actualizate?
```

## 3.4 Tab Sumar

```
ANDREI verifică:
□ Stat cards: câte? Ce arată? (elemente, progress, reguli, documente)
□ Cards pe un rând sau pe mai multe?
□ Numere mari: font size OK? Vizibile?
□ Activitate recentă: există? Ce items? 
□ Click pe items din activitate: navighează undeva?
□ Totul vizibil fără scroll? Sau conținutul e prea lung?
```

## 3.5 Tab Eligibilitate

```
ANDREI verifică:
□ Lista reguli: se vede? Câte reguli?
□ Per regulă: badge colorat (verde/roșu/gri)?
□ Badge-urile sunt consistente ca stil?
□ Expandable pe regulă? Click arată detalii?
□ Warning dacă reguli FAIL: banner roșu vizibil?
□ Scroll pe lista de reguli: fluid? Fără lag?
□ Ca consultant: regulile sunt corecte pentru sM 4.1?

ELENA citește:
□ grep -n "eligib\|Eligib" apps/web/src/app/(app)/projects/\[id\]/page.tsx | head -10
□ Ce componentă? Ce API call? Ce date afișează?
```

## 3.6 Tab Solomon — ⚠️ VERIFICARE DETALIATĂ

```
ANDREI verifică Solomon ca utilizator zilnic:

LAYOUT:
□ Split pane: chat stânga + elemente dreapta?
□ Proporția: chat ocupă mai mult? (~65-70%?)
□ Panoul elemente: rămâne fix sau scrollează cu chat-ul?
□ Input area: fixă la FUND sau dispare la scroll?
□ Mesajele: au max-width centrat (ca pe claude.ai) sau wall-to-wall?

SCROLL:
□ Scroll pe chat: independent de panoul elemente?
□ Auto-scroll la mesaj nou: funcționează?
□ Dacă scrollez manual în sus: rămân unde sunt sau mă teleportează la fund?
□ Indicator "Mesaje noi ↓": apare dacă sunt scrollat în sus?

INPUT:
□ Zona de input: textarea (multi-line) sau input simplu (o linie)?
□ Textarea crește cu textul? Auto-resize?
□ Enter trimite mesajul? Shift+Enter face new line?
□ Focus automat pe textarea la deschidere tab?
□ Focus revine pe textarea după trimitere mesaj?
□ Placeholder text: ce scrie? E clar?
□ Buton Send: vizibil? Se activează când scriu text?
□ Buton Send disabled când input gol? (vizual clar — opacitate redusă?)

MESAJE:
□ Mesaj user vs Solomon: stil diferit? Clar cine vorbește?
□ Avatar pe mesaje: Solomon are? User-ul are?
□ Timestamp: vizibil? Discret?
□ Mesaj lung: text-ul face wrap corect? Nu iese din container?
□ Font pe mesaje: dimensiune confortabilă de citit? (16px?)
□ Spacing între mesaje: confortabil? Nu suprapuse, nu prea rare?

STREAMING:
□ Când trimit mesaj: typing indicator apare? (puncte animate?)
□ Răspunsul streameaza? Sau apare tot deodată?
□ Buton STOP: există în timpul generării? Pot opri?
□ Dacă dau STOP: textul parțial rămâne vizibil?

EXTRACȚII:
□ Când Solomon extrage date: apar carduri distincte?
□ Cardurile de extracție: label + valoare + sursă vizibile?
□ Butoane "Confirmă" / "Respinge" / "Editează": vizibile? Echidistante?
□ "Confirmă toate": buton prezent dacă sunt mai mult de 2 extracții?
□ "Editează": funcționează? Pot schimba valoarea?
□ După confirmare: cardul se schimbă vizual? (verde, checkmark)
□ Elementul se actualizează în panoul din dreapta?

PANOUL ELEMENTE (dreapta):
□ Header: counter "X/120 completate"? Progress bar?
□ Elemente grupate pe categorii? (Date firmă, Financiar, Exploatație)
□ Element confirmat: indicator verde ✓ + valoare vizibilă?
□ Element propus: indicator galben ⚠?
□ Element gol: indicator gri ○?
□ Valorile: vizibile complet sau tăiate? (truncation cu tooltip?)
□ Scroll pe elemente: independent de chat?
□ Click pe element: face ceva? (expand, scroll la mesaj sursă?)

ELENA investighează:
□ find apps/web/src -name "*.tsx" | xargs grep -l -i "solomon" 2>/dev/null
□ Citește componenta Solomon complet
□ SSE: cum e implementat? EventSource URL?
□ Stop button: există handler? AbortController?
□ Auto-scroll: cum e implementat? scrollIntoView sau scrollTop?
□ Input: <input> sau <textarea>? Auto-resize implementat?
□ Extracții: confirmare apelează ce endpoint?
□ Elemente panel: de unde ia datele? API call?
```

## 3.7 Tab Elemente

```
ANDREI verifică:
□ Lista completă de elemente: vizibilă?
□ Câte elemente total? Counter vizibil?
□ Per element: label, valoare, sursă, status?
□ Filtru/search: există?
□ Grupare pe categorii: există?
□ Elemente necompletate: marcate clar?
□ Editare manuală: pot edita un element? Buton/click?
□ Scroll pe listă: fluid? Header sticky?
```

## 3.8 Tab Checklist

```
ANDREI verifică:
□ Lista documente necesare: vizibilă?
□ Items bifate automat din upload-uri?
□ Items nebifate: care sunt?
□ Pot bifa manual un item?
□ Progress vizibil: "8/14 completate"?
□ Ca consultant: lista e completă pentru sM 4.1?
```

## 3.9 Tab Neemia

```
ANDREI verifică:
□ Ce template-uri arată?
□ Per template: badge FILL/COMPOSE, progress, buton "Generează"?
□ Buton "Generează": activ? sau disabled cu motiv?
□ Dacă generez: ce văd în cele 30-45 secunde? Progress? Spinner?
□ Document generat: preview vizibil?
□ Buton "Descarcă": funcționează?
□ Ca consultant: documentul generat e utilizabil?

ELENA citește:
□ grep -n "neemia\|Neemia\|generate\|Generate" apps/web/src/app/(app)/projects/\[id\]/page.tsx | head -10
```

## 3.10 Tab Ghid Finanțare

```
ANDREI verifică:
□ Regulile din ghid: vizibile?
□ Criterii scoring: vizibile?
□ Tabelul de referință (Anexa 3): vizibil?
□ Scroll pe conținut: fluid?
□ Ca consultant: informația e utilă aici sau e redundantă cu Eligibilitate?
```

---

# FORMAT RAPORT

Generează `RAPORT_TESTARE.md`:

```markdown
# Raport Testare — Firme → Documente → Proiecte
Data: [data]

## SUMAR
- Flow Firme: [PASS / FAIL / PARȚIAL]
- Flow Documente: [PASS / FAIL / PARȚIAL]  
- Flow Proiecte: [PASS / FAIL / PARȚIAL]
- Solomon funcțional: [DA / NU / PARȚIAL]
- Dosar complet posibil: [DA / NU]

## PROBLEME VIZUALE (scroll, layout, vizibilitate)

### V1. [Ce nu se vede / ce e tăiat / ce trebuie scroll inutil]
- Ecran: [Firme / Documente / Proiecte > Tab]
- Ce vede Andrei: [descriere exactă]
- Elena: [fișier:linie, ce clasă CSS cauzează]

## PROBLEME FUNCȚIONALE (nu merge, eroare, date greșite)

### F1. [Ce nu funcționează]
- Ecran: [unde]
- Ce face Andrei: [pasul exact]
- Ce se întâmplă: [comportament actual]
- Ce ar trebui: [comportament așteptat]
- Elena: [fișier:linie, cauza]

## PROBLEME BUSINESS LOGIC (date greșite, validări greșite)

### L1. [Ce e greșit din perspectivă de consultant]
- Elena: [fișier:linie, cauza în cod]

## OBSERVAȚII ANDREI (perspectiva consultantului)
- Ce funcționează bine și îl ajută?
- Ce e confuz sau neintuiiv?
- Ce lipsește pentru un dosar AFIR real?
- Aplicația mă ajută sau mă încetinește?
- Solomon: util real sau generic?
- Aș folosi-o zilnic în starea actuală?

## OBSERVAȚII ELENA (perspectiva tehnică)
- Puncte de fragilitate în cod
- Componente monolitice (>1000 linii)
- CSS inline vs Tailwind: consistență?
- Error handling: acoperit?
- Performance: bottleneck-uri vizibile?
```

---

⛔ **NU MODIFICA NICIUN FIȘIER. NU REPARA NIMIC. DOAR RAPORTEAZĂ.**
