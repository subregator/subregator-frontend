import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const observed = new Date().toISOString();
const providers = [
  { id: 'onie', name: 'ONIE' },
  { id: 'peaktera', name: 'Peaktera' },
  { id: 'prefix-broker', name: 'Prefix Broker' }
].map((p) => ({
  ...p,
  url: 'https://example.com/?provider=' + p.id,
  freshness: 'fresh',
  policy: { publication: 'approved', min_refresh_seconds: 900, conditions: [] },
  source: { count: 30, last_success: observed, last_attempt: observed, complete: true }
}));
const offers = Array.from({ length: 61 }, (_, i) => ({
  id: 'test-' + i,
  external_id: String(i),
  provider_id: i < 40 ? 'onie' : i < 60 ? 'peaktera' : 'prefix-broker',
  model: i === 60 ? 'purchase' : 'lease',
  availability: 'available',
  available_at: null,
  resource: {
    family: 4,
    prefix: i === 60 ? null : '192.0.2.' + i + '/24',
    prefix_length: i % 2 ? 23 : 24,
    address_count: i % 2 ? '512' : '256',
    rir: i % 2 ? 'ARIN' : 'RIPE NCC'
  },
  geography: { country: 'NL', basis: i === 60 ? 'seller_country' : 'provider_geolocation' },
  routing: { rpki: 'automated', own_asn: null, transit_required: null },
  quotes: [
    {
      id: 'monthly',
      price: { currency: i === 60 ? 'EUR' : 'USD', amount_minor: 10000 + i * 1000, minor_unit: 2 },
      billing_months: i === 60 ? 0 : 1,
      minimum_months: 3,
      fees: [{ kind: 'deposit', amount: null, frequency: 'once', refundable: null }],
      taxes: 'unknown'
    }
  ],
  terms: { summary: 'Provider terms for this fixture.', notice_days: null },
  url: 'https://example.com/?offer=' + i,
  observed_at: observed,
  source_updated_at: null,
  freshness: 'fresh'
}));
async function mockAPI(page) {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    let body;
    if (url.pathname.endsWith('/providers')) body = { items: providers, snapshot: 'one' };
    else if (url.pathname.endsWith('/offers'))
      body = { items: offers, total: offers.length, snapshot: 'one', offset: 0 };
    else if (url.pathname.endsWith('/history')) {
      const offer = offers.find((o) => o.id === url.searchParams.get('listing_id'));
      body = {
        items: [
          {
            id: 1,
            type: 'baseline',
            observed_at: new Date(Date.now() - 86400000).toISOString(),
            before: null,
            after: offer
          }
        ],
        next_after_id: null,
        tracking_started_at: new Date(Date.now() - 86400000).toISOString()
      };
    } else if (url.pathname.endsWith('/network'))
      body = { resource: url.searchParams.get('resource'), source: 'fixture' };
    else body = offers.find((o) => url.pathname.endsWith('/' + o.id));
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
}
test.beforeEach(async ({ page }) => mockAPI(page));

test('filters, exact price bounds, sorting, search and 25-row pagination work', async ({
  page
}) => {
  await page.goto('/');
  await expect(page.locator('.offer-row')).toHaveCount(25);
  await expect(page.locator('#showing')).toHaveText('Showing 1–25 of 60');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('#showing')).toHaveText('Showing 26–50 of 60');
  const expand = page.getByRole('button', { name: 'Show all', exact: true });
  if (await expand.isVisible()) await expand.click();
  await page.getByRole('button', { name: 'ARIN', exact: true }).click();
  await expect(page.locator('#subtitle')).toContainText('30 available offers');
  await page.getByRole('button', { name: '/23', exact: true }).click();
  await expect(page.locator('#subtitle')).toContainText('30 available offers');
  await page.getByLabel('Min', { exact: true }).fill('0.9');
  await expect(page.locator('#showing')).not.toHaveText('Showing 1–25 of 30');
  await page.getByLabel('Max', { exact: true }).fill('0.2');
  await expect(page.getByRole('alert')).toContainText('Minimum price');
  await page.getByRole('button', { name: 'Reset all' }).click();
  await page.getByRole('searchbox', { name: 'Search prefix or provider' }).fill('Peaktera');
  await page.getByRole('button', { name: 'Search offers', exact: true }).click();
  await expect(page.locator('.offer-row')).toHaveCount(20);
  await page.getByLabel('Sort offers').selectOption('price_asc');
  await expect(page).toHaveURL(/sort=price_asc/);
  await page.reload();
  await expect(page.locator('.offer-row')).toHaveCount(20);
});

test('purchase uses the real currency, hides prefixes and exposes all terms and seller links', async ({
  page
}) => {
  await page.goto('/');
  await expect(page.locator('.offer-row')).toHaveCount(25);
  await page.getByRole('button', { name: 'Buy', exact: true }).click();
  await expect(page.getByLabel('Currency', { exact: true })).toHaveValue('EUR');
  await expect(page.locator('.offer-row')).toHaveCount(1);
  await page.locator('.prefix-button').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText('The provider does not publish this prefix.', { exact: false })
  ).toBeVisible();
  await expect(dialog.getByText('Amount not specified', { exact: false })).toBeVisible();
  await expect(dialog.getByRole('link', { name: /View offer at seller/ })).toHaveAttribute(
    'href',
    'https://example.com/?offer=60'
  );
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.prefix-button')).toBeFocused();
});

test('accessible layout at small widths keeps horizontal scrolling inside the table', async ({
  page,
  isMobile
}) => {
  await page.goto('/');
  await expect(page.locator('.offer-row')).toHaveCount(25);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))
  ).toEqual([]);
  const widths = isMobile ? [320, 375, 768] : [1024, 1440];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
  }
  await page.locator('.prefix-button').first().click();
  const detail = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(detail.violations.map((v) => v.id)).toEqual([]);
});

test('source checkboxes, provider panel, lookup and observed history have real behaviour', async ({
  page
}) => {
  await page.goto('/');
  await expect(page.locator('.offer-row')).toHaveCount(25);
  const expand = page.getByRole('button', { name: 'Show all', exact: true });
  if (await expand.isVisible()) await expand.click();
  await page.getByRole('checkbox', { name: /^ONIE/ }).uncheck();
  await expect(page.locator('.offer-row')).toHaveCount(20);
  await expect(page.getByRole('checkbox', { name: /^ONIE/ })).toBeFocused();
  await page.getByRole('link', { name: 'Providers', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Peaktera', exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('link', { name: 'Lookup', exact: true }).click();
  await page.getByLabel('Network resource').fill('AS13335');
  await page.getByRole('button', { name: 'Run lookup' }).click();
  await expect(page.locator('.lookup-result')).toContainText('AS13335');
});

test('API failure is visible and never replaced with sample data', async ({ page }) => {
  await page.unroute('**/api/v1/**');
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({ status: 503, body: '{}', contentType: 'application/json' })
  );
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('temporarily busy');
  await expect(page.locator('.offer-row')).toHaveCount(0);
  await expect(page.locator('#showing')).toHaveText('No data loaded');
});

async function checksReady(page) {
  await page.goto('/');
  await expect(page.locator('.offer-row')).toHaveCount(25);
  const expand = page.getByRole('button', { name: 'Show all', exact: true });
  if (await expand.isVisible()) await expand.click();
}
function checkFixture(resource, overrides = {}) {
  const fresh = (status) => ({
    status,
    freshness: 'fresh',
    observed_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 300000).toISOString(),
    source: 'Fixture source',
    source_url: 'https://example.com/evidence',
    reason: 'Deterministic test observation',
    coverage: 'Fixture only'
  });
  return {
    resource,
    bgp: fresh('announced'),
    rpki: fresh('valid'),
    blocklist: fresh('not_listed'),
    ...overrides
  };
}

test('real check controls admit only fresh confirmed matches and expose source evidence', async ({
  page
}) => {
  await page.route('**/api/v1/offer-checks?**', async (route) => {
    const resource = new URL(route.request().url()).searchParams.get('resource');
    const index = Number(resource.split('.')[3].split('/')[0]);
    const report = checkFixture(resource);
    if (index === 1) report.rpki.status = 'invalid';
    if (index === 10) report.rpki.status = 'not_found';
    if (index === 11) report.rpki.freshness = 'stale';
    if (index === 12) report.rpki.status = 'partial';
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(report) });
  });
  await checksReady(page);
  await page.getByRole('checkbox', { name: 'RPKI valid (all origins)', exact: true }).check();
  await expect(page.locator('#checks-progress')).toContainText('Batch finished');
  await expect(page.locator('.offer-row')).toHaveCount(21);
  await expect(page.locator('#showing')).toContainText('verified matches (checked subset)');
  await expect(page).toHaveURL(/checks=rpki/);
  await expect(page.getByText('Rep n/a', { exact: true })).toHaveCount(0);
  await page.locator('.checks-evidence').first().click();
  await expect(
    page
      .getByRole('dialog')
      .getByRole('link', { name: /Original source/ })
      .first()
  ).toHaveAttribute('href', 'https://example.com/evidence');
  await expect(page.getByRole('dialog')).toContainText('Observed');
  await page.keyboard.press('Escape');
  await page.getByRole('checkbox', { name: 'RPKI valid (all origins)', exact: true }).uncheck();
  await expect(page.locator('.offer-row')).toHaveCount(25);
});

test('failed checks never show clean status and checks can be cancelled', async ({ page }) => {
  await page.route('**/api/v1/offer-checks?**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route
      .fulfill({ status: 503, contentType: 'application/json', body: '{}' })
      .catch(() => {});
  });
  await checksReady(page);
  await page.getByRole('checkbox', { name: 'Not listed in DROP', exact: true }).check();
  await expect(page.getByRole('button', { name: 'Cancel checks', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel checks', exact: true }).click();
  await expect(page.locator('#checks-progress')).toContainText('cancelled');
  await expect(page.locator('.offer-row')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Not listed in DROP', exact: true }).uncheck();
  await expect(page.locator('.offer-row')).toHaveCount(25);
});

test('upstream rate limits pause the batch instead of creating a retry storm', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/v1/offer-checks?**', async (route) => {
    requests++;
    await route.fulfill({
      status: 429,
      contentType: 'application/json',
      headers: { 'Retry-After': '60' },
      body: '{}'
    });
  });
  await checksReady(page);
  await page.getByRole('checkbox', { name: 'BGP announced', exact: true }).check();
  await expect(page.locator('#checks-progress')).toContainText('budget reached');
  await expect(page.locator('#verify-checks')).toBeDisabled();
  expect(requests).toBe(1);
  await expect(page.locator('.offer-row')).toHaveCount(0);
});
