"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePollWhilePending } from "@/components/requests/usePollWhilePending";
import type { DispatchFailureReason } from "@/modules/providers/types";

export type SerializedDispatchStatus = "pending" | "sent" | "failed" | "responded";

export interface SerializedDispatch {
  id: string;
  providerId: string;
  sourceId: string;
  status: SerializedDispatchStatus;
  failureReason: DispatchFailureReason | string | null;
  quoteAmountUyu: number | null;
  quoteMaterialsIncluded: boolean | null;
  quoteMessage: string | null;
}

interface RequestStatusResponse {
  dispatches: SerializedDispatch[];
}

function isNonTerminal(dispatches: SerializedDispatch[]): boolean {
  return dispatches.some((dispatch) => dispatch.status === "pending" || dispatch.status === "sent");
}

async function fetchDispatches(requestId: string): Promise<SerializedDispatch[]> {
  const response = await fetch(`/api/requests/${requestId}`);
  if (!response.ok) {
    throw new Error("Failed to fetch request status");
  }
  const data = (await response.json()) as RequestStatusResponse;
  return data.dispatches;
}

interface DispatchStatusListProps {
  requestId: string;
  initialDispatches: SerializedDispatch[];
}

export function DispatchStatusList({ requestId, initialDispatches }: DispatchStatusListProps) {
  const t = useTranslations("requests.detail");
  const tCard = useTranslations("search.card");
  const locale = useLocale();

  const dispatches = usePollWhilePending<SerializedDispatch[]>({
    initialData: initialDispatches,
    isPending: isNonTerminal,
    fetchNext: () => fetchDispatches(requestId),
  });

  const amountFormatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "UYU",
    maximumFractionDigits: 0,
  });

  return (
    <ul className="flex flex-col gap-3">
      {dispatches.map((dispatch) => (
        <li key={dispatch.id} className="rounded border p-3" data-status={dispatch.status}>
          <p className="font-semibold">{t(`status.${dispatch.status}`)}</p>
          <p className="text-sm text-gray-500">{tCard("source", { sourceId: dispatch.sourceId })}</p>
          {dispatch.status === "failed" && dispatch.failureReason ? (
            <p role="alert">{t(`failureReasons.${dispatch.failureReason}`)}</p>
          ) : null}
          {dispatch.status === "responded" ? (
            <div>
              <p>{amountFormatter.format(dispatch.quoteAmountUyu ?? 0)}</p>
              <p>
                {dispatch.quoteMaterialsIncluded
                  ? t("materialsIncluded.yes")
                  : t("materialsIncluded.no")}
              </p>
              {dispatch.quoteMessage ? <p>{dispatch.quoteMessage}</p> : null}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
