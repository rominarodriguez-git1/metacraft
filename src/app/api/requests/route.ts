import { db } from "@/db/client";
import { requireSession } from "@/modules/auth/session";
import { submitQuoteRequest } from "@/modules/requests/submit";
import { serializeRequestWithDispatches } from "@/app/api/requests/serialize";
import { pgBossDispatchQueue } from "@/modules/dispatch/pgboss-queue";
import type { DispatchQueue } from "@/modules/dispatch/queue-port";

const IDEMPOTENCY_KEY_HEADER = "idempotency-key";
// The form generates the key with crypto.randomUUID(), so anything else,
// including an arbitrarily long header, is rejected before it is stored.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Composition point for the DispatchQueue dependency: production wires the
 * real pg-boss queue via the default export below, while tests call this
 * factory with a recording fake so the requests suites never touch pg-boss.
 */
export function createRequestsPostHandler(dispatchQueue: DispatchQueue) {
  return async function POST(request: Request): Promise<Response> {
    const session = await requireSession({ api: true });
    if (session instanceof Response) {
      return session;
    }

    const idempotencyKey = request.headers.get(IDEMPOTENCY_KEY_HEADER);
    if (!idempotencyKey) {
      return jsonResponse({ error: "MissingIdempotencyKey" }, 400);
    }
    if (!UUID_PATTERN.test(idempotencyKey)) {
      return jsonResponse({ error: "InvalidIdempotencyKey" }, 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "InvalidJson" }, 400);
    }

    const result = await submitQuoteRequest(
      db,
      {
        userId: session.user.id,
        idempotencyKey,
        body,
      },
      { dispatchQueue },
    );

    switch (result.outcome) {
      case "invalid":
        return jsonResponse({ error: "ValidationError", fieldErrors: result.fieldErrors }, 422);
      case "conflict":
        return jsonResponse({ error: "IdempotencyKeyConflict" }, 409);
      case "duplicate":
        return jsonResponse(serializeRequestWithDispatches(result.data), 200);
      case "created":
        return jsonResponse(serializeRequestWithDispatches(result.data), 201);
    }
  };
}

export const POST = createRequestsPostHandler(pgBossDispatchQueue);
