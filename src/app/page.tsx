import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";

export default async function Home() {
  const t = await getTranslations("home");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p>{t("description")}</p>
      <LocaleSwitcher />
    </main>
  );
}
