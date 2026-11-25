import { describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { offerSchema, providersSchema, resultSchema } from '../contracts';
import fixture from '../../../tests/fixtures/go-api.json';

describe('Go API boundary', () => {
  it('accepts actual catalogue, provider and detail responses from the Go handler', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(fixture.offers)));
    const result = await api('offers?model=lease&currency=USD', resultSchema, fetcher);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].quotes).toHaveLength(4);
    expect(offerSchema.safeParse(result.items[0]).success).toBe(true);
    expect(providersSchema.safeParse(fixture.providers).success).toBe(true);
    expect(fetcher.mock.calls[0][0]?.toString()).toBe(
      'http://127.0.0.1:8080/api/v1/offers?model=lease&currency=USD'
    );
    expect(fetcher.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });
  it.each([400, 404, 409, 429, 503])('preserves API status %i and retry hints', async (status) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('untrusted upstream error', { status, headers: { 'Retry-After': '3' } })
      );
    await expect(api('offers', resultSchema, fetcher)).rejects.toMatchObject({
      status,
      retryAfter: '3'
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid JSON and schema mismatches instead of showing fake inventory', async () => {
    for (const body of ['invalid JSON', '{"items": []}']) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(body));
      await expect(api('offers', resultSchema, fetcher)).rejects.toMatchObject({ status: 502 });
    }
  });
  it('shows network failure without falling back to demo data', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('connection refused'));
    await expect(api('offers', resultSchema, fetcher)).rejects.toMatchObject({ status: 503 });
  });
});
