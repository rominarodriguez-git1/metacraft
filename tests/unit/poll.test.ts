import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePollWhilePending } from "@/components/requests/usePollWhilePending";

interface Dispatch {
  status: "pending" | "sent" | "failed" | "responded";
}

interface Data {
  dispatches: Dispatch[];
}

function isNonTerminal(data: Data): boolean {
  return data.dispatches.some((dispatch) => dispatch.status === "pending" || dispatch.status === "sent");
}

interface HarnessProps {
  initialData: Data;
  fetchNext: () => Promise<Data>;
  onData: (data: Data) => void;
}

function Harness({ initialData, fetchNext, onData }: HarnessProps) {
  const data = usePollWhilePending<Data>({ initialData, isPending: isNonTerminal, fetchNext });
  onData(data);
  return null;
}

describe("usePollWhilePending", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it("polls at most every 5s while a dispatch is pending or sent, and stops once all are terminal", async () => {
    const initialData: Data = { dispatches: [{ status: "pending" }, { status: "sent" }] };
    const responses: Data[] = [
      { dispatches: [{ status: "sent" }, { status: "sent" }] },
      { dispatches: [{ status: "responded" }, { status: "failed" }] },
    ];
    const fetchNext = vi.fn(async () => responses.shift()!);
    let latest: Data = initialData;

    act(() => {
      root.render(
        createElement(Harness, {
          initialData,
          fetchNext,
          onData: (data) => {
            latest = data;
          },
        }),
      );
    });

    expect(fetchNext).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4999);
    });
    expect(fetchNext).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchNext).toHaveBeenCalledTimes(1);
    expect(latest.dispatches.every((dispatch) => dispatch.status === "sent")).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchNext).toHaveBeenCalledTimes(2);
    expect(latest.dispatches.map((dispatch) => dispatch.status)).toEqual(["responded", "failed"]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(fetchNext).toHaveBeenCalledTimes(2);
  });

  it("never polls when every dispatch already starts terminal", async () => {
    const initialData: Data = { dispatches: [{ status: "responded" }, { status: "failed" }] };
    const fetchNext = vi.fn(async () => initialData);

    act(() => {
      root.render(createElement(Harness, { initialData, fetchNext, onData: () => {} }));
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(fetchNext).not.toHaveBeenCalled();
  });
});
