import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/modules/auth/session";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { SignOutButton } from "@/components/SignOutButton";

/**
 * Rendered by the root layout on every page, so each screen can reach the
 * rest of the app. Signed-in entries appear only when a session exists.
 */
export async function SiteHeader() {
  const session = await getSession();
  const t = await getTranslations("nav");

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-8">
      <Link href="/" className="font-semibold">
        {t("home")}
      </Link>
      <nav aria-label={t("label")} className="flex flex-wrap items-center gap-3">
        {session ? (
          <>
            <Link href="/search">{t("search")}</Link>
            <Link href="/requests">{t("requests")}</Link>
            <SignOutButton />
          </>
        ) : null}
        <LocaleSwitcher />
      </nav>
    </header>
  );
}
