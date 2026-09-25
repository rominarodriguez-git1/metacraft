import { getTranslations } from "next-intl/server";
import { requireSession } from "@/modules/auth/session";
import { classifySearchOutcome, searchProviders } from "@/modules/catalog/search";
import {
  hasAnySearchParam,
  parseSearchParams,
  toSearchCriteria,
  type SearchFormValues,
  type SearchParamsInput,
} from "@/modules/catalog/search-schema";
import { EmptyState } from "@/components/search/EmptyState";
import { ProviderResultsList } from "@/components/search/ProviderCard";
import { SearchFilters } from "@/components/search/SearchFilters";

interface SearchPageProps {
  searchParams: Promise<SearchParamsInput>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  await requireSession();
  const params = await searchParams;
  const t = await getTranslations("search");

  const submitted = hasAnySearchParam(params);
  const parsed = submitted ? parseSearchParams(params) : null;

  return (
    <main className="flex min-h-screen flex-col gap-6 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <SearchFilters
        initialValues={parsed?.success ? parsed.values : undefined}
        fieldErrors={parsed && !parsed.success ? parsed.fieldErrors : undefined}
      />
      {parsed?.success ? <SearchResults values={parsed.values} /> : null}
    </main>
  );
}

async function SearchResults({ values }: { values: SearchFormValues }) {
  const t = await getTranslations("search.notice");
  const criteria = toSearchCriteria(values);
  const outcome = await searchProviders(criteria);
  const view = classifySearchOutcome(outcome);

  return (
    <div className="flex flex-col gap-4">
      {outcome.unavailableSourceCount > 0 && view.kind !== "all-unavailable" ? (
        <p role="status">{t("partialFailure", { count: outcome.unavailableSourceCount })}</p>
      ) : null}
      {view.kind === "all-unavailable" ? (
        <p role="status">{t("totalFailure", { count: view.unavailableSourceCount })}</p>
      ) : view.kind === "empty" ? (
        <EmptyState />
      ) : (
        <ProviderResultsList providers={view.providers} filters={values} />
      )}
    </div>
  );
}
