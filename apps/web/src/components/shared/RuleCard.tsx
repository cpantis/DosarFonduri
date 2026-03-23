"use client";

import React from "react";

/* ══════════════════════════════════════════
   SHARED RULE CARD — used in Proiect (Reguli tab) + Biblioteca Sesiune
   ══════════════════════════════════════════ */

// ── Normalized data interface ──
export interface RuleCardData {
  id: string;
  type: "fixed" | "interpreted";
  text: string;
  confidence: number; // 0–1
  page: number | null;
  category: string | null;
  sourceText: string | null;
  condition: any;
  semanticTags: string[];
  validated: boolean;
  needsReview: boolean;
  sourceDocument: { name: string; fileType: string } | null;
  // Optional eligibility status (only in Proiect context)
  eligStatus?: { status: "pass" | "fail" | "pending"; notes?: string } | null;
}

export interface RuleCardProps {
  rule: RuleCardData;
  isOpen: boolean;
  onToggle: () => void;
  categoryColor: string;
  categoryLabel: string;
}

// ── Shared constants ──

export const CATEGORY_COLORS: Record<string, string> = {
  eligibilitate: "#2563eb", financiar: "#059669", tehnic: "#7c3aed", administrativ: "#64748b",
  achizitii: "#ea580c", documente: "#d97706", selectie: "#dc2626", intensitate: "#0891b2",
  eligibilitate_complexa: "#2563eb", documentare: "#d97706", ajutor_stat: "#7c3aed",
};

export const CATEGORY_LABELS: Record<string, string> = {
  eligibilitate: "ELIGIBILITATE", financiar: "FINANCIAR", tehnic: "TEHNIC",
  administrativ: "ADMINISTRATIV", achizitii: "ACHIZIȚII", documente: "DOCUMENTE",
  selectie: "SELECȚIE", intensitate: "INTENSITATE",
  eligibilitate_complexa: "ELIG. COMPLEXĂ", documentare: "DOCUMENTARE",
  ajutor_stat: "AJUTOR STAT",
};

export const OPERATOR_LABELS: Record<string, string> = {
  // Symblic forms (from some AI outputs)
  ">=": "mai mare sau egal cu", "<=": "mai mic sau egal cu",
  ">": "mai mare decât", "<": "mai mic decât",
  "=": "egal cu", "!=": "diferit de",
  // Short-code forms (gte/lte/eq/etc from AI extraction)
  gte: "mai mare sau egal cu", lte: "mai mic sau egal cu",
  gt: "mai mare decât", lt: "mai mic decât",
  eq: "egal cu", neq: "diferit de",
  // Semantic operators
  in: "este unul din", not_in: "nu este în",
  between: "între", contains: "conține", not_contains: "nu conține",
  exists: "trebuie să existe", not_exists: "nu trebuie să existe",
  matches: "corespunde cu", is_true: "= DA", is_false: "= NU",
  min: "minim", max: "maxim",
};

const SEM_TAG_MAP: Record<string, { label: string; icon: string; color: string; bg: string; border: string }> = {
  THRESHOLD:      { label: "Prag",         icon: "●", color: "#0369a1", bg: "rgba(14,165,233,.1)",  border: "rgba(14,165,233,.25)" },
  SCORING:        { label: "Punctaj",      icon: "★", color: "#7c3aed", bg: "rgba(167,139,250,.1)", border: "rgba(167,139,250,.25)" },
  TEMPORAL:       { label: "Temporal",     icon: "◷", color: "#0891b2", bg: "rgba(6,182,212,.1)",   border: "rgba(6,182,212,.25)" },
  DOCUMENT_BASED: { label: "Document",     icon: "◩", color: "#b45309", bg: "rgba(245,158,11,.1)",  border: "rgba(245,158,11,.25)" },
  DEPENDENCY:     { label: "Dependență",   icon: "⇄", color: "#6d28d9", bg: "rgba(139,92,246,.1)",  border: "rgba(139,92,246,.25)" },
  EXCLUSION:      { label: "Excludere",    icon: "⊘", color: "#dc2626", bg: "rgba(239,68,68,.1)",   border: "rgba(239,68,68,.2)" },
  EXCEPTION:      { label: "Excepție",     icon: "⚑", color: "#ea580c", bg: "rgba(249,115,22,.1)",  border: "rgba(249,115,22,.2)" },
  PROPORTIONAL:   { label: "Proporțional", icon: "%", color: "#059669", bg: "rgba(16,185,129,.1)",  border: "rgba(16,185,129,.25)" },
  CLASSIFICATION: { label: "Clasificare",  icon: "◈", color: "#2563eb", bg: "rgba(37,99,235,.1)",   border: "rgba(37,99,235,.2)" },
};

// ── Helpers ──

// Known field translations — maps snake_case DB field names to Romanian
const FIELD_LABELS: Record<string, string> = {
  // Company / financial data
  dimensiune_economica: "Dimensiunea economică",
  dimensiune_economica_exploatatie: "Dimensiunea economică a exploatației",
  dimensiune_economica_exploatatie_so: "Dimensiunea economică a exploatației (SO)",
  dimensiune_economica_minima: "Dimensiunea economică minimă",
  profit_mediu_anual: "Profitul mediu anual",
  cifra_afaceri: "Cifra de afaceri",
  numar_angajati: "Numărul de angajați",
  rezultat_exploatare: "Rezultatul din exploatare",
  capitaluri_proprii: "Capitaluri proprii",
  datorii_totale: "Datorii totale",
  active_totale: "Active totale",
  rata_solvabilitate: "Rata de solvabilitate",
  rata_lichiditate: "Rata de lichiditate curentă",
  rata_rentabilitate: "Rata de rentabilitate",
  valoare_productie: "Valoarea producției",
  venituri_totale: "Venituri totale",
  cheltuieli_totale: "Cheltuieli totale",
  profit_net: "Profitul net",
  profit_brut: "Profitul brut",
  pierdere_neta: "Pierdere netă",
  // Project data
  valoare_proiect: "Valoarea proiectului",
  valoare_eligibila: "Valoarea eligibilă",
  cofinantare: "Cofinanțarea proprie",
  ajutor_solicitat: "Ajutorul solicitat",
  sprijin_solicitat: "Sprijinul solicitat",
  durata_implementare: "Durata de implementare",
  durata_contract: "Durata contractului",
  intensitate_ajutor: "Intensitatea ajutorului",
  costuri_generale: "Costurile generale ale proiectului",
  // Eligibility
  forma_juridica: "Forma juridică",
  cod_caen: "Codul CAEN",
  categoria_beneficiar: "Categoria de beneficiar",
  tip_beneficiar: "Tipul beneficiarului",
  varsta_firma: "Vechimea firmei",
  ani_activitate: "Ani de activitate",
  localitate: "Localitatea",
  judet: "Județul",
  regiune: "Regiunea de dezvoltare",
  zona_eligibila: "Zona eligibilă",
  tip_investitie: "Tipul investiției",
  componenta: "Componenta",
  sub_masura: "Sub-măsura",
  masura: "Măsura",
  axa: "Axa prioritară",
  // Scoring
  punctaj_total: "Punctajul total",
  punctaj_minim: "Punctajul minim",
  prag_calitate: "Pragul de calitate",
  prag_selectie: "Pragul de selecție",
  // Reduceri
  reducere_maxima: "Reducerea maximă permisă",
  limitare_profit: "Limitarea profitului",
};

export function formatFieldName(field: string): string {
  // Check exact match first
  const lower = field.toLowerCase();
  if (FIELD_LABELS[lower]) return FIELD_LABELS[lower];
  // Check if field starts with a known key (handles suffixed variants)
  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    if (lower.startsWith(key + "_") || lower === key) return label;
  }
  // Fallback: humanize snake_case
  return field
    .replace(/_/g, " ")
    .replace(/\bso\b/gi, "(SO)")
    .replace(/\bha\b/gi, "ha")
    .replace(/\beur\b/gi, "EUR")
    .replace(/\bron\b/gi, "RON")
    .replace(/\bcaen\b/gi, "CAEN")
    .replace(/\bonrc\b/gi, "ONRC")
    .replace(/\bapia\b/gi, "APIA")
    .replace(/\bpib\b/gi, "PIB")
    .toLowerCase()
    .replace(/^\w/, c => c.toUpperCase());
}

export function formatConditionValue(val: any): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "DA" : "NU";
  if (typeof val === "number") return val.toLocaleString("ro-RO");
  if (Array.isArray(val)) return val.join(", ");
  return String(val);
}

export function formatConditionText(condition: any): string | null {
  if (!condition || typeof condition !== "object") return null;
  const { field, operator, value, value2 } = condition;
  if (!field && !operator) return null;

  const fieldLabel = field ? formatFieldName(field) : "";
  const valLabel = formatConditionValue(value);
  const opText = operator ? (OPERATOR_LABELS[operator] || operator) : "";

  if (operator === "between" && value !== undefined && value2 !== undefined) {
    return `${fieldLabel} trebuie să fie între ${valLabel} și ${formatConditionValue(value2)}`;
  } else if (operator === "in" || operator === "not_in") {
    const listStr = Array.isArray(value) ? value.join(", ") : valLabel;
    return operator === "in"
      ? `${fieldLabel} trebuie să fie unul din: ${listStr}`
      : `${fieldLabel} nu trebuie să fie în: ${listStr}`;
  } else if (operator === "exists" || operator === "not_exists") {
    return operator === "exists" ? `${fieldLabel} trebuie să existe` : `${fieldLabel} nu trebuie să existe`;
  } else if (operator === "is_true" || operator === "is_false") {
    return `${fieldLabel} trebuie să fie ${operator === "is_true" ? "DA" : "NU"}`;
  } else if ((operator === "gte" || operator === ">=") && field && value !== undefined) {
    return `${fieldLabel} trebuie să fie cel puțin ${valLabel}`;
  } else if ((operator === "lte" || operator === "<=") && field && value !== undefined) {
    return `${fieldLabel} nu trebuie să depășească ${valLabel}`;
  } else if ((operator === "gt" || operator === ">") && field && value !== undefined) {
    return `${fieldLabel} trebuie să fie mai mare decât ${valLabel}`;
  } else if ((operator === "lt" || operator === "<") && field && value !== undefined) {
    return `${fieldLabel} trebuie să fie mai mic decât ${valLabel}`;
  } else if ((operator === "eq" || operator === "=") && field && value !== undefined) {
    return `${fieldLabel} trebuie să fie ${valLabel}`;
  } else if ((operator === "neq" || operator === "!=") && field && value !== undefined) {
    return `${fieldLabel} nu trebuie să fie ${valLabel}`;
  } else if (operator === "min" && field && value !== undefined) {
    return `${fieldLabel} — minim ${valLabel}`;
  } else if (operator === "max" && field && value !== undefined) {
    return `${fieldLabel} — maxim ${valLabel}`;
  } else if (field && operator && value !== undefined) {
    return `${fieldLabel} ${opText} ${valLabel}`;
  } else if (field && value !== undefined) {
    return `${fieldLabel}: ${valLabel}`;
  }
  return null;
}

// ── The Card ──

export function RuleCard({ rule, isOpen, onToggle, categoryColor, categoryLabel }: RuleCardProps) {
  const r = rule;
  const conf = r.confidence;
  const rc = r.condition;

  return (
    <div style={{
      borderRadius: 12, border: "1px solid rgba(226,232,240,.7)", background: "#fff",
      overflow: "hidden", transition: "all .2s",
    }}>
      {/* ── Header (always visible) ── */}
      <div
        onClick={onToggle}
        onMouseEnter={(e) => { if (!isOpen) (e.currentTarget.parentElement as HTMLElement).style.borderColor = "#cbd5e1"; }}
        onMouseLeave={(e) => { if (!isOpen) (e.currentTarget.parentElement as HTMLElement).style.borderColor = "rgba(226,232,240,.7)"; }}
        style={{
          display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 20px",
          cursor: "pointer", userSelect: "none",
          background: isOpen ? "rgba(248,250,252,.6)" : "transparent",
          transition: "background .15s",
        }}
      >
        {/* Chevron */}
        <span style={{
          fontSize: 9, marginTop: 6, flexShrink: 0,
          color: isOpen ? "#2563eb" : "#cbd5e1",
          transition: "transform .2s, color .2s",
          transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
        }}>▶</span>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Badges row */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
            {/* Type badge */}
            <span style={{
              fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px",
              padding: "2px 10px", borderRadius: 4, flexShrink: 0, whiteSpace: "nowrap",
              color: r.type === "fixed" ? "#059669" : "#d97706",
              background: r.type === "fixed" ? "rgba(52,211,153,.15)" : "rgba(251,191,36,.15)",
              border: r.type === "fixed" ? "1px solid #a7f3d0" : "1px solid #fed7aa",
            }}>
              {r.type === "fixed" ? "FIXĂ" : "INTERPRETATĂ"}
            </span>
            {/* Category badge */}
            {r.category && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "2px 10px", borderRadius: 4, letterSpacing: ".3px",
                background: `color-mix(in srgb, ${categoryColor} 14%, transparent)`,
                color: categoryColor, border: `1px solid color-mix(in srgb, ${categoryColor} 25%, transparent)`,
                textTransform: "uppercase",
              }}>
                {categoryLabel}
              </span>
            )}
            {/* Eligibility status */}
            {r.eligStatus && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "2px 10px", borderRadius: 4,
                color: r.eligStatus.status === "pass" ? "#059669" : r.eligStatus.status === "fail" ? "#dc2626" : "#d97706",
                background: r.eligStatus.status === "pass" ? "rgba(52,211,153,.12)" : r.eligStatus.status === "fail" ? "rgba(239,68,68,.1)" : "rgba(251,191,36,.1)",
              }}>
                {r.eligStatus.status === "pass" ? "✓ Trecut" : r.eligStatus.status === "fail" ? "✗ Respins" : "⏳ Pending"}
              </span>
            )}
            {r.needsReview && <span style={{ fontSize: 10, fontWeight: 700, color: "#d97706" }}>⚠ Review</span>}
            {r.validated && <span style={{ fontSize: 10, fontWeight: 700, color: "#059669" }}>✓ Validată</span>}
          </div>
          {/* Rule text */}
          <div style={{ fontSize: 13, lineHeight: 1.6, color: "#0f172a", fontWeight: 500 }}>{r.text}</div>
        </div>

        {/* Right side: confidence + page */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginTop: 4 }}>
          <span style={{
            fontSize: 13, fontWeight: 700,
            color: conf > 0.9 ? "#059669" : conf > 0.8 ? "#2563eb" : "#d97706",
          }}>
            {Math.round(conf * 100)}%
          </span>
          {r.page != null && (
            <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8" }}>p.{r.page}</span>
          )}
        </div>
      </div>

      {/* ── Expanded detail ── */}
      {isOpen && (
        <div style={{ padding: "0 20px 20px 42px", borderTop: "1px solid rgba(226,232,240,.4)" }}>
          {/* Confidence bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, marginBottom: 16 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".5px" }}>Încredere</span>
            <span style={{
              fontSize: 20, fontWeight: 800,
              color: conf > 0.9 ? "#059669" : conf > 0.8 ? "#2563eb" : "#d97706",
            }}>
              {Math.round(conf * 100)}%
            </span>
            <div style={{ flex: 1, height: 6, background: "#f1f5f9", borderRadius: 3, overflow: "hidden", maxWidth: 200 }}>
              <div style={{
                height: "100%", borderRadius: 3, transition: "width .3s",
                width: `${conf * 100}%`,
                background: conf > 0.9 ? "#34d399" : conf > 0.8 ? "#2563eb" : "#fbbf24",
              }} />
            </div>
          </div>

          {/* Semantic tags */}
          {r.semanticTags.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 16 }}>
              {r.semanticTags.map((tag: string) => {
                const st = SEM_TAG_MAP[tag];
                const style: React.CSSProperties = st
                  ? { color: st.color, background: st.bg, border: `1px solid ${st.border}` }
                  : { color: "#64748b", background: "#f1f5f9", border: "1px solid #e2e8f0" };
                return (
                  <span key={tag} style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: ".4px", padding: "3px 10px",
                    borderRadius: 20, display: "inline-flex", alignItems: "center", gap: 4,
                    textTransform: "uppercase",
                    ...style,
                  }}>
                    {st?.icon || "●"} {st?.label || tag}
                  </span>
                );
              })}
            </div>
          )}

          {/* Description */}
          <Section title="Descriere regulă">
            <div style={{ fontSize: 14, lineHeight: 1.7, color: "#0f172a", padding: "14px 18px", background: "#fff", border: "1px solid rgba(226,232,240,.8)", borderRadius: 12 }}>
              {r.text}
            </div>
          </Section>

          {/* Source text from guide */}
          {r.sourceText && (
            <Section title="Text original din ghid" rightLabel={r.page != null ? `Pag. ${r.page}` : undefined}>
              <div style={{ background: "#fff", border: "1px solid rgba(226,232,240,.8)", borderRadius: 12, overflow: "hidden" }}>
                <div style={{
                  fontSize: 13, lineHeight: 1.8, color: "#0f172a", padding: "16px 20px",
                  borderLeft: "3px solid #2563eb", fontStyle: "italic", background: "rgba(37,99,235,.03)",
                }}>
                  {r.sourceText}
                </div>
              </div>
            </Section>
          )}

          {/* Condition / Decision logic */}
          {rc && typeof rc === "object" && (rc.field || rc.logic || rc.type) && (
            <Section title={r.type === "fixed" ? "Condiție verificare" : "Logică decizională"}>
              <div style={{ background: "#fff", border: "1px solid rgba(226,232,240,.8)", borderRadius: 12, padding: "14px 18px" }}>
                {/* Fixed rules */}
                {r.type === "fixed" && rc.field && (() => {
                  const humanText = formatConditionText(rc);
                  return (
                    <>
                      {humanText && (
                        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, background: "rgba(77,139,255,.04)", border: "1px solid rgba(77,139,255,.15)", marginBottom: 10 }}>
                          <span style={{ fontSize: 16, flexShrink: 0 }}>🧪</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{humanText}</span>
                        </div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>
                        <span style={{ fontWeight: 700, color: "#2563eb" }}>{formatFieldName(rc.field)}</span>
                        <span style={{ fontWeight: 600, color: "#94a3b8" }}>{OPERATOR_LABELS[rc.operator] || rc.operator}</span>
                        <span style={{ fontWeight: 600, color: "#059669" }}>
                          {formatConditionValue(rc.value)}
                          {rc.value2 != null && ` — ${formatConditionValue(rc.value2)}`}
                        </span>
                      </div>
                    </>
                  );
                })()}
                {/* Interpreted rules */}
                {r.type === "interpreted" && (
                  <>
                    {rc.type && (
                      <div style={{ marginBottom: 10 }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px",
                          padding: "4px 12px", borderRadius: 4,
                          background: "rgba(167,139,250,.12)", color: "#7c3aed", border: "1px solid rgba(167,139,250,.25)",
                        }}>
                          {rc.type.replace(/_/g, " ")}
                        </span>
                      </div>
                    )}
                    {rc.logic && (
                      <div style={{ fontSize: 13, lineHeight: 1.7, color: "#0f172a", marginBottom: 12 }}>{rc.logic}</div>
                    )}
                    {rc.factors && rc.factors.length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".5px" }}>Factori:</span>
                        {rc.factors.map((f: string, i: number) => (
                          <span key={i} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid rgba(226,232,240,.8)", color: "#64748b", fontFamily: "'JetBrains Mono', monospace" }}>{f}</span>
                        ))}
                      </div>
                    )}
                    {rc.outcomes && rc.outcomes.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {rc.outcomes.map((o: any, i: number) => (
                          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, lineHeight: 1.6, padding: "6px 10px", background: "#f8fafc", borderRadius: 6 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#2563eb", padding: "1px 6px", borderRadius: 3, background: "rgba(37,99,235,.1)", flexShrink: 0, marginTop: 1 }}>DACĂ</span>
                            <span style={{ color: "#0f172a", flex: 1 }}>{o.if}</span>
                            <span style={{ color: "#94a3b8", flexShrink: 0 }}>→</span>
                            <span style={{ color: "#059669", fontWeight: 600, flex: 1 }}>{o.then}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </Section>
          )}

          {/* Source document */}
          {r.sourceDocument && (
            <Section title="Sursă document">
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#fff", border: "1px solid rgba(226,232,240,.8)", borderRadius: 12 }}>
                <span>{r.sourceDocument.fileType === "pdf" ? "📕" : r.sourceDocument.fileType === "docx" ? "📘" : "📗"}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{r.sourceDocument.name}</span>
                {r.page != null && <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: "auto" }}>Pag. {r.page}</span>}
              </div>
            </Section>
          )}

          {/* Eligibility status */}
          {r.eligStatus && (
            <Section title="Status eligibilitate">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  fontSize: 12, fontWeight: 700, padding: "4px 14px", borderRadius: 6,
                  color: r.eligStatus.status === "pass" ? "#059669" : r.eligStatus.status === "fail" ? "#dc2626" : "#d97706",
                  background: r.eligStatus.status === "pass" ? "rgba(52,211,153,.12)" : r.eligStatus.status === "fail" ? "rgba(239,68,68,.1)" : "rgba(251,191,36,.1)",
                }}>
                  {r.eligStatus.status === "pass" ? "✓ TRECUT" : r.eligStatus.status === "fail" ? "✗ RESPINS" : "⏳ PENDING"}
                </span>
                {r.eligStatus.notes && (
                  <span style={{ fontSize: 12, color: "#64748b", fontStyle: "italic" }}>{r.eligStatus.notes}</span>
                )}
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tiny section helper (not exported) ──

function Section({ title, rightLabel, children }: { title: string; rightLabel?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".8px",
        color: "#94a3b8", marginBottom: 10, display: "flex", alignItems: "center", gap: 8,
      }}>
        {title}
        {rightLabel && (
          <span style={{ fontSize: 10, fontWeight: 600, color: "#2563eb", background: "rgba(37,99,235,.08)", padding: "2px 8px", borderRadius: 6, marginLeft: "auto" }}>
            {rightLabel}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Container with gap (wraps multiple RuleCards) ──

export function RuleCardList({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {children}
    </div>
  );
}
