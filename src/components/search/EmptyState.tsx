import { useTranslations } from "next-intl";

export function EmptyState() {
  const t = useTranslations("search.empty");

  return (
    <div role="status" className="flex flex-col items-center gap-2 p-8 text-center">
      <p className="text-lg font-medium">{t("title")}</p>
      <p>{t("description")}</p>
    </div>
  );
}
