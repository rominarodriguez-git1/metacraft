"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DEPARTMENTS, TIMELINES, TRADES, ZONES_BY_DEPARTMENT } from "@/modules/providers/reference-data";
import type { SearchFormValues } from "@/modules/catalog/search-schema";
import type { Department, Timeline, Trade } from "@/modules/providers/types";

interface SearchFiltersProps {
  initialValues?: SearchFormValues;
  fieldErrors?: Record<string, string[]>;
}

export function SearchFilters({ initialValues, fieldErrors }: SearchFiltersProps) {
  const t = useTranslations("search.filters");
  const tTrades = useTranslations("search.trades");
  const tTimelines = useTranslations("search.timelines");
  const router = useRouter();

  const [trade, setTrade] = useState<Trade | "">(initialValues?.trade ?? "");
  const [department, setDepartment] = useState<Department | "">(initialValues?.department ?? "");
  const [zone, setZone] = useState<string>(initialValues?.zone ?? "");
  const [budgetMinUyu, setBudgetMinUyu] = useState<string>(
    initialValues ? String(initialValues.budgetMinUyu) : "",
  );
  const [budgetMaxUyu, setBudgetMaxUyu] = useState<string>(
    initialValues ? String(initialValues.budgetMaxUyu) : "",
  );
  const [timeline, setTimeline] = useState<Timeline | "">(initialValues?.timeline ?? "");

  const zoneOptions = department ? ZONES_BY_DEPARTMENT[department] : [];

  function handleDepartmentChange(next: string): void {
    setDepartment(next as Department);
    setZone("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const params = new URLSearchParams({
      trade,
      department,
      zone,
      budgetMinUyu,
      budgetMaxUyu,
      timeline,
    });
    router.push(`/search?${params.toString()}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-3">
      <label className="flex flex-col gap-1">
        {t("tradeLabel")}
        <select value={trade} onChange={(event) => setTrade(event.target.value as Trade)} required>
          <option value="" disabled>
            {t("tradeLabel")}
          </option>
          {TRADES.map((option) => (
            <option key={option} value={option}>
              {tTrades(option)}
            </option>
          ))}
        </select>
        {fieldErrors?.trade ? <span role="alert">{fieldErrors.trade.join(", ")}</span> : null}
      </label>

      <label className="flex flex-col gap-1">
        {t("departmentLabel")}
        <select
          value={department}
          onChange={(event) => handleDepartmentChange(event.target.value)}
          required
        >
          <option value="" disabled>
            {t("departmentLabel")}
          </option>
          {DEPARTMENTS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {fieldErrors?.department ? (
          <span role="alert">{fieldErrors.department.join(", ")}</span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1">
        {t("zoneLabel")}
        <select
          value={zone}
          onChange={(event) => setZone(event.target.value)}
          required
          disabled={!department}
        >
          <option value="" disabled>
            {t("zoneLabel")}
          </option>
          {zoneOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {fieldErrors?.zone ? <span role="alert">{fieldErrors.zone.join(", ")}</span> : null}
      </label>

      <label className="flex flex-col gap-1">
        {t("budgetMinLabel")}
        <input
          type="number"
          min={0}
          value={budgetMinUyu}
          onChange={(event) => setBudgetMinUyu(event.target.value)}
          required
        />
        {fieldErrors?.budgetMinUyu ? (
          <span role="alert">{fieldErrors.budgetMinUyu.join(", ")}</span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1">
        {t("budgetMaxLabel")}
        <input
          type="number"
          min={0}
          value={budgetMaxUyu}
          onChange={(event) => setBudgetMaxUyu(event.target.value)}
          required
        />
        {fieldErrors?.budgetMaxUyu ? (
          <span role="alert">{fieldErrors.budgetMaxUyu.join(", ")}</span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1">
        {t("timelineLabel")}
        <select
          value={timeline}
          onChange={(event) => setTimeline(event.target.value as Timeline)}
          required
        >
          <option value="" disabled>
            {t("timelineLabel")}
          </option>
          {TIMELINES.map((option) => (
            <option key={option} value={option}>
              {tTimelines(option)}
            </option>
          ))}
        </select>
        {fieldErrors?.timeline ? <span role="alert">{fieldErrors.timeline.join(", ")}</span> : null}
      </label>

      <button type="submit">{t("submit")}</button>
    </form>
  );
}
