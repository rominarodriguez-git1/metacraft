import type { ProviderAdapter } from "@/modules/providers/port";
import type { Provider } from "@/modules/providers/types";

const FIXTURE_PROVIDER: Provider = {
  id: "fixture-provider-1",
  sourceId: "fixture",
  name: "Fixture Provider",
  trades: ["albanileria"],
  zones: ["Centro"],
  ratingAvg: 4.5,
  reviewCount: 10,
  isNew: false,
  verified: true,
  jobMinUyu: 15000,
  jobMaxUyu: 120000,
  earliestStartWeeks: 1,
};

export const fixtureAdapter: ProviderAdapter = {
  sourceId: "fixture",
  async search(): Promise<Provider[]> {
    return [FIXTURE_PROVIDER];
  },
  async dispatch(): Promise<{ status: "sent" }> {
    return { status: "sent" };
  },
};
