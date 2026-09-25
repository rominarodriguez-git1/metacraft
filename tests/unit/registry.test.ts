import { afterEach, describe, expect, it, vi } from "vitest";
import { clearAdapters, getAdapter, listAdapters, registerAdapter } from "@/modules/providers/registry";
import { fixtureAdapter } from "../fixtures/fixture-adapter";

const SIM_SOURCE_IDS = ["casapro", "obrafacil", "reformasya"] as const;

describe("provider registry", () => {
  afterEach(() => {
    clearAdapters();
  });

  it("finds a registered adapter by sourceId after a single registry-line registration", () => {
    registerAdapter(fixtureAdapter);

    expect(getAdapter("fixture")).toBe(fixtureAdapter);
    expect(listAdapters()).toEqual([fixtureAdapter]);
  });

  it("rejects a second registration for the same sourceId", () => {
    registerAdapter(fixtureAdapter);

    expect(() => registerAdapter(fixtureAdapter)).toThrow(/already registered/i);
  });

  it("clearAdapters removes every registered adapter", () => {
    registerAdapter(fixtureAdapter);
    clearAdapters();

    const store = new Map(listAdapters().map((adapter) => [adapter.sourceId, adapter]));
    expect(store.has("fixture")).toBe(false);
  });

  describe("lazy default registration", () => {
    it("registers the three simulated sources on first listAdapters() call when nothing is registered", () => {
      const sourceIds = listAdapters()
        .map((adapter) => adapter.sourceId)
        .sort();

      expect(sourceIds).toEqual([...SIM_SOURCE_IDS].sort());
    });

    it("registers the three simulated sources on first getAdapter() call when nothing is registered", () => {
      expect(getAdapter("obrafacil")).toBeDefined();
      expect(getAdapter("reformasya")).toBeDefined();
      expect(getAdapter("casapro")).toBeDefined();
    });

    it("returns undefined for an unregistered sourceId, having lazily registered the defaults", () => {
      expect(getAdapter("unknown")).toBeUndefined();
      expect(listAdapters()).toHaveLength(SIM_SOURCE_IDS.length);
    });

    it("does not lazily register defaults once any adapter has been explicitly registered", () => {
      registerAdapter(fixtureAdapter);

      expect(listAdapters()).toEqual([fixtureAdapter]);
      expect(getAdapter("obrafacil")).toBeUndefined();
    });

    it("re-registers the defaults after clearAdapters() empties the store again", () => {
      listAdapters();
      clearAdapters();

      const sourceIds = listAdapters()
        .map((adapter) => adapter.sourceId)
        .sort();
      expect(sourceIds).toEqual([...SIM_SOURCE_IDS].sort());
    });
  });

  describe("explicit registration takes precedence", () => {
    it("lets a test install only its own adapter instead of the lazy defaults", () => {
      registerAdapter(fixtureAdapter);

      expect(listAdapters()).toEqual([fixtureAdapter]);
    });
  });

  describe("cross-module-instance sharing", () => {
    it("a second module instance observes adapters registered through the first", async () => {
      registerAdapter(fixtureAdapter);

      vi.resetModules();
      const reimported = await import("@/modules/providers/registry");

      expect(reimported.getAdapter("fixture")).toEqual(fixtureAdapter);
      expect(reimported.listAdapters()).toEqual([fixtureAdapter]);
    });
  });
});
