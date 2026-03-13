"use client";
import { Sidebar } from "@/components/layout/Sidebar";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { AuthProvider } from "@/components/layout/AuthProvider";
import { useAuthState } from "@/hooks/useAuth";
import { AuthContext } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastProvider } from "@/components/shared/Toast";
import { useSSE } from "@/hooks/useSSE";

function AppShell({ children }: { children: React.ReactNode }) {
  const auth = useAuthState();
  const router = useRouter();

  useEffect(() => {
    if (!auth.loading && !auth.user) {
      router.replace("/login");
    }
  }, [auth.loading, auth.user, router]);

  if (auth.loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "var(--bg-deep)" }}>
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 flex items-center justify-center text-white text-xl font-extrabold rounded-xl bg-blue-600 shadow-lg shadow-blue-600/30">
            DF
          </div>
          <div className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
            Se incarca...
          </div>
        </div>
      </div>
    );
  }

  if (!auth.user) return null;

  // If user has no organization, show pending screen
  if (auth.user.status === "pending_cabinet") {
    return (
      <AuthContext.Provider value={auth}>
        <PendingCabinetScreen />
      </AuthContext.Provider>
    );
  }

  return (
    <AuthContext.Provider value={auth}>
      <SSEProvider />
      <div className="flex h-screen overflow-hidden transition-colors" style={{ background: "var(--bg-deep)" }}>
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden min-w-0" style={{ background: "var(--bg-deep)" }}>
          {children}
        </main>
      </div>
    </AuthContext.Provider>
  );
}

/** Human-readable field key labels */
const FIELD_LABELS: Record<string, string> = {
  denumire_solicitant: "Denumire",
  cui: "CUI",
  nr_inmatriculare: "Nr. Inmatriculare",
  forma_juridica: "Forma Juridica",
  caen_principal: "CAEN Principal",
  adresa_sediu: "Adresa Sediu",
  localitate: "Localitate",
  judet: "Judet",
  stare_firma: "Stare Firma",
  capital_social: "Capital Social",
  data_inregistrare: "Data Inregistrare",
  furnizor_nume: "Furnizor",
  total_oferta_eur: "Total Oferta",
  banca: "Banca",
  sold_disponibil: "Sold Disponibil",
  data_extras: "Data Extras",
  iban: "IBAN",
  tip_document_mediu: "Tip Document",
  numar_document_mediu: "Nr. Document",
  ani_activitate_agroalimentara: "Ani Activitate",
  nr_contract: "Nr. Contract",
  suprafata_contracte: "Suprafata (ha)",
  putere_tractoare_existente: "Putere Tractoare (CP)",
};

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/** Global SSE connection — connects once at app level */
function SSEProvider() {
  const { jobProgress, extractionProgress } = useSSE({ enabled: true });

  // Show active job progress + extraction progress indicators
  if (jobProgress.length === 0 && extractionProgress.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[150] flex flex-col gap-2" style={{ maxWidth: 380 }}>
      {/* Extraction progress cards */}
      {extractionProgress.map(ext => (
        <div
          key={`ext-${ext.documentId}`}
          className="px-4 py-3 rounded-xl text-[13px] font-medium animate-[slideUp_.2s_ease-out]"
          style={{
            background: "var(--bg-surface)",
            color: "var(--text-primary)",
            border: ext.completed ? "1px solid var(--accent-green-border)" : "1px solid var(--accent-blue-border)",
            boxShadow: "var(--shadow)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm" style={{ color: ext.completed ? "var(--accent-green)" : "var(--accent-blue)" }}>
              {ext.completed ? "\u2705" : "\u{1F50D}"}
            </span>
            <span className="truncate flex-1">
              {ext.completed
                ? `Extractie completa. ${ext.extractedFields.length} campuri populate.`
                : `Extrag date... (${ext.extractedFields.length}/${ext.totalFields || "?"} campuri)`}
            </span>
          </div>
          <div className="text-[11px] mb-1.5" style={{ color: "var(--text-muted)" }}>
            {ext.documentName}
          </div>
          {/* Per-field progress chips */}
          <div className="flex flex-wrap gap-1">
            {ext.extractedFields.slice(-8).map(f => (
              <span
                key={f.key}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold animate-[slideUp_.15s_ease-out]"
                style={{ background: "var(--accent-green-bg)", color: "var(--accent-green)" }}
              >
                {fieldLabel(f.key)} {"\u2713"}
              </span>
            ))}
          </div>
          {/* Progress bar */}
          {ext.totalFields > 0 && (
            <div className="h-1 rounded-sm overflow-hidden mt-1.5" style={{ background: "var(--bg-elevated)" }}>
              <div
                className="h-full rounded-sm transition-[width] duration-300 ease-out"
                style={{
                  width: `${Math.round((ext.extractedFields.length / ext.totalFields) * 100)}%`,
                  background: ext.completed ? "var(--accent-green)" : "var(--accent-blue)",
                }}
              />
            </div>
          )}
        </div>
      ))}

      {/* Job progress cards */}
      {jobProgress.map(job => (
        <div
          key={job.id}
          className="px-4 py-3 rounded-xl text-[13px] font-medium animate-[slideUp_.2s_ease-out]"
          style={{
            background: "var(--bg-surface)",
            color: "var(--text-primary)",
            border: job.status === "failed" ? "1px solid var(--accent-red-border)" : "1px solid var(--accent-blue-border)",
            boxShadow: "var(--shadow)",
          }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span style={{ color: job.status === "failed" ? "var(--accent-red)" : "var(--accent-blue)" }}>
              {job.status === "processing" ? "&#9881;" : job.status === "failed" ? "&#10060;" : "&#9989;"}
            </span>
            <span className="truncate">{job.message}</span>
          </div>
          <div className="h-1 rounded-sm overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
            <div
              className="h-full rounded-sm transition-[width] duration-300 ease-out"
              style={{
                width: `${job.progress}%`,
                background: job.status === "failed" ? "var(--accent-red)" : "var(--accent-blue)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function PendingCabinetScreen() {
  return (
    <div className="flex h-screen items-center justify-center" style={{ background: "var(--bg-deep)" }}>
      <div className="text-center max-w-md px-6">
        <div
          className="w-16 h-16 mx-auto mb-6 flex items-center justify-center text-3xl rounded-xl"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
        >
          ⏳
        </div>
        <h2 className="text-2xl font-extrabold mb-3" style={{ color: "var(--text-primary)" }}>
          Asteapta activarea
        </h2>
        <p className="text-sm leading-relaxed mb-8" style={{ color: "var(--text-secondary)" }}>
          Contul tau a fost creat cu succes. Asteapta sa fii adaugat intr-un
          cabinet de catre un administrator, sau introdu un cod de cabinet
          pentru a activa contul.
        </p>
        <div className="p-4 text-left rounded-[10px]" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <div className="text-[10px] font-bold uppercase mb-2 tracking-wider" style={{ color: "var(--text-muted)" }}>
            Ai un cod de cabinet?
          </div>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Daca ai primit un cod de cabinet de la furnizorul DosarFonduri,
            te rugam sa te deconectezi si sa te inregistrezi din nou folosind
            codul.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ErrorBoundary>
          <AppShell>{children}</AppShell>
        </ErrorBoundary>
      </ToastProvider>
    </ThemeProvider>
  );
}
