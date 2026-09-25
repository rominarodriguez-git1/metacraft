"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  buildRequestQuotesHref,
  canRequestQuotes,
  type SelectedProviderRef,
} from "@/modules/catalog/search";
import type { SearchFormValues } from "@/modules/catalog/search-schema";
import type { Provider } from "@/modules/providers/types";

function sameProvider(a: Provider, b: Provider): boolean {
  return a.sourceId === b.sourceId && a.id === b.id;
}

interface ProviderCardProps {
  provider: Provider;
  selected: boolean;
  onToggle: (provider: Provider) => void;
}

export function ProviderCard({ provider, selected, onToggle }: ProviderCardProps) {
  const t = useTranslations("search.card");
  const tTrades = useTranslations("search.trades");

  return (
    <li className="flex flex-col gap-2 rounded border p-4" data-source-id={provider.sourceId}>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={selected} onChange={() => onToggle(provider)} />
        <span className="font-semibold">{provider.name}</span>
      </label>
      <p>{provider.trades.map((trade) => tTrades(trade)).join(", ")}</p>
      <p>{provider.zones.join(", ")}</p>
      <p>{t("rating", { avg: provider.ratingAvg, count: provider.reviewCount })}</p>
      <div className="flex gap-2 text-sm">
        {provider.isNew ? <span>{t("newBadge")}</span> : null}
        {provider.verified ? <span>{t("verifiedBadge")}</span> : null}
      </div>
      <p className="text-sm text-gray-500">{t("source", { sourceId: provider.sourceId })}</p>
    </li>
  );
}

interface ProviderResultsListProps {
  providers: Provider[];
  filters: SearchFormValues;
}

export function ProviderResultsList({ providers, filters }: ProviderResultsListProps) {
  const t = useTranslations("search.requestQuotes");
  const [selected, setSelected] = useState<Provider[]>([]);

  function toggle(provider: Provider): void {
    setSelected((current) =>
      current.some((item) => sameProvider(item, provider))
        ? current.filter((item) => !sameProvider(item, provider))
        : [...current, provider],
    );
  }

  const selectedRefs: SelectedProviderRef[] = selected.map((provider) => ({
    providerId: provider.id,
    sourceId: provider.sourceId,
  }));
  const enabled = canRequestQuotes(selectedRefs);

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-4">
        {providers.map((provider) => (
          <ProviderCard
            key={`${provider.sourceId}-${provider.id}`}
            provider={provider}
            selected={selected.some((item) => sameProvider(item, provider))}
            onToggle={toggle}
          />
        ))}
      </ul>
      {enabled ? (
        <Link href={buildRequestQuotesHref(selectedRefs, filters)}>{t("action")}</Link>
      ) : (
        <button type="button" disabled aria-disabled="true">
          {t("action")}
        </button>
      )}
      <p>{t("hint")}</p>
    </div>
  );
}
