# Rezultat Audit UX — DosarFonduri v2

Data: 2026-03-18

## Sumar

- **Total probleme: 42**
- **CRITICE: 8**
- **MEDII: 18**
- **MINORE: 16**

---

## CRITICE (trebuie fixate imediat)

### C1. Font-ul nu corespunde design system-ului
- **Fișier:** `apps/web/src/app/layout.tsx` linia 16
- **Descriere:** CLAUDE.md specifică **"DM Sans"** ca font principal. Codebase-ul folosește **"Inter"**.
- **Impact:** Brand inconsistency pe tot produsul.
- **Ce ar trebui:** `font-family: 'DM Sans', system-ui, sans-serif` conform design tokens.

### C2. Dark mode dezactivat — toggle nu funcționează
- **Fișier:** `apps/web/src/components/layout/ThemeProvider.tsx` linia 12
- **Descriere:** `toggle: () => {}` — funcția e no-op. Token-urile dark theme sunt definite complet în `tokens.css` dar inaccesibile.
- **Impact:** Feature promisă în design system, complet nefuncțională.
- **Ce ar trebui:** Toggle real care comută `data-theme="dark"` pe `<html>`.

### C3. Solomon — NU există buton STOP în timpul streaming-ului
- **Fișier:** `apps/web/src/app/(app)/projects/[id]/page.tsx` linia 3794
- **Descriere:** Butonul Send rămâne `disabled` dar nu se transformă în Stop. User-ul nu poate anula generarea.
- **Impact:** Consultantul e blocat 30-120s dacă Solomon generează un răspuns lung/greșit.
- **Ce ar trebui:** Buton Stop care apelează `AbortController.abort()` pe stream-ul SSE.

### C4. Solomon — auto-scroll nu se dezactivează la scroll manual
- **Fișier:** `apps/web/src/app/(app)/projects/[id]/page.tsx` liniile 601-603
- **Descriere:** `useEffect` face `scrollTop = scrollHeight` la fiecare mesaj nou. Dacă user-ul a scrollat în sus pentru context, pierde poziția.
- **Impact:** Extrem de frustrant — consultantul citește mesaje vechi și e teleportat la fund.
- **Ce ar trebui:** Detectare `isAtBottom` (scroll position check) + indicator "Mesaje noi ↓".

### C5. Solomon — butonul Edit Extracție nu funcționează
- **Fișier:** `apps/web/src/app/(app)/projects/[id]/page.tsx` liniile 3697-3698
- **Descriere:** Butonul "Editează" pe extracții există vizual dar nu are `onClick` handler. User-ul nu poate corecta o valoare extrasă greșit înainte de confirmare.
- **Impact:** Workflow blocat — trebuie respinsă extracția și re-cerută de la Solomon.
- **Ce ar trebui:** Modal/inline edit care modifică `ext.value` înainte de confirm.

### C6. Solomon — nu există "Confirmă toate" pe extracții
- **Fișier:** `apps/web/src/app/(app)/projects/[id]/page.tsx` linia 3680
- **Descriere:** Dacă Solomon extrage 8-10 câmpuri, user-ul trebuie să apese "Confirmă" individual pe fiecare. Extrem de tedios.
- **Impact:** Workflow lent; consultanții confirmă 50-100 extracții/zi.
- **Ce ar trebui:** Buton "✓ Confirmă toate (N)" deasupra cardurilor de extracție.

### C7. Responsive design absent — aplicația e inutilizabilă pe tabletă
- **Fișier:** Multiple (layout.tsx, page.tsx, Sidebar.tsx)
- **Descriere:** Doar 2 breakpoints (768px, 1024px) cu ajustări minime. ProjectView tree-sidebar e fix 260px. Split pane-urile nu se adaptează. Grid-uri 4-col fără breakpoint tablet.
- **Impact:** Consultanții care lucrează pe tabletă/laptop mic nu pot folosi aplicația eficient.
- **Ce ar trebui:** Breakpoints la 768/1024/1280px, sidebar collapsabil pe tablet, grid-uri responsive.

### C8. ProjectView — 4600+ linii într-un singur fișier
- **Fișier:** `apps/web/src/app/(app)/projects/[id]/page.tsx`
- **Descriere:** Un fișier monolitic de 4600+ linii cu 41+ `useState`, 1400+ linii CSS inline în `<style>`, 7 leaf-uri, handlers, rendering. Imposibil de navigat sau menținut.
- **Impact:** Orice bugfix sau feature nouă e riscantă — dev-ul nu vede tot contextul.
- **Ce ar trebui:** Extract fiecare leaf ca componentă separată: `<EligibilityLeaf>`, `<SolomonLeaf>`, `<NeemiaLeaf>`, etc.

---

## MEDII (afectează UX-ul dar nu blochează)

### M1. Solomon — fără typing indicator
- **Fișier:** `page.tsx` liniile 664-773
- **Descriere:** Când Solomon "gândește", nu apare nimic vizual. Doar după 60s apare warning de timeout.
- **Ce ar trebui:** 3 puncte animate "Solomon scrie..." imediat după send.

### M2. Solomon — focus nu revine pe textarea după trimitere
- **Fișier:** `page.tsx` linia 668
- **Descriere:** După trimitere mesaj, focus-ul nu revine automat pe textarea. User-ul trebuie să dea click.
- **Ce ar trebui:** `textareaRef.current?.focus()` după `setSolomonInput("")`.

### M3. Solomon — fără drag resize pe split pane
- **Fișier:** `page.tsx` linia 1979
- **Descriere:** Panoul de elemente e fix la 320px. User-ul nu poate ajusta proporția chat/elemente.
- **Ce ar trebui:** `SplitPane` component (deja există în `components/layout/`) cu drag handle.

### M4. Solomon — elementele nu sunt grupate pe categorii
- **Fișier:** `page.tsx` liniile 3808-3829
- **Descriere:** Lista de elemente e flat — toate la un loc. Cu 80+ elemente, e greu de navigat.
- **Ce ar trebui:** Grupare: "Date firmă", "Date proiect", "Date financiare", "Investiție".

### M5. Solomon — fără progress bar în header elemente
- **Fișier:** `page.tsx` linia 3804
- **Descriere:** Header-ul arată "78/120" dar fără bară vizuală de progress.
- **Ce ar trebui:** `<div className="h-1 bg-blue-100"><div style={{width: pct}} className="bg-blue-600"/>` sub counter.

### M6. Duplicate components — `ui/` și `shared/` au aceleași componente
- **Fișiere:** `components/ui/StatusBadge.tsx` + `components/shared/StatusBadge.tsx`
- **Descriere:** StatusBadge, EmptyState, TypeBadge duplicate. `ProgressBar` + `ProgressBar2` în ui/.
- **Ce ar trebui:** Consolidare într-un singur loc (`components/ui/`).

### M7. Mixed styling — Tailwind + inline styles + CSS in `<style>`
- **Fișiere:** `page.tsx`, components
- **Descriere:** ProjectView folosește CSS inline în `<style>` tag (1400+ linii), alte pagini folosesc Tailwind, unele componente folosesc `style={{}}`.
- **Ce ar trebui:** Standardizare pe Tailwind + CSS modules dacă e nevoie.

### M8. Sidebar background alb — nu corespunde design system-ului
- **Fișier:** `Sidebar.tsx` linia 195
- **Descriere:** Sidebar-ul e `#ffffff` (alb). Design system-ul din CLAUDE.md specifică dark sidebar (slate-900).
- **Ce ar trebui:** Background conform tokens: `var(--bg-deep)` / `slate-900` în dark mode.

### M9. Sumar grid 4-col fără breakpoint responsive
- **Fișier:** `page.tsx` secțiunea Sumar (~linia 2590)
- **Descriere:** 4 stat cards în grid fără `@media` rule. Pe tabletă, overflow horizontal.
- **Ce ar trebui:** `grid-cols-2` la ≤1024px, `grid-cols-1` la ≤768px.

### M10. Empty states lipsă pe 5 secțiuni
- **Fișier:** `page.tsx`
- **Descriere:** Eligibilitate (0 reguli), Elemente (0 elemente), Ghid (0 reguli), Solomon extractions, Neemia pages — fără mesaj când sunt goale. (PARȚIAL FIXAT în ultimul commit)
- **Ce ar trebui:** Mesaj + icon + acțiune sugerată (ex: "Uploadează un ghid").

### M11. 11 error handlers silențioase (console.error fără toast)
- **Fișier:** `page.tsx` multiple locații
- **Descriere:** Checklist ops (5), element confirm/edit (2), Solomon extraction/confirm (2), versions, eligibility — (PARȚIAL FIXAT în ultimul commit — toast-uri adăugate).
- **Status:** PARȚIAL REZOLVAT.

### M12. Tokens CSS definite dar neutilizate consistent
- **Fișier:** `styles/tokens.css` vs componente
- **Descriere:** Tokens-urile (`--accent-blue`, `--bg-surface`, etc.) sunt definite complet dar componentele folosesc hex hardcoded (`#2563eb`) sau Tailwind (`text-slate-900`).
- **Ce ar trebui:** Extend Tailwind config cu CSS vars sau standardizare pe un singur approach.

### M13. Butoane fără loading state pe operații lente
- **Fișier:** `page.tsx` multiple
- **Descriere:** Solomon model change, Element bulk confirm, Version rollback, Guide rule detail — fără indicator de loading vizual.
- **Ce ar trebui:** Spinner pe buton + `disabled` în timpul operației.

### M14. Solomon — scroll instant, nu smooth
- **Fișier:** `page.tsx` linia 601
- **Descriere:** `scrollTop = scrollHeight` e sincron — jump instant. Pe mesaje lungi, disorienting.
- **Ce ar trebui:** `scrollIntoView({ behavior: "smooth" })` pe ultimul mesaj.

### M15. Solomon — fără Retry pe eroare AI
- **Fișier:** `page.tsx` linia 761
- **Descriere:** La eroare, apare toast "Eroare la comunicarea cu Solomon" dar fără buton "Reîncearcă".
- **Ce ar trebui:** Toast cu acțiune sau buton retry în chat.

### M16. ProjectView — media queries minime
- **Fișier:** `page.tsx` secțiunea CSS
- **Descriere:** Doar 2 breakpoints (1024px, 768px) cu ajustări minime. Tree sidebar, split pane-uri, elemente grid nu se adaptează.
- **Ce ar trebui:** Breakpoints complete cu collapse pe tree-sidebar ≤1024px.

### M17. Touch targets sub 44px
- **Fișier:** `page.tsx`, Sidebar.tsx
- **Descriere:** Multe butoane au 28-32px height — sub minimul 44px pentru touch.
- **Ce ar trebui:** `min-height: 44px` pe butoane interactive pe mobile.

### M18. Text truncation lipsă pe ecrane înguste
- **Fișier:** Multiple componente
- **Descriere:** Nume lungi de proiecte/firme nu au `text-overflow: ellipsis`. Pe ecran mic, overflow.
- **Ce ar trebui:** `truncate` class pe labels cu `title` tooltip.

---

## MINORE (polish, nice-to-have)

### m1. Extraction — cardurile nu arată sursa documentului
- **Fișier:** `page.tsx` linia 3687
- **Descriere:** Extracțiile arată label + value + confidence dar nu "din Certificat Constatator".
- **Ce ar trebui:** Sursa documentului vizibilă pe fiecare card.

### m2. Solomon — fără indicator "Mesaje noi ↓"
- **Fișier:** `page.tsx` linia 601
- **Descriere:** Dacă user-ul e scrollat în sus, nu vede că au apărut mesaje noi.
- **Ce ar trebui:** Floating button "↓ Mesaje noi" la bottom center.

### m3. Solomon elements panel — nu e collapsibil
- **Fișier:** `page.tsx` linia 3803
- **Descriere:** Panoul de 320px nu poate fi ascuns pentru mai mult spațiu de chat.
- **Ce ar trebui:** Toggle button care ascunde/arată panoul.

### m4. Solomon — fără drag & drop fișier
- **Fișier:** `page.tsx` linia 3769
- **Descriere:** Upload doar prin buton 📎. Nu se poate face drag & drop pe zona de chat.
- **Ce ar trebui:** `onDrop` handler pe chat container.

### m5. Solomon — avatarul user-ului lipsește
- **Fișier:** `page.tsx` linia 3678
- **Descriere:** Mesajele Solomon au avatar "S" (32px), dar mesajele user-ului nu au avatar.
- **Ce ar trebui:** Avatar cu inițialele user-ului pe mesaje proprii.

### m6. ProjectView — z-index conflict potențial
- **Fișier:** `layout.tsx` linia 105
- **Descriere:** SSE toast provider e `z-[150]`, modals sunt `z-50`. Inconsistent z-index scale.
- **Ce ar trebui:** Z-index scale documentată: base(0), dropdown(10), modal(50), toast(100).

### m7. Solomon — timestamp-ul nu e pe toate mesajele
- **Fișier:** `page.tsx` linia 3738
- **Descriere:** Doar mesajele assistant au timestamp vizibil. User messages nu.
- **Ce ar trebui:** Timestamp discret pe toate mesajele.

### m8. Sidebar — "Cabinet activ" card redundant
- **Fișier:** `Sidebar.tsx` linia 221
- **Descriere:** Card-ul "Cabinet activ" ocupă spațiu vertical dar adaugă puțină informație.
- **Ce ar trebui:** Simplificare — doar numele cabinetului în topbar sau inline.

### m9. Breadcrumbs — emoji-uri ca icon-uri
- **Fișier:** `Breadcrumbs.tsx` linia 32
- **Descriere:** Breadcrumbs folosesc emoji (📊, 🏢, 📋) ca icon-uri. Look neprofesional.
- **Ce ar trebui:** Lucide/Heroicons SVG consistente cu sidebar-ul.

### m10. Solomon — lipsă keyboard shortcut Ctrl+Enter
- **Fișier:** `page.tsx` linia 3787
- **Descriere:** Enter trimite, Shift+Enter line break. Ctrl+Enter nu face nimic.
- **Ce ar trebui:** Ctrl+Enter ca alternativă de send (productivitate).

### m11. Solomon — mesaje fără max-width centrat
- **Fișier:** `page.tsx` linia 1999
- **Descriere:** Mesajele au `max-width: 85%` dar nu sunt centrate cu `mx-auto` pe container. Pe ecran lat, mesajele sunt prea aproape de margini.
- **Ce ar trebui:** Container mesaje `max-w-3xl mx-auto` ca pe claude.ai.

### m12. Sidebar — collapsed state pierde context
- **Fișier:** `Sidebar.tsx` linia 36
- **Descriere:** La collapse (56px), doar icon-urile rămân. Fără tooltip pe hover.
- **Ce ar trebui:** Tooltip cu label-ul pe hover icon.

### m13. Companies page — fără inline search
- **Fișier:** `companies/page.tsx`
- **Descriere:** Lista de firme nu are search/filter vizibil pe pagina principală.
- **Ce ar trebui:** Input de search sticky în header listă.

### m14. ProgressBar — 2 versiuni diferite
- **Fișier:** `components/ui/ProgressBar.tsx` + `components/ui/ProgressBar2.tsx`
- **Descriere:** Două implementări de progress bar ușor diferite.
- **Ce ar trebui:** Consolidare într-o singură componentă parametrizabilă.

### m15. Solomon — refine popup apare pe text scurt selectat
- **Fișier:** `page.tsx` linia 957
- **Descriere:** Popup de refine se activează la selecție de 5+ caractere — prea puțin. Apare accidental.
- **Ce ar trebui:** Minim 20+ caractere sau un buton explicit.

### m16. Neemia — progress bar doar text în timpul generării
- **Fișier:** `page.tsx` linia 3832 (PARȚIAL FIXAT — bară adăugată în ultimul commit)
- **Status:** PARȚIAL REZOLVAT.

---

## INVENTAR PAGINI

| Pagină | Rută | Status | Observații |
|--------|------|--------|------------|
| Login | `/login` | ✓ | Wizard login + signup |
| Dashboard (Panou) | `/dashboard` | ✓ | Stat cards + proiecte recente |
| Firme | `/companies` | ✓ | Split pane cu detalii |
| Firme Detaliu | `/companies/[id]` | ✓ | Tabs: General, Financiar, Documente |
| Proiecte | `/projects` | ✓ | Cards + tabel toggle |
| Proiect Detaliu | `/projects/[id]` | ✓ | 7 leaf-uri: Sumar, Eligibilitate, Ghid, Solomon, Elemente, Checklist, Neemia |
| Documente | `/documents` | ✓ | Tree view + upload |
| Template Viewer | `/documents/template/[id]` | ✓ | Element detection |
| Configurări | `/settings` | ✓ | 6 secțiuni: Profil, AI Models, Integrations, Branding, Notifications, API |
| Admin | `/admin` | ✓ | Users, AI Costs, Audit Log |
| Provider Dashboard | `/provider/dashboard` | ✓ | Cabinet management |
| Provider Login | `/provider/login` | ✓ | Invite code auth |

---

## INVENTAR COMPONENTE

| Component | Locație | Folosit în | Observații |
|-----------|---------|------------|------------|
| Sidebar | `components/layout/Sidebar.tsx` | AppLayout | 248px expandat, 56px collapsed |
| Breadcrumbs | `components/layout/Breadcrumbs.tsx` | AppLayout | Auto-generate din URL |
| SplitPane | `components/layout/SplitPane.tsx` | Documents, Templates | Drag resize, keyboard support |
| ThemeProvider | `components/layout/ThemeProvider.tsx` | RootLayout | ⚠ Toggle disabled |
| Toast | `components/shared/Toast.tsx` | Global | `useToast()` hook |
| Spinner | `components/shared/Spinner.tsx` | Multiple | Loading indicator |
| StatusBadge | `components/ui/StatusBadge.tsx` | Multiple | ⚠ Duplicat în shared/ |
| EmptyState | `components/ui/EmptyState.tsx` | Multiple | ⚠ Duplicat în shared/ |
| PageHeader | `components/ui/PageHeader.tsx` | All pages | Title + subtitle |
| BtnPrimary | `components/ui/BtnPrimary.tsx` | Multiple | Blue accent button |
| BtnSecondary | `components/ui/BtnSecondary.tsx` | Multiple | Ghost button |
| BtnDanger | `components/ui/BtnDanger.tsx` | Multiple | Red accent button |
| ProgressBar | `components/ui/ProgressBar.tsx` | Multiple | ⚠ + ProgressBar2.tsx |
| TypeBadge | `components/ui/TypeBadge.tsx` | Multiple | ⚠ Duplicat în shared/ |
| useSSE | `hooks/useSSE.ts` | ProjectView | SSE cu auto-reconnect |
| useAuth | `hooks/useAuth.ts` | Global | JWT auth state |
| useSidebar | `hooks/useSidebar.ts` | Sidebar + Layout | Collapse state |
| apiClient | `lib/api.ts` | Global | apiGet/apiPost/apiPut/apiDelete |

---

## CE LIPSEȘTE (funcționalități UX neimplementate)

- [ ] **Dark mode funcțional** — tokens definite, toggle dezactivat
- [ ] **Buton STOP Solomon** — user blocat pe durata streaming-ului
- [ ] **Smart auto-scroll** — detectare scroll manual + indicator "mesaje noi"
- [ ] **Edit extracție** — buton prezent dar handler lipsă
- [ ] **Confirmă toate extracțiile** — bulk confirm
- [ ] **Typing indicator Solomon** — puncte animate "scrie..."
- [ ] **Drag resize Solomon split pane** — fix 320px
- [ ] **Grupare elemente pe categorii** — listă flat
- [ ] **Progress bar header elemente** — doar counter text
- [ ] **Retry pe eroare AI** — doar toast, fără acțiune
- [ ] **Responsive tablet/mobile** — layout-ul nu se adaptează
- [ ] **Touch targets 44px minim** — butoane sub standard
- [ ] **Tooltip pe sidebar collapsed** — icon-uri fără context
- [ ] **Search inline pe Companies** — fără filter vizibil
- [ ] **Drag & drop fișier Solomon** — doar buton upload
- [ ] **Keyboard shortcut focus Solomon** — Ctrl+/ sau similar

---

## SCOR UX PER SECȚIUNE

| Secțiune | Scor | Comentariu |
|----------|------|------------|
| **Layout General** | 8/10 | Structură solidă, scroll corect, fără double scrollbars |
| **Sidebar** | 7/10 | Funcțional, collapsed state bun, lipsesc tooltips |
| **Breadcrumbs** | 8/10 | Auto-generate, responsive, emoji-uri în loc de SVG |
| **Dashboard** | 7/10 | Stat cards + proiecte, layout bun |
| **Companies** | 7/10 | Split pane funcțional, lipsă search inline |
| **Projects List** | 7/10 | Cards + tabel toggle, empty state ok |
| **ProjectView** | 5/10 | Feature-rich dar monolitic, CSS inline, non-responsive |
| **Solomon Chat** | 6/10 | Streaming funcțional dar lipsesc: Stop, Smart scroll, Edit, Confirm all |
| **Neemia** | 7/10 | Progress bar adăugat, preview funcțional, download ok |
| **Settings** | 7/10 | 6 secțiuni, forms ok |
| **Admin** | 7/10 | Users, costs, audit — funcțional |
| **Componente UI** | 6/10 | Duplicate, mixed styling, hierarchy ok |
| **Design Tokens** | 5/10 | Definite complet, neutilizate consistent |
| **Responsive** | 3/10 | Absent pe 80% din app |
| **SCOR GLOBAL** | **6.1/10** | **Funcțional dar nepolit pentru enterprise** |

---

*DosarFonduri v2 · Audit UX · 2026-03-18*
