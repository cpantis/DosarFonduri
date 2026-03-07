"use client";
import { EmptyState } from "@/components/shared/EmptyState";

export default function ProjectsPage() {
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
          Proiecte
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-7">
        <EmptyState
          icon="💼"
          title="Niciun proiect"
          description="Creeaza un proiect nou selectand o firma si un program de finantare."
        />
      </div>
    </>
  );
}
