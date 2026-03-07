"use client";
import { EmptyState } from "@/components/shared/EmptyState";

export default function ProviderDashboardPage() {
  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--bg-deep)" }}
    >
      <div
        className="px-7 py-4 flex items-center gap-4"
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-surface)",
        }}
      >
        <div
          className="w-9 h-9 flex items-center justify-center text-white text-base font-extrabold"
          style={{
            borderRadius: "10px",
            background: "var(--accent-blue)",
          }}
        >
          DF
        </div>
        <div className="text-lg font-extrabold flex-1">Provider Dashboard</div>
      </div>
      <div className="p-7">
        <EmptyState
          icon="🏗"
          title="Provider Dashboard"
          description="Dashboard-ul provider va fi complet in Faza 7. Aici vei gestiona cabinete, coduri si statistici."
        />
      </div>
    </div>
  );
}
