# AUDIT DETALIAT — Documente → Proiecte
## DosarFonduri v2 · Martie 2026

> Fiecare acțiune posibilă, mapare backend↔frontend, erori cunoscute, îmbunătățiri.
> Bazat pe: screenshots live, arhitectură spec, conversații anterioare, project knowledge.

---

## LEGENDA STATUS

- ✅ Funcțional confirmat
- ⚠️ Funcțional parțial / necesită verificare
- ❌ Broken / lipsă
- 💡 Îmbunătățire propusă

---

# SECȚIUNEA 1 — PAGINA DOCUMENTE

## 1.1 Structura Programe (sidebar stâng — tree view)

### Acțiuni posibile:

| # | Acțiune | Frontend | Backend API | Status | Note |
|---|---------|----------|-------------|--------|------|
| 1.1.1 | Vizualizare tree: Program → Masura → Sesiune | Tree component cu expand/collapse | `GET /api/programs` + nested query | ⚠️ | Verifică: tree-ul se populează din DB sau e hardcodat? |
| 1.1.2 | Click pe "Ghiduri" (subnod) | Filtrare listă documente `type=guide` | `GET /api/documents?type=guide&sessionId=X` | ⚠️ | Verifică: filtrarea chiar trimite param `sessionId`? |
| 1.1.3 | Click pe "Template-uri" | Filtrare listă documente `type=template` | `GET /api/documents?type=template&sessionId=X` | ⚠️ | Verifică: separare reală ghiduri vs template-uri |
| 1.1.4 | Click pe "Clienti Prospecti" | Navigare la lista clienți prospecți | Ruta separată sau filtru? | ⚠️ | Ar trebui: `/firme?status=prospect` |
| 1.1.5 | Click pe "Clienti Finali" | Navigare la lista clienți finali | Ruta separată sau filtru? | ⚠️ | Ar trebui: `/firme?status=client` |
| 1.1.6 | "+ Adauga program" | Modal/form de creare program | `POST /api/programs` | ⚠️ | Verifică: există ruta API? Ce câmpuri? |

### Probleme cunoscute:

- **Dead space sub tree** (screenshot cu cercul roșu) — container cu height fix, conținutul nu-l umple
- Tree-ul pare să aibă un singur nivel expandat ("Program 1 > Masura 1 > Sesiune 1") — verifică dacă suportă programe multiple

### Îmbunătățiri:

- 💡 Tree sidebar: `h-auto` cu `flex-grow` doar pe content area dreapta
- 💡 Adaugă quick stats sub tree: "3 ghiduri procesate, 8 template-uri"
- 💡 Drag-and-drop reordonare programe
- 💡 Context menu (right-click) pe noduri: Redenumește, Șterge, Duplică

---

## 1.2 Lista Documente (content area dreapta)

### Acțiuni posibile:

| # | Acțiune | Frontend | Backend API | Status | Note |
|---|---------|----------|-------------|--------|------|
| 1.2.1 | Vizualizare listă documente | Card-uri cu icon, nume, metadata | `GET /api/documents?sessionId=X` | ✅ | Funcțional din screenshot |
| 1.2.2 | Căutare document (Ctrl+K) | Search bar cu shortcut | Client-side filter sau API? | ⚠️ | Verifică: filtrare client-side sau `GET /api/documents?q=search` |
| 1.2.3 | Upload document nou (buton +) | Click → presign → upload R2 → process | `POST /api/documents/presign` → upload → `POST /api/documents` | ⚠️ | Verifică: flow-ul complet presign→R2→confirm |
| 1.2.4 | Click pe document → Descarcă | Generare URL descărcare | `GET /api/documents/:id/download` → presigned R2 URL | ⚠️ | Verifică: URL-ul e presigned cu expiry? |
| 1.2.5 | Click pe document → Previzualizare | Modal/panel cu preview PDF/DOCX | `GET /api/documents/:id/preview` | ⚠️ | Verifică: cum se face preview? iframe PDF? |
| 1.2.6 | Click pe document → Șterge | Confirm dialog → delete | `DELETE /api/documents/:id` | ⚠️ | Verifică: șterge și din R2? Soft delete sau hard? |
| 1.2.7 | Badge "✓ Procesat AI" | Afișare status procesare | Câmpul `status` pe document | ✅ | Vizibil în screenshot |
| 1.2.8 | Badge "★ Referință" | Marcare document ca referință | `PATCH /api/documents/:id` cu `isReference=true`? | ⚠️ | Verifică: ce înseamnă "Referință"? E manual sau automat? |
| 1.2.9 | "33 reguli" + "▼ Detalii" pe ghid | Expandare detalii reguli extrase | `GET /api/guides/:id/rules` | ⚠️ | Verifică: încarcă regulile lazy la click sau eager? |
| 1.2.10 | Counter: "4 documente · 3 procesate · 0 template-uri" | Header stats | Aggregation query sau client-side count | ⚠️ | Verifică: e server-side count? |

### Probleme cunoscute:

- Butonul expand acțiuni (Descarcă/Previzualizare/Șterge) apare doar la hover/click pe un document — OK ca pattern
- Badge "Referință" pe DOCX-ul Anexa 3 — e marcat manual? Automat la upload? Trebuie clarificat flow-ul

### Îmbunătățiri:

- 💡 Bulk actions: selectare multiplă → ștergere/descărcare
- 💡 Drag-and-drop upload (nu doar click)
- 💡 Progress bar per document la upload + procesare AI
- 💡 Filter pills: "Toate | Ghiduri | Template-uri | Referințe | Neprocesate"
- 💡 Sort: după dată, nume, status procesare

---

## 1.3 Procesare Ghid (flow AI backend)

### Pași de procesare:

| # | Pas | Componenta | Model AI | DB Tables | Status | Note |
|---|-----|-----------|----------|-----------|--------|------|
| 1.3.1 | Upload PDF ghid | Frontend → R2 | — | `documents` | ⚠️ | Verifică: document.type = 'guide'? |
| 1.3.2 | Text extraction | ai-worker | PyMuPDF (local) | — | ⚠️ | Fallback Claude Vision dacă < 50 chars/pagină |
| 1.3.3 | Pre-structurare | ai-worker | Claude Haiku | — | ⚠️ | Clasificare secțiuni, detectare tabele |
| 1.3.4 | Extragere reguli fixe | ai-worker | Claude Sonnet | `guide_rules_fixed` | ⚠️ | ~25-30 reguli per ghid |
| 1.3.5 | Extragere reguli interpretate | ai-worker | Claude Opus + ET | `guide_rules_interpreted` | ⚠️ | Cu confidence_score |
| 1.3.6 | Extragere scoring criteria | ai-worker | Claude Opus + ET | `scoring_criteria` | ❌ | **TABEL LIPSĂ din DB!** |
| 1.3.7 | Extragere element definitions | ai-worker | Claude Sonnet | `element_definitions` | ❌ | **TABEL LIPSĂ din DB!** |
| 1.3.8 | Link reguli ↔ elemente | ai-worker | — | `element_rule_links` | ❌ | **TABEL LIPSĂ din DB!** |
| 1.3.9 | Extragere reference tables | ai-worker | Claude Haiku | `guide_reference_tables` | ❌ | **TABEL LIPSĂ din DB!** |
| 1.3.10 | SSE progress updates | ai-worker → Redis → API → Frontend | — | — | ⚠️ | Verifică: SSE funcționează end-to-end? |

### ERORI CRITICE:

> **6 tabele lipsesc din Railway PostgreSQL:**
> - `scoring_criteria`
> - `element_definitions`
> - `element_rule_links`
> - `rule_reference_links`
> - `guide_reference_tables`
> - `template_placeholder_mapping`
>
> Plus coloana `project_elements.element_def_id`
>
> **Cauza:** `schema.ts` a fost modificat dar migrările NU au fost aplicate pe Railway.
> **Impact:** Procesarea ghidului poate rula dar EȘUEAZĂ la salvare. Costul AI e irosit.
> **Fix:** Rulează `drizzle-kit push` sau generează + aplică migrări.

### DB Preflight Check:

- `services/dbPreflight.ts` — ar trebui să verifice existența tabelelor ÎNAINTE de orice apel Anthropic
- ⚠️ Verifică: preflight check-ul chiar rulează? E integrat în flow-ul de procesare ghid?

### Îmbunătățiri:

- 💡 Retry automat pe faze individuale (dacă Faza 4 eșuează, nu repeta Faza 1-3)
- 💡 Cache intermediar Redis: textul extras + pre-structurarea se cache-uiesc
- 💡 Trust score afișat pe frontend (din conversația anterioară despre validare)
- 💡 "Reprocessează" buton per ghid (re-run doar fazele eșuate)

---

## 1.4 Procesare Template (flow AI backend)

### Pași de procesare:

| # | Pas | Componenta | Model AI | DB Tables | Status | Note |
|---|-----|-----------|----------|-----------|--------|------|
| 1.4.1 | Upload DOCX template | Frontend → R2 | — | `documents` | ⚠️ | |
| 1.4.2 | Extragere placeholders `{{...}}` | ai-worker | Local (python-docx) | `templates` | ⚠️ | FIX W3.1: placeholders split pe XML runs |
| 1.4.3 | AI clasificare placeholders | ai-worker | Claude Sonnet | `template_elements` | ⚠️ | |
| 1.4.4 | Mapping placeholders → element_definitions | ai-worker | Claude Sonnet | `template_placeholder_mapping` | ❌ | **TABEL LIPSĂ!** |

### Probleme cunoscute:

- FIX W3.1: `{{placeholder}}` split pe XML runs — regex-ul nu le detectează
- FIX W3.5: Compose mode nu e suportat pentru template PDF
- Badge "Referință" pe Anexa 3 DOCX — ce flow setează asta?

---

# SECȚIUNEA 2 — PAGINA PROIECTE

## 2.1 Lista Proiecte

### Acțiuni posibile:

| # | Acțiune | Frontend | Backend API | Status | Note |
|---|---------|----------|-------------|--------|------|
| 2.1.1 | Vizualizare listă proiecte | Lista cu card-uri: nume, firmă, masura, status, timp | `GET /api/projects?cabinetId=X` | ✅ | Funcțional din screenshot |
| 2.1.2 | Căutare proiect | Search bar | `GET /api/projects?q=search` | ⚠️ | Verifică: search funcțional? |
| 2.1.3 | Filtrare după status | Pills: Draft/In progress/Review/Depus/Aprobat/Respins | `GET /api/projects?status=draft` | ⚠️ | Verifică: pills-urile chiar filtrează? |
| 2.1.4 | Sort: Dată | Dropdown sort | `GET /api/projects?sort=date` | ⚠️ | |
| 2.1.5 | Click pe proiect → Deschide | Navigare la detalii proiect | `GET /api/projects/:id` | ✅ | |
| 2.1.6 | "+ Proiect nou" (buton albastru) | Deschide wizard modal | — (client-side) | ✅ | Funcțional din screenshot |

---

## 2.2 Wizard "Proiect Nou" (modal cu stepper)

### Step 1: Selectează Firmă

| # | Acțiune | Frontend | Backend API | Status | Note |
|---|---------|----------|-------------|--------|------|
| 2.2.1 | Afișare liste firme existente | Lista cu icon + nume firmă | `GET /api/companies?cabinetId=X` | ✅ | Funcțional: ANDA OANA + COMEXIM R vizibile |
| 2.2.2 | Selectare firmă (click) | Highlight selectat | Client-side state | ✅ | |
| 2.2.3 | "Continuă" → next step | Navigare step 2 | — | ✅ | |
| 2.2.4 | "Anulează" → închide modal | Reset state | — | ✅ | |

**Lipsuri:**
- ❌ Nu există buton "Adaugă firmă nouă" direct din wizard — trebuie să meargă la Firme separat
- 💡 Adaugă inline "Firmă nouă" cu form rapid (CUI → auto-complete ONRC)

### Step 2: Selectează Program

| # | Acțiune | Frontend | Backend API | Status | Note |
|---|---------|----------|-------------|--------|------|
| 2.2.5 | Afișare programe/masuri disponibile | Lista programe din tree | `GET /api/programs` | ⚠️ | Verifică: afișează toate programele sau doar cele cu ghid procesat? |
| 2.2.6 | Selectare program + masura | Click selectare | Client-side | ⚠️ | |
| 2.2.7 | "Continuă" → next step | Navigare step 3 | — | ⚠️ | |

**Lipsuri:**
- ⚠️ Dacă nu există ghid procesat pentru masura selectată, proiectul nu va avea reguli de eligibilitate — ar trebui warning
- 💡 Afișează câte reguli/elemente are fiecare masură: "Masura 1 · 33 reguli · 45 câmpuri"

### Step 3: Confirmare

| # | Acțiune | Frontend | Backend API | Status | Note |
|---|---------|----------|-------------|--------|------|
| 2.2.8 | Sumar: firma + program | Afișare recap | — | ⚠️ | |
| 2.2.9 | "Crează proiect" | Submit → creare proiect | `POST /api/projects` | ✅ | Funcțional: proiecte vizibile în listă |
| 2.2.10 | Auto-run eligibility check | Post-creare: verifică reguli | `POST /api/projects/:id/check-eligibility` | ⚠️ | Se face automat sau manual? |

**Eroare vizibilă din screenshot:**
> ⚠️ "Proiectul «hai» are doar 0/33 criterii de eligibilitate îndeplinite"
> — Asta arată că eligibility check RULEAZĂ, dar 0/33 sugerează fie:
> 1. Nu sunt date completate (normal pentru proiect nou) — OK
> 2. Regulile nu sunt mapate corect la project_elements — ⚠️ verifică

---

## 2.3 Detalii Proiect (post-creare)

### Sub-pagini/module așteptate:

| # | Modul | Descriere | Backend | Status | Note |
|---|-------|-----------|---------|--------|------|
| 2.3.1 | Overview | Status general, eligibilitate, scoring | `GET /api/projects/:id` | ⚠️ | |
| 2.3.2 | Elemente (câmpuri) | Toate câmpurile definite din ghid | `GET /api/projects/:id/elements` | ⚠️ | Ancorat pe `element_definitions` (tabel lipsă!) |
| 2.3.3 | Reguli eligibilitate | Lista regulilor cu status pass/fail | `GET /api/projects/:id/eligibility` | ⚠️ | Depinde de `guide_rules_fixed` + `_interpreted` |
| 2.3.4 | Scoring | Punctaj estimat per criteriu | `GET /api/projects/:id/scoring` | ❌ | Depinde de `scoring_criteria` (tabel lipsă!) |
| 2.3.5 | Solomon (chat AI) | Colectare date conversațional | `POST /api/chat` (SSE) | ⚠️ | |
| 2.3.6 | Neemia (generare doc) | Completare template-uri | `POST /api/chat` (SSE) | ⚠️ | |
| 2.3.7 | Documente proiect | Upload-uri specifice proiectului | `GET /api/projects/:id/documents` | ⚠️ | |
| 2.3.8 | Audit log | Istoric modificări | `GET /api/projects/:id/audit` | ⚠️ | |

---

# SECȚIUNEA 3 — PAGINA DASHBOARD (Panou)

## 3.1 Stat Cards

| # | Card | Frontend | Backend | Status | Note |
|---|------|----------|---------|--------|------|
| 3.1.1 | Firme (count) | Număr afișat | `GET /api/companies/count` sau inline | ✅ | "2" vizibil |
| 3.1.2 | Proiecte active (count) | Număr afișat | `GET /api/projects/count?status=active` | ✅ | "4" vizibil |
| 3.1.3 | Documente (count) | Număr afișat | `GET /api/documents/count` | ✅ | "6" vizibil |
| 3.1.4 | Rata succes (%) | Procent | Calcul: aprobate / total depuse | ✅ | "0%" vizibil (corect, nimic depus) |

### Îmbunătățiri vizuale:

- 💡 Iconițele colorate (galben, verde, roșu) → monocrome/desaturate (conform discuție design)
- 💡 Adaugă shadow subtil pe cards
- 💡 Background content area: `slate-50` (#f8fafc) nu alb pur

## 3.2 Proiecte Recente

| # | Acțiune | Frontend | Backend | Status |
|---|---------|----------|---------|--------|
| 3.2.1 | Lista proiecte recente | Card-uri: nume + status + firmă + masura | `GET /api/projects?limit=5&sort=updatedAt` | ✅ |
| 3.2.2 | Click pe proiect → deschide | Navigare | — | ✅ |
| 3.2.3 | Click chevron → | Navigare | — | ⚠️ |

## 3.3 Atenție Banner

| # | Acțiune | Frontend | Backend | Status | Note |
|---|---------|----------|---------|--------|------|
| 3.3.1 | Warning eligibilitate | Banner galben cu mesaj | Server-side check la load | ⚠️ | "0/33 criterii" — e run automat? |

## 3.4 Termene Apropiate (sidebar dreapta)

| # | Acțiune | Frontend | Backend | Status | Note |
|---|---------|----------|---------|--------|------|
| 3.4.1 | Lista termene | Timeline | `GET /api/projects/deadlines` | ⚠️ | "Niciun termen apropiat" — funcțional? |

## 3.5 Activitate Recentă (sidebar dreapta)

| # | Acțiune | Frontend | Backend | Status | Note |
|---|---------|----------|---------|--------|------|
| 3.5.1 | Feed activitate | Timeline entries | `GET /api/activity?cabinetId=X&limit=10` | ✅ | Vizibil: "Pantis Florian a deschis/închis/creat" |

---

# SECȚIUNEA 4 — PAGINA FIRME

## 4.1 Acțiuni

| # | Acțiune | Frontend | Backend API | Status | Note |
|---|---------|----------|-------------|--------|------|
| 4.1.1 | Lista firme | Tabel/cards | `GET /api/companies?cabinetId=X` | ⚠️ | |
| 4.1.2 | Adaugă firmă | Form cu CUI → ONRC lookup | `POST /api/companies` + `GET /api/onrc/:cui` | ⚠️ | ONRC lookup cu cache Redis |
| 4.1.3 | Editare firmă | Form editare | `PATCH /api/companies/:id` | ⚠️ | |
| 4.1.4 | Ștergere firmă | Confirm → delete | `DELETE /api/companies/:id` | ⚠️ | Verifică: cascade pe proiecte? |
| 4.1.5 | Upload certificat constatator | Upload → procesare AI | `POST /api/documents` cu `type=certificat` | ⚠️ | OCR + extragere date |
| 4.1.6 | Upload date ANAF | Upload bilanț | `POST /api/documents` cu `type=bilant` | ⚠️ | |

---

# SECȚIUNEA 5 — CROSS-CUTTING CONCERNS

## 5.1 Autentificare & Autorizare

| # | Verificare | Detaliu | Status |
|---|-----------|---------|--------|
| 5.1.1 | Login/Register | better-auth flow | ⚠️ |
| 5.1.2 | Cabinet switching | Header "CABINET ACTIV: BUSINESS DEVELOPI..." | ✅ |
| 5.1.3 | Role check (admin vs consultant) | `requireCabinetAdmin` middleware | ⚠️ |
| 5.1.4 | Multi-tenant isolation | Toate query-urile filtrează pe `cabinetId` | ⚠️ CRITIC |
| 5.1.5 | Profil utilizator | Footer sidebar: "Pantis Florian · Admin" | ✅ |

## 5.2 Error Handling

| # | Verificare | Status | Note |
|---|-----------|--------|------|
| 5.2.1 | API errors afișate în UI | ⚠️ | Verifică: toast notifications pe erori? |
| 5.2.2 | Network errors (offline) | ⚠️ | Verifică: retry logic pe TanStack Query? |
| 5.2.3 | 401 → redirect la login | ⚠️ | |
| 5.2.4 | 403 → mesaj acces interzis | ⚠️ | |
| 5.2.5 | Silent catch blocks | ❌ | FIX W2.4: erori upsert silențioase pe elementDefinitions |
| 5.2.6 | DB preflight before AI calls | ⚠️ | `dbPreflight.ts` — verifică integrarea |

## 5.3 Performance

| # | Verificare | Target | Status |
|---|-----------|--------|--------|
| 5.3.1 | First load dashboard | < 2s | ⚠️ |
| 5.3.2 | Navigare între pagini | < 500ms | ⚠️ |
| 5.3.3 | Upload + procesare ghid 62 pag | < 60s | ⚠️ |
| 5.3.4 | Solomon first token | < 1.5s | ⚠️ |
| 5.3.5 | SSE streaming fără drop | Continuu | ⚠️ |

---

# SECȚIUNEA 6 — REZUMAT ACȚIUNI NECESARE

## Prioritate 1: BLOCANTE (trebuie fix-uite ACUM)

1. **Aplică migrări DB pe Railway** — 6 tabele + 1 coloană lipsă. Fără asta, procesarea ghidurilor pierde date și costă bani pe API calls degeaba.
2. **Verifică dbPreflight.ts** — asigură-te că blochează orice apel Anthropic dacă tabelele lipsesc.
3. **Verifică cascade delete** — ce se întâmplă când ștergi un document/firmă/program.

## Prioritate 2: FUNCȚIONALITATE (săptămâna asta)

4. **Template placeholder split** (FIX W3.1) — `{{placeholder}}` split pe XML runs.
5. **Scoring criteria type** — `maxPoints` stocat ca string, trebuie numeric.
6. **Confidence scores** — stocat ca string în unele locuri, trebuie numeric.
7. **Element definition upsert errors** — nu mai swallow cu console.warn.
8. **Testare completă flow**: Upload ghid → procesare → creare proiect → eligibility check → Solomon chat.

## Prioritate 3: UX/DESIGN (săptămâna viitoare)

9. **Sidebar dark slate-900** — schimbă din albastru tinted.
10. **Content background** → `slate-50`.
11. **Stat card icons** → monocrome.
12. **Dead space sub tree** → fix layout.
13. **Adaugă firmă nouă din wizard** — inline în step 1.
14. **Warning dacă masura nu are ghid procesat** — în wizard step 2.

## Prioritate 4: POLISH (luna viitoare)

15. Toast notifications pe toate erorile API.
16. Bulk actions pe documente.
17. Drag-and-drop upload.
18. Filter/sort pe lista documente.
19. Trust score vizibil pe ghid procesat.
20. "Reprocessează" buton per ghid.

---

# SECȚIUNEA 7 — CHECKLIST VERIFICARE MANUALĂ

Deschide aplicația și execută fiecare pas. Marchează ✅ sau ❌.

```
[ ] 1. Login → Dashboard se încarcă cu date corecte
[ ] 2. Stat cards arată numere corecte (Firme/Proiecte/Documente)
[ ] 3. Click pe "Documente" din sidebar → pagina se încarcă
[ ] 4. Tree sidebar afișează structura Program > Masura > Sesiune
[ ] 5. Click pe "Ghiduri" → lista ghidurilor apare
[ ] 6. Click pe "+" → dialog upload apare
[ ] 7. Upload un PDF mic → progress bar → document apare în listă
[ ] 8. Document procesat arată badge "✓ Procesat AI"
[ ] 9. Click "▼ Detalii" pe ghid → arată regulile extrase
[ ] 10. Click pe "Template-uri" → lista template-urilor
[ ] 11. Upload un DOCX template → placeholder-urile sunt extrase
[ ] 12. Click pe "Proiecte" din sidebar → lista proiectelor
[ ] 13. Click "+ Proiect nou" → wizard se deschide
[ ] 14. Step 1: firmele apar → selectează una → "Continuă"
[ ] 15. Step 2: programele apar → selectează unul → "Continuă"
[ ] 16. Step 3: confirmare → "Crează proiect"
[ ] 17. Proiectul apare în listă cu status "draft"
[ ] 18. Click pe proiect → pagina detalii se încarcă
[ ] 19. Eligibility check rulează (0/33 e OK la început)
[ ] 20. Solomon chat funcționează (trimite mesaj, primește răspuns)
[ ] 21. Activity feed pe dashboard arată acțiunile recente
[ ] 22. Warning banner arată proiecte cu probleme
[ ] 23. Logout → redirect la login
[ ] 24. Re-login → totul persistă
```

---

*Generat: Martie 2026 · DosarFonduri v2 Audit*
