import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import { QuoteForm, type QuoteFormProvider, type QuoteFormPrefill } from "@/components/requests/QuoteForm";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const PROVIDERS: QuoteFormProvider[] = [
  { providerId: "casapro-1", sourceId: "casapro", name: "Casa Pro Uno" },
  { providerId: "obrafacil-2", sourceId: "obrafacil", name: "Obra Facil Dos" },
];

const PREFILL: QuoteFormPrefill = {
  trade: "albanileria",
  department: "Montevideo",
  zone: "Centro",
  budgetMinUyu: 10000,
  budgetMaxUyu: 50000,
  timeline: "flexible",
};

function fireInput(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  const prototype = Object.getPrototypeOf(element);
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function renderForm(strict: boolean): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const tree = (
    <NextIntlClientProvider locale="en" messages={messages}>
      <QuoteForm providers={PROVIDERS} prefill={PREFILL} />
    </NextIntlClientProvider>
  );

  act(() => {
    root.render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  });

  return { container, root };
}

function fillRequiredFields(container: HTMLDivElement): void {
  const area = container.querySelector('input[type="number"]') as HTMLInputElement;
  fireInput(area, "80");
  const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
  fireInput(textarea, "Renovar cocina completa");
  const phone = container.querySelector('input[type="tel"]') as HTMLInputElement;
  fireInput(phone, "+598 99 123 456");
}

async function submitForm(container: HTMLDivElement): Promise<void> {
  const form = container.querySelector("form") as HTMLFormElement;
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("QuoteForm", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    pushMock.mockClear();
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    container?.remove();
    vi.unstubAllGlobals();
  });

  it("lists the selected providers with name and source, and lets the user remove one", () => {
    ({ container, root } = renderForm(false));

    const text = container.textContent ?? "";
    expect(text).toContain("Casa Pro Uno");
    expect(text).toContain("Source: casapro");
    expect(text).toContain("Obra Facil Dos");
    expect(text).toContain("Source: obrafacil");

    const items = container.querySelectorAll("li[data-source-id]");
    expect(items).toHaveLength(2);

    const removeButtons = container.querySelectorAll("li[data-source-id] button");
    act(() => {
      (removeButtons[0] as HTMLButtonElement).click();
    });

    expect(container.querySelectorAll("li[data-source-id]")).toHaveLength(1);
    expect(container.textContent ?? "").not.toContain("Casa Pro Uno");
  });

  it("prefills trade, zone, budget and timeline from the search filters", () => {
    ({ container, root } = renderForm(false));

    const selects = container.querySelectorAll("select");
    const tradeSelect = selects[0] as HTMLSelectElement;
    const zoneSelect = selects[2] as HTMLSelectElement;
    const timelineSelect = selects[3] as HTMLSelectElement;
    const numberInputs = container.querySelectorAll('input[type="number"]');

    expect(tradeSelect.value).toBe("albanileria");
    expect(zoneSelect.value).toBe("Centro");
    expect(timelineSelect.value).toBe("flexible");
    expect((numberInputs[1] as HTMLInputElement).value).toBe("10000");
    expect((numberInputs[2] as HTMLInputElement).value).toBe("50000");
  });

  it("blocks submit client-side outside 2-5 providers", async () => {
    ({ container, root } = renderForm(false));
    fillRequiredFields(container);

    const removeButtons = container.querySelectorAll("li[data-source-id] button");
    act(() => {
      (removeButtons[0] as HTMLButtonElement).click();
    });
    act(() => {
      (container.querySelectorAll("li[data-source-id] button")[0] as HTMLButtonElement).click();
    });

    expect(container.querySelectorAll("li[data-source-id]")).toHaveLength(0);

    const submitButton = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await submitForm(container);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to the requests API, shows server field errors inline, and navigates to the new request's detail view on success", async () => {
    ({ container, root } = renderForm(false));
    fillRequiredFields(container);

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: "ValidationError", fieldErrors: { contactPhone: ["Contact phone is required"] } }), {
        status: 422,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await submitForm(container);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.textContent ?? "").toContain("Contact phone is required");
    expect(pushMock).not.toHaveBeenCalled();

    fetchMock.mockImplementation(async () =>
      new Response(JSON.stringify({ id: "request-123" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );

    await submitForm(container);

    expect(pushMock).toHaveBeenCalledWith("/requests/request-123");
  });

  it("holds the idempotency key across a StrictMode remount and reuses it on resubmit", async () => {
    ({ container, root } = renderForm(true));
    fillRequiredFields(container);

    const capturedKeys: (string | null)[] = [];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      capturedKeys.push(headers.get("idempotency-key"));
      return new Response(JSON.stringify({ id: "request-123" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await submitForm(container);
    await submitForm(container);

    expect(capturedKeys).toHaveLength(2);
    expect(capturedKeys[0]).toBeTruthy();
    expect(capturedKeys[0]).toBe(capturedKeys[1]);
  });
});
