"use client";
import { Sidebar } from "@/components/layout/Sidebar";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { AuthProvider } from "@/components/layout/AuthProvider";
import { useAuthState } from "@/hooks/useAuth";
import { AuthContext } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

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
      <AppShell>{children}</AppShell>
    </ThemeProvider>
  );
}
