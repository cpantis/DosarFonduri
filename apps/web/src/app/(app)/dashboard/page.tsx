"use client";
import { useAuth } from "@/hooks/useAuth";

const STATS = [
  { label: "Proiecte active", value: "0", icon: "📁" },
  { label: "Firme gestionate", value: "0", icon: "🏢" },
  { label: "Documente generate", value: "0", icon: "📄" },
  { label: "Rata de aprobare", value: "—", icon: "🏆" },
];

export default function DashboardPage() {
  const { user, organization } = useAuth();

  return (
    <>
      {/* Topbar */}
      <div
        className="px-7 py-3.5 flex items-center gap-4 flex-shrink-0"
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-surface)",
        }}
      >
        <div
          className="text-xl font-extrabold flex-1"
          style={{ letterSpacing: "-.3px" }}
        >
          Panou
        </div>
        {organization && (
          <div
            className="flex items-center gap-2 px-3.5 py-1.5 text-[13px] cursor-pointer transition-colors"
            style={{
              borderRadius: "var(--r-md)",
              border: "1px solid var(--border)",
              background: "var(--bg-elevated)",
              color: "var(--text-secondary)",
            }}
          >
            <span>🏢</span>
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
              {organization.name}
            </span>
          </div>
        )}
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer relative text-[15px] transition-colors"
          style={{
            border: "1px solid var(--border)",
          }}
        >
          🔔
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-7">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-7">
          {STATS.map((s, i) => (
            <div
              key={i}
              className="p-5 transition-all"
              style={{
                borderRadius: "var(--r-md)",
                border: "1px solid var(--border)",
                background: "var(--bg-surface)",
              }}
            >
              <div className="flex items-center justify-between mb-2.5">
                <div
                  className="w-9 h-9 flex items-center justify-center text-[17px]"
                  style={{
                    borderRadius: "var(--r-sm)",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {s.icon}
                </div>
              </div>
              <div
                className="text-[32px] font-extrabold leading-none"
                style={{ fontFamily: "var(--font-mono)", letterSpacing: "-1px" }}
              >
                {s.value}
              </div>
              <div
                className="text-[13px] mt-1"
                style={{ color: "var(--text-secondary)" }}
              >
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Empty state */}
        <div className="grid gap-6" style={{ gridTemplateColumns: "1fr 360px" }}>
          <div>
            <div className="flex items-center justify-between mb-3.5">
              <div className="text-base font-bold flex items-center gap-2">
                📁 Proiecte recente
              </div>
            </div>
            <div
              className="flex flex-col items-center justify-center py-16 text-center"
              style={{
                borderRadius: "var(--r-md)",
                border: "1px solid var(--border)",
                background: "var(--bg-surface)",
              }}
            >
              <div className="text-4xl mb-4">📭</div>
              <h3
                className="text-lg font-bold mb-2"
                style={{ color: "var(--text-primary)" }}
              >
                Niciun proiect inca
              </h3>
              <p
                className="text-sm max-w-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                Creeaza primul tau proiect adaugand o firma si selectand un program de finantare.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            {/* Quick Actions */}
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--r-md)",
                background: "var(--bg-surface)",
                overflow: "hidden",
              }}
            >
              <div
                className="px-4 py-3.5 text-sm font-bold flex items-center gap-2"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                ⚡ Actiuni rapide
              </div>
              <div className="grid grid-cols-2 gap-2 p-3">
                {[
                  { icon: "➕", label: "Proiect nou" },
                  { icon: "🏢", label: "Firma noua" },
                  { icon: "📤", label: "Upload doc" },
                  { icon: "🤖", label: "Chat Solomon" },
                ].map((a) => (
                  <div
                    key={a.label}
                    className="p-3 text-center cursor-pointer transition-all"
                    style={{
                      borderRadius: "var(--r-sm)",
                      border: "1px solid var(--border)",
                      background: "var(--bg-elevated)",
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    <div className="text-xl mb-1">{a.icon}</div>
                    <div
                      className="text-xs font-semibold"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {a.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Deadlines */}
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--r-md)",
                background: "var(--bg-surface)",
                overflow: "hidden",
              }}
            >
              <div
                className="px-4 py-3.5 text-sm font-bold flex items-center gap-2"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                🗓 Termene apropiate
              </div>
              <div
                className="p-6 text-center text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                Niciun termen configurat
              </div>
            </div>

            {/* Activity */}
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--r-md)",
                background: "var(--bg-surface)",
                overflow: "hidden",
              }}
            >
              <div
                className="px-4 py-3.5 text-sm font-bold flex items-center gap-2"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                📡 Activitate recenta
              </div>
              <div
                className="p-6 text-center text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                Nicio activitate recenta
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
