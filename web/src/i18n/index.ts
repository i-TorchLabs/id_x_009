import type { Locale, MessageTree, TranslateFn } from "@/i18n/types";
import zh from "@/i18n/locales/zh";
import en from "@/i18n/locales/en";

export type { Locale, TranslateFn };

export const LOCALES: Locale[] = ["zh", "en"];
export const DEFAULT_LOCALE: Locale = "zh";
export const LOCALE_STORAGE_KEY = "id009_locale";

const dictionaries: Record<Locale, MessageTree> = { zh, en };

function lookup(tree: MessageTree, key: string): string | undefined {
  const parts = key.split(".");
  let node: string | MessageTree | undefined = tree;
  for (const part of parts) {
    if (node == null || typeof node === "string") return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

export function createTranslator(locale: Locale): TranslateFn {
  const dict = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
  const fallback = dictionaries[DEFAULT_LOCALE];
  return (key, params) => {
    let text = lookup(dict, key) ?? lookup(fallback, key) ?? key;
    if (params) {
      for (const [name, value] of Object.entries(params)) {
        text = text.replaceAll(`{${name}}`, String(value));
      }
    }
    return text;
  };
}

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "zh" || value === "en";
}
