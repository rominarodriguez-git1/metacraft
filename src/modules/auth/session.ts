import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/modules/auth/auth";

export type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

const UNAUTHORIZED_BODY = JSON.stringify({ error: "Unauthorized" });

export async function getSession(): Promise<Session | null> {
  return auth.api.getSession({ headers: await headers() });
}

/**
 * Server components and server actions: redirects to sign-in when there is
 * no session, so the call site can destructure the result directly.
 */
export async function requireSession(): Promise<Session>;
/**
 * Route handlers: returns a 401 Response instead of redirecting, since a
 * route handler must return a Response rather than throw a Next.js redirect.
 * Callers check `result instanceof Response` before using the session.
 */
export async function requireSession(options: { api: true }): Promise<Session | Response>;
export async function requireSession(options?: { api?: boolean }): Promise<Session | Response> {
  const session = await getSession();
  if (session) {
    return session;
  }

  if (options?.api) {
    return new Response(UNAUTHORIZED_BODY, {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  redirect("/sign-in");
}
