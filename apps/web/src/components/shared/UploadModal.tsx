"use client";

import { useState, useRef, useCallback } from "react";
import { api } from "@/lib/api";

/* ══════════════════════════════════════════
   TYPES
   ══════════════════════════════════════════ */

export interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderId: string;
  folderType: "ghiduri" | "templateuri" | "clienti_prospecti" | "clienti_finali";
  sessionId?: string;
  onSuccess?: () => void;
}

interface SubTypeOption {
  key: string;
  label: string;
  desc: string;
  icon: string;
}

/* ══════════════════════════════════════════
   SUB-TYPE OPTIONS PER FOLDER
   ══════════════════════════════════════════ */

const FOLDER_OPTIONS: Record<string, SubTypeOption[]> = {
  ghiduri: [
    {
      key: "ghid",
      label: "Ghid solicitant",
      desc: "Se extrag regulile de eligibilitate, criteriile de selecție și definițiile câmpurilor",
      icon: "\u{1F4D6}",
    },
    {
      key: "reference_data",
      label: "Anexă cu date (tabele referință)",
      desc: "Tabele de corelație, liste UAT, clasificări — se extrag ca date structurate",
      icon: "\u{1F4CA}",
    },
  ],
  templateuri: [
    {
      key: "template_fill",
      label: "Formular AFIR (Cerere finanțare, Anexa B/C)",
      desc: "Format fix — Neemia completează câmpurile {{...}} fără a modifica structura",
      icon: "\u{1F4DD}",
    },
    {
      key: "template_compose",
      label: "Document consultant (Memoriu, Plan afaceri)",
      desc: "Format liber — Neemia generează conținut narativ + tabele dinamice",
      icon: "\u{1F4D1}",
    },
  ],
  clienti_prospecti: [],
  clienti_finali: [],
};

/** Files above this size use presigned URL (direct browser → R2) */
const PRESIGNED_THRESHOLD = 10 * 1024 * 1024; // 10 MB

function formatFileSize(bytes: number): string {
  if (bytes >= 1_000_000) return (bytes / 1_000_000).toFixed(1) + " MB";
  if (bytes >= 1_000) return (bytes / 1_000).toFixed(0) + " KB";
  return bytes + " B";
}

/* ══════════════════════════════════════════
   COMPONENT
   ══════════════════════════════════════════ */

export function UploadModal({ isOpen, onClose, folderId, folderType, sessionId, onSuccess }: UploadModalProps) {
  const options = FOLDER_OPTIONS[folderType] || [];
  const [subType, setSubType] = useState<string | null>(options.length === 0 ? folderType : null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const canUpload = files.length > 0 && subType !== null && !uploading;

  const handleFiles = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return;
    setFiles(prev => [...prev, ...Array.from(newFiles)]);
    setError(null);
  }, []);

  const resetState = useCallback(() => {
    setFiles([]);
    setSubType(options.length === 0 ? folderType : null);
    setError(null);
    setWarnings([]);
    setProgress(0);
    setDragOver(false);
  }, [options.length, folderType]);

  const handleClose = useCallback(() => {
    if (uploading) return;
    onClose();
    resetState();
  }, [onClose, resetState, uploading]);

  const handleUpload = useCallback(async () => {
    if (!canUpload) return;
    setUploading(true);
    setError(null);
    setWarnings([]);
    setProgress(0);

    const storedToken = typeof window !== "undefined" ? localStorage.getItem("df-token") : null;
    const authHeaders: Record<string, string> = {};
    if (storedToken) authHeaders["Authorization"] = `Bearer ${storedToken}`;

    const totalFiles = files.length;
    let completed = 0;
    const allWarnings: string[] = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
        const usePresigned = file.size > PRESIGNED_THRESHOLD;

        if (usePresigned) {
          // --- Large file: presigned URL → direct browser upload to R2 ---
          const presignedRes = await fetch("/api/documents/presigned-url", {
            method: "POST",
            headers: { ...authHeaders, "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              filename: file.name,
              mime_type: file.type || "application/octet-stream",
              size_bytes: file.size,
              folder_id: folderId,
              processing_type: subType,
            }),
          });

          if (!presignedRes.ok) {
            const body = await presignedRes.json().catch(() => ({ error: "Failed to get presigned URL" }));
            errors.push(`${file.name}: ${body.error || `HTTP ${presignedRes.status}`}`);
            completed++;
            setProgress(Math.round((completed / totalFiles) * 100));
            continue;
          }

          const { presigned_url, document_id } = await presignedRes.json();

          // Upload directly to R2 via presigned URL (or local API fallback)
          const isLocalUpload = presigned_url.startsWith("/");
          const uploadRes = await fetch(presigned_url, {
            method: "PUT",
            headers: {
              "Content-Type": file.type || "application/octet-stream",
              ...(isLocalUpload ? authHeaders : {}),
            },
            ...(isLocalUpload ? { credentials: "include" as const } : {}),
            body: file,
          });

          if (!uploadRes.ok) {
            errors.push(`${file.name}: Upload direct la storage a eșuat (HTTP ${uploadRes.status})`);
            completed++;
            setProgress(Math.round((completed / totalFiles) * 100));
            continue;
          }

          // Confirm upload to trigger processing
          const confirmRes = await fetch(`/api/documents/documents/${document_id}/confirm-upload`, {
            method: "POST",
            headers: { ...authHeaders, "Content-Type": "application/json" },
            credentials: "include",
          });

          if (!confirmRes.ok) {
            const body = await confirmRes.json().catch(() => ({ error: "Confirm failed" }));
            errors.push(`${file.name}: ${body.error || "Confirmare eșuată"}`);
          }
        } else {
          // --- Small file: classic FormData upload through Node ---
          const formData = new FormData();
          formData.append("file", file);
          formData.append("processingType", subType!);
          if (sessionId) formData.append("sessionId", sessionId);

          const result = await api<any>(`/api/documents/folders/${folderId}/documents`, {
            method: "POST",
            body: formData,
          });
          if (result.warnings) allWarnings.push(...result.warnings.map((w: string) => `${file.name}: ${w}`));
        }
      } catch (err: any) {
        errors.push(`${file.name}: ${err.message || "Eroare la upload"}`);
      }

      completed++;
      setProgress(Math.round((completed / totalFiles) * 100));
    }

    if (errors.length > 0) {
      setError(errors.join("\n"));
    } else {
      await new Promise(r => setTimeout(r, 300));
      onSuccess?.();
      onClose();
      resetState();
    }
    if (allWarnings.length > 0) setWarnings(allWarnings);
    setUploading(false);
  }, [canUpload, files, folderId, subType, sessionId, onSuccess, onClose, resetState]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4"
        style={{ animation: "slideUp 0.2s ease-out" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Upload document</h2>
            <p className="text-[13px] text-slate-500 mt-0.5">
              Destinație: <span className="font-medium text-slate-700">
                {folderType === "ghiduri" ? "Ghiduri" : folderType === "templateuri" ? "Template-uri" : "Clienți"}
              </span>
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-600 p-1 transition-colors"
            disabled={uploading}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="px-6 pb-6 space-y-4">
          {/* Sub-type selection */}
          {options.length > 0 && (
            <div className="space-y-2">
              <div className="text-[12px] text-slate-500 font-medium uppercase tracking-wide">
                Tip conținut
              </div>
              {options.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setSubType(opt.key)}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                    subType === opt.key
                      ? "border-blue-500 bg-blue-50/50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl mt-0.5">{opt.icon}</span>
                    <div>
                      <div className={`text-[14px] font-medium ${subType === opt.key ? "text-blue-700" : "text-slate-900"}`}>
                        {opt.label}
                      </div>
                      <div className="text-[12px] text-slate-500 mt-0.5">{opt.desc}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Drop zone */}
          <div
            onClick={() => files.length === 0 && inputRef.current?.click()}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={e => { e.preventDefault(); setDragOver(false); }}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
              dragOver
                ? "border-blue-400 bg-blue-50/50"
                : files.length > 0
                ? "border-blue-300 bg-blue-50/30"
                : "border-slate-300 hover:border-blue-400 hover:bg-slate-50"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.xlsx,.xls,.doc,.png,.jpg,.jpeg"
              onChange={e => { handleFiles(e.target.files); e.target.value = ""; }}
              className="hidden"
            />
            {files.length > 0 ? (
              <div>
                <div className="text-2xl mb-2">{"\u{1F4C4}"}</div>
                {files.map((f, i) => (
                  <div key={i} className="text-[14px] font-medium text-slate-900">
                    {f.name} <span className="text-[12px] text-slate-400 ml-1">({formatFileSize(f.size)})</span>
                  </div>
                ))}
                <div className="mt-3 flex items-center justify-center gap-3">
                  <button
                    className="text-[12px] text-blue-600 hover:underline bg-transparent border-none cursor-pointer"
                    onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
                  >
                    + Adaugă mai multe
                  </button>
                  <button
                    className="text-[12px] text-red-500 hover:underline bg-transparent border-none cursor-pointer"
                    onClick={e => { e.stopPropagation(); setFiles([]); setError(null); }}
                  >
                    Șterge toate
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="text-3xl mb-2 opacity-20">{dragOver ? "\u{1F4E5}" : "\u{1F4C1}"}</div>
                <div className="text-[14px] text-slate-600 font-medium">
                  {dragOver ? "Eliberează pentru upload" : "Trage fișierele aici sau click pentru a alege"}
                </div>
                <div className="text-[12px] text-slate-400 mt-1">PDF, DOCX, XLSX, DOC, PNG, JPG — max 50 MB per fișier</div>
              </div>
            )}
          </div>

          {/* Progress */}
          {uploading && (
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 whitespace-pre-line">
              {error}
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="text-[13px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              {warnings.map((w, i) => <div key={i}>{w}</div>)}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={handleClose}
              disabled={uploading}
              className="px-4 py-2.5 text-[13px] font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              Anulează
            </button>
            <button
              onClick={handleUpload}
              disabled={!canUpload}
              className={`px-5 py-2.5 text-[13px] font-medium rounded-lg transition-all flex items-center gap-2 ${
                canUpload
                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                  : "bg-slate-100 text-slate-400 cursor-not-allowed"
              }`}
            >
              {uploading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Se procesează... {Math.round(progress)}%
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  {files.length > 1 ? `Upload ${files.length} fișiere` : "Upload & Procesează"}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
