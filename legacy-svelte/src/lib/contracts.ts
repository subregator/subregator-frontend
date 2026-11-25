import { z } from 'zod';

const money = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/),
  amount_minor: z.number().int().nonnegative().safe(),
  minor_unit: z.number().int().min(0).max(6)
});
const nullableDate = z.string().nullable();
const fee = z.object({
  kind: z.string(),
  amount: money.nullable(),
  frequency: z.string(),
  condition: z.string().optional(),
  refundable: z.boolean().nullable()
});
export const quoteSchema = z.object({
  id: z.string(),
  price: money.nullable(),
  billing_months: z.number().int().min(0),
  minimum_months: z.number().int().nullable(),
  fees: z
    .array(fee)
    .nullish()
    .transform((v) => v ?? []),
  taxes: z.string()
});
export const offerSchema = z.object({
  id: z.string(),
  external_id: z.string(),
  provider_id: z.string(),
  model: z.enum(['lease', 'purchase']),
  availability: z.string(),
  available_at: nullableDate,
  resource: z.object({
    family: z.union([z.literal(4), z.literal(6)]),
    prefix: z.string().nullable(),
    prefix_length: z.number().int(),
    address_count: z.string().regex(/^\d+$/),
    rir: z.string().optional(),
    registration_status: z.string().optional(),
    transfer_rirs: z.array(z.string()).optional()
  }),
  geography: z.object({
    country: z.string().optional(),
    city: z.string().optional(),
    basis: z.string()
  }),
  routing: z.object({
    bgp: z.string().optional(),
    rpki: z.string().optional(),
    rdns: z.string().optional(),
    loa: z.string().optional(),
    own_asn: z.boolean().nullable(),
    transit_required: z.boolean().nullable()
  }),
  quotes: z.array(quoteSchema),
  terms: z.object({
    summary: z.string().optional(),
    allowed_uses: z.array(z.string()).optional(),
    prohibited_uses: z.array(z.string()).optional(),
    notice_days: z.number().nullable(),
    verification: z.string().optional()
  }),
  url: z.string(),
  observed_at: z.string(),
  source_updated_at: nullableDate,
  freshness: z.string(),
  matching_quote_ids: z.array(z.string())
});
export const providerSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  description: z.string().optional(),
  policy: z.object({
    publication: z.string(),
    prefix_visibility: z.string(),
    min_refresh_seconds: z.number(),
    conditions: z
      .array(z.string())
      .nullish()
      .transform((v) => v ?? [])
  }),
  freshness: z.string(),
  source: z
    .object({
      provider_id: z.string(),
      last_attempt: nullableDate,
      last_success: nullableDate,
      error: z.string().optional(),
      count: z.number(),
      complete: z.boolean()
    })
    .nullable()
});
const counts = z.record(z.string(), z.number());
export const resultSchema = z.object({
  schema_version: z.literal(1),
  snapshot: z.string(),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
  next_offset: z.number().int().nullable(),
  items: z.array(offerSchema),
  facets: z.object({
    providers: counts,
    countries: counts,
    rirs: counts,
    families: counts,
    models: counts,
    currencies: counts
  })
});
export const providersSchema = z.object({ items: z.array(providerSchema), snapshot: z.string() });
export type Offer = z.infer<typeof offerSchema>;
export type Quote = z.infer<typeof quoteSchema>;
export type Money = z.infer<typeof money>;
export type Provider = z.infer<typeof providerSchema>;
export type Result = z.infer<typeof resultSchema>;
