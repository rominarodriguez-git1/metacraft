import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "@/lib/logger";
import {
  buildRequestQuotesHref,
  canRequestQuotes,
  classifySearchOutcome,
  searchProviders,
  type SelectedProviderRef,
} from "@/modules/catalog/search";
import {
  parseSearchParams,
  toSearchCriteria,
  type SearchFormValues,
} from "@/modules/catalog/search-schema";
import type { ProviderAdapter } from "@/modules/providers/port";
import { clearAdapters, registerAdapter, registerSimAdapters } from "@/modules/providers/registry";
import type { Provider, SearchCriteria } from "@/modules/providers/types";

function makeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: "p-1",
    sourceId: "test-source",
    name: "Test Provider",
    trades: ["albanileria"],
    zones: ["Centro"],
    ratingAvg: 4.2,
    reviewCount: 12,
    isNew: false,
    verified: true,
    jobMinUyu: 10_000,
    jobMaxUyu: 50_000,
    earliestStartWeeks: 1,
    ...overrides,
  };
}

const baseCriteria: SearchCriteria = {
  trade: "albanileria",
  zone: "Centro",
  budgetMinUyu: 0,
  budgetMaxUyu: 10_000_000,
  timeline: "flexible",
};

describe("searchProviders", () => {
  afterEach(() => {
    clearAdapters();
    vi.restoreAllMocks();
  });

  it("aggregates matching providers from every registered adapter", async () => {
    registerSimAdapters();

    const { providers, totalSources, unavailableSourceCount } = await searchProviders(baseCriteria);

    expect(totalSources).toBe(3);
    expect(unavailableSourceCount).toBe(0);
    expect(new Set(providers.map((provider) => provider.sourceId))).toEqual(
      new Set(["obrafacil", "reformasya", "casapro"]),
    );
    for (const provider of providers) {
      expect(provider.trades).toContain("albanileria");
      expect(provider.zones).toContain("Centro");
    }
  });

  it("excludes providers failing any single active filter (a budget range with no overlap)", async () => {
    registerSimAdapters();

    const narrowCriteria: SearchCriteria = {
      ...baseCriteria,
      budgetMinUyu: 999_999_000,
      budgetMaxUyu: 999_999_999,
    };

    const { providers } = await searchProviders(narrowCriteria);

    expect(providers).toEqual([]);
  });

  it("omits a failing adapter's results without failing the search, and logs the failure without PII", async () => {
    const healthy: ProviderAdapter = {
      sourceId: "healthy-source",
      async search() {
        return [makeProvider({ sourceId: "healthy-source" })];
      },
      async dispatch() {
        return { status: "sent" };
      },
    };
    const broken: ProviderAdapter = {
      sourceId: "broken-source",
      async search() {
        throw new Error("upstream boom for someone@example.com");
      },
      async dispatch() {
        return { status: "sent" };
      },
    };
    registerAdapter(healthy);
    registerAdapter(broken);
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

    const result = await searchProviders(baseCriteria);

    expect(result.providers.map((provider) => provider.sourceId)).toEqual(["healthy-source"]);
    expect(result.unavailableSourceCount).toBe(1);
    expect(result.totalSources).toBe(2);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const loggedLine = JSON.stringify(errorSpy.mock.calls[0]);
    expect(loggedLine).toContain("broken-source");
    expect(loggedLine).not.toContain("someone@example.com");
  });

  it("classifies an all-sources-unavailable outcome distinctly from a zero-match outcome", () => {
    expect(
      classifySearchOutcome({ providers: [], totalSources: 2, unavailableSourceCount: 2 }),
    ).toEqual({ kind: "all-unavailable", unavailableSourceCount: 2 });

    expect(
      classifySearchOutcome({ providers: [], totalSources: 2, unavailableSourceCount: 0 }),
    ).toEqual({ kind: "empty" });

    const providers = [makeProvider()];
    expect(
      classifySearchOutcome({ providers, totalSources: 1, unavailableSourceCount: 0 }),
    ).toEqual({ kind: "results", providers });
  });
});

describe("parseSearchParams", () => {
  it("returns field errors (never throws) when required params are missing", () => {
    const result = parseSearchParams({});

    expect(result.success).toBe(false);
  });

  it("returns a field error when budgetMinUyu is greater than budgetMaxUyu", () => {
    const result = parseSearchParams({
      trade: "albanileria",
      department: "Montevideo",
      zone: "Centro",
      budgetMinUyu: "500",
      budgetMaxUyu: "100",
      timeline: "flexible",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.budgetMaxUyu).toBeDefined();
    }
  });

  it("returns a field error when the zone does not belong to the department", () => {
    const result = parseSearchParams({
      trade: "albanileria",
      department: "Montevideo",
      zone: "Not-A-Real-Zone",
      budgetMinUyu: "0",
      budgetMaxUyu: "1000",
      timeline: "flexible",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.zone).toBeDefined();
    }
  });

  it("rejects an unknown trade, department or timeline value", () => {
    expect(
      parseSearchParams({
        trade: "unknown-trade",
        department: "Montevideo",
        zone: "Centro",
        budgetMinUyu: "0",
        budgetMaxUyu: "1000",
        timeline: "flexible",
      }).success,
    ).toBe(false);

    expect(
      parseSearchParams({
        trade: "albanileria",
        department: "Atlantida",
        zone: "Centro",
        budgetMinUyu: "0",
        budgetMaxUyu: "1000",
        timeline: "flexible",
      }).success,
    ).toBe(false);

    expect(
      parseSearchParams({
        trade: "albanileria",
        department: "Montevideo",
        zone: "Centro",
        budgetMinUyu: "0",
        budgetMaxUyu: "1000",
        timeline: "unknown-timeline",
      }).success,
    ).toBe(false);
  });

  it("parses valid params into search form values usable as search criteria", () => {
    const result = parseSearchParams({
      trade: "pintura",
      department: "Canelones",
      zone: "Pando",
      budgetMinUyu: "8000",
      budgetMaxUyu: "60000",
      timeline: "within_1_month",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(toSearchCriteria(result.values)).toEqual({
        trade: "pintura",
        zone: "Pando",
        budgetMinUyu: 8000,
        budgetMaxUyu: 60000,
        timeline: "within_1_month",
      });
    }
  });
});

describe("request-quotes selection", () => {
  const filters: SearchFormValues = {
    trade: "albanileria",
    department: "Montevideo",
    zone: "Centro",
    budgetMinUyu: 0,
    budgetMaxUyu: 100_000,
    timeline: "flexible",
  };

  it("is enabled only with between 2 and 5 selected providers", () => {
    expect(canRequestQuotes([])).toBe(false);
    expect(canRequestQuotes([{ providerId: "a", sourceId: "s" }])).toBe(false);

    const five: SelectedProviderRef[] = Array.from({ length: 5 }, (_, index) => ({
      providerId: `p${index}`,
      sourceId: "s",
    }));
    expect(canRequestQuotes(five)).toBe(true);
    expect(canRequestQuotes([...five, { providerId: "p6", sourceId: "s" }])).toBe(false);
  });

  it("builds a /requests/new link carrying the selected provider/source ids and the active filters", () => {
    const selected: SelectedProviderRef[] = [
      { providerId: "obrafacil-1", sourceId: "obrafacil" },
      { providerId: "casapro-3", sourceId: "casapro" },
    ];

    const href = buildRequestQuotesHref(selected, filters);
    const [path, query] = href.split("?");
    const params = new URLSearchParams(query);

    expect(path).toBe("/requests/new");
    expect(params.getAll("provider")).toEqual(["obrafacil:obrafacil-1", "casapro:casapro-3"]);
    expect(params.get("trade")).toBe("albanileria");
    expect(params.get("department")).toBe("Montevideo");
    expect(params.get("zone")).toBe("Centro");
    expect(params.get("budgetMinUyu")).toBe("0");
    expect(params.get("budgetMaxUyu")).toBe("100000");
    expect(params.get("timeline")).toBe("flexible");
  });
});
