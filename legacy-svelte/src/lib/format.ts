import type { Money, Offer, Quote } from './contracts';

export function safeURL(value: string | undefined): string | undefined {
  try {
    const url = new URL(value ?? '');
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
export function money(value: Money | null): string {
  if (!value) return 'Price on request';
  const amount = BigInt(value.amount_minor);
  const scale = 10n ** BigInt(value.minor_unit);
  const fraction = (amount % scale).toString().padStart(value.minor_unit, '0');
  const decimal = value.minor_unit ? `.${fraction.padEnd(2, '0')}` : '.00';
  return `${value.currency} ${(amount / scale).toLocaleString('en-US')}${decimal}`;
}
export function compareQuotes(a: Quote, b: Quote): number {
  if (!a.price) return b.price ? 1 : 0;
  if (!b.price) return -1;
  if (a.price.currency !== b.price.currency) return 0;
  const left =
    BigInt(a.price.amount_minor) *
    10n ** BigInt(b.price.minor_unit) *
    BigInt(b.billing_months || 1);
  const right =
    BigInt(b.price.amount_minor) *
    10n ** BigInt(a.price.minor_unit) *
    BigInt(a.billing_months || 1);
  return left < right ? -1 : left > right ? 1 : 0;
}
export function bestQuote(offer: Offer): Quote | undefined {
  const matches = offer.quotes.filter((q) => offer.matching_quote_ids.includes(q.id));
  return [...(matches.length ? matches : offer.quotes)].sort(compareQuotes)[0];
}
export function cycle(offer: Offer, quote?: Quote): string {
  if (offer.model === 'purchase') return 'one-time purchase';
  if (!quote || !quote.billing_months) return 'billing period not specified';
  return quote.billing_months === 1 ? 'per month' : `every ${quote.billing_months} months`;
}
export function human(value: string | null | undefined): string {
  if (!value || value === 'unknown') return 'Not specified';
  return value.replaceAll('_', ' ').replace(/^\w/, (c) => c.toUpperCase());
}
export function country(code?: string): string {
  if (!code) return 'Not specified';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}
export function date(value?: string | null): string {
  if (!value) return 'Not recorded';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? 'Not recorded'
    : new Intl.DateTimeFormat('en', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC'
      }).format(parsed) + ' UTC';
}
export function relative(value: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (!Number.isFinite(seconds)) return 'Time unknown';
  if (seconds < 60) return 'Just observed';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
export const addressCount = (value: string) => BigInt(value).toLocaleString('en-US');
export const yesNo = (value: boolean | null) =>
  value === null ? 'Not specified' : value ? 'Yes' : 'No';
export const title = (offer: Offer) =>
  offer.resource.prefix ?? `IPv${offer.resource.family} /${offer.resource.prefix_length}`;
