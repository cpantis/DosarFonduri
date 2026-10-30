/** Scoped styles for the project view page (rendered via <style> while the page is mounted). */
export const PROJECT_VIEW_CSS = `
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        .skeleton-shimmer{background:linear-gradient(90deg,#f1f5f9 25%,rgba(226,232,240,.8) 50%,#f1f5f9 75%);background-size:200% 100%;animation:shimmer 1.5s ease-in-out infinite}
        .lock-banner{display:flex;align-items:center;gap:10px;padding:10px 24px;background:#fffbeb;border-bottom:1px solid #fde68a;font-size:13px;color:#d97706;font-family:'Inter',system-ui,sans-serif}
        .lock-banner .lb-icon{font-size:18px}
        .lock-banner .lb-name{font-weight:700;color:#d97706}
        .lock-banner .lb-retry{margin-left:auto;padding:4px 12px;border-radius:6px;border:1px solid #fbbf24;background:#fef3c7;color:#92400e;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s}
        .lock-banner .lb-retry:hover{background:#fde68a;border-color:#f59e0b}
        .lock-banner .lb-retry:disabled{opacity:.5;cursor:not-allowed}
        .lock-banner .lb-time{font-size:11px;color:#94a3b8;font-weight:600}
        .pv-container{display:flex;flex-direction:column;height:100vh;overflow:hidden;background:#f8fafc}

        .pv-project-header{padding:14px 28px;background:#ffffff;display:flex;align-items:center;gap:10px;border-bottom:1px solid #e2e8f0;flex-shrink:0;min-height:52px}
        .pv-breadcrumb{font-size:12px;color:#94a3b8;display:flex;align-items:center;gap:6px}
        .pv-breadcrumb a{color:#94a3b8;text-decoration:none;cursor:pointer;font-weight:500;transition:color .15s}
        .pv-breadcrumb a:hover{color:#4d8bff}
        .pv-breadcrumb .pv-bc-sep{color:#cbd5e1;font-size:11px}
        .pv-title{font-size:16px;font-weight:800;color:#0f172a;letter-spacing:-.3px}
        .pv-status-pill{display:inline-flex;align-items:center;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:600;letter-spacing:.3px;border:1px solid transparent;margin-left:auto}

        .pv-tabs{display:flex;gap:2px;background:#ffffff;padding:0 24px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;border-bottom:1px solid #e2e8f0;flex-shrink:0}
        .pv-tabs::-webkit-scrollbar{display:none}
        .pv-tab{padding:0 16px;height:44px;font-size:13px;font-weight:600;color:#94a3b8;cursor:pointer;border-bottom:2px solid transparent;transition:all .15s cubic-bezier(.4,0,.2,1);background:none;border-top:none;border-left:none;border-right:none;font-family:'Inter',system-ui,sans-serif;white-space:nowrap;display:flex;align-items:center;gap:6px;position:relative}
        .pv-tab:hover{color:#475569;background:rgba(248,250,252,.8)}
        .pv-tab.active{color:#0f172a;border-bottom-color:#4d8bff;background:transparent}
        .pv-tab-badge{font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;font-variant-numeric:tabular-nums;font-family:'JetBrains Mono',monospace;letter-spacing:-.3px}
        .pv-tab-badge.neutral{background:#f1f5f9;color:#cbd5e1}
        .pv-tab-badge.blue{background:rgba(77,139,255,.1);color:#4d8bff}
        .pv-tab-badge.green{background:rgba(52,211,153,.12);color:#059669}
        .pv-tab-badge.red{background:rgba(248,113,113,.1);color:#dc2626}

        .main-content{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;min-height:0}
        .content-body{flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0}

        /* Sumar */
        .sumar-panel{padding:24px;overflow-y:auto;flex:1;min-height:0}
        .sumar-progress{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px}
        .sp-card{padding:14px 20px;border-radius:12px;border:1px solid rgba(226,232,240,.7);background:#ffffff;transition:all .2s}
        .sp-card .sp-val{font-size:24px;font-weight:600;margin-bottom:2px}
        .sp-card .sp-label{font-size:13px;color:#94a3b8}
        .sumar-activity{padding:0}
        .sumar-activity h3{font-size:16px;font-weight:600;margin-bottom:12px;color:#0f172a}
        .sa-item{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f8fafc;border-radius:8px;margin-bottom:8px}
        .sa-item-icon{font-size:16px;flex-shrink:0}
        .sa-item-text{font-size:14px;color:#0f172a;flex:1}
        .sa-item-time{font-size:12px;color:#94a3b8;white-space:nowrap;flex-shrink:0}
        .sumar-info{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
        .si-card{padding:14px 20px;border-radius:12px;border:1px solid rgba(226,232,240,.7);background:#ffffff;transition:all .2s}
        .si-card h3{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #f0f2f5}
        .si-row{display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px}
        .si-row .si-label{color:#64748b}
        .si-row .si-value{color:#0f172a;font-weight:600;font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums}
        .sumar-actions{display:flex;gap:10px}
        .sa-btn{padding:10px 18px;border-radius:8px;border:1px solid #cbd5e1;background:#ffffff;color:#64748b;font-size:13px;font-weight:600;cursor:pointer;font-family:'Inter',system-ui,sans-serif;transition:all .15s cubic-bezier(.4,0,.2,1);display:flex;align-items:center;gap:6px;box-shadow:0 1px 2px rgba(0,0,0,.05)}
        .sa-btn:hover{border-color:#94a3b8;color:#0f172a;box-shadow:0 1px 3px rgba(0,0,0,.1)}
        .sa-btn.primary{border-color:#2563eb;background:#2563eb;color:#ffffff;box-shadow:0 1px 3px rgba(37,99,235,.3)}
        .sa-btn.primary:hover{background:#1d4ed8;box-shadow:0 2px 6px rgba(37,99,235,.4)}

        /* Eligibility */
        .elig-panel{padding:24px 32px;max-width:960px;overflow-y:auto;flex:1;min-height:0}
        .elig-summary{display:flex;gap:16px;margin-bottom:24px}
        .elig-stat{padding:16px 20px;border-radius:12px;border:1px solid rgba(226,232,240,.8);background:#ffffff;flex:1;text-align:center}
        .elig-stat .number{font-size:28px;font-weight:800;font-variant-numeric:tabular-nums}
        .elig-stat .label{font-size:12px;color:#64748b;margin-top:4px;font-weight:500}
        .elig-rule{display:flex;align-items:flex-start;gap:12px;padding:14px 20px;border-radius:10px;margin-bottom:8px;transition:all .15s cubic-bezier(.4,0,.2,1);cursor:pointer;border:none}
        .elig-rule.pass-bg{background:rgba(52,211,153,.08)}
        .elig-rule.fail-bg{background:rgba(248,113,113,.08)}
        .elig-rule.pending-bg{background:rgba(251,191,36,.08)}
        .elig-rule:hover{box-shadow:0 1px 4px rgba(0,0,0,.06)}
        .elig-icon{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;font-weight:700;margin-top:2px}
        .elig-icon.pass{background:transparent;color:#059669}
        .elig-icon.fail{background:transparent;color:#dc2626}
        .elig-icon.pending{background:transparent;color:#d97706}
        .elig-name{font-size:14px;font-weight:500;flex:1}
        .elig-name.pass-text{color:#059669}
        .elig-name.fail-text{color:#dc2626}
        .elig-name.pending-text{color:#d97706}
        .elig-detail{font-size:12px;color:#64748b;max-width:300px;text-align:right}
        .elig-type-badge{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:2px 8px;border-radius:4px;border:1px solid transparent;flex-shrink:0}
        .elig-type-badge.fixed{background:rgba(52,211,153,.1);color:#059669;border-color:#a7f3d0}
        .elig-type-badge.interpreted{background:rgba(251,191,36,.1);color:#d97706;border-color:#fed7aa}

        /* Ghid */
        .ghid-layout{display:flex;flex-direction:column;flex:1;min-height:0}
        .ghid-sub-tabs{display:flex;gap:0;border-bottom:1px solid rgba(226,232,240,.8);background:#ffffff;padding:0 24px}
        .ghid-sub-tab{padding:12px 20px;font-size:13px;font-weight:600;color:#64748b;cursor:pointer;border-bottom:2px solid transparent;transition:all .15s cubic-bezier(.4,0,.2,1);background:none;border-top:none;border-left:none;border-right:none;font-family:'Inter',system-ui,sans-serif}
        .ghid-sub-tab:hover{color:#0f172a}
        .ghid-sub-tab.active{color:#2563eb;border-bottom-color:#2563eb}
        .ghid-split{display:flex;flex:1;overflow:hidden}
        .rules-panel{width:400px;min-width:400px;display:flex;flex-direction:column;border-right:1px solid rgba(226,232,240,.8)}
        .rule-category-filters{display:flex;flex-wrap:wrap;gap:6px;padding:12px 16px;border-bottom:1px solid rgba(226,232,240,.8);background:#ffffff}
        .rcf-chip{padding:4px 12px;border-radius:20px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid rgba(226,232,240,.8);background:#ffffff;color:#64748b;font-family:'Inter',system-ui,sans-serif;transition:all .15s cubic-bezier(.4,0,.2,1);display:inline-flex;align-items:center;gap:4px}
        .rcf-chip:hover{border-color:#cbd5e1;color:#0f172a;box-shadow:0 1px 2px rgba(0,0,0,.04)}
        .rcf-chip.active{border-color:#2563eb;background:#eff6ff;color:#2563eb}
        .rcf-count{font-size:10px;font-weight:600;opacity:.7}
        .rules-scroll{flex:1;overflow-y:auto;padding:12px 16px}
        .rule-card{padding:12px 14px;border-radius:12px;border:1px solid rgba(226,232,240,.8);margin-bottom:8px;cursor:pointer;transition:all .15s cubic-bezier(.4,0,.2,1);background:#ffffff}
        .rule-card:hover{border-color:#cbd5e1;box-shadow:0 1px 3px rgba(0,0,0,.05)}
        .rule-card.active{border-color:#2563eb;background:rgba(37,99,235,.03);box-shadow:0 0 0 1px rgba(37,99,235,.15)}
        .rule-card-top{display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap}
        .rule-type-badge{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:4px 12px;border-radius:6px;display:inline-flex;flex-shrink:0;white-space:nowrap}
        .rule-type-badge.fixed{color:#059669;background:rgba(52,211,153,.15);border:1px solid #a7f3d0}
        .rule-type-badge.interpreted{color:#d97706;background:rgba(251,191,36,.15);border:1px solid #fed7aa}
        .rule-cat-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
        .rule-cat-label{font-size:10px;color:#94a3b8;font-weight:600}
        .rule-review-flag{font-size:10px;color:#d97706;font-weight:600;margin-left:auto}
        .rule-validated-flag{font-size:12px;color:#059669;margin-left:auto}
        .elig-status-badge{font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;margin-left:auto;flex-shrink:0;letter-spacing:.3px}
        .elig-status-badge.pass{color:#059669;background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.3)}
        .elig-status-badge.fail{color:#dc2626;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2)}
        .elig-status-badge.pending{color:#d97706;background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.25)}
        .rule-text{font-size:13px;line-height:1.5;color:#0f172a}
        .rule-meta{font-size:11px;color:#94a3b8;margin-top:6px;display:flex;gap:12px;align-items:center}
        .rule-doc-ref{font-size:10px;color:#94a3b8;margin-left:auto;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .confidence-bar{width:48px;height:4px;background:#f0f2f5;border-radius:2px;overflow:hidden;display:inline-block;vertical-align:middle;margin-left:4px}
        .confidence-fill{height:100%;border-radius:2px}

        /* Rule detail panel */
        .rule-detail-panel{flex:1;overflow-y:auto;background:#f8fafc;min-width:0}
        .rd-content{padding:28px 32px}
        .rd-header{margin-bottom:24px}
        .rd-badges{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px}
        .rd-cat-pill{font-size:11px;font-weight:700;padding:3px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:.5px}
        .rd-validated{font-size:11px;color:#059669;font-weight:700;display:flex;align-items:center;gap:3px}
        .rd-needs-review{font-size:11px;color:#d97706;font-weight:700;display:flex;align-items:center;gap:3px}
        .rd-confidence-row{display:flex;align-items:center;gap:10px}
        .rd-conf-label{font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px}
        .rd-conf-value{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums}
        .rd-conf-bar{flex:1;height:6px;background:#f8fafc;border-radius:3px;overflow:hidden;max-width:200px}
        .rd-conf-fill{height:100%;border-radius:3px;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .rd-section{margin-bottom:20px}
        .rd-section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;margin-bottom:10px;display:flex;align-items:center;gap:8px}
        .rd-page-ref{font-size:10px;font-weight:600;color:#2563eb;background:rgba(37,99,235,.1);padding:2px 8px;border-radius:10px;margin-left:auto}
        .rd-description{font-size:14px;line-height:1.7;color:#0f172a;padding:14px 18px;background:#ffffff;border:1px solid rgba(226,232,240,.8);border-radius:12px}
        .rd-source-text{background:#ffffff;border:1px solid rgba(226,232,240,.8);border-radius:12px;overflow:hidden}
        .rd-source-quote{font-size:13px;line-height:1.8;color:#0f172a;padding:16px 20px;border-left:3px solid #2563eb;font-style:italic;background:rgba(37,99,235,.03)}
        .rd-condition{background:#ffffff;border:1px solid rgba(226,232,240,.8);border-radius:12px;padding:14px 18px}
        .rd-cond-row{display:flex;align-items:center;gap:8px;font-family:'JetBrains Mono',monospace;font-size:13px}
        .rd-cond-field{color:#2563eb;font-weight:700}
        .rd-cond-op{color:#ea580c;font-weight:600;padding:2px 8px;background:rgba(251,146,60,.1);border-radius:4px;font-size:11px}
        .rd-cond-val{color:#059669;font-weight:600}
        .rd-logic-type{margin-bottom:10px}
        .rd-logic-badge{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:4px 12px;border-radius:4px;background:rgba(167,139,250,.12);color:#7c3aed;border:1px solid rgba(167,139,250,.25)}
        .rd-logic-desc{font-size:13px;line-height:1.7;color:#0f172a;margin-bottom:12px}
        .rd-factors{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:10px}
        .rd-factors-label{font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px}
        .rd-factor-chip{font-size:11px;padding:3px 10px;border-radius:12px;background:#f8fafc;border:1px solid rgba(226,232,240,.8);color:#64748b;font-family:'JetBrains Mono',monospace}
        .rd-outcomes{display:flex;flex-direction:column;gap:6px}
        .rd-outcome-row{display:flex;align-items:flex-start;gap:6px;font-size:12px;line-height:1.6;padding:6px 10px;background:#f8fafc;border-radius:6px}
        .rd-outcome-if{font-size:10px;font-weight:700;color:#2563eb;padding:1px 6px;border-radius:3px;background:rgba(37,99,235,.1);flex-shrink:0;margin-top:1px}
        .rd-outcome-cond{color:#0f172a;flex:1}
        .rd-outcome-then{color:#94a3b8;flex-shrink:0}
        .rd-outcome-result{color:#059669;font-weight:600;flex:1}
        .rd-doc-ref{display:flex;align-items:center;gap:8px;padding:10px 14px;background:#ffffff;border:1px solid rgba(226,232,240,.8);border-radius:12px}
        .rd-doc-icon{font-size:18px}
        .rd-doc-name{font-size:13px;font-weight:600;color:#0f172a;flex:1}
        .rd-doc-page{font-size:11px;font-weight:600;color:#94a3b8;padding:2px 8px;background:#f8fafc;border-radius:4px}
        .rd-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#94a3b8;gap:12px;padding:40px}
        .rd-empty-icon{font-size:48px;opacity:.4}
        .rd-empty-title{font-size:16px;font-weight:700;color:#64748b}
        .rd-empty-desc{font-size:13px;text-align:center;max-width:280px;line-height:1.6}

        /* Semantic tags */
        .rd-semantic-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px}
        .rd-sem-tag{font-size:10px;font-weight:700;letter-spacing:.4px;padding:3px 10px;border-radius:20px;display:inline-flex;align-items:center;gap:4px;text-transform:uppercase;font-family:'Inter',system-ui,sans-serif}
        .rd-sem-tag.threshold{color:#0369a1;background:rgba(14,165,233,.1);border:1px solid rgba(14,165,233,.25)}
        .rd-sem-tag.scoring{color:#7c3aed;background:rgba(167,139,250,.1);border:1px solid rgba(167,139,250,.25)}
        .rd-sem-tag.temporal{color:#0891b2;background:rgba(6,182,212,.1);border:1px solid rgba(6,182,212,.25)}
        .rd-sem-tag.document_based{color:#b45309;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.25)}
        .rd-sem-tag.dependency{color:#6d28d9;background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.25)}
        .rd-sem-tag.exclusion{color:#dc2626;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2)}
        .rd-sem-tag.exception{color:#ea580c;background:rgba(249,115,22,.1);border:1px solid rgba(249,115,22,.2)}
        .rd-sem-tag.proportional{color:#059669;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.25)}
        .rd-sem-tag.classification{color:#2563eb;background:rgba(37,99,235,.1);border:1px solid rgba(37,99,235,.2)}
        .rule-card-tags{display:flex;flex-wrap:wrap;gap:3px;margin-top:6px}
        .rule-card-tag{font-size:9px;font-weight:700;letter-spacing:.3px;padding:1px 7px;border-radius:10px;text-transform:uppercase;opacity:.85}

        /* Anexe & Date panel */
        .anexe-panel{display:grid;grid-template-columns:320px 1fr;flex:1;min-height:0;overflow:hidden}
        .anexe-list{overflow-y:auto;border-right:1px solid rgba(226,232,240,.8);padding:16px}
        .anexe-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;text-align:center;color:#64748b}
        .anexe-card{padding:14px 20px;border:1px solid rgba(226,232,240,.7);border-radius:12px;cursor:pointer;transition:all .2s;margin-bottom:8px;background:#ffffff}
        .anexe-card:hover{border-color:#cbd5e1}
        .anexe-card.active{border-color:#2563eb;background:rgba(37,99,235,.02)}
        .anexe-card-top{display:flex;align-items:center;gap:8px;margin-bottom:6px}
        .anexe-type-badge{font-size:9px;font-weight:700;padding:2px 8px;border-radius:8px;text-transform:uppercase;letter-spacing:.5px}
        .anexe-type-badge.lookup{color:#2563eb;background:rgba(37,99,235,.12)}
        .anexe-type-badge.classification{color:#7c3aed;background:rgba(167,139,250,.12)}
        .anexe-type-badge.list{color:#059669;background:rgba(52,211,153,.12)}
        .anexe-type-badge.matrix{color:#ea580c;background:rgba(251,146,60,.12)}
        .anexe-validated{color:#059669;font-size:14px;font-weight:700}
        .anexe-card-name{font-size:13px;font-weight:600;color:#0f172a;margin-bottom:4px}
        .anexe-card-desc{font-size:11px;color:#94a3b8;line-height:1.4;margin-bottom:6px}
        .anexe-card-meta{display:flex;gap:12px;font-size:10px;color:#94a3b8}
        .anexe-detail{overflow-y:auto;padding:20px}
        .anexe-detail-content{display:flex;flex-direction:column;gap:16px}
        .anexe-detail-header{display:flex;justify-content:space-between;align-items:flex-start}
        .anexe-detail-title{font-size:18px;font-weight:700;color:#0f172a}
        .anexe-detail-badges{display:flex;align-items:center;gap:8px}
        .anexe-detail-desc{font-size:13px;color:#64748b;line-height:1.5}
        .anexe-detail-lookup{font-size:12px;color:#94a3b8}
        .anexe-detail-lookup code{font-family:'JetBrains Mono',monospace;color:#2563eb;background:rgba(37,99,235,.08);padding:1px 6px;border-radius:4px}
        .anexe-table-wrapper{overflow-x:auto;border:1px solid rgba(226,232,240,.8);border-radius:12px}
        .anexe-table{width:100%;border-collapse:collapse;font-size:12px}
        .anexe-table th{text-align:left;padding:8px 12px;background:#f8fafc;color:#64748b;font-weight:600;border-bottom:1px solid rgba(226,232,240,.8);white-space:nowrap}
        .anexe-table td{padding:6px 12px;border-bottom:1px solid rgba(226,232,240,.8);color:#0f172a}
        .anexe-table tr:hover td{background:#f1f5f9}
        .anexe-source-text{border-top:1px solid rgba(226,232,240,.8);padding-top:16px}
        .anexe-source-label{font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;margin-bottom:8px}
        .anexe-source-quote{font-size:12px;color:#64748b;line-height:1.5;padding:12px;background:#f8fafc;border-radius:8px;border-left:3px solid #2563eb;font-style:italic}

        /* Element constraints section */
        .ed-constraints{margin-top:16px;padding-top:12px;border-top:1px solid rgba(226,232,240,.8)}
        .ed-constraints-title{font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;display:flex;align-items:center;gap:6px}
        .ed-constraint-card{padding:10px;border:1px solid rgba(226,232,240,.8);border-radius:8px;margin-bottom:8px;background:#f8fafc}
        .ed-constraint-top{display:flex;align-items:center;gap:6px;margin-bottom:4px}
        .ed-constraint-role{font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;text-transform:uppercase;border:1px solid transparent}
        .ed-constraint-role.input{color:#2563eb;background:#eff6ff;border-color:#bfdbfe}
        .ed-constraint-role.output{color:#059669;background:#ecfdf5;border-color:#a7f3d0}
        .ed-constraint-role.constraint{color:#dc2626;background:#fef2f2;border-color:#fecaca}
        .ed-constraint-rule{font-size:12px;color:#0f172a;line-height:1.4}
        .ed-constraint-refs{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
        .ed-constraint-ref{font-size:10px;color:#7c3aed;background:#f5f3ff;padding:2px 8px;border-radius:6px;border:1px solid #ddd6fe}

        /* Solomon validation card */
        .solomon-validation-card{margin-top:8px;padding:10px 12px;border-radius:12px;border:1px solid rgba(226,232,240,.8);background:#f8fafc}
        .svc-header{display:flex;align-items:center;gap:6px;margin-bottom:8px;font-size:12px;font-weight:600;color:#64748b}
        .svc-results{display:flex;flex-direction:column;gap:4px}
        .svc-result{display:flex;align-items:flex-start;gap:8px;font-size:11px;padding:4px 0}
        .svc-status{flex-shrink:0;width:16px;height:16px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#ffffff}
        .svc-status.passed{background:#34d399}
        .svc-status.failed{background:#f87171}
        .svc-status.warning{background:#fbbf24}
        .svc-status.info{background:#2563eb}
        .svc-text{color:#0f172a;line-height:1.4}
        .svc-ref{font-size:10px;color:#7c3aed;margin-top:2px}

        .pdf-viewer{flex:1;background:#f0f2f5;display:flex;align-items:center;justify-content:center;position:relative}
        .pdf-page-mock{width:480px;background:#ffffff;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,.1);padding:48px 40px;min-height:620px;color:#0f172a;position:relative}
        .pdf-page-mock h3{font-size:16px;font-weight:700;margin-bottom:16px;color:#0f172a}
        .pdf-text-line{height:10px;background:#cbd5e1;border-radius:2px;margin:8px 0}
        .pdf-page-num{position:absolute;bottom:16px;right:24px;font-size:12px;color:#94a3b8;font-weight:600}

        /* Elemente — redesigned to match prototype */
        .el-shell{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}
        .el-header{padding:16px 24px;border-bottom:1px solid #e2e8f0;display:flex;flex-direction:column;gap:12px;background:#f8fafc}
        .el-header-top{display:flex;align-items:center;justify-content:space-between}
        .el-stats{display:flex;gap:20px}
        .el-stat{text-align:center}
        .el-stat-val{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums}
        .el-stat-lbl{font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em}
        .el-progress-wrap{}
        .el-progress{height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden}
        .el-progress-fill{height:100%;border-radius:3px;transition:width 600ms ease}
        .el-progress-labels{display:flex;justify-content:space-between;font-size:12px;color:#94a3b8;margin-top:4px}
        .el-toolbar{display:flex;align-items:center;gap:8px;padding:10px 24px;border-bottom:1px solid #e2e8f0;flex-wrap:wrap}
        .el-search-box{display:flex;align-items:center;gap:6px;border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px;background:#fff;min-width:200px;transition:all 150ms ease}
        .el-search-box:focus-within{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.1)}
        .el-search-box input{border:none;outline:none;font-size:13px;font-family:inherit;flex:1;background:transparent;color:#0f172a}
        .el-search-box input::placeholder{color:#94a3b8}
        .el-search-icon{color:#94a3b8;font-size:14px}
        .el-pill{padding:5px 12px;border-radius:9999px;font-size:12px;font-weight:500;border:1px solid #e2e8f0;background:#fff;color:#475569;cursor:pointer;transition:all 150ms ease;white-space:nowrap;user-select:none}
        .el-pill:hover{background:#f1f5f9}
        .el-pill.active{background:#2563eb;color:#fff;border-color:#2563eb}
        .el-pill-count{opacity:.7;margin-left:2px}
        .el-pill-status{}.el-pill-status.active{background:transparent;color:#0f172a;font-weight:600;border-width:2px}
        .el-sep{width:1px;height:20px;background:#e2e8f0}
        .el-scroll{flex:1;overflow-y:auto}
        .el-scroll::-webkit-scrollbar{width:6px}.el-scroll::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:3px}
        .el-group{margin-bottom:0}
        .el-group-header{display:flex;align-items:center;gap:8px;padding:10px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;cursor:pointer;position:sticky;top:0;z-index:2;transition:background 150ms}
        .el-group-header:hover{background:#f1f5f9}
        .el-group-icon{font-size:16px}
        .el-group-name{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#475569}
        .el-group-count{font-size:12px;color:#94a3b8}
        .el-group-progress{flex:1;display:flex;align-items:center;gap:8px;justify-content:flex-end}
        .el-group-bar{width:80px;height:3px;background:#e2e8f0;border-radius:2px;overflow:hidden}
        .el-group-bar-fill{height:100%;border-radius:2px;transition:width 400ms ease}
        .el-group-pct{font-size:11px;font-weight:600;color:#94a3b8;min-width:30px;text-align:right}
        .el-group-chevron{color:#94a3b8;transition:transform 150ms ease;font-size:12px}
        .el-group-items{}
        .el-row{display:flex;align-items:center;padding:10px 24px 10px 48px;border-bottom:1px solid #f1f5f9;transition:background 150ms ease;gap:12px;min-height:52px}
        .el-row:hover{background:#f8fafc}
        .el-row:last-child{border-bottom:none}
        .el-row.editing{background:#eff6ff}
        .el-status-icon{width:22px;height:22px;border-radius:9999px;display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0}
        .el-status-icon.confirmat{background:#ecfdf5;color:#059669}
        .el-status-icon.propus_ai{background:#fffbeb;color:#d97706}
        .el-status-icon.gol{background:#f1f5f9;color:#94a3b8}
        .el-status-icon.conflict{background:#fef2f2;color:#dc2626}
        .el-info{flex:1;min-width:0}
        .el-label{font-size:14px;font-weight:500;display:flex;align-items:center;gap:4px;color:#0f172a}
        .el-req{color:#dc2626;font-size:11px}
        .el-key-text{font-size:11px;color:#94a3b8;font-family:'JetBrains Mono',monospace}
        .el-value-area{flex:0 0 300px;min-width:0}
        .el-val{font-size:14px;font-weight:500;font-family:'JetBrains Mono',monospace;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;max-width:290px}
        .el-val.empty{color:#94a3b8;font-style:italic;font-family:inherit;font-weight:400}
        .el-val.conflict{color:#dc2626;text-decoration:line-through;opacity:.6}
        .el-source-area{flex:0 0 140px;min-width:0}
        .el-src-badge{display:inline-flex;align-items:center;gap:3px;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:500;white-space:nowrap}
        .el-src-badge.ocr{background:#dbeafe;color:#1e40af}
        .el-src-badge.solomon{background:#fffbeb;color:#d97706}
        .el-src-badge.manual{background:#f5f3ff;color:#7c3aed}
        .el-src-badge.system{background:#f1f5f9;color:#94a3b8}
        .el-src-badge.anaf{background:#d1fae5;color:#065f46}
        .el-actions{flex:0 0 auto;display:flex;gap:4px;opacity:0;transition:opacity 150ms ease}
        .el-row:hover .el-actions{opacity:1}
        .el-edit-input{width:100%;border:1px solid #2563eb;border-radius:6px;padding:4px 8px;font-size:14px;font-family:'JetBrains Mono',monospace;outline:none;background:#eff6ff;color:#0f172a}
        .el-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:500;border:none;cursor:pointer;transition:all 150ms ease;white-space:nowrap;font-family:inherit}
        .el-btn-pri{background:#0f172a;color:#fff}.el-btn-pri:hover{background:#1e293b}
        .el-btn-sec{background:#fff;border:1px solid #e2e8f0;color:#475569}.el-btn-sec:hover{background:#f1f5f9}
        .el-btn-ok{background:#059669;color:#fff}.el-btn-ok:hover{background:#047857}
        .el-btn-ghost{background:transparent;color:#475569;padding:5px 8px}.el-btn-ghost:hover{background:#f1f5f9}
        .el-btn-sm{padding:4px 10px;font-size:12px}
        .el-btn:disabled{opacity:.5;cursor:not-allowed}
        .el-input{padding:6px 10px;font-size:12px;border-radius:6px;border:1px solid #e2e8f0;background:#fff;color:#0f172a;outline:none;font-family:inherit}
        .el-input:focus{border-color:#2563eb;box-shadow:0 0 0 2px rgba(37,99,235,.1)}
        .el-add-form{padding:12px 16px;background:rgba(37,99,235,.03);border:1px solid rgba(37,99,235,.12);border-radius:8px;margin-bottom:8px}
        .el-status-badge{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:500;padding:2px 10px;border-radius:9999px;border:1px solid}
        .el-status-badge.confirmat{background:#ecfdf5;color:#059669;border-color:#a7f3d0}
        .el-status-badge.propus_ai{background:#fffbeb;color:#d97706;border-color:#fde68a}
        .el-status-badge.gol{background:#f1f5f9;color:#94a3b8;border-color:#e2e8f0}
        .el-status-badge.conflict{background:#fef2f2;color:#dc2626;border-color:#fecaca}
        /* Detail slide-out panel */
        .el-overlay{position:fixed;inset:0;background:rgba(0,0,0,.25);z-index:45}
        .el-detail-panel{position:fixed;right:0;top:0;bottom:0;width:400px;background:#fff;box-shadow:-4px 0 24px rgba(0,0,0,.12);z-index:50;display:flex;flex-direction:column;transform:translateX(100%);transition:transform 250ms ease}
        .el-detail-panel.open{transform:translateX(0)}
        .dp-header{padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between}
        .dp-title{font-size:15px;font-weight:600;color:#0f172a}
        .dp-close{width:32px;height:32px;border:none;background:none;border-radius:8px;cursor:pointer;color:#94a3b8;display:flex;align-items:center;justify-content:center;font-size:18px;transition:all 150ms}
        .dp-close:hover{background:#f1f5f9;color:#0f172a}
        .dp-body{flex:1;overflow-y:auto;padding:20px}
        .dp-field{margin-bottom:16px}
        .dp-field-label{font-size:12px;font-weight:500;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px}
        .dp-field-value{font-size:15px;font-weight:500;color:#0f172a}
        .dp-mono{font-family:'JetBrains Mono',monospace;font-size:13px}
        .dp-history{border-top:1px solid #e2e8f0;padding-top:12px;margin-top:12px}
        .dp-history-title{font-size:13px;font-weight:600;margin-bottom:8px;color:#0f172a}
        .dp-history-item{display:flex;gap:8px;font-size:12px;color:#475569;margin-bottom:8px;padding-left:12px;border-left:2px solid #e2e8f0}
        .dp-history-time{color:#94a3b8;white-space:nowrap;min-width:70px}

        /* Checklist */
        .checklist-panel{padding:28px 32px;max-width:960px;overflow-y:auto;flex:1;min-height:0}
        .check-progress{display:flex;align-items:center;gap:20px;margin-bottom:24px;padding:22px;border-radius:12px;border:1px solid rgba(226,232,240,.8);background:#ffffff}
        .check-ring{width:80px;height:80px;position:relative;flex-shrink:0}
        .check-ring svg{transform:rotate(-90deg)}
        .check-ring-text{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#0f172a;font-variant-numeric:tabular-nums}
        .check-info{flex:1}
        .check-info .ci-title{font-size:16px;font-weight:700;margin-bottom:4px;color:#0f172a}
        .check-info .ci-sub{font-size:13px;color:#64748b}
        .check-category{margin-bottom:16px}
        .check-cat-header{display:flex;align-items:center;gap:8px;padding:8px 0;cursor:pointer;font-size:14px;font-weight:700;color:#64748b}
        .check-cat-header:hover{color:#0f172a}
        .check-cat-count{font-size:11px;color:#94a3b8;font-weight:600}
        .check-item{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;margin-bottom:4px;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .check-item:hover{background:#f1f5f9}
        .check-box{width:18px;height:18px;border-radius:5px;border:2px solid #cbd5e1;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .15s cubic-bezier(.4,0,.2,1);flex-shrink:0;font-size:11px}
        .check-box:hover{border-color:#94a3b8}
        .check-box.done{border-color:#059669;background:#34d399;color:#ffffff}
        .check-name{font-size:13px;font-weight:500;flex:1}
        .check-name.done-text{text-decoration:line-through;color:#94a3b8}
        .check-source-badge{font-size:9px;font-weight:700;text-transform:uppercase;padding:2px 6px;border-radius:3px;letter-spacing:.5px}
        .check-source-badge.ghid{background:rgba(37,99,235,.12);color:#2563eb}
        .check-source-badge.manual{background:rgba(167,139,250,.12);color:#7c3aed}
        .check-template{font-size:11px;color:#2563eb;cursor:pointer;white-space:nowrap}
        .check-template:hover{text-decoration:underline}

        /* Checklist Add Form */
        .check-add-bar{display:flex;gap:8px;margin-bottom:16px}
        .check-add-btn{padding:8px 16px;border-radius:8px;border:1px dashed rgba(226,232,240,.8);background:transparent;color:#94a3b8;font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',system-ui,sans-serif;transition:all .15s cubic-bezier(.4,0,.2,1);display:flex;align-items:center;gap:6px}
        .check-add-btn:hover{border-color:#7c3aed;color:#7c3aed}
        .check-refresh-btn{padding:8px 12px;border-radius:8px;border:1px solid rgba(226,232,240,.8);background:transparent;color:#94a3b8;font-size:12px;font-weight:500;cursor:pointer;font-family:'Inter',system-ui,sans-serif;transition:all .15s;white-space:nowrap}
        .check-refresh-btn:hover{border-color:#2563eb;color:#2563eb}
        .check-notes-badge{font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(251,191,36,.1);color:#b45309;cursor:pointer;white-space:nowrap;flex-shrink:0}
        .check-notes-textarea{width:100%;padding:6px 8px;border-radius:6px;border:1px solid #e2e8f0;background:#f8fafc;color:#0f172a;font-size:11px;font-family:'Inter',system-ui,sans-serif;resize:vertical;outline:none}
        .check-notes-textarea:focus{border-color:#2563eb}
        .check-menu-notes{padding:4px 8px}
        .check-add-form{padding:14px;background:#f8fafc;border-radius:12px;border:1px solid rgba(226,232,240,.8);margin-bottom:16px;display:flex;flex-direction:column;gap:8px}
        .check-add-form-row{display:flex;gap:8px}
        .check-add-input{flex:1;padding:7px 12px;border-radius:8px;border:1px solid rgba(226,232,240,.8);background:#f0f2f5;color:#0f172a;font-size:13px;font-family:'Inter',system-ui,sans-serif;outline:none;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .check-add-input:focus{border-color:#2563eb}
        .check-add-input::placeholder{color:#94a3b8}
        .check-add-submit{padding:7px 16px;border-radius:8px;border:none;background:#2563eb;color:#ffffff;font-size:12px;font-weight:700;cursor:pointer;font-family:'Inter',system-ui,sans-serif}
        .check-add-submit:disabled{opacity:.4;cursor:not-allowed}
        .check-add-cancel{padding:7px 12px;border-radius:8px;border:1px solid rgba(226,232,240,.8);background:transparent;color:#94a3b8;font-size:12px;cursor:pointer;font-family:'Inter',system-ui,sans-serif}

        /* Checklist Item Actions */
        .check-item-actions{position:relative}
        .check-actions-btn{background:none;border:none;color:#94a3b8;cursor:pointer;font-size:14px;padding:2px 6px;border-radius:8px;transition:all .15s cubic-bezier(.4,0,.2,1);line-height:1}
        .check-actions-btn:hover{background:#f1f5f9;color:#0f172a}
        .check-actions-menu{position:absolute;right:0;top:100%;z-index:20;background:#ffffff;border:1px solid rgba(226,232,240,.8);border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,.15);min-width:200px;padding:4px;animation:menuSlide .15s ease}
        @keyframes menuSlide{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
        .check-menu-item{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;font-size:12px;font-weight:500;cursor:pointer;transition:all .15s cubic-bezier(.4,0,.2,1);color:#64748b;border:none;background:none;width:100%;text-align:left;font-family:'Inter',system-ui,sans-serif}
        .check-menu-item:hover{background:#f1f5f9;color:#0f172a}
        .check-menu-item.danger{color:#dc2626}
        .check-menu-item.danger:hover{background:rgba(248,113,113,.08)}
        .check-menu-divider{height:1px;background:rgba(226,232,240,.8);margin:4px 0}
        .check-menu-sub{padding:4px 8px}
        .check-menu-sub-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;padding:4px 4px 6px;display:block}
        .check-menu-sub-item{display:block;padding:6px 8px;border-radius:8px;font-size:12px;cursor:pointer;color:#64748b;transition:all .15s cubic-bezier(.4,0,.2,1);border:none;background:none;width:100%;text-align:left;font-family:'Inter',system-ui,sans-serif}
        .check-menu-sub-item:hover{background:#f1f5f9;color:#0f172a}
        .check-menu-sub-item.active{color:#2563eb;font-weight:600}

        /* Template Mapper */
        .check-template-list{padding:4px 8px}
        .check-template-option{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;font-size:12px;cursor:pointer;color:#64748b;transition:all .15s cubic-bezier(.4,0,.2,1);border:none;background:none;width:100%;text-align:left;font-family:'Inter',system-ui,sans-serif}
        .check-template-option:hover{background:#f1f5f9;color:#0f172a}
        .check-template-option.mapped{color:#059669;font-weight:600}
        .check-template-badge{font-size:9px;font-weight:700;text-transform:uppercase;padding:2px 5px;border-radius:3px;background:rgba(37,99,235,.1);color:#2563eb}

        /* Unmapped Templates Warning */
        .check-unmapped{display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:10px;border:1px solid rgba(251,191,36,.2);background:rgba(251,191,36,.04);margin-bottom:16px;font-size:12px;color:#d97706}
        .check-unmapped-icon{font-size:16px;flex-shrink:0}
        .check-unmapped-text{flex:1;line-height:1.5}
        .check-unmapped strong{font-weight:700}

        /* Solomon Chat */
        .solomon-layout{display:flex;flex:1;overflow:hidden;background:#ffffff;min-height:0}
        .solomon-flux-panel{width:240px;min-width:200px;border-right:1px solid rgba(226,232,240,.8);background:#f8fafc;display:flex;flex-direction:column;overflow:hidden}
        .sfp-header{padding:12px 14px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8}
        .sfp-scroll{flex:1;overflow-y:auto;padding:0 8px 12px}
        .sfp-stage{margin-bottom:12px}
        .sfp-stage-header{display:flex;align-items:center;gap:8px;padding:4px 8px;cursor:default}
        .sfp-stage-num{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0}
        .sfp-stage-num.done{background:#059669}
        .sfp-stage-num.active{background:#2563eb}
        .sfp-stage-num.pending{background:#cbd5e1}
        .sfp-stage-info{flex:1;min-width:0}
        .sfp-stage-name{font-size:13px;font-weight:600;color:#0f172a;line-height:1.3}
        .sfp-stage-desc{font-size:11px;color:#94a3b8;line-height:1.3}
        .sfp-stage-check{color:#059669;font-size:14px;flex-shrink:0}
        .sfp-items{padding-left:18px;margin-top:2px}
        .sfp-item{display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:6px;cursor:pointer;transition:background .1s;font-size:12px;color:#475569}
        .sfp-item:hover{background:rgba(37,99,235,.05)}
        .sfp-item.active{background:rgba(37,99,235,.08);color:#2563eb;font-weight:600}
        .sfp-item-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
        .sfp-item-dot.done{background:#059669}
        .sfp-item-dot.active{background:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.2)}
        .sfp-item-dot.pending{background:#cbd5e1}
        .sfp-item-badge{margin-left:auto;font-size:10px;font-weight:600;padding:1px 6px;border-radius:4px;font-family:'JetBrains Mono',monospace}
        .sfp-item-badge.done{background:#ecfdf5;color:#059669}
        .sfp-item-badge.active{background:#eff6ff;color:#2563eb}
        .sfp-item-badge.pending{color:#94a3b8}
        .solomon-chat{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden;position:relative;background:#ffffff}
        .solomon-chat.drag-active{outline:2px dashed #4d8bff;outline-offset:-4px;border-radius:8px}
        .solomon-drop-overlay{position:absolute;inset:0;background:rgba(77,139,255,.08);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:20;pointer-events:none;border-radius:8px}
        .solomon-drop-icon{font-size:40px;margin-bottom:8px}
        .solomon-drop-text{font-size:14px;font-weight:600;color:#4d8bff}
        .solomon-toolbar{padding:8px 20px;display:flex;align-items:center;gap:10px;background:#ffffff;border-bottom:none}
        .solomon-toolbar-inner{max-width:720px;margin:0 auto;width:100%;display:flex;align-items:center;gap:10px}
        .solomon-avatar{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#ea580c);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#ffffff;flex-shrink:0}
        .solomon-name-block{display:flex;flex-direction:column;gap:1px}
        .solomon-name-block .sn-name{font-size:15px;font-weight:700;color:#0f172a}
        .solomon-name-block .sn-status{font-size:11px;color:#059669;display:flex;align-items:center;gap:4px}
        .sn-status-dot{width:6px;height:6px;border-radius:50%;background:#34d399;animation:statusPulse 2s ease infinite}
        @keyframes statusPulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}
        .model-selector{display:flex;gap:3px;background:#f0f2f5;padding:3px;border-radius:8px;margin-left:auto}
        .model-btn{padding:5px 12px;font-size:12px;font-weight:600;border-radius:6px;border:none;cursor:pointer;background:transparent;color:#64748b;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .model-btn.active{background:#2563eb;color:#ffffff}
        .model-btn:hover:not(.active){color:#0f172a;background:#f1f5f9}
        .et-toggle{display:flex;align-items:center;gap:5px;font-size:11px;color:#64748b;cursor:pointer;padding:5px 10px;border-radius:8px;border:1px solid rgba(226,232,240,.8);background:transparent;font-family:'Inter',system-ui,sans-serif;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .et-toggle.on{border-color:#7c3aed;color:#7c3aed;background:rgba(167,139,250,.08)}
        .chat-messages{flex:1;overflow-y:auto;overflow-x:hidden;padding:24px 20px;min-height:0}
        .chat-messages-inner{max-width:720px;margin:0 auto;width:100%;display:flex;flex-direction:column;gap:24px}
        .solomon-msg{display:flex;max-width:85%}
        .solomon-msg.solomon-msg-left{align-self:flex-start}
        .solomon-msg.solomon-msg-right{align-self:flex-end}
        .solomon-msg-body{flex:1;min-width:0}
        .solomon-msg-right .solomon-msg-body{text-align:right}
        .solomon-msg-right .solomon-msg-text{background:rgba(77,139,255,0.06);border-radius:14px 14px 2px 14px;padding:10px 14px;display:inline-block;text-align:left}
        .solomon-msg-left .solomon-msg-text{padding:10px 0}
        .solomon-msg-text{font-size:14.5px;line-height:1.7;color:#475569;font-family:'Inter',system-ui,sans-serif}
        .solomon-msg-text strong{color:#0f172a;font-weight:600}
        .chat-msg .msg-bold{font-weight:600;color:#0f172a}

        /* Solomon Markdown Rich Content */
        .solomon-md-content{display:flex;flex-direction:column;gap:4px}
        .solomon-md-p{margin:0;padding:0;font-size:14.5px;line-height:1.7;color:#475569;max-width:640px}
        .solomon-md-h2{margin:16px 0 6px;padding:0;font-size:16px;font-weight:700;color:#0f172a;line-height:1.4;display:flex;align-items:center;gap:6px;letter-spacing:-0.01em}
        .solomon-md-h3{margin:12px 0 4px;padding:0;font-size:15px;font-weight:600;color:#1e293b;line-height:1.4;display:flex;align-items:center;gap:6px}
        .solomon-md-bold{color:#0f172a;font-weight:600}
        .solomon-md-italic{font-style:italic;color:#64748b}
        .solomon-md-code{background:#f1f5f9;color:#7c3aed;padding:1px 5px;border-radius:4px;font-size:13px;font-family:'JetBrains Mono','SF Mono',monospace}
        .solomon-md-list{margin:4px 0;padding-left:20px;display:flex;flex-direction:column;gap:3px;list-style:none}
        .solomon-md-list li{position:relative;font-size:14.5px;line-height:1.7;color:#475569;padding-left:12px}
        .solomon-md-list li::before{content:'';position:absolute;left:0;top:9px;width:5px;height:5px;border-radius:50%;background:#94a3b8}
        .solomon-md-hr{border:none;height:1px;background:linear-gradient(90deg,transparent,#e2e8f0 20%,#e2e8f0 80%,transparent);margin:12px 0}
        .solomon-md-table-wrap{overflow-x:auto;margin:8px 0;max-width:640px}
        .solomon-md-table{width:100%;border-collapse:collapse;font-size:13px;line-height:1.5}
        .solomon-md-table th{text-align:left;padding:8px 12px;background:#f1f5f9;border:1px solid #e2e8f0;font-weight:700;color:#0f172a;font-size:12px;text-transform:uppercase;letter-spacing:.3px;white-space:nowrap}
        .solomon-md-table td{padding:6px 12px;border:1px solid #e2e8f0;color:#475569;font-variant-numeric:tabular-nums}
        .solomon-md-table tbody tr:hover{background:#f8fafc}
        .solomon-md-table tbody tr:nth-child(even){background:#fafbfc}
        .solomon-md-quote{margin:8px 0;padding:10px 16px;border-left:3px solid #4d8bff;background:#f0f7ff;border-radius:0 8px 8px 0;color:#334155;font-size:13.5px;line-height:1.6;font-style:italic}
        .solomon-md-quote p{margin:0 0 4px}
        .solomon-md-quote p:last-child{margin:0}
        .solomon-md-codeblock{margin:8px 0;padding:12px 16px;background:#1e293b;color:#e2e8f0;border-radius:8px;font-size:12.5px;font-family:'JetBrains Mono','SF Mono',monospace;line-height:1.6;overflow-x:auto;white-space:pre;max-width:640px}
        .solomon-md-link{color:#2563eb;text-decoration:none;font-weight:500;border-bottom:1px solid rgba(37,99,235,.2)}
        .solomon-md-link:hover{border-bottom-color:#2563eb}
        .extraction-cards{margin-top:12px;display:flex;flex-direction:column;gap:8px}
        .extraction-card{background:#f0f7ff;border:1px solid #bfdbfe;border-radius:12px;padding:14px 20px;transition:all .2s}
        .extraction-card.confirmed{border-color:#a7f3d0;background:#ecfdf5}
        .extraction-card.rejected{border-color:#dc2626;opacity:.5;text-decoration:line-through}
        .exc-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
        .exc-label{font-size:12px;font-weight:500;color:#94a3b8}
        .exc-confidence{font-size:11px;color:#94a3b8}
        .exc-value{font-size:15px;font-weight:500;color:#0f172a;font-family:'SF Mono','Consolas','JetBrains Mono',monospace;margin-bottom:8px}
        .exc-actions{display:flex;gap:6px;margin-top:8px}
        .exc-btn{padding:5px 12px;border-radius:8px;border:none;font-size:13px;font-weight:500;cursor:pointer;font-family:'Inter',system-ui,sans-serif;display:flex;align-items:center;gap:4px;transition:all .15s cubic-bezier(.4,0,.2,1);background:transparent}
        .exc-btn.confirm-btn{background:#059669;color:#ffffff;border-radius:8px}
        .exc-btn.confirm-btn:hover{background:#047857}
        .exc-btn.edit-btn{color:#475569;background:transparent}
        .exc-btn.edit-btn:hover{background:#f1f5f9}
        .exc-btn.reject-btn{color:#dc2626;background:transparent}
        .exc-btn.reject-btn:hover{background:#fef2f2}
        .exc-confirmed-label{font-size:12px;font-weight:500;color:#059669;display:flex;align-items:center;gap:4px}
        .exc-rejected-label{font-size:11px;font-weight:500;color:#dc2626;display:flex;align-items:center;gap:4px}
        .exc-collapsed-summary{display:flex;align-items:center;gap:8px;padding:8px 14px;margin-top:8px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;cursor:pointer;transition:all .15s;user-select:none}
        .exc-collapsed-summary:hover{background:#dcfce7;border-color:#86efac}
        .exc-collapsed-icon{font-size:13px;color:#059669;font-weight:600}
        .exc-collapsed-text{font-size:12px;font-weight:500;color:#059669;flex:1}
        .exc-collapsed-toggle{font-size:10px;color:#94a3b8}
        .confirm-all-bar{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#eff6ff;border-radius:8px;margin-bottom:4px}
        .confirm-all-bar span{font-size:13px;color:#2563eb;font-weight:500}
        .chat-timestamp{font-size:10px;color:#94a3b8;margin-top:4px}
        .chat-input-area{padding:16px 20px;border-top:1px solid rgba(226,232,240,.8);background:#ffffff}
        .chat-input-inner{max-width:760px;margin:0 auto}
        .chat-input-wrapper{display:flex;gap:8px;align-items:flex-end;max-width:720px;margin:0 auto;width:100%}
        .chat-hint{text-align:center;font-size:11px;color:#94a3b8;margin-top:8px;font-family:'Inter',system-ui,sans-serif}
        .chat-attach-btn{width:32px;height:32px;border-radius:8px;border:none;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#94a3b8;transition:all .15s cubic-bezier(.4,0,.2,1);flex-shrink:0;padding:0}
        .chat-attach-btn:hover{color:#2563eb;background:rgba(37,99,235,.06)}
        .chat-attach-btn:disabled{opacity:.4;cursor:not-allowed}
        .chat-input-row{display:flex;flex-direction:column;background:#ffffff;border:1px solid rgba(226,232,240,.8);border-radius:16px;padding:4px 12px 4px 4px;transition:border-color .15s;flex:1;min-width:0}
        .chat-input-row:focus-within{border-color:rgba(226,232,240,.8)}
        .chat-input-toolbar{display:flex;align-items:center;gap:4px;padding:0 4px 4px 8px}
        .chat-input{flex:1;padding:10px 12px 4px 12px;border-radius:8px;border:none;background:transparent;color:#0f172a;font-size:14px;font-family:'Inter',system-ui,sans-serif;line-height:1.5;resize:none;outline:none;min-height:68px;max-height:200px;overflow-y:auto}
        .chat-input::placeholder{color:#94a3b8}
        .chat-btn{width:36px;height:36px;border-radius:12px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s cubic-bezier(.4,0,.2,1);flex-shrink:0}
        .chat-btn.send{background:linear-gradient(135deg,#4d8bff 0%,#2563eb 100%);color:#ffffff;font-size:16px;box-shadow:0 2px 8px rgba(37,99,235,.25)}
        .chat-btn.send:hover{background:linear-gradient(135deg,#3b7aed 0%,#1d4ed8 100%);box-shadow:0 4px 16px rgba(37,99,235,.35);transform:scale(1.05)}
        .solomon-elements-panel{width:300px;min-width:260px;border-left:1px solid rgba(226,232,240,.8);background:#f8fafc;display:flex;flex-direction:column;overflow:hidden}
        .sep-header{padding:16px 16px 12px;border-bottom:1px solid rgba(226,232,240,.8);display:flex;flex-direction:column;gap:8px}
        .sep-header-top{display:flex;align-items:center;justify-content:space-between}
        .sep-header-title{font-size:14px;font-weight:700;color:#0f172a}
        .sep-count{font-size:13px;font-weight:700;color:#2563eb;font-variant-numeric:tabular-nums}
        .sep-progress-bar{height:4px;background:#f0f2f5;border-radius:2px;overflow:hidden}
        .sep-progress-fill{height:100%;background:#2563eb;border-radius:2px;transition:width .3s}
        .sep-scroll{flex:1;overflow-y:auto;padding:8px 10px;display:flex;flex-direction:column;gap:4px}
        .sep-category-group{margin-bottom:8px}
        .sep-category-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;padding:10px 8px 4px;font-family:'Inter',system-ui,sans-serif}
        .sep-row{display:flex;align-items:flex-start;justify-content:space-between;padding:8px 8px;border-radius:8px;transition:background .1s}
        .sep-row.clickable{cursor:pointer}
        .sep-row:hover{background:rgba(0,0,0,.03)}
        .sep-row.clickable:hover{background:rgba(37,99,235,.04)}
        .sep-row-arrow{color:#94a3b8;font-size:18px;line-height:1;flex-shrink:0;margin-top:2px;transition:color .1s}
        .sep-row.clickable:hover .sep-row-arrow{color:#2563eb}
        .sep-row-left{display:flex;align-items:flex-start;gap:8px;flex:1;min-width:0}
        .sep-row-icon{font-size:12px;flex-shrink:0;width:16px;text-align:center;margin-top:1px}
        .sep-row-icon.confirmat{color:#059669}
        .sep-row-icon.propus_ai,.sep-row-icon.proposed{color:#d97706}
        .sep-row-icon.conflict{color:#dc2626}
        .sep-row-icon.gol{color:#cbd5e1;font-size:10px}
        .sep-row-info{flex:1;min-width:0}
        .sep-row-label{font-size:12.5px;color:#64748b;line-height:1.4}
        .sep-row-key{font-size:10px;font-family:'JetBrains Mono',monospace;color:#94a3b8;line-height:1.3;opacity:.7}
        .sep-row-value{font-size:13px;font-weight:600;color:#0f172a;line-height:1.4;word-break:break-word}
        .sep-row-value.confirmat{color:#059669}
        .sep-row-value.propus_ai{color:#d97706}
        .sep-row-value.proposed{color:#d97706}
        .sep-row-value.empty{color:#f97316;font-weight:500;font-style:italic;font-size:12px}
        .sep-row-actions{display:flex;gap:2px;flex-shrink:0;margin-top:1px}
        .sep-mini-btn{width:22px;height:22px;border-radius:6px;border:1px solid rgba(226,232,240,.8);background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:11px;transition:all .12s}
        .sep-mini-btn.confirm{color:#059669}
        .sep-mini-btn.confirm:hover{background:rgba(52,211,153,.12);border-color:#34d399}
        .sep-mini-btn.reject{color:#94a3b8}
        .sep-mini-btn.reject:hover{color:#dc2626;border-color:#dc2626;background:rgba(248,113,113,.08)}
        .inline-refine-popup{position:fixed;z-index:1000;background:#ffffff;border:1px solid #2563eb;border-radius:12px;padding:12px;box-shadow:0 8px 32px rgba(0,0,0,.12),0 2px 8px rgba(0,0,0,.06);width:340px;animation:popIn .15s ease}
        @keyframes popIn{from{opacity:0;transform:translateY(4px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
        .refine-selected-text{font-size:12px;color:#64748b;background:#f0f2f5;padding:8px 10px;border-radius:8px;margin-bottom:8px;max-height:60px;overflow:hidden;border-left:3px solid #2563eb}
        .refine-input-row{display:flex;gap:6px}
        .refine-input{flex:1;padding:8px 12px;border-radius:8px;border:1px solid rgba(226,232,240,.8);background:#f0f2f5;color:#0f172a;font-size:13px;font-family:'Inter',system-ui,sans-serif;outline:none;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .refine-input:focus{border-color:#2563eb}
        .refine-submit{padding:8px 14px;border-radius:8px;border:none;background:#2563eb;color:#ffffff;font-size:13px;font-weight:600;cursor:pointer;font-family:'Inter',system-ui,sans-serif}

        /* Neemia */
        .neemia-layout{display:flex;flex:1;min-height:0}
        .neemia-templates{width:260px;min-width:260px;border-right:1px solid rgba(226,232,240,.8);padding:16px;overflow-y:auto}
        .neemia-templates h3{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;margin-bottom:12px}
        .template-card{padding:12px 14px;border-radius:12px;border:1px solid rgba(226,232,240,.8);margin-bottom:8px;cursor:pointer;transition:all .15s cubic-bezier(.4,0,.2,1);background:#ffffff}
        .template-card:hover{border-color:#cbd5e1;box-shadow:0 1px 3px rgba(0,0,0,.05)}
        .template-card.active{border-color:#2563eb;background:rgba(37,99,235,.03);box-shadow:0 0 0 1px rgba(37,99,235,.15)}
        .template-card .tc-name{font-size:14px;font-weight:600;display:flex;align-items:center;gap:6px;margin-bottom:4px}
        .tc-badge{font-size:10px;font-weight:700;padding:1px 5px;border-radius:3px;background:#f1f5f9;color:#94a3b8}
        .template-card .tc-info{font-size:12px;color:#64748b}
        .template-card .tc-progress{height:3px;background:#f0f2f5;border-radius:2px;margin-top:8px;overflow:hidden}
        .tc-progress-fill{height:100%;border-radius:2px;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .neemia-doc-view{flex:1;display:flex;flex-direction:column;min-width:0}
        .neemia-page-nav{padding:10px 20px;display:flex;align-items:center;gap:8px;border-bottom:1px solid rgba(226,232,240,.8);background:#ffffff}
        .neemia-page-nav .nav-label{font-size:13px;font-weight:600;color:#64748b;margin-right:4px;white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis}
        .nav-pages-scroll{display:flex;gap:4px;overflow-x:auto;flex:1;padding:2px 0}
        .page-thumb{min-width:32px;height:32px;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:12px;font-weight:700;cursor:pointer;border:2px solid transparent;transition:all .15s cubic-bezier(.4,0,.2,1);padding:2px 6px;font-variant-numeric:tabular-nums}
        .pt-num{font-size:12px;line-height:1}
        .pt-dot{width:4px;height:4px;border-radius:50%}
        .pt-dot.complete{background:#34d399}
        .pt-dot.partial{background:#fbbf24}
        .pt-dot.empty{background:#f87171}
        .page-thumb.complete{background:rgba(52,211,153,.12);color:#059669}
        .page-thumb.partial{background:rgba(251,191,36,.12);color:#d97706}
        .page-thumb.empty{background:rgba(248,113,113,.1);color:#dc2626}
        .page-thumb.active{border-color:#2563eb;box-shadow:0 0 0 2px rgba(37,99,235,.25)}
        .nav-stats{display:flex;align-items:center;gap:6px;margin-left:auto;white-space:nowrap}
        .nav-stat-filled{font-size:12px;font-weight:600;color:#64748b;font-variant-numeric:tabular-nums}
        .nav-stat-pct{font-size:14px;font-weight:800;font-variant-numeric:tabular-nums}
        .download-btn{display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:8px;border:none;background:#34d399;color:#ffffff;font-size:12px;font-weight:700;cursor:pointer;font-family:'Inter',system-ui,sans-serif;transition:all .15s cubic-bezier(.4,0,.2,1);white-space:nowrap;box-shadow:0 1px 3px rgba(5,150,105,.3)}
        .download-btn:hover{background:#059669;box-shadow:0 2px 6px rgba(5,150,105,.4)}
        .neemia-preview-area{flex:1;display:flex;overflow:hidden}

        /* Document page preview — pixel-perfect document */
        .neemia-doc-preview{flex:1;display:flex;align-items:flex-start;justify-content:center;background:#f0f2f5;padding:24px;overflow-y:auto}
        .ndp-page{width:520px;background:#ffffff;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,.15);padding:44px 40px 60px;color:#0f172a;position:relative;animation:pageSlide .4s ease}
        @keyframes pageSlide{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .ndp-header{margin-bottom:28px;padding-bottom:16px;border-bottom:2px solid #0f172a}
        .ndp-header-bar{height:4px;background:linear-gradient(90deg,#2563eb,#a78bfa,#34d399);border-radius:2px;margin-bottom:12px}
        .ndp-doc-type{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8;margin-bottom:4px}
        .ndp-doc-title{font-size:16px;font-weight:800;color:#0f172a;line-height:1.3}
        .ndp-group{margin-bottom:20px}
        .ndp-group-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:10px;padding:4px 0;border-bottom:1px solid rgba(226,232,240,.8)}
        .ndp-field{margin-bottom:12px}
        .ndp-field-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:#94a3b8;margin-bottom:3px}
        .ndp-field-line{display:flex;align-items:center;gap:6px;min-height:28px;padding:4px 0;border-bottom:1.5px solid rgba(226,232,240,.8)}
        .ndp-field.filled .ndp-field-line{border-bottom-color:#2563eb}
        .ndp-field.confirmed .ndp-field-line{border-bottom-color:#059669}
        .ndp-field-value{font-size:14px;font-weight:600;color:#0f172a;flex:1;word-break:break-word}
        .ndp-field.confirmed .ndp-field-value{color:#059669}
        .ndp-field-placeholder{font-size:13px;font-family:'JetBrains Mono',monospace;color:#cbd5e1;font-style:italic;flex:1}
        .ndp-field-indicator{width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0}
        .ndp-field-indicator.confirmed{background:rgba(52,211,153,.15);color:#059669;border:1.5px solid #34d399}
        .ndp-field-indicator.proposed{background:rgba(251,191,36,.15);color:#d97706;border:1.5px solid #fbbf24}
        .ndp-footer{position:absolute;bottom:16px;left:40px;right:40px;display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;font-family:'JetBrains Mono',monospace}
        .ndp-footer-stats{color:#94a3b8}

        /* Left fields panel */
        .neemia-fields-panel{width:380px;min-width:260px;max-width:600px;border-right:1px solid rgba(226,232,240,.8);display:flex;flex-direction:column;overflow:hidden;background:#ffffff;flex-shrink:0}
        /* Split drag handle */
        .neemia-split-handle{width:6px;cursor:col-resize;background:#ffffff;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s cubic-bezier(.4,0,.2,1);position:relative;z-index:2}
        .neemia-split-handle:hover,.neemia-split-handle:active{background:#cbd5e1}
        .nsh-dots{width:2px;height:32px;background:#94a3b8;border-radius:1px;opacity:.4;transition:opacity .15s}
        .neemia-split-handle:hover .nsh-dots{opacity:.8}
        .nfp-header{padding:14px 16px;border-bottom:1px solid rgba(226,232,240,.8)}
        .nfp-header h3{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;margin:0 0 8px}
        .nfp-stats{display:flex;gap:10px}
        .nfp-stat{font-size:10px;font-weight:600;display:flex;align-items:center;gap:3px}
        .nfp-stat::before{content:'';width:6px;height:6px;border-radius:50%}
        .nfp-stat.confirmed::before{background:#34d399}
        .nfp-stat.confirmed{color:#059669}
        .nfp-stat.filled::before{background:#fbbf24}
        .nfp-stat.filled{color:#d97706}
        .nfp-stat.empty::before{background:#f87171}
        .nfp-stat.empty{color:#dc2626}
        .nfp-scroll{flex:1;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:6px}
        .nfp-card{padding:10px 12px;border-radius:8px;border:1px solid rgba(226,232,240,.8);background:#f8fafc;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .nfp-card:hover{border-color:#cbd5e1}
        .nfp-card.is-confirmed{border-left:3px solid #34d399}
        .nfp-card.is-proposed{border-left:3px solid #fbbf24}
        .nfp-card.is-empty{border-left:3px solid #f87171;opacity:.7}
        .nfp-card-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}
        .nfp-card-label{font-size:12px;font-weight:600;color:#0f172a;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .nfp-card-status{font-size:10px;font-weight:700;flex-shrink:0}
        .nfp-card-status.confirmed{color:#059669}
        .nfp-card-status.proposed{color:#d97706}
        .nfp-card-status.empty{color:#dc2626}
        .nfp-card-value{font-size:13px;font-weight:500;color:#2563eb;font-family:'JetBrains Mono',monospace;word-break:break-word}
        .nfp-card-value.missing{color:#94a3b8;font-style:italic;font-size:11px}
        .nfp-card-source{font-size:10px;color:#94a3b8;margin-top:4px;display:flex;align-items:center;gap:4px}
        .nfp-card-type{font-size:9px;font-weight:600;color:#94a3b8;text-transform:uppercase;margin-top:3px;letter-spacing:.5px}
        .source-dot{width:6px;height:6px;border-radius:50%;display:inline-block}
        .source-dot.solomon{background:#2563eb}
        .source-dot.onrc{background:#34d399}
        .source-dot.manual{background:#a78bfa}
        .source-dot.calculat{background:#fb923c}
        .source-dot.ghid{background:#fbbf24}

        .neemia-bulk-btn{width:100%;padding:8px 16px;border-radius:8px;border:1px solid #34d399;background:rgba(52,211,153,.08);color:#059669;font-size:13px;font-weight:700;cursor:pointer;font-family:'Inter',system-ui,sans-serif;transition:all .15s cubic-bezier(.4,0,.2,1);margin-bottom:10px}
        .neemia-bulk-btn:hover:not(:disabled){background:rgba(52,211,153,.18)}
        .neemia-bulk-btn:disabled{opacity:.5;cursor:not-allowed}
        .neemia-gen-status{font-size:12px;color:#2563eb;background:rgba(37,99,235,.06);border:1px solid rgba(37,99,235,.15);border-radius:8px;padding:8px 12px;margin-bottom:10px;line-height:1.5}
        .neemia-warnings{font-size:11px;color:#d97706;background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.15);border-radius:8px;padding:8px 12px;margin-bottom:10px}
        .neemia-checklist-banner{border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:12px;line-height:1.5}
        .neemia-checklist-ok{background:rgba(52,211,153,.06);border:1px solid rgba(52,211,153,.2);color:#059669;font-weight:600}
        .neemia-checklist-critical{background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.25);color:#92400e}
        .neemia-checklist-critical .ncb-header{display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:12px;margin-bottom:4px}
        .neemia-checklist-critical .ncb-pct{font-size:11px;font-weight:600;color:#d97706}
        .neemia-checklist-critical .ncb-list{font-size:11px;color:#b45309;margin-bottom:4px}
        .neemia-checklist-critical .ncb-optional{font-size:10px;color:#92400e;opacity:.7;margin-bottom:6px}
        .neemia-checklist-critical .ncb-actions{display:flex;gap:6px}
        .ncb-btn{padding:4px 12px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid transparent;font-family:'Inter',system-ui,sans-serif;transition:all .15s}
        .ncb-btn-secondary{background:rgba(0,0,0,.04);border-color:rgba(0,0,0,.1);color:#475569}
        .ncb-btn-secondary:hover{background:rgba(0,0,0,.08)}
        .neemia-checklist-warn{background:rgba(0,0,0,.02);border:1px solid rgba(0,0,0,.06);padding:6px 12px}
        .nw-item{margin-bottom:4px;line-height:1.4}
        .nw-item:last-child{margin-bottom:0}
        .tc-action-btn{padding:3px 10px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;font-family:'Inter',system-ui,sans-serif;transition:all .15s cubic-bezier(.4,0,.2,1);border:1px solid rgba(226,232,240,.8);background:transparent}
        .tc-action-btn:hover:not(:disabled){border-color:#2563eb}
        .tc-action-btn:disabled{opacity:.4;cursor:not-allowed}
        .tc-download{color:#2563eb;border-color:#2563eb}
        .tc-generate{color:#059669;border-color:#059669}
        .tc-generate:hover:not(:disabled){background:rgba(52,211,153,.08);border-color:#059669}
        .tc-mode-badge{font-size:9px;font-weight:700;padding:1px 6px;border-radius:3px;text-transform:uppercase;letter-spacing:.5px;margin-left:4px}
        .tc-mode-badge.fill{background:rgba(37,99,235,.12);color:#2563eb}
        .tc-mode-badge.compose{background:rgba(167,139,250,.15);color:#7c3aed}
        .tc-preview{color:#7c3aed;border-color:#7c3aed}
        .tc-preview:hover:not(:disabled){background:rgba(167,139,250,.08);border-color:#7c3aed}
        .tc-versions{color:#64748b;border-color:rgba(226,232,240,.8)}
        .tc-versions:hover{background:#f1f5f9;color:#0f172a}
        .tc-versions-panel{margin-top:6px;padding:6px 0;border-top:1px solid rgba(226,232,240,.8)}
        .tc-version-row{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:11px}
        .tv-badge{background:#f1f5f9;color:#2563eb;font-weight:700;padding:1px 6px;border-radius:4px;font-family:'JetBrains Mono',monospace;font-size:10px}
        .tv-date{color:#64748b;font-size:11px}
        .tv-stats{color:#94a3b8;font-size:10px;margin-left:auto}
        .tv-mode{font-size:9px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:.5px}
        .tv-download{background:none;border:none;cursor:pointer;color:#2563eb;font-size:14px;padding:0 4px}
        .tv-download:hover{color:#059669}

        /* COMPOSE Preview Panel */
        .compose-preview-panel{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}
        .compose-preview-header{display:flex;align-items:center;gap:10px;padding:12px 20px;border-bottom:1px solid rgba(226,232,240,.8);background:#ffffff}
        .compose-preview-header h3{margin:0;font-size:13px;font-weight:700;color:#0f172a}
        .compose-model-badge{font-size:10px;font-family:'JetBrains Mono',monospace;padding:2px 8px;border-radius:4px;background:rgba(167,139,250,.1);color:#7c3aed;font-weight:600}
        .compose-stats{font-size:12px;color:#64748b;font-weight:600}
        .compose-generate-btn{padding:6px 16px;border-radius:8px;border:1px solid #34d399;background:rgba(52,211,153,.08);color:#059669;font-size:12px;font-weight:700;cursor:pointer;font-family:'Inter',system-ui,sans-serif;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .compose-generate-btn:hover:not(:disabled){background:rgba(52,211,153,.18)}
        .compose-generate-btn:disabled{opacity:.5;cursor:not-allowed}
        .compose-sections-list{flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:16px}
        .compose-section{border:1px solid rgba(226,232,240,.8);border-radius:12px;overflow:hidden;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .compose-section.approved{border-color:rgba(52,211,153,.4)}
        .cs-header{display:flex;align-items:center;gap:8px;padding:10px 14px;background:#f8fafc;border-bottom:1px solid rgba(226,232,240,.8)}
        .cs-type-badge{font-size:10px;font-weight:700;padding:2px 8px;border-radius:3px;text-transform:uppercase;letter-spacing:.5px}
        .cs-type-badge.narrative{background:rgba(37,99,235,.1);color:#2563eb}
        .cs-type-badge.table{background:rgba(167,139,250,.1);color:#7c3aed}
        .cs-type-badge.calculation{background:rgba(251,191,36,.1);color:#d97706}
        .cs-label{font-size:13px;font-weight:600;color:#0f172a}
        .cs-approve-btn{padding:3px 10px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid rgba(226,232,240,.8);background:transparent;color:#64748b;font-family:'Inter',system-ui,sans-serif;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .cs-approve-btn.active{border-color:#059669;color:#059669;background:rgba(52,211,153,.06)}
        .cs-edit-btn{padding:3px 10px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid rgba(226,232,240,.8);background:transparent;color:#2563eb;font-family:'Inter',system-ui,sans-serif;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .cs-edit-btn:hover{border-color:#2563eb;background:rgba(37,99,235,.06)}
        .cs-narrative{padding:14px;font-size:13px;line-height:1.7;color:#0f172a}
        .cs-narrative p{margin:0 0 10px}
        .cs-narrative p:last-child{margin-bottom:0}
        .cs-edit-area{padding:14px}
        .cs-textarea{width:100%;border:1px solid rgba(226,232,240,.8);border-radius:8px;background:#f0f2f5;color:#0f172a;font-family:'Inter',system-ui,sans-serif;font-size:13px;line-height:1.6;padding:10px;resize:vertical;min-height:120px;transition:all .15s cubic-bezier(.4,0,.2,1)}
        .cs-textarea:focus{outline:none;border-color:#2563eb}
        .cs-edit-actions{display:flex;gap:8px;margin-top:8px;justify-content:flex-end}
        .cs-save-btn{padding:4px 14px;border-radius:8px;border:1px solid #34d399;background:rgba(52,211,153,.08);color:#059669;font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',system-ui,sans-serif}
        .cs-cancel-btn{padding:4px 14px;border-radius:8px;border:1px solid rgba(226,232,240,.8);background:transparent;color:#64748b;font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',system-ui,sans-serif}
        .cs-table-wrapper{padding:14px;overflow-x:auto}
        .cs-table-caption{font-size:12px;font-weight:700;color:#2563eb;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px}
        .cs-table{width:100%;border-collapse:collapse;font-size:12px;font-family:'Inter',system-ui,sans-serif}
        .cs-table th{padding:8px 10px;text-align:left;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.3px;border-bottom:2px solid rgba(226,232,240,.8)}
        .cs-table td{padding:6px 10px;border-bottom:1px solid rgba(226,232,240,.8);color:#0f172a}
        .cs-table .highlight-row{background:rgba(251,191,36,.1)}
        .cs-table .highlight-row td{font-weight:600;color:#d97706}
        .cs-table .alt-row{background:#f8fafc}
        .cs-table .footer-row{background:#f8fafc}
        .cs-table .footer-row td{color:#ffffff;font-weight:700;border-bottom:none}

        .neemia-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#94a3b8;gap:12px}
        .neemia-empty .ne-icon{font-size:40px;opacity:.5}
        .neemia-empty .ne-label{font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:1px}
        .neemia-empty .ne-desc{font-size:13px;color:#64748b;text-align:center;max-width:280px}

        .coming-soon{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;min-height:0;color:#94a3b8;gap:12px}
        .coming-soon .cs-icon{font-size:48px;opacity:.5}
        .coming-soon .cs-label{font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:1px}
        .coming-soon .cs-desc{font-size:13px;color:#64748b}

        /* ═══ RESPONSIVE ═══ */
        @media(max-width:1024px){
          .pv-project-header{padding:12px 16px}
          .pv-tabs{padding:0 14px}
          .neemia-layout{flex-direction:column}
          .neemia-templates{width:100%!important;min-width:100%!important;max-height:220px;border-right:none;border-bottom:1px solid rgba(226,232,240,.8);overflow-x:auto;display:flex;flex-wrap:nowrap;gap:8px;align-items:flex-start}
          .neemia-templates h3{white-space:nowrap}
          .template-card{min-width:220px;flex-shrink:0}
          .neemia-preview-area{flex-direction:column}
          .neemia-fields-panel{width:100%!important;max-height:300px}
          .neemia-split-handle{display:none}
          .solomon-elements-panel{width:260px;min-width:220px}
        }
        @media(max-width:768px){
          .pv-project-header{padding:8px 12px}
          .pv-tabs{padding:0 10px;gap:0}
          .pv-tab{padding:0 10px;height:40px;font-size:12px}
          .el-grid{grid-template-columns:1fr}
          .sg-stats{flex-direction:column;gap:8px}
          .neemia-templates{max-height:180px}
          .solomon-elements-panel{display:none}
          .solomon-flux-panel{display:none}
          .sumar-panel{padding:20px 16px}
          .elig-panel{padding:16px}
        }

        /* ═══ FORM-ON-DOCUMENT ═══ */
        .fod-container{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}
        .fod-topbar{display:flex;align-items:center;gap:12px;padding:8px 12px;border-bottom:1px solid rgba(226,232,240,.8);background:#ffffff;flex-shrink:0}
        .fod-page-nav{display:flex;gap:3px;flex:1;overflow-x:auto}
        .fod-page-btn{padding:4px 10px;font-size:11px;font-weight:600;border-radius:6px;border:1px solid rgba(226,232,240,.8);background:#ffffff;cursor:pointer;transition:all .15s;white-space:nowrap}
        .fod-page-btn.active{background:#4d8bff;color:#fff;border-color:#4d8bff}
        .fod-page-btn.complete{border-color:rgba(52,211,153,.4);color:#059669}
        .fod-page-btn.partial{border-color:rgba(251,191,36,.4);color:#d97706}
        .fod-page-btn:hover:not(.active){background:#f1f5f9}
        .fod-stats{display:flex;gap:8px;font-size:10px;font-weight:600;flex-shrink:0}
        .fod-stat{padding:2px 6px;border-radius:4px}
        .fod-stat.confirmed{background:rgba(52,211,153,.1);color:#059669}
        .fod-stat.filled{background:rgba(77,139,255,.1);color:#4d8bff}
        .fod-stat.empty{background:rgba(148,163,184,.1);color:#94a3b8}
        .fod-zoom{display:flex;align-items:center;gap:4px;flex-shrink:0}
        .fod-zoom-btn{width:26px;height:26px;border-radius:6px;border:1px solid rgba(226,232,240,.8);background:#fff;cursor:pointer;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;transition:background .15s}
        .fod-zoom-btn:hover{background:#f1f5f9}
        .fod-zoom-label{font-size:11px;font-weight:600;min-width:36px;text-align:center;color:#64748b}
        .fod-scroll{flex:1;overflow:auto;display:flex;justify-content:center;padding:24px;background:#e2e8f0}
        .fod-page-wrapper{position:relative;background:#ffffff;box-shadow:0 4px 24px rgba(0,0,0,.12);flex-shrink:0}
        .fod-page-image{display:block;width:100%;height:100%;object-fit:contain;pointer-events:none;user-select:none}
        .fod-field{position:absolute;cursor:pointer;border-radius:2px;transition:all .15s;box-sizing:border-box;display:flex;align-items:center;overflow:visible}
        .fod-field.empty{background:rgba(77,139,255,.06);border:1.5px dashed rgba(77,139,255,.3)}
        .fod-field.empty.hovered{background:rgba(77,139,255,.12);border-color:#4d8bff;box-shadow:0 0 0 2px rgba(77,139,255,.15)}
        .fod-field.filled{background:rgba(77,139,255,.08);border:1px solid rgba(77,139,255,.25)}
        .fod-field.filled.hovered{background:rgba(77,139,255,.14);border-color:#4d8bff}
        .fod-field.confirmed{background:rgba(52,211,153,.08);border:1px solid rgba(52,211,153,.3)}
        .fod-field.confirmed.hovered{background:rgba(52,211,153,.14);border-color:#34d399}
        .fod-field.editing{border:2px solid #4d8bff;background:rgba(255,255,255,.95);z-index:10;overflow:visible;box-shadow:0 2px 12px rgba(77,139,255,.25)}
        .fod-field-value{font-size:10px;font-family:'Inter',system-ui,sans-serif;color:#1a1e28;padding:1px 3px;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%}
        .fod-field-editor{display:flex;flex-direction:column;gap:4px;min-width:200px;position:relative}
        .fod-input{width:100%;padding:4px 6px;font-size:12px;font-family:'Inter',system-ui,sans-serif;border:1px solid #4d8bff;border-radius:3px;background:#ffffff;outline:none;color:#1a1e28;line-height:1.3}
        .fod-input:focus{box-shadow:0 0 0 2px rgba(77,139,255,.2)}
        .fod-field-actions{display:flex;gap:3px;position:absolute;right:0;top:100%;margin-top:2px;z-index:20}
        .fod-save-btn,.fod-cancel-btn{width:24px;height:24px;border-radius:4px;border:none;cursor:pointer;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;transition:background .15s}
        .fod-save-btn{background:#4d8bff;color:#fff}
        .fod-save-btn:hover{background:#3b7aee}
        .fod-save-btn:disabled{opacity:.5;cursor:default}
        .fod-cancel-btn{background:#f1f5f9;color:#64748b}
        .fod-cancel-btn:hover{background:#e2e8f0}
        .fod-tooltip{position:absolute;left:0;bottom:100%;margin-bottom:4px;background:#1a1e28;color:#e8ecf4;padding:8px 10px;border-radius:6px;font-size:11px;white-space:nowrap;z-index:30;box-shadow:0 4px 12px rgba(0,0,0,.3);pointer-events:auto}
        .fod-tooltip::after{content:'';position:absolute;top:100%;left:12px;border:5px solid transparent;border-top-color:#1a1e28}
        .fod-tooltip-label{font-weight:600;margin-bottom:2px}
        .fod-tooltip-source{color:#8892a8;font-size:10px}
        .fod-tooltip-confirm{margin-top:4px;padding:2px 8px;font-size:10px;font-weight:600;border-radius:4px;border:1px solid rgba(77,139,255,.3);background:rgba(77,139,255,.1);color:#4d8bff;cursor:pointer}
        .fod-tooltip-confirm:hover{background:rgba(77,139,255,.2)}
        .fod-tooltip-confirmed{color:#34d399;font-weight:600;margin-top:2px}
        .fod-tooltip-empty{color:#8892a8;font-style:italic}
        .fod-reconciliation-banner{display:flex;align-items:center;justify-content:space-between;padding:6px 12px;background:rgba(251,191,36,.06);border-bottom:1px solid rgba(251,191,36,.2);flex-shrink:0}
        .fod-recon-stats{display:flex;gap:12px;font-size:11px;font-weight:500}
        .fod-recon-coverage{font-weight:700}
        .fod-recon-fuzzy{color:#d97706}
        .fod-recon-missing{color:#dc2626}
        .fod-recon-toggle{font-size:11px;padding:3px 10px;border-radius:5px;border:1px solid rgba(226,232,240,.8);background:#fff;cursor:pointer;font-weight:600;color:#4d8bff}
        .fod-fuzzy-banner{display:flex;align-items:center;gap:6px;padding:4px 12px;background:rgba(251,191,36,.06);border-bottom:1px solid rgba(251,191,36,.15);font-size:11px;color:#92400e;flex-shrink:0}
        .fod-unmatched-panel{max-height:200px;overflow-y:auto;border-bottom:1px solid rgba(226,232,240,.8);background:#fefce8;flex-shrink:0}
        .fod-unmatched-header{padding:8px 12px;font-size:12px;font-weight:600;border-bottom:1px solid rgba(251,191,36,.15);display:flex;flex-direction:column;gap:2px}
        .fod-unmatched-item{padding:6px 12px;border-bottom:1px solid rgba(251,191,36,.1);display:flex;align-items:center;gap:8px}
        .fod-unmatched-item.has-value{background:rgba(52,211,153,.04)}
        .fod-unmatched-label{font-size:11px;font-weight:600;min-width:120px;color:#1a1e28}
        .fod-unmatched-value{font-size:11px;color:#334155;flex:1}
        .fod-unmatched-source{font-size:10px;color:#94a3b8;padding:1px 5px;background:rgba(148,163,184,.1);border-radius:3px}
        .fod-loading{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#64748b}
        .fod-spinner{width:32px;height:32px;border:3px solid rgba(77,139,255,.2);border-top-color:#4d8bff;border-radius:50%;animation:spin 1s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        .fod-loading-text{font-size:13px;font-weight:500}
        .fod-error{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#dc2626}
        .fod-error-icon{font-size:28px}
        .fod-error-text{font-size:13px}
        .fod-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:#94a3b8;font-size:13px}
`;
