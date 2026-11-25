import type { Offer, Provider, Result } from '../contracts';
import { BlockList, isIP } from 'node:net';
import { bestQuote, compareQuotes } from '../format';

const now = new Date().toISOString();
const source = { last_attempt: now, last_success: now, complete: true, count: 4 };
export const demoProviders: Provider[] = [
  ['northstar', 'Northstar IP'],
  ['meridian', 'Meridian Networks'],
  ['prefix-exchange', 'Prefix Exchange']
].map(([id, name]) => ({
  id,
  name,
  url: `https://example.com/?seller=${id}`,
  description: 'Fictional provider for interface demonstration.',
  policy: {
    publication: 'approved',
    prefix_visibility: id === 'prefix-exchange' ? 'hidden' : 'full',
    min_refresh_seconds: 900,
    conditions: [
      'Synthetic demonstration data. No real inventory or prices.',
      ...(id === 'prefix-exchange' ? ['Prefixes are not published.'] : [])
    ]
  },
  freshness: 'fresh',
  source: { ...source, provider_id: id }
}));
function offer(
  id: string,
  provider: string,
  length: number,
  price: number | null,
  changes: Partial<Offer> = {}
): Offer {
  return {
    id,
    external_id: `demo-${id}`,
    provider_id: provider,
    model: 'lease',
    availability: 'available',
    available_at: null,
    resource: {
      family: 4,
      prefix: `192.0.2.0/${length}`,
      prefix_length: length,
      address_count: (2n ** BigInt(32 - length)).toString(),
      rir: 'RIPE NCC',
      registration_status: 'allocated',
      transfer_rirs: ['RIPE NCC', 'ARIN']
    },
    geography: { country: 'DE', city: 'Frankfurt', basis: 'provider_geolocation' },
    routing: {
      bgp: 'supported',
      rpki: 'supported',
      rdns: 'supported',
      loa: 'included',
      own_asn: true,
      transit_required: false
    },
    quotes: [
      {
        id: 'monthly',
        price: price === null ? null : { currency: 'USD', amount_minor: price, minor_unit: 2 },
        billing_months: 1,
        minimum_months: 3,
        fees: [
          {
            kind: 'setup',
            amount: { currency: 'USD', amount_minor: 2500, minor_unit: 2 },
            frequency: 'one_time',
            refundable: false
          },
          {
            kind: 'deposit',
            amount: null,
            frequency: 'one_time',
            condition: 'Subject to verification',
            refundable: true
          }
        ],
        taxes: 'excluded'
      }
    ],
    terms: {
      summary:
        'Bring your own ASN. Letter of authorization included. Subject to acceptable use and identity verification.',
      allowed_uses: ['hosting', 'vpn', 'business_networks'],
      prohibited_uses: ['spam', 'abuse'],
      notice_days: 30,
      verification: 'Identity and business verification required'
    },
    url: `https://example.com/?offer=${id}`,
    observed_at: now,
    source_updated_at: now,
    freshness: 'fresh',
    matching_quote_ids: ['monthly'],
    ...changes
  };
}
export const demoOffers: Offer[] = [
  offer('northstar-24', 'northstar', 24, 11000),
  offer('meridian-24', 'meridian', 24, 12800, {
    geography: { country: 'NL', city: 'Amsterdam', basis: 'registry' },
    quotes: [
      {
        id: 'quarterly',
        price: { currency: 'USD', amount_minor: 36000, minor_unit: 2 },
        billing_months: 3,
        minimum_months: 3,
        fees: [],
        taxes: 'included'
      },
      {
        id: 'annual',
        price: { currency: 'USD', amount_minor: 120000, minor_unit: 2 },
        billing_months: 12,
        minimum_months: 12,
        fees: [],
        taxes: 'included'
      }
    ],
    matching_quote_ids: ['quarterly', 'annual']
  }),
  offer('northstar-23', 'northstar', 23, 21000, {
    resource: { family: 4, prefix: null, prefix_length: 23, address_count: '512', rir: 'ARIN' },
    geography: { country: 'US', city: 'Ashburn', basis: 'provider_geolocation' }
  }),
  offer('meridian-22', 'meridian', 22, 38000, {
    resource: {
      family: 4,
      prefix: null,
      prefix_length: 22,
      address_count: '1024',
      rir: 'RIPE NCC'
    },
    geography: { country: 'GB', city: 'London', basis: 'provider_geolocation' },
    freshness: 'stale',
    observed_at: new Date(Date.now() - 2 * 86400000).toISOString()
  }),
  offer('northstar-unknown', 'northstar', 24, null, {
    geography: { basis: 'unknown' },
    routing: { own_asn: null, transit_required: null },
    terms: { notice_days: null }
  }),
  offer('meridian-eur', 'meridian', 24, 9900, {
    quotes: [
      {
        id: 'monthly',
        price: { currency: 'EUR', amount_minor: 9900, minor_unit: 2 },
        billing_months: 1,
        minimum_months: 1,
        fees: [],
        taxes: 'unknown'
      }
    ]
  }),
  offer('prefix-purchase', 'prefix-exchange', 24, 850000, {
    model: 'purchase',
    resource: {
      family: 4,
      prefix: null,
      prefix_length: 24,
      address_count: '256',
      rir: 'RIPE NCC',
      transfer_rirs: ['RIPE NCC']
    },
    geography: { country: 'GB', basis: 'seller_country' },
    quotes: [
      {
        id: 'purchase',
        price: { currency: 'USD', amount_minor: 850000, minor_unit: 2 },
        billing_months: 0,
        minimum_months: null,
        fees: [{ kind: 'transfer', amount: null, frequency: 'one_time', refundable: null }],
        taxes: 'unknown'
      }
    ],
    matching_quote_ids: ['purchase']
  }),
  offer('meridian-v6', 'meridian', 24, 2500, {
    resource: {
      family: 6,
      prefix: '2001:db8::/48',
      prefix_length: 48,
      address_count: '1208925819614629174706176',
      rir: 'RIPE NCC'
    },
    geography: { country: 'NL', basis: 'provider_geolocation' }
  }),
  offer('northstar-upcoming', 'northstar', 24, 11500, {
    availability: 'upcoming',
    available_at: new Date(Date.now() + 7 * 86400000).toISOString()
  })
];
function facets(items: Offer[]): Result['facets'] {
  const result: Result['facets'] = {
    providers: {},
    countries: {},
    rirs: {},
    families: {},
    models: {},
    currencies: {}
  };
  for (const o of items) {
    const add = (key: keyof typeof result, value?: string) => {
      if (value) result[key][value] = (result[key][value] || 0) + 1;
    };
    add('providers', o.provider_id);
    if (o.geography.basis !== 'seller_country') add('countries', o.geography.country);
    add('rirs', o.resource.rir);
    add('families', String(o.resource.family));
    add('models', o.model);
    for (const c of new Set(o.quotes.flatMap((q) => (q.price ? [q.price.currency] : []))))
      add('currencies', c);
  }
  return result;
}
export function demoResponse(path: string): unknown {
  const url = new URL(path, 'http://demo.invalid/');
  if (url.pathname === '/providers') return { items: demoProviders, snapshot: 'demo-v1' };
  if (url.pathname.startsWith('/offers/'))
    return demoOffers.find((o) => o.id === decodeURIComponent(url.pathname.slice(8))) ?? null;
  const q = url.searchParams;
  let network: BlockList | undefined;
  let networkBits = 0;
  if (q.get('within')) {
    const [address, bits, extra] = q.get('within')!.split('/');
    const family = isIP(address);
    networkBits = Number(bits);
    if (
      !family ||
      !bits ||
      extra ||
      !/^\d+$/.test(bits) ||
      networkBits < 0 ||
      networkBits > (family === 4 ? 32 : 128)
    )
      throw new Error('Invalid within CIDR');
    network = new BlockList();
    network.addSubnet(address, networkBits, family === 4 ? 'ipv4' : 'ipv6');
  }
  const items = demoOffers
    .filter((o) => {
      if (network) {
        if (!o.resource.prefix) return false;
        const [address, bits] = o.resource.prefix.split('/');
        if (
          Number(bits) < networkBits ||
          !network.check(address, o.resource.family === 4 ? 'ipv4' : 'ipv6')
        )
          return false;
      }
      for (const [key, val] of [
        ['provider', o.provider_id],
        ['model', o.model],
        ['family', String(o.resource.family)],
        ['rir', o.resource.rir ?? ''],
        ['availability', o.availability]
      ])
        if (q.get(key) && !q.get(key)!.split(',').includes(val)) return false;
      if (
        q.get('country') &&
        (!q
          .get('country')!
          .split(',')
          .includes(o.geography.country ?? '') ||
          (!q.get('geography_basis') && o.geography.basis === 'seller_country'))
      )
        return false;
      if (q.get('geography_basis') && q.get('geography_basis') !== o.geography.basis) return false;
      if (
        q.get('q') &&
        !JSON.stringify([
          o.provider_id,
          o.resource.prefix,
          o.resource.rir,
          o.geography.country,
          o.geography.city,
          o.terms.summary
        ])
          .toLowerCase()
          .includes(q.get('q')!.toLowerCase())
      )
        return false;
      if (q.get('fresh_only') === 'true' && o.freshness !== 'fresh') return false;
      if (q.get('min_prefix') && o.resource.prefix_length < Number(q.get('min_prefix')))
        return false;
      if (q.get('max_prefix') && o.resource.prefix_length > Number(q.get('max_prefix')))
        return false;
      return true;
    })
    .map((o) => ({
      ...o,
      matching_quote_ids: o.quotes
        .filter((quote) => {
          if (q.get('currency') && quote.price?.currency !== q.get('currency')) return false;
          if (q.get('billing_months') && quote.billing_months !== Number(q.get('billing_months')))
            return false;
          if (q.get('min_price_minor') || q.get('max_price_minor')) {
            if (!quote.price) return false;
            const cents =
              (quote.price.amount_minor * 100) /
              10 ** quote.price.minor_unit /
              (quote.billing_months || 1);
            if (q.get('min_price_minor') && cents < Number(q.get('min_price_minor'))) return false;
            if (q.get('max_price_minor') && cents > Number(q.get('max_price_minor'))) return false;
          }
          return true;
        })
        .map((quote) => quote.id)
    }))
    .filter(
      (o) =>
        o.matching_quote_ids.length ||
        !['currency', 'billing_months', 'min_price_minor', 'max_price_minor'].some((k) => q.get(k))
    );
  const sort = q.get('sort');
  items.sort((a, b) => {
    if (sort?.startsWith('price_')) {
      const aq = bestQuote(a),
        bq = bestQuote(b);
      if (aq && bq) return compareQuotes(aq, bq) * (sort === 'price_desc' ? -1 : 1);
    }
    if (sort?.startsWith('prefix_'))
      return (
        (a.resource.prefix_length - b.resource.prefix_length) * (sort === 'prefix_desc' ? -1 : 1)
      );
    if (sort === 'updated_desc') return b.observed_at.localeCompare(a.observed_at);
    return a.id.localeCompare(b.id);
  });
  const offset = Number(q.get('offset') || 0),
    limit = Number(q.get('limit') || 20);
  return {
    schema_version: 1,
    snapshot: 'demo-v1',
    total: items.length,
    offset,
    limit,
    next_offset: offset + limit < items.length ? offset + limit : null,
    items: items.slice(offset, offset + limit),
    facets: facets(items)
  };
}
