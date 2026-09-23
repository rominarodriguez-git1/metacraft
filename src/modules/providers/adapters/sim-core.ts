import { logger } from "@/lib/logger";
import { TIMELINE_MAX_WEEKS, TRADE_LABOUR_RANGE_UYU } from "@/modules/providers/reference-data";
import type { DispatchContext, DispatchResult, ProviderAdapter } from "@/modules/providers/port";
import type {
  DispatchFailureReason,
  Provider,
  Quote,
  QuoteRequestPayload,
  SearchCriteria,
  Trade,
  Zone,
} from "@/modules/providers/types";

export interface Scheduler {
  schedule(ms: number, fn: () => void): void;
}

export const defaultScheduler: Scheduler = {
  schedule(ms, fn) {
    setTimeout(fn, ms);
  },
};

export interface IntRange {
  min: number;
  max: number;
}

export interface SimAdapterConfig {
  seed: number;
  latencyMsRange: IntRange;
  responseDelayMsRange: IntRange;
  failureRate: number;
  responseRate: number;
  scheduler?: Scheduler;
}

/**
 * A dispatch call is bound to a single dispatch row by the caller; the core
 * ProviderAdapter port only carries reportResponse(dispatchId, quote), so the
 * dispatchId itself must ride along on the context passed to dispatch().
 */
export interface SimDispatchContext extends DispatchContext {
  dispatchId: string;
}

export class DispatchFailureError extends Error {
  readonly reason: DispatchFailureReason;

  constructor(reason: DispatchFailureReason) {
    super(`sim dispatch failed: ${reason}`);
    this.name = "DispatchFailureError";
    this.reason = reason;
  }
}

const FAILURE_REASONS: readonly DispatchFailureReason[] = [
  "TIMEOUT",
  "UPSTREAM_ERROR",
  "REJECTED",
  "INVALID_REQUEST",
];

const QUOTE_MESSAGE_TEMPLATES: readonly string[] = [
  "Podemos coordinar una visita esta semana.",
  "Presupuesto estimado segun los materiales indicados.",
  "Disponibilidad para comenzar segun el cronograma solicitado.",
  "Cotizacion preliminar, sujeta a relevamiento en obra.",
];

// Deterministic PRNG (mulberry32): same seed => same output sequence.
export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return function rng(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: () => number, range: IntRange): number {
  return Math.floor(rng() * (range.max - range.min + 1)) + range.min;
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  const index = Math.min(items.length - 1, Math.floor(rng() * items.length));
  return items[index]!;
}

export interface ProviderTemplate {
  name: string;
  trades: Trade[];
  zones: Zone[];
}

export function buildCatalogFromTemplates(
  sourceId: string,
  seed: number,
  templates: readonly ProviderTemplate[],
): Provider[] {
  const rng = createSeededRng(seed);
  return templates.map((template, index) => {
    const tradeRanges = template.trades.map((trade) => TRADE_LABOUR_RANGE_UYU[trade]);
    const jobMinUyu = Math.round(
      Math.min(...tradeRanges.map((r) => r.minUyu)) * (0.8 + rng() * 0.2),
    );
    const jobMaxUyu = Math.round(
      Math.max(...tradeRanges.map((r) => r.maxUyu)) * (0.8 + rng() * 0.2),
    );
    return {
      id: `${sourceId}-${index + 1}`,
      sourceId,
      name: template.name,
      trades: template.trades,
      zones: template.zones,
      ratingAvg: Math.round((3.5 + rng() * 1.5) * 10) / 10,
      reviewCount: randInt(rng, { min: 5, max: 400 }),
      isNew: rng() < 0.2,
      verified: rng() < 0.75,
      jobMinUyu,
      jobMaxUyu,
      earliestStartWeeks: randInt(rng, { min: 0, max: 8 }),
    } satisfies Provider;
  });
}

export function matchesCriteria(provider: Provider, criteria: SearchCriteria): boolean {
  if (!provider.trades.includes(criteria.trade)) {
    return false;
  }
  if (!provider.zones.includes(criteria.zone)) {
    return false;
  }
  const budgetIntersects =
    provider.jobMinUyu <= criteria.budgetMaxUyu && provider.jobMaxUyu >= criteria.budgetMinUyu;
  if (!budgetIntersects) {
    return false;
  }
  const weekLimit = TIMELINE_MAX_WEEKS[criteria.timeline];
  if (provider.earliestStartWeeks > weekLimit) {
    return false;
  }
  return true;
}

function delay(scheduler: Scheduler, ms: number): Promise<void> {
  return new Promise((resolve) => {
    scheduler.schedule(ms, resolve);
  });
}

function buildQuote(trade: Trade, materialsIncluded: boolean, rng: () => number): Quote {
  const range = TRADE_LABOUR_RANGE_UYU[trade];
  return {
    amountUyu: randInt(rng, { min: range.minUyu, max: range.maxUyu }),
    materialsIncluded,
    message: pick(rng, QUOTE_MESSAGE_TEMPLATES),
  };
}

export function createSimAdapter(
  sourceId: string,
  templates: readonly ProviderTemplate[],
  config: SimAdapterConfig,
): ProviderAdapter {
  const catalog = buildCatalogFromTemplates(sourceId, config.seed, templates);
  const rng = createSeededRng(config.seed);
  const scheduler = config.scheduler ?? defaultScheduler;

  return {
    sourceId,

    async search(criteria: SearchCriteria): Promise<Provider[]> {
      return catalog.filter((provider) => matchesCriteria(provider, criteria));
    },

    async dispatch(
      payload: QuoteRequestPayload,
      ctx: SimDispatchContext,
    ): Promise<DispatchResult> {
      const latencyMs = randInt(rng, config.latencyMsRange);
      await delay(scheduler, latencyMs);

      if (rng() < config.failureRate) {
        throw new DispatchFailureError(pick(rng, FAILURE_REASONS));
      }

      const responseDelayMs = randInt(rng, config.responseDelayMsRange);
      const willRespond = rng() < config.responseRate;
      const dispatchId = ctx.dispatchId;

      scheduler.schedule(responseDelayMs, () => {
        if (!willRespond) {
          return;
        }
        const quote = buildQuote(payload.trade, payload.materialsIncluded, rng);
        ctx.reportResponse(dispatchId, quote).catch((error: unknown) => {
          logger.error("sim adapter reportResponse failed", {
            sourceId,
            dispatchId,
            error,
          });
        });
      });

      return { status: "sent" };
    },
  };
}
