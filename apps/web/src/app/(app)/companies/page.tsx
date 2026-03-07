"use client";
import { EmptyState } from "@/components/shared/EmptyState";

export default function CompaniesPage() {
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
          Firme
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-7">
        <EmptyState
          icon="🏢"
          title="Nicio firma adaugata"
          description="Adauga prima firma pentru a incepe sa creezi proiecte de finantare."
        />
      </div>
    </>
  );
}
