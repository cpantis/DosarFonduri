"use client";
import { useState } from "react";
import { apiPost, apiDelete, apiPut } from "@/lib/api";
import type { ChecklistItem, NeemiaTemplate } from "../types";

interface ChecklistTabProps {
  projectId: string;
  checklistItems: ChecklistItem[];
  setChecklistItems: (fn: (prev: ChecklistItem[]) => ChecklistItem[]) => void;
  neemiaTemplates: NeemiaTemplate[];
  solChecklist: any[];
  classifiedDocs: any[];
  readOnly: boolean;
  toast: (type: string, msg: string) => void;
  onSwitchToNeemia: () => void;
}

function pct(a: number, b: number): string {
  if (b === 0) return "0";
  return String(Math.round((a / b) * 100));
}

export default function ChecklistTab({
  projectId, checklistItems, setChecklistItems, neemiaTemplates,
  solChecklist, classifiedDocs, readOnly, toast, onSwitchToNeemia,
}: ChecklistTabProps) {
  const [checkAddOpen, setCheckAddOpen] = useState(false);
  const [checkNewName, setCheckNewName] = useState("");
  const [checkNewCat, setCheckNewCat] = useState("");
  const [checkActionId, setCheckActionId] = useState<string | null>(null);
  const [checkMapOpen, setCheckMapOpen] = useState<string | null>(null);
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});

  const checkDone = checklistItems.filter(i => i.done).length;
  const checkTotal = checklistItems.length;
  const checkCategories = [...new Set(checklistItems.map(i => i.category))].sort();
  const checkMappedTemplateIds = new Set(checklistItems.filter(i => i.templateId).map(i => i.templateId));
  const checkUnmappedTemplates = neemiaTemplates.filter(t => !checkMappedTemplateIds.has(t.id));

  const handleChecklistToggle = async (id: string, done: boolean) => {
    try {
      await apiPut(`/api/projects/${projectId}/checklist/${id}`, { done: !done });
      setChecklistItems(prev => prev.map(i => i.id === id ? { ...i, done: !done } : i));
    } catch { toast("error", "Eroare la actualizarea checklist-ului"); }
  };

  const handleChecklistAdd = async () => {
    if (!checkNewName.trim() || !checkNewCat.trim()) return;
    try {
      const item = await apiPost<ChecklistItem>(`/api/projects/${projectId}/checklist`, {
        name: checkNewName.trim(), category: checkNewCat.trim(), source: "manual",
      });
      setChecklistItems(prev => [...prev, item]);
      setCheckNewName(""); setCheckNewCat(""); setCheckAddOpen(false);
      toast("success", "Document adăugat la checklist");
    } catch { toast("error", "Eroare la adăugare"); }
  };

  const handleChecklistDelete = async (id: string) => {
    try {
      await apiDelete(`/api/projects/${projectId}/checklist/${id}`);
      setChecklistItems(prev => prev.filter(i => i.id !== id));
    } catch { toast("error", "Eroare la ștergere"); }
  };

  const handleChecklistMapTemplate = async (checkId: string, templateId: string | null) => {
    try {
      await apiPut(`/api/projects/${projectId}/checklist/${checkId}`, { templateId });
      setChecklistItems(prev => prev.map(i => i.id === checkId ? {
        ...i, templateId, templateName: templateId ? neemiaTemplates.find(t => t.id === templateId)?.name || null : null,
      } : i));
      setCheckMapOpen(null); setCheckActionId(null);
    } catch { toast("error", "Eroare la mapare"); }
  };

  const handleChecklistMoveCategory = async (id: string, cat: string) => {
    try {
      await apiPut(`/api/projects/${projectId}/checklist/${id}`, { category: cat });
      setChecklistItems(prev => prev.map(i => i.id === id ? { ...i, category: cat } : i));
      setCheckActionId(null);
    } catch { toast("error", "Eroare la mutare"); }
  };

  const handleChecklistRefresh = async () => {
    try {
      const items = await apiPost<ChecklistItem[]>(`/api/projects/${projectId}/checklist/refresh`, {});
      setChecklistItems(() => items);
      toast("success", "Checklist actualizat din ghid");
    } catch { toast("error", "Eroare la refresh"); }
  };

  const handleChecklistNotes = async (id: string, notes: string) => {
    try {
      await apiPut(`/api/projects/${projectId}/checklist/${id}`, { notes: notes || null });
      setChecklistItems(prev => prev.map(i => i.id === id ? { ...i, notes: notes || null } : i));
    } catch { console.warn("[checklist] Notes save failed"); }
  };

  return (
    <div className="checklist-panel">
      {/* Progress */}
      <div className="check-progress">
        <div className="check-ring">
          <svg width="80" height="80" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="#e2e8f0" strokeWidth="6" />
            <circle cx="40" cy="40" r="34" fill="none" stroke="#34d399" strokeWidth="6"
              strokeDasharray={`${2 * Math.PI * 34}`}
              strokeDashoffset={`${2 * Math.PI * 34 * (1 - (checkTotal > 0 ? checkDone / checkTotal : 0))}`}
              strokeLinecap="round"
            />
          </svg>
          <div className="check-ring-text">{pct(checkDone, checkTotal)}%</div>
        </div>
        <div className="check-info">
          <div className="ci-title">{checkDone} din {checkTotal} documente bifate</div>
          <div className="ci-sub">Documente necesare pentru dosarul de finanțare</div>
        </div>
      </div>

      {/* Unmapped templates warning */}
      {checkUnmappedTemplates.length > 0 && (
        <div className="check-unmapped">
          <span className="check-unmapped-icon">&#9888;</span>
          <div className="check-unmapped-text">
            <strong>{checkUnmappedTemplates.length} template-uri nemapate:</strong>{" "}
            {checkUnmappedTemplates.map(t => t.name).join(", ")}
          </div>
        </div>
      )}

      {/* Solomon-detected document checklist */}
      {solChecklist.length > 0 && (
        <div style={{ margin: "12px 16px", padding: 14, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#1e293b", marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
            <span>Documente necesare (Solomon)</span>
            <span style={{ fontWeight: 400, color: "#64748b" }}>
              {solChecklist.filter((i: any) => {
                const name = (i.document || i.name || "").toLowerCase();
                return classifiedDocs.some((d: any) => {
                  const dName = (d.fileName || d.name || "").toLowerCase();
                  const dDesc = ((d.classification as Record<string, unknown>)?.description as string || "").toLowerCase();
                  return dName.includes(name.slice(0, 15)) || dDesc.includes(name.slice(0, 15));
                });
              }).length}/{solChecklist.length}
            </span>
          </div>
          {solChecklist.map((item: any, i: number) => {
            const docName = item.document || item.name || "";
            const matched = classifiedDocs.some((d: any) => {
              const dName = (d.fileName || d.name || "").toLowerCase();
              const dDesc = ((d.classification as Record<string, unknown>)?.description as string || "").toLowerCase();
              const searchKey = docName.toLowerCase().slice(0, 15);
              return dName.includes(searchKey) || dDesc.includes(searchKey);
            });
            const catColor = item.category === "obligatoriu_depunere" ? "#dc2626" : item.category === "obligatoriu_contractare" ? "#d97706" : "#64748b";
            return (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0", borderBottom: i < solChecklist.length - 1 ? "1px solid #f0f2f5" : "none" }}>
                <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>{matched ? "✅" : "❌"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: "#1e293b", fontWeight: matched ? 400 : 500 }}>{docName}</div>
                  {item.notes && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>{item.notes}</div>}
                </div>
                <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: `${catColor}10`, color: catColor, fontWeight: 600, flexShrink: 0 }}>
                  {item.category === "obligatoriu_depunere" ? "depunere" : item.category === "obligatoriu_contractare" ? "contractare" : "opțional"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Add document button / form */}
      {!readOnly && (
        checkAddOpen ? (
          <div className="check-add-form">
            <div className="check-add-form-row">
              <input className="check-add-input" placeholder="Nume document (ex: Certificat constatator)" value={checkNewName} onChange={e => setCheckNewName(e.target.value)} />
            </div>
            <div className="check-add-form-row">
              <input className="check-add-input" placeholder="Categorie (ex: Documente juridice)" value={checkNewCat} onChange={e => setCheckNewCat(e.target.value)} list="check-cats" />
              <datalist id="check-cats">
                {checkCategories.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div className="check-add-form-row">
              <button className="check-add-submit" disabled={!checkNewName.trim() || !checkNewCat.trim()} onClick={handleChecklistAdd}>Adauga</button>
              <button className="check-add-cancel" onClick={() => { setCheckAddOpen(false); setCheckNewName(""); setCheckNewCat(""); }}>Anuleaza</button>
            </div>
          </div>
        ) : (
          <div className="check-add-bar">
            <button className="check-add-btn" onClick={() => setCheckAddOpen(true)}>+ Adauga document</button>
            <button className="check-refresh-btn" onClick={handleChecklistRefresh} title="Reîmprospătează din ghid (păstrează itemele manuale)">&#8635; Refresh din ghid</button>
          </div>
        )
      )}

      {/* Categories */}
      {checkCategories.map(cat => {
        const catItems = checklistItems.filter(i => i.category === cat);
        const catDone = catItems.filter(i => i.done).length;
        const isCollapsed = collapsedCats[cat];

        return (
          <div className="check-category" key={cat}>
            <div className="check-cat-header" onClick={() => setCollapsedCats(c => ({ ...c, [cat]: !c[cat] }))}>
              <span style={{ fontSize: 10, transition: "transform .15s cubic-bezier(.4,0,.2,1)", transform: isCollapsed ? "none" : "rotate(90deg)" }}>&#9654;</span>
              {cat}
              <span className="check-cat-count">{catDone}/{catItems.length}</span>
            </div>
            {!isCollapsed && catItems.map(item => (
              <div className="check-item" key={item.id}>
                <div className={`check-box ${item.done ? "done" : ""}`}
                  onClick={() => handleChecklistToggle(item.id, item.done)}>
                  {item.done && "\u2713"}
                </div>
                <span className={`check-name ${item.done ? "done-text" : ""}`}>{item.name}</span>
                <span className={`check-source-badge ${item.source}`}>{item.source}</span>
                {item.templateName && (
                  <span className="check-template" onClick={onSwitchToNeemia}>
                    &#128196; {item.templateName}
                  </span>
                )}
                {item.notes && <span className="check-notes-badge" title={item.notes}>&#128221; Notă</span>}

                {/* Actions menu */}
                {!readOnly && (
                  <div className="check-item-actions">
                    <button className="check-actions-btn" onClick={(e) => { e.stopPropagation(); setCheckActionId(checkActionId === item.id ? null : item.id); setCheckMapOpen(null); }}>&#8943;</button>
                    {checkActionId === item.id && (
                      <div className="check-actions-menu" onClick={e => e.stopPropagation()}>
                        <button className="check-menu-item" onClick={() => setCheckMapOpen(checkMapOpen === item.id ? null : item.id)}>
                          &#128196; {item.templateId ? "Schimba template" : "Mapeaza template"}
                        </button>
                        {checkMapOpen === item.id && (
                          <div className="check-template-list">
                            {item.templateId && (
                              <button className="check-template-option" onClick={() => handleChecklistMapTemplate(item.id, null)}>
                                &#10005; Sterge mapare
                              </button>
                            )}
                            {neemiaTemplates.map(t => (
                              <button key={t.id} className={`check-template-option ${item.templateId === t.id ? "mapped" : ""}`} onClick={() => handleChecklistMapTemplate(item.id, t.id)}>
                                <span className="check-template-badge">{t.type}</span>
                                {t.name}
                                {item.templateId === t.id && " \u2713"}
                              </button>
                            ))}
                            {neemiaTemplates.length === 0 && (
                              <div className="p-2 text-[11px] text-[#94a3b8]">Niciun template disponibil</div>
                            )}
                          </div>
                        )}
                        <div className="check-menu-divider" />
                        <div className="check-menu-sub">
                          <span className="check-menu-sub-label">Muta in categorie</span>
                          {checkCategories.filter(c => c !== item.category).map(c => (
                            <button key={c} className="check-menu-sub-item" onClick={() => handleChecklistMoveCategory(item.id, c)}>{c}</button>
                          ))}
                        </div>
                        <div className="check-menu-divider" />
                        <div className="check-menu-notes">
                          <textarea className="check-notes-textarea" placeholder="Adaugă notă..." defaultValue={item.notes || ""} onBlur={(e) => handleChecklistNotes(item.id, e.target.value)} rows={2} />
                        </div>
                        <div className="check-menu-divider" />
                        <button className="check-menu-item danger" onClick={() => { if (confirm(`Sigur vrei să ștergi "${item.name}" din checklist?`)) handleChecklistDelete(item.id); }}>
                          &#128465; Sterge document
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}

      {checklistItems.length === 0 && (
        <div className="text-center p-10 text-[#94a3b8] text-[13px]">
          Niciun document in checklist. Adauga manual sau proceseaza un ghid.
        </div>
      )}
    </div>
  );
}
