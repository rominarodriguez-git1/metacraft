import { getTranslations } from "next-intl/server";
import { requireSession } from "@/modules/auth/session";
import { searchProviders } from "@/modules/catalog/search";
import { parseSearchParams, toSearchCriteria, type SearchParamsInput } from "@/modules/catalog/search-schema";
import { QuoteForm, type QuoteFormProvider } from "@/components/requests/QuoteForm";

interface NewRequestPageProps {
  searchParams: Promise<SearchParamsInput>;
}

interface ProviderRef {
  sourceId: string;
  providerId: string;
}

function parseProviderRefs(input: SearchParamsInput): ProviderRef[] {
  const raw = input.provider;
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return values.flatMap((value) => {
    const [sourceId, providerId] = value.split(":");
    return sourceId && providerId ? [{ sourceId, providerId }] : [];
  });
}

export default async function NewRequestPage({ searchParams }: NewRequestPageProps) {
  await requireSession();
  const params = await searchParams;
  const t = await getTranslations("requests.form");

  const parsed = parseSearchParams(params);
  const refs = parseProviderRefs(params);

  if (!parsed.success || refs.length === 0) {
    return (
      <main className="flex min-h-screen flex-col gap-4 p-4 sm:p-8">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p role="alert">{t("genericError")}</p>
      </main>
    );
  }

  const { values } = parsed;
  const criteria = toSearchCriteria(values);
  const outcome = await searchProviders(criteria);

  const providers: QuoteFormProvider[] = refs.flatMap((ref) => {
    const match = outcome.providers.find(
      (provider) => provider.sourceId === ref.sourceId && provider.id === ref.providerId,
    );
    return match ? [{ providerId: match.id, sourceId: match.sourceId, name: match.name }] : [];
  });

  return (
    <main className="flex min-h-screen flex-col gap-6 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <QuoteForm
        providers={providers}
        prefill={{
          trade: values.trade,
          department: values.department,
          zone: values.zone,
          budgetMinUyu: values.budgetMinUyu,
          budgetMaxUyu: values.budgetMaxUyu,
          timeline: values.timeline,
        }}
      />
    </main>
  );
}
