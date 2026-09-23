import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import messages from "../../messages/en.json";
import { ProviderCard } from "@/components/search/ProviderCard";
import type { Provider } from "@/modules/providers/types";

function makeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: "provider-1",
    sourceId: "casapro",
    name: "Casa Pro Renovations",
    trades: ["albanileria", "pintura"],
    zones: ["Centro", "Pocitos"],
    ratingAvg: 4.5,
    reviewCount: 32,
    isNew: false,
    verified: false,
    jobMinUyu: 10000,
    jobMaxUyu: 100000,
    earliestStartWeeks: 2,
    ...overrides,
  };
}

function renderCard(provider: Provider): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ul>
          <ProviderCard provider={provider} selected={false} onToggle={() => {}} />
        </ul>
      </NextIntlClientProvider>,
    );
  });

  return { container, root };
}

describe("ProviderCard", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    container?.remove();
  });

  it("shows name, translated trades/zones, rating, and both badges for a new and verified provider", () => {
    const provider = makeProvider({ isNew: true, verified: true });
    ({ container, root } = renderCard(provider));

    const text = container.textContent ?? "";
    expect(text).toContain("Casa Pro Renovations");
    expect(text).toContain("Masonry");
    expect(text).toContain("Painting");
    expect(text).toContain("Centro");
    expect(text).toContain("Pocitos");
    expect(text).toContain("4.5 (32 reviews)");
    expect(text).toContain("New");
    expect(text).toContain("Verified");
    expect(text).toContain("Source: casapro");

    expect(container.querySelector('[data-source-id="casapro"]')).not.toBeNull();
  });

  it("hides both badges for a provider that is neither new nor verified", () => {
    const provider = makeProvider({ isNew: false, verified: false });
    ({ container, root } = renderCard(provider));

    const text = container.textContent ?? "";
    expect(text).toContain("Casa Pro Renovations");
    expect(text).not.toContain("New");
    expect(text).not.toContain("Verified");
  });
});
