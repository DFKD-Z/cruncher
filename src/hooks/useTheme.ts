import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "cruncher-theme";

function getStoredTheme(): Theme | null {
  if (typeof localStorage === "undefined") return null;
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "dark" || v === "light") return v;
  return null;
}

function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolveTheme(): Theme {
  const stored = getStoredTheme();
  if (stored) return stored;
  return getSystemPrefersDark() ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => resolveTheme());

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const stored = getStoredTheme();
    if (stored) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setThemeState(mq.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return { theme, setTheme, toggleTheme };
}
