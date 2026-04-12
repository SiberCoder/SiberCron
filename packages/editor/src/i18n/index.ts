import { create } from 'zustand';
import en, { type TranslationKeys } from './locales/en';
import tr from './locales/tr';

// ── Supported languages ────────────────────────────────────────────────────
export type Language = 'en' | 'tr';

const LOCALES: Record<Language, TranslationKeys> = { en, tr };

const LS_KEY = 'sibercron_language';

function getInitialLanguage(): Language {
  const stored = localStorage.getItem(LS_KEY);
  if (stored === 'en' || stored === 'tr') return stored;
  return 'en'; // default
}

// ── Zustand store ──────────────────────────────────────────────────────────
interface I18nState {
  language: Language;
  setLanguage: (lang: Language) => void;
}

export const useI18nStore = create<I18nState>((set) => ({
  language: getInitialLanguage(),
  setLanguage: (lang) => {
    localStorage.setItem(LS_KEY, lang);
    set({ language: lang });
  },
}));

// ── Deep accessor helper ───────────────────────────────────────────────────
// Navigate a nested object with a dot-separated path: "sidebar.aiChat" → locales[lang].sidebar.aiChat
type NestedKeyOf<T, Prefix extends string = ''> = T extends string
  ? Prefix
  : {
      [K in keyof T & string]: NestedKeyOf<
        T[K],
        Prefix extends '' ? K : `${Prefix}.${K}`
      >;
    }[keyof T & string];

export type TranslationKey = NestedKeyOf<TranslationKeys>;

function getNestedValue(obj: unknown, path: string): string {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return path;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : path;
}

// ── Hook ───────────────────────────────────────────────────────────────────
/**
 * Returns the translation function `t(key)` that resolves dot-separated keys
 * against the current language.
 *
 * Usage:
 * ```tsx
 * const { t } = useTranslation();
 * <span>{t('sidebar.aiChat')}</span>
 * ```
 */
export function useTranslation() {
  const language = useI18nStore((s) => s.language);
  const locale = LOCALES[language];

  function t(key: string): string {
    return getNestedValue(locale, key);
  }

  return { t, language };
}

export { en, tr };
