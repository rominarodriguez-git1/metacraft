import { redact } from "@/lib/redact";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

function write(level: LogLevel, message: string, fields?: LogFields): void {
  let line: string;
  try {
    const payload: Record<string, unknown> = {
      level,
      message: redact(message),
      time: new Date().toISOString(),
      ...(fields ? (redact(fields) as Record<string, unknown>) : {}),
    };
    line = JSON.stringify(payload);
  } catch {
    line = JSON.stringify({ level, message: "[REDACTED]", time: new Date().toISOString() });
  }

  console.log(line);
}

export const logger = {
  debug(message: string, fields?: LogFields): void {
    write("debug", message, fields);
  },
  info(message: string, fields?: LogFields): void {
    write("info", message, fields);
  },
  warn(message: string, fields?: LogFields): void {
    write("warn", message, fields);
  },
  error(message: string, fields?: LogFields): void {
    write("error", message, fields);
  },
};
