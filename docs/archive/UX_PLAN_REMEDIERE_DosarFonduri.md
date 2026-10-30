# PLAN REMEDIERE UX — DosarFonduri v2
## De la 6.1 → 9.0 în 10 runde

---

## SCORUL ACTUAL

| Secțiune | Acum | Țintă 9.0 | Delta |
|----------|------|-----------|-------|
| Layout General | 8 | 9 | +1 |
| Sidebar | 7 | 9 | +2 |
| Breadcrumbs | 8 | 9 | +1 |
| Dashboard | 7 | 9 | +2 |
| Companies | 7 | 9 | +2 |
| Projects List | 7 | 9 | +2 |
| **ProjectView** | **5** | **9** | **+4** |
| **Solomon Chat** | **6** | **9** | **+3** |
| Neemia | 7 | 9 | +2 |
| Settings | 7 | 9 | +2 |
| Admin | 7 | 8.5 | +1.5 |
| **Componente UI** | **6** | **9** | **+3** |
| **Design Tokens** | **5** | **9** | **+4** |
| **Responsive** | **3** | **9** | **+6** |

**Cele 4 găuri mari**: ProjectView, Solomon, Design Tokens, Responsive.
Rundele 1-6 le aduc pe toate la 8. Rundele 7-10 duc la 9.

---

## ⛔ REGULI CLAUDE CODE (pe tot planul)

> Citește fișierul ÎNAINTE de a-l modifica.
> Un singur fix → build check → următorul.
> NU modifica logica de business, NU modifica API calls.
> Dacă o modificare afectează mai mult de 2 fișiere, OPREȘTE-TE și raportează.

---

## FAZA A: FUNCȚIONALITATE & SOLOMON (R1-R2) → 7.5/10

### RUNDA 1 — Solomon Critical (6 fixes)
*Impact maxim pe productivitatea zilnică a consultantului.*

**Toate în `apps/web/src/app/(app)/projects/[id]/page.tsx`**

**1.1 Auto-scroll inteligent (C4 + M14)**
Linia ~601. Înlocuiește `scrollTop = scrollHeight` cu:
- State `autoScroll` = true
- `onScroll` handler pe container mesaje: dacă user-ul nu e la fund → `setAutoScroll(false)`
- `useEffect` care face `scrollIntoView({ behavior: 'smooth' })` DOAR când `autoScroll === true`
- Nu uita: la send mesaj nou → forțează `setAutoScroll(true)`

**1.2 Buton STOP streaming (C3)**
Linia ~3794. Când `isStreaming`:
- Buton Send devine Stop (iconița se schimbă)
- `onClick` apelează `AbortController.abort()` pe stream-ul SSE
- Caută `useSSE` sau `EventSource` — acolo e referința controller-ului
- Textul parțial generat rămâne vizibil în chat

**1.3 Typing indicator (M1)**
Între send și primul chunk SSE, arată 3 puncte animate:
```tsx
{isStreaming && messages[messages.length-1]?.role === 'user' && (
  <div className="flex items-center gap-1 py-3 px-4">
    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
  </div>
)}
```

**1.4 Focus textarea după send (M2)**
Linia ~668. După `setSolomonInput("")`:
```tsx
setTimeout(() => solomonInputRef.current?.focus(), 50);
```

**1.5 „Confirmă toate" extracții (C6)**
Linia ~3680. Buton bulk deasupra cardurilor:
```tsx
{pendingExtractions.length > 1 && (
  <button onClick={() => pendingExtractions.forEach(ext => handleConfirmExtraction(ext.id))}
    className="text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white">
    ✓ Confirmă toate ({pendingExtractions.length})
  </button>
)}
```

**1.6 Edit extracție funcțional (C5)**
Liniile ~3697-3698. Butonul „Editează" → inline edit:
- Click → valoarea devine input editabil
- Enter/blur → salvează
- Escape → anulează

**Build check după FIECARE fix individual.**

---

### RUNDA 2 — Solomon Polish (8 fixes)

**2.1 Indicator „Mesaje noi ↓" (m2)**
Floating button când `autoScroll === false` + mesaje noi:
```tsx
<button className="absolute bottom-20 left-1/2 -translate-x-1/2 px-3 py-1.5
  rounded-full bg-slate-900 text-white text-xs shadow-lg z-10">
  ↓ Mesaje noi
</button>
```

**2.2 Avatar user pe mesaje (m5)**
Mesajele user primesc avatar cu inițiale, simetric cu avatarul Solomon „S".

**2.3 Timestamp pe toate mesajele (m7)**
`text-xs text-slate-400` pe mesajele user, nu doar assistant.

**2.4 Max-width centrat (m11)**
Container mesaje: `max-w-3xl mx-auto` — ca pe claude.ai.

**2.5 Retry pe eroare AI (M15)**
La eroare Solomon: buton „Reîncearcă" care re-trimite ultimul mesaj user.

**2.6 Sursa pe carduri extracție (m1)**
`text-xs text-slate-400` cu numele documentului sursă.

**2.7 Progress bar header elemente (M5)**
Bară vizuală `h-1 bg-blue-600 rounded-full` sub counter.

**2.8 Refine popup — prag 20 caractere (m15)**
Linia ~957. De la 5+ la 20+ caractere minim.

**Build check după fiecare.**

---

## FAZA B: COMPONENTE & CONSISTENȚĂ (R3-R4) → 8.0/10

### RUNDA 3 — Consolidare Componente UI (C9, C10, M6)

**3.1 Șterge duplicate**
- `components/shared/StatusBadge.tsx` → șterge, păstrează `components/ui/`
- `components/shared/EmptyState.tsx` → șterge, păstrează `components/ui/`
- `components/shared/TypeBadge.tsx` → șterge
- `ProgressBar2.tsx` → merge în `ProgressBar.tsx` cu prop `variant`
- Actualizează TOATE importurile

**3.2 Creează Input / Select / Textarea**
În `components/ui/`:
```tsx
// Input.tsx — cu label, error, required, disabled
// Select.tsx — cu label, error, options, placeholder
// Textarea.tsx — cu label, error, auto-resize, maxHeight
```
Props standard: `label`, `error`, `required`, `disabled`, `className`.
NU migrezi paginile acum — doar creezi componentele.

**3.3 Migrează DataTable (C10)**
`DataTable.tsx` există dar nu e folosit. Alege 1 tabel simplu (ex: admin users) și migrează-l ca POC.

**3.4 Breadcrumbs emoji → SVG (m9)**
Emoji-uri (📊, 🏢, 📋) → Lucide icons consistente cu sidebar.

**Build check.**

---

### RUNDA 4 — Visual & Layout

**4.1 Font — confirmă Inter în CLAUDE.md (C1)**
CLAUDE.md zice DM Sans, codul folosește Inter. Actualizează CLAUDE.md → Inter.
Zero modificări de cod necesare.

**4.2 Font size bump — body text 14→16px**
Schimbarea cea mai impactantă pentru confort pe sesiuni lungi.

Ce crește:
```
text-sm → text-base:
  - Body text pe toate paginile (paragrafe, descrieri, labels de formular)
  - Solomon mesaje (user + assistant)
  - Solomon textarea input
  - Company/Project detail text
  - Settings descriptions
  - Inputs: h-10 → h-11 + text-base

text-xs → text-sm:
  - Caption/meta text (timestamps, source labels, counters)
  - Empty state descriptions
  - Sidebar item labels (dacă nu sunt deja text-sm)
```

Ce RĂMÂNE la dimensiunea actuală:
```
Rămân text-sm (14px):
  - Butoane (text de acțiune, nu de citit)
  - Tabel rows (densitate necesară)
  - Nav items sidebar
  - Badges status
  - Error messages sub inputs
  - Solomon extracții labels

Rămân text-xs (12px):
  - Badges/tags
  - Keyboard shortcuts hints
```

Caută cu grep și înlocuiește SELECTIV — nu face find-replace global:
```bash
# DOAR pentru a vedea ce e de schimbat — NU modifica automat
grep -rn "text-sm" apps/web/src --include="*.tsx" | head -50
```

**Atenție**: verifică vizual după fiecare pagină. Pe tabelele dense, text-base poate fi prea mare.

**Build check.**

**4.3 Dark mode toggle funcțional (C2)**
`ThemeProvider.tsx` linia 12:
```tsx
toggle: () => {
  const next = theme === 'light' ? 'dark' : 'light';
  setTheme(next);
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
}
```

**4.4 Sidebar background — CONFIRMAT ALB (M8)**
Sidebar rămâne alb (stil Linear). Actualizează CLAUDE.md să reflecte sidebar alb, nu dark.
Zero modificări de cod.

**4.5 Z-index scale (m6)**
Standardizează și documentează:
```css
/* tokens.css */
--z-dropdown: 10;
--z-sidebar: 20;
--z-modal: 50;
--z-toast: 100;
```

**4.6 Sidebar tooltips pe collapsed (m12)**
Hover pe icon → tooltip cu label pagină.

**4.7 Cabinet card simplificat (m8)**
Card „Cabinet activ" din sidebar → doar text inline sau mutat în topbar.

**Build check.**

---

## FAZA C: EMPTY STATES & LOADING (R5) → 8.3/10

### RUNDA 5 — Polish States

**5.1 Empty states lipsă (M10)**
Adaugă pe toate secțiunile goale:
- Eligibilitate (0 reguli): „Uploadează un ghid pentru a verifica eligibilitatea"
- Elemente (0 elemente): „Solomon va completa elementele din conversație"
- Ghid (0 reguli): „Niciun ghid procesat. Uploadează un ghid din Documente."
- Solomon prima deschidere: mesaj de bun venit de la Solomon
- Companies search fără rezultate: „Nicio firmă găsită"

**5.2 Loading states pe butoane (M13)**
Pe operații >500ms: spinner mic + disabled.

**5.3 Text truncation (M20)**
`truncate` + `title={fullName}` pe: nume firme, nume proiecte, labels elemente.

**5.4 Skeleton loading ProjectView (M19)**
La switch tab: skeleton placeholder pe zona de conținut.

**5.5 Error states consistente (M11)**
Verifică toate cele 11 `console.error` → trebuie toast cu mesaj clar.
Erori Solomon/Neemia: + buton „Reîncearcă".

**5.6 Search inline Companies (m13)**
Input sticky în header-ul listei de firme.

**Build check.**

---

## FAZA D: PROJECTVIEW REFACTOR (R6-R7) → 8.6/10

**Aceasta e operația chirurgicală. 4600 linii → componente separate.**

### RUNDA 6 — Split ProjectView (C8) — PARTE 1

**REGULĂ SPECIALĂ**: fiecare extracție → build check → test vizual.
NU modifica logica internă, doar mută codul.

**6.1 Extract `SumarLeaf.tsx`**
Mută secțiunea Sumar din page.tsx → `components/project/SumarLeaf.tsx`
Props: `project`, `stats`, `onAction`
Build check.

**6.2 Extract `EligibilitateLeaf.tsx`**
Props: `rules`, `projectData`, `onRefresh`
Build check.

**6.3 Extract `GhidLeaf.tsx`**
Props: `guide`, `rules`, `scoringCriteria`
Build check.

**6.4 Extract `ChecklistLeaf.tsx`**
Props: `items`, `onToggle`, `progress`
Build check.

---

### RUNDA 7 — Split ProjectView — PARTE 2

**7.1 Extract `SolomonLeaf.tsx`** (cel mai mare)
Props: `projectId`, `elements`, `messages`, `onConfirmExtraction`, `onEditElement`
Include: chat area, input area, mesaje, extracții.
Build check.

**7.2 Extract `ElementeLeaf.tsx`**
Props: `elements`, `onEdit`, `onDelete`, `groupBy`
Build check.

**7.3 Extract `NeemiaLeaf.tsx`**
Props: `projectId`, `templates`, `onGenerate`, `onDownload`
Build check.

**7.4 Cleanup `page.tsx`**
Ce rămâne: tab navigation, state management, data fetching.
Ar trebui să fie sub 500 linii.
Build check.

**7.5 Extract `<style>` → CSS modules sau Tailwind**
Cele 1400+ linii CSS inline → fie `ProjectView.module.css`, fie convertite la Tailwind.
Se face PER componentă extrasă, nu tot deodată.

---

## FAZA E: DESIGN TOKENS & CSS (R8) → 8.8/10

### RUNDA 8 — Standardizare Styling (M7, M12, M18)

**CONFIRMAT: Tailwind pur + semantic aliases.**

**8.1 Tailwind config semantic**
```js
// tailwind.config.ts
theme: {
  extend: {
    colors: {
      accent: { DEFAULT: '#2563eb', hover: '#1d4ed8' },
      surface: { DEFAULT: '#ffffff', raised: '#f8fafc' },
      'border-ui': { DEFAULT: '#e2e8f0', strong: '#cbd5e1' },
      success: { DEFAULT: '#059669', light: '#ecfdf5' },
      warning: { DEFAULT: '#f59e0b', light: '#fffbeb' },
      danger: { DEFAULT: '#dc2626', light: '#fef2f2' },
    }
  }
}
```
Avantaj: un singur sistem, IDE autocomplete, zero runtime CSS vars.
Token-urile din `tokens.css` se pot păstra ca referință documentară dar nu mai sunt sursa de adevăr.

**8.2 Migrare Companies CSS inline (M18)**
~200 linii `.co-card`, `.co-search` → Tailwind classes.

**8.3 Migrare Settings CSS inline (M18)**
~170 linii `.cfg-layout`, `.cfg-nav`, `.toggle` → Tailwind classes.

**8.4 Migrare componente extrase ProjectView**
Fiecare `*Leaf.tsx` din R6-R7: CSS inline → Tailwind.

**8.5 Hex hardcoded → semantic**
Caută `#2563eb`, `#0f172a`, etc. → `text-accent`, `bg-surface`.

**Build check per fișier.**

---

## FAZA F: RESPONSIVE (R9) → 9.0/10

### RUNDA 9 — Responsive Complet (C7, M9, M16, M17)

**9.1 Breakpoint system**
```
< 768px:   mobile (nu prioritar, dar nu trebuie să fie spart)
768-1024:  tablet landscape / laptop mic
1024-1280: laptop
1280-1440: desktop
1440+:     wide desktop
```

**9.2 Sidebar responsive**
- ≤1024px: auto-collapse la 56px (icon-only)
- Hover/click: expand temporar ca overlay
- Collapse state salvat în localStorage
- Buton hamburger pe header la ≤768px

**9.3 Dashboard responsive**
```
Stat cards:      grid-cols-2 → lg:grid-cols-4
Proiecte recente: grid-cols-1 → md:grid-cols-2
Activitate:      full width pe toate
```

**9.4 Companies responsive**
- ≤1024px: split pane → stacked (lista full, detaliu slide-over)
- Buton „← Înapoi" pe detaliu panel

**9.5 Projects List responsive**
```
Cards: grid-cols-1 → md:grid-cols-2 → xl:grid-cols-3
Tabel: overflow-x-auto cu scroll horizontal
```

**9.6 ProjectView responsive**
- ≤1024px: tree sidebar collapse la icon-only sau hidden
- Solomon split pane: stacked vertical (chat sus, elemente jos) sau tab toggle
- Tab bar: scroll horizontal dacă prea multe tabs
- Elemente panel: collapse toggle (deja planificat în m3)

**9.7 Settings responsive**
- ≤1024px: nav sidebar → dropdown/tabs orizontale sus

**9.8 Touch targets (M17)**
Toate butoanele interactive: `min-h-[44px] min-w-[44px]` pe ≤1024px.
```css
@media (max-width: 1024px) {
  button, a, [role="button"] { min-height: 44px; min-width: 44px; }
}
```

**9.9 Text & overflow**
- Toate textele lungi: `truncate` cu tooltip
- Tabelele: responsive cu card view pe mobile sau scroll horizontal
- Modals: full-screen pe ≤768px

**Build check per pagină.**

---

## FAZA G: MICRO-POLISH (R10) → 9.0/10 confirmat

### RUNDA 10 — Detalii care fac diferența între 8.5 și 9.0

**10.1 Tranziții & animații subtile**
- Page transitions: fade in pe conținut (opacity 0→1, 150ms)
- Tab switch: fade-in pe conținut nou
- Sidebar expand/collapse: width transition 200ms ease
- Modal: fade in + scale (0.95→1.0)
- Toast: slide in din dreapta
- Card hover: `transition-shadow duration-150` → `shadow-sm`
- List item select: background `transition-colors duration-100`

**10.2 Keyboard shortcuts**
- `Ctrl+K` / `Cmd+K`: command palette (search global)
- `Ctrl+/`: focus Solomon input (când ești pe proiect)
- `Escape`: închide modal/slide-over activ
- `Ctrl+Enter`: send în Solomon (alternativă la Enter)
- `Ctrl+S`: salvează formular activ (previne browser save dialog)

**10.3 Feedback haptic pe acțiuni**
- Confirmare extracție: checkmark animat (SVG animated stroke)
- Salvare reușită: toast verde cu micro-animație
- Delete: shake subtil pe confirm dialog
- Progress: number count-up animat pe stat cards

**10.4 Drag & drop Solomon (m4)**
`onDragOver` + `onDrop` pe zona de chat. Drop zone vizuală cu border dashed + text „Trage fișierul aici".

**10.5 Solomon drag resize split pane (M3)**
Folosește componenta `SplitPane` existentă din `components/layout/`. Proporție salvată în localStorage.

**10.6 Solomon grupare elemente pe categorii (M4)**
Grupuri: „Date firmă", „Date proiect", „Date financiare", „Investiție", „Alte date".
Header sticky per grup cu expand/collapse.

**10.7 Onboarding hint-uri** (nice-to-have)
Prima vizită pe Solomon: tooltip „Aici poți încărca documente" pe butonul 📎.
Prima vizită pe Proiecte: „Creează un proiect pentru a începe dosarul".
Folosește localStorage pentru a arăta o singură dată.

**10.8 Error recovery complet**
- Fiecare API call: retry cu backoff (1s, 2s, 4s)
- Offline detection: banner „Conexiune pierdută. Reconectare..."
- SSE disconnect: auto-reconnect cu indicator vizual
- Form unsaved changes: „Ai modificări nesalvate" la navigare

**Build check.**

---

## SCOR ESTIMAT PER RUNDĂ

| Rundă | Focus | Fixes | Scor după |
|-------|-------|-------|-----------|
| **R1** | Solomon Critical | 6 | 7.0 |
| **R2** | Solomon Polish | 8 | 7.5 |
| **R3** | Componente UI | 4 | 7.8 |
| **R4** | Visual, Layout & Font Size | 7 | 8.0 |
| **R5** | Empty/Loading | 6 | 8.3 |
| **R6** | ProjectView split pt.1 | 4 | 8.4 |
| **R7** | ProjectView split pt.2 | 5 | 8.6 |
| **R8** | Design tokens & CSS | 5 | 8.8 |
| **R9** | Responsive complet | 9 | 9.0 |
| **R10** | Micro-polish | 8 | **9.0 solid** |
| | **TOTAL** | **62 fixes** | |

---

## CE AR FI 10/10? (NU e în scope acum)

10/10 necesită lucruri care nu se pot face din cod:

| Ce | De ce nu acum |
|----|---------------|
| **User testing real** | Pune 3 consultanți să folosească app-ul 1 zi. Problemele reale apar doar așa. |
| **Accessibility WCAG AA** | Audit cu screen reader, contrast checker, focus trap pe modals. Durează 2-3 zile dedicate. |
| **Performance audit** | Lighthouse, bundle analysis, lazy loading, image optimization. După ce features-urile sunt stabile. |
| **i18n ready** | Dacă vreodată app-ul va fi în engleză/franceză. Nu acum, dar arhitectura poate fi pregătită. |
| **Undo/Redo** | Pe operații destructive (șterge firmă, respinge extracție). Complex, necesită state history. |
| **Offline mode** | Service worker, queue operații. Extrem de complex, nu necesar acum. |
| **Analytics UX** | Click heatmaps, session recording (Hotjar/PostHog). Pentru a vedea CE fac userii real. |
| **Design tokens Figma sync** | Design system partajat cu Figma — overkill pentru echipa actuală. |

**Pragmatic: 9.0 e excelent pentru launch.** 10.0 vine organic din feedback real post-launch.

---

## CUM SĂ DAI ACEST PLAN LUI CLAUDE CODE

**Opțiunea A — Rundă cu rundă (recomandat):**
> „Citește UX_PLAN_REMEDIERE și UX_GHID_REMEDIERE. Începe RUNDA 1. Fix 1.1 mai întâi. Build check. Apoi 1.2. Build check. Raportează ce ai făcut la fiecare pas."

**Opțiunea B — Fază cu fază:**
> „Citește planul. Execută FAZA A (R1 + R2). Un fix pe rând, build check după fiecare. Oprește-te la finalul fazei și raportează."

**NICIODATĂ:**
> ~~„Fixează toate cele 61 de probleme"~~ — dezastru garantat.

---

**DECIZII CONFIRMATE:**

1. ✅ **Font**: Inter (păstrat din cod, CLAUDE.md se actualizează)
2. ✅ **Font size**: Body text-base (16px), caption text-sm (14px) — bump cu o treaptă pentru confort
3. ✅ **Sidebar**: Alb (actual, stil Linear) — NU se schimbă, CLAUDE.md se aliniază la cod
4. ✅ **Styling**: Tailwind pur + semantic aliases în `tailwind.config.ts`
