import { z } from "zod";

export const SIM_SOURCE_IDS = ["obrafacil", "reformasya", "casapro"] as const;
export type SimSourceId = (typeof SIM_SOURCE_IDS)[number];

const intRangeSchema = z
  .object({
    min: z.number().int().nonnegative(),
    max: z.number().int().nonnegative(),
  })
  .strict()
  .refine((range) => range.min <= range.max, {
    message: "min must be <= max",
  });

const rateSchema = z.number().min(0).max(1);

const sourceOverrideSchema = z
  .object({
    seed: z.number().int().nonnegative().optional(),
    failureRate: rateSchema.optional(),
    responseRate: rateSchema.optional(),
    latencyMsRange: intRangeSchema.optional(),
    responseDelayMsRange: intRangeSchema.optional(),
  })
  .strict();

export type SimAdapterConfigOverride = z.infer<typeof sourceOverrideSchema>;
export type SimAdapterConfigOverrides = Partial<Record<SimSourceId, SimAdapterConfigOverride>>;

const simAdapterConfigOverridesSchema = z
  .record(z.string(), sourceOverrideSchema)
  .superRefine((value, ctx) => {
    for (const sourceId of Object.keys(value)) {
      if (!(SIM_SOURCE_IDS as readonly string[]).includes(sourceId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown simulated source id "${sourceId}"`,
          path: [sourceId],
        });
      }
    }
  });

export function parseSimAdapterConfig(raw: string): SimAdapterConfigOverrides {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("SIM_ADAPTER_CONFIG must be valid JSON");
  }

  const result = simAdapterConfigOverridesSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`SIM_ADAPTER_CONFIG failed validation: ${result.error.message}`);
  }

  return result.data as SimAdapterConfigOverrides;
}

export function resolveSimAdapterConfigs<T extends object>(
  defaults: Record<SimSourceId, T>,
  overrides: SimAdapterConfigOverrides = {},
): Record<SimSourceId, T> {
  const resolved = {} as Record<SimSourceId, T>;
  for (const sourceId of SIM_SOURCE_IDS) {
    resolved[sourceId] = {
      ...defaults[sourceId],
      ...overrides[sourceId],
    };
  }
  return resolved;
}

export function loadSimAdapterConfigs<T extends object>(
  defaults: Record<SimSourceId, T>,
  source: Partial<Record<string, string>> = process.env,
): Record<SimSourceId, T> {
  const raw = source.SIM_ADAPTER_CONFIG;
  const overrides = raw === undefined || raw === "" ? {} : parseSimAdapterConfig(raw);
  return resolveSimAdapterConfigs(defaults, overrides);
}
