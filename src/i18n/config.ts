export const locales = ["es", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "es";

export const localeCookieName = "NEXT_LOCALE";

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/** A missing or unsupported value falls back to the default locale. */
export function resolveLocale(cookieValue: string | undefined): Locale {
  if (cookieValue && isLocale(cookieValue)) {
    return cookieValue;
  }
  return defaultLocale;
}
