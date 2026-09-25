import { logger } from "@/lib/logger";
import { listAdapters } from "@/modules/providers/registry";
import type { Provider } from "@/modules/providers/types";
import type { SearchCriteria } from "@/modules/providers/types";
import type { SearchFormValues } from "@/modules/catalog/search-schema";

export interface SearchOutcome {
  providers: Provider[];
  totalSources: number;
  unavailableSourceCount: number;
}

export const MIN_SELECTED_PROVIDERS = 2;
export const MAX_SELECTED_PROVIDERS = 5;

export interface SelectedProviderRef {
  providerId: string;
  sourceId: string;
}

export type SearchResultView =
  | { kind: "all-unavailable"; unavailableSourceCount: number }
  | { kind: "empty" }
  | { kind: "results"; providers: Provider[] };

/**
 * Calls every registered adapter through the ProviderAdapter port (never a
 * concrete adapter import). One adapter rejecting must not fail the whole
 * search: its results are omitted and the failure is logged (the logger
 * redacts PII), and the caller is told how many sources were unavailable.
 */
export async function searchProviders(criteria: SearchCriteria): Promise<SearchOutcome> {
  const adapters = listAdapters();
  const settled = await Promise.allSettled(adapters.map((adapter) => adapter.search(criteria)));

  const providers: Provider[] = [];
  let unavailableSourceCount = 0;

  settled.forEach((outcome, index) => {
    const adapter = adapters[index]!;
    if (outcome.status === "fulfilled") {
      providers.push(...outcome.value);
      return;
    }
    unavailableSourceCount += 1;
    logger.error("provider search failed for source", {
      sourceId: adapter.sourceId,
      error: outcome.reason,
    });
  });

  return { providers, totalSources: adapters.length, unavailableSourceCount };
}

/**
 * Distinguishes "every source failed" from "every source answered but
 * nothing matched", since the two must render differently: a translated
 * unavailability notice, never the zero-results empty state.
 */
export function classifySearchOutcome(outcome: SearchOutcome): SearchResultView {
  if (outcome.totalSources > 0 && outcome.unavailableSourceCount === outcome.totalSources) {
    return { kind: "all-unavailable", unavailableSourceCount: outcome.unavailableSourceCount };
  }
  if (outcome.providers.length === 0) {
    return { kind: "empty" };
  }
  return { kind: "results", providers: outcome.providers };
}

export function canRequestQuotes(selected: readonly SelectedProviderRef[]): boolean {
  return selected.length >= MIN_SELECTED_PROVIDERS && selected.length <= MAX_SELECTED_PROVIDERS;
}

/**
 * Provider ids are only unique per source, so each selection rides as
 * "sourceId:providerId" to keep the pairing unambiguous in the query string.
 */
export function buildRequestQuotesHref(
  selected: readonly SelectedProviderRef[],
  filters: SearchFormValues,
): string {
  const params = new URLSearchParams();
  for (const ref of selected) {
    params.append("provider", `${ref.sourceId}:${ref.providerId}`);
  }
  params.set("trade", filters.trade);
  params.set("department", filters.department);
  params.set("zone", filters.zone);
  params.set("budgetMinUyu", String(filters.budgetMinUyu));
  params.set("budgetMaxUyu", String(filters.budgetMaxUyu));
  params.set("timeline", filters.timeline);
  return `/requests/new?${params.toString()}`;
}
