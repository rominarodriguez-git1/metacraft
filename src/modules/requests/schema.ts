import { createHash } from "node:crypto";
import { z } from "zod";
import { DEPARTMENTS, TIMELINES, TRADES, ZONES_BY_DEPARTMENT } from "@/modules/providers/reference-data";
import type { Department, Timeline, Trade } from "@/modules/providers/types";

const MIN_PROVIDERS = 2;
const MAX_PROVIDERS = 5;

function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

export const quoteRequestInputSchema = z
  .object({
    trade: z.enum(TRADES as [Trade, ...Trade[]], { error: "Unknown trade" }),
    areaM2: z.number({ error: "Area is required" }).positive({ message: "Area must be greater than 0" }),
    department: z.enum(DEPARTMENTS as [Department, ...Department[]], { error: "Unknown department" }),
    zone: z.string({ error: "Zone is required" }).trim().min(1, { message: "Zone is required" }),
    budgetMinUyu: z.number({ error: "Minimum budget is required" }).nonnegative(),
    budgetMaxUyu: z.number({ error: "Maximum budget is required" }).nonnegative(),
    timeline: z.enum(TIMELINES as [Timeline, ...Timeline[]], { error: "Unknown timeline" }),
    materialsIncluded: z.boolean({ error: "materialsIncluded is required" }),
    description: z
      .string({ error: "Description is required" })
      .trim()
      .min(1, { message: "Description is required" }),
    contactPhone: z
      .string({ error: "Contact phone is required" })
      .trim()
      .min(1, { message: "Contact phone is required" })
      .transform(normalizePhone),
    providerIds: z
      .array(z.string().trim().min(1), { error: "Select 2 to 5 providers" })
      .min(MIN_PROVIDERS, { message: `Select at least ${MIN_PROVIDERS} providers` })
      .max(MAX_PROVIDERS, { message: `Select at most ${MAX_PROVIDERS} providers` })
      .transform((ids) => Array.from(new Set(ids)).sort()),
  })
  .superRefine((value, ctx) => {
    if (value.budgetMinUyu > value.budgetMaxUyu) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["budgetMaxUyu"],
        message: "Maximum budget must be greater than or equal to the minimum budget",
      });
    }

    const validZones = ZONES_BY_DEPARTMENT[value.department] ?? [];
    if (!validZones.includes(value.zone)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["zone"],
        message: "Unknown zone for the selected department",
      });
    }

    const deduped = Array.from(new Set(value.providerIds));
    if (deduped.length < MIN_PROVIDERS || deduped.length > MAX_PROVIDERS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["providerIds"],
        message: `Select ${MIN_PROVIDERS} to ${MAX_PROVIDERS} providers`,
      });
    }
  });

export type NormalizedQuoteRequest = z.infer<typeof quoteRequestInputSchema>;

export interface FieldErrors {
  [field: string]: string[];
}

export type QuoteRequestValidationResult =
  | { success: true; data: NormalizedQuoteRequest }
  | { success: false; fieldErrors: FieldErrors };

export function validateQuoteRequest(input: unknown): QuoteRequestValidationResult {
  const result = quoteRequestInputSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const fieldErrors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_root";
    fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
  }
  return { success: false, fieldErrors };
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Canonical JSON (sorted keys, recursively) of the normalized payload, used
 * both as the idempotency comparison basis and as the input to the stored
 * payload hash.
 */
export function canonicalizeQuoteRequest(data: NormalizedQuoteRequest): string {
  return JSON.stringify(sortKeysDeep(data));
}

export function hashQuoteRequest(data: NormalizedQuoteRequest): string {
  return createHash("sha256").update(canonicalizeQuoteRequest(data)).digest("hex");
}
