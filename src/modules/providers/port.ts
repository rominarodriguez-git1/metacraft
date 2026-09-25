import type {
  DispatchFailureReason,
  Provider,
  Quote,
  QuoteRequestPayload,
  SearchCriteria,
} from "@/modules/providers/types";

export interface DispatchContext {
  reportResponse(dispatchId: string, quote: Quote): Promise<void>;
}

export type DispatchResult =
  | { status: "sent" }
  | { status: "failed"; reason: DispatchFailureReason };

export interface ProviderAdapter {
  readonly sourceId: string;
  search(criteria: SearchCriteria): Promise<Provider[]>;
  dispatch(payload: QuoteRequestPayload, ctx: DispatchContext): Promise<DispatchResult>;
}
