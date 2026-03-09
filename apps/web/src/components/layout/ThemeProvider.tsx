"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";

type Theme = "dark" | "light";
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
});

export function ThemeProvider({ children, initialTheme }: { children: React.ReactNode; initialTheme?: Theme }) {
  const [theme, setTheme] = useState<Theme>(initialTheme || "dark");
  const isInitialMount = useRef(true);

  // Hydrate from localStorage on mount (only once)
  useEffect(() => {
    const stored = localStorage.getItem("df-theme") as Theme | null;
    if (stored && (stored === "dark" || stored === "light")) {
      setTheme(stored);
    }
    // Set data-theme immediately to avoid flash
    document.documentElement.setAttribute("data-theme", stored || initialTheme || "dark");
  }, [initialTheme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("df-theme", theme);
    // Only sync to API after initial mount (avoid syncing on page load)
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (getToken()) {
      api("/api/auth/preferences", {
        method: "PATCH",
        body: JSON.stringify({ theme }),
      }).catch(() => {});
    }
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
