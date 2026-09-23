import { db } from "@/db/client";
import { requireSession } from "@/modules/auth/session";
import { submitQuoteRequest } from "@/modules/requests/submit";
import { serializeRequestWithDispatches } from "@/app/api/requests/serialize";

const IDEMPOTENCY_KEY_HEADER = "idempotency-key";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(request: Request): Promise<Response> {
  const session = await requireSession({ api: true });
  if (session instanceof Response) {
    return session;
  }

  const idempotencyKey = request.headers.get(IDEMPOTENCY_KEY_HEADER);
  if (!idempotencyKey) {
    return jsonResponse({ error: "MissingIdempotencyKey" }, 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "InvalidJson" }, 400);
  }

  const result = await submitQuoteRequest(db, {
    userId: session.user.id,
    idempotencyKey,
    body,
  });

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
}
