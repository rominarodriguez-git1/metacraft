import { REFORMASYA_TEMPLATES } from "@/modules/providers/adapters/catalogs";
import { createSimAdapter, type SimAdapterConfig } from "@/modules/providers/adapters/sim-core";
import type { ProviderAdapter } from "@/modules/providers/port";

export const REFORMASYA_DEFAULT_CONFIG: SimAdapterConfig = {
  seed: 2002,
  latencyMsRange: { min: 300, max: 1200 },
  responseDelayMsRange: { min: 2000, max: 8000 },
  failureRate: 0.15,
  responseRate: 0.75,
};

export function createReformasYaAdapter(
  config: SimAdapterConfig = REFORMASYA_DEFAULT_CONFIG,
): ProviderAdapter {
  return createSimAdapter("reformasya", REFORMASYA_TEMPLATES, config);
}
