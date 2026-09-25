"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { authClient } from "@/modules/auth/auth-client";

export default function SignInPage() {
  const t = useTranslations("signIn");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const { error: signInError } = await authClient.signIn.magicLink({
      email,
      callbackURL: "/search",
    });

    setIsSubmitting(false);

    if (signInError) {
      setError(t("error"));
      return;
    }

    router.push("/sign-in/check-email");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3">
        <label htmlFor="email">{t("emailLabel")}</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <button type="submit" disabled={isSubmitting}>
          {t("submit")}
        </button>
        {error ? <p role="alert">{error}</p> : null}
      </form>
    </main>
  );
}
