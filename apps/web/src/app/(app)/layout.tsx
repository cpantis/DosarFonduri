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
      <div
        className="flex h-screen items-center justify-center"
        style={{ background: "var(--bg-deep)" }}
      >
        <div className="text-center">
          <div
            className="w-12 h-12 mx-auto mb-4 flex items-center justify-center text-white text-xl font-extrabold"
            style={{
              borderRadius: "12px",
              background: "var(--accent-blue)",
              boxShadow: "0 4px 20px rgba(77,139,255,.3)",
            }}
          >
            DF
          </div>
          <div
            className="text-sm font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
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
      <div
        className="flex h-screen overflow-hidden transition-colors"
        style={{
          background: "var(--bg-deep)",
          color: "var(--text-primary)",
        }}
      >
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
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
          className="px-4 py-3 rounded-lg border text-xs font-medium"
          style={{
            background: "var(--bg-surface)",
            borderColor: ext.completed ? "var(--accent-green)" : "var(--accent-blue)",
            color: "var(--text-primary)",
            animation: "slideUp .2s ease-out",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span style={{ color: ext.completed ? "var(--accent-green)" : "var(--accent-blue)", fontSize: 14 }}>
              {ext.completed ? "\u2705" : "\u{1F50D}"}
            </span>
            <span className="truncate" style={{ flex: 1 }}>
              {ext.completed
                ? `Extractie completa. ${ext.extractedFields.length} campuri populate.`
                : `Extrag date... (${ext.extractedFields.length}/${ext.totalFields || "?"} campuri)`}
            </span>
          </div>
          <div className="text-[10px] mb-1.5" style={{ color: "var(--text-muted)" }}>
            {ext.documentName}
          </div>
          {/* Per-field progress chips */}
          <div className="flex flex-wrap gap-1">
            {ext.extractedFields.slice(-8).map(f => (
              <span
                key={f.key}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded"
                style={{
                  background: "rgba(52,211,153,.08)",
                  color: "var(--accent-green)",
                  fontSize: 10,
                  fontWeight: 600,
                  animation: "slideUp .15s ease-out",
                }}
              >
                {fieldLabel(f.key)} {"\u2713"}
              </span>
            ))}
          </div>
          {/* Progress bar */}
          {ext.totalFields > 0 && (
            <div style={{ height: 3, borderRadius: 2, background: "var(--bg-deep)", overflow: "hidden", marginTop: 6 }}>
              <div style={{
                height: "100%",
                width: `${Math.round((ext.extractedFields.length / ext.totalFields) * 100)}%`,
                borderRadius: 2,
                background: ext.completed ? "var(--accent-green)" : "var(--accent-blue)",
                transition: "width 0.3s ease",
              }} />
            </div>
          )}
        </div>
      ))}

      {/* Job progress cards */}
      {jobProgress.map(job => (
        <div
          key={job.id}
          className="px-4 py-3 rounded-lg border text-xs font-medium"
          style={{
            background: "var(--bg-surface)",
            borderColor: job.status === "failed" ? "var(--accent-red)" : "var(--accent-blue)",
            color: "var(--text-primary)",
            animation: "slideUp .2s ease-out",
          }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span style={{ color: job.status === "failed" ? "var(--accent-red)" : "var(--accent-blue)" }}>
              {job.status === "processing" ? "&#9881;" : job.status === "failed" ? "&#10060;" : "&#9989;"}
            </span>
            <span className="truncate">{job.message}</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: "var(--bg-deep)", overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${job.progress}%`,
              borderRadius: 2,
              background: job.status === "failed" ? "var(--accent-red)" : "var(--accent-blue)",
              transition: "width 0.3s ease",
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function PendingCabinetScreen() {
  return (
    <div
      className="flex h-screen items-center justify-center"
      style={{ background: "var(--bg-deep)" }}
    >
      <div className="text-center max-w-md px-6">
        <div
          className="w-16 h-16 mx-auto mb-6 flex items-center justify-center text-3xl"
          style={{
            borderRadius: "var(--r-lg)",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
          }}
        >
          ⏳
        </div>
        <h2
          className="text-2xl font-extrabold mb-3"
          style={{ color: "var(--text-primary)" }}
        >
          Asteapta activarea
        </h2>
        <p
          className="text-sm leading-relaxed mb-8"
          style={{ color: "var(--text-secondary)" }}
        >
          Contul tau a fost creat cu succes. Asteapta sa fii adaugat intr-un
          cabinet de catre un administrator, sau introdu un cod de cabinet
          pentru a activa contul.
        </p>
        <div
          className="p-4 text-left"
          style={{
            borderRadius: "var(--r-md)",
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div
            className="text-[10px] font-bold uppercase mb-2"
            style={{ letterSpacing: "0.8px", color: "var(--text-muted)" }}
          >
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
