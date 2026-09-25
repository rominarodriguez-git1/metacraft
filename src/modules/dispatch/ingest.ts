import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Quote } from "@/modules/providers/types";
import { applyDispatchTransition, type RequestsDb } from "@/modules/requests/repository";
import type { DispatchStatus } from "@/modules/requests/state-machine";

export class UnknownDispatchError extends Error {
  readonly dispatchId: string;

  constructor(dispatchId: string) {
    super(`Unknown dispatch id: ${dispatchId}`);
    this.name = "UnknownDispatchError";
    this.dispatchId = dispatchId;
  }
}

export class DispatchNotSentError extends Error {
  readonly dispatchId: string;
  readonly status: DispatchStatus;

  constructor(dispatchId: string, status: DispatchStatus) {
    super(`Dispatch ${dispatchId} is not in "sent" status (currently "${status}")`);
    this.name = "DispatchNotSentError";
    this.dispatchId = dispatchId;
    this.status = status;
  }
}

/**
 * Core-owned ingestion port every adapter calls to push a response. Moves a
 * `sent` dispatch to `responded` and stores the quote. Rejects an unknown
 * dispatch id or a dispatch not currently in `sent` (e.g. already
 * `responded`, still `pending`, or terminally `failed`).
 */
export async function reportResponse(db: RequestsDb, dispatchId: string, quote: Quote): Promise<void> {
  const [dispatchRow] = await db
    .select()
    .from(schema.dispatch)
    .where(eq(schema.dispatch.id, dispatchId))
    .limit(1);

  if (!dispatchRow) {
    throw new UnknownDispatchError(dispatchId);
  }

  const status = dispatchRow.status as DispatchStatus;
  if (status !== "sent") {
    throw new DispatchNotSentError(dispatchId, status);
  }

  const applied = await applyDispatchTransition(db, dispatchId, "sent", "responded", {
    quoteAmountUyu: quote.amountUyu,
    quoteMaterialsIncluded: quote.materialsIncluded,
    quoteMessage: quote.message,
  });

  if (!applied) {
    throw new DispatchNotSentError(dispatchId, status);
  }
}
