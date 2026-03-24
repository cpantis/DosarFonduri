# UI Polish Reference — Butoane, Modale, Inputuri

**Data:** 2026-03-24
**Scop:** Aducerea la nivel profesional a UI-ului (butoane, modale, inputuri) — inspirat ClickUp.
**Regula:** NU schimbăm culori, doar dimensiuni, spacing, typography, consistență.

---

## 1. COMPONENTE SHARED — MODIFICĂRI

### 1.1 Buttons.tsx (`apps/web/src/components/ui/Buttons.tsx`)

#### SIZE_MAP

| Size | ÎNAINTE | DUPĂ |
|------|---------|------|
| `sm` | `text-[12px] h-[32px] px-4 gap-1.5 rounded-lg` | `text-[12px] h-[34px] px-4 gap-1.5 rounded-lg` |
| `md` | `text-[13px] h-[38px] px-5 gap-2 rounded-[10px]` | `text-[14px] h-[42px] px-6 gap-2 rounded-[10px]` |
| `lg` | `text-[14px] h-[42px] px-6 gap-2.5 rounded-xl` | `text-[14px] h-[44px] px-7 gap-2.5 rounded-xl` |
| `xl` | `text-[15px] h-[46px] px-8 gap-2.5 rounded-xl` | `text-[15px] h-[48px] px-8 gap-2.5 rounded-xl` |

#### BtnPrimary

| Proprietate | ÎNAINTE | DUPĂ |
|-------------|---------|------|
| font-weight | `font-medium` | `font-semibold` |
| icon size | `[&>svg]:w-[14px] [&>svg]:h-[14px]` | `[&>svg]:w-[15px] [&>svg]:h-[15px]` |
| min-width | — | `min-w-[100px]` |

#### BtnSecondary (Ghost subtle — Opțiunea B)

| Proprietate | ÎNAINTE | DUPĂ |
|-------------|---------|------|
| background | `bg-white` | `bg-transparent` |
| border | `border border-slate-200` | `border border-slate-200/60` |
| hover bg | `hover:bg-slate-50` | `hover:bg-slate-50` |
| hover border | `hover:border-slate-300` | `hover:border-slate-300` |
| text | `text-slate-600` | `text-slate-500` |
| font-weight | `font-medium` | `font-medium` (păstrat) |
| min-width | — | `min-w-[100px]` |

#### BtnDanger

| Proprietate | ÎNAINTE | DUPĂ |
|-------------|---------|------|
| font-weight | `font-medium` | `font-semibold` |
| min-width | — | `min-w-[100px]` |

---

### 1.2 globals.css — Focus states unificate (NOU)

Se adaugă la finalul globals.css:

```css
/* ═══ Unified form focus ═══ */
input:focus, select:focus, textarea:focus {
  border-color: #2563eb !important;
  box-shadow: 0 0 0 3px rgba(37,99,235,.1) !important;
  outline: none;
}
```

---

## 2. REGULI UNIFICATE — MODALE

Toate modalele din aplicație trebuie să respecte aceste valori:

### 2.1 Overlay (backdrop)

| Proprietate | Valoare unificată |
|-------------|-------------------|
| background | `rgba(0,0,0,.35)` |
| backdrop-filter | `blur(4px)` |
| z-index | `100` |
| animation | `fadeIn .2s` |

### 2.2 Modal card

| Proprietate | Valoare unificată |
|-------------|-------------------|
| background | `#ffffff` |
| border-radius | `16px` |
| border | `1px solid rgba(226,232,240,.7)` |
| padding | `32px` |
| box-shadow | `0 20px 60px rgba(0,0,0,.1), 0 1px 3px rgba(0,0,0,.06)` |
| max-height | `85vh` |
| overflow-y | `auto` |
| animation | `fadeUp .25s ease-out` |
| width | Per context (460-560px) — nu unificăm |

### 2.3 Modal header

| Proprietate | Valoare unificată |
|-------------|-------------------|
| title font-size | `20px` |
| title font-weight | `800` (extrabold) |
| title color | `#0f172a` |
| title margin-bottom | `4px` |
| subtitle font-size | `13px` |
| subtitle color | `#94a3b8` |
| close button size | `32px × 32px` |
| close button radius | `8px` |
| close button color | `#94a3b8` → hover `#475569` |
| close button hover bg | `#f1f5f9` |
| header ↔ content gap | `24px` |

### 2.4 Modal footer (button row)

| Proprietate | Valoare unificată |
|-------------|-------------------|
| gap | `12px` |
| justify | `flex-end` |
| padding-top | `24px` |
| border-top | opțional: `1px solid #f1f5f9` |

---

## 3. REGULI UNIFICATE — INPUTURI ÎN MODALE

| Proprietate | Valoare unificată |
|-------------|-------------------|
| padding | `12px 16px` |
| font-size | `14px` |
| border | `1px solid #e2e8f0` (opac, nu rgba) |
| border-radius | `10px` |
| background | `#ffffff` |
| color | `#0f172a` |
| placeholder color | `#94a3b8` |
| focus border | `#2563eb` |
| focus ring | `0 0 0 3px rgba(37,99,235,.1)` |
| transition | `all .15s` |
| font-family | `'Inter', system-ui, sans-serif` (default) |

### Label deasupra inputului (NOU — R13)

| Proprietate | Valoare |
|-------------|---------|
| font-size | `12px` |
| font-weight | `500` |
| color | `#64748b` |
| margin-bottom | `6px` |
| display | `block` |

---

## 4. PLAN PER PAGINĂ

### 4.1 Dashboard (`apps/web/src/app/(app)/dashboard/page.tsx`)

**Ce se schimbă:**
- Nimic — pagina nu are modale sau butoane custom inline
- Folosește deja `BtnPrimary` din shared → se actualizează automat cu R1-R3

**Risc:** Zero

---

### 4.2 Firme / Companies (`apps/web/src/app/(app)/companies/page.tsx`)

**Zona 1: Style block (liniile ~134-168)**

| Clasă CSS | Proprietate | ÎNAINTE | DUPĂ |
|-----------|------------|---------|------|
| `.co-modal` | border-radius | `16px` | `16px` ✓ |
| `.co-modal` | padding | `32px` | `32px` ✓ |
| `.co-modal` | border | `rgba(226,232,240,.8)` | `rgba(226,232,240,.7)` |
| `.co-modal` | box-shadow | `0 20px 60px rgba(0,0,0,.08)` | `0 20px 60px rgba(0,0,0,.1), 0 1px 3px rgba(0,0,0,.06)` |
| `.co-modal-overlay` | background | `rgba(0,0,0,.35)` | `rgba(0,0,0,.35)` ✓ |
| `.co-mode-btn` | padding | `10px 12px` | `12px 16px` |
| `.co-mode-btn` | font-size | `13px` | `14px` |
| `.co-mode-btn` | font-weight | `500` | `600` |
| `.co-search` | padding | `8px 12px 8px 36px` | `10px 14px 10px 40px` |
| `.co-search` | font-size | `13px` | `14px` |
| `.co-search` | border | `rgba(226,232,240,.8)` | `#e2e8f0` |
| `.co-search` | border-radius | `8px` | `10px` |
| `.co-forma-card` | padding | `12px 10px` | `14px 12px` |
| `.co-forma-card` | border | `rgba(226,232,240,.8)` | `#e2e8f0` |

**Zona 2: Modal header (linia ~322)**

| Proprietate | ÎNAINTE | DUPĂ |
|-------------|---------|------|
| title fontSize | `18` | `20` |
| title fontWeight | `700` | `800` |
| marginBottom | `20` | `24` |

**Zona 3: CUI input (linia ~346)**

| Proprietate | ÎNAINTE | DUPĂ |
|-------------|---------|------|
| padding | `10px 14px` | `12px 16px` |
| fontSize | `13` | `14` |
| border default | `rgba(226,232,240,.8)` | `#e2e8f0` |
| borderRadius | `8` | `10` |

**Zona 4: Footer buttons (linia ~410, ~463)**

| Proprietate | ÎNAINTE | DUPĂ |
|-------------|---------|------|
| gap | `10` | `12` |
| paddingTop / marginTop | `12` / `24` | `24` / `24` |

**Zona 5: Label "CUI sau denumire firmă" — adaugă label**

Adaugă label deasupra input-ului: `Caută firmă`

**Risc:** Scăzut — doar CSS + inline styles

---

### 4.3 Documente (`apps/web/src/app/(app)/documents/page.tsx`)

**Zona 1: Style block**

| Clasă CSS | Proprietate | ÎNAINTE | DUPĂ |
|-----------|------------|---------|------|
| `.doc-overlay` | background | `rgba(0,0,0,0.4)` | `rgba(0,0,0,.35)` |
| `.doc-overlay` | backdrop-filter | `blur(6px)` | `blur(4px)` |
| `.doc-modal` | border-radius | `12px` | `16px` |
| `.doc-modal` | padding | `28px` | `32px` |
| `.doc-modal` | box-shadow | `0 8px 40px rgba(0,0,0,.12), 0 1px 3px rgba(0,0,0,.08)` | `0 20px 60px rgba(0,0,0,.1), 0 1px 3px rgba(0,0,0,.06)` |
| `.doc-modal` | animation | `docSlideUp .3s` | `docSlideUp .25s` |
| `.doc-modal-title` | font-size | `15px` | `20px` |
| `.doc-modal-title` | font-weight | `800` | `800` ✓ |
| `.doc-btn-primary` | padding | `10px 20px` | `12px 24px` |
| `.doc-btn-primary` | font-size | `13px` | `14px` |
| `.doc-btn-primary` | border-radius | `8px` | `10px` |
| `.doc-btn-secondary` | padding | `10px 20px` | `12px 24px` |
| `.doc-btn-secondary` | font-size | `13px` | `14px` |
| `.doc-btn-secondary` | border-radius | `8px` | `10px` |
| `.doc-btn-secondary` | background | `transparent` | `transparent` ✓ |
| `.doc-btn-secondary` | border | `rgba(226,232,240,.8)` | `rgba(226,232,240,.6)` |

**Risc:** Scăzut — CSS changes only

---

### 4.4 Configurări / Settings (`apps/web/src/app/(app)/settings/page.tsx`)

**Zona 1: Style block**

| Clasă CSS | Proprietate | ÎNAINTE | DUPĂ |
|-----------|------------|---------|------|
| `.cfg-input` | padding | `8px 12px` | `10px 14px` |
| `.cfg-input` | border | `rgba(226,232,240,.8)` | `#e2e8f0` |
| `.cfg-input` | border-radius | `8px` | `10px` |
| `.cfg-select` | padding | `8px 12px` | `10px 14px` |
| `.cfg-select` | border | `rgba(226,232,240,.8)` | `#e2e8f0` |
| `.cfg-select` | border-radius | `8px` | `10px` |

**Zona 2: Inline buttons (knowledge base, API forms)**

| Element | Proprietate | ÎNAINTE | DUPĂ |
|---------|------------|---------|------|
| Save buttons | `className` | `px-4 py-2 text-sm rounded-lg` | `px-5 py-2.5 text-[14px] font-semibold rounded-[10px]` |
| Cancel buttons | `className` | `px-4 py-2 text-sm rounded-lg` | `px-5 py-2.5 text-[14px] rounded-[10px]` |
| Inputs in forms | `className` | `px-3 py-2 text-sm rounded-lg` | `px-4 py-2.5 text-[14px] rounded-[10px]` |

**Nu are modale** — doar inline forms.

**Risc:** Scăzut

---

### 4.5 Admin (`apps/web/src/app/(app)/admin/page.tsx`)

**Zona 1: Invite modal (~linia 640)**

| Element | Proprietate | ÎNAINTE | DUPĂ |
|---------|------------|---------|------|
| Overlay | className | `bg-black/40` | `bg-black/35 backdrop-blur-[4px]` |
| Card | className | `rounded-xl p-6 w-[460px]` | `rounded-2xl p-8 w-[480px]` |
| Card | animation | `slideUp_0.3s` | `fadeUp_0.25s_ease-out` |
| Title | className | `text-xl font-extrabold` | `text-[20px] font-extrabold` ✓ |
| Input | className | `px-3 py-2 text-sm rounded-lg` | `px-4 py-3 text-[14px] rounded-[10px]` |
| Role cards | className | `py-3 px-2.5 rounded-lg border-2` | `py-3.5 px-3 rounded-[10px] border-2` |
| Footer gap | className | `gap-2.5` | `gap-3` |

**Risc:** Scăzut

---

### 4.6 Provider Dashboard (`apps/web/src/app/provider/dashboard/page.tsx`)

**3 modale: Generate code, Edit plan, Email**

| Element | Proprietate | ÎNAINTE | DUPĂ |
|---------|------------|---------|------|
| Overlay | className | `bg-black/50` | `bg-black/35 backdrop-blur-[4px]` |
| Card | className | `rounded-xl w-[480px] p-7` | `rounded-2xl w-[500px] p-8` |
| Card | animation | `slideUp_0.3s` | `fadeUp_0.25s_ease-out` |
| Title | className | `text-xl font-extrabold` | `text-[20px] font-extrabold` ✓ |
| Inputs | className | `px-3.5 py-2.5 text-sm rounded-lg` | `px-4 py-3 text-[14px] rounded-[10px]` |
| Plan cards | className | `py-3 px-2.5 rounded-lg border-2` | `py-3.5 px-3 rounded-[10px] border-2` |
| Footer gap | className | `gap-2.5` | `gap-3` |
| Cancel btn | className | `px-5 py-2.5 text-sm rounded-lg` | `px-6 py-3 text-[14px] rounded-[10px]` |
| Primary btn | className | `px-5 py-2.5 text-sm rounded-lg` | `px-6 py-3 text-[14px] font-bold rounded-[10px]` |
| **Culoare primary** | — | **`bg-violet-500` — NU SE SCHIMBĂ** | — |

**Risc:** Scăzut

---

### 4.7 Proiecte Create Modal (`apps/web/src/app/(app)/projects/page.tsx`)

| Element | Proprietate | ÎNAINTE | DUPĂ |
|---------|------------|---------|------|
| Overlay | className | `bg-black/30 backdrop-blur-[2px]` | `bg-black/35 backdrop-blur-[4px]` |
| Card | className | `rounded-2xl w-[540px]` | `rounded-2xl w-[560px]` |
| Card | padding | `px-7 pt-6` (header) + `px-7 pb-7` (body) | `px-8 pt-7` + `px-8 pb-8` |
| Card | shadow | `shadow-2xl shadow-black/10` | `shadow-[0_20px_60px_rgba(0,0,0,.1)]` |
| Title | className | `text-[17px] font-bold` | `text-[20px] font-extrabold` |
| Input | className | `px-4 py-3 rounded-xl text-[14px]` | `px-4 py-3 rounded-[10px] text-[14px]` ✓ |
| Footer gap | className | `gap-2.5` | `gap-3` |

**Risc:** Scăzut

---

### 4.8 Proiecte `[id]/page.tsx` — NU SE IMPLEMENTEAZĂ ACUM

**Motivul:** Fișier de 5.691 linii, monolith, foarte fragil. Are ~50+ butoane inline cu `style={{}}`.

**Plan viitor (documentat pentru referință):**
1. Split în 7+ componente (Eligibility, Solomon, Elements, Checklist, Neemia, Guide, Summary)
2. Fiecare componentă primește butoane shared (`BtnPrimary`, `BtnSecondary`)
3. Inline styles → Tailwind classes
4. Se implementează SEPARAT, după split-ul din C4 (Architecture Audit)

**Butoane afectate (pentru referință):**
- Solomon: save/cancel inline (pad `4px 12px`, font `11px`) → `BtnPrimary size="sm"` / `BtnSecondary size="sm"`
- Neemia: save/cancel inline → same
- FormOnDocument: `.fod-save-btn` / `.fod-cancel-btn` (24×24px) → rămân (sunt micro-buttons)
- Eligibility: refresh, expand → `BtnSecondary size="sm"` + `BtnPrimary size="sm"`
- Elements: validate, edit → same

---

### 4.9 Login (`apps/web/src/app/(auth)/login/page.tsx`) — NU SE MODIFICĂ

Are propriul design system (`.btn-p`, `.btn-s`), full-width buttons. Nu se atinge.

---

## 5. ORDINEA DE IMPLEMENTARE

```
1. Buttons.tsx (shared)     → build check → commit → push
2. globals.css (focus)      → build check → commit → push
3. Dashboard                → build check → commit → push → VERIFICARE VIZUALĂ
4. Companies                → build check → commit → push → VERIFICARE VIZUALĂ
5. Documents                → build check → commit → push → VERIFICARE VIZUALĂ
6. Settings                 → build check → commit → push → VERIFICARE VIZUALĂ
7. Admin                    → build check → commit → push → VERIFICARE VIZUALĂ
8. Provider                 → build check → commit → push → VERIFICARE VIZUALĂ
9. Projects (create modal)  → build check → commit → push → VERIFICARE VIZUALĂ
```

**Pașii 1-2 se fac împreună** (sunt dependențe shared).
**Pasul 3 (Dashboard)** e cel mai sigur — practic nu are modificări locale, doar beneficiază de Buttons.tsx nou.
**Projects `[id]` — NU se atinge.**

---

## 6. ROLLBACK PLAN

Fiecare pagină e un commit separat. Dacă ceva se strică vizual:
```bash
git revert <commit-hash>
```

Nu există dependențe cross-page (fiecare pagină are propriile CSS classes/inline styles).
Singura excepție: Buttons.tsx afectează TOATE paginile — de aceea se face primul și se verifică.

---

## 7. CHECKLIST FINAL

- [ ] Buttons.tsx — SIZE_MAP updated
- [ ] Buttons.tsx — BtnPrimary font-semibold + min-w
- [ ] Buttons.tsx — BtnSecondary ghost subtle + min-w
- [ ] Buttons.tsx — BtnDanger font-semibold + min-w
- [ ] globals.css — unified focus states
- [ ] Dashboard — build OK
- [ ] Companies — modal, inputs, buttons, labels
- [ ] Documents — modal, buttons
- [ ] Settings — inputs, inline buttons
- [ ] Admin — modal, inputs, role cards
- [ ] Provider — 3 modals, inputs, buttons
- [ ] Projects create — modal, inputs
- [ ] Projects [id] — SKIPPED (future)
- [ ] Login — SKIPPED (not touched)
