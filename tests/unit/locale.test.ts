import { beforeEach, describe, expect, it, vi } from "vitest";

const setMock = vi.fn();
const getMock = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: getMock,
    set: setMock,
  })),
}));

import { localeCookieName } from "@/i18n/config";
import { resolveLocale } from "@/i18n/request";
import { setLocale } from "@/i18n/set-locale";

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

describe("resolveLocale", () => {
  it("returns the cookie's locale when it is a supported value", () => {
    expect(resolveLocale("en")).toBe("en");
    expect(resolveLocale("es")).toBe("es");
  });

  it("falls back to es when the cookie is missing", () => {
    expect(resolveLocale(undefined)).toBe("es");
  });

  it("falls back to es when the cookie value is unsupported", () => {
    expect(resolveLocale("fr")).toBe("es");
    expect(resolveLocale("")).toBe("es");
  });
});

describe("setLocale", () => {
  beforeEach(() => {
    setMock.mockClear();
    getMock.mockClear();
  });

  it("sets the NEXT_LOCALE cookie for a supported locale with path / and a 1-year max-age", async () => {
    await setLocale("en");
    expect(setMock).toHaveBeenCalledWith(localeCookieName, "en", {
      path: "/",
      maxAge: ONE_YEAR_IN_SECONDS,
    });
  });

  it("accepts es as a supported locale", async () => {
    await setLocale("es");
    expect(setMock).toHaveBeenCalledWith(localeCookieName, "es", {
      path: "/",
      maxAge: ONE_YEAR_IN_SECONDS,
    });
  });

  it("rejects an unsupported locale without setting the cookie", async () => {
    await expect(setLocale("fr")).rejects.toThrow();
    expect(setMock).not.toHaveBeenCalled();
  });

  it("rejects an empty locale without setting the cookie", async () => {
    await expect(setLocale("")).rejects.toThrow();
    expect(setMock).not.toHaveBeenCalled();
  });
});
