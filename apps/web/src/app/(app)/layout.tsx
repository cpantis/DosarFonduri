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
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 flex items-center justify-center text-white text-xl font-extrabold rounded-xl bg-blue-600 shadow-lg shadow-blue-600/30">
            DF
          </div>
          <div className="text-sm font-medium text-slate-500">
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
      <div className="flex h-screen overflow-hidden transition-colors bg-slate-50">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden min-w-0 bg-slate-50">
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
          className={`px-4 py-3 rounded-lg border text-xs font-medium bg-white text-slate-900 animate-[slideUp_.2s_ease-out] ${
            ext.completed ? "border-emerald-400" : "border-blue-400"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-sm ${ext.completed ? "text-emerald-500" : "text-blue-500"}`}>
              {ext.completed ? "\u2705" : "\u{1F50D}"}
            </span>
            <span className="truncate flex-1">
              {ext.completed
                ? `Extractie completa. ${ext.extractedFields.length} campuri populate.`
                : `Extrag date... (${ext.extractedFields.length}/${ext.totalFields || "?"} campuri)`}
            </span>
          </div>
          <div className="text-[10px] mb-1.5 text-slate-400">
            {ext.documentName}
          </div>
          {/* Per-field progress chips */}
          <div className="flex flex-wrap gap-1">
            {ext.extractedFields.slice(-8).map(f => (
              <span
                key={f.key}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 text-[10px] font-semibold animate-[slideUp_.15s_ease-out]"
              >
                {fieldLabel(f.key)} {"\u2713"}
              </span>
            ))}
          </div>
          {/* Progress bar */}
          {ext.totalFields > 0 && (
            <div className="h-[3px] rounded-sm bg-slate-100 overflow-hidden mt-1.5">
              <div
                className={`h-full rounded-sm transition-[width] duration-300 ease-out ${ext.completed ? "bg-emerald-500" : "bg-blue-500"}`}
                style={{ width: `${Math.round((ext.extractedFields.length / ext.totalFields) * 100)}%` }}
              />
            </div>
          )}
        </div>
      ))}

      {/* Job progress cards */}
      {jobProgress.map(job => (
        <div
          key={job.id}
          className={`px-4 py-3 rounded-lg border text-xs font-medium bg-white text-slate-900 animate-[slideUp_.2s_ease-out] ${
            job.status === "failed" ? "border-red-400" : "border-blue-400"
          }`}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span className={job.status === "failed" ? "text-red-500" : "text-blue-500"}>
              {job.status === "processing" ? "&#9881;" : job.status === "failed" ? "&#10060;" : "&#9989;"}
            </span>
            <span className="truncate">{job.message}</span>
          </div>
          <div className="h-1 rounded-sm bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-sm transition-[width] duration-300 ease-out ${job.status === "failed" ? "bg-red-500" : "bg-blue-500"}`}
              style={{ width: `${job.progress}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function PendingCabinetScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <div className="text-center max-w-md px-6">
        <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center text-3xl rounded-xl bg-slate-100 border border-slate-200">
          ⏳
        </div>
        <h2 className="text-2xl font-extrabold mb-3 text-slate-900">
          Asteapta activarea
        </h2>
        <p className="text-sm leading-relaxed mb-8 text-slate-500">
          Contul tau a fost creat cu succes. Asteapta sa fii adaugat intr-un
          cabinet de catre un administrator, sau introdu un cod de cabinet
          pentru a activa contul.
        </p>
        <div className="p-4 text-left rounded-[10px] bg-white border border-slate-200">
          <div className="text-[10px] font-bold uppercase mb-2 tracking-wider text-slate-400">
            Ai un cod de cabinet?
          </div>
          <p className="text-xs text-slate-500">
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
