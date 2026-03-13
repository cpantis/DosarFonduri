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
    <>
      <style>{`
        .prov-login-bg {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }
        .prov-login-bg::before {
          content: '';
          position: absolute;
          top: -40%;
          left: -20%;
          width: 80%;
          height: 80%;
          background: radial-gradient(ellipse at center, rgba(167,139,250,.06) 0%, transparent 70%);
          pointer-events: none;
        }
        .prov-login-bg::after {
          content: '';
          position: absolute;
          bottom: -30%;
          right: -15%;
          width: 60%;
          height: 60%;
          background: radial-gradient(ellipse at center, rgba(77,139,255,.04) 0%, transparent 70%);
          pointer-events: none;
        }
        .prov-login-card {
          width: 420px;
          padding: 40px;
          position: relative;
          z-index: 1;
          box-shadow: 0 8px 40px rgba(0,0,0,.2);
        }
        .prov-login-input {
          width: 100%;
          padding: 12px 16px;
          font-size: 14px;
          outline: none;
          transition: border-color .15s, box-shadow .15s;
        }
        .prov-login-input:focus {
          border-color: #a78bfa;
          box-shadow: 0 0 0 3px rgba(167,139,250,.12);
        }
        .prov-login-btn {
          width: 100%;
          padding: 13px;
          border: none;
          color: #fff;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          transition: all .15s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-shadow: 0 2px 12px rgba(167,139,250,.25);
        }
        .prov-login-btn:hover:not(:disabled) {
          background: #b69dfc;
          box-shadow: 0 4px 20px rgba(167,139,250,.35);
        }
        .prov-login-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>

      <div className="prov-login-bg bg-slate-50">
        <div className="prov-login-card bg-white border border-slate-200 rounded-xl">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div
              className="w-11 h-11 flex items-center justify-center text-lg font-extrabold text-white rounded-xl bg-violet-500 shadow-[0_4px_20px_rgba(167,139,250,.3)]"
              style={{
                background: "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)",
              }}
            >
              DF
            </div>
            <div>
              <div className="text-lg font-extrabold text-slate-900">
                DosarFonduri
              </div>
              <div
                className="text-[11px] font-semibold uppercase text-violet-500"
                style={{ letterSpacing: "1px" }}
              >
                Provider Dashboard
              </div>
            </div>
          </div>

          {/* Subtitle */}
          <div className="text-sm mb-6 text-slate-500">
            Autentificare in panoul de administrare a cabinetelor.
          </div>

          {/* Error */}
          {error && (
            <div
              className="p-3 mb-4 text-sm font-medium rounded-md border border-red-500 text-red-500"
              style={{
                background: "rgba(248,113,113,.06)",
              }}
            >
              {error}
            </div>
          )}

          {/* Email */}
          <div className="mb-4">
            <label
              className="block text-[11px] font-semibold uppercase mb-1.5 text-slate-400"
              style={{ letterSpacing: ".7px" }}
            >
              Email
            </label>
            <input
              type="email"
              placeholder="admin@dosarfonduri.ro"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="prov-login-input rounded-[10px] border border-slate-200 bg-slate-50 text-slate-900 font-sans placeholder:text-slate-400"
              autoFocus
            />
          </div>

          {/* Password */}
          <div className="mb-6">
            <label
              className="block text-[11px] font-semibold uppercase mb-1.5 text-slate-400"
              style={{ letterSpacing: ".7px" }}
            >
              Parola
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && go()}
              className="prov-login-input rounded-[10px] border border-slate-200 bg-slate-50 text-slate-900 font-mono tracking-widest placeholder:text-slate-400"
            />
          </div>

          {/* Submit */}
          <button
            onClick={go}
            disabled={busy || !email || !pw}
            className="prov-login-btn rounded-[10px] bg-violet-500 font-sans"
          >
            {busy ? <Spinner light /> : "Autentificare Provider"}
          </button>

          {/* Footer */}
          <div className="text-center mt-5 text-xs text-slate-400">
            DosarFonduri &copy; {new Date().getFullYear()} &middot; Provider Portal
          </div>
        </div>
      </div>
    </>
  );
}
