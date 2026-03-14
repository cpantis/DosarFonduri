"use client";

import { useState, useRef } from "react";
import { api } from "@/lib/api";

/* ══════════════════════════════════════════
   TYPES
   ══════════════════════════════════════════ */

interface FolderUploadProps {
  folderId: string;
  folderType: "ghiduri" | "templateuri" | "clienti_prospecti" | "clienti_finali";
  onSuccess?: () => void;
}

interface UploadOption {
  key: string;
  label: string;
  icon: string;
  accept: string;
}

/* ══════════════════════════════════════════
   UPLOAD OPTIONS PER FOLDER TYPE
   ══════════════════════════════════════════ */

const UPLOAD_OPTIONS: Record<string, UploadOption[]> = {
  ghiduri: [
    { key: "ghid", label: "Upload ghid solicitant", icon: "\u{1F4D6}", accept: ".pdf" },
    { key: "reference_data", label: "Upload anex\u0103 cu date", icon: "\u{1F4CA}", accept: ".pdf,.docx,.xlsx" },
  ],
  templateuri: [
    { key: "template_fill", label: "Upload formular (completare c\u00E2mpuri)", icon: "\u{1F4CB}", accept: ".pdf,.docx,.xlsx" },
    { key: "template_compose", label: "Upload document consultant", icon: "\u{1F4DD}", accept: ".pdf,.docx,.xlsx" },
  ],
  clienti_prospecti: [],
  clienti_finali: [],
};

/** Files above this size use presigned URL (direct browser → R2) */
const PRESIGNED_THRESHOLD = 10 * 1024 * 1024; // 10 MB

/* ══════════════════════════════════════════
   COMPONENT
   ══════════════════════════════════════════ */

export function FolderUploadButton({ folderId, folderType, onSuccess }: FolderUploadProps) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingType = useRef<string | null>(null);
  const pendingAccept = useRef<string>("");

  const options = UPLOAD_OPTIONS[folderType] || [];
  if (options.length === 0) return null;

  function handleOptionClick(option: UploadOption) {
    pendingType.current = option.key;
    pendingAccept.current = option.accept;
    setOpen(false);
    if (inputRef.current) {
      inputRef.current.accept = option.accept;
      inputRef.current.value = "";
      inputRef.current.click();
    }
  }

  async function uploadSingleFile(file: File, processingType: string): Promise<void> {
    const storedToken = typeof window !== "undefined" ? localStorage.getItem("df-token") : null;
    const authHeaders: Record<string, string> = {};
    if (storedToken) authHeaders["Authorization"] = `Bearer ${storedToken}`;

    const usePresigned = file.size > PRESIGNED_THRESHOLD;

    if (usePresigned) {
      // Large file: presigned URL → direct browser upload to R2
      const presignedRes = await fetch("/api/documents/presigned-url", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          filename: file.name,
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
          folder_id: folderId,
          processing_type: processingType,
        }),
      });

      if (!presignedRes.ok) {
        const body = await presignedRes.json().catch(() => ({ error: "Failed to get presigned URL" }));
        throw new Error(body.error || `HTTP ${presignedRes.status}`);
      }

      const { presigned_url, document_id } = await presignedRes.json();

      // Upload directly to R2 (or local API fallback)
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
        throw new Error(`Upload direct la storage a e\u0219uat (HTTP ${uploadRes.status})`);
      }

      // Confirm upload to trigger processing
      const confirmRes = await fetch(`/api/documents/documents/${document_id}/confirm-upload`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        credentials: "include",
      });

      if (!confirmRes.ok) {
        const body = await confirmRes.json().catch(() => ({ error: "Confirm failed" }));
        throw new Error(body.error || "Confirmare e\u0219uat\u0103");
      }
    } else {
      // Small file: classic FormData upload through Node
      const formData = new FormData();
      formData.append("file", file);
      formData.append("processingType", processingType);

      await api(`/api/documents/folders/${folderId}/documents`, {
        method: "POST",
        body: formData,
        timeout: 120_000, // 2 min — large PDFs need more than default 30s
      });
    }
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0 || !pendingType.current) return;

    const processingType = pendingType.current;
    pendingType.current = null;
    setUploading(processingType);

    const files = Array.from(fileList);
    const errors: string[] = [];

    try {
      for (const file of files) {
        try {
          await uploadSingleFile(file, processingType);
        } catch (err: any) {
          errors.push(`${file.name}: ${err.message || "Eroare la upload"}`);
        }
      }

      if (errors.length > 0) {
        alert(`Eroare upload:\n${errors.join("\n")}`);
      }

      // Always refresh — some files may have succeeded
      onSuccess?.();
    } finally {
      setUploading(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={handleFileSelected}
        className="hidden"
      />

      {/* + Button */}
      <button
        onClick={() => setOpen(!open)}
        disabled={uploading !== null}
        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
          uploading
            ? "bg-blue-100 text-blue-600 cursor-wait"
            : "bg-blue-600 hover:bg-blue-700 text-white"
        }`}
        title={uploading ? "Upload \u00EEn curs..." : "Upload document"}
      >
        {uploading ? (
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
          </svg>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-50 bg-white rounded-xl border border-slate-200 shadow-lg py-1 w-80">
            {options.map(opt => (
              <button
                key={opt.key}
                onClick={() => handleOptionClick(opt)}
                className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-center gap-3"
              >
                <span className="text-lg">{opt.icon}</span>
                <div>
                  <div className="text-[13px] font-medium text-slate-900">{opt.label}</div>
                  <div className="text-[11px] text-slate-400">
                    {opt.accept.replace(/\./g, "").toUpperCase().replace(/,/g, ", ")}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
