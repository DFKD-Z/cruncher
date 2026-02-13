import { useMemo } from "react";
import zh from "../locales/zh.json";
import en from "../locales/en.json";

type Locale = "zh" | "en";
const bundles: Record<Locale, Record<string, string>> = { zh, en };

function getLocale(): Locale {
  if (typeof navigator !== "undefined" && navigator.language.startsWith("zh")) {
    return "zh";
  }
  return "en";
}

export function useI18n() {
  return useMemo(() => {
    const locale = getLocale();
    const t = (key: string, vars?: Record<string, string | number>): string => {
      const bundle = bundles[locale];
      let s = bundle[key] ?? bundles.en[key] ?? key;
      if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
          s = s.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), String(v));
        });
      }
      return s;
    };
    return { t, locale };
  }, []);
}
