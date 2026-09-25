export type Trade =
  | "albanileria"
  | "pintura"
  | "sanitaria"
  | "electrica"
  | "reforma_integral";

export type Department = "Montevideo" | "Canelones" | "Maldonado";

export type Zone = string;

export interface Provider {
  id: string;
  sourceId: string;
  name: string;
  trades: Trade[];
  zones: Zone[];
  ratingAvg: number;
  reviewCount: number;
  isNew: boolean;
  verified: boolean;
  jobMinUyu: number;
  jobMaxUyu: number;
  earliestStartWeeks: number;
}

export type Timeline = "asap" | "within_1_month" | "within_3_months" | "flexible";

export interface SearchCriteria {
  trade: Trade;
  zone: Zone;
  budgetMinUyu: number;
  budgetMaxUyu: number;
  timeline: Timeline;
}

export interface QuoteRequestPayload {
  trade: Trade;
  areaM2: number;
  department: Department;
  zone: Zone;
  budgetMinUyu: number;
  budgetMaxUyu: number;
  timeline: Timeline;
  materialsIncluded: boolean;
  description: string;
  contactPhone: string;
}

export interface Quote {
  amountUyu: number;
  materialsIncluded: boolean;
  message: string;
}

export type DispatchFailureReason =
  | "TIMEOUT"
  | "UPSTREAM_ERROR"
  | "REJECTED"
  | "INVALID_REQUEST";
