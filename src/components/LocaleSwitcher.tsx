"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { locales, type Locale } from "@/i18n/config";
import { setLocale } from "@/i18n/set-locale";

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("localeSwitcher");
  const [isPending, startTransition] = useTransition();

  function handleChange(next: Locale) {
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <div role="group" aria-label={t("label")}>
      {locales.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => handleChange(option)}
          disabled={isPending || option === locale}
          aria-pressed={option === locale}
        >
          {t(option)}
        </button>
      ))}
    </div>
  );
}
