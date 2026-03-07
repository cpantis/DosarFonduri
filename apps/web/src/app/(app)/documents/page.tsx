"use client";
import { EmptyState } from "@/components/shared/EmptyState";

export default function DocumentsPage() {
  return (
    <>
      <div
        className="px-7 py-3.5 flex items-center gap-4 flex-shrink-0"
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-surface)",
        }}
      >
        <div className="text-xl font-extrabold flex-1" style={{ letterSpacing: "-.3px" }}>
          Documente
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-7">
        <EmptyState
          icon="📃"
          title="Niciun document"
          description="Organizeaza ghiduri, templateuri si documente client in structura arborescenta."
        />
      </div>
    </>
  );
}
