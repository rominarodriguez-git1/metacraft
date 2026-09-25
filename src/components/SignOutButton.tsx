"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { authClient } from "@/modules/auth/auth-client";

export function SignOutButton() {
  const t = useTranslations("signOut");
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleClick(): Promise<void> {
    setIsPending(true);
    await authClient.signOut();
    setIsPending(false);
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <button type="button" onClick={handleClick} disabled={isPending}>
      {t("label")}
    </button>
  );
}
