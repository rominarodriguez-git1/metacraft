import type { Locale } from "@/i18n/config";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";

const MESSAGES: Record<Locale, typeof es.magicLinkEmail> = {
  es: es.magicLinkEmail,
  en: en.magicLinkEmail,
};

export interface RenderedEmail {
  subject: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The sign-in email in the reader's language. Rendered outside a React
 * request, so it reads the message files directly instead of next-intl.
 */
export function renderMagicLinkEmail(url: string, locale: Locale): RenderedEmail {
  const t = MESSAGES[locale];
  const href = escapeHtml(url);

  return {
    subject: t.subject,
    html:
      `<!doctype html><html lang="${locale}"><body>` +
      `<p>${escapeHtml(t.intro)}</p>` +
      `<p><a href="${href}">${href}</a></p>` +
      `<p>${escapeHtml(t.expiry)}</p>` +
      `</body></html>`,
  };
}
