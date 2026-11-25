import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('browse, filter, inspect every offer field and return with the search intact', async ({
  page,
  isMobile
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Your next network/ })).toBeVisible();
  await expect(page.getByText('Demo catalogue.', { exact: true })).toBeVisible();
  if (isMobile) await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const scope = isMobile ? page.getByRole('dialog') : page.locator('.desktop-filters');
  await scope.getByLabel('Country', { exact: true }).selectOption('DE');
  await scope.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL(/country=DE/);
  await expect(page.locator('.offer-row')).toHaveCount(1);
  await page.locator('.resource-link').first().click();
  await expect(page.getByRole('heading', { name: 'Pricing & payment' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Routing capabilities' })).toBeVisible();
  await expect(page.getByText('Amount not specified', { exact: true })).toBeVisible();
  await expect(page.getByText('Refundable', { exact: false }).first()).toBeVisible();
  const seller = page.getByRole('link', { name: /View offer at seller/ });
  await expect(seller).toHaveAttribute('href', 'https://example.com/?offer=northstar-24');
  await expect(seller).toHaveAttribute('rel', 'noopener noreferrer');
  const popup = page.waitForEvent('popup');
  await seller.click();
  const opened = await popup;
  await expect(opened).toHaveURL(/example\.com/);
  await opened.close();
  await page.getByRole('link', { name: 'Back to catalogue', exact: true }).click();
  await expect(page).toHaveURL(/country=DE/);
  expect(errors).toEqual([]);
});

test('mobile-safe layout and accessible catalogue and details', async ({ page }) => {
  for (const path of [
    '/',
    '/offers/meridian-v6',
    '/offers/prefix-purchase',
    '/offers/northstar-unknown'
  ]) {
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))
    ).toEqual([]);
  }
});

test('empty results, invalid filters, hidden prefixes and missing offers are explicit', async ({
  page
}) => {
  await page.goto('/?q=impossible-nonexistent-network');
  await expect(page.getByRole('heading', { name: 'No offers match these filters.' })).toBeVisible();
  await page.getByRole('link', { name: 'Reset filters', exact: true }).click();
  await expect(page.locator('.offer-row').first()).toBeVisible();
  await page.goto('/?currency=&min_price=1');
  await expect(page.getByText('Choose a currency before setting a price range.')).toBeVisible();
  await page.goto('/offers/prefix-purchase');
  await expect(page.getByText('The prefix is not published.', { exact: false })).toBeVisible();
  await expect(page.getByRole('term').filter({ hasText: /^Seller country$/ })).toBeVisible();
  await page.goto('/offers/does-not-exist');
  await expect(page.getByRole('heading', { name: 'This offer has moved on.' })).toBeVisible();
});

test('URL filters, purchase tab, search and all-currency sorting survive navigation', async ({
  page
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Buy IPs', exact: true }).click();
  await expect(page).toHaveURL(/model=purchase/);
  await expect(page.locator('.offer-row')).toHaveCount(1);
  await page.goBack();
  await page.getByRole('searchbox', { name: 'Search offers' }).fill('Frankfurt');
  await page.getByRole('button', { name: 'Search offers', exact: true }).click();
  await expect(page).toHaveURL(/q=Frankfurt/);
  await expect(page.locator('.offer-row')).toHaveCount(1);
  await page.goto('/?currency=');
  await expect(page.getByLabel('Sort by')).toHaveValue('updated_desc');
});

test('filter drawer supports Escape, focus return and reduced motion', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Filters', exact: true });
  await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('small phones, landscape and tablets have no horizontal overflow', async ({
  page,
  isMobile
}) => {
  test.skip(isMobile);
  for (const width of [320, 375, 768, 1024]) {
    await page.setViewportSize({ width, height: width === 768 ? 375 : 900 });
    for (const path of ['/', '/offers/meridian-v6']) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
    }
  }
});
