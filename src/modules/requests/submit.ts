import type { DispatchQueue } from "@/modules/dispatch/queue-port";
import { listAdapters } from "@/modules/providers/registry";
import type { Provider, SearchCriteria } from "@/modules/providers/types";
import {
  insertRequestWithDispatches,
  findRequestByIdempotencyKey,
  type RequestsDb,
  type RequestWithDispatches,
} from "@/modules/requests/repository";
import { hashQuoteRequest, validateQuoteRequest, type FieldErrors } from "@/modules/requests/schema";

export interface SubmitQuoteRequestInput {
  userId: string;
  idempotencyKey: string;
  body: unknown;
}

export interface SubmitQuoteRequestDeps {
  dispatchQueue: DispatchQueue;
  searchProviders?: (criteria: SearchCriteria) => Promise<Provider[]>;
}

export type SubmitQuoteRequestResult =
  | { outcome: "invalid"; fieldErrors: FieldErrors }
  | { outcome: "created"; data: RequestWithDispatches }
  | { outcome: "duplicate"; data: RequestWithDispatches }
  | { outcome: "conflict" };

const IDEMPOTENCY_UNIQUE_CONSTRAINT = "request_user_id_idempotency_key_unique";

/**
 * True when `error` is Postgres' unique violation (23505) on the idempotency
 * constraint. Drizzle may wrap the driver error, so the cause chain is walked.
 */
function isIdempotencyKeyViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    const candidate = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (candidate.code === "23505" && candidate.constraint === IDEMPOTENCY_UNIQUE_CONSTRAINT) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
}

async function resolveExisting(
  db: RequestsDb,
  input: SubmitQuoteRequestInput,
  payloadHash: string,
): Promise<SubmitQuoteRequestResult | null> {
  const existing = await findRequestByIdempotencyKey(db, input.userId, input.idempotencyKey);
  if (!existing) {
    return null;
  }
  return existing.request.payloadHash === payloadHash
    ? { outcome: "duplicate", data: existing }
    : { outcome: "conflict" };
}

async function defaultSearchProviders(criteria: SearchCriteria): Promise<Provider[]> {
  const perAdapter = await Promise.all(listAdapters().map((adapter) => adapter.search(criteria)));
  return perAdapter.flat();
}

/**
 * Validates, then resolves the idempotency key before touching the
 * repository at all: an invalid payload never reaches the data layer, and a
 * replayed (key, hash) pair short-circuits to the previously persisted row
 * instead of inserting again.
 */
export async function submitQuoteRequest(
  db: RequestsDb,
  input: SubmitQuoteRequestInput,
  deps: SubmitQuoteRequestDeps,
): Promise<SubmitQuoteRequestResult> {
  const validation = validateQuoteRequest(input.body);
  if (!validation.success) {
    return { outcome: "invalid", fieldErrors: validation.fieldErrors };
  }

  const data = validation.data;
  const payloadHash = hashQuoteRequest(data);

  const earlier = await resolveExisting(db, input, payloadHash);
  if (earlier) {
    return earlier;
  }

  const searchProviders = deps.searchProviders ?? defaultSearchProviders;
  const matchingProviders = await searchProviders({
    trade: data.trade,
    zone: data.zone,
    budgetMinUyu: data.budgetMinUyu,
    budgetMaxUyu: data.budgetMaxUyu,
    timeline: data.timeline,
  });

  const sourceIdByProviderId = new Map(matchingProviders.map((provider) => [provider.id, provider.sourceId]));
  const unknownProviderIds = data.providerIds.filter((id) => !sourceIdByProviderId.has(id));
  if (unknownProviderIds.length > 0) {
    return {
      outcome: "invalid",
      fieldErrors: { providerIds: [`Unknown provider id(s): ${unknownProviderIds.join(", ")}`] },
    };
  }

  const dispatchSourceIds: Record<string, string> = {};
  for (const id of data.providerIds) {
    dispatchSourceIds[id] = sourceIdByProviderId.get(id)!;
  }

  // The lookup above is only a fast path: two concurrent submits with the same
  // key can both miss it. The unique constraint is the real guard, so a
  // violation here resolves to the same duplicate/conflict outcome.
  let created: RequestWithDispatches;
  try {
    created = await insertRequestWithDispatches(db, {
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
      payloadHash,
      trade: data.trade,
      areaM2: data.areaM2,
      department: data.department,
      zone: data.zone,
      budgetMinUyu: data.budgetMinUyu,
      budgetMaxUyu: data.budgetMaxUyu,
      timeline: data.timeline,
      materialsIncluded: data.materialsIncluded,
      description: data.description,
      contactPhone: data.contactPhone,
      providerIds: data.providerIds,
      dispatchSourceIds,
    });
  } catch (error) {
    if (isIdempotencyKeyViolation(error)) {
      const raced = await resolveExisting(db, input, payloadHash);
      if (raced) {
        return raced;
      }
    }
    throw error;
  }

  await Promise.all(created.dispatches.map((dispatch) => deps.dispatchQueue.enqueueDispatch(dispatch.id)));

  return { outcome: "created", data: created };
}
