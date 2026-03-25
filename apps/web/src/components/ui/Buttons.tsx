import { ReactNode, ButtonHTMLAttributes } from "react";

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  icon?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

const SIZE_MAP = {
  sm: "text-[12px] h-[34px] px-5 gap-1.5 rounded-[10px]",
  md: "text-[13px] h-[40px] px-6 gap-2 rounded-[10px]",
  lg: "text-[14px] h-[44px] px-8 gap-2.5 rounded-xl",
  xl: "text-[15px] h-[48px] px-9 gap-2.5 rounded-xl",
};

export function BtnPrimary({ children, icon, size = "md", className = "", style, ...props }: BtnProps) {
  const sz = SIZE_MAP[size];
  return (
    <button
      {...props}
      className={`text-white font-semibold tracking-[0.01em] inline-flex items-center justify-center whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${sz} ${className}`}
      style={{
        background: "linear-gradient(135deg, #4d8bff 0%, #2563eb 100%)",
        border: "none",
        boxShadow: "0 2px 8px rgba(37,99,235,.25), 0 1px 2px rgba(37,99,235,.1)",
        transition: "all .2s cubic-bezier(.4,0,.2,1)",
        fontFamily: "'Inter', system-ui, sans-serif",
        cursor: props.disabled ? "not-allowed" : "pointer",
        ...style,
      }}
      onMouseEnter={e => {
        if (!props.disabled) {
          e.currentTarget.style.background = "linear-gradient(135deg, #3b7aed 0%, #1d4ed8 100%)";
          e.currentTarget.style.boxShadow = "0 4px 16px rgba(37,99,235,.35), 0 1px 3px rgba(37,99,235,.15)";
          e.currentTarget.style.transform = "translateY(-1px)";
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = "linear-gradient(135deg, #4d8bff 0%, #2563eb 100%)";
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(37,99,235,.25), 0 1px 2px rgba(37,99,235,.1)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {icon && <span className="shrink-0 [&>svg]:w-[15px] [&>svg]:h-[15px]">{icon}</span>}
      {children}
    </button>
  );
}

export function BtnSecondary({ children, icon, size = "md", className = "", ...props }: BtnProps) {
  const sz = SIZE_MAP[size];
  return (
    <button
      {...props}
      className={`bg-transparent border border-slate-200/60 hover:border-slate-300 hover:bg-slate-50 text-slate-500 font-medium transition-all inline-flex items-center justify-center whitespace-nowrap min-w-[100px] disabled:opacity-50 disabled:cursor-not-allowed ${sz} ${className}`}
    >
      {icon && <span className="shrink-0 [&>svg]:w-[15px] [&>svg]:h-[15px] text-slate-400">{icon}</span>}
      {children}
    </button>
  );
}

export function BtnOutline({ children, icon, size = "md", className = "", ...props }: BtnProps) {
  const sz = SIZE_MAP[size];
  return (
    <button
      {...props}
      className={`bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 text-blue-600 font-semibold tracking-[0.01em] transition-all inline-flex items-center justify-center whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${sz} ${className}`}
    >
      {icon && <span className="shrink-0 [&>svg]:w-[15px] [&>svg]:h-[15px]">{icon}</span>}
      {children}
    </button>
  );
}

export function BtnDanger({ children, icon, size = "md", className = "", ...props }: BtnProps) {
  const sz = SIZE_MAP[size];
  return (
    <button
      {...props}
      className={`text-red-500 bg-white border border-red-200 hover:bg-red-50 hover:border-red-300 font-semibold transition-all inline-flex items-center justify-center whitespace-nowrap min-w-[100px] disabled:opacity-50 disabled:cursor-not-allowed ${sz} ${className}`}
    >
      {icon && <span className="shrink-0 [&>svg]:w-[15px] [&>svg]:h-[15px]">{icon}</span>}
      {children}
    </button>
  );
}

// --- SVG Icon helpers ---

export const IconPlus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
);

export const IconRefresh = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /></svg>
);

export const IconUpload = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
);

export const IconTrash = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
);

export const IconSearch = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
);

export const IconEdit = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
);

export const IconSave = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
);

export const IconSend = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
);

export const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
);

export const IconArrowLeft = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
);

export const IconArrowRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
);

export const IconX = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
);

export const IconUserPlus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></svg>
);

export const IconSettings = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
);

export const IconDownload = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
);

export const IconZap = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
);

export const IconBan = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>
);
