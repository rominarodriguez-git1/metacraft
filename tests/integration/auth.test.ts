import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "../helpers/db";
import { createAuth } from "@/modules/auth/auth";
import * as schema from "@/db/schema";

interface SentLink {
  email: string;
  url: string;
  token: string;
  locale: string;
}

const REQUEST_IP = "203.0.113.10";

describe("magic-link auth", () => {
  let testDb: TestDatabase;
  let sentLinks: SentLink[];
  let auth: ReturnType<typeof createAuth>;

  beforeAll(async () => {
    testDb = await createTestDatabase();
  });

  afterAll(async () => {
    await testDb.close();
  });

  beforeEach(() => {
    sentLinks = [];
    auth = createAuth({
      db: testDb.db,
      mailer: {
        async sendMagicLink({ to, url, locale }) {
          const token = new URL(url).searchParams.get("token");
          if (!token) {
            throw new Error("magic link url missing token");
          }
          sentLinks.push({ email: to, url, token, locale });
        },
      },
    });
  });

  afterEach(async () => {
    await testDb.truncateAll();
    vi.useRealTimers();
  });

  async function requestMagicLink(email: string): Promise<SentLink> {
    await auth.api.signInMagicLink({
      body: { email },
      headers: new Headers({ "x-forwarded-for": REQUEST_IP }),
    });
    const last = sentLinks.at(-1);
    if (!last) {
      throw new Error("no magic link was sent");
    }
    return last;
  }

  function verify(token: string) {
    return auth.api.magicLinkVerify({
      query: { token },
      headers: new Headers(),
    });
  }

  // The sign-in email follows the UI language cookie on the request that asks
  // for the link, sent through the real HTTP handler (plan email-i18n AC3).
  it.each([
    ["NEXT_LOCALE=en", "en"],
    ["NEXT_LOCALE=es", "es"],
    [null, "es"],
    ["NEXT_LOCALE=fr", "es"],
    ["theme=dark; NEXT_LOCALE=en", "en"],
  ])("cookie %s sends the email in %s", async (cookie, expected) => {
    const email = `locale-${randomUUID()}@example.com`;
    const baseURL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const headers = new Headers({
      "content-type": "application/json",
      origin: baseURL,
      "x-forwarded-for": REQUEST_IP,
    });
    if (cookie) {
      headers.set("cookie", cookie);
    }

    const response = await auth.handler(
      new Request(`${baseURL}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers,
        body: JSON.stringify({ email }),
      }),
    );

    expect(response.status).toBe(200);
    expect(sentLinks.at(-1)).toMatchObject({ email, locale: expected });
  });

  it("signs in a brand-new user (open sign-up) via the magic link", async () => {
    const { token } = await requestMagicLink("new-user@example.com");

    const result = await verify(token);

    expect(result.user.email).toBe("new-user@example.com");
    expect(result.session.userId).toBe(result.user.id);
  });

  it("never stores the plaintext token in the verification table", async () => {
    const { token } = await requestMagicLink("stored-token@example.com");

    const rows = await testDb.db.select().from(schema.verification);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.identifier).not.toBe(token);
    expect(rows[0]?.value).not.toContain(token);
  });

  it("rejects a second use of the same link", async () => {
    const { token } = await requestMagicLink("reuse@example.com");

    await verify(token);

    await expect(verify(token)).rejects.toThrow();
  });

  it("rejects a token used after 15 minutes", async () => {
    const { token } = await requestMagicLink("expired@example.com");

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 16 * 60 * 1000);

    await expect(verify(token)).rejects.toThrow();
  });

  it("rejects a tampered token", async () => {
    const { token } = await requestMagicLink("tampered@example.com");
    const tampered = `${token.slice(0, -1)}${token.at(-1) === "a" ? "b" : "a"}`;

    await expect(verify(tampered)).rejects.toThrow();
  });

  it("mints exactly one session when two verify requests race for the same token", async () => {
    const { token } = await requestMagicLink("concurrent@example.com");

    const results = await Promise.allSettled([verify(token), verify(token)]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");

    expect(fulfilled).toHaveLength(1);

    const userId = (fulfilled[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof verify>>>).value.user.id;
    const sessions = await testDb.db.select().from(schema.session).where(eq(schema.session.userId, userId));

    expect(sessions).toHaveLength(1);
  });

  it("promotes a pre-existing unverified user and revokes its password credential", async () => {
    const userId = randomUUID();
    await testDb.db.insert(schema.user).values({
      id: userId,
      name: "Legacy User",
      email: "legacy@example.com",
      emailVerified: false,
    });
    await testDb.db.insert(schema.account).values({
      id: randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: "some-old-password-hash",
    });

    const { token } = await requestMagicLink("legacy@example.com");
    const result = await verify(token);

    expect(result.user.id).toBe(userId);
    expect(result.user.emailVerified).toBe(true);

    const [dbUser] = await testDb.db.select().from(schema.user).where(eq(schema.user.id, userId));
    expect(dbUser?.emailVerified).toBe(true);

    const accounts = await testDb.db.select().from(schema.account).where(eq(schema.account.userId, userId));
    expect(accounts).toHaveLength(0);
  });

  it("never logs the email or the plaintext token across send, verify and sign-in, at the production log level", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      const email = "no-leak@example.com";
      const { token } = await requestMagicLink(email);
      await verify(token);
      // A second, doomed verify attempt exercises the failure/error logging path too.
      await verify(token).catch(() => undefined);

      const captured = consoleSpy.mock.calls.map((call) => String(call[0]));
      for (const line of captured) {
        expect(line).not.toContain(email);
        expect(line).not.toContain(token);
      }
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
