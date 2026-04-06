"use client";
import { apiPost } from "@/lib/api";

interface ScoringTabProps {
  projectId: string;
  solScoring: any[];
  projectScores: { scores: any[]; totalPoints: number; maxTotalPoints: number; percentage: number } | null;
  setProjectScores: (v: any) => void;
  toast: (type: any, msg: string) => void;
}

export default function ScoringTab({ projectId, solScoring, projectScores, setProjectScores, toast }: ScoringTabProps) {
  const solScoringSection = solScoring.length > 0 ? (
    <div style={{ marginBottom: 24, padding: 16, background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
        <span>Punctaj estimat (Solomon)</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#2563eb" }}>
          {solScoring.reduce((s: number, e: any) => s + (e.pointsEstimated || e.points || 0), 0)} / {solScoring.reduce((s: number, e: any) => s + (e.maxPoints || 0), 0)}
        </span>
      </div>
      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
            <th style={{ textAlign: "left", padding: "4px 0", color: "#64748b", fontWeight: 600 }}>Criteriu</th>
            <th style={{ textAlign: "right", padding: "4px 8px", color: "#64748b", fontWeight: 600 }}>Est.</th>
            <th style={{ textAlign: "right", padding: "4px 8px", color: "#64748b", fontWeight: 600 }}>Max</th>
            <th style={{ textAlign: "right", padding: "4px 0", color: "#64748b", fontWeight: 600 }}>Conf.</th>
          </tr>
        </thead>
        <tbody>
          {solScoring.map((entry: any, i: number) => (
            <tr key={i} style={{ borderBottom: "1px solid #f0f2f5" }}>
              <td style={{ padding: "6px 0", color: "#1e293b" }}>
                {entry.criterionName || entry.criterion}
                {entry.evidence && <div style={{ fontSize: 10, color: "#94a3b8" }}>{entry.evidence}</div>}
              </td>
              <td style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600, color: "#2563eb" }}>{entry.pointsEstimated ?? entry.points ?? "—"}</td>
              <td style={{ textAlign: "right", padding: "6px 8px", color: "#64748b" }}>{entry.maxPoints ?? "—"}</td>
              <td style={{ textAlign: "right", padding: "6px 0", color: "#94a3b8" }}>{entry.confidence ? `${Math.round(entry.confidence * 100)}%` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : null;

  const handleRecompute = async () => {
    try {
      const data = await apiPost<any>(`/api/projects/${projectId}/recompute-scores`, {});
      setProjectScores(data);
      toast("success", "Scorurile au fost recalculate");
    } catch { /* SSE parse — incomplete chunk, expected */ toast("error", "Eroare la recalculare"); }
  };

  if ((!projectScores || projectScores.scores.length === 0) && solScoring.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 200, color: "#8892a8", padding: 24 }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Niciun criteriu de scor disponibil</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>Discutați punctajul cu Solomon pentru estimări automate</div>
        <button onClick={handleRecompute} style={{ marginTop: 12, padding: "6px 16px", background: "#2563eb", color: "#fff", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
          Recalculează scoruri
        </button>
      </div>
    );
  }

  if (!projectScores || projectScores.scores.length === 0) {
    return <div style={{ padding: 24 }}>{solScoringSection}</div>;
  }

  const { scores, totalPoints, maxTotalPoints, percentage } = projectScores;

  return (
    <div style={{ padding: 24 }}>
      {solScoringSection}
      {/* Summary header */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 160, padding: "16px 20px", background: "#fff", border: "1px solid rgba(226,232,240,.8)", borderRadius: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".6px", color: "#94a3b8", marginBottom: 6 }}>Total punctaj</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", fontFamily: "'JetBrains Mono', monospace" }}>
            {totalPoints}<span style={{ fontSize: 14, color: "#94a3b8", fontWeight: 600 }}>/{maxTotalPoints}</span>
          </div>
          <div style={{ marginTop: 8, height: 6, background: "#f0f2f5", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 3, width: `${percentage}%`, background: percentage >= 80 ? "#34d399" : percentage >= 50 ? "#2563eb" : "#fbbf24", transition: "width .3s" }} />
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>{Math.round(percentage)}%</div>
        </div>
        <div style={{ flex: 1, minWidth: 160, padding: "16px 20px", background: "#fff", border: "1px solid rgba(226,232,240,.8)", borderRadius: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".6px", color: "#94a3b8", marginBottom: 6 }}>Criterii evaluate</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a" }}>{scores.filter((s: any) => s.points != null).length}<span style={{ fontSize: 14, color: "#94a3b8", fontWeight: 600 }}>/{scores.length}</span></div>
        </div>
        <div style={{ display: "flex", alignItems: "center" }}>
          <button onClick={handleRecompute} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #2563eb", background: "rgba(37,99,235,.06)", color: "#2563eb", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            Recalculează
          </button>
        </div>
      </div>

      {/* Criteria list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {scores.map((s: any) => {
          const scored = s.points != null;
          const pct2 = scored && s.maxPoints > 0 ? Math.round((s.points / s.maxPoints) * 100) : 0;
          return (
            <div key={s.criteriaId} style={{ padding: "14px 18px", borderRadius: 12, border: "1px solid rgba(226,232,240,.8)", background: "#fff", transition: "all .15s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                {s.code && <span style={{ fontSize: 10, fontWeight: 700, color: "#2563eb", background: "rgba(37,99,235,.08)", padding: "2px 8px", borderRadius: 4, fontFamily: "'JetBrains Mono', monospace" }}>{s.code}</span>}
                <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", flex: 1 }}>{s.name}</span>
                <span style={{ fontSize: 14, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: !scored ? "#94a3b8" : pct2 >= 80 ? "#059669" : pct2 >= 50 ? "#2563eb" : "#d97706" }}>
                  {scored ? s.points : "—"}<span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>/{s.maxPoints}</span>
                </span>
              </div>
              {scored && (
                <div style={{ height: 4, background: "#f0f2f5", borderRadius: 2, overflow: "hidden", marginBottom: 6 }}>
                  <div style={{ height: "100%", borderRadius: 2, width: `${pct2}%`, background: pct2 >= 80 ? "#34d399" : pct2 >= 50 ? "#2563eb" : "#fbbf24" }} />
                </div>
              )}
              {s.reasoning && <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{s.reasoning}</div>}
              {s.inputElements && Object.keys(s.inputElements).length > 0 && (
                <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {Object.entries(s.inputElements).map(([k, v]) => (
                    <span key={k} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: "#f8fafc", border: "1px solid rgba(226,232,240,.8)", color: "#64748b", fontFamily: "'JetBrains Mono', monospace" }}>
                      {k}: {String(v)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
