import { afterEach, describe, expect, it } from "vitest";
import { clearAdapters, getAdapter, listAdapters, registerAdapter } from "@/modules/providers/registry";
import { fixtureAdapter } from "../fixtures/fixture-adapter";

describe("provider registry", () => {
  afterEach(() => {
    clearAdapters();
  });

  it("finds a registered adapter by sourceId after a single registry-line registration", () => {
    registerAdapter(fixtureAdapter);

    expect(getAdapter("fixture")).toBe(fixtureAdapter);
    expect(listAdapters()).toEqual([fixtureAdapter]);
  });

  it("returns undefined for an unregistered sourceId", () => {
    expect(getAdapter("unknown")).toBeUndefined();
  });

  it("rejects a second registration for the same sourceId", () => {
    registerAdapter(fixtureAdapter);

    expect(() => registerAdapter(fixtureAdapter)).toThrow(/already registered/i);
  });

  it("clearAdapters removes every registered adapter", () => {
    registerAdapter(fixtureAdapter);
    clearAdapters();

    expect(listAdapters()).toEqual([]);
  });
});
