"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiPost } from "@/lib/api";
import { setToken } from "@/lib/auth";
import { Spinner } from "@/components/shared/Spinner";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  const invited = searchParams.get("invited");
  const invitedEmail = searchParams.get("email");

  const [view, setView] = useState<"login" | "signup" | "forgot">(invited === "1" ? "signup" : "login");

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
        .auth-right.wide { width: 620px; min-width: 620px; }
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
        .f-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
        .remember { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #64748b; cursor: pointer; }
        .remember input { accent-color: #4d8bff; width: 16px; height: 16px; }
        .f-link { font-size: 13px; color: #4d8bff; font-weight: 500; cursor: pointer; text-decoration: none; }
        .f-link:hover { color: #6da3ff; }
        .btn-p { width: 100%; padding: 14px; border-radius: 8px; border: none; background: #4d8bff; color: #fff; font-size: 15px; font-weight: 700; font-family: 'Inter', system-ui, sans-serif; cursor: pointer; transition: all .2s; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .btn-p:hover:not(:disabled) { background: #5d9bff; box-shadow: 0 4px 20px rgba(77,139,255,.3); transform: translateY(-1px); }
        .btn-p:disabled { opacity: .5; cursor: not-allowed; }
        .btn-s { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; background: transparent; color: #64748b; font-size: 14px; font-weight: 600; font-family: 'Inter', system-ui, sans-serif; cursor: pointer; transition: all .15s; }
        .btn-s:hover { border-color: #cbd5e1; background: #f1f5f9; color: #0f172a; }
        .sw-row { text-align: center; margin-top: 28px; font-size: 14px; color: #94a3b8; }
        .sw-link { color: #4d8bff; font-weight: 600; cursor: pointer; }
        .sw-link:hover { color: #6da3ff; }
        .auth-foot { position: absolute; bottom: 20px; left: 56px; right: 56px; text-align: center; font-size: 11px; color: #94a3b8; }
        .wz-bar { display: flex; align-items: center; margin-bottom: 32px; }
        .wz-s { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #94a3b8; transition: color .2s; }
        .wz-s.on { color: #4d8bff; }
        .wz-s.done { color: #34d399; }
        .wz-n { width: 28px; height: 28px; border-radius: 50%; border: 2px solid #e2e8f0; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; font-family: 'JetBrains Mono', monospace; transition: all .2s; }
        .wz-s.on .wz-n { border-color: #4d8bff; background: #4d8bff; color: #fff; }
        .wz-s.done .wz-n { border-color: #34d399; background: #34d399; color: #fff; }
        .wz-line { flex: 1; height: 2px; background: #e2e8f0; margin: 0 12px; }
        .wz-line.done { background: #34d399; }
        .step-c { animation: fadeUp .4s ease; }
        .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .skip { font-size: 13px; color: #94a3b8; cursor: pointer; text-align: center; margin-top: 12px; }
        .skip:hover { color: #64748b; }
        .cui-ok { padding: 16px; border-radius: 10px; border: 1px solid #34d399; background: rgba(52,211,153,.04); margin-top: 12px; }
        .cui-ok .cn { font-size: 16px; font-weight: 700; color: #34d399; margin-bottom: 6px; }
        .cui-ok .cr { font-size: 13px; color: #64748b; margin-bottom: 3px; display: flex; gap: 8px; }
        .cui-ok .cr strong { color: #0f172a; font-weight: 600; min-width: 60px; }
        .cui-err { padding: 12px 16px; border-radius: 10px; border: 1px solid #f87171; background: rgba(248,113,113,.04); margin-top: 12px; font-size: 13px; color: #f87171; }
        .cui-load { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-radius: 10px; border: 1px solid #e2e8f0; background: #f8fafc; margin-top: 12px; font-size: 13px; color: #64748b; }
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
              <LoginForm onGo={() => setView("signup")} onForgot={() => setView("forgot")} />
            ) : view === "forgot" ? (
              <ForgotPasswordForm onBack={() => setView("login")} />
            ) : (
              <SignupWizard onGo={() => setView("login")} invitedEmail={invitedEmail} />
            )}
          </div>
          <div className="auth-foot">DosarFonduri &middot; &copy; 2026</div>
        </div>
      </div>
    </>
  );
}

function LoginForm({ onGo, onForgot }: { onGo: () => void; onForgot: () => void }) {
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
        <span className="f-link" onClick={onForgot}>Am uitat parola</span>
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

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ emailSent?: boolean } | null>(null);
  const [error, setError] = useState("");

  const go = async () => {
    if (!email) return;
    setBusy(true);
    setError("");
    try {
      const data = await apiPost("/api/auth/forgot-password", { email });
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Eroare la trimitere");
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <>
        <h2 className="f-title">Verifica email-ul</h2>
        <p className="f-sub">Daca exista un cont cu adresa <strong style={{ color: "#0f172a" }}>{email}</strong>, vei primi un email cu instructiuni de resetare.</p>
        <div className="cui-ok" style={{ marginBottom: 20, marginTop: 16 }}>
          <div className="cn">{result.emailSent ? "Email trimis" : "Cerere procesata"}</div>
          <div className="cr">Verifica inbox-ul si folderul Spam.</div>
          <div className="cr">Link-ul expira in 1 ora.</div>
        </div>
        <button className="btn-s" onClick={onBack}>
          Inapoi la autentificare
        </button>
      </>
    );
  }

  return (
    <>
      <h2 className="f-title">Resetare parola</h2>
      <p className="f-sub">Introdu adresa de email asociata contului tau</p>

      {error && <div className="cui-err" style={{ marginBottom: 16, marginTop: 0 }}>{error}</div>}

      <div className="fg">
        <label className="fl">Email</label>
        <input
          className="fi"
          type="email"
          placeholder="consultant@firma.ro"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
        />
      </div>
      <button className="btn-p" disabled={busy || !email.includes("@")} onClick={go} style={{ marginBottom: 12 }}>
        {busy ? <Spinner light /> : "Trimite link de resetare"}
      </button>
      <button className="btn-s" onClick={onBack}>
        Inapoi la autentificare
      </button>
    </>
  );
}

function SignupWizard({ onGo, invitedEmail }: { onGo: () => void; invitedEmail?: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [nume, setNume] = useState("");
  const [prenume, setPrenume] = useState("");
  const [email, setEmail] = useState(invitedEmail || "");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [wantCo, setWantCo] = useState<boolean | null>(null);
  const [cui, setCui] = useState("");
  const [cuiLoad, setCuiLoad] = useState(false);
  const [cuiRes, setCuiRes] = useState<any>(null);
  const [cabinetCode, setCabinetCode] = useState("");
  const [codeLoad, setCodeLoad] = useState(false);
  const [codeRes, setCodeRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [isInvited, setIsInvited] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<any>(null);

  // Auto-check invited status when email comes pre-filled from invitation link
  useEffect(() => {
    if (invitedEmail) checkInvited();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Check if email belongs to an invited user
  const checkInvited = async () => {
    if (!email.includes("@")) return;
    try {
      const r = await apiPost("/api/auth/check-invited", { email });
      if (r.invited) {
        setIsInvited(true);
        setInviteInfo(r);
      } else {
        setIsInvited(false);
        setInviteInfo(null);
      }
    } catch {
      // endpoint unavailable — continue normal flow
    }
  };

  // Validate CUI via listafirme.ro
  const checkCui = async () => {
    const cleanCui = cui.replace(/\D/g, "");
    if (cleanCui.length < 6) return;
    setCuiLoad(true);
    setCuiRes(null);
    try {
      const r = await apiPost("/api/auth/lookup-cui", { cui: cleanCui });
      setCuiRes(r.found ? r.company : "error");
    } catch {
      setCuiRes("error");
    } finally {
      setCuiLoad(false);
    }
  };

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
        name: `${nume} ${prenume}`,
        email,
        password: pw,
        cabinetCode: cabinetCode || undefined,
        cui: cui || undefined,
        companyName: cuiRes && cuiRes !== "error" ? cuiRes.name : undefined,
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
  const labels = isInvited
    ? ["Date personale", "Activare cont"]
    : ["Date personale", "Firma (optional)", "Cod cabinet"];
  const totalSteps = labels.length;

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
              {s < totalSteps && <div className={`wz-line ${dn ? "done" : ""}`} />}
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
              onChange={(e) => { if (!invitedEmail) setEmail(e.target.value); }}
              onBlur={checkInvited}
              readOnly={!!invitedEmail}
              style={invitedEmail ? { opacity: 0.7, cursor: "not-allowed" } : undefined}
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

          {isInvited && inviteInfo && (
            <div className="cui-ok" style={{ marginBottom: 16 }}>
              <div className="cn">Cont pre-inregistrat</div>
              <div className="cr">
                <strong>Organizatie:</strong> {inviteInfo.organizationName}
              </div>
              <div className="cr">
                <strong>Rol:</strong> {inviteInfo.role}
              </div>
              <div className="text-xs mt-1.5 text-slate-500">
                Contul tau a fost creat de un administrator. Seteaza-ti parola si activeaza-l.
              </div>
            </div>
          )}

          <button
            className="btn-p"
            disabled={!ok1}
            onClick={() => {
              if (isInvited) {
                setStep(2); // Goes to "Activare cont" (finalize directly)
              } else {
                setStep(2); // Goes to "Firma (optional)"
              }
            }}
          >
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

      {/* Step 2 for INVITED users — direct activation */}
      {step === 2 && isInvited && (
        <div className="step-c">
          <div className="cui-ok" style={{ marginBottom: 20 }}>
            <div className="cn">Activare cont</div>
            <div className="cr">
              <strong>Organizatie:</strong> {inviteInfo?.organizationName}
            </div>
            <div className="cr">
              <strong>Rol:</strong> {inviteInfo?.role}
            </div>
            <div className="cr">
              <strong>Email:</strong> {email}
            </div>
          </div>
          <p className="text-sm text-slate-500 mb-5 leading-relaxed">
            Contul tau va fi activat si vei fi adaugat in organizatia{" "}
            <strong className="text-slate-900">{inviteInfo?.organizationName}</strong>.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn-s" onClick={() => setStep(1)}>
              ← Inapoi
            </button>
            <button className="btn-p" disabled={busy} onClick={finalize}>
              {busy ? <Spinner light /> : "Activeaza contul"}
            </button>
          </div>
        </div>
      )}

      {/* Step 2 for NEW users — firma (optional) with CUI validation */}
      {step === 2 && !isInvited && (
        <div className="step-c">
          {wantCo === null ? (
            <>
              <p className="text-[15px] text-slate-500 mb-6 leading-relaxed">
                Doresti sa inregistrezi o{" "}
                <strong className="text-slate-900">
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
                    className={`fi mono ${
                      cuiRes && cuiRes !== "error"
                        ? "ok"
                        : cuiRes === "error"
                        ? "err"
                        : ""
                    }`}
                    placeholder="ex: 19893984"
                    value={cui}
                    style={{ flex: 1 }}
                    onChange={(e) => {
                      setCui(e.target.value);
                      setCuiRes(null);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && checkCui()}
                  />
                  <button
                    className="btn-s"
                    style={{ width: "auto", padding: "12px 20px" }}
                    onClick={checkCui}
                    disabled={cuiLoad || cui.replace(/\D/g, "").length < 6}
                  >
                    {cuiLoad ? "..." : "Verifica"}
                  </button>
                </div>
                <div className="f-hint">
                  Introduci CUI-ul firmei tale de consultanta — il verificam automat
                </div>
              </div>

              {cuiLoad && (
                <div className="cui-load">
                  <Spinner size={16} /> Se verifica CUI-ul in baza de date...
                </div>
              )}

              {cuiRes && cuiRes !== "error" && (
                <div className="cui-ok">
                  <div className="cn">{cuiRes.name}</div>
                  <div className="cr">
                    <strong>CUI:</strong> {cuiRes.cui}
                  </div>
                  {cuiRes.regNo && (
                    <div className="cr">
                      <strong>Reg. Com.:</strong> {cuiRes.regNo}
                    </div>
                  )}
                  <div className="cr">
                    <strong>Judet:</strong> {cuiRes.county}{cuiRes.city ? `, ${cuiRes.city}` : ""}
                  </div>
                  {cuiRes.address && (
                    <div className="cr">
                      <strong>Adresa:</strong> {cuiRes.address}
                    </div>
                  )}
                  {cuiRes.nace && (
                    <div className="cr">
                      <strong>CAEN:</strong> {cuiRes.nace}{cuiRes.naceDescription ? ` — ${cuiRes.naceDescription}` : ""}
                    </div>
                  )}
                  <div className="cr">
                    <strong>Stare:</strong>{" "}
                    <span className={
                      cuiRes.status?.toLowerCase().includes("activ")
                        ? "text-emerald-500 font-semibold"
                        : "text-red-500 font-semibold"
                    }>
                      {cuiRes.status}
                    </span>
                  </div>
                  {cuiRes.foundedDate && (
                    <div className="cr">
                      <strong>Infiintata:</strong> {cuiRes.foundedDate}
                    </div>
                  )}
                </div>
              )}

              {cuiRes === "error" && (
                <div className="cui-err">
                  CUI-ul nu a fost gasit. Verifica si incearca din nou sau continua manual.
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
                <button
                  className="btn-s"
                  onClick={() => {
                    setWantCo(null);
                    setCui("");
                    setCuiRes(null);
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
          <p className="text-sm text-slate-500 mb-1.5 leading-relaxed">
            Introdu codul de cabinet primit de la furnizorul DosarFonduri.
          </p>
          <p className="text-xs text-slate-400 mb-5">
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
                {codeLoad ? "..." : "Verifica"}
              </button>
            </div>
          </div>

          {codeLoad && (
            <div className="cui-load">
              <Spinner size={16} /> Se verifica codul...
            </div>
          )}

          {codeRes && codeRes !== "error" && (
            <div className="cui-ok border-blue-500">
              <div className="cn text-blue-600">
                ✓ Cod valid
              </div>
              <div
                className="grid grid-cols-2 gap-2 mt-2.5"
              >
                <div className="p-2 bg-slate-50 rounded-md border border-slate-200">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
                    Plan
                  </div>
                  <div className="text-sm font-bold text-blue-600">
                    {codeRes.plan}
                  </div>
                </div>
                <div className="p-2 bg-slate-50 rounded-md border border-slate-200">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
                    Trial
                  </div>
                  <div className="text-sm font-bold text-emerald-500">
                    {codeRes.trialDays} zile
                  </div>
                </div>
                <div className="p-2 bg-slate-50 rounded-md border border-slate-200">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
                    Utilizatori max
                  </div>
                  <div className="text-sm font-bold">
                    {codeRes.maxUsers}
                  </div>
                </div>
              </div>
              {codeRes.companyName && (
                <div className="mt-2.5 text-[13px] text-slate-500">
                  Destinat: <strong className="text-slate-900">{codeRes.companyName}</strong>
                  {codeRes.cui && <span className="font-mono text-xs ml-1.5 text-slate-400">CUI {codeRes.cui}</span>}
                </div>
              )}
              {codeRes.cui && cui && cui.replace(/\D/g, "") !== codeRes.cui && (
                <div className="cui-err" style={{ marginTop: 8 }}>
                  CUI-ul introdus la pasul 2 ({cui}) nu se potriveste cu firma destinatara a codului (CUI {codeRes.cui}).
                  Intoarce-te la pasul 2 si corecteaza.
                </div>
              )}
            </div>
          )}

          {codeRes === "error" && (
            <div className="cui-err">
              Cod invalid, dezactivat sau deja folosit. Verifica si incearca din nou.
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
