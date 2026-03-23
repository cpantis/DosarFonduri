"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiPost } from "@/lib/api";
import { Spinner } from "@/components/shared/Spinner";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordInner />
    </Suspense>
  );
}

function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const valid = pw.length >= 6 && pw === pw2;

  const go = async () => {
    if (!valid || !token) return;
    setBusy(true);
    setError("");
    try {
      await apiPost("/api/auth/reset-password", { token, password: pw });
      setDone(true);
    } catch (err: any) {
      setError(err.message || "Eroare la resetare");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <style>{`
        .auth-page { display: flex; min-height: 100vh; overflow: hidden; }
        .auth-brand { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 60px 80px; position: relative; overflow: hidden; background: linear-gradient(135deg, #0a0c10, #111827 50%, #0f172a); }
        .auth-brand::before { content: ''; position: absolute; top: -30%; left: -20%; width: 600px; height: 600px; border-radius: 50%; background: radial-gradient(circle, rgba(77,139,255,.08), transparent 70%); pointer-events: none; }
        .auth-brand::after { content: ''; position: absolute; bottom: -20%; right: -10%; width: 500px; height: 500px; border-radius: 50%; background: radial-gradient(circle, rgba(52,211,153,.05), transparent 70%); pointer-events: none; }
        .grid-bg { position: absolute; inset: 0; background-image: linear-gradient(rgba(77,139,255,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(77,139,255,.03) 1px, transparent 1px); background-size: 48px 48px; pointer-events: none; }
        .brand-inner { position: relative; z-index: 1; max-width: 520px; animation: fadeUp .8s ease; }
        .logo-row { display: flex; align-items: center; gap: 14px; margin-bottom: 48px; }
        .logo-icon { width: 48px; height: 48px; border-radius: 12px; background: #4d8bff; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 800; color: #fff; box-shadow: 0 4px 20px rgba(77,139,255,.3); }
        .logo-text { font-size: 24px; font-weight: 800; letter-spacing: -.5px; }
        .headline { font-size: 40px; font-weight: 800; line-height: 1.15; letter-spacing: -1px; margin-bottom: 20px; }
        .hl-grad { background: linear-gradient(135deg, #4d8bff, #34d399); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .brand-desc { font-size: 16px; line-height: 1.7; color: #94a3b8; margin-bottom: 48px; }
        .auth-right { width: 520px; min-width: 520px; display: flex; flex-direction: column; justify-content: center; padding: 48px 56px; background: #ffffff; border-left: 1px solid #e2e8f0; position: relative; overflow-y: auto; }
        .auth-wrap { max-width: 420px; width: 100%; margin: 0 auto; animation: fadeUp .6s ease .1s both; }
        .f-title { font-size: 26px; font-weight: 800; letter-spacing: -.5px; margin-bottom: 6px; }
        .f-sub { font-size: 14px; color: #64748b; margin-bottom: 32px; }
        .fg { margin-bottom: 18px; }
        .fl { display: block; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .8px; color: #94a3b8; margin-bottom: 7px; }
        .fi-wrap { position: relative; }
        .fi { width: 100%; padding: 12px 16px; border-radius: 10px; border: 1px solid #e2e8f0; background: #f8fafc; color: #0f172a; font-size: 15px; font-family: 'Inter', system-ui, sans-serif; outline: none; transition: border-color .2s, box-shadow .2s; }
        .fi:focus { border-color: #4d8bff; box-shadow: 0 0 0 3px rgba(77,139,255,.12); }
        .fi::placeholder { color: #94a3b8; }
        .fi.mono { font-family: 'JetBrains Mono', monospace; font-size: 14px; letter-spacing: 1px; }
        .fi.ok { border-color: #34d399; }
        .fi.err { border-color: #f87171; }
        .f-hint { font-size: 12px; margin-top: 5px; color: #94a3b8; }
        .f-hint.ok { color: #34d399; }
        .f-hint.err { color: #f87171; }
        .pw-toggle { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; color: #94a3b8; cursor: pointer; padding: 4px; font-size: 13px; font-family: 'Inter', system-ui, sans-serif; }
        .pw-toggle:hover { color: #0f172a; }
        .btn-p { width: 100%; padding: 14px; border-radius: 8px; border: none; background: #4d8bff; color: #fff; font-size: 15px; font-weight: 700; font-family: 'Inter', system-ui, sans-serif; cursor: pointer; transition: all .2s; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .btn-p:hover:not(:disabled) { background: #5d9bff; box-shadow: 0 4px 20px rgba(77,139,255,.3); transform: translateY(-1px); }
        .btn-p:disabled { opacity: .5; cursor: not-allowed; }
        .btn-s { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; background: transparent; color: #64748b; font-size: 14px; font-weight: 600; font-family: 'Inter', system-ui, sans-serif; cursor: pointer; transition: all .15s; }
        .btn-s:hover { border-color: #cbd5e1; background: #f1f5f9; color: #0f172a; }
        .cui-ok { padding: 16px; border-radius: 10px; border: 1px solid #34d399; background: rgba(52,211,153,.04); }
        .cui-ok .cn { font-size: 16px; font-weight: 700; color: #34d399; margin-bottom: 6px; }
        .cui-ok .cr { font-size: 13px; color: #64748b; margin-bottom: 3px; }
        .cui-err { padding: 12px 16px; border-radius: 10px; border: 1px solid #f87171; background: rgba(248,113,113,.04); font-size: 13px; color: #f87171; }
        .auth-foot { position: absolute; bottom: 20px; left: 56px; right: 56px; text-align: center; font-size: 11px; color: #94a3b8; }
        @media(max-width:1024px) { .auth-brand { display: none; } .auth-right { width: 100%; min-width: auto; border-left: none; } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <div className="auth-page">
        <div className="auth-brand">
          <div className="grid-bg" />
          <div className="brand-inner">
            <div className="logo-row">
              <div className="logo-icon">DF</div>
              <div className="logo-text">DosarFonduri</div>
            </div>
            <h1 className="headline">
              Dosare de finantare.
              <br />
              <span className="hl-grad">Simplu. Ghidat. Predictibil.</span>
            </h1>
            <p className="brand-desc">
              Platforma care automatizeaza identificarea eligibilitatii, colectarea
              datelor oficiale si generarea documentatiei pentru persoane juridice.
            </p>
          </div>
        </div>

        <div className="auth-right">
          <div className="auth-wrap">
            {!token ? (
              <>
                <h2 className="f-title">Link invalid</h2>
                <p className="f-sub">Link-ul de resetare este invalid sau lipseste token-ul.</p>
                <button className="btn-p" onClick={() => router.push("/login")}>
                  Inapoi la autentificare
                </button>
              </>
            ) : done ? (
              <>
                <h2 className="f-title">Parola resetata</h2>
                <p className="f-sub">Parola ta a fost schimbata cu succes.</p>
                <div className="cui-ok" style={{ marginBottom: 20 }}>
                  <div className="cn">Parola actualizata</div>
                  <div className="cr">Te poti autentifica cu noua parola.</div>
                </div>
                <button className="btn-p" onClick={() => router.push("/login")}>
                  Autentificare
                </button>
              </>
            ) : (
              <>
                <h2 className="f-title">Parola noua</h2>
                <p className="f-sub">Alege o parola noua pentru contul tau</p>

                {error && <div className="cui-err" style={{ marginBottom: 16 }}>{error}</div>}

                <div className="fg">
                  <label className="fl">Parola noua</label>
                  <div className="fi-wrap">
                    <input
                      className="fi mono"
                      type={show ? "text" : "password"}
                      placeholder="Minim 6 caractere"
                      value={pw}
                      onChange={(e) => setPw(e.target.value)}
                    />
                    <button className="pw-toggle" onClick={() => setShow(!show)}>
                      {show ? "Ascunde" : "Arata"}
                    </button>
                  </div>
                  {pw && pw.length < 6 && <div className="f-hint err">Minim 6 caractere</div>}
                  {pw.length >= 6 && <div className="f-hint ok">Parola valida</div>}
                </div>

                <div className="fg">
                  <label className="fl">Confirma parola</label>
                  <input
                    className={`fi mono ${pw2 && pw2 !== pw ? "err" : pw2 && pw2 === pw && pw.length >= 6 ? "ok" : ""}`}
                    type={show ? "text" : "password"}
                    placeholder="Repeta parola"
                    value={pw2}
                    onChange={(e) => setPw2(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && go()}
                  />
                  {pw2 && pw2 !== pw && <div className="f-hint err">Parolele nu coincid</div>}
                  {pw2 && pw2 === pw && pw.length >= 6 && <div className="f-hint ok">Parolele coincid</div>}
                </div>

                <button className="btn-p" disabled={busy || !valid} onClick={go}>
                  {busy ? <Spinner light /> : "Salveaza parola noua"}
                </button>
              </>
            )}
          </div>
          <div className="auth-foot">DosarFonduri &middot; &copy; 2026</div>
        </div>
      </div>
    </>
  );
}
