import { db } from "@/db/client";
import { requireSession } from "@/modules/auth/session";
import { findRequestForUser } from "@/modules/requests/repository";
import { serializeRequestWithDispatches } from "@/app/api/requests/serialize";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await requireSession({ api: true });
  if (session instanceof Response) {
    return session;
  }

  const { id } = await params;
  const found = await findRequestForUser(db, session.user.id, id);
  if (!found) {
    return jsonResponse({ error: "NotFound" }, 404);
  }

  return jsonResponse(serializeRequestWithDispatches(found), 200);
}
