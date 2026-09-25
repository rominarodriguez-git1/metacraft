import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/modules/auth/session";

export default async function Home() {
  const session = await getSession();
  const t = await getTranslations("home");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p>{t("description")}</p>
      <div className="flex flex-wrap justify-center gap-4">
        {session ? (
          <>
            <Link href="/search">{t("searchAction")}</Link>
            <Link href="/requests">{t("requestsAction")}</Link>
          </>
        ) : (
          <Link href="/sign-in">{t("signInAction")}</Link>
        )}
      </div>
    </main>
  );
}
