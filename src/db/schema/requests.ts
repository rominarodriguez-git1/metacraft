import { boolean, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const request = pgTable(
  "request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // No DB-level FK to user: see the same note on session.userId in
    // db/schema/auth.ts — drizzle-kit always resolves cross-table
    // references to "public", which breaks per-test-schema isolation.
    userId: text("user_id").notNull(),
    trade: text("trade").notNull(),
    areaM2: integer("area_m2").notNull(),
    department: text("department").notNull(),
    zone: text("zone").notNull(),
    budgetMinUyu: integer("budget_min_uyu").notNull(),
    budgetMaxUyu: integer("budget_max_uyu").notNull(),
    timeline: text("timeline").notNull(),
    materialsIncluded: boolean("materials_included").notNull(),
    description: text("description").notNull(),
    contactPhone: text("contact_phone").notNull(),
    providerIds: text("provider_ids").array().notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    payloadHash: text("payload_hash").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("request_user_id_idempotency_key_unique").on(table.userId, table.idempotencyKey),
    index("request_user_id_idx").on(table.userId),
  ],
);

export const dispatch = pgTable(
  "dispatch",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // No DB-level FK to request, for the same reason as userId above.
    requestId: uuid("request_id").notNull(),
    providerId: text("provider_id").notNull(),
    sourceId: text("source_id").notNull(),
    status: text("status").notNull().default("pending"),
    failureReason: text("failure_reason"),
    quoteAmountUyu: integer("quote_amount_uyu"),
    quoteMaterialsIncluded: boolean("quote_materials_included"),
    quoteMessage: text("quote_message"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("dispatch_request_id_idx").on(table.requestId)],
);
