export type DispatchStatus = "pending" | "sent" | "failed" | "responded";

export const DISPATCH_STATUSES: readonly DispatchStatus[] = ["pending", "sent", "failed", "responded"];

const ALLOWED_TRANSITIONS: Record<DispatchStatus, readonly DispatchStatus[]> = {
  pending: ["sent", "failed"],
  sent: ["responded"],
  failed: [],
  responded: [],
};

export class InvalidDispatchTransitionError extends Error {
  readonly from: DispatchStatus;
  readonly to: DispatchStatus;

  constructor(from: DispatchStatus, to: DispatchStatus) {
    super(`Illegal dispatch transition: ${from} -> ${to}`);
    this.name = "InvalidDispatchTransitionError";
    this.from = from;
    this.to = to;
  }
}

export function canTransitionDispatch(from: DispatchStatus, to: DispatchStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertValidDispatchTransition(from: DispatchStatus, to: DispatchStatus): void {
  if (!canTransitionDispatch(from, to)) {
    throw new InvalidDispatchTransitionError(from, to);
  }
}

/**
 * Result of a conditional-update executor: whether the row was found with
 * `from` as its current status at write time. `false` means either the row
 * doesn't exist or another writer already moved it (e.g. a duplicate
 * transition attempt that had already been applied), and the caller should
 * treat it as a no-op rather than a double write.
 */
export type ConditionalUpdateExecutor = (params: {
  from: DispatchStatus;
  to: DispatchStatus;
}) => Promise<boolean>;

export interface TransitionDispatchResult {
  applied: boolean;
}

/**
 * Validates the transition against the state machine, then delegates the
 * actual write to `executor`, which must perform a conditional update
 * (`WHERE status = from`) so a duplicate transition attempt is a no-op
 * instead of a double write.
 */
export async function transitionDispatch(
  from: DispatchStatus,
  to: DispatchStatus,
  executor: ConditionalUpdateExecutor,
): Promise<TransitionDispatchResult> {
  assertValidDispatchTransition(from, to);
  const applied = await executor({ from, to });
  return { applied };
}
