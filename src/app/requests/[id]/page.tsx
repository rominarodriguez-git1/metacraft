import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/db/client";
import { requireSession } from "@/modules/auth/session";
import { findRequestForUser } from "@/modules/requests/repository";
import { DispatchStatusList, type SerializedDispatch } from "@/components/requests/DispatchStatusList";

interface RequestDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function RequestDetailPage({ params }: RequestDetailPageProps) {
  const session = await requireSession();
  const { id } = await params;
  const t = await getTranslations("requests.detail");

  const found = await findRequestForUser(db, session.user.id, id);
  if (!found) {
    notFound();
  }

  const dispatches: SerializedDispatch[] = found.dispatches
    .slice()
    .sort((a, b) => a.providerId.localeCompare(b.providerId))
    .map((dispatch) => ({
      id: dispatch.id,
      providerId: dispatch.providerId,
      sourceId: dispatch.sourceId,
      status: dispatch.status,
      failureReason: dispatch.failureReason,
      quoteAmountUyu: dispatch.quoteAmountUyu,
      quoteMaterialsIncluded: dispatch.quoteMaterialsIncluded,
      quoteMessage: dispatch.quoteMessage,
    }));

  return (
    <main className="flex min-h-screen flex-col gap-6 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <DispatchStatusList requestId={found.request.id} initialDispatches={dispatches} />
    </main>
  );
}
