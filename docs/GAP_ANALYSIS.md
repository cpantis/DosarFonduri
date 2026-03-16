# GAP ANALYSIS — Frontend ↔ Backend per pagină

**Data:** 2026-03-16 | **Pagini analizate:** 10 | **Gaps identificate:** 87

---

## 1. Login — Autentificare & Înregistrare

👁️ **Ce vede consultantul:** Formular login (email+parolă), wizard signup în 3 pași (date personale → firmă CUI → cod cabinet), detecție invitație pe email blur.

📊 **Date backend disponibile:** 7 endpoint-uri auth (login, signup, me, lookup-cui, check-invited, validate-code, preferences). Returnează: token JWT, user object (id, email, name, role, theme, status), organization (id, name, plan, trialEndsAt), company data (13 câmpuri de la ListaFirme).

✅ **Afișat corect:**
- Login flow complet (email → password → token → redirect)
- Signup wizard cu toate cele 3 pași
- CUI lookup cu afișare date firmă (8/11 câmpuri)
- Cabinet code validation cu plan/trial/maxUsers
- Detecție utilizator invitat cu afișare org + rol
- CUI mismatch warning între step 2 și step 3

❌ **Lipsă în frontend:**
- `legalForm`, `turnover`, `employees` — returnate de lookup-cui dar neafișate
- User `role`, `theme`, `status` — returnate la login/signup dar nefolosite
- `organization.trialEndsAt` — disponibil dar neafișat
- "Am uitat parola" — link vizibil dar **fără funcționalitate** (no onClick)
- "Remember me" checkbox — vizibil dar **nu face nimic**
- GET `/api/auth/me` — **niciodată apelat** din frontend
- PATCH `/api/auth/preferences` — **niciodată apelat**

🔇 **Fără endpoint:**
- Password reset flow (forgot → email → token → reset) — **complet absent**
- Token refresh — JWT expiră în 7 zile, niciun mecanism de refresh

💡 **Recomandări UX:**
- Implementează password reset sau elimină link-ul "Am uitat parola"
- Apelează `/me` după login pentru welcome toast
- Afișează `trialEndsAt` la signup confirmation
- Adaugă `turnover` + `employees` în card-ul firmei la CUI lookup

---

## 2. Dashboard — Panou de control

👁️ **Ce vede consultantul:** 4 stat cards (Firme, Proiecte active, Documente, Rata succes), alert banner, 5 proiecte recente (carduri), deadline-uri, feed activitate.

📊 **Date backend disponibile:** GET /api/dashboard returnează: stats (4 metrici), recentProjects (cu 8 progress metrics per proiect: eligibility, elements, checklist, docs — passed/total), activity (15 entries cu userName, action, entityType, entityId, details), deadlines (date, project, event, urgent, daysLeft), alerts (message + type: warning|error|info).

✅ **Afișat corect:**
- 4 stat cards cu valori corecte
- Alert banner (mesaje afișate)
- Proiecte recente: name, status badge, firma, program
- Deadline-uri: daysLeft, event, project, urgency styling
- Activitate: userName, action, createdAt (relativ)

❌ **Lipsă în frontend:**
- **8 progress metrics per proiect** (eligibility, elements, checklist, docs) — **calculate de backend, trimise la frontend, dar complet ignorate** (cel mai mare gap)
- `alerts[].type` — backend trimite warning/error/info dar frontend afișează totul ca amber
- `activity[].entityType` + `entityId` — neafișate, nu sunt link-uri clickabile
- `activity[].details` — JSON disponibil dar ascuns
- `recentProjects[].updatedAt` — încărcat dar neafișat
- `deadlines[].date` — disponibilă dar doar `daysLeft` afișat

🔇 **Fără endpoint:**
- Document status breakdown (câte în processing/ready/error) — nu e calculat
- Company performance metrics — nu există query

💡 **Recomandări UX:**
- Adaugă progress bars pe project cards (cele 4 metrici sunt deja în response!)
- Color-code alerts după type (roșu/amber/albastru)
- Fă activitățile clickabile → navighează la entity
- Afișează "Updated 2h ago" pe proiecte

---

## 3. Firme — Lista firmelor

👁️ **Ce vede consultantul:** Carduri firmă cu: denumire, forma juridică badge, status, IMM category, CUI, CAEN+descriere, județ, capital social, an înființare. Search + filtre (All/Active/Societăți/PF). Modal adăugare: auto (CUI) sau manual (PDF upload).

📊 **Date backend disponibile:** 13 endpoint-uri (CRUD + search-cui + from-listafirme + sync-onrc + upload-onrc + upload-bilant + financials + processing-status). Company object: 25+ câmpuri schema + onrcRawData JSONB + associates + administrators + financials + IF members.

✅ **Afișat corect:**
- Lista firmelor cu toate badge-urile vizuale
- CUI lookup cu ListaFirme integration
- Manual PDF upload cu selector forma juridică
- Processing status cu polling (pulsing animation)
- Insolvency/restriction banners

❌ **Lipsă în frontend:**
- `lastSyncedAt` — disponibil în DB dar neafișat nicăieri
- `createdBy` — cine a adăugat firma, neafișat
- `createdAt`, `updatedAt` — neafișate
- `certificatFileId` — referit dar neafișat
- PUT `/api/companies/:id` — endpoint funcțional dar **niciun buton Edit în UI**

🔇 **Fără endpoint:**
- CRUD pentru asociați/administratori — doar din extracție ONRC
- Bulk operations (sync ONRC pentru mai multe firme)
- Export (CSV/Excel) — niciun endpoint
- Documente per firmă — trebuie navigat separat în secțiunea Documente

💡 **Recomandări UX:**
- Adaugă buton Edit pe tab-ul General (PUT-ul există deja!)
- Afișează `lastSyncedAt` cu buton Refresh
- Adaugă tab Documents pe detail view (linkează la folder-ul firmei)
- Adaugă export CSV din lista de firme

---

## 4. Firme [id] — Detaliu firmă

👁️ **Ce vede consultantul:** 9 tab-uri adaptate per forma juridică: General, Asociați/Acționari, Titular (PFA), Membri IF, Administrare, Activități, Sedii, Fin. ONRC (chart + tabel), Fin. ANAF (F10/F20/F30 detaliat), Juridic.

📊 **Date backend disponibile:** GET /:id returnează company + asociatiPF/PJ + administratori + financials + ifMembers. onrcRawData JSONB conține: activitățiSecundare, sedii, insolvența/dizolvare/lichidare/restricții, ultimaMentiune.

✅ **Afișat corect:**
- Toate tab-urile cu date corecte din DB + onrcRawData
- Financiale ONRC cu trend chart
- Financiale ANAF cu F10/F20/F30 detaliat
- Capital social cu structură natură (privat/străin/stat)
- Associates PF+PJ cu cotă % și aport

❌ **Lipsă în frontend:**
- Juridic tab (insolvență etc.) — citește din `onrcRawData` dar **nu sunt coloane în schema** (nu se poate filtra/indexa)
- Sedii — doar din JSONB, nu editabile
- Activități secundare — doar din JSONB, nu editabile
- `naturaCapital` — mix snake_case/camelCase (fragil)
- Niciun buton Edit pe niciun tab

🔇 **Fără endpoint:**
- CRUD associates/administrators manual
- Editare sedii secundare
- Search/filter companii după status juridic
- Comparație 2+ firme side-by-side

💡 **Recomandări UX:**
- Adaugă Edit modal pe General tab
- Normalizează câmpurile juridice în coloane DB (indexabile)
- Adaugă "Last synced: 3 days ago" în header

---

## 5. Documente — Arbore documente

👁️ **Ce vede consultantul:** Folder tree (stânga) + document list (dreapta). Per document: nume, tip (PDF/DOCX), size, status (Neprocesat/Procesare/Procesat/Eroare), page count, processing error, tags, trust score, completeness report summary. Upload, reprocess, delete. Preview PDF.

📊 **Date backend disponibile:** 19 endpoint-uri verificate (folders CRUD, documents CRUD, elements, scoring, compose config, detect markers, generation mode). Document object: 20+ câmpuri inclusiv document_type_class, classification_confidence, processing_result (cu timing, extracted fields), completeness_report.

✅ **Afișat corect:**
- Folder tree cu expand/collapse
- Document list cu status badges
- Trust score + completeness %
- Upload + reprocess + delete
- Template viewer: elements checklist cu validate, compose config editor, page navigation, rule links

❌ **Lipsă în frontend:**
- `document_type_class` — clasificare AI disponibilă dar **neafișată**
- `classification_confidence` — scor disponibil dar **ascuns**
- `processing_result.processing_time_ms` — disponibil dar neafișat
- `templateElements.isRepeating` — câmp în schema dar **niciodată verificat**
- `templateElements.validatedBy/validatedAt` — cine a validat + când, neafișat
- Reference tables dropdown în compose sections — încărcat dar **neconectat la UI**
- Upload/processed timestamps — neafișate

🔇 **Fără endpoint:**
- Reclasificare document type
- Tag management dedicat
- Element position reorder
- Bulk delete elements

💡 **Recomandări UX:**
- Adaugă classification badge lângă filename ("Ghid · 89% confidence")
- Afișează "Processed in 12.4s" pe document detail
- Adaugă rule category badge pe element rule chips
- Conectează reference tables selector la compose sections UI

---

## 6. Template Viewer — Vizualizare template

👁️ **Ce vede consultantul:** Split view: elements checklist (stânga, filtrabil All/Nevalidate/Validat/Manual) + document preview (dreapta, navigare pe pagini). Compose config panel: mode toggle (Fill/Compose), AI model selector, auto-detect markers, sections editor.

📊 **Date backend disponibile:** Template elements cu: key, label, fieldType, detected, validated, isRepeating, rowIndex, group. Compose config cu: generationMode, sections (marker, type, label, instructions). Scoring summary. Rule links per element cu maxPoints.

✅ **Afișat corect:**
- Elements checklist cu progress bar
- Page-based grouping cu validate-page bulk action
- Compose config editor cu sections
- Rule links per element cu scoring contribution
- Filter buttons (All/Nevalidate/Validat/Manual)

❌ **Lipsă în frontend:**
- `isRepeating` — nu se indică vizual care elemente sunt repetitive
- `validatedBy/At` — nu se vede cine a validat și când
- `group` — afișat dar nu editabil
- Reference tables — loaded (line 250) dar **niciodată folosite**
- Element rule `category` — fetch-uit dar neafișat

🔇 **Fără endpoint:**
- Element reorder/repositioning
- Bulk delete elements din template

💡 **Recomandări UX:**
- Adaugă indicator vizual pentru `isRepeating` elements
- Tooltip "Validated by X on date" pe elemente validate
- Conectează reference tables la compose sections dropdown

---

## 7. Proiecte — Lista proiecte

👁️ **Ce vede consultantul:** Project cards cu: name, company, status badge, score circle, 3 progress bars (Eligibilitate, Elemente, Documente). Create wizard (3 steps: company → program → confirm). Search + filters (status, sort by date/name/value).

📊 **Date backend disponibile:** GET /api/projects returnează per proiect: basic fields + company info + program path + progress object (eligibility passed/total, elements filled/total/confirmed, docs done/total, templates done/total) + score summary + lock info (lockedBy, lockedByName, lockedAt).

✅ **Afișat corect:**
- Project cards cu 3 progress bars
- Status badges cu culori corecte
- Score circle (totalPoints/maxTotalPoints)
- Create wizard functional
- Search + filter (client-side)

❌ **Lipsă în frontend:**
- `progress.elements.confirmed` — calculat dar **neafișat** (doar filled/total vizibil)
- `progress.templates` — calculat dar **complet ignorat**
- `lock` info — backend returnează dar **lista nu afișează cine a lock-at**
- 8 câmpuri metadata program (programFinantare, codMasura, codSesiune etc.) — stocate dar **niciodată afișate**
- `deadline` — în schema dar nefolosit nicăieri
- Filtrele sunt **100% client-side** — nu suportă paginare server-side

🔇 **Fără endpoint:**
- Server-side filtering/pagination (GET /api/projects?status=&search=&page=)
- Filter by assigned consultant

💡 **Recomandări UX:**
- Afișează lock badge pe carduri ("🔒 Locked by John")
- Adaugă a 4-a progress bar: Templates sau arată confirmed ratio
- Implementează server-side filtering pentru scalabilitate
- Afișează deadline warning dacă < 7 zile

---

## 8. ProjectView — Detaliu proiect (7 secțiuni)

👁️ **Ce vede consultantul:** Sidebar tree cu: Sumar, Eligibilitate, Ghid, Solomon, Elemente, Checklist, Neemia. Main panel cu conținutul secțiunii selectate.

📊 **Date backend disponibile:**
- GET /projects/:id → elements, eligibility, checklist, generated docs
- GET /projects/:id/eligibility → grouped rules cu source docs
- GET /projects/:id/checklist → grouped items cu summary
- GET /projects/:id/scores → breakdown per criteriu
- GET /projects/:id/budget-validation → summary + error list
- GET /projects/:id/learnings → insights + patterns
- GET /projects/:id/ghid-viewer → guides cu rules by page + scoring
- Solomon: conversations, messages (SSE stream), upload, refine
- Neemia: 23 endpoints (generate, compose, preview, validate, versions, download, consistency, calculate)

### Secțiunea: Sumar
✅ Progress cards (Eligibilitate, Elemente, Checklist, Neemia) clickabile
✅ Score estimate cu breakdown
✅ Budget validation cu erori
✅ Learnings cu insights
❌ `guideTrustScore` + `guideCompletenessReport` — returnate dar **niciodată folosite**
❌ Program metadata (8 câmpuri) — colectate de Solomon dar **invizibile**

### Secțiunea: Eligibilitate
✅ Rules grouped by source document
✅ Type badge (FIXĂ/INTERPRETATĂ), status, confidence, page, category
✅ Override individual rule
✅ Manual recheck
❌ `rule.condition`, `rule.sourceText` — neafișate (consultant nu vede raționamentul)
❌ `checkedAt` — neafișat
❌ Override history — nu se trackuiește cine a override-uit

### Secțiunea: Ghid Finanțare
✅ Încarcă guide data (PDF + rules by page + scoring)
❌ **Viewer UI incomplet** — hooks de load există dar display e minimal

### Secțiunea: Solomon
✅ Chat cu conversation history
✅ Message streaming (SSE)
✅ File upload cu analiza AI
✅ Extended Thinking toggle
❌ Model selector — backend suportă dar **UI nu expune** (hardcodat)
❌ Uploaded file nu apare în Documents tree (queue-ded dar fără link)
❌ Extraction results — procesate dar nu afișate ca "proposed additions"

### Secțiunea: Elemente
✅ Tabel cu key, label, value, source, status
✅ Edit form cu save
✅ Validate + confirm buttons
✅ Bulk confirm
❌ `confirmedBy` — nu se vede cine a confirmat
❌ Element audit history — **endpoint funcțional** (GET /:id/elements/:eid/history) dar **niciodată apelat**
❌ `sourceDocumentId` — există dar doar string `source` afișat
❌ `validationStatus/Details` — doar la edit, nu în tabel

### Secțiunea: Checklist
✅ Grouped by category cu progress
✅ Add/edit/delete items
✅ Done toggle + notes
❌ `source` (manual vs ghid) — neafișat
❌ Template link — text-only, nu clickabil
❌ Auto-populate funcționează **doar la crearea proiectului** — dacă ghidul se actualizează, checklist-ul rămâne vechi

### Secțiunea: Neemia
✅ Template list cu generate button
✅ Bulk generate
✅ Consistency check
✅ Calculate fields
❌ **Download button LIPSEȘTE** — `downloadUrl` returnat dar **niciun buton vizibil**
❌ **Generation mode (Fill/Compose) NEAFIȘAT** pe template list
❌ **Compose mode UI LIPSEȘTE** — endpoints complet funcționale dar **niciun UI pentru narrative/edit/approve sections**
❌ **Version history UI LIPSEȘTE** — endpoint funcțional dar fără buton
❌ **Rollback UI LIPSEȘTE** — endpoint funcțional dar fără buton
❌ `pagesCompleted`, `filledCount`, `missingCount` — în schema dar nereturnate în list
❌ `composeContent.tokensUsed`, `aiModel` — tracked dar neafișate
❌ Section version source (AI vs consultant edit) — nu se distinge vizual

🔇 **Fără endpoint pe ProjectView:**
- SSE listeners pentru neemia updates, checklist updates, score updates — **lipsesc**
- GET /projects/:id/metadata — metadata program separată
- GET /projects/:id/activity-log — timeline complet de modificări
- POST /projects/:id/batch-update-elements — bulk update
- POST /projects/:id/checklist/sync-from-guide — re-populare checklist
- GET /projects/:id/download-package — ZIP cu toate documentele

💡 **Recomandări UX prioritare:**
1. **Adaugă Download button pe Neemia** (quick win, downloadUrl există)
2. **Afișează generation mode** badge pe template list
3. **Implementează Compose mode UI** (preview sections, edit, approve)
4. **Apelează element history endpoint** (există dar nefolosit)
5. **Adaugă SSE listeners** pentru neemia/checklist/score updates
6. **Afișează program metadata** în Sumar (colectate de Solomon)

---

## 9. Configurări — Settings

👁️ **Ce vede consultantul:** 8 secțiuni: Solomon (model+ET), Neemia (model), Ghid (2 modele), Bază Cunoștințe (CRUD entries), Integrare API (CRUD integrations + test), Branding (culori, font, logo, footer), Notificări (toggles), Export & Backup (stub).

📊 **Date backend disponibile:** 14 endpoints config (orgConfig CRUD, apiIntegrations CRUD+test, knowledge CRUD+toggle, branding GET/PUT). orgConfig: 12 câmpuri. apiIntegrations: 11 câmpuri. solomonKnowledge: 10 câmpuri. cabinetDocumentStyle: JSONB cu 6+ properties.

✅ **Afișat corect:**
- Solomon/Neemia/Ghid model selectors cu ET toggles
- API integrations CRUD complet cu test button
- Knowledge base CRUD cu categories + search + toggle
- Branding color pickers + font + footer
- Notification toggles

❌ **Lipsă în frontend:**
- `solomonKnowledge.sourceUrl` — neafișat (link la legislație)
- `solomonKnowledge.priority` — backend ordonează dar UI nu afișează/editează
- `solomonKnowledge.validFrom/Until` — textarea în loc de datetime picker
- `reviewThreshold` slider — **BUG: nu actualizează state** (onChange lipsă)
- Logo upload — câmp text pentru URL, **niciun buton upload**
- Export & Backup — **complet stub**, fără funcționalitate

🔇 **Fără endpoint:**
- Send test email — configurat dar nu se poate testa
- Export config as JSON
- Backup/restore config
- Knowledge sync din surse externe

💡 **Recomandări UX:**
- Fix reviewThreshold slider (bug critic)
- Adaugă datetime picker pentru validFrom/Until
- Implementează logo upload (pre-signed URL → S3)
- Adaugă "Test notification" button
- Implementează Export & Backup section

---

## 10. Admin — Administrare

👁️ **Ce vede consultantul:** 3 tab-uri: Utilizatori (invite, role change, status), Audit AI/Costuri (summary cards, breakdown by agent/model/project, daily), Jurnal Activitate (feed cu filter).

📊 **Date backend disponibile:** 5 endpoints (users GET/POST/PUT, ai-costs GET, audit-log GET). Users: email, name, role, status, lastActiveAt, project count. AI costs: totalMonth, byAgent, byModel, byProject, daily. Audit: userId, userName, action, entityType, entityId, details, createdAt.

✅ **Afișat corect:**
- User list cu role badges + status
- Invite consultant modal
- Role switcher (admin/consultant/viewer)
- Status toggle (active/disabled)
- AI cost summary cards + breakdowns
- Audit log cu filter by action type

❌ **Lipsă în frontend:**
- "Retrimite invitație" button — **BUG: niciun onClick handler**
- `auditLog.details` — JSON brut, neparsed
- `auditLog.entityId` — nu e link clickabil
- `users.invitedBy` — neafișat
- Daily costs — tabel simplu, **niciun chart/grafic**
- Costs by agent — hardcodat 4 agenți, nu dinamic din response

🔇 **Fără endpoint:**
- Per-user cost breakdown
- Audit log export CSV
- User list export
- Cost forecast / budget alerts
- User activity timeline

💡 **Recomandări UX:**
- Fix "Retrimite invitație" onClick handler (bug critic)
- Adaugă line chart pentru daily costs
- Fă audit entries clickabile (link la entity)
- Adaugă date range picker pe audit log
- Adaugă export CSV buttons

---

## 11. Provider Dashboard — Panou provider

👁️ **Ce vede consultantul provider:** 4 tab-uri: Cabinets (listă organizații cu stats), Coduri de Activare (CRUD codes), Utilizatori Platformă (all users), Venit MRR (revenue cards).

📊 **Date backend disponibile:** 15 endpoints provider (auth, cabinets CRUD, codes CRUD+toggle, lookup-cui, search-company, users list/delete, revenue, cabinet access JWT, email).

✅ **Afișat corect:**
- Cabinet list cu plan badge, max users, status
- Code generation cu plan/trial/maxUsers/CUI
- User list cu cabinet info
- Revenue summary (totalCabinets, activeCabinets, trialCabinets, MRR)

❌ **Lipsă în frontend:**
- `organizations.providerNotes` — câmp în DB dar **neafișat și needitabil**
- `organizations.cabinetDocumentStyle` — JSONB branding neafișat
- `cabinetCodes.activatedAt` — când a fost folosit codul
- `cabinetCodes.createdBy` — care provider a creat codul
- Storage usage — **HARDCODAT "3.2 GB"**, nicio valoare reală
- Access button — **BUG: generează JWT dar nu navighează**

🔇 **Fără endpoint:**
- Cabinet billing/invoice history
- Plan change audit trail
- Storage usage tracking (nu există tabel)
- Per-cabinet user activity
- Cabinet health score
- Bulk operations
- Trial extension
- Edit cabinet name/code

💡 **Recomandări UX:**
- Fix Access button (deschide tab nou cu JWT-ul generat)
- Elimină storage display sau implementează tracking real
- Adaugă cabinet notes editor
- Adaugă trial extension button
- Implementează bulk operations

---

## TABEL REZUMATIV — Toate gaps-urile backend→frontend

| # | Pagină | Tip Gap | Descriere | Severitate |
|---|--------|---------|-----------|-----------|
| 1 | Dashboard | Date ignorate | 8 progress metrics per proiect calculate dar neafișate | **HIGH** |
| 2 | Dashboard | Type mismatch | alerts[].type ignorat (totul amber) | MEDIUM |
| 3 | Dashboard | Link lipsă | Activity entries fără link la entity | LOW |
| 4 | Login | Buton mort | "Am uitat parola" fără funcționalitate | **HIGH** |
| 5 | Login | Checkbox mort | "Remember me" fără efect | LOW |
| 6 | Login | Endpoint neapelat | GET /me, PATCH /preferences — niciodată | MEDIUM |
| 7 | Login | Endpoint lipsă | Password reset flow — complet absent | **HIGH** |
| 8 | Firme | Buton lipsă | PUT endpoint funcțional dar niciun Edit UI | **HIGH** |
| 9 | Firme | Date ascunse | lastSyncedAt, createdBy — disponibile dar invizibile | MEDIUM |
| 10 | Firme | Endpoint lipsă | CRUD associates/administrators manual | MEDIUM |
| 11 | Firme | Endpoint lipsă | Export CSV/Excel | LOW |
| 12 | Firme [id] | Schema drift | Juridic (insolvență etc.) citit din JSONB, nu coloane DB | MEDIUM |
| 13 | Firme [id] | Read-only | Sedii, activități secundare — neditabile | LOW |
| 14 | Documente | Date ascunse | document_type_class + confidence — calculate dar ascunse | **HIGH** |
| 15 | Documente | Date ascunse | processing_time_ms — disponibil dar neafișat | LOW |
| 16 | Template | Date ignorate | isRepeating — câmp schema nechecked | MEDIUM |
| 17 | Template | Date ignorate | validatedBy/At — neafișat | LOW |
| 18 | Template | UI deconectat | Reference tables loaded dar neconectate la compose UI | **HIGH** |
| 19 | Proiecte | Date ignorate | elements.confirmed — calculat dar neafișat | MEDIUM |
| 20 | Proiecte | Date ignorate | templates progress — calculat dar ignorat | MEDIUM |
| 21 | Proiecte | Date ignorate | Lock info — disponibil dar neafișat pe carduri | MEDIUM |
| 22 | Proiecte | Date ignorate | 8 câmpuri metadata program — stocate dar invizibile | **HIGH** |
| 23 | Proiecte | Scalabilitate | Filtre 100% client-side, nicio paginare | MEDIUM |
| 24 | ProjectView | Feature lipsă | **Download button Neemia** — downloadUrl există dar niciun buton | **CRITICAL** |
| 25 | ProjectView | Feature lipsă | **Compose mode UI** — endpoints complet funcționale, UI zero | **CRITICAL** |
| 26 | ProjectView | Feature lipsă | **Version history + rollback** — endpoints OK, niciun UI | **HIGH** |
| 27 | ProjectView | Date ignorate | guideTrustScore + completenessReport — returnate, nefolosite | MEDIUM |
| 28 | ProjectView | Date ignorate | rule.condition/sourceText — raționamentul regulii ascuns | MEDIUM |
| 29 | ProjectView | Date ignorate | confirmedBy pe elemente — neafișat | LOW |
| 30 | ProjectView | Endpoint neapelat | Element audit history — funcțional dar neapelat | **HIGH** |
| 31 | ProjectView | Feature lipsă | Checklist sync from updated guide | MEDIUM |
| 32 | ProjectView | SSE lipsă | Niciun listener pentru neemia/checklist/score updates | MEDIUM |
| 33 | ProjectView | Date ignorate | generation mode (Fill/Compose) — nesemnalizat pe template list | **HIGH** |
| 34 | Settings | BUG | reviewThreshold slider — onChange handler lipsă | **HIGH** |
| 35 | Settings | BUG | Knowledge validFrom/Until — textarea nu datetime picker | MEDIUM |
| 36 | Settings | Date ascunse | knowledge.sourceUrl, priority — neafișate | MEDIUM |
| 37 | Settings | Feature lipsă | Logo upload — doar URL text, niciun upload | MEDIUM |
| 38 | Settings | Feature lipsă | Export & Backup — complet stub | LOW |
| 39 | Settings | Endpoint lipsă | Send test email | LOW |
| 40 | Admin | BUG | "Retrimite invitație" — **niciun onClick** | **HIGH** |
| 41 | Admin | Date brute | auditLog.details — JSON neformatat | MEDIUM |
| 42 | Admin | Link lipsă | auditLog.entityId — nu e clickabil | MEDIUM |
| 43 | Admin | Vizualizare | Daily costs — tabel, niciun chart | LOW |
| 44 | Admin | Endpoint lipsă | Audit log CSV export | LOW |
| 45 | Provider | BUG | Access button — generează JWT dar nu navighează | **HIGH** |
| 46 | Provider | Date false | Storage "3.2 GB" — HARDCODAT, nu real | **HIGH** |
| 47 | Provider | Date ascunse | providerNotes — câmp DB needitabil din UI | MEDIUM |
| 48 | Provider | Date ascunse | cabinetCodes.createdBy/activatedAt — neafișate | LOW |
| 49 | Provider | Endpoint lipsă | Billing/invoice history | LOW |
| 50 | Provider | Endpoint lipsă | Trial extension | MEDIUM |

### Rezumat pe severitate

| Severitate | Count | Cel mai important |
|------------|-------|-------------------|
| **CRITICAL** | 2 | Neemia download button + Compose mode UI |
| **HIGH** | 14 | Dashboard progress, password reset, edit firme, classification, metadata, version history |
| **MEDIUM** | 22 | Lock info, SSE, validators, compose refs, JSONB normalization |
| **LOW** | 12 | Timestamps, charts, exports, CSVs |

### Top 10 Quick Wins (date deja disponibile în backend, doar frontend de conectat)

1. **Dashboard progress bars** — response-ul are deja cele 8 metrici
2. **Neemia download button** — downloadUrl e deja returnat
3. **Lock badge pe project cards** — lock info e deja în response
4. **Classification badge pe documente** — deja calculat, doar de afișat
5. **Element history link** — endpoint funcțional, doar de apelat
6. **Generation mode badge pe Neemia** — stocat, doar de afișat
7. **Alert type coloring** — backend trimite type, frontend ignoră
8. **Program metadata display** — stocate, doar de afișat în Sumar
9. **Activity entity links** — entityType+entityId disponibile
10. **Edit company button** — PUT endpoint gata, nicio formă UI
