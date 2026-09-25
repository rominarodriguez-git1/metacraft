import { z } from "zod";
import { DEPARTMENTS, TIMELINES, TRADES, ZONES_BY_DEPARTMENT } from "@/modules/providers/reference-data";
import type { Department, SearchCriteria, Timeline, Trade } from "@/modules/providers/types";
import { INPUT_LIMITS } from "@/modules/requests/schema";

const tradeEnum = z.enum(TRADES as [Trade, ...Trade[]]);
const departmentEnum = z.enum(DEPARTMENTS as [Department, ...Department[]]);
const timelineEnum = z.enum(TIMELINES as [Timeline, ...Timeline[]]);

const rawSearchParamsSchema = z.object({
  trade: tradeEnum,
  department: departmentEnum,
  zone: z.string().trim().min(1).max(INPUT_LIMITS.zoneMaxChars),
  budgetMinUyu: z.coerce.number().int().nonnegative().max(INPUT_LIMITS.budgetUyuMax),
  budgetMaxUyu: z.coerce.number().int().nonnegative().max(INPUT_LIMITS.budgetUyuMax),
  timeline: timelineEnum,
});

export type SearchParamsInput = Record<string, string | string[] | undefined>;

export interface SearchFormValues {
  trade: Trade;
  department: Department;
  zone: string;
  budgetMinUyu: number;
  budgetMaxUyu: number;
  timeline: Timeline;
}

export type SearchParamsResult =
  | { success: true; values: SearchFormValues }
  | { success: false; fieldErrors: Record<string, string[]> };

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Query params come from the URL, so nothing here can be trusted; every
 * branch returns a field-error result instead of throwing, since the page
 * must never 500 on bad input.
 */
export function parseSearchParams(input: SearchParamsInput): SearchParamsResult {
  const candidate = {
    trade: firstValue(input.trade),
    department: firstValue(input.department),
    zone: firstValue(input.zone),
    budgetMinUyu: firstValue(input.budgetMinUyu),
    budgetMaxUyu: firstValue(input.budgetMaxUyu),
    timeline: firstValue(input.timeline),
  };

  const parsed = rawSearchParamsSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      success: false,
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { trade, department, zone, budgetMinUyu, budgetMaxUyu, timeline } = parsed.data;
  const fieldErrors: Record<string, string[]> = {};

  if (!ZONES_BY_DEPARTMENT[department].includes(zone)) {
    fieldErrors.zone = ["zone does not belong to department"];
  }
  if (budgetMinUyu > budgetMaxUyu) {
    fieldErrors.budgetMaxUyu = ["budgetMaxUyu must be greater than or equal to budgetMinUyu"];
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, fieldErrors };
  }

  return { success: true, values: { trade, department, zone, budgetMinUyu, budgetMaxUyu, timeline } };
}

export function hasAnySearchParam(input: SearchParamsInput): boolean {
  return Object.values(input).some((value) => value !== undefined);
}

export function toSearchCriteria(values: SearchFormValues): SearchCriteria {
  return {
    trade: values.trade,
    zone: values.zone,
    budgetMinUyu: values.budgetMinUyu,
    budgetMaxUyu: values.budgetMaxUyu,
    timeline: values.timeline,
  };
}
