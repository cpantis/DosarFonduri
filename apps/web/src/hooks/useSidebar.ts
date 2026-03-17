"use client";
import { createContext, useContext, useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "dosarfonduri-sidebar-collapsed";

export interface SidebarState {
  isCollapsed: boolean;
  toggle: () => void;
  collapse: () => void;
  expand: () => void;
}

const SidebarContext = createContext<SidebarState>({
  isCollapsed: false,
  toggle: () => {},
  collapse: () => {},
  expand: () => {},
});

export function useSidebarState(): SidebarState {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) return stored === "true";
    } catch {}
    // Default: collapsed on screens < 1024px
    return window.innerWidth < 1024;
  });

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(isCollapsed));
    } catch {}
  }, [isCollapsed]);

  // Auto-collapse on resize below 1024px
  useEffect(() => {
    function handleResize() {
      if (window.innerWidth < 1024) {
        setIsCollapsed(true);
      }
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const toggle = useCallback(() => setIsCollapsed(v => !v), []);
  const collapse = useCallback(() => setIsCollapsed(true), []);
  const expand = useCallback(() => setIsCollapsed(false), []);

  return { isCollapsed, toggle, collapse, expand };
}

export { SidebarContext };

export function useSidebar(): SidebarState {
  return useContext(SidebarContext);
}
