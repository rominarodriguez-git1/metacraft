import { describe, expect, it } from "vitest";
import {
  loadSimAdapterConfigs,
  parseSimAdapterConfig,
  resolveSimAdapterConfigs,
} from "@/modules/providers/sim-config";

interface TestConfig {
  seed: number;
  latencyMsRange: { min: number; max: number };
  responseDelayMsRange: { min: number; max: number };
  failureRate: number;
  responseRate: number;
}

const DEFAULTS: Record<"obrafacil" | "reformasya" | "casapro", TestConfig> = {
  obrafacil: {
    seed: 1001,
    latencyMsRange: { min: 200, max: 800 },
    responseDelayMsRange: { min: 1000, max: 5000 },
    failureRate: 0.1,
    responseRate: 0.85,
  },
  reformasya: {
    seed: 2002,
    latencyMsRange: { min: 300, max: 1200 },
    responseDelayMsRange: { min: 2000, max: 8000 },
    failureRate: 0.15,
    responseRate: 0.75,
  },
  casapro: {
    seed: 3003,
    latencyMsRange: { min: 150, max: 600 },
    responseDelayMsRange: { min: 1500, max: 6000 },
    failureRate: 0.05,
    responseRate: 0.9,
  },
};

describe("sim-config", () => {
  describe("resolveSimAdapterConfigs", () => {
    it("returns each source's default config when there are no overrides", () => {
      const resolved = resolveSimAdapterConfigs(DEFAULTS);

      expect(resolved.obrafacil).toEqual(DEFAULTS.obrafacil);
      expect(resolved.reformasya).toEqual(DEFAULTS.reformasya);
      expect(resolved.casapro).toEqual(DEFAULTS.casapro);
    });

    it("merges a partial override over a single source's default config", () => {
      const resolved = resolveSimAdapterConfigs(DEFAULTS, {
        obrafacil: { failureRate: 0.5 },
      });

      expect(resolved.obrafacil).toEqual({ ...DEFAULTS.obrafacil, failureRate: 0.5 });
      expect(resolved.reformasya).toEqual(DEFAULTS.reformasya);
      expect(resolved.casapro).toEqual(DEFAULTS.casapro);
    });

    it("merges range overrides for multiple sources independently", () => {
      const resolved = resolveSimAdapterConfigs(DEFAULTS, {
        reformasya: { latencyMsRange: { min: 10, max: 20 } },
        casapro: { responseDelayMsRange: { min: 100, max: 200 }, seed: 42 },
      });

      expect(resolved.reformasya).toEqual({
        ...DEFAULTS.reformasya,
        latencyMsRange: { min: 10, max: 20 },
      });
      expect(resolved.casapro).toEqual({
        ...DEFAULTS.casapro,
        responseDelayMsRange: { min: 100, max: 200 },
        seed: 42,
      });
      expect(resolved.obrafacil).toEqual(DEFAULTS.obrafacil);
    });
  });

  describe("parseSimAdapterConfig", () => {
    it("parses a valid JSON override object", () => {
      const overrides = parseSimAdapterConfig(
        JSON.stringify({ obrafacil: { failureRate: 0.2, responseRate: 0.9 } }),
      );

      expect(overrides).toEqual({ obrafacil: { failureRate: 0.2, responseRate: 0.9 } });
    });

    it("throws on invalid JSON", () => {
      expect(() => parseSimAdapterConfig("{not json")).toThrow();
    });

    it("rejects an unknown source id", () => {
      expect(() => parseSimAdapterConfig(JSON.stringify({ unknownsource: {} }))).toThrow();
    });

    it("rejects a failureRate outside 0..1", () => {
      expect(() =>
        parseSimAdapterConfig(JSON.stringify({ obrafacil: { failureRate: 1.5 } })),
      ).toThrow();
      expect(() =>
        parseSimAdapterConfig(JSON.stringify({ obrafacil: { failureRate: -0.1 } })),
      ).toThrow();
    });

    it("rejects a responseRate outside 0..1", () => {
      expect(() =>
        parseSimAdapterConfig(JSON.stringify({ casapro: { responseRate: 2 } })),
      ).toThrow();
    });

    it("rejects a range where min > max", () => {
      expect(() =>
        parseSimAdapterConfig(
          JSON.stringify({ reformasya: { latencyMsRange: { min: 500, max: 100 } } }),
        ),
      ).toThrow();
    });

    it("rejects a non-integer millisecond range value", () => {
      expect(() =>
        parseSimAdapterConfig(
          JSON.stringify({ reformasya: { latencyMsRange: { min: 1.5, max: 100 } } }),
        ),
      ).toThrow();
    });

    it("rejects a negative millisecond range value", () => {
      expect(() =>
        parseSimAdapterConfig(
          JSON.stringify({ reformasya: { responseDelayMsRange: { min: -1, max: 100 } } }),
        ),
      ).toThrow();
    });

    it("rejects an unknown key inside a source override", () => {
      expect(() =>
        parseSimAdapterConfig(JSON.stringify({ obrafacil: { bogusKey: true } })),
      ).toThrow();
    });
  });

  describe("loadSimAdapterConfigs", () => {
    it("returns defaults when SIM_ADAPTER_CONFIG is unset", () => {
      const resolved = loadSimAdapterConfigs(DEFAULTS, {});

      expect(resolved).toEqual(resolveSimAdapterConfigs(DEFAULTS));
    });

    it("returns defaults when SIM_ADAPTER_CONFIG is an empty string", () => {
      const resolved = loadSimAdapterConfigs(DEFAULTS, { SIM_ADAPTER_CONFIG: "" });

      expect(resolved).toEqual(resolveSimAdapterConfigs(DEFAULTS));
    });

    it("merges overrides parsed from SIM_ADAPTER_CONFIG", () => {
      const resolved = loadSimAdapterConfigs(DEFAULTS, {
        SIM_ADAPTER_CONFIG: JSON.stringify({ casapro: { failureRate: 0.33 } }),
      });

      expect(resolved.casapro).toEqual({ ...DEFAULTS.casapro, failureRate: 0.33 });
      expect(resolved.obrafacil).toEqual(DEFAULTS.obrafacil);
    });

    it("throws when SIM_ADAPTER_CONFIG is invalid", () => {
      expect(() => loadSimAdapterConfigs(DEFAULTS, { SIM_ADAPTER_CONFIG: "{not json" })).toThrow();
    });
  });
});
