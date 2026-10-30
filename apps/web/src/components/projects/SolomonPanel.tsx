"use client";
import { useState, useRef } from "react";
import type { SolomonChat } from "@/hooks/useSolomonChat";
import type { ElementItem, SolomonPhase } from "./types";

const pct = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0;

interface SolomonPanelProps {
  chat: SolomonChat;
  elements: ElementItem[];
  solomonPhase: SolomonPhase | null;
  solEligibility: any[];
  solScoring: any[];
  readOnly: boolean;
  /** Switch to the Elemente tab and open this element's detail panel. */
  onOpenElement: (elementId: string) => void;
}

/** Solomon tab: phase flow panel, chat and extracted elements. */
export default function SolomonPanel({
  chat, elements, solomonPhase, solEligibility, solScoring, readOnly, onOpenElement,
}: SolomonPanelProps) {
  const {
    chatBottomRef, chatRef, extractionStates, extractionValidations,
    handleChatScroll, handleConfirmElement, handleConfirmExtraction, handleRejectElement,
    handleRejectExtraction, handleSolomonModelChange, handleSolomonSend, handleSolomonStop,
    handleSolomonUpload, handleTextSelect, setSolomonET, setSolomonInput,
    setSolomonMessages, setSolomonSignals, solomonET, solomonElements,
    solomonInput, solomonMessages, solomonModel, solomonSignals,
    solomonSourceTrail, solomonStreaming, solomonTimedOut, solomonToolUse,
  } = chat;
  const elemFilled = elements.filter(e => e.value).length;
  const elemTotal = elements.length;
  const [expandedExtractions, setExpandedExtractions] = useState<Record<number, boolean>>({});
  const [editingExtraction, setEditingExtraction] = useState<string | null>(null);
  const [editingExtractionValue, setEditingExtractionValue] = useState("");
  const solomonFileRef = useRef<HTMLInputElement>(null);
  const [solomonDragOver, setSolomonDragOver] = useState(false);

  const cleanSolomonText = (text: string): string => {
    // Strip internal markup that backend embeds (ELEMENTS_JSON, METADATA_JSON blocks)
    // Backend format: <!--ELEMENTS_JSON[...]ELEMENTS_JSON--> and <!--METADATA_JSON{...}METADATA_JSON-->
    let cleaned = text
      // Primary format: <!--ELEMENTS_JSON[...]ELEMENTS_JSON-->
      .replace(/<!--ELEMENTS_JSON[\s\S]*?ELEMENTS_JSON-->/g, "")
      .replace(/<!--METADATA_JSON[\s\S]*?METADATA_JSON-->/g, "")
      // Alternative format: <!--ELEMENTS_JSON-->...<!--/ELEMENTS_JSON-->
      .replace(/<!--ELEMENTS_JSON-->[\s\S]*?<!--\/ELEMENTS_JSON-->/g, "")
      .replace(/<!--METADATA_JSON-->[\s\S]*?<!--\/METADATA_JSON-->/g, "")
      // Handle incomplete/streaming markers (no closing tag yet)
      .replace(/<!--ELEMENTS_JSON[\s\S]*$/g, "")
      .replace(/<!--METADATA_JSON[\s\S]*$/g, "")
      // Strip any remaining HTML comment blocks
      .replace(/<!--[\s\S]*?-->/g, "")
      // Clean up JSON artifacts that may leak
      .replace(/ELEMENTS_JSON\{[\s\S]*?\}/g, "")
      .replace(/METADATA_JSON\{[\s\S]*?\}/g, "")
      .replace(/ELEMENTS_JSON\[[\s\S]*?\]/g, "")
      .replace(/METADATA_JSON\[[\s\S]*?\]/g, "")
      // Strip standalone HTML entities
      .replace(/&lt;!--[\s\S]*?--&gt;/g, "")
      .replace(/&lt;!--[\s\S]*/g, "")
      .trim();
    // Remove trailing whitespace / newlines from cleanup
    cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
    return cleaned;
  };

  const renderMsgText = (text: string) => {
    const cleaned = cleanSolomonText(text);
    // Parse markdown into structured blocks for rich display
    const lines = cleaned.split("\n");
    const blocks: React.ReactNode[] = [];
    let currentList: string[] = [];
    let blockKey = 0;

    const flushList = () => {
      if (currentList.length === 0) return;
      blocks.push(
        <ul key={blockKey++} className="solomon-md-list">
          {currentList.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      currentList = [];
    };

    const renderInline = (line: string): React.ReactNode => {
      // Handle **bold**, *italic*, `code`, [links](url), and plain text
      const parts = line.split(/(\*\*.*?\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/).filter(Boolean);
      return parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="solomon-md-bold">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("*") && part.endsWith("*") && !part.startsWith("**")) {
          return <em key={i} className="solomon-md-italic">{part.slice(1, -1)}</em>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return <code key={i} className="solomon-md-code">{part.slice(1, -1)}</code>;
        }
        // Markdown links: [text](url)
        const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (linkMatch) {
          return <a key={i} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="solomon-md-link">{linkMatch[1]}</a>;
        }
        return part;
      });
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Empty line — flush list and add spacer
      if (!trimmed) {
        flushList();
        continue;
      }

      // Headings
      if (trimmed.startsWith("### ")) {
        flushList();
        blocks.push(<h4 key={blockKey++} className="solomon-md-h3">{renderInline(trimmed.slice(4))}</h4>);
        continue;
      }
      if (trimmed.startsWith("## ")) {
        flushList();
        blocks.push(<h3 key={blockKey++} className="solomon-md-h2">{renderInline(trimmed.slice(3))}</h3>);
        continue;
      }
      if (trimmed.startsWith("# ")) {
        flushList();
        blocks.push(<h3 key={blockKey++} className="solomon-md-h2">{renderInline(trimmed.slice(2))}</h3>);
        continue;
      }

      // Blockquote (> text) — used for guide citations
      if (trimmed.startsWith("> ")) {
        flushList();
        // Collect consecutive blockquote lines
        const quoteLines: string[] = [trimmed.slice(2)];
        while (i + 1 < lines.length && lines[i + 1].trim().startsWith("> ")) {
          i++;
          quoteLines.push(lines[i].trim().slice(2));
        }
        blocks.push(
          <blockquote key={blockKey++} className="solomon-md-quote">
            {quoteLines.map((ql, qi) => <p key={qi}>{renderInline(ql)}</p>)}
          </blockquote>
        );
        continue;
      }

      // Code block (```)
      if (trimmed.startsWith("```")) {
        flushList();
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith("```")) {
          codeLines.push(lines[i]);
          i++;
        }
        blocks.push(
          <pre key={blockKey++} className="solomon-md-codeblock">{codeLines.join("\n")}</pre>
        );
        continue;
      }

      // Numbered list (1. 2. 3.) — keep numbers
      const numberedMatch = trimmed.match(/^(\d+)[.)]\s+(.+)/);
      if (numberedMatch) {
        currentList.push(numberedMatch[1] + ". " + numberedMatch[2]);
        continue;
      }

      // Bullet points (-, •, *)
      const bulletMatch = trimmed.match(/^[-•*]\s+(.+)/);
      if (bulletMatch) {
        currentList.push(bulletMatch[1]);
        continue;
      }

      // Horizontal rule
      if (/^[-=_]{3,}$/.test(trimmed) || /^═+$/.test(trimmed)) {
        flushList();
        blocks.push(<hr key={blockKey++} className="solomon-md-hr" />);
        continue;
      }

      // Markdown table detection: line starts with |
      if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
        flushList();
        // Collect all table rows
        const tableRows: string[] = [trimmed];
        while (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          if (nextLine.startsWith("|") && nextLine.endsWith("|")) {
            tableRows.push(nextLine);
            i++;
          } else {
            break;
          }
        }
        // Parse: first row = header, second row = separator (skip), rest = data
        const parseRow = (row: string) =>
          row.split("|").slice(1, -1).map(cell => cell.trim());
        const headers = parseRow(tableRows[0]);
        const dataRows = tableRows
          .slice(1)
          .filter(r => !/^[\s|:-]+$/.test(r)) // skip separator rows like |---|---|
          .map(parseRow);

        blocks.push(
          <div key={blockKey++} className="solomon-md-table-wrap">
            <table className="solomon-md-table">
              <thead>
                <tr>
                  {headers.map((h, hi) => (
                    <th key={hi}>{renderInline(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci}>{renderInline(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }

      // Regular paragraph
      flushList();
      blocks.push(<p key={blockKey++} className="solomon-md-p">{renderInline(trimmed)}</p>);
    }

    flushList();

    return <div className="solomon-md-content">{blocks}</div>;
  };

  return (
    <div className="solomon-layout">
      {/* Left panel — Flux Dosar */}
      {(() => {
        // Phase tree structure — derived from solomonPhase + eligibility + scoring data
        // Phase structure: stages group Q items. Status is derived from solomonPhase (from Solomon AI).
        // Solomon emits the current phase via PHASE_JSON at each response.
        // The structure below maps Q phases to UI stages and element categories.
        // It mirrors the Q0-Q11 phases defined in Solomon's system prompt.
        const PHASE_STAGES = [
          { num: 1, name: "Analiză", desc: "Despre ce e vorba?", phases: [
            { q: "Q0", defaultLabel: "De ce?", categories: ["beneficiary"] },
            { q: "Q1", defaultLabel: "Identificare", categories: ["beneficiary", "legal"] },
          ]},
          { num: 2, name: "Eligibilitate", desc: "Poate aplica?", phases: [
            { q: "Q2", defaultLabel: "Eligibilitate", categories: ["farm", "technical"] },
            { q: "Q3", defaultLabel: "Firme legate", categories: ["legal"] },
          ]},
          { num: 3, name: "Evaluare șanse", desc: "Merită să scriem?", phases: [
            { q: "Q4", defaultLabel: "Dimensionare", categories: ["investment", "financial"] },
            { q: "Q5", defaultLabel: "Punctaj", categories: ["farm", "investment", "location"] },
            { q: "Q6", defaultLabel: "Constrângeri", categories: ["legal", "technical"] },
          ]},
          { num: 4, name: "Scriere proiect", desc: "E gata dosarul?", phases: [
            { q: "Q7", defaultLabel: "Colectare date", categories: ["beneficiary", "financial", "farm", "investment"] },
            { q: "Q8", defaultLabel: "Documente", categories: ["legal"] },
            { q: "Q9", defaultLabel: "Generare", categories: ["other"] },
          ]},
        ];

        const currentQ = solomonPhase?.phase || "";
        const currentQNum = parseInt(currentQ.replace("Q", "")) || -1;

        // Use Solomon's label for the active phase, default labels for others
        const getPhaseLabel = (phase: { q: string; defaultLabel: string }) => {
          if (phase.q === currentQ && solomonPhase?.label) return solomonPhase.label;
          return phase.defaultLabel;
        };

        // Determine which Q is "active" for filtering elements
        const getQStatus = (q: string) => {
          const qNum = parseInt(q.replace("Q", ""));
          if (qNum < currentQNum) return "done";
          if (qNum === currentQNum) return "active";
          return "pending";
        };

        const getStageStatus = (stage: typeof PHASE_STAGES[0]) => {
          const statuses = stage.phases.map(p => getQStatus(p.q));
          if (statuses.every(s => s === "done")) return "done";
          if (statuses.some(s => s === "active")) return "active";
          return "pending";
        };

        // Badge for Q items — element counts, scoring, eligibility info
        const getQBadge = (q: string, categories: string[]) => {
          const catElements = elements.filter(e => categories.includes(e.category));
          const filled = catElements.filter(e => e.value).length;
          const total = catElements.length;
          if (total === 0) return null;
          return `${filled}/${total}`;
        };

        // Get Q-specific badges (eligibility count, scoring estimate)
        const getQSpecialBadge = (q: string) => {
          if (q === "Q2" || q === "Q3") {
            const passed = solEligibility.filter((e: any) => e.status === "pass").length;
            const total = solEligibility.length;
            if (total > 0) return `${passed}/${total}`;
          }
          if (q === "Q5") {
            const totalPts = solScoring.reduce((s: number, e: any) => s + (e.pointsEstimated || e.points || 0), 0);
            if (totalPts > 0) return `~${totalPts}p`;
          }
          return null;
        };

        return (
          <div className="solomon-flux-panel">
            <div className="sfp-header">Flux Dosar</div>
            <div className="sfp-scroll">
              {PHASE_STAGES.map(stage => {
                const stageStatus = getStageStatus(stage);
                return (
                  <div key={stage.num} className="sfp-stage">
                    <div className="sfp-stage-header">
                      <div className={`sfp-stage-num ${stageStatus}`}>{stage.num}</div>
                      <div className="sfp-stage-info">
                        <div className="sfp-stage-name">{stage.name}</div>
                        <div className="sfp-stage-desc">{stage.desc}</div>
                      </div>
                      {stageStatus === "done" && <span className="sfp-stage-check">✓</span>}
                    </div>
                    <div className="sfp-items">
                      {stage.phases.map(phase => {
                        const status = getQStatus(phase.q);
                        const badge = getQSpecialBadge(phase.q) || getQBadge(phase.q, phase.categories);
                        return (
                          <div
                            key={phase.q}
                            className={`sfp-item ${status === "active" ? "active" : ""}`}
                            onClick={() => {
                              // Clicking a Q sends a prompt to Solomon to focus on that phase
                              if (status !== "pending") return;
                              const prompt = `Hai să trecem la ${phase.q} — ${getPhaseLabel(phase)}.`;
                              setSolomonInput(prompt);
                            }}
                          >
                            <span className={`sfp-item-dot ${status}`} />
                            <span>{phase.q} {getPhaseLabel(phase)}</span>
                            {badge && <span className={`sfp-item-badge ${status}`}>{badge}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
      {/* Chat area */}
      <div
        className={`solomon-chat${solomonDragOver ? " drag-active" : ""}`}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setSolomonDragOver(true); }}
        onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setSolomonDragOver(false); }}
        onDrop={e => {
          e.preventDefault();
          e.stopPropagation();
          setSolomonDragOver(false);
          const fileList = e.dataTransfer.files;
          if (fileList && fileList.length > 0) {
            const files = Array.from(fileList);
            handleSolomonUpload(files.length === 1 ? files[0] : files);
          }
        }}
      >
        {solomonDragOver && (
          <div className="solomon-drop-overlay">
            <div className="solomon-drop-icon">&#128206;</div>
            <div className="solomon-drop-text">Eliberează pentru upload documente</div>
          </div>
        )}
        {/* Toolbar: avatar + model selector + ET toggle */}
        <div className="solomon-toolbar">
          <div className="solomon-toolbar-inner">
            <div className="solomon-avatar">S</div>
            <div className="solomon-name-block">
              <span className="sn-name">Solomon</span>
              <span className="sn-status"><span className="sn-status-dot" /> Online</span>
            </div>
            <div className="model-selector">
              <button className={`model-btn${solomonModel === "sonnet" ? " active" : ""}`} onClick={() => handleSolomonModelChange("sonnet")} disabled={solomonStreaming}>Sonnet</button>
              <button className={`model-btn${solomonModel === "opus" ? " active" : ""}`} onClick={() => handleSolomonModelChange("opus")} disabled={solomonStreaming}>Opus</button>
            </div>
            <button className={`et-toggle${solomonET ? " on" : ""}`} onClick={() => setSolomonET(prev => !prev)} disabled={solomonStreaming}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L9.19 8.63L2 9.24L7.46 13.97L5.82 21L12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.63L12 2Z"/></svg>
              ET
            </button>
          </div>
        </div>
        {/* Phase badge (top-right of toolbar) */}
        {solomonPhase && (
          <div style={{ position: "absolute", top: 8, right: 16, display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", background: "#eff6ff", borderRadius: 8, border: "1px solid #bfdbfe", zIndex: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#2563eb", fontFamily: "'JetBrains Mono', monospace" }}>
              Faza {(() => {
                const qNum = parseInt(solomonPhase.phase.replace("Q", "")) || 0;
                if (qNum <= 1) return "1";
                if (qNum <= 3) return "2";
                if (qNum <= 6) return "3";
                return "4";
              })()}
            </span>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>·</span>
            <span style={{ fontSize: 12, color: "#1e40af" }}>
              {solomonPhase.regression ? "↺ " : ""}{solomonPhase.phase} {solomonPhase.label}
            </span>
          </div>
        )}
        {/* FIX L: Regression indicator */}
        {solomonPhase?.regression && (
          <div style={{ padding: "4px 20px", background: "#fffbeb", borderBottom: "1px solid #fde68a" }}>
            <div style={{ maxWidth: 720, margin: "0 auto", fontSize: 11, color: "#92400e" }}>
              ↺ Revenire din {solomonPhase.regression.from}: {solomonPhase.regression.reason}
            </div>
          </div>
        )}
        {/* FIX K: Active signals */}
        {solomonSignals.filter(s => !s.dismissed).length > 0 && (
          <div style={{ padding: "4px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
            {solomonSignals.filter(s => !s.dismissed).map((sig, i) => {
              const colors: Record<string, { border: string; bg: string; text: string }> = {
                risc: { border: "#dc2626", bg: "#fef2f2", text: "#991b1b" },
                bucla: { border: "#d97706", bg: "#fffbeb", text: "#92400e" },
                discutie_client: { border: "#2563eb", bg: "#eff6ff", text: "#1e40af" },
                baza_cunostinte: { border: "#7c3aed", bg: "#f5f3ff", text: "#5b21b6" },
              };
              const c = colors[sig.signalType] || colors.risc;
              const icons: Record<string, string> = { risc: "!", bucla: "↺", discutie_client: "?", baza_cunostinte: "i" };
              return (
                <div key={i} style={{ borderLeft: `3px solid ${c.border}`, background: c.bg, padding: "6px 10px", borderRadius: "0 6px 6px 0", display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: c.text, flexShrink: 0, width: 14, textAlign: "center" }}>{icons[sig.signalType] || "!"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: c.text, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      {sig.signalType.replace("_", " ")} {sig.severity === "high" ? "· BLOCHANT" : ""}
                    </div>
                    <div style={{ fontSize: 12, color: c.text }}>{sig.message}</div>
                  </div>
                  {sig.severity !== "high" && (
                    <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: c.text, opacity: 0.5, padding: 0 }}
                      onClick={() => setSolomonSignals(prev => prev.map((s, j) => j === i ? { ...s, dismissed: true } : s))}
                    >✕</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {/* FIX I: Source trail — persistent per turn */}
        {solomonSourceTrail.length > 0 && (
          <div style={{ padding: "6px 20px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
            <div style={{ maxWidth: 720, margin: "0 auto" }}>
              {solomonSourceTrail.map((trail, ti) => (
                <div key={ti} style={{ borderLeft: "2px solid #2563eb", paddingLeft: 12, marginBottom: ti < solomonSourceTrail.length - 1 ? 8 : 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: "#64748b", marginBottom: 4 }}>
                    {trail.query}
                  </div>
                  {trail.sources.map((src, si) => (
                    <div key={si} style={{ display: "flex", alignItems: "flex-start", gap: 8, paddingLeft: 2, marginBottom: 2 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#2563eb", flexShrink: 0, marginTop: 5 }} />
                      <div>
                        <span style={{ fontSize: 12, color: "#1e293b" }}>
                          {[src.docType, src.section && `§ ${src.section}`, src.page && `pag. ${src.page}`].filter(Boolean).join(" · ")}
                        </span>
                        {src.layer && <span style={{ fontSize: 10, color: "#64748b", fontFamily: "'JetBrains Mono', monospace", marginLeft: 6 }}>{src.layer}</span>}
                      </div>
                    </div>
                  ))}
                  <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{trail.sources.length} surse</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Tool use loading indicator (while searching) */}
        {solomonToolUse && (
          <div style={{ padding: "4px 20px", background: "#eff6ff" }}>
            <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#2563eb" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#2563eb", animation: "statusPulse 1s ease infinite" }} />
              <span>Se caută: {solomonToolUse.query || "..."}</span>
            </div>
          </div>
        )}
        {/* Messages */}
        <div className="chat-messages" ref={chatRef} onScroll={handleChatScroll} onMouseUp={handleTextSelect}>
          <div className="chat-messages-inner">
          {solomonMessages.map((msg, msgIdx) => (
            <div key={msgIdx} className={`solomon-msg ${msg.role === "assistant" ? "solomon-msg-left" : "solomon-msg-right"}`}>
              <div className="solomon-msg-body">
                <div className="solomon-msg-text">
                {renderMsgText(msg.text)}
                {msg.extractions && (() => {
                  const allExtractions = msg.extractions;
                  const pendingIndices = allExtractions.map((_: any, i: number) => i).filter((i: number) => !extractionStates[`${msgIdx}-${i}`]);
                  const confirmedCount = allExtractions.filter((_: any, i: number) => extractionStates[`${msgIdx}-${i}`] === "confirmed").length;
                  const rejectedCount = allExtractions.filter((_: any, i: number) => extractionStates[`${msgIdx}-${i}`] === "rejected").length;
                  const allResolved = pendingIndices.length === 0 && allExtractions.length > 0;

                  // All extractions resolved — show collapsed summary
                  if (allResolved) {
                    return (
                      <div
                        className="exc-collapsed-summary"
                        onClick={() => setExpandedExtractions(prev => ({ ...prev, [msgIdx]: !prev[msgIdx] }))}
                      >
                        <span className="exc-collapsed-icon">{confirmedCount > 0 ? "\u2713" : "\u2715"}</span>
                        <span className="exc-collapsed-text">
                          {confirmedCount > 0 && `${confirmedCount} salvate`}
                          {confirmedCount > 0 && rejectedCount > 0 && ", "}
                          {rejectedCount > 0 && `${rejectedCount} respinse`}
                        </span>
                        <span className="exc-collapsed-toggle">{expandedExtractions[msgIdx] ? "\u25B2" : "\u25BC"}</span>
                      </div>
                    );
                  }

                  return (
                  <div className="extraction-cards">
                    {pendingIndices.length > 1 && (
                      <div className="confirm-all-bar">
                        <span>{pendingIndices.length} extracții de confirmat</span>
                        <button
                          className="exc-btn confirm-btn"
                          onClick={(e) => { e.stopPropagation(); pendingIndices.forEach((i: number) => handleConfirmExtraction(msgIdx, i)); }}
                        >
                          &#10003; Confirmă toate
                        </button>
                      </div>
                    )}
                    {allExtractions.map((ext: any, extIdx: number) => {
                      const k = `${msgIdx}-${extIdx}`;
                      const state = extractionStates[k];
                      // Hide confirmed/rejected cards (collapsed by default)
                      if (state && !expandedExtractions[msgIdx]) return null;
                      return (
                        <div key={extIdx} className={`extraction-card ${state || ""}`}>
                          <div className="exc-top">
                            <span className="exc-label">{state === "confirmed" ? "\u2713 " : ""}{ext.label || ext.key || "Element"}</span>
                            <span className="exc-confidence">{ext.source || (ext.confidence >= 0.9 ? "confirmat automat" : ext.confidence > 0 ? `conf. ${Math.round(ext.confidence * 100)}%` : "")}</span>
                          </div>
                          {editingExtraction === k ? (
                            <input
                              className="exc-value"
                              autoFocus
                              value={editingExtractionValue}
                              onChange={(e) => setEditingExtractionValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  setSolomonMessages(prev => {
                                    const updated = [...prev];
                                    const m = { ...updated[msgIdx] };
                                    const exts = [...(m.extractions || [])];
                                    exts[extIdx] = { ...exts[extIdx], value: editingExtractionValue };
                                    m.extractions = exts;
                                    updated[msgIdx] = m;
                                    return updated;
                                  });
                                  setEditingExtraction(null);
                                } else if (e.key === "Escape") {
                                  setEditingExtraction(null);
                                }
                              }}
                              onBlur={() => {
                                setSolomonMessages(prev => {
                                  const updated = [...prev];
                                  const m = { ...updated[msgIdx] };
                                  const exts = [...(m.extractions || [])];
                                  exts[extIdx] = { ...exts[extIdx], value: editingExtractionValue };
                                  m.extractions = exts;
                                  updated[msgIdx] = m;
                                  return updated;
                                });
                                setEditingExtraction(null);
                              }}
                              style={{ width: "100%", background: "#fff", border: "1px solid #2563eb", borderRadius: 6, padding: "4px 8px", fontSize: 13, fontFamily: "var(--font-mono, monospace)" }}
                            />
                          ) : (
                            <div className="exc-value">{(() => {
                              const v = ext.value;
                              if (!v) return "-";
                              if (typeof v === "string" && v.startsWith("[")) {
                                try {
                                  const arr = JSON.parse(v);
                                  if (Array.isArray(arr)) {
                                    return arr.map((item: any) =>
                                      typeof item === "object"
                                        ? Object.entries(item).map(([k2, v2]) => `${k2}: ${v2}`).join(", ")
                                        : String(item)
                                    ).join(" | ");
                                  }
                                } catch { /* not JSON */ }
                              }
                              if (typeof v === "string" && v.startsWith("{")) {
                                try {
                                  const obj = JSON.parse(v);
                                  return Object.entries(obj).map(([k2, v2]) => `${k2}: ${v2}`).join(", ");
                                } catch { /* not JSON */ }
                              }
                              return v;
                            })()}</div>
                          )}
                          {!state ? (
                            <div className="exc-actions">
                              <button className="exc-btn confirm-btn" onClick={(e) => { e.stopPropagation(); handleConfirmExtraction(msgIdx, extIdx); }}>
                                &#10003; Confirmă
                              </button>
                              <button className="exc-btn edit-btn" title="Editează înainte de confirmare" onClick={(e) => {
                                e.stopPropagation();
                                setEditingExtraction(k);
                                setEditingExtractionValue(ext.value);
                              }}>
                                &#9998; Editează
                              </button>
                              <button className="exc-btn reject-btn" onClick={(e) => { e.stopPropagation(); handleRejectExtraction(msgIdx, extIdx); }}>
                                &#10005; Respinge
                              </button>
                            </div>
                          ) : state === "confirmed" ? (
                            <>
                              <div className="exc-confirmed-label">&#10003; Salvat în Elemente</div>
                              {extractionValidations[k] && extractionValidations[k].totalChecks > 0 && (
                                <div className="solomon-validation-card">
                                  <div className="svc-header">
                                    &#128269; Validare referință ({extractionValidations[k].passed}/{extractionValidations[k].totalChecks} trecute)
                                  </div>
                                  <div className="svc-results">
                                    {extractionValidations[k].validationResults.map((vr: any, vri: number) => (
                                      <div className="svc-result" key={vri}>
                                        <span className={`svc-status ${vr.status}`}>
                                          {vr.status === "passed" ? "&#10003;" : vr.status === "failed" ? "&#10005;" : vr.status === "warning" ? "!" : "i"}
                                        </span>
                                        <div>
                                          <div className="svc-text">{vr.message}</div>
                                          {vr.referenceTable && <div className="svc-ref">&#128202; {vr.referenceTable.name}</div>}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="exc-rejected-label">&#10005; Respins</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  );
                })()}
                </div>
              </div>
            </div>
          ))}
          {solomonStreaming && solomonMessages.length > 0 && solomonMessages[solomonMessages.length - 1]?.role === "user" && (
            <div className="solomon-msg">
              <div className="solomon-msg-avatar ai">S</div>
              <div className="solomon-msg-body">
                <div style={{ display: "flex", gap: 4, padding: "8px 0" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#94a3b8", animation: "bounce 1.4s infinite ease-in-out" }} />
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#94a3b8", animation: "bounce 1.4s infinite ease-in-out 0.16s" }} />
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#94a3b8", animation: "bounce 1.4s infinite ease-in-out 0.32s" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={chatBottomRef} />
          </div>
        </div>

        {/* F6.1: Timeout warning */}
        {solomonStreaming && solomonTimedOut && (
          <div style={{ padding: "8px 16px", background: "#fef3c7", borderTop: "1px solid #fde68a", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14 }}>&#9888;</span>
            <span style={{ fontSize: 12, color: "#92400e" }}>Răspunsul durează mai mult decât de obicei. Modelul Extended Thinking poate necesita până la 2 minute.</span>
          </div>
        )}

        {/* Input area */}
        <div className="chat-input-area">
          <div className="chat-input-inner">
            <input
              ref={solomonFileRef}
              type="file"
              multiple
              accept=".pdf,.docx,.xlsx,.doc,.png,.jpg,.jpeg"
              style={{ display: "none" }}
              onChange={e => {
                const fileList = e.target.files;
                if (fileList && fileList.length > 0) {
                  const files = Array.from(fileList);
                  handleSolomonUpload(files.length === 1 ? files[0] : files);
                }
                e.target.value = "";
              }}
            />
            <div className="chat-input-wrapper">
              <div className="chat-input-row">
                <textarea
                  className="chat-input"
                  data-solomon-input
                  placeholder="Scrie detalii despre proiect, lipește date sau poze, sau întreabă..."
                  value={solomonInput}
                  rows={3}
                  onChange={e => {
                    setSolomonInput(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSolomonSend();
                      (e.target as HTMLTextAreaElement).style.height = "auto";
                    }
                  }}
                  onPaste={e => {
                    const items = e.clipboardData?.items;
                    if (!items) return;
                    for (let i = 0; i < items.length; i++) {
                      if (items[i].type.startsWith("image/")) {
                        e.preventDefault();
                        const blob = items[i].getAsFile();
                        if (blob) {
                          const ext = blob.type === "image/png" ? "png" : "jpg";
                          const file = new File([blob], `clipboard_${Date.now()}.${ext}`, { type: blob.type });
                          handleSolomonUpload(file);
                        }
                        return;
                      }
                    }
                  }}
                />
                <div className="chat-input-toolbar">
                  <button className="chat-attach-btn" title="Atașează document sau imagine" onClick={() => solomonFileRef.current?.click()} disabled={solomonStreaming || readOnly}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </button>
                  <div style={{ flex: 1 }} />
                  {solomonStreaming ? (
                    <button className="chat-btn send" onClick={handleSolomonStop} title="Oprește generarea" style={{ background: "linear-gradient(135deg, #94a3b8 0%, #64748b 100%)", boxShadow: "0 2px 8px rgba(100,116,139,.25)" }}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="1" y="1" width="12" height="12" rx="2.5"/></svg>
                    </button>
                  ) : (
                    <button className="chat-btn send" onClick={handleSolomonSend}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="chat-hint">Scrie „analiză detaliată" sau „opus" pentru gândire aprofundată</div>
          </div>
        </div>
      </div>

      {/* Elements panel — grouped by category, filtered by current phase */}
      <div className="solomon-elements-panel">
        <div className="sep-header">
          <div className="sep-header-top">
            <span className="sep-header-title">Elemente proiect</span>
            <span className="sep-count">{elemFilled} / {elemTotal}</span>
          </div>
          <div className="sep-progress-bar">
            <div className="sep-progress-fill" style={{ width: `${pct(elemFilled, elemTotal)}%` }} />
          </div>
          {solomonPhase && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#2563eb", background: "#eff6ff", padding: "2px 8px", borderRadius: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                {solomonPhase.phase}
              </span>
              <span style={{ fontSize: 11, color: "#64748b" }}>{solomonPhase.label}</span>
            </div>
          )}
        </div>
        <div className="sep-scroll">
          {/* Solomon proposed elements not yet in DB — show first */}
          {solomonElements.filter(se => se.status !== "confirmat" && !elements.some(e => e.key === se.key && e.value)).length > 0 && (
            <div className="sep-category-group">
              <div className="sep-category-title">DE CONFIRMAT</div>
              {solomonElements.filter(se => se.status !== "confirmat" && !elements.some(e => e.key === se.key && e.value)).map((el, i) => (
                <div key={`sol-${el.key}-${i}`} className="sep-row is-proposed">
                  <div className="sep-row-left">
                    <span className="sep-row-icon proposed">&#9888;</span>
                    <div className="sep-row-info">
                      <div className="sep-row-label">{el.label}</div>
                      <div className="sep-row-value proposed">{el.value}</div>
                    </div>
                  </div>
                  {!readOnly && (
                    <div className="sep-row-actions">
                      <button className="sep-mini-btn confirm" onClick={() => handleConfirmElement(solomonElements.indexOf(el))} title="Confirmă">&#10003;</button>
                      <button className="sep-mini-btn reject" onClick={() => handleRejectElement(solomonElements.indexOf(el))} title="Respinge">&#10005;</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {/* All project elements grouped by category — filtered by current phase */}
          {(() => {
            const CATEGORY_LABELS: Record<string, string> = {
              beneficiary: "REPREZENTANT",
              financial: "DATE FINANCIARE",
              farm: "EXPLOATAȚIE",
              investment: "INVESTIȚIE",
              location: "LOCAȚIE",
              legal: "DATE JURIDICE",
              technical: "DATE TEHNICE",
              other: "ALTE DATE",
            };
            const CATEGORY_ORDER = ["beneficiary", "financial", "farm", "investment", "location", "legal", "technical", "other"];

            // Phase → category mapping — derived from the same structure as Flux Dosar panel
            // These map Solomon's Q phases to element categories for filtering
            const PHASE_CATEGORIES: Record<string, string[]> = {};
            for (const stage of [
              { phases: [{ q: "Q0", cats: ["beneficiary"] }, { q: "Q1", cats: ["beneficiary", "legal"] }] },
              { phases: [{ q: "Q2", cats: ["farm", "technical"] }, { q: "Q3", cats: ["legal"] }] },
              { phases: [{ q: "Q4", cats: ["investment", "financial"] }, { q: "Q5", cats: ["farm", "investment", "location"] }, { q: "Q6", cats: ["legal", "technical"] }] },
              { phases: [{ q: "Q7", cats: ["beneficiary", "financial", "farm", "investment"] }, { q: "Q8", cats: ["legal"] }, { q: "Q9", cats: ["other"] }] },
            ]) { for (const p of stage.phases) PHASE_CATEGORIES[p.q] = p.cats; }

            const currentQ = solomonPhase?.phase || "";
            const activeCategories = PHASE_CATEGORIES[currentQ];

            // If we have an active phase with mapped categories, show those first
            // Then show remaining categories collapsed
            let filteredOrder: string[];
            if (activeCategories && activeCategories.length > 0) {
              // Active categories first, then the rest
              const remaining = CATEGORY_ORDER.filter(c => !activeCategories.includes(c));
              filteredOrder = [...activeCategories, ...remaining];
            } else {
              filteredOrder = CATEGORY_ORDER;
            }

            const grouped = filteredOrder
              .map(cat => ({
                cat,
                label: CATEGORY_LABELS[cat],
                items: elements.filter(e => e.category === cat),
                isPhaseRelevant: activeCategories ? activeCategories.includes(cat) : true,
              }))
              .filter(g => g.items.length > 0);

            return grouped.map(group => (
              <div key={group.cat} className="sep-category-group" style={!group.isPhaseRelevant ? { opacity: 0.45 } : undefined}>
                <div className="sep-category-title" style={group.isPhaseRelevant && activeCategories?.length ? { color: "#2563eb" } : undefined}>{group.label}</div>
                {group.items.map(el => (
                  <div key={el.id} className={`sep-row ${el.status} clickable`} onClick={() => {
                    if (el.value) {
                      // Navigate to Elemente tab and open the element's detail panel
                      onOpenElement(el.id);
                    } else {
                      // Send directly — include key so Solomon can emit ELEMENTS_JSON
                      const prompt = `Completează elementul "${el.label}" (cheie: ${el.key}). Propune o valoare bazată pe datele firmei, ghidul de finanțare și conversația anterioară. Salvează valoarea în ELEMENTS_JSON.`;
                      setSolomonInput(prompt);
                      // Auto-send after state update
                      setTimeout(() => {
                        const sendBtn = document.querySelector(".chat-btn.send") as HTMLButtonElement;
                        if (sendBtn) sendBtn.click();
                      }, 50);
                    }
                  }}>
                    <div className="sep-row-left">
                      <span className={`sep-row-icon ${el.status}`}>
                        {el.status === "confirmat" ? "\u2713" : el.status === "propus_ai" ? "\u26A0" : el.status === "conflict" ? "\u26A1" : "\u25CB"}
                      </span>
                      <div className="sep-row-info">
                        <div className="sep-row-label">{el.label}</div>
                        <div className="sep-row-key">{el.key}</div>
                        {el.value ? (
                          <div className={`sep-row-value ${el.status}`}>{el.value}</div>
                        ) : (
                          <div className="sep-row-value empty">De completat</div>
                        )}
                      </div>
                    </div>
                    {el.value && <span className="sep-row-arrow">&rsaquo;</span>}
                  </div>
                ))}
              </div>
            ));
          })()}
        </div>
      </div>
    </div>
  );
}
