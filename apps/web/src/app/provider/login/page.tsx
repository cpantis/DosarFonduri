"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/api";
import { Spinner } from "@/components/shared/Spinner";

export default function ProviderLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const go = async () => {
    if (!email || !pw) return;
    setBusy(true);
    setError("");
    try {
      const data = await apiPost("/api/provider/auth/login", { email, password: pw });
      localStorage.setItem("df-provider-token", data.token);
      router.push("/provider/dashboard");
    } catch (err: any) {
      setError(err.message || "Credentiale invalide");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{ background: "var(--bg-deep)" }}
    >
      <div
        className="w-full max-w-md p-8"
        style={{
          background: "var(--bg-surface)",
          borderRadius: "var(--r-lg)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="flex items-center gap-3 mb-8">
          <div
            className="w-10 h-10 flex items-center justify-center text-lg font-extrabold text-white"
            style={{
              borderRadius: "10px",
              background: "var(--accent-blue)",
              boxShadow: "0 4px 20px rgba(77,139,255,.3)",
            }}
          >
            DF
          </div>
          <div>
            <div className="text-lg font-extrabold" style={{ color: "var(--text-primary)" }}>
              Provider Portal
            </div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              DosarFonduri Admin
            </div>
          </div>
        </div>

        {error && (
          <div
            className="p-3 mb-4 text-sm"
            style={{
              borderRadius: "var(--r-sm)",
              border: "1px solid var(--accent-red)",
              background: "rgba(248,113,113,.04)",
              color: "var(--accent-red)",
            }}
          >
            {error}
          </div>
        )}

        <div className="mb-4">
          <label
            className="block text-xs font-semibold uppercase mb-1.5"
            style={{ letterSpacing: ".8px", color: "var(--text-muted)" }}
          >
            Email
          </label>
          <input
            type="email"
            placeholder="admin@dosarfonduri.ro"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 text-[15px] outline-none transition-colors"
            style={{
              borderRadius: "var(--r-md)",
              border: "1px solid var(--border)",
              background: "var(--bg-deep)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-sans)",
            }}
          />
        </div>
        <div className="mb-6">
          <label
            className="block text-xs font-semibold uppercase mb-1.5"
            style={{ letterSpacing: ".8px", color: "var(--text-muted)" }}
          >
            Parola
          </label>
          <input
            type="password"
            placeholder="••••••••"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go()}
            className="w-full px-4 py-3 text-sm outline-none transition-colors"
            style={{
              borderRadius: "var(--r-md)",
              border: "1px solid var(--border)",
              background: "var(--bg-deep)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
              letterSpacing: "1px",
            }}
          />
        </div>
        <button
          onClick={go}
          disabled={busy || !email || !pw}
          className="w-full py-3.5 text-[15px] font-bold text-white flex items-center justify-center gap-2 cursor-pointer transition-all"
          style={{
            borderRadius: "var(--r-md)",
            border: "none",
            background: "var(--accent-blue)",
            fontFamily: "var(--font-sans)",
            opacity: busy || !email || !pw ? 0.5 : 1,
          }}
        >
          {busy ? <Spinner light /> : "Autentificare Provider"}
        </button>
      </div>
    </div>
  );
}
