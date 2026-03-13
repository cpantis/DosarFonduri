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

/** Human-readable field key labels */
const FIELD_LABELS: Record<string, string> = {
  denumire_solicitant: "Denumire", cui: "CUI", nr_inmatriculare: "Nr. Înmatriculare",
  forma_juridica: "Forma Juridică", caen_principal: "CAEN Principal", adresa_sediu: "Adresa Sediu",
  localitate: "Localitate", judet: "Județ", stare_firma: "Stare Firmă", capital_social: "Capital Social",
  data_inregistrare: "Data Înregistrare", furnizor_nume: "Furnizor", total_oferta_eur: "Total Ofertă",
  banca: "Bancă", sold_disponibil: "Sold Disponibil", data_extras: "Data Extras", iban: "IBAN",
  tip_document_mediu: "Tip Document", numar_document_mediu: "Nr. Document",
  ani_activitate_agroalimentara: "Ani Activitate", nr_contract: "Nr. Contract",
  suprafata_contracte: "Suprafață (ha)", putere_tractoare_existente: "Putere Tractoare (CP)",
};

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

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
        <div className="text-center animate-[fadeIn_.3s_ease-out]">
          <div className="w-10 h-10 mx-auto mb-4 flex items-center justify-center text-white text-[11px] font-bold rounded-lg bg-blue-600 shadow-lg shadow-blue-600/20">
            DF
          </div>
          <div className="flex items-center gap-2 text-[13px] text-slate-400">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Se încarcă...
          </div>
        </div>
      </div>
    );
  }

  if (!auth.user) return null;

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
      <div className="flex min-h-screen bg-slate-50" style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-y-auto">
          {children}
        </main>
      </div>
    </AuthContext.Provider>
  );
}

/** Global SSE connection */
function SSEProvider() {
  const { jobProgress, extractionProgress } = useSSE({ enabled: true });

  if (jobProgress.length === 0 && extractionProgress.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[150] flex flex-col gap-2" style={{ maxWidth: 360 }}>
      {extractionProgress.map(ext => (
        <div
          key={`ext-${ext.documentId}`}
          className={`px-4 py-3 rounded-xl text-[13px] font-medium bg-white border shadow-sm animate-[slideUp_.2s_ease-out] ${
            ext.completed ? "border-emerald-200" : "border-blue-200"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-sm ${ext.completed ? "text-emerald-500" : "text-blue-500"}`}>
              {ext.completed ? "✅" : "🔍"}
            </span>
            <span className="truncate flex-1 text-slate-900">
              {ext.completed
                ? `Extracție completă. ${ext.extractedFields.length} câmpuri populate.`
                : `Extrag date... (${ext.extractedFields.length}/${ext.totalFields || "?"} câmpuri)`}
            </span>
          </div>
          <div className="text-[11px] mb-1.5 text-slate-400">{ext.documentName}</div>
          <div className="flex flex-wrap gap-1">
            {ext.extractedFields.slice(-8).map(f => (
              <span key={f.key} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-600 animate-[slideUp_.15s_ease-out]">
                {fieldLabel(f.key)} ✓
              </span>
            ))}
          </div>
          {ext.totalFields > 0 && (
            <div className="h-1 rounded-full overflow-hidden mt-2 bg-slate-100">
              <div
                className="h-full rounded-full transition-[width] duration-300 ease-out"
                style={{
                  width: `${Math.round((ext.extractedFields.length / ext.totalFields) * 100)}%`,
                  background: ext.completed ? "#059669" : "#2563eb",
                }}
              />
            </div>
          )}
        </div>
      ))}

      {jobProgress.map(job => (
        <div
          key={job.id}
          className={`px-4 py-3 rounded-xl text-[13px] font-medium bg-white border shadow-sm animate-[slideUp_.2s_ease-out] ${
            job.status === "failed" ? "border-red-200" : "border-blue-200"
          }`}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span className={job.status === "failed" ? "text-red-500" : "text-blue-500"}>
              {job.status === "processing" ? "⚙️" : job.status === "failed" ? "❌" : "✅"}
            </span>
            <span className="truncate text-slate-900">{job.message}</span>
          </div>
          <div className="h-1 rounded-full overflow-hidden bg-slate-100">
            <div
              className="h-full rounded-full transition-[width] duration-300 ease-out"
              style={{
                width: `${job.progress}%`,
                background: job.status === "failed" ? "#dc2626" : "#2563eb",
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
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <div className="text-center max-w-md px-6 animate-[fadeUp_.5s_ease-out]">
        <div className="w-14 h-14 mx-auto mb-6 flex items-center justify-center text-2xl rounded-2xl bg-slate-100 border border-slate-200">
          ⏳
        </div>
        <h2 className="text-[24px] font-bold text-slate-900 tracking-tight mb-2">
          Așteaptă activarea
        </h2>
        <p className="text-[13px] text-slate-500 leading-relaxed mb-8">
          Contul tău a fost creat cu succes. Așteaptă să fii adăugat într-un
          cabinet de către un administrator, sau introdu un cod de cabinet
          pentru a activa contul.
        </p>
        <div className="p-4 text-left rounded-xl bg-white border border-slate-200">
          <div className="text-[10px] font-semibold uppercase mb-2 tracking-wider text-slate-400">
            Ai un cod de cabinet?
          </div>
          <p className="text-[13px] text-slate-500 leading-relaxed">
            Dacă ai primit un cod de cabinet de la furnizorul DosarFonduri,
            te rugăm să te deconectezi și să te înregistrezi din nou folosind
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
