import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCatalogFromTemplates,
  createSimAdapter,
  DispatchFailureError,
  matchesCriteria,
  type ProviderTemplate,
  type SimAdapterConfig,
  type SimDispatchContext,
} from "@/modules/providers/adapters/sim-core";
import { CASAPRO_TEMPLATES, OBRAFACIL_TEMPLATES, REFORMASYA_TEMPLATES } from "@/modules/providers/adapters/catalogs";
import { createCasaProAdapter } from "@/modules/providers/adapters/sim-casapro";
import { createObraFacilAdapter } from "@/modules/providers/adapters/sim-obrafacil";
import { createReformasYaAdapter } from "@/modules/providers/adapters/sim-reformasya";
import { clearAdapters, listAdapters, registerSimAdapters } from "@/modules/providers/registry";
import { logger } from "@/lib/logger";
import { DEPARTMENTS, TRADES, TRADE_LABOUR_RANGE_UYU, ZONES_BY_DEPARTMENT } from "@/modules/providers/reference-data";
import type { Department, Provider, QuoteRequestPayload, SearchCriteria, Trade, Zone } from "@/modules/providers/types";

const ZONE_TO_DEPARTMENT = new Map<Zone, Department>();
for (const department of DEPARTMENTS) {
  for (const zone of ZONES_BY_DEPARTMENT[department]) {
    ZONE_TO_DEPARTMENT.set(zone, department);
  }
}

function departmentsCovered(catalog: Provider[]): Set<Department> {
  const covered = new Set<Department>();
  for (const provider of catalog) {
    for (const zone of provider.zones) {
      const department = ZONE_TO_DEPARTMENT.get(zone);
      if (department) {
        covered.add(department);
      }
    }
  }
  return covered;
}

function providerCountPerDepartment(catalog: Provider[]): Record<Department, number> {
  const counts: Record<Department, number> = { Montevideo: 0, Canelones: 0, Maldonado: 0 };
  for (const provider of catalog) {
    const depts = new Set<Department>();
    for (const zone of provider.zones) {
      const department = ZONE_TO_DEPARTMENT.get(zone);
      if (department) {
        depts.add(department);
      }
    }
    for (const department of depts) {
      counts[department] += 1;
    }
  }
  return counts;
}

function providerCountPerTrade(catalog: Provider[]): Record<Trade, number> {
  const counts = Object.fromEntries(TRADES.map((trade) => [trade, 0])) as Record<Trade, number>;
  for (const provider of catalog) {
    for (const trade of provider.trades) {
      counts[trade] += 1;
    }
  }
  return counts;
}

describe("simulated adapter catalogs", () => {
  const catalogs: Array<[string, readonly ProviderTemplate[]]> = [
    ["obrafacil", OBRAFACIL_TEMPLATES],
    ["reformasya", REFORMASYA_TEMPLATES],
    ["casapro", CASAPRO_TEMPLATES],
  ];

  for (const [sourceId, templates] of catalogs) {
    describe(sourceId, () => {
      it("has at least 10 fictional providers", () => {
        expect(templates.length).toBeGreaterThanOrEqual(10);
      });

      it("covers every trade with at least 2 providers", () => {
        const catalog = buildCatalogFromTemplates(sourceId, 42, templates);
        const counts = providerCountPerTrade(catalog);
        for (const trade of TRADES) {
          expect(counts[trade]).toBeGreaterThanOrEqual(2);
        }
      });

      it("covers Montevideo, Canelones and Maldonado with at least 2 providers each", () => {
        const catalog = buildCatalogFromTemplates(sourceId, 42, templates);
        expect(departmentsCovered(catalog)).toEqual(new Set(DEPARTMENTS));
        const counts = providerCountPerDepartment(catalog);
        for (const department of DEPARTMENTS) {
          expect(counts[department]).toBeGreaterThanOrEqual(2);
        }
      });

      it("produces an identical catalog for the same seed", () => {
        const first = buildCatalogFromTemplates(sourceId, 7, templates);
        const second = buildCatalogFromTemplates(sourceId, 7, templates);
        expect(second).toEqual(first);
      });
    });
  }
});

describe("matchesCriteria", () => {
  const baseProvider: Provider = {
    id: "p1",
    sourceId: "test",
    name: "Test Provider",
    trades: ["albanileria"],
    zones: ["Centro"],
    ratingAvg: 4.5,
    reviewCount: 20,
    isNew: false,
    verified: true,
    jobMinUyu: 20000,
    jobMaxUyu: 100000,
    earliestStartWeeks: 2,
  };

  const baseCriteria: SearchCriteria = {
    trade: "albanileria",
    zone: "Centro",
    budgetMinUyu: 20000,
    budgetMaxUyu: 100000,
    timeline: "within_1_month",
  };

  it("matches when every criterion passes", () => {
    expect(matchesCriteria(baseProvider, baseCriteria)).toBe(true);
  });

  it("excludes a provider that fails only the trade criterion", () => {
    const provider: Provider = { ...baseProvider, trades: ["pintura"] };
    expect(matchesCriteria(provider, baseCriteria)).toBe(false);
  });

  it("excludes a provider that fails only the zone criterion", () => {
    const provider: Provider = { ...baseProvider, zones: ["Carrasco"] };
    expect(matchesCriteria(provider, baseCriteria)).toBe(false);
  });

  it("excludes a provider that fails only the budget-intersection criterion", () => {
    const provider: Provider = { ...baseProvider, jobMinUyu: 200000, jobMaxUyu: 300000 };
    expect(matchesCriteria(provider, baseCriteria)).toBe(false);
  });

  it("includes a provider whose budget range touches the request range at the inclusive lower bound", () => {
    const provider: Provider = { ...baseProvider, jobMinUyu: 100000, jobMaxUyu: 150000 };
    expect(matchesCriteria(provider, baseCriteria)).toBe(true);
  });

  it("includes a provider whose budget range touches the request range at the inclusive upper bound", () => {
    const provider: Provider = { ...baseProvider, jobMinUyu: 5000, jobMaxUyu: 20000 };
    expect(matchesCriteria(provider, baseCriteria)).toBe(true);
  });

  it("excludes a provider that fails only the timeline criterion", () => {
    const provider: Provider = { ...baseProvider, earliestStartWeeks: 5 };
    expect(matchesCriteria(provider, baseCriteria)).toBe(false);
  });

  it("includes a provider whose earliestStartWeeks equals the timeline's inclusive week limit", () => {
    const provider: Provider = { ...baseProvider, earliestStartWeeks: 4 };
    expect(matchesCriteria(provider, baseCriteria)).toBe(true);
  });
});

describe("simulated adapter dispatch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const templates: ProviderTemplate[] = [
    { name: "Provider One", trades: ["albanileria"], zones: ["Centro"] },
  ];

  const payload: QuoteRequestPayload = {
    trade: "albanileria",
    areaM2: 50,
    department: "Montevideo",
    zone: "Centro",
    budgetMinUyu: 20000,
    budgetMaxUyu: 100000,
    timeline: "within_1_month",
    materialsIncluded: true,
    description: "Reforma de baño",
    contactPhone: "099123456",
  };

  function makeConfig(overrides: Partial<SimAdapterConfig> = {}): SimAdapterConfig {
    return {
      seed: 123,
      latencyMsRange: { min: 100, max: 200 },
      responseDelayMsRange: { min: 500, max: 1000 },
      failureRate: 0,
      responseRate: 1,
      ...overrides,
    };
  }

  it("resolves as sent after the latency delay, then calls reportResponse after a response delay", async () => {
    const adapter = createSimAdapter("test", templates, makeConfig());
    const reportResponse = vi.fn().mockResolvedValue(undefined);
    const ctx: SimDispatchContext = { dispatchId: "d-1", reportResponse };

    const dispatchPromise = adapter.dispatch(payload, ctx);
    await vi.advanceTimersByTimeAsync(200);
    const result = await dispatchPromise;

    expect(result).toEqual({ status: "sent" });
    expect(reportResponse).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

    expect(reportResponse).toHaveBeenCalledTimes(1);
    const [dispatchId, quote] = reportResponse.mock.calls[0]!;
    expect(dispatchId).toBe("d-1");
    const range = TRADE_LABOUR_RANGE_UYU[payload.trade];
    expect(quote.amountUyu).toBeGreaterThanOrEqual(range.minUyu);
    expect(quote.amountUyu).toBeLessThanOrEqual(range.maxUyu);
    expect(quote.materialsIncluded).toBe(true);
  });

  it("always fails when failureRate is 1, throwing a typed DispatchFailureError", async () => {
    const adapter = createSimAdapter("test", templates, makeConfig({ failureRate: 1 }));
    const reportResponse = vi.fn().mockResolvedValue(undefined);
    const ctx: SimDispatchContext = { dispatchId: "d-2", reportResponse };

    const dispatchPromise = adapter.dispatch(payload, ctx);
    const settled = dispatchPromise.then(
      (result) => ({ ok: true as const, result }),
      (error: unknown) => ({ ok: false as const, error }),
    );

    await vi.advanceTimersByTimeAsync(200);
    const outcome = await settled;

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toBeInstanceOf(DispatchFailureError);
      expect((outcome.error as DispatchFailureError).reason).toBeTruthy();
    }
  });

  it("never responds when responseRate is 0", async () => {
    const adapter = createSimAdapter("test", templates, makeConfig({ responseRate: 0 }));
    const reportResponse = vi.fn().mockResolvedValue(undefined);
    const ctx: SimDispatchContext = { dispatchId: "d-3", reportResponse };

    const dispatchPromise = adapter.dispatch(payload, ctx);
    await vi.advanceTimersByTimeAsync(200);
    await dispatchPromise;

    await vi.advanceTimersByTimeAsync(5000);

    expect(reportResponse).not.toHaveBeenCalled();
  });

  it("catches and logs errors thrown inside the scheduled reportResponse callback, never throwing into the process", async () => {
    const adapter = createSimAdapter("test", templates, makeConfig());
    const reportResponse = vi.fn().mockRejectedValue(new Error("boom"));
    const ctx: SimDispatchContext = { dispatchId: "d-4", reportResponse };
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

    const dispatchPromise = adapter.dispatch(payload, ctx);
    await vi.advanceTimersByTimeAsync(200);
    await dispatchPromise;

    await vi.advanceTimersByTimeAsync(1000);
    await Promise.resolve();
    await Promise.resolve();

    expect(reportResponse).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("yields identical dispatch outcomes and quotes for two instances constructed with the same seed", async () => {
    const config = makeConfig({ failureRate: 0.4, responseRate: 0.9 });

    async function run(): Promise<{ result: unknown; quote: unknown }> {
      const adapter = createSimAdapter("test", templates, config);
      const reportResponse = vi.fn().mockResolvedValue(undefined);
      const ctx: SimDispatchContext = { dispatchId: "d-x", reportResponse };

      const dispatchPromise = adapter.dispatch(payload, ctx);
      const settled = dispatchPromise.then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, reason: (error as DispatchFailureError).reason }),
      );

      await vi.advanceTimersByTimeAsync(200);
      const result = await settled;

      await vi.advanceTimersByTimeAsync(1000);
      const quote = reportResponse.mock.calls[0]?.[1] ?? null;
      return { result, quote };
    }

    const first = await run();
    const second = await run();

    expect(second).toEqual(first);
  });
});

describe("sim adapter default configs via factory functions", () => {
  it("build catalogs matching their template lists", async () => {
    const obrafacil = createObraFacilAdapter();
    const reformasya = createReformasYaAdapter();
    const casapro = createCasaProAdapter();

    const criteria: SearchCriteria = {
      trade: "albanileria",
      zone: "Centro",
      budgetMinUyu: 0,
      budgetMaxUyu: 10_000_000,
      timeline: "flexible",
    };

    const [obrafacilResults, reformasyaResults, casaproResults] = await Promise.all([
      obrafacil.search(criteria),
      reformasya.search(criteria),
      casapro.search(criteria),
    ]);

    for (const provider of [...obrafacilResults, ...reformasyaResults, ...casaproResults]) {
      expect(provider.trades).toContain("albanileria");
      expect(provider.zones).toContain("Centro");
    }
  });
});

describe("provider registry with simulated adapters", () => {
  afterEach(() => {
    clearAdapters();
  });

  it("registers all three simulated adapters", () => {
    registerSimAdapters();

    const sourceIds = listAdapters().map((adapter) => adapter.sourceId).sort();
    expect(sourceIds).toEqual(["casapro", "obrafacil", "reformasya"]);
  });
});
