import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { requireSession } from "@/modules/auth/session";

export default async function RequestsListPage() {
  const session = await requireSession();
  const t = await getTranslations("requests.list");

  const rows = await db
    .select()
    .from(schema.request)
    .where(eq(schema.request.userId, session.user.id))
    .orderBy(desc(schema.request.createdAt));

  return (
    <main className="flex min-h-screen flex-col gap-6 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      {rows.length === 0 ? (
        <p>{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between rounded border p-3">
              <span>{t("createdAt", { date: row.createdAt })}</span>
              <Link href={`/requests/${row.id}`}>{t("viewAction")}</Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
