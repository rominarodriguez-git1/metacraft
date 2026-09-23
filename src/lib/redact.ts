const REDACTED = "[REDACTED]";

const SENSITIVE_KEY_SUBSTRINGS = [
  "email",
  "phone",
  "description",
  "token",
  "password",
  "secret",
  "authorization",
  "cookie",
];

const JWT_PATTERN = /\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const LONG_TOKEN_PATTERN = /[A-Za-z0-9_-]{24,}/g;
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const PHONE_PATTERN = /\+?\d(?:[ -]?\d){7,}/g;

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_SUBSTRINGS.some((needle) => lower.includes(needle));
}

function redactFreeText(value: string): string {
  return value
    .replace(EMAIL_PATTERN, REDACTED)
    .replace(JWT_PATTERN, REDACTED)
    .replace(LONG_TOKEN_PATTERN, REDACTED)
    .replace(PHONE_PATTERN, REDACTED);
}

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    try {
      return redactFreeText(value);
    } catch {
      return REDACTED;
    }
  }

  if (typeof value !== "object") {
    return value;
  }

  if (seen.has(value as object)) {
    return "[CIRCULAR]";
  }
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seen));
  }

  if (value instanceof Error) {
    try {
      const result: Record<string, unknown> = {
        name: value.name,
        message: redactFreeText(value.message),
        stack: typeof value.stack === "string" ? redactFreeText(value.stack) : undefined,
      };
      for (const key of Object.keys(value)) {
        if (isSensitiveKey(key)) {
          result[key] = REDACTED;
          continue;
        }
        try {
          result[key] = redactValue((value as unknown as Record<string, unknown>)[key], seen);
        } catch {
          result[key] = REDACTED;
        }
      }
      return result;
    } catch {
      return REDACTED;
    }
  }

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      result[key] = REDACTED;
      continue;
    }
    try {
      const raw = (value as Record<string, unknown>)[key];
      result[key] = redactValue(raw, seen);
    } catch {
      result[key] = REDACTED;
    }
  }
  return result;
}

export function redact(value: unknown): unknown {
  try {
    return redactValue(value, new WeakSet());
  } catch {
    return REDACTED;
  }
}
