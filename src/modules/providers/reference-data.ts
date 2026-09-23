import type { Department, Timeline, Trade, Zone } from "@/modules/providers/types";

export const TRADES: readonly Trade[] = [
  "albanileria",
  "pintura",
  "sanitaria",
  "electrica",
  "reforma_integral",
];

export const TIMELINES: readonly Timeline[] = [
  "asap",
  "within_1_month",
  "within_3_months",
  "flexible",
];

export const TIMELINE_MAX_WEEKS: Record<Timeline, number> = {
  asap: 1,
  within_1_month: 4,
  within_3_months: 13,
  flexible: Number.POSITIVE_INFINITY,
};

export const DEPARTMENTS: readonly Department[] = ["Montevideo", "Canelones", "Maldonado"];

export const ZONES_BY_DEPARTMENT: Record<Department, readonly Zone[]> = {
  Montevideo: ["Ciudad Vieja", "Centro", "Pocitos", "Carrasco", "Cerro"],
  Canelones: ["Las Piedras", "Pando", "Ciudad de la Costa", "La Paz"],
  Maldonado: ["Maldonado", "Punta del Este", "San Carlos", "Piriapolis"],
};

export interface LabourPriceRangeUyu {
  minUyu: number;
  maxUyu: number;
}

// Reference ranges only (test data, no third-party text reproduced).
export const TRADE_LABOUR_RANGE_UYU: Record<Trade, LabourPriceRangeUyu> = {
  albanileria: { minUyu: 15000, maxUyu: 120000 },
  pintura: { minUyu: 8000, maxUyu: 60000 },
  sanitaria: { minUyu: 5000, maxUyu: 80000 },
  electrica: { minUyu: 6000, maxUyu: 90000 },
  reforma_integral: { minUyu: 50000, maxUyu: 500000 },
};
