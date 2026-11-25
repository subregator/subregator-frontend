import { describe, expect, it } from 'vitest';
import { addressCount, bestQuote, cycle, money, safeURL } from './format';
import { buildQuery, pageURL } from './filters';
import { demoOffers, demoResponse } from './server/demo';
import { offerSchema, providersSchema, resultSchema } from './contracts';

describe('offer display', () => {
  it('preserves exact amounts and source minor units', () => {
    expect(money({ currency: 'USD', amount_minor: 123456, minor_unit: 3 })).toBe('USD 123.456');
    expect(money({ currency: 'JPY', amount_minor: 500, minor_unit: 0 })).toBe('JPY 500.00');
    expect(money(null)).toBe('Price on request');
    expect(addressCount('1208925819614629174706176')).toBe('1,208,925,819,614,629,174,706,176');
  });
  it('chooses the cheapest matching monthly equivalent without changing the billed amount', () => {
    const offer = demoOffers.find((o) => o.id === 'meridian-24')!;
    expect(bestQuote(offer)?.id).toBe('annual');
    expect(money(bestQuote(offer)!.price)).toBe('USD 1,200.00');
    expect(cycle(offer, bestQuote(offer))).toBe('every 12 months');
    expect(bestQuote({ ...offer, matching_quote_ids: ['quarterly'] })?.id).toBe('quarterly');
  });
  it('allows only explicit web seller URLs and rejects credentials and executable schemes', () => {
    expect(safeURL('https://example.com/offer')).toBe('https://example.com/offer');
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,x',
      '//evil.example',
      'https://user:pass@example.com'
    ])
      expect(safeURL(url)).toBeUndefined();
  });
  it('refuses amounts that already lost integer precision', () => {
    const offer = structuredClone(demoOffers[0]);
    offer.quotes[0].price!.amount_minor = Number.MAX_SAFE_INTEGER + 1;
    expect(offerSchema.safeParse(offer).success).toBe(false);
  });
});
describe('filter contract', () => {
  it('converts decimal prices exactly and only sends API parameters', () => {
    const query = buildQuery(new URLSearchParams('min_price=0.29&max_price=1234.56&noise=x'));
    expect(query.get('min_price_minor')).toBe('29');
    expect(query.get('max_price_minor')).toBe('123456');
    expect(query.has('noise')).toBe(false);
    expect(query.get('model')).toBe('lease');
    expect(query.get('limit')).toBe('20');
  });
  it('requires currency for a price range and disables mixed-currency price sorting', () => {
    expect(() => buildQuery(new URLSearchParams('currency=&min_price=1'))).toThrow('currency');
    expect(buildQuery(new URLSearchParams('currency=')).get('sort')).toBe('updated_desc');
    expect(() => buildQuery(new URLSearchParams('q=a&q=b'))).toThrow('Repeated');
    expect(() => buildQuery(new URLSearchParams('min_price=-1'))).toThrow('non-negative');
    expect(() => buildQuery(new URLSearchParams('min_price=1.001'))).toThrow('decimal');
    expect(() => buildQuery(new URLSearchParams('model=&sort=price_asc'))).toThrow(
      'lease or purchase'
    );
  });
  it('keeps filters and snapshot together during pagination', () => {
    const url = pageURL(new URLSearchParams('country=DE&q=hosting'), 20, 'generation-2');
    const params = new URL(url, 'http://local').searchParams;
    expect(params.get('country')).toBe('DE');
    expect(params.get('q')).toBe('hosting');
    expect(params.get('offset')).toBe('20');
    expect(params.get('snapshot')).toBe('generation-2');
  });
  it('validates demonstration records against the real API shape', () => {
    expect(providersSchema.safeParse(demoResponse('providers')).success).toBe(true);
    expect(resultSchema.safeParse(demoResponse('offers?limit=20')).success).toBe(true);
    for (const offer of demoOffers) expect(offerSchema.safeParse(offer).success).toBe(true);
  });
});

describe('network and range filtering', () => {
  it('matches only published networks within the requested IPv4 or IPv6 range', () => {
    const v4 = resultSchema.parse(demoResponse('offers?within=192.0.2.0/24'));
    expect(v4.items.length).toBeGreaterThan(0);
    expect(v4.items.every((o) => o.resource.prefix?.startsWith('192.0.2.'))).toBe(true);
    const v6 = resultSchema.parse(demoResponse('offers?within=2001:db8::/32'));
    expect(v6.items.map((o) => o.id)).toEqual(['meridian-v6']);
    expect(() => demoResponse('offers?within=invalid')).toThrow('CIDR');
  });
  it('rejects reversed ranges and unsupported numeric bounds', () => {
    for (const query of [
      'min_prefix=30&max_prefix=24',
      'min_prefix=129',
      'billing_months=0',
      'min_price=20&max_price=10'
    ])
      expect(() => buildQuery(new URLSearchParams(query))).toThrow();
  });
});
