import { describe, expect, it } from "vitest";
import {
  assertValidDispatchTransition,
  canTransitionDispatch,
  DISPATCH_STATUSES,
  InvalidDispatchTransitionError,
  transitionDispatch,
  type DispatchStatus,
} from "@/modules/requests/state-machine";

const ALLOWED_PAIRS = new Set<string>(["pending->sent", "pending->failed", "sent->responded"]);

describe("dispatch state machine", () => {
  it.each(
    DISPATCH_STATUSES.flatMap((from) => DISPATCH_STATUSES.map((to) => [from, to] as [DispatchStatus, DispatchStatus])),
  )("transition %s -> %s", (from, to) => {
    const allowed = ALLOWED_PAIRS.has(`${from}->${to}`);
    expect(canTransitionDispatch(from, to)).toBe(allowed);

    if (allowed) {
      expect(() => assertValidDispatchTransition(from, to)).not.toThrow();
    } else {
      expect(() => assertValidDispatchTransition(from, to)).toThrow(InvalidDispatchTransitionError);
    }
  });

  it("allows pending -> sent", () => {
    expect(canTransitionDispatch("pending", "sent")).toBe(true);
  });

  it("allows pending -> failed", () => {
    expect(canTransitionDispatch("pending", "failed")).toBe(true);
  });

  it("allows sent -> responded", () => {
    expect(canTransitionDispatch("sent", "responded")).toBe(true);
  });

  it("rejects failed -> responded", () => {
    expect(() => assertValidDispatchTransition("failed", "responded")).toThrow(InvalidDispatchTransitionError);
  });

  it("rejects pending -> responded", () => {
    expect(() => assertValidDispatchTransition("pending", "responded")).toThrow(InvalidDispatchTransitionError);
  });

  describe("transitionDispatch", () => {
    it("delegates to a conditional-update executor after validating the transition", async () => {
      let calls = 0;
      const result = await transitionDispatch("pending", "sent", async ({ from, to }) => {
        calls += 1;
        expect(from).toBe("pending");
        expect(to).toBe("sent");
        return true;
      });

      expect(calls).toBe(1);
      expect(result.applied).toBe(true);
    });

    it("throws before calling the executor for an illegal transition", async () => {
      let calls = 0;
      await expect(
        transitionDispatch("failed", "responded", async () => {
          calls += 1;
          return true;
        }),
      ).rejects.toThrow(InvalidDispatchTransitionError);

      expect(calls).toBe(0);
    });

    it("treats a duplicate transition (executor reports no row matched) as a no-op, not a double write", async () => {
      const result = await transitionDispatch("pending", "sent", async () => false);
      expect(result.applied).toBe(false);
    });
  });
});
