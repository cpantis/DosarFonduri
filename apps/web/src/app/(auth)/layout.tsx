"use client";
import { ThemeProvider } from "@/components/layout/ThemeProvider";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
