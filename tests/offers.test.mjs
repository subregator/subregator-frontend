import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const Data = vm.runInNewContext(script + '; Data', { URL, Intl });

it('fetches updated history after a catalogue refresh even when listing and tariff IDs stay the same', async () => {
  const start = script.indexOf('async function loadHistory(');
  const source = script.slice(start, script.indexOf('function drawHistory(', start));
  let calls = 0;
  const context = vm.createContext({
    Data,
    Date,
    URLSearchParams,
    historyCache: new Map(),
    loadGeneration: 1,
    drawHistory: () => {},
    request: async () => {
      calls++;
      return { items: [], next_after_id: null, tracking_started_at: new Date().toISOString() };
    }
  });
  vm.runInContext(source + ';globalThis.run = loadHistory', context);
  const offer = {
    id: 'same',
    model: 'lease',
    resource: { address_count: '256' },
    observed_at: new Date().toISOString()
  };
  const quote = {
    id: 'same',
    billing_months: 1,
    price: { currency: 'USD', amount_minor: 12800, minor_unit: 2 }
  };
  const cell = { isConnected: false };
  await context.run({ cell, item: { offer, quote } });
  context.loadGeneration++;
  await context.run({
    cell,
    item: { offer, quote: { ...quote, price: { ...quote.price, amount_minor: 25600 } } }
  });
  assert.equal(calls, 2);
});
const base = {
  id: 'one',
  provider_id: 'onie',
  model: 'lease',
  resource: {
    family: 4,
    prefix: '192.0.2.0/24',
    prefix_length: 24,
    address_count: '256',
    rir: 'RIPE NCC'
  },
  quotes: [
    {
      id: 'monthly',
      price: { currency: 'USD', amount_minor: 12800, minor_unit: 2 },
      billing_months: 1
    }
  ],
  observed_at: '2026-11-25T01:00:00Z',
  source_updated_at: null
};
const annual = {
  ...base,
  id: 'annual',
  quotes: [
    {
      id: 'annual',
      price: { currency: 'USD', amount_minor: 120000, minor_unit: 2 },
      billing_months: 12
    }
  ]
};
const providers = new Map([
  ['onie', { name: 'ONIE' }],
  ['peaktera', { name: 'Peaktera' }]
]);
const state = (changes) => ({
  model: 'lease',
  currency: 'USD',
  rirs: new Set(),
  sizes: new Set(),
  sources: null,
  min: '',
  max: '',
  q: '',
  sort: 'price_asc',
  ...changes
});

describe('standalone page contract', () => {
  it('has one inline script and no module imports, framework runtime or bundled assets', () => {
    assert.equal([...html.matchAll(/<script[\s>]/g)].length, 1);
    assert.doesNotMatch(script, /\bimport\s|\brequire\s*\(/);
    assert.doesNotMatch(html, /\.svelte|@vite|node_modules|<script[^>]+src=/);
  });
  it('keeps exact source amounts and derives per-IP monthly prices across billing terms', () => {
    assert.equal(Data.unitPrice(Data.ratio(base, base.quotes[0])), '$0.5000');
    assert.equal(Data.money(annual.quotes[0].price), 'USD 1,200.00');
    assert.equal(Data.unitPrice(Data.ratio(annual, annual.quotes[0])), '≈ $0.3906');
    assert.equal(
      Data.compare(Data.ratio(annual, annual.quotes[0]), Data.ratio(base, base.quotes[0])),
      -1
    );
  });
  it('filters using exact six-decimal bounds without floating-point rounding', () => {
    assert.equal(Data.filter([base], providers, state({ min: '0.5', max: '0.5' })).length, 1);
    assert.equal(Data.filter([base], providers, state({ min: '0.500001' })).length, 0);
    assert.equal(Data.filter([base], providers, state({ max: '0.499999' })).length, 0);
    assert.throws(() => Data.filter([base], providers, state({ min: '2', max: '1' })), /Minimum/);
    for (const min of ['-1', 'NaN', '1.0000001', '0.1.1'])
      assert.throws(() => Data.filter([base], providers, state({ min })), /non-negative/);
  });
  it('chooses only matching-currency tariffs and handles purchase billing without dividing by zero', () => {
    const mixed = {
      ...base,
      quotes: [
        ...base.quotes,
        {
          ...base.quotes[0],
          id: 'eur',
          price: { currency: 'EUR', amount_minor: 9000, minor_unit: 2 }
        }
      ]
    };
    assert.equal(Data.best(mixed, 'EUR').id, 'eur');
    const buy = { ...base, model: 'purchase', quotes: [{ ...base.quotes[0], billing_months: 0 }] };
    assert.equal(Data.unitPrice(Data.ratio(buy, buy.quotes[0])), '$0.5000');
    assert.equal(Data.filter([base], providers, state({ currency: 'EUR' })).length, 0);
  });
  it('combines source, prefix/provider search, RIR and block-size filters', () => {
    const other = {
      ...base,
      id: 'two',
      provider_id: 'peaktera',
      resource: { ...base.resource, prefix: null, rir: 'ARIN', prefix_length: 20 }
    };
    assert.equal(
      Data.filter(
        [base, other],
        providers,
        state({
          q: 'PEAKTERA',
          rirs: new Set(['ARIN']),
          sizes: new Set(['20+']),
          sources: new Set(['peaktera'])
        })
      )[0].offer.id,
      'two'
    );
    assert.equal(Data.filter([base, other], providers, state({ sources: new Set() })).length, 0);
    assert.equal(Data.filter([base], providers, state({ q: '192.0.2.' })).length, 1);
  });
  it('sorts monthly equivalents and leaves unknown prices last in either direction', () => {
    const unknown = { ...base, id: 'unknown', quotes: [{ ...base.quotes[0], price: null }] };
    const offers = [base, unknown, annual];
    assert.deepEqual(
      Array.from(Data.filter(offers, providers, state()), (r) => r.offer.id),
      ['annual', 'one', 'unknown']
    );
    assert.deepEqual(
      Array.from(Data.filter(offers, providers, state({ sort: 'price_desc' })), (r) => r.offer.id),
      ['one', 'annual', 'unknown']
    );
    assert.equal(Data.filter([unknown], providers, state({ min: '0' })).length, 0);
  });
  it('rejects unsafe prices and executable seller links', () => {
    assert.throws(
      () =>
        Data.money({ currency: 'USD', amount_minor: Number.MAX_SAFE_INTEGER + 1, minor_unit: 2 }),
      /precision/
    );
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,x',
      '//example.com',
      'https://user:pass@example.com'
    ])
      assert.equal(Data.safeURL(url), null);
    assert.equal(Data.safeURL('https://example.com/offer'), 'https://example.com/offer');
  });
  it('plots only actual observations for the same tariff and avoids lifecycle or currency gaps', () => {
    const since = Date.parse('2026-11-01T00:00:00Z');
    const event = {
      type: 'baseline',
      observed_at: '2026-11-24T01:00:00Z',
      before: null,
      after: base
    };
    const points = Data.historyPoints([event], base, base.quotes[0], 'USD', since);
    assert.equal(points.length, 2);
    assert.equal(points[0].at, Date.parse(event.observed_at));
    assert.equal(points[1].at, Date.parse(base.observed_at));
    assert.equal(
      Data.historyPoints([{ ...event, type: 'removed' }], base, base.quotes[0], 'USD', since)
        .length,
      0
    );
    assert.equal(Data.historyPoints([event], base, base.quotes[0], 'EUR', since).length, 0);
  });
});

describe('independent check filters', () => {
  const now = Date.parse('2026-11-25T10:00:00Z');
  const evidence = (status) => ({
    status,
    freshness: 'fresh',
    observed_at: new Date(now - 1000).toISOString(),
    expires_at: new Date(now + 300000).toISOString()
  });
  const verified = () => ({
    resource: base.resource.prefix,
    bgp: evidence('announced'),
    rpki: evidence('valid'),
    blocklist: evidence('not_listed')
  });
  it('requires fresh matching-prefix evidence and every selected check to pass', () => {
    const selected = new Set(['bgp', 'rpki', 'blocklist']);
    assert.equal(Data.passesChecks(base, selected, verified(), now), true);
    assert.equal(Data.passesChecks(base, selected, undefined, now), false);
    assert.equal(
      Data.passesChecks(
        { ...base, resource: { ...base.resource, prefix: null } },
        selected,
        verified(),
        now
      ),
      false
    );
    assert.equal(
      Data.passesChecks(base, selected, { ...verified(), resource: '198.51.100.0/24' }, now),
      false
    );
    for (const [key, statuses] of [
      ['bgp', ['not_announced', 'covering_route', 'unavailable']],
      ['rpki', ['partial', 'not_found', 'invalid', 'mixed', 'unavailable']],
      ['blocklist', ['listed', 'unavailable']]
    ])
      for (const status of statuses) {
        const report = verified();
        report[key] = evidence(status);
        assert.equal(Data.passesChecks(base, selected, report, now), false);
      }
  });
  it('never treats stale, future-dated, malformed or failed results as passes', () => {
    for (const mutation of ['stale', 'expired', 'future', 'unknown', 'bad_date']) {
      const report = verified();
      if (mutation === 'stale') report.rpki.freshness = 'stale';
      if (mutation === 'expired') report.rpki.expires_at = new Date(now - 1).toISOString();
      if (mutation === 'future') report.rpki.observed_at = new Date(now + 120000).toISOString();
      if (mutation === 'unknown') report.rpki.freshness = 'unknown';
      if (mutation === 'bad_date') report.rpki.expires_at = 'not a date';
      assert.equal(Data.passesChecks(base, new Set(['rpki']), report, now), false);
    }
  });
  it('filters on independent evidence rather than provider capability claims', () => {
    const selected = state({ checks: new Set(['rpki']) });
    assert.equal(
      Data.filter(
        [{ ...base, routing: { rpki: 'supported' } }],
        providers,
        selected,
        new Map(),
        now
      ).length,
      0
    );
    assert.equal(
      Data.filter([base], providers, selected, new Map([[base.resource.prefix, verified()]]), now)
        .length,
      1
    );
  });
});
