"use client";
import { useState } from "react";

interface TablesTabProps {
  referenceTables: any[];
}

export default function TablesTab({ referenceTables }: TablesTabProps) {
  const [selectedRefTable, setSelectedRefTable] = useState<string | null>(null);

  if (referenceTables.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 200, color: "#8892a8", padding: 24 }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Niciun tabel de referință</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>Tabelele sunt extrase automat din ghidurile de finanțare procesate</div>
      </div>
    );
  }

  const selTable = selectedRefTable ? referenceTables.find((t: any) => t.id === selectedRefTable) : null;

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 400 }}>
      {/* Left: table list */}
      <div style={{ width: 280, borderRight: "1px solid rgba(226,232,240,.8)", overflow: "auto", padding: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".6px", color: "#94a3b8", marginBottom: 10, padding: "0 4px" }}>
          {referenceTables.length} tabele
        </div>
        {referenceTables.map((t: any) => (
          <div key={t.id}
            onClick={() => setSelectedRefTable(t.id === selectedRefTable ? null : t.id)}
            style={{
              padding: "10px 12px", borderRadius: 10, border: `1px solid ${selectedRefTable === t.id ? "#2563eb" : "rgba(226,232,240,.8)"}`,
              background: selectedRefTable === t.id ? "rgba(37,99,235,.03)" : "#fff",
              marginBottom: 6, cursor: "pointer", transition: "all .15s",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>{t.name}</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", padding: "2px 7px", borderRadius: 4, background: "rgba(37,99,235,.08)", color: "#2563eb" }}>{t.tableType}</span>
              {t.validated && <span style={{ fontSize: 10, color: "#059669", fontWeight: 700 }}>✓</span>}
              {t.sourcePage != null && <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}>p.{t.sourcePage}</span>}
            </div>
            {t.description && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, lineHeight: 1.4 }}>{t.description.slice(0, 80)}{t.description.length > 80 ? "…" : ""}</div>}
          </div>
        ))}
      </div>

      {/* Right: table detail */}
      <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
        {selTable ? (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>{selTable.name}</div>
              {selTable.description && <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5, marginBottom: 8 }}>{selTable.description}</div>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", padding: "3px 10px", borderRadius: 6, background: "rgba(37,99,235,.08)", color: "#2563eb" }}>{selTable.tableType}</span>
                {selTable.extractedBy && <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: "#f8fafc", color: "#64748b", border: "1px solid rgba(226,232,240,.8)" }}>{selTable.extractedBy === "ai" ? "Extras AI" : "Manual"}</span>}
                {selTable.validated && <span style={{ fontSize: 10, fontWeight: 700, color: "#059669", padding: "3px 10px", borderRadius: 6, background: "rgba(52,211,153,.08)" }}>✓ Validat</span>}
              </div>
            </div>
            {/* Data table */}
            {selTable.data && selTable.data.length > 0 && selTable.schema && (
              <div style={{ overflowX: "auto", border: "1px solid rgba(226,232,240,.8)", borderRadius: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {selTable.schema.map((col: any) => (
                        <th key={col.key} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: ".5px", color: "#94a3b8", borderBottom: "1px solid rgba(226,232,240,.8)" }}>
                          {col.label || col.key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selTable.data.map((row: any, ri: number) => (
                      <tr key={ri} style={{ borderBottom: ri < selTable.data.length - 1 ? "1px solid rgba(226,232,240,.5)" : "none" }}>
                        {selTable.schema.map((col: any) => (
                          <td key={col.key} style={{ padding: "8px 12px", color: "#0f172a", fontFamily: col.type === "number" ? "'JetBrains Mono', monospace" : "inherit" }}>
                            {row[col.key] ?? "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {/* Source text */}
            {selTable.sourceText && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".6px", color: "#94a3b8", marginBottom: 6 }}>Text sursă din ghid</div>
                <div style={{ fontSize: 12, lineHeight: 1.7, color: "#0f172a", padding: "10px 14px", borderLeft: "3px solid #2563eb", fontStyle: "italic", background: "rgba(37,99,235,.03)", borderRadius: "0 8px 8px 0" }}>
                  {selTable.sourceText}
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "#94a3b8", gap: 8 }}>
            <div style={{ fontSize: 36, opacity: 0.4 }}>📋</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#64748b" }}>Selectează un tabel</div>
            <div style={{ fontSize: 12, textAlign: "center", maxWidth: 240 }}>Alege un tabel din lista din stânga pentru a vedea datele și structura</div>
          </div>
        )}
      </div>
    </div>
  );
}
