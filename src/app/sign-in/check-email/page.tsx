import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function CheckEmailPage() {
  const t = await getTranslations("checkEmail");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p>{t("description")}</p>
      <p>{t("notReceived")}</p>
      <Link href="/sign-in">{t("differentEmail")}</Link>
    </main>
  );
}
