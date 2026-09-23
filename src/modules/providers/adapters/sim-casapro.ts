import { CASAPRO_TEMPLATES } from "@/modules/providers/adapters/catalogs";
import { createSimAdapter, type SimAdapterConfig } from "@/modules/providers/adapters/sim-core";
import type { ProviderAdapter } from "@/modules/providers/port";

export const CASAPRO_DEFAULT_CONFIG: SimAdapterConfig = {
  seed: 3003,
  latencyMsRange: { min: 150, max: 600 },
  responseDelayMsRange: { min: 1500, max: 6000 },
  failureRate: 0.05,
  responseRate: 0.9,
};

export function createCasaProAdapter(
  config: SimAdapterConfig = CASAPRO_DEFAULT_CONFIG,
): ProviderAdapter {
  return createSimAdapter("casapro", CASAPRO_TEMPLATES, config);
}
