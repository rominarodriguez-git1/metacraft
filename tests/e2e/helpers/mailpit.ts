const MAILPIT_API = process.env.MAILPIT_API_URL ?? "http://localhost:8025/api/v1";

interface MailpitSummary {
  ID: string;
  To?: Array<{ Address?: string }>;
}

interface MailpitMessage {
  Text?: string;
  HTML?: string;
}

/**
 * Polls Mailpit until a message addressed to exactly `email` arrives, then
 * returns the magic-link URL it contains.
 *
 * Mailpit's `to:` search tokenizes addresses, so it can also return earlier
 * runs' mail (e.g. `e2e-mobile-360-<older>`). Following such a message would
 * reuse an already-consumed single-use link, so every candidate is checked
 * against the exact recipient address before use.
 */
export async function waitForMagicLink(email: string, timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  const wanted = email.toLowerCase();

  while (Date.now() < deadline) {
    const search = await fetch(`${MAILPIT_API}/search?query=${encodeURIComponent(`to:${email}`)}`);
    if (search.ok) {
      const { messages } = (await search.json()) as { messages?: MailpitSummary[] };
      const match = messages?.find((message) =>
        message.To?.some((recipient) => recipient.Address?.toLowerCase() === wanted),
      );
      if (match) {
        const message = (await (await fetch(`${MAILPIT_API}/message/${match.ID}`)).json()) as MailpitMessage;
        const body = `${message.Text ?? ""}${message.HTML ?? ""}`;
        const link = body.match(/https?:\/\/[^\s"<>]+verify[^\s"<>]*/);
        if (link) {
          return link[0].replace(/&amp;/g, "&");
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`No magic-link email for the test address arrived in Mailpit within ${timeoutMs}ms`);
}
