import type { AuthUser, Organization } from "@dosarfonduri/shared";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("df-token");
}

export function setToken(token: string): void {
  localStorage.setItem("df-token", token);
}

export function removeToken(): void {
  localStorage.removeItem("df-token");
}

export function getStoredTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  return (localStorage.getItem("df-theme") as "dark" | "light") || "dark";
}
