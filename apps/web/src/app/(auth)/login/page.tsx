"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/api";
import { setToken } from "@/lib/auth";
import { Spinner } from "@/components/shared/Spinner";

export default function LoginPage() {
  const [view, setView] = useState<"login" | "signup">("login");

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
        .logo-icon { width: 48px; height: 48px; border-radius: 12px; background: var(--accent-blue); display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 800; color: #fff; box-shadow: 0 4px 20px rgba(77,139,255,.3); }
        .logo-text { font-size: 24px; font-weight: 800; letter-spacing: -.5px; }
        .headline { font-size: 40px; font-weight: 800; line-height: 1.15; letter-spacing: -1px; margin-bottom: 20px; }
        .hl-grad { background: linear-gradient(135deg, var(--accent-blue), var(--accent-green)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .brand-desc { font-size: 16px; line-height: 1.7; color: var(--text-secondary); margin-bottom: 48px; }
        .auth-right { width: 520px; min-width: 520px; display: flex; flex-direction: column; justify-content: center; padding: 48px 56px; background: var(--bg-surface); border-left: 1px solid var(--border); position: relative; overflow-y: auto; }
        .auth-right.wide { width: 620px; min-width: 620px; }
        .auth-wrap { max-width: 420px; width: 100%; margin: 0 auto; animation: fadeUp .6s ease .1s both; }
        .f-title { font-size: 26px; font-weight: 800; letter-spacing: -.5px; margin-bottom: 6px; }
        .f-sub { font-size: 14px; color: var(--text-secondary); margin-bottom: 32px; }
        .fg { margin-bottom: 18px; }
        .fl { display: block; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .8px; color: var(--text-muted); margin-bottom: 7px; }
        .fi-wrap { position: relative; }
        .fi { width: 100%; padding: 12px 16px; border-radius: var(--r-md); border: 1px solid var(--border); background: var(--bg-deep); color: var(--text-primary); font-size: 15px; font-family: var(--font-sans); outline: none; transition: border-color .2s, box-shadow .2s; }
        .fi:focus { border-color: var(--accent-blue); box-shadow: 0 0 0 3px rgba(77,139,255,.12); }
        .fi::placeholder { color: var(--text-muted); }
        .fi.mono { font-family: var(--font-mono); font-size: 14px; letter-spacing: 1px; }
        .fi.ok { border-color: var(--accent-green); }
        .fi.err { border-color: var(--accent-red); }
        .f-hint { font-size: 12px; margin-top: 5px; color: var(--text-muted); }
        .f-hint.ok { color: var(--accent-green); }
        .f-hint.err { color: var(--accent-red); }
        .pw-toggle { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; font-size: 13px; font-family: var(--font-sans); }
        .pw-toggle:hover { color: var(--text-primary); }
        .f-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
        .remember { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary); cursor: pointer; }
        .remember input { accent-color: var(--accent-blue); width: 16px; height: 16px; }
        .f-link { font-size: 13px; color: var(--accent-blue); font-weight: 500; cursor: pointer; text-decoration: none; }
        .f-link:hover { color: #6da3ff; }
        .btn-p { width: 100%; padding: 14px; border-radius: var(--r-md); border: none; background: var(--accent-blue); color: #fff; font-size: 15px; font-weight: 700; font-family: var(--font-sans); cursor: pointer; transition: all .2s; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .btn-p:hover:not(:disabled) { background: #5d9bff; box-shadow: 0 4px 20px rgba(77,139,255,.3); transform: translateY(-1px); }
        .btn-p:disabled { opacity: .5; cursor: not-allowed; }
        .btn-s { width: 100%; padding: 12px; border-radius: var(--r-md); border: 1px solid var(--border); background: transparent; color: var(--text-secondary); font-size: 14px; font-weight: 600; font-family: var(--font-sans); cursor: pointer; transition: all .15s; }
        .btn-s:hover { border-color: var(--border-active); background: var(--bg-hover); color: var(--text-primary); }
        .sw-row { text-align: center; margin-top: 28px; font-size: 14px; color: var(--text-muted); }
        .sw-link { color: var(--accent-blue); font-weight: 600; cursor: pointer; }
        .sw-link:hover { color: #6da3ff; }
        .auth-foot { position: absolute; bottom: 20px; left: 56px; right: 56px; text-align: center; font-size: 11px; color: var(--text-muted); }
        .wz-bar { display: flex; align-items: center; margin-bottom: 32px; }
        .wz-s { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--text-muted); transition: color .2s; }
        .wz-s.on { color: var(--accent-blue); }
        .wz-s.done { color: var(--accent-green); }
        .wz-n { width: 28px; height: 28px; border-radius: 50%; border: 2px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; font-family: var(--font-mono); transition: all .2s; }
        .wz-s.on .wz-n { border-color: var(--accent-blue); background: var(--accent-blue); color: #fff; }
        .wz-s.done .wz-n { border-color: var(--accent-green); background: var(--accent-green); color: #fff; }
        .wz-line { flex: 1; height: 2px; background: var(--border); margin: 0 12px; }
        .wz-line.done { background: var(--accent-green); }
        .step-c { animation: fadeUp .4s ease; }
        .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .skip { font-size: 13px; color: var(--text-muted); cursor: pointer; text-align: center; margin-top: 12px; }
        .skip:hover { color: var(--text-secondary); }
        .cui-ok { padding: 16px; border-radius: var(--r-md); border: 1px solid var(--accent-green); background: rgba(52,211,153,.04); margin-top: 12px; }
        .cui-ok .cn { font-size: 16px; font-weight: 700; color: var(--accent-green); margin-bottom: 6px; }
        .cui-ok .cr { font-size: 13px; color: var(--text-secondary); margin-bottom: 3px; display: flex; gap: 8px; }
        .cui-ok .cr strong { color: var(--text-primary); font-weight: 600; min-width: 60px; }
        .cui-err { padding: 12px 16px; border-radius: var(--r-md); border: 1px solid var(--accent-red); background: rgba(248,113,113,.04); margin-top: 12px; font-size: 13px; color: var(--accent-red); }
        .cui-load { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-radius: var(--r-md); border: 1px solid var(--border); background: var(--bg-elevated); margin-top: 12px; font-size: 13px; color: var(--text-secondary); }
        @media(max-width:1024px) { .auth-brand { display: none; } .auth-right, .auth-right.wide { width: 100%; min-width: auto; border-left: none; } }
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

        <div className={`auth-right ${view === "signup" ? "wide" : ""}`}>
          <div className="auth-wrap" key={view}>
            {view === "login" ? (
              <LoginForm onGo={() => setView("signup")} />
            ) : (
              <SignupWizard onGo={() => setView("login")} />
            )}
          </div>
          <div className="auth-foot">DosarFonduri &middot; &copy; 2026</div>
        </div>
      </div>
    </>
  );
}

function LoginForm({ onGo }: { onGo: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const go = async () => {
    if (!email || !pw) return;
    setBusy(true);
    setError("");
    try {
      const data = await apiPost("/api/auth/login", { email, password: pw });
      setToken(data.token);
      if (data.hasOrganization) {
        router.push("/dashboard");
      } else {
        router.push("/dashboard"); // Will show pending screen
      }
    } catch (err: any) {
      setError(err.message || "Eroare la autentificare");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2 className="f-title">Bine ai revenit</h2>
      <p className="f-sub">Autentifica-te pentru a continua in DosarFonduri</p>

      {error && <div className="cui-err" style={{ marginBottom: 16, marginTop: 0 }}>{error}</div>}

      <div className="fg">
        <label className="fl">Email</label>
        <input
          className="fi"
          type="email"
          placeholder="consultant@firma.ro"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="fg">
        <label className="fl">Parola</label>
        <div className="fi-wrap">
          <input
            className="fi mono"
            type={show ? "text" : "password"}
            placeholder="••••••••"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go()}
          />
          <button className="pw-toggle" onClick={() => setShow(!show)}>
            {show ? "Ascunde" : "Arata"}
          </button>
        </div>
      </div>
      <div className="f-row">
        <label className="remember">
          <input type="checkbox" defaultChecked /> Tine-ma minte
        </label>
        <span className="f-link">Am uitat parola</span>
      </div>
      <button className="btn-p" disabled={busy || !email || !pw} onClick={go}>
        {busy ? <Spinner light /> : "Autentificare"}
      </button>
      <div className="sw-row">
        Nu ai cont?{" "}
        <span className="sw-link" onClick={onGo}>
          Creare cont
        </span>
      </div>
    </>
  );
}

function SignupWizard({ onGo }: { onGo: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [nume, setNume] = useState("");
  const [prenume, setPrenume] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [wantCo, setWantCo] = useState<boolean | null>(null);
  const [cui, setCui] = useState("");
  const [cabinetCode, setCabinetCode] = useState("");
  const [codeLoad, setCodeLoad] = useState(false);
  const [codeRes, setCodeRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const checkCode = async () => {
    if (!cabinetCode.trim()) return;
    setCodeLoad(true);
    setCodeRes(null);
    try {
      const r = await apiPost("/api/auth/validate-code", { code: cabinetCode });
      setCodeRes(r.valid ? r : "error");
    } catch {
      setCodeRes("error");
    } finally {
      setCodeLoad(false);
    }
  };

  const finalize = async () => {
    setBusy(true);
    setError("");
    try {
      const data = await apiPost("/api/auth/signup", {
        name: `${prenume} ${nume}`,
        email,
        password: pw,
        cabinetCode: cabinetCode || undefined,
        cui: cui || undefined,
      });
      setToken(data.token);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Eroare la inregistrare");
    } finally {
      setBusy(false);
    }
  };

  const ok1 = nume && prenume && email && pw.length >= 6;
  const labels = ["Date personale", "Firma (optional)", "Cod cabinet"];

  return (
    <>
      <h2 className="f-title">Creare cont</h2>
      <p className="f-sub">Configureaza-ti contul in cativa pasi simpli</p>

      {error && <div className="cui-err" style={{ marginBottom: 16, marginTop: 0 }}>{error}</div>}

      <div className="wz-bar">
        {labels.map((l, i) => {
          const s = i + 1;
          const on = step === s;
          const dn = step > s;
          return (
            <div key={s} style={{ display: "contents" }}>
              <div className={`wz-s ${on ? "on" : ""} ${dn ? "done" : ""}`}>
                <div className="wz-n">{dn ? "✓" : s}</div>
                <span>{l}</span>
              </div>
              {s < 3 && <div className={`wz-line ${dn ? "done" : ""}`} />}
            </div>
          );
        })}
      </div>

      {step === 1 && (
        <div className="step-c">
          <div className="row2">
            <div className="fg">
              <label className="fl">Nume</label>
              <input
                className="fi"
                placeholder="Popescu"
                value={nume}
                onChange={(e) => setNume(e.target.value)}
              />
            </div>
            <div className="fg">
              <label className="fl">Prenume</label>
              <input
                className="fi"
                placeholder="Ion"
                value={prenume}
                onChange={(e) => setPrenume(e.target.value)}
              />
            </div>
          </div>
          <div className="fg">
            <label className="fl">Email</label>
            <input
              className="fi"
              type="email"
              placeholder="ion.popescu@firma.ro"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="fg">
            <label className="fl">Parola</label>
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
            {pw && pw.length < 6 && (
              <div className="f-hint err">Minim 6 caractere</div>
            )}
            {pw.length >= 6 && (
              <div className="f-hint ok">Parola valida ✓</div>
            )}
          </div>
          <button className="btn-p" disabled={!ok1} onClick={() => setStep(2)}>
            Continua →
          </button>
          <div className="sw-row">
            Ai deja cont?{" "}
            <span className="sw-link" onClick={onGo}>
              Autentificare
            </span>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="step-c">
          {wantCo === null ? (
            <>
              <p
                style={{
                  fontSize: 15,
                  color: "var(--text-secondary)",
                  marginBottom: 24,
                  lineHeight: 1.6,
                }}
              >
                Doresti sa inregistrezi o{" "}
                <strong style={{ color: "var(--text-primary)" }}>
                  firma de consultanta
                </strong>
                ? Vei putea invita consultanti si gestiona proiecte.
              </p>
              <button className="btn-p" onClick={() => setWantCo(true)}>
                Da, vreau sa inregistrez firma
              </button>
              <div
                className="skip"
                onClick={() => {
                  setWantCo(false);
                  setStep(3);
                }}
              >
                Nu acum, continui fara firma →
              </div>
            </>
          ) : (
            <>
              <div className="fg">
                <label className="fl">CUI Firma</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="fi mono"
                    placeholder="ex: 12345678"
                    value={cui}
                    style={{ flex: 1 }}
                    onChange={(e) => setCui(e.target.value)}
                  />
                </div>
                <div className="f-hint">
                  Introduci CUI-ul firmei tale de consultanta
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
                <button
                  className="btn-s"
                  onClick={() => {
                    setWantCo(null);
                    setCui("");
                  }}
                >
                  ← Inapoi
                </button>
                <button className="btn-p" onClick={() => setStep(3)}>
                  Continua →
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="step-c">
          <p
            style={{
              fontSize: 14,
              color: "var(--text-secondary)",
              marginBottom: 6,
              lineHeight: 1.6,
            }}
          >
            Introdu codul de cabinet primit de la furnizorul DosarFonduri.
          </p>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              marginBottom: 20,
            }}
          >
            Codul activeaza contul tau si stabileste planul, numarul de
            utilizatori si perioada de acces.
          </p>

          <div className="fg">
            <label className="fl">Cod cabinet</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className={`fi mono ${
                  codeRes && codeRes !== "error"
                    ? "ok"
                    : codeRes === "error"
                    ? "err"
                    : ""
                }`}
                placeholder="ex: DF-ABC123-2026"
                value={cabinetCode}
                style={{ flex: 1, textTransform: "uppercase", letterSpacing: 1 }}
                onChange={(e) => {
                  setCabinetCode(e.target.value);
                  setCodeRes(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && checkCode()}
              />
              <button
                className="btn-s"
                style={{ width: "auto", padding: "12px 20px" }}
                onClick={checkCode}
                disabled={codeLoad || !cabinetCode.trim()}
              >
                {codeLoad ? "..." : "Activeaza"}
              </button>
            </div>
          </div>

          {codeLoad && (
            <div className="cui-load">
              <Spinner size={16} /> Se verifica codul...
            </div>
          )}

          {codeRes && codeRes !== "error" && (
            <div className="cui-ok" style={{ borderColor: "var(--accent-blue)" }}>
              <div className="cn" style={{ color: "var(--accent-blue)" }}>
                ✓ Cod valid
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginTop: 10,
                }}
              >
                <div
                  style={{
                    padding: "8px 10px",
                    background: "var(--bg-deep)",
                    borderRadius: "var(--r-sm)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: ".5px",
                      color: "var(--text-muted)",
                      marginBottom: 2,
                    }}
                  >
                    Plan
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: "var(--accent-blue)",
                    }}
                  >
                    {codeRes.plan}
                  </div>
                </div>
                <div
                  style={{
                    padding: "8px 10px",
                    background: "var(--bg-deep)",
                    borderRadius: "var(--r-sm)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: ".5px",
                      color: "var(--text-muted)",
                      marginBottom: 2,
                    }}
                  >
                    Trial
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: "var(--accent-green)",
                    }}
                  >
                    {codeRes.trialDays} zile
                  </div>
                </div>
                <div
                  style={{
                    padding: "8px 10px",
                    background: "var(--bg-deep)",
                    borderRadius: "var(--r-sm)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: ".5px",
                      color: "var(--text-muted)",
                      marginBottom: 2,
                    }}
                  >
                    Utilizatori max
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>
                    {codeRes.maxUsers}
                  </div>
                </div>
              </div>
            </div>
          )}

          {codeRes === "error" && (
            <div className="cui-err">
              Cod invalid sau expirat. Verifica si incearca din nou.
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button
              className="btn-s"
              onClick={() => setStep(wantCo ? 2 : 1)}
            >
              ← Inapoi
            </button>
            <button
              className="btn-p"
              disabled={busy || !codeRes || codeRes === "error"}
              onClick={finalize}
            >
              {busy ? <Spinner light /> : "Activeaza contul"}
            </button>
          </div>
          <div className="sw-row">
            Ai deja cont?{" "}
            <span className="sw-link" onClick={onGo}>
              Autentificare
            </span>
          </div>
        </div>
      )}
    </>
  );
}
