import type { RequestWithDispatches } from "@/modules/requests/repository";

/**
 * The exact JSON shape returned by both a fresh 201 create, an idempotent
 * 200 replay, and a GET of the same id — so a replay is byte-identical to
 * what a subsequent GET returns.
 */
export function serializeRequestWithDispatches(data: RequestWithDispatches) {
  const { request, dispatches } = data;
  return {
    id: request.id,
    trade: request.trade,
    areaM2: request.areaM2,
    department: request.department,
    zone: request.zone,
    budgetMinUyu: request.budgetMinUyu,
    budgetMaxUyu: request.budgetMaxUyu,
    timeline: request.timeline,
    materialsIncluded: request.materialsIncluded,
    description: request.description,
    contactPhone: request.contactPhone,
    providerIds: request.providerIds,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    dispatches: dispatches
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
        createdAt: dispatch.createdAt.toISOString(),
        updatedAt: dispatch.updatedAt.toISOString(),
      })),
  };
}
