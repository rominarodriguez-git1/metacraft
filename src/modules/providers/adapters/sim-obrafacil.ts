import { OBRAFACIL_TEMPLATES } from "@/modules/providers/adapters/catalogs";
import { createSimAdapter, type SimAdapterConfig } from "@/modules/providers/adapters/sim-core";
import type { ProviderAdapter } from "@/modules/providers/port";

export const OBRAFACIL_DEFAULT_CONFIG: SimAdapterConfig = {
  seed: 1001,
  latencyMsRange: { min: 200, max: 800 },
  responseDelayMsRange: { min: 1000, max: 5000 },
  failureRate: 0.1,
  responseRate: 0.85,
};

export function createObraFacilAdapter(
  config: SimAdapterConfig = OBRAFACIL_DEFAULT_CONFIG,
): ProviderAdapter {
  return createSimAdapter("obrafacil", OBRAFACIL_TEMPLATES, config);
}
