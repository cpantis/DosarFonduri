# CROSS-CHECK: Pagina Documente — Definit vs. Implementat
## + Script Audit Vizual pentru Claude Code

---

# PARTEA 1 — CROSS-CHECK DETALIAT

## CARD GHID — Lista Documente

| # | Element definit | Trebuie afișat | Vizibil în screenshot | Status | Detalii |
|---|----------------|----------------|----------------------|--------|---------|
| G1 | Nume fișier | `.doc-card-name` cu truncate | ✅ Da | OK | "ghidul-solicitantului-sm-41..." vizibil |
| G2 | Tip fișier + dimensiune | "PDF · 1.7 MB" | ✅ Da | OK | Vizibil sub nume |
| G3 | Data upload | 📅 format dată | ✅ Da | OK | "2026-03-17" vizibil |
| G4 | Nr. pagini | dacă pageCount > 0 | ✅ Da | OK | "62 pag." vizibil |
| G5 | Cine a uploadat | "de Pantis Florian" | ✅ Da | OK | Vizibil |
| G6 | Status badge | "✓ Procesat AI" verde / "Neprocesat" gri | ✅ Da | OK | Badge verde vizibil |
| G7 | Nr. reguli extrase | "33 reguli" | ✅ Da | OK | Vizibil pe ghid |
| G8 | Taguri | [AFIR], [sM 4.1], etc. | ❌ Nu | LIPSĂ | **Niciun tag vizibil pe card** |
| G9 | Icon tip fișier (PDF roșu / DOCX albastru) | Icon colorat pe stânga | ✅ Da | OK | Icon roșu PDF vizibil |

## EXPAND GHID — Tab-uri Detalii

| # | Tab/Element definit | Trebuie afișat | Vizibil în screenshot | Status | Detalii |
|---|-------------------|----------------|----------------------|--------|---------|
| G10 | Tab "Reguli" | Descriere + tip (FIXĂ/INTER) + categorie + pagina sursă + confidence % + validated ✓ | ❓ | NEVERIFICAT | Nu am screenshot cu expand deschis |
| G11 | Tab "Criterii de selecție" | Nume + punctaj maxim + categorie + logică evaluare | ❓ | NEVERIFICAT | Depinde de `scoring_criteria` (tabel posibil lipsă) |
| G12 | Tab "Elemente (definiții)" | displayName + dataType + categorie + unit + obligatoriu/opțional + elementKey | ❓ | NEVERIFICAT | Depinde de `element_definitions` (tabel posibil lipsă) |
| G13 | Trust Score badge | Procentaj colorat verde/galben/roșu | ❓ | NEVERIFICAT | |
| G14 | Total punctaj maxim pe Criterii | Sumă (ex: "Total: 100p") | ❌ | LIPSĂ DEFINIT | **Problema #5 din audit: nu se afișează totalul** |

## CLICK PE GHID — Inline Detail

| # | Element definit | Trebuie afișat | Status | Detalii |
|---|----------------|----------------|--------|---------|
| G15 | Tip document clasificat AI | ex: "Ghid solicitant" | ❓ NEVERIFICAT | |
| G16 | Încredere clasificare | procentaj | ❓ NEVERIFICAT | |
| G17 | Reguli extrase (nr.) | Count | ❓ NEVERIFICAT | |
| G18 | Date extrase (câmpuri) | max 8 câmpuri field_key → field_value | ❓ NEVERIFICAT | |
| G19 | Buton Descarcă | ✅ | ✅ Da | Vizibil în screenshot pe card expandat |
| G20 | Buton Previzualizare | ✅ | ✅ Da | Vizibil |
| G21 | Buton Șterge | ✅ | ✅ Da | Vizibil |
| G22 | Buton Reprocesare | doar dacă status = eroare | ❓ NEVERIFICAT | Trebuie test cu doc eșuat |
| G23 | `processingResult.processing_time_ms` | Durată procesare | ❌ LIPSĂ | **Problema #6: nu e afișat** |
| G24 | `completenessReport` | categoriesFound/Missing/warnings | ❌ LIPSĂ | **Problema #4: nu se afișează** |

---

## CARD TEMPLATE — Lista Documente

| # | Element definit | Trebuie afișat | Vizibil în screenshot | Status | Detalii |
|---|----------------|----------------|----------------------|--------|---------|
| T1 | Nume fișier | ✅ | ✅ Da | OK | "Anexa_3_Corelarea..." vizibil |
| T2 | Tip fișier + dimensiune | "DOCX · 405 KB" | ✅ Da | OK | |
| T3 | Data upload + pagini + uploadedBy | ✅ | ✅ Da | OK | |
| T4 | Status badge | "★ Referință" | ⚠️ Parțial | ALTFEL | Badge "Referință" vizibil, dar **nu badge "Template" albastru** definit |
| T5 | Nr. elemente | "14 elemente" | ❌ Nu | LIPSĂ | **Nu văd count elemente pe card Anexa 3** |
| T6 | Taguri | ❌ Nu | LIPSĂ | Idem ca la ghid |
| T7 | Badge generationMode (FILL/COMPOSE) | ❌ Nu | LIPSĂ | **Problema #1 din audit** |

## EXPAND TEMPLATE — Detalii

| # | Element definit | Trebuie afișat | Status | Detalii |
|---|----------------|----------------|--------|---------|
| T8 | "📝 Elemente extrase: N" | Count elemente | ❓ NEVERIFICAT | |
| T9 | Lista elementelor | key + label + fieldType + pagina + validated badge | ❓ NEVERIFICAT | |
| T10 | Mod generare (FILL/COMPOSE) | ❌ LIPSĂ | **Problema #3** |

## CLICK PE TEMPLATE — Inline Detail

| # | Element definit | Trebuie afișat | Status | Detalii |
|---|----------------|----------------|--------|---------|
| T11 | Tip document clasificat | ❓ NEVERIFICAT | |
| T12 | Încredere clasificare | ❓ NEVERIFICAT | |
| T13 | Elemente extrase (nr.) | ❓ NEVERIFICAT | |
| T14 | Buton Descarcă / Preview / Șterge | ✅ | OK | |
| T15 | Buton "Deschide Template Viewer" | ❌ LIPSĂ | **Problema #2 din audit** |

---

## SUMAR LIPSURI CONFIRMATE (din screenshots)

| # | Ce lipsește | Gravitate | Efort fix |
|---|------------|-----------|-----------|
| 1 | **Taguri pe carduri** (G8, T6) | Medium | Mic — afișare din metadata procesare |
| 2 | **Nr. elemente pe card template** (T5) | Medium | Mic — count query |
| 3 | **Badge generationMode FILL/COMPOSE** (T7, T10) | High | Mic — câmpul există în API |
| 4 | **Buton "Deschide Template Viewer"** (T15) | High | Mic — link la `/documents/template/[id]` |
| 5 | **completenessReport** (G24) | Medium | Mediu — componentă nouă |
| 6 | **processing_time_ms** (G23) | Low | Mic — afișare text |
| 7 | **Total punctaj pe Criterii** (G14) | Medium | Mic — sumă simplă |
| 8 | **Badge "Template" albastru** (T4) | Medium | Mic — condiție pe documentType |

---

# PARTEA 2 — SCRIPT AUDIT VIZUAL

> **Instrucțiuni pentru Claude Code:**
> Copiază acest fișier în rădăcina proiectului.
> Rulează: `npx playwright install chromium` (dacă nu e instalat)
> Apoi: `npx tsx scripts/audit-visual-documents.ts`
> Scriptul deschide aplicația, navighează pe pagina Documente,
> și generează un raport cu screenshots + verificări automate.

```typescript
// scripts/audit-visual-documents.ts
// Audit vizual automat — Pagina Documente DosarFonduri v2
// Rulare: npx tsx scripts/audit-visual-documents.ts

import { chromium, type Page, type Browser } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════
// CONFIGURARE
// ═══════════════════════════════════════════════════════════

const CONFIG = {
  baseUrl: process.env.APP_URL || 'https://dosar-fonduri.com',
  email: process.env.TEST_EMAIL || 'pantis@test.com',
  password: process.env.TEST_PASSWORD || 'test123',
  screenshotDir: './audit-screenshots',
  timeout: 15000,
};

interface AuditResult {
  id: string;
  description: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
  details: string;
  screenshot?: string;
}

const results: AuditResult[] = [];

function log(id: string, desc: string, status: AuditResult['status'], details: string, screenshot?: string) {
  results.push({ id, description: desc, status, details, screenshot });
  const icon = { PASS: '✅', FAIL: '❌', WARN: '⚠️', SKIP: '⏭️' }[status];
  console.log(`${icon} [${id}] ${desc} — ${details}`);
}

async function screenshot(page: Page, name: string): Promise<string> {
  const filepath = path.join(CONFIG.screenshotDir, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: false });
  return filepath;
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

async function elementExists(page: Page, selector: string, timeout = 3000): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch {
    return false;
  }
}

async function getTextContent(page: Page, selector: string): Promise<string | null> {
  try {
    const el = await page.waitForSelector(selector, { timeout: 3000 });
    return el ? await el.textContent() : null;
  } catch {
    return null;
  }
}

async function countElements(page: Page, selector: string): Promise<number> {
  return await page.locator(selector).count();
}

// ═══════════════════════════════════════════════════════════
// AUDIT STEPS
// ═══════════════════════════════════════════════════════════

async function auditLogin(page: Page) {
  console.log('\n══════ FAZA 0: LOGIN ══════\n');
  
  await page.goto(CONFIG.baseUrl);
  await page.waitForTimeout(2000);
  
  // Verifică dacă suntem deja logați (redirect la dashboard)
  const url = page.url();
  if (url.includes('/dashboard') || url.includes('/documents')) {
    log('L1', 'Sesiune activă', 'PASS', 'Deja autentificat');
    return;
  }
  
  // Login flow
  try {
    await page.fill('input[type="email"], input[name="email"]', CONFIG.email);
    await page.fill('input[type="password"], input[name="password"]', CONFIG.password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    
    if (page.url().includes('/dashboard') || page.url().includes('/documents')) {
      log('L1', 'Login', 'PASS', 'Autentificare reușită');
    } else {
      log('L1', 'Login', 'FAIL', `Redirect la: ${page.url()}`);
    }
  } catch (e) {
    log('L1', 'Login', 'FAIL', `Eroare: ${e}`);
  }
}

async function auditNavigateToDocuments(page: Page) {
  console.log('\n══════ FAZA 1: NAVIGARE LA DOCUMENTE ══════\n');
  
  // Click pe "Documente" din sidebar
  try {
    const docLink = page.locator('a, button, [role="link"]').filter({ hasText: /^Documente$/i });
    if (await docLink.count() > 0) {
      await docLink.first().click();
      await page.waitForTimeout(2000);
      log('N1', 'Click Documente sidebar', 'PASS', `URL: ${page.url()}`);
    } else {
      // Fallback: navigare directă
      await page.goto(`${CONFIG.baseUrl}/documents`);
      await page.waitForTimeout(2000);
      log('N1', 'Navigare directă /documents', 'WARN', 'Link sidebar negăsit, navigare directă');
    }
    
    await screenshot(page, '01_documents_page');
  } catch (e) {
    log('N1', 'Navigare Documente', 'FAIL', `${e}`);
  }
}

async function auditTreeSidebar(page: Page) {
  console.log('\n══════ FAZA 2: TREE SIDEBAR ══════\n');
  
  // 2.1 Verifică existența tree-ului
  const treeExists = await elementExists(page, '[class*="tree"], [class*="sidebar"], [class*="program"]');
  log('T1', 'Tree sidebar vizibil', treeExists ? 'PASS' : 'FAIL', 
    treeExists ? 'Container tree găsit' : 'Niciun container tree detectat');
  
  // 2.2 Verifică noduri: Program, Masura, Sesiune
  const programNode = await elementExists(page, ':text("Program")');
  log('T2', 'Nod "Program" vizibil', programNode ? 'PASS' : 'WARN', 
    programNode ? 'Găsit' : 'Negăsit — poate e collapsat');
  
  // 2.3 Click pe "Ghiduri"
  try {
    const ghiduriLink = page.locator(':text("Ghiduri")').first();
    if (await ghiduriLink.isVisible()) {
      await ghiduriLink.click();
      await page.waitForTimeout(1000);
      log('T3', 'Click pe "Ghiduri"', 'PASS', 'Navigare la secțiunea ghiduri');
    } else {
      log('T3', 'Click pe "Ghiduri"', 'WARN', 'Link "Ghiduri" nu e vizibil');
    }
  } catch (e) {
    log('T3', 'Click pe "Ghiduri"', 'FAIL', `${e}`);
  }
  
  // 2.4 Click pe "Template-uri"
  const templateLink = await elementExists(page, ':text("Template")');
  log('T4', 'Nod "Template-uri" vizibil', templateLink ? 'PASS' : 'WARN', '');
  
  // 2.5 "Adauga program" button
  const addProgram = await elementExists(page, ':text("Adauga program"), :text("Adaugă program")');
  log('T5', 'Buton "+ Adauga program"', addProgram ? 'PASS' : 'WARN', '');
  
  // 2.6 Dead space check
  // Verifică dacă există un container gol sub tree
  const treeHeight = await page.evaluate(() => {
    const tree = document.querySelector('[class*="tree"], [class*="sidebar-content"], [class*="program-tree"]');
    const parent = tree?.parentElement;
    if (tree && parent) {
      const treeRect = tree.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();
      return {
        treeBottom: treeRect.bottom,
        parentBottom: parentRect.bottom,
        gap: parentRect.bottom - treeRect.bottom
      };
    }
    return null;
  });
  
  if (treeHeight && treeHeight.gap > 100) {
    log('T6', 'Dead space sub tree', 'WARN', `Gap de ${Math.round(treeHeight.gap)}px sub tree — de fixat`);
  } else {
    log('T6', 'Dead space sub tree', 'PASS', 'Fără dead space vizibil');
  }
  
  await screenshot(page, '02_tree_sidebar');
}

async function auditDocumentCards(page: Page) {
  console.log('\n══════ FAZA 3: CARDURI DOCUMENTE ══════\n');
  
  // Numără cardurile de documente
  // Încearcă mai mulți selectori posibili
  const cardSelectors = [
    '[class*="doc-card"]',
    '[class*="document-card"]', 
    '[class*="DocumentCard"]',
    '[data-testid*="document"]',
    '.document-list > div',
    '[class*="card"]'
  ];
  
  let cardCount = 0;
  let usedSelector = '';
  for (const sel of cardSelectors) {
    const count = await countElements(page, sel);
    if (count > 0) {
      cardCount = count;
      usedSelector = sel;
      break;
    }
  }
  
  log('D1', 'Carduri documente găsite', cardCount > 0 ? 'PASS' : 'FAIL',
    `${cardCount} carduri (selector: ${usedSelector || 'niciunul'})`);
  
  if (cardCount === 0) {
    log('D2', 'Restul verificărilor card', 'SKIP', 'Niciun card găsit');
    return;
  }
  
  await screenshot(page, '03_document_cards');
  
  // Verificări per card — ia primul card vizibil
  const firstCard = page.locator(usedSelector).first();
  const cardText = await firstCard.textContent() || '';
  
  // G1: Nume fișier
  log('G1', 'Nume fișier pe card', cardText.length > 5 ? 'PASS' : 'FAIL', 
    `Text card: "${cardText.substring(0, 80)}..."`);
  
  // G2: Tip fișier + dimensiune
  const hasFileType = /PDF|DOCX|XLSX/i.test(cardText);
  const hasSize = /\d+(\.\d+)?\s*(KB|MB|GB)/i.test(cardText);
  log('G2', 'Tip fișier + dimensiune', hasFileType && hasSize ? 'PASS' : 'WARN',
    `Tip: ${hasFileType ? 'DA' : 'NU'}, Size: ${hasSize ? 'DA' : 'NU'}`);
  
  // G3: Data upload
  const hasDate = /\d{4}-\d{2}-\d{2}|\d{2}[./]\d{2}[./]\d{4}/.test(cardText);
  log('G3', 'Data upload', hasDate ? 'PASS' : 'WARN', hasDate ? 'Dată găsită' : 'Nicio dată detectată');
  
  // G4: Nr. pagini
  const hasPages = /\d+\s*pag/i.test(cardText);
  log('G4', 'Nr. pagini', hasPages ? 'PASS' : 'WARN', '');
  
  // G5: Cine a uploadat
  const hasUploader = /de\s+\w+/i.test(cardText);
  log('G5', 'Uploaded by', hasUploader ? 'PASS' : 'WARN', '');
  
  // G6: Status badge "Procesat AI"
  const hasProcesatBadge = /Procesat\s*AI/i.test(cardText);
  log('G6', 'Badge "Procesat AI"', hasProcesatBadge ? 'PASS' : 'WARN',
    hasProcesatBadge ? 'Badge găsit' : 'Negăsit — poate nu e procesat');
  
  // G7: Nr. reguli
  const hasRules = /\d+\s*regul/i.test(cardText);
  log('G7', 'Nr. reguli pe card', hasRules ? 'PASS' : 'WARN', '');
  
  // G8: Taguri
  const hasTags = /\[AFIR\]|\[sM|\btag\b/i.test(cardText);
  log('G8', 'Taguri pe card', hasTags ? 'PASS' : 'FAIL', 
    hasTags ? 'Taguri găsite' : 'LIPSĂ — niciun tag vizibil');
  
  // T7: Badge generationMode (pe template)
  const hasGenerationMode = /FILL|COMPOSE/i.test(cardText);
  log('T7', 'Badge generationMode (FILL/COMPOSE)', hasGenerationMode ? 'PASS' : 'FAIL',
    hasGenerationMode ? 'Găsit' : 'LIPSĂ — problemă confirmată');
}

async function auditExpandDetails(page: Page) {
  console.log('\n══════ FAZA 4: EXPAND DETALII ══════\n');
  
  // Caută butonul "Detalii" / "▼" / expand
  const detailButtons = [
    ':text("Detalii")',
    ':text("▼ Detalii")',
    '[class*="expand"]',
    '[class*="detail"]',
    'button:has-text("Detalii")'
  ];
  
  let expanded = false;
  for (const sel of detailButtons) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible()) {
        await btn.click();
        await page.waitForTimeout(1500);
        expanded = true;
        log('E1', 'Expand detalii ghid', 'PASS', `Click pe: ${sel}`);
        break;
      }
    } catch { /* next */ }
  }
  
  if (!expanded) {
    log('E1', 'Expand detalii ghid', 'WARN', 'Buton expand negăsit');
    return;
  }
  
  await screenshot(page, '04_expanded_details');
  
  const expandedText = await page.locator('body').textContent() || '';
  
  // G10: Tab Reguli
  const hasRulesTab = /Reguli|Rules/i.test(expandedText) && /FIXĂ|INTER|confidence|pagina/i.test(expandedText);
  log('G10', 'Tab "Reguli" cu detalii', hasRulesTab ? 'PASS' : 'WARN',
    hasRulesTab ? 'Reguli cu detalii găsite' : 'Verifică manual — tab reguli');
  
  // G11: Tab Criterii selecție
  const hasScoringTab = /Criterii|Selecție|punctaj|maxim/i.test(expandedText);
  log('G11', 'Tab "Criterii de selecție"', hasScoringTab ? 'PASS' : 'WARN', '');
  
  // G12: Tab Elemente
  const hasElementsTab = /Elemente|definiți|dataType|elementKey/i.test(expandedText);
  log('G12', 'Tab "Elemente (definiții)"', hasElementsTab ? 'PASS' : 'WARN', '');
  
  // G13: Trust Score
  const hasTrustScore = /trust|score|încredere/i.test(expandedText);
  log('G13', 'Trust Score badge', hasTrustScore ? 'PASS' : 'FAIL',
    hasTrustScore ? 'Găsit' : 'LIPSĂ — trust score nu e afișat');
  
  // G14: Total punctaj
  const hasTotalScore = /total.*\d+p|total.*punct/i.test(expandedText);
  log('G14', 'Total punctaj pe Criterii', hasTotalScore ? 'PASS' : 'FAIL',
    hasTotalScore ? 'Total afișat' : 'LIPSĂ — nu afișează totalul');
}

async function auditCardActions(page: Page) {
  console.log('\n══════ FAZA 5: ACȚIUNI PE CARD ══════\n');
  
  // Click pe un card pentru inline detail
  const cards = page.locator('[class*="doc-card"], [class*="document-card"], [class*="card"]');
  if (await cards.count() > 0) {
    await cards.first().click();
    await page.waitForTimeout(1500);
  }
  
  await screenshot(page, '05_card_actions');
  
  const pageText = await page.locator('body').textContent() || '';
  
  // G19-G21: Butoane acțiuni
  const hasDownload = /Descarcă|Download/i.test(pageText);
  log('G19', 'Buton Descarcă', hasDownload ? 'PASS' : 'WARN', '');
  
  const hasPreview = /Previzualizare|Preview/i.test(pageText);
  log('G20', 'Buton Previzualizare', hasPreview ? 'PASS' : 'WARN', '');
  
  const hasDelete = /Șterge|Delete/i.test(pageText);
  log('G21', 'Buton Șterge', hasDelete ? 'PASS' : 'WARN', '');
  
  // G22: Buton Reprocesare
  const hasReprocess = /Reprocesare|Reprocess|Re-procesare/i.test(pageText);
  log('G22', 'Buton Reprocesare (dacă eroare)', hasReprocess ? 'PASS' : 'WARN',
    hasReprocess ? 'Găsit' : 'Nu e vizibil — OK dacă documentul nu e în eroare');
  
  // T15: Buton Template Viewer
  const hasTemplateViewer = /Template Viewer|Deschide Template|Open Template/i.test(pageText);
  log('T15', 'Buton "Deschide Template Viewer"', hasTemplateViewer ? 'PASS' : 'FAIL',
    hasTemplateViewer ? 'Găsit' : 'LIPSĂ — problemă #2 confirmată');
}

async function auditHeaderStats(page: Page) {
  console.log('\n══════ FAZA 6: HEADER STATS ══════\n');
  
  const headerText = await page.locator('body').textContent() || '';
  
  // Counter: "4 documente · 3 procesate · 0 template-uri"
  const hasDocCount = /\d+\s*documente/i.test(headerText);
  log('H1', 'Counter documente', hasDocCount ? 'PASS' : 'WARN', '');
  
  const hasProcCount = /\d+\s*procesate/i.test(headerText);
  log('H2', 'Counter procesate', hasProcCount ? 'PASS' : 'WARN', '');
  
  const hasTemplCount = /\d+\s*template/i.test(headerText);
  log('H3', 'Counter template-uri', hasTemplCount ? 'PASS' : 'WARN', '');
}

async function auditSearchAndUpload(page: Page) {
  console.log('\n══════ FAZA 7: SEARCH + UPLOAD ══════\n');
  
  // Search bar
  const hasSearch = await elementExists(page, 'input[placeholder*="Cauta"], input[placeholder*="Căuta"], input[placeholder*="search"]');
  log('S1', 'Search bar vizibil', hasSearch ? 'PASS' : 'WARN', '');
  
  // Ctrl+K shortcut hint
  const pageText = await page.locator('body').textContent() || '';
  const hasCtrlK = /Ctrl\+K|⌘K/i.test(pageText);
  log('S2', 'Hint Ctrl+K', hasCtrlK ? 'PASS' : 'WARN', '');
  
  // Buton Upload (+)
  const hasUpload = await elementExists(page, 'button:has-text("+"), [class*="upload"], button[aria-label*="upload"], button[aria-label*="add"]');
  log('U1', 'Buton upload (+)', hasUpload ? 'PASS' : 'WARN', '');
  
  // Breadcrumb
  const hasBreadcrumb = /Program.*>.*Masura.*>.*Sesiune|Program.*›.*Ghiduri/i.test(pageText);
  log('B1', 'Breadcrumb navigare', hasBreadcrumb ? 'PASS' : 'WARN', '');
  
  await screenshot(page, '06_search_upload');
}

async function auditAPIResponses(page: Page) {
  console.log('\n══════ FAZA 8: API RESPONSES ══════\n');
  
  // Verifică API-ul direct — ce returnează pentru documente
  try {
    const response = await page.evaluate(async (baseUrl) => {
      try {
        const res = await fetch(`${baseUrl}/api/documents`, { credentials: 'include' });
        if (!res.ok) return { status: res.status, error: res.statusText };
        const data = await res.json();
        return {
          status: res.status,
          count: Array.isArray(data) ? data.length : (data.documents?.length || 'unknown'),
          sampleKeys: Array.isArray(data) && data[0] ? Object.keys(data[0]) : 
                      (data.documents?.[0] ? Object.keys(data.documents[0]) : []),
        };
      } catch (e) {
        return { error: String(e) };
      }
    }, CONFIG.baseUrl);
    
    log('A1', 'API GET /api/documents', response.status === 200 ? 'PASS' : 'WARN',
      `Status: ${response.status}, Count: ${response.count}, Keys: ${response.sampleKeys?.join(', ')}`);
    
    // Verifică câmpuri critice în API response
    const keys = response.sampleKeys || [];
    const criticalFields = ['generationMode', 'completenessReport', 'processingResult', 'tags'];
    for (const field of criticalFields) {
      log(`A2_${field}`, `API returnează "${field}"`, keys.includes(field) ? 'PASS' : 'FAIL',
        keys.includes(field) ? 'Câmp prezent în response' : 'LIPSĂ din API response');
    }
  } catch (e) {
    log('A1', 'API GET /api/documents', 'FAIL', `${e}`);
  }
}

// ═══════════════════════════════════════════════════════════
// GENERARE RAPORT
// ═══════════════════════════════════════════════════════════

function generateReport() {
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const warn = results.filter(r => r.status === 'WARN').length;
  const skip = results.filter(r => r.status === 'SKIP').length;
  const total = results.length;
  
  let report = `# RAPORT AUDIT VIZUAL — Pagina Documente
## DosarFonduri v2 · ${new Date().toISOString().split('T')[0]}

### Sumar: ${pass}✅ ${fail}❌ ${warn}⚠️ ${skip}⏭️ din ${total} verificări

---

| ID | Descriere | Status | Detalii |
|----|-----------|--------|---------|
`;
  
  for (const r of results) {
    const icon = { PASS: '✅', FAIL: '❌', WARN: '⚠️', SKIP: '⏭️' }[r.status];
    report += `| ${r.id} | ${r.description} | ${icon} ${r.status} | ${r.details} |\n`;
  }
  
  report += `\n---\n\n### PROBLEME CRITICE (❌ FAIL)\n\n`;
  const failures = results.filter(r => r.status === 'FAIL');
  if (failures.length === 0) {
    report += 'Nicio problemă critică detectată.\n';
  } else {
    for (const f of failures) {
      report += `- **[${f.id}] ${f.description}**: ${f.details}\n`;
    }
  }
  
  report += `\n### ATENȚIONĂRI (⚠️ WARN)\n\n`;
  const warnings = results.filter(r => r.status === 'WARN');
  for (const w of warnings) {
    report += `- [${w.id}] ${w.description}: ${w.details}\n`;
  }
  
  report += `\n---\n\nScreenshots salvate în: \`${CONFIG.screenshotDir}/\`\n`;
  
  const reportPath = path.join(CONFIG.screenshotDir, 'RAPORT_AUDIT.md');
  fs.writeFileSync(reportPath, report, 'utf-8');
  console.log(`\n📋 Raport salvat: ${reportPath}`);
  
  return report;
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

async function main() {
  // Setup
  fs.mkdirSync(CONFIG.screenshotDir, { recursive: true });
  
  console.log('🔍 AUDIT VIZUAL — Pagina Documente DosarFonduri v2');
  console.log(`📍 URL: ${CONFIG.baseUrl}`);
  console.log('═'.repeat(60));
  
  let browser: Browser | null = null;
  
  try {
    browser = await chromium.launch({ 
      headless: false,  // VIZIBIL — Claude Code poate vedea
      slowMo: 300       // Încetinit pentru vizibilitate
    });
    
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'ro-RO',
    });
    
    const page = await context.newPage();
    page.setDefaultTimeout(CONFIG.timeout);
    
    // Rulează fazele de audit
    await auditLogin(page);
    await auditNavigateToDocuments(page);
    await auditTreeSidebar(page);
    await auditDocumentCards(page);
    await auditExpandDetails(page);
    await auditCardActions(page);
    await auditHeaderStats(page);
    await auditSearchAndUpload(page);
    await auditAPIResponses(page);
    
    // Screenshot final full page
    await page.screenshot({ 
      path: path.join(CONFIG.screenshotDir, '99_final_state.png'), 
      fullPage: true 
    });
    
  } catch (e) {
    console.error('❌ Eroare fatală:', e);
  } finally {
    // Generează raport ÎNAINTE de a închide browserul
    const report = generateReport();
    console.log('\n' + report);
    
    if (browser) {
      // Lasă browserul deschis 5 secunde pentru inspecție vizuală
      console.log('\n⏳ Browserul rămâne deschis 5 secunde pentru inspecție...');
      await new Promise(r => setTimeout(r, 5000));
      await browser.close();
    }
  }
}

main().catch(console.error);
```

---

# PARTEA 3 — PROMPT PENTRU CLAUDE CODE

Copiază acest bloc și dă-l lui Claude Code:

```
Citește fișierul AUDIT_VISUAL_DOCUMENTS.md din rădăcina proiectului.

TASK 1 — Instalează dependențele pentru scriptul de audit:
  npm install playwright
  npx playwright install chromium

TASK 2 — Copiază scriptul TypeScript din secțiunea "PARTEA 2" 
  în scripts/audit-visual-documents.ts

TASK 3 — Actualizează CONFIG din script:
  - baseUrl = URL-ul aplicației de pe Railway (dosar-fonduri.com sau ce URL ai)
  - email/password = credențialele de test

TASK 4 — Rulează scriptul:
  npx tsx scripts/audit-visual-documents.ts

TASK 5 — Citește raportul generat din audit-screenshots/RAPORT_AUDIT.md
  și arată-mi rezultatele.

IMPORTANT: Nu modifica nimic din aplicație în acest pas.
Doar rulează auditul și arată-mi ce a găsit.
Un singur task pe rând. Build check nu e necesar — e doar un script de test.
```

---

# PARTEA 4 — CE TREBUIE FIXAT DUPĂ AUDIT

Pe baza cross-check-ului de mai sus, fix-urile confirmate ca necesare:

## Fix 1: Adaugă badge generationMode pe card template
```
Fișier: componenta DocumentCard (sau echivalent)
Adaugă: {doc.generationMode && <Badge>{doc.generationMode}</Badge>}
Condiție: doar pe documente cu type === 'template'
```

## Fix 2: Adaugă buton "Deschide Template Viewer"
```
Fișier: componenta DocumentCard actions
Adaugă: <Link href={`/documents/template/${doc.id}`}>Deschide Template Viewer</Link>
Condiție: doar pe documente cu type === 'template'
```

## Fix 3: Adaugă taguri pe carduri
```
Fișier: componenta DocumentCard
Verifică: API returnează tags/metadata? Dacă da, afișează.
Dacă nu: extrage din processingResult (program, masura, submăsura).
```

## Fix 4: Afișează completenessReport
```
Fișier: componenta expand detalii ghid
Adaugă: secțiune "Acoperire" cu categoriesFound/Missing din completenessReport
```

## Fix 5: Adaugă total punctaj pe tab Criterii
```
Fișier: componenta ScoringCriteria sau echivalent
Adaugă: footer row cu suma maxPoints per componentă
```

## Fix 6: Nr. elemente pe card template
```
Fișier: componenta DocumentCard
Adaugă: {doc.elementsCount && <span>{doc.elementsCount} elemente</span>}
```

---

# PARTEA 5 — TEMPLATE PDF: CEREREA DE FINANȚARE

## 5.1 Contextul documentului

Cererea de Finanțare (Anexa 1) + Anexa B + Anexa C sunt **PDF-uri inteligente** (AcroForm/XFA) —
formulare AFIR cu câmpuri de input, checkboxuri, zone de semnătură, tabele cu celule editabile.
NU sunt DOCX cu `{{placeholder}}`. Necesită un flow complet diferit de procesare.

Câmpuri obligatorii definite de AFIR (din ghidul solicitantului, cap. IV):
- CNP/CUI solicitant
- Statut juridic solicitant
- Date identificare reprezentant legal (BI/CI serie, număr, dată eliberare/valabilitate)
- Email reprezentant legal
- Amplasare proiect: Regiune, Județ
- Obiectiv investiție: Județ, Localitate, Oraș/Comună, Sat

---

## 5.2 Flow de procesare template PDF — Backend

```
Upload PDF (Cerere Finanțare / Anexa B / Anexa C)
     │
     ├─── PARALEL (Promise.all) ──────────────────────────────┐
     │                                                         │
     │  [1] XFA/AcroForm extraction (LOCAL)                   │
     │      PyMuPDF → extrage form fields din                 │
     │      structura PDF: nume câmp, tip, pagină,            │
     │      opțiuni (pentru dropdowns/checkboxes)              │
     │      Cost: $0, Timp: <200ms                            │
     │                                                         │
     │  [2] Claude Vision per pagină (AI)                     │
     │      Render 200DPI → Claude Haiku Vision               │
     │      Detectează: checkboxuri, căsuțe goale,            │
     │      zone semnătură, celule tabel,                     │
     │      câmpuri invizibile în text                        │
     │      Cost: ~$0.01/pag, Timp: ~2-3s/pag                │
     │                                                         │
     └─────────────────────────────────────────────────────────┘
                          │
                          ▼
              crossCheckFields()
              ├── Both (XFA + Vision) → confidence boost, validated: true
              ├── XFA-only → păstrat, confidence 0.85, needs review
              └── Vision-only → adăugat, confidence 0.9x (câmpuri XFA invizibile în text)
                          │
                          ▼
              Salvare în DB:
              ├── template_elements (per câmp: key, label, fieldType, pageNum,
              │                      coordonate %, vizual_type, validation_source)
              ├── template_placeholder_mapping (link element → element_definition)
              └── documents (status: 'processed', generationMode: 'FILL')
                          │
                          ▼
              Auto-map fuzzy → element_definitions
              (placeholderKey → elementDefId)
              Coordonatele vizuale se păstrează →
              Neemia știe UNDE să scrie în PDF, nu doar CE
```

### Verificări necesare per pas:

| # | Pas | Ce verificăm | Status | Note |
|---|-----|-------------|--------|------|
| P1 | XFA extraction | PyMuPDF `get_form_textfields()` + `get_widgets()` funcționează pe Cerere Finanțare | ⚠️ | PDF-urile AFIR pot fi XFA pur (nu AcroForm) — verifică dacă PyMuPDF le suportă |
| P2 | Vision per pagină | Se face render 200DPI + Claude Vision pe fiecare pagină | ⚠️ | Verifică: rate limit, cost per cerere (~62 pagini × $0.01 = ~$0.62) |
| P3 | crossCheckFields() | Merge logic: XFA∩Vision → validated, XFA\Vision → review, Vision\XFA → adăugat | ⚠️ | Funcția există? E implementată complet? |
| P4 | Coordonate câmpuri | Fiecare câmp are coordonate % (x, y, width, height) pe pagină | ⚠️ | Critice pentru Neemia — fără ele, nu poate completa PDF-ul |
| P5 | generationMode = FILL | Setat automat la procesare | ⚠️ | |
| P6 | Auto-map → elementDefs | Fuzzy match placeholder → elementDefinition din ghid | ❌ | Depinde de `template_placeholder_mapping` (tabel lipsă!) |
| P7 | SSE progress | Frontend primește live: "Procesare pagina 15/62..." | ⚠️ | |

### ERORI CRITICE specifice PDF:

> **E1: XFA vs AcroForm** — PDF-urile AFIR din 2024 sunt adesea XFA (XML Forms Architecture),
> nu AcroForm standard. PyMuPDF suportă AcroForm dar **XFA parțial**.
> Dacă PyMuPDF returnează 0 câmpuri pe un PDF AFIR, trebuie fallback:
> `pikepdf` sau `pdfrw` sau parsare XML din XFA stream.
>
> **E2: Coordonate relative** — Dacă Vision detectează un câmp dar coordonatele
> sunt absolute (pixeli), trebuie conversie la procente relative la dimensiunea paginii.
> Altfel Neemia scrie în locul greșit dacă PDF-ul e rescalat.
>
> **E3: Cererea de Finanțare AFIR are ~60+ pagini** — Vision pe toate paginile
> e costisitor (~$0.62) și lent (~2-3 min). Trebuie strategie:
> - Rulează XFA extraction pe TOATE paginile (gratuit, instant)
> - Rulează Vision DOAR pe paginile unde XFA a găsit <3 câmpuri
> - Sau: Vision doar pe primele N pagini + pagini detectate ca "form pages"

---

## 5.3 Afișare Template PDF — Frontend

### 5.3.1 Pe card în Lista Documente

| # | Ce trebuie afișat | Implementat? | Note |
|---|------------------|-------------|------|
| PF1 | Badge "PDF inteligent" sau "Formular AFIR" | ❌ LIPSĂ | Diferențiere vizuală față de PDF ghid obișnuit |
| PF2 | Nr. câmpuri detectate | ❌ LIPSĂ | Ex: "87 câmpuri detectate" |
| PF3 | Nr. câmpuri validate (XFA+Vision) vs. review | ❌ LIPSĂ | Ex: "72 validate · 15 necesită review" |
| PF4 | generationMode: "FILL" | ❌ LIPSĂ | (problemă generală T7) |
| PF5 | Status procesare per pagină | ❌ LIPSĂ | Ar fi ideal: mini progress bar cu pagini procesate |

### 5.3.2 Pe expand Detalii

| # | Ce trebuie afișat | Implementat? | Note |
|---|------------------|-------------|------|
| PF6 | Lista câmpuri per pagină (collapse per pagină) | ⚠️ NEVERIFICAT | Similar cu template DOCX dar cu date XFA |
| PF7 | Per câmp: key, label, fieldType, validation_source | ⚠️ NEVERIFICAT | |
| PF8 | Per câmp: badge "XFA+Vision" / "XFA only" / "Vision only" | ❌ LIPSĂ | Utilizatorul trebuie să vadă sursa detecției |
| PF9 | Per câmp: coordonate vizuale (preview poziție pe pagină) | ❌ LIPSĂ | Ar ajuta enormde consultantul la review |
| PF10 | Câmpuri cu confidence < 0.85 → highlighted | ⚠️ | |

### 5.3.3 Template Viewer (`/documents/template/[id]`)

| # | Ce trebuie afișat | Implementat? | Note |
|---|------------------|-------------|------|
| PF11 | Preview PDF pagină cu pagină | ⚠️ NEVERIFICAT | Din prototype JSX: preview cu page navigation |
| PF12 | Overlay câmpuri detectate pe preview PDF | ❌ LIPSĂ PROBABIL | Ar trebui: rectangles colorate pe pozițiile câmpurilor |
| PF13 | Click pe câmp → detalii (key, label, type, sursa) | ❌ | |
| PF14 | Toggle "Arată câmpuri XFA" / "Arată câmpuri Vision" | ❌ | Debug util |
| PF15 | Buton "Validează câmp" per câmp nevalidat | ⚠️ | |
| PF16 | Buton "Adaugă câmp manual" | ❌ | Pentru câmpuri ratate de AI |
| PF17 | Navigare: link din lista Documente → Template Viewer | ❌ LIPSĂ | (problemă generală T15) |

---

## 5.4 Generare document completat (Neemia FILL mode)

### Flow: Proiect → Neemia → PDF completat

```
Consultant selectează template (Cerere Finanțare) din proiect
     │
     ▼
Neemia buildElementsMap()
├── Ia project_elements (completate de Solomon/manual)
├── Ia template_placeholder_mapping (link element → placeholder)
├── Construiește map: { placeholder_key: valoare_completată }
└── Identifică lipsuri: care placeholders nu au valoare
     │
     ▼
Frontend afișează:
├── Completare %: "45/87 câmpuri completate (52%)"
├── Lista câmpuri lipsă cu link la Solomon
├── Warning: "Lipsesc câmpuri obligatorii: CUI, CNP rep. legal..."
└── Buton "Generează document" (disabled dacă < threshold)
     │
     ▼ (click Generează)
Neemia completează PDF:
├── FILL mode: inserare valori pe coordonatele din template_elements
├── Per pagină: SSE progress "Completare pagina 15/62..."
├── Câmpuri necompletate: marcare vizuală (highlight roșu / "[LIPSĂ]")
├── Formatare RO: 125.500,00 RON (nu 125,500.00)
└── Output: PDF completat → R2 → download link
     │
     ▼
Frontend post-generare:
├── Preview document generat
├── Buton Descarcă PDF
├── Diferențe: highlight ce a fost completat vs. original
└── Buton "Regenerează" dacă datele s-au schimbat
```

### Verificări Neemia FILL:

| # | Ce verificăm | Status | Note |
|---|-------------|--------|------|
| N1 | buildElementsMap() — mapare corectă | ⚠️ | `template_placeholder_mapping` trebuie să existe |
| N2 | Completare % calculat corect | ⚠️ | filledCount / totalCount din mapping |
| N3 | Lista câmpuri lipsă afișată | ⚠️ | |
| N4 | PDF fill: valori inserate la coordonate corecte | ⚠️ | PyMuPDF `page.insert_text()` sau `fill_textfield()` |
| N5 | Formatare numerică RO | ⚠️ | FIX W5.1: 125.500,00 nu 125,500.00 |
| N6 | Câmpuri necompletate marcate | ⚠️ | |
| N7 | SSE progress per pagină | ⚠️ | |
| N8 | Download PDF generat funcțional | ⚠️ | |
| N9 | Checkboxuri completate corect | ⚠️ | Bifă X sau ✓ pe coordonatele detectate |
| N10 | Tabelele din cerere completate | ⚠️ | Ex: tabelul buget, tabelul indicatori |

---

## 5.5 Câmpuri specifice Cererea de Finanțare sM 4.1

Aceste câmpuri TREBUIE detectate și mapate. Checklist de verificare:

### Secțiunea A — Date identificare solicitant

| # | Câmp | elementKey așteptat | Sursa datelor | Obligatoriu |
|---|------|-------------------|---------------|-------------|
| CF1 | Denumire solicitant | `applicant.name` | ONRC / CI | DA |
| CF2 | CUI/CIF | `applicant.cui` | ONRC | DA |
| CF3 | Nr. Reg. Comerțului | `applicant.nrRegCom` | ONRC | DA |
| CF4 | Cod CAEN principal | `applicant.caenPrincipal` | ONRC | DA |
| CF5 | Cod CAEN autorizat proiect | `applicant.caenProiect` | ONRC / manual | DA |
| CF6 | Statut juridic | `applicant.statutJuridic` | ONRC | DA |
| CF7 | Adresă sediu social | `applicant.adresa` | ONRC | DA |
| CF8 | Cont bancar IBAN | `applicant.iban` | Manual | DA |
| CF9 | Banca | `applicant.banca` | Manual | DA |

### Secțiunea B — Reprezentant legal

| # | Câmp | elementKey | Sursa | Obligatoriu |
|---|------|-----------|-------|-------------|
| CF10 | Nume prenume | `representative.name` | CI / ONRC | DA |
| CF11 | Funcția | `representative.functie` | ONRC | DA |
| CF12 | CNP | `representative.cnp` | CI (criptat!) | DA |
| CF13 | BI/CI serie + număr | `representative.actIdentitate` | CI | DA |
| CF14 | Data eliberării CI | `representative.dataEliberare` | CI | DA |
| CF15 | Data valabilității CI | `representative.dataValabilitate` | CI | DA |
| CF16 | Domiciliu | `representative.domiciliu` | CI | DA |
| CF17 | Email | `representative.email` | Manual | DA |
| CF18 | Telefon | `representative.telefon` | Manual | DA |

### Secțiunea C — Proiect

| # | Câmp | elementKey | Sursa | Obligatoriu |
|---|------|-----------|-------|-------------|
| CF19 | Titlul proiectului | `project.title` | Manual / Solomon | DA |
| CF20 | Descriere scurtă | `project.description` | Solomon / Neemia COMPOSE | DA |
| CF21 | Obiectiv general | `project.objectiveGeneral` | Solomon / Neemia | DA |
| CF22 | Obiective specifice | `project.objectivesSpecific` | Solomon / Neemia | DA |
| CF23 | Amplasare: Regiune | `location.regiune` | Manual / ONRC | DA |
| CF24 | Amplasare: Județ | `location.judet` | Manual / ONRC | DA |
| CF25 | Amplasare: Localitate | `location.localitate` | Manual | DA |
| CF26 | Componenta (I/II/III) | `project.componenta` | Manual | DA |
| CF27 | Valoare totală investiție | `financial.valoareTotala` | Buget / manual | DA |
| CF28 | Valoare eligibilă | `financial.valoareEligibila` | Calculat | DA |
| CF29 | Contribuție proprie % | `financial.contributieProprie` | Calculat din reguli | DA |
| CF30 | Finanțare nerambursabilă | `financial.finantareNerambursabila` | Calculat | DA |
| CF31 | Avans solicitat (Da/Nu) | `financial.avansSolicitat` | Manual | DA |
| CF32 | Durata implementare (luni) | `project.durataImplementare` | Manual | DA |
| CF33 | Punctaj estimat (pre-scoring) | `scoring.punctajEstimat` | Calculat din scoring_criteria | DA |
| CF34 | Dimensiune economică SO | `farm.dimensiuneSO` | Calculat din suprafață + culturi | DA |

### Secțiunea D — Plan financiar (tabel)

| # | Câmp | elementKey | Note |
|---|------|-----------|------|
| CF35 | Ajutor public nerambursabil | `financial.ajutorPublic` | Tabel cu rânduri |
| CF36 | Cofinanțare privată | `financial.cofinantare` | |
| CF37 | Autofinanțare | `financial.autofinantare` | |
| CF38 | Împrumuturi | `financial.imprumuturi` | |
| CF39 | Total proiect | `financial.totalProiect` | Suma verificabilă |
| CF40 | Procent contribuție publică | `financial.procentContributie` | Verificat vs. reguli (max 50-90%) |

### Secțiunea E — Lista documente anexate

| # | Câmp | Note |
|---|------|------|
| CF41 | Checkboxuri per document | Bifate automat dacă documentul e uploadat în proiect |
| CF42 | Nr. pagini per document | Completat automat din metadata document |

---

## 5.6 Script audit extins — Teste Playwright pentru Template PDF

Adaugă aceste teste la scriptul existent din Partea 2:

```typescript
// ═══════════════════════════════════════════════════════════
// FAZA 9: TEMPLATE PDF PROCESSING
// ═══════════════════════════════════════════════════════════

async function auditTemplatePDF(page: Page) {
  console.log('\n══════ FAZA 9: TEMPLATE PDF (Cerere Finanțare) ══════\n');
  
  // 9.1 Navigare la Template Viewer dacă există
  // Caută un document PDF template (Cerere Finanțare / Anexa B / Anexa C)
  const templatePDFs = page.locator(':text("Cerere"), :text("Anexa_B"), :text("Anexa_C"), :text("CEREREA")');
  
  if (await templatePDFs.count() > 0) {
    log('PF0', 'Template PDF detectat în listă', 'PASS', `${await templatePDFs.count()} template-uri PDF`);
    
    // Click pe primul
    await templatePDFs.first().click();
    await page.waitForTimeout(2000);
    await screenshot(page, '09_template_pdf_card');
    
    const cardText = await page.locator('body').textContent() || '';
    
    // PF1: Badge "PDF inteligent"
    const hasPDFBadge = /PDF inteligent|Formular|AcroForm|XFA/i.test(cardText);
    log('PF1', 'Badge "PDF inteligent"', hasPDFBadge ? 'PASS' : 'FAIL',
      hasPDFBadge ? 'Badge găsit' : 'LIPSĂ — nu se diferențiază de PDF ghid');
    
    // PF2: Nr. câmpuri detectate
    const hasFieldCount = /\d+\s*câmpuri|\d+\s*fields|\d+\s*elemente/i.test(cardText);
    log('PF2', 'Nr. câmpuri detectate pe card', hasFieldCount ? 'PASS' : 'FAIL',
      hasFieldCount ? 'Count vizibil' : 'LIPSĂ');
    
    // PF4: generationMode FILL
    const hasFillMode = /FILL/i.test(cardText);
    log('PF4', 'Badge generationMode FILL', hasFillMode ? 'PASS' : 'FAIL', '');
    
    // PF8: Sursa detecție (XFA+Vision / XFA only / Vision only)
    const hasDetectionSource = /XFA|Vision|text\+visual|visual.only/i.test(cardText);
    log('PF8', 'Badge sursa detecție per câmp', hasDetectionSource ? 'PASS' : 'FAIL',
      hasDetectionSource ? 'Sursa vizibilă' : 'LIPSĂ — utilizatorul nu știe de unde vine câmpul');
    
  } else {
    log('PF0', 'Template PDF detectat', 'WARN', 
      'Niciun template PDF (Cerere/Anexa) găsit — upload-ează Anexa_1_CEREREA_De_FINANTARE');
  }
  
  // 9.2 Verificare Template Viewer page
  try {
    // Caută link la template viewer
    const viewerLinks = page.locator('a[href*="/template/"], button:has-text("Template Viewer"), button:has-text("Deschide")');
    
    if (await viewerLinks.count() > 0) {
      await viewerLinks.first().click();
      await page.waitForTimeout(3000);
      await screenshot(page, '09b_template_viewer');
      
      log('PF17', 'Navigare la Template Viewer', 'PASS', `URL: ${page.url()}`);
      
      const viewerText = await page.locator('body').textContent() || '';
      
      // PF11: Preview PDF
      const hasPreview = await elementExists(page, 'canvas, iframe[src*="pdf"], [class*="preview"], [class*="page"]');
      log('PF11', 'Preview PDF în Template Viewer', hasPreview ? 'PASS' : 'WARN', '');
      
      // PF12: Overlay câmpuri
      const hasOverlay = await elementExists(page, '[class*="field-overlay"], [class*="highlight"], [class*="annotation"]');
      log('PF12', 'Overlay câmpuri pe preview', hasOverlay ? 'PASS' : 'FAIL',
        hasOverlay ? 'Câmpuri vizibile pe preview' : 'LIPSĂ — câmpurile nu sunt vizualizate pe document');
      
      // PF15: Buton validare câmp
      const hasValidateBtn = /Validează|Validate|Confirmă/i.test(viewerText);
      log('PF15', 'Buton validare câmp', hasValidateBtn ? 'PASS' : 'WARN', '');
      
      // PF16: Buton adaugă câmp manual
      const hasAddField = /Adaugă câmp|Add field|Câmp manual/i.test(viewerText);
      log('PF16', 'Buton "Adaugă câmp manual"', hasAddField ? 'PASS' : 'WARN', '');
      
    } else {
      log('PF17', 'Link la Template Viewer', 'FAIL', 'LIPSĂ — niciun link de navigare');
    }
  } catch (e) {
    log('PF17', 'Template Viewer', 'FAIL', `${e}`);
  }
}

// 9.3 Verificare API — câmpuri specifice Cerere Finanțare
async function auditCerereFields(page: Page) {
  console.log('\n══════ FAZA 10: CÂMPURI CERERE FINANȚARE ══════\n');
  
  // Verifică dacă API-ul returnează câmpurile așteptate
  try {
    const response = await page.evaluate(async (baseUrl) => {
      // Găsește documentul Cerere Finanțare
      const docsRes = await fetch(`${baseUrl}/api/documents`, { credentials: 'include' });
      const docs = await docsRes.json();
      const docList = Array.isArray(docs) ? docs : (docs.documents || []);
      
      const cerere = docList.find((d: any) => 
        /cerere|cererea|FINANTARE|anexa.?[bc]/i.test(d.name || d.fileName || '')
      );
      
      if (!cerere) return { found: false };
      
      // Ia elementele template-ului
      const elemRes = await fetch(`${baseUrl}/api/documents/${cerere.id}/elements`, { credentials: 'include' });
      if (!elemRes.ok) return { found: true, elementsError: elemRes.status };
      
      const elements = await elemRes.json();
      const elemList = Array.isArray(elements) ? elements : (elements.elements || []);
      
      return {
        found: true,
        docId: cerere.id,
        docName: cerere.name || cerere.fileName,
        generationMode: cerere.generationMode,
        elementsCount: elemList.length,
        sampleElements: elemList.slice(0, 5).map((e: any) => ({
          key: e.key || e.elementKey,
          label: e.label || e.displayName,
          type: e.fieldType || e.type,
          source: e.validationSource || e.source,
          hasCoordinates: !!(e.coordinates || e.x || e.position),
        })),
        // Check câmpuri critice
        hasCUI: elemList.some((e: any) => /cui|cif/i.test(e.key || e.elementKey || '')),
        hasCNP: elemList.some((e: any) => /cnp/i.test(e.key || e.elementKey || '')),
        hasTitlu: elemList.some((e: any) => /titlu.*proiect|project.*title/i.test(e.key || e.elementKey || '')),
        hasValoare: elemList.some((e: any) => /valoare.*total|total.*value/i.test(e.key || e.elementKey || '')),
        hasAmplasare: elemList.some((e: any) => /judet|regiune|localitate/i.test(e.key || e.elementKey || '')),
      };
    }, CONFIG.baseUrl);
    
    if (!response.found) {
      log('CF0', 'Cerere Finanțare în DB', 'WARN', 'Nu există document Cerere Finanțare uploadat');
      return;
    }
    
    log('CF0', 'Cerere Finanțare găsită', 'PASS', 
      `${response.docName} · ${response.elementsCount} elemente · mode: ${response.generationMode}`);
    
    // Verifică câmpuri critice
    log('CF2', 'Câmp CUI/CIF detectat', response.hasCUI ? 'PASS' : 'FAIL', '');
    log('CF12', 'Câmp CNP detectat', response.hasCNP ? 'PASS' : 'FAIL', '');
    log('CF19', 'Câmp titlu proiect detectat', response.hasTitlu ? 'PASS' : 'FAIL', '');
    log('CF27', 'Câmp valoare totală detectat', response.hasValoare ? 'PASS' : 'FAIL', '');
    log('CF23', 'Câmpuri amplasare detectate', response.hasAmplasare ? 'PASS' : 'FAIL', '');
    
    // Verifică coordonate
    const withCoords = response.sampleElements?.filter((e: any) => e.hasCoordinates).length || 0;
    const total = response.sampleElements?.length || 0;
    log('PF_COORDS', 'Câmpuri cu coordonate (pt. Neemia FILL)', 
      withCoords > 0 ? 'PASS' : 'FAIL',
      `${withCoords}/${total} din sample au coordonate`);
    
    // Verifică sursa detecție
    const sources = response.sampleElements?.map((e: any) => e.source).filter(Boolean) || [];
    log('PF_SOURCE', 'Sursa detecție salvată', sources.length > 0 ? 'PASS' : 'WARN',
      sources.length > 0 ? `Surse: ${[...new Set(sources)].join(', ')}` : 'Nicio sursă detecție salvată');
    
  } catch (e) {
    log('CF0', 'API check Cerere Finanțare', 'FAIL', `${e}`);
  }
}
```

### Integrare în main():

Adaugă aceste linii în funcția `main()` din script, după `auditAPIResponses`:

```typescript
    await auditTemplatePDF(page);
    await auditCerereFields(page);
```

---

## 5.7 Fix-uri specifice Template PDF

### Fix 7: Badge "PDF inteligent" pe card
```
Fișier: DocumentCard component
Condiție: doc.mimeType === 'application/pdf' && doc.documentType === 'template'
Afișare: <Badge variant="outline" className="text-purple-600">PDF inteligent</Badge>
```

### Fix 8: Overlay câmpuri pe Template Viewer
```
Fișier: /documents/template/[id] page component
Necesită: coordonate % din template_elements
Implementare: 
  - Render PDF pagina cu react-pdf sau iframe
  - Overlay div-uri absolute pe coordonatele fiecărui câmp
  - Culoare: verde=validated, galben=review, roșu=missing
  - Click pe overlay → panel lateral cu detalii câmp
```

### Fix 9: Sursa detecție vizibilă per câmp
```
Fișier: ElementsList component (expand detalii)
Per câmp adaugă: 
  {elem.validationSource === 'text+visual' && <Badge className="bg-green-100">XFA+Vision</Badge>}
  {elem.validationSource === 'text_only' && <Badge className="bg-yellow-100">XFA only</Badge>}
  {elem.validationSource === 'visual_only' && <Badge className="bg-blue-100">Vision only</Badge>}
```

### Fix 10: Completare % pe cardul template PDF
```
Fișier: DocumentCard (pentru template-uri asociate unui proiect)
Query: GET /api/projects/:id/templates/:templateId/completion
Afișare: progress bar + "45/87 câmpuri (52%)"
Doar vizibil când template-ul e asociat unui proiect activ.
```

### Fix 11: XFA fallback dacă PyMuPDF returnează 0 câmpuri
```
Fișier: ai-worker/processTemplate.py (sau .ts)
Adaugă:
  fields = extract_acroform(pdf_path)  # PyMuPDF
  if len(fields) == 0:
    fields = extract_xfa(pdf_path)  # pikepdf XFA parser
  if len(fields) == 0:
    # Fallback complet pe Vision — toate paginile
    fields = await vision_extract_all_pages(pdf_path)
```

---

# PARTEA 6 — TRATAMENTUL TABELELOR

## 6.1 Taxonomia tabelelor din documentele AFIR

Documentele AFIR conțin 5 tipuri fundamentale de tabele, fiecare cu tratament diferit:

```
┌──────────────────────────────────────────────────────────────┐
│                    TABELE ÎN DOCUMENTE AFIR                  │
├──────────┬──────────────────────┬────────────┬───────────────┤
│ Tip      │ Exemple              │ Rânduri    │ Cine completa │
├──────────┼──────────────────────┼────────────┼───────────────┤
│ STATIC   │ Plan Financiar       │ Fixe       │ Neemia FILL   │
│          │ Buget Indicativ      │ (predefinit│               │
│          │ Plan Financiar Agro  │  de AFIR)  │               │
├──────────┼──────────────────────┼────────────┼───────────────┤
│ DINAMIC  │ Plan de cultură      │ Variable   │ Neemia FILL   │
│          │ Lista echipamente    │ (depind de │ + row insert  │
│          │ Deviz pe obiect      │  proiect)  │               │
├──────────┼──────────────────────┼────────────┼───────────────┤
│ FORMULĂ  │ Matrice viabilitate  │ Fixe       │ Neemia CALC   │
│          │ Indicatori financiari│ (cu formule│ + FILL        │
│          │ Rata îndatorării     │  Excel)    │               │
├──────────┼──────────────────────┼────────────┼───────────────┤
│ CHECKBOX │ Lista documente (E)  │ Fixe       │ Neemia AUTO   │
│          │ Criterii eligibilit. │            │ (din metadata)│
│          │ Condiții artificiale │            │               │
├──────────┼──────────────────────┼────────────┼───────────────┤
│ REFERINȚĂ│ Anexa 3 (putere/ha)  │ Fixe       │ READ-ONLY     │
│          │ Anexa 4 (UAT ANC)   │            │ (consultare)  │
│          │ Praguri calitate     │            │               │
└──────────┴──────────────────────┴────────────┴───────────────┘
```

---

## 6.2 Detectare tabele — Backend flow

### Problema principală:
Un câmp simplu (text input) = 1 element cu 1 coordonată.
Un tabel = N×M celule, fiecare cu coordonată proprie, plus relații între ele (header↔celulă, formulă).
Vision vede tabelul ca o imagine; XFA îl vede ca form fields individuale fără legătură între ele.
**Nimeni nu detectează automat structura tabelului** (ce e header, ce e rând, ce e formulă).

### Soluția: 3 straturi de detectare

```
STRATUL 1: Detectare fizică (LOCAL + VISION)
─────────────────────────────────────────────
  XFA extraction → form fields cu prefix comun
    ex: "budget_cap4_elig", "budget_cap4_neelig", "budget_cap4_total"
  Vision per pagină → detectează grid vizual (linii, celule)
    Output: boundingBox per celulă, tip (header/data/empty)
  
  Rezultat: listă de celule cu coordonate, fără structură

STRATUL 2: Reconstructie structură (AI — Claude Sonnet)
─────────────────────────────────────────────────────────
  Input: lista celulelor + textul paginii + screenshot pagină
  Prompt: "Identifică tabelele din această pagină.
           Per tabel returnează:
           - tableId, tableName, tableType (STATIC/DINAMIC/FORMULA/CHECKBOX)
           - headers: [{col, label, dataType}]
           - rows: [{rowIndex, isFixed, cells: [{col, value, cellType, formula?}]}]
           - formulas: [{cell, expression, dependsOn: [cells]}]"
  
  Model: Claude Sonnet (structurare, nu raționament complex)
  Cost: ~$0.02 per pagină cu tabele
  
  Rezultat: structură tabel completă cu relații

STRATUL 3: Clasificare + mapping (AI — Claude Sonnet)
─────────────────────────────────────────────────────────
  Input: structura tabelului + element_definitions din ghid
  Prompt: "Mapează fiecare celulă completabilă la un elementKey.
           Identifică formulele și dependențele."
  
  Rezultat: template_table_cells cu mapping la projectElements
```

### Schema DB propusă pentru tabele:

```sql
-- Tabel nou: template_tables
CREATE TABLE template_tables (
  id          TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES documents(id),
  table_name  TEXT NOT NULL,          -- "Plan Financiar Producție"
  table_type  TEXT NOT NULL,          -- 'STATIC'|'DINAMIC'|'FORMULA'|'CHECKBOX'|'REFERINTA'
  page_num    INTEGER NOT NULL,
  position    JSONB,                  -- {x%, y%, width%, height%} pe pagină
  headers     JSONB NOT NULL,         -- [{col: 0, label: "Cheltuieli eligibile", dataType: "number"}]
  row_count   INTEGER,               -- NULL pentru DINAMIC (variabil)
  has_formulas BOOLEAN DEFAULT false,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Tabel nou: template_table_cells
CREATE TABLE template_table_cells (
  id              TEXT PRIMARY KEY,
  table_id        TEXT NOT NULL REFERENCES template_tables(id),
  row_index       INTEGER NOT NULL,
  col_index       INTEGER NOT NULL,
  cell_type       TEXT NOT NULL,       -- 'header'|'label'|'input'|'formula'|'checkbox'|'readonly'
  fixed_value     TEXT,                -- Valoare fixă (pentru label/header)
  element_key     TEXT,                -- Link la projectElements (pentru input)
  element_def_id  TEXT,                -- Link la element_definitions
  formula         TEXT,                -- Ex: "=SUM(C2:C5)" sau "row.col1 + row.col2"
  depends_on      TEXT[],              -- IDs celule de care depinde
  data_type       TEXT,                -- 'number'|'text'|'currency'|'percentage'|'boolean'
  format_pattern  TEXT,                -- '#.##0,00'|'0,00%'|'dd.MM.yyyy'
  validation      JSONB,              -- {min, max, required, enum_values}
  position        JSONB,              -- {x%, y%, width%, height%} coordonate celulă
  created_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE(table_id, row_index, col_index)
);
```

---

## 6.3 Tratament per tip de tabel

### TIP 1: STATIC (Plan Financiar, Buget Indicativ)

**Detectare:**
```
Pagina PDF → Vision detectează grid → Sonnet reconstruiește structura
Rezultat exemplu Plan Financiar:
{
  tableName: "Plan Financiar Producție",
  tableType: "STATIC",
  headers: [
    {col: 0, label: "", dataType: "text"},
    {col: 1, label: "Cheltuieli eligibile", dataType: "currency"},
    {col: 2, label: "Cheltuieli neeligibile", dataType: "currency"},
    {col: 3, label: "Total cheltuieli", dataType: "currency"}
  ],
  rows: [
    {rowIndex: 0, cells: [
      {col: 0, cellType: "label", fixedValue: "1. Ajutor public nerambursabil"},
      {col: 1, cellType: "input", elementKey: "financial.ajutorPublic.eligibil"},
      {col: 2, cellType: "input", elementKey: "financial.ajutorPublic.neeligibil"},
      {col: 3, cellType: "formula", formula: "col1 + col2"}
    ]},
    // ... rânduri pentru cofinanțare, autofinanțare, împrumuturi
    {rowIndex: 4, cells: [
      {col: 0, cellType: "label", fixedValue: "3. TOTAL PROIECT"},
      {col: 1, cellType: "formula", formula: "SUM(col1, rows 0..3)"},
      {col: 2, cellType: "formula", formula: "SUM(col2, rows 0..3)"},
      {col: 3, cellType: "formula", formula: "SUM(col3, rows 0..3)"}
    ]}
  ]
}
```

**Completare Neemia:**
- Ia valorile din projectElements (completate de Solomon/manual)
- Inserează în celulele `input` la coordonatele exacte
- Calculează celulele `formula` automat (nu AI — calcul determinist)
- Formatare: `125.500,00` (format RO cu punct mii, virgulă zecimale)

**Afișare frontend:**
- Tabel editabil cu celule colorate: verde=completat, galben=formulă calculată, roșu=lipsă
- Formule vizibile on hover: "= Cheltuieli eligibile + Cheltuieli neeligibile"
- Total calculat live la editare

---

### TIP 2: DINAMIC (Plan de cultură, Lista echipamente)

**Diferența față de STATIC:** Numărul de rânduri depinde de proiect.
Plan de cultură: un fermier are 3 culturi, altul 12.
Lista echipamente: un proiect are 1 tractor, altul are 5 utilaje.

**Detectare:**
```
Sonnet detectează:
{
  tableName: "Plan de cultură implementare",
  tableType: "DINAMIC",
  headers: [
    {col: 0, label: "CULTURA", dataType: "text"},
    {col: 1, label: "SUPRAFATA", dataType: "number"}
  ],
  rowTemplate: {
    cells: [
      {col: 0, cellType: "input", elementKey: "crops[i].name"},
      {col: 1, cellType: "input", elementKey: "crops[i].suprafata"}
    ]
  },
  footerRow: {
    cells: [
      {col: 0, cellType: "label", fixedValue: "Total"},
      {col: 1, cellType: "formula", formula: "SUM(col1, all rows)"}
    ]
  }
}
```

**Completare Neemia:**
- Ia lista din projectElements: `crops = [{name: "Porumb", suprafata: 77.83}, ...]`
- Generează N rânduri pe baza datelor reale
- **Problema PDF:** PDF-urile inteligente AFIR au un număr fix de rânduri goale pre-alocate
  - Dacă proiectul are mai puține culturi → lasă rândurile goale
  - Dacă are mai multe → **trebuie pagini suplimentare** sau compresie
- Calculează totalul automat

**Afișare frontend:**
- Tabel cu buton "+ Adaugă rând"
- Drag-and-drop reordonare rânduri
- Delete per rând
- Total auto-calculat
- Warning dacă nr. rânduri > spațiu disponibil în PDF

---

### TIP 3: FORMULĂ (Matrice viabilitate economico-financiară)

**Cel mai complex.** Matricea din Anexa B are:
- Valoare investiție, Venituri exploatare (An 1-5)
- Rata acoperirii flux numerar (RAFN) >= 1.2
- Rata îndatorării (rI) <= 60%
- VAN >= 0
- Disponibil numerar pozitiv

**Detectare:**
```
Sonnet analizează și extrage formulele:
{
  tableName: "Matrice verificare viabilitate",
  tableType: "FORMULA",
  headers: [
    {col: 0, label: "Nr.crt"},
    {col: 1, label: "Specificație"},
    {col: 2, label: "Limita indicator"},
    {col: 3, label: "UM"},
    {col: 4, label: "Total an 1"}, {col: 5, label: "Total an 2"},
    // ... an 3, 4, 5
    {col: 9, label: "Diferențe"},
    {col: 10, label: "Validare criterii"}
  ],
  rows: [
    {rowIndex: 0, cells: [
      {col: 1, fixedValue: "Valoare investiție (VI)"},
      {col: 2, fixedValue: "N/A"},
      {col: 3, fixedValue: "LEI"},
      {col: 4, cellType: "input", elementKey: "financials.year1.valoareInvestitie"},
      // ... an 2-5
    ]},
    {rowIndex: 7, cells: [
      {col: 1, fixedValue: "RAFN"},
      {col: 2, fixedValue: ">=1,2"},
      {col: 4, cellType: "formula", 
       formula: "financials.year1.fluxNumerar / (financials.year1.PDCTML + financials.year1.RCTML)",
       validation: {min: 1.2}},
      // ...
      {col: 9, cellType: "formula",
       formula: "IF(ABS(calculated - solicitant) < 0.01, 'Nu sunt diferențe', 'DIFERENȚĂ!')"},
      {col: 10, cellType: "formula",
       formula: "IF(value >= 1.2, 'Respectă criteriu', 'NU respectă')"}
    ]}
  ]
}
```

**Completare Neemia:**
1. Ia valorile financiare din projectElements (din bilanțuri, proiecții Solomon)
2. Inserează valorile de bază (venituri, cheltuieli per an)
3. **Calculează toate formulele determinist** — NU AI, ci funcție JavaScript/Python:
   ```python
   def compute_financial_matrix(project_elements):
       for year in range(1, 6):
           vi = get(f"financials.year{year}.valoareInvestitie")
           ve = get(f"financials.year{year}.venituriExploatare")
           ce = get(f"financials.year{year}.cheltuieliExploatare")
           flux = ve - ce
           pdctml = get(f"financials.year{year}.platiDobanzi")
           rctml = get(f"financials.year{year}.rambursariCredite")
           
           rafn = flux / (pdctml + rctml) if (pdctml + rctml) > 0 else float('inf')
           
           if rafn < 1.2:
               warnings.append(f"An {year}: RAFN = {rafn:.2f} < 1.2 — NEELIGIBIL")
   ```
4. Coloana "Diferențe" compară valori calculate vs. valori declarate de solicitant
5. Coloana "Validare" evaluează dacă indicatorii respectă limitele

**Afișare frontend:**
- Tabel read-only cu calcule live
- Celulele cu validare eșuată → roșu + tooltip cu explicație
- Celulele care respectă criteriul → verde
- Buton "Recalculează" dacă datele input se schimbă
- Export ca xlsx pentru verificare manuală

---

### TIP 4: CHECKBOX (Lista documente, Criterii eligibilitate)

**Detectare:**
Vision detectează checkboxuri (căsuțe goale □ sau bifate ☑).
XFA le vede ca form fields de tip checkbox/radio.

```
{
  tableName: "Lista Documente Anexate - Secțiunea E",
  tableType: "CHECKBOX",
  rows: [
    {rowIndex: 0, cells: [
      {col: 0, fixedValue: "1.a) ANEXA C format PDF inteligent"},
      {col: 1, cellType: "checkbox", elementKey: "docs.anexaC.depusa", 
       autoFill: "doc_exists('anexa_c')"},
      {col: 2, cellType: "input", elementKey: "docs.anexaC.nrPagini",
       autoFill: "doc_page_count('anexa_c')"}
    ]},
    // ... pentru fiecare document din lista
  ]
}
```

**Completare Neemia:**
- **Auto-fill din metadata proiect:** dacă documentul e uploadat → bifează
- Nr. pagini: completat automat din `document.pageCount`
- Consultantul poate override manual (uncheck dacă documentul nu e final)

**Afișare frontend:**
- Checklist vizual: ✅ Depus / ❌ Lipsă / ⏳ Draft
- Progress: "8/14 documente depuse"
- Link direct: click pe document → navighează la documentul uploadat

---

### TIP 5: REFERINȚĂ (Anexa 3, Anexa 4)

**NU se completează.** Se stochează în `guide_reference_tables` și se folosesc pentru:
- Solomon consultă Anexa 3 ca să valideze putere tractor vs. suprafață
- Neemia consultă Anexa 4 ca să verifice dacă UAT-ul e în zonă ANC
- Reguli de eligibilitate referă aceste tabele

**Stocare:** Deja definit în `guide_reference_tables` (JSONB).
**Afișare:** Tabel read-only cu search/filter în UI.

---

## 6.4 Afișare tabele — Frontend

### În Template Viewer (preview document)

```
┌─────────────────────────────────────────────────────┐
│  📄 Cerere Finanțare — Pag. 12/62                   │
│                                                      │
│  ┌─── Plan Financiar Producție ──────────────────┐  │
│  │         │ Chelt.elig │ Chelt.neelig │  Total  │  │
│  │─────────│────────────│──────────────│─────────│  │
│  │ 1.Ajut. │ [125.500]  │   [    0  ]  │ 125.500 │  │
│  │ 2.Cofin │ [ 62.750]  │   [    0  ]  │  62.750 │  │
│  │  2.1 aut│ [ 62.750]  │              │  62.750 │  │
│  │  2.2 împ│ [      0]  │              │       0 │  │
│  │ 3.TOTAL │  188.250   │        0     │ 188.250 │  │
│  │ % contr.│   66,67%   │              │         │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  Legendă: [verde]=completat  [roșu]=lipsă            │
│           gri=formulă  albastru=readonly              │
└─────────────────────────────────────────────────────┘
```

### În Proiect → Tab Elemente (când e tabel)

Nu arăta celulele individuale ca o listă plată. Grupează-le vizual ca tabel:

```
┌─── Secțiune: Plan Financiar ─────────────────────────┐
│                                                        │
│  ⚠ 2 din 8 celule necompletate                        │
│                                                        │
│  Tabel interactiv inline (editabil):                  │
│  ┌─────────┬────────────┬──────────────┬─────────┐   │
│  │         │ Elig.(EUR) │ Neelig.(EUR) │  Total  │   │
│  ├─────────┼────────────┼──────────────┼─────────┤   │
│  │ Ajutor  │   125.500  │       0      │ 125.500 │   │
│  │ Cofin.  │    62.750  │       —      │  62.750 │   │
│  │ TOTAL   │   188.250  │       0      │ 188.250 │   │
│  └─────────┴────────────┴──────────────┴─────────┘   │
│                                                        │
│  [Editează în tabel] [Trimite la Solomon pt. completare]│
└────────────────────────────────────────────────────────┘
```

### Reguli de afișare:

| Tip tabel | Editabil în UI? | Modul editare | Calculare |
|-----------|----------------|---------------|-----------|
| STATIC | DA — celule input | Click pe celulă → inline edit | Formule calculate instant |
| DINAMIC | DA + adaugă/șterge rânduri | Tabel editabil + buton "+" | Total recalculat |
| FORMULĂ | Doar celule input | Click edit pe input cells | Formule evaluate server-side |
| CHECKBOX | DA — toggle bifă | Click checkbox | Auto-fill din metadata |
| REFERINȚĂ | NU — read only | — | — |

---

## 6.5 Completare tabele — Neemia engine

### Algoritmul de fill pe PDF:

```python
async def fill_table_in_pdf(pdf_page, table: TemplateTable, project_elements: dict):
    """Completează un tabel într-o pagină PDF"""
    
    for cell in table.cells:
        if cell.cell_type == 'label' or cell.cell_type == 'header':
            continue  # Nu modifica textul fix
        
        if cell.cell_type == 'readonly':
            continue
        
        if cell.cell_type == 'input':
            # Ia valoarea din projectElements
            value = resolve_element(cell.element_key, project_elements)
            if value is None:
                # Marchează ca lipsă
                mark_missing(pdf_page, cell.position, cell.element_key)
                continue
            
            # Formatează conform dataType
            formatted = format_value(value, cell.data_type, cell.format_pattern)
            # Ex: 125500.00 → "125.500,00" (format RO)
            
            # Scrie în PDF la coordonatele celulei
            insert_text(pdf_page, cell.position, formatted)
        
        elif cell.cell_type == 'formula':
            # NU AI — calcul determinist
            result = evaluate_formula(cell.formula, table.cells, project_elements)
            formatted = format_value(result, cell.data_type, cell.format_pattern)
            insert_text(pdf_page, cell.position, formatted)
            
            # Validare dacă există
            if cell.validation:
                if not validate(result, cell.validation):
                    mark_warning(pdf_page, cell.position, 
                        f"Valoare {result} nu respectă limita {cell.validation}")
        
        elif cell.cell_type == 'checkbox':
            value = resolve_element(cell.element_key, project_elements)
            if value or (cell.auto_fill and eval_auto_fill(cell.auto_fill, project_elements)):
                insert_checkmark(pdf_page, cell.position)  # ✓ sau X
    
    # Tabele DINAMICE: adaugă rânduri
    if table.table_type == 'DINAMIC':
        array_data = resolve_array(table.row_template.element_key, project_elements)
        for i, item in enumerate(array_data):
            row_y = table.position.y + table.header_height + (i * table.row_height)
            for cell_template in table.row_template.cells:
                key = cell_template.element_key.replace('[i]', f'[{i}]')
                value = resolve_element(key, project_elements)
                if value:
                    pos = {**cell_template.position, 'y': row_y}
                    insert_text(pdf_page, pos, format_value(value, cell_template.data_type))


def format_value(value, data_type: str, pattern: str = None) -> str:
    """Formatare RO — critic pentru documente AFIR"""
    if data_type == 'currency':
        # 125500.00 → "125.500,00"
        return f"{value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    elif data_type == 'percentage':
        # 0.6667 → "66,67%"
        return f"{value * 100:,.2f}%".replace(",", "X").replace(".", ",").replace("X", ".")
    elif data_type == 'number':
        if isinstance(value, float):
            return f"{value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        return str(value)
    elif data_type == 'date':
        # ISO → "15.03.2026"
        return value.strftime("%d.%m.%Y") if hasattr(value, 'strftime') else str(value)
    return str(value)
```

---

## 6.6 Verificări audit — Tabele

### Ce adăugăm la scriptul Playwright:

```typescript
async function auditTables(page: Page) {
  console.log('\n══════ FAZA 11: TABELE ══════\n');
  
  // Verifică API: există template_tables?
  const response = await page.evaluate(async (baseUrl) => {
    try {
      const res = await fetch(`${baseUrl}/api/health/db`, { credentials: 'include' });
      const data = await res.json();
      return {
        hasTemplateTablesTable: data.tables?.includes('template_tables') || false,
        hasTableCellsTable: data.tables?.includes('template_table_cells') || false,
        hasRefTablesTable: data.tables?.includes('guide_reference_tables') || false,
      };
    } catch { return { error: true }; }
  }, CONFIG.baseUrl);
  
  log('TBL1', 'Tabel template_tables în DB', 
    response.hasTemplateTablesTable ? 'PASS' : 'FAIL',
    response.hasTemplateTablesTable ? 'Există' : 'LIPSĂ — tabele nu pot fi stocate structural');
  
  log('TBL2', 'Tabel template_table_cells în DB',
    response.hasTableCellsTable ? 'PASS' : 'FAIL', '');
  
  log('TBL3', 'Tabel guide_reference_tables în DB',
    response.hasRefTablesTable ? 'PASS' : 'FAIL', '');
  
  // Verifică: dacă există un template procesat, are tabele detectate?
  const tablesCheck = await page.evaluate(async (baseUrl) => {
    const docsRes = await fetch(`${baseUrl}/api/documents`, { credentials: 'include' });
    const docs = await docsRes.json();
    const docList = Array.isArray(docs) ? docs : (docs.documents || []);
    
    const template = docList.find((d: any) => 
      /cerere|FINANTARE|anexa/i.test(d.name || d.fileName || '') &&
      d.status === 'processed'
    );
    
    if (!template) return { noTemplate: true };
    
    try {
      const tabRes = await fetch(`${baseUrl}/api/documents/${template.id}/tables`, 
        { credentials: 'include' });
      if (!tabRes.ok) return { templateId: template.id, tablesEndpoint: tabRes.status };
      const tables = await tabRes.json();
      return {
        templateId: template.id,
        tablesCount: Array.isArray(tables) ? tables.length : (tables.tables?.length || 0),
        tableTypes: (Array.isArray(tables) ? tables : (tables.tables || []))
          .map((t: any) => t.tableType || t.type),
      };
    } catch (e) { return { templateId: template.id, error: String(e) }; }
  }, CONFIG.baseUrl);
  
  if (tablesCheck.noTemplate) {
    log('TBL4', 'Tabele detectate în template', 'WARN', 'Niciun template procesat');
  } else if (tablesCheck.tablesEndpoint) {
    log('TBL4', 'API /documents/:id/tables', 'FAIL', 
      `Status ${tablesCheck.tablesEndpoint} — endpoint probabil nu există încă`);
  } else {
    log('TBL4', 'Tabele detectate', tablesCheck.tablesCount > 0 ? 'PASS' : 'FAIL',
      `${tablesCheck.tablesCount} tabele, tipuri: ${tablesCheck.tableTypes?.join(', ')}`);
  }
}
```

---

## 6.7 Tabelele din Cererea de Finanțare sM 4.1 — Checklist complet

| # | Tabel | Tip | Pagini | Celule input | Formule | Prioritate |
|---|-------|-----|--------|-------------|---------|------------|
| TB1 | Plan Financiar Producție | STATIC | ~1 | 8 | 4 (totaluri) | CRITICĂ |
| TB2 | Plan Financiar Agromediu | STATIC | ~1 | 8 | 4 | Medium |
| TB3 | Plan Financiar Totalizator | STATIC+FORMULA | ~1 | 0 (toate formule) | 12 | CRITICĂ |
| TB4 | Buget Indicativ (Anexa G) | STATIC | 2-3 | ~30 | ~10 | CRITICĂ |
| TB5 | Devize pe obiect | DINAMIC | variabil | variabil | totaluri | High |
| TB6 | Plan de cultură implementare | DINAMIC | 1 | N×2 | 1 (total) | High |
| TB7 | Plan de cultură operare (5 ani) | DINAMIC | 1 | N×5 | 5 (totaluri) | High |
| TB8 | Lista echipamente achiziționate | DINAMIC | 1 | N×4 | totaluri | High |
| TB9 | Matrice viabilitate Anexa B | FORMULĂ | 2-3 | ~15 | ~20 | CRITICĂ |
| TB10 | Indicatori de monitorizare | STATIC | 1 | ~15 | 0 | Medium |
| TB11 | Factori de risc | STATIC | 1 | ~10 | 0 | Medium |
| TB12 | Lista documente (Secțiunea E) | CHECKBOX | 2 | ~28 checkboxuri | 0 | High |
| TB13 | Corelație putere/suprafață (Anexa 3) | REFERINȚĂ | 1 | 0 (read-only) | 0 | Referință |
| TB14 | Lista UAT ANC (Anexa 4) | REFERINȚĂ | multi | 0 (read-only) | 0 | Referință |

### Fix-uri necesare:

```
Fix 12: Adaugă template_tables + template_table_cells la schema.ts
Fix 13: Adaugă detectare tabele în processTemplate (Stratul 2 — Sonnet)
Fix 14: Adaugă evaluate_formula() engine determinist (NU AI)
Fix 15: Adaugă format_value() cu formatare RO (punct mii, virgulă zecimale)  
Fix 16: Adaugă componentă TableEditor pentru frontend (editabil per tip)
Fix 17: Adaugă API endpoint GET /api/documents/:id/tables
Fix 18: Adaugă fill_table_in_pdf() în Neemia FILL engine
```

---

## 6.8 Prompt pentru Claude Code — Tabele

```
Citește AUDIT_VISUAL_DOCUMENTS.md, Partea 6 — Tratamentul Tabelelor.

TASK: Adaugă schema DB pentru tabele.

1. Citește schema.ts (packages/db/src/schema/)
2. Adaugă tabelele template_tables și template_table_cells 
   conform specificației din secțiunea 6.2
3. Generează migrarea cu drizzle-kit generate
4. NU aplica migrarea — doar generează-o
5. Build check

Un singur pas. Arată-mi output-ul migrării generate.
```
