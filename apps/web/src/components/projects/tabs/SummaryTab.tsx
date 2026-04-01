"use client";
import { getCaenDescription } from "@/lib/caen";
import type { ProjectData, ElementItem, NeemiaTemplate } from "../types";
import { formatRON, pct } from "../types";

interface SummaryTabProps {
  project: ProjectData;
  elements: ElementItem[];
  neemiaTemplates: NeemiaTemplate[];
  eligibilityRules: Array<{ status: string }>;
  checklistItems: Array<{ done: boolean }>;
  projectScores: { scores: any[]; totalPoints: number; maxTotalPoints: number; percentage: number } | null;
  budgetValidation: any;
  learnings: any;
  orgLabels: { solomonLabel: string; neemiaLabel: string };
  onSwitchTab: (tab: string) => void;
}

export default function SummaryTab({
  project, elements, neemiaTemplates, eligibilityRules, checklistItems,
  projectScores, budgetValidation, learnings, orgLabels, onSwitchTab,
}: SummaryTabProps) {
  const elemFilled = elements.filter(e => e.value && e.value.trim() !== "").length;
  const elemTotal = elements.length;
  const eligPassed = eligibilityRules.filter(r => r.status === "passed" || r.status === "pass").length;
  const eligTotal = eligibilityRules.length;
  const checkDone = checklistItems.filter(i => i.done).length;
  const checkTotal = checklistItems.length;
  const progressPct = elemTotal > 0 ? pct(elemFilled, elemTotal) : "0";
  const generatedDocs = neemiaTemplates.filter(t => t.status === "generated" || t.status === "validated").length;

  const companyData = project.company;
  const projectCui = companyData?.cui || "-";
  const capitalSocial = companyData?.capitalSocial ? formatRON(companyData.capitalSocial) : "-";
  const cifraAfaceri = companyData?.cifraAfaceri ? formatRON(companyData.cifraAfaceri) : "-";
  const projectValoare = project.valoare ? formatRON(project.valoare) : "-";

  // Parse address
  let localitate = "-";
  let judet = "-";
  if (companyData?.adresa) {
    const parts = companyData.adresa.split(",").map(s => s.trim());
    localitate = parts[0] || "-";
    judet = parts.find(p => /^(jud|județ)/i.test(p))?.replace(/^(jud|județ)\.?\s*/i, "") || parts[parts.length - 1] || "-";
  }

  // Activity items
  const activityItems: Array<{ icon: string; text: string; time: string }> = [];
  const solomonElemCount = elements.filter(e => e.source === "solomon" || e.source === "solomon_chat").length;
  if (solomonElemCount > 0) activityItems.push({ icon: "🤖", text: `Solomon a completat ${solomonElemCount} elemente`, time: "recent" });
  if (generatedDocs > 0) activityItems.push({ icon: "📄", text: `${generatedDocs} document${generatedDocs > 1 ? "e" : ""} generat${generatedDocs > 1 ? "e" : ""} de Neemia`, time: "recent" });
  if (eligTotal > 0) activityItems.push({ icon: "✅", text: `Pre-eligibilitate verificată — ${eligPassed}/${eligTotal} criterii trecute`, time: "recent" });
  if (checkDone > 0) activityItems.push({ icon: "📋", text: `${checkDone}/${checkTotal} documente din checklist bifate`, time: "recent" });

  return (
    <div className="sumar-panel">
      <div className="sumar-progress">
        <div className="sp-card"><div className="sp-val" style={{ color: "#2563eb" }}>{elemFilled}</div><div className="sp-label">Elemente completate</div></div>
        <div className="sp-card"><div className="sp-val" style={{ color: "#059669" }}>{progressPct}%</div><div className="sp-label">Progress total</div></div>
        <div className="sp-card"><div className="sp-val">{eligTotal}</div><div className="sp-label">Reguli verificate</div></div>
        <div className="sp-card"><div className="sp-val">{generatedDocs}</div><div className="sp-label">Documente generate</div></div>
      </div>

      {activityItems.length > 0 && (
        <div className="sumar-activity" style={{ marginBottom: 24 }}>
          <h3>Activitate recentă</h3>
          {activityItems.map((item, i) => (
            <div className="sa-item" key={i}>
              <span className="sa-item-icon">{item.icon}</span>
              <span className="sa-item-text">{item.text}</span>
              <span className="sa-item-time">{item.time}</span>
            </div>
          ))}
        </div>
      )}

      {/* Scor estimat */}
      {projectScores && projectScores.maxTotalPoints > 0 && (
        <div className="si-card" style={{ marginBottom: 12 }}>
          <h3>Scor estimat</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: projectScores.percentage >= 80 ? "#059669" : projectScores.percentage >= 60 ? "#d97706" : "#dc2626" }}>
              {projectScores.totalPoints}/{projectScores.maxTotalPoints}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: projectScores.percentage >= 80 ? "rgba(52,211,153,.15)" : projectScores.percentage >= 60 ? "rgba(251,191,36,.15)" : "rgba(248,113,113,.15)", color: projectScores.percentage >= 80 ? "#059669" : projectScores.percentage >= 60 ? "#d97706" : "#dc2626" }}>
              {Math.round(projectScores.percentage)}%
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "rgba(0,0,0,.06)", overflow: "hidden", marginBottom: 10 }}>
            <div style={{ height: "100%", borderRadius: 4, transition: "width .4s", width: `${projectScores.percentage}%`, background: projectScores.percentage >= 80 ? "#34d399" : projectScores.percentage >= 60 ? "#fbbf24" : "#f87171" }} />
          </div>
          {projectScores.scores.length > 0 && (
            <div style={{ fontSize: 12 }}>
              {projectScores.scores.map((s: any, i: number) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid rgba(0,0,0,.04)" }}>
                  <span style={{ color: "#64748b" }}>{s.code || s.name}</span>
                  <span style={{ fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{s.points ?? "-"}/{s.maxPoints}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Buget */}
      {budgetValidation?.summary && (
        <div className="si-card" style={{ marginBottom: 12, borderColor: budgetValidation.summary.totalErrors > 0 ? "rgba(248,113,113,.4)" : undefined }}>
          <h3 style={{ display: "flex", alignItems: "center", gap: 6 }}>
            Buget
            {budgetValidation.summary.totalErrors > 0 && <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, background: "rgba(248,113,113,.15)", color: "#dc2626", fontWeight: 700 }}>{budgetValidation.summary.totalErrors} erori</span>}
          </h3>
          <div className="si-row"><span className="si-label">Valoare totală</span><span className="si-value">{formatRON(budgetValidation.summary.totalBudget)}</span></div>
          <div className="si-row"><span className="si-label">Valoare eligibilă</span><span className="si-value">{formatRON(budgetValidation.summary.eligibleAmount)}</span></div>
          <div className="si-row"><span className="si-label">Grant ({budgetValidation.summary.grantPct}%)</span><span className="si-value">{formatRON(budgetValidation.summary.grantAmount)}</span></div>
        </div>
      )}

      {/* Learnings */}
      {learnings && learnings.totalApprovedSimilar > 0 && (
        <div className="si-card" style={{ marginBottom: 12 }}>
          <h3>Sfaturi din proiecte similare ({learnings.totalApprovedSimilar} aprobate)</h3>
          {learnings.eligibilityInsights?.slice(0, 3).map((ins: any, i: number) => (
            <div key={i} style={{ fontSize: 12, padding: "4px 0", borderBottom: "1px solid rgba(0,0,0,.04)" }}>
              <span style={{ color: ins.commonOutcome === "passed" ? "#059669" : "#dc2626" }}>{ins.commonOutcome === "passed" ? "✓" : "✗"}</span>{" "}
              <span style={{ color: "#64748b" }}>{ins.tip || ins.ruleDescription}</span>
            </div>
          ))}
        </div>
      )}

      <div className="sumar-info">
        <div className="si-card">
          <h3>Date firmă</h3>
          <div className="si-row"><span className="si-label">CUI</span><span className="si-value">{projectCui}</span></div>
          <div className="si-row"><span className="si-label">Forma juridică</span><span className="si-value">{companyData?.formaJuridica || "-"}</span></div>
          <div className="si-row"><span className="si-label">CAEN</span><span className="si-value" title={getCaenDescription(companyData?.caen) || undefined}>{companyData?.caen || "-"}{getCaenDescription(companyData?.caen) ? ` — ${getCaenDescription(companyData?.caen)!.slice(0, 35)}…` : ""}</span></div>
          <div className="si-row"><span className="si-label">Localitate</span><span className="si-value">{localitate}, {judet}</span></div>
        </div>
        <div className="si-card">
          <h3>Date financiare</h3>
          <div className="si-row"><span className="si-label">Capital social</span><span className="si-value">{capitalSocial}</span></div>
          <div className="si-row"><span className="si-label">Cifra afaceri</span><span className="si-value">{cifraAfaceri}</span></div>
          <div className="si-row"><span className="si-label">Valoare proiect</span><span className="si-value">{projectValoare}</span></div>
        </div>
      </div>

      {/* Program metadata */}
      <div className="sumar-info">
        <div className="si-card" style={{ gridColumn: "1 / -1" }}>
          <h3>Program de finanțare</h3>
          {project?.programFinantare ? (
            <>
              <div className="si-row"><span className="si-label">Program</span><span className="si-value">{project.programFinantare}</span></div>
              {project.codMasura && <div className="si-row"><span className="si-label">Masura</span><span className="si-value">{project.codMasura}</span></div>}
              {project.codSesiune && <div className="si-row"><span className="si-label">Sesiune</span><span className="si-value">{project.codSesiune}</span></div>}
              {project.tipProiect && <div className="si-row"><span className="si-label">Tip proiect</span><span className="si-value" style={{ textTransform: "capitalize" }}>{project.tipProiect.replace(/_/g, " ")}</span></div>}
            </>
          ) : (
            <div className="text-xs text-[#94a3b8] py-2">
              Nu a fost identificat încă. Deschide {orgLabels.solomonLabel} pentru a confirma programul de finanțare.
            </div>
          )}
        </div>
      </div>

      <div className="sumar-actions">
        <button className="sa-btn primary" onClick={() => onSwitchTab("reguli")}>🛡 Verifică eligibilitate</button>
        <button className="sa-btn" onClick={() => onSwitchTab("solomon")}>🤖 Deschide {orgLabels.solomonLabel}</button>
        <button className="sa-btn" onClick={() => onSwitchTab("neemia")}>📄 Generează documente</button>
      </div>
    </div>
  );
}
