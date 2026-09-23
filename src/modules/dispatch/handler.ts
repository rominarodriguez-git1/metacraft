import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { logger } from "@/lib/logger";
import { getAdapter } from "@/modules/providers/registry";
import type { DispatchContext, DispatchResult } from "@/modules/providers/port";
import type {
  DispatchFailureReason,
  Department,
  Quote,
  QuoteRequestPayload,
  Timeline,
  Trade,
} from "@/modules/providers/types";
import { applyDispatchTransition, type RequestsDb } from "@/modules/requests/repository";

const FAILURE_REASONS: readonly DispatchFailureReason[] = [
  "TIMEOUT",
  "UPSTREAM_ERROR",
  "REJECTED",
  "INVALID_REQUEST",
];

function isDispatchFailureReason(value: unknown): value is DispatchFailureReason {
  return typeof value === "string" && (FAILURE_REASONS as readonly string[]).includes(value);
}

/**
 * Adapters signal a typed failure by throwing an error carrying a `reason`
 * field with one of the DispatchFailureReason values (duck-typed: the core
 * cannot import concrete adapter error classes across the boundary). Any
 * other thrown value, or one whose `reason` isn't recognized, maps to
 * UPSTREAM_ERROR.
 */
function extractFailureReason(error: unknown): DispatchFailureReason {
  if (
    error !== null &&
    typeof error === "object" &&
    "reason" in error &&
    isDispatchFailureReason((error as { reason: unknown }).reason)
  ) {
    return (error as { reason: DispatchFailureReason }).reason;
  }
  return "UPSTREAM_ERROR";
}

export interface ProcessDispatchDeps {
  reportResponse(dispatchId: string, quote: Quote): Promise<void>;
}

/**
 * Processes one pending dispatch: resolves its adapter, calls dispatch(),
 * and moves the row to sent/failed. A dispatch that is no longer pending
 * (already sent/failed/responded) is a no-op, so a queue-level job retry
 * after a prior success leaves state unchanged instead of re-dispatching to
 * the adapter.
 */
export async function processDispatchJob(
  db: RequestsDb,
  dispatchId: string,
  deps: ProcessDispatchDeps,
): Promise<void> {
  const [dispatchRow] = await db
    .select()
    .from(schema.dispatch)
    .where(eq(schema.dispatch.id, dispatchId))
    .limit(1);

  if (!dispatchRow) {
    logger.warn("dispatch job: unknown dispatch id", { dispatchId });
    return;
  }

  if (dispatchRow.status !== "pending") {
    return;
  }

  const [requestRow] = await db
    .select()
    .from(schema.request)
    .where(eq(schema.request.id, dispatchRow.requestId))
    .limit(1);

  if (!requestRow) {
    logger.error("dispatch job: request not found for dispatch", { dispatchId });
    return;
  }

  const adapter = getAdapter(dispatchRow.sourceId);
  if (!adapter) {
    logger.error("dispatch job: no adapter registered for source", {
      dispatchId,
      sourceId: dispatchRow.sourceId,
    });
    await applyDispatchTransition(db, dispatchId, "pending", "failed", {
      failureReason: "UPSTREAM_ERROR" satisfies DispatchFailureReason,
    });
    return;
  }

  const payload: QuoteRequestPayload = {
    trade: requestRow.trade as Trade,
    areaM2: requestRow.areaM2,
    department: requestRow.department as Department,
    zone: requestRow.zone,
    budgetMinUyu: requestRow.budgetMinUyu,
    budgetMaxUyu: requestRow.budgetMaxUyu,
    timeline: requestRow.timeline as Timeline,
    materialsIncluded: requestRow.materialsIncluded,
    description: requestRow.description,
    contactPhone: requestRow.contactPhone,
  };

  const ctx: DispatchContext & { dispatchId: string } = {
    dispatchId,
    reportResponse: deps.reportResponse,
  };

  try {
    const result: DispatchResult = await adapter.dispatch(payload, ctx);
    if (result.status === "sent") {
      await applyDispatchTransition(db, dispatchId, "pending", "sent");
    } else {
      await applyDispatchTransition(db, dispatchId, "pending", "failed", {
        failureReason: result.reason,
      });
    }
  } catch (error) {
    const reason = extractFailureReason(error);
    logger.error("dispatch job: adapter dispatch threw", {
      dispatchId,
      sourceId: dispatchRow.sourceId,
      reason,
      error,
    });
    await applyDispatchTransition(db, dispatchId, "pending", "failed", {
      failureReason: reason,
    });
  }
}
