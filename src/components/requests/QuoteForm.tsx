"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DEPARTMENTS, TIMELINES, TRADES, ZONES_BY_DEPARTMENT } from "@/modules/providers/reference-data";
import type { Department, Timeline, Trade } from "@/modules/providers/types";

const MIN_PROVIDERS = 2;
const MAX_PROVIDERS = 5;
const IDEMPOTENCY_KEY_HEADER = "idempotency-key";

export interface QuoteFormProvider {
  providerId: string;
  sourceId: string;
  name: string;
}

export interface QuoteFormPrefill {
  trade: Trade;
  department: Department;
  zone: string;
  budgetMinUyu: number;
  budgetMaxUyu: number;
  timeline: Timeline;
}

interface QuoteFormProps {
  providers: QuoteFormProvider[];
  prefill: QuoteFormPrefill;
}

interface FieldErrors {
  [field: string]: string[];
}

function sameProvider(a: QuoteFormProvider, b: QuoteFormProvider): boolean {
  return a.sourceId === b.sourceId && a.providerId === b.providerId;
}

export function QuoteForm({ providers, prefill }: QuoteFormProps) {
  const t = useTranslations("requests.form");
  const tCard = useTranslations("search.card");
  const tFilters = useTranslations("search.filters");
  const tTrades = useTranslations("search.trades");
  const tTimelines = useTranslations("search.timelines");
  const router = useRouter();

  // Lazy initializer: computed once for the component's lifetime, so React
  // StrictMode's mount->unmount->remount dev cycle and any re-render never
  // regenerate it, and a resubmit reuses the same idempotency key.
  const [idempotencyKey] = useState<string>(() => crypto.randomUUID());

  const [selectedProviders, setSelectedProviders] = useState<QuoteFormProvider[]>(providers);
  const [trade, setTrade] = useState<Trade>(prefill.trade);
  const [department, setDepartment] = useState<Department>(prefill.department);
  const [zone, setZone] = useState<string>(prefill.zone);
  const [budgetMinUyu, setBudgetMinUyu] = useState<string>(String(prefill.budgetMinUyu));
  const [budgetMaxUyu, setBudgetMaxUyu] = useState<string>(String(prefill.budgetMaxUyu));
  const [timeline, setTimeline] = useState<Timeline>(prefill.timeline);
  const [areaM2, setAreaM2] = useState<string>("");
  const [materialsIncluded, setMaterialsIncluded] = useState<boolean>(false);
  const [description, setDescription] = useState<string>("");
  const [contactPhone, setContactPhone] = useState<string>("");

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const zoneOptions = ZONES_BY_DEPARTMENT[department] ?? [];
  const canSubmit = selectedProviders.length >= MIN_PROVIDERS && selectedProviders.length <= MAX_PROVIDERS;

  function removeProvider(provider: QuoteFormProvider): void {
    setSelectedProviders((current) => current.filter((item) => !sameProvider(item, provider)));
  }

  function handleDepartmentChange(next: Department): void {
    setDepartment(next);
    setZone("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canSubmit) {
      setFieldErrors({ providerIds: [t("selectionError")] });
      return;
    }

    setSubmitting(true);
    setFieldErrors({});

    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [IDEMPOTENCY_KEY_HEADER]: idempotencyKey,
        },
        body: JSON.stringify({
          trade,
          areaM2: Number(areaM2),
          department,
          zone,
          budgetMinUyu: Number(budgetMinUyu),
          budgetMaxUyu: Number(budgetMaxUyu),
          timeline,
          materialsIncluded,
          description,
          contactPhone,
          providerIds: selectedProviders.map((provider) => provider.providerId),
        }),
      });

      if (response.status === 422) {
        const body = (await response.json()) as { fieldErrors?: FieldErrors };
        setFieldErrors(body.fieldErrors ?? {});
        return;
      }

      if (!response.ok) {
        setFieldErrors({ _root: [t("genericError")] });
        return;
      }

      const body = (await response.json()) as { id: string };
      router.push(`/requests/${body.id}`);
    } catch {
      setFieldErrors({ _root: [t("genericError")] });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{t("providersTitle")}</h2>
      <ul className="flex flex-col gap-2">
        {selectedProviders.map((provider) => (
          <li
            key={`${provider.sourceId}-${provider.providerId}`}
            className="flex items-center justify-between gap-2 rounded border p-2"
            data-source-id={provider.sourceId}
          >
            <span>
              <span className="font-semibold">{provider.name}</span>{" "}
              <span className="text-sm text-gray-500">{tCard("source", { sourceId: provider.sourceId })}</span>
            </span>
            <button type="button" onClick={() => removeProvider(provider)}>
              {t("removeAction")}
            </button>
          </li>
        ))}
      </ul>
      {fieldErrors.providerIds ? <span role="alert">{fieldErrors.providerIds.join(", ")}</span> : null}
      <p>{t("selectionHint")}</p>

      <label className="flex flex-col gap-1">
        {tFilters("tradeLabel")}
        <select value={trade} onChange={(event) => setTrade(event.target.value as Trade)}>
          {TRADES.map((option) => (
            <option key={option} value={option}>
              {tTrades(option)}
            </option>
          ))}
        </select>
        {fieldErrors.trade ? <span role="alert">{fieldErrors.trade.join(", ")}</span> : null}
      </label>

      <label className="flex flex-col gap-1">
        {t("areaLabel")}
        <input
          type="number"
          min={0}
          value={areaM2}
          onChange={(event) => setAreaM2(event.target.value)}
        />
        {fieldErrors.areaM2 ? <span role="alert">{fieldErrors.areaM2.join(", ")}</span> : null}
      </label>

      <label className="flex flex-col gap-1">
        {tFilters("departmentLabel")}
        <select value={department} onChange={(event) => handleDepartmentChange(event.target.value as Department)}>
          {DEPARTMENTS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {fieldErrors.department ? <span role="alert">{fieldErrors.department.join(", ")}</span> : null}
      </label>

      <label className="flex flex-col gap-1">
        {tFilters("zoneLabel")}
        <select value={zone} onChange={(event) => setZone(event.target.value)}>
          {zoneOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {fieldErrors.zone ? <span role="alert">{fieldErrors.zone.join(", ")}</span> : null}
      </label>

      <label className="flex flex-col gap-1">
        {tFilters("budgetMinLabel")}
        <input
          type="number"
          min={0}
          value={budgetMinUyu}
          onChange={(event) => setBudgetMinUyu(event.target.value)}
        />
        {fieldErrors.budgetMinUyu ? <span role="alert">{fieldErrors.budgetMinUyu.join(", ")}</span> : null}
      </label>

      <label className="flex flex-col gap-1">
        {tFilters("budgetMaxLabel")}
        <input
          type="number"
          min={0}
          value={budgetMaxUyu}
          onChange={(event) => setBudgetMaxUyu(event.target.value)}
        />
        {fieldErrors.budgetMaxUyu ? <span role="alert">{fieldErrors.budgetMaxUyu.join(", ")}</span> : null}
      </label>

      <label className="flex flex-col gap-1">
        {tFilters("timelineLabel")}
        <select value={timeline} onChange={(event) => setTimeline(event.target.value as Timeline)}>
          {TIMELINES.map((option) => (
            <option key={option} value={option}>
              {tTimelines(option)}
            </option>
          ))}
        </select>
        {fieldErrors.timeline ? <span role="alert">{fieldErrors.timeline.join(", ")}</span> : null}
      </label>

      <fieldset className="flex flex-col gap-1">
        <legend>{t("materialsIncludedLabel")}</legend>
        <label>
          <input
            type="radio"
            name="materialsIncluded"
            checked={materialsIncluded}
            onChange={() => setMaterialsIncluded(true)}
          />
          {t("materialsYes")}
        </label>
        <label>
          <input
            type="radio"
            name="materialsIncluded"
            checked={!materialsIncluded}
            onChange={() => setMaterialsIncluded(false)}
          />
          {t("materialsNo")}
        </label>
        {fieldErrors.materialsIncluded ? (
          <span role="alert">{fieldErrors.materialsIncluded.join(", ")}</span>
        ) : null}
      </fieldset>

      <label className="flex flex-col gap-1">
        {t("descriptionLabel")}
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
        {fieldErrors.description ? <span role="alert">{fieldErrors.description.join(", ")}</span> : null}
      </label>

      <label className="flex flex-col gap-1">
        {t("phoneLabel")}
        <input
          type="tel"
          value={contactPhone}
          onChange={(event) => setContactPhone(event.target.value)}
        />
        {fieldErrors.contactPhone ? <span role="alert">{fieldErrors.contactPhone.join(", ")}</span> : null}
      </label>

      {fieldErrors._root ? <span role="alert">{fieldErrors._root.join(", ")}</span> : null}

      <button type="submit" disabled={!canSubmit || submitting}>
        {t("submit")}
      </button>
    </form>
  );
}
