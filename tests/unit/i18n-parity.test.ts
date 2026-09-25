import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import es from "../../messages/es.json";

type MessageTree = { [key: string]: string | MessageTree };

function collectKeys(node: MessageTree, prefix = ""): string[] {
  return Object.entries(node).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      return [path];
    }
    return collectKeys(value, path);
  });
}

function diffKeySets(a: MessageTree, b: MessageTree): { missingFromA: string[]; missingFromB: string[] } {
  const keysA = new Set(collectKeys(a));
  const keysB = new Set(collectKeys(b));
  return {
    missingFromA: [...keysB].filter((key) => !keysA.has(key)).sort(),
    missingFromB: [...keysA].filter((key) => !keysB.has(key)).sort(),
  };
}

describe("i18n message parity", () => {
  it("es.json and en.json declare the exact same set of keys", () => {
    const { missingFromA, missingFromB } = diffKeySets(es, en);

    expect(missingFromB, `keys missing from messages/en.json: ${missingFromB.join(", ")}`).toEqual([]);
    expect(missingFromA, `keys missing from messages/es.json: ${missingFromA.join(", ")}`).toEqual([]);
  });

  it("names each key missing from either side when a fixture drops a key", () => {
    const base: MessageTree = { home: { title: "a", description: "b" }, nav: { label: "c" } };
    const missingDescription: MessageTree = { home: { title: "a" }, nav: { label: "c" } };

    const { missingFromA, missingFromB } = diffKeySets(base, missingDescription);

    expect(missingFromB).toEqual(["home.description"]);
    expect(missingFromA).toEqual([]);
  });
});
