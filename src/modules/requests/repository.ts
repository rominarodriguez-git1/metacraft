import { and, asc, eq, lt, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";
import type { DispatchStatus } from "@/modules/requests/state-machine";

export type RequestsDb = NodePgDatabase<typeof schema>;

export interface DispatchRow {
  id: string;
  requestId: string;
  providerId: string;
  sourceId: string;
  status: DispatchStatus;
  failureReason: string | null;
  quoteAmountUyu: number | null;
  quoteMaterialsIncluded: boolean | null;
  quoteMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RequestRow {
  id: string;
  userId: string;
  trade: string;
  areaM2: number;
  department: string;
  zone: string;
  budgetMinUyu: number;
  budgetMaxUyu: number;
  timeline: string;
  materialsIncluded: boolean;
  description: string;
  contactPhone: string;
  providerIds: string[];
  idempotencyKey: string;
  payloadHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RequestWithDispatches {
  request: RequestRow;
  dispatches: DispatchRow[];
}

export interface InsertRequestInput {
  userId: string;
  idempotencyKey: string;
  payloadHash: string;
  trade: string;
  areaM2: number;
  department: string;
  zone: string;
  budgetMinUyu: number;
  budgetMaxUyu: number;
  timeline: string;
  materialsIncluded: boolean;
  description: string;
  contactPhone: string;
  providerIds: string[];
  dispatchSourceIds: Record<string, string>;
}

function toDispatchRow(row: typeof schema.dispatch.$inferSelect): DispatchRow {
  return {
    id: row.id,
    requestId: row.requestId,
    providerId: row.providerId,
    sourceId: row.sourceId,
    status: row.status as DispatchStatus,
    failureReason: row.failureReason,
    quoteAmountUyu: row.quoteAmountUyu,
    quoteMaterialsIncluded: row.quoteMaterialsIncluded,
    quoteMessage: row.quoteMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toRequestRow(row: typeof schema.request.$inferSelect): RequestRow {
  return {
    id: row.id,
    userId: row.userId,
    trade: row.trade,
    areaM2: row.areaM2,
    department: row.department,
    zone: row.zone,
    budgetMinUyu: row.budgetMinUyu,
    budgetMaxUyu: row.budgetMaxUyu,
    timeline: row.timeline,
    materialsIncluded: row.materialsIncluded,
    description: row.description,
    contactPhone: row.contactPhone,
    providerIds: row.providerIds,
    idempotencyKey: row.idempotencyKey,
    payloadHash: row.payloadHash,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Inserts the request and one pending dispatch per provider in a single
 * transaction, so a submit either fully lands or leaves no trace.
 */
export async function insertRequestWithDispatches(
  db: RequestsDb,
  input: InsertRequestInput,
): Promise<RequestWithDispatches> {
  return db.transaction(async (tx) => {
    const [requestRow] = await tx
      .insert(schema.request)
      .values({
        userId: input.userId,
        trade: input.trade,
        areaM2: input.areaM2,
        department: input.department,
        zone: input.zone,
        budgetMinUyu: input.budgetMinUyu,
        budgetMaxUyu: input.budgetMaxUyu,
        timeline: input.timeline,
        materialsIncluded: input.materialsIncluded,
        description: input.description,
        contactPhone: input.contactPhone,
        providerIds: input.providerIds,
        idempotencyKey: input.idempotencyKey,
        payloadHash: input.payloadHash,
      })
      .returning();

    if (!requestRow) {
      throw new Error("insert into request returned no row");
    }

    const dispatchRows = await tx
      .insert(schema.dispatch)
      .values(
        input.providerIds.map((providerId) => ({
          requestId: requestRow.id,
          providerId,
          sourceId: input.dispatchSourceIds[providerId] ?? "",
          status: "pending" as const,
        })),
      )
      .returning();

    return {
      request: toRequestRow(requestRow),
      dispatches: dispatchRows.map(toDispatchRow),
    };
  });
}

export async function findRequestByIdempotencyKey(
  db: RequestsDb,
  userId: string,
  idempotencyKey: string,
): Promise<RequestWithDispatches | null> {
  const [requestRow] = await db
    .select()
    .from(schema.request)
    .where(and(eq(schema.request.userId, userId), eq(schema.request.idempotencyKey, idempotencyKey)))
    .limit(1);

  if (!requestRow) {
    return null;
  }

  const dispatchRows = await db.select().from(schema.dispatch).where(eq(schema.dispatch.requestId, requestRow.id));

  return {
    request: toRequestRow(requestRow),
    dispatches: dispatchRows.map(toDispatchRow),
  };
}

export async function findRequestForUser(
  db: RequestsDb,
  userId: string,
  requestId: string,
): Promise<RequestWithDispatches | null> {
  const [requestRow] = await db
    .select()
    .from(schema.request)
    .where(and(eq(schema.request.id, requestId), eq(schema.request.userId, userId)))
    .limit(1);

  if (!requestRow) {
    return null;
  }

  const dispatchRows = await db.select().from(schema.dispatch).where(eq(schema.dispatch.requestId, requestRow.id));

  return {
    request: toRequestRow(requestRow),
    dispatches: dispatchRows.map(toDispatchRow),
  };
}

export interface TransitionDispatchPatch {
  failureReason?: string | null;
  quoteAmountUyu?: number | null;
  quoteMaterialsIncluded?: boolean | null;
  quoteMessage?: string | null;
}

/**
 * Conditional update (`WHERE id = ... AND status = from`) so a duplicate
 * transition attempt affects zero rows instead of double-writing.
 */
export async function applyDispatchTransition(
  db: RequestsDb,
  dispatchId: string,
  from: DispatchStatus,
  to: DispatchStatus,
  patch: TransitionDispatchPatch = {},
): Promise<boolean> {
  const result = await db
    .update(schema.dispatch)
    .set({ status: to, updatedAt: sql`now()`, ...patch })
    .where(and(eq(schema.dispatch.id, dispatchId), eq(schema.dispatch.status, from)))
    .returning({ id: schema.dispatch.id });

  return result.length > 0;
}

/**
 * Ids of dispatches still `pending` that were created before `createdBefore`,
 * oldest first. These are rows whose queue job was never created or was lost.
 */
export async function findStalePendingDispatchIds(
  db: RequestsDb,
  createdBefore: Date,
  limit = 100,
): Promise<string[]> {
  const rows = await db
    .select({ id: schema.dispatch.id })
    .from(schema.dispatch)
    .where(and(eq(schema.dispatch.status, "pending"), lt(schema.dispatch.createdAt, createdBefore)))
    .orderBy(asc(schema.dispatch.createdAt))
    .limit(limit);
  return rows.map((row) => row.id);
}
