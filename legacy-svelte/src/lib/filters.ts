const direct = [
  'q',
  'provider',
  'country',
  'rir',
  'model',
  'availability',
  'family',
  'min_prefix',
  'max_prefix',
  'billing_months',
  'currency',
  'geography_basis',
  'within',
  'fresh_only',
  'sort',
  'offset',
  'snapshot'
] as const;
export const defaults: Record<string, string> = {
  model: 'lease',
  currency: 'USD',
  sort: 'price_asc',
  availability: 'available'
};
export const allAvailability = 'available,upcoming,waitlist,unavailable,unknown';
export function buildQuery(input: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  for (const key of [...direct, 'min_price', 'max_price']) {
    if (input.getAll(key).length > 1) throw new Error(`Repeated filter: ${key}`);
  }
  for (const key of direct) {
    const value = input.get(key) ?? defaults[key] ?? '';
    if (value) out.set(key, value);
  }
  const currency = out.get('currency');
  for (const bound of ['min', 'max']) {
    const value = input.get(`${bound}_price`);
    if (!value) continue;
    if (!currency) throw new Error('Choose a currency before setting a price range.');
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(value))
      throw new Error('Enter a non-negative price with up to two decimal places.');
    const [whole, fraction = ''] = value.split('.');
    const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    if (minor > 1_000_000_000_000n) throw new Error('Price exceeds the supported range.');
    out.set(`${bound}_price_minor`, minor.toString());
  }
  if (!currency && out.get('sort')?.startsWith('price_')) out.set('sort', 'updated_desc');
  if (out.get('sort')?.startsWith('price_') && !out.get('model'))
    throw new Error('Choose lease or purchase before sorting by price.');
  for (const [key, min, max] of [
    ['min_prefix', 0, 128],
    ['max_prefix', 0, 128],
    ['billing_months', 1, 1200],
    ['offset', 0, 100000]
  ] as const) {
    const value = out.get(key);
    if (value && (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max))
      throw new Error(`Invalid ${key.replaceAll('_', ' ')}.`);
  }
  if (Number(out.get('min_prefix') || 0) > Number(out.get('max_prefix') || 128))
    throw new Error('Minimum prefix length must not exceed the maximum.');
  if (
    out.has('min_price_minor') &&
    out.has('max_price_minor') &&
    BigInt(out.get('min_price_minor')!) > BigInt(out.get('max_price_minor')!)
  )
    throw new Error('Minimum price must not exceed the maximum.');
  out.set('limit', '20');
  return out;
}
export function pageURL(current: URLSearchParams, offset: number, snapshot: string): string {
  const next = new URLSearchParams(current);
  next.set('offset', String(offset));
  next.set('snapshot', snapshot);
  return `/?${next}`;
}
