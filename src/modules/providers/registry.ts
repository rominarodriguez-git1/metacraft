import { createCasaProAdapter } from "@/modules/providers/adapters/sim-casapro";
import { createObraFacilAdapter } from "@/modules/providers/adapters/sim-obrafacil";
import { createReformasYaAdapter } from "@/modules/providers/adapters/sim-reformasya";
import type { ProviderAdapter } from "@/modules/providers/port";

const adapters = new Map<string, ProviderAdapter>();

export function registerAdapter(adapter: ProviderAdapter): void {
  if (adapters.has(adapter.sourceId)) {
    throw new Error(`Adapter already registered for sourceId "${adapter.sourceId}"`);
  }
  adapters.set(adapter.sourceId, adapter);
}

export function getAdapter(sourceId: string): ProviderAdapter | undefined {
  return adapters.get(sourceId);
}

export function listAdapters(): ProviderAdapter[] {
  return Array.from(adapters.values());
}

export function clearAdapters(): void {
  adapters.clear();
}

export function registerSimAdapters(): void {
  registerAdapter(createObraFacilAdapter());
  registerAdapter(createReformasYaAdapter());
  registerAdapter(createCasaProAdapter());
}
