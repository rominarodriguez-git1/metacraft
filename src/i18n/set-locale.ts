"use server";

import { cookies } from "next/headers";
import { isLocale, localeCookieName } from "./config";

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

export async function setLocale(locale: string): Promise<void> {
  if (!isLocale(locale)) {
    throw new Error(`Unsupported locale: ${locale}`);
  }

  const cookieStore = await cookies();
  cookieStore.set(localeCookieName, locale, {
    path: "/",
    maxAge: ONE_YEAR_IN_SECONDS,
  });
}
