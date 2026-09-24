import { CASAPRO_DEFAULT_CONFIG, createCasaProAdapter } from "@/modules/providers/adapters/sim-casapro";
import { OBRAFACIL_DEFAULT_CONFIG, createObraFacilAdapter } from "@/modules/providers/adapters/sim-obrafacil";
import { REFORMASYA_DEFAULT_CONFIG, createReformasYaAdapter } from "@/modules/providers/adapters/sim-reformasya";
import type { ProviderAdapter } from "@/modules/providers/port";
import { loadSimAdapterConfigs, type SimSourceId } from "@/modules/providers/sim-config";
import type { SimAdapterConfig } from "@/modules/providers/adapters/sim-core";

const SIM_DEFAULT_CONFIGS: Record<SimSourceId, SimAdapterConfig> = {
  obrafacil: OBRAFACIL_DEFAULT_CONFIG,
  reformasya: REFORMASYA_DEFAULT_CONFIG,
  casapro: CASAPRO_DEFAULT_CONFIG,
};

const REGISTRY_GLOBAL_KEY = Symbol.for("metacraft.providers.registry");

interface RegistryStore {
  adapters: Map<string, ProviderAdapter>;
}

type GlobalWithRegistry = typeof globalThis & {
  [REGISTRY_GLOBAL_KEY]?: RegistryStore;
};

function getStore(): RegistryStore {
  const globalWithRegistry = globalThis as GlobalWithRegistry;
  if (!globalWithRegistry[REGISTRY_GLOBAL_KEY]) {
    globalWithRegistry[REGISTRY_GLOBAL_KEY] = { adapters: new Map() };
  }
  return globalWithRegistry[REGISTRY_GLOBAL_KEY];
}

export function registerAdapter(adapter: ProviderAdapter): void {
  const { adapters } = getStore();
  if (adapters.has(adapter.sourceId)) {
    throw new Error(`Adapter already registered for sourceId "${adapter.sourceId}"`);
  }
  adapters.set(adapter.sourceId, adapter);
}

export function getAdapter(sourceId: string): ProviderAdapter | undefined {
  ensureDefaultAdapters();
  return getStore().adapters.get(sourceId);
}

export function listAdapters(): ProviderAdapter[] {
  ensureDefaultAdapters();
  return Array.from(getStore().adapters.values());
}

export function clearAdapters(): void {
  getStore().adapters.clear();
}

export function registerSimAdapters(): void {
  const configs = loadSimAdapterConfigs(SIM_DEFAULT_CONFIGS);
  registerAdapter(createObraFacilAdapter(configs.obrafacil));
  registerAdapter(createReformasYaAdapter(configs.reformasya));
  registerAdapter(createCasaProAdapter(configs.casapro));
}

function ensureDefaultAdapters(): void {
  if (getStore().adapters.size === 0) {
    registerSimAdapters();
  }
}
